"use client";

import { useActionState, useState } from "react";
import {
  createFaqEntryAction, saveFaqDraftAction, updateFaqEntryMetaAction,
  publishFaqEntryAction, unpublishFaqEntryAction, restoreFaqRevisionAction,
  createFaqCategoryAction, updateFaqCategoryAction,
  type FaqAdminState,
} from "@/server/actions/faq-admin";
import {
  FAQ_NORMATIVE_LABEL, FAQ_VERIFICATION_LABEL,
} from "@/lib/domain/faq-admin";
import { Field, SelectField, TextareaField } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { ErrorAlert, SuccessAlert } from "@/components/ui/alert";

const inicial: FaqAdminState = { error: null };

type Categoria = { id: string; code: string; label: string };
type Modulo = { key: string; name: string };

const opcionesVisibilidad = [
  { value: "authenticated", label: "Con sesión" },
  { value: "public", label: "Pública · se lee sin sesión" },
];

/** Crear una pregunta. Crear NO publica: nace un borrador (§4). */
export function CreateFaqEntryForm({ categories }: { categories: Categoria[] }) {
  const [state, action, pending] = useActionState(createFaqEntryAction, inicial);
  const [scope, setScope] = useState("global");

  return (
    <form action={action} className="space-y-4">
      <ErrorAlert message={state.error} />
      {state.ok ? <SuccessAlert message="Pregunta creada como borrador. Todavía no la ve nadie." /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Identificador" name="slug" required
          hint="Minúsculas, números y guiones bajos. No cambia aunque cambies la pregunta." />
        <SelectField label="Categoría" name="category_id" required
          placeholder="Elige una categoría"
          options={categories.map((c) => ({ value: c.id, label: c.label }))} />
      </div>

      <Field label="Pregunta" name="question" required />
      <TextareaField label="Respuesta breve" name="answer_short" rows={3} required
        hint="Primero la respuesta corta. El detalle se añade al editar." />

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Visibilidad" name="visibility" options={opcionesVisibilidad}
          defaultValue="authenticated"
          hint="Que sea pública no depende de lo que tenga contratado nadie." />
        <SelectField label="Alcance" name="scope"
          value={scope} onChange={(e) => setScope(e.target.value)}
          options={[
            { value: "global", label: "General · vale para toda la plataforma" },
            { value: "modules", label: "De módulos concretos" },
          ]} />
      </div>

      <Button type="submit" disabled={pending} className="!w-auto">
        {pending ? "Creando…" : "Crear borrador"}
      </Button>
    </form>
  );
}

/**
 * El editor del borrador. Guardar aquí NO toca lo publicado: escribe en la
 * tabla de borradores, que es otra (§5).
 */
export function FaqDraftForm({
  entryId, draft, isSecurity,
}: {
  entryId: string;
  draft: {
    question: string; answerShort: string; answerLong: string | null;
    normativeClass: string; verificationStatus: string;
    sourceBasis: string | null; verificationNote: string | null;
    externalSourceUrl: string | null; externalSourceCheckedOn: string | null;
    changeNote: string | null;
  } | null;
  isSecurity: boolean;
}) {
  const [state, action, pending] = useActionState(saveFaqDraftAction, inicial);
  const [verificacion, setVerificacion] = useState(
    draft?.verificationStatus ?? "not_verified");

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="entry_id" value={entryId} />
      <ErrorAlert message={state.error} />
      {state.ok ? <SuccessAlert message="Borrador guardado. Lo publicado no ha cambiado." /> : null}

      <section className="space-y-4">
        <h3 className="eyebrow">Lo que se va a leer</h3>
        <Field label="Pregunta" name="question" required defaultValue={draft?.question ?? ""} />
        <TextareaField label="Respuesta breve" name="answer_short" rows={4} required
          defaultValue={draft?.answerShort ?? ""}
          hint="Primero lo corto. Quien pregunta quiere la respuesta, no el contexto." />
        <TextareaField label="Detalle (opcional)" name="answer_long" rows={8}
          defaultValue={draft?.answerLong ?? ""} />
      </section>

      <section className="space-y-4 rounded-lg border border-hairline bg-paper p-4">
        <div>
          <h3 className="eyebrow">Procedencia · no se publica</h3>
          <p className="mt-1 text-xs text-ink-soft">
            Nada de este bloque sale por la FAQ. Sirve para que dentro de un año
            se pueda comprobar lo que hoy se afirma.
          </p>
        </div>

        {isSecurity ? (
          <p role="status" className="rounded-md border border-loop/30 bg-loop/5 p-3 text-sm text-ink-soft">
            Esta respuesta habla de seguridad o privacidad. Antes de publicarla,
            deja escrito en qué se apoya.
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Estado de verificación" name="verification_status"
            value={verificacion} onChange={(e) => setVerificacion(e.target.value)}
            options={Object.entries(FAQ_VERIFICATION_LABEL)
              .map(([value, label]) => ({ value, label }))} />
          <SelectField label="Cercanía a una afirmación normativa" name="normative_class"
            defaultValue={draft?.normativeClass ?? "safe"}
            options={Object.entries(FAQ_NORMATIVE_LABEL)
              .map(([value, label]) => ({ value, label }))} />
        </div>

        <TextareaField label="En qué se apoya" name="source_basis" rows={2}
          defaultValue={draft?.sourceBasis ?? ""}
          hint="Migración, política, archivo o medición. Dónde se comprobó." />

        <TextareaField
          label={verificacion === "verified_with_qualifier"
            ? "Salvedad (obligatoria)" : "Salvedad"}
          name="verification_note" rows={2}
          defaultValue={draft?.verificationNote ?? ""}
          hint={verificacion === "verified_with_qualifier"
            ? "Una salvedad que no se escribe no es una salvedad: sin esto no se puede publicar."
            : "Lo que hay que decir junto a la respuesta para que no engañe."} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Política externa (URL)" name="external_source_url"
            defaultValue={draft?.externalSourceUrl ?? ""}
            hint="Si la respuesta depende de lo que hace un tercero." />
          <Field label="Comprobada el" name="external_source_checked_on" type="date"
            defaultValue={draft?.externalSourceCheckedOn ?? ""}
            hint="Sin fecha no se sabe cuándo dejó de ser cierta." />
        </div>
      </section>

      <Field label="Nota del cambio" name="change_note"
        defaultValue={draft?.changeNote ?? ""}
        hint="Qué cambia respecto de lo publicado, y por qué." />

      <Button type="submit" disabled={pending} className="!w-auto">
        {pending ? "Guardando…" : "Guardar borrador"}
      </Button>
    </form>
  );
}

/** Categoría, visibilidad, orden, destacada y a qué módulos se refiere. */
export function FaqEntryMetaForm({
  entry, categories, modules,
}: {
  entry: {
    id: string; categoryCode: string; visibility: string; scope: string;
    moduleKeys: string[]; sortOrder: number; isFeatured: boolean;
  };
  categories: Categoria[];
  modules: Modulo[];
}) {
  const [state, action, pending] = useActionState(updateFaqEntryMetaAction, inicial);
  const [scope, setScope] = useState(entry.scope);
  const actual = categories.find((c) => c.code === entry.categoryCode);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="entry_id" value={entry.id} />
      <ErrorAlert message={state.error} />
      {state.ok ? <SuccessAlert message="Guardado." /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Categoría" name="category_id" required
          defaultValue={actual?.id ?? ""}
          options={categories.map((c) => ({ value: c.id, label: c.label }))} />
        <SelectField label="Visibilidad" name="visibility"
          defaultValue={entry.visibility} options={opcionesVisibilidad} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Alcance" name="scope" value={scope}
          onChange={(e) => setScope(e.target.value)}
          options={[
            { value: "global", label: "General" },
            { value: "modules", label: "De módulos concretos" },
          ]} />
        <Field label="Orden" name="sort_order" type="number"
          defaultValue={String(entry.sortOrder)}
          hint="Menor es antes, dentro de su categoría." />
      </div>

      {scope === "modules" ? (
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium text-ink">Módulos a los que se refiere</legend>
          <p className="text-xs text-ink-soft">
            Decir de qué módulo habla no exige tenerlo contratado para leerla.
          </p>
          <div className="flex flex-wrap gap-3">
            {modules.map((m) => (
              <label key={m.key} className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" name="module_keys" value={m.key}
                  defaultChecked={entry.moduleKeys.includes(m.key)}
                  className="h-4 w-4 rounded border-hairline" />
                {m.name}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" name="is_featured" defaultChecked={entry.isFeatured}
          className="h-4 w-4 rounded border-hairline" />
        Destacada
      </label>

      <Button type="submit" disabled={pending} className="!w-auto">
        {pending ? "Guardando…" : "Guardar"}
      </Button>
    </form>
  );
}

/** Publicar. El botón se ofrece siempre; quien decide es la base (§7). */
export function PublishFaqForm({
  entryId, blockReason, hasPendingDraft,
}: { entryId: string; blockReason: string | null; hasPendingDraft: boolean }) {
  const [state, action, pending] = useActionState(publishFaqEntryAction, inicial);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="entry_id" value={entryId} />
      <ErrorAlert message={state.error} />
      {state.ok ? <SuccessAlert message="Publicado. La versión anterior queda cerrada en la historia." /> : null}

      {blockReason ? (
        <p role="status" className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-ink-soft">
          {blockReason}
        </p>
      ) : null}

      <Field label="Nota del cambio" name="change_note"
        hint="Se guarda con la versión publicada. Aparece en la historia." />
      <Button type="submit" disabled={pending} className="!w-auto">
        {pending ? "Publicando…" : hasPendingDraft ? "Publicar los cambios" : "Publicar"}
      </Button>
    </form>
  );
}

export function UnpublishFaqForm({ entryId }: { entryId: string }) {
  const [state, action, pending] = useActionState(unpublishFaqEntryAction, inicial);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="entry_id" value={entryId} />
      <ErrorAlert message={state.error} />
      <p className="text-sm text-ink-soft">
        Retirar deja de mostrarla. <strong className="font-medium text-ink">No borra nada</strong>:
        el texto y su historia se conservan, y se puede volver a publicar.
      </p>
      <Button type="submit" variant="quiet" disabled={pending} className="!w-auto">
        {pending ? "Retirando…" : "Retirar de la FAQ"}
      </Button>
    </form>
  );
}

/** Recuperar una versión antigua: la copia al borrador, no la reabre (§13). */
export function RestoreFaqRevisionForm({
  entryId, revisionId, revisionNumber,
}: { entryId: string; revisionId: string; revisionNumber: number }) {
  const [state, action, pending] = useActionState(restoreFaqRevisionAction, inicial);
  return (
    <form action={action} className="inline">
      <input type="hidden" name="entry_id" value={entryId} />
      <input type="hidden" name="revision_id" value={revisionId} />
      {state.error ? <span className="mr-2 text-xs text-red-600">{state.error}</span> : null}
      <button type="submit" disabled={pending}
        className="text-xs font-medium text-loop hover:underline disabled:opacity-50">
        {pending ? "Recuperando…" : `Recuperar la versión ${revisionNumber} como borrador`}
      </button>
    </form>
  );
}

export function CreateFaqCategoryForm() {
  const [state, action, pending] = useActionState(createFaqCategoryAction, inicial);
  return (
    <form action={action} className="space-y-4">
      <ErrorAlert message={state.error} />
      {state.ok ? <SuccessAlert message="Categoría creada." /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Identificador" name="code" required hint="Minúsculas, sin espacios. No cambia." />
        <Field label="Nombre" name="label" required />
      </div>
      <Field label="Descripción" name="description" />
      <Field label="Orden" name="sort_order" type="number" defaultValue="100" />
      <Button type="submit" disabled={pending} className="!w-auto">
        {pending ? "Creando…" : "Crear categoría"}
      </Button>
    </form>
  );
}

export function EditFaqCategoryForm({
  category,
}: {
  category: {
    id: string; code: string; label: string; description: string | null;
    sortOrder: number; status: string; entries: number;
  };
}) {
  const [state, action, pending] = useActionState(updateFaqCategoryAction, inicial);
  const [status, setStatus] = useState(category.status);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={category.id} />
      <ErrorAlert message={state.error} />
      {state.ok ? <SuccessAlert message="Guardado." /> : null}

      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Nombre" name="label" defaultValue={category.label} required />
        <Field label="Descripción" name="description" defaultValue={category.description ?? ""} />
        <Field label="Orden" name="sort_order" type="number" defaultValue={String(category.sortOrder)} />
        <SelectField label="Estado" name="status" value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={[
            { value: "active", label: "Activa" },
            { value: "inactive", label: "Retirada" },
          ]} />
      </div>

      {status === "inactive" && category.entries > 0 ? (
        <label className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-ink">
          <input type="checkbox" name="confirm_inactive" className="mt-0.5 h-4 w-4 rounded border-hairline" />
          <span>
            Esta categoría tiene {category.entries} pregunta(s). Si la retiras dejarán
            de verse, aunque estén publicadas. Confirmo que es lo que quiero.
          </span>
        </label>
      ) : null}

      <Button type="submit" variant="quiet" disabled={pending} className="!w-auto">
        {pending ? "Guardando…" : "Guardar"}
      </Button>
    </form>
  );
}
