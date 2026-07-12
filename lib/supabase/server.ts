import "server-only";

import { cookies } from "next/headers";
import { requireEnv } from "@/lib/env";
import { createServerClient as createSSRServerClient } from "@supabase/ssr";

/**
 * Cliente Supabase para SERVIDOR (Server Components, Server Actions, Route
 * Handlers) con la SESIÓN DEL USUARIO leída de cookies.
 * - Sujeto a Row Level Security con la identidad real del usuario
 *   (auth.uid() en políticas y triggers corresponde a quien hace la petición).
 * - Es el cliente por defecto para TODA lectura y mutación de negocio.
 */
export async function createServerClient() {
  // Fail-fast con mensaje claro (lib/env.ts); nunca en top-level (Sprint 3.1).
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  const cookieStore = await cookies();

  return createSSRServerClient(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll llamado desde un Server Component: se puede ignorar si
            // el middleware refresca la sesión.
          }
        },
      },
    }
  );
}
