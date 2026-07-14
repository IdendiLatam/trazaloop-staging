/**
 * Trazaloop · Sprint 5E · Verificación de PRODUCCIÓN (npm run verify:prod).
 *
 * 100% SOLO LECTURA: únicamente SELECTs. No crea usuarios ni datos de
 * prueba, no escribe nada, no borra nada. Apto para ejecutarse contra el
 * proyecto de producción.
 *
 * A diferencia del smoke de staging (tolerante, con omisiones), esta
 * verificación es ESTRICTA: exige todas las variables y falla (exit 1) ante
 * cualquier chequeo en rojo.
 *
 * Chequeos:
 *  1. Variables de entorno presentes.
 *  2. Conexión a la API (anon) y a la base de datos (SQL directo).
 *  3. Migraciones aplicadas: tablas y vistas clave existen (to_regclass).
 *  4. Semillas: 52 preguntas, 10 clasificaciones, frameworks y metodología
 *     RC-6632-15343 v1 ACTIVA.
 *  5. Bucket 'evidences' existe y es PRIVADO (SQL directo a storage.buckets).
 *  6. RLS ACTIVO de verdad (pg_class.relrowsecurity) en las tablas críticas,
 *     más el chequeo conductual: un cliente anónimo no lee filas.
 *
 * Claves administrativas (solo operador, jamás código de app):
 *  - SUPABASE_DB_URL: SQL directo de solo lectura.
 *  - anon key: chequeo conductual de RLS vía API.
 */
import { createClient } from "@supabase/supabase-js";
import { Client as PgClient } from "pg";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

let failures = 0;
const ok = (msg: string) => console.log(`✅ ${msg}`);
const fail = (msg: string, hint: string) => {
  failures++;
  console.error(`❌ ${msg}\n   → ${hint}`);
};

const CRITICAL_TABLES = [
  "organizations",
  "memberships",
  "evidences",
  "materials",
  "input_batches",
  "production_orders",
  "output_batches",
  "batch_composition",
  "recycled_content_calculations",
];
const KEY_VIEWS = [
  "v_latest_batch_recycled",
  "v_calculation_dossier",
  "v_output_batch_readiness",
];

