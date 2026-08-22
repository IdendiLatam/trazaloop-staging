// Ruta protegida (el guard corre en el layout del namespace /quality).
export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-03 · Ficha de un indicador.
//
// La página resuelve TODOS los permisos y TODAS las etiquetas en servidor. El
// componente no vuelve a razonar sobre roles ni recalcula evaluaciones: la
// evaluación la escribió la base cuando se registró la medición (OI-22).

import { notFound } from "next/navigation";
import { requireQualityModule } from "@/lib/auth/require-quality-module";
import {
  getIndicator, listIndicatorConfigs, listMeasurements,
} from "@/lib/db/quality-indicators";
import { createServerClient } from "@/lib/supabase/server";
import {
  FREQUENCY_LABEL, SCOPE_TYPE_LABEL, SOURCE_KIND_LABEL,
  canManageObjectives, canRecordMeasurement, computeTrend,
  describeTarget, describeWarning, formatValue, nativeSource,
} from "@/lib/domain/quality-indicators";
import { QualityIndicatorDetail } from "@/components/domain/quality/indicator-detail";

export const metadata = { title: "Indicador" };

/** Los objetivos que este indicador mide, para poder volver a ellos. */
async function listObjectivesUsingIndicator(organizationId: string, indicatorId: string) {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("quality_objective_indicators")
    .select("objective_id, quality_objectives!quality_objective_indicators_objective_fk(name)")
    .eq("organization_id", organizationId)
    .eq("indicator_id", indicatorId);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => {
    const o = (r.quality_objectives ?? null) as { name?: string } | null;
    return { id: r.objective_id as string, name: o?.name ?? "Objetivo" };
  });
}

