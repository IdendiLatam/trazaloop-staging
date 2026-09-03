import "server-only";
import type {
  BillingProvider, ProviderCheckout, ProviderPayment, ProviderResult,
} from "@/lib/billing/provider";

/**
 * Trazaloop · PE-05B1 · El doble determinista.
 *
 * Mismo papel que `fakeProvider` en Intelligence: el ciclo de facturación
 * entero —presupuesto, cobro, activación, idempotencia— tiene que poder
 * comprobarse SIN gastar una llamada real y sin depender de que el sandbox de
 * un tercero esté de pie.
 *
 * No abre una sola conexión de red. El resultado se decide por el prefijo del
 * identificador que se le pide, de modo que una prueba puede provocar un
 * rechazo o una caída del proveedor sin ambigüedad.
 */
function ref(prefijo: string, semilla: string): string {
  let h = 5381;
  for (let i = 0; i < semilla.length; i += 1) h = ((h << 5) + h + semilla.charCodeAt(i)) | 0;
  return `${prefijo}_${(h >>> 0).toString(36)}`;
}

export type FakeOutcome = "approve" | "decline" | "unavailable";

export function fakeBillingProvider(outcome: FakeOutcome = "approve"): BillingProvider {
  const caido = (): ProviderResult<never> => ({
    ok: false, failure: "provider_unavailable",
    message: "La pasarela de pago no responde.",
  });

  return {
    // El doble imita al proveedor que gestiona la recurrencia, que es el
    // modelo con el que nació B1.
    capabilities: {
      recurrenceOwner: "provider" as const,
      supportsStoredPaymentSource: false,
      supportsRecurringCharge: false,
      supportsProviderSubscription: true,
    },
    name: "fake",
    live: false,

    async createSubscriptionCheckout(input): Promise<ProviderResult<ProviderCheckout>> {
      if (outcome === "unavailable") return caido();
      return {
        ok: true,
        value: {
          providerRef: ref("chk", input.quoteId),
          redirectUrl: `https://pagos.invalido.local/checkout/${ref("chk", input.quoteId)}`,
        },
      };
    },

    async getPayment(providerPaymentId): Promise<ProviderResult<ProviderPayment>> {
      if (outcome === "unavailable") return caido();
      return {
        ok: true,
        value: {
          providerPaymentId,
          status: outcome === "approve" ? "approved" : "declined",
          amount: null, currency: null,
        },
      };
    },

    async getSubscription(id) {
      if (outcome === "unavailable") return caido();
      return { ok: true as const, value: { providerSubscriptionId: id, status: "active" as const } };
    },

    async cancelSubscription(_id, atPeriodEnd) {
      if (outcome === "unavailable") return caido();
      return {
        ok: true as const,
        value: { status: atPeriodEnd ? ("cancel_at_period_end" as const) : ("ended" as const) },
      };
    },

    async verifyWebhook() {
      // B2. El doble no finge verificar firmas: decir que sí sin comprobar nada
      // sería exactamente el agujero que la verificación existe para tapar.
      return {
        ok: false as const, failure: "invalid_request" as const,
        message: "La verificación de webhooks llega en PE-05B2.",
      };
    },
  };
}
