import "server-only";

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/require-session";
import { checkPlatformStatus } from "@/lib/db/platform";

/**
 * Exige sesión + ser platform_staff ACTIVO (Parte 5: "Debe estar visible
 * solo para usuarios platform_staff activos"). Nunca se basa en un rol de
 * empresa: platform_staff es una capa totalmente separada de memberships
 * (Parte 1). Un usuario que no sea platform_staff se manda a /dashboard —
 * si tampoco tiene empresa, el propio shell lo seguirá mandando a
 * /select-org, cascada ya existente y sin necesidad de duplicarla aquí.
 */
export async function requirePlatformStaff(): Promise<{ isSuperadmin: boolean }> {
  await requireSession();
  const { isStaff, isSuperadmin } = await checkPlatformStatus();
  if (!isStaff) redirect("/dashboard");
  return { isSuperadmin };
}
