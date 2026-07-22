import "server-only";

import { redirect } from "next/navigation";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import type { ActiveOrganization } from "@/lib/db/organizations";
import { resolveModuleAccessForOrg } from "@/lib/db/module-access";
import { CPR_MODULE_CODE } from "@/lib/modules/catalog";
import { moduleAccessDeniedMessage } from "@/lib/modules/messages";

/**
 * Trazaloop · Sprint T9F · Guard del módulo Trazaloop CPR.
 *
 * CPR es el módulo por defecto del shell y hasta T9F no tenía guard por
 * módulo. Ahora consume la REGLA CANÓNICA (lib/modules/access.ts vía
 * resolveModuleAccessForOrg): sesión + empresa activa validada + asignación
 * habilitada con access_mode vigente (full/extra, o demo permanente, o demo
 * no vencido). Una prueba Demo vencida se bloquea de INMEDIATO por fecha, sin
 * depender de ningún cron.
 *
 * Bloqueo → redirect a /modules, donde el selector comunica el motivo real
 * ("Prueba finalizada" / "Módulo deshabilitado"), nunca un 404 ni un error
 * SQL. Los datos existentes se conservan siempre.
 *
 * Devuelve la misma ActiveOrganization que requireActiveOrg: es un reemplazo
 * directo en las páginas CPR.
 */
export async function requireCprModule(): Promise<ActiveOrganization> {
  const org = await requireActiveOrg();
  const access = await resolveModuleAccessForOrg(org.organizationId, CPR_MODULE_CODE);
  if (!access.allowed) redirect("/modules");
  return org;
}

/**
 * Variante para SERVER ACTIONS: misma regla, error seguro en vez de redirect.
 */
export async function requireCprForAction(): Promise<
  { org: ActiveOrganization; error: null } | { org: null; error: string }
> {
  const org = await requireActiveOrg();
  const access = await resolveModuleAccessForOrg(org.organizationId, CPR_MODULE_CODE);
  if (!access.allowed) {
    return { org: null, error: moduleAccessDeniedMessage("Trazaloop CPR", access.reason) };
  }
  return { org, error: null };
}
