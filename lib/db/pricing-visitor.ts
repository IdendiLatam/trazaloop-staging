import "server-only";

import { createServerClient } from "@/lib/supabase/server";
import { getActiveOrganization } from "@/lib/db/organizations";
import { getOrganizationCommercialState } from "@/lib/db/commercial-state";
import { getOrganizationBillingState } from "@/lib/db/billing";
import type { VisitorState } from "@/lib/plans/pricing-cta";

/**
 * Trazaloop · COMMERCIAL-UX-01D · En qué situación está quien abre /planes.
 *
 *
 * LA REGLA QUE GOBIERNA TODO ESTE FICHERO
 *
 * /planes es una página PÚBLICA. Leer la sesión sirve para afinar el botón que
 * se ofrece, y para nada más. Si algo falla —no hay sesión, no hay empresa, la
 * lectura se cae— se responde `anonymous` y la página se pinta entera.
 *
 * Nunca redirige. Nunca lanza. Una página de precios que devuelve un error
 * porque no pudo leer un estado opcional es una página de precios rota, y el
 * daño no es técnico: es que quien iba a comprar se va.
 *
 *
 * Y NO CONCEDE NADA
 *
 * Lo que sale de aquí decide qué BOTÓN se pinta. No decide acceso, ni plan, ni
 * cobro: eso lo siguen resolviendo el checkout y el motor de derechos, cada uno
 * con su autoridad, cuando la persona llega allí.
 */
export async function resolveVisitorState(): Promise<VisitorState> {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { kind: "anonymous" };

    const org = await getActiveOrganization();
    if (!org) return { kind: "authenticated_no_org" };

    // Las dos lecturas son independientes y ninguna necesita a la otra.
    const [comercial, facturacion] = await Promise.all([
      getOrganizationCommercialState(org.organizationId),
      getOrganizationBillingState(org.organizationId),
    ]);

    return {
      kind: "organization",
      contractedPlanCode: comercial.contractedPlanCode,
      effectivePlanCode: comercial.effectivePlanCode,
      grantKind: comercial.grantKind,
      // `null` en la lectura de facturación NO es «no tiene»: es que no se
      // pudo leer. Ante la duda se ofrece el camino normal, que nunca hace
      // daño, en vez de esconder un botón por una avería.
      hasSubscription: facturacion?.hasSubscription === true,
      cancelAtPeriodEnd: facturacion?.cancelAtPeriodEnd === true,
    };
  } catch {
    return { kind: "anonymous" };
  }
}
