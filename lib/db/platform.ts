import "server-only";

import { createServerClient } from "@/lib/supabase/server";
import type { PlatformRoleCode, PlatformStaffStatus, TrustedPlatformOrgInput } from "@/lib/domain/platform";

/**
 * Trazaloop · Sprint 8.4 · Capa de datos de administración de plataforma.
 *
 * platform_staff, v_platform_organizations y las RPC de plataforma son la
 * única vía: ningún UPDATE/SELECT aquí usa service_role, todo corre con la
 * sesión real, sujeta a las RLS/RPC ya definidas en 0040/0041/0042.
 */

export async function checkPlatformStatus(): Promise<{
  isStaff: boolean;
  isSuperadmin: boolean;
}> {
  const supabase = await createServerClient();
  const [staffRes, superRes] = await Promise.all([
    supabase.rpc("is_platform_staff"),
    supabase.rpc("is_platform_superadmin"),
  ]);
  return {
    isStaff: staffRes.data === true,
    isSuperadmin: superRes.data === true,
  };
}

export type PlatformOrganizationRow = {
  organizationId: string;
  organizationName: string;
  legalName: string | null;
  taxId: string | null;
  country: string | null;
  city: string | null;
  createdAt: string;
  membersCount: number;
  materialsCount: number;
  evidencesCount: number;
  outputBatchesCount: number;
  calculationsCount: number;
  openFeedbackCount: number;
  criticalFeedbackCount: number;
  contactEmail: string | null;
  phone: string | null;
};

function mapPlatformOrgRow(r: Record<string, unknown>): PlatformOrganizationRow {
  return {
    organizationId: r.organization_id as string,
    organizationName: r.organization_name as string,
    legalName: (r.legal_name as string | null) ?? null,
    taxId: (r.tax_id as string | null) ?? null,
    country: (r.country as string | null) ?? null,
    city: (r.city as string | null) ?? null,
    createdAt: r.created_at as string,
    membersCount: Number(r.members_count ?? 0),
    materialsCount: Number(r.materials_count ?? 0),
    evidencesCount: Number(r.evidences_count ?? 0),
    outputBatchesCount: Number(r.output_batches_count ?? 0),
    calculationsCount: Number(r.calculations_count ?? 0),
    openFeedbackCount: Number(r.open_feedback_count ?? 0),
    criticalFeedbackCount: Number(r.critical_feedback_count ?? 0),
    contactEmail: (r.contact_email as string | null) ?? null,
    phone: (r.phone as string | null) ?? null,
  };
}

/** Devuelve [] (nunca un error visible) si quien consulta no es
 *  platform_staff: la vista misma (0041) filtra con is_platform_staff(),
 *  así que un usuario normal simplemente recibe cero filas. */
export async function listPlatformOrganizations(): Promise<PlatformOrganizationRow[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("v_platform_organizations")
    .select("*")
    .order("created_at", { ascending: false });
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(mapPlatformOrgRow);
}

export async function getPlatformOrganizationDetail(
  organizationId: string
): Promise<PlatformOrganizationRow | null> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("v_platform_organizations")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();
  return data ? mapPlatformOrgRow(data as unknown as Record<string, unknown>) : null;
}

// ---------------------------------------------------------------------------
// Sprint 10A (corrección, Bloqueante 6): miembros e invitaciones
// pendientes de CUALQUIER empresa, para el detalle ampliado de la consola
// de plataforma. v_platform_organization_members/_invitations (0055)
// llevan la misma guarda is_platform_staff() que v_platform_organizations
// — un usuario normal siempre recibe cero filas.
// ---------------------------------------------------------------------------
export type PlatformOrganizationMemberRow = {
  userId: string;
  fullName: string | null;
  email: string;
  roleCode: string;
  status: string;
  joinedAt: string;
};

