export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-06 · Lecciones aprendidas.

import { requireQualityModule } from "@/lib/auth/require-quality-module";
import { listLessons } from "@/lib/db/quality-people";
import { listQualityDocuments } from "@/lib/db/quality-documents";
import { listQualityPositions, listQualityProcesses } from "@/lib/db/quality-processes";
import { canManageStructure } from "@/lib/domain/quality-people";
import { LessonsView } from "@/components/domain/quality/people/lessons";

export const metadata = { title: "Lecciones aprendidas" };

export default async function QualityLessonsPage() {
  const org = await requireQualityModule();
  const [lessons, documents, processes, positions] = await Promise.all([
    listLessons(org.organizationId),
    listQualityDocuments(org.organizationId),
    listQualityProcesses(org.organizationId),
    listQualityPositions(org.organizationId),
  ]);

  return (
    <div className="max-w-5xl space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">Trazaloop Quality</p>
        <h1 className="text-2xl font-semibold tracking-tight">Lecciones aprendidas</h1>
        <p className="text-sm text-ink-soft">
          Qué ocurrió, qué se aprendió, dónde aplica y qué se recomienda cambiar. Una
          lección puede proponer cambios; aplicarlos sigue siendo una decisión humana.
        </p>
      </header>

      <LessonsView
        lessons={lessons}
        documents={documents.map((d) => ({ id: d.documentId, title: d.title }))}
        processes={processes.map((p) => ({ id: p.id, name: p.name }))}
        positions={positions.map((p) => ({ id: p.id, name: p.name }))}
        canManage={canManageStructure(org.roleCode)}
      />
    </div>
  );
}
