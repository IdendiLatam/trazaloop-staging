/**
 * Trazaloop · Sprint PCR-01 · Renombrado de denominación visible CPR→PCR.
 * Garantiza AMBAS mitades del requisito: (a) el usuario final ve
 * "Trazaloop PCR"; (b) NINGÚN identificador técnico cambió (module_code,
 * route group, claves de UI, buckets, textos normativos NTC 6632/UNE-EN
 * 15343, seeds legales versionados).
 *
 * Correr: npm run test:pcr01-nomenclature
 */
import fs from "node:fs";
import path from "node:path";
import { COMMERCIAL_MODULES, CPR_MODULE_CODE, getCommercialModuleByKey } from "../../lib/modules/catalog";
import { CPR_SHELL_MODULE } from "../../lib/modules/registry";
import { TICKET_MODULE_LABEL } from "../../lib/domain/support";

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
function readSource(rel: string): string {
  return fs.readFileSync(path.join(__dirname, rel), "utf8");
}
const repoRoot = path.join(__dirname, "../..");

console.log("PCR-01 · Denominación visible PCR con identificadores técnicos intactos");

check("1. Nombre comercial canónico: Trazaloop PCR", () => {
  const mod = getCommercialModuleByKey("cpr");
  assert(mod !== null, "el módulo con clave técnica 'cpr' debía existir");
  assert(mod!.name === "Trazaloop PCR", `el nombre comercial debía ser Trazaloop PCR, es ${mod!.name}`);
  assert(CPR_SHELL_MODULE.name === "Trazaloop PCR", "el registro del shell debía decir Trazaloop PCR");
});

check("2. Identificadores técnicos INTACTOS", () => {
  assert(CPR_MODULE_CODE === "traceability_6632", "el module_code de BD no debía cambiar");
  assert(getCommercialModuleByKey("cpr") !== null, "la clave de UI 'cpr' no debía cambiar");
  assert(CPR_SHELL_MODULE.key === "cpr", "la clave del shell no debía cambiar");
  assert(
    fs.existsSync(path.join(repoRoot, "app/(app)/(shell)/(cpr)")),
    "el route group (cpr) no debía renombrarse"
  );
  assert(
    fs.existsSync(path.join(repoRoot, "lib/auth/require-cpr-module.ts")),
    "los archivos técnicos cpr-* no debían renombrarse"
  );
});

check("3. Texto normativo NTC 6632 / UNE-EN 15343 sin alteración", () => {
  assert(
    CPR_SHELL_MODULE.headerBadge === "NTC 6632 · UNE-EN 15343",
    "el badge normativo no debía tocarse"
  );
  const landing = readSource("../../app/page.tsx");
  assert(landing.includes("NTC 6632") && landing.includes("UNE-EN 15343"), "las normas debían seguir en la landing");
});

check("4. Superficies visibles clave dicen PCR", () => {
  assert(readSource("../../app/page.tsx").includes("Trazaloop PCR"), "landing");
  assert(readSource("../../app/legal/page.tsx").includes("Trazaloop PCR"), "página legal informativa");
  assert(
    readSource("../../app/(app)/(shell)/(cpr)/onboarding/page.tsx").includes("Bienvenido a Trazaloop PCR"),
    "onboarding"
  );
  assert(
    readSource("../../app/(app)/(shell)/(cpr)/dashboard/page.tsx").includes("Trazaloop PCR"),
    "dashboard"
  );
  assert(TICKET_MODULE_LABEL.cpr === "Trazaloop PCR", "etiqueta del módulo en soporte");
  assert(
    readSource("../../lib/auth/require-cpr-module.ts").includes('"Trazaloop PCR"'),
    "mensaje del guard de acceso"
  );
  assert(
    readSource("../../components/domain/platform/create-organization-form.tsx").includes("Trazaloop PCR"),
    "alta de empresas en plataforma"
  );
});

check("5. Ninguna cadena visible 'Trazaloop CPR' queda en la UI", () => {
  // Se recorren fuentes de UI/servidor; se permiten comentarios (// o *) y la
  // transcripción del documento legal APROBADO v1.0.0 (lib/domain/legal-
  // package.ts + seed 0066), que es un texto legal versionado: renombrarlo
  // exige una nueva versión legal, no una edición retroactiva (ver informe).
  const roots = ["app", "components", "lib", "server"];
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name)) {
        const rel = path.relative(repoRoot, full);
        if (rel === path.join("lib", "domain", "legal-package.ts")) continue;
        const lines = fs.readFileSync(full, "utf8").split("\n");
        lines.forEach((line, i) => {
          if (!line.includes("Trazaloop CPR")) return;
          const trimmed = line.trim();
          if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;
          offenders.push(`${rel}:${i + 1}`);
        });
      }
    }
  };
  for (const r of roots) walk(path.join(repoRoot, r));
  assert(offenders.length === 0, `quedaron cadenas visibles: ${offenders.join(", ")}`);
});

check("6. Textiles y demás módulos sin regresión de nombre", () => {
  const names = COMMERCIAL_MODULES.map((m) => m.name);
  for (const expected of ["Trazaloop PCR", "Trazaloop Textiles", "Trazaloop Quality", "Trazaloop Construcción"]) {
    assert(names.includes(expected), `faltaba ${expected} en el catálogo comercial`);
  }
});

check("7. TrazaDocs conserva su module_key técnico 'cpr'", () => {
  const migration0082 = readSource("../../supabase/migrations/0082_textile_trazadocs.sql");
  assert(migration0082.includes("'cpr'"), "el module_key histórico de TrazaDocs no debía tocarse");
});

if (failures > 0) {
  console.error(`\n${failures} verificación(es) fallaron.`);
  process.exit(1);
}
console.log("\nTodas las verificaciones de nomenclatura pasaron.");
