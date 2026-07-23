/**
 * Trazaloop · Sprint T9A.3 (Textil) · HOTFIX: link_type
 * 'passport_documentary_support' para technical_passport (0087).
 * Correr: npx tsx tests/passports/textiles-passports-documentary-link.test.ts
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
let passed = 0;
let failed = 0;

function check(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${(err as Error).message}`);
  }
}
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}
function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const MIG = "supabase/migrations/0087_textile_passport_documentary_link_fix.sql";
const sql = read(MIG);
const sqlCode = sql
  .split("\n")
  .map((l) => l.replace(/--.*$/, ""))
  .join("\n")
  .toLowerCase();
const prev86 = read("supabase/migrations/0086_textile_passport_sources_and_links_fix.sql");
const domainSrc = read("lib/domain/textiles-passport.ts");

console.log("\nSprint T9A.3 · Hotfix link_type documental del pasaporte\n");

check("1. Existe 0087 y su rango sigue intacto", () => {
  // Actualizado en T9B (misma deriva de pins de T2.1–T9A.3): slot propio.
  const dir = path.join(root, "supabase/migrations");
  const slot = fs.readdirSync(dir).filter((f) => Number(f.slice(0, 4)) === 87);
  assert(
    JSON.stringify(slot.sort()) === JSON.stringify(["0087_textile_passport_documentary_link_fix.sql"]),
    `el rango 0087 cambió (hay: ${slot.join(", ")})`
  );
});

check("2. El hotfix añade passport_documentary_support al check de link_type (ADITIVO: 30→31)", () => {
  const typeBlock = sql.slice(sql.indexOf("add constraint textile_evidence_links_type_check"));
  const types = [...typeBlock.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert(types.includes("passport_documentary_support"), "faltó passport_documentary_support en el check");
  // 24 base + 6 (T9A.2) + 1 (T9A.3) = 31; y los previos se conservan.
  const prevBlock = prev86.slice(prev86.indexOf("add constraint textile_evidence_links_type_check"));
  const prevTypes = new Set([...prevBlock.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]));
  for (const t of prevTypes) assert(types.includes(t), `la ampliación perdió el link_type previo ${t}`);
  assert(new Set(types).size === prevTypes.size + 1, `el check debía sumar exactamente 1 tipo (previos ${prevTypes.size}, ahora ${new Set(types).size})`);
});

check("3. El validador de coherencia admite passport_documentary_support", () => {
  assert(sql.includes("create or replace function public.validate_textile_passport_evidence_link_type()"), "el hotfix debe redefinir el validador");
  const validator = sql.slice(sql.indexOf("function public.validate_textile_passport_evidence_link_type"));
  assert(validator.includes("'passport_documentary_support'"), "el validador no admite passport_documentary_support");
  // Mantiene la familia previa.
  for (const t of ["passport_support", "passport_composition_support", "passport_end_of_life_support"]) {
    assert(validator.includes(`'${t}'`), `el validador perdió ${t}`);
  }
});

check("4. Sigue sin tocar otros entity_type (CPR y demás módulos intactos)", () => {
  const validator = sql.slice(sql.indexOf("function public.validate_textile_passport_evidence_link_type"));
  assert(validator.includes("if new.entity_type <> 'technical_passport' then\n    return new;"), "el validador debe retornar de inmediato para otros entity_type");
});

check("5. Hotfix mínimo: sin tablas, columnas, políticas, RPC nueva ni alcance prohibido", () => {
  assert(!/create\s+table|drop\s+table|create\s+policy|alter\s+policy|drop\s+policy|create\s+(or\s+replace\s+)?view|add\s+column|drop\s+column/.test(sqlCode), "el hotfix solo debía ampliar el check y redefinir el validador");
  // El único alter table es el drop/add del check de link_type.
  const alters = [...sql.matchAll(/alter table public\.(\w+)/g)].map((m) => m[1]);
  assert(alters.every((t) => t === "textile_evidence_links"), `alter table inesperado: ${alters.join(", ")}`);
  // Solo se redefine el validador (ninguna otra función, ninguna RPC).
  const fns = [...sql.matchAll(/create or replace function public\.(\w+)/g)].map((m) => m[1]);
  assert(JSON.stringify(fns) === JSON.stringify(["validate_textile_passport_evidence_link_type"]), `funciones inesperadas: ${fns.join(", ")}`);
  assert(!/generate_textile_technical_passport|change_textile_technical_passport/.test(sql), "el hotfix no debía tocar las RPCs del pasaporte");
  for (const banned of ["qr_code", "public_portal", "\\bpdf\\b", "carbon", "module_subscription"]) {
    assert(!new RegExp(banned, "i").test(sqlCode), `el hotfix contiene alcance prohibido: ${banned}`);
  }
});

check("6. No toca CPR ni implementa generación completa", () => {
  assert(!/trazadoc_|cpr_/i.test(sqlCode.replace(/organization_modules/g, "")), "el hotfix no debía tocar objetos CPR/TrazaDocs");
  assert(!/from textile_reference_fiber_composition|jsonb_build_object\('sections'/i.test(sql), "el hotfix no debía construir snapshot (T9B)");
});

check("7. El dominio expone passport_documentary_support en la familia del pasaporte", () => {
  assert(domainSrc.includes('"passport_documentary_support"'), "el dominio no expone passport_documentary_support");
  const listBlock = domainSrc.slice(domainSrc.indexOf("TEXTILE_PASSPORT_EVIDENCE_LINK_TYPES"));
  assert(listBlock.includes('"passport_documentary_support"'), "passport_documentary_support debe estar en TEXTILE_PASSPORT_EVIDENCE_LINK_TYPES");
});

check("8. Seguridad y lenguaje prudente", () => {
  assert(sql.includes("set search_path = public"), "el validador debe fijar search_path");
  assert(sql.includes("revoke execute on function public.validate_textile_passport_evidence_link_type() from public, anon, authenticated"), "faltó el revoke del validador");
  assert(!/reglamento/i.test(sql), "el hotfix no debe usar la palabra vetada");
  for (const term of ["certificación garantizada", "cumple automáticamente", "pasaporte oficial", "sello garantizado"]) {
    assert(!sql.toLowerCase().includes(term), `texto prohibido en 0087: ${term}`);
  }
});

console.log(`\nResultado: ${passed} pasaron, ${failed} fallaron`);
if (failed > 0) process.exit(1);