export default async function QualityIndicatorPage({
  params,
}: {
  params: Promise<{ indicatorId: string }>;
}) {
  const org = await requireQualityModule();
  const { indicatorId } = await params;

  const indicator = await getIndicator(org.organizationId, indicatorId);
  if (!indicator) notFound();

  const [configs, measurements, objectives] = await Promise.all([
    listIndicatorConfigs(org.organizationId, indicatorId),
    listMeasurements(org.organizationId, indicatorId, { includeSuperseded: true }),
    listObjectivesUsingIndicator(org.organizationId, indicatorId),
  ]);

  const current = measurements.filter((m) => m.isCurrent);
  const role = org.roleCode as never;

  const targetShape = {
    direction: indicator.direction ?? ("higher_is_better" as const),
    targetValue: indicator.targetValue, targetMin: indicator.targetMin, targetMax: indicator.targetMax,
    warningValue: indicator.warningValue, warningMin: indicator.warningMin, warningMax: indicator.warningMax,
    unitCode: indicator.unitCode, unitLabel: indicator.unitLabel,
  };

  return (
    <QualityIndicatorDetail
      model={{
        indicatorId: indicator.indicatorId,
        code: indicator.code,
        name: indicator.name,
        description: indicator.description,
        adminState: indicator.adminState,
        scopeLabel: indicator.scopeProcessName ?? SCOPE_TYPE_LABEL[indicator.scopeType],
        ownerLabel: indicator.ownerPositionName
          ? `${indicator.ownerPositionName}${indicator.ownerHolderName ? ` · ${indicator.ownerHolderName}` : " · sin titular"}`
          : (indicator.ownerProfileName ?? "Sin responsable"),
        unitCode: indicator.unitCode,
        unitLabel: indicator.unitLabel,
        direction: indicator.direction,
        frequency: indicator.frequency,
        targetLabel: describeTarget(targetShape),
        warningLabel: describeWarning(targetShape),
        sourceKind: indicator.sourceKind,
        sourceKey: indicator.sourceKey,
        nativeSource: nativeSource(indicator.sourceKey),
        formulaText: indicator.formulaText,
        calcDefinition: indicator.calcDefinition,
        targetValue: indicator.targetValue,
        targetMin: indicator.targetMin,
        targetMax: indicator.targetMax,

        lastPeriodLabel: indicator.lastPeriodLabel,
        lastValueLabel: formatValue(
          indicator.lastValue, indicator.unitCode, indicator.unitLabel,
          indicator.lastDataState ?? "reported"
        ),
        lastEvaluation: indicator.lastEvaluation,
        lastEvaluationExplanation: indicator.lastEvaluationExplanation,
        lastMeasuredAt: indicator.lastMeasuredAt,
        trend: computeTrend(
          current.map((m) => ({ periodStart: m.periodStart, value: m.value, dataState: m.dataState })),
          indicator.direction ?? "higher_is_better",
          { targetMin: indicator.targetMin, targetMax: indicator.targetMax, targetValue: indicator.targetValue }
        ),

        measurementPending: indicator.measurementPending,
        duePeriodLabel: indicator.duePeriodLabel,
        duePeriodStart: indicator.duePeriodStart,
        duePeriodEnd: indicator.duePeriodEnd,
        currentPeriodLabel: indicator.currentPeriodLabel,
        nextMeasurementDueOn: indicator.nextMeasurementDueOn,

        chart: current.map((m) => ({
          periodLabel: m.periodLabel, value: m.value, evaluation: m.evaluation,
        })),

        measurements: measurements
          .slice()
          .sort((a, b) => b.periodStart.localeCompare(a.periodStart))
          .map((m) => ({
            id: m.id,
            periodLabel: m.periodLabel,
            valueLabel: formatValue(m.value, m.appliedUnitCode, m.appliedUnitLabel, m.dataState),
            dataState: m.dataState,
            dataQuality: m.dataQuality,
            evaluation: m.evaluation,
            evaluationExplanation: m.evaluationExplanation,
            // La meta que REGÍA en ese periodo (OI-07), no la de hoy.
            appliedTargetLabel: describeTarget({
              direction: m.appliedDirection,
              targetValue: m.appliedTargetValue,
              targetMin: m.appliedTargetMin,
              targetMax: m.appliedTargetMax,
              warningValue: null, warningMin: null, warningMax: null,
              unitCode: m.appliedUnitCode, unitLabel: m.appliedUnitLabel,
            }),
            sourceKind: m.sourceKind,
            measuredAt: m.measuredAt,
            resultState: m.resultState,
            isCurrent: m.isCurrent,
            correctionReason: m.correctionReason,
            createdByName: m.createdByName,
            componentsLabel: m.inputComponents
              ? Object.entries(m.inputComponents).map(([k, v]) => `${k}: ${v}`).join(" · ")
              : null,
            // Linaje de una medición automática (OI-10), en lenguaje llano.
            lineageLabel: m.sourceDetail
              ? Object.entries(m.sourceDetail)
                  .filter(([k]) => !["as_of", "nature"].includes(k))
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(" · ") || null
              : null,
          })),

        configs: configs.map((c) => ({
          id: c.id,
          versionNumber: c.versionNumber,
          effectiveFrom: c.effectiveFrom,
          effectiveTo: c.effectiveTo,
          targetLabel: describeTarget({
            direction: c.direction, targetValue: c.targetValue,
            targetMin: c.targetMin, targetMax: c.targetMax,
            warningValue: c.warningValue, warningMin: c.warningMin, warningMax: c.warningMax,
            unitCode: c.unitCode, unitLabel: c.unitLabel,
          }),
          warningLabel: describeWarning({
            direction: c.direction, targetValue: c.targetValue,
            targetMin: c.targetMin, targetMax: c.targetMax,
            warningValue: c.warningValue, warningMin: c.warningMin, warningMax: c.warningMax,
            unitCode: c.unitCode, unitLabel: c.unitLabel,
          }),
          frequency: c.frequency,
          directionLabel: c.direction,
          sourceLabel: nativeSource(c.sourceKey)?.label
            ?? SOURCE_KIND_LABEL[c.sourceKind].split(" — ")[0],
          changeNote: c.changeNote,
          comparabilityBreak: c.comparabilityBreak,
        })),

        objectives,
        canManage: canManageObjectives(role),
        canRecord: canRecordMeasurement(role),
      }}
    />
  );
}
