// Ruta protegida (guard del módulo en el layout del namespace /textiles).
export const dynamic = "force-dynamic";

// Trazaloop · Sprint T8 (Textil) · Detalle del documento: secciones con
// tips del motor, estado/versión, transiciones por rol, historial de
// versiones, vínculos sugeridos y salida por impresión del navegador.

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTextilesModule } from "@/lib/auth/require-textiles-module";
import {
  getTextileTrazadocDetail,
  listTextileTrazadocVersions,
  listTextileTrazadocsTemplates,
} from "@/lib/db/textiles-trazadocs";
import { resolveGuidanceHintMap } from "@/lib/db/authoring-guidance";
import { canUseAssistedWriting } from "@/lib/db/assisted-writing";
import type { ResolvedHint } from "@/lib/domain/hint-access";
import { TEXTILES_MODULE_CODE } from "@/lib/modules/catalog";
import {
  TEXTILE_TRAZADOCS_DISCLAIMER,
  TEXTILE_TRAZADOCS_MODULE_LINKS,
} from "@/lib/domain/textiles-trazadocs";
import {
  DOCUMENT_STATUS_LABEL,
  canEditDocument,
  canSubmitForReview,
  canApproveDocument,
  canMarkObsolete,
  canCreateDraftVersionFromApproved,
  type DocumentStatus,
} from "@/lib/domain/trazadocs";
import { TextileTrazadocEditor } from "@/components/domain/textiles/trazadoc-editor";
import { ExportPdfButton } from "@/components/ui/export-pdf-button";

export default async function TextileTrazadocDetailPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;
  const org = await requireTextilesModule();
  const doc = await getTextileTrazadocDetail(org.organizationId, documentId);
  if (!doc) notFound();

  // QUALITY-12.2A · La guía sale de la fuente canónica, que aplica el acceso
  // comercial POR MÓDULO dentro de la base: en Demo el texto administrado y
  // sus enlaces no salen de ella, y el mapa serializado lleva solo el aviso.
  const [hintBySectionId, versions, templates] = await Promise.all([
    doc.blueprintId
      ? resolveGuidanceHintMap({
          organizationId: org.organizationId,
          moduleCode: TEXTILES_MODULE_CODE,
          blueprintId: doc.blueprintId,
        })
      : Promise.resolve({} as Record<string, ResolvedHint>),
    listTextileTrazadocVersions(org.organizationId, doc.id),
    listTextileTrazadocsTemplates(),
  ]);
  // QUALITY-12.2C · La asistencia se resuelve con el plan de TEXTILES: este
  // documento es de Textiles y no debe depender de Quality.
  const assistedWriting = await canUseAssistedWriting(org.organizationId, TEXTILES_MODULE_CODE);

  const blueprint = templates.find((t) => t.blueprintId === doc.blueprintId) ?? null;
  const moduleLinks = blueprint ? TEXTILE_TRAZADOCS_MODULE_LINKS[blueprint.code] ?? [] : [];

  const status = doc.status as DocumentStatus;
  const role = org.roleCode as never;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-1">
        <p className="eyebrow">Trazaloop Textiles · TrazaDocs</p>
        <h1 className="text-2xl font-semibold tracking-tight">{doc.title}</h1>
        <div className="pt-1">
          <ExportPdfButton exportKey="textiles.document.detail" id={doc.id} />
        </div>
        <p className="text-sm text-ink-soft">
          {[
            blueprint?.code ?? doc.code ?? "",
            `v${doc.currentVersion}`,
            DOCUMENT_STATUS_LABEL[status] ?? doc.status,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {blueprint?.description ? (
          <p className="max-w-2xl text-xs text-ink-soft">{blueprint.description}</p>
        ) : null}
        <p className="max-w-2xl text-xs text-ink-soft">{TEXTILE_TRAZADOCS_DISCLAIMER}</p>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link href="/textiles/trazadocs" className="font-medium text-loop hover:underline">
            ← TrazaDocs Textil
          </Link>
          <Link href={`/textiles/trazadocs/${doc.id}/print`} className="text-loop hover:underline">
            Imprimir / exportar →
          </Link>
        </div>
        {moduleLinks.length > 0 ? (
          <p className="text-xs text-ink-soft">
            Módulos relacionados:{" "}
            {moduleLinks.map((l, i) => (
              <span key={l.href}>
                {i > 0 ? " · " : ""}
                <Link href={l.href} className="text-loop hover:underline">
                  {l.label}
                </Link>
              </span>
            ))}
          </p>
        ) : null}
      </header>

      <TextileTrazadocEditor
        documentId={doc.id}
        status={doc.status}
        sections={doc.sections.map((s) => ({
          id: s.id,
          title: s.title,
          content: s.content,
          isRequired: s.isRequired,
          hint: s.blueprintSectionId ? hintBySectionId[s.blueprintSectionId] ?? null : null,
        }))}
        canEdit={canEditDocument(role, status)}
        assistedWriting={assistedWriting}
        canSubmit={canSubmitForReview(role, status)}
        canApprove={canApproveDocument(role)}
        canObsolete={canMarkObsolete(role)}
        canNewVersion={canCreateDraftVersionFromApproved(role)}
      />

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Historial de versiones ({versions.length})</h2>
        {versions.length === 0 ? (
          <p className="text-xs text-ink-soft">Sin versiones registradas.</p>
        ) : (
          <ul className="space-y-1 text-xs text-ink-soft">
            {versions.map((v) => (
              <li key={v.id} className="rounded-lg border border-hairline bg-surface p-2">
                <span className="font-medium text-ink">v{v.versionNumber}</span> ·{" "}
                {DOCUMENT_STATUS_LABEL[v.status as DocumentStatus] ?? v.status} ·{" "}
                {v.createdAt?.slice(0, 10) ?? ""}
                {v.changeNote ? ` · ${v.changeNote}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
