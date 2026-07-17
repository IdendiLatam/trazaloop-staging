"use client";

import { useActionState } from "react";
import { updateLiveDocumentCategoryAction } from "@/server/actions/trazadocs-master";
import { CATEGORY_CODES, CATEGORY_LABEL } from "@/lib/domain/trazadocs-master";
import { SelectField } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/alert";

const initial = { error: null as string | null };
const CATEGORY_OPTIONS = CATEGORY_CODES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }));

/** Categoría del documento en el Maestro de documentos (Sprint 10B,
 *  Parte 17). Sigue la MISMA regla de estado que el resto de los datos
 *  del documento (RLS de trazadoc_documents, 0047): solo se puede
 *  cambiar mientras el documento está en borrador o en revisión — un
 *  documento aprobado nunca se edita directamente, tampoco su
 *  categoría. Por eso este formulario solo se muestra cuando `canEdit`
 *  es verdadero, igual que el editor de contenido. */
export function LiveDocumentCategoryForm({ documentId, categoryCode }: { documentId: string; categoryCode: string }) {
  const [state, formAction, pending] = useActionState(updateLiveDocumentCategoryAction, initial);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2 rounded-lg border border-hairline bg-surface p-3">
      <input type="hidden" name="document_id" value={documentId} />
      <div className="min-w-[14rem]">
        <SelectField label="Categoría en el Maestro de documentos" name="category_code" options={CATEGORY_OPTIONS} defaultValue={categoryCode} />
      </div>
      <Button type="submit" disabled={pending} className="!w-auto">
        {pending ? "Guardando…" : "Guardar categoría"}
      </Button>
      {state.error ? (
        <div className="w-full">
          <ErrorAlert message={state.error} />
        </div>
      ) : null}
    </form>
  );
}
