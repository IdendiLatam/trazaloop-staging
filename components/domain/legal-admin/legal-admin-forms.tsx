"use client";

import { useActionState } from "react";
import {
  createLegalDraftAction, updateLegalDraftAction,
  publishLegalDocumentAction, discardLegalDraftAction,
  type LegalAdminState,
} from "@/server/actions/legal-admin";
import { LEGAL_DOCUMENT_TYPES, LEGAL_DOCUMENT_TYPE_LABEL } from "@/lib/domain/legal";
import { Field, SelectField, TextareaField } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { ErrorAlert, SuccessAlert } from "@/components/ui/alert";

const inicial: LegalAdminState = { error: null };

const TIPOS = LEGAL_DOCUMENT_TYPES.map((t) => ({
  value: t, label: LEGAL_DOCUMENT_TYPE_LABEL[t],
}));

/**
 * Crear una versión NUEVA. Es la única forma de cambiar lo que dice un
 * documento legal: la versión vigente no se corrige.
 */
export function CreateLegalVersionForm({
  defaultType, suggestedVersion, previousContent,
}: {
  defaultType?: string;
  suggestedVersion?: string;
  previousContent?: string;
}) {
  const [state, action, pending] = useActionState(createLegalDraftAction, inicial);

  return (
    <form action={action} className="space-y-4">
      <ErrorAlert message={state.error} />
      {state.ok ? (
        <SuccessAlert message="Versión creada como borrador. Todavía no está vigente y nadie tiene que aceptarla." />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Documento" name="document_type" required
          defaultValue={defaultType ?? ""} placeholder="Elige el documento"
          options={TIPOS} />
        <Field label="Versión" name="version" required
          defaultValue={suggestedVersion ?? ""}
          hint="Identifica esta redacción. No puede repetirse." />
      </div>

      <Field label="Título" name="title" required />
      <TextareaField label="Texto" name="content" rows={16} required
        defaultValue={previousContent ?? ""}
        hint="Si partes de la versión vigente, edítala aquí: la vigente no se toca." />
      <Field label="Nota del cambio" name="change_note"
        hint="Qué cambia respecto de la versión anterior." />

      <Button type="submit" disabled={pending} className="!w-auto">
        {pending ? "Creando…" : "Crear versión como borrador"}
      </Button>
    </form>
  );
}

export function EditLegalDraftForm({
  document,
}: {
  document: { id: string; title: string; content: string; changeNote: string | null };
}) {
  const [state, action, pending] = useActionState(updateLegalDraftAction, inicial);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={document.id} />
      <ErrorAlert message={state.error} />
      {state.ok ? <SuccessAlert message="Borrador guardado." /> : null}
      <Field label="Título" name="title" required defaultValue={document.title} />
      <TextareaField label="Texto" name="content" rows={18} required
        defaultValue={document.content} />
      <Field label="Nota del cambio" name="change_note"
        defaultValue={document.changeNote ?? ""} />
      <Button type="submit" disabled={pending} className="!w-auto">
        {pending ? "Guardando…" : "Guardar borrador"}
      </Button>
    </form>
  );
}

/**
 * Publicar. La confirmación no es una formalidad: al activar esta versión, la
 * anterior se archiva y a TODAS las personas se les vuelve a pedir la
 * aceptación. Y no hay vuelta atrás por la misma puerta — volver al texto
 * anterior también sería publicar una versión.
 */
export function PublishLegalForm({
  documentId, documentTypeLabel, currentVersion,
}: {
  documentId: string;
  documentTypeLabel: string;
  currentVersion: string | null;
}) {
  const [state, action, pending] = useActionState(publishLegalDocumentAction, inicial);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={documentId} />
      <ErrorAlert message={state.error} />
      {state.ok ? (
        <SuccessAlert message="Versión vigente. A partir de ahora se pedirá aceptar esta redacción." />
      ) : null}

      <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
        <p className="text-sm font-medium text-ink">Qué pasa al publicar</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-ink-soft">
          <li>
            {currentVersion
              ? `La versión ${currentVersion} de «${documentTypeLabel}» se archiva y deja de estar vigente.`
              : `«${documentTypeLabel}» pasa a tener versión vigente.`}
          </li>
          <li>
            A todas las personas que ya habían aceptado <strong className="font-medium text-ink">se
            les volverá a pedir</strong> que acepten esta redacción.
          </li>
          <li>El texto archivado se conserva, con las aceptaciones que recibió.</li>
        </ul>
      </div>

      <label className="flex items-start gap-2 text-sm text-ink">
        <input type="checkbox" name="confirm_publish" className="mt-0.5 h-4 w-4 rounded border-hairline" />
        <span>Lo he leído y quiero publicar esta versión.</span>
      </label>

      <Button type="submit" disabled={pending} className="!w-auto">
        {pending ? "Publicando…" : "Publicar esta versión"}
      </Button>
    </form>
  );
}

export function DiscardLegalDraftForm({ documentId }: { documentId: string }) {
  const [state, action, pending] = useActionState(discardLegalDraftAction, inicial);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={documentId} />
      <ErrorAlert message={state.error} />
      <p className="text-sm text-ink-soft">
        Un borrador que nunca se publicó se puede descartar. Lo que estuvo
        vigente, no: se archiva.
      </p>
      <Button type="submit" variant="quiet" disabled={pending} className="!w-auto">
        {pending ? "Descartando…" : "Descartar este borrador"}
      </Button>
    </form>
  );
}
