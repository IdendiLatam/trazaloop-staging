/**
 * Trazaloop · Sprint 5C · Reparación idempotente de semillas para staging.
 *
 * Escenario: el esquema está aplicado (tablas y vistas existen, RLS activo)
 * pero faltan datos semilla — típico cuando el historial de migraciones se
 * desincronizó (migration repair, push sobre esquema restaurado sin datos).
 *
 * TODO EL SCRIPT USA ÚNICAMENTE SQL DIRECTO vía SUPABASE_DB_URL: conexión,
 * reparación, conteos finales y verificación. Sin PostgREST/REST (los
 * conteos por API dependían del esquema expuesto y de la key, y ocultaban el
 * error real). Cualquier fallo imprime el mensaje real de Postgres.
 *
 * QUÉ HACE (y qué no):
 * - Re-ejecuta ÍNTEGRO el archivo canónico supabase/migrations/
 *   0022_seed_sprint2.sql, que es 100% inserts idempotentes (todos con
 *   `on conflict ... do nothing`): frameworks, requirements, secciones y 52
 *   preguntas del diagnóstico, y 10 clasificaciones de materiales. Cero
 *   duplicación de datos en este script = cero divergencia con la migración.
 * - Extrae del archivo canónico 0028_recycled_content.sql el insert de la
 *   metodología RC-6632-15343 v1 (que NO era idempotente: causa raíz de que
 *   pudiera faltar) y lo ejecuta con `on conflict (code, version) do update`
 *   para restaurar exactamente la v1 activa esperada.
 * - NO borra nada. NO toca usuarios, organizaciones, evidencias,
 *   trazabilidad ni cálculos. Solo tablas globales de semilla.
 *
 * SUPABASE_DB_URL es una credencial administrativa: usar solo en local o
 * staging, jamás en código de la app.
 *
 * Uso: npm run repair:seeds
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client as PgClient } from "pg";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

/**
 * Extrae de un SQL la sentencia completa que empieza en `startMarker`,
 * respetando literales entre comillas simples (con '' escapadas), hasta el
 * `;` terminador fuera de comillas.
 */
export function extractStatement(sql: string, startMarker: string): string {
  const start = sql.indexOf(startMarker);
  if (start === -1) {
    throw new Error(`No se encontró "${startMarker}" en la migración canónica.`);
  }
  let inQuote = false;
  for (let i = start; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "'") {
      if (inQuote && sql[i + 1] === "'") {
        i++; // comilla escapada ''
        continue;
      }
      inQuote = !inQuote;
    } else if (ch === ";" && !inQuote) {
      return sql.slice(start, i); // sin el ';'
    }
  }
  throw new Error(`Sentencia sin terminador para "${startMarker}".`);
}

/** Ejecuta la reparación de semillas contra una conexión directa. */
export async function repairSeeds(pg: PgClient): Promise<void> {
  // 1) Seed canónico e idempotente de Sprint 2 (frameworks, requirements,
  //    secciones, 52 preguntas, 10 clasificaciones).
  const seed0022 = readFileSync(join(MIGRATIONS_DIR, "0022_seed_sprint2.sql"), "utf8");
  await pg.query(seed0022);
  console.log("✅ Seed 0022 re-ejecutado (idempotente: on conflict do nothing)");

  // 2) Metodología RC-6632-15343 v1: insert extraído del 0028 canónico +
  //    upsert para restaurar la v1 activa exacta sin duplicar.
  const sql0028 = readFileSync(join(MIGRATIONS_DIR, "0028_recycled_content.sql"), "utf8");
  const methodologyInsert = extractStatement(
    sql0028,
    "insert into public.calculation_methodologies"
  );
  await pg.query(
    methodologyInsert +
      `\non conflict (code, version) do update set
        name = excluded.name,
        description = excluded.description,
        rules = excluded.rules,
        is_active = excluded.is_active,
        effective_from = excluded.effective_from;`
  );
  console.log("✅ Metodología RC-6632-15343 v1 restaurada (upsert por code+version)");
}

async function main() {
  console.log("Trazaloop · reparación de semillas de staging\n");
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    console.error(
      "❌ Falta SUPABASE_DB_URL. Este script usa únicamente SQL directo.\n" +
        "   Configúrala en .env.local: Supabase → Settings → Database → Connection string."
    );
    process.exit(1);
  }

  const pg = new PgClient({ connectionString: dbUrl });

  // Conexión (SQL directo).
  try {
    await pg.connect();
    await pg.query("select 1");
    console.log("✅ Conexión a la base de datos OK");
  } catch (err) {
    console.error(`❌ No se pudo conectar con SUPABASE_DB_URL: ${(err as Error).message}`);
    process.exit(1);
  }

  // Reparación idempotente (no borra nada).
  try {
    await repairSeeds(pg);
  } catch (err) {
    console.error(`❌ Reparación fallida (error real de Postgres): ${(err as Error).message}`);
    console.error("   Nada se borra en este script; revisa el error y reintenta.");
    await pg.end().catch(() => undefined);
    process.exit(1);
  }

  // Conteos finales por SQL DIRECTO (sin PostgREST), con el error real de
  // Postgres si alguno falla.
  console.log("\nConteos tras la reparación (SQL directo):");
  let countsFailed = false;
  const countQueries: [string, string][] = [
    ["frameworks", "select count(*) from frameworks"],
    ["diagnostic_questions", "select count(*) from diagnostic_questions"],
    ["material_classifications", "select count(*) from material_classifications"],
    ["calculation_methodologies", "select count(*) from calculation_methodologies"],
  ];
  for (const [label, query] of countQueries) {
    try {
      const { rows } = await pg.query(query);
      console.log(`  · ${label}: ${rows[0].count}`);
    } catch (err) {
      countsFailed = true;
      console.error(`  · ${label}: ERROR → ${(err as Error).message}`);
    }
  }

  // Verificación de la metodología esperada (v1 activa), por SQL directo.
  try {
    const { rows } = await pg.query(
      "select code, version, is_active from calculation_methodologies where code = 'RC-6632-15343'"
    );
    const v1 = rows.find((r) => Number(r.version) === 1);
    if (v1?.is_active) {
      console.log(`  · metodología activa: ${v1.code} v${v1.version} ✅`);
    } else if (rows.length === 0) {
      countsFailed = true;
      console.error("  · metodología activa: RC-6632-15343 no existe ❌");
    } else {
      countsFailed = true;
      console.error(
        `  · metodología activa: encontrada pero no v1 activa ❌ → ${JSON.stringify(rows)}`
      );
    }
  } catch (err) {
    countsFailed = true;
    console.error(`  · metodología activa: ERROR → ${(err as Error).message}`);
  }

  await pg.end().catch(() => undefined);
  if (countsFailed) {
    console.error("\nResultado: reparación ejecutada pero la verificación falló (ver errores arriba).");
    process.exit(1);
  }
  console.log("\nListo. Vuelve a correr: npm run test:smoke");
}

// Ejecutar solo como entrypoint (permite importar repairSeeds en pruebas).
if (process.argv[1]?.includes("repair-staging-seeds")) {
  main().catch((err) => {
    console.error(`❌ Error inesperado: ${(err as Error).message}`);
    process.exit(1);
  });
}
