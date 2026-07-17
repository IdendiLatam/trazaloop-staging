/**
 * Trazaloop · Sprint 10A · Lógica PURA de límites y cuotas.
 * Espejo de la RLS y de plan_limits (0050): esta capa es la que aplican
 * los server actions ANTES de escribir, para dar un mensaje claro — el
 * respaldo real de "no aceptar plan_code desde cliente" vive en
 * create_organization/create_platform_organization/change_organization_plan
 * (0053), todas SECURITY DEFINER.
 */
import type { PlanLimit, PlanStatus, ResourceCode } from "./types";
import type { PlatformRoleCode } from "../domain/platform";

// ---------------------------------------------------------------------------
// Mensajes (Parte 8) — sin lenguaje comercial agresivo, tono informativo.
// ---------------------------------------------------------------------------
export const DEMO_RESOURCE_LIMIT_MESSAGE = "Tu plan Demo alcanzó el límite para este recurso.";
export const UPGRADE_SUGGESTION_MESSAGE = "Actualiza a Full o Extra para continuar creando registros.";
export const FEATURE_NOT_AVAILABLE_MESSAGE = "Esta función no está disponible en modo Demo.";
export const STORAGE_LIMIT_MESSAGE = "Has alcanzado el límite de almacenamiento de tu plan.";
export const IMPORTS_PLAN_MESSAGE = "Las importaciones están disponibles en los planes Full y Extra.";

/** Mensaje combinado, tal como lo ve el usuario al chocar con un límite de
 *  conteo (no de función ni de almacenamiento). */
export function buildResourceLimitMessage(): string {
  return `${DEMO_RESOURCE_LIMIT_MESSAGE} ${UPGRADE_SUGGESTION_MESSAGE}`;
}

/** ¿Se puede crear UNO más de este recurso, dado el conteo actual y el
 *  límite de su plan? Ilimitado siempre pasa; con límite numérico, el
 *  conteo actual debe quedar estrictamente por debajo. */
export function canCreateResource(currentCount: number, limit: PlanLimit): boolean {
  if (limit.isUnlimited) return true;
  if (limit.limitValue == null) return false;
  return currentCount < limit.limitValue;
}

/** Los 3 recursos "_enabled" son interruptores: is_unlimited nunca aplica
 *  (siempre false en el seed, 0050), limit_value 0 = apagado, 1 = prendido. */
export function isPlanFeatureEnabled(limit: PlanLimit): boolean {
  if (limit.isUnlimited) return true;
  return (limit.limitValue ?? 0) > 0;
}

export function findLimit(limits: PlanLimit[], resourceCode: ResourceCode): PlanLimit | null {
  return limits.find((l) => l.resourceCode === resourceCode) ?? null;
}

// ---------------------------------------------------------------------------
// Severidad de uso de almacenamiento (Parte 9): normal / advertencia (70%)
// / crítico (90%) / bloqueado (100%).
// ---------------------------------------------------------------------------
export type UsageSeverity = "normal" | "warning" | "critical" | "blocked";

export function resolveUsageSeverity(percentUsed: number): UsageSeverity {
  if (percentUsed >= 100) return "blocked";
  if (percentUsed >= 90) return "critical";
  if (percentUsed >= 70) return "warning";
  return "normal";
}

/** ¿Hay espacio para sumar `bytesToAdd` sin superar la cuota del plan? */
export function hasStorageAvailable(usedBytes: number, limitBytes: number, bytesToAdd: number): boolean {
  return usedBytes + bytesToAdd <= limitBytes;
}

// ---------------------------------------------------------------------------
// Cambiar de plan (Parte 5): solo superadmin de plataforma.
// ---------------------------------------------------------------------------
export function canChangeOrganizationPlan(platformRole: PlatformRoleCode | null | undefined): boolean {
  return platformRole === "superadmin";
}

/**
 * Downgrade que deja a la empresa por encima de límites (Parte 5): no se
 * borran datos, pero se bloquean nuevas creaciones. Esta función solo
 * decide el TEXTO de aviso a mostrar tras el cambio — el bloqueo real de
 * creación lo sigue aplicando canCreateResource con el conteo real en
 * cada acción, comparado contra el límite del plan NUEVO.
 */
export function buildDowngradeWarning(resourcesOverLimit: ResourceCode[]): string | null {
  if (resourcesOverLimit.length === 0) return null;
  return "Esta empresa supera el límite del nuevo plan. No se eliminarán datos, pero se bloquearán nuevas creaciones hasta que el uso esté dentro del límite.";
}

// ---------------------------------------------------------------------------
// Sprint 10A (corrección, Bloqueante 3): una suscripción que no está
// 'active' (suspended/cancelled) permite SEGUIR LEYENDO todo lo que ya
// existe, pero bloquea cualquier creación/carga nueva — sin importar si
// esa creación estaría dentro del límite normal del plan. Este chequeo va
// ANTES de cualquier otro (conteo, función, almacenamiento): un plan
// suspendido no debe evaluarse "como si todavía contara con cuota".
// ---------------------------------------------------------------------------
export const SUSPENDED_ACCOUNT_MESSAGE =
  "La cuenta de esta empresa está suspendida. Contacta al equipo de Trazaloop.";
export const CANCELLED_ACCOUNT_MESSAGE =
  "La cuenta de esta empresa no está activa. Contacta al equipo de Trazaloop.";

export function isPlanActive(status: PlanStatus): boolean {
  return status === "active";
}

export function buildPlanStatusMessage(status: PlanStatus): string | null {
  if (status === "suspended") return SUSPENDED_ACCOUNT_MESSAGE;
  if (status === "cancelled") return CANCELLED_ACCOUNT_MESSAGE;
  return null;
}
