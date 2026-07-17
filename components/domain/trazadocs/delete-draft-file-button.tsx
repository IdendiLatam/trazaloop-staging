"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { deleteDraftFileDocumentAction, type MasterActionState } from "@/server/actions/trazadocs-master";
import { ErrorAlert } from "@/components/ui/alert";

const initial: MasterActionState = { error: null };

const CONFIRM_TEXT = "Esta acción eliminará el documento y su archivo. No se puede deshacer.";

/** Eliminar borrador de documento descargable — mismo patrón que
 *  DeleteDraftButton (TrazaDocs vivo). */
export function DeleteDraftFileButton({
  documentId,
  compact = false,
}: {
  documentId: string;
  compact?: boolean;
}) {
  const [state, formAction, pending] = useActionState(deleteDraftFileDocumentAction, initial);
  const router = useRouter();

  useEffect(() => {
    if (state.success && !compact) {
      router.push("/trazadocs/master");
    }
  }, [state.success, compact, router]);

  if (compact) {
    return (
      <div className="flex flex-col items-end gap-0.5">
        <form
          action={formAction}
          onSubmit={(e) => {
            if (!window.confirm(CONFIRM_TEXT)) e.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={documentId} />
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
        <input type="hidden" name="id" value={documentId} />
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
