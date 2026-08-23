"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireQualityForAction } from "@/lib/auth/require-quality-module";
import { checkQualityCanMutate } from "@/server/actions/module-plans";
import {
  insertObjective, updateObjective, setObjectiveProcesses, setObjectiveIndicators,
  insertIndicator, updateIndicator, publishIndicatorConfig,
  recordMeasurement, runIndicatorCalculation, correctMeasurement,
  scanPendingMeasurements, closePeriod, reopenPeriod,
  getIndicator,
  deleteIndicatorRow,
  deleteObjectiveRow,
} from "@/lib/db/quality-indicators";
import {
  canManageObjectives, canRecordMeasurement, canClosePeriod, canReopenPeriod,
  isDirection, isFrequency, isSourceKind, isUnitCode, isCalcOperation,
  validateTargetShape, validateCalcDefinition,
  NATIVE_SOURCE_KEYS, OBJECTIVE_RULES, SELECTABLE_SCOPE_TYPES,
  type CalcDefinition, type DataState, type ObjectiveRule, type ScopeType,
} from "@/lib/domain/quality-indicators";

/**
 * Trazaloop Quality · QUALITY-03 · Server actions de objetivos e indicadores.
 *
 * Ninguna de estas acciones es la barrera de seguridad: cada una comprueba lo
 * que puede para dar un mensaje claro, y después la base vuelve a comprobarlo
 * todo por su cuenta (RLS + triggers + RPC SECURITY DEFINER de 0117).
 *
 * En particular, NINGUNA acción envía un resultado calculado ni una
 * evaluación: la evaluación la deriva la base, y el valor de un indicador
 * automático lo produce la base. Aquí solo viajan la orden y sus parámetros.
 */

export type QualityIndicatorActionState = {
  error: string | null;
  success?: boolean;
  message?: string | null;
  objectiveId?: string;
  indicatorId?: string;
};

type GateOk = { organizationId: string; roleCode: string };

async function gate(): Promise<{ ok: GateOk | null; error: string | null }> {
  const access = await requireQualityForAction();
  if (access.org === null) return { ok: null, error: access.error };
  const mutateCheck = await checkQualityCanMutate();
  if (!mutateCheck.allowed) return { ok: null, error: mutateCheck.error };
  return {
    ok: { organizationId: access.org.organizationId, roleCode: access.org.roleCode },
    error: null,
  };
}

function revalidateAll(objectiveId?: string, indicatorId?: string) {
  revalidatePath("/quality");
  revalidatePath("/quality/objectives");
  revalidatePath("/quality/indicators");
  revalidatePath("/quality/tasks");
  if (objectiveId) revalidatePath(`/quality/objectives/${objectiveId}`);
  if (indicatorId) revalidatePath(`/quality/indicators/${indicatorId}`);
}

/** Un campo numérico vacío es AUSENCIA, no cero (OI-21). */
function optionalNumber(formData: FormData, field: string): number | null {
  const raw = String(formData.get(field) ?? "").trim().replace(",", ".");
  if (raw.length === 0) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function text(formData: FormData, field: string): string {
  return String(formData.get(field) ?? "").trim();
}

function optionalText(formData: FormData, field: string): string | null {
  const v = text(formData, field);
  return v.length > 0 ? v : null;
}

// ---------------------------------------------------------------------------
// Objetivos
// ---------------------------------------------------------------------------

export async function createObjectiveAction(
  _prev: QualityIndicatorActionState, formData: FormData
): Promise<QualityIndicatorActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageObjectives(g.ok.roleCode as never)) {
    return { error: "Solo la administración o el área de calidad definen objetivos." };
  }

  const name = text(formData, "name");
  if (name.length === 0) return { error: "Ponle nombre al objetivo." };
  if (name.length > 200) return { error: "El nombre no puede superar 200 caracteres." };

  const periodStart = text(formData, "period_start");
  const periodEnd = text(formData, "period_end");
  if (!periodStart || !periodEnd) return { error: "Indica el periodo del objetivo." };
  if (periodEnd < periodStart) return { error: "El periodo termina antes de empezar." };

  const rawRule = text(formData, "evaluation_rule");
  const evaluationRule: ObjectiveRule =
    (OBJECTIVE_RULES as readonly string[]).includes(rawRule) ? (rawRule as ObjectiveRule) : "worst_indicator";

  const { id, error } = await insertObjective(g.ok.organizationId, {
    code: optionalText(formData, "code"),
    name,
    description: optionalText(formData, "description"),
    purpose: optionalText(formData, "purpose"),
    periodStart, periodEnd,
    ownerPositionId: optionalText(formData, "owner_position_id"),
    evaluationRule,
  });
  if (error || !id) return { error: error ?? "No fue posible crear el objetivo." };

  const processIds = formData.getAll("process_id").map(String).filter((v) => v.length > 0);
  if (processIds.length > 0) {
    await setObjectiveProcesses(g.ok.organizationId, id, processIds);
  }

  revalidateAll(id);
  return { error: null, success: true, objectiveId: id };
}

