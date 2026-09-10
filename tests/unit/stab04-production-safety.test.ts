import { readFileSync, readdirSync } from "node:fs";

/**
 * Trazaloop · STABILIZATION-04 · Que 0189 se pueda aplicar sobre Producción.
 *
 * La migración añade una columna derivada, la rellena, protege la jerarquía con
 * un disparador, amplía un vocabulario cerrado y crea la primitiva de
 * aplicación. Todo aditivo; lo que hay que poder comprobar ANTES es que no se
 * le ocurre resolver por su cuenta los duplicados que encuentre ni tocar nada
 * que no le corresponda.
 *
 * Se separa lo que se EJECUTA al aplicar de los cuerpos de FUNCIÓN —un bloque
 * `do` corre al aplicar, el cuerpo de una función no—, que es la lección que
 * costó una guarda mal escrita en STABILIZATION-03.
 *
 * Correr: npm run test:stab04-safety
 */

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const ARCHIVO = "0189_position_identity_hierarchy_and_import.sql";
const crudo = readFileSync(`supabase/migrations/${ARCHIVO}`, "utf8");
const sql = crudo
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .split("\n").map((l) => l.replace(/--.*$/, "")).join("\n")
  .toLowerCase();
const sqlAplicacion = sql.replace(
  /create\s+(or\s+replace\s+)?function[\s\S]*?\$\$[\s\S]*?\$\$/g, " ");

console.log("\nSTABILIZATION-04 · seguridad de Producción\n");

check("1. Existe una sola 0189 y es la que se audita", () => {
  const todas = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql"));
  assert(todas.filter((f) => f.startsWith("0189")).length === 1, "hay más de una 0189");
  assert(todas.includes(ARCHIVO), `desapareció ${ARCHIVO}`);
});

