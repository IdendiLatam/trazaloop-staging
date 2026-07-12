"use server";

import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { clearActiveOrgCookie } from "@/lib/auth/active-organization";

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

export async function signInAction(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Ingresa tu correo y tu contraseña." };
  }

  const supabase = await createServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: message(error, "No fue posible iniciar sesión. Verifica tus datos.") };
  }

  redirect("/dashboard");
}

export async function signUpAction(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!fullName || !email || !password) {
    return { error: "Completa nombre, correo y contraseña." };
  }
  if (password.length < 8) {
    return { error: "La contraseña debe tener al menos 8 caracteres." };
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

  // Si el proyecto exige confirmación por correo, no hay sesión todavía.
  if (!data.session) {
    redirect("/login?registered=1");
  }

  // Con sesión inmediata: al dashboard; sin organización aún, el layout
  // llevará a crear/seleccionar empresa.
  redirect("/select-org");
}

export async function requestPasswordResetAction(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Ingresa tu correo." };

  const supabase = await createServerClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  // Respuesta idéntica exista o no el correo (no revelar existencia).
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/login`,
  });

  return { error: null };
}

export async function signOutAction() {
  const supabase = await createServerClient();
  await supabase.auth.signOut();
  await clearActiveOrgCookie();
  redirect("/login");
}
