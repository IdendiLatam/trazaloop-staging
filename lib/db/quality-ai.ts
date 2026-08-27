import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";

/**
 * Trazaloop · QUALITY-12 · Las lecturas del Copilot.
 *
 * Todo lo de aquí pasa por la RLS de quien mira. No hay cliente administrativo
 * en este archivo, y no puede haberlo: tener IA no da permiso a los datos.
 */

type Db = SupabaseClient;
const db = async (c?: Db) => c ?? (await createServerClient());
const fail = (e: { message?: string } | null, alt: string) => e?.message ?? alt;
const filas = (d: unknown): Record<string, unknown>[] =>
  (Array.isArray(d) ? d as Record<string, unknown>[] : []);

export type AiSettingsRow = {
  isEnabled: boolean; allowPeople: boolean; allowCustomer: boolean;
  allowDrafts: boolean; monthlyRunLimit: number; dailyUserLimit: number;
  retainQuestion: boolean; retainAnswer: boolean;
};

export async function getSettings(
  organizationId: string, client?: Db
): Promise<AiSettingsRow> {
  const s = await db(client);
  const { data } = await s.from("quality_ai_settings")
    .select("*").eq("organization_id", organizationId).maybeSingle();
  const r = (data ?? {}) as Record<string, unknown>;
  return {
    isEnabled: r.is_enabled === true,
    allowPeople: r.allow_people === true,
    allowCustomer: r.allow_customer !== false,
    allowDrafts: r.allow_drafts !== false,
    monthlyRunLimit: Number(r.monthly_run_limit ?? 500),
    dailyUserLimit: Number(r.daily_user_limit ?? 50),
    retainQuestion: r.retain_question !== false,
    retainAnswer: r.retain_answer !== false,
  };
}

export async function updateSettings(
  organizationId: string,
  input: Partial<{
    isEnabled: boolean; allowPeople: boolean; allowCustomer: boolean;
    allowDrafts: boolean; monthlyRunLimit: number; dailyUserLimit: number;
    retainQuestion: boolean; retainAnswer: boolean;
  }>,
  client?: Db
): Promise<void> {
  const s = await db(client);
  const { error } = await s.from("quality_ai_settings").upsert({
    organization_id: organizationId,
    ...(input.isEnabled !== undefined ? { is_enabled: input.isEnabled } : {}),
    ...(input.allowPeople !== undefined ? { allow_people: input.allowPeople } : {}),
    ...(input.allowCustomer !== undefined ? { allow_customer: input.allowCustomer } : {}),
    ...(input.allowDrafts !== undefined ? { allow_drafts: input.allowDrafts } : {}),
    ...(input.monthlyRunLimit !== undefined ? { monthly_run_limit: input.monthlyRunLimit } : {}),
    ...(input.dailyUserLimit !== undefined ? { daily_user_limit: input.dailyUserLimit } : {}),
    ...(input.retainQuestion !== undefined ? { retain_question: input.retainQuestion } : {}),
    ...(input.retainAnswer !== undefined ? { retain_answer: input.retainAnswer } : {}),
  });
  if (error) throw new Error(fail(error, "No se pudo guardar la configuración del Copilot."));
}

export async function getUsage(
  organizationId: string, client?: Db
): Promise<Record<string, unknown> | null> {
  const s = await db(client);
  const { data, error } = await s.rpc("quality_ai_usage", { p_organization_id: organizationId });
  if (error) throw new Error(fail(error, "No se pudo leer el consumo del Copilot."));
  return (data ?? null) as Record<string, unknown> | null;
}

export type AiRunRow = {
  id: string; useCase: string; provider: string; model: string;
  promptTemplate: string; promptVersion: number; status: string;
  startedAt: string; completedAt: string | null; latencyMs: number | null;
  inputTokens: number | null; outputTokens: number | null;
  /** §12 · Solo si el proveedor los informa; si no, quedan en null. */
  cachedInputTokens: number | null; reasoningTokens: number | null;
  totalTokens: number | null;
  contextItems: number; evidenceLevel: string | null; errorMessage: string | null;
  actorName: string | null; isMine: boolean;
  question: string | null; answer: Record<string, unknown> | null;
  suggestionCount: number; acceptedCount: number; feedbackUseful: boolean | null;
  temporalMode: string; asOf: string | null;
};

