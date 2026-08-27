import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";
import type {
  AutomationDomain, AutonomyLevel, Condition, Operator, Output, RuleStatus,
  RunKind, RunStatus, Severity, SignalStatus, VersionStatus,
} from "@/lib/domain/quality-automation";

/**
 * Trazaloop · QUALITY-11 · Lectura y escritura de la Automatización.
 *
 * CUATRO DECISIONES QUE EXPLICAN CÓMO ESTÁ ESCRITO ESTE ARCHIVO
 *
 * 1 · El MOTOR vive entero en 0129. Aquí no se evalúa ninguna condición: si se
 *     evaluara también aquí habría dos semánticas del mismo operador, y algún
 *     día dirían cosas distintas.
 *
 * 2 · Ejecutar, simular, publicar, reconocer, resolver y silenciar pasan por su
 *     RPC. Todas comprueban rol, empresa e invariante en el mismo acto.
 *
 * 3 · Las relaciones se resuelven con consultas separadas: las FK son
 *     compuestas y los embeds de PostgREST no las resuelven.
 *
 * 4 · Nunca `service_role`. Ni siquiera para el barrido: el motor es
 *     `security definer` y revalida la pertenencia contra la sesión.
 */

type Db = SupabaseClient;

function fail(error: { message?: string; code?: string } | null, fallback: string): string {
  const raw = error?.message ?? "";
  if (error?.code === "P0001" && raw.length > 0) return raw;
  return raw.length > 0 ? raw : fallback;
}

async function db(client?: Db): Promise<Db> {
  return client ?? (await createServerClient());
}

// ===========================================================================
// CATÁLOGOS
// ===========================================================================

export type SourceFieldRow = {
  field: string; label: string; dataType: string;
  allowedOperators: Operator[]; enumValues: string[] | null;
  unit: string | null; order: number;
};

export type SourceRow = {
  code: string; domain: AutomationDomain; label: string; description: string;
  subjectType: string; deepLink: string | null;
  hasOwnerPosition: boolean; supportedTriggers: string[]; order: number;
  fields: SourceFieldRow[];
};

export async function listSources(client?: Db): Promise<SourceRow[]> {
  const supabase = await db(client);
  const [sources, fields] = await Promise.all([
    supabase.from("quality_automation_sources").select("*").order("position_order"),
    supabase.from("quality_automation_source_fields").select("*").order("position_order"),
  ]);
  if (sources.error) throw new Error(fail(sources.error, "No se pudo leer el catálogo de fuentes."));

  const F = new Map<string, SourceFieldRow[]>();
  for (const f of fields.data ?? []) {
    const list = F.get(f.source_code as string) ?? [];
    list.push({
      field: f.field as string, label: f.label as string,
      dataType: f.data_type as string,
      allowedOperators: (f.allowed_operators ?? []) as Operator[],
      enumValues: (f.enum_values as string[] | null) ?? null,
      unit: (f.unit as string | null) ?? null,
      order: Number(f.position_order ?? 1),
    });
    F.set(f.source_code as string, list);
  }

  return (sources.data ?? []).map((s) => ({
    code: s.code as string,
    domain: s.domain as AutomationDomain,
    label: s.label as string, description: s.description as string,
    subjectType: s.subject_type as string,
    deepLink: (s.deep_link as string | null) ?? null,
    hasOwnerPosition: s.has_owner_position as boolean,
    supportedTriggers: (s.supported_triggers ?? []) as string[],
    order: Number(s.position_order ?? 1),
    fields: F.get(s.code as string) ?? [],
  }));
}

export type TemplateRow = {
  code: string; name: string; description: string;
  category: AutomationDomain; sourceCode: string;
  autonomyLevel: AutonomyLevel; severity: Severity; signalTitle: string;
  conditions: Condition[]; outputs: Output[];
  tunable: Record<string, unknown>[]; rationale: string; order: number;
};

export async function listTemplates(client?: Db): Promise<TemplateRow[]> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("quality_automation_rule_templates").select("*").order("position_order");
  if (error) throw new Error(fail(error, "No se pudieron leer las plantillas."));
  return (data ?? []).map((t) => ({
    code: t.code as string, name: t.name as string,
    description: t.description as string,
    category: t.category as AutomationDomain,
    sourceCode: t.source_code as string,
    autonomyLevel: t.autonomy_level as AutonomyLevel,
    severity: t.severity as Severity,
    signalTitle: t.signal_title as string,
    conditions: (t.conditions ?? []) as Condition[],
    outputs: normalizeOutputs(t.outputs),
    tunable: (t.tunable ?? []) as Record<string, unknown>[],
    rationale: t.rationale as string,
    order: Number(t.position_order ?? 1),
  }));
}

