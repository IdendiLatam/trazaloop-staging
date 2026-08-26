export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-06 · Ficha de una persona.

import { notFound } from "next/navigation";
import { requireQualityModule } from "@/lib/auth/require-quality-module";
import {
  getOffboardingReport, getPersonFile, listCompetencies, listCompetencyLevels, todayIso,
} from "@/lib/db/quality-people";
import { listQualityPositions } from "@/lib/db/quality-processes";
import { canManagePeople } from "@/lib/domain/quality-people";
import { PersonFileView } from "@/components/domain/quality/people/person-file";

export const metadata = { title: "Ficha de persona" };

export default async function QualityPersonPage(
  { params }: { params: Promise<{ personId: string }> }
) {
  const { personId } = await params;
  const org = await requireQualityModule();

  // Si RLS no entrega la ficha —porque quien mira no puede verla— la respuesta
  // es la misma que si no existiera. No se distingue «no puedes» de «no hay».
  const file = await getPersonFile(org.organizationId, personId);
  if (!file) notFound();

  const canManage = canManagePeople(org.roleCode);
  const [positions, competencies, levels, offboarding] = await Promise.all([
    listQualityPositions(org.organizationId),
    listCompetencies(org.organizationId),
    listCompetencyLevels(org.organizationId),
    canManage ? getOffboardingReport(org.organizationId, personId) : Promise.resolve(null),
  ]);

  return (
    <div className="max-w-5xl">
      <PersonFileView
        file={file}
        positions={positions.filter((p) => p.isActive).map((p) => ({ id: p.id, name: p.name }))}
        competencies={competencies.filter((c) => c.isActive).map((c) => ({ id: c.id, name: c.name }))}
        levels={levels.map((l) => ({ value: l.value, label: l.label }))}
        offboarding={offboarding}
        canManage={canManage}
        today={todayIso()}
      />
    </div>
  );
}
