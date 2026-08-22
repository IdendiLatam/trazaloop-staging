import "server-only";

import { createServerClient } from "@/lib/supabase/server";
import type {
  CalcDefinition, DataQuality, DataState, Direction, Evaluation, Frequency,
  IndicatorAdminState, ObjectiveAdminState, ObjectivePerformance, ObjectiveRule,
  ScopeType, SourceKind,
} from "@/lib/domain/quality-indicators";

/**
 * Trazaloop Quality · QUALITY-03 · Capa de datos de objetivos e indicadores.
 *
 * Todo corre con la sesión REAL bajo RLS; nada usa service_role. Las lecturas
 * salen de las vistas derivadas (0117 §20) y las escrituras del motor de
 * medición pasan SIEMPRE por las RPC: aquí no hay ni un INSERT de medición,
 * porque la base tampoco lo permitiría.
 */

function reportQueryFailure(where: string, error: { code?: string; message?: string } | null) {
  console.error(
    `[quality/indicators] consulta fallida en ${where}: ${error?.code ?? "sin código"} · ${error?.message ?? "sin mensaje"}`
  );
}

/** Traduce el error de una RPC a algo que se pueda mostrar sin miedo. */
function rpcError(error: { message?: string } | null, fallback: string): string {
  const raw = (error?.message ?? "").trim();
  if (raw.length === 0) return fallback;
  // Los mensajes de 0117 están escritos EN ESPAÑOL y para el usuario final; un
  // error inesperado de PostgreSQL, no. Se distingue por sus rastros técnicos.
  if (/^[A-Z_]+:|relation |column |permission denied|violates |duplicate key/i.test(raw)) return fallback;
  return raw;
}

// ---------------------------------------------------------------------------
// Objetivos
// ---------------------------------------------------------------------------
export type ObjectiveRow = {
  objectiveId: string;
  code: string | null;
  name: string;
  description: string | null;
  purpose: string | null;
  adminState: ObjectiveAdminState;
  periodStart: string;
  periodEnd: string;
  evaluationRule: ObjectiveRule;
  parentObjectiveId: string | null;
  ownerPositionId: string | null;
  ownerPositionName: string | null;
  ownerHolderName: string | null;
  ownerProfileName: string | null;
  closedAt: string | null;
  createdAt: string;
  indicatorCount: number;
  indicatorsComplying: number;
  indicatorsAttention: number;
  indicatorsNotMet: number;
  indicatorsWithoutData: number;
  indicatorsPendingMeasurement: number;
  processNames: string;
  processCount: number;
  performance: ObjectivePerformance;
  performanceExplanation: string;
};

function mapObjective(r: Record<string, unknown>): ObjectiveRow {
  return {
    objectiveId: r.objective_id as string,
    code: (r.code as string | null) ?? null,
    name: r.name as string,
    description: (r.description as string | null) ?? null,
    purpose: (r.purpose as string | null) ?? null,
    adminState: r.admin_state as ObjectiveAdminState,
    periodStart: r.period_start as string,
    periodEnd: r.period_end as string,
    evaluationRule: r.evaluation_rule as ObjectiveRule,
    parentObjectiveId: (r.parent_objective_id as string | null) ?? null,
    ownerPositionId: (r.owner_position_id as string | null) ?? null,
    ownerPositionName: (r.owner_position_name as string | null) ?? null,
    ownerHolderName: (r.owner_holder_name as string | null) ?? null,
    ownerProfileName: (r.owner_profile_name as string | null) ?? null,
    closedAt: (r.closed_at as string | null) ?? null,
    createdAt: r.created_at as string,
    indicatorCount: Number(r.indicator_count ?? 0),
    indicatorsComplying: Number(r.indicators_complying ?? 0),
    indicatorsAttention: Number(r.indicators_attention ?? 0),
    indicatorsNotMet: Number(r.indicators_not_met ?? 0),
    indicatorsWithoutData: Number(r.indicators_without_data ?? 0),
    indicatorsPendingMeasurement: Number(r.indicators_pending_measurement ?? 0),
    processNames: (r.process_names as string | null) ?? "",
    processCount: Number(r.process_count ?? 0),
    performance: r.performance as ObjectivePerformance,
    performanceExplanation: (r.performance_explanation as string | null) ?? "",
  };
}

