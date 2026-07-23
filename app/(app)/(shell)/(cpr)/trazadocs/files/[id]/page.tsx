// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { getFileDocumentAction, listFileDocumentVersionsAction } from "@/server/actions/trazadocs-master";
import { CATEGORY_LABEL, isCategoryCode } from "@/lib/domain/trazadocs-master";
import { DocumentStatusBadge } from "@/components/domain/trazadocs/document-status-badge";
import { DownloadFileButton } from "@/components/domain/trazadocs/download-file-button";
import { FileDocumentStatusActions } from "@/components/domain/trazadocs/file-document-status-actions";
import { FileDocumentEditForm, ReplaceFileDocumentForm } from "@/components/domain/trazadocs/file-document-edit-forms";
import { FileDocumentVersionList } from "@/components/domain/trazadocs/file-document-version-list";
import { DeleteDraftFileButton } from "@/components/domain/trazadocs/delete-draft-file-button";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function FileDocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [detail, versions] = await Promise.all([getFileDocumentAction(id), listFileDocumentVersionsAction(id)]);
  const { data: doc } = detail;
  if (!doc) notFound();

  const categoryLabel = isCategoryCode(doc.categoryCode) ? CATEGORY_LABEL[doc.categoryCode] : "Otros";
  const editable = doc.status === "draft" || doc.status === "in_review";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <p className="eyebrow">
          <Link href="/trazadocs/master" className="hover:underline">
            Maestro de documentos
          </Link>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{doc.title}</h1>
          <DocumentStatusBadge status={doc.status} />
        </div>
        <p className="text-sm text-ink-soft">
          {categoryLabel} · Versión {doc.versionLabel} · {doc.fileName} ({formatBytes(doc.sizeBytes)})
        </p>
        {doc.description ? <p className="max-w-2xl text-sm text-ink-soft">{doc.description}</p> : null}
        <div className="pt-2">
          <DownloadFileButton documentId={id} />
        </div>
      </header>

      <FileDocumentStatusActions
        documentId={id}
        status={doc.status}
        canSubmitForReview={editable}
        canApprove={detail.canApprove}
        canMarkObsolete={detail.canMarkObsolete}
        canReactivate={detail.canReactivate}
        canCreateDraftVersion={detail.canCreateDraftVersion}
      />

      {editable ? <ReplaceFileDocumentForm documentId={id} /> : null}

      <FileDocumentEditForm
        documentId={id}
        title={doc.title}
        code={doc.code}
        categoryCode={doc.categoryCode}
        description={doc.description}
        editable={detail.canEdit}
      />

      <section className="space-y-3">
        <h2 className="eyebrow">Historial de versiones</h2>
        <FileDocumentVersionList versions={versions} />
      </section>

      {detail.canDeleteDraft ? <DeleteDraftFileButton documentId={id} /> : null}
    </div>
  );
}
