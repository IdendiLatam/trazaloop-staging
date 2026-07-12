"use server";

import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { writeActiveOrgCookie } from "@/lib/auth/active-organization";
import {
  getUserOrganizations,
  getRoleInOrganization,
} from "@/lib/db/organizations";

export type OrgActionState = { error: string | null };

/**
 * Crea la organización mediante la RPC create_organization (SECURITY DEFINER):
 * organización + primera membership admin + módulos base, atómico y auditado.
 * Va con la SESIÓN DEL USUARIO: jamás con service_role.
 */
export async function createOrganizationAction(
  _prev: OrgActionState,
  formData: FormData
): Promise<OrgActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const taxId = String(formData.get("tax_id") ?? "").trim();
  const country = String(formData.get("country") ?? "").trim();

  if (!name) {
    return { error: "El nombre de la empresa no puede estar vacío." };
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("create_organization", {
    p_name: name,
    p_tax_id: taxId || null,
    p_country: country || null,
  });

  if (error || !data) {
    return { error: "No fue posible crear la empresa. Intenta de nuevo." };
  }

  await writeActiveOrgCookie(data as string);
  redirect("/dashboard");
}

/**
 * Selecciona la empresa activa. Valida EN SERVIDOR que el usuario tiene
 * membership activa en esa organización antes de escribir la cookie.
 */
export async function selectActiveOrganizationAction(formData: FormData) {
  const organizationId = String(formData.get("organization_id") ?? "");

  const organizations = await getUserOrganizations();
  const match = organizations.find((o) => o.organizationId === organizationId);

  if (!match) {
    redirect("/select-org?error=not-member");
  }

  await writeActiveOrgCookie(organizationId);
  redirect("/dashboard");
}

/** Organizaciones del usuario (para UI de selección). */
export async function getUserOrganizationsAction() {
  return getUserOrganizations();
}

/** Rol del usuario en la empresa activa indicada. */
export async function getRoleInActiveOrganizationAction(organizationId: string) {
  return getRoleInOrganization(organizationId);
}
