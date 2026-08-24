// Ruta protegida (el guard corre en el layout del namespace /quality).
export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-01 · Detalle del proceso.
//
// Reúne el recorrido completo de un proceso: propósito y alcance, entradas y
// salidas, relaciones con otros procesos, documentos de TrazaDocs y el
// historial de revisiones. El parámetro ?revision= permite consultar una
// versión anterior tal como se publicó.

import { notFound } from "next/navigation";
import { requireQualityModule } from "@/lib/auth/require-quality-module";
import {
  getQualityProcessDetail,
  listQualityCategories,
  listQualityPositions,
  listQualityProcessIoCatalog,
} from "@/lib/db/quality-processes";
import { listDocumentsLinkableFromQuality } from "@/lib/db/quality-documents";
import { getDeletionEligibility } from "@/lib/db/lifecycle";
import { canPublishQuality, canEditQuality } from "@/lib/domain/quality-processes";
import { QualityProcessDetailView } from "@/components/domain/quality/process-detail";

export const metadata = { title: "Proceso" };

export default async function QualityProcessPage({
  params,
  searchParams,
}: {
  params: Promise<{ processId: string }>;
  searchParams: Promise<{ revision?: string }>;
}) {
  const org = await requireQualityModule();
  const { processId } = await params;
  const { revision } = await searchParams;

  const detail = await getQualityProcessDetail(org.organizationId, processId, revision);
  if (!detail) notFound();

  const [positions, categories, ioCatalog, documents, eligibility] = await Promise.all([
    listQualityPositions(org.organizationId),
    listQualityCategories(),
    // QUALITY-01.2 · Para poder crear la relación desde CUALQUIERA de sus dos
    // extremos hace falta saber qué salidas tiene el proceso del que se recibe
    // y qué entradas tiene aquel al que se entrega.
    listQualityProcessIoCatalog(org.organizationId),
    listDocumentsLinkableFromQuality(org.organizationId),
    // Quién decide si esto puede eliminarse es la base, no la pantalla.
    getDeletionEligibility("process", processId),
  ]);

  const shownRevision = revision
    ? detail.revisions.find((r) => r.id === revision) ?? null
    : detail.draftRevision ?? detail.currentRevision;

  return (
    <QualityProcessDetailView
      detail={detail}
      shownRevisionId={shownRevision?.id ?? null}
      positions={positions.filter((p) => p.isActive)}
      categories={categories}
      // Un proceso retirado no admite relaciones nuevas (0114): no se ofrece.
      otherProcesses={ioCatalog.filter(
        (p) => p.processId !== processId && p.processStatus !== "retired"
      )}
      availableDocuments={documents}
      canPublish={canPublishQuality(org.roleCode)}
      canManage={canEditQuality(org.roleCode)}
      eligibility={eligibility}
    />
  );
}
