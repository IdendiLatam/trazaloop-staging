"use client";

import { useActionState } from "react";
import {
  validateEvidenceAction,
  deleteEvidenceAction,
  type EvidenceActionState,
} from "@/server/actions/evidences";

const initial: EvidenceActionState = { error: null };

/**
 * Acciones por fila de evidencia con estado de error visible.
 * Los permisos reales los imponen RLS + trigger; aquí solo se muestran
 * mensajes claros cuando la base rechaza la operación.
 */
export function EvidenceRowActions({
  evidenceId,
  status,
  canApprove,
}: {
  evidenceId: string;
  status: string;
  canApprove: boolean;
}) {
  const [validateState, validateFormAction, validating] = useActionState(
    validateEvidenceAction,
    initial
  );
  const [deleteState, deleteFormAction, deleting] = useActionState(
    deleteEvidenceAction,
    initial
  );

  const error = validateState.error ?? deleteState.error;
  const isValid = status === "valid";

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-3">
        {canApprove && !isValid ? (
          <form action={validateFormAction}>
            <input type="hidden" name="id" value={evidenceId} />
            <button
              type="submit"
              disabled={validating}
              className="text-sm text-loop hover:underline disabled:opacity-60"
            >
              {validating ? "Validando…" : "Validar"}
            </button>
          </form>
        ) : null}
        {canApprove && !isValid ? (
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
      {error ? (
        <p role="alert" className="max-w-56 text-right text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
