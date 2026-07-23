"use server";

import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { resolveModuleAccessForOrg } from "@/lib/db/module-access";
import { fetchOrganizationModuleUsage } from "@/lib/db/module-usage";
import { getOrganizationUsage, getPlanLimits, listPlanDefinitions } from "@/lib/db/plans";
import {
  CPR_MODULE_CODE,
  TEXTILES_MODULE_CODE,
  getCommercialModuleByCode,
  isFunctionalModuleCode,
} from "@/lib/modules/catalog";
import { accessModeToPlanCode } from "@/lib/modules/access";
import { moduleAccessDeniedMessage } from "@/lib/modules/messages";
import {
  isPlanFeatureEnabled,
  hasStorageAvailable,
  buildResourceLimitMessage,
  buildPlanStatusMessage,
  findLimit,
  FEATURE_NOT_AVAILABLE_MESSAGE,
  IMPORTS_PLAN_MESSAGE,
  STORAGE_LIMIT_MESSAGE,
} from "@/lib/plans/limits";
import type { ResourceCode } from "@/lib/plans/types";
import type { ModuleUsageFailureReason } from "@/lib/db/module-usage";

/**
 * Trazaloop · Sprint T9F.1 · HELPERS OPERATIVOS POR MÓDULO.
 *
 * Cierre del Bloqueador 2: las validaciones operativas (mutación, límites de
 * conteo, funciones e ALMACENAMIENTO) de CPR y Textiles se resuelven desde el
 * plan asignado AL MÓDULO en organization_modules (access_mode → plan_code
 * 1:1, plan_limits/plan_definitions 0050) y desde el uso REAL atribuido al
 * módulo (v_organization_module_usage, 0101). organization_subscriptions
 * (plan legacy org-wide) NO participa en ninguna decisión comercial de estos
 * módulos: una empresa con suscripción legacy Full y Textiles en Demo recibe
 * límites Demo en Textiles; una con suscripción Demo y CPR Full recibe
 * acceso y cuota Full en CPR.
 *
 * ÚNICA excepción, deliberada y documentada: el ESTADO ADMINISTRATIVO de la
 * cuenta (organization_subscriptions.status = suspended/cancelled, Sprint
 * 10A Bloqueante 3) se conserva como bloqueo transversal de escritura. Es un
 * estado de CUENTA, no un plan: no aporta límites ni cuotas y no puede
 * convertir un módulo Demo en Full ni al revés.
 *
 * SECUENCIA de todo helper: (1) sesión + organización activa validada en
 * servidor (el organization_id jamás llega del cliente); (2) membresía
 * (implícita en requireActiveOrg); (3) acceso comercial del MÓDULO por la
 * regla canónica (Demo vencido / deshabilitado / sin asignación / kill
 * switch → bloqueo con mensaje en español, hora del SERVIDOR, sin cron);
 * (4) estado administrativo de cuenta; (5) límite/función/cuota del plan
 * del módulo. Solo entonces la acción ejecuta la operación.
 *
 * moduleCode es SIEMPRE explícito y solo admite módulos funcionales del
 * catálogo canónico: no existe forma de omitirlo y caer silenciosamente al
 * plan general legacy. Las firmas antiguas org-wide (server/actions/plans.ts)
 * quedan marcadas LEGACY y prohibidas en acciones CPR/Textiles (prueba
 * estática en tests/unit/t9f1-module-operational-enforcement.test.ts).
 */

type CheckResult = { allowed: boolean; error: string | null };

const MODULE_NOT_OPERABLE_ERROR = "Este módulo no está disponible para esta operación.";

/** T9F.2 · Bloqueador 3 (fail-closed): mensajes contractuales cuando NO se
 *  puede VERIFICAR el uso. Nunca se asume cero ante un error. */
const STORAGE_VERIFY_MESSAGE =
  "No fue posible verificar la capacidad de almacenamiento disponible. Inténtalo nuevamente.";
const RESOURCE_VERIFY_MESSAGE =
  "No fue posible verificar el uso actual de este recurso. Inténtalo nuevamente.";

function logUsageFailure(context: string, moduleCode: string, reason: ModuleUsageFailureReason | "unknown_sizes"): void {
  // Error técnico SIN secretos (sin SQL, sin claves, sin URLs firmadas).
  console.error(`[module-plans] ${context} bloqueado (fail-closed): módulo=${moduleCode} motivo=${reason}`);
}

type ModuleGateOk = {
  organizationId: string;
  accessMode: "demo" | "full" | "extra";
  moduleName: string;
};

