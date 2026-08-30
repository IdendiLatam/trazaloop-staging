// Ruta protegida (el guard corre en el layout del namespace /quality).
export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-01 · Detalle del proceso.
//
// Reúne el recorrido completo de un proceso: propósito y alcance, entradas y
// salidas, relaciones con otros procesos, documentos de TrazaDocs y el
// historial de revisiones. El parámetro ?revision= permite consultar una
// versión anterior tal como se publicó.
//
// QUALITY-13B2 · Y, desde aquí, el MIRADOR: lo que hay alrededor del proceso en
// los nueve dominios que de verdad se relacionan con él.
//
// El mirador se compone EN SERVIDOR y viaja como nodo ya pintado. Así no entra
// una línea de su código en el paquete del navegador, y —lo que importa más— la
// pantalla no puede consultar por su cuenta: recibe lo que la aplicación
// compuso, que es la regla §2 del encargo.
//
// Si el mirador falla entero, la ficha sigue. Lo que no se puede leer se dice;
// no se calla y no se convierte en ceros.

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
import { loadProcessCockpit } from "@/lib/db/quality-process-cockpit";
import { CURRENT, period, type TemporalScope } from "@/lib/domain/quality-integration";
import { QualityProcessDetailView } from "@/components/domain/quality/process-detail";
import { QualityProcessCockpit } from "@/components/domain/quality/process-cockpit";

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

  const [positions, categories, ioCatalog, documents, eligibility, cockpit] = await Promise.all([
    listQualityPositions(org.organizationId),
    listQualityCategories(),
    // QUALITY-01.2 · Para poder crear la relación desde CUALQUIERA de sus dos
    // extremos hace falta saber qué salidas tiene el proceso del que se recibe
    // y qué entradas tiene aquel al que se entrega.
    listQualityProcessIoCatalog(org.organizationId),
    listDocumentsLinkableFromQuality(org.organizationId),
    // Quién decide si esto puede eliminarse es la base, no la pantalla.
    getDeletionEligibility("process", processId),
    // QUALITY-13B2 · Cada sección responde por sí misma; un dominio caído no
    // se lleva por delante ni el mirador ni la ficha.
    loadProcessCockpit(org.organizationId, processId).catch(() => null),
  ]);

  const shownRevision = revision
    ? detail.revisions.find((r) => r.id === revision) ?? null
    : detail.draftRevision ?? detail.currentRevision;

  // QUALITY-13B2 · §18 · Qué momento describe lo que se está viendo.
  //
  // Una revisión histórica rigió entre dos fechas, y el proceso se muestra tal
  // como se publicó. Los dominios de alrededor NO se reconstruyen a esa fecha,
  // así que declarar el momento aquí es lo que permite al mirador avisar en vez
  // de dejar creer que aquel proceso tenía estos riesgos.
  const viewingHistory =
    shownRevision !== null &&
    shownRevision.id !== detail.draftRevision?.id &&
    shownRevision.id !== detail.currentRevision?.id;
  const viewScope: TemporalScope =
    viewingHistory && shownRevision?.effectiveFrom
      ? period(shownRevision.effectiveFrom, shownRevision.effectiveTo ?? shownRevision.effectiveFrom)
      : CURRENT;

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
      cockpit={
        cockpit ? (
          <QualityProcessCockpit
            processId={processId}
            sections={cockpit.sections}
            requirements={cockpit.requirements}
            derived={cockpit.derived}
            viewScope={viewScope}
          />
        ) : (
          <p className="rounded-lg border border-hairline bg-surface p-4 text-xs text-ink-soft">
            No fue posible cargar el contexto integrado de este proceso. El resto de la ficha
            sigue siendo correcto.
          </p>
        )
      }
    />
  );
}
