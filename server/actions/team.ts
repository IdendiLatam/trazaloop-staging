"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { checkFeatureEnabled, checkResourceLimit, checkOrganizationCanMutate } from "@/server/actions/plans";
import { assertMyLegalAcceptance } from "@/server/actions/legal";
import { requireSession } from "@/lib/auth/require-session";
import { writeActiveOrgCookie } from "@/lib/auth/active-organization";
import { getUserOrganizations, getActiveOrganization } from "@/lib/db/organizations";
import {
  listMembers,
  listInvitations,
  getMembershipFacts,
  getPendingInvitationEmails,
  getActiveMemberEmails,
  insertInvitation,
  revokeInvitation,
  updateMemberRole,
  updateMemberStatus,
  getInvitationPreview,
  acceptInvitationByToken,
  listMyPendingInvitations,
  type MemberRow,
  type InvitationRow,
  type InvitationPreview,
  type MyPendingInvitation,
} from "@/lib/db/team";
import {
  validateInviteDraft,
  validateRoleChange,
  validateDeactivation,
  canManageTeam,
  buildInvitationInsertPayload,
  isTeamRole,
  resolveTeamChecklistStatus,
  resolvePostAuthDestination,
  type TeamChecklistStatus,
  type PostAuthDestination,
} from "@/lib/domain/team";

// ---------------------------------------------------------------------------
// Lecturas — llamadas directas desde Server Components, sin FormData. La
// empresa activa SIEMPRE se resuelve en servidor (requireActiveOrg).
// ---------------------------------------------------------------------------
export type TeamOverview = {
  organizationName: string;
  memberCount: number;
  pendingInvitationCount: number;
  checklistStatus: TeamChecklistStatus;
  canManage: boolean;
};

export async function getTeamOverviewAction(): Promise<TeamOverview> {
  const org = await requireActiveOrg();
  const [members, invitations] = await Promise.all([
    listMembers(org.organizationId),
    listInvitations(org.organizationId),
  ]);
  const pendingCount = invitations.filter((i) => i.status === "pending").length;
  return {
    organizationName: org.organizationName,
    memberCount: members.length,
    pendingInvitationCount: pendingCount,
    checklistStatus: resolveTeamChecklistStatus(members.length, pendingCount),
    canManage: canManageTeam(org.roleCode),
  };
}

export async function listOrganizationMembersAction(): Promise<MemberRow[]> {
  const org = await requireActiveOrg();
  return listMembers(org.organizationId);
}

export async function listTeamInvitationsAction(): Promise<InvitationRow[]> {
  const org = await requireActiveOrg();
  return listInvitations(org.organizationId);
}

/** Vista previa segura de una invitación por token (para /accept-invite,
 *  antes o después de iniciar sesión). Exige sesión: get_invitation_preview
 *  (0037) es solo `authenticated`, nunca `anon`, para no permitir
 *  enumeración de tokens sin cuenta. */
export async function getInvitationPreviewAction(
  token: string
): Promise<{ data: InvitationPreview | null; error: string | null }> {
  await requireSession();
  const data = await getInvitationPreview(token);
  if (!data) return { data: null, error: "La invitación no existe o el enlace no es válido." };
  return { data, error: null };
}

/** Invitaciones pendientes y vigentes para el correo del usuario actual —
 *  sin necesitar conocer el token de antemano (0038). Corrige el bug de
 *  onboarding: es lo que permite avisarle a alguien invitado ANTES de
 *  mandarlo a crear empresa. */
export async function listMyPendingInvitationsAction(): Promise<MyPendingInvitation[]> {
  await requireSession();
  return listMyPendingInvitations();
}

/**
 * Corrección de onboarding: decide a dónde mandar a alguien justo después
 * de iniciar sesión o registrarse (Partes 1-2). Nunca envía a crear
 * empresa si ya tiene membership o invitación pendiente — exactamente la
 * regla que faltaba. Compone datos ya existentes (getActiveOrganization,
 * getUserOrganizations, listMyPendingInvitations) y delega la decisión a
 * la función pura resolvePostAuthDestination (testeable sin BD).
 */