/** (1)–(4): organización activa + acceso comercial del módulo + estado
 *  administrativo de cuenta. Nunca falla abierto en el ACCESO. */
async function resolveModuleGate(
  moduleCode: string
): Promise<{ ok: ModuleGateOk | null; error: string | null }> {
  // moduleCode arbitrario o no funcional → rechazo inmediato (nunca se cae
  // al plan general).
  if (!isFunctionalModuleCode(moduleCode)) {
    return { ok: null, error: MODULE_NOT_OPERABLE_ERROR };
  }
  const org = await requireActiveOrg();
  const mod = getCommercialModuleByCode(moduleCode);
  const access = await resolveModuleAccessForOrg(org.organizationId, moduleCode);
  if (!access.allowed || access.accessMode === null) {
    return {
      ok: null,
      error: moduleAccessDeniedMessage(mod?.name ?? "este módulo", access.reason),
    };
  }

  // Estado ADMINISTRATIVO de cuenta (suspended/cancelled) — ver cabecera.
  const legacyUsage = await getOrganizationUsage(org.organizationId);
  if (legacyUsage) {
    const statusMessage = buildPlanStatusMessage(legacyUsage.planStatus);
    if (statusMessage) return { ok: null, error: statusMessage };
  }

  return {
    ok: {
      organizationId: org.organizationId,
      accessMode: access.accessMode,
      moduleName: mod?.name ?? moduleCode,
    },
    error: null,
  };
}

// ---------------------------------------------------------------------------
// Helpers genéricos por módulo (moduleCode SIEMPRE explícito)
// ---------------------------------------------------------------------------

/** ¿La organización puede MUTAR datos de este módulo ahora mismo? */
export async function checkModuleCanMutate(moduleCode: string): Promise<CheckResult> {
  const gate = await resolveModuleGate(moduleCode);
  if (gate.ok === null) return { allowed: false, error: gate.error };
  return { allowed: true, error: null };
}

/** ¿Se pueden crear `requestedIncrement` unidades más de este recurso,
 *  contra el límite del plan DEL MÓDULO y el conteo REAL del módulo?
 *
 *  T9F.2: (a) acepta un INCREMENTO explícito (creación individual = 1;
 *  creación masiva / importación = número de filas VÁLIDAS: la operación se
 *  rechaza COMPLETA antes del primer INSERT si conteo + incremento supera el
 *  límite — jamás inserción parcial); (b) la decisión conteo+límite se
 *  resuelve en UNA consulta protegida en base de datos
 *  (check_module_resource_allowance, 0101) sobre un snapshot consistente —
 *  no en dos lecturas separadas desde Next.js; (c) FAIL-CLOSED: si el conteo
 *  no puede VERIFICARSE (RPC ausente, error, datos inválidos), la creación
 *  se bloquea con mensaje contractual — nunca se asume 0. */
export async function checkModuleResourceLimit(
  moduleCode: string,
  resourceCode: ResourceCode,
  requestedIncrement = 1
): Promise<CheckResult> {
  const gate = await resolveModuleGate(moduleCode);
  if (gate.ok === null) return { allowed: false, error: gate.error };

  // El incremento lo calcula SIEMPRE el servidor (filas válidas de un CSV,
  // etc.); un valor no entero, no finito o < 1 es un dato inconsistente.
  if (!Number.isInteger(requestedIncrement) || requestedIncrement < 1) {
    logUsageFailure("límite de recurso", moduleCode, "inconsistent_data");
    return { allowed: false, error: RESOURCE_VERIFY_MESSAGE };
  }

  try {
    const { createServerClient } = await import("@/lib/supabase/server");
    const supabase = await createServerClient();
    const { data, error } = await supabase.rpc("check_module_resource_allowance", {
      p_organization_id: gate.ok.organizationId,
      p_module_code: moduleCode,
      p_resource_code: resourceCode,
      p_requested_increment: requestedIncrement,
    });
    if (error || data === null || typeof data !== "object") {
      logUsageFailure("límite de recurso", moduleCode, error ? "query_failed" : "source_unavailable");
      return { allowed: false, error: RESOURCE_VERIFY_MESSAGE };
    }
    const payload = data as { allowed?: unknown; verified?: unknown };
    if (payload.verified !== true || typeof payload.allowed !== "boolean") {
      logUsageFailure("límite de recurso", moduleCode, "inconsistent_data");
      return { allowed: false, error: RESOURCE_VERIFY_MESSAGE };
    }
    return {
      allowed: payload.allowed,
      error: payload.allowed ? null : buildResourceLimitMessage(),
    };
  } catch {
    logUsageFailure("límite de recurso", moduleCode, "query_failed");
    return { allowed: false, error: RESOURCE_VERIFY_MESSAGE };
  }
}

