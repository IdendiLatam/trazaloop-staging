import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";
import {
  resolveModulePlan, resolveOrganizationPlan, type PlanResolution,
} from "@/lib/db/commercial-plans";

/**
 * Trazaloop · PE-04B1 · La comparación en sombra.
 *
 *
 * PARA QUÉ
 *
 * PE-04B2 va a mover la autoridad comercial del modelo de hoy al canónico. Antes
 * de mover nada hay que saber **en qué se diferencian**, empresa por empresa, y
 * poder distinguir tres cosas que se parecen mucho:
 *
 *   · una diferencia ESPERADA por el propio diseño de la migración;
 *   · una DERIVA del modelo viejo, que es un defecto que ya existe;
 *   · un fallo del modelo nuevo.
 *
 * Sin esa distinción, cualquier diferencia se leería como «el modelo nuevo está
 * mal» o —peor— se aplastaría a «coincide» y la migración se haría a ciegas.
 *
 *
 * SOLO LEE
 *
 * No escribe nada. No corrige nada. No sincroniza nada. Es el mismo principio
 * que el inventario de residuos de PE-03B5: la herramienta que compara no puede
 * ser la que arregla, porque entonces nadie mira el informe.
 */

type Db = SupabaseClient;
async function db(client?: Db): Promise<Db> {
  return client ?? (await createServerClient());
}

export type DriftClass =
  /** Las dos verdades dicen lo mismo. */
  | "MATCH"
  /** Difieren, y el diseño de la migración dice que difieran. */
  | "EXPECTED_MIGRATION_DIFFERENCE"
  /** Las fuentes VIEJAS se contradicen entre sí. Defecto que ya existe. */
  | "LEGACY_DRIFT"
  /** El modelo nuevo no pudo responder. */
  | "CANONICAL_UNAVAILABLE";

export type ShadowRow = {
  organizationId: string;
  organizationName: string;
  moduleCode: string | null;
  /** `organization_modules.access_mode` · la autoridad de hoy. */
  legacyModuleAccessMode: string | null;
  /** `organization_effective_plan_code()` · lo que la consola llama efectivo. */
  legacyEffectivePlan: string | null;
  /** `organization_subscriptions.plan_code` · la fila que nadie mantiene. */
  legacySubscriptionPlan: string | null;
  /** Lo que devuelve el resolutor canónico. */
  canonical: PlanResolution;
  drift: DriftClass;
  /**
   * Las dos fuentes VIEJAS se contradicen entre sí, con independencia de lo que
   * diga el modelo nuevo.
   *
   * Va aparte de `drift` a propósito. Mientras B1 no migre a nadie, el canónico
   * responde `absent` y toda fila cae en EXPECTED_MIGRATION_DIFFERENCE — y ahí
   * se perdería el dato que de verdad importa para B2: cuántas empresas tienen
   * hoy sus dos verdades en desacuerdo. Contarlo dentro de las cuatro clases lo
   * habría escondido detrás del estado transitorio de este tramo.
   */
  legacyMismatch: boolean;
  note: string;
};

/**
 * Qué plan canónico corresponde a un `access_mode` de hoy.
 *
 * `demo` → `free`, y esa es la traducción que define la migración entera: la
 * ventana de prueba deja de ser un plan y el suelo pasa a ser Free.
 */
export function legacyModeToCanonical(mode: string | null): string | null {
  if (mode === "demo") return "free";
  if (mode === "full" || mode === "extra") return mode;
  return null;
}

/**
 * Clasifica una fila. **Nunca fuerza una coincidencia.**
 *
 * El orden importa: primero se mira si el modelo nuevo pudo responder, después
 * si las fuentes viejas se contradicen entre sí, y solo entonces si coinciden.
 * Al revés, una deriva del modelo viejo se escondería detrás de un «coincide».
 */
