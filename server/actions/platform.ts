"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformStaff } from "@/lib/auth/require-platform-staff";
import {
  checkPlatformStatus,
  listPlatformOrganizations,
  getPlatformOrganizationDetail,
  getPlatformOrganizationMembers,
  getPlatformOrganizationPendingInvitations,
  createPlatformOrganization,
  listPlatformStaff,
  addPlatformStaff,
  updatePlatformStaffStatus,
  type PlatformOrganizationRow,
  type PlatformOrganizationMemberRow,
  type PlatformOrganizationInvitationRow,
  type PlatformStaffRow,
} from "@/lib/db/platform";
import { listPlatformSupportTickets } from "@/lib/db/support";
import { listOrganizationMembersLegalAcceptances, type UserLegalAcceptanceSummary } from "@/lib/db/legal";
import { getOrganizationOnboardingStatus, type OnboardingStatusRow } from "@/lib/db/onboarding";
import {
  canCreatePlatformOrganization,
  canManagePlatformStaff,
  validatePlatformOrgDraft,
  buildPlatformOrgPayload,
  isPlatformRole,
  isPlatformStaffStatus,
  type PlatformRoleCode,
} from "@/lib/domain/platform";

/**
 * Trazaloop · Sprint 8.4 · Server actions de administración de plataforma.
 *
 * Toda acción exige requirePlatformStaff() (sesión + platform_staff activo,
 * capa separada de memberships); las de escritura además validan el rol
 * de PLATAFORMA (superadmin) en servidor, con la RLS/RPC de 0040-0042 como
 * barrera real. Sin service_role. organization_id nunca sale del cliente:
 * la organización la genera create_platform_organization internamente.
 */

// ---------------------------------------------------------------------------
// Lecturas.
// ---------------------------------------------------------------------------
export type PlatformOverview = {
  isSuperadmin: boolean;
  organizationsCount: number;
  totalMembers: number;
  totalOpenFeedback: number;
  totalCriticalFeedback: number;
  // Sprint 10C (Bloqueante 5): estadísticas reales del Centro de
  // soporte — reemplazan a totalOpenFeedback/totalCriticalFeedback como
  // lo que se MUESTRA en pantalla; los 2 campos anteriores se conservan
  // (datos históricos de implementation_feedback), pero ya no son lo
  // que ve el superadmin en el resumen principal.
  totalOpenTickets: number;
  totalUrgentTickets: number;
  organizationsWithImplementationActivity: number;
};

/** "Empresas con implementación activa" (Parte 5, sección 3): una
 *  definición simple y honesta — al menos un material, una evidencia o un
 *  lote producido cargado. No es un cálculo de contenido reciclado, solo
 *  una cuenta de actividad. */
function hasImplementationActivity(org: PlatformOrganizationRow): boolean {
  return org.materialsCount > 0 || org.evidencesCount > 0 || org.outputBatchesCount > 0;
}

export async function getPlatformOverviewAction(): Promise<PlatformOverview> {
  const { isSuperadmin } = await requirePlatformStaff();
  const [orgs, tickets] = await Promise.all([listPlatformOrganizations(), listPlatformSupportTickets()]);
  const openTicketStatuses = new Set(["open", "assigned", "waiting_customer", "in_progress"]);
  return {
    isSuperadmin,
    organizationsCount: orgs.length,
    totalMembers: orgs.reduce((sum, o) => sum + o.membersCount, 0),
    totalOpenFeedback: orgs.reduce((sum, o) => sum + o.openFeedbackCount, 0),
    totalCriticalFeedback: orgs.reduce((sum, o) => sum + o.criticalFeedbackCount, 0),
    totalOpenTickets: tickets.filter((t) => openTicketStatuses.has(t.status)).length,
    totalUrgentTickets: tickets.filter((t) => t.priority === "urgent" && openTicketStatuses.has(t.status)).length,
    organizationsWithImplementationActivity: orgs.filter(hasImplementationActivity).length,
  };
}

export async function listPlatformOrganizationsAction(): Promise<PlatformOrganizationRow[]> {
  await requirePlatformStaff();
  return listPlatformOrganizations();
}

export async function getPlatformOrganizationDetailAction(organizationId: string): Promise<{
  org: PlatformOrganizationRow | null;
  members: PlatformOrganizationMemberRow[];
  invitations: PlatformOrganizationInvitationRow[];
  legalAcceptances: UserLegalAcceptanceSummary[];
  onboarding: OnboardingStatusRow | null;
}> {
  await requirePlatformStaff();
  const [org, members, invitations] = await Promise.all([
    getPlatformOrganizationDetail(organizationId),
    getPlatformOrganizationMembers(organizationId),
    getPlatformOrganizationPendingInvitations(organizationId),
  ]);
  const [legalAcceptances, onboarding] = await Promise.all([
    listOrganizationMembersLegalAcceptances(members.map((m) => m.userId)),
    getOrganizationOnboardingStatus(organizationId),
  ]);
  return { org, members, invitations, legalAcceptances, onboarding };
}

