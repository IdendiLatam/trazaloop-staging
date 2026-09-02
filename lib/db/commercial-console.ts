import "server-only";
import { createServerClient } from "@/lib/supabase/server";

/**
 * Trazaloop · PE-04B5 · Lo que la consola comercial necesita leer.
 *
 * Todo sale del catálogo canónico de PE-04B1/B2. Nada de aquí lee
 * `organization_subscriptions` ni `plan_definitions`: presentar la copia
 * heredada como si fuera el plan vigente es exactamente el defecto que hacía
 * leer «Plan Demo» a un cliente Full.
 */
export type PlanRevisionRow = {
  id: string;
  planCode: string;
  revisionNumber: number;
  status: "draft" | "published" | "retired";
  displayName: string | null;
  description: string | null;
  publicConditions: string | null;
  priceState: "configured" | "not_configured";
  currency: string | null;
  monthlyPriceMinor: number | null;
  annualPriceMinor: number | null;
  internalNotes: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  publishedAt: string | null;
};

export type PlanLimitRow = {
  resourceCode: string;
  limitState: "finite" | "unlimited" | "not_configured";
  limitValue: number | null;
};

const num = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number.isFinite(Number(v)) ? Number(v) : null;

function mapRevision(r: Record<string, unknown>): PlanRevisionRow {
  return {
    id: String(r.id),
    planCode: String(r.plan_code),
    revisionNumber: Number(r.revision_number),
    status: r.status as PlanRevisionRow["status"],
    displayName: (r.display_name as string | null) ?? null,
    description: (r.description as string | null) ?? null,
    publicConditions: (r.public_conditions as string | null) ?? null,
    priceState: r.price_state as PlanRevisionRow["priceState"],
    currency: (r.currency as string | null) ?? null,
    monthlyPriceMinor: num(r.monthly_price_minor),
    annualPriceMinor: num(r.annual_price_minor),
    internalNotes: (r.internal_notes as string | null) ?? null,
    effectiveFrom: (r.effective_from as string | null) ?? null,
    effectiveTo: (r.effective_to as string | null) ?? null,
    publishedAt: (r.published_at as string | null) ?? null,
  };
}

/** TODAS las revisiones, incluidas las retiradas: la verdad comercial pasada no
 *  se esconde, porque hubo empresas que compraron bajo ella. */
export async function listPlanRevisions(): Promise<PlanRevisionRow[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("plan_revisions")
    .select("*")
    .order("plan_code")
    .order("revision_number", { ascending: false });
  if (error || !data) return [];
  return (data as unknown as Record<string, unknown>[]).map(mapRevision);
}

export async function listRevisionLimits(revisionId: string): Promise<PlanLimitRow[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("plan_revision_limits")
    .select("resource_code, limit_state, limit_value")
    .eq("plan_revision_id", revisionId)
    .order("resource_code");
  if (error || !data) return [];
  return (data as unknown as Record<string, unknown>[]).map((r) => ({
    resourceCode: String(r.resource_code),
    limitState: r.limit_state as PlanLimitRow["limitState"],
    limitValue: num(r.limit_value),
  }));
}

export type AssignmentRow = {
  id: string;
  scope: "organization" | "module";
  moduleCode: string | null;
  planCode: string;
  revisionNumber: number;
  grantKind: string;
  source: string;
  startsAt: string;
  endsAt: string | null;
  reason: string | null;
};

/** Lo CONFIGURADO: cada asignación, tal cual, sin colapsarla en un solo campo.
 *  El plan EFECTIVO se resuelve aparte y puede no parecerse a ninguna de ellas
 *  por separado. */
export async function listOrganizationAssignments(orgId: string): Promise<AssignmentRow[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("organization_plan_assignments")
    .select("id, scope, module_code, grant_kind, source, starts_at, ends_at, reason, plan_revisions(plan_code, revision_number)")
    .eq("organization_id", orgId)
    .order("starts_at", { ascending: false });
  if (error || !data) return [];
  return (data as unknown as Record<string, unknown>[]).map((r) => {
    const rev = (r.plan_revisions ?? {}) as Record<string, unknown>;
    return {
      id: String(r.id),
      scope: r.scope as AssignmentRow["scope"],
      moduleCode: (r.module_code as string | null) ?? null,
      planCode: String(rev.plan_code ?? "?"),
      revisionNumber: Number(rev.revision_number ?? 0),
      grantKind: String(r.grant_kind),
      source: String(r.source),
      startsAt: String(r.starts_at),
      endsAt: (r.ends_at as string | null) ?? null,
      reason: (r.reason as string | null) ?? null,
    };
  });
}

export type CommercialEventRow = {
  id: string;
  scope: string;
  moduleCode: string | null;
  previousPlanCode: string | null;
  newPlanCode: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  reason: string;
  createdAt: string;
};

export async function listCommercialEvents(orgId: string): Promise<CommercialEventRow[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("commercial_assignment_events")
    .select("id, scope, module_code, previous_plan_code, new_plan_code, effective_from, effective_to, reason, created_at")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return (data as unknown as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    scope: String(r.scope),
    moduleCode: (r.module_code as string | null) ?? null,
    previousPlanCode: (r.previous_plan_code as string | null) ?? null,
    newPlanCode: String(r.new_plan_code),
    effectiveFrom: String(r.effective_from),
    effectiveTo: (r.effective_to as string | null) ?? null,
    reason: String(r.reason),
    createdAt: String(r.created_at),
  }));
}
