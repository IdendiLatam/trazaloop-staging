import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Trazaloop · BILLING-EXTRA-01D · Con qué FORMA se cobra ESTA subida.
 *
 * Lo dice la suscripción, no el navegador ni una variable global: dos empresas
 * del mismo despliegue pueden estar en pasarelas distintas —las de Wompi siguen
 * en Wompi— y migrarlas por comodidad sería moverle a alguien el medio de pago
 * sin pedírselo.
 *
 * Y se comprueba que el cambio es DE ESA EMPRESA. Sin esto, conocer un
 * identificador ajeno bastaría para abrir el cobro de otra.
 */
export async function carrilDeSubida(
  changeId: string, organizationId: string
): Promise<"redirect" | "stored_source" | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("billing_subscription_changes")
    .select("subscription_id, organization_id").eq("id", changeId).maybeSingle();
  const c = data as { subscription_id: string; organization_id: string } | null;
  if (!c || c.organization_id !== organizationId) return null;

  const { data: s } = await admin.from("billing_subscriptions")
    .select("provider").eq("id", c.subscription_id).maybeSingle();
  const { paymentFlowOf } = await import("@/lib/billing/purchase-routing");
  return paymentFlowOf((s as { provider: string | null } | null)?.provider ?? null);
}
