/**
 * Trazaloop · Sprint 2 · Prohibición de nombres de organismos certificadores.
 *
 * Recorre migraciones, seeds, UI, actions y textos del producto y FALLA si
 * aparece el nombre de un organismo certificador o la palabra "reglamento"
 * (reglamentos internos de certificación). Solo deben aparecer normas
 * técnicas (NTC 6632:2022, UNE-EN 15343:2008, NTC-ISO 14021, ISO 17422...).
 *
 * Correr: npm run test:compliance
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();

// Directorios del producto a escanear.
const SCAN_DIRS = ["app", "components", "server", "lib", "supabase"];

// Extensiones con texto visible o sembrable.
const EXTS = new Set([".ts", ".tsx", ".sql", ".md", ".css"]);

// Términos prohibidos (organismos certificadores conocidos y "reglamento").
// El escáner se excluye a sí mismo del barrido.
const BANNED: { pattern: RegExp; label: string }[] = [
  { pattern: /\bicontec\b/i, label: "nombre de organismo certificador" },
  { pattern: /\baenor\b/i, label: "nombre de organismo certificador" },
  { pattern: /\bsgs\b/i, label: "nombre de organismo certificador" },
  { pattern: /bureau\s+veritas/i, label: "nombre de organismo certificador" },
  { pattern: /t[üu]v/i, label: "nombre de organismo certificador" },
  { pattern: /\bintertek\b/i, label: "nombre de organismo certificador" },
  { pattern: /\bapplus\b/i, label: "nombre de organismo certificador" },
  { pattern: /\bdekra\b/i, label: "nombre de organismo certificador" },
  { pattern: /\bnsf\b/i, label: "nombre de organismo certificador" },
  { pattern: /\bul\s+solutions\b/i, label: "nombre de organismo certificador" },
  { pattern: /\bcotecna\b/i, label: "nombre de organismo certificador" },
  { pattern: /reglamento/i, label: "referencia a reglamento (usar solo normas técnicas)" },
  // Promesas comerciales fuertes: el producto habla de preparación y
  // alistamiento, nunca de resultados asegurados.
  { pattern: /obtener\s+(la\s+)?certificaci[oó]n/i, label: "promesa fuerte de certificación" },
  { pattern: /garantizar?\s+(la\s+)?certificaci[oó]n/i, label: "promesa fuerte de certificación" },
  { pattern: /garantizamos\s+(la\s+)?certificaci[oó]n/i, label: "promesa fuerte de certificación" },
  { pattern: /certificado\s+asegurado/i, label: "promesa fuerte de certificación" },
  { pattern: /certificaci[oó]n\s+(garantizada|asegurada)/i, label: "promesa fuerte de certificación" },
  { pattern: /asegurar?\s+(la\s+)?certificaci[oó]n/i, label: "promesa fuerte de certificación" },
];

const SKIP_DIRS = new Set(["node_modules", ".next", ".git"]);

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      yield* walk(full);
    } else if (EXTS.has(full.slice(full.lastIndexOf(".")))) {
      yield full;
    }
  }
}

type Violation = { file: string; line: number; term: string; label: string };

const violations: Violation[] = [];
let scanned = 0;

for (const dir of SCAN_DIRS) {
  let entries: string[];
  try {
    entries = [...walk(join(ROOT, dir))];
  } catch {
    continue;
  }
  for (const file of entries) {
    scanned += 1;
    const content = readFileSync(file, "utf8");
    const lines = content.split("\n");
    lines.forEach((line, i) => {
      for (const { pattern, label } of BANNED) {
        const match = line.match(pattern);
        if (match) {
          violations.push({
            file: relative(ROOT, file),
            line: i + 1,
            term: match[0],
            label,
          });
        }
      }
    });
  }
}

console.log(`\nTrazaloop · barrido de menciones prohibidas (${scanned} archivos)\n`);

if (violations.length === 0) {
  console.log("  ✔ Sin menciones de organismos certificadores ni reglamentos.\n");
  process.exit(0);
}

for (const v of violations) {
  console.error(`  ✘ ${v.file}:${v.line} → "${v.term}" (${v.label})`);
}
console.error(`\n${violations.length} mención(es) prohibida(s). Reemplaza por normas técnicas.\n`);
process.exit(1);
