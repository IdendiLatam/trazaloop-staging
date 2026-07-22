"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ErrorAlert, InfoAlert } from "@/components/ui/alert";
import {
  emptyFieldValues,
  CatalogSelect,
  type CatalogFieldDef,
} from "@/components/domain/textiles/catalog-manager";

/**
 * Trazaloop · Sprint T4 (Textil) · Formulario genérico de entidad
 * (crear o editar). Reutiliza la definición de campos del gestor de
 * catálogos T3; las server actions llegan por props. La UI solo guía —
 * validación real en actions + RLS.
 *
 * Sprint T9E: los selects arrancan en su primera opción real (visual =
 * estado = envío) — regla uniforme de emptyFieldValues/CatalogSelect.
 */

type ActionResult = { error: string | null };

export function TextileEntityForm<TInput extends Record<string, unknown>>({
  title,
  fields,
  initialValues,
  fixedValues,
  submitLabel,
  entityId,
  createAction,
  updateAction,
  successMessage,
}: {
  title: string;
  fields: CatalogFieldDef[];
  initialValues?: Record<string, string | boolean>;
  /** Valores fijados por el servidor (p. ej. productId) que se mezclan al enviar. */
  fixedValues?: Record<string, string | boolean>;
  submitLabel: string;
  entityId?: string;
  createAction?: (input: TInput) => Promise<ActionResult>;
  updateAction?: (id: string, input: TInput) => Promise<ActionResult>;
  successMessage?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const emptyValues = (): Record<string, string | boolean> => ({
    ...emptyFieldValues(fields),
    ...(initialValues ?? {}),
  });
  const [values, setValues] = useState<Record<string, string | boolean>>(emptyValues);

  function submit() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const input = { ...values, ...(fixedValues ?? {}) } as unknown as TInput;
      const res =
        entityId && updateAction
          ? await updateAction(entityId, input)
          : createAction
            ? await createAction(input)
            : { error: "Acción no configurada." };
      if (res.error) {
        setError(res.error);
        return;
      }
      setNotice(successMessage ?? "Guardado.");
      if (!entityId) setValues(emptyValues());
      router.refresh();
    });
  }

  return (
    <section className="space-y-3 rounded-lg border border-hairline bg-surface p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      <ErrorAlert message={error} />
      {notice ? <InfoAlert message={notice} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((f) => (
          <label key={f.key} className="space-y-1 text-sm">
            <span className="font-medium">
              {f.label}
              {f.required ? <span className="text-danger"> *</span> : null}
            </span>
            {f.type === "text" ? (
              <input
                type="text"
                value={String(values[f.key] ?? "")}
                disabled={pending}
                placeholder={f.placeholder}
                onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                className="w-full rounded-md border border-hairline bg-paper px-3 py-1.5"
              />
            ) : null}
            {f.type === "select" ? (
              <CatalogSelect
                field={f}
                value={String(values[f.key] ?? "")}
                disabled={pending}
                onChange={(value) => setValues((prev) => ({ ...prev, [f.key]: value }))}
              />
            ) : null}
            {f.type === "checkbox" ? (
              <span className="flex items-center gap-2 py-1.5">
                <input
                  type="checkbox"
                  checked={Boolean(values[f.key])}
                  disabled={pending}
                  onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.checked }))}
                />
                <span className="text-xs text-ink-soft">{f.help ?? "Sí"}</span>
              </span>
            ) : null}
            {f.type !== "checkbox" && f.help ? (
              <span className="block text-xs text-ink-soft">{f.help}</span>
            ) : null}
          </label>
        ))}
      </div>
      <Button type="button" disabled={pending} onClick={submit} className="w-fit">
        {submitLabel}
      </Button>
    </section>
  );
}