check("2. Declara qué presupone, incluida 0188", () => {
  assert(/raise exception '0189 presupone 0123/.test(sql), "no aborta fuera de orden");
  assert(/quality_normalized_identity\(text\)/.test(sql),
    "no comprueba que exista la normalización de 0188, que es la que reutiliza");
});

check("3. FAIL-CLOSED ante cargos duplicados · y sin decidir por nadie", () => {
  assert(/raise exception 'position_identity_duplicates_present'/.test(sqlAplicacion),
    "no aborta si encuentra cargos que ya colisionan");
  assert(!/delete\s+from\s+(public\.)?quality_positions/.test(sqlAplicacion), "borra cargos");
  assert(!/update[\s\S]{0,60}set\s+name\s*=/.test(sqlAplicacion), "reescribe nombres");
});

check("4. No borra nada de lo que cuelga de un cargo", () => {
  for (const t of ["quality_people", "quality_position_assignments", "quality_position_versions",
                   "quality_position_functions", "quality_competencies",
                   "quality_person_competencies", "quality_org_units"]) {
    assert(!new RegExp(`delete\\s+from\\s+(public\\.)?${t}\\b`).test(sql), `borra de ${t}`);
    assert(!new RegExp(`truncate[\\s\\S]{0,30}${t}\\b`).test(sql), `trunca ${t}`);
  }
});

check("5. No toca facturación, autenticación ni estado comercial", () => {
  for (const t of ["billing_", "organization_plan_assignments",
                   "organization_subscriptions", "commercial_fx", "commercial_trial"]) {
    assert(!sql.includes(t), `la migración toca ${t}`);
  }
  // `auth.uid()` se LEE: es como toda primitiva gobernada de este repositorio
  // sabe quién llama. Lo que no puede hacer es ESCRIBIR en ese esquema, y eso
  // es lo que se comprueba. La primera versión rechazaba cualquier mención y se
  // ponía roja por leer la sesión, que es justo lo correcto.
  for (const verbo of [/insert\s+into\s+auth\./, /update\s+auth\./,
                       /delete\s+from\s+auth\./, /alter\s+table\s+auth\./,
                       /drop\s+\w+\s+auth\./]) {
    assert(!verbo.test(sql), `la migración escribe en el esquema de autenticación: ${verbo}`);
  }
  assert(/auth\.uid\(\)/.test(sql), "ninguna primitiva comprueba quién llama");
});

check("6. El único UPDATE al aplicar es el relleno de la columna nueva", () => {
  const updates = sqlAplicacion.match(/update\s+public\.[a-z_]+\s+set\s+[a-z_]+/g) ?? [];
  assert(updates.length > 0, "no hay relleno: ¿cambió el diseño?");
  for (const u of updates) {
    assert(u.includes("set normalized_name"), `hay un UPDATE que no es el relleno: ${u}`);
  }
  assert(!/\binsert\s+into\b/.test(sqlAplicacion), "la migración inserta filas");
});

check("7. El relleno va ANTES del NOT NULL y de la unicidad", () => {
  const iRelleno = sql.indexOf("set normalized_name = public.quality_normalized_identity");
  const iNotNull = sql.indexOf("set not null");
  const iUnico = sql.indexOf("quality_positions_org_normalized_uniq");
  assert(iRelleno > 0, "no hay relleno");
  assert(iNotNull > iRelleno, "el NOT NULL llega antes que el relleno");
  assert(iUnico > iRelleno, "la unicidad llega antes que el relleno");
});

check("8. Ampliar el vocabulario del marco no quita ninguna entidad", () => {
  const i = sql.indexOf("add constraint import_jobs_entity_check");
  assert(i > 0, "no se amplía el vocabulario");
  const bloque = sql.slice(i, sql.indexOf(";", i));
  for (const e of ["suppliers", "product_families", "products", "materials",
                   "input_batches", "evidences", "production_orders",
                   "batch_consumption", "output_batches", "batch_composition"]) {
    assert(bloque.includes(`'${e}'`), `desapareció la entidad ${e}`);
  }
  assert(bloque.includes("'positions'"), "no se añadió positions");
});

check("9. La guarda de ciclos vive en la TABLA, no en el importador", () => {
  assert(/before insert or update of parent_position_id on public\.quality_positions/.test(sql),
    "el disparador no cubre los cambios de superior");
  assert(/position_hierarchy_cycle/.test(sql), "no hay error de ciclo");
  assert(/position_hierarchy_too_deep/.test(sql),
    "sin tope de profundidad, una estructura corrupta colgaría el recorrido");
});

check("10. Nadie puede escribir su propia identidad normalizada", () => {
  assert(/new\.normalized_name\s*:=\s*public\.quality_normalized_identity\(new\.name\)/.test(sql),
    "el disparador no recalcula la columna");
  assert(!sql.includes("unaccent"), "la migración se apoya en unaccent");
});

check("11. La primitiva de aplicación comprueba sesión, empresa y estado", () => {
  const i = sql.indexOf("create or replace function public.quality_import_positions_apply");
  assert(i > 0, "no existe la primitiva");
  const cuerpo = sql.slice(i);
  assert(cuerpo.includes("auth_required"), "no comprueba la sesión");
  assert(cuerpo.includes("is_org_member(v_job.organization_id)"),
    "no comprueba que el trabajo sea de la empresa de quien llama");
  assert(cuerpo.includes("v_job.status <> 'validated'"), "aplicaría un trabajo cualquiera");
  assert(cuerpo.includes("security definer") && /set search_path to 'public'/.test(cuerpo),
    "no fija search_path");
  // La empresa NO es un parámetro: sale del trabajo, y el trabajo de la sesión.
  assert(/quality_import_positions_apply\(\s*p_job_id\s+uuid\s*\)/.test(sql),
    "la primitiva recibe algo más que el identificador del trabajo");
});

check("12. El preflight de duplicados es de solo lectura y sin datos de nadie", () => {
  const i = sql.indexOf("create or replace function public.quality_position_duplicates");
  assert(i > 0, "no existe el preflight");
  const cuerpo = sql.slice(i, sql.indexOf("$$;", i));
  assert(cuerpo.includes("stable"), "el preflight no es de solo lectura");
  assert(cuerpo.includes("is_platform_staff()"), "no filtra por plataforma");
  assert(!cuerpo.includes("description"), "expone la descripción del cargo");
  assert(/revoke all on function public\.quality_position_duplicates\(\) from public, anon, authenticated/
    .test(sql), "no revoca a authenticated");
});

console.log(`\nSTABILIZATION-04 · seguridad: ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
