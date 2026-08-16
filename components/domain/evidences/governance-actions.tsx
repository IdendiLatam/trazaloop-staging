"use client";

/**
 * PCR-03.1 · Acciones de GOBERNANZA por evidencia: aceptar internamente
 * (confirmación clara), rechazar (motivo OBLIGATORIO, panel propio — nada
 * de window.confirm) y archivar/desarchivar. Los permisos reales viven en
 * el trigger 0106 + RLS; aquí solo UX honesta y mensajes de la base.
 */
import { useActionState, useState } from "react";
import {
  reviewEvidenceAction,
  archiveEvidenceAction,
  deleteEvidenceAction,
  type EvidenceActionState,
} from "@/server/actions/evidences";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

const initial: EvidenceActionState = { error: null };

export function EvidenceGovernanceActions({
  evidenceId,
  status,
  archived,
  canReview,
}: {
  evidenceId: string;
  status: string;
  archived: boolean;
  canReview: boolean;
}) {
  const [reviewState, reviewFormAction, reviewing] = useActionState(reviewEvidenceAction, initial);
  const [archiveState, archiveFormAction, archiving] = useActionState(archiveEvidenceAction, initial);
  const [deleteState, deleteFormAction, deleting] = useActionState(deleteEvidenceAction, initial);
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [comment, setComment] = useState("");

  const error = reviewState.error ?? archiveState.error ?? deleteState.error;

  function submitReview(decision: "accept" | "reject") {
    const fd = new FormData();
    fd.set("id", evidenceId);
    fd.set("decision", decision);
    fd.set("review_comment", comment);
    reviewFormAction(fd);
    setAcceptOpen(false);
    setRejectOpen(false);
    setComment("");
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center justify-end gap-3">
        {canReview && status === "pending" && !archived ? (
          <>
            <button
              type="button"
              onClick={() => setAcceptOpen(true)}
              className="text-sm text-loop hover:underline"
            >
              Aceptar internamente
            </button>
            <button
              type="button"
              onClick={() => setRejectOpen(true)}
              className="text-sm text-danger hover:underline"
            >
              Rechazar
            </button>
          </>
        ) : null}
        {canReview ? (
          <form action={archiveFormAction}>
            <input type="hidden" name="id" value={evidenceId} />
            <input type="hidden" name="archive" value={archived ? "false" : "true"} />
            <button
              type="submit"
              disabled={archiving}
              className="text-sm text-ink-soft hover:underline disabled:opacity-60"
            >
              {archiving ? "Guardando…" : archived ? "Desarchivar" : "Archivar"}
            </button>
          </form>
        ) : null}
        {canReview && status !== "valid" ? (
          <form action={deleteFormAction}>
            <input type="hidden" name="id" value={evidenceId} />
            <button
              type="submit"
              disabled={deleting}
              className="text-sm text-danger hover:underline disabled:opacity-60"
            >
              {deleting ? "Eliminando…" : "Eliminar"}
            </button>
          </form>
        ) : null}
      </div>

      <ConfirmDialog
        open={acceptOpen}
        title="Aceptar internamente esta evidencia"
        description="Registra la aceptación INTERNA de la empresa (Trazaloop no certifica ni dictamina el documento). Quedarán selladas la fecha y la persona revisora."
        confirmLabel={reviewing ? "Aceptando…" : "Aceptar internamente"}
        pending={reviewing}
        onConfirm={() => submitReview("accept")}
        onCancel={() => setAcceptOpen(false)}
      />

      {rejectOpen ? (
        <div className="mt-2 w-full max-w-md rounded-md border border-hairline bg-paper p-3 text-left">
          <p className="text-xs font-semibold text-ink">Rechazar evidencia</p>
          <p className="mt-1 text-xs text-ink-soft">
            El motivo de rechazo es obligatorio y quedará registrado junto con
            la fecha y la persona revisora.
          </p>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            placeholder="Motivo del rechazo…"
            className="mt-2 w-full rounded-md border border-hairline bg-canvas px-2 py-1.5 text-sm"
          />
          <div className="mt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setRejectOpen(false);
                setComment("");
              }}
              className="text-sm text-ink-soft hover:underline"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={reviewing || comment.trim() === ""}
              onClick={() => submitReview("reject")}
              className="rounded-md bg-danger px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {reviewing ? "Rechazando…" : "Confirmar rechazo"}
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="max-w-64 text-right text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
