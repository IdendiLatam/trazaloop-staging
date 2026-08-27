"use client";

import { useActionState } from "react";
import {
  createOrganizationAction,
  type OrgActionState,
} from "@/server/actions/organizations";
import type { SectorOption } from "@/lib/db/organization-profile";
import { ORG_PROFILE_LIMITS } from "@/lib/domain/organization-profile";
import { Field, SelectField } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/alert";

const initial: OrgActionState = { error: null };

/**
 * QUALITY-12.2B · El alta pregunta dos cosas más, y ninguna es un párrafo.
 *
 * Sector se elige de una lista y actividad principal es una línea. Nada más:
 * productos y descripción se completan después, desde los datos de la empresa,
 * porque el día que alguien crea su empresa quiere entrar, no redactar.
 *
 * Ninguno de los dos es obligatorio a nivel de base. Una empresa creada antes
 * de este sprint —o por cualquier otra vía— sigue siendo válida sin ellos.
 */
export function CreateOrgForm({ sectors = [] }: { sectors?: SectorOption[] }) {
  const [state, formAction, pending] = useActionState(
    createOrganizationAction,
    initial
  );

  return (
    <form action={formAction} className="space-y-4">
      <ErrorAlert message={state.error} />
      <Field label="Nombre de la empresa" name="name" type="text" required />

      {sectors.length > 0 ? (
        <SelectField
          label="Sector"
          name="sector_code"
          defaultValue=""
          placeholder="Prefiero indicarlo después"
          options={sectors.map((s) => ({ value: s.code, label: s.name }))}
        />
      ) : null}

      <Field
        label="Actividad principal (opcional)"
        name="primary_activity"
        type="text"
        maxLength={ORG_PROFILE_LIMITS.primaryActivity}
        placeholder="Fabricación de envases plásticos a partir de resina reciclada"
      />
      <Field label="NIT / identificación (opcional)" name="tax_id" type="text" />
      <Field label="País (opcional)" name="country" type="text" />
      <Button type="submit" disabled={pending}>
        {pending ? "Creando empresa…" : "Crear empresa"}
      </Button>
      <p className="text-xs text-ink-soft">
        Quedarás como administrador y se activarán los módulos base
        disponibles para trazabilidad, cálculo de contenido reciclado y
        soporte técnico. El sector y la actividad ayudan a que Trazaloop use
        el vocabulario de tu empresa; los puedes completar o cambiar después.
      </p>
    </form>
  );
}