export async function listObjectives(organizationId: string): Promise<ObjectiveRow[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("v_quality_objective_performance")
    .select("*")
    .eq("organization_id", organizationId)
    .order("period_start", { ascending: false })
    .order("name", { ascending: true });
  if (error || !data) {
    reportQueryFailure("listObjectives", error);
    return [];
  }
  return (data as unknown as Record<string, unknown>[]).map(mapObjective);
}

export async function getObjective(
  organizationId: string, objectiveId: string
): Promise<ObjectiveRow | null> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("v_quality_objective_performance")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("objective_id", objectiveId)
    .maybeSingle();
  return data ? mapObjective(data as unknown as Record<string, unknown>) : null;
}

export async function listObjectiveProcessIds(
  organizationId: string, objectiveId: string
): Promise<string[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("quality_objective_processes")
    .select("process_id")
    .eq("organization_id", organizationId)
    .eq("objective_id", objectiveId);
  return ((data ?? []) as { process_id: string }[]).map((r) => r.process_id);
}

export async function listObjectiveIndicatorIds(
  organizationId: string, objectiveId: string
): Promise<string[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("quality_objective_indicators")
    .select("indicator_id")
    .eq("organization_id", organizationId)
    .eq("objective_id", objectiveId);
  return ((data ?? []) as { indicator_id: string }[]).map((r) => r.indicator_id);
}

export async function insertObjective(
  organizationId: string,
  payload: {
    code: string | null; name: string; description: string | null; purpose: string | null;
    periodStart: string; periodEnd: string; ownerPositionId: string | null;
    evaluationRule: ObjectiveRule;
  }
): Promise<{ id: string | null; error: string | null }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("quality_objectives")
    .insert({
      organization_id: organizationId,
      code: payload.code, name: payload.name, description: payload.description,
      purpose: payload.purpose, period_start: payload.periodStart, period_end: payload.periodEnd,
      owner_position_id: payload.ownerPositionId, evaluation_rule: payload.evaluationRule,
      admin_state: "active",
    })
    .select("id")
    .single();
  if (error || !data) {
    reportQueryFailure("insertObjective", error);
    const duplicate = (error as { code?: string } | null)?.code === "23505";
    return {
      id: null,
      error: duplicate
        ? "Ya existe un objetivo con ese código."
        : "No fue posible crear el objetivo.",
    };
  }
  return { id: data.id as string, error: null };
}

export async function updateObjective(
  organizationId: string, objectiveId: string,
  patch: Record<string, unknown>
): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("quality_objectives")
    .update(patch)
    .eq("organization_id", organizationId)
    .eq("id", objectiveId)
    .select("id");
  if (error) return { error: rpcError(error, "No fue posible guardar el objetivo.") };
  if ((data ?? []).length === 0) return { error: "Tu rol no permite editar este objetivo." };
  return { error: null };
}

export async function setObjectiveProcesses(
  organizationId: string, objectiveId: string, processIds: string[]
): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { error: delError } = await supabase
    .from("quality_objective_processes")
    .delete()
    .eq("organization_id", organizationId)
    .eq("objective_id", objectiveId);
  if (delError) return { error: "No fue posible actualizar los procesos del objetivo." };
  if (processIds.length === 0) return { error: null };
  const { error } = await supabase.from("quality_objective_processes").insert(
    processIds.map((processId) => ({
      organization_id: organizationId, objective_id: objectiveId, process_id: processId,
    }))
  );
  if (error) return { error: "No fue posible asociar los procesos." };
  return { error: null };
}

