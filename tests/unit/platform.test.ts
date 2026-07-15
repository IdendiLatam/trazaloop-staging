/**
 * Trazaloop · Sprint 8.4 · Tests de la lógica PURA de administración de
 * plataforma (sin BD). Espejo de platform_staff, is_platform_superadmin y
 * el guarda nuevo de create_organization (0040/0042).
 *
 * Correr: npm run test:platform
 */
import {
  canAccessPlatformConsole,
  canCreatePlatformOrganization,
  canManagePlatformStaff,
  resolveOrgCreationEligibility,
  resolveSelectOrgDisplay,
  toSafeOrgCreationError,
  validatePlatformOrgDraft,
  buildPlatformOrgPayload,
  describePlatformOrgOutcome,
  isPlatformRole,
  PLATFORM_ROLES,
  PLATFORM_AND_TEAM_ROLES_ARE_DISJOINT,
  ALREADY_HAS_ORG_MESSAGE,
  HAS_PENDING_INVITATION_MESSAGE,
  GENERIC_ORG_CREATION_ERROR,
  type PlatformOrgDraftInput,
} from "../../lib/domain/platform";
import { TEAM_ROLES, isTeamRole } from "../../lib/domain/team";
import { TRAZABILIDAD_GROUP, TRAZADOCS_GROUP, SISTEMA_GROUP, PLATFORM_GROUP } from "../../components/layout/nav";

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

console.log("Trazaloop · plataforma: navegación y accesos\n");

check("1. Usuario normal no ve navegación Plataforma", () => {
  assert(canAccessPlatformConsole(false) === false, "un usuario normal no debía ver Plataforma");
});

check("2. Usuario platform_staff activo ve navegación Plataforma", () => {
  assert(canAccessPlatformConsole(true) === true, "un platform_staff activo debía ver Plataforma");
});

check("3. Support no puede crear/administrar platform_staff", () => {
  assert(canManagePlatformStaff("support") === false, "support no debía poder administrar platform_staff");
  assert(canManagePlatformStaff("superadmin") === true, "superadmin sí debía poder administrar platform_staff");
  assert(canManagePlatformStaff(null) === false, "sin rol de plataforma no debía poder administrar platform_staff");
});

check("4. Solo superadmin puede crear empresa desde consola plataforma", () => {
  assert(canCreatePlatformOrganization("superadmin") === true, "superadmin debía poder crear empresas");
  assert(canCreatePlatformOrganization("support") === false, "support no debía poder crear empresas");
  assert(canCreatePlatformOrganization(null) === false, "sin rol de plataforma no debía poder crear empresas");
});

console.log("\nTrazaloop · plataforma: restricción de creación de empresa normal\n");

check("5. Usuario normal con empresa no puede crear segunda empresa", () => {
  const r = resolveOrgCreationEligibility({
    isPlatformSuperadmin: false,
    hasActiveMembership: true,
    hasPendingInvitation: false,
  });
  assert(r.canCreate === false, "un usuario con membership activa no debía poder crear otra empresa");
  assert(r.reason !== null, "debía traer un mensaje claro");
});

check("6. Usuario sin empresa ni invitación puede crear empresa normal", () => {
  const r = resolveOrgCreationEligibility({
    isPlatformSuperadmin: false,
    hasActiveMembership: false,
    hasPendingInvitation: false,
  });
  assert(r.canCreate === true, `debía poder crear empresa: ${r.reason}`);
});

check("7. Usuario con invitación pendiente no va a create-org", () => {
  const r = resolveOrgCreationEligibility({
    isPlatformSuperadmin: false,
    hasActiveMembership: false,
    hasPendingInvitation: true,
  });
  assert(r.canCreate === false, "un usuario con invitación pendiente no debía poder crear empresa");
});

check("Extra: superadmin siempre puede crear empresa (Caso D), aunque ya tenga membership", () => {
  const r = resolveOrgCreationEligibility({
    isPlatformSuperadmin: true,
    hasActiveMembership: true,
    hasPendingInvitation: true,
  });
  assert(r.canCreate === true, `superadmin nunca debía bloquearse: ${r.reason}`);
});

