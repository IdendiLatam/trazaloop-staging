/**
 * Trazaloop · PROD-LAUNCH-01B · Qué pago activa un plan, y cuál no.
 *
 *
 * LA REGLA QUE ESTO EXISTE PARA DEFENDER
 *
 * Un plan se activa porque el PROVEEDOR dice que cobró, no porque el navegador
 * vuelva con `status=approved` en la URL. Esa diferencia es la que separa
 * cobrar de regalar: la vuelta la escribe cualquiera, y el pago lo lee el
 * servidor.
 *
 * Aquí no se lee nada. Aquí se DECIDE, con lo que ya se leyó. Es una función
 * pura para que el juicio pueda probarse entero —los seis motivos de negativa
 * incluidos— sin red, sin base y sin pasarela.
 *
 *
 * POR QUÉ NO NOMBRA NINGUNA PASARELA
 *
 * PE-05B2 dejó escrito que solo un puñado de ficheros puede saber cómo se
 * llama la pasarela. Este módulo recibe observaciones ya normalizadas —importe
 * en unidades mínimas, moneda, referencia, estado canónico— y por eso vale
 * igual para Checkout Pro, para el carril manual y para lo que venga. Si algún
 * día hay dos pasarelas, la decisión sigue siendo esta.
 *
 *
 * FALLA CERRADO, Y DICE POR QUÉ
 *
 * Seis motivos, todos con nombre propio. Un «no se pudo verificar» genérico
 * obliga a quien atiende a adivinar si el cliente pagó de menos, pagó a otra
 * empresa o simplemente todavía no ha pagado. Son tres conversaciones
 * distintas.
 */
import type { BillingPaymentState } from "@/lib/billing/provider";

/** El pago tal y como lo devolvió el proveedor, ya normalizado. */
export type ObservedPayment = {
  providerPaymentId: string;
  /**
   * Estado canónico del producto, no la palabra cruda del proveedor.
   *
   * Se reutiliza `BillingPaymentState` en vez de escribir aquí la lista.
   * Escribirla a mano dejó fuera `partially_refunded` y `manual_review`, y un
   * subconjunto inventado de una lista canónica solo puede envejecer mal:
   * cuando nazca un estado nuevo, este módulo tiene que dejar de compilar.
   */
  canonicalStatus: BillingPaymentState | null;
  /** En unidades MÍNIMAS. La conversión la hace quien habla con la pasarela. */
  amountMinor: number | null;
  currency: string | null;
  externalReference: string | null;
  /** `true` = producción del proveedor. `null` = no lo dijo. */
  liveMode: boolean | null;
};

/** Lo que este cobro espera. Sale de la base, no del navegador. */
export type OneTimeExpectation = {
  checkoutId: string;
  expectedTotalMinor: number;
  expectedCurrency: string;
  environment: "test" | "live";
};

export type OneTimeRefusal =
  | "NO_PAYMENT_FOUND"
  | "PAYMENT_NOT_APPROVED"
  | "EXTERNAL_REFERENCE_MISMATCH"
  | "AMOUNT_MISMATCH"
  | "CURRENCY_MISMATCH"
  | "ENVIRONMENT_MISMATCH";

export type OneTimeVerdict =
  | {
      settle: true;
      providerPaymentId: string;
      amountMinor: number;
      currency: string;
    }
  | { settle: false; reason: OneTimeRefusal; observed?: string };

/**
 * ¿Alguno de estos pagos activa este cobro?
 *
 * Se mira la lista entera porque un intento fallido y uno bueno conviven: quien
 * paga con una tarjeta rechazada y luego con otra deja DOS pagos con la misma
 * referencia. Quedarse con el primero sería negarle el plan a quien ya pagó.
 *
 * El orden de las negativas importa. Se responde por el motivo MÁS específico
 * que aplique al mejor candidato, no por el primero que falle en la lista: si
 * el pago es de otra empresa, eso es lo que hay que decir, aunque además el
 * importe no cuadre.
 */
