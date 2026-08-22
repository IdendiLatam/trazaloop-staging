// Ruta protegida (el guard corre en el layout del namespace /quality).
export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-03 · Indicadores.

import { requireQualityModule } from "@/lib/auth/require-quality-module";
import { listIndicators, listMeasurements } from "@/lib/db/quality-indicators";
import { listQualityPositions, listQualityProcesses } from "@/lib/db/quality-processes";
import {
  FREQUENCY_LABEL, SCOPE_TYPE_LABEL, SOURCE_KIND_LABEL,
  canManageObjectives, computeTrend, describeTarget, formatValue, nativeSource,
} from "@/lib/domain/quality-indicators";
import { QualityIndicatorsView } from "@/components/domain/quality/indicators-view";

export const metadata = { title: "Indicadores" };

export default async function QualityIndicatorsPage() {
  const org = await requireQualityModule();
  const [indicators, positions, processes] = await Promise.all([
    listIndicators(org.organizationId),
    listQualityPositions(org.organizationId),
    listQualityProcesses(org.organizationId),
  ]);

  const series = await Promise.all(
    indicators.map((i) => listMeasurements(org.organizationId, i.indicatorId))
  );

  return (
    <QualityIndicatorsView
      indicators={indicators.map((i, index) => ({
        indicatorId: i.indicatorId,
        code: i.code,
        name: i.name,
        adminState: i.adminState,
        scopeLabel: i.scopeProcessName ?? SCOPE_TYPE_LABEL[i.scopeType],
        ownerLabel: i.ownerPositionName
          ? `${i.ownerPositionName}${i.ownerHolderName ? ` · ${i.ownerHolderName}` : ""}`
          : (i.ownerProfileName ?? "Sin responsable"),
        targetLabel: describeTarget({
          direction: i.direction ?? "higher_is_better",
          targetValue: i.targetValue, targetMin: i.targetMin, targetMax: i.targetMax,
          warningValue: i.warningValue, warningMin: i.warningMin, warningMax: i.warningMax,
          unitCode: i.unitCode, unitLabel: i.unitLabel,
        }),
        frequencyLabel: i.frequency ? FREQUENCY_LABEL[i.frequency] : "—",
        sourceLabel: i.sourceKind
          ? (nativeSource(i.sourceKey)?.label ?? SOURCE_KIND_LABEL[i.sourceKind].split(" — ")[0])
          : "—",
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
      }))}
      positions={positions
        .filter((p) => p.isActive)
        .map((p) => ({ id: p.id, name: p.name, holderName: p.holderName }))}
      processes={processes.map((p) => ({ id: p.id, name: p.name }))}
      canManage={canManageObjectives(org.roleCode as never)}
      today={new Date().toISOString().slice(0, 10)}
    />
  );
}
