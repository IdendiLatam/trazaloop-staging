"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { requirePlatformStaff } from "@/lib/auth/require-platform-staff";
import {
  getOrganizationUsage,
  listAllOrganizationUsage,
  getPlanLimits,
  listPlanDefinitions,
  listPlanHistory,
  changeOrganizationPlan,
  type PlanDefinitionRow,
} from "@/lib/db/plans";
import {
  canCreateResource,
  isPlanFeatureEnabled,
  hasStorageAvailable,
  canChangeOrganizationPlan,
  buildResourceLimitMessage,
  buildPlanStatusMessage,
  FEATURE_NOT_AVAILABLE_MESSAGE,
  IMPORTS_PLAN_MESSAGE,
  STORAGE_LIMIT_MESSAGE,
  findLimit,
} from "@/lib/plans/limits";
import { isPlanCode, isPlanStatus, type ResourceCode, type PlanCode, type SubscriptionPlanHistoryEntry } from "@/lib/plans/types";
import type { OrganizationPlanUsage } from "@/lib/plans/usage";

/**
 * Trazaloop · Sprint 10A · Server actions de planes.
 *
 * ⚠️ T9F.1 — SCOPE LEGACY / ORG-WIDE. Estos helpers resuelven contra el plan
 * general de organization_subscriptions (v_organization_plan_usage) y quedan
 * RESERVADOS a recursos transversales de la organización que NO pertenecen a
 * un módulo comercial: equipo (team_members, roles_enabled), logo de empresa
 * (almacenamiento GLOBAL no atribuido a módulo) y lecturas informativas
 * legacy. PROHIBIDO usarlos en acciones CPR o Textiles: esos módulos validan
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

  const limits = await getPlanLimits(usage.planCode);
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

  const limits = await getPlanLimits(usage.planCode);
  const limit = findLimit(limits, resourceCode);
  if (!limit) return { allowed: true, error: null };

  const allowed = isPlanFeatureEnabled(limit);
  const message = resourceCode === "imports_enabled" ? IMPORTS_PLAN_MESSAGE : FEATURE_NOT_AVAILABLE_MESSAGE;
  return { allowed, error: allowed ? null : message };
}

export async function checkStorageAvailable(bytesToAdd: number): Promise<{ allowed: boolean; error: string | null }> {
  const org = await requireActiveOrg();
  const usage = await getOrganizationUsage(org.organizationId);
  if (!usage) return { allowed: true, error: null };

  const statusCheck = checkPlanStatusBlocking(usage);
  if (!statusCheck.allowed) return statusCheck;

  const allowed = hasStorageAvailable(usage.storageUsedBytes, usage.storageLimitBytes, bytesToAdd);
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
}> {
  const { isSuperadmin } = await requirePlatformStaff();
  const [allUsage, history, plans] = await Promise.all([
    listAllOrganizationUsage(),
    listPlanHistory(organizationId),
    listPlanDefinitions(),
  ]);
  const usage = allUsage.find((u) => u.organizationId === organizationId) ?? null;
  return { usage, history, plans, canManage: canChangeOrganizationPlan(isSuperadmin ? "superadmin" : null) };
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