export async function getPostAuthDestinationAction(): Promise<PostAuthDestination> {
  const [activeOrg, organizations, invitations] = await Promise.all([
    getActiveOrganization(),
    getUserOrganizations(),
    listMyPendingInvitations(),
  ]);

  return resolvePostAuthDestination({
    hasResolvedActiveOrg: activeOrg !== null,
    membershipCount: organizations.length,
    pendingInvitationTokens: invitations.map((i) => i.token),
  });
}

// ---------------------------------------------------------------------------
// Mutaciones — mismo patrón useActionState que el resto de la app
// (server/actions/evidences.ts, server/actions/implementation.ts).
// ---------------------------------------------------------------------------
export type TeamActionState = { error: string | null; warning?: string | null; inviteLink?: string };
const okState: TeamActionState = { error: null };

function revalidateTeam() {
  revalidatePath("/team");
  revalidatePath("/implementation");
}

/** Crea una invitación (Parte 5.1). Solo admin (RLS + validación aquí).
 *  organization_id NUNCA sale del FormData: siempre de la empresa activa. */
export async function createTeamInvitationAction(
  _prev: TeamActionState,
  formData: FormData
): Promise<TeamActionState> {
  const org = await requireActiveOrg();

  if (!canManageTeam(org.roleCode)) {
    return { error: "Tu rol no permite administrar usuarios de esta empresa." };
  }

  // Sprint 10A (Parte 8): Demo deshabilita invitaciones/roles por completo.
  const featureCheck = await checkFeatureEnabled("roles_enabled");
  if (!featureCheck.allowed) return { error: featureCheck.error };
  const limitCheck = await checkResourceLimit("team_members");
  if (!limitCheck.allowed) return { error: limitCheck.error };

  const email = String(formData.get("email") ?? "").trim();
  const roleCode = String(formData.get("role_code") ?? "").trim();
  if (!isTeamRole(roleCode)) return { error: "Selecciona un rol válido." };

  const [pendingEmails, activeMemberEmails] = await Promise.all([
    getPendingInvitationEmails(org.organizationId),
    getActiveMemberEmails(org.organizationId),
  ]);

  const draftError = validateInviteDraft(
    { email, roleCode },
    { existingPendingEmails: pendingEmails, existingActiveMemberEmails: activeMemberEmails }
  );
  if (draftError.error) return { error: draftError.error };

  const payload = buildInvitationInsertPayload(org.organizationId, { email, roleCode });
  const { id, error } = await insertInvitation(payload);
  if (error || !id) return { error: error ?? "No fue posible crear la invitación." };

  revalidateTeam();

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const inviteLink = `${site}/accept-invite?token=${payload.token}`;
  return { error: null, inviteLink };
}

export async function revokeTeamInvitationAction(
  _prev: TeamActionState,
  formData: FormData
): Promise<TeamActionState> {
  const org = await requireActiveOrg();
  if (!canManageTeam(org.roleCode)) {
    return { error: "Tu rol no permite administrar usuarios de esta empresa." };
  }
  const mutateCheck = await checkOrganizationCanMutate();
  if (!mutateCheck.allowed) return { error: mutateCheck.error };

  const invitationId = String(formData.get("invitation_id") ?? "");
  if (!invitationId) return { error: "Falta el identificador de la invitación." };

  const { error } = await revokeInvitation(org.organizationId, invitationId);
  if (error) return { error };

  revalidateTeam();
  return okState;
}

/** Acepta una invitación (Parte 5.2). Pasa SIEMPRE por la RPC
 *  accept_team_invitation (0037): valida token, estado, expiración y
 *  coincidencia de correo en el propio servidor SQL. */
export async function acceptTeamInvitationAction(
  _prev: TeamActionState,
  formData: FormData
): Promise<TeamActionState> {
  await requireSession();
  const token = String(formData.get("token") ?? "");
  if (!token) return { error: "Falta el token de la invitación." };

  // Sprint 10D (Bloqueante 2): revisar aceptación legal ANTES de aceptar
  // la invitación — redirige (no solo devuelve error) porque el destino
  // correcto es volver aquí mismo después de aceptar, preservando el
  // token en la URL.
  const { hasAccepted } = await assertMyLegalAcceptance();
  if (!hasAccepted) {
    redirect(`/legal/accept?next=${encodeURIComponent(`/accept-invite?token=${encodeURIComponent(token)}`)}`);
  }

  const { organizationId, error } = await acceptInvitationByToken(token);
  if (error || !organizationId) {
    return { error: error ?? "No fue posible aceptar la invitación." };
  }

  await writeActiveOrgCookie(organizationId);

  revalidateTeam();
  redirect("/dashboard");
}

