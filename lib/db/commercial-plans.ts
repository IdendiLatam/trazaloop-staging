import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";

/**
 * Trazaloop · PE-04B1 · El resolutor comercial canónico.
 *
 *
 * NO ESTÁ CONECTADO A NADA TODAVÍA
 *
 * Ninguna acción del producto lo llama. Las subidas, el acceso a módulos, la IA
 * y los tickets siguen consultando el modelo de hoy. Cambiar la autoridad es
 * PE-04B2, y hacerlo aquí impediría comparar las dos verdades antes de moverse.
 *
 *
 * TRES RESPUESTAS, Y LA TERCERA ES EL MOTIVO DE QUE ESTO EXISTA
 *
 *   found        hay asignación vigente
 *   absent       no hay ninguna · la empresa no tiene derecho a esto
 *   unavailable  no se pudo determinar
 *
 * El resolutor de hoy, `getOrganizationEffectivePlanCode`, devuelve `'demo'`
 * ante cualquier error. Falla cerrado —bien— y a la vez MIENTE sobre la
 * identidad del plan: no distingue «es el plan más bajo» de «no pude saberlo».
 * Esa confusión es la que hace que la consola le diga «Plan Demo» a un cliente
 * que tiene Full.
 *
 * Aquí un fallo de lectura devuelve `unavailable`. Quien lo consuma tiene que
 * DENEGAR igual que ante `absent` —jamás conceder por avería— y **no puede
 * enseñarlo como si fuera un plan**.
 *
 * Es la misma regla que PE-01 congeló para los módulos y PE-03 para los vídeos:
 * **sin dato no es cero**. Aquí, un fallo no es un plan.
 */

type Db = SupabaseClient;
async function db(client?: Db): Promise<Db> {
  return client ?? (await createServerClient());
}

/** Los tres planes canónicos. `demo` no está: era una prueba, no un plan. */
export const CANONICAL_PLAN_CODES = ["free", "full", "extra"] as const;
export type CanonicalPlanCode = (typeof CANONICAL_PLAN_CODES)[number];

export type GrantKind = "base" | "trial" | "sold" | "courtesy";

export type PlanResolution =
  | {
      status: "found";
      planCode: CanonicalPlanCode;
      planRevisionId: string;
      grantKind: GrantKind;
      /** Cuándo deja de aplicar. Nulo = sin fecha de fin. */
      endsAt: string | null;
      /** Solo en la resolución por módulo: de dónde vino la asignación. */
      scope?: "organization" | "module";
    }
  | { status: "absent" }
  | { status: "unavailable" };

/**
 * El estado de un límite. **`not_configured` NO es `unlimited`.**
 *
 * Existe porque PE-04B1 tiene que poder decir «esto aún no se ha decidido» sin
 * inventarse un número ni regalar barra libre. Quien lea `not_configured` debe
 * negar la capacidad medida, no concederla.
 */
export type LimitResolution =
  | { status: "finite"; value: number; resourceCode: string }
  | { status: "unlimited"; resourceCode: string }
  | { status: "not_configured"; resourceCode: string }
  | { status: "unavailable"; resourceCode: string };

function mapPlan(data: unknown): PlanResolution {
  const r = data as Record<string, unknown> | null;
  if (!r || typeof r.status !== "string") return { status: "unavailable" };
  if (r.status === "absent") return { status: "absent" };
  if (r.status !== "found") return { status: "unavailable" };

  const code = r.plan_code;
  // Un código que no está en el catálogo canónico no se «arregla» eligiendo
  // uno: se declara indeterminado. Adivinar aquí sería volver al fallo de hoy.
  if (typeof code !== "string"
      || !(CANONICAL_PLAN_CODES as readonly string[]).includes(code)) {
    return { status: "unavailable" };
  }
  return {
    status: "found",
    planCode: code as CanonicalPlanCode,
    planRevisionId: String(r.plan_revision_id),
    grantKind: r.grant_kind as GrantKind,
    endsAt: (r.ends_at as string | null) ?? null,
    ...(typeof r.scope === "string"
      ? { scope: r.scope as "organization" | "module" }
      : {}),
  };
}

/**
 * El plan que aplica a un MÓDULO de una empresa.
 *
 * `asOf` existe para poder preguntar «¿qué tendrá cuando venza la prueba?» sin
 * escribir nada. Una prueba caduca **por efecto del tiempo**: no hay ningún
 * proceso programado que baje a nadie de plan, y por tanto no hay ninguna
 * ventana en la que el estado esté mal porque el proceso no ha corrido.
 */
