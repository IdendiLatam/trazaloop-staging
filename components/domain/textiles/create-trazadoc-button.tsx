"use client";

import { useActionState } from "react";
import {
  createTextileTrazadocFromTemplateAction,
  type TextileTrazadocsActionState,
} from "@/server/actions/textiles-trazadocs";

/** Trazaloop · Sprint T8 (Textil) · Crear documento desde estructura base. */
export function CreateTextileTrazadocButton({ blueprintId }: { blueprintId: string }) {
  const [state, action, pending] = useActionState<TextileTrazadocsActionState, FormData>(
    createTextileTrazadocFromTemplateAction,
    { error: null }
  );
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="blueprint_id" value={blueprintId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-loop px-3 py-1.5 text-xs font-medium text-paper transition-colors hover:bg-loop-deep disabled:opacity-60"
      >
        {pending ? "Creando…" : "Crear documento"}
      </button>
      {state.error ? <span className="max-w-[16rem] text-right text-[11px] text-danger">{state.error}</span> : null}
    </form>
  );
}
