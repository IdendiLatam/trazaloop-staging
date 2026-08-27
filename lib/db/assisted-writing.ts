import "server-only";

import { resolveModuleAccessForOrg } from "@/lib/db/module-access";

/**
 * Trazaloop · QUALITY-12.2C · ¿Se ofrece asistencia de redacción aquí?
 *
 * Se resuelve en SERVIDOR y por el módulo DEL DOCUMENTO, nunca por Quality. La
 * pantalla no decide nada: recibe un booleano ya resuelto, igual que recibe la
 * guía ya autorizada.
 *
 * Y la regla es la misma que la de la guía —Full o Extra—, por una razón que no
 * es comercial sino de coherencia: la asistencia usa la guía de autoría, y en
 * Demo la guía no se entrega. Ofrecerla ahí la convertiría en la puerta de
 * atrás para obtener lo que la pantalla niega.
 */
export async function canUseAssistedWriting(
  organizationId: string, moduleCode: string
): Promise<boolean> {
  const access = await resolveModuleAccessForOrg(organizationId, moduleCode);
  return access.allowed && (access.accessMode === "full" || access.accessMode === "extra");
}
