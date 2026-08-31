"use client";

import { useActionState, useState } from "react";
import {
  createHelpItemAction, saveHelpDraftAction, publishHelpItemAction,
  unpublishHelpItemAction, restoreHelpRevisionAction, type HelpAdminState,
} from "@/server/actions/help-admin";
import { Field, SelectField, TextareaField } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { ErrorAlert, SuccessAlert } from "@/components/ui/alert";
import { HELP_NORMATIVE_LABEL, HELP_TARGET_KIND_LABEL } from "@/lib/domain/contextual-help";

const inicial: HelpAdminState = { error: null };

const TIPOS = Object.entries(HELP_TARGET_KIND_LABEL)
  .map(([value, label]) => ({ value, label }));
const NORMATIVAS = Object.entries(HELP_NORMATIVE_LABEL)
  .map(([value, label]) => ({ value, label }));

export function CreateHelpItemForm({
  pages,
}: { pages: { key: string; label: string }[] }) {
  const [state, action, pending] = useActionState(createHelpItemAction, inicial);
  const [tipo, setTipo] = useState("section");

  return (
    <form action={action} className="space-y-4">
      <ErrorAlert message={state.error} />
      {state.ok ? (
        <SuccessAlert message="Ayuda creada como borrador. Todavía no aparece en el producto." />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Pantalla" name="page_key" required
          placeholder="Elige la pantalla"
          options={pages.map((p) => ({ value: p.key, label: p.label }))}
          hint="La pantalla no se identifica por su dirección: si mañana cambia la URL, la ayuda no se mueve." />
        <SelectField label="Qué explica" name="target_kind" value={tipo}
          onChange={(e) => setTipo(e.target.value)} options={TIPOS} />
      </div>

      {tipo !== "page" ? (
        <Field label="Identificador del elemento" name="target_key" required
          hint="Minúsculas y guiones bajos. Es como lo llama la pantalla, no lo que se lee." />
      ) : null}

      <Field label="Título" name="title" required
        hint="Lo que encabeza el panel del botón «i»." />
      <TextareaField label="Qué es" name="explanation" rows={4} required
        hint="La explicación, en lenguaje llano. Es lo único obligatorio." />

      <Button type="submit" disabled={pending} className="!w-auto">
        {pending ? "Creando…" : "Crear borrador"}
      </Button>
    </form>
  );
}

/** Editar el borrador. Nunca toca lo publicado: escribe en otra tabla. */
export function HelpDraftForm({
  helpItemId, draft,
}: {
  helpItemId: string;
  draft: {
    title: string; explanation: string; example: string | null;
    technicalReference: string | null; doNotInvent: string | null;
    normativeClass: string; changeNote: string | null;
  } | null;
}) {
  const [state, action, pending] = useActionState(saveHelpDraftAction, inicial);

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="help_item_id" value={helpItemId} />
      <ErrorAlert message={state.error} />
      {state.ok ? <SuccessAlert message="Borrador guardado. Lo publicado no ha cambiado." /> : null}

      <section className="space-y-4">
        <h3 className="eyebrow">Lo que se lee al pulsar la «i»</h3>
        <Field label="Título" name="title" required defaultValue={draft?.title ?? ""} />
        <TextareaField label="Qué es" name="explanation" rows={4} required
          defaultValue={draft?.explanation ?? ""}
          hint="Lo único obligatorio. En lenguaje llano, sin vocabulario interno." />
        <TextareaField label="Ejemplo" name="example" rows={3}
          defaultValue={draft?.example ?? ""}
          hint="Un caso concreto. Si no hay uno bueno, se deja vacío: un ejemplo inventado es peor que ninguno." />
        <TextareaField label="Respaldo" name="technical_reference" rows={3}
          defaultValue={draft?.technicalReference ?? ""}
          hint="La referencia normativa, COMO referencia. «Relacionado con ISO 9001:2015, 6.1» sí; «esto garantiza el cumplimiento», no." />
      </section>

      <section className="space-y-4 rounded-lg border border-hairline bg-paper p-4">
        <div>
          <h3 className="eyebrow">Solo para la plataforma</h3>
          <p className="mt-1 text-xs text-ink-soft">
            Nada de este bloque llega al producto.
          </p>
        </div>
        <SelectField label="Cercanía a una afirmación normativa" name="normative_class"
          defaultValue={draft?.normativeClass ?? "safe"} options={NORMATIVAS} />
        <TextareaField label="Qué no se puede inventar" name="do_not_invent" rows={2}
          defaultValue={draft?.doNotInvent ?? ""}
          hint="Lo que nadie —persona ni modelo— debería rellenar sin un dato que lo respalde." />
      </section>

      <Field label="Nota del cambio" name="change_note"
        defaultValue={draft?.changeNote ?? ""} />

      <Button type="submit" disabled={pending} className="!w-auto">
        {pending ? "Guardando…" : "Guardar borrador"}
      </Button>
    </form>
  );
}

export function PublishHelpForm({
  helpItemId, hasPendingDraft,
}: { helpItemId: string; hasPendingDraft: boolean }) {
  const [state, action, pending] = useActionState(publishHelpItemAction, inicial);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="help_item_id" value={helpItemId} />
      <ErrorAlert message={state.error} />
      {state.ok ? (
        <SuccessAlert message="Publicado. Ya aparece en la pantalla, y la versión anterior queda en la historia." />
      ) : null}
      <Field label="Nota del cambio" name="change_note"
        hint="Se guarda con la versión publicada." />
      <Button type="submit" disabled={pending} className="!w-auto">
        {pending ? "Publicando…" : hasPendingDraft ? "Publicar los cambios" : "Publicar"}
      </Button>
    </form>
  );
}

export function UnpublishHelpForm({ helpItemId }: { helpItemId: string }) {
  const [state, action, pending] = useActionState(unpublishHelpItemAction, inicial);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="help_item_id" value={helpItemId} />
      <ErrorAlert message={state.error} />
      <p className="text-sm text-ink-soft">
        Retirar hace que el botón «i» deje de aparecer en esa pantalla.{" "}
        <strong className="font-medium text-ink">No borra nada</strong>: el texto
        y su historia se conservan.
      </p>
      <Button type="submit" variant="quiet" disabled={pending} className="!w-auto">
        {pending ? "Retirando…" : "Retirar del producto"}
      </Button>
    </form>
  );
}

export function RestoreHelpRevisionForm({
  helpItemId, revisionId, revisionNumber,
}: { helpItemId: string; revisionId: string; revisionNumber: number }) {
  const [state, action, pending] = useActionState(restoreHelpRevisionAction, inicial);
  return (
    <form action={action} className="inline">
      <input type="hidden" name="help_item_id" value={helpItemId} />
      <input type="hidden" name="revision_id" value={revisionId} />
      {state.error ? <span className="mr-2 text-xs text-red-600">{state.error}</span> : null}
      <button type="submit" disabled={pending}
        className="text-xs font-medium text-loop hover:underline disabled:opacity-50">
        {pending ? "Recuperando…" : `Recuperar la versión ${revisionNumber} como borrador`}
      </button>
    </form>
  );
}