/** La base guarda `recipient_kind`; el dominio usa `recipientKind`. Un solo
 *  sitio traduce, para que la pantalla no vea dos convenciones. */
function normalizeOutputs(raw: unknown): Output[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((o) => {
    const r = o as Record<string, unknown>;
    return {
      kind: r.kind as Output["kind"],
      recipientKind: (r.recipient_kind ?? r.recipientKind) as Output["recipientKind"],
      positionId: (r.position_id ?? r.positionId) as string | undefined,
      taskTitle: (r.task_title ?? r.taskTitle) as string | undefined,
      dueInDays: (r.due_in_days ?? r.dueInDays) as number | undefined,
    };
  });
}

export function outputsToDb(outputs: Output[]): Record<string, unknown>[] {
  return outputs.map((o) => ({
    kind: o.kind,
    ...(o.recipientKind ? { recipient_kind: o.recipientKind } : {}),
    ...(o.positionId ? { position_id: o.positionId } : {}),
    ...(o.taskTitle ? { task_title: o.taskTitle } : {}),
    ...(o.dueInDays !== undefined ? { due_in_days: o.dueInDays } : {}),
  }));
}

// ===========================================================================
// REGLAS
// ===========================================================================

export type RuleRow = {
  id: string; code: string; name: string; description: string | null;
  category: AutomationDomain; sourceCode: string; sourceLabel: string;
  sourceDomain: AutomationDomain; deepLink: string | null;
  status: RuleStatus; autonomyLevel: AutonomyLevel;
  isPlatform: boolean; templateCode: string | null;
  ownerPositionId: string | null; ownerPositionName: string | null;
  createdAt: string;
  currentVersionId: string | null; currentVersionNumber: number | null;
  currentSeverity: Severity | null; currentSignalTitle: string | null;
  currentConditions: Condition[]; currentOutputs: Output[];
  currentEffectiveFrom: string | null;
  triggerKind: string | null; scheduleFrequency: string | null;
  draftVersionCount: number;
  openSignalCount: number; criticalSignalCount: number;
  lastEvaluatedAt: string | null; lastEvaluationStatus: string | null;
  isSuppressed: boolean;
};

function mapRule(r: Record<string, unknown>): RuleRow {
  return {
    id: r.rule_id as string, code: r.code as string, name: r.name as string,
    description: (r.description as string | null) ?? null,
    category: r.category as AutomationDomain,
    sourceCode: r.source_code as string,
    sourceLabel: r.source_label as string,
    sourceDomain: r.source_domain as AutomationDomain,
    deepLink: (r.deep_link as string | null) ?? null,
    status: r.status as RuleStatus,
    autonomyLevel: r.autonomy_level as AutonomyLevel,
    isPlatform: r.is_platform as boolean,
    templateCode: (r.template_code as string | null) ?? null,
    ownerPositionId: (r.owner_position_id as string | null) ?? null,
    ownerPositionName: (r.owner_position_name as string | null) ?? null,
    createdAt: r.created_at as string,
    currentVersionId: (r.current_version_id as string | null) ?? null,
    currentVersionNumber: r.current_version_number
      ? Number(r.current_version_number) : null,
    currentSeverity: (r.current_severity as Severity | null) ?? null,
    currentSignalTitle: (r.current_signal_title as string | null) ?? null,
    currentConditions: (r.current_conditions ?? []) as Condition[],
    currentOutputs: normalizeOutputs(r.current_outputs),
    currentEffectiveFrom: (r.current_effective_from as string | null) ?? null,
    triggerKind: (r.trigger_kind as string | null) ?? null,
    scheduleFrequency: (r.schedule_frequency as string | null) ?? null,
    draftVersionCount: Number(r.draft_version_count ?? 0),
    openSignalCount: Number(r.open_signal_count ?? 0),
    criticalSignalCount: Number(r.critical_signal_count ?? 0),
    lastEvaluatedAt: (r.last_evaluated_at as string | null) ?? null,
    lastEvaluationStatus: (r.last_evaluation_status as string | null) ?? null,
    isSuppressed: r.is_suppressed === true,
  };
}

