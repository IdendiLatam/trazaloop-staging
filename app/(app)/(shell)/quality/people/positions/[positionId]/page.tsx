export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-06 · Perfil de un cargo y su historia.

import { notFound } from "next/navigation";
import { requireQualityModule } from "@/lib/auth/require-quality-module";
import {
  listAssignments, listCompetencies, listCompetencyLevels, listPositionVersions, todayIso,
} from "@/lib/db/quality-people";
import { listQualityPositions, listQualityProcesses } from "@/lib/db/quality-processes";
import { canManageStructure } from "@/lib/domain/quality-people";
import { PositionProfileView } from "@/components/domain/quality/people/position-profile";

export const metadata = { title: "Perfil de cargo" };

export default async function QualityPositionProfilePage(
  { params }: { params: Promise<{ positionId: string }> }
) {
  const { positionId } = await params;
  const org = await requireQualityModule();

  const positions = await listQualityPositions(org.organizationId);
  const position = positions.find((p) => p.id === positionId);
  if (!position) notFound();

  const [versions, competencies, levels, processes, assignments] = await Promise.all([
    listPositionVersions(org.organizationId, positionId),
    listCompetencies(org.organizationId),
    listCompetencyLevels(org.organizationId),
    listQualityProcesses(org.organizationId),
    listAssignments(org.organizationId, { positionId }),
  ]);

  // Ocupantes VIGENTES hoy. Los históricos se ven en la ficha de cada persona,
  // que es donde su onboarding sigue teniendo sentido.
  const hoy = todayIso();
  const occupants = assignments
    .filter((a) => a.personId
      && a.effectiveFrom <= hoy
      && (a.effectiveTo === null || a.effectiveTo >= hoy))
    .map((a) => ({
      assignmentId: a.id, personId: a.personId as string,
      personName: a.personName ?? "Persona sin ficha visible",
      assignmentType: a.assignmentType, effectiveFrom: a.effectiveFrom,
    }));

  return (
    <div className="max-w-5xl">
      <PositionProfileView
        position={{ id: position.id, name: position.name, code: position.code }}
        versions={versions}
        occupants={occupants}
        competencies={competencies.filter((c) => c.isActive).map((c) => ({ id: c.id, name: c.name }))}
        levels={levels.map((l) => ({ value: l.value, label: l.label }))}
        processes={processes.map((p) => ({ id: p.id, name: p.name }))}
        canManage={canManageStructure(org.roleCode)}
        today={todayIso()}
      />
    </div>
  );
}
