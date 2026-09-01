"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { requirePlatformStaff } from "@/lib/auth/require-platform-staff";
import {
  getOrganizationUsage,
  listAllOrganizationUsage,
  getOrganizationEffectivePlanCode,
  getPlanLimits,
  listPlanDefinitions,
  listPlanHistory,
  changeOrganizationPlan,
  type PlanDefinitionRow,
} from "@/lib/db/plans";
import {
  canCreateResource,
  isPlanFeatureEnabled,
  canChangeOrganizationPlan,
  buildResourceLimitMessage,
  buildPlanStatusMessage,
  FEATURE_NOT_AVAILABLE_MESSAGE,
  IMPORTS_PLAN_MESSAGE,
  STORAGE_LIMIT_MESSAGE,
  findLimit,
} from "@/lib/plans/limits";
import { isPlanCode, isPlanStatus, commercialTierToLegacyPlanCode, type ResourceCode, type PlanCode, type CommercialTier, type SubscriptionPlanHistoryEntry } from "@/lib/plans/types";

/**
 * PE-04B2 · Lo que se dice cuando NO SE PUDO determinar el plan.
 *
 * No es «tu plan no lo permite» —eso sería mentir sobre lo que la empresa
 * tiene— ni se deja pasar. Se deniega y se dice que fue un fallo de lectura,
 * que es lo único cierto. Mismo criterio que `RESOURCE_USAGE_UNVERIFIABLE`.
 */
const PLAN_UNVERIFIABLE_MESSAGE =
  "No se pudo comprobar el plan de tu empresa ahora mismo. Vuelve a intentarlo en un momento.";
import { getOrganizationStorageStatus } from "@/lib/db/organization-storage";
import type { OrganizationPlanUsage } from "@/lib/plans/usage";

/**
 * PE-04B3 · Lo que se dice cuando no se pudo comprobar la CAPACIDAD. No es
 * «te quedaste sin espacio» —eso afirmaría algo que no se sabe— ni se deja
 * pasar.
 */
const STORAGE_UNVERIFIABLE_MESSAGE =
  "No se pudo comprobar la capacidad de almacenamiento de tu empresa ahora mismo. No se subió nada; vuelve a intentarlo en un momento.";

/**
 * Trazaloop · Sprint 10A · Server actions de planes.
 *
 * ⚠️ T9F.1 — SCOPE LEGACY / ORG-WIDE. Estos helpers resuelven contra el plan
 * general de organization_subscriptions (v_organization_plan_usage) y quedan
 * RESERVADOS a recursos transversales de la organización que NO pertenecen a
 * un módulo comercial: equipo (team_members, roles_enabled), logo de empresa
 * (almacenamiento GLOBAL no atribuido a módulo) y lecturas informativas
 * legacy. Desde PCR-01/RH-01 el PLAN comercial que gobierna esos recursos ya
 * no sale de organization_subscriptions sino del plan efectivo por módulos
 * (0103): la vista legacy solo aporta el USO agregado y el estado
 * administrativo de la cuenta. PROHIBIDO usarlos en acciones CPR o Textiles:
 * esos módulos validan
 * SIEMPRE con los helpers por módulo de server/actions/module-plans.ts
 * (moduleCode explícito, plan y uso del propio módulo). Una prueba estática
 * (tests/unit/t9f1-module-operational-enforcement.test.ts) impide nuevas
 * llamadas operativas CPR/Textiles sin moduleCode.
 *
 * checkResourceLimit / checkFeatureEnabled / checkStorageAvailable eran el
 * helper central (Parte 7) para TODAS las server actions; desde T9F.1 su
 * alcance queda limitado a lo anterior. La validación real ocurre aquí, en
 * servidor: la UI solo refleja lo mismo para guiar, nunca es la única
 * barrera.
 *
 * Corrección (Bloqueante 3): las 3 funciones llaman PRIMERO a
 * checkPlanStatusBlocking — una suscripción suspended/cancelled bloquea
 * cualquier creación/carga sin importar si estaría dentro del límite
 * normal del plan. Ese estado ADMINISTRATIVO de cuenta (no comercial) lo
 * reutilizan también los helpers por módulo.
 */

