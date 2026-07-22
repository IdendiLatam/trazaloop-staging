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
    };
  });
}

/** Superadmin: cambia el estado comercial de un módulo (RPC verificada en SQL). */
export async function setOrganizationModuleAccess(
  organizationId: string,
  moduleCode: string,
  targetState: "disabled" | "demo_permanent" | "full" | "extra"
): Promise<{ error: string | null }> {
  if (!isFunctionalModuleCode(moduleCode)) {
    return { error: "Este módulo no está disponible para asignación." };
  }
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("set_organization_module_access", {
    p_organization_id: organizationId,
    p_module_code: moduleCode,
    p_target_state: targetState,
  });
  if (error) {
    // Nunca se expone el detalle SQL al usuario.
    return { error: "No fue posible actualizar el estado del módulo." };
  }
  return { error: null };
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