export async function updateObjectiveAction(
  _prev: QualityIndicatorActionState, formData: FormData
): Promise<QualityIndicatorActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageObjectives(g.ok.roleCode as never)) {
    return { error: "Solo la administración o el área de calidad editan objetivos." };
  }

  const objectiveId = text(formData, "objective_id");
  const name = text(formData, "name");
  if (name.length === 0) return { error: "Ponle nombre al objetivo." };
  const periodStart = text(formData, "period_start");
  const periodEnd = text(formData, "period_end");
  if (periodEnd < periodStart) return { error: "El periodo termina antes de empezar." };

  const rawRule = text(formData, "evaluation_rule");
  const evaluationRule: ObjectiveRule =
    (OBJECTIVE_RULES as readonly string[]).includes(rawRule) ? (rawRule as ObjectiveRule) : "worst_indicator";

  const { error } = await updateObjective(g.ok.organizationId, objectiveId, {
    name,
    code: optionalText(formData, "code"),
    description: optionalText(formData, "description"),
    purpose: optionalText(formData, "purpose"),
    period_start: periodStart,
    period_end: periodEnd,
    owner_position_id: optionalText(formData, "owner_position_id"),
    evaluation_rule: evaluationRule,
  });
  if (error) return { error };

  revalidateAll(objectiveId);
  return { error: null, success: true, message: "Objetivo guardado." };
}

export async function setObjectiveStateAction(
  _prev: QualityIndicatorActionState, formData: FormData
): Promise<QualityIndicatorActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageObjectives(g.ok.roleCode as never)) {
    return { error: "Solo la administración o el área de calidad cambian el estado de un objetivo." };
  }
  const objectiveId = text(formData, "objective_id");
  const state = text(formData, "admin_state");
  if (!["draft", "active", "suspended", "closed", "cancelled"].includes(state)) {
    return { error: "Estado no válido." };
  }
  const patch: Record<string, unknown> = { admin_state: state };
  if (state === "closed") patch.closure_note = optionalText(formData, "closure_note");

  const { error } = await updateObjective(g.ok.organizationId, objectiveId, patch);
  if (error) return { error };
  revalidateAll(objectiveId);
  return { error: null, success: true, message: "Estado del objetivo actualizado." };
}

export async function setObjectiveProcessesAction(
  _prev: QualityIndicatorActionState, formData: FormData
): Promise<QualityIndicatorActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageObjectives(g.ok.roleCode as never)) {
    return { error: "Solo la administración o el área de calidad relacionan procesos." };
  }
  const objectiveId = text(formData, "objective_id");
  const processIds = formData.getAll("process_id").map(String).filter((v) => v.length > 0);
  const { error } = await setObjectiveProcesses(g.ok.organizationId, objectiveId, processIds);
  if (error) return { error };
  revalidateAll(objectiveId);
  return { error: null, success: true, message: "Procesos relacionados actualizados." };
}

export async function setObjectiveIndicatorsAction(
  _prev: QualityIndicatorActionState, formData: FormData
): Promise<QualityIndicatorActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageObjectives(g.ok.roleCode as never)) {
    return { error: "Solo la administración o el área de calidad asocian indicadores." };
  }
  const objectiveId = text(formData, "objective_id");
  const indicatorIds = formData.getAll("indicator_id").map(String).filter((v) => v.length > 0);
  const { error } = await setObjectiveIndicators(g.ok.organizationId, objectiveId, indicatorIds);
  if (error) return { error };
  revalidateAll(objectiveId);
  return { error: null, success: true, message: "Indicadores del objetivo actualizados." };
}

