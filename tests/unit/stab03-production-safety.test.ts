import { readFileSync, readdirSync } from "node:fs";

/**
 * Trazaloop · STABILIZATION-03 · Que 0188 se pueda aplicar sobre Producción.
 *
 * Producción tiene organizaciones y personas reales. Esta migración añade una
 * columna derivada, la rellena, la protege con un disparador y crea dos
 * unicidades. Todo eso es aditivo; lo que hay que poder comprobar ANTES es que
 * no se le ocurre resolver por su cuenta los duplicados que encuentre.
 *
 * Se mira el SQL sin comentarios y separando lo que se EJECUTA al aplicar de
 * los cuerpos de función, que es la lección de MP0186.
 *
 * Correr: npm run test:stab03-safety
 */

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const ARCHIVO = "0188_stakeholder_identity_normalization.sql";
const crudo = readFileSync(`supabase/migrations/${ARCHIVO}`, "utf8");
const sql = crudo
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .split("\n").map((l) => l.replace(/--.*$/, "")).join("\n")
  .toLowerCase();
/**
 * LO QUE SE EJECUTA AL APLICAR, que no es «todo lo que no está entre $$».
 *
 * La primera versión quitaba TODOS los bloques `$$…$$` y con ellos se llevaba
 * el `do $$ … $$` que aborta ante duplicados: la guarda decía que la migración
 * no fallaba cerrado cuando sí lo hace. La diferencia importa y es exacta: el
 * cuerpo de una FUNCIÓN se guarda como texto y corre más tarde; un bloque `do`
 * se ejecuta en el momento de aplicar, como cualquier otra orden.
 */
const sqlAplicacion = sql.replace(
  /create\s+(or\s+replace\s+)?function[\s\S]*?\$\$[\s\S]*?\$\$/g, " ");

console.log("\nSTABILIZATION-03 · seguridad de Producción\n");

check("1. Existe una sola 0188 y es la que se audita", () => {
  const todas = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql"));
  assert(todas.filter((f) => f.startsWith("0188")).length === 1, "hay más de una 0188");
  assert(todas.includes(ARCHIVO), `desapareció ${ARCHIVO}`);
});

check("2. Declara qué presupone", () => {
  assert(/raise exception '0188 presupone 0149'/.test(sql), "no aborta fuera de orden");
});

check("3. FAIL-CLOSED ante duplicados · y sin decidir por nadie", () => {
  assert(/raise exception 'stakeholder_identity_duplicates_present'/.test(sqlAplicacion),
    "no aborta si encuentra identidades en colisión");
  // Ni fusiona, ni borra, ni renombra para salir del paso.
  assert(!/delete\s+from\s+(public\.)?quality_external_parties/.test(sqlAplicacion),
    "borra partes externas");
  assert(!/delete\s+from\s+(public\.)?quality_stakeholder_groups/.test(sqlAplicacion),
    "borra colectivos");
  assert(!/delete\s+from\s+(public\.)?quality_stakeholder_assessments/.test(sqlAplicacion),
    "borra análisis");
  assert(!/update[\s\S]{0,80}set\s+legal_name/.test(sqlAplicacion), "reescribe legal_name");
  assert(!/update[\s\S]{0,80}set\s+name\s*=/.test(sqlAplicacion), "reescribe el nombre del colectivo");
  assert(!/update[\s\S]{0,80}set\s+status/.test(sqlAplicacion), "reescribe el estado");
});

check("4. El único UPDATE es el relleno de la columna nueva", () => {
  const updates = sqlAplicacion.match(/update\s+public\.[a-z_]+\s+set\s+[a-z_]+/g) ?? [];
  assert(updates.length > 0, "no hay relleno: ¿cambió el diseño?");
  for (const u of updates) {
    assert(u.includes("set normalized_name"),
      `hay un UPDATE que no es el relleno: ${u}`);
  }
  assert(!/\binsert\s+into\b/.test(sqlAplicacion), "la migración inserta filas");
  assert(!/\btruncate\b/.test(sql), "trunca algo");
});

