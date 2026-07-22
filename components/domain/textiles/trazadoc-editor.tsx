"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorAlert, InfoAlert } from "@/components/ui/alert";
import {
  updateTextileTrazadocSectionsAction,
  submitTextileTrazadocForReviewAction,
  approveTextileTrazadocAction,
  obsoleteTextileTrazadocAction,
  createNewTextileTrazadocVersionAction,
  type TextileTrazadocsActionState,
} from "@/server/actions/textiles-trazadocs";

/**
 * Trazaloop · Sprint T8 (Textil) · Editor del documento TrazaDocs Textil:
 * secciones con su tip, guardado, y transiciones según estado/rol
 * (enviar a revisión, aprobar internamente, nueva versión, obsoleto).
 * Toda validación real vive en las server actions + RLS + RPC del motor.
 */

type SectionView = {
  id: string;
  title: string;
  content: string;
  isRequired: boolean;
  hint: string | null;
};

const initialState: TextileTrazadocsActionState = { error: null };

export function TextileTrazadocEditor({
  documentId,
  status,
  sections,
  canEdit,
  canSubmit,
  canApprove,
  canObsolete,
  canNewVersion,
}: {
  documentId: string;
  status: string;
  sections: SectionView[];
  canEdit: boolean;
  canSubmit: boolean;
  canApprove: boolean;
  canObsolete: boolean;
  canNewVersion: boolean;
}) {
  const [saveState, saveAction, savePending] = useActionState(updateTextileTrazadocSectionsAction, initialState);
  const [submitState, submitAction, submitPending] = useActionState(submitTextileTrazadocForReviewAction, initialState);
  const [approveState, approveAction, approvePending] = useActionState(approveTextileTrazadocAction, initialState);
  const [obsoleteState, obsoleteAction, obsoletePending] = useActionState(obsoleteTextileTrazadocAction, initialState);
  const [versionState, versionAction, versionPending] = useActionState(createNewTextileTrazadocVersionAction, initialState);

  const pending = savePending || submitPending || approvePending || obsoletePending || versionPending;
  const errors = [saveState, submitState, approveState, obsoleteState, versionState]
    .map((s) => s.error)
    .filter(Boolean);
  const saved = saveState.success === true;

  return (
    <div className="space-y-5">
      {errors.length > 0 ? <ErrorAlert message={errors[0] as string} /> : null}
      {saved && errors.length === 0 ? <InfoAlert message="Secciones guardadas." /> : null}

      <form action={saveAction} className="space-y-4">
        <input type="hidden" name="document_id" value={documentId} />
        {sections.map((s) => (
          <div key={s.id} className="space-y-1 rounded-lg border border-hairline bg-surface p-4">
            <label htmlFor={`section-${s.id}`} className="text-sm font-semibold">
              {s.title}
              {s.isRequired ? <span className="ml-1 text-xs text-amber-700">· requerida</span> : null}
            </label>
            {s.hint ? <p className="text-[11px] text-ink-soft">Tip: {s.hint}</p> : null}
            {canEdit ? (
              <textarea
                id={`section-${s.id}`}
                name={`section:${s.id}`}
                defaultValue={s.content}
                rows={4}
                className="w-full rounded-md border border-hairline bg-paper p-2 text-sm"
              />
            ) : (
              <p className="whitespace-pre-wrap rounded-md border border-hairline bg-paper p-2 text-sm text-ink-soft">
                {s.content || "— Sin contenido —"}
              </p>
            )}
          </div>
        ))}
        {canEdit ? (
          <Button type="submit" disabled={pending}>
            {savePending ? "Guardando…" : "Guardar secciones"}
          </Button>
        ) : null}
      </form>

      <div className="flex flex-wrap items-center gap-2 border-t border-hairline pt-4">
        {status === "draft" && canSubmit ? (
          <form action={submitAction}>
            <input type="hidden" name="document_id" value={documentId} />
            <Button type="submit" variant="quiet" disabled={pending}>
              Enviar a revisión
            </Button>
          </form>
        ) : null}
        {(status === "draft" || status === "in_review") && canApprove ? (
          <form action={approveAction}>
            <input type="hidden" name="document_id" value={documentId} />
            <Button type="submit" variant="quiet" disabled={pending}>
              Aprobar internamente
            </Button>
          </form>
        ) : null}
        {status === "approved" && canNewVersion ? (
          <form action={versionAction}>
            <input type="hidden" name="document_id" value={documentId} />
            <Button type="submit" variant="quiet" disabled={pending}>
              Nueva versión (borrador)
            </Button>
          </form>
        ) : null}
        {status !== "obsolete" && canObsolete ? (
          <form action={obsoleteAction}>
            <input type="hidden" name="document_id" value={documentId} />
            <Button type="submit" variant="quiet" disabled={pending}>
              Marcar obsoleto
            </Button>
          </form>
        ) : null}
      </div>
      <p className="text-[11px] text-ink-soft">
        “Aprobado internamente” describe la revisión interna de la empresa; no significa
        aprobado por una entidad externa.
      </p>
    </div>
  );
}
