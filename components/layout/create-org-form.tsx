"use client";

import { useActionState } from "react";
import {
  createOrganizationAction,
  type OrgActionState,
} from "@/server/actions/organizations";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/alert";

const initial: OrgActionState = { error: null };

export function CreateOrgForm() {
  const [state, formAction, pending] = useActionState(
    createOrganizationAction,
    initial
  );

  return (
    <form action={formAction} className="space-y-4">
      <ErrorAlert message={state.error} />
      <Field label="Nombre de la empresa" name="name" type="text" required />
      <Field label="NIT / identificación (opcional)" name="tax_id" type="text" />
      <Field label="País (opcional)" name="country" type="text" />
      <Button type="submit" disabled={pending}>
        {pending ? "Creando empresa…" : "Crear empresa"}
      </Button>
      <p className="text-xs text-ink-soft">
        Quedarás como administrador y se activarán los módulos base: Núcleo,
        Trazaloop 6632 / UNE-EN 15343 y Trazaloop Docs.
      </p>
    </form>
  );
}
