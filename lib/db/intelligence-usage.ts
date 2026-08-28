import "server-only";

import { createServerClient } from "@/lib/supabase/server";
import {
  costMicros, type ModelRate, type ProviderUsage,
} from "@/lib/domain/intelligence-cost";

/**
 * Trazaloop · QUALITY-12.2F · Leer el consumo, sin inventarlo.
 *
 * Todo lo de aquí sale de `quality_ai_runs`, que es donde el proveedor dejó la
 * verdad. No hay un segundo registro de tokens que mantener en sincronía: si
 * lo hubiera, algún día discreparían y habría que decidir cuál miente.
 *
 * Se lee con la SESIÓN de quien pregunta. Las vistas llevan
 * `security_invoker`, así que una empresa ve la suya y la plataforma ve todas
 * porque su vista comprueba `is_platform_staff()` por dentro.
 *
 * Y no se lee ni la pregunta ni la respuesta. Para saber cuánto se consume no
 * hace falta leer lo que alguien escribió.
 */

type Db = Awaited<ReturnType<typeof createServerClient>>;

export type UsageState = "normal" | "high" | "near_limit" | "at_limit";

export type OrganizationUsageStatus = {
  monthUtc: string;
  runsThisMonth: number;
  runsToday: number;
  monthlyLimit: number;
  percentUsed: number;
  softLimitPercent: number;
  state: UsageState;
  byUseCase: Record<string, number>;
  hasOverride: boolean;
};

/** Lo que necesita la pantalla de un administrador de empresa: cuánto lleva y
 *  en qué estado está. Sin dinero: una empresa compra Trazaloop, no tokens. */
export async function getOrganizationUsageStatus(
  organizationId: string, client?: Db
): Promise<OrganizationUsageStatus | null> {
  const db = client ?? await createServerClient();
  const { data, error } = await db.rpc("intelligence_usage_status", {
    p_organization_id: organizationId,
  });
  if (error || !data) return null;
  const d = data as Record<string, unknown>;
  return {
    monthUtc: String(d.month_utc),
    runsThisMonth: Number(d.runs_this_month ?? 0),
    runsToday: Number(d.runs_today ?? 0),
    monthlyLimit: Number(d.monthly_limit ?? 0),
    percentUsed: Number(d.percent_used ?? 0),
    softLimitPercent: Number(d.soft_limit_percent ?? 80),
    state: String(d.state ?? "normal") as UsageState,
    byUseCase: (d.by_use_case as Record<string, number>) ?? {},
    hasOverride: Boolean(d.has_override),
  };
}

export type PlatformUsageRow = {
  organizationId: string;
  organizationName: string;
  monthUtc: string;
  runs: number;
  providerCalls: number;
  failures: number;
  actors: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  avgLatencyMs: number | null;
  estimatedCostUsd: number;
};

/**
 * Lo que devuelve una lectura de consumo.
 *
 * NO es un array. Y esa es la lección de la primera validación humana de
 * 12.2F: la consola decía «todavía no hay consumo registrado» mientras había
 * 282 operaciones en la base. La lectura devolvía cero filas —por permisos— y
 * el código la trataba igual que a un «no hay datos».
 *
 * Una consola de observabilidad no puede convertir un fallo de lectura en un
 * cero. Un cero es una afirmación sobre el mundo; un fallo es una afirmación
 * sobre nosotros, y hay que poder distinguirlas.
 */
export type UsageRead<T> =
  | { ok: true; rows: T[] }
  | { ok: false; error: string };

/** El consumo de todas las empresas, para la plataforma.
 *
 *  La autorización la hace la vista, que filtra por `is_platform_staff()` por
 *  dentro. Quien no lo sea recibe cero filas, y eso SÍ es un cero legítimo. */
export async function listPlatformUsage(
  params: { months?: number } = {}, client?: Db
): Promise<UsageRead<PlatformUsageRow>> {
  const db = client ?? await createServerClient();
  const desde = new Date();
  desde.setUTCMonth(desde.getUTCMonth() - (params.months ?? 3));
  const { data, error } = await db
    .from("v_intelligence_usage_platform")
    .select("*")
    .gte("month_utc", desde.toISOString().slice(0, 10))
    .order("estimated_cost_usd", { ascending: false })
    .limit(200);

  if (error) return { ok: false, error: error.message };

  const rows = (Array.isArray(data) ? data : []).map((r) => {
    const x = r as Record<string, unknown>;
    return {
      organizationId: String(x.organization_id),
      organizationName: String(x.organization_name ?? ""),
      monthUtc: String(x.month_utc),
      runs: Number(x.runs ?? 0),
      providerCalls: Number(x.provider_calls ?? 0),
      failures: Number(x.failures ?? 0),
      actors: Number(x.actors ?? 0),
      inputTokens: Number(x.input_tokens ?? 0),
      cachedInputTokens: Number(x.cached_input_tokens ?? 0),
      outputTokens: Number(x.output_tokens ?? 0),
      reasoningTokens: Number(x.reasoning_tokens ?? 0),
      totalTokens: Number(x.total_tokens ?? 0),
      avgLatencyMs: x.avg_latency_ms === null ? null : Number(x.avg_latency_ms),
      estimatedCostUsd: Number(x.estimated_cost_usd ?? 0),
    };
  });
  return { ok: true, rows };
}

