"use client";

import { useState } from "react";
import { useActionState } from "react";
import {
  submitDocumentForReviewAction,
  approveDocumentAction,
  markDocumentObsoleteAction,
  reactivateDocumentAction,
  createDraftVersionFromApprovedAction,
  createDocumentVersionAction,
  type TrazadocsActionState,
} from "@/server/actions/trazadocs";
import { Button } from "@/components/ui/button";
import { ErrorAlert, InfoAlert } from "@/components/ui/alert";

const initial: TrazadocsActionState = { error: null };

/** Botones de transición de estado (Parte 9) + Sprint 9.1: "Guardar nueva
 *  versión" explícito (Bloqueante 2) y "Crear nueva versión en borrador"
 *  desde un documento aprobado (Bloqueante 3) — nunca se edita un
 *  aprobado directamente. Cada transición pasa por la RPC atómica
 *  change_trazadoc_document_status y siempre genera una versión nueva. */
export function DocumentStatusActions({
  documentId,
  status,
  canSubmitForReview,
  canApprove,
  canMarkObsolete,
  canReactivate,
  canCreateDraftVersion,
  canSaveNewVersion,
}: {
  documentId: string;
  status: string;
  canSubmitForReview: boolean;
  canApprove: boolean;
  canMarkObsolete: boolean;
  canReactivate: boolean;
  canCreateDraftVersion: boolean;
  canSaveNewVersion: boolean;
}) {
  const [submitState, submitAction, submitPending] = useActionState(submitDocumentForReviewAction, initial);
  const [approveState, approveAction, approvePending] = useActionState(approveDocumentAction, initial);
  const [obsoleteState, obsoleteAction, obsoletePending] = useActionState(markDocumentObsoleteAction, initial);
  const [reactivateState, reactivateAction, reactivatePending] = useActionState(
    reactivateDocumentAction,
    initial
  );
  const [draftVersionState, draftVersionAction, draftVersionPending] = useActionState(
    createDraftVersionFromApprovedAction,
    initial
  );

  const error =
    submitState.error ?? approveState.error ?? obsoleteState.error ?? reactivateState.error ?? draftVersionState.error;

  return (
    <div className="space-y-3">
      {status === "approved" ? (
        <InfoAlert message="Este documento está aprobado. Para modificarlo, crea una nueva versión en borrador." />
      ) : null}

      <div className="flex flex-wrap gap-2">
        {status === "draft" && canSubmitForReview ? (
          <form action={submitAction}>
            <input type="hidden" name="document_id" value={documentId} />
            <Button type="submit" disabled={submitPending} className="!w-auto">
              {submitPending ? "Enviando…" : "Enviar a revisión"}
            </Button>
          </form>
        ) : null}
        {(status === "draft" || status === "in_review") && canApprove ? (
          <form action={approveAction}>
            <input type="hidden" name="document_id" value={documentId} />
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
            <input type="hidden" name="document_id" value={documentId} />
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
            <input type="hidden" name="document_id" value={documentId} />
            <Button type="submit" disabled={reactivatePending} className="!w-auto">
              {reactivatePending ? "Reactivando…" : "Reactivar como borrador"}
            </Button>
          </form>
        ) : null}
        {status === "approved" && canCreateDraftVersion ? (
          <form action={draftVersionAction}>
            <input type="hidden" name="document_id" value={documentId} />
            <Button type="submit" disabled={draftVersionPending} className="!w-auto">
              {draftVersionPending ? "Creando…" : "Crear nueva versión en borrador"}
            </Button>
          </form>
        ) : null}
      </div>

      {canSaveNewVersion ? <SaveNewVersionForm documentId={documentId} status={status} /> : null}

      <ErrorAlert message={error} />
    </div>
  );
}

/** Bloqueante 2: "Guardar nueva versión" con nota de cambio opcional —
 *  antes existía la acción pero no había forma de usarla desde la UI.
 *  Mantiene el estado actual (draft/in_review): no aprueba ni cambia el
 *  estado, solo deja un snapshot nuevo con la nota escrita. */
function SaveNewVersionForm({ documentId, status }: { documentId: string; status: string }) {
  const [state, formAction, pending] = useActionState(createDocumentVersionAction, initial);
  const [note, setNote] = useState("");

  return (
    <form action={formAction} className="space-y-2 rounded-lg border border-dashed border-hairline p-3">
      <input type="hidden" name="document_id" value={documentId} />
      <input type="hidden" name="status" value={status} />
      <label className="block text-xs font-medium text-ink-soft">
        Nota de cambio (opcional) — por ejemplo, «Se ajusta alcance del procedimiento.»
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          name="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Se ajusta alcance del procedimiento."
          className="min-w-[16rem] flex-1 rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm"
        />
        <Button type="submit" disabled={pending} className="!w-auto">
          {pending ? "Guardando…" : "Guardar nueva versión"}
        </Button>
      </div>
      {state.error ? <ErrorAlert message={state.error} /> : null}
    </form>
  );
}
