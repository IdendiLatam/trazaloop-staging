"use client";

import { useActionState } from "react";
import {
  updateTrazadocBlueprintAction,
  updateTrazadocBlueprintStatusAction,
  createTrazadocBlueprintSectionAction,
  updateTrazadocBlueprintSectionAction,
  updateTrazadocBlueprintSectionStatusAction,
  type TrazadocsActionState,
} from "@/server/actions/trazadocs";
import type { PlatformBlueprintDetail, PlatformBlueprintSectionRow } from "@/lib/db/trazadocs-platform";
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABEL } from "@/lib/domain/trazadocs";
import { Field, SelectField, TextareaField } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { ErrorAlert, InfoAlert } from "@/components/ui/alert";
import { HintText } from "@/components/ui/hint-text";
import { HINT_LINK_HELP_TEXT, hasHintContent } from "@/lib/domain/hint-links";
import { useState } from "react";

const initial: TrazadocsActionState = { error: null };
const TYPE_OPTIONS = DOCUMENT_TYPES.map((t) => ({ value: t, label: DOCUMENT_TYPE_LABEL[t] }));

/** Editor de una estructura sugerida y sus secciones/hints (Parte 6,
 *  Parte 19). Solo superadmin edita — support (si llega aquí) ve todo en
 *  modo lectura. */
export function BlueprintDetailEditor({
  blueprint,
  canManage,
}: {
  blueprint: PlatformBlueprintDetail;
  canManage: boolean;
}) {
  const [metaState, metaAction, metaPending] = useActionState(updateTrazadocBlueprintAction, initial);
  const [statusState, statusAction, statusPending] = useActionState(
    updateTrazadocBlueprintStatusAction,
    initial
  );

  return (
    <div className="space-y-8">
      {!canManage ? (
        <InfoAlert message="Tu rol permite consultar esta estructura, pero no modificarla." />
      ) : null}

      <section className="space-y-4 rounded-lg border border-hairline bg-surface p-5">
        <h2 className="text-sm font-semibold">Datos de la estructura</h2>
        <ErrorAlert message={metaState.error} />
        {metaState.success ? <InfoAlert message="Datos actualizados." /> : null}
        <form action={metaAction} className="space-y-4">
          <input type="hidden" name="id" value={blueprint.id} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre" name="name" defaultValue={blueprint.name} disabled={!canManage} required />
            <p className="text-xs text-ink-soft">
              Código: <span className="code">{blueprint.code}</span> (no editable)
            </p>
          </div>
          <SelectField
            label="Tipo de documento"
            name="document_type"
            options={TYPE_OPTIONS}
            defaultValue={blueprint.documentType}
            disabled={!canManage}
          />
          <TextareaField
            label="Descripción"
            name="description"
            rows={2}
            defaultValue={blueprint.description ?? ""}
            disabled={!canManage}
          />
          {canManage ? (
            <Button type="submit" disabled={metaPending} className="!w-auto">
              {metaPending ? "Guardando…" : "Guardar cambios"}
            </Button>
          ) : null}
        </form>

        {canManage ? (
          <form action={statusAction} className="flex items-center gap-3 border-t border-hairline pt-4">
            <input type="hidden" name="id" value={blueprint.id} />
            <input type="hidden" name="status" value={blueprint.status === "active" ? "inactive" : "active"} />
            <ErrorAlert message={statusState.error} />
            <button
              type="submit"
              disabled={statusPending}
              className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm font-medium hover:border-loop disabled:opacity-60"
            >
              {statusPending
                ? "Actualizando…"
                : blueprint.status === "active"
                  ? "Desactivar estructura"
                  : "Activar estructura"}
            </button>
            <span className="text-xs text-ink-soft">
              {blueprint.status === "active"
                ? "Disponible para que las empresas creen documentos con ella."
                : "No disponible para nuevos documentos (los ya creados no se ven afectados)."}
            </span>
          </form>
        ) : null}
      </section>

      <section className="space-y-4">
        <h2 className="eyebrow">Secciones y tips</h2>
        <div className="space-y-3">
          {blueprint.sections.map((s) => (
            <BlueprintSectionRow key={s.id} blueprintId={blueprint.id} section={s} canManage={canManage} />
          ))}
        </div>
        {canManage ? <AddSectionForm blueprintId={blueprint.id} nextOrder={blueprint.sections.length + 1} /> : null}
      </section>
    </div>
  );
}

