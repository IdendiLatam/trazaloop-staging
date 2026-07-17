"use client";

import { useActionState } from "react";
import {
  updateFileDocumentMetadataAction,
  replaceFileDocumentFileAction,
  type MasterActionState,
} from "@/server/actions/trazadocs-master";
import { CATEGORY_CODES, CATEGORY_LABEL } from "@/lib/domain/trazadocs-master";
import { Field, SelectField } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { ErrorAlert, InfoAlert } from "@/components/ui/alert";

const initial: MasterActionState = { error: null };
const CATEGORY_OPTIONS = CATEGORY_CODES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }));

export function FileDocumentEditForm({
  documentId,
  title,
  code,
  categoryCode,
  description,
  editable,
}: {
  documentId: string;
  title: string;
  code: string | null;
  categoryCode: string;
  description: string | null;
  editable: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateFileDocumentMetadataAction, initial);

  if (!editable) {
    return <InfoAlert message="Este documento no está en borrador o en revisión: sus datos no se pueden editar directamente." />;
  }

  return (
    <form action={formAction} className="space-y-4 rounded-lg border border-hairline bg-surface p-4">
      <input type="hidden" name="id" value={documentId} />
      <h3 className="text-sm font-semibold">Datos del documento</h3>
      <ErrorAlert message={state.error} />
      <Field label="Título" name="title" defaultValue={title} required />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Código (opcional)" name="code" defaultValue={code ?? ""} />
        <SelectField label="Categoría" name="category_code" options={CATEGORY_OPTIONS} defaultValue={categoryCode} />
      </div>
      <Field label="Descripción (opcional)" name="description" defaultValue={description ?? ""} />
      <Button type="submit" disabled={pending} className="!w-auto">
        {pending ? "Guardando…" : "Guardar cambios"}
      </Button>
    </form>
  );
}

export function ReplaceFileDocumentForm({ documentId }: { documentId: string }) {
  const [state, formAction, pending] = useActionState(replaceFileDocumentFileAction, initial);

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-hairline bg-surface p-4">
      <input type="hidden" name="id" value={documentId} />
      <h3 className="text-sm font-semibold">Reemplazar archivo</h3>
      <p className="text-xs text-ink-soft">
        Sube una nueva versión del archivo. Si el documento estaba aprobado, la nueva versión queda
        en borrador — nunca se sobrescribe silenciosamente un archivo ya aprobado.
      </p>
      <ErrorAlert message={state.error} />
      <input
        type="file"
        name="file"
        required
        accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.webp"
        className="block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink file:mr-3 file:rounded file:border-0 file:bg-paper file:px-3 file:py-1.5 file:text-sm"
      />
      <Field label="Nota de cambio (opcional)" name="note" placeholder="Se corrige la versión con el cambio solicitado." />
      <Button type="submit" disabled={pending} className="!w-auto">
        {pending ? "Subiendo…" : "Reemplazar archivo"}
      </Button>
    </form>
  );
}