// ---------------------------------------------------------------------------
// Indicadores
// ---------------------------------------------------------------------------

export async function createIndicatorAction(
  _prev: QualityIndicatorActionState, formData: FormData
): Promise<QualityIndicatorActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageObjectives(g.ok.roleCode as never)) {
    return { error: "Solo la administración o el área de calidad definen indicadores." };
  }

  const name = text(formData, "name");
  if (name.length === 0) return { error: "Ponle nombre al indicador." };

  const rawScope = text(formData, "scope_type");
  const scopeType: ScopeType =
    (SELECTABLE_SCOPE_TYPES as readonly string[]).includes(rawScope) ? (rawScope as ScopeType) : "organization";
  const scopeProcessId = scopeType === "process" ? optionalText(formData, "scope_process_id") : null;
  if (scopeType === "process" && scopeProcessId === null) {
    return { error: "Elige el proceso que mide este indicador." };
  }

  const { id, error } = await insertIndicator(g.ok.organizationId, {
    code: optionalText(formData, "code"),
    name,
    description: optionalText(formData, "description"),
    scopeType, scopeProcessId,
    ownerPositionId: optionalText(formData, "owner_position_id"),
  });
  if (error || !id) return { error: error ?? "No fue posible crear el indicador." };

  // La configuración inicial se publica en el mismo gesto: un indicador sin
  // unidad, periodicidad ni fuente no se puede medir, y dejarlo a medias
  // obligaría a recordar volver.
  const configResult = await publishConfigFromForm(g.ok.organizationId, id, formData, true);
  if (configResult.error) return { error: configResult.error, indicatorId: id };

  const objectiveId = optionalText(formData, "objective_id");
  if (objectiveId) {
    const supabaseIds = formData.getAll("existing_indicator_id").map(String).filter(Boolean);
    await setObjectiveIndicators(g.ok.organizationId, objectiveId, [...supabaseIds, id]);
  }

  revalidateAll(objectiveId ?? undefined, id);
  return { error: null, success: true, indicatorId: id };
}

export async function updateIndicatorAction(
  _prev: QualityIndicatorActionState, formData: FormData
): Promise<QualityIndicatorActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageObjectives(g.ok.roleCode as never)) {
    return { error: "Solo la administración o el área de calidad editan indicadores." };
  }
  const indicatorId = text(formData, "indicator_id");
  const name = text(formData, "name");
  if (name.length === 0) return { error: "Ponle nombre al indicador." };

  const { error } = await updateIndicator(g.ok.organizationId, indicatorId, {
    name,
    code: optionalText(formData, "code"),
    description: optionalText(formData, "description"),
    owner_position_id: optionalText(formData, "owner_position_id"),
  });
  if (error) return { error };
  revalidateAll(undefined, indicatorId);
  return { error: null, success: true, message: "Indicador guardado." };
}

/**
 * Eliminar definitivamente un indicador que todavía es desechable.
 *
 * No decide nada por su cuenta: el disparador BEFORE DELETE de 0119 vuelve a
 * emitir el dictamen en el instante del borrado, así que la ventana entre «se
 * mostró el aviso» y «se confirmó» no puede aprovecharse. Si en ese rato otra
 * persona registró una medición, la base lo rechaza — y el motivo que llega al
 * usuario es el mismo que habría leído antes de confirmar.
 */
export async function deleteIndicatorAction(
  _prev: QualityIndicatorActionState, formData: FormData
): Promise<QualityIndicatorActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageObjectives(g.ok.roleCode as never)) {
    return { error: "Solo la administración o el área de calidad eliminan indicadores." };
  }
  const indicatorId = text(formData, "indicator_id");
  const { error } = await deleteIndicatorRow(g.ok.organizationId, indicatorId);
  if (error) return { error };
  revalidateAll();
  redirect("/quality/indicators");
}