console.log("\nTrazaloop · plataforma: separación de roles (nunca se mezclan)\n");

check("8. Roles visibles de empresa no incluyen superadmin", () => {
  assert(!(TEAM_ROLES as readonly string[]).includes("superadmin"), "TEAM_ROLES no debía incluir superadmin");
  assert(!(TEAM_ROLES as readonly string[]).includes("support"), "TEAM_ROLES no debía incluir support");
});

check("9. Invitación de empresa solo permite admin, quality (Supervisor), consultant", () => {
  assert(isTeamRole("admin") && isTeamRole("quality") && isTeamRole("consultant"), "los 3 roles reales de empresa debían ser válidos");
  assert(!isTeamRole("superadmin") && !isTeamRole("support"), "los roles de plataforma nunca debían ser un rol de empresa válido");
});

check("10. Superadmin no aparece como role_code de membership", () => {
  assert(!isTeamRole("superadmin"), "superadmin no debía ser un role_code de membership válido");
});

check("11. Platform_staff separado de memberships (conjuntos de roles disjuntos)", () => {
  assert(PLATFORM_AND_TEAM_ROLES_ARE_DISJOINT === true, "PLATFORM_ROLES y TEAM_ROLES no debían compartir ningún código");
  assert(isPlatformRole("superadmin") && isPlatformRole("support"), "los roles de plataforma debían reconocerse como tales");
  assert(!isPlatformRole("admin") && !isPlatformRole("quality") && !isPlatformRole("consultant"), "ningún rol de empresa debía colarse como rol de plataforma");
  assert(PLATFORM_ROLES.length === 2, "solo debía haber 2 roles de plataforma: superadmin y support");
});

console.log("\nTrazaloop · plataforma: crear empresa desde consola\n");

const validDraft: PlatformOrgDraftInput = {
  name: "Cliente Real S.A.S.",
  adminEmail: "admin@clientereal.dev",
};

check("Nombre de empresa vacío se rechaza", () => {
  const r = validatePlatformOrgDraft({ ...validDraft, name: "" });
  assert(r.error !== null, "un nombre vacío debía rechazarse");
});

check("Correo del administrador inicial inválido se rechaza", () => {
  const r = validatePlatformOrgDraft({ ...validDraft, adminEmail: "no-es-un-correo" });
  assert(r.error !== null, "un correo de administrador inválido debía rechazarse");
});

check("12. createPlatformOrganizationAction no acepta organization_id desde cliente", () => {
  const maliciousInput = {
    ...validDraft,
    organization_id: "org-ajena",
  } as PlatformOrgDraftInput & { organization_id: string };
  const payload = buildPlatformOrgPayload(maliciousInput);
  assert(
    !("organization_id" in payload) && !("id" in payload),
    "el payload no debía tener ningún campo de identidad de organización: la RPC la crea y devuelve su id"
  );
});

check("13. Si el administrador inicial ya existe, el resultado describe una vinculación", () => {
  const msg = describePlatformOrgOutcome(true);
  assert(msg.toLowerCase().includes("vinculado"), `el mensaje debía describir una vinculación: ${msg}`);
});

check("14. Si el administrador inicial no existe, el resultado describe una invitación pendiente", () => {
  const msg = describePlatformOrgOutcome(false);
  assert(msg.toLowerCase().includes("invitación"), `el mensaje debía describir una invitación: ${msg}`);
});

console.log("\nTrazaloop · corrección post Sprint 8.4: /platform sin depender de empresa activa\n");

check("1. platform_staff sin empresa activa puede entrar a /platform", () => {
  // canAccessPlatformConsole ni siquiera RECIBE información de empresa —
  // su firma es (isPlatformStaffActive: boolean) => boolean: no hay forma
  // de que el acceso a /platform dependa de una organización activa.
  assert(canAccessPlatformConsole(true) === true, "platform_staff activo debía poder entrar a /platform");
  assert(canAccessPlatformConsole.length === 1, "canAccessPlatformConsole no debía aceptar ningún parámetro de organización");
});

