"use client";

import { useActionState } from "react";
import {
  createDocumentFromBlueprintAction,
  createCustomDocumentAction,
  type TrazadocsActionState,
} from "@/server/actions/trazadocs";
import type { BlueprintSummaryRow } from "@/lib/db/trazadocs";
import { DOCUMENT_TYPE_LABEL } from "@/lib/domain/trazadocs";
import { Field, TextareaField } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/alert";

const initial: TrazadocsActionState = { error: null };

/** Elegir estructura sugerida o crear documento libre (Parte 8). Nunca se
 *  llaman "plantillas descargables": son estructuras sugeridas dentro de
 *  la plataforma. */
export function BlueprintPicker({ blueprints }: { blueprints: BlueprintSummaryRow[] }) {
  const [state, formAction, pending] = useActionState(createDocumentFromBlueprintAction, initial);
  const [customState, customFormAction, customPending] = useActionState(createCustomDocumentAction, initial);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Documentos guiados sugeridos</h2>
        <p className="text-xs text-ink-soft">
          Estructuras sugeridas por Trazaloop, con secciones y ayudas ya definidas. Tú diligencias
          el contenido de cada empresa.
        </p>
        <ErrorAlert message={state.error} />
        <div className="grid gap-3 sm:grid-cols-2">
          {blueprints.map((bp) => (
            <form key={bp.blueprintId} action={formAction}>
              <input type="hidden" name="blueprint_id" value={bp.blueprintId} />
              <button
                type="submit"
                disabled={pending}
                className="flex w-full flex-col items-start gap-1 rounded-lg border border-hairline bg-surface p-4 text-left transition-colors hover:border-loop disabled:opacity-60"
              >
                <span className="text-xs text-ink-soft">{DOCUMENT_TYPE_LABEL[bp.documentType]}</span>
                <span className="font-medium">{bp.name}</span>
                {bp.description ? <span className="text-xs text-ink-soft">{bp.description}</span> : null}
                <span className="mt-1 text-xs text-loop">{bp.sectionsCount} secciones sugeridas →</span>
              </button>
            </form>
          ))}
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-hairline bg-surface p-5">
        <h2 className="text-sm font-semibold">Documento libre</h2>
        <p className="text-xs text-ink-soft">
          Crea un documento con el nombre que quieras y arma tus propias secciones.
        </p>
        <form action={customFormAction} className="space-y-4">
          <ErrorAlert message={customState.error} />
          <Field
            label="Nombre del documento"
            name="title"
            required
            placeholder="Procedimiento interno de inspección visual de material recuperado"
          />
          <Field label="Código interno (opcional)" name="code" />
          <TextareaField label="Descripción (opcional)" name="description" rows={3} />
          <Button type="submit" disabled={customPending} className="!w-auto">
            {customPending ? "Creando…" : "Crear documento libre"}
          </Button>
        </form>
      </section>
    </div>
  );
}
