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
 * pura para que el juicio pueda probarse entero —los motivos de negativa
 * incluidos— sin red, sin base y sin pasarela.
 *
 *
 * 01B.4 · POR QUÉ `live_mode` DEJÓ DE SER LA AUTORIDAD EN PRUEBAS
 *
 * Un pago real de sandbox llegó `approved`, por 190 400 COP, con la referencia
 * exacta del cobro… y `live_mode: true`. El verificador lo rechazó, y tenía
 * razón según la regla vieja: el cobro se abrió en `test`.
 *
 * Pero la regla vieja estaba mal. `live_mode` describe LA NATURALEZA DE LA
 * CREDENCIAL, no en qué entorno está nuestro despliegue. Un usuario de prueba
 * operando con sus propias credenciales hace operaciones que el proveedor
 * marca como productivas —de una cuenta falsa—, así que `live_mode: true` es
 * correcto por su parte y no significa «esto es producción nuestra».
 *
 * Es el mismo error que MP-ENV-01 cerró para las suscripciones: confundir
 * quién es el titular, qué clase de credencial es y en qué entorno estamos.
 *
 * Lo que separa «nuestro» de «ajeno» no es esa bandera: es la IDENTIDAD. Así
 * que ahora se comprueban cinco cosas distintas, cada una por su lado:
 *
 *   1. el entorno DECLARADO del despliegue;
 *   2. el entorno con el que se abrió ESTE cobro —los dos tienen que coincidir,
 *      o alguien está cruzando entornos—;
 *   3. la identidad de la credencial: que resuelva al titular esperado;
 *   4. la identidad del pago: que su vendedor sea ese mismo titular, cuando el
 *      proveedor lo dice;
 *   5. la economía: aprobado, referencia, importe y moneda.
 *
 *
 * Y EN PRODUCCIÓN NO SE RELAJA NADA
 *
 * Con `live` sigue exigiéndose `live_mode === true`, sin excepción y sin
 * `null`. Ahí la bandera SÍ es autoridad, porque un pago que no viene de
 * credenciales productivas no puede activar un plan productivo. Lo que se
 * ablandó es la lectura en pruebas, no la de producción — que era justo el
 * riesgo de tocar esto.
 *
 * `live_mode` se sigue observando y se persiste como EVIDENCIA. Que deje de
 * decidir en pruebas no es lo mismo que dejar de mirarlo: el día que haya que
 * auditar un cobro, la bandera con la que llegó está guardada.
 *
 *
 * POR QUÉ NO NOMBRA NINGUNA PASARELA
 *
 * PE-05B2 dejó escrito que solo un puñado de ficheros puede saber cómo se
 * llama la pasarela. Este módulo recibe observaciones ya normalizadas y por
 * eso vale igual para Checkout Pro, para el carril manual y para lo que venga.
 *
 * ALCANCE: pago ÚNICO. La semántica de las suscripciones del proveedor no se
 * toca aquí; ese frente sigue pausado por su soporte.
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
  /**
   * `true` = credenciales productivas del proveedor. NO significa «producción
   * nuestra»: en pruebas se observa y se guarda, pero no decide.
   */
  liveMode: boolean | null;
  /**
   * El vendedor que cobró, si el proveedor lo dice. `null` = no lo dijo, y
   * entonces la identidad se apoya en la de la credencial.
   */
  collectorId: number | null;
};

/** Lo que este cobro espera. Sale de la base y de la configuración, nunca del navegador. */
export type OneTimeExpectation = {
  checkoutId: string;
  expectedTotalMinor: number;
  expectedCurrency: string;
  /** El entorno DECLARADO del despliegue. */
  configuredEnvironment: "test" | "live";
  /** El entorno con el que se abrió este cobro. */
  checkoutEnvironment: "test" | "live";
  /** El titular esperado de la credencial de ese entorno. `null` = sin configurar. */
  expectedOwnerId: number | null;
  /** ¿La credencial desplegada resuelve HOY a ese titular? */
  credentialOwnerMatches: boolean;
};

export type OneTimeRefusal =
  | "NO_PAYMENT_FOUND"
  | "PAYMENT_NOT_APPROVED"
  | "EXTERNAL_REFERENCE_MISMATCH"
  | "AMOUNT_MISMATCH"
  | "CURRENCY_MISMATCH"
  /** El cobro se abrió en un entorno distinto del declarado. */
  | "CHECKOUT_ENVIRONMENT_MISMATCH"
  /** La credencial desplegada no es la del titular esperado. */
  | "CREDENTIAL_OWNER_MISMATCH"
  /** El pago lo cobró otro vendedor. */
  | "PAYMENT_COLLECTOR_MISMATCH"
  /** Solo en producción: el pago no viene de credenciales productivas. */
  | "LIVE_MODE_REQUIRED";

export type OneTimeVerdict =
  | {
      settle: true;
      reason: "PAYMENT_VERIFIED";
      providerPaymentId: string;
      amountMinor: number;
      currency: string;
      /** Evidencia. Se persiste; no decidió nada en pruebas. */
      liveMode: boolean | null;
      collectorId: number | null;
    }
  | { settle: false; reason: OneTimeRefusal; observed?: string };