export function decideOneTimeSettlement(
  expectation: OneTimeExpectation,
  payments: readonly ObservedPayment[]
): OneTimeVerdict {
  if (payments.length === 0) return { settle: false, reason: "NO_PAYMENT_FOUND" };

  // 1 · Solo los que dicen ser de ESTE cobro. Un pago de otra referencia no es
  //     un pago con un problema: es el pago de otra persona.
  const mios = payments.filter((p) => p.externalReference === expectation.checkoutId);
  if (mios.length === 0) {
    return {
      settle: false,
      reason: "EXTERNAL_REFERENCE_MISMATCH",
      observed: payments[0].externalReference ?? "null",
    };
  }

  // 2 · Solo los aprobados. Pendiente no es aprobado, y en un pago único el
  //     limbo no existe: o se cobró o no se cobró.
  const aprobados = mios.filter((p) => p.canonicalStatus === "approved");
  if (aprobados.length === 0) {
    return {
      settle: false,
      reason: "PAYMENT_NOT_APPROVED",
      observed: mios[0].canonicalStatus ?? "null",
    };
  }

  // 3 · El entorno. `null` NO pasa: un pago que no dice de qué entorno viene es
  //     un pago de origen desconocido, y un cobro de sandbox no puede activar
  //     un plan de verdad.
  const delEntorno = aprobados.filter(
    (p) => p.liveMode !== null && p.liveMode === (expectation.environment === "live")
  );
  if (delEntorno.length === 0) {
    return {
      settle: false,
      reason: "ENVIRONMENT_MISMATCH",
      observed: String(aprobados[0].liveMode),
    };
  }

  // 4 · La moneda, antes que el importe: «190400 en dólares» no es un problema
  //     de importe.
  const deLaMoneda = delEntorno.filter(
    (p) => (p.currency ?? "").toUpperCase() === expectation.expectedCurrency.toUpperCase()
  );
  if (deLaMoneda.length === 0) {
    return {
      settle: false,
      reason: "CURRENCY_MISMATCH",
      observed: delEntorno[0].currency ?? "null",
    };
  }

  // 5 · Y el importe, EXACTO. Sin tolerancia: los dos lados son enteros.
  const bueno = deLaMoneda.find((p) => p.amountMinor === expectation.expectedTotalMinor);
  if (!bueno) {
    return {
      settle: false,
      reason: "AMOUNT_MISMATCH",
      observed: String(deLaMoneda[0].amountMinor),
    };
  }
  if (!bueno.providerPaymentId) {
    return { settle: false, reason: "NO_PAYMENT_FOUND" };
  }

  return {
    settle: true,
    providerPaymentId: bueno.providerPaymentId,
    amountMinor: bueno.amountMinor as number,
    currency: (bueno.currency as string).toUpperCase(),
  };
}

/** Lo que se le dice a quien está mirando la pantalla. Nunca un código crudo. */
export const REFUSAL_MESSAGE: Record<OneTimeRefusal, string> = {
  NO_PAYMENT_FOUND:
    "Todavía no vemos tu pago. Si acabas de pagarlo, espera unos segundos y vuelve a comprobar.",
  PAYMENT_NOT_APPROVED:
    "Tu pago aún no está aprobado. Cuando el banco lo confirme, vuelve a comprobar y activaremos el plan.",
  EXTERNAL_REFERENCE_MISMATCH:
    "Ese pago corresponde a otra contratación. No se cobró nada aquí.",
  AMOUNT_MISMATCH:
    "El importe pagado no coincide con el de esta contratación. Escríbenos y lo resolvemos sin que pierdas el pago.",
  CURRENCY_MISMATCH:
    "El pago llegó en otra moneda. Escríbenos y lo resolvemos sin que pierdas el pago.",
  ENVIRONMENT_MISMATCH:
    "No pudimos confirmar el origen del pago. Escríbenos antes de volver a intentarlo.",
};
