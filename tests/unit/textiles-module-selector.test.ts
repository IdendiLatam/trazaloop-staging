/**
 * Trazaloop · Sprint T9E (Textil) · Regresión del selector principal de
 * módulos (defecto 4.3): la tarjeta de Trazaloop Textiles se resuelve por
 * flag global + habilitación de la organización — sin depender de CPR y
 * sin estados "Próximamente" hardcodeados cuando está habilitado.
 *
 * Correr: npx tsx tests/unit/textiles-module-selector.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import {
  resolveTextilesAvailability,
  isTextilesFlagEnabled,
  organizationHasTextiles,
} from "../../lib/modules/textiles";

let passed = 0;
let failed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✔ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✘ ${name}: ${(err as Error).message}`);
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

const ENABLED = [{ code: "textiles", enabled: true }];
const DISABLED_ROW = [{ code: "textiles", enabled: false }];
const CPR_ONLY = [
  { code: "core", enabled: true },
  { code: "traceability_6632", enabled: true },
];

console.log("Trazaloop · T9E: disponibilidad de la tarjeta Textiles\n");

check("1. Flag global desactivado → no disponible, con o sin organización", () => {
  assert(
    resolveTextilesAvailability({ flagRaw: undefined, hasActiveOrg: true, modules: ENABLED }) ===
      "flag_disabled",
    "flag ausente debía dar flag_disabled"
  );
  assert(
    resolveTextilesAvailability({ flagRaw: "false", hasActiveOrg: false, modules: [] }) ===
      "flag_disabled",
    "flag 'false' debía dar flag_disabled"
  );
});

check("2. Flag activo + organización habilitada → tarjeta ACTIVA", () => {
  assert(
    resolveTextilesAvailability({ flagRaw: "true", hasActiveOrg: true, modules: ENABLED }) ===
      "available",
    "flag + fila habilitada debía dar available"
  );
  assert(
    resolveTextilesAvailability({ flagRaw: "1", hasActiveOrg: true, modules: ENABLED }) ===
      "available",
    "'1' también enciende el flag"
  );
});

check("3. Flag activo + organización sin habilitación → bloqueada con explicación", () => {
  assert(
    resolveTextilesAvailability({ flagRaw: "true", hasActiveOrg: true, modules: [] }) ===
      "org_not_enabled",
    "sin fila debía dar org_not_enabled"
  );
  assert(
    resolveTextilesAvailability({ flagRaw: "true", hasActiveOrg: true, modules: DISABLED_ROW }) ===
      "org_not_enabled",
    "fila deshabilitada debía dar org_not_enabled"
  );
});

check("4. Flag activo sin organización activa → comportamiento seguro (elegir empresa)", () => {
  assert(
    resolveTextilesAvailability({ flagRaw: "true", hasActiveOrg: false, modules: [] }) ===
      "no_active_org",
    "sin organización activa debía dar no_active_org"
  );
});

check("5. Los módulos CPR jamás habilitan Textiles (sin dependencia funcional de CPR)", () => {
  assert(
    resolveTextilesAvailability({ flagRaw: "true", hasActiveOrg: true, modules: CPR_ONLY }) ===
      "org_not_enabled",
    "módulos CPR no habilitan Textiles"
  );
  assert(!organizationHasTextiles(CPR_ONLY), "organizationHasTextiles exige module_code 'textiles'");
});

check("6. La regla combinada del guard y la del selector no divergen", () => {
  for (const flag of ["true", "1", "false", undefined]) {
    for (const modules of [ENABLED, DISABLED_ROW, [], CPR_ONLY]) {
      const available =
        resolveTextilesAvailability({ flagRaw: flag, hasActiveOrg: true, modules }) === "available";
      const guard = isTextilesFlagEnabled(flag) && organizationHasTextiles(modules);
      assert(
        available === guard,
        `divergencia selector/guard con flag=${String(flag)} modules=${JSON.stringify(modules)}`
      );
    }
  }
});

console.log("\nTrazaloop · T9E: invariantes de fuente del portal /modules\n");

const portal = read("app/(app)/modules/page.tsx");

// T9F: el selector se generaliza a la REGLA CANÓNICA por módulo. La
// disponibilidad de Textiles (flag + organization_modules) la resuelve la capa
// server-only lib/db/module-access.ts (getActiveOrgModuleStatuses →
// resolveModuleAccessForOrg → isKillSwitchActive/isTextilesModuleEnabled).
const moduleAccess = read("lib/db/module-access.ts");
const catalog = read("lib/modules/catalog.ts");
const messages = read("lib/modules/messages.ts");

check("7. El portal resuelve la tarjeta por flag + organization_modules en servidor", () => {
  assert(portal.includes("getActiveOrgModuleStatuses"), "el portal debía resolver el estado en servidor");
  assert(moduleAccess.includes("isTextilesModuleEnabled()"), "la capa server-only debía consultar el flag");
  assert(moduleAccess.includes("organization_modules"), "debía consultar organization_modules bajo RLS");
  assert(catalog.includes('key: "textiles"'), "el catálogo debía conservar la clave DL-01");
});

check("8. Cuando está disponible, la tarjeta es un enlace activo a /textiles", () => {
  assert(portal.includes("isEnterableState"), "un estado enterable debía producir un enlace");
  assert(portal.includes("TEXTILES_HOME_PATH"), "la tarjeta activa debía enlazar la home del módulo");
  assert(portal.includes("Entrar"), "la tarjeta activa debía decir Entrar");
});

check("9. Estados bloqueados con explicación: sin organización y sin habilitación", () => {
  assert(portal.includes("/select-org"), "sin organización debía llevar a seleccionar empresa");
  // Cada bloqueo real (sin asignación / deshabilitado / demo vencido) tiene su
  // propia explicación — jamás un 'Próximamente' engañoso.
  assert(
    messages.includes("not_assigned") && messages.includes("disabled") && messages.includes("demo_expired"),
    "cada bloqueo debía tener su explicación"
  );
  assert(messages.includes("Prueba finalizada"), "el demo vencido no debía confundirse con 'Deshabilitado'");
});

check("10. Sin 'Próximamente' engañoso para bloqueos reales; solo para módulos no funcionales", () => {
  // 'Próximamente' es la etiqueta EXCLUSIVA del estado coming_soon.
  assert(messages.includes('coming_soon: "Próximamente"'), "'Próximamente' solo etiqueta coming_soon");
  // El demo vencido, deshabilitado y sin asignación tienen etiquetas propias.
  assert(
    messages.includes('demo_expired: "Prueba finalizada"') &&
      messages.includes('disabled: "Módulo deshabilitado"') &&
      messages.includes('not_assigned: "Sin asignar"'),
    "los bloqueos reales no deben rotularse 'Próximamente'"
  );
});

check("11. La tarjeta del módulo se llama Trazaloop Textiles (catálogo canónico)", () => {
  assert(catalog.includes("Trazaloop Textiles"), "el catálogo debía usar el nombre del módulo");
});

if (failed > 0) {
  console.error(`\nResultado: ${passed} pasaron, ${failed} fallaron.`);
  process.exit(1);
}
console.log(`\nResultado: ${passed} pasaron, 0 fallaron. Todo verde.`);