check("5. No toca autenticación, facturación ni asignaciones de plan", () => {
  for (const t of ["auth.", "billing_", "organization_plan_assignments",
                   "organization_modules", "organization_subscriptions", "memberships"]) {
    assert(!sqlAplicacion.includes(t), `la migración toca ${t}`);
  }
});

check("6. No destruye estructura · y las columnas nuevas se rellenan antes del NOT NULL", () => {
  assert(!/drop\s+table/.test(sql), "borra una tabla");
  assert(!/drop\s+column/.test(sql), "borra una columna");
  const drops = sql.match(/drop\s+[a-z]+/g) ?? [];
  assert(drops.every((d) => d.startsWith("drop trigger")),
    `hay DROP que no son de los disparadores propios: ${drops.join(", ")}`);
  const iRelleno = sql.indexOf("set normalized_name");
  const iNotNull = sql.indexOf("set not null");
  assert(iRelleno > 0 && iNotNull > iRelleno,
    "el NOT NULL llega antes que el relleno: rompería con las filas existentes");
  const iUnico = sql.indexOf("quality_external_parties_org_name_uniq");
  assert(iUnico > iRelleno, "la unicidad llega antes que el relleno");
});

check("7. La normalización no se apoya en `unaccent`", () => {
  // Es STABLE y aquí ni siquiera está instalada; envolverla en un IMMUTABLE
  // fingido dejaría el índice desincronizado el día que cambiara el diccionario.
  assert(!sql.includes("unaccent"), "la migración usa unaccent");
  assert(/create\s+extension/.test(sql) === false, "la migración instala una extensión");
  assert(/language sql\s+immutable/.test(sql), "la normalización no se declara inmutable");
});

check("8. Nadie puede escribir su propia normalización", () => {
  assert(/new\.normalized_name\s*:=\s*public\.quality_normalized_identity/.test(sql),
    "el disparador no recalcula la columna");
  assert(/before insert or update on public\.quality_external_parties/.test(sql),
    "falta el disparador en las partes externas");
  assert(/before insert or update on public\.quality_stakeholder_groups/.test(sql),
    "falta el disparador en los colectivos");
});

check("9. La unicidad NO se limita a lo activo", () => {
  const i = sql.indexOf("create unique index if not exists quality_external_parties_org_name_uniq");
  assert(i > 0, "falta la unicidad de partes externas");
  const bloque = sql.slice(i, sql.indexOf(";", i));
  assert(!bloque.includes("where"),
    "la unicidad es parcial: el nombre de una retirada dejaría de ser suyo");
});

check("10. El preflight es de solo lectura y no expone datos", () => {
  const i = sql.indexOf("create or replace function public.quality_identity_duplicates");
  assert(i > 0, "no existe el preflight");
  const cuerpo = sql.slice(i, sql.indexOf("$$;", i));
  assert(cuerpo.includes("stable"), "el preflight no es de solo lectura");
  assert(cuerpo.includes("is_platform_staff()"), "el preflight no filtra por plataforma");
  for (const campo of ["tax_id", "website", "notes", "city", "trade_name"]) {
    assert(!cuerpo.includes(campo), `el preflight expone ${campo}`);
  }
  assert(/revoke all on function public\.quality_identity_duplicates\(\) from public, anon, authenticated/
    .test(sql), "el preflight no revoca a authenticated");
});

check("11. La primitiva de estado comprueba sesión y organización", () => {
  const i = sql.indexOf("create or replace function public.quality_set_external_party_status");
  assert(i > 0, "no existe la primitiva de estado");
  const cuerpo = sql.slice(i);
  assert(cuerpo.includes("auth_required"), "no comprueba la sesión");
  assert(cuerpo.includes("is_org_member(p_organization_id)"), "no comprueba la organización");
  assert(cuerpo.includes("external_party_status_invalid"), "acepta cualquier estado");
  assert(cuerpo.includes("security definer") && /set search_path to 'public'/.test(cuerpo),
    "no fija search_path");
});

console.log(`\nSTABILIZATION-03 · seguridad: ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
