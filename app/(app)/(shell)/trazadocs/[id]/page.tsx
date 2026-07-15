// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { getTrazadocDocumentAction } from "@/server/actions/trazadocs";
import { canEditDocument } from "@/lib/domain/trazadocs";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { DocumentStatusBadge } from "@/components/domain/trazadocs/document-status-badge";
import { DocumentStatusActions } from "@/components/domain/trazadocs/document-status-actions";

const SOURCE_LABEL: Record<string, string> = {
  suggested: "Estructura sugerida",
  custom: "Documento libre",
};

export default async function TrazaDocViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const org = await requireActiveOrg();
  const {
    data: doc,
    canApprove,
    canMarkObsolete: canObsolete,
    canReactivate,
    canCreateDraftVersion,
  } = await getTrazadocDocumentAction(id);
  if (!doc) notFound();
  const canSaveNewVersion = canEditDocument(org.roleCode, doc.status);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">
          <Link href="/trazadocs" className="hover:underline">
            TrazaDocs
          </Link>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{doc.title}</h1>
          <DocumentStatusBadge status={doc.status} />
        </div>
        {doc.code ? <p className="code text-xs text-ink-soft">{doc.code}</p> : null}
        {doc.description ? <p className="text-sm text-ink-soft">{doc.description}</p> : null}
        <p className="text-xs text-ink-soft">
          {SOURCE_LABEL[doc.sourceType]} · versión v{doc.currentVersion} · actualizado el{" "}
          {new Date(doc.updatedAt).toLocaleDateString("es-CO")}
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          <Link
            href={`/trazadocs/${doc.id}/edit`}
            className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm font-medium hover:border-loop"
          >
            Editar
          </Link>
          <Link
            href={`/trazadocs/${doc.id}/versions`}
            className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm font-medium hover:border-loop"
          >
            Ver versiones
          </Link>
          <Link
            href={`/trazadocs/${doc.id}/print`}
            className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm font-medium hover:border-loop"
          >
            Imprimir / guardar como PDF
          </Link>
        </div>
      </header>

      <DocumentStatusActions
        documentId={doc.id}
        status={doc.status}
        canSubmitForReview={doc.status === "draft"}
        canApprove={canApprove}
        canMarkObsolete={canObsolete}
        canReactivate={canReactivate}
        canCreateDraftVersion={canCreateDraftVersion}
        canSaveNewVersion={canSaveNewVersion}
      />

      <section className="space-y-4">
        {doc.sections.map((s) => (
          <div key={s.id} className="rounded-lg border border-hairline bg-surface p-4">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              {s.title}
              {s.isRequired ? (
                <span className="rounded-full border border-amber/40 bg-amber/10 px-2 py-0.5 text-[11px] font-medium text-amber">
                  Obligatoria
                </span>
              ) : null}
            </h2>
            <p className="whitespace-pre-wrap text-sm text-ink">
              {s.content.trim() || <span className="text-ink-soft">Sin diligenciar todavía.</span>}
            </p>
          </div>
        ))}
      </section>
    </div>
  );
}
