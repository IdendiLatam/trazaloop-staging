import "server-only";

import { notFound } from "next/navigation";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { getOrganizationModules } from "@/lib/db/organizations";
import type { ActiveOrganization } from "@/lib/db/organizations";
import {
  isTextilesModuleEnabled,
  organizationHasTextiles,
} from "@/lib/modules/textiles";

/**
 * Trazaloop · Sprint T1 (Textil) · Guard del módulo Trazaloop Textiles.
 *
 * Exige, EN SERVIDOR y en este orden:
 *   1. feature flag TEXTILES_MODULE_ENABLED encendido (apagado → 404 para
 *      todo el mundo, sin excepciones);
 *   2. sesión + empresa activa VALIDADA (requireActiveOrg, patrón del
 *      proyecto — el organization_id jamás viene del cliente);
 *   3. fila habilitada (organization_id, 'textiles') en
 *      organization_modules, leída bajo RLS con la sesión real.
 *
 * Fallo de flag o de habilitación → notFound() (404): para quien no está
 * habilitado, el módulo simplemente no existe — nunca una pantalla que
 * confirme que "hay algo" detrás (módulo privado, DL-02/DL-03).
 *
 * Se aplica en app/(app)/(shell)/textiles/layout.tsx, de modo que TODA
 * ruta presente o futura bajo /textiles queda protegida por defecto.
 */
export async function requireTextilesModule(): Promise<ActiveOrganization> {
  if (!isTextilesModuleEnabled()) notFound();

  const org = await requireActiveOrg();

  const modules = await getOrganizationModules(org.organizationId);
  if (!organizationHasTextiles(modules)) notFound();

  return org;
}

export const TEXTILES_MODULE_NOT_AVAILABLE_ERROR =
  "El módulo Trazaloop Textiles no está habilitado para esta organización.";

/**
 * Variante para SERVER ACTIONS (T2/T3): misma triple validación pero
 * devolviendo un error seguro en lugar de 404 (una action no debe
 * responder notFound). Usada por los diagnósticos y los catálogos.
 */
export async function requireTextilesForAction(): Promise<
  { org: ActiveOrganization; error: null } | { org: null; error: string }
> {
  const org = await requireActiveOrg();
  if (!isTextilesModuleEnabled()) {
    return { org: null, error: TEXTILES_MODULE_NOT_AVAILABLE_ERROR };
  }
  const modules = await getOrganizationModules(org.organizationId);
  if (!organizationHasTextiles(modules)) {
    return { org: null, error: TEXTILES_MODULE_NOT_AVAILABLE_ERROR };
  }
  return { org, error: null };
}
