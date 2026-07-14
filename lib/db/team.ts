import "server-only";

import { createServerClient } from "@/lib/supabase/server";
import {
  normalizeEmail,
  type TeamRoleCode,
  type MembershipStatus,
  type InvitationStatus,
  type MembershipFacts,
} from "@/lib/domain/team";

/**
 * Trazaloop · Sprint 8 · Capa de datos de gestión de equipo.
 *
 * Reutiliza memberships, profiles, roles y organizations tal como existen
 * (Sprint 1). Nada aquí usa service_role: todo corre con la sesión real del
 * usuario (createServerClient), sujeto a RLS. Las mutaciones sensibles
 * (aceptar invitación) pasan por las RPC de 0037, no por INSERT/UPDATE
 * directos desde este archivo.
 */

export type MemberRow = {
  membershipId: string;
  userId: string;
  fullName: string | null;
  email: string;
  roleCode: TeamRoleCode;
  status: MembershipStatus;
  memberSince: string;
};

type ProfileRef = { full_name: string | null; email: string } | null;

export async function listMembers(orgId: string): Promise<MemberRow[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("memberships")
    .select("id, user_id, role_code, status, created_at, profiles(full_name, email)")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: true });

  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => {
    const profile = (r.profiles ?? null) as ProfileRef;
    return {
      membershipId: r.id as string,
      userId: r.user_id as string,
      fullName: profile?.full_name ?? null,
      email: profile?.email ?? "",
      roleCode: r.role_code as TeamRoleCode,
      status: r.status as MembershipStatus,
      memberSince: r.created_at as string,
    };
  });
}

/** Hechos mínimos de TODAS las membresías activas/inactivas de la empresa,
 *  para validar en servidor (antes de escribir) la regla del último admin
 *  con la MISMA función pura que protege la migración (defensa en
 *  profundidad: el trigger guard_last_admin es la barrera real). */
export async function getMembershipFacts(orgId: string): Promise<MembershipFacts[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("memberships")
    .select("id, role_code, status")
    .eq("organization_id", orgId);
  return ((data ?? []) as { id: string; role_code: string; status: string }[]).map((r) => ({
    id: r.id,
    roleCode: r.role_code as TeamRoleCode,
    status: r.status as MembershipStatus,
  }));
}

export type InvitationRow = {
  id: string;
  email: string;
  roleCode: TeamRoleCode;
  status: InvitationStatus;
  token: string;
  invitedByName: string | null;
  expiresAt: string;
  createdAt: string;
};

export async function listInvitations(orgId: string): Promise<InvitationRow[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("team_invitations")
    .select(
      "id, email, role_code, status, token, expires_at, created_at, inviter:profiles!team_invitations_invited_by_fkey(full_name)"
    )
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => {
    const inviter = (r.inviter ?? null) as { full_name: string | null } | null;
    return {
      id: r.id as string,
      email: r.email as string,
      roleCode: r.role_code as TeamRoleCode,
      status: r.status as InvitationStatus,
      token: r.token as string,
      invitedByName: inviter?.full_name ?? null,
      expiresAt: r.expires_at as string,
      createdAt: r.created_at as string,
    };
  });
}

/** Correos (normalizados a minúsculas) con invitación PENDIENTE en la
 *  empresa activa, para el validador puro (Parte 10, caso 3). */
export async function getPendingInvitationEmails(orgId: string): Promise<Set<string>> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("team_invitations")
    .select("email")
    .eq("organization_id", orgId)
    .eq("status", "pending");
  return new Set((data ?? []).map((r) => normalizeEmail(String((r as { email: string }).email))));
}

/** Correos (normalizados) de miembros ACTIVOS de la empresa activa, para
 *  el validador puro (Parte 10, caso 4: "no invitar a quien ya es
 *  miembro"). Depende de que profiles sea visible bajo RLS, lo cual se
 *  cumple para cualquiera que YA comparta esta organización (shares_org_with). */
export async function getActiveMemberEmails(orgId: string): Promise<Set<string>> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("memberships")
    .select("status, profiles(email)")
    .eq("organization_id", orgId)
    .eq("status", "active");
  return new Set(
    ((data ?? []) as unknown as { profiles: { email: string } | null }[])
      .map((r) => r.profiles?.email)
      .filter((e): e is string => !!e)
      .map((e) => normalizeEmail(e))
  );
}

export async function insertInvitation(
  payload: {
    organization_id: string;
    email: string;
    role_code: TeamRoleCode;
    token: string;
    expires_at: string;
  }
): Promise<{ id: string | null; error: string | null }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("team_invitations")
    .insert(payload)
    .select("id")
    .single();
  if (error || !data) {
    const duplicate = error?.code === "23505";
    return {
      id: null,
      error: duplicate
        ? "Ya existe una invitación pendiente para ese correo."
        : "No fue posible crear la invitación.",
    };
  }
  return { id: data.id as string, error: null };
}

export async function revokeInvitation(
  orgId: string,
  invitationId: string
): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("team_invitations")
    .update({ status: "revoked" })
    .eq("id", invitationId)
    .eq("organization_id", orgId)
    .eq("status", "pending")
    .select("id");
  if (error) return { error: "No fue posible revocar la invitación." };
  if ((data ?? []).length === 0) {
    return { error: "La invitación no existe, no está pendiente o no pertenece a tu empresa activa." };
  }
  return { error: null };
}

export async function updateMemberRole(
  orgId: string,
  membershipId: string,
  roleCode: TeamRoleCode
): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("memberships")
    .update({ role_code: roleCode })
    .eq("id", membershipId)
    .eq("organization_id", orgId)
    .select("id");
  if (error) {
    return { error: knownMembershipError(error.message) };
  }
  if ((data ?? []).length === 0) {
    return { error: "El miembro no existe o no pertenece a tu empresa activa." };
  }
  return { error: null };
}

export async function updateMemberStatus(
  orgId: string,
  membershipId: string,
  status: MembershipStatus
): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("memberships")
    .update({ status })
    .eq("id", membershipId)
    .eq("organization_id", orgId)
    .select("id");
  if (error) {
    return { error: knownMembershipError(error.message) };
  }
  if ((data ?? []).length === 0) {
    return { error: "El miembro no existe o no pertenece a tu empresa activa." };
  }
  return { error: null };
}

/** El trigger guard_last_admin (0037) lanza el mensaje tal cual; se
 *  muestra directo al usuario, igual que el patrón ya usado para
 *  evidencias (guard_evidence_integrity) en server/actions/evidences.ts. */
function knownMembershipError(raw: string | undefined): string {
  if (raw?.includes("último administrador")) return raw;
  return "No fue posible actualizar el miembro.";
}

export type InvitationPreview = {
  organizationName: string;
  email: string;
  roleCode: TeamRoleCode;
  status: InvitationStatus;
  expiresAt: string;
};

export async function getInvitationPreview(token: string): Promise<InvitationPreview | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("get_invitation_preview", { p_token: token });
  if (error || !data || (Array.isArray(data) && data.length === 0)) return null;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    organizationName: row.organization_name as string,
    email: row.email as string,
    roleCode: row.role_code as TeamRoleCode,
    status: row.status as InvitationStatus,
    expiresAt: row.expires_at as string,
  };
}

export async function acceptInvitationByToken(
  token: string
): Promise<{ organizationId: string | null; error: string | null }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("accept_team_invitation", { p_token: token });
  if (error || !data) {
    return { organizationId: null, error: error?.message ?? "No fue posible aceptar la invitación." };
  }
  return { organizationId: data as string, error: null };
}
