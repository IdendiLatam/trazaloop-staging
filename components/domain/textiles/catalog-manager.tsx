"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ErrorAlert, InfoAlert } from "@/components/ui/alert";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/**
 * Trazaloop · Sprint T3 (Textil) · Gestor genérico de catálogos textiles.
 *
 * Un solo componente cliente para los catálogos por empresa: listar,
 * crear, editar y activar/desactivar. La configuración de campos viene del
 * servidor; las server actions llegan por props (patrón soportado por el
 * App Router). La UI solo guía — validación real en actions + RLS.
 *
 * Sprint T9E: eliminación segura opcional (deleteAction + canDelete). El
 * botón solo se muestra a roles autorizados (calculado en servidor), con
 * diálogo de confirmación e impacto; la action re-valida rol y relaciones
 * y la RLS/FKs deciden en BD — esconder el botón jamás es la barrera.
 */

// Sprint T9E: la regla PURA de selects (estado inicial = primera opción;
// invariante visual↔estado) vive en lib/domain/textiles-forms.ts — una sola
// implementación testeable sin React, compartida por los tres motores.
import {
  emptyFieldValues,
  selectNeedsFallbackPlaceholder,
  SELECT_FALLBACK_PLACEHOLDER_LABEL,
  type CatalogFieldDef,
} from "@/lib/domain/textiles-forms";

export {
  initialFieldValue,
  emptyFieldValues,
  type CatalogFieldDef,
} from "@/lib/domain/textiles-forms";

/**
 * Select controlado con invariante visual↔estado: si el valor actual no
 * corresponde a ninguna opción (lista vacía o valor precargado obsoleto),
 * se muestra un placeholder deshabilitado "Seleccione una opción…" — jamás
 * una opción real que no esté en el estado.
 */
export function CatalogSelect({
  field,
  value,
  disabled,
  onChange,
}: {
  field: CatalogFieldDef;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const options = field.options ?? [];
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-hairline bg-paper px-3 py-1.5"
    >
      {selectNeedsFallbackPlaceholder(field, value) ? (
        <option value={value} disabled>
          {SELECT_FALLBACK_PLACEHOLDER_LABEL}
        </option>
      ) : null}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

export type CatalogRowView = {
  id: string;
  name: string;
  isActive: boolean;
  /** Líneas descriptivas ya resueltas en servidor (etiquetas en español). */
  display: string[];
  /** Valores para precargar el formulario al editar (clave = field.key). */
  formValues: Record<string, string | boolean>;
};

type ActionResult = { error: string | null };

export function TextileCatalogManager<TInput extends Record<string, unknown>>({
  entityLabel,
  entityLabelPlural,
  fields,
  rows,
  createAction,
  updateAction,
  setActiveAction,
  deleteAction,
  canDelete = false,
}: {
  entityLabel: string;
  entityLabelPlural: string;
  fields: CatalogFieldDef[];
  rows: CatalogRowView[];
  createAction: (input: TInput) => Promise<ActionResult>;
  updateAction: (id: string, input: TInput) => Promise<ActionResult>;
  setActiveAction: (id: string, isActive: boolean) => Promise<ActionResult>;
  /** T9E: eliminación física segura (solo registros sin relaciones). */
  deleteAction?: (id: string) => Promise<ActionResult>;
  /** T9E: rol autorizado calculado en SERVIDOR (admin/quality). */
  canDelete?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CatalogRowView | null>(null);

  const emptyValues = (): Record<string, string | boolean> => emptyFieldValues(fields);
  const [values, setValues] = useState<Record<string, string | boolean>>(emptyValues);

  function startCreate() {
    setEditingId(null);
    setValues(emptyValues());
    setError(null);
    setNotice(null);
  }

  function startEdit(row: CatalogRowView) {
    setEditingId(row.id);
    setValues({ ...emptyValues(), ...row.formValues });
    setError(null);
    setNotice(null);
  }

  function submit() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const input = values as unknown as TInput;
      const res = editingId ? await updateAction(editingId, input) : await createAction(input);
      if (res.error) {
        setError(res.error);
        return;
      }
      setNotice(editingId ? "Registro actualizado." : "Registro creado.");
      startCreate();
      router.refresh();
    });
  }

  function toggleActive(row: CatalogRowView) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await setActiveAction(row.id, !row.isActive);
      if (res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  function confirmDelete() {
    if (!deleteTarget || !deleteAction) return;
    const target = deleteTarget;
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await deleteAction(target.id);
      setDeleteTarget(null);
      if (res.error) {
        setError(res.error);
        return;
      }
      setNotice(`Registro "${target.name}" eliminado definitivamente.`);
      if (editingId === target.id) startCreate();
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <ErrorAlert message={error} />
      {notice ? <InfoAlert message={notice} /> : null}

      <section className="space-y-3 rounded-lg border border-hairline bg-surface p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            {editingId ? `Editar ${entityLabel}` : `Nuevo ${entityLabel}`}
          </h2>
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
                  onChange={(e) =>
                    setValues((prev) => ({ ...prev, [f.key]: e.target.value }))
                  }
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
                    onChange={(e) =>
                      setValues((prev) => ({ ...prev, [f.key]: e.target.checked }))
                    }
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
          {editingId ? "Guardar cambios" : `Crear ${entityLabel}`}
        </Button>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">
          {entityLabelPlural} registrados ({rows.length})
        </h2>
        {rows.length === 0 ? (
          <p className="rounded-lg border border-hairline bg-surface p-4 text-sm text-ink-soft">
            Aún no hay registros. Crea el primero con el formulario de arriba.
          </p>
        ) : (
          <ul className="space-y-2">
            {rows.map((row) => (
              <li
                key={row.id}
                className={`flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3 text-sm ${
                  row.isActive ? "border-hairline bg-surface" : "border-hairline bg-paper opacity-70"
                }`}
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="font-medium">
                    {row.name}{" "}
                    <span
                      className={`ml-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                        row.isActive
                          ? "border-loop/30 bg-loop/5 text-loop-deep"
                          : "border-hairline bg-paper text-ink-soft"
                      }`}
                    >
                      {row.isActive ? "Activo" : "Inactivo"}
                    </span>
                  </p>
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
                    onClick={() => toggleActive(row)}
                    className="rounded-md border border-hairline bg-paper px-3 py-1 text-xs font-medium hover:border-loop"
                  >
                    {row.isActive ? "Desactivar" : "Activar"}
                  </button>
                  {canDelete && deleteAction ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => setDeleteTarget(row)}
                      className="rounded-md border border-hairline bg-paper px-3 py-1 text-xs font-medium text-danger hover:border-danger"
                    >
                      Eliminar
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={deleteTarget !== null}
        title={`Eliminar ${entityLabel}`}
        description={
          deleteTarget
            ? `Vas a eliminar definitivamente "${deleteTarget.name}". Esta acción no se puede deshacer y solo procede si el registro no está en uso por materiales, componentes, composiciones, lotes, órdenes / corridas de producción o evidencias; si tiene relaciones, se mostrará el motivo y podrás desactivarlo en su lugar.`
            : ""
        }
        confirmLabel="Eliminar definitivamente"
        destructive
        pending={pending}
        onConfirm={confirmDelete}
        onCancel={() => {
          if (!pending) setDeleteTarget(null);
        }}
      />
    </div>
  );
}