export async function listRules(
  organizationId: string,
  filters: { status?: string; category?: string } = {},
  client?: Db
): Promise<RuleRow[]> {
  const supabase = await db(client);
  let q = supabase.from("v_quality_automation_rule_overview")
    .select("*").eq("organization_id", organizationId).order("code");
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.category) q = q.eq("category", filters.category);
  const { data, error } = await q;
  if (error) throw new Error(fail(error, "No se pudieron leer las reglas."));
  return (data ?? []).map(mapRule);
}

export async function getRule(
  organizationId: string, ruleId: string, client?: Db
): Promise<RuleRow | null> {
  const supabase = await db(client);
  const { data, error } = await supabase.from("v_quality_automation_rule_overview")
    .select("*").eq("organization_id", organizationId).eq("rule_id", ruleId)
    .maybeSingle();
  if (error) throw new Error(fail(error, "No se pudo leer la regla."));
  return data ? mapRule(data) : null;
}

export type VersionRow = {
  id: string; versionNumber: number; status: VersionStatus;
  triggerKind: string; scheduleFrequency: string;
  conditions: Condition[]; outputs: Output[];
  severity: Severity; signalTitle: string;
  effectiveFrom: string | null; effectiveTo: string | null;
  changeNote: string | null; publishedAt: string | null;
};

export async function listVersions(
  organizationId: string, ruleId: string, client?: Db
): Promise<VersionRow[]> {
  const supabase = await db(client);
  const { data, error } = await supabase.from("quality_automation_rule_versions")
    .select("*").eq("organization_id", organizationId).eq("rule_id", ruleId)
    .order("version_number", { ascending: false });
  if (error) throw new Error(fail(error, "No se pudieron leer las versiones."));
  return (data ?? []).map((v) => ({
    id: v.id as string, versionNumber: Number(v.version_number ?? 1),
    status: v.status as VersionStatus,
    triggerKind: v.trigger_kind as string,
    scheduleFrequency: v.schedule_frequency as string,
    conditions: (v.conditions ?? []) as Condition[],
    outputs: normalizeOutputs(v.outputs),
    severity: v.severity as Severity,
    signalTitle: v.signal_title as string,
    effectiveFrom: (v.effective_from as string | null) ?? null,
    effectiveTo: (v.effective_to as string | null) ?? null,
    changeNote: (v.change_note as string | null) ?? null,
    publishedAt: (v.published_at as string | null) ?? null,
  }));
}

/** §169 · El resumen legible, generado en la base desde el árbol de la regla. */
export async function describeVersion(
  versionId: string, client?: Db
): Promise<string | null> {
  const supabase = await db(client);
  const { data, error } = await supabase.rpc("quality_automation_describe_version", {
    p_version_id: versionId,
  });
  if (error) throw new Error(fail(error, "No se pudo describir la regla."));
  return (data as string | null) ?? null;
}

/** §30 · La validación de verdad. Falla cerrada. */
export async function validateVersion(
  versionId: string, client?: Db
): Promise<{ valid: boolean; errors: string[] }> {
  const supabase = await db(client);
  const { data, error } = await supabase.rpc("quality_automation_validate_version", {
    p_version_id: versionId,
  });
  if (error) throw new Error(fail(error, "No se pudo validar la regla."));
  const r = (data ?? {}) as { valid?: boolean; errors?: string[] };
  return { valid: r.valid === true, errors: r.errors ?? [] };
}

// ===========================================================================
// SEÑALES
// ===========================================================================

export type SignalRow = {
  id: string; domain: AutomationDomain; sourceCode: string; sourceLabel: string;
  deepLink: string | null;
  subjectType: string; subjectId: string; subjectLabel: string | null;
  severity: Severity; status: SignalStatus;
  title: string; explanation: string;
  sourceSnapshot: Record<string, unknown> | null;
  firstDetectedAt: string; lastDetectedAt: string; detectionCount: number;
  acknowledgedAt: string | null; resolvedAt: string | null;
  resolutionKind: string | null; resolutionNote: string | null;
  recipientUnresolved: boolean;
  ruleId: string | null; ruleCode: string | null; ruleName: string | null;
  ruleVersionId: string | null; ruleVersionNumber: number | null;
  runId: string | null;
  alertCount: number; taskCount: number; openTaskCount: number;
};

