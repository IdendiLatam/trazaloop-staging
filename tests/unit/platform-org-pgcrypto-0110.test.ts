/**
 * Trazaloop · Hotfix 0110 — calificación de pgcrypto en
 * public.create_platform_organization.
 *
 * El lint de Production reportó dos incidencias idénticas:
 *   public.create_platform_organization
 *   function gen_random_bytes(integer) does not exist   (SQLSTATE 42883)
 *
 * Causa raíz: pgcrypto vive en el schema `extensions` y los DOS overloads
 * efectivos son SECURITY DEFINER con `search_path = public`, así que la
 * llamada sin calificar no resuelve dentro de ellos.
 *
 * Corrección aprobada (mismo patrón que 0095/0096, que usan
 * extensions.digest sin ampliar el search_path): calificar la llamada como
 * extensions.gen_random_bytes(32).
 *
 * Esta suite es ESTÁTICA. La regresión conductual contra PostgreSQL real
 * vive en tests/db/pcr0110_assertions.sql (npm run test:pcr03-db).
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

// Migraciones autorizadas a partir de 0111. Cada sprint que añade una
// migración la declara aquí: es lo que impide que aparezca una migración
// no revisada sin que ninguna prueba se entere.
const QUALITY_01_ALLOWED = new Set(["0111_platform_role_privileges.sql", "0112_quality_process_foundation.sql"]);

const ROOT = join(__dirname, "..", "..");
const MIG_DIR = join(ROOT, "supabase", "migrations");
const MIG_NAME = "0110_platform_org_pgcrypto_schema_fix.sql";

const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

let failures = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✔ ${name}`);
  } catch (e) {
    failures += 1;
    console.error(`  ✖ ${name}`);
    console.error(`    ${(e as Error).message}`);
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const migrations = readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql")).sort();
const SQL = read(`supabase/migrations/${MIG_NAME}`);

/**
 * Separa el SQL en nivel superior vs cuerpos PL/pgSQL.
 *
 * Los cuerpos van entre `$$ … $$`, así que al partir por `$$` los segmentos
 * PARES son nivel superior y los IMPARES son cuerpos de función. Es la única
 * forma honesta de distinguir el DML HISTÓRICO de create_platform_organization
 * (que naturalmente hace INSERT en organizations, memberships, …) del DML
 * top-level que esta migración tendría PROHIBIDO introducir.
 */
const segments = SQL.split("$$");
const topLevel = segments.filter((_, i) => i % 2 === 0).join("\n");
const bodies = segments.filter((_, i) => i % 2 === 1);

/** Sin comentarios `--`: la cabecera de la 0110 cita literalmente el defecto. */
const stripComments = (s: string) => s.replace(/--[^\n]*/g, "");
const CODE = stripComments(SQL);
const topLevelCode = stripComments(topLevel);

/** Cuerpo de una función concreta dentro de una migración histórica. */
function historicalBody(file: string, fnName: string): string {
  const sql = read(`supabase/migrations/${file}`);
  const header = sql.toLowerCase().indexOf(`create or replace function public.${fnName}(`);
  assert(header >= 0, `${file} debe definir public.${fnName}`);
  const open = sql.indexOf("$$", header);
  assert(open >= 0, `${file}: no se encontró la apertura $$ de ${fnName}`);
  const close = sql.indexOf("$$", open + 2);
  assert(close >= 0, `${file}: no se encontró el cierre $$ de ${fnName}`);
  return sql.slice(open + 2, close);
}

console.log("\nTrazaloop · hotfix 0110 · pgcrypto en create_platform_organization\n");

