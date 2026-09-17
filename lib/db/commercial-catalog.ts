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
 * Sin sesión. Desde COMMERCIAL-UX-01D0 (migración 0213), las dos vistas se
 * evalúan con los privilegios de su propietario y están concedidas a `anon`
 * solo para leer: una página de precios la mira quien todavía no es cliente, y
 * pedirle que inicie sesión para ver cuánto cuesta el producto es lo contrario
 * de lo que hace una superficie pública.
 *
 * La VISTA es la frontera. `plans`, `plan_revisions`, `plan_revision_limits` y
 * `plan_resources` siguen denegadas sin sesión, y eso se comprueba contra la
 * base en `cux01d0-public-catalog-access`.
 *
 * Por eso este módulo NO necesita —ni usa— una identidad de servidor. El
 * cliente sigue entrando por parámetro para poder inyectar uno en las pruebas,
 * no para elegir con qué permisos se lee: hay un solo camino de lectura.
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
