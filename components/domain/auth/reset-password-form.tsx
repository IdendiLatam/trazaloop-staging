"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  updatePasswordAction,
  type AuthActionState,
} from "@/server/actions/auth";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/alert";

const initial: AuthActionState = { error: null };

export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState(
    updatePasswordAction,
    initial
  );

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="eyebrow">Recuperación</p>
        <h2 className="text-2xl font-semibold tracking-tight">
          Crear nueva contraseña
        </h2>
        <p className="text-sm text-ink-soft">
          Define una nueva contraseña para tu cuenta de Trazaloop.
        </p>
      </header>

      <ErrorAlert message={state.error} />

      <form action={formAction} className="space-y-4">
        <Field
          label="Nueva contraseña"
          name="password"
          type="password"
          autoComplete="new-password"
          required
        />

        <Field
          label="Confirmar nueva contraseña"
          name="password_confirmation"
          type="password"
          autoComplete="new-password"
          required
        />

        <Button type="submit" disabled={pending}>
          {pending ? "Actualizando…" : "Guardar nueva contraseña"}
        </Button>
      </form>

      <p className="text-sm text-ink-soft">
        <Link href="/login" className="hover:underline">
          Volver a iniciar sesión
        </Link>
      </p>
    </div>
  );
}
