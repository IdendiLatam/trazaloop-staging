"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { deleteDraftTrazadocDocumentAction, type TrazadocsActionState } from "@/server/actions/trazadocs";
import { ErrorAlert } from "@/components/ui/alert";

const initial: TrazadocsActionState = { error: null };

const CONFIRM_TEXT = "Esta acción eliminará el documento en borrador y sus secciones. No se puede deshacer.";

/** Eliminar borrador (Parte 4, Sprint 9.2). Confirmación clara con
 *  window.confirm — sin librerías nuevas de diálogo. `redirectAfterDelete`
 *  se usa desde /trazadocs/[id] y /trazadocs/[id]/edit (volver al
 *  listado); desde el listado mismo no hace falta (la fila desaparece
 *  sola al revalidar) y se usa `compact` para que quepa en la columna de
 *  acciones. */
export function DeleteDraftButton({
  documentId,
  redirectAfterDelete = false,
  compact = false,
}: {
  documentId: string;
  redirectAfterDelete?: boolean;
  compact?: boolean;
}) {
  const [state, formAction, pending] = useActionState(deleteDraftTrazadocDocumentAction, initial);
  const router = useRouter();

  useEffect(() => {
    if (state.success && redirectAfterDelete) {
      router.push("/trazadocs");
    }
  }, [state.success, redirectAfterDelete, router]);

  if (compact) {
    return (
      <div className="flex flex-col items-end gap-0.5">
        <form
          action={formAction}
          onSubmit={(e) => {
            if (!window.confirm(CONFIRM_TEXT)) e.preventDefault();
          }}
        >
          <input type="hidden" name="document_id" value={documentId} />
          <button type="submit" disabled={pending} className="text-danger hover:underline disabled:opacity-60">
            {pending ? "Eliminando…" : "Eliminar"}
          </button>
        </form>
        {state.error ? <span className="max-w-40 text-right text-danger">{state.error}</span> : null}
      </div>
    );
  }

  return (
    <div className="space-y-2 border-t border-hairline pt-4">
      <ErrorAlert message={state.error} />
      <form
        action={formAction}
        onSubmit={(e) => {
          if (!window.confirm(CONFIRM_TEXT)) e.preventDefault();
        }}
      >
        <input type="hidden" name="document_id" value={documentId} />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-danger/40 bg-danger/5 px-4 py-2 text-sm font-semibold text-danger hover:bg-danger/10 disabled:opacity-60"
        >
          {pending ? "Eliminando…" : "Eliminar borrador"}
        </button>
      </form>
    </div>
  );
}
