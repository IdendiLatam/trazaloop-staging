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
  | { ok: false; failure: BillingFailure; message: string };

export type BillingProvider = {
  readonly name: string;
  /** ¿Está configurado de verdad, o es el doble? */
  readonly live: boolean;

  createSubscriptionCheckout(input: {
    quoteId: string;
    organizationId: string;
    amount: number;
    currency: string;
    interval: "monthly" | "annual";
    returnUrl: string;
  }): Promise<ProviderResult<ProviderCheckout>>;

  getPayment(providerPaymentId: string): Promise<ProviderResult<ProviderPayment>>;

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