/** Un hueco es un hueco: null no se convierte en cero (§12). */
function numeroOpcional(v: unknown): number | null {
  return v === null || v === undefined ? null : Number(v);
}

function mapRun(r: Record<string, unknown>): AiRunRow {
  return {
    id: String(r.run_id),
    useCase: String(r.use_case),
    provider: String(r.provider),
    model: String(r.model),
    promptTemplate: String(r.prompt_template),
    promptVersion: Number(r.prompt_version ?? 1),
    status: String(r.status),
    startedAt: String(r.started_at),
    completedAt: (r.completed_at as string | null) ?? null,
    latencyMs: r.latency_ms === null || r.latency_ms === undefined ? null : Number(r.latency_ms),
    inputTokens: r.input_tokens === null || r.input_tokens === undefined ? null : Number(r.input_tokens),
    outputTokens: r.output_tokens === null || r.output_tokens === undefined ? null : Number(r.output_tokens),
    cachedInputTokens: numeroOpcional(r.cached_input_tokens),
    reasoningTokens: numeroOpcional(r.reasoning_tokens),
    totalTokens: numeroOpcional(r.total_tokens),
    contextItems: Number(r.context_items ?? 0),
    evidenceLevel: (r.evidence_level as string | null) ?? null,
    errorMessage: (r.error_message as string | null) ?? null,
    actorName: (r.actor_name as string | null) ?? null,
    isMine: r.is_mine === true,
    question: (r.question as string | null) ?? null,
    answer: (r.answer as Record<string, unknown> | null) ?? null,
    suggestionCount: Number(r.suggestion_count ?? 0),
    acceptedCount: Number(r.accepted_count ?? 0),
    feedbackUseful: (r.feedback_useful as boolean | null) ?? null,
    temporalMode: String(r.temporal_mode ?? "current"),
    asOf: (r.as_of as string | null) ?? null,
  };
}

export async function listRuns(
  organizationId: string, limit = 50, client?: Db
): Promise<AiRunRow[]> {
  const s = await db(client);
  const { data, error } = await s.from("v_quality_ai_run_overview")
    .select("*").eq("organization_id", organizationId)
    .order("started_at", { ascending: false }).limit(limit);
  if (error) throw new Error(fail(error, "No se pudieron leer las consultas."));
  return filas(data).map(mapRun);
}

export async function getRun(
  organizationId: string, runId: string, client?: Db
): Promise<AiRunRow | null> {
  const s = await db(client);
  const { data, error } = await s.from("v_quality_ai_run_overview")
    .select("*").eq("organization_id", organizationId).eq("run_id", runId).maybeSingle();
  if (error) throw new Error(fail(error, "No se pudo leer la consulta."));
  return data ? mapRun(data as Record<string, unknown>) : null;
}

export type AiReferenceRow = {
  ordinal: number; sourceCode: string; entityType: string; entityId: string | null;
  label: string; deepLink: string | null; asOf: string | null;
};

export async function listReferences(
  organizationId: string, runId: string, client?: Db
): Promise<AiReferenceRow[]> {
  const s = await db(client);
  const { data, error } = await s.from("quality_ai_run_references")
    .select("ordinal, source_code, entity_type, entity_id, label, deep_link, as_of")
    .eq("organization_id", organizationId).eq("run_id", runId)
    .order("ordinal");
  if (error) throw new Error(fail(error, "No se pudieron leer las fuentes."));
  return filas(data).map((r) => ({
    ordinal: Number(r.ordinal),
    sourceCode: String(r.source_code),
    entityType: String(r.entity_type),
    entityId: (r.entity_id as string | null) ?? null,
    label: String(r.label),
    deepLink: (r.deep_link as string | null) ?? null,
    asOf: (r.as_of as string | null) ?? null,
  }));
}

