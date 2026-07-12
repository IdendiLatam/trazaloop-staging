"use client";

import { useActionState } from "react";
import {
  createInputBatchAction,
  updateInputBatchAction,
  createProductionOrderAction,
  updateProductionOrderAction,
  createOutputBatchAction,
  updateOutputBatchAction,
  addBatchConsumptionAction,
  addBatchCompositionAction,
  type TraceActionState,
} from "@/server/actions/traceability";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/alert";

const initial: TraceActionState = { error: null };

export type Option = { value: string; label: string };

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

const RESIDUE_OPTIONS: Option[] = [
  { value: "preconsumer", label: "Preconsumo" },
  { value: "postconsumer", label: "Posconsumo" },
  { value: "postindustrial", label: "Postindustrial" },
  { value: "virgin", label: "Virgen" },
  { value: "other", label: "Otro" },
];

// ===========================================================================
export function InputBatchForm({
  suppliers,
  materials,
  sites,
  editing,
}: {
  suppliers: Option[];
  materials: Option[];
  sites: Option[];
  editing?: {
    id: string;
    batch_code: string;
    supplier_id: string;
    material_id: string;
    site_id: string | null;
    residue_type: string | null;
    provenance: string | null;
    received_date: string;
    quantity_kg: number | null;
    storage_location: string | null;
    notes: string | null;
  };
}) {
  const [state, formAction, pending] = useActionState(
    editing ? updateInputBatchAction : createInputBatchAction,
    initial
  );

  return (
    <form action={formAction} className="space-y-4" key={editing?.id ?? "new"}>
      <ErrorAlert message={state.error} />
      {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Código de lote" name="batch_code" defaultValue={editing?.batch_code} required />
        <Field label="Fecha de recepción" name="received_date" type="date" defaultValue={editing?.received_date} required />
        <Select label="Proveedor" name="supplier_id" options={suppliers} defaultValue={editing?.supplier_id} required />
        <Select label="Material" name="material_id" options={materials} defaultValue={editing?.material_id} required />
        <Select label="Sede (opcional)" name="site_id" options={sites} defaultValue={editing?.site_id ?? ""} />
        <Select label="Tipo de residuo (opcional)" name="residue_type" options={RESIDUE_OPTIONS} defaultValue={editing?.residue_type ?? ""} />
        <Field label="Procedencia (opcional)" name="provenance" defaultValue={editing?.provenance ?? ""} />
        <Field
          label="Cantidad kg (opcional)"
          name="quantity_kg"
          type="number"
          min={0.0001}
          step="0.0001"
          defaultValue={editing?.quantity_kg ?? ""}
        />
        <Field label="Ubicación de almacenamiento (opcional)" name="storage_location" defaultValue={editing?.storage_location ?? ""} />
        <Field label="Notas (opcional)" name="notes" defaultValue={editing?.notes ?? ""} />
      </div>
      <Button type="submit" disabled={pending} className="!w-auto">
        {pending ? "Guardando…" : editing ? "Guardar cambios" : "Crear lote de entrada"}
      </Button>
    </form>
  );
}

// ===========================================================================
const ORDER_STATUS_OPTIONS: Option[] = [
  { value: "draft", label: "Borrador" },
  { value: "in_progress", label: "En proceso" },
  { value: "closed", label: "Cerrada" },
  { value: "cancelled", label: "Cancelada" },
];

export function ProductionOrderForm({
  sites,
  editing,
}: {
  sites: Option[];
  editing?: {
    id: string;
    order_code: string;
    order_date: string;
    status: string;
    site_id: string | null;
    pretreatment: string | null;
    process_variables: unknown;
    notes: string | null;
  };
}) {
  const [state, formAction, pending] = useActionState(
    editing ? updateProductionOrderAction : createProductionOrderAction,
    initial
  );

  return (
    <form action={formAction} className="space-y-4" key={editing?.id ?? "new"}>
      <ErrorAlert message={state.error} />
      {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Código de orden" name="order_code" defaultValue={editing?.order_code} required />
        <Field label="Fecha" name="order_date" type="date" defaultValue={editing?.order_date} required />
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">Estado</span>
          <select
            name="status"
            defaultValue={editing?.status ?? "draft"}
            className="block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm"
          >
            {ORDER_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <Select label="Sede (opcional)" name="site_id" options={sites} defaultValue={editing?.site_id ?? ""} />
        <Field label="Pretratamiento (opcional)" name="pretreatment" defaultValue={editing?.pretreatment ?? ""} />
        <Field
          label="Variables de proceso, JSON (opcional)"
          name="process_variables"
          defaultValue={editing?.process_variables ? JSON.stringify(editing.process_variables) : ""}
          hint='Por ejemplo: {"temperatura_c": 210, "rpm": 90}'
        />
        <Field label="Notas (opcional)" name="notes" defaultValue={editing?.notes ?? ""} />
      </div>
      <Button type="submit" disabled={pending} className="!w-auto">
        {pending ? "Guardando…" : editing ? "Guardar cambios" : "Crear orden"}
      </Button>
    </form>
  );
}

// ===========================================================================
export function OutputBatchForm({
  orders,
  products,
  editing,
}: {
  orders: Option[];
  products: Option[];
  editing?: {
    id: string;
    batch_code: string;
    production_order_id: string;
    product_id: string | null;
    produced_date: string | null;
    produced_quantity_kg: number | null;
    characteristics: string | null;
    intended_application: string | null;
    storage_location: string | null;
    notes: string | null;
  };
}) {
  const [state, formAction, pending] = useActionState(
    editing ? updateOutputBatchAction : createOutputBatchAction,
    initial
  );

  return (
    <form action={formAction} className="space-y-4" key={editing?.id ?? "new"}>
      <ErrorAlert message={state.error} />
      {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Código de lote de salida" name="batch_code" defaultValue={editing?.batch_code} required />
        <Select label="Orden de producción" name="production_order_id" options={orders} defaultValue={editing?.production_order_id} required />
        <Select
          label="Producto (opcional)"
          name="product_id"
          options={products}
          defaultValue={editing?.product_id ?? ""}
          hint="Puede quedar sin producto si aún no está asociado a una referencia comercial."
        />
        <Field label="Fecha de producción (opcional)" name="produced_date" type="date" defaultValue={editing?.produced_date ?? ""} />
        <Field
          label="Cantidad producida kg (opcional)"
          name="produced_quantity_kg"
          type="number"
          min={0.0001}
          step="0.0001"
          defaultValue={editing?.produced_quantity_kg ?? ""}
        />
        <Field label="Características (opcional)" name="characteristics" defaultValue={editing?.characteristics ?? ""} />
        <Field label="Aplicación prevista (opcional)" name="intended_application" defaultValue={editing?.intended_application ?? ""} />
        <Field label="Ubicación (opcional)" name="storage_location" defaultValue={editing?.storage_location ?? ""} />
        <Field label="Notas (opcional)" name="notes" defaultValue={editing?.notes ?? ""} />
      </div>
      <Button type="submit" disabled={pending} className="!w-auto">
        {pending ? "Guardando…" : editing ? "Guardar cambios" : "Crear lote de salida"}
      </Button>
    </form>
  );
}

// ===========================================================================
export function ConsumptionForm({
  productionOrderId,
  inputBatches,
}: {
  productionOrderId: string;
  inputBatches: Option[];
}) {
  const [state, formAction, pending] = useActionState(addBatchConsumptionAction, initial);

  return (
    <form action={formAction} className="space-y-3">
      <ErrorAlert message={state.error} />
      <input type="hidden" name="production_order_id" value={productionOrderId} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Select label="Lote de entrada" name="input_batch_id" options={inputBatches} required />
        <Field label="Masa consumida kg" name="mass_kg" type="number" min={0.0001} step="0.0001" required />
        <Field label="Notas (opcional)" name="notes" />
      </div>
      <Button type="submit" disabled={pending} className="!w-auto">
        {pending ? "Registrando…" : "Registrar consumo"}
      </Button>
    </form>
  );
}

// ===========================================================================
export function CompositionForm({
  outputBatchId,
  materials,
}: {
  outputBatchId: string;
  materials: Option[];
}) {
  const [state, formAction, pending] = useActionState(addBatchCompositionAction, initial);

  return (
    <form action={formAction} className="space-y-3">
      <ErrorAlert message={state.error} />
      <input type="hidden" name="output_batch_id" value={outputBatchId} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Select label="Material" name="material_id" options={materials} required />
        <Field label="Masa kg" name="mass_kg" type="number" min={0.0001} step="0.0001" required />
        <Field label="Notas (opcional)" name="notes" />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="is_same_process" className="h-4 w-4 accent-[var(--loop)]" />
        Material recuperado en el mismo proceso
        <span className="text-xs text-ink-soft">
          (se usará en el cálculo del Sprint 4; nunca cuenta como reciclado)
        </span>
      </label>
      <Button type="submit" disabled={pending} className="!w-auto">
        {pending ? "Agregando…" : "Agregar a la composición"}
      </Button>
    </form>
  );
}
