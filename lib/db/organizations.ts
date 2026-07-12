import "server-only";

import { createServerClient } from "@/lib/supabase/server";
import { readActiveOrgCookie } from "@/lib/auth/active-organization";

export type RoleCode = "admin" | "quality" | "consultant";

export type UserOrganization = {
  organizationId: string;
  organizationName: string;
  roleCode: RoleCode;
};

export type ActiveOrganization = UserOrganization;

export type ActiveModule = {
  code: string;
  name: string;
  enabled: boolean;
};

/**
 * Organizaciones donde el usuario tiene membership activa.
 * RLS garantiza que solo se ven las propias memberships y organizaciones.
 */
export async function getUserOrganizations(): Promise<UserOrganization[]> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("memberships")
    .select("organization_id, role_code, status, organizations(id, name)")
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (error || !data) return [];

  return data.flatMap((row) => {
    const org = row.organizations as unknown as { id: string; name: string } | null;
    if (!org) return [];
    return [
      {
        organizationId: org.id,
        organizationName: org.name,
        roleCode: row.role_code as RoleCode,
      },
    ];
  });
}

/**
 * Resuelve la empresa activa VALIDÁNDOLA en servidor:
 * la cookie solo se acepta si el usuario tiene membership activa en esa
 * organización (consultado bajo RLS). Si no, retorna null.
 */
export async function getActiveOrganization(): Promise<ActiveOrganization | null> {
  const cookieOrg = await readActiveOrgCookie();
  const organizations = await getUserOrganizations();

  if (organizations.length === 0) return null;

  if (cookieOrg) {
    const match = organizations.find((o) => o.organizationId === cookieOrg);
    if (match) return match;
  }

  // Con una sola organización, se selecciona implícitamente.
  if (organizations.length === 1) return organizations[0];

  return null;
}

/** Rol del usuario en una organización concreta (bajo RLS). */
export async function getRoleInOrganization(
  organizationId: string
): Promise<RoleCode | null> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("memberships")
    .select("role_code")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .maybeSingle();

  if (error || !data) return null;
  return data.role_code as RoleCode;
}

/** Módulos activos de la organización (bajo RLS). */
export async function getOrganizationModules(
  organizationId: string
): Promise<ActiveModule[]> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("organization_modules")
    .select("module_code, enabled, modules(name)")
    .eq("organization_id", organizationId)
    .order("activated_at", { ascending: true });

  if (error || !data) return [];

  return data.map((row) => {
    const mod = row.modules as unknown as { name: string } | null;
    return {
      code: row.module_code as string,
      name: mod?.name ?? row.module_code,
      enabled: Boolean(row.enabled),
    };
  });
}
