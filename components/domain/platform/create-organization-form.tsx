"use client";

import { useActionState } from "react";
import {
  createPlatformOrganizationAction,
  type PlatformActionState,
} from "@/server/actions/platform";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { ErrorAlert, InfoAlert } from "@/components/ui/alert";

const initial: PlatformActionState = { error: null };

/** Formulario de "Nueva empresa" desde la consola de plataforma (Parte 8).
 *  Solo superadmin (gate real: el server action + la RPC). Sin envío de
 *  correo real: si el administrador inicial no tiene cuenta, se muestra un
 *  enlace de invitación copiable, mismo patrón que /team. */
export function CreateOrganizationForm() {
  const [state, formAction, pending] = useActionState(createPlatformOrganizationAction, initial);

  return (
    <form action={formAction} className="space-y-4">
      <ErrorAlert message={state.error} />

      {state.outcomeMessage ? (
        <div className="space-y-2 rounded-md border border-loop/30 bg-loop/5 p-3">
          <InfoAlert message={state.outcomeMessage} />
          {state.invitationLink ? (
            <>
              <p className="text-xs text-ink-soft">
                Copia este enlace y envíalo al administrador inicial por el canal que prefieras.
              </p>
              <input
                readOnly
                value={state.invitationLink}
                onFocus={(e) => e.currentTarget.select()}
                className="code block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-xs"
              />
            </>
          ) : null}
        </div>
      ) : null}

      <fieldset className="space-y-4">
        <legend className="eyebrow mb-2">Datos de la empresa</legend>
        <Field label="Nombre visible" name="name" required />
        <Field label="Razón social" name="legal_name" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="NIT / identificación tributaria" name="tax_id" />
          <Field label="Correo de contacto" name="contact_email" type="email" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="País" name="country" />
          <Field label="Ciudad" name="city" />
        </div>
      </fieldset>

      <fieldset className="space-y-4 border-t border-hairline pt-4">
        <legend className="eyebrow mb-2">Administrador inicial</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre del administrador inicial" name="admin_name" />
          <Field label="Email del administrador inicial" name="admin_email" type="email" required />
        </div>
        <p className="text-xs text-ink-soft">
          Si esa persona ya tiene cuenta en Trazaloop, queda vinculada como administradora de
          inmediato. Si no, se crea una invitación pendiente con enlace copiable — nunca se envía
          un correo real desde aquí.
        </p>
      </fieldset>

      <Button type="submit" disabled={pending} className="!w-auto">
        {pending ? "Creando empresa…" : "Crear empresa"}
      </Button>
    </form>
  );
}
