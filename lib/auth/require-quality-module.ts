import "server-only";

import { notFound, redirect } from "next/navigation";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import type { ActiveOrganization } from "@/lib/db/organizations";
import { isQualityModuleEnabled } from "@/lib/modules/quality";
import { resolveModuleAccessForOrg } from "@/lib/db/module-access";
import { QUALITY_MODULE_CODE } from "@/lib/modules/catalog";
import { moduleAccessDeniedMessage } from "@/lib/modules/messages";

/**
 * Trazaloop Quality · QUALITY-01 · Guard del módulo.
 *
 * Consume la REGLA CANÓNICA de acceso (lib/modules/access.ts vía
 * resolveModuleAccessForOrg), que combina:
 *   1. kill switch global QUALITY_MODULE_ENABLED (apagado → módulo privado);
 *   2. asignación habilitada (enabled);
 *   3. access_mode vigente (full/extra, demo permanente o demo no vencido).
 *
 * Bloqueos:
 *   · kill switch apagado → notFound() (404): el módulo es PRIVADO. Para quien
 *     no lo tiene habilitado simplemente no existe. Es lo que mantiene Quality
 *     invisible en Production mientras se prueba en Staging.
 *   · demo vencido / deshabilitado / sin asignación → redirect a /modules,
 *     donde el selector comunica el motivo real. Los datos se conservan.
 *
 * Se aplica en app/(app)/(shell)/quality/layout.tsx: TODA ruta bajo /quality
 * queda protegida por defecto, incluidas las que se añadan en QUALITY-02+.
 */
export async function requireQualityModule(): Promise<ActiveOrganization> {
  if (!isQualityModuleEnabled()) notFound();

  const org = await requireActiveOrg();
  const access = await resolveModuleAccessForOrg(org.organizationId, QUALITY_MODULE_CODE);
  if (!access.allowed) redirect("/modules");
  return org;
}

export const QUALITY_MODULE_NOT_AVAILABLE_ERROR =
  "El módulo Trazaloop Quality no está habilitado para esta empresa.";

/**
 * Variante para SERVER ACTIONS: misma regla canónica, error seguro en lugar de
 * 404/redirect (una action no debe responder notFound ni redirect).
 */
export async function requireQualityForAction(): Promise<
  { org: ActiveOrganization; error: null } | { org: null; error: string }
> {
  const org = await requireActiveOrg();
  if (!isQualityModuleEnabled()) {
    return { org: null, error: QUALITY_MODULE_NOT_AVAILABLE_ERROR };
  }
  const access = await resolveModuleAccessForOrg(org.organizationId, QUALITY_MODULE_CODE);
  if (!access.allowed) {
    if (access.reason === "not_assigned" || access.reason === "globally_disabled") {
      return { org: null, error: QUALITY_MODULE_NOT_AVAILABLE_ERROR };
    }
    return { org: null, error: moduleAccessDeniedMessage("Trazaloop Quality", access.reason) };
  }
  return { org, error: null };
}
