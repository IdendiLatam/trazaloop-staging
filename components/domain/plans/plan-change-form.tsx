"use client";

import { useActionState } from "react";
import { changeOrganizationPlanAction, type PlanActionState } from "@/server/actions/plans";
import { PLAN_CODES, PLAN_LABEL } from "@/lib/plans/types";
import { SelectField, Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { ErrorAlert, InfoAlert } from "@/components/ui/alert";

const initial: PlanActionState = { error: null };
const PLAN_OPTIONS = PLAN_CODES.map((c) => ({ value: c, label: PLAN_LABEL[c] }));
const STATUS_OPTIONS = [
  { value: "active", label: "Activo" },
  { value: "suspended", label: "Suspendido" },
  { value: "cancelled", label: "Cancelado" },
];

/** Cambiar plan (Parte 5). Solo superadmin — el server action lo vuelve a
 *  exigir. Cubre Demo/Full/Extra + Suspender/Reactivar como combinaciones
 *  de (plan_code, status). */
export function PlanChangeForm({
  organizationId,
  currentPlanCode,
  currentStatus,
}: {
  organizationId: string;
  currentPlanCode: string;
  currentStatus: string;
}) {
  const [state, formAction, pending] = useActionState(changeOrganizationPlanAction, initial);

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-hairline bg-surface p-4">
      <input type="hidden" name="organization_id" value={organizationId} />
      <h3 className="text-sm font-semibold">Cambiar plan</h3>
      <ErrorAlert message={state.error} />
      {state.success ? <InfoAlert message="Plan actualizado correctamente." /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField label="Plan" name="plan_code" options={PLAN_OPTIONS} defaultValue={currentPlanCode} />
        <SelectField label="Estado de la suscripción" name="status" options={STATUS_OPTIONS} defaultValue={currentStatus} />
      </div>
      <Field label="Motivo (opcional)" name="reason" placeholder="Empresa piloto acompañada, pago pendiente, etc." />
      <Button type="submit" disabled={pending} className="!w-auto">
        {pending ? "Guardando…" : "Guardar cambio de plan"}
      </Button>
    </form>
  );
}
