/**
 * Trazaloop · Sprint 8 · Lógica PURA de gestión de equipo.
 *
 * Mismo patrón que lib/domain/guided-flow.ts (Sprint 5B) y
 * lib/domain/implementation.ts (Sprint 6): estas funciones son la
 * ESPECIFICACIÓN de las reglas de invitación y roles. La migración 0037
 * implementa las MISMAS reglas en SQL (guard_last_admin, checks de
 * team_invitations, accept_team_invitation); este módulo es la versión
 * testeable sin BD con `npm run test:team`.
 *
 * Sin imports de Supabase, de servidor ni de Next: solo tipos y funciones
 * puras. No cambia la metodología de cálculo de contenido reciclado.
 */

// ---------------------------------------------------------------------------
// Roles reales del sistema (0004_tenancy_core.sql). NO se inventan roles
// 'user' ni 'viewer': el catálogo `roles` solo tiene estos tres.
// ---------------------------------------------------------------------------
export const TEAM_ROLES = ["admin", "quality", "consultant"] as const;
export type TeamRoleCode = (typeof TEAM_ROLES)[number];

export const ROLE_LABEL: Record<TeamRoleCode, string> = {
  admin: "Administrador",
  quality: "Responsable de calidad",
  consultant: "Consultor externo",
};

/** Texto de ayuda por rol (Parte 3 del Sprint 8), ajustado a los roles
 *  REALES del sistema — sin 'user' ni 'viewer', que no existen. */
export const ROLE_DESCRIPTION: Record<TeamRoleCode, string> = {
  admin:
    "Gestiona la empresa, usuarios, datos, evidencias, importaciones y configuración.",
  quality:
    "Puede validar evidencias, revisar cálculos y apoyar la preparación técnica.",
  consultant:
    "Puede cargar y organizar información, importar datos y registrar feedback, pero no valida evidencias.",
};

/** Rango relativo de cada rol, usado SOLO para la regla "no invitar con rol
 *  superior al propio" (Parte 5.1). Hoy únicamente admin puede invitar
 *  (RLS + server action lo exigen), así que en la práctica el rango
 *  siempre permite admin → cualquier rol; queda especificado por si en el
 *  futuro se habilita invitar a más roles. */
export const ROLE_RANK: Record<TeamRoleCode, number> = {
  admin: 3,
  quality: 2,
  consultant: 1,
};