/** Lo mismo para un objetivo todavía en borrador y sin resultados. */
export async function deleteObjectiveAction(
  _prev: QualityIndicatorActionState, formData: FormData
): Promise<QualityIndicatorActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageObjectives(g.ok.roleCode as never)) {
    return { error: "Solo la administración o el área de calidad eliminan objetivos." };
  }
  const objectiveId = text(formData, "objective_id");
  const { error } = await deleteObjectiveRow(g.ok.organizationId, objectiveId);
  if (error) return { error };
  revalidateAll();
  redirect("/quality/objectives");
}

export async function setIndicatorStateAction(
  _prev: QualityIndicatorActionState, formData: FormData
): Promise<QualityIndicatorActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageObjectives(g.ok.roleCode as never)) {
    return { error: "Solo la administración o el área de calidad cambian el estado de un indicador." };
  }
  const indicatorId = text(formData, "indicator_id");
  const state = text(formData, "admin_state");
  if (!["draft", "active", "suspended", "retired"].includes(state)) {
    return { error: "Estado no válido." };
  }
  const patch: Record<string, unknown> = { admin_state: state };
  if (state === "retired") {
    const reason = optionalText(formData, "retirement_reason");
    if (!reason) return { error: "Escribe el motivo del retiro del indicador." };
    patch.retirement_reason = reason;
    const successor = optionalText(formData, "successor_indicator_id");
    if (successor) patch.successor_indicator_id = successor;
  }
  const { error } = await updateIndicator(g.ok.organizationId, indicatorId, patch);
  if (error) return { error };
  revalidateAll(undefined, indicatorId);
  return {
    error: null, success: true,
    message: state === "retired"
      ? "Indicador retirado. Su historial se conserva completo."
      : "Estado del indicador actualizado.",
  };
}

/** Lee del formulario una configuración completa y la publica. */
async function publishConfigFromForm(
  organizationId: string, indicatorId: string, formData: FormData, isInitial: boolean
): Promise<{ error: string | null }> {
  const rawUnit = text(formData, "unit_code");
  const rawDirection = text(formData, "direction");
  const rawFrequency = text(formData, "frequency");
  const rawSourceKind = text(formData, "source_kind");

  if (!isUnitCode(rawUnit)) return { error: "Elige la unidad del indicador." };
  if (!isDirection(rawDirection)) return { error: "Elige la dirección de la meta." };
  if (!isFrequency(rawFrequency)) return { error: "Elige la periodicidad." };
  if (!isSourceKind(rawSourceKind)) return { error: "Elige cómo se alimenta el indicador." };

  const target = {
    direction: rawDirection,
    targetValue: optionalNumber(formData, "target_value"),
    targetMin: optionalNumber(formData, "target_min"),
    targetMax: optionalNumber(formData, "target_max"),
    warningValue: optionalNumber(formData, "warning_value"),
    warningMin: optionalNumber(formData, "warning_min"),
    warningMax: optionalNumber(formData, "warning_max"),
    unitCode: rawUnit,
    unitLabel: optionalText(formData, "unit_label"),
  };
  const shape = validateTargetShape(target);
  if (shape.error) return { error: shape.error };

  let sourceKey: string | null = null;
  let calcDefinition: CalcDefinition | null = null;

  if (rawSourceKind === "native") {
    sourceKey = optionalText(formData, "source_key");
    if (!sourceKey || !NATIVE_SOURCE_KEYS.includes(sourceKey)) {
      return { error: "Elige una fuente automática del catálogo." };
    }
  }
  if (rawSourceKind === "calculated") {
    const operation = text(formData, "calc_operation");
    if (!isCalcOperation(operation)) return { error: "Elige la operación de la fórmula." };
    const keys = formData.getAll("component_key").map(String).map((s) => s.trim());
    const labels = formData.getAll("component_label").map(String).map((s) => s.trim());
    const operands = keys
      .map((key, i) => ({ key, label: labels[i] ?? key }))
      .filter((o) => o.key.length > 0);
    calcDefinition = { operation, operands };
    const valid = validateCalcDefinition(calcDefinition);
    if (valid.error) return { error: valid.error };
  }

  const effectiveFrom = text(formData, "effective_from");
  if (!effectiveFrom) return { error: "Indica desde cuándo rige esta configuración." };

  const { error } = await publishIndicatorConfig({
    indicatorId,
    effectiveFrom,
    unitCode: rawUnit,
    direction: rawDirection,
    frequency: rawFrequency,
    targetValue: target.targetValue,
    targetMin: target.targetMin,
    targetMax: target.targetMax,
    warningValue: target.warningValue,
    warningMin: target.warningMin,
    warningMax: target.warningMax,
    sourceKind: rawSourceKind,
    sourceKey,
    calcDefinition,
    formulaText: optionalText(formData, "formula_text"),
    unitLabel: optionalText(formData, "unit_label"),
    sourceNote: optionalText(formData, "source_note"),
    comparabilityBreak: String(formData.get("comparability_break") ?? "") === "on",
    comparabilityNote: optionalText(formData, "comparability_note"),
    changeNote: isInitial ? "Configuración inicial" : optionalText(formData, "change_note"),
  });
  return { error };
}

