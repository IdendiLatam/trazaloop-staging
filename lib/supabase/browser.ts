"use client";

import { createBrowserClient as createSSRBrowserClient } from "@supabase/ssr";

/**
 * Cliente Supabase para el NAVEGADOR.
 * - Usa únicamente la clave PÚBLICA (publishable / anon).
 * - Siempre sujeto a Row Level Security.
 * - Nunca recibe la clave secreta (SUPABASE_SECRET_KEY / service_role):
 *   esas variables no llevan prefijo NEXT_PUBLIC_ y por tanto jamás se
 *   inlinean en el bundle del cliente.
 *
 * Nombre vigente: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, con compatibilidad
 * temporal con el heredado NEXT_PUBLIC_SUPABASE_ANON_KEY. Ambas expresiones
 * se escriben literales para que Next.js las sustituya en build.
 */
export function createBrowserClient() {
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return createSSRBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    publishableKey!
  );
}
