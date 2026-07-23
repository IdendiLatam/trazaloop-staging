import "server-only";

import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlanLimits, listPlanDefinitions } from "@/lib/db/plans";
import { isTextilesModuleEnabled } from "@/lib/modules/textiles";
import {
  COMMERCIAL_MODULES,
  getCommercialModuleByCode,
  isFunctionalModuleCode,
  type CommercialModule,
} from "@/lib/modules/catalog";
import {
  resolveModuleAccess,
  buildModuleEntitlements,
  type ModuleAccessDecision,
  type ModuleAccessMode,
  type ModuleAssignment,
  type ModuleEntitlements,
} from "@/lib/modules/access";

/**
 * Trazaloop · Sprint T9F · Capa de datos del acceso comercial por módulo.
 *
 * Server-only. La regla de acceso (pura, lib/modules/access.ts) se resuelve
 * con la hora del SERVIDOR (`new Date()`), nunca del navegador. El
 * organization_id siempre llega validado por la sesión, jamás del cliente.
 *
 * El kill switch global (env) se aplica AQUÍ, por encima de la asignación:
 * una asignación Demo/Full/Extra jamás anula un flag global apagado.
 */

/** ¿El kill switch global del módulo está activo? (sin switch → siempre). */
function isKillSwitchActive(mod: CommercialModule): boolean {
  if (mod.killSwitchEnv === "TEXTILES_MODULE_ENABLED") return isTextilesModuleEnabled();
  return mod.killSwitchEnv === null;
}

/** Fila de asignación de la organización (bajo RLS de la sesión real). */
export async function getOrganizationModuleAssignment(
  organizationId: string,
  moduleCode: string
): Promise<ModuleAssignment | null> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("organization_modules")
    .select("enabled, access_mode, access_expires_at")
    .eq("organization_id", organizationId)
    .eq("module_code", moduleCode)
    .maybeSingle();
  if (!data) return null;
  return {
    enabled: Boolean(data.enabled),
    accessMode: data.access_mode as ModuleAccessMode,
    accessExpiresAt: (data.access_expires_at as string | null) ?? null,
  };
}

/**
 * Acceso EFECTIVO de la organización activa a un módulo. Combina catálogo
 * canónico (funcional/publicado) + kill switch global + asignación, y aplica
 * la regla pura con la hora del servidor.
 */
export async function resolveModuleAccessForOrg(
  organizationId: string,
  moduleCode: string
): Promise<ModuleAccessDecision> {
  const mod = getCommercialModuleByCode(moduleCode);
  if (!mod) {
    return resolveModuleAccess({
      isFunctional: false,
      killSwitchActive: false,
      assignment: null,
      now: new Date(),
    });
  }
  const assignment = await getOrganizationModuleAssignment(organizationId, moduleCode);
  return resolveModuleAccess({
    isFunctional: mod.status === "functional",
    killSwitchActive: isKillSwitchActive(mod),
    assignment,
    now: new Date(),
  });
}

/**
 * Entitlements del módulo (límites funcionales + cuota de almacenamiento) a
 * partir de su access_mode, REUTILIZANDO plan_limits/plan_definitions (0050).
 * Si el acceso no está permitido, igual devuelve los entitlements del modo
 * asignado para mostrarlos, pero `access.allowed` indica el bloqueo real.
 */
export async function getModuleEntitlements(
  organizationId: string,
  moduleCode: string
): Promise<{ access: ModuleAccessDecision; entitlements: ModuleEntitlements | null }> {
  const access = await resolveModuleAccessForOrg(organizationId, moduleCode);
  const mode = access.accessMode;
  if (mode === null) return { access, entitlements: null };

  const [limits, definitions] = await Promise.all([getPlanLimits(mode), listPlanDefinitions()]);
  const def = definitions.find((d) => d.code === mode);
  const storageLimitBytes = def?.storageLimitBytes ?? 0;
  const entitlements = buildModuleEntitlements(
    mode,
    limits.map((l) => ({
      resourceCode: l.resourceCode,
      limitValue: l.limitValue,
      isUnlimited: l.isUnlimited,
    })),
    storageLimitBytes
  );
  return { access, entitlements };
}

