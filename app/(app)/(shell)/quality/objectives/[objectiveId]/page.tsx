// Ruta protegida (el guard corre en el layout del namespace /quality).
export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-03 · Ficha de un objetivo.

import { notFound } from "next/navigation";
import { requireQualityModule } from "@/lib/auth/require-quality-module";
import {
  getObjective, listObjectiveProcessIds, listObjectiveIndicatorIds,
  listIndicatorsForObjective, listIndicators, listMeasurements,
} from "@/lib/db/quality-indicators";
import { listQualityPositions, listQualityProcesses } from "@/lib/db/quality-processes";
import {
  canManageObjectives, computeTrend, describeTarget, formatValue,
} from "@/lib/domain/quality-indicators";
import { QualityObjectiveDetail } from "@/components/domain/quality/objective-detail";
import { getDeletionEligibility } from "@/lib/db/lifecycle";

export const metadata = { title: "Objetivo" };

export default async function QualityObjectivePage({
  params,
}: {
  params: Promise<{ objectiveId: string }>;
}) {
  const org = await requireQualityModule();
  const { objectiveId } = await params;

  const objective = await getObjective(org.organizationId, objectiveId);
  if (!objective) notFound();

  const eligibility = await getDeletionEligibility("objective", objectiveId);
  const [processIds, indicatorIds, allProcesses, allIndicators, positions] = await Promise.all([
    listObjectiveProcessIds(org.organizationId, objectiveId),
    listObjectiveIndicatorIds(org.organizationId, objectiveId),
    listQualityProcesses(org.organizationId),
    listIndicators(org.organizationId),
    listQualityPositions(org.organizationId),
  ]);

  const indicators = await listIndicatorsForObjective(org.organizationId, indicatorIds);

  // La tendencia se calcula sobre la serie real de cada indicador: no hay forma
  // honesta de derivarla de la última medición sola.
  const series = await Promise.all(
    indicators.map((i) => listMeasurements(org.organizationId, i.indicatorId))
  );

  return (
    <QualityObjectiveDetail
      model={{
        objectiveId: objective.objectiveId,
        eligibility,
        code: objective.code,
        name: objective.name,
        description: objective.description,
        purpose: objective.purpose,
        adminState: objective.adminState,
        periodStart: objective.periodStart,
        periodEnd: objective.periodEnd,
        evaluationRule: objective.evaluationRule,
        ownerPositionId: objective.ownerPositionId,
        ownerLabel: objective.ownerPositionName
          ? `${objective.ownerPositionName}${objective.ownerHolderName ? ` · ${objective.ownerHolderName}` : " · sin titular"}`
          : (objective.ownerProfileName ?? "Sin responsable"),
        performance: objective.performance,
        performanceExplanation: objective.performanceExplanation,
        processNames: objective.processNames,
        closedAt: objective.closedAt,
        indicators: indicators.map((i, index) => ({
          indicatorId: i.indicatorId,
          code: i.code,
          name: i.name,
          targetLabel: describeTarget({
            direction: i.direction ?? "higher_is_better",
            targetValue: i.targetValue, targetMin: i.targetMin, targetMax: i.targetMax,
            warningValue: i.warningValue, warningMin: i.warningMin, warningMax: i.warningMax,
            unitCode: i.unitCode, unitLabel: i.unitLabel,
          }),
          lastPeriodLabel: i.lastPeriodLabel,
          lastValueLabel: formatValue(i.lastValue, i.unitCode, i.unitLabel, i.lastDataState ?? "reported"),
          lastEvaluation: i.lastEvaluation,
          trend: computeTrend(
            series[index].map((m) => ({
              periodStart: m.periodStart, value: m.value, dataState: m.dataState,
            })),
            i.direction ?? "higher_is_better",
            { targetMin: i.targetMin, targetMax: i.targetMax, targetValue: i.targetValue }
          ),
          measurementPending: i.measurementPending,
          duePeriodLabel: i.duePeriodLabel,
          nextMeasurementDueOn: i.nextMeasurementDueOn,
        })),
        selectedProcessIds: processIds,
        selectedIndicatorIds: indicatorIds,
        allProcesses: allProcesses.map((p) => ({ id: p.id, name: p.name })),
        allIndicators: allIndicators
          .filter((i) => i.adminState !== "retired")
          .map((i) => ({ id: i.indicatorId, name: i.name, code: i.code })),
        positions: positions
          .filter((p) => p.isActive)
          .map((p) => ({ id: p.id, name: p.name, holderName: p.holderName })),
        canManage: canManageObjectives(org.roleCode as never),
      }}
    />
  );
}