export async function publishIndicatorConfigAction(
  _prev: QualityIndicatorActionState, formData: FormData
): Promise<QualityIndicatorActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageObjectives(g.ok.roleCode as never)) {
    return { error: "Solo la administración o el área de calidad configuran un indicador." };
  }
  const indicatorId = text(formData, "indicator_id");
  const { error } = await publishConfigFromForm(g.ok.organizationId, indicatorId, formData, false);
  if (error) return { error };
  revalidateAll(undefined, indicatorId);
  return {
    error: null, success: true,
    message: "Configuración publicada. Las mediciones anteriores conservan la meta que regía en su periodo.",
  };
}

// ---------------------------------------------------------------------------
// Mediciones
// ---------------------------------------------------------------------------

export async function recordMeasurementAction(
  _prev: QualityIndicatorActionState, formData: FormData
): Promise<QualityIndicatorActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canRecordMeasurement(g.ok.roleCode as never)) {
    return { error: "Tu rol no permite registrar mediciones." };
  }

  const indicatorId = text(formData, "indicator_id");
  const periodStart = text(formData, "period_start");
  const periodEnd = text(formData, "period_end");
  if (!periodStart || !periodEnd) return { error: "Indica el periodo que estás midiendo." };

  const rawState = text(formData, "data_state") || "reported";
  if (!["reported", "no_data", "not_applicable"].includes(rawState)) {
    return { error: "Estado del dato no válido." };
  }
  const dataState = rawState as DataState;

  // Los componentes de un indicador calculado viajan como pares; el RESULTADO
  // no viaja nunca: lo calcula la base (§22 del encargo).
  const keys = formData.getAll("component_key").map(String);
  const values = formData.getAll("component_value").map(String);
  const components: Record<string, number> = {};
  keys.forEach((key, i) => {
    const raw = (values[i] ?? "").trim().replace(",", ".");
    if (key.trim().length > 0 && raw.length > 0) {
      const n = Number(raw);
      if (Number.isFinite(n)) components[key.trim()] = n;
    }
  });

  const { error } = await recordMeasurement({
    indicatorId, periodStart, periodEnd,
    value: dataState === "reported" ? optionalNumber(formData, "value") : null,
    dataState,
    components: Object.keys(components).length > 0 ? components : null,
    note: optionalText(formData, "note"),
  });
  if (error) return { error };

  revalidateAll(undefined, indicatorId);
  return { error: null, success: true, message: "Medición registrada y evaluada." };
}

