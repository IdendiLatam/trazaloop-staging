import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Cliente ADMINISTRATIVO de Supabase (service_role).
 *
 * REGLAS ESTRICTAS:
 * - Solo existe en servidor. El import de "server-only" hace que cualquier
 *   intento de importarlo desde un Client Component falle en build.
 * - service_role BYPASEA RLS: jamás usarlo para mutaciones de negocio
 *   normales; esas van con createServerClient (sesión del usuario) para que
 *   RLS y la bitácora registren al actor real.
 * - En Sprint 1 prácticamente no se usa (queda reservado para tareas de
 *   servidor futuras, p. ej. escritura de PDFs congelados en Storage).
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "createAdminClient: faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY (solo servidor)."
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
