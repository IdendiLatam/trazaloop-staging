import "server-only";

import { redirect } from "next/navigation";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import type { ActiveOrganization } from "@/lib/db/organizations";
import { resolveModuleAccessForOrg } from "@/lib/db/module-access";
import { CPR_MODULE_CODE } from "@/lib/modules/catalog";
import { moduleAccessDeniedMessage } from "@/lib/modules/messages";

/**
 * PROD-LAUNCH-01C.4 · Lo que devuelve la guarda cuando SÍ deja pasar.
 *
 * Es la organización activa de siempre MÁS un dato: si se entra a trabajar o
 * solo a consultar. Se añadió un campo en vez de cambiar el tipo porque hay
 * decenas de páginas que reciben esto y esperan una `ActiveOrganization`;
 * ampliarlo no rompe ninguna, y las que quieran pintar el aviso de consulta
 * ya tienen el dato a mano sin volver a preguntar a la base.
 */
export type ModuleEntry = ActiveOrganization & { readOnly: boolean };


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
export async function requireCprModule(): Promise<ModuleEntry> {
  const org = await requireActiveOrg();
  const access = await resolveModuleAccessForOrg(org.organizationId, CPR_MODULE_CODE);
  // PROD-LAUNCH-01C.4 · Una prueba vencida entra a CONSULTAR. Ver la nota de
  // `ModuleEntry`: lo que vence es el permiso de crear.
  if (!access.retainedRead) redirect("/modules");
  return { ...org, readOnly: !access.allowed };
}

/**
 * Variante para SERVER ACTIONS: misma regla, error seguro en vez de redirect.
 */
/**
 * PROD-LAUNCH-01C.4 · `intent` distingue la acción que CREA de la que solo
 * lee, descarga o exporta.
 *
 * Hacía falta porque estas guardas resultaron proteger sobre todo descargas y
 * exportaciones —los PDF y CSV de los documentos, el dossier de cálculo, la
 * matriz de evidencias—, y con el permiso vencido eso es exactamente lo que
 * una empresa tiene derecho a hacer con su información: llevársela.
 *
 * Por omisión es `"mutate"`: una llamada que no diga nada se comporta como
 * antes. Solo quien declara `"read"` obtiene el paso con permiso vencido.
 */
export async function requireCprForAction(
  options: { intent?: "read" | "mutate" } = {}
): Promise<
  { org: ActiveOrganization; error: null } | { org: null; error: string }
> {
  const org = await requireActiveOrg();
  const access = await resolveModuleAccessForOrg(org.organizationId, CPR_MODULE_CODE);
  const soloConsulta = !access.allowed && access.retainedRead;
  if (options.intent === "read" && soloConsulta) {
    return { org, error: null };
  }
  if (!access.allowed) {
    return { org: null, error: moduleAccessDeniedMessage("Trazaloop PCR", access.reason) };
  }
  return { org, error: null };
}