function mapSignal(s: Record<string, unknown>): SignalRow {
  return {
    id: s.signal_id as string,
    domain: s.domain as AutomationDomain,
    sourceCode: s.source_code as string,
    sourceLabel: s.source_label as string,
    deepLink: (s.deep_link as string | null) ?? null,
    subjectType: s.subject_type as string,
    subjectId: s.subject_id as string,
    subjectLabel: (s.subject_label as string | null) ?? null,
    severity: s.severity as Severity,
    status: s.status as SignalStatus,
    title: s.title as string,
    explanation: s.explanation as string,
    sourceSnapshot: (s.source_snapshot as Record<string, unknown> | null) ?? null,
    firstDetectedAt: s.first_detected_at as string,
    lastDetectedAt: s.last_detected_at as string,
    detectionCount: Number(s.detection_count ?? 1),
    acknowledgedAt: (s.acknowledged_at as string | null) ?? null,
    resolvedAt: (s.resolved_at as string | null) ?? null,
    resolutionKind: (s.resolution_kind as string | null) ?? null,
    resolutionNote: (s.resolution_note as string | null) ?? null,
    recipientUnresolved: s.recipient_unresolved === true,
    ruleId: (s.rule_id as string | null) ?? null,
    ruleCode: (s.rule_code as string | null) ?? null,
    ruleName: (s.rule_name as string | null) ?? null,
    ruleVersionId: (s.rule_version_id as string | null) ?? null,
    ruleVersionNumber: s.rule_version_number ? Number(s.rule_version_number) : null,
    runId: (s.run_id as string | null) ?? null,
    alertCount: Number(s.alert_count ?? 0),
    taskCount: Number(s.task_count ?? 0),
    openTaskCount: Number(s.open_task_count ?? 0),
  };
}

export async function listSignals(
  organizationId: string,
  filters: { status?: string; severity?: string; domain?: string;
             ruleId?: string; open?: boolean } = {},
  client?: Db
): Promise<SignalRow[]> {
  const supabase = await db(client);
  let q = supabase.from("v_quality_signal_overview")
    .select("*").eq("organization_id", organizationId)
    .order("severity").order("last_detected_at", { ascending: false });
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.severity) q = q.eq("severity", filters.severity);
  if (filters.domain) q = q.eq("domain", filters.domain);
  if (filters.ruleId) q = q.eq("rule_id", filters.ruleId);
  if (filters.open) q = q.is("resolved_at", null);
  const { data, error } = await q;
  if (error) throw new Error(fail(error, "No se pudieron leer las señales."));
  return (data ?? []).map(mapSignal);
}

export async function getSignal(
  organizationId: string, signalId: string, client?: Db
): Promise<SignalRow | null> {
  const supabase = await db(client);
  const { data, error } = await supabase.from("v_quality_signal_overview")
    .select("*").eq("organization_id", organizationId).eq("signal_id", signalId)
    .maybeSingle();
  if (error) throw new Error(fail(error, "No se pudo leer la señal."));
  return data ? mapSignal(data) : null;
}

/** §76 · Las señales abiertas de un objeto concreto, para su ficha. Se
 *  REFERENCIAN: no se copia nada al dominio de origen. */
export async function listSignalsForSubject(
  organizationId: string, subjectType: string, subjectId: string, client?: Db
): Promise<SignalRow[]> {
  const supabase = await db(client);
  const { data, error } = await supabase.from("v_quality_signal_overview")
    .select("*").eq("organization_id", organizationId)
    .eq("subject_type", subjectType).eq("subject_id", subjectId)
    .is("resolved_at", null);
  if (error) throw new Error(fail(error, "No se pudieron leer las señales del objeto."));
  return (data ?? []).map(mapSignal);
}

// ===========================================================================
// EJECUCIONES Y SALUD
// ===========================================================================

export type RunRuleRow = {
  id: string; ruleId: string | null; ruleName: string | null;
  platformObserver: string | null;
  subjectsEvaluated: number; matches: number;
  signalsCreated: number; alertsCreated: number; tasksCreated: number;
  status: string; errorMessage: string | null; durationMs: number | null;
};

export type RunRow = {
  id: string; runKind: RunKind; businessDate: string;
  startedAt: string; finishedAt: string | null; status: RunStatus;
  rulesEvaluated: number; subjectsEvaluated: number; matches: number;
  signalsCreated: number; alertsCreated: number; tasksCreated: number;
  failures: number; durationMs: number | null;
  platformObservers: number; organizationRules: number;
  detail: RunRuleRow[];
};

