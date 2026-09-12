import "server-only";
import { mercadoPagoFromEnv } from "@/lib/billing/providers/mercadopago";
import type { ProviderResult } from "@/lib/billing/provider";
import type { ObservedPayment } from "@/lib/billing/one-time/verification";

/**
 * Trazaloop · PROD-LAUNCH-01B · El único sitio que sabe qué pasarela cobra el
 * pago único.
 *
 *
 * POR QUÉ EXISTE ESTE FICHERO
 *
 * PE-05B2 dejó una regla dura: solo un puñado de ficheros puede nombrar la
 * pasarela, y una prueba compara esa lista con la realidad. La regla vale la
 * pena —cambiar de pasarela no debería obligar a tocar el modelo comercial—
 * pero se paga cada vez que una función nueva necesita cobrar: o se ensancha
 * la frontera un fichero más, o se retuerce el código para no nombrarla.
 *
 * Ensancharla fichero a fichero es cómo una frontera deja de significar nada.
 * Así que se ensancha UNA vez, aquí, y a cambio todo lo demás —el servicio de
 * cobro, las acciones, las pantallas— queda agnóstico para siempre.
 *
 * Este módulo no decide nada de negocio. Traduce un código de proveedor en las
 * dos operaciones que el pago único necesita, y ya.
 *
 *
 * QUÉ NO HACE
 *
 * · No verifica pagos. Eso es `decideOneTimeSettlement`, que es puro.
 * · No activa planes. Eso es `billing_settle_one_time_checkout`, en la base.
 * · No conoce importes ni impuestos. Los recibe hechos.
 */

/** El puerto MÍNIMO del pago único. Deliberadamente pequeño. */
export type OneTimeGateway = {
  /** El código con el que este proveedor se guarda en el libro. */
  readonly code: string;
  /** `test` o `live`, según la configuración declarada del despliegue. */
  readonly environment: "test" | "live" | null;
  createCheckout(input: {
    externalReference: string;
    title: string;
    amountMinor: number;
    currency: string;
    payerEmail?: string | null;
    successUrl: string;
    failureUrl: string;
    pendingUrl: string;
    notificationUrl?: string | null;
    expiresAt?: string | null;
  }): Promise<ProviderResult<{ preferenceId: string; initPoint: string | null }>>;
  /**
   * Los pagos de una referencia, ya normalizados a lo que el juicio espera.
   *
   * La normalización vive aquí porque convertir unidades del proveedor a
   * unidades mínimas es conocimiento DE la pasarela. Sacarlo de aquí obligaría
   * a quien decide a saber si esta moneda lleva decimales.
   */
  paymentsFor(externalReference: string): Promise<ProviderResult<ObservedPayment[]>>;
};

/** El proveedor con el que se cobra hoy el pago único. */
export function defaultOneTimeProviderCode(): string {
  return "mercadopago";
}

/**
 * El adaptador de un código de proveedor, o `null` si ese código no cobra
 * pagos únicos.
 *
 * `null` y no una excepción: quien llama tiene que poder decir «este cobro no
 * se puede reintentar por aquí» sin que se le caiga la pantalla encima. El
 * carril `manual` cae aquí a propósito —no tiene pasarela— y eso no es un
 * error, es su definición.
 */
export function oneTimeGatewayFor(code: string): OneTimeGateway | null {
  if (code !== "mercadopago") return null;
  const mp = mercadoPagoFromEnv();
  return {
    code: "mercadopago",
    environment: mp.identity.ok ? mp.identity.value.environment : null,
    async createCheckout(input) {
      const r = await mp.createOneTimeCheckout(input);
      if (!r.ok) return r;
      return { ok: true, value: {
        preferenceId: r.value.preferenceId, initPoint: r.value.initPoint } };
    },
    async paymentsFor(externalReference) {
      const r = await mp.searchPaymentsByReference(externalReference);
      if (!r.ok) return r;
      return { ok: true, value: r.value.payments.map((p) => ({
        providerPaymentId: p.providerPaymentId,
        canonicalStatus: p.canonicalStatus,
        // Unidades MÍNIMAS. En pesos colombianos coinciden con las del
        // proveedor, pero la conversión se declara igualmente: el día que haya
        // una moneda con decimales, el sitio donde arreglarlo es este y no el
        // juicio.
        amountMinor: p.amount,
        currency: p.currency,
        externalReference: p.externalReference,
        liveMode: p.liveMode,
      })) };
    },
  };
}
