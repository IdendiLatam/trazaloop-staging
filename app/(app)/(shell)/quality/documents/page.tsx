// Ruta protegida (el guard corre en el layout del namespace /quality).
export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-02 · Espacio documental propio.
//
// Distingue dos cosas que el usuario debe poder diferenciar de un vistazo:
// los documentos que SON de Quality y los que Quality solo REFERENCIA porque
// nacieron en otro módulo. Editar uno vinculado afecta también a su módulo de
// origen, y eso no puede quedar implícito.
//
// El estado de cada documento propio sale de la lista maestra, que es la
// proyección oficial: así la lista y el maestro nunca pueden discrepar.

import { requireQualityModule } from "@/lib/auth/require-quality-module";
import { listDocumentsLinkedToQuality } from "@/lib/db/quality-documents";
import { listQualityProcesses } from "@/lib/db/quality-processes";
import { loadQualityMasterList } from "@/lib/db/quality-master-list";
import { canCreateDocument } from "@/lib/domain/trazadocs";
import { QualityDocumentsView } from "@/components/domain/quality/documents-view";

export const metadata = { title: "Documentos" };

export default async function QualityDocumentsPage() {
  const org = await requireQualityModule();

  const [master, linked, processes] = await Promise.all([
    loadQualityMasterList(org.organizationId),
    listDocumentsLinkedToQuality(org.organizationId),
    listQualityProcesses(org.organizationId),
  ]);

  const own = master.filter((d) => d.moduleKey === "quality");

  // Un documento propio de Quality que además esté asociado a un proceso no
  // debe contarse dos veces: aparece en su sección, la de Quality.
  const ownIds = new Set(own.map((d) => d.documentId));
  const linkedFromOtherModules = linked.filter((d) => !ownIds.has(d.documentId));

  return (
    <QualityDocumentsView
      own={own.map((d) => ({
        id: d.documentId,
        title: d.title,
        code: d.code,
        status: d.lifecycle,
        updatedAt: d.createdAt,
        currentVersion: d.currentVersion,
        sectionsCount: d.sectionsCount,
        filledSectionsCount: d.filledSectionsCount,
        processNames: d.processNames.split(",").map((s) => s.trim()).filter(Boolean),
        lifecycle: d.lifecycle,
        revisionModel: d.revisionModel,
        currentRevisionNumber: d.currentRevisionNumber,
      }))}
      linked={linkedFromOtherModules}
      hasProcesses={processes.length > 0}
      canCreate={canCreateDocument(org.roleCode)}
    />
  );
}
