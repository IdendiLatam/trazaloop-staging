"use client";

import { useActionState, useState } from "react";
import {
  createImplementationFeedbackAction,
  updateImplementationFeedbackAction,
  type FeedbackActionState,
} from "@/server/actions/implementation";
import {
  MODULE_LABEL,
  CATEGORY_LABEL,
  SEVERITY_LABEL,
  RELATED_ENTITY_LABEL,
  FEEDBACK_MODULES,
  FEEDBACK_CATEGORIES,
  FEEDBACK_SEVERITIES,
  FEEDBACK_RELATED_ENTITY_TYPES,
  type FeedbackModule,
  type FeedbackRelatedEntityType,
} from "@/lib/domain/implementation";
// Import de solo TIPO: se elimina por completo en compilación, así que no
// arrastra el módulo server-only al bundle de cliente.
import type { FeedbackRow } from "@/lib/db/implementation";
import { Field, TextareaField, SelectField } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/alert";

const initial: FeedbackActionState = { error: null };

const MODULE_OPTIONS = FEEDBACK_MODULES.map((m) => ({ value: m, label: MODULE_LABEL[m] }));
const CATEGORY_OPTIONS = FEEDBACK_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }));
const SEVERITY_OPTIONS = FEEDBACK_SEVERITIES.map((s) => ({ value: s, label: SEVERITY_LABEL[s] }));
const RELATED_ENTITY_OPTIONS = FEEDBACK_RELATED_ENTITY_TYPES.map((t) => ({
  value: t,
  label: RELATED_ENTITY_LABEL[t],
}));

/**
 * Formulario de registro/edición de feedback de la prueba real (Parte 6).
 * Sin lenguaje de auditoría formal ni planes de acción: solo errores, dudas
 * o mejoras encontradas durante la prueba con datos reales.
 */
export function FeedbackForm({
  defaultModule,
  defaultRelatedEntityType,
  defaultRelatedEntityId,
}: {
  defaultModule?: FeedbackModule;
  defaultRelatedEntityType?: FeedbackRelatedEntityType;
  defaultRelatedEntityId?: string;
}) {
  const [state, formAction, pending] = useActionState(
    createImplementationFeedbackAction,
    initial
  );
  const [hasRelated, setHasRelated] = useState(Boolean(defaultRelatedEntityType));

  return (
    <form action={formAction} className="space-y-4">
      <ErrorAlert message={state.error} />
      <p className="rounded-md border border-loop/30 bg-loop/5 px-3 py-2 text-sm text-loop-deep">
        Registra errores, dudas o mejoras encontradas durante la prueba real
        con la empresa.
      </p>

      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField
          label="Módulo"
          name="module"
          options={MODULE_OPTIONS}
          defaultValue={defaultModule ?? "implementation"}
          required
        />
        <SelectField
          label="Categoría"
          name="category"
          options={CATEGORY_OPTIONS}
          defaultValue="question"
          required
        />
        <SelectField
          label="Severidad"
          name="severity"
          options={SEVERITY_OPTIONS}
          defaultValue="low"
          required
        />
      </div>

      <Field label="Título" name="title" required maxLength={200} />
      <TextareaField label="Descripción" name="description" required rows={4} />
      <TextareaField
        label="Pasos para reproducir (opcional)"
        name="steps_to_reproduce"
        rows={3}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextareaField label="Resultado esperado (opcional)" name="expected_result" rows={2} />
        <TextareaField label="Resultado actual (opcional)" name="actual_result" rows={2} />
      </div>

      <div className="space-y-3 rounded-md border border-hairline bg-paper p-3">
        <label className="flex items-center gap-2 text-sm font-medium text-ink">
          <input
            type="checkbox"
            checked={hasRelated}
            onChange={(e) => setHasRelated(e.target.checked)}
            className="rounded border-hairline"
          />
          Asociar a una entidad relacionada (opcional)
        </label>
        {hasRelated ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Tipo de entidad"
              name="related_entity_type"
              options={RELATED_ENTITY_OPTIONS}
              defaultValue={defaultRelatedEntityType ?? ""}
              placeholder="— Selecciona —"
              required={hasRelated}
            />
            <Field
              label="Identificador (id)"
              name="related_entity_id"
              defaultValue={defaultRelatedEntityId ?? ""}
              placeholder="uuid"
              required={hasRelated}
            />
          </div>
        ) : null}
      </div>

      <Button type="submit" disabled={pending} className="!w-auto">
        {pending ? "Guardando…" : "Registrar feedback"}
      </Button>
    </form>
  );
}

/** Edición de un feedback existente (Parte 6, punto 6). */
export function FeedbackEditForm({ feedback }: { feedback: FeedbackRow }) {
  const [state, formAction, pending] = useActionState(
    updateImplementationFeedbackAction,
    initial
  );
  const [hasRelated, setHasRelated] = useState(Boolean(feedback.relatedEntityType));

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={feedback.id} />
      <ErrorAlert message={state.error} />

      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField
          label="Módulo"
          name="module"
          options={MODULE_OPTIONS}
          defaultValue={feedback.module}
          required
        />
        <SelectField
          label="Categoría"
          name="category"
          options={CATEGORY_OPTIONS}
          defaultValue={feedback.category}
          required
        />
        <SelectField
          label="Severidad"
          name="severity"
          options={SEVERITY_OPTIONS}
          defaultValue={feedback.severity}
          required
        />
      </div>

      <Field label="Título" name="title" defaultValue={feedback.title} required maxLength={200} />
      <TextareaField
        label="Descripción"
        name="description"
        defaultValue={feedback.description}
        required
        rows={4}
      />
      <TextareaField
        label="Pasos para reproducir (opcional)"
        name="steps_to_reproduce"
        defaultValue={feedback.stepsToReproduce ?? ""}
        rows={3}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextareaField
          label="Resultado esperado (opcional)"
          name="expected_result"
          defaultValue={feedback.expectedResult ?? ""}
          rows={2}
        />
        <TextareaField
          label="Resultado actual (opcional)"
          name="actual_result"
          defaultValue={feedback.actualResult ?? ""}
          rows={2}
        />
      </div>

      <div className="space-y-3 rounded-md border border-hairline bg-paper p-3">
        <label className="flex items-center gap-2 text-sm font-medium text-ink">
          <input
            type="checkbox"
            checked={hasRelated}
            onChange={(e) => setHasRelated(e.target.checked)}
            className="rounded border-hairline"
          />
          Asociar a una entidad relacionada (opcional)
        </label>
        {hasRelated ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Tipo de entidad"
              name="related_entity_type"
              options={RELATED_ENTITY_OPTIONS}
              defaultValue={feedback.relatedEntityType ?? ""}
              placeholder="— Selecciona —"
              required={hasRelated}
            />
            <Field
              label="Identificador (id)"
              name="related_entity_id"
              defaultValue={feedback.relatedEntityId ?? ""}
              placeholder="uuid"
              required={hasRelated}
            />
          </div>
        ) : null}
      </div>

      <Button type="submit" disabled={pending} className="!w-auto">
        {pending ? "Guardando…" : "Guardar cambios"}
      </Button>
    </form>
  );
}