export type AiSuggestionRow = {
  id: string; runId: string; kind: string; title: string;
  payload: Record<string, unknown>; rationale: string | null; status: string;
  reviewedByName: string | null; reviewedAt: string | null; decisionNote: string | null;
  resultingType: string | null; resultingId: string | null;
  requestedByName: string | null; provider: string; model: string;
  promptTemplate: string; promptVersion: number; createdAt: string;
  referenceCount: number;
};

function mapSuggestion(r: Record<string, unknown>): AiSuggestionRow {
  return {
    id: String(r.suggestion_id),
    runId: String(r.run_id),
    kind: String(r.kind),
    title: String(r.title),
    payload: (r.payload as Record<string, unknown>) ?? {},
    rationale: (r.rationale as string | null) ?? null,
    status: String(r.status),
    reviewedByName: (r.reviewed_by_name as string | null) ?? null,
    reviewedAt: (r.reviewed_at as string | null) ?? null,
    decisionNote: (r.decision_note as string | null) ?? null,
    resultingType: (r.resulting_type as string | null) ?? null,
    resultingId: (r.resulting_id as string | null) ?? null,
    requestedByName: (r.requested_by_name as string | null) ?? null,
    provider: String(r.provider),
    model: String(r.model),
    promptTemplate: String(r.prompt_template),
    promptVersion: Number(r.prompt_version ?? 1),
    createdAt: String(r.created_at),
    referenceCount: Number(r.reference_count ?? 0),
  };
}

export async function listSuggestions(
  organizationId: string, filtro: { status?: string; runId?: string } = {}, client?: Db
): Promise<AiSuggestionRow[]> {
  const s = await db(client);
  let q = s.from("v_quality_ai_suggestion_overview")
    .select("*").eq("organization_id", organizationId)
    .order("created_at", { ascending: false }).limit(100);
  if (filtro.status) q = q.eq("status", filtro.status);
  if (filtro.runId) q = q.eq("run_id", filtro.runId);
  const { data, error } = await q;
  if (error) throw new Error(fail(error, "No se pudieron leer los borradores."));
  return filas(data).map(mapSuggestion);
}

export async function getSuggestion(
  organizationId: string, id: string, client?: Db
): Promise<AiSuggestionRow | null> {
  const s = await db(client);
  const { data, error } = await s.from("v_quality_ai_suggestion_overview")
    .select("*").eq("organization_id", organizationId).eq("suggestion_id", id).maybeSingle();
  if (error) throw new Error(fail(error, "No se pudo leer el borrador."));
  return data ? mapSuggestion(data as Record<string, unknown>) : null;
}

export async function createSuggestion(
  runId: string, kind: string, title: string,
  payload: Record<string, unknown>, rationale: string | null, client?: Db
): Promise<string> {
  const s = await db(client);
  const { data, error } = await s.rpc("quality_ai_create_suggestion", {
    p_run_id: runId, p_kind: kind, p_title: title,
    p_payload: payload, p_rationale: rationale,
  });
  if (error) throw new Error(fail(error, "No se pudo guardar el borrador."));
  return data as string;
}

export async function acceptSuggestion(
  id: string, note: string | null,
  resulting: { type: string; id: string } | null, client?: Db
): Promise<void> {
  const s = await db(client);
  const { error } = await s.rpc("quality_ai_accept_suggestion", {
    p_suggestion_id: id, p_note: note,
    p_resulting_type: resulting?.type ?? null,
    p_resulting_id: resulting?.id ?? null,
  });
  if (error) throw new Error(fail(error, "No se pudo aceptar el borrador."));
}

export async function rejectSuggestion(
  id: string, reason: string, client?: Db
): Promise<void> {
  const s = await db(client);
  const { error } = await s.rpc("quality_ai_reject_suggestion", {
    p_suggestion_id: id, p_reason: reason,
  });
  if (error) throw new Error(fail(error, "No se pudo descartar el borrador."));
}

export async function recordFeedback(
  runId: string, useful: boolean, reason: string | null, note: string | null, client?: Db
): Promise<void> {
  const s = await db(client);
  const { error } = await s.rpc("quality_ai_record_feedback", {
    p_run_id: runId, p_useful: useful, p_reason: reason, p_note: note,
  });
  if (error) throw new Error(fail(error, "No se pudo guardar tu valoración."));
}