// ─────────────────────────── A / B · frontera de migraciones ───────────────
check("A. existe exactamente supabase/migrations/0110_platform_org_pgcrypto_schema_fix.sql", () => {
  assert(existsSync(join(MIG_DIR, MIG_NAME)), `falta ${MIG_NAME}`);
  const at110 = migrations.filter((f) => Number(f.slice(0, 4)) === 110);
  assert(at110.length === 1 && at110[0] === MIG_NAME, `la 0110 debe ser única y llamarse ${MIG_NAME} (hay: ${at110.join(", ")})`);
  // Q0.3H · "cerrar la secuencia" se evalua dentro del RANGO de este hotfix
  // (0001-0110). La comprobacion absoluta convertia en fallo cualquier
  // migracion posterior legitima; la intencion era que la 0110 fuera la
  // ultima de SU momento, y eso se conserva.
  const withinScope = migrations.filter((f) => Number(f.slice(0, 4)) <= 110);
  assert(
    withinScope[withinScope.length - 1] === MIG_NAME,
    `la 0110 debe cerrar su rango, la última es ${withinScope[withinScope.length - 1]}`
  );
});

check("B. no existe ninguna migración fuera de la lista autorizada tras 0110", () => {
  const beyond = migrations.filter((f) => Number(f.slice(0, 4)) >= 111 && !QUALITY_01_ALLOWED.has(f));
  assert(beyond.length === 0, `no debe existir 0111 ni posterior: ${beyond.join(", ")}`);
});

// ─────────────────────────── C–G · contrato de la migración ────────────────
check("C. redefine exactamente DOS create_platform_organization (overloads 8 y 9 argumentos)", () => {
  const headers = topLevel.match(/create\s+or\s+replace\s+function\s+"?public"?\."?create_platform_organization"?\s*\(/gi) ?? [];
  assert(headers.length === 2, `se esperaban 2 definiciones, hay ${headers.length}`);

  // Aridades reales tomadas de la firma, no del texto suelto.
  const arities = [...SQL.matchAll(/create\s+or\s+replace\s+function\s+"?public"?\."?create_platform_organization"?\s*\(([^)]*(?:\)[^)]*)*?)\)\s*returns/gi)]
    .map((m) => m[1].split(/,(?![^(]*\))/).filter((p) => p.trim().length > 0).length);
  assert(arities.length === 2, `no se pudieron leer las 2 firmas (leídas: ${arities.length})`);
  assert(
    arities[0] === 8 && arities[1] === 9,
    `las aridades deben ser 8 y 9 en ese orden, son ${arities.join(" y ")}`
  );

  // Los defaults y el RETURNS TABLE históricos se conservan.
  assert(/"?p_plan_code"?\s+"?text"?\s+DEFAULT\s+'demo'/i.test(SQL), "el overload de 9 argumentos conserva p_plan_code DEFAULT 'demo'");
  const returns = SQL.match(/returns\s+table\s*\(\s*"?organization_id"?\s+"?uuid"?\s*,\s*"?admin_linked"?\s+boolean\s*,\s*"?invitation_token"?\s+"?text"?\s*\)/gi) ?? [];
  assert(returns.length === 2, `ambos overloads deben conservar el RETURNS TABLE original (hay ${returns.length})`);
});

check("D. contiene exactamente DOS llamadas extensions.gen_random_bytes(32)", () => {
  const qualified = SQL.match(/extensions\.gen_random_bytes\(32\)/g) ?? [];
  assert(qualified.length === 2, `se esperaban 2 llamadas calificadas, hay ${qualified.length}`);
  // Una por overload: ninguna quedó en el nivel superior ni concentrada en uno.
  assert(bodies.length === 2, `se esperaban 2 cuerpos PL/pgSQL, hay ${bodies.length}`);
  for (const [i, body] of bodies.entries()) {
    const n = (body.match(/extensions\.gen_random_bytes\(32\)/g) ?? []).length;
    assert(n === 1, `el cuerpo ${i + 1} debe tener 1 llamada calificada, tiene ${n}`);
  }
});

