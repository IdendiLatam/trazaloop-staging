/**
 * Trazaloop · MP-REC-01 · Qué cobros de una recurrencia se reconocen, y cuáles no.
 *
 * POR QUÉ NO SIRVE `decideOneTimeSettlement` TAL CUAL
 *
 * La del pago único responde a «¿este cobro activa ESTE checkout?»: mira una
 * lista y devuelve UNO. Una recurrencia pregunta otra cosa —«¿cuáles de estos
 * cobros todavía no he reconocido, y cuáles de esos son míos de verdad?»— y la
 * respuesta es una LISTA, posiblemente vacía, posiblemente de varios ciclos.
 *
 * Lo que sí se reutiliza es todo lo que ya estaba resuelto: la forma del pago
 * observado, los estados canónicos y —sobre todo— el ORDEN de las negativas.
 * Primero lo estructural, que no depende de ningún pago; después, por cada
 * pago, de lo más específico a lo más general. Ese orden se aprendió pagándolo
 * y no se reinventa aquí.
 *
 * LO QUE ESTE MÓDULO NO HACE
 *
 * No habla con la red, no lee la base y no concede nada. Recibe observaciones
 * ya normalizadas y devuelve un veredicto. Por eso se puede ejercitar entero
 * —incluidos los casos que en el proveedor costaría dinero provocar— sin
 * credenciales y sin sandbox.
 *
 * Y NO decide el periodo. Cuál es el mes que se salda, con qué fecha y en qué
 * orden, lo decide `billing_reconcile_provider_cycle` desde la fecha económica
 * del proveedor. Aquí solo se dice qué cobros son legítimos.
 */
import type { BillingPaymentState } from "@/lib/billing/provider";
import type { ObservedPayment } from "@/lib/billing/one-time/verification";

export type { ObservedPayment };

/**
 * Lo que esta recurrencia espera. Sale de la base y de la configuración del
 * despliegue; ni un solo campo puede venir del navegador.
 */
export type RecurringExpectation = {
  /** La suscripción comercial de Trazaloop. */
  subscriptionId: string;
  /** El instrumento del proveedor: en Mercado Pago, el `preapproval_id`. */
  providerSubscriptionId: string;
  /**
   * La referencia opaca con la que se creó la preapproval. Es lo que ata cada
   * cobro del proveedor a ESTA contratación y no a otra de la misma cuenta.
   */
  externalReference: string;
  /** El importe contratado por ciclo, en unidades mínimas. */
  expectedAmountMinor: number;
  expectedCurrency: string;
  /** El entorno DECLARADO del despliegue. */
  configuredEnvironment: "test" | "live";
  /** El entorno con el que se creó esta autorización. */
  authorizationEnvironment: "test" | "live";
  /** El titular esperado de la credencial de ese entorno. `null` = sin configurar. */
  expectedOwnerId: number | null;
  /** ¿La credencial desplegada resuelve HOY a ese titular? */
  credentialOwnerMatches: boolean;
  /**
   * Los `provider_payment_id` que YA se reconocieron. Un cobro que esté aquí
   * no se vuelve a mirar: es la primera línea de la idempotencia, y la segunda
   * —la que de verdad manda— es el índice único de la base.
   */
  alreadySeenProviderPaymentIds: readonly string[];
};

export type RecurringRefusal =
  /** La autorización se creó en un entorno distinto del declarado hoy. */
  | "AUTHORIZATION_ENVIRONMENT_MISMATCH"
  /** La credencial desplegada no es la del titular esperado. */
  | "CREDENTIAL_OWNER_MISMATCH"
  | "PAYMENT_NOT_APPROVED"
  | "EXTERNAL_REFERENCE_MISMATCH"
  /** El cobro lo recibió otro vendedor. */
  | "PAYMENT_COLLECTOR_MISMATCH"
  | "AMOUNT_MISMATCH"
  | "CURRENCY_MISMATCH"
  /** Solo en producción: el cobro no viene de credenciales productivas. */
  | "LIVE_MODE_REQUIRED"
  /** El proveedor no declaró el entorno del cobro. Sin dato no se procesa. */
  | "LIVE_MODE_UNDECLARED"
  /**
   * El proveedor no dijo quién cobró. Con `live_mode` fuera de juego en
   * pruebas, el cobrador es la guarda que sostiene la frontera: sin él no hay
   * con qué comprobar que el dinero cayó donde debía.
   */
  | "PAYMENT_COLLECTOR_UNDECLARED";

