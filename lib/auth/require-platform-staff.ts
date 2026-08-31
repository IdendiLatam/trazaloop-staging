import "server-only";

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/require-session";
import { checkPlatformStatus } from "@/lib/db/platform";
import { MODULE_SELECTOR_PATH } from "@/lib/domain/team";

/**
 * Exige sesión + ser platform_staff ACTIVO (Parte 5: "Debe estar visible
 * solo para usuarios platform_staff activos"). Nunca se basa en un rol de
 * empresa: platform_staff es una capa totalmente separada de memberships
 * (Parte 1).
 *
 * PE-01B · PE-D2 · Quien no es staff vuelve a la PUERTA de Trazaloop, no a la
 * portada de PCR.
 *
 * Antes iba a `/dashboard`, que es la casa de PCR. Para una empresa que solo
 * tenga Quality eso era un rebote: el guard de PCR la devolvía al selector. Y
 * para cualquiera era contar que PCR es el centro de la plataforma, que dejó de
 * ser cierto cuando el login empezó a llevar a `/modules`.
 *
 * `/modules` resuelve sola el caso de quien no tiene empresa activa: el shell la
 * manda a `/select-org`, cascada ya existente.
 */
export async function requirePlatformStaff(): Promise<{ isSuperadmin: boolean }> {
  await requireSession();
  const { isStaff, isSuperadmin } = await checkPlatformStatus();
  if (!isStaff) redirect(MODULE_SELECTOR_PATH);
  return { isSuperadmin };
}
