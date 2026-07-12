"use client";

import { useActionState } from "react";
import {
  upsertSupplierAction,
  upsertFamilyAction,
  upsertProductAction,
  upsertMaterialAction,
  reclassifyMaterialAction,
  type CatalogActionState,
} from "@/server/actions/catalog";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/alert";

const initial: CatalogActionState = { error: null };

type Option = { value: string; label: string };

function Select({
  label,
  name,
  options,
  defaultValue,
  required,
  hint,
}: {
  label: string;
  name: string;
  options: Option[];
  defaultValue?: string;
  required?: boolean;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue ?? ""}
        required={required}
        className="block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm"
      >
        <option value="">— Selecciona —</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint ? <span className="mt-1 block text-xs text-ink-soft">{hint}</span> : null}
    </label>
  );
}

export function SupplierForm({
  editing,
}: {
  editing?: { id: string; name: string; tax_id: string | null; contact: string | null };
}) {
  const [state, formAction, pending] = useActionState(upsertSupplierAction, initial);
  return (
    <form action={formAction} className="space-y-4" key={editing?.id ?? "new"}>
      <ErrorAlert message={state.error} />
      {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
      <Field label="Nombre" name="name" defaultValue={editing?.name} required />
      <Field label="NIT / identificación (opcional)" name="tax_id" defaultValue={editing?.tax_id ?? ""} />
      <Field label="Contacto (opcional)" name="contact" defaultValue={editing?.contact ?? ""} />
      <Button type="submit" disabled={pending} className="!w-auto">
        {pending ? "Guardando…" : editing ? "Guardar cambios" : "Crear proveedor"}
      </Button>
    </form>
  );
}

export function FamilyForm({
  editing,
}: {
  editing?: { id: string; name: string; description: string | null };
}) {
  const [state, formAction, pending] = useActionState(upsertFamilyAction, initial);
  return (
    <form action={formAction} className="space-y-4" key={editing?.id ?? "new"}>
      <ErrorAlert message={state.error} />
      {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
      <Field label="Nombre" name="name" defaultValue={editing?.name} required />
      <Field label="Descripción (opcional)" name="description" defaultValue={editing?.description ?? ""} />
      <Button type="submit" disabled={pending} className="!w-auto">
        {pending ? "Guardando…" : editing ? "Guardar cambios" : "Crear familia"}
      </Button>
    </form>
  );
}

export function ProductForm({
  families,
  editing,
}: {
  families: Option[];
  editing?: {
    id: string;
    code: string;
    name: string;
    family_id: string | null;
    declared_recycled_percent: number | null;
  };
}) {
  const [state, formAction, pending] = useActionState(upsertProductAction, initial);
  return (
    <form action={formAction} className="space-y-4" key={editing?.id ?? "new"}>
      <ErrorAlert message={state.error} />
      {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
      <Field label="Código" name="code" defaultValue={editing?.code} required />
      <Field label="Nombre" name="name" defaultValue={editing?.name} required />
      <Select
        label="Familia (opcional)"
        name="family_id"
        options={families}
        defaultValue={editing?.family_id ?? ""}
      />
      <Field
        label="Contenido reciclado declarado % (opcional)"
        name="declared_recycled_percent"
        type="number"
        min={0}
        max={100}
        step="0.01"
        defaultValue={editing?.declared_recycled_percent ?? ""}
        hint="Se usará más adelante para comparar lo declarado contra lo calculado."
      />
      <Button type="submit" disabled={pending} className="!w-auto">
        {pending ? "Guardando…" : editing ? "Guardar cambios" : "Crear producto"}
      </Button>
    </form>
  );
}

export function MaterialForm({
  classifications,
  editing,
}: {
  classifications: (Option & { description?: string | null })[];
  editing?: { id: string; name: string; classification_code: string };
}) {
  const [state, formAction, pending] = useActionState(upsertMaterialAction, initial);
  return (
    <form action={formAction} className="space-y-4" key={editing?.id ?? "new"}>
      <ErrorAlert message={state.error} />
      {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
      <Field label="Nombre" name="name" defaultValue={editing?.name} required />
      <Select
        label="Clasificación"
        name="classification_code"
        options={classifications}
        defaultValue={editing?.classification_code}
        required
        hint="La clasificación define si el material podrá contarse como reciclado. El material recuperado en el mismo proceso nunca cuenta; el postindustrial no cuenta por defecto."
      />
      <Button type="submit" disabled={pending} className="!w-auto">
        {pending ? "Guardando…" : editing ? "Guardar cambios" : "Crear material"}
      </Button>
    </form>
  );
}

export function ReclassifyForm({
  materialId,
  toCode,
  toLabel,
  evidences,
}: {
  materialId: string;
  toCode: string;
  toLabel: string;
  evidences: Option[];
}) {
  const [state, formAction, pending] = useActionState(reclassifyMaterialAction, initial);
  return (
    <form action={formAction} className="mt-3 space-y-3 rounded-md border border-amber/40 bg-amber/5 p-3">
      <p className="text-xs text-ink-soft">
        Reclasificar a <span className="font-semibold">{toLabel}</span> exige
        justificación normativa y evidencia de soporte. Solo administrador o
        calidad pueden aprobarla; queda registrada en la bitácora.
      </p>
      <ErrorAlert message={state.error} />
      <input type="hidden" name="id" value={materialId} />
      <input type="hidden" name="reclassified_to_code" value={toCode} />
      <Field label="Justificación normativa" name="justification" required />
      <Select
        label="Evidencia de soporte"
        name="evidence_id"
        options={evidences}
        required
        hint="Debe ser una evidencia ya cargada en tu empresa."
      />
      <Button type="submit" disabled={pending} className="!w-auto">
        {pending ? "Reclasificando…" : "Reclasificar con soporte"}
      </Button>
    </form>
  );
}
