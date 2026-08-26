export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-06 · Perfil de un cargo y su historia.

import { notFound } from "next/navigation";
import { requireQualityModule } from "@/lib/auth/require-quality-module";
import {
  listCompetencies, listCompetencyLevels, listPositionVersions, todayIso,
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

  const [versions, competencies, levels, processes] = await Promise.all([
    listPositionVersions(org.organizationId, positionId),
    listCompetencies(org.organizationId),
    listCompetencyLevels(org.organizationId),
    listQualityProcesses(org.organizationId),
  ]);

  return (
    <div className="max-w-5xl">
      <PositionProfileView
        position={{ id: position.id, name: position.name, code: position.code }}
        versions={versions}
        competencies={competencies.filter((c) => c.isActive).map((c) => ({ id: c.id, name: c.name }))}
        levels={levels.map((l) => ({ value: l.value, label: l.label }))}
        processes={processes.map((p) => ({ id: p.id, name: p.name }))}
        canManage={canManageStructure(org.roleCode)}
        today={todayIso()}
      />
    </div>
  );
}