export async function setObjectiveIndicators(
  organizationId: string, objectiveId: string, indicatorIds: string[]
): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { error: delError } = await supabase
    .from("quality_objective_indicators")
    .delete()
    .eq("organization_id", organizationId)
    .eq("objective_id", objectiveId);
  if (delError) return { error: "No fue posible actualizar los indicadores del objetivo." };
  if (indicatorIds.length === 0) return { error: null };
  const { error } = await supabase.from("quality_objective_indicators").insert(
    indicatorIds.map((indicatorId) => ({
      organization_id: organizationId, objective_id: objectiveId, indicator_id: indicatorId,
    }))
  );
  if (error) return { error: "No fue posible asociar los indicadores." };
  return { error: null };
}

// ---------------------------------------------------------------------------
// Indicadores
// ---------------------------------------------------------------------------
export type IndicatorRow = {
  indicatorId: string;
  code: string | null;
  name: string;
  description: string | null;
  scopeType: ScopeType;
  scopeProcessId: string | null;
  scopeProcessName: string | null;
  adminState: IndicatorAdminState;
  retiredAt: string | null;
  successorIndicatorId: string | null;
  ownerPositionId: string | null;
  ownerPositionName: string | null;
  ownerHolderName: string | null;
  ownerProfileName: string | null;
  createdAt: string;

  configId: string | null;
  configVersion: number | null;
  configEffectiveFrom: string | null;
  unitCode: string | null;
  unitLabel: string | null;
  direction: Direction | null;
  frequency: Frequency | null;
  targetValue: number | null;
  targetMin: number | null;
  targetMax: number | null;
  warningValue: number | null;
  warningMin: number | null;
  warningMax: number | null;
  sourceKind: SourceKind | null;
  sourceKey: string | null;
  formulaText: string | null;
  calcDefinition: CalcDefinition | null;
  comparabilityBreak: boolean;

  lastPeriodLabel: string | null;
  lastPeriodStart: string | null;
  lastValue: number | null;
  lastDataState: DataState | null;
  lastDataQuality: DataQuality | null;
  lastEvaluation: Evaluation | null;
  lastEvaluationExplanation: string | null;
  lastResultState: string | null;
  lastMeasuredAt: string | null;

  duePeriodLabel: string | null;
  duePeriodStart: string | null;
  duePeriodEnd: string | null;
  measurementPending: boolean;
  currentPeriodLabel: string | null;
  nextMeasurementDueOn: string | null;
  measurementCount: number;
};

function num(v: unknown): number | null {
  return v === null || v === undefined ? null : Number(v);
}