/** Cambia el rol de un miembro. Solo admin; el trigger guard_last_admin
 *  (0037) bloquea igual aunque se manipule la petición — aquí se valida
 *  ADEMÁS en servidor con la misma regla pura, para un mensaje claro sin
 *  esperar el error crudo de base de datos. */
export async function updateMemberRoleAction(
  _prev: TeamActionState,
  formData: FormData
): Promise<TeamActionState> {
  const org = await requireActiveOrg();
  if (!canManageTeam(org.roleCode)) {
    return { error: "Tu rol no permite administrar usuarios de esta empresa." };
  }

  // Sprint 10A (Bloqueante 2): Demo no incluye roles/invitaciones — este
  // chequeo también bloquea si la suscripción está suspended/cancelled
  // (checkFeatureEnabled revisa el estado del plan primero).
  const featureCheck = await checkFeatureEnabled("roles_enabled");
  if (!featureCheck.allowed) return { error: featureCheck.error };

  const membershipId = String(formData.get("membership_id") ?? "");
  const roleCode = String(formData.get("role_code") ?? "").trim();
  if (!membershipId) return { error: "Falta el identificador del miembro." };
  if (!isTeamRole(roleCode)) return { error: "Rol no válido." };

  const facts = await getMembershipFacts(org.organizationId);
  const preCheck = validateRoleChange(facts, membershipId, roleCode);
  if (preCheck.error) return { error: preCheck.error };

  const { error } = await updateMemberRole(org.organizationId, membershipId, roleCode);
  if (error) return { error };

  revalidateTeam();
  return okState;
}

/** Desactiva el acceso de un miembro (status → 'suspended'; Parte 6). No
 *  borra la membership: el patrón del proyecto prefiere status. */
export async function deactivateMemberAction(
  _prev: TeamActionState,
  formData: FormData
): Promise<TeamActionState> {
  const org = await requireActiveOrg();
  if (!canManageTeam(org.roleCode)) {
    return { error: "Tu rol no permite administrar usuarios de esta empresa." };
  }

  // Sprint 10A (corrección final): a diferencia de updateMemberRoleAction/
  // reactivateMemberAction (que revisan roles_enabled y por lo tanto ya
  // bloquean Demo activo), desactivar SIGUE permitido en Demo activo —
  // ayuda a volver dentro del límite. Solo se bloquea si la suscripción
  // está suspended/cancelled (checkOrganizationCanMutate, no
  // checkFeatureEnabled).
  const mutateCheck = await checkOrganizationCanMutate();
  if (!mutateCheck.allowed) return { error: mutateCheck.error };

  const membershipId = String(formData.get("membership_id") ?? "");
  if (!membershipId) return { error: "Falta el identificador del miembro." };

  const facts = await getMembershipFacts(org.organizationId);
  const preCheck = validateDeactivation(facts, membershipId);
  if (preCheck.error) return { error: preCheck.error };

  const { error } = await updateMemberStatus(org.organizationId, membershipId, "suspended");
  if (error) return { error };

  revalidateTeam();
  return okState;
}

/** Reactiva el acceso de un miembro (status → 'active'). */
export async function reactivateMemberAction(
  _prev: TeamActionState,
  formData: FormData
): Promise<TeamActionState> {
  const org = await requireActiveOrg();
  if (!canManageTeam(org.roleCode)) {
    return { error: "Tu rol no permite administrar usuarios de esta empresa." };
  }

  // Sprint 10A (Bloqueante 2): mismo criterio que updateMemberRoleAction
  // — reactivar es, en esencia, volver a conceder un rol activo.
  const featureCheck = await checkFeatureEnabled("roles_enabled");
  if (!featureCheck.allowed) return { error: featureCheck.error };

  const membershipId = String(formData.get("membership_id") ?? "");
  if (!membershipId) return { error: "Falta el identificador del miembro." };

  const { error } = await updateMemberStatus(org.organizationId, membershipId, "active");
  if (error) return { error };

  revalidateTeam();
  return okState;
}
