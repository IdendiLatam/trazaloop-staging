// Server Component (v1.0.0): lee el kill switch server-only del registro
// público para decidir qué enlace mostrar bajo el formulario. Depende de
// process.env → nunca se prerenderiza en build.
export const dynamic = "force-dynamic";

import { isPublicRegistrationEnabled } from "@/lib/auth/public-registration";
import { LoginForm } from "@/components/domain/auth/login-form";

/**
 * Inicio de sesión.
 *
 * El login NO se ve afectado por el kill switch: entrar con una cuenta
 * existente —incluida la del superadministrador— funciona siempre. Lo
 * único que cambia es el enlace secundario «Crear cuenta», que con el
 * registro cerrado se sustituye por el canal de contacto.
 */
export default async function LoginPage() {
  return <LoginForm registrationOpen={isPublicRegistrationEnabled()} />;
}
