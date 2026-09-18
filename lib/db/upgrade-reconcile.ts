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

export async function reconcileUpgrade(
  changeId: string
): Promise<UpgradeReconcileResult> {
  const admin = createAdminClient();
  const { data } = await admin.from("billing_checkout_intents")
    .select("provider").eq("subscription_change_id", changeId)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  const proveedor = (data as { provider: string } | null)?.provider ?? null;

  if (proveedor === "mercadopago") {
    const { reconcileMercadoPagoUpgrade } =
      await import("@/lib/db/upgrade-mercadopago");
    return await reconcileMercadoPagoUpgrade(changeId);
  }
  // Sin carril que preguntar no se inventa un desenlace.
  return { outcome: "not_applicable",
           reason: proveedor === null ? "INTENT_NOT_FOUND" : "LANE_NOT_PULLABLE",
           changeId, steps: [] };
}
