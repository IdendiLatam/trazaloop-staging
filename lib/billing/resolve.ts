import "server-only";
import { fakeBillingProvider } from "@/lib/billing/providers/fake";
import type { BillingProvider } from "@/lib/billing/provider";

/**
 * Trazaloop · PE-05B1 · Qué proveedor está en pie.
 *
 * Hoy solo existe el doble: Mercado Pago llega en PE-05B2. Cuando llegue, la
 * elección se hará aquí y en ningún otro sitio, igual que `resolveProvider` de
 * Intelligence.
 *
 * Sin credencial NO se llama a nadie y no se disimula: se devuelve el doble y
 * `live` dice la verdad.
 */
export function resolveBillingProvider(): BillingProvider {
  return fakeBillingProvider("approve");
}
