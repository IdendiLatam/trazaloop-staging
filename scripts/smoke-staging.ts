/**
 * Trazaloop · Sprint 5C · Smoke test de staging.
 *
 * Verifica que un proyecto Supabase (local o staging) tiene lo mínimo para
 * que la app funcione: variables, conexión, migraciones aplicadas (tablas y
 * vistas), RLS activo (chequeo conductual), bucket de evidencias, metodología
 * activa y semillas del diagnóstico.
 *
 * Uso:  npm run test:smoke   (lee .env.local vía dotenv, como test:rls)
 *
 * Claves: la anon key basta para la mayoría de chequeos. La
 * SUPABASE_SERVICE_ROLE_KEY es OPCIONAL y se usa aquí únicamente como
 * herramienta administrativa de verificación (bucket/semillas); jamás forma
 * parte del código de la app ni del bundle del cliente.
 */
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

let failures = 0;
function ok(msg: string) {
  console.log(`✅ ${msg}`);
}
function fail(msg: string, hint: string) {
  failures++;
  console.error(`❌ ${msg}\n   → Revisa: ${hint}`);
}
function warn(msg: string) {
  console.log(`⚠️  ${msg}`);
}

async function main() {
  console.log("Trazaloop · smoke test de staging\n");

  // 1. Variables de entorno mínimas.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey) {
    fail(
      "Variables de entorno mínimas",
      "crea .env.local (cp .env.example .env.local) con NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY, o configúralas en Vercel."
    );
    process.exit(1);
  }
  ok("Variables de entorno mínimas presentes");

  // 2. Conexión a Supabase.
  const anon = createClient(url, anonKey);
  const { error: connError } = await anon
    .from("calculation_methodologies")
    .select("id", { head: true, count: "exact" });
  if (connError && /fetch failed|ENOTFOUND|ECONNREFUSED|abort/i.test(connError.message)) {
    fail("Supabase connection", `no se pudo conectar a ${url}. Verifica la URL y que el proyecto esté activo.`);
    finish();
    return;
  }
  ok("Supabase connection OK");

  // 3 y 4. Tablas y vistas clave (si faltan, las migraciones no aplicaron).
  const tables = [
    "organizations",
    "memberships",
    "evidences",
    "input_batches",
    "production_orders",
    "output_batches",
    "batch_composition",
    "recycled_content_calculations",
  ];
  const views = ["v_output_batch_readiness", "v_calculation_dossier", "v_latest_batch_recycled"];
  let migrationsOk = true;
  for (const rel of [...tables, ...views]) {
    const { error } = await anon.from(rel).select("*", { head: true }).limit(0);
    if (error && /does not exist|Could not find|schema cache/i.test(error.message)) {
      migrationsOk = false;
      fail(`Relación ${rel}`, "faltan migraciones. Ejecuta `npx supabase db push` (ver docs/STAGING_DEPLOYMENT.md).");
    }
  }
  if (migrationsOk) ok("Migrations applied (tablas y vistas clave existen)");

  // 8. RLS conductual: SIN sesión, las tablas org-scoped no devuelven filas.
  let rlsOk = true;
  for (const table of ["organizations", "evidences", "recycled_content_calculations"]) {
    const { data, error } = await anon.from(table).select("id").limit(1);
    if (!error && (data ?? []).length > 0) {
      rlsOk = false;
      fail(
        `RLS en ${table}`,
        "un cliente anónimo pudo leer filas. RLS está desactivado o hay una política demasiado permisiva."
      );
    }
  }
  if (rlsOk) ok("RLS activo en tablas críticas (anónimo no lee filas)");

  // 5-7. Chequeos que requieren la clave administrativa (opcional).
  if (!serviceKey) {
    warn(
      "SUPABASE_SERVICE_ROLE_KEY no configurada: se omiten bucket, metodología y semillas.\n" +
        "   Agrégala en .env.local (solo como herramienta administrativa) para el chequeo completo."
    );
    finish();
    return;
  }
  const admin = createClient(url, serviceKey);

  const { data: bucket, error: bucketErr } = await createClient(url, serviceKey, {
    db: { schema: "storage" },
  })
    .from("buckets")
    .select("id, public")
    .eq("id", "evidences")
    .maybeSingle();
  if (bucketErr || !bucket) {
    fail("Evidence bucket", "el bucket 'evidences' no existe. Aplica la migración 0015 (`npx supabase db push`).");
  } else if (bucket.public) {
    fail("Evidence bucket privacidad", "el bucket 'evidences' es PÚBLICO; debe ser privado.");
  } else {
    ok("Evidence bucket exists (privado)");
  }

  const { data: meth } = await admin
    .from("calculation_methodologies")
    .select("code, version, is_active")
    .eq("code", "RC-6632-15343")
    .eq("is_active", true)
    .maybeSingle();
  if (!meth) {
    fail("Active methodology", "no hay metodología activa RC-6632-15343. Aplica la migración 0028.");
  } else {
    ok(`Active methodology exists (RC-6632-15343 v${meth.version})`);
  }

  const { count: questions } = await admin
    .from("diagnostic_questions")
    .select("*", { head: true, count: "exact" });
  if (questions !== 52) {
    fail("Diagnostic questions", `se esperaban 52 preguntas y hay ${questions ?? 0}. Aplica las migraciones 0018/0022.`);
  } else {
    ok("Diagnostic questions seeded (52)");
  }

  const { count: classifications } = await admin
    .from("material_classifications")
    .select("*", { head: true, count: "exact" });
  if ((classifications ?? 0) < 10) {
    fail("Material classifications", `se esperaban 10 clasificaciones y hay ${classifications ?? 0}. Aplica la migración 0022.`);
  } else {
    ok(`Material classifications seeded (${classifications})`);
  }

  finish();
}

function finish() {
  if (failures > 0) {
    console.error(`\nResultado: ${failures} chequeo(s) en rojo. Revisa docs/STAGING_DEPLOYMENT.md → Troubleshooting.`);
    process.exit(1);
  }
  console.log("\nResultado: staging listo ✅");
}

main().catch((err) => {
  console.error(`❌ Error inesperado: ${(err as Error).message}`);
  process.exit(1);
});