export async function listPlatformStaffAction(): Promise<{
  data: PlatformStaffRow[];
  canManage: boolean;
}> {
  const { isSuperadmin } = await requirePlatformStaff();
  const data = await listPlatformStaff();
  return { data, canManage: canManagePlatformStaff(isSuperadmin ? "superadmin" : null) };
}

// ---------------------------------------------------------------------------
// Mutaciones.
// ---------------------------------------------------------------------------
export type PlatformActionState = {
  error: string | null;
  organizationId?: string;
  invitationLink?: string;
  outcomeMessage?: string;
};
const okState: PlatformActionState = { error: null };

function revalidatePlatform() {
  revalidatePath("/platform");
}

/** Crea una empresa desde la consola de plataforma (Parte 8). Solo
 *  superadmin — canCreatePlatformOrganization ya lo exige aquí, y la RPC
 *  create_platform_organization lo vuelve a exigir en servidor SQL. */
export async function createPlatformOrganizationAction(
  _prev: PlatformActionState,
  formData: FormData
): Promise<PlatformActionState> {
  const { isSuperadmin } = await requirePlatformStaff();
  if (!canCreatePlatformOrganization(isSuperadmin ? "superadmin" : null)) {
    return { error: "Solo un superadministrador de plataforma puede crear empresas desde esta consola." };
  }

  // T9F.1: el plan general legacy (organization_subscriptions) queda
  // DEPRECATED como decisión comercial: se fuerza SIEMPRE 'demo' por
  // compatibilidad, se ignore lo que envíe el cliente. El acceso real de la
  // empresa nueva es la provisión por módulo de 0100 (CPR y Textiles en Demo
  // de 48 h) y los cambios posteriores se hacen POR MÓDULO desde la consola
  // de plataforma (server/actions/platform-modules.ts).
  const input = {
    name: String(formData.get("name") ?? ""),
    legalName: String(formData.get("legal_name") ?? ""),
    taxId: String(formData.get("tax_id") ?? ""),
    country: String(formData.get("country") ?? ""),
    city: String(formData.get("city") ?? ""),
    contactEmail: String(formData.get("contact_email") ?? ""),
    adminName: String(formData.get("admin_name") ?? ""),
    adminEmail: String(formData.get("admin_email") ?? ""),
    planCode: "demo" as const,
  };

  const validation = validatePlatformOrgDraft(input);
  if (validation.error) return { error: validation.error };

  // organization_id NUNCA sale del cliente: buildPlatformOrgPayload ni
  // siquiera declara ese campo — la RPC crea la organización y devuelve su
  // id real.
  const payload = buildPlatformOrgPayload(input);
  const result = await createPlatformOrganization(payload);
  if (result.error || !result.organizationId) {
    return { error: result.error ?? "No fue posible crear la empresa." };
  }

  revalidatePlatform();

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  return {
    error: null,
    organizationId: result.organizationId,
    invitationLink: result.invitationToken
      ? `${site}/accept-invite?token=${result.invitationToken}`
      : undefined,
    outcomeMessage: result.adminLinked
      ? "La organización se creó y el administrador inicial quedó vinculado de inmediato (ya tenía cuenta en Trazaloop)."
      : "La organización se creó. El administrador inicial todavía no tiene cuenta: copia el enlace de invitación y compártelo.",
  };
}

export async function addPlatformStaffAction(
  _prev: PlatformActionState,
  formData: FormData
): Promise<PlatformActionState> {
  const { isSuperadmin } = await requirePlatformStaff();
  if (!canManagePlatformStaff(isSuperadmin ? "superadmin" : null)) {
    return { error: "Solo un superadministrador de plataforma puede agregar personal de plataforma." };
  }

  const email = String(formData.get("email") ?? "").trim();
  const roleCode = String(formData.get("role_code") ?? "").trim();
  if (!email) return { error: "Ingresa un correo válido." };
  if (!isPlatformRole(roleCode)) return { error: "Selecciona un rol de plataforma válido." };

  const { error } = await addPlatformStaff(email, roleCode as PlatformRoleCode);
  if (error) return { error };

  revalidatePlatform();
  return okState;
}

export async function updatePlatformStaffStatusAction(
  _prev: PlatformActionState,
  formData: FormData
): Promise<PlatformActionState> {
  const { isSuperadmin } = await requirePlatformStaff();
  if (!canManagePlatformStaff(isSuperadmin ? "superadmin" : null)) {
    return { error: "Solo un superadministrador de plataforma puede administrar personal de plataforma." };
  }

  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "").trim();
  if (!id) return { error: "Falta el identificador del registro." };
  if (!isPlatformStaffStatus(status)) return { error: "Estado no válido." };

  const { error } = await updatePlatformStaffStatus(id, status);
  if (error) return { error };

  revalidatePlatform();
  return okState;
}

export async function getPlatformStatusAction(): Promise<{ isStaff: boolean; isSuperadmin: boolean }> {
  return checkPlatformStatus();
}
