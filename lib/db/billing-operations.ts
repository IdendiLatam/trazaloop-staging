import "server-only";
import { createServerClient } from "@/lib/supabase/server";

/**
 * Trazaloop · PE-05B5F · Lo que una persona de plataforma necesita ver.
 *
 * Se lee CON LA SESIÓN de quien mira, no con la llave de servicio: la vista es
 * `security_invoker`, así que la política de cada tabla decide. Quien no es de
 * plataforma no ve nada, y eso no depende de que esta capa se acuerde de
 * comprobarlo.
 *
 * El nombre de la empresa se resuelve aparte, por la vista de plataforma que ya
 * existe para eso —la que exige `is_platform_staff()` en su propio `where`—. Es
 * la frontera que el repositorio ya tenía; no se abre otra.
 */

export type RenewalOperationRow = {
  organizationId: string;
  organizationName: string | null;
  subscriptionId: string;
  subscriptionStatus: string;
  planCode: string;
  billingInterval: string;
  periodId: string | null;
  periodSequence: number | null;
  periodStatus: string | null;
  dueAt: string | null;
  graceEnd: string | null;
  attemptId: string | null;
  provider: string | null;
  providerSubmittedAt: string | null;
  attemptStatus: string | null;
  failureClass: string | null;
  manualReviewRequired: boolean;
};

export async function listRenewalOperations(): Promise<RenewalOperationRow[] | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.from("v_billing_renewal_operations")
    .select("*").order("due_at", { nullsFirst: false });
  if (error) return null;   // sin dato NO es «no hay nada»

  type Fila = {
    organization_id: string; subscription_id: string; subscription_status: string;
    plan_code: string; billing_interval: string; period_id: string | null;
    period_sequence: number | null; period_status: string | null;
    due_at: string | null; grace_end: string | null; attempt_id: string | null;
    provider: string | null; provider_submitted_at: string | null;
    attempt_status: string | null; failure_class: string | null;
    manual_review_required: boolean | null;
  };
  const filas = (data ?? []) as unknown as Fila[];

  // Los nombres, por la puerta de plataforma. Si no se pueden leer, se enseña
  // el identificador: es peor una pantalla vacía que una sin nombres.
  const nombres = new Map<string, string>();
  const { data: empresas } = await supabase.from("v_platform_organizations")
    .select("organization_id, organization_name");
  for (const o of ((empresas ?? []) as unknown as
      { organization_id: string; organization_name: string }[])) {
    nombres.set(o.organization_id, o.organization_name);
  }

  return filas.map((r) => ({
    organizationId: r.organization_id,
    organizationName: nombres.get(r.organization_id) ?? null,
    subscriptionId: r.subscription_id,
    subscriptionStatus: r.subscription_status,
    planCode: r.plan_code,
    billingInterval: r.billing_interval,
    periodId: r.period_id,
    periodSequence: r.period_sequence,
    periodStatus: r.period_status,
    dueAt: r.due_at,
    graceEnd: r.grace_end,
    attemptId: r.attempt_id,
    provider: r.provider,
    providerSubmittedAt: r.provider_submitted_at,
    attemptStatus: r.attempt_status,
    failureClass: r.failure_class,
    manualReviewRequired: r.manual_review_required === true,
  }));
}