function mapIndicator(r: Record<string, unknown>): IndicatorRow {
  return {
    indicatorId: r.indicator_id as string,
    code: (r.code as string | null) ?? null,
    name: r.name as string,
    description: (r.description as string | null) ?? null,
    scopeType: (r.scope_type as ScopeType) ?? "organization",
    scopeProcessId: (r.scope_process_id as string | null) ?? null,
    scopeProcessName: (r.scope_process_name as string | null) ?? null,
    adminState: r.admin_state as IndicatorAdminState,
    retiredAt: (r.retired_at as string | null) ?? null,
    successorIndicatorId: (r.successor_indicator_id as string | null) ?? null,
    ownerPositionId: (r.owner_position_id as string | null) ?? null,
    ownerPositionName: (r.owner_position_name as string | null) ?? null,
    ownerHolderName: (r.owner_holder_name as string | null) ?? null,
    ownerProfileName: (r.owner_profile_name as string | null) ?? null,
    createdAt: r.created_at as string,

    configId: (r.config_id as string | null) ?? null,
    configVersion: num(r.config_version),
    configEffectiveFrom: (r.config_effective_from as string | null) ?? null,
    unitCode: (r.unit_code as string | null) ?? null,
    unitLabel: (r.unit_label as string | null) ?? null,
    direction: (r.direction as Direction | null) ?? null,
    frequency: (r.frequency as Frequency | null) ?? null,
    targetValue: num(r.target_value),
    targetMin: num(r.target_min),
    targetMax: num(r.target_max),
    warningValue: num(r.warning_value),
    warningMin: num(r.warning_min),
    warningMax: num(r.warning_max),
    sourceKind: (r.source_kind as SourceKind | null) ?? null,
    sourceKey: (r.source_key as string | null) ?? null,
    formulaText: (r.formula_text as string | null) ?? null,
    calcDefinition: (r.calc_definition as CalcDefinition | null) ?? null,
    comparabilityBreak: Boolean(r.comparability_break),

    lastPeriodLabel: (r.last_period_label as string | null) ?? null,
    lastPeriodStart: (r.last_period_start as string | null) ?? null,
    lastValue: num(r.last_value),
    lastDataState: (r.last_data_state as DataState | null) ?? null,
    lastDataQuality: (r.last_data_quality as DataQuality | null) ?? null,
    lastEvaluation: (r.last_evaluation as Evaluation | null) ?? null,
    lastEvaluationExplanation: (r.last_evaluation_explanation as string | null) ?? null,
    lastResultState: (r.last_result_state as string | null) ?? null,
    lastMeasuredAt: (r.last_measured_at as string | null) ?? null,

    duePeriodLabel: (r.due_period_label as string | null) ?? null,
    duePeriodStart: (r.due_period_start as string | null) ?? null,
    duePeriodEnd: (r.due_period_end as string | null) ?? null,
    measurementPending: Boolean(r.measurement_pending),
    currentPeriodLabel: (r.current_period_label as string | null) ?? null,
    nextMeasurementDueOn: (r.next_measurement_due_on as string | null) ?? null,
    measurementCount: Number(r.measurement_count ?? 0),
  };
}

export async function listIndicators(organizationId: string): Promise<IndicatorRow[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("v_quality_indicator_status")
    .select("*")
    .eq("organization_id", organizationId)
    .order("name", { ascending: true });
  if (error || !data) {
    reportQueryFailure("listIndicators", error);
    return [];
  }
  return (data as unknown as Record<string, unknown>[]).map(mapIndicator);
}

export async function getIndicator(
  organizationId: string, indicatorId: string
): Promise<IndicatorRow | null> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("v_quality_indicator_status")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("indicator_id", indicatorId)
    .maybeSingle();
  return data ? mapIndicator(data as unknown as Record<string, unknown>) : null;
}

export async function listIndicatorsForObjective(
  organizationId: string, indicatorIds: string[]
): Promise<IndicatorRow[]> {
  if (indicatorIds.length === 0) return [];
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("v_quality_indicator_status")
    .select("*")
    .eq("organization_id", organizationId)
    .in("indicator_id", indicatorIds)
    .order("name", { ascending: true });
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(mapIndicator);
}

export async function insertIndicator(
  organizationId: string,
  payload: {
    code: string | null; name: string; description: string | null;
    scopeType: ScopeType; scopeProcessId: string | null; ownerPositionId: string | null;
  }
): Promise<{ id: string | null; error: string | null }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("quality_indicators")
    .insert({
      organization_id: organizationId,
      code: payload.code, name: payload.name, description: payload.description,
      scope_type: payload.scopeType, scope_process_id: payload.scopeProcessId,
      owner_position_id: payload.ownerPositionId, admin_state: "active",
    })
    .select("id")
    .single();
  if (error || !data) {
    reportQueryFailure("insertIndicator", error);
    const duplicate = (error as { code?: string } | null)?.code === "23505";
    return {
      id: null,
      error: duplicate ? "Ya existe un indicador con ese código." : "No fue posible crear el indicador.",
    };
  }
  return { id: data.id as string, error: null };
}

export async function updateIndicator(
  organizationId: string, indicatorId: string, patch: Record<string, unknown>
): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("quality_indicators")
    .update(patch)
    .eq("organization_id", organizationId)
    .eq("id", indicatorId)
    .select("id");
  if (error) return { error: rpcError(error, "No fue posible guardar el indicador.") };
  if ((data ?? []).length === 0) return { error: "Tu rol no permite editar este indicador." };
  return { error: null };
}

