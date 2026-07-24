import "server-only";

import { cookies } from "next/headers";
import { requireEnv } from "@/lib/env";
import { createServerClient as createSSRServerClient } from "@supabase/ssr";

/**
 * Clave PÚBLICA del proyecto (siempre sujeta a RLS).
 *
 * Nombre vigente: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.
 * Compatibilidad temporal con el nombre heredado
 * NEXT_PUBLIC_SUPABASE_ANON_KEY — mismo patrón que el cliente
 * administrativo (SUPABASE_SECRET_KEY ?? SUPABASE_SERVICE_ROLE_KEY).
 * Ambas son públicas por definición: aquí NUNCA entra una clave secreta.
 */
function requirePublishableKey(): string {
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) return requireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  return key;
}

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
  const publishableKey = requirePublishableKey();

  const cookieStore = await cookies();

  return createSSRServerClient(
    url,
    publishableKey,
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
