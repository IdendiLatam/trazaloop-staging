"use server";

import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { resolveModuleAccessForOrg } from "@/lib/db/module-access";
import { getOrganizationStorageStatus } from "@/lib/db/organization-storage";
import { checkCommercialMutation, type MutationIntent } from "@/lib/db/organization-usage";
import { resolveModulePlan, resolvePlanLimit } from "@/lib/db/commercial-plans";
import { getOrganizationUsage } from "@/lib/db/plans";
import {
  CPR_MODULE_CODE,
  TEXTILES_MODULE_CODE,
  QUALITY_MODULE_CODE,
  getCommercialModuleByCode,
  isFunctionalModuleCode,
} from "@/lib/modules/catalog";
import { moduleAccessDeniedMessage } from "@/lib/modules/messages";
import {
  hasStorageAvailable,
  buildResourceLimitMessage,
  buildPlanStatusMessage,
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
/**
 * PE-04B4 · Lo que se dice en modo consulta. No es «no tienes permiso» —lo
 * tiene— ni «se acabó tu plan» —lo sigue teniendo—: es que el tiempo de uso
 * incluido en Free se agotó, y qué SÍ se puede hacer mientras tanto.
 */
const CONSULTATION_MODE_MESSAGE =
  "Tu empresa agotó el tiempo de uso incluido en el plan Free. Puedes seguir consultando, "
  + "descargando y borrando tu información; para volver a crear o modificar, espera al "
  + "reinicio del cupo o cambia de plan.";

const PLAN_UNVERIFIABLE_FEATURE_MESSAGE =
  "No se pudo comprobar qué incluye el plan de tu empresa ahora mismo. Vuelve a intentarlo "
  + "en un momento.";

const COMMERCIAL_UNVERIFIABLE_MESSAGE =
  "No se pudo comprobar lo que tu empresa tiene contratado ahora mismo. No se guardó nada; "
  + "vuelve a intentarlo en un momento.";

export async function checkModuleCanMutate(
  moduleCode: string,
  intent: MutationIntent = "business_increase_or_modify"
): Promise<CheckResult> {
  const gate = await resolveModuleGate(moduleCode);
  if (gate.ok === null) return { allowed: false, error: gate.error };

  // PE-04B4 · EJE COMERCIAL. En modo consulta la empresa no crea ni modifica su
  // sistema de gestión, pero SÍ lee, descarga y BORRA. Por eso la puerta
  // pregunta por la intención: si el borrado se bloqueara, una empresa Free que
  // agotara su tiempo con el almacenamiento lleno quedaría sin poder crear y
  // sin poder liberar espacio. Agotar un cupo comercial no puede secuestrar los
  // datos de nadie.
  //
  // El valor por omisión es el restrictivo a propósito: una acción nueva que no
  // declare su intención se comporta como creación, que es el caso seguro.
  const comercial = await checkCommercialMutation(gate.ok.organizationId, intent);
  if (!comercial) return { allowed: false, error: COMMERCIAL_UNVERIFIABLE_MESSAGE };
  if (!comercial.allowed) {
    return {
      allowed: false,
      error: comercial.state === "ENTITLEMENT_UNAVAILABLE"
        ? COMMERCIAL_UNVERIFIABLE_MESSAGE
        : CONSULTATION_MODE_MESSAGE,
    };
  }
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

  // PE-04B6 · Última autoridad comercial que quedaba leyendo el catálogo
  // LEGACY. `imports_enabled` y compañía están declarados en el catálogo
  // canónico con `scope = module` desde 0162, así que la respuesta correcta se
  // resuelve con el plan efectivo DEL MÓDULO, no traduciendo su `access_mode` a
  // un código de plan heredado.
  //
  // Los valores no cambian —los trece límites funcionales se copiaron byte a
  // byte en 0162/0163, y hay una prueba que compara ambos catálogos recurso a
  // recurso—; lo que cambia es quién manda. El eje de ACCESO al módulo (0100)
  // sigue decidiendo si se puede entrar, arriba, en `resolveModuleGate`.
  const plan = await resolveModulePlan(gate.ok.organizationId, moduleCode);
  if (plan.status === "unavailable") {
    return { allowed: false, error: PLAN_UNVERIFIABLE_FEATURE_MESSAGE };
  }
  if (plan.status === "absent") {
    return { allowed: false, error: PLAN_UNVERIFIABLE_FEATURE_MESSAGE };
  }

  const limit = await resolvePlanLimit(plan.planRevisionId, resourceCode);
  // Un interruptor sin configurar NIEGA: no es «encendido» ni «apagado», es que
  // nadie lo ha decidido, y sobre eso no se autoriza.
  const allowed = limit.status === "unlimited"
    || (limit.status === "finite" && limit.value > 0);
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

  // PE-04B3 · A partir de 0164 la CAPACIDAD ya no es del módulo: es la única
  // de la empresa. El módulo sigue decidiendo el ACCESO (arriba, resolveModuleGate)
  // —son dos ejes distintos—, pero los bytes disponibles son los mismos para
  // PCR, Textiles y el logo. Antes cada módulo creía tener su propio cupo
  // completo, de modo que una empresa Full disponía en la práctica del doble
  // de lo contratado, y el logo no descontaba de ninguno.
  const status = await getOrganizationStorageStatus(ok.organizationId);
  if (!status) {
    logUsageFailure("cuota de almacenamiento", moduleCode, "source_unavailable");
    return { ok: false, reason: "source_unavailable", userMessage: STORAGE_VERIFY_MESSAGE };
  }
  if (status.state === "QUOTA_UNAVAILABLE") {
    // Cuatro maneras de no poder afirmar capacidad —plan ausente, plan
    // ilegible, límite sin configurar, uso no verificable— y una sola
    // respuesta: bloquear. Ninguna de ellas es «cero bytes usados».
    const reason =
      status.reason !== "usage_unverifiable"
        ? "source_unavailable"
        : status.conflictCount > 0
          ? "inconsistent_data"
          : status.unknownSizeCount > 0
            ? "unknown_sizes"
            : "inconsistent_data";
    logUsageFailure("cuota de almacenamiento", moduleCode, reason);
    return { ok: false, reason, userMessage: STORAGE_VERIFY_MESSAGE };
  }

  // «Ilimitado» se representa con Infinity: nunca con 0 ni con null, que es
  // como un límite sin configurar acabaría leyéndose como «sin espacio».
  const limitBytes = status.limitState === "unlimited" ? Number.POSITIVE_INFINITY : status.quotaBytes;
  if (limitBytes === null || !(limitBytes >= 0)) {
    logUsageFailure("cuota de almacenamiento", moduleCode, "source_unavailable");
    return { ok: false, reason: "source_unavailable", userMessage: STORAGE_VERIFY_MESSAGE };
  }

  return {
    ok: true,
    usedBytes: status.committedBytes,
    reservedBytes: status.reservedBytes,
    limitBytes,
    // Las reservas activas COMPROMETEN capacidad — el disponible las resta
    // (misma aritmética que la reserva de la propia BD).
    availableBytes: Math.max(0, limitBytes - status.usedBytes),
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

export async function checkCprCanMutate(
  intent: MutationIntent = "business_increase_or_modify"
): Promise<CheckResult> {
  return checkModuleCanMutate(CPR_MODULE_CODE, intent);
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

export async function checkTextilesCanMutate(
  intent: MutationIntent = "business_increase_or_modify"
): Promise<CheckResult> {
  return checkModuleCanMutate(TEXTILES_MODULE_CODE, intent);
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

// ---------------------------------------------------------------------------
// Envolturas canónicas Quality · QUALITY-01
// ---------------------------------------------------------------------------

export async function checkQualityCanMutate(
  intent: MutationIntent = "business_increase_or_modify"
): Promise<CheckResult> {
  return checkModuleCanMutate(QUALITY_MODULE_CODE, intent);
}