function mapRun(r: Record<string, unknown>, detail: RunRuleRow[] = []): RunRow {
  return {
    id: r.run_id as string, runKind: r.run_kind as RunKind,
    businessDate: r.business_date as string,
    startedAt: r.started_at as string,
    finishedAt: (r.finished_at as string | null) ?? null,
    status: r.status as RunStatus,
    rulesEvaluated: Number(r.rules_evaluated ?? 0),
    subjectsEvaluated: Number(r.subjects_evaluated ?? 0),
    matches: Number(r.matches ?? 0),
    signalsCreated: Number(r.signals_created ?? 0),
    alertsCreated: Number(r.alerts_created ?? 0),
    tasksCreated: Number(r.tasks_created ?? 0),
    failures: Number(r.failures ?? 0),
    durationMs: r.duration_ms ? Number(r.duration_ms) : null,
    platformObservers: Number(r.platform_observers ?? 0),
    organizationRules: Number(r.organization_rules ?? 0),
    detail,
  };
}

export async function listRuns(
  organizationId: string, limit = 30, client?: Db
): Promise<RunRow[]> {
  const supabase = await db(client);
  const { data, error } = await supabase.from("v_quality_automation_run_overview")
    .select("*").eq("organization_id", organizationId)
    .order("started_at", { ascending: false }).limit(limit);
  if (error) throw new Error(fail(error, "No se pudieron leer las ejecuciones."));
  return (data ?? []).map((r) => mapRun(r));
}

export async function getRun(
  organizationId: string, runId: string, client?: Db
): Promise<RunRow | null> {
  const supabase = await db(client);
  const [{ data, error }, detalle] = await Promise.all([
    supabase.from("v_quality_automation_run_overview")
      .select("*").eq("organization_id", organizationId).eq("run_id", runId).maybeSingle(),
    supabase.from("quality_automation_run_rules")
      .select("*").eq("organization_id", organizationId).eq("run_id", runId),
  ]);
  if (error) throw new Error(fail(error, "No se pudo leer la ejecución."));
  if (!data) return null;

  const ids = [...new Set((detalle.data ?? []).map((d) => d.rule_id).filter(Boolean))] as string[];
  const { data: reglas } = ids.length > 0
    ? await supabase.from("quality_automation_rules").select("id, name")
        .eq("organization_id", organizationId).in("id", ids)
    : { data: [] as { id: string; name: string }[] };
  const N = new Map((reglas ?? []).map((r) => [r.id as string, r.name as string]));

  return mapRun(data, (detalle.data ?? []).map((d) => ({
    id: d.id as string,
    ruleId: (d.rule_id as string | null) ?? null,
    ruleName: d.rule_id ? (N.get(d.rule_id as string) ?? null) : null,
    platformObserver: (d.platform_observer as string | null) ?? null,
    subjectsEvaluated: Number(d.subjects_evaluated ?? 0),
    matches: Number(d.matches ?? 0),
    signalsCreated: Number(d.signals_created ?? 0),
    alertsCreated: Number(d.alerts_created ?? 0),
    tasksCreated: Number(d.tasks_created ?? 0),
    status: d.status as string,
    errorMessage: (d.error_message as string | null) ?? null,
    durationMs: d.duration_ms ? Number(d.duration_ms) : null,
  })));
}

export async function getHealth(
  organizationId: string, client?: Db
): Promise<Record<string, unknown> | null> {
  const supabase = await db(client);
  const { data, error } = await supabase.rpc("quality_automation_health", {
    p_organization_id: organizationId,
  });
  if (error) throw new Error(fail(error, "No se pudo leer el estado del motor."));
  return (data as Record<string, unknown> | null) ?? null;
}

/** §171 · Lo que la portada de Quality necesita, consolidado. */
export type AutomationHomeSignals = {
  openSignals: number;
  criticalSignals: number;
  byDomain: { domain: string; count: number }[];
  engineFailing: boolean;
};

