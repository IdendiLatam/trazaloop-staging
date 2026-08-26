export const dynamic = "force-dynamic";

import { requireQualityModule } from "@/lib/auth/require-quality-module";
import { activeVersion, listMethodologies, listOpportunities, listRisks } from "@/lib/db/risks";
import { listObjectives } from "@/lib/db/quality-indicators";
import { listQualityPositions, listQualityProcesses } from "@/lib/db/quality-processes";
import { canManageRisks } from "@/lib/domain/risks";
import { QualityRisksView } from "@/components/domain/quality/risks-view";

export const metadata = { title: "Riesgos y oportunidades" };

export default async function QualityRisksPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string }>;
}) {
  const org = await requireQualityModule();
  const { vista } = await searchParams;

  const [risks, opportunities, positions, processes, objectives, methodologies] = await Promise.all([
    listRisks(org.organizationId),
    listOpportunities(org.organizationId),
    listQualityPositions(org.organizationId),
    listQualityProcesses(org.organizationId),
    listObjectives(org.organizationId),
    listMethodologies(org.organizationId),
  ]);

  // RO-15 · Se comprueba por separado que haya metodología de riesgos y de
  // oportunidades: tener una no habilita la otra.
  const hasRiskMethodology = methodologies.some((m) => m.appliesTo === "risk" && activeVersion(m) !== null);
  const hasOpportunityMethodology = methodologies.some(
    (m) => m.appliesTo === "opportunity" && activeVersion(m) !== null
  );

  return (
    <div className="max-w-4xl space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">Trazaloop Quality</p>
        <h1 className="text-2xl font-semibold tracking-tight">Riesgos y oportunidades</h1>
        <p className="text-sm text-ink-soft">
          Un riesgo es algo que <strong>podría</strong> pasar y afectaría al sistema de gestión;
          una oportunidad es una posibilidad de mejorar que alguien vio. Identificar un riesgo no
          significa que vaya a ocurrir, y que ocurra no lo convierte en una no conformidad: eso
          se decide después, evaluando el caso.
        </p>
      </header>

      <QualityRisksView
        risks={risks}
        opportunities={opportunities}
        positions={positions.map((p) => ({ id: p.id, name: p.name, holderName: p.holderName }))}
        processes={processes.map((p) => ({ id: p.id, name: p.name }))}
        objectives={objectives
          .filter((o) => o.adminState === "active")
          .map((o) => ({ id: o.objectiveId, name: o.name }))}
        canManage={canManageRisks(org.roleCode)}
        hasRiskMethodology={hasRiskMethodology}
        hasOpportunityMethodology={hasOpportunityMethodology}
        initialTab={vista === "oportunidades" ? "opportunities" : "risks"}
      />
    </div>
  );
}