export async function runIndicatorCalculationAction(
  _prev: QualityIndicatorActionState, formData: FormData
): Promise<QualityIndicatorActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canRecordMeasurement(g.ok.roleCode as never)) {
    return { error: "Tu rol no permite calcular mediciones." };
  }
  const indicatorId = text(formData, "indicator_id");
  const periodStart = text(formData, "period_start");
  const periodEnd = text(formData, "period_end");
  if (!periodStart || !periodEnd) {
    // Sin periodo explícito se calcula el último cerrado, que es lo que la
    // pantalla ofrece por defecto.
    const indicator = await getIndicator(g.ok.organizationId, indicatorId);
    if (!indicator?.duePeriodStart || !indicator.duePeriodEnd) {
      return { error: "No hay un periodo que calcular todavía." };
    }
    const { error } = await runIndicatorCalculation(
      indicatorId, indicator.duePeriodStart, indicator.duePeriodEnd
    );
    if (error) return { error };
    revalidateAll(undefined, indicatorId);
    return { error: null, success: true, message: "Indicador calculado desde los datos de Trazaloop." };
  }

  const { error } = await runIndicatorCalculation(indicatorId, periodStart, periodEnd);
  if (error) return { error };
  revalidateAll(undefined, indicatorId);
  return { error: null, success: true, message: "Indicador calculado desde los datos de Trazaloop." };
}

export async function correctMeasurementAction(
  _prev: QualityIndicatorActionState, formData: FormData
): Promise<QualityIndicatorActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canRecordMeasurement(g.ok.roleCode as never)) {
    return { error: "Tu rol no permite corregir mediciones." };
  }
  const measurementId = text(formData, "measurement_id");
  const indicatorId = text(formData, "indicator_id");
  const reason = text(formData, "reason");
  if (reason.length === 0) return { error: "Escribe el motivo de la corrección." };

  const rawState = text(formData, "data_state") || "reported";
  if (!["reported", "no_data", "not_applicable"].includes(rawState)) {
    return { error: "Estado del dato no válido." };
  }

  const { error } = await correctMeasurement({
    measurementId,
    value: rawState === "reported" ? optionalNumber(formData, "value") : null,
    dataState: rawState as DataState,
    reason,
    components: null,
  });
  if (error) return { error };

  revalidateAll(undefined, indicatorId);
  return {
    error: null, success: true,
    message: "Corrección registrada. El valor original se conserva en el historial.",
  };
}

export async function scanPendingMeasurementsAction(
  _prev: QualityIndicatorActionState, _formData: FormData
): Promise<QualityIndicatorActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageObjectives(g.ok.roleCode as never)) {
    return { error: "Solo la administración o el área de calidad revisan las mediciones pendientes." };
  }
  const { count, error } = await scanPendingMeasurements(g.ok.organizationId);
  if (error) return { error };
  revalidateAll();
  return {
    error: null, success: true,
    message: count === 0
      ? "No hay mediciones pendientes."
      : `${count} ${count === 1 ? "indicador tiene" : "indicadores tienen"} su medición pendiente. Se avisó a quien responde.`,
  };
}

// ---------------------------------------------------------------------------
// Cierre de ciclo
// ---------------------------------------------------------------------------

export async function closePeriodAction(
  _prev: QualityIndicatorActionState, formData: FormData
): Promise<QualityIndicatorActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canClosePeriod(g.ok.roleCode as never)) {
    return { error: "Solo la administración o el área de calidad cierran un periodo." };
  }
  const label = text(formData, "label");
  const periodStart = text(formData, "period_start");
  const periodEnd = text(formData, "period_end");
  if (label.length === 0) return { error: "Ponle nombre al periodo que cierras." };
  if (!periodStart || !periodEnd) return { error: "Indica el rango del periodo." };
  if (periodEnd < periodStart) return { error: "El periodo termina antes de empezar." };

  const { error } = await closePeriod({
    organizationId: g.ok.organizationId, label, periodStart, periodEnd,
    note: optionalText(formData, "note"),
  });
  if (error) return { error };
  revalidateAll();
  return {
    error: null, success: true,
    message: "Periodo cerrado. Sus resultados quedan fijos y no se recalculan.",
  };
}

export async function reopenPeriodAction(
  _prev: QualityIndicatorActionState, formData: FormData
): Promise<QualityIndicatorActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canReopenPeriod(g.ok.roleCode as never)) {
    return { error: "Solo un administrador reabre un periodo cerrado." };
  }
  const closureId = text(formData, "closure_id");
  const reason = text(formData, "reason");
  if (reason.length === 0) return { error: "Escribe el motivo de la reapertura." };

  const { error } = await reopenPeriod(closureId, reason);
  if (error) return { error };
  revalidateAll();
  return { error: null, success: true, message: "Periodo reabierto. Queda constancia del motivo." };
}