export async function createSession(
  organizationId: string,
  pinned: { type: string; id: string; label: string } | null,
  title: string | null, client?: Db
): Promise<string> {
  const s = await db(client);
  const { data: sesion } = await s.auth.getUser();
  const { data, error } = await s.from("quality_ai_sessions").insert({
    organization_id: organizationId,
    actor_id: sesion.user?.id,
    title,
    pinned_type: pinned?.type ?? null,
    pinned_id: pinned?.id ?? null,
    pinned_label: pinned?.label ?? null,
  }).select("id").single();
  if (error) throw new Error(fail(error, "No se pudo abrir la conversación."));
  return String((data as Record<string, unknown>).id);
}

/** §81 · La conversación reciente, acotada: el historial no crece sin fin. */
export async function listSessionRuns(
  organizationId: string, sessionId: string, limit = 6, client?: Db
): Promise<AiRunRow[]> {
  const s = await db(client);
  const { data, error } = await s.from("v_quality_ai_run_overview")
    .select("*").eq("organization_id", organizationId).eq("session_id", sessionId)
    .order("started_at", { ascending: false }).limit(limit);
  if (error) throw new Error(fail(error, "No se pudo leer la conversación."));
  return filas(data).map(mapRun);
}

export async function listAiSources(client?: Db): Promise<Record<string, unknown>[]> {
  const s = await db(client);
  const { data, error } = await s.from("quality_ai_sources")
    .select("*").order("position_order");
  if (error) throw new Error(fail(error, "No se pudo leer el catálogo del Copilot."));
  return filas(data);
}


// ---------------------------------------------------------------------------
// QUALITY-12.1 · Los temas de clientes persistidos · GAP-03 de QUALITY-12
// ---------------------------------------------------------------------------

export type AiThemeRow = {
  id: string; themeKey: string; label: string; summary: string | null;
  sentiment: string; status: string;
  periodStart: string; periodEnd: string;
  evidenceCount: number;
  runId: string; provider: string; model: string;
  promptTemplate: string; promptVersion: number;
  createdAt: string;
  /** Del periodo anterior DEL MISMO TEMA; null si es la primera lectura. */
  previousSentiment: string | null;
  previousEvidenceCount: number | null;
  previousPeriodEnd: string | null;
};

export async function listCustomerThemes(
  organizationId: string, limit = 60, client?: Db
): Promise<AiThemeRow[]> {
  const s = await db(client);
  const { data, error } = await s
    .from("v_quality_ai_customer_theme_series")
    .select("*")
    .eq("organization_id", organizationId)
    .order("period_start", { ascending: false })
    .order("theme_key", { ascending: true })
    .limit(limit);
  if (error) throw new Error(fail(error, "No se pudieron leer los temas de clientes."));
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.theme_id),
    themeKey: String(r.theme_key),
    label: String(r.label),
    summary: (r.summary as string | null) ?? null,
    sentiment: String(r.sentiment ?? "unknown"),
    status: String(r.status ?? "proposed"),
    periodStart: String(r.period_start),
    periodEnd: String(r.period_end),
    evidenceCount: Number(r.evidence_count ?? 0),
    runId: String(r.run_id),
    provider: String(r.provider),
    model: String(r.model),
    promptTemplate: String(r.prompt_template),
    promptVersion: Number(r.prompt_version ?? 1),
    createdAt: String(r.created_at),
    previousSentiment: (r.previous_sentiment as string | null) ?? null,
    previousEvidenceCount: numeroOpcional(r.previous_evidence_count),
    previousPeriodEnd: (r.previous_period_end as string | null) ?? null,
  }));
}

export async function resolveCustomerTheme(
  themeId: string, status: "confirmed" | "discarded", note: string | null, client?: Db
): Promise<void> {
  const s = await db(client);
  const { error } = await s.rpc("quality_ai_resolve_customer_theme", {
    p_theme_id: themeId, p_status: status, p_note: note,
  });
  if (error) throw new Error(fail(error, "No se pudo resolver el tema."));
}
