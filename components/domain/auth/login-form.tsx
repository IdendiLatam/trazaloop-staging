"use client";

import { useActionState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signInAction, type AuthActionState } from "@/server/actions/auth";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { ErrorAlert, InfoAlert } from "@/components/ui/alert";

/**
 * Formulario de inicio de sesión (Client Component).
 *
 * Extraído de app/(auth)/login/page.tsx en v1.0.0 para que la página pueda
 * ser un Server Component y consultar allí el kill switch de registro
 * público — que es server-only y nunca debe llegar al navegador.
 *
 * `registrationOpen` llega como prop desde el servidor: es el ÚNICO dato
 * del kill switch que cruza al cliente, y solo decide qué enlace mostrar.
 * La barrera real está en signUpAction.
 */

const initial: AuthActionState = { error: null };

function LoginFormFields({ registrationOpen }: { registrationOpen: boolean }) {
  const [state, formAction, pending] = useActionState(signInAction, initial);
  const params = useSearchParams();
  const justRegistered = params.get("registered") === "1";
  const passwordUpdated = params.get("password_updated") === "1";
  const next = params.get("next");
  const hasPendingInviteLink = Boolean(next && next.startsWith("/accept-invite"));

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="eyebrow">Acceso</p>
        <h2 className="text-2xl font-semibold tracking-tight">Inicia sesión</h2>
      </header>

      {hasPendingInviteLink ? (
        <InfoAlert message="Tienes una invitación pendiente para unirte a una empresa en Trazaloop. Inicia sesión para continuar." />
      ) : null}
      {justRegistered ? (
        <InfoAlert message="Cuenta creada. Si tu proyecto exige confirmación, revisa tu correo antes de entrar." />
      ) : null}
      {passwordUpdated ? (
        <InfoAlert message="Contraseña actualizada correctamente. Ya puedes iniciar sesión con tu nueva contraseña." />
      ) : null}
      <ErrorAlert message={state.error} />

      <form action={formAction} className="space-y-4">
        {next ? <input type="hidden" name="next" value={next} /> : null}
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
          autoComplete="current-password"
          required
        />
        <Button type="submit" disabled={pending}>
          {pending ? "Entrando…" : "Entrar"}
        </Button>
      </form>

      <div className="space-y-2 text-sm text-ink-soft">
        {registrationOpen ? (
          <p>
            ¿No tienes cuenta?{" "}
            <Link
              href={next ? `/register?next=${encodeURIComponent(next)}` : "/register"}
              className="font-medium text-loop hover:underline"
            >
              Crear cuenta
            </Link>
          </p>
        ) : hasPendingInviteLink ? (
          // Con el registro cerrado, quien trae una invitación SÍ debe poder
          // crear su cuenta: /register valida el token en servidor.
          <p>
            ¿No tienes cuenta?{" "}
            <Link
              href={`/register?next=${encodeURIComponent(next as string)}`}
              className="font-medium text-loop hover:underline"
            >
              Crear cuenta con tu invitación
            </Link>
          </p>
        ) : (
          <p>
            ¿No tienes cuenta? El registro público no está disponible en este
            momento. Escríbenos a{" "}
            <a
              href="mailto:contacto@idendi.org"
              className="font-medium text-loop hover:underline"
            >
              contacto@idendi.org
            </a>
            .
          </p>
        )}
        <p>
          <Link href="/forgot-password" className="hover:underline">
            Olvidé mi contraseña
          </Link>
        </p>
        <p className="mt-2 text-center text-xs text-ink-soft">
          <Link href="/legal" className="hover:underline">
            Acerca de Trazaloop
          </Link>
        </p>
      </div>
    </div>
  );
}

export function LoginForm({ registrationOpen }: { registrationOpen: boolean }) {
  return (
    <Suspense>
      <LoginFormFields registrationOpen={registrationOpen} />
    </Suspense>
  );
}
