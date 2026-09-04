import "server-only";

/**
 * Trazaloop · PE-05B1 · El contrato del proveedor de pagos.
 *
 * POR QUÉ HAY UNA FRONTERA Y NO LLAMADAS SUELTAS
 *
 * El proveedor de pagos es la pieza que más probablemente cambie —por
 * comisiones, por cobertura o porque deja de servir— y cambiarlo no puede
 * obligar a tocar el modelo comercial que PE-04 acaba de estabilizar.
 *
 * Así que el dominio no sabe quién cobra. Habla este contrato, y el adaptador
 * traduce. Ningún nombre de proveedor aparece fuera de `lib/billing/providers`.
 *
 * LO QUE EL CONTRATO NO OFRECE, A PROPÓSITO
 *
 * · No hay forma de pasar datos de tarjeta. Ninguna. El cobro se hace en el
 *   checkout alojado del proveedor o con tokenización contra él, y Trazaloop
 *   nunca ve un número.
 * · No hay forma de decir «activa este plan». La activación la decide el
 *   dominio después de que el proveedor CONFIRME, nunca el adaptador.
 */

/** Estados canónicos de Trazaloop. Los del proveedor se traducen aquí. */
export const BILLING_PAYMENT_STATES = [
  "pending", "approved", "declined", "failed",
  "refunded", "partially_refunded", "manual_review",
] as const;
export type BillingPaymentState = (typeof BILLING_PAYMENT_STATES)[number];

export const BILLING_SUBSCRIPTION_STATES = [
  "pending", "active", "past_due", "cancel_at_period_end", "ended", "manual_review",
] as const;
export type BillingSubscriptionState = (typeof BILLING_SUBSCRIPTION_STATES)[number];

/**
 * Las tres maneras de que una operación no salga, que NO son la misma noticia.
 * Confundir «la pasarela no responde» con «la tarjeta fue rechazada» acaba en
 * un cliente que pagó y al que se le baja el plan.
 */
export type BillingFailure = "declined" | "provider_unavailable" | "invalid_request";

/**
 * POR QUÉ LA CLASE LA PONE EL ADAPTADOR Y NO EL DOMINIO.
 *
 * La política de reintentos no puede depender de leer el mensaje del
 * proveedor: viene en su idioma, con su ortografía, y lo pueden cambiar sin
 * avisar. Quien sabe traducir «esto se puede reintentar» de un código de
 * respuesta concreto es el adaptador, que ya conoce a su pasarela.
 *
 * `provider_unknown` es la que de verdad importa: la petición SALIÓ y no
 * sabemos qué pasó. Nunca se reintenta sola, porque el cargo puede existir.
 */
export const RENEWAL_FAILURE_CLASSES = [
  "retryable_decline",
  "hard_decline",
  "provider_unknown",
  "provider_unavailable",
  "integrity_mismatch",
  "payment_method_unavailable",
] as const;
export type RenewalFailureClass = (typeof RENEWAL_FAILURE_CLASSES)[number];

export type ProviderCheckout = {
  /** Referencia del proveedor para este intento de cobro. */
  providerRef: string;
  /** A dónde se manda al cliente. */
  redirectUrl: string;
};

export type ProviderPayment = {
  providerPaymentId: string;
  status: BillingPaymentState;
  /** Lo que el proveedor dice que cobró, para conciliar. Nunca para decidir. */
  amount: number | null;
  currency: string | null;
};

export type ProviderResult<T> =
  | { ok: true; value: T }
  | {
      ok: false; failure: BillingFailure; message: string;
      /** Cómo debe tratarlo la política de cobro. Sin esto, el dominio tendría
       *  que adivinar leyendo texto del proveedor. */
      failureClass?: RenewalFailureClass;
    };

/**
 * Un cobro contra un medio de pago YA GUARDADO, sin navegador y sin tarjeta.
 *
 * Neutral respecto al proveedor a propósito: el identificador del instrumento
 * viaja como texto porque cada pasarela lo numera a su manera, y el importe va
 * en unidades menores de la moneda de cobro. La conversión a lo que quiera el
 * proveedor ocurre dentro de su adaptador y en ningún otro sitio.
 */
export type StoredChargeInput = {
  providerPaymentMethodId: string;
  amountMinor: number;
  currency: string;
  /** Identifica el INTENTO. Nunca codifica calendario ni importe. */
  reference: string;
  customerEmail: string;
};

/**
 * QUIÉN LLEVA EL CALENDARIO.
 *
 * No todos los proveedores se parecen. Unos guardan un objeto de suscripción y
 * cobran solos —Mercado Pago—; otros guardan una fuente de pago y esperan a que
 * el comercio pida cada cobro —Wompi—. Los dos son legítimos y necesitan cosas
 * distintas del dominio, así que el proveedor lo DECLARA en vez de que el
 * dominio lo adivine.
 *
 * Esto es una capacidad técnica, no una verdad comercial: el plan, el precio y
 * el derecho siguen siendo de PE-04 y B1, y ningún proveedor los toca.
 */
export type BillingProviderCapabilities = {
  /** `provider` cobra solo; `merchant` espera a que se le pida. */
  readonly recurrenceOwner: "provider" | "merchant";
  /** ¿Guarda un medio de pago reutilizable? */
  readonly supportsStoredPaymentSource: boolean;
  /** ¿Se le puede pedir un cobro contra ese medio guardado? */
  readonly supportsRecurringCharge: boolean;
  /** ¿Tiene un objeto de suscripción propio? */
  readonly supportsProviderSubscription: boolean;
};

export type BillingProvider = {
  readonly name: string;
  /** ¿Está configurado de verdad, o es el doble? */
  readonly live: boolean;
  readonly capabilities: BillingProviderCapabilities;

  createSubscriptionCheckout(input: {
    quoteId: string;
    organizationId: string;
    amount: number;
    currency: string;
    interval: "monthly" | "annual";
    returnUrl: string;
  }): Promise<ProviderResult<ProviderCheckout>>;

  getPayment(providerPaymentId: string): Promise<ProviderResult<ProviderPayment>>;

  /**
   * Solo la implementan las pasarelas que declaran `supportsRecurringCharge`.
   * Opcional en el contrato para que la que cobra sola no tenga que fingir un
   * método que no le corresponde.
   */
  chargeStoredPaymentMethod?(input: StoredChargeInput): Promise<ProviderResult<ProviderPayment>>;

  getSubscription(providerSubscriptionId: string):
    Promise<ProviderResult<{ providerSubscriptionId: string; status: BillingSubscriptionState }>>;

  cancelSubscription(providerSubscriptionId: string, atPeriodEnd: boolean):
    Promise<ProviderResult<{ status: BillingSubscriptionState }>>;

  /**
   * Verifica un evento entrante. B2 la implementa de verdad; el contrato ya
   * existe para que nadie escriba un manejador de webhooks que se crea lo que
   * le llega.
   */
  verifyWebhook(raw: string, headers: Record<string, string>):
    Promise<ProviderResult<{ eventId: string; type: string; payload: unknown }>>;
};
