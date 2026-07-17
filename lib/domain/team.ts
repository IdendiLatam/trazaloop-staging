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
  quality: "Supervisor",
  consultant: "Consultor",
};

/** Texto de ayuda por rol (Parte 3 del Sprint 8), ajustado a los roles
 *  REALES del sistema — sin 'user' ni 'viewer', que no existen. Sprint 8.4:
 *  el rol interno sigue llamándose `quality` (no se renombra la columna ni
 *  el valor almacenado); solo la ETIQUETA visible cambia a "Supervisor". */
export const ROLE_DESCRIPTION: Record<TeamRoleCode, string> = {
  admin:
    "Gestiona la empresa, usuarios, datos, evidencias, importaciones y configuración.",
  quality:
    "Puede validar evidencias, revisar cálculos y apoyar la preparación técnica.",
  consultant:
    "Puede cargar y organizar información, importar datos y crear tickets de soporte, pero no valida evidencias.",
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

// ---------------------------------------------------------------------------
// Corrección de onboarding: a dónde mandar a alguien justo después de
// iniciar sesión o registrarse. Espejo puro de la corrección (bug:
// usuarios invitados terminaban forzados a crear empresa). Testeable sin
// BD con `npm run test:team`.
// ---------------------------------------------------------------------------
export type PostAuthDestination =
  | { kind: "dashboard" }
  | { kind: "select-org" }
  | { kind: "accept-invite"; token: string }
  | { kind: "create-org" };

export type PostAuthFacts = {
  /** true si ya hay una empresa activa resuelta (cookie válida O una sola
   *  membership, que getActiveOrganization ya auto-selecciona). */
  hasResolvedActiveOrg: boolean;
  membershipCount: number;
  /** Tokens de invitaciones pendientes y VIGENTES para el correo del
   *  usuario (ya filtradas: status='pending', no expiradas, email
   *  coincide) — tal como las devuelve list_my_pending_invitations (0038). */
  pendingInvitationTokens: string[];
};

/**
 * Decide el destino post-login/registro.
 *
 * Caso A — una o más memberships activas: nunca a crear empresa.
 * Caso B — sin membership, con invitación(es) pendiente(s): nunca a crear
 *          empresa; una sola invitación va directo a aceptarla, varias van
 *          a elegir en /select-org.
 * Caso C — sin membership ni invitación: a crear empresa.
 */
export function resolvePostAuthDestination(f: PostAuthFacts): PostAuthDestination {
  if (f.hasResolvedActiveOrg) return { kind: "dashboard" };
  if (f.membershipCount === 1) return { kind: "dashboard" }; // auto-selección ya existente (getActiveOrganization).
  if (f.membershipCount > 1) return { kind: "select-org" };

  // membershipCount === 0 a partir de aquí.
  if (f.pendingInvitationTokens.length === 1) {
    return { kind: "accept-invite", token: f.pendingInvitationTokens[0] };
  }
  if (f.pendingInvitationTokens.length > 1) return { kind: "select-org" };
  return { kind: "create-org" };
}

/**
 * Valida un parámetro `next` recibido en login/registro ANTES de usarlo en
 * un redirect (Parte 4/5; Parte 8 en espíritu — nunca confiar un destino
 * arbitrario del cliente). Lista blanca deliberadamente angosta: solo
 * rutas internas que empiecen por "/accept-invite", nunca una URL
 * completa ni "//" (truco clásico de open redirect).
 */
export function isSafeAcceptInviteNext(next: string | null | undefined): next is string {
  if (!next) return false;
  if (!next.startsWith("/accept-invite")) return false;
  if (next.startsWith("//")) return false;
  return true;
}

/** Convierte un PostAuthDestination en una ruta interna para redirect().
 *  Función pura y SÍNCRONA a propósito: vive aquí (no en
 *  server/actions/team.ts) porque todo export de un archivo "use server"
 *  debe ser async — esta no necesita serlo.
 *
 *  Sprint 10A (Bloqueante 5): /modules es la entrada interna principal —
 *  dashboard/select-org/create-org pasan TODOS por ahí primero (la
 *  tarjeta "Trazaloop CPR → Entrar" ya resuelve el destino final por su
 *  cuenta, con la MISMA lógica). Una invitación pendiente NUNCA pasa por
 *  /modules: ya es un destino explícito y más específico que elegir
 *  módulo, igual que un `next=/accept-invite?token=...` explícito en la
 *  URL de login (ver isSafeAcceptInviteNext, que se evalúa ANTES que
 *  esta función y tiene prioridad total). */
export function postAuthDestinationPath(dest: PostAuthDestination): string {
  switch (dest.kind) {
    case "dashboard":
    case "select-org":
    case "create-org":
      return "/modules";
    case "accept-invite":
      return `/accept-invite?token=${encodeURIComponent(dest.token)}`;
  }
}

/** La ruta a la que de verdad debe llegar el usuario UNA VEZ que ya eligió
 *  "Trazaloop CPR" en /modules — aquí sí se usa el destino real
 *  (dashboard/select-org), nunca /modules de nuevo (evita un ciclo). */
export function moduleEntryDestinationPath(dest: PostAuthDestination): string {
  switch (dest.kind) {
    case "dashboard":
      return "/dashboard";
    case "select-org":
    case "create-org":
      return "/select-org";
    case "accept-invite":
      return `/accept-invite?token=${encodeURIComponent(dest.token)}`;
  }
}

