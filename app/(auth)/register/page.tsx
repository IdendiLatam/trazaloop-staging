// Server Component (v1.0.0): consulta el kill switch server-only del
// registro público ANTES de renderizar nada. Depende de process.env y de
// una verificación en base de datos → nunca se prerenderiza en build.
export const dynamic = "force-dynamic";

import Link from "next/link";
import { shouldRenderRegistrationForm } from "@/lib/auth/public-registration";
import { RegisterForm } from "@/components/domain/auth/register-form";

/**
 * Registro de cuenta.
 *
 * Con el registro público HABILITADO se muestra el formulario de siempre.
 *
 * Con el registro público DESHABILITADO se muestra una pantalla controlada
 * y **no se renderiza ningún formulario funcional**. Ocultar el formulario
 * no es la barrera: la barrera está en `signUpAction`, que rechaza la
 * creación de cuentas en servidor. Esto es solo la parte visible.
 *
 * Excepción: quien llega con un enlace de invitación cuyo token existe,
 * sigue pendiente y no ha expirado sí ve el formulario, para poder
 * completar su onboarding. El servidor exige además que el correo coincida
 * con el invitado.
 */
export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const showForm = await shouldRenderRegistrationForm(next ?? null);

  if (showForm) {
    return <RegisterForm />;
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="eyebrow">Acceso</p>
        <h2 className="text-2xl font-semibold tracking-tight">
          Registro no disponible
        </h2>
      </header>

      <div className="rounded-md border border-hairline bg-surface px-4 py-3 text-sm text-ink-soft">
        <p>
          El registro público no está disponible en este momento. La creación
          de cuentas se gestiona a través del equipo de Trazaloop.
        </p>
        <p className="mt-3">
          Si tu empresa ya trabaja con Trazaloop, pide a la persona
          administradora que te envíe una invitación: con ese enlace podrás
          crear tu cuenta y unirte a su equipo.
        </p>
      </div>

      <div className="space-y-2 text-sm text-ink-soft">
        <p>
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className="font-medium text-loop hover:underline">
            Inicia sesión
          </Link>
        </p>
        <p>
          ¿Quieres conocer Trazaloop? Escríbenos a{" "}
          <a
            href="mailto:contacto@idendi.org"
            className="font-medium text-loop hover:underline"
          >
            contacto@idendi.org
          </a>
          .
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
