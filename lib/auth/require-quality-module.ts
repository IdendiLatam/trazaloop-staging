import "server-only";

import { notFound, redirect } from "next/navigation";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import type { ActiveOrganization } from "@/lib/db/organizations";
import { isQualityModuleEnabled } from "@/lib/modules/quality";
import { resolveModuleAccessForOrg } from "@/lib/db/module-access";
import { QUALITY_MODULE_CODE } from "@/lib/modules/catalog";
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
 *   · deshabilitado / sin asignación → redirect a /modules, donde el selector
 *     comunica el motivo real. Los datos se conservan.
 *   · PROD-LAUNCH-01C.4 · demo VENCIDO → se entra, en modo consulta. Dentro hay
 *     trabajo de la empresa y es suyo; lo que vence es el permiso de crear, no
 *     el de mirar. La guarda lo señala con `readOnly` y las mutaciones las
 *     sigue bloqueando `checkQualityCanMutate`, en servidor.
 *
 * Se aplica en app/(app)/(shell)/quality/layout.tsx: TODA ruta bajo /quality
 * queda protegida por defecto, incluidas las que se añadan en QUALITY-02+.
 */
export async function requireQualityModule(): Promise<ModuleEntry> {
  if (!isQualityModuleEnabled()) notFound();

  const org = await requireActiveOrg();
  const access = await resolveModuleAccessForOrg(org.organizationId, QUALITY_MODULE_CODE);
  if (!access.retainedRead) redirect("/modules");
  return { ...org, readOnly: !access.allowed };
}

export const QUALITY_MODULE_NOT_AVAILABLE_ERROR =
  "El módulo Trazaloop Quality no está habilitado para esta empresa.";

/**
 * Variante para SERVER ACTIONS: misma regla canónica, error seguro en lugar de
 * 404/redirect (una action no debe responder notFound ni redirect).
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
export async function requireQualityForAction(
  options: { intent?: "read" | "mutate" } = {}
): Promise<
  { org: ActiveOrganization; error: null } | { org: null; error: string }
> {
  const org = await requireActiveOrg();
  if (!isQualityModuleEnabled()) {
    return { org: null, error: QUALITY_MODULE_NOT_AVAILABLE_ERROR };
  }
  const access = await resolveModuleAccessForOrg(org.organizationId, QUALITY_MODULE_CODE);
  const soloConsulta = !access.allowed && access.retainedRead;
  if (options.intent === "read" && soloConsulta) {
    return { org, error: null };
  }
  if (!access.allowed) {
    if (access.reason === "not_assigned" || access.reason === "globally_disabled") {
      return { org: null, error: QUALITY_MODULE_NOT_AVAILABLE_ERROR };
    }
    return { org: null, error: moduleAccessDeniedMessage("Trazaloop Quality", access.reason) };
  }
  return { org, error: null };
}
