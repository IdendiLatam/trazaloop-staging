/**
 * Trazaloop · Sprint 8.4 · Lógica PURA de administración de plataforma.
 *
 * Mismo patrón que lib/domain/team.ts y lib/domain/settings.ts: esta
 * función es la ESPECIFICACIÓN de quién puede hacer qué. La migración
 * 0040/0042 implementa la MISMA regla en SQL (platform_staff,
 * is_platform_superadmin, el guarda nuevo en create_organization); este
 * módulo es la versión testeable sin BD con `npm run test:platform`.
 *
 * IMPORTANTE (Parte 1): platform_staff es una capa TOTALMENTE SEPARADA de
 * memberships. PLATFORM_ROLES y TEAM_ROLES (lib/domain/team.ts) son
 * conjuntos disjuntos a propósito — 'superadmin'/'support' nunca son un
 * role_code de membership, y 'admin'/'quality'/'consultant' nunca son un
 * role_code de platform_staff. No se mezclan ni en tipos ni en tablas.
 */
import { isValidEmail, TEAM_ROLES } from "./team";
import type { PlanCode } from "../plans/types";

// ---------------------------------------------------------------------------
// Roles de PLATAFORMA (nunca de empresa).
// ---------------------------------------------------------------------------
export const PLATFORM_ROLES = ["superadmin", "support"] as const;
export type PlatformRoleCode = (typeof PLATFORM_ROLES)[number];

export const PLATFORM_ROLE_LABEL: Record<PlatformRoleCode, string> = {
  superadmin: "Superadministrador",
  support: "Soporte interno",
};

export const PLATFORM_STAFF_STATUSES = ["active", "suspended", "revoked"] as const;
export type PlatformStaffStatus = (typeof PLATFORM_STAFF_STATUSES)[number];

export function isPlatformRole(v: string | null | undefined): v is PlatformRoleCode {
  return !!v && (PLATFORM_ROLES as readonly string[]).includes(v);
}

export function isPlatformStaffStatus(v: string | null | undefined): v is PlatformStaffStatus {
  return !!v && (PLATFORM_STAFF_STATUSES as readonly string[]).includes(v);
}

/** Garantía estructural (Parte 1, casos 8/10/11): ningún role_code de
 *  plataforma puede colarse como role_code de empresa, y viceversa. */
export const PLATFORM_AND_TEAM_ROLES_ARE_DISJOINT: boolean = (() => {
  const platform = new Set<string>(PLATFORM_ROLES);
  const team = new Set<string>(TEAM_ROLES);
  for (const r of platform) if (team.has(r)) return false;
  for (const r of team) if (platform.has(r)) return false;
  return true;
})();

// ---------------------------------------------------------------------------
// Permisos.
// ---------------------------------------------------------------------------
/** ¿Se muestra "Plataforma" en la navegación / se puede entrar a
 *  /platform? Solo platform_staff con status='active' — nunca por rol de
 *  empresa. */
export function canAccessPlatformConsole(isPlatformStaffActive: boolean): boolean {
  return isPlatformStaffActive;
}

/** Solo superadmin crea empresas desde la consola de plataforma. */
export function canCreatePlatformOrganization(role: PlatformRoleCode | null | undefined): boolean {
  return role === "superadmin";
}

/** Solo superadmin administra platform_staff (agregar/cambiar estado de
 *  otros miembros de plataforma) — support NUNCA, aunque esté activo. */
export function canManagePlatformStaff(role: PlatformRoleCode | null | undefined): boolean {
  return role === "superadmin";
}

// ---------------------------------------------------------------------------
// Restricción de creación de empresa normal (Parte 2 y 9). Espejo puro del
// guarda agregado a create_organization() en 0042.
// ---------------------------------------------------------------------------
export type OrgCreationFacts = {
  isPlatformSuperadmin: boolean;
  hasActiveMembership: boolean;
  hasPendingInvitation: boolean;
};

export type OrgCreationEligibility = { canCreate: boolean; reason: string | null };

export const ALREADY_HAS_ORG_MESSAGE =
  "Tu cuenta ya está asociada a una empresa. Si necesitas administrar otra organización, contacta al equipo de Trazaloop.";
export const HAS_PENDING_INVITATION_MESSAGE =
  "Tienes una invitación pendiente. Acéptala en vez de crear una empresa nueva.";

export function resolveOrgCreationEligibility(facts: OrgCreationFacts): OrgCreationEligibility {
  if (facts.isPlatformSuperadmin) return { canCreate: true, reason: null };
  if (facts.hasActiveMembership) return { canCreate: false, reason: ALREADY_HAS_ORG_MESSAGE };
  if (facts.hasPendingInvitation) return { canCreate: false, reason: HAS_PENDING_INVITATION_MESSAGE };
  return { canCreate: true, reason: null };
}

// ---------------------------------------------------------------------------
// /select-org (corrección post Sprint 8.4, Bloqueante 2): qué mostrar según
// el estado real del usuario — nunca ofrecer un formulario de crear
// empresa que la RPC va a rechazar de todos modos, y siempre ofrecer la
// consola de plataforma a quien sea platform_staff, tenga o no empresa.
// ---------------------------------------------------------------------------
export type SelectOrgDisplayFacts = {
  hasOrganizations: boolean;
  hasInvitations: boolean;
  isPlatformStaff: boolean;
};

