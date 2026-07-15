"use client";

import { useActionState } from "react";
import { createTrazadocBlueprintAction, type TrazadocsActionState } from "@/server/actions/trazadocs";
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABEL } from "@/lib/domain/trazadocs";
import { Field, SelectField, TextareaField } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/alert";

const initial: TrazadocsActionState = { error: null };
const TYPE_OPTIONS = DOCUMENT_TYPES.map((t) => ({ value: t, label: DOCUMENT_TYPE_LABEL[t] }));

/** Crear una nueva estructura sugerida (Parte 6, Parte 19). Solo
 *  superadmin — el server action lo vuelve a exigir. */
export function CreateBlueprintForm() {
  const [state, formAction, pending] = useActionState(createTrazadocBlueprintAction, initial);

  return (
    <form action={formAction} className="space-y-4">
      <ErrorAlert message={state.error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" name="name" required />
        <Field label="Código interno" name="code" required hint="Único, en minúsculas y sin espacios." />
      </div>
      <SelectField label="Tipo de documento" name="document_type" options={TYPE_OPTIONS} required />
      <TextareaField label="Descripción" name="description" rows={2} />
      <Button type="submit" disabled={pending} className="!w-auto">
        {pending ? "Creando…" : "Crear estructura sugerida"}
      </Button>
    </form>
  );
}
