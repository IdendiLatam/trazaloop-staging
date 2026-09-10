import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";
import { isCommercialTier, type CommercialTier } from "@/lib/plans/types";
import type { EstadoComercial, GrantKind } from "@/lib/plans/commercial-display";
import type { ResumenDemo } from "@/components/domain/onboarding/trial-access-banner";
import { getTrialPolicy, resolvePlanLimit } from "@/lib/db/commercial-plans";
import { getAiCreditStatus } from "@/lib/db/organization-usage";

/**
 * Trazaloop · STABILIZATION-01 · Una sola lectura del estado comercial.
 *
 * POR QUÉ UNA SOLA
 *
 * Antes de esto, el Panel de la empresa y la ficha de la consola preguntaban
 * cada uno por su cuenta y se quedaban con el CÓDIGO del plan efectivo,
 * tirando por el camino si era una prueba o algo contratado. Dos llamadas, dos
 * lecturas parciales, y la misma media verdad en las dos pantallas.
 *
 * Esto NO es una fuente de verdad nueva. No hay tabla nueva, ni columna, ni
 * caché: son las dos resoluciones que la base ya sabía dar —con la prueba y sin
 * ella—, leídas juntas para que quien las pinte no tenga que elegir.
 *
 *   plan_effective_for_organization            → a qué tiene acceso HOY
 *   plan_effective_for_organization_non_trial  → qué tiene CONTRATADO
 *
 * Las dos salen de `plan_effective_scan` sobre `organization_plan_assignments`,
 * que es la autoridad. Y las dos autorizan por dentro: miembro de la empresa o
 * administración de plataforma.
 *
 * SIN DATO NO ES FREE. Un fallo de lectura devuelve `null` en los dos códigos,
 * y quien lo pinte tiene que decir «no se pudo determinar» en vez de afirmar el
 * plan más bajo. Inventar un plan por avería es la mitad del defecto que este
 * tramo cierra.
 */

type Db = SupabaseClient;

const tier = (v: unknown): CommercialTier | null => {
  const s = typeof v === "string" ? v : null;
  return isCommercialTier(s) ? s : null;
};

const GRANTS: readonly string[] = ["base", "trial", "sold", "courtesy"];
const grant = (v: unknown): GrantKind | null =>
  typeof v === "string" && GRANTS.includes(v) ? (v as GrantKind) : null;

function leer(data: unknown): {
  code: CommercialTier | null; kind: GrantKind | null;
  ends: string | null; revision: string | null;
} {
  const r = (data ?? {}) as Record<string, unknown>;
  if (r.status !== "found") return { code: null, kind: null, ends: null, revision: null };
  return {
    code: tier(r.plan_code),
    kind: grant(r.grant_kind),
    ends: typeof r.ends_at === "string" ? r.ends_at : null,
    revision: typeof r.plan_revision_id === "string" ? r.plan_revision_id : null,
  };
}

/**
 * El estado comercial completo de una empresa, en una sola lectura.
 * Lo consumen el Panel del cliente y la ficha de la consola, y por eso los dos
 * dicen lo mismo.
 */
export async function getOrganizationCommercialState(
  organizationId: string, client?: Db
): Promise<EstadoComercial> {
  try {
    const supabase = client ?? (await createServerClient());
    const [efectivo, contratado] = await Promise.all([
      supabase.rpc("plan_effective_for_organization", { p_organization_id: organizationId }),
      supabase.rpc("plan_effective_for_organization_non_trial", { p_organization_id: organizationId }),
    ]);
    if (efectivo.error) return VACIO;
    const e = leer(efectivo.data);
    const c = contratado.error
      ? { code: null, kind: null, ends: null, revision: null }
      : leer(contratado.data);
    return {
      contractedPlanCode: c.code,
      effectivePlanCode: e.code,
      grantKind: e.kind,
      grantEndsAt: e.ends,
      contractedPlanRevisionId: c.revision,
    };
  } catch {
    return VACIO;
  }
}

const VACIO: EstadoComercial = {
  contractedPlanCode: null, effectivePlanCode: null,
  grantKind: null, grantEndsAt: null, contractedPlanRevisionId: null,
};

/**
 * Lo que el aviso de Demo necesita, en una sola pasada y sin una cifra escrita
 * a mano: la política de prueba vigente, las dos bolsas de créditos tal y como
 * las cuenta la base, y los minutos diarios del plan CONTRATADO —los de después
 * de la prueba, que son justamente los que nadie avisaba—.
 */
export async function getDemoAccessSummary(
  organizationId: string, estado: EstadoComercial, client?: Db
): Promise<ResumenDemo> {
  const supabase = client ?? (await createServerClient());
  const [politica, creditos, minutos] = await Promise.all([
    getTrialPolicy(supabase),
    getAiCreditStatus(organizationId),
    estado.contractedPlanRevisionId
      ? resolvePlanLimit(estado.contractedPlanRevisionId, "active_minutes_daily", supabase)
      : Promise.resolve(null),
  ]);

  return {
    duracionHoras: politica?.trialDurationHours ?? null,
    creditosPruebaTotal: creditos?.trialTotal ?? null,
    creditosPruebaRestantes: creditos?.trialRemaining ?? null,
    creditosMensuales: creditos?.monthlyLimit ?? null,
    creditosMensualesRestantes: creditos?.monthlyRemaining ?? null,
    minutosDiariosTrasLaPrueba:
      minutos && minutos.status === "finite" ? minutos.value : null,
  };
}