export function isTeamRole(v: string | null | undefined): v is TeamRoleCode {
  return !!v && (TEAM_ROLES as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// membership_status (0002_enums_core.sql): 'active' | 'suspended' | 'revoked'.
// Reutilizado tal cual — "desactivar acceso" = pasar a 'suspended',
// "reactivar" = volver a 'active'.
// ---------------------------------------------------------------------------
export const MEMBERSHIP_STATUSES = ["active", "suspended", "revoked"] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export function isMembershipStatus(v: string | null | undefined): v is MembershipStatus {
  return !!v && (MEMBERSHIP_STATUSES as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// Invitaciones: enums y validación pura.
// ---------------------------------------------------------------------------
export const INVITATION_STATUSES = ["pending", "accepted", "expired", "revoked"] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidEmail(raw: string): boolean {
  return EMAIL_RE.test(normalizeEmail(raw));
}

export const DEFAULT_INVITATION_EXPIRY_DAYS = 7;

/** Fecha de expiración por defecto (Parte 5.1: "default 7 días"). Pura:
 *  recibe `now` explícito para ser 100% determinista en tests. */
export function computeExpiryDate(
  now: Date = new Date(),
  days: number = DEFAULT_INVITATION_EXPIRY_DAYS
): Date {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

export function isExpired(expiresAt: string | Date, now: Date = new Date()): boolean {
  const t = typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt;
  return t.getTime() < now.getTime();
}

/** Token seguro (Parte 4: "Generar token seguro"). Web Crypto API
 *  (`crypto.getRandomValues`), disponible globalmente en Node 20+ y en el
 *  navegador — sin import de servidor. 32 bytes = 64 caracteres hex. */
export function generateInvitationToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export type InviteDraftInput = {
  email: string;
  roleCode: string;
};

export type TeamValidation = { error: string | null };

/** Valida los datos básicos de una invitación (Parte 10, casos 1-4 y 10):
 *  email válido, rol invitable, sin duplicar pendiente, sin invitar a un
 *  miembro activo. Los sets de referencia (ya normalizados a minúsculas)
 *  los arma el server action desde la empresa activa. */
export function validateInviteDraft(
  input: InviteDraftInput,
  ref: {
    existingPendingEmails: Set<string>;
    existingActiveMemberEmails: Set<string>;
  }
): TeamValidation {
  const email = normalizeEmail(input.email);
  if (!isValidEmail(email)) {
    return { error: "Ingresa un correo electrónico válido." };
  }
  if (!isTeamRole(input.roleCode)) {
    return { error: "Selecciona un rol válido." };
  }
  if (ref.existingActiveMemberEmails.has(email)) {
    return { error: "Ese correo ya pertenece a un miembro activo de la empresa." };
  }
  if (ref.existingPendingEmails.has(email)) {
    return { error: "Ya existe una invitación pendiente para ese correo." };
  }
  return { error: null };
}

/** Regla "no invitar con rol superior al propio" (Parte 5.1). Con las
 *  reglas actuales (solo admin invita) esto siempre es true, pero queda
 *  especificado y testeado como regla independiente. */
export function canAssignRole(inviterRole: TeamRoleCode, targetRole: TeamRoleCode): boolean {
  return ROLE_RANK[targetRole] <= ROLE_RANK[inviterRole];
}

/** Solo admin puede invitar, cambiar roles o desactivar/reactivar
 *  miembros (Parte 5.1, Parte 6, Parte 7). */
export function canManageTeam(actorRole: string | null | undefined): boolean {
  return actorRole === "admin";
}

export type TrustedInvitationInsert = {
  organization_id: string;
  email: string;
  role_code: TeamRoleCode;
  token: string;
  expires_at: string;
};

/**
 * Arma el payload de inserción de una invitación. `organizationId` SIEMPRE
 * viene del parámetro explícito (empresa activa validada en servidor,
 * requireActiveOrg) — igual que buildFeedbackInsertPayload del Sprint 6 —
 * nunca de `input`, que ni siquiera declara ese campo. Caso de prueba 11.
 */
export function buildInvitationInsertPayload(
  organizationId: string,
  input: { email: string; roleCode: TeamRoleCode; now?: Date; expiryDays?: number }
): TrustedInvitationInsert {
  return {
    organization_id: organizationId,
    email: normalizeEmail(input.email),
    role_code: input.roleCode,
    token: generateInvitationToken(),
    expires_at: computeExpiryDate(input.now, input.expiryDays).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Aceptar invitación (Parte 5.2, casos 5, 6, 7, 12). Espejo puro de la RPC
// accept_team_invitation (0037): mismas reglas, sin tocar BD.
// ---------------------------------------------------------------------------
export type InvitationFacts = {
  status: InvitationStatus;
  email: string; // ya normalizado en minúsculas, como se guarda en BD.
  expiresAt: string | Date;
};

export function validateAcceptance(
  invitation: InvitationFacts | null,
  userEmail: string,
  now: Date = new Date()
): TeamValidation {
  if (!invitation) return { error: "La invitación no existe." };
  if (invitation.status === "accepted") return { error: "Esta invitación ya fue aceptada." };
  if (invitation.status === "revoked") return { error: "Esta invitación fue revocada." };
  if (invitation.status === "expired" || isExpired(invitation.expiresAt, now)) {
    return { error: "La invitación expiró." };
  }
  if (normalizeEmail(userEmail) !== invitation.email) {
    return { error: "Esta invitación fue enviada a otro correo electrónico." };
  }
  return { error: null };
}

// ---------------------------------------------------------------------------
// Último admin (Parte 6, casos 8 y 9). Espejo puro del trigger
// guard_last_admin (0037): misma regla, sin tocar BD.
// ---------------------------------------------------------------------------
export type MembershipFacts = {
  id: string;
  roleCode: TeamRoleCode;
  status: MembershipStatus;
};

/** true si aplicar `next` sobre `targetId` dejaría a la empresa sin ningún
 *  admin activo (y por lo tanto la operación debe bloquearse). */
export function wouldRemoveLastActiveAdmin(
  members: MembershipFacts[],
  targetId: string,
  next: { roleCode?: TeamRoleCode; status?: MembershipStatus }
): boolean {
  const target = members.find((m) => m.id === targetId);
  if (!target) return false;

  const wasActiveAdmin = target.roleCode === "admin" && target.status === "active";
  if (!wasActiveAdmin) return false;

  const nextRole = next.roleCode ?? target.roleCode;
  const nextStatus = next.status ?? target.status;
  const staysActiveAdmin = nextRole === "admin" && nextStatus === "active";
  if (staysActiveAdmin) return false;

  const otherActiveAdmins = members.filter(
    (m) => m.id !== targetId && m.roleCode === "admin" && m.status === "active"
  ).length;
  return otherActiveAdmins === 0;
}

export function validateRoleChange(
  members: MembershipFacts[],
  targetId: string,
  newRole: string
): TeamValidation {
  if (!isTeamRole(newRole)) return { error: "Rol no válido." };
  if (wouldRemoveLastActiveAdmin(members, targetId, { roleCode: newRole })) {
    return {
      error: "No se puede quitar el rol admin al último administrador activo de la empresa.",
    };
  }
  return { error: null };
}

export function validateDeactivation(
  members: MembershipFacts[],
  targetId: string
): TeamValidation {
  if (wouldRemoveLastActiveAdmin(members, targetId, { status: "suspended" })) {
    return {
      error: "No se puede desactivar al último administrador activo de la empresa.",
    };
  }
  return { error: null };
}

// ---------------------------------------------------------------------------
// Checklist de Implementación (Parte 9): "Definir equipo de prueba".
// ---------------------------------------------------------------------------
export type TeamChecklistStatus = "completo" | "pendiente";

export function resolveTeamChecklistStatus(
  memberCount: number,
  pendingInvitationCount: number
): TeamChecklistStatus {
  return memberCount > 1 || pendingInvitationCount > 0 ? "completo" : "pendiente";
}
