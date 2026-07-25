import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeEmail } from "@/lib/domain/team";
import {
  PUBLIC_REGISTRATION_FLAG_ENV,
  extractInvitationToken,
  isPublicRegistrationFlagEnabled,
} from "@/lib/domain/public-registration";

/**
 * Trazaloop · v1.0.0 · Kill switch SERVER-ONLY del registro público.
 *
 * PARA QUÉ EXISTE
 *   Permitir el despliegue técnico de Production (hito A de la Ruta A) sin
 *   que `/register` quede abierto a cualquiera que conozca la URL, mientras
 *   siguen pendientes los gates de la apertura comercial (paquete jurídico
 *   aprobado y SMTP personalizado probado).
 *
 * QUÉ NO ES
 *   **NO es un mecanismo de autorización.** No sustituye a RLS, a
 *   `requireSession` ni a los guards de rol. Es un interruptor operativo
 *   que decide si se admite la creación de cuentas nuevas. La seguridad
 *   real sigue viviendo donde siempre.
 *
 * FAIL-CLOSED
 *   Sin variable configurada, el registro queda DESHABILITADO. La
 *   interpretación del valor vive en `lib/domain/public-registration.ts`
 *   (fuente única) y aquí solo se lee el entorno.
 *
 * La variable NO lleva prefijo NEXT_PUBLIC_: el navegador nunca la conoce.
 * Este módulo es `server-only`, de modo que importarlo desde un Client
 * Component rompe el build.
 */

/** Estado efectivo del kill switch en este proceso (server-only). */
export function isPublicRegistrationEnabled(): boolean {
  return isPublicRegistrationFlagEnabled(process.env[PUBLIC_REGISTRATION_FLAG_ENV]);
}

// ---------------------------------------------------------------------------
// Excepción para personas INVITADAS
// ---------------------------------------------------------------------------
//
// Las invitaciones REUTILIZAN el autorregistro: quien recibe un enlace
// `/accept-invite?token=…` sin tener cuenta es enviado a
// `/register?next=/accept-invite?token=…`. Cerrar el registro sin más
// dejaría fuera a todo invitado legítimo.
//
// La excepción NO se concede por el parámetro `next` —eso lo controla el
// cliente y sería trivial de falsificar—. Se concede solo tras VERIFICAR
// EN SERVIDOR, contra la base de datos, que existe una invitación:
//
//   · con ese token exacto,
//   · en estado 'pending' (no aceptada, no revocada, no expirada),
//   · cuya fecha de expiración no ha pasado,
//   · y cuyo correo COINCIDE con el correo que la persona está registrando.
//
// El último punto es el que cierra el ataque: un tercero que consiguiera un
// token válido tendría que registrarse además con el correo exacto al que
// se invitó — es decir, ser la persona invitada.
//
// Se usa el cliente ADMINISTRATIVO porque `get_invitation_preview` está
// revocada para `anon` (migración 0037) y quien se registra todavía no
// tiene sesión. El cliente admin es server-only y aquí se emplea con una
// consulta de SOLO LECTURA, acotada por token y correo.
// ---------------------------------------------------------------------------

/** Motivo por el que se permitió o denegó crear la cuenta. Se usa para
 *  trazar la decisión, nunca para explicársela a quien se registra. */
export type RegistrationGateReason =
  | "public_registration_enabled"
  | "valid_invitation"
  | "registration_closed";

export type RegistrationGate = {
  allowed: boolean;
  reason: RegistrationGateReason;
};

/**
 * ¿Existe una invitación PENDIENTE y VIGENTE para este token y este correo?
 * Solo lectura. Ante cualquier error o duda devuelve `false` (fail-closed).
 */
async function hasValidPendingInvitation(
  token: string,
  email: string
): Promise<boolean> {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("team_invitations")
      .select("email, status, expires_at")
      .eq("token", token)
      .eq("status", "pending")
      .limit(1)
      .maybeSingle();

    if (error || !data) return false;

    // El correo invitado se almacena siempre en minúsculas (0037 lo obliga
    // con un CHECK), pero se normaliza igualmente antes de comparar.
    if (normalizeEmail(String(data.email)) !== normalized) return false;

    // Vigencia: la fecha de expiración no puede haber pasado.
    const expiresAt = new Date(String(data.expires_at));
    if (Number.isNaN(expiresAt.getTime())) return false;
    if (expiresAt.getTime() < Date.now()) return false;

    return true;
  } catch {
    // Fail-closed: si no se puede verificar, no se concede la excepción.
    return false;
  }
}

/**
 * Decide si se admite crear una cuenta nueva.
 *
 * Orden de evaluación:
 *   1. Registro público habilitado → se admite.
 *   2. Registro cerrado, pero hay una invitación válida para ese correo →
 *      se admite (onboarding legítimo de una persona invitada).
 *   3. En cualquier otro caso → se deniega.
 */
export async function resolveRegistrationGate(input: {
  email: string;
  next: string | null;
}): Promise<RegistrationGate> {
  if (isPublicRegistrationEnabled()) {
    return { allowed: true, reason: "public_registration_enabled" };
  }

  const token = extractInvitationToken(input.next);
  if (token && (await hasValidPendingInvitation(token, input.email))) {
    return { allowed: true, reason: "valid_invitation" };
  }

  return { allowed: false, reason: "registration_closed" };
}

/**
 * ¿Debe la pantalla `/register` mostrar el formulario?
 *
 * Con el registro abierto, siempre. Con el registro cerrado, solo si el
 * enlace trae un token de invitación que exista y siga pendiente y vigente
 * — sin comprobar el correo, porque la persona todavía no lo ha escrito.
 *
 * Es una decisión de PRESENTACIÓN, deliberadamente más permisiva que la
 * del servidor: la barrera real es `resolveRegistrationGate`, que además
 * exige que el correo coincida. Mostrar el formulario a alguien con un
 * token válido pero que luego escriba otro correo termina en un error
 * controlado, no en una cuenta creada.
 */
export async function shouldRenderRegistrationForm(
  next: string | null
): Promise<boolean> {
  if (isPublicRegistrationEnabled()) return true;

  const token = extractInvitationToken(next);
  if (!token) return false;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("team_invitations")
      .select("expires_at")
      .eq("token", token)
      .eq("status", "pending")
      .limit(1)
      .maybeSingle();

    if (error || !data) return false;

    const expiresAt = new Date(String(data.expires_at));
    if (Number.isNaN(expiresAt.getTime())) return false;
    return expiresAt.getTime() >= Date.now();
  } catch {
    return false;
  }
}

/** Mensaje único y genérico. No revela el nombre de la variable, su valor
 *  ni ningún detalle de configuración interna. */
export const REGISTRATION_CLOSED_MESSAGE =
  "El registro público no está disponible en este momento.";
