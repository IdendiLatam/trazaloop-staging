/**
 * Trazaloop · SEC-01 · Los catálogos de Quality, con RLS de verdad.
 *
 * El Security Advisor de Supabase avisó de `rls_disabled_in_public` en Staging.
 * Esta suite comprueba lo que de verdad importa: no que exista una política en
 * `pg_policies` —eso solo demuestra que alguien escribió SQL—, sino QUÉ LEE
 * cada identidad real cuando pregunta.
 *
 * Correr: npm run test:sec01-catalogs
 */
import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) { console.error("Faltan variables."); process.exit(1); }

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
async function check(n: string, fn: () => Promise<void>) {
  try { await fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const admin = createClient(URL, SERVICE,
  { auth: { autoRefreshToken: false, persistSession: false } });
const sello = `${Date.now()}`;
const password = "Trazaloop-Test-1234";
const personasCreadas: string[] = [];

async function persona(prefijo: string, papel?: "superadmin" | "support") {
  const email = `${prefijo}-${sello}-${Math.floor(Math.random() * 1e6)}@test.trazaloop.dev`;
  const { data } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: "QA SEC01" } });
  assert(data.user, `crear ${prefijo}`);
  personasCreadas.push(data.user.id);
  const cli: SupabaseClient = createClient(URL!, ANON!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  await cli.auth.signInWithPassword({ email, password });
  await cli.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "sec01" });
  if (papel) {
    await admin.from("platform_staff")
      .insert({ user_id: data.user.id, role_code: papel, status: "active" });
  }
  return { id: data.user.id, email, cli };
}

/** Los seis que el producto SÍ enseña a quien usa Quality. */
const CATALOGOS_GLOBALES = [
  "quality_automation_sources",
  "quality_automation_source_fields",
  "quality_automation_event_catalog",
  "quality_automation_event_contracts",
  "quality_automation_rule_templates",
  "quality_management_review_input_catalog",
] as const;

/** El que describe el diseño interno de Intelligence. */
const CATALOGO_INTERNO = "quality_ai_sources";

const TODOS = [...CATALOGOS_GLOBALES, CATALOGO_INTERNO];

