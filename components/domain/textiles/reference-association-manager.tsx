"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/alert";
import {
  emptyFieldValues,
  CatalogSelect,
  type CatalogFieldDef,
} from "@/components/domain/textiles/catalog-manager";

/**
 * Trazaloop · Sprint T4 (Textil) · Gestor genérico de filas asociadas a
 * una referencia/SKU (composición de fibras, materiales y componentes):
 * agregar, editar y eliminar. Las server actions llegan por props; la
 * eliminación es física (RLS decide qué roles pueden) y el servidor
 * recalcula el estado de composición cuando aplica.
 *
 * Sprint T9E: los selects arrancan en su primera opción real (visual =
 * estado = envío) — regla uniforme de emptyFieldValues/CatalogSelect.
 */

export type AssociationRowView = {
  id: string;
  title: string;
  display: string[];
  formValues: Record<string, string | boolean>;
};

type ActionResult = { error: string | null };

export function ReferenceAssociationManager<TInput extends Record<string, unknown>>({
  referenceId,
  entityLabel,
  fields,
  rows,
  addAction,
  updateAction,
  removeAction,
}: {
  referenceId: string;
  entityLabel: string;
  fields: CatalogFieldDef[];
  rows: AssociationRowView[];
  addAction: (referenceId: string, input: TInput) => Promise<ActionResult>;
  updateAction: (rowId: string, referenceId: string, input: TInput) => Promise<ActionResult>;
  removeAction: (rowId: string, referenceId: string) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const emptyValues = (): Record<string, string | boolean> => emptyFieldValues(fields);
  const [values, setValues] = useState<Record<string, string | boolean>>(emptyValues);

  function startCreate() {
    setEditingId(null);
    setValues(emptyValues());
    setError(null);
  }

  function startEdit(row: AssociationRowView) {
    setEditingId(row.id);
    setValues({ ...emptyValues(), ...row.formValues });
    setError(null);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const input = values as unknown as TInput;
      const res = editingId
        ? await updateAction(editingId, referenceId, input)
        : await addAction(referenceId, input);
      if (res.error) {
        setError(res.error);
        return;
      }
      startCreate();
      router.refresh();
    });
  }

  function remove(row: AssociationRowView) {
    setError(null);
    startTransition(async () => {
      const res = await removeAction(row.id, referenceId);
      if (res.error) {
        setError(res.error);
        return;
      }
      if (editingId === row.id) startCreate();
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <ErrorAlert message={error} />

      <div className="space-y-3 rounded-lg border border-hairline bg-surface p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            {editingId ? `Editar ${entityLabel}` : `Agregar ${entityLabel}`}
          </h3>
          {editingId ? (
            <button
              type="button"
              onClick={startCreate}
              className="text-xs font-medium text-ink-soft hover:text-ink"
            >
              Cancelar edición
            </button>
          ) : null}
        </div>
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
          {editingId ? "Guardar cambios" : "Agregar"}
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-hairline bg-paper p-3 text-xs text-ink-soft">
          Sin registros todavía.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-hairline bg-surface p-3 text-sm"
            >
              <div className="min-w-0 space-y-0.5">
                <p className="font-medium">{row.title}</p>
                {row.display.length > 0 ? (
                  <p className="text-xs text-ink-soft">{row.display.join(" · ")}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => startEdit(row)}
                  className="rounded-md border border-hairline bg-paper px-3 py-1 text-xs font-medium hover:border-loop"
                >
                  Editar
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => remove(row)}
                  className="rounded-md border border-hairline bg-paper px-3 py-1 text-xs font-medium hover:border-danger"
                >
                  Eliminar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