function checkPlanStatusBlocking(usage: OrganizationPlanUsage): { allowed: boolean; error: string | null } {
  const message = buildPlanStatusMessage(usage.planStatus);
  return message ? { allowed: false, error: message } : { allowed: true, error: null };
}

/**
 * Corrección (Bloqueante 3): helper central para mutaciones que NO pasan
 * por checkResourceLimit/checkFeatureEnabled/checkStorageAvailable
 * (diagnóstico, configuración de empresa, logo, TrazaDocs) — una
 * organización suspended/cancelled queda en modo SOLO LECTURA: nunca
 * bloquea páginas de lectura ni borra nada, solo impide escribir. Se usa
 * la organización activa (requireActiveOrg), nunca un organization_id
 * del cliente.
 */
export async function checkOrganizationCanMutate(): Promise<{ allowed: boolean; error: string | null }> {
  const org = await requireActiveOrg();
  const usage = await getOrganizationUsage(org.organizationId);
  if (!usage) return { allowed: true, error: null }; // sin datos de uso: no bloquear por un fallo de lectura.
  return checkPlanStatusBlocking(usage);
}

// ---------------------------------------------------------------------------
// Helper central — usado desde OTROS server actions.
// ---------------------------------------------------------------------------
export async function checkResourceLimit(resourceCode: ResourceCode): Promise<{ allowed: boolean; error: string | null }> {
  const org = await requireActiveOrg();
  const usage = await getOrganizationUsage(org.organizationId);
  if (!usage) return { allowed: true, error: null }; // sin datos de uso: no bloquear por un fallo de lectura.

  const statusCheck = checkPlanStatusBlocking(usage);
  if (!statusCheck.allowed) return statusCheck;

  // PCR-01 (punto 16): el LÍMITE comercial de los recursos transversales se
  // resuelve con el plan EFECTIVO por módulos (0103) — organization_
  // subscriptions ya solo aporta el estado administrativo de la cuenta.
  // Demo→Full/Extra habilita de inmediato; Full→Demo vuelve a restringir.
  // PE-04B2 · El plan puede venir como `null` = «no se pudo determinar». Se
  // DENIEGA y se dice que no se pudo verificar — no se cae al plan más bajo,
  // que era lo que hacía creer a un cliente Full que era Demo.
  const tier = await getOrganizationEffectivePlanCode(org.organizationId);
  if (tier === null) return { allowed: false, error: PLAN_UNVERIFIABLE_MESSAGE };
  const limits = await getPlanLimits(commercialTierToLegacyPlanCode(tier));
  const limit = findLimit(limits, resourceCode);
  if (!limit) return { allowed: true, error: null };

  const currentCount = resourceCurrentCount(usage, resourceCode);
  const allowed = canCreateResource(currentCount, limit);
  return { allowed, error: allowed ? null : buildResourceLimitMessage() };
}

export async function checkFeatureEnabled(
  resourceCode: "roles_enabled" | "diagnostic_recommendations_enabled" | "imports_enabled"
): Promise<{ allowed: boolean; error: string | null }> {
  const org = await requireActiveOrg();
  const usage = await getOrganizationUsage(org.organizationId);
  if (!usage) return { allowed: true, error: null };

  const statusCheck = checkPlanStatusBlocking(usage);
  if (!statusCheck.allowed) return statusCheck;

  // PCR-01 (punto 16): mismo criterio que checkResourceLimit — el plan que
  // decide si la función está disponible es el EFECTIVO por módulos (0103),
  // nunca la copia obsoleta de organization_subscriptions. Corrige el bug
  // real Demo→Full de invitaciones (roles_enabled) de raíz y en servidor.
  const tier = await getOrganizationEffectivePlanCode(org.organizationId);
  if (tier === null) return { allowed: false, error: PLAN_UNVERIFIABLE_MESSAGE };
  const limits = await getPlanLimits(commercialTierToLegacyPlanCode(tier));
  const limit = findLimit(limits, resourceCode);
  if (!limit) return { allowed: true, error: null };

  const allowed = isPlanFeatureEnabled(limit);
  const message = resourceCode === "imports_enabled" ? IMPORTS_PLAN_MESSAGE : FEATURE_NOT_AVAILABLE_MESSAGE;
  return { allowed, error: allowed ? null : message };
}