export async function getAutomationHomeSignals(
  organizationId: string, client?: Db
): Promise<AutomationHomeSignals> {
  const supabase = await db(client);
  const [{ data: signals }, health] = await Promise.all([
    supabase.from("v_quality_signal_overview")
      .select("domain, severity").eq("organization_id", organizationId)
      .is("resolved_at", null),
    getHealth(organizationId, supabase),
  ]);
  const rows = signals ?? [];
  const porDominio = new Map<string, number>();
  for (const s of rows) {
    porDominio.set(s.domain as string, (porDominio.get(s.domain as string) ?? 0) + 1);
  }
  return {
    openSignals: rows.length,
    criticalSignals: rows.filter((s) => s.severity === "critical").length,
    byDomain: [...porDominio.entries()]
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count),
    engineFailing: Number(health?.runs_failed_last_7d ?? 0) > 0
      || Number(health?.rules_failing ?? 0) > 0,
  };
}

// ===========================================================================
// ESCRITURA
// ---------------------------------------------------------------------------
// Los borradores son escritura normal bajo RLS. Publicar, ejecutar, simular,
// reconocer, resolver y silenciar pasan por su RPC.
// ===========================================================================

export async function instantiateTemplate(
  organizationId: string, templateCode: string,
  ownerPositionId: string | null, conditions: Condition[] | null,
  client?: Db
): Promise<string> {
  const supabase = await db(client);
  const { data, error } = await supabase.rpc("quality_automation_instantiate_template", {
    p_organization_id: organizationId, p_template_code: templateCode,
    p_owner_position_id: ownerPositionId,
    p_conditions: conditions ? JSON.parse(JSON.stringify(conditions)) : null,
  });
  if (error) throw new Error(fail(error, "No se pudo crear la regla desde la plantilla."));
  return data as string;
}

export async function createRule(
  organizationId: string,
  input: {
    code: string; name: string; description: string | null;
    category: AutomationDomain; sourceCode: string;
    ownerPositionId: string | null; autonomyLevel: AutonomyLevel;
    severity: Severity; signalTitle: string;
    conditions: Condition[]; outputs: Output[];
  },
  client?: Db
): Promise<string> {
  const supabase = await db(client);
  const { data, error } = await supabase.from("quality_automation_rules").insert({
    organization_id: organizationId, code: input.code, name: input.name,
    description: input.description, category: input.category,
    source_code: input.sourceCode, owner_position_id: input.ownerPositionId,
    autonomy_level: input.autonomyLevel, status: "draft",
  }).select("id").single();
  if (error) throw new Error(fail(error, "No se pudo crear la regla."));

  const { error: ev } = await supabase.from("quality_automation_rule_versions").insert({
    organization_id: organizationId, rule_id: data!.id, version_number: 1,
    status: "draft", trigger_kind: "schedule", schedule_frequency: "daily",
    conditions: JSON.parse(JSON.stringify(input.conditions)),
    outputs: outputsToDb(input.outputs),
    severity: input.severity, signal_title: input.signalTitle,
  });
  if (ev) throw new Error(fail(ev, "No se pudo crear la primera versión."));
  return data!.id as string;
}

export async function updateRule(
  organizationId: string, ruleId: string,
  input: { name: string; description: string | null; ownerPositionId: string | null },
  client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase.from("quality_automation_rules").update({
    name: input.name, description: input.description,
    owner_position_id: input.ownerPositionId,
  }).eq("organization_id", organizationId).eq("id", ruleId);
  if (error) throw new Error(fail(error, "No se pudo actualizar la regla."));
}

/** §24 · Desactivar no borra nada de lo que la regla ya observó. */
export async function setRuleStatus(
  organizationId: string, ruleId: string, status: RuleStatus,
  reason: string | null, client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase.from("quality_automation_rules").update({
    status,
    retired_at: status === "retired" ? new Date().toISOString() : null,
    retirement_reason: status === "retired" ? reason : null,
  }).eq("organization_id", organizationId).eq("id", ruleId);
  if (error) throw new Error(fail(error, "No se pudo cambiar el estado de la regla."));
}

export async function deleteRule(
  organizationId: string, ruleId: string, client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase.from("quality_automation_rules").delete()
    .eq("organization_id", organizationId).eq("id", ruleId);
  if (error) throw new Error(fail(error, "No se pudo eliminar la regla."));
}