export type SelectOrgDisplay = {
  /** Solo sin organizaciones Y sin invitaciones (mismas 3 reglas que
   *  create_organization en la base, 0042 — reflejadas aquí para no
   *  siquiera OFRECER un formulario que la RPC rechazaría). */
  showCreateForm: boolean;
  /** Independiente de organizaciones/invitaciones: un platform_staff
   *  SIEMPRE ve el acceso a /platform, nunca se le obliga a crear ni
   *  aceptar nada para llegar ahí (Bloqueante 1). */
  showPlatformLink: boolean;
};

export function resolveSelectOrgDisplay(facts: SelectOrgDisplayFacts): SelectOrgDisplay {
  return {
    showCreateForm: !facts.hasOrganizations && !facts.hasInvitations,
    showPlatformLink: facts.isPlatformStaff,
  };
}

// ---------------------------------------------------------------------------
// createOrganizationAction (corrección post Sprint 8.4, Bloqueante 3): qué
// errores de create_organization son seguros de mostrar tal cual al
// usuario. Lista BLANCA a propósito — nunca se reenvía texto de error
// arbitrario de la base; solo estos dos mensajes de negocio ya
// controlados, ambos ya usados en /select-org (misma fuente de verdad).
// ---------------------------------------------------------------------------
const SAFE_ORG_CREATION_BUSINESS_ERRORS = new Set<string>([
  ALREADY_HAS_ORG_MESSAGE,
  HAS_PENDING_INVITATION_MESSAGE,
]);

export const GENERIC_ORG_CREATION_ERROR = "No fue posible crear la empresa. Intenta de nuevo.";

export function toSafeOrgCreationError(rawMessage: string | null | undefined): string {
  const trimmed = rawMessage?.trim();
  if (trimmed && SAFE_ORG_CREATION_BUSINESS_ERRORS.has(trimmed)) {
    return trimmed;
  }
  return GENERIC_ORG_CREATION_ERROR;
}

// ---------------------------------------------------------------------------
// Crear empresa desde la consola de plataforma (Parte 8, casos 12-14).
// ---------------------------------------------------------------------------
export type PlatformOrgDraftInput = {
  name: string;
  legalName?: string | null;
  taxId?: string | null;
  country?: string | null;
  city?: string | null;
  contactEmail?: string | null;
  adminName?: string | null;
  adminEmail: string;
  /** Sprint 10A (Parte 4): opcional — si el superadmin no elige, cae en 'demo'. */
  planCode?: PlanCode | null;
};

export type PlatformValidation = { error: string | null };

export function validatePlatformOrgDraft(input: PlatformOrgDraftInput): PlatformValidation {
  if (!input.name || input.name.trim().length === 0) {
    return { error: "El nombre de la empresa no puede estar vacío." };
  }
  if (!input.adminEmail || input.adminEmail.trim().length === 0) {
    return { error: "El correo del administrador inicial es obligatorio." };
  }
  if (!isValidEmail(input.adminEmail)) {
    return { error: "El correo del administrador inicial no parece válido." };
  }
  const contactEmail = (input.contactEmail ?? "").trim();
  if (contactEmail && !isValidEmail(contactEmail)) {
    return { error: "El correo de contacto no parece válido." };
  }
  return { error: null };
}

export type TrustedPlatformOrgInput = {
  name: string;
  legal_name: string | null;
  tax_id: string | null;
  country: string | null;
  city: string | null;
  contact_email: string | null;
  admin_name: string | null;
  admin_email: string;
  plan_code: PlanCode;
};

function optionalText(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  return v === "" ? null : v;
}

/**
 * Arma el payload que se manda a la RPC create_platform_organization. NUNCA
 * declara organization_id (la organización todavía no existe: la RPC la
 * crea y devuelve su id) — mismo patrón que buildInvitationInsertPayload /
 * buildCompanySettingsUpdatePayload (Sprint 8 / 8.3): el tipo de entrada ni
 * siquiera tiene ese campo, así que no hay forma de que un intento de
 * colarlo llegue a ninguna parte que lo use.
 */
export function buildPlatformOrgPayload(input: PlatformOrgDraftInput): TrustedPlatformOrgInput {
  return {
    name: input.name.trim(),
    legal_name: optionalText(input.legalName),
    tax_id: optionalText(input.taxId),
    country: optionalText(input.country),
    city: optionalText(input.city),
    contact_email: optionalText(input.contactEmail)?.toLowerCase() ?? null,
    admin_name: optionalText(input.adminName),
    admin_email: input.adminEmail.trim().toLowerCase(),
    plan_code: input.planCode ?? "demo",
  };
}

/** Resultado de create_platform_organization (Parte 8, casos 13/14):
 *  admin ya existía → membership creada; si no → invitación pendiente
 *  creada, con enlace copiable. Mensaje puro para la UI. */
export function describePlatformOrgOutcome(adminLinked: boolean): string {
  return adminLinked
    ? "La organización se creó y el administrador inicial quedó vinculado de inmediato (ya tenía cuenta en Trazaloop)."
    : "La organización se creó. El administrador inicial todavía no tiene cuenta: se generó una invitación pendiente — copia el enlace y compártelo.";
}
