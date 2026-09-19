import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UpgradeReconcileResult } from "@/lib/db/upgrade-mercadopago";

/**
 * Trazaloop · BILLING-EXTRA-01B · Conciliar una subida, sea cual sea el carril.
 *
 *
 * POR QUÉ EXISTE ESTE FICHERO TAN CORTO
 *
 * Para que la pantalla de vuelta no sepa por qué pasarela pagó nadie. Antes
 * importaba directamente el carril de Mercado Pago, y con eso una pantalla
 * pasaba a nombrar una pasarela: justo lo que la frontera de PE-04/PE-05 lleva
 * cuidando desde que se trazó, y lo que una guarda puso en rojo.
 *
 * Quién cobró lo dice el INTENTO, que es donde quedó escrito. Aquí se lee y se
 * delega. Cuando mañana haya un tercer carril, el sitio donde añadirlo es éste
 * y no una pantalla.
 *
 *
 * EL CARRIL DE WOMPI NO PASA POR AQUÍ
 *
 * Su desenlace lo trae un evento firmado que llega a su propio webhook, y ese
 * camino no se toca. Preguntar por él desde una vuelta de navegador no aportaría
 * nada: no hay nada que preguntar, hay que esperar el evento.
 */

export type { UpgradeReconcileResult } from "@/lib/db/upgrade-mercadopago";

export type StartUpgradeChargeResult =
  | { ok: true; flow: "redirect"; initPoint: string }
  | { ok: true; flow: "stored_source" }
  | { ok: false; code: string };

/**
 * BILLING-EXTRA-01D · Empezar a cobrar una subida, por el carril que toque.
 *
 * La acción de servidor no tiene por qué saber cómo se llama ninguna pasarela:
 * pide «cobra esta subida» y recibe, o un sitio a donde mandar a alguien, o la
 * confirmación de que el cobro ya salió contra un medio guardado.
 *
 * El carril lo dice la suscripción. Cuando nazca un tercero, se añade aquí.
 */
export async function startUpgradeCharge(input: {
  changeId: string;
  organizationId: string;
  origin: string;
  payerEmail: string | null;
  supabase: { rpc: (fn: string, args: Record<string, unknown>) =>
    PromiseLike<{ data: unknown; error: { message: string } | null }> };
}): Promise<StartUpgradeChargeResult> {
  const { carrilDeSubida } = await import("@/lib/db/upgrade-lane");
  const carril = await carrilDeSubida(input.changeId, input.organizationId);
  if (carril === null) return { ok: false, code: "LANE_UNKNOWN" };

  if (carril === "redirect") {
    const { startMercadoPagoUpgradeCheckout } =
      await import("@/lib/db/upgrade-mercadopago");
    const r = await startMercadoPagoUpgradeCheckout({
      changeId: input.changeId, origin: input.origin,
      payerEmail: input.payerEmail, supabase: input.supabase,
    });
    return r.ok ? { ok: true, flow: "redirect", initPoint: r.initPoint }
                : { ok: false, code: r.code };
  }
  // El carril de medio guardado lo sigue llevando quien lo llevaba.
  return { ok: true, flow: "stored_source" };
}

export async function reconcileUpgrade(
  changeId: string,
  /** Lo que una persona con autoridad decidió, si hay alguna. */
  operatorIntent: "none" | "complete" | "refund" = "none"
): Promise<UpgradeReconcileResult> {
  const admin = createAdminClient();
  const { data } = await admin.from("billing_checkout_intents")
    .select("provider").eq("subscription_change_id", changeId)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  const proveedor = (data as { provider: string } | null)?.provider ?? null;

  if (proveedor === "mercadopago") {
    const { reconcileMercadoPagoUpgrade } =
      await import("@/lib/db/upgrade-mercadopago");
    return await reconcileMercadoPagoUpgrade(changeId, operatorIntent);
  }
  // Sin carril que preguntar no se inventa un desenlace.
  return { outcome: "not_applicable",
           reason: proveedor === null ? "INTENT_NOT_FOUND" : "LANE_NOT_PULLABLE",
           changeId, steps: [] };
}
