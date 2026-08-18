import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

/**
 * Callback de Supabase Auth para el flujo PKCE.
 *
 * Por ahora solo se permite como destino sensible /reset-password.
 * Nunca acepta una URL arbitraria controlada por el usuario.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next");

  const destination = next === "/reset-password" ? "/reset-password" : "/login";

  if (!code) {
    return NextResponse.redirect(new URL("/forgot-password", url.origin));
  }

  const supabase = await createServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL("/forgot-password", url.origin));
  }

  return NextResponse.redirect(new URL(destination, url.origin));
}
