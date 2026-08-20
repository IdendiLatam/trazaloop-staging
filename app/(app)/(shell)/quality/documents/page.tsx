// Ruta protegida (el guard corre en el layout del namespace /quality).
export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-01.1 · Espacio documental propio.
//
// Distingue dos cosas que el usuario debe poder diferenciar de un vistazo:
// los documentos que SON de Quality y los que Quality solo REFERENCIA porque
// nacieron en otro módulo. Editar uno vinculado afecta también a su módulo de
// origen, y eso no puede quedar implícito.

import { requireQualityModule } from "@/lib/auth/require-quality-module";
import {
  listQualityDocuments,
  listDocumentsLinkedToQuality,
} from "@/lib/db/quality-documents";
import { listQualityProcesses } from "@/lib/db/quality-processes";
import { canCreateDocument } from "@/lib/domain/trazadocs";
import { QualityDocumentsView } from "@/components/domain/quality/documents-view";

export const metadata = { title: "Documentos" };

export default async function QualityDocumentsPage() {
  const org = await requireQualityModule();

  const [own, linked, processes] = await Promise.all([
    listQualityDocuments(org.organizationId),
    listDocumentsLinkedToQuality(org.organizationId),
    listQualityProcesses(org.organizationId),
  ]);

  // Un documento propio de Quality que además esté asociado a un proceso no
  // debe contarse dos veces: aparece en su sección, la de Quality.
  const ownIds = new Set(own.map((d) => d.documentId));
  const linkedFromOtherModules = linked.filter((d) => !ownIds.has(d.documentId));

  // Procesos a los que un documento propio ya está asociado, para poder
  // mostrarlo junto al documento sin una consulta por fila.
  const processesByDocument = new Map(
    linked.map((d) => [d.documentId, d.processes.map((p) => p.name)])
  );

  return (
    <QualityDocumentsView
      own={own.map((d) => ({
        id: d.documentId,
        title: d.title,
        code: d.code,
        status: d.status,
        updatedAt: d.updatedAt,
        currentVersion: d.currentVersion,
        sectionsCount: d.sectionsCount,
        filledSectionsCount: d.filledSectionsCount,
        processNames: processesByDocument.get(d.documentId) ?? [],
      }))}
      linked={linkedFromOtherModules}
      hasProcesses={processes.length > 0}
      canCreate={canCreateDocument(org.roleCode)}
    />
  );
}