/** ¿La función (interruptor _enabled) está disponible en el plan DEL MÓDULO? */
export async function checkModuleFeatureEnabled(
  moduleCode: string,
  resourceCode: "roles_enabled" | "diagnostic_recommendations_enabled" | "imports_enabled"
): Promise<CheckResult> {
  const gate = await resolveModuleGate(moduleCode);
  if (gate.ok === null) return { allowed: false, error: gate.error };

  const limits = await getPlanLimits(accessModeToPlanCode(gate.ok.accessMode));
  const limit = findLimit(limits, resourceCode);
  if (!limit) return { allowed: true, error: null };

  const allowed = isPlanFeatureEnabled(limit);
  const message =
    resourceCode === "imports_enabled" ? IMPORTS_PLAN_MESSAGE : FEATURE_NOT_AVAILABLE_MESSAGE;
  return { allowed, error: allowed ? null : message };
}

/** ¿Hay espacio para sumar bytesToAdd SIN superar la cuota del plan DEL
 *  MÓDULO, contando solo el uso atribuido a ese módulo? La decisión es 100 %
 *  de servidor: el cliente jamás decide cuota, plan, uso ni módulo. */
export async function checkModuleStorageAvailable(
  moduleCode: string,
  bytesToAdd: number
): Promise<CheckResult> {
  const usage = await getModuleStorageUsage(moduleCode);
  if (!usage.ok) {
    return { allowed: false, error: usage.userMessage };
  }
  if (!Number.isFinite(bytesToAdd) || bytesToAdd < 0) {
    logUsageFailure("cuota de almacenamiento", moduleCode, "inconsistent_data");
    return { allowed: false, error: STORAGE_VERIFY_MESSAGE };
  }
  // T9F.3: el comprometido = usado + RESERVADO (misma aritmética que la BD).
  const allowed = hasStorageAvailable(usage.usedBytes + usage.reservedBytes, usage.limitBytes, bytesToAdd);
  return { allowed, error: allowed ? null : STORAGE_LIMIT_MESSAGE };
}

export type ModuleStorageUsageResult =
  | {
      ok: true;
      usedBytes: number;
      /** T9F.3: bytes RESERVADOS por cargas en curso (intents pending no
       *  vencidos): comprometen capacidad y se restan del disponible. */
      reservedBytes: number;
      limitBytes: number;
      availableBytes: number;
    }
  | { ok: false; reason: ModuleUsageFailureReason | "access_denied" | "unknown_sizes"; userMessage: string };

/** T9F.2 · Resultado TIPADO del uso de almacenamiento del módulo (Bloqueador
 *  3). ok:true ÚNICAMENTE cuando: acceso del módulo vigente + cuota del plan
 *  del módulo resuelta + consulta de uso EXITOSA con valores válidos y SIN
 *  objetos físicos con tamaños contradictorios. Cualquier otra situación
 *  (consulta fallida, vista ausente, null, negativo, no finito, conflicto de
 *  tamaños) devuelve ok:false y los flujos de carga DEBEN bloquear: no se
 *  inicia intento, no se emite URL firmada, no se acepta finalize. */