/** Un cobro que se reconoce, con la evidencia que se persiste. */
export type RecurringSettlement = {
  providerPaymentId: string;
  amountMinor: number;
  currency: string;
  liveMode: boolean;
  collectorId: number | null;
};

/** Un cobro que NO se reconoce, y por qué. Se registra: no se tira. */
export type RecurringRejection = {
  providerPaymentId: string | null;
  reason: RecurringRefusal;
  observed?: string;
};

export type RecurringVerdict = {
  /** Lo estructural falló: ni siquiera tiene sentido mirar los cobros. */
  blocked: RecurringRefusal | null;
  /** Cobros nuevos y legítimos, en el orden en que llegaron. */
  settle: RecurringSettlement[];
  /** Cobros nuevos que se rechazan, cada uno con su motivo. */
  rejected: RecurringRejection[];
  /** Cobros que ya estaban reconocidos. Ni se aceptan ni se rechazan: se cuentan. */
  alreadySeen: number;
};

/**
 * ¿Qué cobros de esta recurrencia hay que reconocer?
 *
 * Devuelve SIEMPRE las tres listas. Un motor que solo devuelve lo que acepta
 * deja sin explicación los cobros que descarta, y eso convierte «no me dieron
 * el plan» en una investigación en vez de en una lectura.
 */