export async function resolveModulePlan(
  organizationId: string, moduleCode: string,
  options?: { asOf?: Date; client?: Db }
): Promise<PlanResolution> {
  try {
    const supabase = await db(options?.client);
    const { data, error } = await supabase.rpc("plan_effective_for_module", {
      p_organization_id: organizationId,
      p_module_code: moduleCode,
      ...(options?.asOf ? { p_as_of: options.asOf.toISOString() } : {}),
    });
    if (error) return { status: "unavailable" };
    return mapPlan(data);
  } catch {
    return { status: "unavailable" };
  }
}

/**
 * El plan que aplica a los recursos DE LA EMPRESA — el almacenamiento y la IA,
 * que el propietario del producto congeló como cuota única de organización.
 *
 * Excluye los módulos no funcionales. `core` nace en `full` para siempre en
 * toda empresa porque es infraestructura, y contarlo haría que cualquier
 * empresa resolviera a Full: el plan dejaría de significar nada.
 */
export async function resolveOrganizationPlan(
  organizationId: string, options?: { asOf?: Date; client?: Db }
): Promise<PlanResolution> {
  try {
    const supabase = await db(options?.client);
    const { data, error } = await supabase.rpc("plan_effective_for_organization", {
      p_organization_id: organizationId,
      ...(options?.asOf ? { p_as_of: options.asOf.toISOString() } : {}),
    });
    if (error) return { status: "unavailable" };
    return mapPlan(data);
  } catch {
    return { status: "unavailable" };
  }
}

/** El límite de un recurso en una revisión concreta. */
export async function resolvePlanLimit(
  planRevisionId: string, resourceCode: string, client?: Db
): Promise<LimitResolution> {
  try {
    const supabase = await db(client);
    const { data, error } = await supabase.rpc("plan_limit_for_revision", {
      p_plan_revision_id: planRevisionId,
      p_resource_code: resourceCode,
    });
    if (error) return { status: "unavailable", resourceCode };
    const r = data as Record<string, unknown> | null;
    if (!r || typeof r.status !== "string") return { status: "unavailable", resourceCode };
    if (r.status === "finite") {
      const v = Number(r.value);
      if (!Number.isFinite(v)) return { status: "unavailable", resourceCode };
      return { status: "finite", value: v, resourceCode };
    }
    if (r.status === "unlimited") return { status: "unlimited", resourceCode };
    if (r.status === "not_configured") return { status: "not_configured", resourceCode };
    return { status: "unavailable", resourceCode };
  } catch {
    return { status: "unavailable", resourceCode };
  }
}

/**
 * ¿Se permite una operación medida contra este límite?
 *
 * La única función que traduce un límite en un sí o un no, para que la regla
 * viva en un sitio y no repartida por cada consumidor.
 *
 * **`not_configured` y `unavailable` DENIEGAN.** Es lo contrario de lo cómodo:
 * lo cómodo sería dejar pasar mientras no se haya decidido. Pero un límite sin
 * decidir que concede es un límite que no existe, y una avería que concede es
 * una puerta abierta por accidente.
 */
export function allowsUsage(
  limit: LimitResolution, currentUsage: number, requested = 1
): { allowed: boolean; reason: "within" | "exceeded" | "not_configured" | "unavailable" } {
  if (limit.status === "unlimited") return { allowed: true, reason: "within" };
  if (limit.status === "not_configured") return { allowed: false, reason: "not_configured" };
  if (limit.status === "unavailable") return { allowed: false, reason: "unavailable" };
  return currentUsage + requested <= limit.value
    ? { allowed: true, reason: "within" }
    : { allowed: false, reason: "exceeded" };
}

// ---------------------------------------------------------------------------
// El catálogo
// ---------------------------------------------------------------------------

export type PublicPlan = {
  planCode: CanonicalPlanCode;
  displayOrder: number;
  planRevisionId: string;
  displayName: string;
  description: string | null;
  publicConditions: string | null;
  /** `not_configured` **no** significa gratis: significa sin decidir. */
  priceState: "configured" | "not_configured";
  currency: string | null;
  /** En unidades MENORES y **antes de impuestos**. */
  monthlyPriceMinor: number | null;
  annualPriceMinor: number | null;
};

/**
 * El catálogo público, tal como PE-05 podrá enseñarlo.
 *
 * Sale de una vista que deja fuera las notas internas, los borradores y las
 * revisiones retiradas. La decisión de qué es público vive en la base y no en
 * un componente: «no lo pintamos» es una decisión de pantalla, y PostgREST
 * expone la tabla igualmente.
 */
