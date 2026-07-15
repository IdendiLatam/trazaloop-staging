"use client";

import { useActionState } from "react";
import {
  updateDocumentSectionsAction,
  addCustomSectionAction,
  type TrazadocsActionState,
} from "@/server/actions/trazadocs";
import { SectionEditor } from "./section-editor";
import type { DocumentDetail } from "@/lib/db/trazadocs";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { ErrorAlert, InfoAlert } from "@/components/ui/alert";

const initial: TrazadocsActionState = { error: null };

/** Editor por secciones (Parte 7/18). `hints` es un mapa
 *  blueprint_section_id → tip, ya resuelto en el servidor (las secciones
 *  personalizadas no tienen hint). */
export function DocumentEditor({
  document,
  hints,
  readOnly,
}: {
  document: DocumentDetail;
  hints: Record<string, string | null>;
  readOnly: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateDocumentSectionsAction, initial);
  const [sectionState, sectionFormAction, sectionPending] = useActionState(addCustomSectionAction, initial);

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="document_id" value={document.id} />
        <ErrorAlert message={state.error} />
        {state.success ? <InfoAlert message="Contenido guardado." /> : null}

        <div className="space-y-4">
          {document.sections.map((s) => (
            <SectionEditor
              key={s.id}
              section={s}
              hint={s.blueprintSectionId ? hints[s.blueprintSectionId] ?? null : null}
              readOnly={readOnly}
            />
          ))}
        </div>

        {!readOnly ? (
          <Button type="submit" disabled={pending} className="!w-auto">
            {pending ? "Guardando…" : "Guardar cambios"}
          </Button>
        ) : (
          <p className="text-sm text-ink-soft">
            Este documento no se puede editar en su estado actual.
          </p>
        )}
      </form>

      {!readOnly ? (
        <form
          action={sectionFormAction}
          className="space-y-3 rounded-lg border border-dashed border-hairline p-4"
        >
          <input type="hidden" name="document_id" value={document.id} />
          <input type="hidden" name="sort_order" value={document.sections.length + 1} />
          <h3 className="text-sm font-semibold">Agregar sección personalizada</h3>
          <ErrorAlert message={sectionState.error} />
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1">
              <Field label="Título de la sección" name="title" />
            </div>
            <Button type="submit" disabled={sectionPending} className="!w-auto">
              {sectionPending ? "Agregando…" : "Agregar sección"}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