check("E. cero llamadas defectuosas encode(gen_random_bytes(32)", () => {
  assert(
    !/encode\(\s*gen_random_bytes\s*\(/i.test(CODE),
    "la migración no puede conservar encode(gen_random_bytes(…) sin calificar"
  );
  // Ninguna llamada a gen_random_bytes puede quedar sin calificar.
  const all = CODE.match(/(?<![\w.])gen_random_bytes\s*\(/g) ?? [];
  const qualified = CODE.match(/extensions\.gen_random_bytes\s*\(/g) ?? [];
  assert(all.length === 0, `toda llamada a gen_random_bytes debe ir calificada (sin calificar: ${all.length})`);
  assert(qualified.length === 2, `se esperaban 2 llamadas calificadas, hay ${qualified.length}`);
});

check("F. conserva SECURITY DEFINER en los dos overloads", () => {
  const n = (topLevelCode.match(/security\s+definer/gi) ?? []).length;
  assert(n === 2, `se esperaban 2 SECURITY DEFINER, hay ${n}`);
  assert(!/security\s+invoker/i.test(CODE), "ningún overload puede degradarse a SECURITY INVOKER");
});

check("G. conserva search_path=public en los dos overloads (sin ampliarlo a extensions)", () => {
  // Formato REAL del dump: SET "search_path" TO 'public'
  const n = (topLevelCode.match(/set\s+"?search_path"?\s+(?:to|=)\s+'?"?public"?'?/gi) ?? []).length;
  assert(n === 2, `se esperaban 2 SET search_path = public, hay ${n}`);
  const total = (topLevelCode.match(/set\s+"?search_path"?/gi) ?? []).length;
  assert(total === 2, `no debe haber otros SET search_path (hay ${total})`);
  assert(
    !/set\s+"?search_path"?\s+(?:to|=)[^\n]*extensions/i.test(CODE),
    "la solución aprobada NO amplía el search_path: califica la llamada (patrón 0095/0096)"
  );
});

// ─────────────────────────── H–J · nada más que el hotfix ──────────────────
check("H. no redefine ninguna otra función ni crea objetos nuevos", () => {
  const created = [...topLevel.matchAll(/create\s+(?:or\s+replace\s+)?(\w+)\s+([^\s(]+)/gi)];
  for (const m of created) {
    assert(
      m[1].toLowerCase() === "function",
      `la 0110 solo puede crear funciones, encontró CREATE ${m[1].toUpperCase()}`
    );
    assert(
      /create_platform_organization/i.test(m[2]),
      `la 0110 solo redefine create_platform_organization, encontró ${m[2]}`
    );
  }
  assert(created.length === 2, `se esperaban 2 sentencias CREATE, hay ${created.length}`);
});

check("I. sin cambios destructivos ni DML top-level (los INSERT del cuerpo histórico son legítimos)", () => {
  // Se comprueba sobre el NIVEL SUPERIOR: el cuerpo PL/pgSQL de
  // create_platform_organization contiene INSERT históricos y esperados.
  for (const banned of ["insert", "update", "delete", "truncate"]) {
    assert(
      !new RegExp(`(^|\\n)\\s*${banned}\\s`, "i").test(topLevel),
      `la 0110 no puede introducir ${banned.toUpperCase()} top-level`
    );
  }
  for (const banned of [/drop\s+table/i, /drop\s+schema/i, /drop\s+function/i, /drop\s+view/i, /alter\s+table/i, /alter\s+schema/i]) {
    assert(!banned.test(SQL), `la 0110 no puede contener ${String(banned)}`);
  }
  // Y el cuerpo histórico SÍ conserva sus INSERT: el hotfix no los borró.
  assert(
    bodies.every((b) => /insert\s+into\s+organizations/i.test(b)),
    "ambos cuerpos deben conservar el INSERT histórico en organizations"
  );
  assert(
    bodies.every((b) => /insert\s+into\s+team_invitations/i.test(b)),
    "ambos cuerpos deben conservar el alta de invitación (rama sin perfil)"
  );
  assert(
    bodies.every((b) => /perform\s+log_event\(/i.test(b)),
    "ambos cuerpos deben conservar log_event"
  );
});

check("J. sin transaction control top-level (compatible con el runner de Supabase CLI)", () => {
  const noComments = topLevel.replace(/--[^\n]*/g, "");
  assert(
    !/(^|\n)\s*(begin|commit|rollback)\s*;/i.test(noComments),
    "la 0110 no puede traer BEGIN/COMMIT/ROLLBACK propios (la atomicidad la pone el cliente)"
  );
  assert(
    !/create\s+index\s+concurrently|vacuum|alter\s+system/i.test(noComments),
    "sin operaciones vetadas fuera de transacción"
  );
});

// ─────────────────────────── K–L · no-regresión funcional ──────────────────
check("K. no toca la semántica comercial: solo demo/full/extra", () => {
  assert(
    /coalesce\(p_plan_code,\s*'demo'\)\s+not\s+in\s+\('demo',\s*'full',\s*'extra'\)/i.test(SQL),
    "la validación de planes debe seguir siendo exactamente ('demo', 'full', 'extra')"
  );
  // Todo valor que la 0110 usa COMO plan (default de p_plan_code y lista de
  // planes válidos) debe seguir siendo del vocabulario histórico.
  const defaults = [...CODE.matchAll(/coalesce\(\s*p_plan_code\s*,\s*'([^']*)'\s*\)/gi)].map((m) => m[1]);
  assert(defaults.length > 0, "el overload de 9 argumentos debe seguir usando coalesce(p_plan_code, …)");
  for (const d of defaults) {
    assert(d === "demo", `el plan por defecto debe seguir siendo 'demo', es '${d}'`);
  }
  const validLists = [...CODE.matchAll(/p_plan_code[^\n]*?not\s+in\s+\(([^)]*)\)/gi)].map((m) =>
    m[1].split(",").map((s) => s.trim().replace(/^'|'$/g, ""))
  );
  assert(validLists.length === 1, `debe existir una única lista de planes válidos (hay ${validLists.length})`);
  assert(
    JSON.stringify(validLists[0]) === JSON.stringify(["demo", "full", "extra"]),
    `la lista de planes válidos debe ser demo/full/extra, es ${validLists[0].join("/")}`
  );
  // Y no puede colarse vocabulario comercial nuevo en ninguna parte.
  for (const forbidden of ["free", "basic", "starter", "pro", "premium", "enterprise", "trial", "business"]) {
    assert(
      !new RegExp(`'${forbidden}'`, "i").test(CODE),
      `la 0110 no puede introducir el código de plan '${forbidden}'`
    );
  }
  // El overload de 8 argumentos nunca conoció los planes: sigue sin conocerlos.
  assert(!/plan_code/i.test(bodies[0]), "el overload de 8 argumentos no debe introducir planes");
});

check("L. no toca organization_modules, RLS, políticas ni estructuras de tabla", () => {
  assert(
    !/organization_modules/i.test(topLevel),
    "organization_modules solo puede aparecer dentro del cuerpo histórico"
  );
  for (const banned of [/create\s+policy/i, /alter\s+policy/i, /drop\s+policy/i, /row\s+level\s+security/i, /create\s+table/i, /create\s+index/i, /create\s+trigger/i, /create\s+extension/i, /create\s+schema/i]) {
    assert(!banned.test(SQL), `la 0110 no puede contener ${String(banned)}`);
  }
  // La provisión de módulos histórica se conserva intacta en cada overload.
  assert(
    /insert\s+into\s+organization_modules/i.test(bodies[0]),
    "el overload de 8 argumentos conserva su provisión directa de módulos"
  );
  assert(
    /perform\s+provision_new_organization_modules\(/i.test(bodies[1]),
    "el overload de 9 argumentos conserva provision_new_organization_modules (Demo 48 h)"
  );
});

// ─────────────────── delta semántico contra las definiciones históricas ────
check("SEMANTIC_DELTA: el único cambio frente a 0042/0100 es la calificación de pgcrypto", () => {
  const pairs: Array<[string, string]> = [
    ["0042_restrict_organization_creation.sql", bodies[0]],
    ["0100_organization_module_access_modes_and_demo_trial.sql", bodies[1]],
  ];
  for (const [file, body] of pairs) {
    const before = historicalBody(file, "create_platform_organization");
    const rolledBack = body.replace(/extensions\.gen_random_bytes\(32\)/g, "gen_random_bytes(32)");
    assert(
      rolledBack === before,
      `el cuerpo del hotfix difiere de ${file} en algo más que la calificación de pgcrypto`
    );
  }
});

check("no-regresión: las definiciones históricas siguen intactas (append-only)", () => {
  for (const file of [
    "0042_restrict_organization_creation.sql",
    "0053_organization_plan_assignment.sql",
    "0100_organization_module_access_modes_and_demo_trial.sql",
  ]) {
    const sql = read(`supabase/migrations/${file}`);
    assert(
      /encode\(gen_random_bytes\(32\), 'hex'\)/.test(sql),
      `${file} es inmutable (ya aplicada en Production) y debe conservar su llamada original`
    );
    assert(
      !/extensions\.gen_random_bytes/.test(sql),
      `${file} no puede reescribirse: el hotfix es append-only en la 0110`
    );
  }
});

// ─────────────────────────── arnés local ───────────────────────────────────
check("el arnés PostgreSQL cablea la 0110 y su regresión, y sigue siendo local", () => {
  const runner = read("tests/db/run-local-pg.sh");
  assert(
    /--single-transaction[^\n]*0110_platform_org_pgcrypto_schema_fix\.sql/.test(runner),
    "la 0110 debe aplicarse con --single-transaction (misma semántica que el CLI)"
  );
  assert(runner.includes("tests/db/pcr0110_assertions.sql"), "la regresión 0110 debe estar cableada");
  assert(!/supabase\s+link|db\s+push|db\s+pull|migration\s+repair|vercel|git\s+push/i.test(runner), "el runner no puede contener operaciones remotas");
  assert(runner.includes("trazaloop_pcr02_1"), "la base local sigue siendo desechable");

  // El arnés reproduce el alojamiento de pgcrypto de Supabase (schema
  // `extensions`), que es lo que hace REAL la regresión de causa raíz.
  const prelude = read("tests/db/harness-prelude.sql");
  assert(prelude.includes("create schema if not exists extensions"), "el arnés crea el schema extensions");
  assert(
    /create\s+extension\s+if\s+not\s+exists\s+pgcrypto\s+with\s+schema\s+extensions/i.test(prelude),
    "el arnés instala pgcrypto en extensions (fidelidad Supabase)"
  );
  // Superficie de arnés, jamás del producto: la 0001 no puede cambiar.
  const ext0001 = read("supabase/migrations/0001_extensions.sql");
  assert(!/with\s+schema\s+extensions/i.test(ext0001), "la 0001 permanece intacta");

  const sql = read("tests/db/pcr0110_assertions.sql");
  for (const marker of [
    "PCR0110_PGCRYPTO_SCHEMA = PASS",
    "PCR0110_TWO_OVERLOADS = PASS",
    "PCR0110_SECURITY_DEFINER = PASS",
    "PCR0110_SEARCH_PATH_PUBLIC = PASS",
    "PCR0110_UNQUALIFIED_ROOT_CAUSE = PASS",
    "PCR0110_QUALIFIED_CALL = PASS",
  ]) {
    assert(sql.includes(marker), `falta el marcador ${marker}`);
  }
  assert(sql.includes("undefined_function"), "la regresión debe capturar undefined_function (42883)");
});

check("higiene del hotfix: scripts registrados y sin bump de versión", () => {
  const pkg = JSON.parse(read("package.json"));
  assert(
    /^1\.0\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(pkg.version),
    "package.json permanece dentro de la línea comercial v1.0.x"
  );
  assert(pkg.scripts["test:platform-org-pgcrypto-0110"], "script de la suite 0110 registrado");
  assert(
    String(pkg.scripts["test:all"]).includes("test:platform-org-pgcrypto-0110"),
    "test:all incluye la suite 0110"
  );
  assert(pkg.scripts["test:pcr03-db"] === "bash tests/db/run-local-pg.sh", "la suite de BD real sigue siendo local");
});

console.log("");
if (failures > 0) {
  console.error(`Hotfix 0110: ${failures} verificación(es) fallaron.`);
  process.exit(1);
}
console.log("Hotfix 0110: todas las verificaciones pasaron.");
