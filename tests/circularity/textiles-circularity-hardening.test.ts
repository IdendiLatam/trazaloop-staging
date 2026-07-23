/**
 * Trazaloop · Sprint T7.1 (Textil) — Verificación del hardening de
 * CREACIÓN de evaluaciones de circularidad (0081).
 * Ejecutar: npx tsx tests/circularity/textiles-circularity-hardening.test.ts
 *
 * Riesgo cerrado: la política RLS de insert permitía a roles autorizados
 * crear (vía API directa) una evaluación que NACIERA 'completed' con
 * puntaje/nivel/brechas fabricados, esquivando la protección de UPDATE de
 * 0080 y el flujo controlado de cálculo/finalización.
 */

import fs from "node:fs";
import path from "node:path";

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
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const root = path.resolve(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const MIGRATION = "supabase/migrations/0081_textile_circularity_creation_hardening.sql";
const migrationSql = read(MIGRATION);
/** SQL sin comentarios: el encabezado NIEGA el alcance prohibido. */
const sqlNoComments = migrationSql
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n")
  .toLowerCase();
const baseSql = read("supabase/migrations/0080_textile_circularity_assessments.sql");
const actionsSrc = read("server/actions/textiles-circularity.ts");

console.log("\nSprint T7.1 · Hardening de creación de evaluaciones de circularidad\n");

check("1. Existe 0081 y su rango sigue intacto", () => {
  // Actualizado en T8 (misma deriva de pins de T2.1–T7.1): se fija SOLO el
  // slot propio; 0082+ son sprints legítimos posteriores.
  const dir = path.join(root, "supabase/migrations");
  const slot = fs.readdirSync(dir).filter((f) => Number(f.slice(0, 4)) === 81);
  assert(
    JSON.stringify(slot.sort()) === JSON.stringify(["0081_textile_circularity_creation_hardening.sql"]),
    `el rango 0081 cambió (hay: ${slot.join(", ")})`
  );
});

check("2. 0081 no modifica migraciones anteriores (0080 conserva su protección de UPDATE intacta)", () => {
  assert(baseSql.includes("create trigger t_textile_circularity_assessments_protect\n  before update on public.textile_circularity_assessments"), "0080 perdió el trigger de UPDATE");
  assert(baseSql.includes("protect_textile_circularity_calculated_fields"), "0080 perdió la función de protección");
  // El encabezado de 0081 MENCIONA la función de 0080 al describir el
  // problema; el código (sin comentarios) no debe redefinirla.
  assert(!sqlNoComments.includes("protect_textile_circularity_calculated_fields"), "0081 no debía redefinir la función de 0080");
});

check("3. Solo una función y un trigger: sin tablas, políticas, vistas ni alcance prohibido", () => {
  assert(!/create table|drop table|create policy|alter policy|drop policy|create view|drop view|alter table/i.test(migrationSql), "0081 solo debía crear la función y el trigger");
  const fns = [...migrationSql.matchAll(/create or replace function public\.(\w+)/g)].map((m) => m[1]);
  assert(JSON.stringify(fns) === JSON.stringify(["protect_textile_circularity_assessment_creation"]), `funciones inesperadas: ${fns.join(", ")}`);
  for (const term of ["trazadoc", "passport_", "qr_code", " blockchain", "lca_", "carbon_footprint", "module_access", "module_subscription"]) {
    assert(!sqlNoComments.includes(term), `0081 menciona "${term}" (fuera de alcance)`);
  }
});

check("4. No toca CPR: el único objetivo es textile_circularity_assessments", () => {
  const targets = [...migrationSql.matchAll(/(?:insert|update|delete) on public\.(\w+)/g)].map((m) => m[1]);
  assert(JSON.stringify([...new Set(targets)]) === JSON.stringify(["textile_circularity_assessments"]), `objetivos: ${targets.join(", ")}`);
});

check("5. Trigger BEFORE INSERT dedicado sobre la tabla de evaluaciones", () => {
  assert(migrationSql.includes("before insert on public.textile_circularity_assessments"), "debía ser BEFORE INSERT");
  assert(migrationSql.includes("t_textile_circularity_assessments_protect_insert"), "falta el trigger de creación");
});

check("6. Una evaluación no puede NACER completed ni archived (solo borrador)", () => {
  assert(migrationSql.includes("new.status is distinct from 'draft'"), "el guard no exige status draft al nacer");
  assert(migrationSql.includes("debe crearse como borrador"), "falta el mensaje de borrador obligatorio");
});

check("7. Los 8 campos calculados no pueden fijarse en el INSERT (incluye jsonb no-default)", () => {
  for (const f of ["circularity_score", "readiness_level", "calculated_at", "completed_at", "completed_by"]) {
    assert(new RegExp(`new\\.${f} is not null`).test(migrationSql), `el guard no bloquea ${f}`);
  }
  assert(migrationSql.includes("coalesce(new.dimension_scores, '{}'::jsonb) <> '{}'::jsonb"), "el guard no bloquea dimension_scores");
  assert(migrationSql.includes("coalesce(new.gaps, '[]'::jsonb) <> '[]'::jsonb"), "el guard no bloquea gaps");
  assert(migrationSql.includes("coalesce(new.recommendations, '[]'::jsonb) <> '[]'::jsonb"), "el guard no bloquea recommendations");
  assert(migrationSql.includes("no pueden fijarse al crearla"), "falta el mensaje de campos calculados");
});

check("8. Respeta el MISMO flag transaccional interno de 0080 (una sola vía controlada)", () => {
  assert(migrationSql.includes("current_setting('trazaloop.textile_circularity_calculate', true)"), "el guard no usa el flag de 0080");
  assert(baseSql.includes("trazaloop.textile_circularity_calculate"), "0080 ya no define el flag");
  // El guard jamás fija el flag: solo lo lee.
  assert(!migrationSql.includes("set_config"), "0081 no debía fijar el flag");
});

check("9. La función fija search_path y revoca execute; sin security definer innecesario", () => {
  assert(migrationSql.includes("set search_path = public"), "falta search_path seguro");
  assert(migrationSql.includes("revoke execute on function public.protect_textile_circularity_assessment_creation() from public, anon, authenticated"), "falta el revoke");
  // Trigger sobre su propia tabla: no necesita (ni usa) security definer.
  assert(!migrationSql.includes("security definer"), "el guard no debía ser security definer");
});

check("10. La server action de creación sigue sin enviar status ni campos calculados", () => {
  const createBlock = actionsSrc.slice(
    actionsSrc.indexOf("createTextileCircularityAssessmentAction"),
    actionsSrc.indexOf("updateTextileCircularityAssessmentDraftAction")
  );
  const insertBlock = createBlock.slice(createBlock.indexOf(".insert({"), createBlock.indexOf("})"));
  for (const f of ["status", "circularity_score", "readiness_level", "dimension_scores", "gaps", "recommendations", "calculated_at", "completed_at", "completed_by"]) {
    assert(!insertBlock.includes(f), `la action de creación envía ${f}`);
  }
});

check("11. Sin service_role y sin tocar RLS", () => {
  const code = actionsSrc
    .split("\n")
    .filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//") && !l.trim().startsWith("/*"))
    .join("\n");
  assert(!code.includes("service_role") && !code.includes("SUPABASE_SERVICE"), "las actions usan service_role");
  assert(!/create policy|alter policy|drop policy|disable row level security/i.test(migrationSql), "0081 toca políticas RLS");
});

check("12. Lenguaje prudente en los textos nuevos", () => {
  const lower = migrationSql.toLowerCase();
  for (const term of ["producto certificado", "cumple automáticamente", "certificación garantizada", "pasaporte oficial", "aprobado por norma"]) {
    assert(!lower.includes(term), `texto prohibido: "${term}"`);
  }
});

console.log(`\nResultado: ${passed} pasaron, ${failed} fallaron\n`);
if (failed > 0) process.exit(1);
