import "server-only";
import {
  activePaymentMethod, markUpgradeUncertain, settleUpgradePayment,
} from "@/lib/db/billing-upgrade";
import { wompiFromEnv } from "@/lib/billing/providers/wompi";
import { buildUpgradeReference } from "@/lib/billing/upgrade-reference";

/**
 * Trazaloop · PE-05B6E · Cobrar la diferencia de una subida.
 *
 * Vive aparte de la acción de servidor para que el camino que se prueba de
 * punta a punta sea EXACTAMENTE el que usa el producto. Si la prueba tuviera su
 * propia copia, probaría su copia.
 *
 * Aquí no entra ni un dígito de tarjeta: se cobra contra la fuente que el
 * proveedor ya tiene guardada, y la referencia es el intento —que el proveedor
 * se niega a repetir, y esa es la defensa más fuerte contra un cobro doble—.
 */
export type UpgradeChargeResult =
  | { kind: "submitted"; providerPaymentId: string }
  | { kind: "declined"; reason: string | null }
  | { kind: "uncertain"; reason: string }
  | { kind: "unavailable"; reason: string };

export async function chargeUpgrade(input: {
  organizationId: string;
  intentId: string;
  total: number;
  currency: string;
  customerEmail: string;
}): Promise<UpgradeChargeResult> {
  const proveedor = wompiFromEnv();
  if (proveedor.environment === null) {
    return { kind: "unavailable", reason: "PROVIDER_NOT_CONFIGURED" };
  }
  const entorno = proveedor.environment === "production" ? "live" : "test";

  const metodo = await activePaymentMethod(
    input.organizationId, proveedor.name, entorno);
  if (!metodo) return { kind: "unavailable", reason: "NO_PAYMENT_METHOD" };

  const cobro = await proveedor.chargeStoredPaymentMethod?.({
    providerPaymentMethodId: metodo.providerPaymentMethodId,
    amountMinor: input.total,
    currency: input.currency,
    reference: buildUpgradeReference(input.intentId),
    customerEmail: input.customerEmail,
  });

  if (!cobro) {
    await markUpgradeUncertain(input.intentId, "PROVIDER_NOT_AVAILABLE");
    return { kind: "uncertain", reason: "PROVIDER_NOT_AVAILABLE" };
  }
  if (!cobro.ok) {
    // Si la petición pudo cruzar la frontera, NO se declara fallida ni se
    // reintenta con otra referencia: se deja quieta y la mira una persona.
    if (cobro.failureClass === "provider_unknown"
        || cobro.failureClass === "provider_unavailable") {
      await markUpgradeUncertain(input.intentId, "PROVIDER_UNKNOWN");
      return { kind: "uncertain", reason: "PROVIDER_UNKNOWN" };
    }
    await settleUpgradePayment({
      intentId: input.intentId, provider: proveedor.name, providerPaymentId: null,
      outcome: "declined", amount: null, currency: null,
      liveMode: entorno === "live", failureReason: cobro.failure });
    return { kind: "declined", reason: cobro.failure ?? null };
  }

  // Salió. Conceder Extra NO es cosa de esta respuesta: lo hace el evento
  // firmado, después de releer la transacción en el proveedor.
  return { kind: "submitted", providerPaymentId: cobro.value.providerPaymentId };
}