/**
 * ¿Alguno de estos pagos activa este cobro?
 *
 * Se mira la lista entera porque un intento fallido y uno bueno conviven: quien
 * paga con una tarjeta rechazada y luego con otra deja DOS pagos con la misma
 * referencia. Quedarse con el primero sería negarle el plan a quien ya pagó.
 *
 * El orden de las negativas importa. Primero lo estructural —entornos e
 * identidad de la credencial—, que no depende de ningún pago y que si falla
 * hace que mirar los pagos sea irrelevante. Después, por cada pago, del motivo
 * más específico al más general.
 */
export function decideOneTimeSettlement(
  expectation: OneTimeExpectation,
  payments: readonly ObservedPayment[]
): OneTimeVerdict {
  // 0 · ENTORNOS COHERENTES. Un cobro abierto en pruebas no se asienta en un
  //     despliegue productivo, ni al revés. Esto no depende de ningún pago:
  //     si está cruzado, ya hay algo mal montado.
  if (expectation.checkoutEnvironment !== expectation.configuredEnvironment) {
    return {
      settle: false,
      reason: "CHECKOUT_ENVIRONMENT_MISMATCH",
      observed: `${expectation.checkoutEnvironment} vs ${expectation.configuredEnvironment}`,
    };
  }

  // 1 · LA CREDENCIAL ES LA QUE ESPERAMOS. Es la frontera que de verdad separa
  //     «nuestro» de «ajeno», y la que sustituye a `live_mode` en pruebas. Sin
  //     titular configurado tampoco se pasa: falla cerrado.
  if (expectation.expectedOwnerId === null || !expectation.credentialOwnerMatches) {
    return {
      settle: false,
      reason: "CREDENTIAL_OWNER_MISMATCH",
      observed: String(expectation.expectedOwnerId ?? "sin configurar"),
    };
  }

  if (payments.length === 0) return { settle: false, reason: "NO_PAYMENT_FOUND" };

  // 2 · Solo los que dicen ser de ESTE cobro. Un pago de otra referencia no es
  //     un pago con un problema: es el pago de otra persona.
  const mios = payments.filter((p) => p.externalReference === expectation.checkoutId);
  if (mios.length === 0) {
    return {
      settle: false,
      reason: "EXTERNAL_REFERENCE_MISMATCH",
      observed: payments[0].externalReference ?? "null",
    };
  }

  // 3 · Solo los aprobados. Pendiente no es aprobado, y en un pago único el
  //     limbo no existe: o se cobró o no se cobró.
  const aprobados = mios.filter((p) => p.canonicalStatus === "approved");
  if (aprobados.length === 0) {
    return {
      settle: false,
      reason: "PAYMENT_NOT_APPROVED",
      observed: mios[0].canonicalStatus ?? "null",
    };
  }

  // 4 · EN PRODUCCIÓN, `live_mode` MANDA. Sin excepción y sin `null`: un pago
  //     que no viene de credenciales productivas no activa un plan productivo.
  //     En pruebas no se filtra por aquí — se observa y se guarda.
  const delEntorno = expectation.configuredEnvironment === "live"
    ? aprobados.filter((p) => p.liveMode === true)
    : aprobados;
  if (delEntorno.length === 0) {
    return {
      settle: false,
      reason: "LIVE_MODE_REQUIRED",
      observed: String(aprobados[0].liveMode),
    };
  }

  // 5 · Y que lo haya cobrado NUESTRO vendedor, cuando el proveedor lo dice.
  //     Si no lo dice, la identidad se apoya en la de la credencial, que ya se
  //     comprobó arriba: inventarse un rechazo por un campo ausente dejaría
  //     fuera pagos legítimos.
  const delVendedor = delEntorno.filter(
    (p) => p.collectorId === null || p.collectorId === expectation.expectedOwnerId
  );
  if (delVendedor.length === 0) {
    return {
      settle: false,
      reason: "PAYMENT_COLLECTOR_MISMATCH",
      observed: String(delEntorno[0].collectorId),
    };
  }

  // 6 · La moneda, antes que el importe: «190400 en dólares» no es un problema
  //     de importe.
  const deLaMoneda = delVendedor.filter(
    (p) => (p.currency ?? "").toUpperCase() === expectation.expectedCurrency.toUpperCase()
  );
  if (deLaMoneda.length === 0) {
    return {
      settle: false,
      reason: "CURRENCY_MISMATCH",
      observed: delVendedor[0].currency ?? "null",
    };
  }

  // 7 · Y el importe, EXACTO. Sin tolerancia: los dos lados son enteros.
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
    reason: "PAYMENT_VERIFIED",
    providerPaymentId: bueno.providerPaymentId,
    amountMinor: bueno.amountMinor as number,
    currency: (bueno.currency as string).toUpperCase(),
    liveMode: bueno.liveMode,
    collectorId: bueno.collectorId,
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
  CHECKOUT_ENVIRONMENT_MISMATCH:
    "No pudimos confirmar el origen del pago. Escríbenos antes de volver a intentarlo.",
  CREDENTIAL_OWNER_MISMATCH:
    "No pudimos confirmar el origen del pago. Escríbenos antes de volver a intentarlo.",
  PAYMENT_COLLECTOR_MISMATCH:
    "Ese pago se hizo a otra cuenta de cobro. Escríbenos y lo resolvemos sin que pierdas el pago.",
  LIVE_MODE_REQUIRED:
    "No pudimos confirmar el origen del pago. Escríbenos antes de volver a intentarlo.",
};