export function decideRecurringSettlements(
  payments: readonly ObservedPayment[],
  expectation: RecurringExpectation
): RecurringVerdict {
  const vacio = (bloqueo: RecurringRefusal): RecurringVerdict =>
    ({ blocked: bloqueo, settle: [], rejected: [], alreadySeen: 0 });

  // --- 1 · Lo estructural, que no depende de ningún cobro -------------------
  //
  // Va primero porque si falla, mirar los cobros es irrelevante: no son
  // nuestros, vengan como vengan. Es el mismo orden que el pago único.
  if (expectation.authorizationEnvironment !== expectation.configuredEnvironment) {
    return vacio("AUTHORIZATION_ENVIRONMENT_MISMATCH");
  }
  if (expectation.expectedOwnerId === null || !expectation.credentialOwnerMatches) {
    return vacio("CREDENTIAL_OWNER_MISMATCH");
  }

  const yaVistos = new Set(expectation.alreadySeenProviderPaymentIds);
  const settle: RecurringSettlement[] = [];
  const rejected: RecurringRejection[] = [];
  let alreadySeen = 0;

  for (const p of payments) {
    const id = (p.providerPaymentId ?? "").trim();
    // Un cobro sin identificador no se puede reconocer NI recordar: aceptarlo
    // sería aceptar algo que la próxima vuelta volvería a parecer nuevo.
    if (id === "") {
      rejected.push({ providerPaymentId: null, reason: "PAYMENT_NOT_APPROVED",
                      observed: "(sin provider_payment_id)" });
      continue;
    }
    if (yaVistos.has(id)) { alreadySeen += 1; continue; }

    const rechazo = (reason: RecurringRefusal, observed?: string) =>
      rejected.push({ providerPaymentId: id, reason, observed });

    // --- 2 · Por cada cobro, de lo más específico a lo más general ----------
    //
    // La correlación va ANTES que el estado: un cobro de otra contratación que
    // resultara estar rechazado se reportaría como «no aprobado», y eso
    // mandaría a mirar el medio de pago de un cliente que no tiene nada que ver.
    if ((p.externalReference ?? "") !== expectation.externalReference) {
      rechazo("EXTERNAL_REFERENCE_MISMATCH", p.externalReference ?? "(ausente)");
      continue;
    }
    if (p.canonicalStatus !== ("approved" satisfies BillingPaymentState)) {
      rechazo("PAYMENT_NOT_APPROVED", p.canonicalStatus ?? "(sin traducir)");
      continue;
    }
    // --- LA MATRIZ DE ENTORNO · MP-REC-01B.13 ------------------------------
    //
    // En PRODUCCIÓN `live_mode` es obligatorio y sigue siéndolo: un cobro que
    // no venga de credenciales productivas no se reconoce, y sin el dato
    // tampoco, porque «no lo sé» no puede valer por «sí».
    //
    // En PRUEBAS deja de ser autoridad. El motivo es del proveedor y está
    // documentado en MP-ENV-01: una aplicación creada como VENDEDOR DE PRUEBA
    // emite credenciales bajo el epígrafe «producción», y sus pagos de sandbox
    // llegan con `live_mode = true`. Rechazarlos por esa etiqueta es rechazar
    // el entorno que existe para probar — y eso bloqueó un cobro real de
    // 190 400 COP perfectamente legítimo.
    //
    // Lo que sostiene la frontera en su lugar es la IDENTIDAD: el entorno
    // declarado, que no viene del navegador, y el COBRADOR esperado, que se
    // exige justo debajo y ahora es obligatorio también en pruebas. Es la misma
    // decisión que el repositorio ya tomó al dejar de clasificar por el
    // prefijo del token.
    // El DATO tiene que venir en los dos entornos. Lo que cambia es si DECIDE.
    // Sin él no se procesa —«no lo sé» no puede valer por «sí»— y además la
    // capa de base lo exige igual: dejarlo pasar aquí solo movería el rechazo
    // una función más adentro, con la transacción ya abierta.
    if (p.liveMode === null || p.liveMode === undefined) {
      rechazo("LIVE_MODE_UNDECLARED");
      continue;
    }
    // Y en producción, además, tiene que ser `true`.
    if (expectation.configuredEnvironment === "live" && !p.liveMode) {
      rechazo("LIVE_MODE_REQUIRED");
      continue;
    }

    // EL COBRADOR ES AHORA LA GUARDA QUE CARGA EL PESO, así que se exige y no
    // se salta cuando falta. Antes un cobro sin cobrador declarado pasaba de
    // largo; con `live_mode` fuera de juego en pruebas, eso dejaría la frontera
    // sin nadie vigilándola.
    if (expectation.expectedOwnerId === null) {
      rechazo("CREDENTIAL_OWNER_MISMATCH");
      continue;
    }
    if (p.collectorId === null || p.collectorId === undefined) {
      rechazo("PAYMENT_COLLECTOR_UNDECLARED");
      continue;
    }
    if (p.collectorId !== expectation.expectedOwnerId) {
      rechazo("PAYMENT_COLLECTOR_MISMATCH", String(p.collectorId));
      continue;
    }
    if ((p.currency ?? "").toUpperCase()
        !== expectation.expectedCurrency.toUpperCase()) {
      rechazo("CURRENCY_MISMATCH", p.currency ?? "(ausente)");
      continue;
    }
    if (p.amountMinor === null || p.amountMinor !== expectation.expectedAmountMinor) {
      rechazo("AMOUNT_MISMATCH", p.amountMinor === null ? "(ausente)" : String(p.amountMinor));
      continue;
    }

    settle.push({
      providerPaymentId: id,
      amountMinor: p.amountMinor,
      currency: (p.currency ?? "").toUpperCase(),
      liveMode: p.liveMode,
      collectorId: p.collectorId,
    });
  }

  return { blocked: null, settle, rejected, alreadySeen };
}

/** Lo que se le cuenta a quien mira, sin lenguaje de pasarela. */
export const RECURRING_REFUSAL_MESSAGE: Record<RecurringRefusal, string> = {
  AUTHORIZATION_ENVIRONMENT_MISMATCH:
    "El cobro no corresponde al entorno de esta contratación.",
  CREDENTIAL_OWNER_MISMATCH:
    "La configuración de cobro no corresponde a la cuenta esperada.",
  PAYMENT_NOT_APPROVED:
    "El cobro todavía no está aprobado.",
  EXTERNAL_REFERENCE_MISMATCH:
    "El cobro no corresponde a esta contratación.",
  PAYMENT_COLLECTOR_MISMATCH:
    "El cobro lo recibió otra cuenta.",
  AMOUNT_MISMATCH:
    "El importe cobrado no coincide con el contratado.",
  CURRENCY_MISMATCH:
    "La moneda cobrada no coincide con la contratada.",
  LIVE_MODE_REQUIRED:
    "El cobro no proviene de credenciales productivas.",
  LIVE_MODE_UNDECLARED:
    "El proveedor no declaró el entorno del cobro.",
  PAYMENT_COLLECTOR_UNDECLARED:
    "El proveedor no indicó qué cuenta recibió el cobro.",
};