async function main() {
  console.log("Trazaloop · verificación de producción (solo lectura)\n");

  // 1. Variables (todas obligatorias en producción).
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!url || !anonKey || !dbUrl) {
    for (const [name, v] of [
      ["NEXT_PUBLIC_SUPABASE_URL", url],
      ["NEXT_PUBLIC_SUPABASE_ANON_KEY", anonKey],
      ["SUPABASE_DB_URL", dbUrl],
    ] as const) {
      if (!v) fail(`Variable ${name}`, "configúrala en .env.local apuntando al proyecto de producción.");
    }
    finish();
    return;
  }
  ok("Variables de entorno presentes");

  // 2a. Conexión SQL directa (solo lectura).
  const pg = new PgClient({ connectionString: dbUrl });
  try {
    await pg.connect();
    await pg.query("select 1");
    ok("Conexión a la base de datos OK (SQL directo)");
  } catch (err) {
    fail("Conexión a la base de datos", `${(err as Error).message}. Verifica SUPABASE_DB_URL.`);
    finish();
    return;
  }

  try {
    // 3. Migraciones: tablas y vistas clave.
    let relationsOk = true;
    for (const rel of [...CRITICAL_TABLES, ...KEY_VIEWS]) {
      const { rows } = await pg.query("select to_regclass($1) as reg", [`public.${rel}`]);
      if (!rows[0].reg) {
        relationsOk = false;
        fail(`Relación public.${rel}`, "faltan migraciones. Aplícalas con `npx supabase db push` (0001…0032).");
      }
    }
    if (relationsOk) ok(`Migraciones aplicadas (${CRITICAL_TABLES.length} tablas + ${KEY_VIEWS.length} vistas clave)`);

    // 4. Semillas.
    const seedChecks: [string, string, (n: number) => boolean, string][] = [
      ["diagnostic_questions", "select count(*)::int n from diagnostic_questions", (n) => n === 52, "se esperaban 52 preguntas"],
      ["material_classifications", "select count(*)::int n from material_classifications", (n) => n >= 10, "se esperaban 10 clasificaciones"],
      ["frameworks", "select count(*)::int n from frameworks", (n) => n >= 2, "se esperaban los marcos normativos"],
    ];
    let seedsOk = true;
    for (const [label, query, test, expected] of seedChecks) {
      const { rows } = await pg.query(query);
      if (!test(rows[0].n)) {
        seedsOk = false;
        fail(`Semillas ${label} (${rows[0].n})`, `${expected}. Ejecuta \`npm run repair:seeds\`.`);
      }
    }
    const { rows: meth } = await pg.query(
      "select version, is_active from calculation_methodologies where code = 'RC-6632-15343' and version = 1"
    );
    if (!meth[0]?.is_active) {
      seedsOk = false;
      fail("Metodología RC-6632-15343 v1 activa", "no existe o está inactiva. Ejecuta `npm run repair:seeds`.");
    }
    if (seedsOk) ok("Semillas correctas (52 preguntas, 10 clasificaciones, frameworks, metodología v1 activa)");

    // 5. Bucket privado.
    const { rows: bucket } = await pg.query(
      "select id, public from storage.buckets where id = 'evidences'"
    );
    if (bucket.length === 0) {
      fail("Bucket evidences", "El bucket evidences no existe. Créalo como bucket privado o aplica migraciones.");
    } else if (bucket[0].public === true) {
      fail("Bucket evidences", "El bucket evidences existe pero está público. Debe ser privado.");
    } else {
      ok("Bucket evidences existe y es privado");
    }

    // 6a. RLS ACTIVO de verdad (catálogo del sistema).
    const { rows: rls } = await pg.query(
      `select c.relname, c.relrowsecurity
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = any($1)`,
      [CRITICAL_TABLES]
    );
    const rlsOff = rls.filter((r) => r.relrowsecurity !== true).map((r) => r.relname);
    if (rlsOff.length > 0) {
      fail(`RLS desactivado en: ${rlsOff.join(", ")}`, "RLS debe estar activo en todas las tablas críticas.");
    } else {
      ok(`RLS activo en las ${CRITICAL_TABLES.length} tablas críticas (pg_class)`);
    }
  } finally {
    await pg.end().catch(() => undefined);
  }

  // 2b y 6b. API con anon: conexión + chequeo conductual (sin sesión, cero filas).
  const anon = createClient(url, anonKey);
  const { error: apiErr } = await anon
    .from("calculation_methodologies")
    .select("id", { head: true, count: "exact" });
  if (apiErr && /fetch failed|ENOTFOUND|ECONNREFUSED|abort/i.test(apiErr.message)) {
    fail("Conexión a la API", `no se pudo conectar a ${url}: ${apiErr.message}`);
  } else {
    ok("Conexión a la API OK (anon)");
    let behavioralOk = true;
    for (const table of ["organizations", "evidences", "recycled_content_calculations"]) {
      const { data, error } = await anon.from(table).select("id").limit(1);
      if (!error && (data ?? []).length > 0) {
        behavioralOk = false;
        fail(`RLS conductual en ${table}`, "un cliente anónimo pudo leer filas.");
      }
    }
    if (behavioralOk) ok("RLS conductual OK (anónimo no lee filas)");
  }

  finish();
}

function finish() {
  if (failures > 0) {
    console.error(`\nResultado: ${failures} chequeo(s) en rojo. NO desplegar hasta corregir (ver docs/PRODUCTION_DEPLOYMENT.md).`);
    process.exit(1);
  }
  console.log("\nResultado: producción verificada ✅ (solo lectura: nada fue modificado)");
}

if (process.argv[1]?.includes("verify-production")) {
  main().catch((err) => {
    console.error(`❌ Error inesperado: ${(err as Error).message}`);
    process.exit(1);
  });
}
