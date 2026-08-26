export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-09 · Ficha del programa.

import { notFound } from "next/navigation";
import { requireQualityModule } from "@/lib/auth/require-quality-module";
import { listAudits, listProgramRevisions, listPrograms } from "@/lib/db/quality-audits";
import { canCloseAudits, canManageAudits } from "@/lib/domain/quality-audits";
import { ProgramDetail } from "@/components/domain/quality/audits/program-detail";
import { AuditSubnav } from "@/components/domain/quality/audits/shared";

export const metadata = { title: "Programa" };

export default async function ProgramDetailPage(
  { params }: { params: Promise<{ programId: string }> }
) {
  const { programId } = await params;
  const org = await requireQualityModule();
  const programs = await listPrograms(org.organizationId);
  const program = programs.find((p) => p.id === programId);
  if (!program) notFound();

  const [audits, revisions] = await Promise.all([
    listAudits(org.organizationId, { programId }),
    listProgramRevisions(org.organizationId, programId),
  ]);

  return (
    <div className="max-w-5xl space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">Trazaloop Quality · Programa</p>
        <h1 className="text-2xl font-semibold tracking-tight">{program.name}</h1>
      </header>

      <AuditSubnav current="programs" />

      <ProgramDetail
        program={program}
        audits={audits}
        revisions={revisions}
        canManage={canManageAudits(org.roleCode)}
        canClose={canCloseAudits(org.roleCode)}
      />
    </div>
  );
}
