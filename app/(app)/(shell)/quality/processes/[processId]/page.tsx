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
  listQualityProcesses,
  listTrazadocsForQuality,
} from "@/lib/db/quality-processes";
import { canPublishQuality } from "@/lib/domain/quality-processes";
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

  const [positions, categories, otherProcesses, documents] = await Promise.all([
    listQualityPositions(org.organizationId),
    listQualityCategories(),
    listQualityProcesses(org.organizationId),
    listTrazadocsForQuality(org.organizationId),
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
      otherProcesses={otherProcesses.filter((p) => p.id !== processId)}
      availableDocuments={documents}
      canPublish={canPublishQuality(org.roleCode)}
    />
  );
}
