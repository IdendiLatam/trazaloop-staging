import "server-only";
import { createServerClient } from "@/lib/supabase/server";

/**
 * Trazaloop · PE-04B4 · El uso comercial de la empresa: reloj e Intelligence.
 *
 * Dos ejes INDEPENDIENTES. Una empresa puede tener tiempo y no tener créditos,
 * o tener créditos y estar en modo consulta. No se mezclan los contadores y no
 * se mezclan los mensajes.
 */

export const TIME_STATES = [
  "NORMAL",
  "CONSULTATION_DAILY_LIMIT",
  "CONSULTATION_MONTHLY_LIMIT",
  "ENTITLEMENT_UNAVAILABLE",
] as const;
export type TimeState = (typeof TIME_STATES)[number];

export const AI_CREDIT_STATES = ["AVAILABLE", "AT_LIMIT", "OVER_LIMIT", "UNAVAILABLE"] as const;
export type AiCreditState = (typeof AI_CREDIT_STATES)[number];

export type OrganizationTimeStatus = {
  state: TimeState;
  reason: string | null;
  planCode: string | null;
  /** `false` = el plan no tiene reloj comercial y no se escribe ni un minuto. */
  metered: boolean;
  dailyLimit: number | null;
  monthlyLimit: number | null;
  dailyUsed: number | null;
  monthlyUsed: number | null;
  dailyRemaining: number | null;
  monthlyRemaining: number | null;
  businessDate: string | null;
  businessMonth: string | null;
  grantKind: string | null;
  planEndsAt: string | null;
};

export type AiCreditStatus = {
  state: AiCreditState;
  reason: string | null;
  /** El plan del PRODUCTO. Durante una prueba de Full es `full`, y es correcto. */
  planCode: string | null;
  /**
   * De dónde sale la bolsa MENSUAL: el plan comercial que NO viene de una
   * prueba. Durante una prueba de Full sobre base Free es `free`, porque la
   * prueba trae su propia bolsa de 50 y no eleva la mensual. Son dos conceptos
   * distintos y confundirlos fue exactamente el defecto que corrigió 0170.
   */
  monthlyPlanCode: string | null;
  periodMonth: string | null;
  limitState: "finite" | "unlimited" | "not_configured" | null;
  monthlyLimit: number | null;
  monthlyUsed: number;
  monthlyRemaining: number | null;
  trialActive: boolean;
  trialEndsAt: string | null;
  trialTotal: number | null;
  trialUsed: number | null;
  trialRemaining: number | null;
};

function n(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : null;
}
const s = (v: unknown): string | null => (typeof v === "string" ? v : null);

function mapTime(row: Record<string, unknown>): OrganizationTimeStatus | null {
  const state = row.state as TimeState;
  if (!(TIME_STATES as readonly string[]).includes(state)) return null;
  return {
    state,
    reason: s(row.reason),
    planCode: s(row.plan_code),
    metered: row.metered === true,
    dailyLimit: n(row.daily_limit),
    monthlyLimit: n(row.monthly_limit),
    dailyUsed: n(row.daily_used),
    monthlyUsed: n(row.monthly_used),
    dailyRemaining: n(row.daily_remaining),
    monthlyRemaining: n(row.monthly_remaining),
    businessDate: s(row.business_date),
    businessMonth: s(row.business_month),
    grantKind: s(row.grant_kind),
    planEndsAt: s(row.plan_ends_at),
  };
}

/** `null` = NO SE PUDO LEER. Nunca «cero minutos consumidos». */
export async function getOrganizationTimeStatus(
  orgId: string
): Promise<OrganizationTimeStatus | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("organization_time_status", {
    p_organization_id: orgId,
  });
  if (error || !data || typeof data !== "object") return null;
  return mapTime(data as Record<string, unknown>);
}

export async function getAiCreditStatus(orgId: string): Promise<AiCreditStatus | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("ai_credits_status", { p_organization_id: orgId });
  if (error || !data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  const state = row.state as AiCreditState;
  if (!(AI_CREDIT_STATES as readonly string[]).includes(state)) return null;
  return {
    state,
    reason: s(row.reason),
    planCode: s(row.plan_code),
    monthlyPlanCode: s(row.monthly_plan_code),
    periodMonth: s(row.period_month),
    limitState: (row.limit_state as AiCreditStatus["limitState"]) ?? null,
    monthlyLimit: n(row.monthly_limit),
    monthlyUsed: n(row.monthly_used) ?? 0,
    monthlyRemaining: n(row.monthly_remaining),
    trialActive: row.trial_active === true,
    trialEndsAt: s(row.trial_ends_at),
    trialTotal: n(row.trial_total),
    trialUsed: n(row.trial_used),
    trialRemaining: n(row.trial_remaining),
  };
}