export async function listPublicPlanCatalog(client?: Db): Promise<PublicPlan[] | null> {
  try {
    const supabase = await db(client);
    const { data, error } = await supabase
      .from("v_public_plan_catalog")
      .select("plan_code, display_order, plan_revision_id, display_name, description,"
        + " public_conditions, price_state, currency, monthly_price_minor, annual_price_minor")
      .order("display_order");
    if (error) return null;   // sin dato NO es «no hay planes»
    // El tipo se declara a mano: sin tipos generados, el cliente infiere una
    // unión con `GenericStringError` y TypeScript no deja leer ni una columna.
    type Fila = {
      plan_code: string; display_order: number; plan_revision_id: string;
      display_name: string; description: string | null;
      public_conditions: string | null; price_state: string;
      currency: string | null; monthly_price_minor: number | null;
      annual_price_minor: number | null;
    };
    return ((data ?? []) as unknown as Fila[]).map((r) => ({
      planCode: r.plan_code as CanonicalPlanCode,
      displayOrder: Number(r.display_order),
      planRevisionId: String(r.plan_revision_id),
      displayName: String(r.display_name),
      description: (r.description as string | null) ?? null,
      publicConditions: (r.public_conditions as string | null) ?? null,
      priceState: r.price_state as "configured" | "not_configured",
      currency: (r.currency as string | null) ?? null,
      monthlyPriceMinor: r.monthly_price_minor === null ? null : Number(r.monthly_price_minor),
      annualPriceMinor: r.annual_price_minor === null ? null : Number(r.annual_price_minor),
    }));
  } catch {
    return null;
  }
}

/**
 * La política de prueba, como configuración.
 *
 * Hoy las 48 horas viven DENTRO de `provision_new_organization_modules`, donde
 * cambiarlas exige una migración y el propietario del producto no puede
 * tocarlas. B1 la saca a una fila; **B2 hará que la creación de empresas la
 * lea**.
 */
export type TrialPolicy = {
  enabled: boolean;
  trialPlanCode: CanonicalPlanCode;
  trialDurationHours: number;
};

export async function getTrialPolicy(client?: Db): Promise<TrialPolicy | null> {
  try {
    const supabase = await db(client);
    const { data, error } = await supabase
      .from("commercial_trial_policy")
      .select("enabled, trial_plan_code, trial_duration_hours")
      .maybeSingle();
    if (error || !data) return null;
    return {
      enabled: Boolean(data.enabled),
      trialPlanCode: data.trial_plan_code as CanonicalPlanCode,
      trialDurationHours: Number(data.trial_duration_hours),
    };
  } catch {
    return null;
  }
}

/**
 * COMMERCIAL-UX-01C · Los límites publicados, tal como se le pueden enseñar a
 * un cliente.
 *
 * Sale de `v_public_plan_limits`, que deja fuera los recursos marcados como no
 * públicos y las revisiones que no están vigentes. Igual que su hermana de
 * arriba: la decisión de qué es público vive en la base, porque «no lo
 * pintamos» es una decisión de pantalla y PostgREST expone la vista igual.
 */
export type PublicPlanLimit = {
  planCode: CanonicalPlanCode;
  resourceCode: string;
  resourceLabel: string | null;
  unit: string | null;
  limitState: "finite" | "unlimited" | "not_configured";
  limitValue: number | null;
};

export async function listPublicPlanLimits(
  client?: Db
): Promise<PublicPlanLimit[] | null> {
  try {
    const supabase = await db(client);
    const { data, error } = await supabase
      .from("v_public_plan_limits")
      .select("plan_code, resource_code, resource_label, unit, limit_state, limit_value");
    if (error) return null;   // sin dato NO es «sin límites»
    type Fila = {
      plan_code: string; resource_code: string; resource_label: string | null;
      unit: string | null; limit_state: string; limit_value: number | null;
    };
    return ((data ?? []) as unknown as Fila[]).map((r) => ({
      planCode: r.plan_code as CanonicalPlanCode,
      resourceCode: String(r.resource_code),
      resourceLabel: (r.resource_label as string | null) ?? null,
      unit: (r.unit as string | null) ?? null,
      limitState: r.limit_state as "finite" | "unlimited" | "not_configured",
      limitValue: r.limit_value === null ? null : Number(r.limit_value),
    }));
  } catch {
    return null;
  }
}