function BlueprintSectionRow({
  blueprintId,
  section,
  canManage,
}: {
  blueprintId: string;
  section: PlatformBlueprintSectionRow;
  canManage: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateTrazadocBlueprintSectionAction, initial);
  const [statusState, statusAction, statusPending] = useActionState(
    updateTrazadocBlueprintSectionStatusAction,
    initial
  );

  return (
    <div className="space-y-3 rounded-lg border border-hairline bg-surface p-4">
      <ErrorAlert message={state.error ?? statusState.error} />
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="id" value={section.id} />
        <input type="hidden" name="blueprint_id" value={blueprintId} />
        <div className="flex flex-wrap items-center gap-2">
          <Field label="Título" name="title" defaultValue={section.title} disabled={!canManage} required />
          <label className="flex items-center gap-1.5 text-xs text-ink-soft">
            <input
              type="checkbox"
              name="is_required"
              defaultChecked={section.isRequired}
              disabled={!canManage}
            />
            Obligatoria
          </label>
          <span className="code text-xs text-ink-soft">{section.sectionKey}</span>
          <span className="ml-auto text-xs text-ink-soft">
            {section.status === "active" ? "Activa" : "Inactiva"}
          </span>
        </div>
        <HintEditorField
          label="Tip / hint para diligenciar esta sección"
          initialValue={section.hint ?? ""}
          disabled={!canManage}
        />
        {canManage ? (
          <div className="flex items-center gap-2">
            <Button type="submit" disabled={pending} className="!w-auto">
              {pending ? "Guardando…" : "Guardar sección"}
            </Button>
          </div>
        ) : null}
      </form>
      {canManage ? (
        <form action={statusAction} className="border-t border-hairline pt-2">
          <input type="hidden" name="id" value={section.id} />
          <input type="hidden" name="blueprint_id" value={blueprintId} />
          <input type="hidden" name="status" value={section.status === "active" ? "inactive" : "active"} />
          <button
            type="submit"
            disabled={statusPending}
            className="text-xs text-ink-soft hover:underline disabled:opacity-60"
          >
            {statusPending ? "Actualizando…" : section.status === "active" ? "Desactivar sección" : "Activar sección"}
          </button>
        </form>
      ) : null}
    </div>
  );
}

function AddSectionForm({ blueprintId, nextOrder }: { blueprintId: string; nextOrder: number }) {
  const [state, formAction, pending] = useActionState(createTrazadocBlueprintSectionAction, initial);
  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-dashed border-hairline p-4">
      <input type="hidden" name="blueprint_id" value={blueprintId} />
      <input type="hidden" name="sort_order" value={nextOrder} />
      <h3 className="text-sm font-semibold">Agregar sección</h3>
      <ErrorAlert message={state.error} />
      <Field label="Título" name="title" required />
      <HintEditorField label="Tip / hint" initialValue="" disabled={false} />
      <label className="flex items-center gap-1.5 text-xs text-ink-soft">
        <input type="checkbox" name="is_required" defaultChecked />
        Obligatoria
      </label>
      <Button type="submit" disabled={pending} className="!w-auto">
        {pending ? "Agregando…" : "Agregar sección"}
      </Button>
    </form>
  );
}

/** Campo de edición de un tip/hint (T9G §14): mismo textarea de siempre +
 *  ayuda breve del formato de enlaces + vista previa que usa EXACTAMENTE el
 *  mismo renderizador seguro (`HintText`) que ven las empresas en CPR y en
 *  Textiles — nunca un segundo parser solo para la vista previa. */
function HintEditorField({
  label,
  initialValue,
  disabled,
}: {
  label: string;
  initialValue: string;
  disabled: boolean;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <div className="space-y-1.5">
      <TextareaField
        label={label}
        name="hint"
        rows={2}
        defaultValue={initialValue}
        disabled={disabled}
        hint={HINT_LINK_HELP_TEXT}
        onChange={(e) => setValue(e.target.value)}
      />
      {hasHintContent(value) ? (
        <div className="rounded-md border border-loop/20 bg-loop/5 px-3 py-2">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-ink-soft">Vista previa</p>
          <p className="text-xs text-ink-soft">
            <HintText text={value} />
          </p>
        </div>
      ) : null}
    </div>
  );
}
