"use client";

import { useActionState, useState } from "react";
import {
  updateImplementationFeedbackStatusAction,
  deleteImplementationFeedbackAction,
  type FeedbackActionState,
} from "@/server/actions/implementation";
import { STATUS_LABEL, RELATED_ENTITY_LABEL, FEEDBACK_STATUSES } from "@/lib/domain/implementation";
// Import de solo TIPO: se elimina por completo en compilación.
import type { FeedbackRow } from "@/lib/db/implementation";
import {
  FeedbackSeverityBadge,
  FeedbackStatusBadge,
  FeedbackModuleBadge,
  FeedbackCategoryBadge,
} from "@/components/domain/implementation/badges";
import { FeedbackEditForm } from "@/components/domain/implementation/feedback-form";

const initial: FeedbackActionState = { error: null };

/** Una fila de feedback con detalle básico, cambio de estado, edición y
 *  eliminación (Parte 6). Los permisos reales los impone la RLS de
 *  implementation_feedback; aquí solo se ocultan los botones que el rol no
 *  puede usar y se muestran los mensajes de error tal cual. */
export function FeedbackItem({
  feedback,
  canManage,
  canDelete,
}: {
  feedback: FeedbackRow;
  canManage: boolean;
  canDelete: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [statusState, statusAction, statusPending] = useActionState(
    updateImplementationFeedbackStatusAction,
    initial
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteImplementationFeedbackAction,
    initial
  );

  return (
    <li className="px-4 py-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="min-w-0 flex-1 text-left"
        >
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{feedback.title}</span>
            <FeedbackSeverityBadge severity={feedback.severity} />
            <FeedbackStatusBadge status={feedback.status} />
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
            <FeedbackModuleBadge module={feedback.module} />
            <FeedbackCategoryBadge category={feedback.category} />
            <span>
              {feedback.createdByName ?? "—"} ·{" "}
              {new Date(feedback.createdAt).toLocaleDateString("es-CO")}
            </span>
          </p>
        </button>
        <div className="flex shrink-0 items-center gap-3">
          {canManage ? (
            <form action={statusAction} className="flex items-center gap-1.5">
              <input type="hidden" name="id" value={feedback.id} />
              <select
                name="status"
                defaultValue={feedback.status}
                disabled={statusPending}
                className="rounded-md border border-hairline bg-surface px-2 py-1 text-xs"
                onChange={(e) => e.currentTarget.form?.requestSubmit()}
              >
                {FEEDBACK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </form>
          ) : null}
          {canManage ? (
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className="text-xs text-loop hover:underline"
            >
              {editing ? "Cerrar edición" : "Editar"}
            </button>
          ) : null}
          {canDelete ? (
            <form action={deleteAction}>
              <input type="hidden" name="id" value={feedback.id} />
              <button
                type="submit"
                disabled={deletePending}
                className="text-xs text-danger hover:underline disabled:opacity-60"
              >
                {deletePending ? "Eliminando…" : "Eliminar"}
              </button>
            </form>
          ) : null}
        </div>
      </div>

      {statusState.error ? (
        <p role="alert" className="mt-2 text-xs text-danger">
          {statusState.error}
        </p>
      ) : null}
      {deleteState.error ? (
        <p role="alert" className="mt-2 text-xs text-danger">
          {deleteState.error}
        </p>
      ) : null}

      {expanded ? (
        <div className="mt-3 space-y-2 rounded-md border border-hairline bg-paper p-3 text-xs text-ink-soft">
          <p className="whitespace-pre-wrap text-ink">{feedback.description}</p>
          {feedback.stepsToReproduce ? (
            <p>
              <span className="font-medium text-ink">Pasos para reproducir: </span>
              {feedback.stepsToReproduce}
            </p>
          ) : null}
          {feedback.expectedResult ? (
            <p>
              <span className="font-medium text-ink">Resultado esperado: </span>
              {feedback.expectedResult}
            </p>
          ) : null}
          {feedback.actualResult ? (
            <p>
              <span className="font-medium text-ink">Resultado actual: </span>
              {feedback.actualResult}
            </p>
          ) : null}
          {feedback.relatedEntityType ? (
            <p>
              <span className="font-medium text-ink">Entidad relacionada: </span>
              {RELATED_ENTITY_LABEL[feedback.relatedEntityType as keyof typeof RELATED_ENTITY_LABEL] ??
                feedback.relatedEntityType}{" "}
              <span className="code">{feedback.relatedEntityId}</span>
            </p>
          ) : null}
          {feedback.assignedToName ? (
            <p>
              <span className="font-medium text-ink">Asignado a: </span>
              {feedback.assignedToName}
            </p>
          ) : null}
          {feedback.resolvedAt ? (
            <p>
              <span className="font-medium text-ink">Resuelto: </span>
              {new Date(feedback.resolvedAt).toLocaleString("es-CO")}
            </p>
          ) : null}
        </div>
      ) : null}

      {editing ? (
        <div className="mt-3 rounded-md border border-hairline bg-surface p-3">
          <FeedbackEditForm feedback={feedback} />
        </div>
      ) : null}
    </li>
  );
}