// ---------------------------------------------------------------------------
// Configuraciones e historial
// ---------------------------------------------------------------------------
export type ConfigRow = {
  id: string;
  versionNumber: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  unitCode: string;
  unitLabel: string | null;
  direction: Direction;
  frequency: Frequency;
  targetValue: number | null;
  targetMin: number | null;
  targetMax: number | null;
  warningValue: number | null;
  warningMin: number | null;
  warningMax: number | null;
  sourceKind: SourceKind;
  sourceKey: string | null;
  formulaText: string | null;
  calcDefinition: CalcDefinition | null;
  comparabilityBreak: boolean;
  comparabilityNote: string | null;
  changeNote: string | null;
  createdAt: string;
};

export async function listIndicatorConfigs(
  organizationId: string, indicatorId: string
): Promise<ConfigRow[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("quality_indicator_configs")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("indicator_id", indicatorId)
    .order("version_number", { ascending: false });
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    versionNumber: Number(r.version_number),
    effectiveFrom: r.effective_from as string,
    effectiveTo: (r.effective_to as string | null) ?? null,
    unitCode: r.unit_code as string,
    unitLabel: (r.unit_label as string | null) ?? null,
    direction: r.direction as Direction,
    frequency: r.frequency as Frequency,
    targetValue: num(r.target_value),
    targetMin: num(r.target_min),
    targetMax: num(r.target_max),
    warningValue: num(r.warning_value),
    warningMin: num(r.warning_min),
    warningMax: num(r.warning_max),
    sourceKind: r.source_kind as SourceKind,
    sourceKey: (r.source_key as string | null) ?? null,
    formulaText: (r.formula_text as string | null) ?? null,
    calcDefinition: (r.calc_definition as CalcDefinition | null) ?? null,
    comparabilityBreak: Boolean(r.comparability_break),
    comparabilityNote: (r.comparability_note as string | null) ?? null,
    changeNote: (r.change_note as string | null) ?? null,
    createdAt: r.created_at as string,
  }));
}

export type MeasurementRow = {
  id: string;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  value: number | null;
  dataState: DataState;
  dataQuality: DataQuality;
  sourceKind: SourceKind;
  sourceKey: string | null;
  sourceDetail: Record<string, unknown> | null;
  inputComponents: Record<string, unknown> | null;
  evaluation: Evaluation;
  evaluationExplanation: string | null;
  resultState: string;
  measuredAt: string;
  isCurrent: boolean;
  correctionReason: string | null;
  correctsMeasurementId: string | null;
  createdByName: string | null;
  /** Meta que REGÍA en ese periodo, no la de hoy (OI-07). */
  appliedTargetValue: number | null;
  appliedTargetMin: number | null;
  appliedTargetMax: number | null;
  appliedDirection: Direction;
  appliedUnitCode: string;
  appliedUnitLabel: string | null;
};

