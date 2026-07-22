/**
 * Trazaloop · Sprint T9A.2 (Textil) · Corrección final de fuentes y
 * vínculos del pasaporte técnico textil (0086) — inspección SQL/código.
 * Correr: npx tsx tests/passports/textiles-passports-sources-links.test.ts
 *
 * Cierra los tres pendientes de T9A.1:
 *   1. data_sources_json ahora incluye schema_version dedicado.
 *   2. link_type específicos passport_* del pasaporte (aditivo).
 *   3. tests alineados con lo pedido (esta suite) + TEXTILES_T9B_READY_PROMPT.md.
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

const MIG = "supabase/migrations/0086_textile_passport_sources_and_links_fix.sql";
const sql = read(MIG);
const sqlCode = sql
  .split("\n")
  .map((l) => l.replace(/--.*$/, ""))
  .join("\n")
  .toLowerCase();
const domainSrc = read("lib/domain/textiles-passport.ts");

console.log("\nSprint T9A.2 · Corrección final de fuentes y vínculos del pasaporte\n");

check("1. Existe 0086 y su rango sigue intacto", () => {
  // Actualizado en T9A.3 (misma deriva de pins de T2.1–T9A.2): slot propio.
  const dir = path.join(root, "supabase/migrations");
  const slot = fs.readdirSync(dir).filter((f) => Number(f.slice(0, 4)) === 86);
  assert(
    JSON.stringify(slot.sort()) === JSON.stringify(["0086_textile_passport_sources_and_links_fix.sql"]),
    `el rango 0086 cambió (hay: ${slot.join(", ")})`
  );
});

check("2. PENDIENTE 1: data_sources_json incluye schema_version='textile_technical_passport_sources_v1'", () => {
  assert(sql.includes("create or replace function public.generate_textile_technical_passport_base(p_passport_id uuid)"), "0086 debe redefinir la RPC de generación base");
  // El bloque v_sources (data_sources_json) debe llevar el schema_version dedicado.
  const sourcesBlock = sql.slice(sql.indexOf("v_sources := jsonb_build_object"), sql.indexOf("v_hash := "));
  assert(sourcesBlock.includes("'schema_version', 'textile_technical_passport_sources_v1'"), "data_sources_json no incluye su schema_version dedicado");
  // No debe confundirse con el del snapshot.
  assert(sql.includes("'schema_version', 'textile_technical_passport_v1'"), "el snapshot debe conservar su propio schema_version");
});

check("3. La RPC redefinida conserva el resto del contrato de 0084 (módulo, rol, estado, flag, generated)", () => {
  assert(sql.includes("module_code = 'textiles' and enabled"), "la RPC perdió la verificación de módulo");
  assert(sql.includes("has_org_role(v_org, array['admin','quality','consultant'])"), "la RPC perdió la verificación de rol");
  assert(sql.includes("v_status not in ('draft', 'generated')"), "la RPC perdió la guarda de estado");
  assert(sql.includes("perform set_config('trazaloop.textile_passport_generate', 'on', true)"), "la RPC perdió la activación del flag");
  assert(sql.includes("status = 'generated'"), "la RPC perdió el paso a generated");
  assert(sql.includes("generated_by = auth.uid()"), "el sello generated_by debe fijarlo el servidor");
  assert(sql.includes("grant execute on function public.generate_textile_technical_passport_base(uuid) to authenticated"), "faltó el grant a authenticated");
});

check("4. PENDIENTE 2: familia passport_* añadida al check de link_type de forma ADITIVA", () => {
  // 24 previos (0084) + 6 passport_* = 30; ninguno perdido.
  const typeBlock = sql.slice(sql.indexOf("add constraint textile_evidence_links_type_check"));
  const types = [...typeBlock.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  for (const specific of [
    "passport_composition_support", "passport_traceability_support",
    "passport_circularity_support", "passport_claim_support",
    "passport_care_support", "passport_end_of_life_support",
  ]) {
    assert(types.includes(specific), `faltó el link_type específico ${specific}`);
  }
  // Valores previos conservados (muestra).
  for (const prev of ["general_support", "composition_support", "output_lot_support", "circularity_support", "passport_support", "end_of_life_support"]) {
    assert(types.includes(prev), `la ampliación perdió el link_type previo ${prev}`);
  }
});

check("5. El validador de coherencia exige la familia passport_* para technical_passport", () => {
  assert(sql.includes("create or replace function public.validate_textile_passport_evidence_link_type()"), "0086 debe redefinir el validador de vínculos");
  const validator = sql.slice(sql.indexOf("function public.validate_textile_passport_evidence_link_type"));
  for (const specific of [
    "passport_composition_support", "passport_traceability_support",
    "passport_circularity_support", "passport_claim_support",
    "passport_care_support", "passport_end_of_life_support",
  ]) {
    assert(validator.includes(`'${specific}'`), `el validador no admite ${specific}`);
  }
  assert(validator.includes("Use la familia passport_*."), "el mensaje debe orientar a la familia passport_*");
});

check("6. El validador SIGUE sin tocar otros entity_type (CPR y demás módulos intactos)", () => {
  const validator = sql.slice(sql.indexOf("function public.validate_textile_passport_evidence_link_type"));
  assert(validator.includes("if new.entity_type <> 'technical_passport' then\n    return new;"), "el validador debe retornar de inmediato para otros entity_type");
});

check("7. Solo redefine funciones + amplía un check: sin tablas, políticas, columnas ni alcance prohibido", () => {
  assert(!/create\s+table|drop\s+table|create\s+policy|alter\s+policy|drop\s+policy|create\s+(or\s+replace\s+)?view|add\s+column|drop\s+column/.test(sqlCode), "0086 solo debía redefinir funciones y ampliar el check de link_type");
  // El único alter table permitido es el drop/add del check de link_type.
  const alters = [...sql.matchAll(/alter table public\.(\w+)/g)].map((m) => m[1]);
  assert(alters.every((t) => t === "textile_evidence_links"), `alter table inesperado: ${alters.join(", ")}`);
  for (const banned of ["qr_code", "public_portal", "\\bpdf\\b", "\\bia_", "carbon", "module_subscription"]) {
    assert(!new RegExp(banned, "i").test(sqlCode), `0086 contiene alcance prohibido: ${banned}`);
  }
});

check("8. No toca CPR ni implementa la generación completa (sigue snapshot base)", () => {
  assert(!/trazadoc_|cpr_/i.test(sqlCode.replace(/organization_modules/g, "")), "0086 no debía tocar objetos CPR/TrazaDocs");
  // Sigue siendo el snapshot BASE: secciones en 'pending'/'not_applicable', sin lectura de fuentes reales.
  assert(!/from textile_reference_fiber_composition|from textile_input_lots|from textile_circularity_answers/i.test(sql), "0086 no debía construir el snapshot completo (T9B)");
});

check("9. Helper de dominio: constantes de schema_version de fuentes y familia passport_*", () => {
  assert(domainSrc.includes('export const TEXTILE_PASSPORT_SOURCES_SCHEMA_VERSION = "textile_technical_passport_sources_v1"'), "faltó la constante de schema_version de fuentes");
  assert(domainSrc.includes("TEXTILE_PASSPORT_EVIDENCE_LINK_TYPES"), "faltó la lista de link_types del pasaporte en el dominio");
  for (const specific of ["passport_composition_support", "passport_end_of_life_support"]) {
    assert(domainSrc.includes(`"${specific}"`), `el dominio no expone ${specific}`);
  }
});

check("10. PENDIENTE 3: existe TEXTILES_T9B_READY_PROMPT.md", () => {
  const p = "docs/modules/textiles/TEXTILES_T9B_READY_PROMPT.md";
  assert(fs.existsSync(path.join(root, p)), "faltó el prompt de T9B");
  const prompt = read(p);
  assert(/T9B/.test(prompt), "el prompt debe referirse a T9B");
  assert(prompt.length > 1500, "el prompt de T9B parece incompleto");
});

check("11. Seguridad de funciones y lenguaje prudente", () => {
  assert((sql.match(/set search_path = public/g) ?? []).length >= 2, "ambas funciones deben fijar search_path");
  assert(sql.includes("revoke execute on function public.validate_textile_passport_evidence_link_type() from public, anon, authenticated"), "faltó el revoke del validador");
  assert(!/reglamento/i.test(sql), "0086 no debe usar la palabra vetada");
  for (const term of ["certificación garantizada", "cumple automáticamente", "pasaporte oficial", "sello garantizado"]) {
    assert(!sql.toLowerCase().includes(term), `texto prohibido en 0086: ${term}`);
  }
  // El disclaimer del snapshot se conserva.
  assert(sql.includes("No equivale a certificación, sello, declaración regulatoria oficial ni pasaporte digital de producto oficial."), "el snapshot debe conservar la advertencia obligatoria");
});

console.log(`\nResultado: ${passed} pasaron, ${failed} fallaron`);
if (failed > 0) process.exit(1);
