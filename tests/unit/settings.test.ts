/**
 * Trazaloop · Sprint 8.3 · Tests de la lógica PURA de configuración de
 * empresa y perfil (sin BD). Espejo de organizations_update
 * (is_org_admin) y profiles_update (id = auth.uid()), ambas políticas ya
 * existentes desde el Sprint 1.
 *
 * Correr: npm run test:settings
 */
import {
  canEditCompany,
  canEditProfile,
  validateCompanySettings,
  buildCompanySettingsUpdatePayload,
  validateProfileSettings,
  buildProfileUpdatePayload,
  isValidWebsite,
  type CompanySettingsInput,
  type ProfileSettingsInput,
} from "../../lib/domain/settings";

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

console.log("Trazaloop · configuración: permisos\n");

check("1. Admin puede editar datos de empresa", () => {
  assert(canEditCompany("admin") === true, "admin debía poder editar la empresa");
});

check("2. Consultant no puede editar datos de empresa", () => {
  assert(canEditCompany("consultant") === false, "consultant no debía poder editar la empresa");
});

check("3. Quality no puede editar datos de empresa (el sistema no lo permite todavía)", () => {
  assert(canEditCompany("quality") === false, "quality no debía poder editar la empresa");
});

check("4. Usuario no miembro no puede editar empresa", () => {
  assert(canEditCompany(null) === false, "sin rol (no miembro) no debía poder editar la empresa");
  assert(canEditCompany(undefined) === false, "rol indefinido no debía poder editar la empresa");
});

check("6. Usuario puede editar su propio perfil", () => {
  assert(canEditProfile("user-1", "user-1") === true, "un usuario debía poder editar su propio perfil");
});

check("7. Usuario no puede editar perfil de otro usuario", () => {
  assert(canEditProfile("user-1", "user-2") === false, "un usuario no debía poder editar el perfil de otro");
});

console.log("\nTrazaloop · configuración: validación de datos de empresa\n");

const validCompany: CompanySettingsInput = {
  name: "Recicladora Real S.A.S.",
  website: "",
  contactEmail: "",
  taxId: "",
};

check("9. tax_id/NIT vacío se permite si la empresa aún no lo tiene", () => {
  const r = validateCompanySettings({ ...validCompany, taxId: "" });
  assert(r.error === null, `un NIT vacío no debía rechazarse: ${r.error}`);
  const r2 = validateCompanySettings({ ...validCompany, taxId: undefined });
  assert(r2.error === null, `un NIT ausente no debía rechazarse: ${r2.error}`);
});

check("10. website inválido se rechaza si se informa (vacío se permite)", () => {
  const invalid = validateCompanySettings({ ...validCompany, website: "no es una url" });
  assert(invalid.error !== null, "un sitio web inválido debía rechazarse");

  const empty = validateCompanySettings({ ...validCompany, website: "" });
  assert(empty.error === null, `un sitio web vacío (opcional) no debía rechazarse: ${empty.error}`);

  assert(isValidWebsite("empresa.com"), "un dominio simple debía ser válido");
  assert(isValidWebsite("https://www.empresa.com.co/ruta"), "una URL completa debía ser válida");
  assert(!isValidWebsite("no es una url"), "un texto libre no debía ser un sitio web válido");
});

check("11. contact_email inválido se rechaza si se informa (vacío se permite)", () => {
  const invalid = validateCompanySettings({ ...validCompany, contactEmail: "no-es-un-correo" });
  assert(invalid.error !== null, "un correo de contacto inválido debía rechazarse");

  const empty = validateCompanySettings({ ...validCompany, contactEmail: "" });
  assert(empty.error === null, `un correo de contacto vacío (opcional) no debía rechazarse: ${empty.error}`);

  const valid = validateCompanySettings({ ...validCompany, contactEmail: "contacto@empresa.dev" });
  assert(valid.error === null, `un correo de contacto válido no debía rechazarse: ${valid.error}`);
});

check("12. Nombre de empresa vacío se rechaza", () => {
  const r = validateCompanySettings({ ...validCompany, name: "" });
  assert(r.error !== null, "un nombre de empresa vacío debía rechazarse");
  const r2 = validateCompanySettings({ ...validCompany, name: "   " });
  assert(r2.error !== null, "un nombre de empresa solo con espacios debía rechazarse");
});

check("5. No se acepta organization_id desde cliente (el payload nunca lo declara)", () => {
  // El tipo de entrada ni siquiera tiene un campo organization_id/id; aunque
  // el llamador intente colar uno (por ejemplo manipulando el FormData), el
  // payload construido no tiene forma de transportarlo: el UPDATE real
  // siempre se acota con .eq("id", <empresa activa validada en servidor>)
  // en server/actions/settings.ts, nunca con nada de este payload.
  const maliciousInput = {
    ...validCompany,
    organization_id: "org-ajena",
  } as CompanySettingsInput & { organization_id: string };
  const payload = buildCompanySettingsUpdatePayload(maliciousInput);
  assert(
    !("organization_id" in payload) && !("id" in payload),
    "el payload de empresa no debía tener ningún campo de identidad de organización"
  );
});

console.log("\nTrazaloop · configuración: validación de perfil\n");

check("Nombre completo vacío se rechaza", () => {
  const r = validateProfileSettings({ fullName: "" });
  assert(r.error !== null, "un nombre completo vacío debía rechazarse");
});

check("Perfil válido no genera error", () => {
  const input: ProfileSettingsInput = { fullName: "Ana Admin", phone: "3000000000", position: "Gerente" };
  const r = validateProfileSettings(input);
  assert(r.error === null, `un perfil válido no debía rechazarse: ${r.error}`);
});

check("8. Email de auth no se modifica desde perfil (el payload nunca lo declara)", () => {
  const maliciousInput = {
    fullName: "Ana Admin",
    email: "otro@correo.dev",
  } as ProfileSettingsInput & { email: string };
  const payload = buildProfileUpdatePayload(maliciousInput);
  assert(!("email" in payload), "el payload de perfil no debía incluir nunca el campo email");
  assert(
    !("id" in payload) && !("user_id" in payload),
    "el payload de perfil no debía tener ningún campo de identidad de usuario"
  );
});

if (failures > 0) {
  console.error(`\nResultado: ${failures} en rojo.`);
  process.exit(1);
}
console.log("\nResultado: todo en verde.");