/**
 * El latido. El cliente NO manda duraciones: manda «sigo abierto» y el
 * servidor pone los minutos con su propio reloj.
 */
export async function sendUsageHeartbeat(
  orgId: string,
  sessionKey: string,
  surface: string
): Promise<OrganizationTimeStatus | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("usage_heartbeat", {
    p_organization_id: orgId,
    p_session_key: sessionKey,
    p_surface: surface,
  });
  if (error || !data || typeof data !== "object") return null;
  return mapTime(data as Record<string, unknown>);
}

export type MutationIntent =
  | "business_increase_or_modify"
  | "delete_or_reduce"
  | "essential_account_operation"
  | "read"
  | "ai_execution";

export type CommercialGate = { allowed: boolean; state: TimeState | null; reason: string | null };

/**
 * Permiso COMERCIAL por intención. Distinto del permiso de AUTORIZACIÓN
 * (rol y RLS), que se aplica igual y aparte.
 */
export async function checkCommercialMutation(
  orgId: string,
  intent: MutationIntent
): Promise<CommercialGate | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("organization_commercial_can_mutate", {
    p_organization_id: orgId,
    p_intent: intent,
  });
  if (error || !data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  return {
    allowed: row.allowed === true,
    state: (row.state as TimeState | null) ?? null,
    reason: s(row.reason),
  };
}

export type CanonicalLimit =
  | { status: "finite"; value: number }
  | { status: "unlimited" }
  | { status: "not_configured" }
  | { status: "unavailable"; reason: string | null };

/**
 * Un límite del plan vigente, del catálogo CANÓNICO. Sustituye a preguntar por
 * `demo` cuando la empresa es `free`, que es lo que obligaba a existir al
 * puente de PE-04B2.
 */
export async function getOrganizationPlanLimit(
  orgId: string,
  resourceCode: string
): Promise<CanonicalLimit> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("organization_plan_limit", {
    p_organization_id: orgId,
    p_resource_code: resourceCode,
  });
  if (error || !data || typeof data !== "object") {
    return { status: "unavailable", reason: error?.message ?? null };
  }
  const row = data as Record<string, unknown>;
  const st = row.status;
  if (st === "finite") {
    const v = n(row.value);
    // «finite» sin número es un dato roto, no un cero: se trata como ilegible.
    return v === null ? { status: "unavailable", reason: "finite_without_value" } : { status: "finite", value: v };
  }
  if (st === "unlimited") return { status: "unlimited" };
  if (st === "not_configured") return { status: "not_configured" };
  return { status: "unavailable", reason: s(row.reason) };
}

/** ¿Cabe uno más? `not_configured` y `unavailable` NIEGAN. */
export function canCreateWithCanonicalLimit(currentCount: number, limit: CanonicalLimit): boolean {
  if (limit.status === "unlimited") return true;
  if (limit.status === "finite") return currentCount < limit.value;
  return false;
}

/** Los interruptores: 0 = apagado, ≥1 = encendido; sin configurar NIEGA. */
export function isFeatureEnabledWithCanonicalLimit(limit: CanonicalLimit): boolean {
  if (limit.status === "unlimited") return true;
  if (limit.status === "finite") return limit.value > 0;
  return false;
}

export type CanonicalPlanLimitRow = {
  resourceCode: string;
  limitState: "finite" | "unlimited" | "not_configured";
  limitValue: number | null;
  planCode: string;
};

/** Todos los límites del plan vigente. Lista vacía = no se pudo resolver el
 *  plan; la pantalla debe decir eso y no enseñar los de un plan cualquiera. */
export async function listOrganizationPlanLimits(orgId: string): Promise<CanonicalPlanLimitRow[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("organization_plan_limits", {
    p_organization_id: orgId,
  });
  if (error || !Array.isArray(data)) return [];
  return (data as unknown as Record<string, unknown>[]).map((r) => ({
    resourceCode: String(r.resource_code),
    limitState: r.limit_state as CanonicalPlanLimitRow["limitState"],
    limitValue: n(r.limit_value),
    planCode: String(r.plan_code ?? ""),
  }));
}