export async function checkStorageAvailable(bytesToAdd: number): Promise<{ allowed: boolean; error: string | null }> {
  const org = await requireActiveOrg();

  // Eje ADMINISTRATIVO (suspended/cancelled). Sigue sin bloquear ante un fallo
  // de lectura de la vista legacy: ese eje no es el del almacenamiento.
  const usage = await getOrganizationUsage(org.organizationId);
  if (usage) {
    const statusCheck = checkPlanStatusBlocking(usage);
    if (!statusCheck.allowed) return statusCheck;
  }

  // PE-04B3 · Eje COMERCIAL. Una sola cuota por empresa, un solo uso y un solo
  // estado, los de 0164. Se retira el puente free→demo de B2: la cuota ya no
  // se traduce a un plan legacy para leerla de `plan_definitions`, sale de
  // `plan_revision_limits.storage_bytes`. Y se retira el uso de la vista
  // legacy, que ignoraba versiones de TrazaDocs, reservas vivas y huérfanos.
  //
  // FAIL-CLOSED: no poder comprobar la capacidad NIEGA. Dejar pasar ante un
  // fallo de lectura es exactamente cómo se abren los desbordes que después
  // nadie sabe explicar.
  const storage = await getOrganizationStorageStatus(org.organizationId);
  if (!storage || storage.state === "QUOTA_UNAVAILABLE") {
    return { allowed: false, error: STORAGE_UNVERIFIABLE_MESSAGE };
  }
  if (storage.limitState === "unlimited") return { allowed: true, error: null };
  if (storage.quotaBytes === null) {
    return { allowed: false, error: STORAGE_UNVERIFIABLE_MESSAGE };
  }

  const allowed = storage.usedBytes + bytesToAdd <= storage.quotaBytes;
  return { allowed, error: allowed ? null : STORAGE_LIMIT_MESSAGE };
}

function resourceCurrentCount(usage: OrganizationPlanUsage, resourceCode: ResourceCode): number {
  switch (resourceCode) {
    case "documents_trazadocs":
      return usage.documentsTrazadocsCount;
    case "suppliers":
      return usage.suppliersCount;
    case "materials":
      return usage.materialsCount;
    case "products":
      return usage.productsCount;
    case "evidences":
      return usage.evidencesCount;
    case "production_orders":
      return usage.productionOrdersCount;
    case "input_batches":
      return usage.inputBatchesCount;
    case "output_batches":
      return usage.outputBatchesCount;
    case "team_members":
      return usage.teamMembersCount;
    default:
      return 0;
  }
}

// ---------------------------------------------------------------------------
// Lecturas — empresa (Parte 9: indicador de plan/uso en la UI).
// ---------------------------------------------------------------------------
export async function getOrganizationPlanAction(): Promise<OrganizationPlanUsage | null> {
  const org = await requireActiveOrg();
  return getOrganizationUsage(org.organizationId);
}

export async function getOrganizationUsageAction(): Promise<{ usage: OrganizationPlanUsage | null; limits: Awaited<ReturnType<typeof getPlanLimits>> }> {
  const org = await requireActiveOrg();
  const usage = await getOrganizationUsage(org.organizationId);
  const limits = usage ? await getPlanLimits(usage.planCode) : [];
  return { usage, limits };
}

// ===========================================================================
// Superadmin — administración de planes (/platform).
// ===========================================================================
export type PlanActionState = { error: string | null; success?: boolean };
const okState: PlanActionState = { error: null, success: true };

