"use client";

/**
 * PCR-03.1 (5.4) · Formularios de acuerdos/requisitos de cliente. Los
 * vínculos se crean POR CÓDIGO (producto / lote producido / orden): el
 * servidor resuelve el código dentro de la organización activa y la BD
 * revalida el destino (trigger 0106) — sin selectores de universo completo.
 */
import { useActionState } from "react";
import {
  createCustomerRequirementAction,
  toggleCustomerRequirementAction,
  linkCustomerRequirementAction,
  unlinkCustomerRequirementAction,
  type RequirementActionState,
} from "@/server/actions/customer-requirements";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/alert";

const initial: RequirementActionState = { error: null };

export function RequirementForm() {
  const [state, formAction, pending] = useActionState(createCustomerRequirementAction, initial);
  return (
    <form action={formAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Cliente *" name="customer_name" required />
        <Field label="Código interno *" name="code" required placeholder="p. ej. REQ-ACME-01" />
      </div>
      <Field label="Título *" name="title" required placeholder="Qué exige o qué se acordó" />
      <Field label="Descripción (opcional)" name="description" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Vigente desde (opcional)" name="starts_on" type="date" />
        <Field label="Vigente hasta (opcional)" name="ends_on" type="date" />
      </div>
      <Field label="Notas (opcional)" name="notes" />
      {state.error ? <ErrorAlert message={state.error} /> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Guardando…" : "Registrar acuerdo / requisito"}
      </Button>
    </form>
  );
}

export function RequirementRowControls({
  requirementId,
  active,
  unlinkId,
}: {
  requirementId: string;
  active: boolean;
  unlinkId?: string;
}) {
  const [toggleState, toggleFormAction, toggling] = useActionState(
    toggleCustomerRequirementAction,
    initial
  );
  const [unlinkState, unlinkFormAction, unlinking] = useActionState(
    unlinkCustomerRequirementAction,
    initial
  );
  if (unlinkId) {
    return (
      <form action={unlinkFormAction} className="shrink-0">
        <input type="hidden" name="id" value={unlinkId} />
        <button type="submit" disabled={unlinking} className="text-xs text-danger hover:underline">
          {unlinking ? "Quitando…" : "Quitar"}
        </button>
        {unlinkState.error ? <span className="ml-2 text-xs text-danger">{unlinkState.error}</span> : null}
      </form>
    );
  }
  return (
    <form action={toggleFormAction} className="shrink-0 text-right">
      <input type="hidden" name="id" value={requirementId} />
      <input type="hidden" name="active" value={active ? "false" : "true"} />
      <button type="submit" disabled={toggling} className="text-sm text-ink-soft hover:underline">
        {toggling ? "Guardando…" : active ? "Marcar inactivo" : "Reactivar"}
      </button>
      {toggleState.error ? <p className="mt-1 text-xs text-danger">{toggleState.error}</p> : null}
    </form>
  );
}

export function RequirementLinkForm({ requirementId }: { requirementId: string }) {
  const [state, formAction, pending] = useActionState(linkCustomerRequirementAction, initial);
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2 text-xs">
      <input type="hidden" name="requirement_id" value={requirementId} />
      <label className="block">
        <span className="mb-1 block font-medium text-ink-soft">Vincular con</span>
        <select name="target_type" className="rounded-md border border-hairline bg-canvas px-2 py-1.5">
          <option value="product">Producto (por código)</option>
          <option value="output_batch">Lote producido / lote final (por código)</option>
          <option value="production_order">Orden / corrida (por código)</option>
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block font-medium text-ink-soft">Código</span>
        <input
          name="target_code"
          required
          placeholder="Código exacto"
          className="rounded-md border border-hairline bg-canvas px-2 py-1.5"
        />
      </label>
      <Button type="submit" variant="quiet" disabled={pending}>
        {pending ? "Vinculando…" : "Vincular"}
      </Button>
      {state.error ? <p className="w-full text-danger">{state.error}</p> : null}
    </form>
  );
}
