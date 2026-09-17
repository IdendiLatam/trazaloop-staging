import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  listPublicPlanCatalog, listPublicPlanLimits, getTrialPolicy,
} from "@/lib/db/commercial-plans";
import {
  buildCommercialCatalog, type CommercialCatalog,
} from "@/lib/plans/commercial-catalog";

/**
 * Trazaloop · COMMERCIAL-UX-01C · Ir a buscar el catálogo comercial.
 *
 *
 * LO ÚNICO QUE HACE ESTE MÓDULO
 *
 * Las tres lecturas y el ensamblado. La forma del modelo la decide
 * `lib/plans/commercial-catalog.ts`, que es puro y se puede ejercitar sin base
 * de datos; aquí solo vive el viaje.
 *
 *
 * POR QUÉ LAS TRES LECTURAS VAN A LA VEZ
 *
 * Son independientes: los planes, sus límites y la política de prueba salen de
 * sitios distintos y ninguna necesita el resultado de otra. Encadenarlas
 * sumaría tres esperas para pintar una sola página.
 *
 *
 * QUÉ PASA CUANDO LA LECTURA FALLA
 *
 * Devuelve `null`. NO un catálogo vacío: una página de precios sin planes le
 * dice a quien la mire que no vendemos nada, y eso es peor que decir que ahora
 * mismo no podemos enseñarlo. Es la misma regla que el resto del módulo
 * comercial: **sin dato no es cero**.
 *
 *
 * SOBRE QUIÉN PUEDE LEER ESTO
 *
 * `v_public_plan_catalog` y `v_public_plan_limits` están concedidas a
 * `authenticated`, no a `anon` (0162). Son vistas con `security_invoker`, así
 * que quien las consulte necesita identidad. El cliente entra por parámetro
 * precisamente para que quien monte una superficie pública decida con qué
 * identidad lee, en vez de que este módulo lo decida por todos.
 */
export async function readCommercialCatalog(
  client?: SupabaseClient
): Promise<CommercialCatalog | null> {
  const [planes, limites, politica] = await Promise.all([
    listPublicPlanCatalog(client),
    listPublicPlanLimits(client),
    getTrialPolicy(client),
  ]);

  // Sin planes no hay catálogo. Sin límites tampoco: un plan sin condiciones
  // que enseñar no es información, es una promesa a medias.
  if (planes === null || limites === null) return null;

  return buildCommercialCatalog({
    plans: planes,
    limits: limites,
    trialPolicy: politica,
  });
}