// ---------------------------------------------------------------------------
// T9F.1 · API CANÓNICA de entitlements OPERATIVOS por módulo.
// Resuelve desde organization_modules + catálogo de módulos + catálogo de
// planes (plan_limits/plan_definitions, 0050) + uso REAL del módulo
// (v_organization_module_usage, 0101). JAMÁS desde organization_subscriptions:
// el plan legacy org-wide no gobierna acceso, límites ni cuotas de CPR o
// Textiles.
// ---------------------------------------------------------------------------

export type ModuleEntitlementsResolution = {
  organizationId: string;
  moduleCode: string;
  /** ¿La empresa puede operar el módulo AHORA? (regla canónica). */
  accessAllowed: boolean;
  /** Motivo del bloqueo (mensajes claros; nunca errores SQL). */
  denialReason: import("@/lib/modules/access").ModuleAccessReason;
  accessMode: ModuleAccessMode | null;
  enabled: boolean | null;
  isDemo: boolean;
  isDemoPermanent: boolean;
  isExpired: boolean;
  accessStartedAt: string | null;
  accessExpiresAt: string | null;
  /** Límites funcionales del plan del MÓDULO (sin storage_bytes). */
  functionalLimits: ModuleEntitlements["functionalLimits"];
  /** Cuota de almacenamiento del plan del MÓDULO (bytes). */
  storageLimitBytes: number;
  /** Uso de almacenamiento ATRIBUIDO al módulo (bytes). T9F.2: null cuando
   *  el uso NO pudo VERIFICARSE (fail-closed: jamás se inventa un 0; las
   *  AUTORIZACIONES de carga viven en server/actions/module-plans.ts y
   *  bloquean en ese caso). El acceso nunca depende de esta lectura. */
  storageUsedBytes: number | null;
  storageAvailableBytes: number | null;
};

/**
 * Entitlements operativos completos del módulo para la organización.
 * Full y Extra devuelven límites funcionales IDÉNTICOS (mismo seed 0050);
 * su única diferencia es storageLimitBytes. Demo temporal y Demo permanente
 * comparten access_mode='demo' y por tanto exactamente los mismos límites.
 */
export async function resolveOrganizationModuleEntitlements(params: {
  organizationId: string;
  moduleCode: string;
}): Promise<ModuleEntitlementsResolution> {
  const { organizationId, moduleCode } = params;
  const mod = getCommercialModuleByCode(moduleCode);
  let assignment: ModuleAssignment | null = null;
  let accessStartedAt: string | null = null;
  if (mod !== null) {
    const supabase = await createServerClient();
    const { data } = await supabase
      .from("organization_modules")
      .select("enabled, access_mode, access_started_at, access_expires_at")
      .eq("organization_id", organizationId)
      .eq("module_code", moduleCode)
      .maybeSingle();
    if (data) {
      assignment = {
        enabled: Boolean(data.enabled),
        accessMode: data.access_mode as ModuleAccessMode,
        accessExpiresAt: (data.access_expires_at as string | null) ?? null,
      };
      accessStartedAt = (data.access_started_at as string | null) ?? null;
    }
  }
  const access = resolveModuleAccess({
    isFunctional: mod?.status === "functional",
    killSwitchActive: mod ? isKillSwitchActive(mod) : false,
    assignment,
    now: new Date(),
  });

  const base = {
    organizationId,
    moduleCode,
    accessAllowed: access.allowed,
    denialReason: access.reason,
    accessMode: access.accessMode,
    enabled: assignment ? assignment.enabled : null,
    isDemo: access.isDemo,
    isDemoPermanent: access.derivedState === "demo_permanent",
    isExpired: access.isExpired,
    accessStartedAt,
    accessExpiresAt: assignment?.accessExpiresAt ?? null,
  };

  if (access.accessMode === null) {
    return {
      ...base,
      functionalLimits: [],
      storageLimitBytes: 0,
      storageUsedBytes: null,
      storageAvailableBytes: null,
    };
  }

  const { fetchOrganizationModuleUsage } = await import("@/lib/db/module-usage");
  const [limits, definitions, usageResult] = await Promise.all([
    getPlanLimits(access.accessMode),
    listPlanDefinitions(),
    fetchOrganizationModuleUsage(organizationId, moduleCode),
  ]);
  const storageLimitBytes =
    definitions.find((d) => d.code === access.accessMode)?.storageLimitBytes ?? 0;
  const entitlements = buildModuleEntitlements(
    access.accessMode,
    limits.map((l) => ({
      resourceCode: l.resourceCode,
      limitValue: l.limitValue,
      isUnlimited: l.isUnlimited,
    })),
    storageLimitBytes
  );
  // T9F.2 (fail-closed): el uso solo se reporta cuando fue VERIFICADO. Un
  // fallo de consulta produce storageUsedBytes = null — jamás un 0 inventado.
  const storageUsedBytes = usageResult.ok ? usageResult.usage.storageUsedBytes : null;
  return {
    ...base,
    functionalLimits: entitlements.functionalLimits,
    storageLimitBytes,
    storageUsedBytes,
    storageAvailableBytes:
      storageUsedBytes === null ? null : Math.max(0, storageLimitBytes - storageUsedBytes),
  };
}