/** §21 · Editar una regla publicada es crear la versión siguiente. */
export async function createVersion(
  organizationId: string, ruleId: string,
  input: {
    conditions: Condition[]; outputs: Output[];
    severity: Severity; signalTitle: string;
    triggerKind: string; scheduleFrequency: string; changeNote: string | null;
  },
  client?: Db
): Promise<string> {
  const supabase = await db(client);
  const { data: previas } = await supabase.from("quality_automation_rule_versions")
    .select("version_number").eq("organization_id", organizationId).eq("rule_id", ruleId)
    .order("version_number", { ascending: false }).limit(1);
  const siguiente = (previas?.[0]?.version_number ?? 0) + 1;

  const { data, error } = await supabase.from("quality_automation_rule_versions").insert({
    organization_id: organizationId, rule_id: ruleId, version_number: siguiente,
    status: "draft", trigger_kind: input.triggerKind,
    schedule_frequency: input.scheduleFrequency,
    conditions: JSON.parse(JSON.stringify(input.conditions)),
    outputs: outputsToDb(input.outputs),
    severity: input.severity, signal_title: input.signalTitle,
    change_note: input.changeNote,
  }).select("id").single();
  if (error) throw new Error(fail(error, "No se pudo crear la versión."));
  return data!.id as string;
}

export async function updateDraftVersion(
  organizationId: string, versionId: string,
  input: {
    conditions: Condition[]; outputs: Output[];
    severity: Severity; signalTitle: string;
  },
  client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase.from("quality_automation_rule_versions").update({
    conditions: JSON.parse(JSON.stringify(input.conditions)),
    outputs: outputsToDb(input.outputs),
    severity: input.severity, signal_title: input.signalTitle,
  }).eq("organization_id", organizationId).eq("id", versionId);
  if (error) throw new Error(fail(error, "No se pudo guardar el borrador."));
}

export async function publishVersion(
  versionId: string, effectiveFrom: string | null, changeNote: string | null,
  client?: Db
): Promise<Record<string, unknown>> {
  const supabase = await db(client);
  const { data, error } = await supabase.rpc("quality_automation_publish_version", {
    p_version_id: versionId, p_effective_from: effectiveFrom,
    p_change_note: changeNote,
  });
  if (error) throw new Error(fail(error, "No se pudo publicar la versión."));
  return (data as Record<string, unknown>) ?? {};
}

/** §70/§144 · Simular sobre datos reales, sin crear absolutamente nada. */
export async function simulateVersion(
  versionId: string, today: string | null, client?: Db
): Promise<Record<string, unknown> | null> {
  const supabase = await db(client);
  const { data, error } = await supabase.rpc("quality_automation_simulate", {
    p_version_id: versionId, p_today: today,
  });
  if (error) throw new Error(fail(error, "No se pudo simular la regla."));
  return (data as Record<string, unknown> | null) ?? null;
}

/** §105/§106 · Ejecutar. La misma función que usa el barrido programado. */
export async function runAutomation(
  organizationId: string, mode: "live" | "simulation" = "live",
  ruleId: string | null = null, today: string | null = null,
  client?: Db
): Promise<string> {
  const supabase = await db(client);
  const { data, error } = await supabase.rpc("quality_automation_run", {
    p_organization_id: organizationId, p_mode: mode,
    p_rule_id: ruleId, p_today: today,
  });
  if (error) throw new Error(fail(error, "No se pudo ejecutar la automatización."));
  return data as string;
}

export async function acknowledgeSignal(
  signalId: string, client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase.rpc("quality_signal_acknowledge", {
    p_signal_id: signalId,
  });
  if (error) throw new Error(fail(error, "No se pudo reconocer la señal."));
}

export async function resolveSignal(
  signalId: string, kind: "manual" | "dismissed", note: string, client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase.rpc("quality_signal_resolve", {
    p_signal_id: signalId, p_kind: kind, p_note: note,
  });
  if (error) throw new Error(fail(error, "No se pudo cerrar la señal."));
}

export async function suppress(
  scope: "signal" | "rule", targetId: string, reason: string,
  until: string | null, client?: Db
): Promise<string> {
  const supabase = await db(client);
  const { data, error } = await supabase.rpc("quality_signal_suppress", {
    p_scope: scope, p_target_id: targetId, p_reason: reason, p_until: until,
  });
  if (error) throw new Error(fail(error, "No se pudo silenciar."));
  return data as string;
}

export async function updateSettings(
  organizationId: string,
  input: { isEnabled: boolean; businessTimezone: string },
  client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase.from("quality_automation_settings").upsert({
    organization_id: organizationId,
    is_enabled: input.isEnabled,
    business_timezone: input.businessTimezone,
  }, { onConflict: "organization_id" });
  if (error) throw new Error(fail(error, "No se pudo guardar la configuración."));
}
