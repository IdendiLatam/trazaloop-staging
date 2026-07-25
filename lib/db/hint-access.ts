import "server-only";

import { resolveModuleAccessForOrg } from "@/lib/db/module-access";
import {
  organizationHintViewer,
  resolveHintMapForViewer,
  type HintViewer,
  type ResolvedHint,
} from "@/lib/domain/hint-access";

/**
 * Trazaloop · Resolución EN SERVIDOR del acceso comercial a los hints
 * administrables, POR MÓDULO.
 *
 * Por qué en servidor: en Demo el contenido administrado (textos, enlaces,
 * tutoriales) NUNCA debe llegar al navegador. Las páginas construyen aquí
 * el mapa de hints ya autorizados y solo eso se serializa hacia el cliente;
 * el componente visual no oculta nada, simplemente no lo recibe.
 *
 * Fuente de verdad ÚNICA: `resolveModuleAccessForOrg` (lib/db/module-access),
 * que aplica la regla canónica de lib/modules/access.ts con la hora del
 * servidor. Aquí no se reinterpreta Demo/Full/Extra ni se consulta
 * organization_modules por separado.
 *
 * Fail-closed: si el acceso al módulo no está permitido (Demo vencido,
 * deshabilitado, sin asignación) el modo se trata como no autorizado y se
 * entrega el aviso fijo, jamás el contenido real.
 */

/** Espectador empresarial para un módulo concreto, resuelto en servidor. */
export async function getOrganizationHintViewer(
  organizationId: string,
  moduleCode: string
): Promise<HintViewer> {
  const access = await resolveModuleAccessForOrg(organizationId, moduleCode);
  return organizationHintViewer(access.allowed ? access.accessMode : null);
}

/**
 * Mapa `blueprint_section_id → hint AUTORIZADO` para la organización activa
 * y el MÓDULO al que pertenece la pantalla. En Demo el mapa contiene
 * únicamente el aviso fijo: ni el texto administrado ni sus URLs salen de
 * este proceso.
 */
export async function resolveModuleHintsForOrg(params: {
  organizationId: string;
  moduleCode: string;
  sections: readonly { id: string; hint: string | null }[];
}): Promise<Record<string, ResolvedHint>> {
  const viewer = await getOrganizationHintViewer(params.organizationId, params.moduleCode);
  return resolveHintMapForViewer(params.sections, viewer);
}