/**
 * T9F.1 · Resumen de plan y uso DEL MÓDULO con la MISMA forma que
 * OrganizationPlanUsage (lib/plans/usage.ts) para reutilizar PlanUsageCard
 * sin cambios. El plan mostrado es el del MÓDULO (access_mode →
 * plan_definitions/plan_limits); el almacenamiento y los conteos son los
 * ATRIBUIDOS al módulo (v_organization_module_usage, 0101). Solo
 * plan_status (estado ADMINISTRATIVO de cuenta) y team_members (recurso
 * org-global) provienen de la capa legacy — nunca el plan ni la cuota.
 * Devuelve null si el módulo no tiene access_mode resoluble.
 */
export async function getModulePlanUsageSummary(
  organizationId: string,
  moduleCode: string
): Promise<{
  usage: import("@/lib/plans/usage").OrganizationPlanUsage;
  limits: import("@/lib/plans/types").PlanLimit[];
  entitlements: ModuleEntitlementsResolution;
} | null> {
  const entitlements = await resolveOrganizationModuleEntitlements({ organizationId, moduleCode });
  if (entitlements.accessMode === null) return null;

  const [{ getOrganizationUsage }, { fetchOrganizationModuleUsage }] = await Promise.all([
    import("@/lib/db/plans"),
    import("@/lib/db/module-usage"),
  ]);
  const [legacy, moduleUsageResult, planLimits] = await Promise.all([
    getOrganizationUsage(organizationId),
    fetchOrganizationModuleUsage(organizationId, moduleCode),
    getPlanLimits(entitlements.accessMode),
  ]);

  // T9F.2 (fail-closed): sin uso VERIFICADO no se muestra la tarjeta de plan
  // con ceros inventados — la página omite el bloque (null).
  if (!moduleUsageResult.ok) return null;
  const moduleUsage = moduleUsageResult.usage;

  const storageLimitBytes = entitlements.storageLimitBytes;
  const storageUsedBytes = moduleUsage.storageUsedBytes;
  const percent =
    storageLimitBytes > 0
      ? Math.round((1000 * storageUsedBytes) / storageLimitBytes) / 10
      : 0;

  const usage: import("@/lib/plans/usage").OrganizationPlanUsage = {
    organizationId,
    planCode: entitlements.accessMode,
    planStatus: legacy?.planStatus ?? "active",
    storageLimitBytes,
    storageUsedBytes,
    storageUsedMb: Math.round((storageUsedBytes / 1048576) * 100) / 100,
    storageLimitMb: Math.round((storageLimitBytes / 1048576) * 100) / 100,
    storagePercentUsed: percent,
    documentsTrazadocsCount: moduleUsage?.documentsTrazadocsCount ?? 0,
    suppliersCount: moduleUsage?.suppliersCount ?? 0,
    materialsCount: moduleUsage?.materialsCount ?? 0,
    productsCount: moduleUsage?.productsCount ?? 0,
    evidencesCount: moduleUsage?.evidencesCount ?? 0,
    productionOrdersCount: moduleUsage?.productionOrdersCount ?? 0,
    inputBatchesCount: moduleUsage?.inputBatchesCount ?? 0,
    outputBatchesCount: moduleUsage?.outputBatchesCount ?? 0,
    teamMembersCount: legacy?.teamMembersCount ?? 0,
    diagnosticTaken: legacy?.diagnosticTaken ?? false,
    importsCount: legacy?.importsCount ?? 0,
    ticketsCount: legacy?.ticketsCount ?? 0,
    updatedAt: legacy?.updatedAt ?? new Date().toISOString(),
  };
  return {
    usage,
    limits: planLimits.map((l) => ({
      resourceCode: l.resourceCode,
      limitValue: l.limitValue,
      isUnlimited: l.isUnlimited,
    })),
    entitlements,
  };
}

