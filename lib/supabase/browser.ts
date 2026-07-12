"use client";

import { createBrowserClient as createSSRBrowserClient } from "@supabase/ssr";

/**
 * Cliente Supabase para el NAVEGADOR.
 * - Usa únicamente la anon key (pública).
 * - Siempre sujeto a Row Level Security.
 * - Nunca recibe la service_role key.
 */
export function createBrowserClient() {
  return createSSRBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
