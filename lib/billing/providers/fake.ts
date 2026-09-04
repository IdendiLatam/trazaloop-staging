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

/**
 * Los desenlaces que el cobro recurrente tiene que saber distinguir.
 *
 * `lost_response` es el que existe por una razón: la petición SALIÓ y no hubo
 * respuesta. Sin poder provocarlo a voluntad, la recuperación tras una caída
 * no se puede probar, y es justo la parte donde un error cobra dos veces.
 */
export type FakeChargeOutcome =
  | "approve" | "retryable_decline" | "hard_decline"
  | "lost_response" | "unavailable_before_send" | "integrity_mismatch";

export function fakeBillingProvider(
  outcome: FakeOutcome = "approve",
  chargeOutcome: FakeChargeOutcome = "approve",
): BillingProvider {
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

    /**
     * El cobro contra un medio guardado, sin red y sin ambigüedad.
     *
     * El identificador de la transacción sale de la REFERENCIA, que identifica
     * el intento: así una prueba puede reenviar el mismo intento y comprobar
     * que no nacen dos cobros distintos.
     */
    async chargeStoredPaymentMethod(input): Promise<ProviderResult<ProviderPayment>> {
      if (chargeOutcome === "unavailable_before_send") {
        return { ok: false, failure: "provider_unavailable",
                 message: "FAKE_NOT_REACHABLE", failureClass: "provider_unavailable" };
      }
      if (chargeOutcome === "lost_response") {
        // Salió y no contestó. El dominio no puede saber si se cobró.
        return { ok: false, failure: "provider_unavailable",
                 message: "FAKE_RESPONSE_LOST", failureClass: "provider_unknown" };
      }
      if (chargeOutcome === "integrity_mismatch") {
        return { ok: false, failure: "invalid_request",
                 message: "FAKE_INTEGRITY", failureClass: "integrity_mismatch" };
      }
      if (chargeOutcome === "retryable_decline" || chargeOutcome === "hard_decline") {
        return { ok: false, failure: "declined", message: "FAKE_DECLINED",
                 failureClass: chargeOutcome };
      }
      return { ok: true, value: {
        providerPaymentId: ref("fakepay", input.reference),
        status: "approved" as const,
        amount: input.amountMinor,
        currency: input.currency,
      } };
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
