"use client";

import { useActionState } from "react";
import { updateCompanySettingsAction, type SettingsActionState } from "@/server/actions/settings";
import type { CompanySettings } from "@/lib/db/settings";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { ErrorAlert, InfoAlert } from "@/components/ui/alert";

const initial: SettingsActionState = { error: null };

/** Formulario de "Datos de empresa" (Parte 2). Si el rol no permite
 *  editar, se muestra en modo solo lectura con el aviso correspondiente
 *  (Parte 7): los datos siguen visibles, solo no editables. */
export function CompanySettingsForm({
  company,
  canManage,
}: {
  company: CompanySettings;
  canManage: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateCompanySettingsAction, initial);

  if (!canManage) {
    return (
      <div className="space-y-4">
        <InfoAlert message="Tu rol permite consultar estos datos, pero no modificarlos." />
        <ReadOnlySummary company={company} />
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <ErrorAlert message={state.error} />
      {state.success ? <InfoAlert message="Datos actualizados correctamente." /> : null}

      <Field label="Nombre comercial" name="name" defaultValue={company.name} required />
      <Field label="Razón social" name="legal_name" defaultValue={company.legalName ?? ""} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="NIT / identificación tributaria" name="tax_id" defaultValue={company.taxId ?? ""} />
        <Field
          label="Correo de contacto"
          name="contact_email"
          type="email"
          defaultValue={company.contactEmail ?? ""}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Teléfono" name="phone" defaultValue={company.phone ?? ""} />
        <Field label="Sitio web" name="website" defaultValue={company.website ?? ""} placeholder="empresa.com" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Ciudad" name="city" defaultValue={company.city ?? ""} />
        <Field label="País" name="country" defaultValue={company.country ?? ""} />
      </div>
      <Field label="Dirección" name="address" defaultValue={company.address ?? ""} />

      <Button type="submit" disabled={pending} className="!w-auto">
        {pending ? "Guardando…" : "Guardar cambios"}
      </Button>
    </form>
  );
}

function ReadOnlySummary({ company }: { company: CompanySettings }) {
  const rows: [string, string | null][] = [
    ["Nombre comercial", company.name],
    ["Razón social", company.legalName],
    ["NIT / identificación tributaria", company.taxId],
    ["Correo de contacto", company.contactEmail],
    ["Teléfono", company.phone],
    ["Sitio web", company.website],
    ["Ciudad", company.city],
    ["País", company.country],
    ["Dirección", company.address],
  ];
  return (
    <dl className="divide-y divide-hairline rounded-lg border border-hairline bg-surface">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-4 px-4 py-2.5 text-sm">
          <dt className="text-ink-soft">{label}</dt>
          <dd className="text-right">{value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
