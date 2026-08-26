export const dynamic = "force-dynamic";

import { requireQualityModule } from "@/lib/auth/require-quality-module";
import { listCases } from "@/lib/db/work-cases";
import { getIndicator } from "@/lib/db/quality-indicators";
import { listQualityPositions, listQualityProcesses } from "@/lib/db/quality-processes";
import { canManageCases } from "@/lib/domain/work-cases";
import { QualityCasesView } from "@/components/domain/quality/cases-view";
import { ExportPdfButton } from "@/components/ui/export-pdf-button";

export const metadata = { title: "Casos y acciones" };

export default async function QualityCasesPage({
  searchParams,
}: {
  searchParams: Promise<{ from_indicator?: string }>;
}) {
  const org = await requireQualityModule();
  const { from_indicator: fromIndicator } = await searchParams;
  const [cases, positions, processes] = await Promise.all([
    listCases(org.organizationId),
    listQualityPositions(org.organizationId),
    listQualityProcesses(org.organizationId),
  ]);

  // SEÑAL → CASO. El caso nacerá REFERENCIANDO el indicador, y el snapshot
  // congela lo que la señal decía HOY: si mañana cambia la meta, el caso sigue
  // explicando por qué se abrió (§58, §59). El dato vivo sigue en el indicador.
  let prefill: {
    refKind: string; refId: string; snapshot: string; originKind: string; label: string;
  } | null = null;
  if (fromIndicator) {
    const indicator = await getIndicator(org.organizationId, fromIndicator);
    if (indicator) {
      prefill = {
        refKind: "quality_indicator",
        refId: indicator.indicatorId,
        originKind: "indicator",
        label: `${indicator.code ? `${indicator.code} · ` : ""}${indicator.name}`,
        snapshot: JSON.stringify({
          label: `${indicator.code ? `${indicator.code} · ` : ""}${indicator.name}`,
          context: [
            indicator.lastPeriodLabel ? `Periodo ${indicator.lastPeriodLabel}` : null,
            indicator.lastValue !== null ? `resultado ${indicator.lastValue}` : null,
            indicator.targetValue !== null ? `meta ${indicator.targetValue}` : null,
            indicator.lastEvaluation === "not_met" ? "no cumple" : indicator.lastEvaluation,
          ].filter(Boolean).join(" · "),
        }),
      };
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <ExportPdfButton exportKey="quality.case.list" />
      </div>
      <QualityCasesView
        cases={cases.map((c) => ({
          caseId: c.caseId, code: c.code, title: c.title,
          caseType: c.caseType, originKind: c.originKind,
          classification: c.classification, status: c.status, priority: c.priority,
          detectedOn: c.detectedOn, processNames: c.processNames,
          ownerLabel: c.ownerPositionName
            ? `${c.ownerPositionName}${c.ownerHolderName ? ` · ${c.ownerHolderName}` : ""}`
            : "",
          openActionCount: c.openActionCount,
          overdueActionCount: c.overdueActionCount,
          pendingEffectivenessCount: c.pendingEffectivenessCount,
        }))}
        positions={positions.filter((p) => p.isActive).map((p) => ({
          id: p.id, name: p.name, holderName: p.holderName,
        }))}
        processes={processes.map((p) => ({ id: p.id, name: p.name }))}
        canManage={canManageCases(org.roleCode)}
        prefill={prefill}
      />
    </div>
  );
}