export async function getPlatformOrganizationMembers(organizationId: string): Promise<PlatformOrganizationMemberRow[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("v_platform_organization_members")
    .select("user_id, full_name, email, role_code, status, joined_at")
    .eq("organization_id", organizationId)
    .order("joined_at", { ascending: true });
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    userId: r.user_id as string,
    fullName: (r.full_name as string | null) ?? null,
    email: r.email as string,
    roleCode: r.role_code as string,
    status: r.status as string,
    joinedAt: r.joined_at as string,
  }));
}

export type PlatformOrganizationInvitationRow = {
  email: string;
  roleCode: string;
  status: string;
  expiresAt: string;
  createdAt: string;
};

export async function getPlatformOrganizationPendingInvitations(
  organizationId: string
): Promise<PlatformOrganizationInvitationRow[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("v_platform_organization_invitations")
    .select("email, role_code, status, expires_at, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    email: r.email as string,
    roleCode: r.role_code as string,
    status: r.status as string,
    expiresAt: r.expires_at as string,
    createdAt: r.created_at as string,
  }));
}

export type CreatePlatformOrgResult = {
  organizationId: string | null;
  adminLinked: boolean;
  invitationToken: string | null;
  error: string | null;
};

export async function createPlatformOrganization(
  payload: TrustedPlatformOrgInput
): Promise<CreatePlatformOrgResult> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("create_platform_organization", {
    p_name: payload.name,
    p_legal_name: payload.legal_name,
    p_tax_id: payload.tax_id,
    p_country: payload.country,
    p_city: payload.city,
    p_contact_email: payload.contact_email,
    p_admin_name: payload.admin_name,
    p_admin_email: payload.admin_email,
    p_plan_code: payload.plan_code,
  });
  if (error || !data || (Array.isArray(data) && data.length === 0)) {
    return {
      organizationId: null,
      adminLinked: false,
      invitationToken: null,
      error: error?.message ?? "No fue posible crear la empresa.",
    };
  }
  const row = Array.isArray(data) ? data[0] : data;
  return {
    organizationId: row.organization_id as string,
    adminLinked: row.admin_linked as boolean,
    invitationToken: (row.invitation_token as string | null) ?? null,
    error: null,
  };
}

export type PlatformStaffRow = {
  id: string;
  userId: string;
  fullName: string | null;
  email: string;
  roleCode: PlatformRoleCode;
  status: PlatformStaffStatus;
  createdAt: string;
};

/** Solo visible para superadmin (platform_staff_select ya lo exige); un
 *  usuario platform_staff normal (support) solo vería su propia fila. */
export async function listPlatformStaff(): Promise<PlatformStaffRow[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("platform_staff")
    .select("id, user_id, role_code, status, created_at, profiles(full_name, email)")
    .order("created_at", { ascending: true });
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => {
    const profile = (r.profiles ?? null) as { full_name: string | null; email: string } | null;
    return {
      id: r.id as string,
      userId: r.user_id as string,
      fullName: profile?.full_name ?? null,
      email: profile?.email ?? "",
      roleCode: r.role_code as PlatformRoleCode,
      status: r.status as PlatformStaffStatus,
      createdAt: r.created_at as string,
    };
  });
}

export async function addPlatformStaff(
  email: string,
  roleCode: PlatformRoleCode
): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("add_platform_staff", {
    p_email: email,
    p_role_code: roleCode,
  });
  if (error) return { error: error.message };
  return { error: null };
}

/** UPDATE directo: platform_staff_update (0040) ya exige
 *  is_platform_superadmin() a nivel de RLS — no hace falta una RPC extra. */
export async function updatePlatformStaffStatus(
  id: string,
  status: PlatformStaffStatus
): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("platform_staff")
    .update({ status })
    .eq("id", id)
    .select("id");
  if (error) return { error: "No fue posible actualizar el registro de personal de plataforma." };
  if ((data ?? []).length === 0) {
    return { error: "Tu rol no permite administrar personal de plataforma." };
  }
  return { error: null };
}