export async function listMeasurements(
  organizationId: string, indicatorId: string, opts: { includeSuperseded?: boolean } = {}
): Promise<MeasurementRow[]> {
  const supabase = await createServerClient();
  let query = supabase
    .from("quality_measurements")
    .select(
      "id, period_label, period_start, period_end, value, data_state, data_quality, " +
        "source_kind, source_key, source_detail, input_components, evaluation, " +
        "evaluation_explanation, result_state, measured_at, is_current, correction_reason, " +
        "corrects_measurement_id, " +
        "author:profiles!quality_measurements_created_by_fkey(full_name, email), " +
        "config:quality_indicator_configs!quality_measurements_config_fk(" +
        "target_value, target_min, target_max, direction, unit_code, unit_label)"
    )
    .eq("organization_id", organizationId)
    .eq("indicator_id", indicatorId)
    .order("period_start", { ascending: true });
  if (!opts.includeSuperseded) query = query.eq("is_current", true);

  const { data, error } = await query;
  if (error || !data) {
    reportQueryFailure("listMeasurements", error);
    return [];
  }
  return (data as unknown as Record<string, unknown>[]).map((r) => {
    const author = (r.author ?? null) as { full_name?: string | null; email?: string | null } | null;
    const cfg = (r.config ?? null) as Record<string, unknown> | null;
    return {
      id: r.id as string,
      periodLabel: r.period_label as string,
      periodStart: r.period_start as string,
      periodEnd: r.period_end as string,
      value: num(r.value),
      dataState: r.data_state as DataState,
      dataQuality: r.data_quality as DataQuality,
      sourceKind: r.source_kind as SourceKind,
      sourceKey: (r.source_key as string | null) ?? null,
      sourceDetail: (r.source_detail as Record<string, unknown> | null) ?? null,
      inputComponents: (r.input_components as Record<string, unknown> | null) ?? null,
      evaluation: r.evaluation as Evaluation,
      evaluationExplanation: (r.evaluation_explanation as string | null) ?? null,
      resultState: r.result_state as string,
      measuredAt: r.measured_at as string,
      isCurrent: Boolean(r.is_current),
      correctionReason: (r.correction_reason as string | null) ?? null,
      correctsMeasurementId: (r.corrects_measurement_id as string | null) ?? null,
      createdByName: author?.full_name ?? author?.email ?? null,
      appliedTargetValue: num(cfg?.target_value),
      appliedTargetMin: num(cfg?.target_min),
      appliedTargetMax: num(cfg?.target_max),
      appliedDirection: (cfg?.direction as Direction) ?? "higher_is_better",
      appliedUnitCode: (cfg?.unit_code as string) ?? "count",
      appliedUnitLabel: (cfg?.unit_label as string | null) ?? null,
    };
  });
}

export type PeriodClosureRow = {
  id: string;
  label: string;
  periodStart: string;
  periodEnd: string;
  note: string | null;
  closedAt: string;
  closedByName: string | null;
  reopenedAt: string | null;
  reopenReason: string | null;
};

export async function listPeriodClosures(organizationId: string): Promise<PeriodClosureRow[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("quality_period_closures")
    .select(
      "id, label, period_start, period_end, note, closed_at, reopened_at, reopen_reason, " +
        "closer:profiles!quality_period_closures_closed_by_fkey(full_name, email)"
    )
    .eq("organization_id", organizationId)
    .order("period_start", { ascending: false });
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => {
    const closer = (r.closer ?? null) as { full_name?: string | null; email?: string | null } | null;
    return {
      id: r.id as string,
      label: r.label as string,
      periodStart: r.period_start as string,
      periodEnd: r.period_end as string,
      note: (r.note as string | null) ?? null,
      closedAt: r.closed_at as string,
      closedByName: closer?.full_name ?? closer?.email ?? null,
      reopenedAt: (r.reopened_at as string | null) ?? null,
      reopenReason: (r.reopen_reason as string | null) ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// RPC — la única vía de escritura del motor de medición
// ---------------------------------------------------------------------------

export async function publishIndicatorConfig(input: {
  indicatorId: string; effectiveFrom: string; unitCode: string; direction: Direction;
  frequency: Frequency; targetValue: number | null; targetMin: number | null;
  targetMax: number | null; warningValue: number | null; warningMin: number | null;
  warningMax: number | null; sourceKind: SourceKind; sourceKey: string | null;
  calcDefinition: CalcDefinition | null; formulaText: string | null; unitLabel: string | null;
  sourceNote: string | null; comparabilityBreak: boolean; comparabilityNote: string | null;
  changeNote: string | null;
}): Promise<{ configId: string | null; error: string | null }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("quality_publish_indicator_config", {
    p_indicator_id: input.indicatorId,
    p_effective_from: input.effectiveFrom,
    p_unit_code: input.unitCode,
    p_direction: input.direction,
    p_frequency: input.frequency,
    p_target_value: input.targetValue,
    p_target_min: input.targetMin,
    p_target_max: input.targetMax,
    p_warning_value: input.warningValue,
    p_warning_min: input.warningMin,
    p_warning_max: input.warningMax,
    p_source_kind: input.sourceKind,
    p_source_key: input.sourceKey,
    p_calc_definition: input.calcDefinition,
    p_formula_text: input.formulaText,
    p_unit_label: input.unitLabel,
    p_source_note: input.sourceNote,
    p_consolidation: "none",
    p_comparability_break: input.comparabilityBreak,
    p_comparability_note: input.comparabilityNote,
    p_change_note: input.changeNote,
  });
  if (error || !data) {
    return { configId: null, error: rpcError(error, "No fue posible guardar la configuración.") };
  }
  return { configId: data as string, error: null };
}

export async function recordMeasurement(input: {
  indicatorId: string; periodStart: string; periodEnd: string;
  value: number | null; dataState: DataState;
  components: Record<string, number> | null; note: string | null;
}): Promise<{ measurementId: string | null; error: string | null }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("quality_record_measurement", {
    p_indicator_id: input.indicatorId,
    p_period_start: input.periodStart,
    p_period_end: input.periodEnd,
    p_value: input.value,
    p_data_state: input.dataState,
    p_components: input.components,
    p_note: input.note,
  });
  if (error || !data) {
    return { measurementId: null, error: rpcError(error, "No fue posible registrar la medición.") };
  }
  return { measurementId: data as string, error: null };
}

export async function runIndicatorCalculation(
  indicatorId: string, periodStart: string, periodEnd: string
): Promise<{ measurementId: string | null; error: string | null }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("quality_run_indicator_calculation", {
    p_indicator_id: indicatorId, p_period_start: periodStart, p_period_end: periodEnd,
  });
  if (error || !data) {
    return { measurementId: null, error: rpcError(error, "No fue posible calcular el indicador.") };
  }
  return { measurementId: data as string, error: null };
}

