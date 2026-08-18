"use server";

import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { clearActiveOrgCookie } from "@/lib/auth/active-organization";
import { isSafeAcceptInviteNext, postAuthDestinationPath } from "@/lib/domain/team";
import { getPostAuthDestinationAction } from "@/server/actions/team";
import { getMyLegalAcceptanceStatusAction } from "@/server/actions/legal";
import {
  REGISTRATION_CLOSED_MESSAGE,
  resolveRegistrationGate,
} from "@/lib/auth/public-registration";

export type AuthActionState = { error: string | null };

function message(error: { message?: string } | null, fallback: string) {
  // Mensajes claros sin exponer detalles internos ni si el correo existe.
  const known: Record<string, string> = {
    "Invalid login credentials": "Correo o contraseña incorrectos.",
    "User already registered": "Ese correo ya está registrado. Inicia sesión.",
    "Email not confirmed":
      "Tu correo aún no está confirmado. Revisa tu bandeja de entrada.",
  };
  return (error?.message && known[error.message]) || fallback;
}

/**
 * Corrección de onboarding: a dónde va alguien justo después de iniciar
 * sesión o registrarse.
 *
 * Sprint 10D (Parte 6/13): la aceptación legal se revisa PRIMERO, antes
 * incluso de un `next` explícito de invitación — nadie entra a ninguna
 * parte del espacio protegido sin haber aceptado términos/política. El
 * `next` original (si era una invitación válida) se preserva como
 * parámetro de /legal/accept, para volver ahí en cuanto acepte.
 *
 * Si viene de un enlace de invitación (`next`, validado contra una lista
 * blanca — nunca una URL arbitraria), se respeta ese destino explícito.
 * Si no, se calcula con getPostAuthDestinationAction: nunca manda a
 * crear empresa si ya tiene membership o invitación pendiente (antes
 * SIEMPRE se mandaba a /dashboard o /select-org sin revisar
 * invitaciones).
 */
async function redirectPostAuth(next: string | null): Promise<never> {
  const legalStatus = await getMyLegalAcceptanceStatusAction();
  if (!legalStatus.hasAcceptedAll) {
    const preservedNext = isSafeAcceptInviteNext(next) ? next : null;
    redirect(preservedNext ? `/legal/accept?next=${encodeURIComponent(preservedNext)}` : "/legal/accept");
  }

  if (isSafeAcceptInviteNext(next)) {
    redirect(next);
  }
  const destination = await getPostAuthDestinationAction();
  redirect(postAuthDestinationPath(destination));
}

export async function signInAction(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "").trim() || null;

  if (!email || !password) {
    return { error: "Ingresa tu correo y tu contraseña." };
  }

  const supabase = await createServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: message(error, "No fue posible iniciar sesión. Verifica tus datos.") };
  }

  await redirectPostAuth(next);
  return { error: null }; // inalcanzable: redirectPostAuth siempre redirige (lanza).
}

export async function signUpAction(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "").trim() || null;

  if (!fullName || !email || !password) {
    return { error: "Completa nombre, correo y contraseña." };
  }
  if (password.length < 8) {
    return { error: "La contraseña debe tener al menos 8 caracteres." };
  }

  // ---------------------------------------------------------------------
  // KILL SWITCH del registro público (v1.0.0 · Ruta A).
  //
  // Se evalúa ANTES de tocar Supabase: con el registro cerrado no se llama
  // a auth.signUp, así que no se crea usuario, ni organización, ni
  // membresía, ni se envía correo alguno.
  //
  // La única excepción es una persona INVITADA, y se concede solo tras
  // verificar en servidor que existe una invitación pendiente, vigente y
  // con ESTE mismo correo — nunca por el parámetro `next`, que lo controla
  // el cliente.
  //
  // El mensaje es genérico a propósito: no revela la configuración interna
  // ni si el correo existía.
  // ---------------------------------------------------------------------
  const gate = await resolveRegistrationGate({ email, next });
  if (!gate.allowed) {
    return { error: REGISTRATION_CLOSED_MESSAGE };
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });

  if (error) {
    return { error: message(error, "No fue posible crear la cuenta.") };
  }

  // Si el proyecto exige confirmación por correo, no hay sesión todavía:
  // el destino se preserva en la URL de vuelta a /login.
  if (!data.session) {
    const suffix = isSafeAcceptInviteNext(next) ? `&next=${encodeURIComponent(next)}` : "";
    redirect(`/login?registered=1${suffix}`);
  }

  // Con sesión inmediata: mismo criterio que signInAction (nunca a crear
  // empresa si ya tiene membership o invitación pendiente).
  await redirectPostAuth(next);
  return { error: null }; // inalcanzable: redirectPostAuth siempre redirige (lanza).
}

export async function requestPasswordResetAction(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Ingresa tu correo." };

  const supabase = await createServerClient();
  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
  ).replace(/\/+$/, "");

  // El enlace vuelve a un callback PKCE controlado. El callback intercambia
  // el auth code por una sesión válida antes de mostrar /reset-password.
  // La respuesta sigue siendo idéntica exista o no el correo.
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/callback?next=/reset-password`,
  });

  return { error: null };
}

export async function updatePasswordAction(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("password_confirmation") ?? "");

  if (!password || !confirmation) {
    return { error: "Ingresa y confirma tu nueva contraseña." };
  }

  if (password.length < 8) {
    return { error: "La contraseña debe tener al menos 8 caracteres." };
  }

  if (password !== confirmation) {
    return { error: "Las contraseñas no coinciden." };
  }

  const supabase = await createServerClient();

  // getUser() valida la sesión contra Supabase Auth. No se permite cambiar
  // contraseña únicamente por haber llegado a la URL.
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      error:
        "El enlace de recuperación no es válido o expiró. Solicita uno nuevo.",
    };
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return {
      error:
        "No fue posible actualizar la contraseña. Solicita un nuevo enlace e inténtalo nuevamente.",
    };
  }

  // La sesión de recuperación no debe convertirse silenciosamente en una
  // sesión normal de aplicación.
  await supabase.auth.signOut();
  await clearActiveOrgCookie();

  redirect("/login?password_updated=1");
}

export async function signOutAction() {
  const supabase = await createServerClient();
  await supabase.auth.signOut();
  await clearActiveOrgCookie();
  redirect("/login");
}
