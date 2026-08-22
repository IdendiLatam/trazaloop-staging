// Ruta protegida (el guard corre en el layout del namespace /quality).
export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-03 · Objetivos.

import { requireQualityModule } from "@/lib/auth/require-quality-module";
import { listObjectives, listPeriodClosures } from "@/lib/db/quality-indicators";
import { listQualityPositions, listQualityProcesses } from "@/lib/db/quality-processes";
import { canManageObjectives, canClosePeriod, canReopenPeriod } from "@/lib/domain/quality-indicators";
import { QualityObjectivesView } from "@/components/domain/quality/objectives-view";
import { QualityPeriodClosures } from "@/components/domain/quality/period-closures";

export const metadata = { title: "Objetivos" };

export default async function QualityObjectivesPage() {
  const org = await requireQualityModule();
  const [objectives, positions, processes, closures] = await Promise.all([
    listObjectives(org.organizationId),
    listQualityPositions(org.organizationId),
    listQualityProcesses(org.organizationId),
    listPeriodClosures(org.organizationId),
  ]);

  const role = org.roleCode as never;
  const year = new Date().getUTCFullYear();

  return (
    <div className="max-w-5xl space-y-6">
      <QualityObjectivesView
        objectives={objectives.map((o) => ({
          objectiveId: o.objectiveId,
          code: o.code,
          name: o.name,
          adminState: o.adminState,
          periodStart: o.periodStart,
          periodEnd: o.periodEnd,
          // El responsable es el CARGO; la persona se resuelve por asignación.
          ownerLabel:
            o.ownerPositionName
              ? `${o.ownerPositionName}${o.ownerHolderName ? ` · ${o.ownerHolderName}` : " · sin titular"}`
              : (o.ownerProfileName ?? "Sin responsable"),
          indicatorCount: o.indicatorCount,
          indicatorsNotMet: o.indicatorsNotMet,
          indicatorsAttention: o.indicatorsAttention,
          indicatorsPendingMeasurement: o.indicatorsPendingMeasurement,
          processNames: o.processNames,
          performance: o.performance,
          performanceExplanation: o.performanceExplanation,
        }))}
        positions={positions
          .filter((p) => p.isActive)
          .map((p) => ({ id: p.id, name: p.name, holderName: p.holderName }))}
        processes={processes.map((p) => ({ id: p.id, name: p.name }))}
        canManage={canManageObjectives(role)}
        thisYear={{ start: `${year}-01-01`, end: `${year}-12-31` }}
      />

      <QualityPeriodClosures
        closures={closures}
        canClose={canClosePeriod(role)}
        canReopen={canReopenPeriod(role)}
        suggested={{ label: String(year), start: `${year}-01-01`, end: `${year}-12-31` }}
      />
    </div>
  );
}
