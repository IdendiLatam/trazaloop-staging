import "server-only";

import { notFound, redirect } from "next/navigation";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import type { ActiveOrganization } from "@/lib/db/organizations";
import { isTextilesModuleEnabled } from "@/lib/modules/textiles";
import { resolveModuleAccessForOrg } from "@/lib/db/module-access";
import { TEXTILES_MODULE_CODE } from "@/lib/modules/catalog";
import { moduleAccessDeniedMessage } from "@/lib/modules/messages";

/**
 * Trazaloop · Sprint T1 (Textil) · Guard del módulo Trazaloop Textiles.
 * Sprint T9F: consume la REGLA CANÓNICA de acceso (lib/modules/access.ts vía
 * resolveModuleAccessForOrg), que combina:
 *   1. kill switch global TEXTILES_MODULE_ENABLED (apagado → módulo privado);
 *   2. asignación habilitada (enabled);
 *   3. access_mode vigente (full/extra, demo permanente o demo no vencido).
 *
 * El vencimiento de una prueba Demo se deriva por FECHA, sin cron.
 *
 * Bloqueos:
 *   · kill switch apagado → notFound() (404): módulo PRIVADO (DL-02/DL-03),
 *     para quien no está habilitado el módulo simplemente no existe;
 *   · demo vencido / deshabilitado / sin asignación → redirect a /modules,
 *     donde el selector comunica el motivo real ("Prueba finalizada" /
 *     "Módulo deshabilitado"). Nunca 404 confuso ni error SQL. Los datos se
 *     conservan siempre.
 *
 * Se aplica en app/(app)/(shell)/textiles/layout.tsx: TODA ruta bajo
 * /textiles queda protegida por defecto.
 */
export async function requireTextilesModule(): Promise<ModuleEntry> {
  // El kill switch se evalúa primero y de forma privada (404 para todos).
  if (!isTextilesModuleEnabled()) notFound();

  const org = await requireActiveOrg();
  const access = await resolveModuleAccessForOrg(org.organizationId, TEXTILES_MODULE_CODE);
  if (!access.retainedRead) {
    // Deshabilitado o sin asignación: se comunica en el selector.
    //
    // PROD-LAUNCH-01C.4 · Una prueba VENCIDA ya no cae aquí: entra en modo
    // consulta. Ver la nota de `ModuleEntry`.
    redirect("/modules");
  }
  return { ...org, readOnly: !access.allowed };
}

/**
 * PROD-LAUNCH-01C.4 · Ver la nota en `require-quality-module.ts`: la
 * organización activa de siempre, más si se entra a trabajar o a consultar.
 */
export type ModuleEntry = ActiveOrganization & { readOnly: boolean };

export const TEXTILES_MODULE_NOT_AVAILABLE_ERROR =
  "El módulo Trazaloop Textiles no está habilitado para esta empresa.";

/**
 * Variante para SERVER ACTIONS (T2/T3): misma regla canónica, error seguro en
 * lugar de 404/redirect (una action no debe responder notFound ni redirect).
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
export async function requireTextilesForAction(
  options: { intent?: "read" | "mutate" } = {}
): Promise<
  { org: ActiveOrganization; error: null } | { org: null; error: string }
> {
  const org = await requireActiveOrg();
  if (!isTextilesModuleEnabled()) {
    return { org: null, error: TEXTILES_MODULE_NOT_AVAILABLE_ERROR };
  }
  const access = await resolveModuleAccessForOrg(org.organizationId, TEXTILES_MODULE_CODE);
  const soloConsulta = !access.allowed && access.retainedRead;
  if (options.intent === "read" && soloConsulta) {
    return { org, error: null };
  }
  if (!access.allowed) {
    if (access.reason === "not_assigned" || access.reason === "globally_disabled") {
      return { org: null, error: TEXTILES_MODULE_NOT_AVAILABLE_ERROR };
    }
    return { org: null, error: moduleAccessDeniedMessage("Trazaloop Textiles", access.reason) };
  }
  return { org, error: null };
}
