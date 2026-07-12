import "server-only";

import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";

/**
 * Exige sesión autenticada en servidor.
 * Usa getUser() (verifica el JWT contra Supabase Auth), no getSession().
 * Si no hay usuario, redirige a /login.
 */
export async function requireSession() {
  const supabase = await createServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  return { supabase, user };
}
