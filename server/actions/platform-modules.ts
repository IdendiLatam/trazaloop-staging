"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformStaff } from "@/lib/auth/require-platform-staff";
import {
  listPlatformOrganizationModules,
  setOrganizationModuleAccess,
  type PlatformModuleRow,
} from "@/lib/db/module-access";
import { isFunctionalModuleCode } from "@/lib/modules/catalog";

/**
 * Trazaloop · Sprint T9F · Gestión del estado comercial de los módulos de una
 * empresa DESDE EL SUPERADMINISTRADOR.
 *
 * Seguridad en capas: la UI se muestra solo a platform_staff, esta action
 * exige superadministrador, y la RPC set_organization_module_access (0100)
 * lo re-verifica en SQL con is_platform_superadmin(). Una empresa jamás puede
 * cambiar su propio plan. No se confía en rol, enabled, access_mode ni fechas
 * enviados por el cliente: solo (organization_id, module_code, target_state).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TARGET_STATES = ["disabled", "demo_permanent", "full", "extra"] as const;
type TargetState = (typeof TARGET_STATES)[number];

export type ModuleAccessActionState = { error: string | null; ok: boolean };

/** Lectura para la sección "Módulos y planes de la empresa" (solo superadmin). */
export async function getPlatformOrganizationModulesAction(
  organizationId: string
): Promise<{ modules: PlatformModuleRow[]; canManage: boolean }> {
  const { isSuperadmin } = await requirePlatformStaff();
  if (!UUID_RE.test(organizationId)) return { modules: [], canManage: false };
  const modules = await listPlatformOrganizationModules(organizationId);
  return { modules, canManage: isSuperadmin };
}

export async function setOrganizationModuleAccessAction(
  _prev: ModuleAccessActionState,
  formData: FormData
): Promise<ModuleAccessActionState> {
  const { isSuperadmin } = await requirePlatformStaff();
  if (!isSuperadmin) {
    return { error: "Solo un superadministrador de plataforma puede cambiar el estado de un módulo.", ok: false };
  }

  const organizationId = String(formData.get("organization_id") ?? "");
  const moduleCode = String(formData.get("module_code") ?? "");
  const targetState = String(formData.get("target_state") ?? "");

  if (!UUID_RE.test(organizationId)) return { error: "Empresa no válida.", ok: false };
  if (!isFunctionalModuleCode(moduleCode)) {
    return { error: "Este módulo no está disponible para asignación.", ok: false };
  }
  if (!(TARGET_STATES as readonly string[]).includes(targetState)) {
    return { error: "Estado objetivo no válido.", ok: false };
  }

  const { error } = await setOrganizationModuleAccess(
    organizationId,
    moduleCode,
    targetState as TargetState
  );
  if (error) return { error, ok: false };

  // No cachear permisos comerciales: se revalidan las superficies afectadas.
  revalidatePath(`/platform/organizations/${organizationId}`);
  revalidatePath("/modules");
  revalidatePath("/dashboard");
  return { error: null, ok: true };
}