export async function getModuleStorageUsage(moduleCode: string): Promise<ModuleStorageUsageResult> {
  const gate = await resolveModuleGate(moduleCode);
  if (gate.ok === null) {
    return { ok: false, reason: "access_denied", userMessage: gate.error ?? MODULE_NOT_OPERABLE_ERROR };
  }
  const ok = gate.ok;

  const definitions = await listPlanDefinitions();
  const planCode = accessModeToPlanCode(ok.accessMode);
  const storageLimitBytes = definitions.find((d) => d.code === planCode)?.storageLimitBytes;
  if (
    storageLimitBytes === undefined ||
    !Number.isFinite(storageLimitBytes) ||
    storageLimitBytes < 0
  ) {
    logUsageFailure("cuota de almacenamiento", moduleCode, "source_unavailable");
    return { ok: false, reason: "source_unavailable", userMessage: STORAGE_VERIFY_MESSAGE };
  }

  const usage = await fetchOrganizationModuleUsage(ok.organizationId, moduleCode);
  if (!usage.ok) {
    logUsageFailure("cuota de almacenamiento", moduleCode, usage.reason);
    return { ok: false, reason: usage.reason, userMessage: STORAGE_VERIFY_MESSAGE };
  }
  if (usage.usage.storageObjectConflicts > 0) {
    // Referencias con tamaños contradictorios para el mismo objeto físico:
    // el uso reportado toma el máximo (conservador), pero autorizar cargas
    // NUEVAS con datos inconsistentes está prohibido (fail-closed).
    logUsageFailure("cuota de almacenamiento", moduleCode, "inconsistent_data");
    return { ok: false, reason: "inconsistent_data", userMessage: STORAGE_VERIFY_MESSAGE };
  }
  if (usage.usage.storageUnknownSizeCount > 0) {
    // T9F.3 · Bloqueador F: objetos con ruta física y tamaño DESCONOCIDO.
    // Jamás se interpretan como cero: bloquean nuevas cargas hasta que la
    // reconciliación (scripts/t9f3-size-reconciliation) confirme tamaños.
    logUsageFailure("cuota de almacenamiento", moduleCode, "unknown_sizes");
    return { ok: false, reason: "unknown_sizes", userMessage: STORAGE_VERIFY_MESSAGE };
  }
  const usedBytes = usage.usage.storageUsedBytes;
  const reservedBytes = usage.usage.storageReservedBytes;
  return {
    ok: true,
    usedBytes,
    reservedBytes,
    limitBytes: storageLimitBytes,
    // T9F.3: las reservas activas COMPROMETEN capacidad — el disponible las
    // resta (misma aritmética que begin/finalize en la propia BD).
    availableBytes: Math.max(0, storageLimitBytes - usedBytes - reservedBytes),
  };
}

/** T9F.2 · access_mode del módulo para límites derivados en TypeScript (p.
 *  ej. tamaño máximo POR ARCHIVO de TrazaDocs CPR). Devuelve null con el
 *  mensaje de bloqueo cuando el módulo no es operable: el llamador NO debe
 *  caer a un plan por defecto ni al plan legacy. */
export async function getModuleAccessModeForAction(
  moduleCode: string
): Promise<{ accessMode: "demo" | "full" | "extra" | null; error: string | null }> {
  const gate = await resolveModuleGate(moduleCode);
  if (gate.ok === null) return { accessMode: null, error: gate.error };
  return { accessMode: gate.ok.accessMode, error: null };
}

// ---------------------------------------------------------------------------
// Envolturas canónicas CPR (traceability_6632) — para que ninguna acción CPR
// repita el string del module_code ni pueda equivocarse de módulo.
// ---------------------------------------------------------------------------

export async function checkCprCanMutate(): Promise<CheckResult> {
  return checkModuleCanMutate(CPR_MODULE_CODE);
}

export async function checkCprResourceLimit(
  resourceCode: ResourceCode,
  requestedIncrement = 1
): Promise<CheckResult> {
  return checkModuleResourceLimit(CPR_MODULE_CODE, resourceCode, requestedIncrement);
}

export async function getCprAccessModeForAction(): Promise<{
  accessMode: "demo" | "full" | "extra" | null;
  error: string | null;
}> {
  return getModuleAccessModeForAction(CPR_MODULE_CODE);
}

export async function checkCprFeatureEnabled(
  resourceCode: "roles_enabled" | "diagnostic_recommendations_enabled" | "imports_enabled"
): Promise<CheckResult> {
  return checkModuleFeatureEnabled(CPR_MODULE_CODE, resourceCode);
}

export async function checkCprStorageAvailable(bytesToAdd: number): Promise<CheckResult> {
  return checkModuleStorageAvailable(CPR_MODULE_CODE, bytesToAdd);
}

// ---------------------------------------------------------------------------
// Envolturas canónicas Textiles
// ---------------------------------------------------------------------------

export async function checkTextilesCanMutate(): Promise<CheckResult> {
  return checkModuleCanMutate(TEXTILES_MODULE_CODE);
}

export async function checkTextilesResourceLimit(
  resourceCode: ResourceCode,
  requestedIncrement = 1
): Promise<CheckResult> {
  return checkModuleResourceLimit(TEXTILES_MODULE_CODE, resourceCode, requestedIncrement);
}

export async function checkTextilesFeatureEnabled(
  resourceCode: "roles_enabled" | "diagnostic_recommendations_enabled" | "imports_enabled"
): Promise<CheckResult> {
  return checkModuleFeatureEnabled(TEXTILES_MODULE_CODE, resourceCode);
}

export async function checkTextilesStorageAvailable(bytesToAdd: number): Promise<CheckResult> {
  return checkModuleStorageAvailable(TEXTILES_MODULE_CODE, bytesToAdd);
}
