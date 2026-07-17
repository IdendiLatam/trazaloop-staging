"use client";

import { useActionState } from "react";
import {
  submitFileDocumentForReviewAction,
  approveFileDocumentAction,
  markFileDocumentObsoleteAction,
  reactivateFileDocumentAction,
  createFileDocumentDraftVersionAction,
  type MasterActionState,
} from "@/server/actions/trazadocs-master";
import { Button } from "@/components/ui/button";
import { ErrorAlert, InfoAlert } from "@/components/ui/alert";

const initial: MasterActionState = { error: null };

/** Botones de transición de estado para documentos descargables — mismo
 *  patrón y mismas reglas de rol/estado que DocumentStatusActions
 *  (TrazaDocs vivo): nunca se edita un aprobado directamente, siempre
 *  vía nueva versión (aquí, reemplazar archivo o crear versión en
 *  borrador). */
export function FileDocumentStatusActions({
  documentId,
  status,
  canSubmitForReview,
  canApprove,
  canMarkObsolete,
  canReactivate,
  canCreateDraftVersion,
}: {
  documentId: string;
  status: string;
  canSubmitForReview: boolean;
  canApprove: boolean;
  canMarkObsolete: boolean;
  canReactivate: boolean;
  canCreateDraftVersion: boolean;
}) {
  const [submitState, submitAction, submitPending] = useActionState(submitFileDocumentForReviewAction, initial);
  const [approveState, approveAction, approvePending] = useActionState(approveFileDocumentAction, initial);
  const [obsoleteState, obsoleteAction, obsoletePending] = useActionState(markFileDocumentObsoleteAction, initial);
  const [reactivateState, reactivateAction, reactivatePending] = useActionState(reactivateFileDocumentAction, initial);
  const [draftVersionState, draftVersionAction, draftVersionPending] = useActionState(
    createFileDocumentDraftVersionAction,
    initial
  );

  const error =
    submitState.error ?? approveState.error ?? obsoleteState.error ?? reactivateState.error ?? draftVersionState.error;

  return (
    <div className="space-y-3">
      {status === "approved" ? (
        <InfoAlert message="Este documento está aprobado. Para modificarlo, reemplaza el archivo o crea una nueva versión en borrador." />
      ) : null}

      <div className="flex flex-wrap gap-2">
        {status === "draft" && canSubmitForReview ? (
          <form action={submitAction}>
            <input type="hidden" name="id" value={documentId} />
            <Button type="submit" disabled={submitPending} className="!w-auto">
              {submitPending ? "Enviando…" : "Enviar a revisión"}
            </Button>
          </form>
        ) : null}
        {(status === "draft" || status === "in_review") && canApprove ? (
          <form action={approveAction}>
            <input type="hidden" name="id" value={documentId} />
            <button
              type="submit"
              disabled={approvePending}
              className="rounded-md border border-loop bg-loop/5 px-4 py-2 text-sm font-semibold text-loop-deep hover:bg-loop/10 disabled:opacity-60"
            >
              {approvePending ? "Aprobando…" : "Aprobar"}
            </button>
          </form>
        ) : null}
        {status !== "obsolete" && canMarkObsolete ? (
          <form action={obsoleteAction}>
            <input type="hidden" name="id" value={documentId} />
            <button
              type="submit"
              disabled={obsoletePending}
              className="rounded-md border border-danger/40 bg-danger/5 px-4 py-2 text-sm font-semibold text-danger hover:bg-danger/10 disabled:opacity-60"
            >
              {obsoletePending ? "Marcando…" : "Marcar obsoleto"}
            </button>
          </form>
        ) : null}
        {status === "obsolete" && canReactivate ? (
          <form action={reactivateAction}>
            <input type="hidden" name="id" value={documentId} />
            <Button type="submit" disabled={reactivatePending} className="!w-auto">
              {reactivatePending ? "Reactivando…" : "Reactivar como borrador"}
            </Button>
          </form>
        ) : null}
        {status === "approved" && canCreateDraftVersion ? (
          <form action={draftVersionAction}>
            <input type="hidden" name="id" value={documentId} />
            <Button type="submit" disabled={draftVersionPending} className="!w-auto">
              {draftVersionPending ? "Creando…" : "Crear nueva versión en borrador"}
            </Button>
          </form>
        ) : null}
      </div>

      <ErrorAlert message={error} />
    </div>
  );
}