export async function listAllOrganizationPlansAction(): Promise<{ data: OrganizationPlanUsage[]; canManage: boolean }> {
  const { isSuperadmin } = await requirePlatformStaff();
  const data = await listAllOrganizationUsage();
  return { data, canManage: canChangeOrganizationPlan(isSuperadmin ? "superadmin" : null) };
}

export async function getOrganizationPlanDetailAction(
  organizationId: string
): Promise<{
  usage: OrganizationPlanUsage | null;
  history: SubscriptionPlanHistoryEntry[];
  plans: PlanDefinitionRow[];
  canManage: boolean;
  /** RH-01.1 · Plan comercial VIGENTE (organization_modules, 0103). Es el
   *  dato que la consola debe presentar; `usage.planCode` es histórico.
   *
   *  PE-04B2 · `null` significa **no se pudo determinar**, y la consola tiene
   *  que decirlo así. Antes esta ruta caía a `demo` ante un fallo de lectura, y
   *  eso es exactamente lo que hacía que un cliente Full leyera «Plan Demo». */
  effectivePlanCode: CommercialTier | null;
  /** RH-01.1/RH-01.2 · Cuota real que aplica el servidor con ese plan. */
  effectiveStorageLimitBytes: number;
}> {
  const { isSuperadmin } = await requirePlatformStaff();
  const [allUsage, history, plans, effectivePlanCode] = await Promise.all([
    listAllOrganizationUsage(),
    listPlanHistory(organizationId),
    listPlanDefinitions(),
    getOrganizationEffectivePlanCode(organizationId),
  ]);
  const usage = allUsage.find((u) => u.organizationId === organizationId) ?? null;
  // PE-04B3 · La consola enseña la MISMA cuota que el servidor aplica: la
  // canónica de la empresa (0164). Mientras la sacara de `plan_definitions` a
  // través del puente free→demo podía enseñar un número y el producto exigir
  // otro, que es la familia de defectos que abrió PE-04B2.
  //
  // Sin plan determinado no se inventa una cuota: se devuelve 0 y la pantalla
  // muestra que no se pudo determinar, en vez de un número de un plan que
  // quizá no sea el suyo. Hoy ningún plan tiene almacenamiento ilimitado; si
  // alguno lo tuviera, la consola tendría que decir «sin límite» en vez de un
  // número, y eso es un cambio de pantalla, no de cálculo.
  const storageStatus = await getOrganizationStorageStatus(organizationId);
  const effectiveStorageLimitBytes =
    storageStatus && storageStatus.limitState === "finite" && storageStatus.quotaBytes !== null
      ? storageStatus.quotaBytes
      : 0;
  return {
    usage,
    history,
    plans,
    canManage: canChangeOrganizationPlan(isSuperadmin ? "superadmin" : null),
    effectivePlanCode,
    effectiveStorageLimitBytes,
  };
}

export async function changeOrganizationPlanAction(
  _prev: PlanActionState,
  formData: FormData
): Promise<PlanActionState> {
  const { isSuperadmin } = await requirePlatformStaff();
  if (!canChangeOrganizationPlan(isSuperadmin ? "superadmin" : null)) {
    return { error: "Solo un superadministrador de plataforma puede cambiar el plan de una empresa." };
  }

  const organizationId = String(formData.get("organization_id") ?? "");
  const toPlanCode = String(formData.get("plan_code") ?? "");
  const toStatus = String(formData.get("status") ?? "active");
  const reason = String(formData.get("reason") ?? "").trim() || null;

  if (!isPlanCode(toPlanCode)) return { error: "Plan no válido." };
  if (!isPlanStatus(toStatus)) return { error: "Estado de suscripción no válido." };

  const { error } = await changeOrganizationPlan(organizationId, toPlanCode as PlanCode, toStatus, reason);
  if (error) return { error };

  revalidatePath("/platform");
  revalidatePath(`/platform/organizations/${organizationId}`);
  revalidatePath("/implementation");
  return okState;
}
