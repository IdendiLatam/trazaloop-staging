"use client";

import { useActionState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signUpAction, type AuthActionState } from "@/server/actions/auth";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { ErrorAlert, InfoAlert } from "@/components/ui/alert";

const initial: AuthActionState = { error: null };

function RegisterForm() {
  const [state, formAction, pending] = useActionState(signUpAction, initial);
  const params = useSearchParams();
  const next = params.get("next");
  const hasPendingInviteLink = Boolean(next && next.startsWith("/accept-invite"));

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="eyebrow">Nueva cuenta</p>
        <h2 className="text-2xl font-semibold tracking-tight">Crea tu cuenta</h2>
        <p className="text-sm text-ink-soft">
          {hasPendingInviteLink
            ? "Después de crear tu cuenta, continuarás con tu invitación."
            : "Después crearás tu empresa y activarás sus módulos."}
        </p>
      </header>

      {hasPendingInviteLink ? (
        <InfoAlert message="Tienes una invitación pendiente para unirte a una empresa en Trazaloop. Crea tu cuenta para continuar." />
      ) : null}
      <ErrorAlert message={state.error} />

      <form action={formAction} className="space-y-4">
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <Field
          label="Nombre completo"
          name="full_name"
          type="text"
          autoComplete="name"
          required
        />
        <Field
          label="Correo"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
        <Field
          label="Contraseña"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          hint="Mínimo 8 caracteres."
          required
        />
        <Button type="submit" disabled={pending}>
          {pending ? "Creando cuenta…" : "Crear cuenta"}
        </Button>
      </form>

      <p className="text-sm text-ink-soft">
        ¿Ya tienes cuenta?{" "}
        <Link
          href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}
          className="font-medium text-loop hover:underline"
        >
          Inicia sesión
        </Link>
      </p>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
