"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ErrorAlert, InfoAlert, SuccessAlert } from "@/components/ui/alert";
import { DocumentStatusBadge } from "@/components/domain/trazadocs/document-status-badge";
import { SectionEditor } from "@/components/domain/trazadocs/section-editor";
import type { DocumentDetail } from "@/lib/db/trazadocs";
import {
  updateQualityDocumentSectionAction,
  updateQualityDocumentMetadataAction,
  submitQualityDocumentForReviewAction,
  approveQualityDocumentAction,
  obsoleteQualityDocumentAction,
  type QualityDocumentActionState,
} from "@/server/actions/quality-documents";

/**
 * Trazaloop Quality · QUALITY-01.1 · Documento de Quality.
 *
 * El editor por secciones es el del motor TrazaDocs (`SectionEditor`), sin
 * reescribirlo: lo único propio son las server actions, que aplican la guarda
 * de Quality. Quality no tiene hints comerciales, así que se pasa `null`.
 */

const initial: QualityDocumentActionState = { error: null };
const inputClass =
  "block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink focus:border-loop";

function StatusButton({
  action,
  label,
  documentId,
  pendingLabel,
}: {
  action: (
    prev: QualityDocumentActionState,
    formData: FormData
  ) => Promise<QualityDocumentActionState>;
  label: string;
  documentId: string;
  pendingLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="document_id" value={documentId} />
      <Button type="submit" variant="quiet" disabled={pending} className="w-auto px-3 py-1.5 text-xs">
        {pending ? pendingLabel : label}
      </Button>
      {state.error ? (
        <span role="alert" className="ml-2 text-xs text-danger">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

export function QualityDocumentDetail({
  document,
  processes,
  canEdit,
  canApprove,
  canObsolete,
}: {
  document: DocumentDetail;
  processes: { processId: string; processName: string; relationType: string }[];
  canEdit: boolean;
  canApprove: boolean;
  canObsolete: boolean;
}) {
  const [sectionState, sectionAction, sectionPending] = useActionState(
    updateQualityDocumentSectionAction,
    initial
  );
  const [metaState, metaAction, metaPending] = useActionState(
    updateQualityDocumentMetadataAction,
    initial
  );

  return (
    <div className="max-w-3xl space-y-5">
      <header className="space-y-2">
        <Link href="/quality/documents" className="text-xs text-loop hover:underline">
          ← Volver a Documentos de Quality
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{document.title}</h1>
          <DocumentStatusBadge status={document.status} />
        </div>
        {document.code ? <p className="code text-xs text-ink-soft">{document.code}</p> : null}
        {document.description ? (
          <p className="text-sm text-ink-soft">{document.description}</p>
        ) : null}
        <p className="text-xs text-ink-soft">
          Versión v{document.currentVersion} · documento de Trazaloop Quality
        </p>
      </header>

      {!canEdit ? (
        <InfoAlert
          message={
            document.status === "approved"
              ? "Este documento está aprobado. Para cambiarlo, crea una versión nueva desde su historial."
              : "Este documento no se puede editar en su estado actual."
          }
        />
      ) : null}

      {/* Procesos que lo usan: es lo que conecta el documento con el SGC. */}
      <section className="rounded-lg border border-hairline bg-surface p-4">
        <h2 className="text-sm font-semibold">Procesos que lo usan</h2>
        {processes.length === 0 ? (
          <p className="mt-1 text-xs text-ink-soft">
            Ningún proceso lo referencia todavía. Puedes asociarlo desde el detalle de un proceso,
            en «Documentos asociados».
          </p>
        ) : (
          <ul className="mt-2 space-y-1">
            {processes.map((p) => (
              <li key={`${p.processId}-${p.relationType}`}>
                <Link
                  href={`/quality/processes/${p.processId}`}
                  className="text-xs font-medium text-loop hover:underline"
                >
                  {p.processName} →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Identidad */}
      {canEdit ? (
        <form action={metaAction} className="space-y-3 rounded-lg border border-hairline bg-surface p-4">
          <h2 className="text-sm font-semibold">Identidad del documento</h2>
          <input type="hidden" name="document_id" value={document.id} />
          <ErrorAlert message={metaState.error} />
          {metaState.success ? <SuccessAlert message="Datos guardados." /> : null}
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium">Título</span>
            <input name="title" required defaultValue={document.title} maxLength={200} className={inputClass} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium">Código</span>
              <input name="code" defaultValue={document.code ?? ""} maxLength={40} className={inputClass} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium">Descripción</span>
              <input name="description" defaultValue={document.description ?? ""} className={inputClass} />
            </label>
          </div>
          <Button type="submit" disabled={metaPending} className="w-auto px-3 py-1.5 text-xs">
            {metaPending ? "Guardando…" : "Guardar datos"}
          </Button>
        </form>
      ) : null}

      {/* Contenido por secciones — editor del motor TrazaDocs */}
      <form action={sectionAction} className="space-y-4">
        <input type="hidden" name="document_id" value={document.id} />
        <ErrorAlert message={sectionState.error} />
        {sectionState.success ? <SuccessAlert message="Contenido guardado." /> : null}

        {document.sections.map((s) => (
          <SectionEditor key={s.id} section={s} hint={null} readOnly={!canEdit} />
        ))}

        {canEdit ? (
          <Button type="submit" disabled={sectionPending} className="w-auto px-4 py-2 text-sm">
            {sectionPending ? "Guardando…" : "Guardar contenido"}
          </Button>
        ) : null}
      </form>

      {/* Estados — mismas transiciones y versionado que el resto de TrazaDocs */}
      <section className="space-y-2 rounded-lg border border-hairline bg-surface p-4">
        <h2 className="text-sm font-semibold">Estado del documento</h2>
        <p className="text-xs text-ink-soft">
          Aprobar deja constancia de una versión: el contenido de ese momento queda registrado en
          el historial del documento.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {document.status === "draft" ? (
            <StatusButton
              action={submitQualityDocumentForReviewAction}
              documentId={document.id}
              label="Enviar a revisión"
              pendingLabel="Enviando…"
            />
          ) : null}
          {document.status === "in_review" && canApprove ? (
            <StatusButton
              action={approveQualityDocumentAction}
              documentId={document.id}
              label="Aprobar"
              pendingLabel="Aprobando…"
            />
          ) : null}
          {document.status === "approved" && canObsolete ? (
            <StatusButton
              action={obsoleteQualityDocumentAction}
              documentId={document.id}
              label="Marcar como obsoleto"
              pendingLabel="Marcando…"
            />
          ) : null}
          {document.status === "obsolete" ? (
            <span className="text-xs text-ink-soft">
              Documento obsoleto. Se conserva para consulta histórica.
            </span>
          ) : null}
        </div>
      </section>
    </div>
  );
}