export async function correctMeasurement(input: {
  measurementId: string; value: number | null; dataState: DataState;
  reason: string; components: Record<string, number> | null;
}): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("quality_correct_measurement", {
    p_measurement_id: input.measurementId,
    p_value: input.value,
    p_data_state: input.dataState,
    p_reason: input.reason,
    p_components: input.components,
  });
  if (error) return { error: rpcError(error, "No fue posible corregir la medición.") };
  return { error: null };
}

export async function scanPendingMeasurements(
  organizationId: string
): Promise<{ count: number; error: string | null }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("quality_scan_pending_measurements", {
    p_organization_id: organizationId,
  });
  if (error) return { count: 0, error: rpcError(error, "No fue posible revisar las mediciones pendientes.") };
  return { count: Number(data ?? 0), error: null };
}

export async function closePeriod(input: {
  organizationId: string; label: string; periodStart: string; periodEnd: string; note: string | null;
}): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("quality_close_period", {
    p_organization_id: input.organizationId,
    p_label: input.label,
    p_period_start: input.periodStart,
    p_period_end: input.periodEnd,
    p_note: input.note,
  });
  if (error) return { error: rpcError(error, "No fue posible cerrar el periodo.") };
  return { error: null };
}

export async function reopenPeriod(closureId: string, reason: string): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("quality_reopen_period", {
    p_closure_id: closureId, p_reason: reason,
  });
  if (error) return { error: rpcError(error, "No fue posible reabrir el periodo.") };
  return { error: null };
}

/** El periodo que corresponde medir ahora, resuelto por la base para que la
 *  pantalla y el motor no puedan discrepar sobre qué es «enero». */
export async function previousPeriod(
  frequency: Frequency
): Promise<{ periodStart: string; periodEnd: string; periodLabel: string } | null> {
  const supabase = await createServerClient();
  const { data } = await supabase.rpc("quality_previous_period", {
    p_frequency: frequency, p_ref: new Date().toISOString().slice(0, 10),
  });
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  const r = row as Record<string, unknown>;
  return {
    periodStart: r.period_start as string,
    periodEnd: r.period_end as string,
    periodLabel: r.period_label as string,
  };
}