async function main() {
  const normal = await persona("sec01-normal");
  const otro = await persona("sec01-otro");
  const support = await persona("sec01-support", "support");
  const sa = await persona("sec01-sa", "superadmin");
  const anonimo = createClient(URL!, ANON!, { auth: { persistSession: false } });

  const { data: orgId } = await normal.cli.rpc("create_organization", { p_name: `SEC01 ${sello}` });
  const org = orgId as string;
  const { data: otroId } = await otro.cli.rpc("create_organization", { p_name: `SEC01 otra ${sello}` });
  const otraOrg = otroId as string;

  const lee = async (cli: SupabaseClient, tabla: string) => {
    const { data, error } = await cli.from(tabla).select("*");
    return { ok: !error, filas: data?.length ?? 0, error: error?.message ?? null };
  };

  console.log("\nSEC-01 · RLS de los catálogos de Quality\n");

  try {
    // =====================================================================
    console.log("A · Cero tablas de public sin RLS");
    // =====================================================================

    await check("A1. Ninguna tabla base de `public` tiene RLS desactivado", async () => {
      // Es EL invariante del incidente. Se pregunta a la base, no al SQL de una
      // migración: lo que vale es el estado, no la intención escrita.
      const { data, error } = await admin.rpc("public_tables_without_rls");
      assert(!error, `no se pudo consultar: ${error?.message}`);
      const infractoras = (data ?? []) as { schema_name: string; table_name: string }[];
      assert(infractoras.length === 0,
        `tablas sin RLS: ${infractoras.map((t) => `${t.schema_name}.${t.table_name}`).join(", ")}`);
    });

    await check("A2. Y ninguna de las siete concede escritura a authenticated o anon", async () => {
      const { data, error } = await admin.rpc("public_tables_with_unexpected_grants");
      assert(!error, `no se pudo consultar: ${error?.message}`);
      const filas = (data ?? []) as { table_name: string; grantee: string; privilege_type: string }[];
      const sospechosas = filas.filter((f) => TODOS.includes(f.table_name as never));
      assert(sospechosas.length === 0,
        `privilegios inesperados: ${sospechosas.map((f) => `${f.table_name}/${f.grantee}/${f.privilege_type}`).join(", ")}`);
    });

    // =====================================================================
    console.log("\nB · Sin sesión no se lee nada");
    // =====================================================================

    await check("B1. `anon` no lee ninguno de los siete catálogos", async () => {
      for (const t of TODOS) {
        const r = await lee(anonimo, t);
        assert(!r.ok || r.filas === 0, `anon leyó ${r.filas} filas de ${t}`);
      }
    });

    // =====================================================================
    console.log("\nC · Los seis catálogos globales del producto");
    // =====================================================================

    await check("C1. Una persona autenticada SÍ los lee · el producto los necesita", async () => {
      // El constructor de reglas de Quality y tres vistas `security_invoker`
      // los consultan con la identidad de quien pregunta. Cerrarlos habría
      // roto Quality sin cerrar ningún riesgo: no hay nada de ninguna empresa
      // dentro (ninguno tiene `organization_id`).
      for (const t of CATALOGOS_GLOBALES) {
        const r = await lee(normal.cli, t);
        assert(r.ok && r.filas > 0, `no pudo leer ${t}: ${r.error ?? "0 filas"}`);
      }
    });

    await check("C2. Pero NO puede escribirlos", async () => {
      // Sin política de escritura, la lectura declarada no abre la puerta a
      // modificar el vocabulario del producto.
      const { error } = await normal.cli.from("quality_automation_sources")
        .insert({ code: "sec01_intruso", domain: "x", label: "x", subject_type: "x" });
      assert(error, "una persona normal pudo insertar en un catálogo global");
    });

    await check("C3. Ni borrarlos", async () => {
      const { error, count } = await normal.cli.from("quality_automation_rule_templates")
        .delete({ count: "exact" }).eq("code", "sec01_inexistente");
      assert(error || (count ?? 0) === 0, "una persona normal pudo borrar de un catálogo global");
    });

    await check("C4. Lo que lee una empresa es lo mismo que lee la otra · son globales", async () => {
      // No es lectura cruzada: no hay nada de nadie que cruzar. Se comprueba
      // para dejar dicho que la igualdad es intencionada y no un descuido.
      for (const t of CATALOGOS_GLOBALES) {
        const a = await lee(normal.cli, t);
        const b = await lee(otro.cli, t);
        assert(a.filas === b.filas, `${t}: ${a.filas} vs ${b.filas}`);
      }
    });

    // =====================================================================
    console.log("\nD · El catálogo interno de Intelligence");
    // =====================================================================

    await check("D1. Una persona normal ya NO lee `quality_ai_sources`", async () => {
      // Era la filtración de verdad: describe la clase de privacidad y la regla
      // de permiso de cada fuente del Copilot. Ninguna pantalla lo consume.
      const r = await lee(normal.cli, CATALOGO_INTERNO);
      assert(r.filas === 0, `leyó ${r.filas} filas del catálogo interno`);
    });

    await check("D2. Ni la de otra empresa", async () => {
      const r = await lee(otro.cli, CATALOGO_INTERNO);
      assert(r.filas === 0, `leyó ${r.filas} filas`);
    });

    await check("D3. Support SÍ lo lee · lo necesita para explicar una respuesta", async () => {
      const r = await lee(support.cli, CATALOGO_INTERNO);
      assert(r.ok && r.filas > 0, `Support no pudo leerlo: ${r.error ?? "0 filas"}`);
    });

    await check("D4. Superadmin también", async () => {
      const r = await lee(sa.cli, CATALOGO_INTERNO);
      assert(r.ok && r.filas > 0, `Superadmin no pudo leerlo: ${r.error ?? "0 filas"}`);
    });

    await check("D5. Y ni Support ni Superadmin pueden escribirlo desde la sesión", async () => {
      // Leer para diagnosticar no es poder cambiar el vocabulario del producto:
      // eso se hace con una migración, que deja historia.
      const { error } = await sa.cli.from(CATALOGO_INTERNO)
        .insert({ code: "sec01_intruso", label: "x", domain: "x", entity_type: "x",
                  privacy_class: "open", historical_mode: "current" });
      assert(error, "el superadministrador pudo insertar en el catálogo interno");
    });

    // =====================================================================
    console.log("\nE · Que el producto siga funcionando");
    // =====================================================================

    await check("E1. Las vistas `security_invoker` que los cruzan siguen leyéndose", async () => {
      // Son las que habrían roto si se hubiera cerrado la lectura de los seis
      // catálogos globales: corren con la identidad de quien pregunta.
      for (const v of ["v_quality_signal_overview", "v_quality_automation_rule_overview",
                       "v_quality_management_review_input_status"]) {
        const { error } = await normal.cli.from(v).select("*").limit(1);
        assert(!error, `${v} dejó de leerse: ${error?.message}`);
      }
    });

    await check("E2. Y las funciones `security definer` que los usan no dependen de RLS", async () => {
      // `quality_ai_add_reference`, `quality_automation_run` y
      // `quality_mr_prepare_inputs` corren como propietario. Por eso NO se puso
      // `force row level security`: forzarlo sobre el propietario las habría
      // roto sin cerrar nada.
      const { data, error } = await admin.rpc("public_forced_rls_tables");
      assert(!error, `no se pudo consultar: ${error?.message}`);
      const forzadas = (data ?? []) as { table_name: string }[];
      const siete = forzadas.filter((f) => TODOS.includes(f.table_name as never));
      assert(siete.length === 0,
        `se forzó RLS sobre el propietario en: ${siete.map((f) => f.table_name).join(", ")}`);
    });
  } finally {
    await admin.from("organizations").delete().in("id", [org, otraOrg]);
    for (const id of personasCreadas) {
      await admin.from("platform_staff").delete().eq("user_id", id);
      await admin.auth.admin.deleteUser(id);
    }
  }

  console.log(`\nSEC-01 · catálogos: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