export function classifyDrift(input: {
  legacyModuleAccessMode: string | null;
  legacyEffectivePlan: string | null;
  legacySubscriptionPlan: string | null;
  canonical: PlanResolution;
}): { drift: DriftClass; legacyMismatch: boolean; note: string } {
  const { legacyModuleAccessMode, legacyEffectivePlan, legacySubscriptionPlan, canonical } = input;

  // La deriva de hoy: el módulo dice una cosa y la suscripción otra. Es el
  // origen del «Plan Demo · 50 MB» que PE-04A documentó, y se calcula SIEMPRE,
  // aunque el modelo nuevo esté perfecto o aún no haya respondido.
  const legacyMismatch =
    legacySubscriptionPlan !== null
    && legacyEffectivePlan !== null
    && legacySubscriptionPlan !== legacyEffectivePlan;

  if (canonical.status === "unavailable") {
    return { drift: "CANONICAL_UNAVAILABLE", legacyMismatch,
      note: "El resolutor canónico no pudo responder." };
  }

  const esperado = legacyModeToCanonical(legacyModuleAccessMode ?? legacyEffectivePlan);

  if (canonical.status === "absent") {
    // Todavía no hay asignación canónica: es lo normal en B1, porque B1 no
    // migra a nadie. No es un fallo.
    return {
      drift: "EXPECTED_MIGRATION_DIFFERENCE", legacyMismatch,
      note: legacyMismatch
        ? `Sin asignación canónica todavía. Y las fuentes viejas ya discrepan: `
          + `módulos dicen «${legacyEffectivePlan}» y la suscripción «${legacySubscriptionPlan}».`
        : "Sin asignación canónica todavía · B1 no migra a nadie.",
    };
  }

  if (legacyMismatch) {
    return {
      drift: "LEGACY_DRIFT", legacyMismatch,
      note: `Las fuentes viejas se contradicen: módulos «${legacyEffectivePlan}», `
        + `suscripción «${legacySubscriptionPlan}». El canónico dice «${canonical.planCode}».`,
    };
  }

  if (esperado !== null && canonical.planCode === esperado) {
    return { drift: "MATCH", legacyMismatch, note: `Las dos dicen «${canonical.planCode}».` };
  }

  if (esperado === "free" && canonical.planCode === "free") {
    return { drift: "MATCH", legacyMismatch,
      note: "Demo vencido y Free canónico son el mismo suelo." };
  }

  return {
    drift: "EXPECTED_MIGRATION_DIFFERENCE", legacyMismatch,
    note: `Lo viejo apunta a «${esperado ?? "nada"}» y lo canónico a `
      + `«${canonical.planCode}» (${canonical.grantKind}).`,
  };
}

/**
 * Compara las dos verdades para las empresas indicadas.
 *
 * Si no se indica ninguna, compara todas las que el llamante pueda leer —lo que
 * en la práctica significa: personal de plataforma ve todas, y cualquier otro,
 * las suyas. La RLS hace el filtrado; esta función no la esquiva.
 */
export async function compareLegacyAndCanonical(
  options?: { organizationIds?: readonly string[]; client?: Db }
): Promise<ShadowRow[] | null> {
  try {
    const supabase = await db(options?.client);

    let q = supabase.from("organizations").select("id, name");
    if (options?.organizationIds?.length) q = q.in("id", options.organizationIds);
    const { data: orgs, error } = await q;
    if (error) return null;

    const filas: ShadowRow[] = [];

    for (const o of orgs ?? []) {
      const orgId = String(o.id);
      const nombre = String(o.name);

      const { data: sub } = await supabase.from("organization_subscriptions")
        .select("plan_code").eq("organization_id", orgId).maybeSingle();
      const { data: legacyEffective } = await supabase
        .rpc("get_organization_effective_plan", { p_organization_id: orgId });

      // Nivel de empresa.
      const canonOrg = await resolveOrganizationPlan(orgId, { client: supabase });
      const claseOrg = classifyDrift({
        legacyModuleAccessMode: null,
        legacyEffectivePlan: (legacyEffective as string | null) ?? null,
        legacySubscriptionPlan: (sub?.plan_code as string | null) ?? null,
        canonical: canonOrg,
      });
      filas.push({
        organizationId: orgId, organizationName: nombre, moduleCode: null,
        legacyModuleAccessMode: null,
        legacyEffectivePlan: (legacyEffective as string | null) ?? null,
        legacySubscriptionPlan: (sub?.plan_code as string | null) ?? null,
        canonical: canonOrg, ...claseOrg,
      });

      // Y módulo a módulo, que es donde vive el detalle que un plan por empresa
      // perdería: PCR en Full y Textiles en Demo es un caso real.
      const { data: mods } = await supabase.from("organization_modules")
        .select("module_code, access_mode, enabled, access_expires_at")
        .eq("organization_id", orgId);
      for (const m of mods ?? []) {
        const code = String(m.module_code);
        const vencido = m.access_mode === "demo" && m.access_expires_at !== null
          && new Date(String(m.access_expires_at)) <= new Date();
        const modo = !m.enabled || vencido ? "demo" : String(m.access_mode);
        const canon = await resolveModulePlan(orgId, code, { client: supabase });
        const clase = classifyDrift({
          legacyModuleAccessMode: modo,
          legacyEffectivePlan: (legacyEffective as string | null) ?? null,
          legacySubscriptionPlan: (sub?.plan_code as string | null) ?? null,
          canonical: canon,
        });
        filas.push({
          organizationId: orgId, organizationName: nombre, moduleCode: code,
          legacyModuleAccessMode: modo,
          legacyEffectivePlan: (legacyEffective as string | null) ?? null,
          legacySubscriptionPlan: (sub?.plan_code as string | null) ?? null,
          canonical: canon, ...clase,
        });
      }
    }

    return filas;
  } catch {
    return null;
  }
}

/** El recuento por clase, para el informe de B2. */
export function summarizeDrift(
  rows: readonly ShadowRow[]
): Record<DriftClass, number> & { legacyMismatch: number } {
  const base = {
    MATCH: 0, EXPECTED_MIGRATION_DIFFERENCE: 0,
    LEGACY_DRIFT: 0, CANONICAL_UNAVAILABLE: 0, legacyMismatch: 0,
  };
  for (const r of rows) {
    base[r.drift] += 1;
    if (r.legacyMismatch) base.legacyMismatch += 1;
  }
  return base;
}
