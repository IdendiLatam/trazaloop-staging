/**
 * Trazaloop · Sprint 8 · Tests de la lógica PURA de gestión de equipo (sin
 * BD). Cubre reglas de invitación, aceptación y el guard del último admin —
 * la MISMA especificación que implementa la migración 0037 en SQL.
 *
 * Correr: npm run test:team
 */
import {
  canManageTeam,
  canAssignRole,
  validateInviteDraft,
  validateAcceptance,
  validateRoleChange,
  validateDeactivation,
  wouldRemoveLastActiveAdmin,
  buildInvitationInsertPayload,
  isTeamRole,
  isExpired,
  resolveTeamChecklistStatus,
  type MembershipFacts,
  type InvitationFacts,
} from "../../lib/domain/team";

let failures = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✔ ${name}`);
  } catch (err) {
    failures++;
    console.error(`  ✘ ${name}: ${(err as Error).message}`);
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

console.log("Trazaloop · equipo: invitaciones\n");

const emptyRef = { existingPendingEmails: new Set<string>(), existingActiveMemberEmails: new Set<string>() };

check("1. Admin puede crear invitación", () => {
  assert(canManageTeam("admin") === true, "admin debía poder invitar");
});

check("2. Usuario no admin no puede invitar", () => {
  assert(canManageTeam("quality") === false, "quality no debía poder invitar");
  assert(canManageTeam("consultant") === false, "consultant no debía poder invitar");
  assert(canManageTeam(null) === false, "sin rol no debía poder invitar");
});

check("3. No se puede duplicar invitación pendiente", () => {
  const ref = { ...emptyRef, existingPendingEmails: new Set(["ya@invitado.dev"]) };
  const r = validateInviteDraft({ email: "ya@invitado.dev", roleCode: "quality" }, ref);
  assert(r.error !== null, "debía rechazar la invitación duplicada");
});

check("4. No se puede invitar a usuario ya miembro", () => {
  const ref = { ...emptyRef, existingActiveMemberEmails: new Set(["miembro@empresa.dev"]) };
  const r = validateInviteDraft({ email: "miembro@empresa.dev", roleCode: "consultant" }, ref);
  assert(r.error !== null, "debía rechazar invitar a un miembro activo");
});

check("Extra: invitación válida a correo nuevo → sin error", () => {
  const r = validateInviteDraft({ email: "nuevo@empresa.dev", roleCode: "quality" }, emptyRef);
  assert(r.error === null, `no debía haber error: ${r.error}`);
});

check("Extra: correo inválido se rechaza", () => {
  const r = validateInviteDraft({ email: "no-es-un-correo", roleCode: "quality" }, emptyRef);
  assert(r.error !== null, "debía rechazar un correo mal formado");
});

console.log("\nTrazaloop · equipo: aceptar invitación\n");

const now = new Date("2026-07-12T00:00:00Z");

check("5. Token expirado no se acepta", () => {
  const inv: InvitationFacts = {
    status: "pending",
    email: "persona@empresa.dev",
    expiresAt: new Date("2026-07-01T00:00:00Z"), // antes de `now`
  };
  const r = validateAcceptance(inv, "persona@empresa.dev", now);
  assert(r.error !== null, "debía rechazar el token expirado");
});

check("6. Token revoked no se acepta", () => {
  const inv: InvitationFacts = {
    status: "revoked",
    email: "persona@empresa.dev",
    expiresAt: new Date("2026-08-01T00:00:00Z"),
  };
  const r = validateAcceptance(inv, "persona@empresa.dev", now);
  assert(r.error !== null, "debía rechazar una invitación revocada");
});

check("7. Email distinto no acepta invitación", () => {
  const inv: InvitationFacts = {
    status: "pending",
    email: "correcto@empresa.dev",
    expiresAt: new Date("2026-08-01T00:00:00Z"),
  };
  const r = validateAcceptance(inv, "otro@empresa.dev", now);
  assert(r.error !== null, "debía rechazar por correo distinto");
});

check("12. Usuario solo puede aceptar invitación válida (pending, vigente, mismo correo)", () => {
  const inv: InvitationFacts = {
    status: "pending",
    email: "persona@empresa.dev",
    expiresAt: new Date("2026-08-01T00:00:00Z"),
  };
  const r = validateAcceptance(inv, "Persona@Empresa.DEV", now); // mayúsculas: debe normalizar
  assert(r.error === null, `una invitación válida no debía rechazarse: ${r.error}`);

  const missing = validateAcceptance(null, "persona@empresa.dev", now);
  assert(missing.error !== null, "una invitación inexistente debía rechazarse");

  const alreadyAccepted = validateAcceptance(
    { status: "accepted", email: "persona@empresa.dev", expiresAt: new Date("2026-08-01T00:00:00Z") },
    "persona@empresa.dev",
    now
  );
  assert(alreadyAccepted.error !== null, "una invitación ya aceptada debía rechazarse de nuevo");
});

console.log("\nTrazaloop · equipo: último admin\n");

function membership(id: string, roleCode: "admin" | "quality" | "consultant", status: "active" | "suspended" | "revoked"): MembershipFacts {
  return { id, roleCode, status };
}

check("8. No se puede quitar el rol admin al último administrador activo", () => {
  const members = [membership("m1", "admin", "active")];
  const r = validateRoleChange(members, "m1", "quality");
  assert(r.error !== null, "debía bloquear quitar el único admin");

  // Con un segundo admin activo, sí se puede.
  const withSecond = [membership("m1", "admin", "active"), membership("m2", "admin", "active")];
  const ok = validateRoleChange(withSecond, "m1", "quality");
  assert(ok.error === null, `con un segundo admin debía permitirse: ${ok.error}`);
});

check("9. No se puede desactivar al último administrador activo", () => {
  const members = [membership("m1", "admin", "active"), membership("m2", "quality", "active")];
  const r = validateDeactivation(members, "m1");
  assert(r.error !== null, "debía bloquear desactivar al único admin");

  const withSecond = [
    membership("m1", "admin", "active"),
    membership("m2", "admin", "active"),
  ];
  const ok = validateDeactivation(withSecond, "m1");
  assert(ok.error === null, `con un segundo admin debía permitirse desactivar: ${ok.error}`);
});

check("Extra: desactivar un no-admin nunca lo bloquea el guard de último admin", () => {
  const members = [membership("m1", "admin", "active"), membership("m2", "quality", "active")];
  assert(
    wouldRemoveLastActiveAdmin(members, "m2", { status: "suspended" }) === false,
    "desactivar a un miembro quality no debía disparar el guard de admin"
  );
});

check("10. Cambio de rol valida roles permitidos", () => {
  const members = [membership("m1", "admin", "active"), membership("m2", "quality", "active")];
  const invalid = validateRoleChange(members, "m2", "superadmin");
  assert(invalid.error !== null, "un rol inexistente debía rechazarse");
  assert(isTeamRole("admin") && isTeamRole("quality") && isTeamRole("consultant"), "los 3 roles reales debían ser válidos");
  assert(!isTeamRole("viewer") && !isTeamRole("user"), "roles no definidos en el sistema no debían aceptarse");
});

console.log("\nTrazaloop · equipo: no aceptar organization_id desde cliente\n");

check("11. No se acepta organization_id desde cliente", () => {
  const maliciousInput = {
    email: "nuevo@empresa.dev",
    roleCode: "quality" as const,
    now,
    // Intento de colar un campo que la función ni siquiera declara en su tipo:
    organization_id: "org-ajena",
  } as { email: string; roleCode: "quality"; now: Date } & { organization_id: string };

  const payload = buildInvitationInsertPayload("org-activa-real", maliciousInput);
  assert(
    payload.organization_id === "org-activa-real",
    `organization_id debía ser 'org-activa-real', fue '${payload.organization_id}'`
  );
});

check("Extra: canAssignRole respeta el rango (no invitar con rol superior al propio)", () => {
  assert(canAssignRole("admin", "admin") === true, "admin debía poder asignar admin");
  assert(canAssignRole("admin", "quality") === true, "admin debía poder asignar quality");
  assert(canAssignRole("quality", "admin") === false, "quality no debía poder asignar admin");
});

check("Extra: isExpired es determinista con `now` explícito", () => {
  assert(isExpired("2026-01-01T00:00:00Z", now) === true, "fecha pasada debía marcar expirado");
  assert(isExpired("2027-01-01T00:00:00Z", now) === false, "fecha futura no debía marcar expirado");
});

check("Extra: checklist de equipo en Implementación (Parte 9)", () => {
  assert(resolveTeamChecklistStatus(1, 0) === "pendiente", "solo el propio usuario → pendiente");
  assert(resolveTeamChecklistStatus(2, 0) === "completo", "más de un miembro → completo");
  assert(resolveTeamChecklistStatus(1, 1) === "completo", "con invitación pendiente → completo");
});

if (failures > 0) {
  console.error(`\nResultado: ${failures} en rojo.`);
  process.exit(1);
}
console.log("\nResultado: todo en verde.");