check("2. platform_staff sin empresa no es obligado a crear empresa (siempre ve el enlace a /platform)", () => {
  const withNothing = resolveSelectOrgDisplay({
    hasOrganizations: false,
    hasInvitations: false,
    isPlatformStaff: true,
  });
  assert(withNothing.showPlatformLink === true, "un platform_staff sin nada más debía ver el enlace a /platform");

  const withOrgAndInvite = resolveSelectOrgDisplay({
    hasOrganizations: true,
    hasInvitations: true,
    isPlatformStaff: true,
  });
  assert(
    withOrgAndInvite.showPlatformLink === true,
    "el enlace a /platform debía verse sin importar el estado de organizaciones/invitaciones"
  );
});

console.log("\nTrazaloop · corrección post Sprint 8.4: /select-org sin formulario indebido\n");

check("3. Usuario normal con empresa no ve el formulario de Crear empresa", () => {
  const r = resolveSelectOrgDisplay({ hasOrganizations: true, hasInvitations: false, isPlatformStaff: false });
  assert(r.showCreateForm === false, "un usuario con empresa no debía ver el formulario de crear empresa");
});

check("4. Usuario con invitación pendiente no ve el formulario de Crear empresa", () => {
  const r = resolveSelectOrgDisplay({ hasOrganizations: false, hasInvitations: true, isPlatformStaff: false });
  assert(r.showCreateForm === false, "un usuario con invitación pendiente no debía ver el formulario de crear empresa");
});

check("5. Usuario sin empresa ni invitación sí ve el formulario de Crear empresa", () => {
  const r = resolveSelectOrgDisplay({ hasOrganizations: false, hasInvitations: false, isPlatformStaff: false });
  assert(r.showCreateForm === true, "un usuario sin nada debía ver el formulario de crear empresa");
});

check("6. Usuario con empresa recibe el mensaje claro de que no puede crear otra", () => {
  const r = resolveOrgCreationEligibility({
    isPlatformSuperadmin: false,
    hasActiveMembership: true,
    hasPendingInvitation: false,
  });
  assert(r.reason === ALREADY_HAS_ORG_MESSAGE, `el mensaje debía ser el texto de negocio exacto: ${r.reason}`);
});

check("7. Usuario con invitación pendiente recibe el mensaje claro correspondiente", () => {
  const r = resolveOrgCreationEligibility({
    isPlatformSuperadmin: false,
    hasActiveMembership: false,
    hasPendingInvitation: true,
  });
  assert(r.reason === HAS_PENDING_INVITATION_MESSAGE, `el mensaje debía ser el texto de negocio exacto: ${r.reason}`);
});

console.log("\nTrazaloop · corrección post Sprint 8.4: createOrganizationAction expone errores seguros\n");

check("8. createOrganizationAction expone los 2 errores de negocio conocidos tal cual, y nada más", () => {
  assert(
    toSafeOrgCreationError(ALREADY_HAS_ORG_MESSAGE) === ALREADY_HAS_ORG_MESSAGE,
    "el mensaje de 'ya tiene empresa' debía pasar tal cual (lista blanca)"
  );
  assert(
    toSafeOrgCreationError(HAS_PENDING_INVITATION_MESSAGE) === HAS_PENDING_INVITATION_MESSAGE,
    "el mensaje de 'invitación pendiente' debía pasar tal cual (lista blanca)"
  );
  // Cualquier otro texto (técnico, interno, desconocido) NUNCA se reenvía
  // tal cual: cae al mensaje genérico. Es una lista BLANCA, no una lista
  // negra — la seguridad no depende de adivinar qué texto es "sensible".
  assert(
    toSafeOrgCreationError("duplicate key value violates unique constraint \"organizations_pkey\"") ===
      GENERIC_ORG_CREATION_ERROR,
    "un error técnico de base de datos NUNCA debía reenviarse tal cual al usuario"
  );
  assert(
    toSafeOrgCreationError(undefined) === GENERIC_ORG_CREATION_ERROR,
    "sin mensaje, debía caer al genérico"
  );
  assert(
    toSafeOrgCreationError(null) === GENERIC_ORG_CREATION_ERROR,
    "con mensaje null, debía caer al genérico"
  );
});

