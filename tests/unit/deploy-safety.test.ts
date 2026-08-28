/**
 * Trazaloop · Seguridad de despliegue.
 *
 * POR QUÉ EXISTE
 *
 * El 27 de agosto de 2026, `npx vercel --prod=false --yes` desplegó a
 * producción. `--prod` es una bandera booleana: el CLI la analiza con `arg`,
 * que solo mira si está presente, y el `=false` no la apaga. Se lee como «no
 * producción» y significa «producción».
 *
 * `trazaloop.com` estuvo unas dos horas sirviendo código que esperaba la
 * migración 0139 sobre una base de datos en 0111.
 *
 * LO QUE ESTA SUITE COMPRUEBA, Y POR QUÉ ASÍ
 *
 * No basta con prohibir la cadena peligrosa: la siguiente variante que a
 * alguien le parezca que significa lo que no significa —`--prod false`,
 * `--prod=0`— pasaría igual. Así que además se EXIGE la forma afirmativa,
 * `--target=preview`, en toda instrucción de despliegue manual de vista previa.
 *
 * Decir lo que sí se quiere no admite la lectura equivocada.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

/**
 * Las formas de intentar apagar una bandera booleana dándole un valor.
 * Todas activan `--prod`.
 */
const FORMAS_PELIGROSAS: RegExp[] = [
  /--prod\s*=\s*(false|0|no|off)\b/i,
  /--prod\s+(false|0|no|off)\b/i,
  /--production\s*=\s*(false|0|no|off)\b/i,
];

/**
 * Los dos únicos archivos donde la cadena puede aparecer: los que CUENTAN el
 * incidente. Prohibirla también ahí obligaría a describir la causa sin
 * nombrarla, que es la peor manera de documentar un fallo.
 */
const RELATOS_DEL_INCIDENTE = [
  "docs/quality/quality-12-2/QUALITY_12_2D_PRODUCTION_INCIDENT.md",
  "docs/quality/quality-12-2/QUALITY_12_2D_LIVE_VALIDATION.md",
  "docs/releases/VERCEL_DEPLOY_SAFETY.md",
  "tests/unit/deploy-safety.test.ts",
];

const IGNORAR = new Set([
  "node_modules", ".git", ".next", "dist", "build", "coverage", ".vercel",
  ".turbo", "out",
]);

function archivos(dir: string, acc: string[] = []): string[] {
  for (const n of readdirSync(join(ROOT, dir))) {
    if (IGNORAR.has(n) || n.startsWith(".DS")) continue;
    const rel = dir === "." ? n : `${dir}/${n}`;
    const abs = join(ROOT, rel);
    let st;
    try { st = statSync(abs); } catch { continue; }
    if (st.isDirectory()) archivos(rel, acc);
    else if (/\.(ts|tsx|js|mjs|cjs|json|md|sh|bash|zsh|ya?ml|toml)$/.test(n)) acc.push(rel);
  }
  return acc;
}

console.log("\nSeguridad de despliegue · que --prod=false no vuelva\n");

const TODOS = archivos(".");

// ===========================================================================
console.log("A · LA FORMA PELIGROSA NO PUEDE REAPARECER");
// ===========================================================================

check("A1. ningún archivo del repositorio la usa, salvo los que la relatan", () => {
  const culpables: string[] = [];
  for (const f of TODOS) {
    if (RELATOS_DEL_INCIDENTE.includes(f)) continue;
    let texto: string;
    try { texto = read(f); } catch { continue; }
    for (const re of FORMAS_PELIGROSAS) {
      if (re.test(texto)) { culpables.push(`${f} → ${re}`); break; }
    }
  }
  assert(culpables.length === 0,
    `desplegarían a producción sin querer:\n      ${culpables.join("\n      ")}`);
});

check("A2. tampoco en package.json, que es lo que se ejecuta sin leerlo", () => {
  const pkg = read("package.json");
  for (const re of FORMAS_PELIGROSAS) {
    assert(!re.test(pkg), `package.json contiene ${re}`);
  }
});

check("A3. ni en flujos de integración continua", () => {
  const ci = TODOS.filter((f) => f.startsWith(".github/") || /\.(ya?ml)$/.test(f));
  for (const f of ci) {
    if (RELATOS_DEL_INCIDENTE.includes(f)) continue;
    const t = read(f);
    for (const re of FORMAS_PELIGROSAS) {
      assert(!re.test(t), `${f} contiene ${re}`);
    }
  }
});

// ===========================================================================
console.log("\nB · Y SE EXIGE LA FORMA AFIRMATIVA");
// ===========================================================================

check("B1. toda instrucción de despliegue manual dice a dónde va", () => {
  // Un `vercel deploy` suelto, sin `--prod` ni `--target`, hereda el destino
  // por omisión y es justo la ambigüedad que hay que quitar de en medio.
  const sospechosos: string[] = [];
  for (const f of TODOS) {
    if (RELATOS_DEL_INCIDENTE.includes(f)) continue;
    if (!/\.(md|json|sh|bash|zsh|ya?ml)$/.test(f)) continue;
    let texto: string;
    try { texto = read(f); } catch { continue; }
    for (const linea of texto.split("\n")) {
      if (!/\bvercel\s+(deploy\b|--)/.test(linea)) continue;
      if (/vercel\s+(ls|inspect|promote|rollback|env|git|link|logs|whoami|project)/.test(linea)) continue;
      if (/--target\s*=|--prod\b/.test(linea)) continue;
      sospechosos.push(`${f}: ${linea.trim().slice(0, 90)}`);
    }
  }
  assert(sospechosos.length === 0,
    `despliegues sin destino explícito:\n      ${sospechosos.join("\n      ")}`);
});

check("B2. la forma segura está documentada y es la afirmativa", () => {
  const doc = read("docs/releases/VERCEL_DEPLOY_SAFETY.md");
  assert(/--target=preview/.test(doc), "el documento no enseña `--target=preview`");
  assert(/bandera booleana/i.test(doc), "no explica POR QUÉ `--prod=false` engaña");
  assert(/promote/.test(doc), "no dice cómo restaurar producción");
});

// ===========================================================================
console.log("\nC · EL INCIDENTE QUEDA ESCRITO");
// ===========================================================================

check("C1. el relato existe y no se ha suavizado", () => {
  const doc = read("docs/quality/quality-12-2/QUALITY_12_2D_PRODUCTION_INCIDENT.md");
  for (const dato of [
    "--prod=false",            // la causa, con su nombre
    "0111",                    // la base de datos no se tocó
    "0289a8d4",                // el despliegue restaurado
    "65cfba9",                 // el accidental
    "source=cli",              // la prueba de qué lo originó
  ]) {
    assert(doc.includes(dato), `el relato del incidente ya no menciona «${dato}»`);
  }
  assert(/NO se ha borrado|no se ha borrado/i.test(doc),
    "no consta que el despliegue accidental se conserve como evidencia");
});

check("C2. la base de datos de Production consta como intacta", () => {
  const doc = read("docs/quality/quality-12-2/QUALITY_12_2D_PRODUCTION_INCIDENT.md");
  assert(/cero/i.test(doc) && /[Mm]igraciones aplicadas/.test(doc),
    "no consta que no se aplicara ninguna migración");
});

console.log(`\n${passed} conformes · ${failed} fallos\n`);
process.exit(failed === 0 ? 0 : 1);
