"use client";

import { useActionState } from "react";
import { updateMyProfileAction, type SettingsActionState } from "@/server/actions/settings";
import type { MyProfile } from "@/lib/db/settings";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { ErrorAlert, InfoAlert } from "@/components/ui/alert";

const initial: SettingsActionState = { error: null };

/** Formulario de "Mi perfil" (Parte 4). Cada usuario solo puede editar el
 *  suyo: no hay selector de usuario ni parámetro de destino — siempre es
 *  la sesión activa (profiles_update ya lo exige a nivel de RLS). */
export function ProfileSettingsForm({ profile }: { profile: MyProfile }) {
  const [state, formAction, pending] = useActionState(updateMyProfileAction, initial);

  return (
    <form action={formAction} className="space-y-4">
      <ErrorAlert message={state.error} />
      {state.success ? <InfoAlert message="Datos actualizados correctamente." /> : null}

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink">Correo electrónico</span>
        <input
          readOnly
          disabled
          value={profile.email}
          className="block w-full cursor-not-allowed rounded-md border border-hairline bg-paper px-3 py-2 text-sm text-ink-soft"
        />
        <span className="mt-1 block text-xs text-ink-soft">
          Este correo viene de tu cuenta de acceso y no se modifica desde aquí.
        </span>
      </label>

      <Field label="Nombre completo" name="full_name" defaultValue={profile.fullName ?? ""} required />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Cargo / rol interno" name="position" defaultValue={profile.position ?? ""} />
        <Field label="Teléfono" name="phone" defaultValue={profile.phone ?? ""} />
      </div>

      <Button type="submit" disabled={pending} className="!w-auto">
        {pending ? "Guardando…" : "Guardar cambios"}
      </Button>
    </form>
  );
}