export type UseCaseUsageRow = {
  useCase: string;
  label: string | null;
  costClass: string | null;
  runs: number;
  providerCalls: number;
  succeeded: number;
  failed: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  avgInput: number | null;
  avgOutput: number | null;
  avgLatencyMs: number | null;
  estimatedCostUsd: number;
};

/**
 * El desglose por capacidad. Es la tabla que hace falta para decidir, más
 * adelante, qué se incluye en qué plan: sin ella esa decisión sería a ojo.
 *
 * Dos vistas y no una. La de empresa lleva `security_invoker`, así que una
 * empresa ve la suya; la de plataforma filtra por `is_platform_staff()` por
 * dentro. Una sola vista que sirviera a los dos casos tendría que decidir por
 * dentro quién pregunta, y ahí es donde se cuelan los fallos de aislamiento.
 */
export async function listUsageByUseCase(
  params: { organizationId?: string; months?: number; platform?: boolean } = {},
  client?: Db
): Promise<UsageRead<UseCaseUsageRow>> {
  const db = client ?? await createServerClient();
  const desde = new Date();
  desde.setUTCMonth(desde.getUTCMonth() - (params.months ?? 3));
  const vista = params.platform
    ? "v_intelligence_usage_platform_by_use_case"
    : "v_intelligence_usage_by_use_case";
  let q = db.from(vista).select("*")
    .gte("month_utc", desde.toISOString().slice(0, 10));
  if (params.organizationId) q = q.eq("organization_id", params.organizationId);
  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };

  const acc = new Map<string, UseCaseUsageRow>();
  for (const r of Array.isArray(data) ? data : []) {
    const x = r as Record<string, unknown>;
    const k = String(x.use_case);
    const prev = acc.get(k);
    const fila: UseCaseUsageRow = {
      useCase: k,
      label: (x.use_case_label as string | null) ?? null,
      costClass: (x.cost_class as string | null) ?? null,
      runs: Number(x.runs ?? 0) + (prev?.runs ?? 0),
      providerCalls: Number(x.provider_calls ?? 0) + (prev?.providerCalls ?? 0),
      succeeded: Number(x.succeeded ?? 0) + (prev?.succeeded ?? 0),
      failed: Number(x.failed ?? 0) + (prev?.failed ?? 0),
      inputTokens: Number(x.input_tokens ?? 0) + (prev?.inputTokens ?? 0),
      cachedInputTokens: Number(x.cached_input_tokens ?? 0) + (prev?.cachedInputTokens ?? 0),
      outputTokens: Number(x.output_tokens ?? 0) + (prev?.outputTokens ?? 0),
      reasoningTokens: Number(x.reasoning_tokens ?? 0) + (prev?.reasoningTokens ?? 0),
      totalTokens: Number(x.total_tokens ?? 0) + (prev?.totalTokens ?? 0),
      // Las medias NO se suman: se recalculan al final sobre los totales.
      avgInput: null, avgOutput: null,
      avgLatencyMs: x.avg_latency_ms === null ? null : Number(x.avg_latency_ms),
      estimatedCostUsd: Number(x.estimated_cost_usd ?? 0) + (prev?.estimatedCostUsd ?? 0),
    };
    acc.set(k, fila);
  }
  const rows = [...acc.values()].map((f) => ({
    ...f,
    avgInput: f.providerCalls > 0 ? Math.round(f.inputTokens / f.providerCalls) : null,
    avgOutput: f.providerCalls > 0 ? Math.round(f.outputTokens / f.providerCalls) : null,
  })).sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd);
  return { ok: true, rows };
}

/** Las tarifas vigentes, para poder prever. Solo las ve la plataforma. */
export async function getCurrentRates(client?: Db): Promise<Record<string, ModelRate>> {
  const db = client ?? await createServerClient();
  const { data } = await db.from("intelligence_model_pricing")
    .select("provider, model, input_usd_per_million, cached_input_usd_per_million, "
      + "output_usd_per_million, reasoning_billing, reasoning_usd_per_million")
    .is("effective_to", null);
  const out: Record<string, ModelRate> = {};
  for (const r of Array.isArray(data) ? data : []) {
    const x = r as unknown as Record<string, unknown>;
    out[`${x.provider}:${x.model}`] = {
      provider: String(x.provider),
      model: String(x.model),
      inputPerMillion: Number(x.input_usd_per_million),
      cachedInputPerMillion: Number(x.cached_input_usd_per_million),
      outputPerMillion: Number(x.output_usd_per_million),
      reasoningBilling: String(x.reasoning_billing) as ModelRate["reasoningBilling"],
      reasoningPerMillion: x.reasoning_usd_per_million === null
        ? null : Number(x.reasoning_usd_per_million),
    };
  }
  return out;
}

/**
 * Recalcula el coste de un consumo con la tarifa dada.
 *
 * Existe para poder comprobar que la fórmula de TypeScript y la de SQL dan lo
 * mismo. Dos implementaciones de la misma cuenta que nadie compara acaban
 * separándose, y el día que se separen no habrá forma de saber cuál de las dos
 * lleva razón.
 */
export function recomputeCost(usage: ProviderUsage, rate: ModelRate): number {
  return costMicros(usage, rate);
}