/** Estado comercial de TODOS los módulos comerciales de la organización activa
 *  (para el banner Demo y el selector). Solo módulos, sin datos sensibles. */
export type OrgModuleStatus = {
  key: string;
  moduleCode: string;
  name: string;
  access: ModuleAccessDecision;
};

export async function getActiveOrgModuleStatuses(
  organizationId: string
): Promise<OrgModuleStatus[]> {
  return Promise.all(
    COMMERCIAL_MODULES.map(async (mod) => ({
      key: mod.key,
      moduleCode: mod.moduleCode,
      name: mod.name,
      access: await resolveModuleAccessForOrg(organizationId, mod.moduleCode),
    }))
  );
}

// ---------------------------------------------------------------------------
// SUPERADMINISTRADOR — lectura del estado de módulos de CUALQUIER empresa.
// Usa el cliente administrativo (server-only). El LLAMADOR debe estar ya
// verificado como superadministrador (requirePlatformStaff + isSuperadmin).
// ---------------------------------------------------------------------------

export type PlatformModuleRow = {
  key: string;
  moduleCode: string;
  name: string;
  description: string;
  status: "functional" | "coming_soon";
  killSwitchActive: boolean;
  assigned: boolean;
  enabled: boolean | null;
  accessMode: ModuleAccessMode | null;
  accessStartedAt: string | null;
  accessExpiresAt: string | null;
  updatedAt: string | null;
  updatedByName: string | null;
  assignmentSource: string | null;
  access: ModuleAccessDecision;
  storageLimitBytes: number | null;
  /** T9F.1: almacenamiento REAL atribuido al módulo (bytes; null si la vista
   *  de uso 0101 aún no está disponible). */
  storageUsedBytes: number | null;
};

