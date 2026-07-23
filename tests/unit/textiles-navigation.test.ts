/**
 * Trazaloop · Sprint T9E (Textil) · Regresión de navegación y shell
 * (defectos 4.1 y 4.2): dentro de /textiles la navegación y la identidad
 * son del módulo Textil — jamás de CPR — y CPR conserva las suyas.
 *
 * Correr: npx tsx tests/unit/textiles-navigation.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import {
  CPR_SHELL_MODULE,
  TEXTILES_SHELL_MODULE,
  SHELL_MODULES,
  SISTEMA_GROUP,
  PLATFORM_GROUP,
  resolveShellModuleForPath,
  isShellNavLinkActive,
} from "../../lib/modules/registry";
import { TEXTILES_HOME_PATH } from "../../lib/modules/textiles";

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

console.log("Trazaloop · T9E: navegación contextual por módulo\n");

check("1. /textiles y todas sus subrutas resuelven el módulo Textil; el resto CPR", () => {
  assert(resolveShellModuleForPath("/textiles").key === "textiles", "/textiles debía ser Textil");
  assert(
    resolveShellModuleForPath("/textiles/catalogs/fibers").key === "textiles",
    "las subrutas debían ser Textil"
  );
  assert(resolveShellModuleForPath("/dashboard").key === "cpr", "/dashboard debía ser CPR");
  assert(resolveShellModuleForPath("/trazadocs").key === "cpr", "/trazadocs debía ser CPR");
  assert(resolveShellModuleForPath("/catalog").key === "cpr", "/catalog (CPR) debía ser CPR");
  assert(resolveShellModuleForPath("").key === "cpr", "ruta vacía cae en CPR (módulo por defecto)");
  assert(resolveShellModuleForPath(null).key === "cpr", "null cae en CPR sin lanzar");
});

check("2. La coincidencia es por prefijo estricto, nunca por subcadena", () => {
  assert(resolveShellModuleForPath("/textiles-x").key === "cpr", "'/textiles-x' no es el módulo Textil");
  assert(resolveShellModuleForPath("/textilesx/algo").key === "cpr", "'/textilesx' no es el módulo Textil");
});

check("3. El menú funcional Textil no contiene ninguna ruta CPR", () => {
  const textileHrefs = [
    ...TEXTILES_SHELL_MODULE.topLevel,
    ...TEXTILES_SHELL_MODULE.groups.flatMap((g) => g.items),
  ].map((i) => i.href);
  assert(textileHrefs.length >= 9, "el menú Textil debía tener al menos 9 entradas");
  for (const href of textileHrefs) {
    assert(
      href === "/textiles" || href.startsWith("/textiles/"),
      `la entrada ${href} del menú Textil sale del módulo`
    );
  }
});

check("4. El menú Textil cubre las secciones reales del módulo", () => {
  const textileHrefs = [
    ...TEXTILES_SHELL_MODULE.topLevel,
    ...TEXTILES_SHELL_MODULE.groups.flatMap((g) => g.items),
  ].map((i) => i.href);
  for (const required of [
    "/textiles",
    "/textiles/diagnostic",
    "/textiles/catalogs",
    "/textiles/products",
    "/textiles/evidences",
    "/textiles/traceability",
    "/textiles/circularity",
    "/textiles/trazadocs",
    "/textiles/passports",
  ]) {
    assert(textileHrefs.includes(required), `falta ${required} en el menú Textil`);
  }
});

check("5. CPR conserva su navegación histórica intacta", () => {
  const cprHrefs = [
    ...CPR_SHELL_MODULE.topLevel,
    ...CPR_SHELL_MODULE.groups.flatMap((g) => g.items),
  ].map((i) => i.href);
  for (const required of [
    "/dashboard",
    "/guided-flow",
    "/diagnostic",
    "/catalog",
    "/evidences",
    "/traceability",
    "/recycled-content",
    "/audit-support",
    "/implementation",
    "/imports",
    "/trazadocs",
    "/trazadocs/new",
    "/trazadocs/master",
  ]) {
    assert(cprHrefs.includes(required), `falta ${required} en el menú CPR`);
  }
  for (const href of cprHrefs) {
    assert(!href.startsWith("/textiles"), `el menú CPR no debía contener rutas Textiles (${href})`);
  }
});

check("6. Identidad del encabezado por módulo: CPR = normas, Textiles = su nombre", () => {
  assert(
    CPR_SHELL_MODULE.headerBadge === "NTC 6632 · UNE-EN 15343",
    "CPR debía conservar sus normas en el encabezado"
  );
  assert(
    TEXTILES_SHELL_MODULE.headerBadge === "Trazaloop Textiles",
    "Textiles debía mostrar su propio nombre"
  );
  assert(
    !TEXTILES_SHELL_MODULE.headerBadge.includes("NTC 6632"),
    "el badge Textil jamás muestra normas CPR"
  );
});

check("7. El shell ya no hardcodea el badge de normas: usa el registro central", () => {
  const shell = read("app/(app)/(shell)/layout.tsx");
  assert(!shell.includes("NTC 6632"), "el layout del shell no debía hardcodear NTC 6632");
  assert(shell.includes("ModuleHeaderBadge"), "el shell debía usar ModuleHeaderBadge");
  const badge = read("components/layout/module-badge.tsx");
  assert(badge.includes("resolveShellModuleForPath"), "el badge debía resolver el módulo por ruta");
  const nav = read("components/layout/nav.tsx");
  assert(nav.includes("resolveShellModuleForPath"), "la navegación debía resolver el módulo por ruta");
  assert(nav.includes("isShellNavLinkActive"), "la navegación debía marcar la opción activa");
  assert(nav.includes('aria-current={active ? "page" : undefined}'), "la opción activa debía marcarse con aria-current");
});

check("8. El layout de /textiles muestra la identidad Textil, sin 'en preparación' ni normas CPR", () => {
  const layout = read("app/(app)/(shell)/textiles/layout.tsx");
  // Solo el código renderizado cuenta: los comentarios pueden narrar la historia.
  const layoutCode = layout
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
  assert(layout.includes("TEXTILES_SHELL_MODULE"), "el layout debía usar la metadata central del módulo");
  assert(!layoutCode.includes("NTC 6632"), "el layout Textil no debía mostrar normas CPR");
  assert(!layoutCode.includes("en preparación"), "el módulo ya no está 'en preparación'");
  assert(layout.includes("requireTextilesModule"), "el guard del módulo debía conservarse");
});

check("9. La marca de opción activa distingue exacto vs. prefijo", () => {
  const home = TEXTILES_SHELL_MODULE.topLevel[0];
  assert(home.exact === true, "el inicio Textil debía marcarse solo con coincidencia exacta");
  assert(isShellNavLinkActive(home, "/textiles"), "inicio activo en /textiles");
  assert(!isShellNavLinkActive(home, "/textiles/catalogs"), "inicio NO activo en subrutas");
  const catalogs = { label: "Catálogos", href: "/textiles/catalogs" };
  assert(isShellNavLinkActive(catalogs, "/textiles/catalogs"), "catálogos activo en su ruta");
  assert(isShellNavLinkActive(catalogs, "/textiles/catalogs/fibers"), "catálogos activo en subrutas");
  assert(!isShellNavLinkActive(catalogs, "/textiles"), "catálogos NO activo en el inicio");
});

check("10. Los grupos transversales viven fuera de los módulos y sin rutas de módulo", () => {
  for (const item of [...SISTEMA_GROUP.items, ...PLATFORM_GROUP.items]) {
    assert(!item.href.startsWith("/textiles"), `Sistema/Plataforma no lleva rutas Textiles (${item.href})`);
  }
  assert(
    SISTEMA_GROUP.items.some((i) => i.href === "/support"),
    "el Centro de soporte sigue siendo transversal"
  );
});

check("11. La ruta pública del pasaporte NO vive bajo el shell autenticado", () => {
  assert(
    fs.existsSync(path.join(root, "app/textile-passport-share/[token]/page.tsx")),
    "la ruta pública tokenizada debía existir fuera de app/(app)"
  );
  assert(
    !fs.existsSync(path.join(root, "app/(app)/(shell)/textile-passport-share")),
    "la ruta pública jamás debe moverse dentro del shell"
  );
  const sharePage = read("app/textile-passport-share/[token]/page.tsx");
  assert(!sharePage.includes("AppNav"), "la página pública no debía renderizar la navegación privada");
});

check("12. La coherencia registro ↔ módulo: homePath Textil = TEXTILES_HOME_PATH", () => {
  assert(TEXTILES_SHELL_MODULE.homePath === TEXTILES_HOME_PATH, "homePath debía coincidir con DL-04");
  assert(SHELL_MODULES.some((m) => m.key === "cpr") && SHELL_MODULES.some((m) => m.key === "textiles"), "el registro debía contener ambos módulos");
});

if (failed > 0) {
  console.error(`\nResultado: ${passed} pasaron, ${failed} fallaron.`);
  process.exit(1);
}
console.log(`\nResultado: ${passed} pasaron, 0 fallaron. Todo verde.`);