console.log("\nTrazaloop · corrección post Sprint 8.4: separación de roles sigue intacta\n");

check("9. Roles de plataforma siguen separados de memberships tras la corrección", () => {
  assert(PLATFORM_AND_TEAM_ROLES_ARE_DISJOINT === true, "PLATFORM_ROLES y TEAM_ROLES seguían debiendo ser disjuntos");
  assert(!(TEAM_ROLES as readonly string[]).some((r) => (PLATFORM_ROLES as readonly string[]).includes(r)), "ningún rol de plataforma debía colarse en TEAM_ROLES");
});

check("10. Superadmin sigue sin aparecer como role_code de membership", () => {
  assert(!isTeamRole("superadmin"), "superadmin seguía sin ser un role_code de membership válido");
  assert(!isTeamRole("support"), "support seguía sin ser un role_code de membership válido");
});

console.log("\nTrazaloop · Sprint 9.2: menú lateral agrupado\n");

check("1. Usuario normal ve los grupos Trazabilidad, TrazaDocs y Sistema", () => {
  assert(TRAZABILIDAD_GROUP.title === "Trazabilidad", "el grupo Trazabilidad debía existir con ese título exacto");
  assert(TRAZADOCS_GROUP.title === "TrazaDocs", "el grupo TrazaDocs debía existir con ese título exacto");
  assert(SISTEMA_GROUP.title === "Sistema", "el grupo Sistema debía existir con ese título exacto");
  assert(
    TRAZABILIDAD_GROUP.items.some((i) => i.href === "/evidences") &&
      TRAZABILIDAD_GROUP.items.some((i) => i.href === "/implementation"),
    "Trazabilidad debía incluir Evidencias e Implementación, entre otras"
  );
  assert(
    TRAZADOCS_GROUP.items.some((i) => i.href === "/trazadocs"),
    "TrazaDocs debía incluir el listado de documentos de empresa"
  );
  assert(
    SISTEMA_GROUP.items.some((i) => i.href === "/team") && SISTEMA_GROUP.items.some((i) => i.href === "/settings/company"),
    "Sistema debía incluir Equipo y Datos de empresa"
  );
});

check("2. Usuario normal no ve el grupo Plataforma", () => {
  // AppNav solo agrega PLATFORM_GROUP cuando showPlatform es true — un
  // usuario normal nunca calcula ese flag en true (is_platform_staff()
  // resuelto en el layout del shell). Se deja constancia de la garantía
  // estructural: PLATFORM_GROUP nunca aparece entre los 4 grupos base.
  const baseGroups = [TRAZABILIDAD_GROUP, TRAZADOCS_GROUP, SISTEMA_GROUP];
  assert(
    !baseGroups.some((g) => g.title === "Plataforma"),
    "el grupo Plataforma no debía estar entre los grupos base siempre visibles"
  );
});

check("3. Platform_staff ve el grupo Plataforma, con administración global de TrazaDocs aparte", () => {
  assert(PLATFORM_GROUP.title === "Plataforma", "el grupo Plataforma debía existir con ese título exacto");
  assert(
    PLATFORM_GROUP.items.some((i) => i.href === "/platform/trazadocs"),
    "Plataforma debía incluir la administración global de estructuras TrazaDocs"
  );
  // La administración global NUNCA vive en el grupo empresarial TrazaDocs.
  assert(
    !TRAZADOCS_GROUP.items.some((i) => i.href === "/platform/trazadocs"),
    "la administración global de estructuras/hints no debía mezclarse en el grupo TrazaDocs de empresa"
  );
});

check("4. Roles de plataforma no aparecen como roles de empresa (referencia cruzada con el menú)", () => {
  assert(PLATFORM_AND_TEAM_ROLES_ARE_DISJOINT === true, "PLATFORM_ROLES y TEAM_ROLES seguían debiendo ser disjuntos");
});

if (failures > 0) {
  console.error(`\nResultado: ${failures} en rojo.`);
  process.exit(1);
}
console.log("\nResultado: todo en verde.");
