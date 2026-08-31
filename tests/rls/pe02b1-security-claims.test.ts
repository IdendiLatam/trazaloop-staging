/**
 * Trazaloop · PE-02B1 · Lo que se puede afirmar, y lo que no sale de aquí.
 *
 * Dos cosas distintas en una suite:
 *
 *   · la BARRERA de publicación — una respuesta cuya verificación depende de un
 *     tercero, o que no se pudo comprobar, no se publica. Y no es un aviso en
 *     una pantalla: es un rechazo de la base.
 *
 *   · las MEDIDAS de aislamiento que PE-02A tomó y que sostienen la respuesta
 *     pública más fuerte del producto —«no, otra empresa no puede ver tu
 *     información»—. Se comprueban como INVARIANTES, no como fotografías: no se
 *     cuenta cuántas tablas hay, se comprueba que ninguna con datos de empresa
 *     se quedó sin control de acceso.
 *
 * Correr: npm run test:pe02b1-security-claims
 */
import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DB = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
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

async function main() {
  // El cliente de Postgres se importa DENTRO, como hacen las demás suites que
  // consultan el catálogo del sistema. Un `import` de `pg` en la cabecera entra
  // en el grafo que rastrea el compilador de la aplicación y le hace agotar la
  // memoria: la prueba tumbaría la compilación sin tocar una línea de producto.
  const { Client } = await import("pg");
  const pg = new Client({ connectionString: DB });
  await pg.connect();
  const q = async (sql: string) => (await pg.query(sql)).rows;

  const email = `pe02b1-claims-${sello}@test.trazaloop.dev`;
  const password = "Trazaloop-Test-1234";
  const { data: creado } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: "QA PE-02B1 claims" } });
  assert(creado.user, "crear persona");
  const sa: SupabaseClient = createClient(URL!, ANON!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: eLogin } = await sa.auth.signInWithPassword({ email, password });
  assert(!eLogin, `login: ${eLogin?.message}`);
  await admin.from("platform_staff")
    .insert({ user_id: creado.user.id, role_code: "superadmin", status: "active" });

  console.log("\nPE-02B1 · Lo que se puede afirmar\n");

  const { data: cat } = await sa.from("faq_categories")
    .select("id").eq("code", "seguridad").single();
  const categoria = (cat as { id: string }).id;

  /** Una entrada con su borrador, para intentar publicarla. */
  async function preparar(slug: string, estado: string, extra: Record<string, unknown> = {}) {
    const { data, error } = await sa.from("faq_entries")
      .insert({ slug, category_id: categoria, visibility: "public" })
      .select("id").single();
    assert(!error && data, `crear ${slug}: ${error?.message}`);
    const id = (data as { id: string }).id;
    const { error: eb } = await sa.from("faq_entry_drafts").insert({
      entry_id: id, language: "es",
      question: "¿Pregunta de prueba de procedencia?",
      answer_short: "Respuesta de prueba.",
      verification_status: estado, ...extra,
    });
    assert(!eb, `borrador ${slug}: ${eb?.message}`);
    return id;
  }

  // ==========================================================================
  console.log("P · La barrera de publicación");
  // ==========================================================================

  await check("P1. Lo que depende de un tercero sin verificar NO se publica",
    async () => {
      // Es literalmente el caso de la pregunta del entrenamiento de modelos:
      // hasta que la política del proveedor esté comprobada y fechada, no sale.
      const id = await preparar(`qa_ext_${sello}`, "external_policy_verification_required");
      const { error } = await sa.rpc("faq_publish_entry",
        { p_entry_id: id, p_language: "es" });
      assert(error, "se publicó una respuesta pendiente de verificación externa");
      assert(/no se puede publicar/i.test(error!.message),
        `el rechazo no se explica: ${error!.message}`);
      const { data } = await sa.from("faq_entries").select("status").eq("id", id).single();
      assert((data as { status: string }).status === "draft",
        "la entrada cambió de estado pese al rechazo");
    });

  await check("P2. Lo que no se pudo comprobar, tampoco", async () => {
    const id = await preparar(`qa_nv_${sello}`, "not_verified");
    const { error } = await sa.rpc("faq_publish_entry",
      { p_entry_id: id, p_language: "es" });
    assert(error, "se publicó una respuesta sin comprobar");
  });

  await check("P3. Y lo que sería falso, menos todavía", async () => {
    const id = await preparar(`qa_mnc_${sello}`, "must_not_claim");
    const { error } = await sa.rpc("faq_publish_entry",
      { p_entry_id: id, p_language: "es" });
    assert(error, "se publicó una afirmación marcada como no afirmable");
  });

  await check("P4. Lo verificado sí, y queda con su procedencia", async () => {
    const id = await preparar(`qa_ok_${sello}`, "verified",
      { source_basis: "PE-02A §1 · 275 de 282 tablas con control por fila" });
    const { error } = await sa.rpc("faq_publish_entry",
      { p_entry_id: id, p_language: "es", p_change_note: "alta" });
    assert(!error, `no se publicó lo verificado: ${error?.message}`);
    const { data } = await sa.from("faq_entry_revisions")
      .select("source_basis, verified_at, created_by, change_note")
      .eq("entry_id", id).single();
    const r = data as Record<string, unknown>;
    assert(String(r.source_basis).includes("PE-02A"), "la revisión perdió su base");
    assert(r.verified_at !== null, "no se fechó la verificación");
    assert(r.created_by === creado.user!.id, "no se registró quién publicó");
    assert(r.change_note === "alta", "no se registró la nota del cambio");
  });

  await check("P5. Una salvedad que no se escribe no es una salvedad", async () => {
    const id = await preparar(`qa_qual_${sello}`, "verified_with_qualifier");
    const { error } = await sa.rpc("faq_publish_entry",
      { p_entry_id: id, p_language: "es" });
    assert(error, "se publicó «verificada con salvedad» sin decir cuál");
    assert(/salvedad/i.test(error!.message), `mensaje raro: ${error!.message}`);

    // Con la salvedad escrita, sí. Es el caso de la respuesta sobre el acceso
    // del personal de Trazaloop: cierta, y con un párrafo que no se puede quitar.
    await sa.from("faq_entry_drafts").update({
      verification_note: "La administración técnica de la infraestructura implica acceso a los sistemas.",
    }).eq("entry_id", id).eq("language", "es");
    const { error: e2 } = await sa.rpc("faq_publish_entry",
      { p_entry_id: id, p_language: "es" });
    assert(!e2, `no se publicó con la salvedad escrita: ${e2?.message}`);
  });

  await check("P6. Una comprobación externa sin fecha no es una comprobación",
    async () => {
      const id = await preparar(`qa_url_${sello}`, "verified", {
        external_source_url: "https://openai.com/policies/",
      });
      const { error } = await sa.rpc("faq_publish_entry",
        { p_entry_id: id, p_language: "es" });
      assert(error, "se publicó una fuente externa sin fecha de comprobación");

      await sa.from("faq_entry_drafts")
        .update({ external_source_checked_on: "2026-08-31" })
        .eq("entry_id", id).eq("language", "es");
      const { error: e2 } = await sa.rpc("faq_publish_entry",
        { p_entry_id: id, p_language: "es" });
      assert(!e2, `no se publicó con la fecha puesta: ${e2?.message}`);
      const { data } = await sa.from("faq_entry_revisions")
        .select("external_source_url, external_source_checked_on")
        .eq("entry_id", id).single();
      assert((data as { external_source_checked_on: string }).external_source_checked_on
        === "2026-08-31", "la fecha de comprobación no viajó a la revisión");
    });

  await check("P7. La barrera vive en la base, no en la pantalla", async () => {
    // Se intenta por el camino que tendría alguien con acceso a la base: crear
    // la revisión a mano. No hay permiso de escritura sobre las revisiones.
    const id = await preparar(`qa_mano_${sello}`, "must_not_claim");
    const { error } = await sa.from("faq_entry_revisions").insert({
      entry_id: id, revision_number: 1, question: "¿Colada por la puerta de atrás?",
      answer_short: "Trazaloop está certificada en ISO 27001.",
      verification_status: "must_not_claim", content_hash: "0".repeat(64),
    });
    assert(error, "se pudo escribir una revisión saltándose la publicación");
  });

  // ==========================================================================
  console.log("\nR · Las medidas que sostienen la respuesta pública");
  // ==========================================================================

  await check("R1. Ninguna tabla con datos de empresa sin control por fila",
    async () => {
      const filas = await q(`
        select t.tablename from pg_tables t
        where t.schemaname = 'public' and not t.rowsecurity
          and exists (select 1 from information_schema.columns c
                      where c.table_schema = 'public' and c.table_name = t.tablename
                        and c.column_name = 'organization_id')`);
      assert(filas.length === 0,
        `hay tablas con organization_id sin RLS: ${filas.map((r) => r.tablename).join(", ")}`);
    });

  await check("R2. Ninguna lectura abierta sobre datos de empresa", async () => {
    const filas = await q(`
      select p.tablename, p.policyname from pg_policies p
      where p.schemaname = 'public' and p.cmd in ('SELECT', 'ALL')
        and (p.qual is null or btrim(p.qual) = 'true')
        and exists (select 1 from information_schema.columns c
                    where c.table_schema = 'public' and c.table_name = p.tablename
                      and c.column_name = 'organization_id')`);
    assert(filas.length === 0,
      `políticas abiertas: ${filas.map((r) => `${r.tablename}.${r.policyname}`).join(", ")}`);
  });

  await check("R3. Toda clave compuesta con empresa la lleva en los dos lados",
    async () => {
      const filas = await q(`
        select conrelid::regclass::text as t, pg_get_constraintdef(oid) as def
        from pg_constraint
        where contype = 'f' and array_length(conkey, 1) > 1
          and pg_get_constraintdef(oid) like '%organization_id%'
          and pg_get_constraintdef(oid) not like 'FOREIGN KEY (organization_id,%'`);
      assert(filas.length === 0,
        `claves compuestas sospechosas: ${filas.map((r) => r.t).join(", ")}`);
    });

  await check("R4. El rol anónimo solo alcanza lo que se decidió que alcanzara",
    async () => {
      const filas = await q(`
        select p.tablename, p.policyname from pg_policies p
        where p.schemaname = 'public'
          and (p.roles::text like '%anon%')`);
      const permitidas = new Set(["legal_documents"]);
      const intrusas = filas.filter((r) => !permitidas.has(String(r.tablename)));
      assert(intrusas.length === 0,
        `políticas nuevas que alcanzan al anónimo: ${intrusas.map((r) => `${r.tablename}.${r.policyname}`).join(", ")}`);
    });

  // ==========================================================================
  console.log("\nS · La FAQ, medida con la misma vara");
  // ==========================================================================

  await check("S1. La FAQ no tiene organization_id, y es a propósito", async () => {
    const filas = await q(`
      select table_name from information_schema.columns
      where table_schema = 'public' and table_name like 'faq_%'
        and column_name = 'organization_id'`);
    assert(filas.length === 0,
      "la FAQ tiene organization_id: o es dato de empresa, o sobra la columna");
    const tablas = await q(`
      select tablename, rowsecurity from pg_tables
      where schemaname = 'public' and tablename like 'faq_%'`);
    assert(tablas.length === 4, `hay ${tablas.length} tablas de FAQ y deberían ser 4`);
    assert(tablas.every((r) => r.rowsecurity),
      "alguna tabla de la FAQ se quedó sin control de acceso por fila");
  });

  await check("S2. El anónimo no tiene permiso sobre las tablas, solo sobre las vistas",
    async () => {
      const tablas = await q(`
        select table_name, privilege_type from information_schema.role_table_grants
        where table_schema = 'public' and table_name like 'faq\\_%' and grantee = 'anon'`);
      assert(tablas.length === 0,
        `el anónimo tiene permisos sobre tablas de FAQ: ${tablas.map((r) => `${r.table_name}:${r.privilege_type}`).join(", ")}`);

      const vistas = await q(`
        select table_name, privilege_type from information_schema.role_table_grants
        where table_schema = 'public' and table_name like 'v\\_faq%' and grantee = 'anon'`);
      assert(vistas.length > 0, "el anónimo no puede leer ninguna vista de FAQ");
      assert(vistas.every((r) => r.privilege_type === "SELECT"),
        `el anónimo tiene más que lectura: ${vistas.map((r) => `${r.table_name}:${r.privilege_type}`).join(", ")}`);
      const nombres = new Set(vistas.map((r) => String(r.table_name)));
      assert(!nombres.has("v_faq_authenticated"),
        "el anónimo tiene permiso sobre la vista de quien tiene sesión");
    });

  await check("S3. Las funciones de la FAQ están acotadas como manda §25", async () => {
    const filas = await q(`
      select p.proname, p.prosecdef,
             pg_get_functiondef(p.oid) like '%search_path%' as fija_search_path,
             pg_get_function_result(p.oid) as retorno
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname like 'faq\\_%'`);
    assert(filas.length === 4, `hay ${filas.length} funciones de FAQ y deberían ser 4`);
    for (const f of filas) {
      assert(f.prosecdef, `${f.proname} no es security definer`);
      assert(f.fija_search_path, `${f.proname} no fija su search_path`);
      assert(!/setof record|record$/i.test(String(f.retorno)),
        `${f.proname} devuelve un tipo abierto: ${f.retorno}`);
    }
    const ejec = await q(`
      select p.proname, r.rolname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      cross join lateral aclexplode(p.proacl) a
      join pg_roles r on r.oid = a.grantee
      where n.nspname = 'public' and p.proname like 'faq\\_%' and a.privilege_type = 'EXECUTE'`);
    const paraAnon = ejec.filter((r) => r.rolname === "anon");
    assert(paraAnon.length === 0,
      `el anónimo puede ejecutar: ${paraAnon.map((r) => r.proname).join(", ")}`);
  });

  await check("S4. Las vistas públicas no exponen procedencia interna", async () => {
    const filas = await q(`
      select table_name, column_name from information_schema.columns
      where table_schema = 'public' and table_name in
        ('v_faq_public', 'v_faq_authenticated', 'v_faq_public_categories')`);
    const prohibidas = ["source_basis", "verification_note", "verification_status",
      "verified_at", "change_note", "created_by", "updated_by", "external_source_url",
      "content_hash", "effective_to", "superseded_by_revision_id"];
    for (const f of filas) {
      assert(!prohibidas.includes(String(f.column_name)),
        `${f.table_name} expone «${f.column_name}»`);
    }
  });

  await check("S5. La aplicabilidad por módulo usa el catálogo canónico", async () => {
    const [def] = await q(`
      select pg_get_constraintdef(oid) as def from pg_constraint
      where conname = 'faq_entries_module_keys_check'`);
    assert(def, "no existe la restricción de claves de módulo");
    for (const clave of ["cpr", "textiles", "quality", "construccion"]) {
      assert(String(def.def).includes(clave),
        `la restricción no admite la clave canónica «${clave}»`);
    }
    // Y no hay una segunda lista: la de tickets tiene otras palabras y no debe
    // haberse colado aquí.
    for (const ajena of ["trazadocs", "diagnostic", "recycled_content", "platform"]) {
      assert(!String(def.def).includes(`'${ajena}'`),
        `se coló el vocabulario de otro dominio: «${ajena}»`);
    }
  });

  await pg.end();
  console.log(`\nPE-02B1 · afirmaciones: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
