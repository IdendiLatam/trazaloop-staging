"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import {
  requestPasswordResetAction,
  type AuthActionState,
} from "@/server/actions/auth";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { InfoAlert } from "@/components/ui/alert";

const initial: AuthActionState = { error: null };

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [, formAction, pending] = useActionState(
    async (prev: AuthActionState, formData: FormData) => {
      const result = await requestPasswordResetAction(prev, formData);
      if (!result.error) setSent(true);
      return result;
    },
    initial
  );

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="eyebrow">Recuperación</p>
        <h2 className="text-2xl font-semibold tracking-tight">
          Restablecer contraseña
        </h2>
        <p className="text-sm text-ink-soft">
          Te enviaremos un enlace si el correo está registrado.
        </p>
      </header>

      {sent ? (
        <InfoAlert message="Si el correo existe, recibirás un enlace para restablecer tu contraseña." />
      ) : null}

      <form action={formAction} className="space-y-4">
        <Field label="Correo" name="email" type="email" autoComplete="email" required />
        <Button type="submit" disabled={pending}>
          {pending ? "Enviando…" : "Enviar enlace"}
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
