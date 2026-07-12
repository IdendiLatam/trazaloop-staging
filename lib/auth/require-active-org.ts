import "server-only";

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/require-session";
import { getActiveOrganization } from "@/lib/db/organizations";
import type { ActiveOrganization } from "@/lib/db/organizations";

/**
 * Exige sesión + empresa activa VALIDADA en servidor.
 * El organization_id de toda mutación se toma de aquí, NUNCA del cliente.
 */
export async function requireActiveOrg(): Promise<ActiveOrganization> {
  await requireSession();
  const org = await getActiveOrganization();
  if (!org) redirect("/select-org");
  return org;
}
