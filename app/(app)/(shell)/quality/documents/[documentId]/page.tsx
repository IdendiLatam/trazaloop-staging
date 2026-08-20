// Ruta protegida (el guard corre en el layout del namespace /quality).
export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-01.1 · Detalle y edición de un documento propio.
//
// Reutiliza el editor por secciones del motor TrazaDocs; lo único propio son
// las server actions, que aplican la guarda de Quality y fijan module_key.

import { notFound } from "next/navigation";
import { requireQualityModule } from "@/lib/auth/require-quality-module";
import { getQualityDocument } from "@/lib/db/quality-documents";
import { listQualityProcessesUsingDocument } from "@/lib/db/quality-processes";
import { canEditDocument, canApproveDocument, canMarkObsolete } from "@/lib/domain/trazadocs";
import { QualityDocumentDetail } from "@/components/domain/quality/document-detail";

export const metadata = { title: "Documento" };

export default async function QualityDocumentPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const org = await requireQualityModule();
  const { documentId } = await params;

  const doc = await getQualityDocument(org.organizationId, documentId);
  if (!doc) notFound();

  const processes = await listQualityProcessesUsingDocument(org.organizationId, documentId);

  return (
    <QualityDocumentDetail
      document={doc}
      processes={processes}
      canEdit={canEditDocument(org.roleCode, doc.status)}
      canApprove={canApproveDocument(org.roleCode)}
      canObsolete={canMarkObsolete(org.roleCode)}
    />
  );
}