export async function listPlatformOrganizationModules(
  organizationId: string
): Promise<PlatformModuleRow[]> {
  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("organization_modules")
    .select("module_code, enabled, access_mode, access_started_at, access_expires_at, updated_at, updated_by, assignment_source")
    .eq("organization_id", organizationId);
  const byCode = new Map((rows ?? []).map((r) => [r.module_code as string, r]));

  // T9F.1: uso de almacenamiento POR MÓDULO (vista 0101). Se lee con la
  // SESIÓN real del superadministrador: la guarda embebida de la vista
  // (is_org_member or is_platform_staff) lo permite sin service role.
  const { fetchAllOrganizationModuleUsage } = await import("@/lib/db/module-usage");
  const usageResult = await fetchAllOrganizationModuleUsage(organizationId);
  // T9F.2 (fail-closed): ante un fallo de consulta la columna muestra "—"
  // (null) — jamás un 0 inventado.
  const usageByCode = new Map(
    usageResult.ok ? usageResult.usages.map((u) => [u.moduleCode, u] as const) : []
  );

  // Nombres de los actores de última modificación (si los hay).
  const updaterIds = [...new Set((rows ?? []).map((r) => r.updated_by).filter(Boolean))] as string[];
  const nameById = new Map<string, string>();
  if (updaterIds.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, full_name")
      .in("id", updaterIds);
    for (const p of profiles ?? []) nameById.set(p.id as string, (p.full_name as string) ?? "");
  }

  const definitions = await listPlanDefinitions();
  const now = new Date();

  return COMMERCIAL_MODULES.map((mod) => {
    const row = byCode.get(mod.moduleCode);
    const assignment: ModuleAssignment | null = row
      ? {
          enabled: Boolean(row.enabled),
          accessMode: row.access_mode as ModuleAccessMode,
          accessExpiresAt: (row.access_expires_at as string | null) ?? null,
        }
      : null;
    const killSwitchActive = isKillSwitchActive(mod);
    const access = resolveModuleAccess({
      isFunctional: mod.status === "functional",
      killSwitchActive,
      assignment,
      now,
    });
    const mode = assignment?.accessMode ?? null;
    const storageLimitBytes =
      mode !== null ? definitions.find((d) => d.code === mode)?.storageLimitBytes ?? null : null;
    return {
      key: mod.key,
      moduleCode: mod.moduleCode,
      name: mod.name,
      description: mod.description,
      status: mod.status,
      killSwitchActive,
      assigned: Boolean(row),
      enabled: row ? Boolean(row.enabled) : null,
      accessMode: mode,
      accessStartedAt: (row?.access_started_at as string | null) ?? null,
      accessExpiresAt: (row?.access_expires_at as string | null) ?? null,
      updatedAt: (row?.updated_at as string | null) ?? null,
      updatedByName: row?.updated_by ? nameById.get(row.updated_by as string) ?? null : null,
      assignmentSource: (row?.assignment_source as string | null) ?? null,
      access,
      storageLimitBytes,
      storageUsedBytes: usageByCode.get(mod.moduleCode)?.storageUsedBytes ?? null,
    };
  });
}

/** Superadmin: cambia el estado comercial de un módulo (RPC verificada en SQL).
 *  T9F.1: la RPC (reemplazada en 0101) es realmente IDEMPOTENTE — si el estado
 *  solicitado ya es exactamente el actual devuelve changed=false, sin UPDATE,
 *  sin tocar updated_at/updated_by y sin crear evento de auditoría. */
export async function setOrganizationModuleAccess(
  organizationId: string,
  moduleCode: string,
  targetState: "disabled" | "demo_permanent" | "full" | "extra"
): Promise<{ error: string | null; changed: boolean | null }> {
  if (!isFunctionalModuleCode(moduleCode)) {
    return { error: "Este módulo no está disponible para asignación.", changed: null };
  }
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("set_organization_module_access", {
    p_organization_id: organizationId,
    p_module_code: moduleCode,
    p_target_state: targetState,
  });
  if (error) {
    // Nunca se expone el detalle SQL al usuario.
    return { error: "No fue posible actualizar el estado del módulo.", changed: null };
  }
  const changed = (data as { changed?: boolean } | null)?.changed;
  return { error: null, changed: typeof changed === "boolean" ? changed : null };
}

/** Resumen de pruebas Demo TEMPORALES activas de la organización (para el
 *  banner). Solo módulos funcionales en demo con vencimiento futuro, más si
 *  hay alguno vencido. Sin datos sensibles. */
export type DemoTrialSummary = {
  activeTrials: { name: string; expiresAt: string }[];
  hasExpired: boolean;
};

export async function getDemoTrialSummary(organizationId: string): Promise<DemoTrialSummary> {
  const statuses = await getActiveOrgModuleStatuses(organizationId);
  const activeTrials = statuses
    .filter((s) => s.access.derivedState === "demo_active" && s.access.expiresAt)
    .map((s) => ({ name: s.name, expiresAt: s.access.expiresAt as string }));
  const hasExpired = statuses.some((s) => s.access.derivedState === "demo_expired");
  return { activeTrials, hasExpired };
}
