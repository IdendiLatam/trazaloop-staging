/**
 * Trazaloop · PE-02B5A · Las medidas que sostienen lo que se va a afirmar.
 *
 * La FAQ de seguridad va a decir en público que otra empresa no puede ver la
 * información de la tuya. Esta suite comprueba que eso siga siendo cierto —como
 * INVARIANTE, no como fotografía: no se cuenta cuántas tablas hay, se comprueba
 * que ninguna con datos de empresa se quedó sin control de acceso—.
 *
 * Si un sprint futuro rompe una de estas, la respuesta publicada pasa a ser
 * falsa. Por eso viven aquí y no en un documento.
 *
 * Correr: npm run test:pe02b5a-security-audit
 */
import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const DB = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
// Esta suite mira el catálogo del sistema y comprueba lo que alcanza QUIEN NO HA
// ENTRADO: no necesita la clave de servicio, y no tenerla es parte del punto.
if (!URL || !ANON) { console.error("Faltan variables."); process.exit(1); }

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
async function check(n: string, fn: () => Promise<void>) {
  try { await fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const anonimo: SupabaseClient = createClient(URL, ANON,
  { auth: { autoRefreshToken: false, persistSession: false } });

async function main() {
  const { Client } = await import("pg");
  const pg = new Client({ connectionString: DB });
  await pg.connect();
  const q = async (sql: string) => (await pg.query(sql)).rows;

  console.log("\nPE-02B5A · Lo que sostiene la FAQ de seguridad\n");

  // =========================================================================
  console.log("A · Aislamiento entre empresas");
  // =========================================================================

  await check("A1. Ninguna tabla con datos de empresa sin control por fila", async () => {
    const filas = await q(`
      select t.tablename from pg_tables t
      where t.schemaname = 'public' and not t.rowsecurity
        and exists (select 1 from information_schema.columns c
                    where c.table_schema = 'public' and c.table_name = t.tablename
                      and c.column_name = 'organization_id')`);
    assert(filas.length === 0,
      `hay tablas con organization_id sin RLS: ${filas.map((r) => r.tablename).join(", ")}`);
  });

  await check("A2. Y las que no lo tienen son catálogos sin empresa", async () => {
    const filas = await q(`
      select t.tablename,
             exists (select 1 from information_schema.columns c
                     where c.table_schema='public' and c.table_name=t.tablename
                       and c.column_name='organization_id') as tiene_org
      from pg_tables t where t.schemaname='public' and not t.rowsecurity`);
    for (const f of filas) {
      assert(f.tiene_org === false, `${f.tablename} no tiene RLS y sí tiene organization_id`);
    }
    // Y ninguna de ellas se concede al anónimo.
    const alAnonimo = await q(`
      select table_name from information_schema.role_table_grants
      where table_schema='public' and grantee='anon'
        and table_name in (select tablename from pg_tables where schemaname='public' and not rowsecurity)`);
    assert(alAnonimo.length === 0,
      `catálogos sin RLS concedidos al anónimo: ${alAnonimo.map((r) => r.table_name).join(", ")}`);
  });

  await check("A3. Ninguna lectura abierta sobre datos de empresa", async () => {
    const filas = await q(`
      select p.tablename, p.policyname from pg_policies p
      where p.schemaname='public' and p.cmd in ('SELECT','ALL')
        and (p.qual is null or btrim(p.qual) = 'true')
        and exists (select 1 from information_schema.columns c
                    where c.table_schema='public' and c.table_name=p.tablename
                      and c.column_name='organization_id')`);
    assert(filas.length === 0,
      `políticas abiertas: ${filas.map((r) => `${r.tablename}.${r.policyname}`).join(", ")}`);
  });

  await check("A4. Toda clave compuesta con empresa la lleva en los dos lados", async () => {
    const filas = await q(`
      select conrelid::regclass::text as t from pg_constraint
      where contype='f' and array_length(conkey,1) > 1
        and pg_get_constraintdef(oid) like '%organization_id%'
        and pg_get_constraintdef(oid) not like 'FOREIGN KEY (organization_id,%'`);
    assert(filas.length === 0,
      `claves compuestas sin acotar: ${filas.map((r) => r.t).join(", ")}`);
    const total = await q(`
      select count(*)::int as n from pg_constraint
      where contype='f' and array_length(conkey,1) > 1
        and pg_get_constraintdef(oid) like '%organization_id%'`);
    assert(total[0].n > 300, `solo hay ${total[0].n} claves compuestas acotadas`);
  });

  // =========================================================================
  console.log("\nB · Lo que alcanza quien no ha entrado");
  // =========================================================================

  await check("B1. Solo lo que se decidió que alcanzara", async () => {
    const filas = await q(`
      select p.tablename, p.policyname from pg_policies p
      where p.schemaname='public' and p.roles::text like '%anon%'`);
    const permitidas = new Set(["legal_documents"]);
    const intrusas = filas.filter((r) => !permitidas.has(String(r.tablename)));
    assert(intrusas.length === 0,
      `políticas nuevas que alcanzan al anónimo: ${intrusas.map((r) => `${r.tablename}.${r.policyname}`).join(", ")}`);
  });

  await check("B2. Una vista con datos de empresa evalúa la RLS de quien pregunta",
    async () => {
      // La distinción que documentó 0141: una vista SIN `security_invoker` la
      // evalúa su propietario y salta la RLS —ahí el permiso ES acceso—; una
      // CON él la evalúa quien pregunta, y al anónimo le devuelve cero filas.
      //
      // Así que la regla no es «ninguna vista con empresa se concede al
      // anónimo»: es que si se concede, tiene que ser de las que respetan la
      // RLS. Treinta lo hacen hoy.
      const vistas = await q(`
        select distinct g.table_name,
               coalesce((select option_value from pg_options_to_table(c.reloptions)
                         where option_name = 'security_invoker'), 'no') as invoker
        from information_schema.role_table_grants g
        join pg_views v on v.viewname = g.table_name and v.schemaname = 'public'
        join pg_class c on c.relname = g.table_name
        where g.table_schema='public' and g.grantee='anon' and g.privilege_type='SELECT'
          and exists (select 1 from information_schema.columns col
                      where col.table_schema='public' and col.table_name=g.table_name
                        and col.column_name='organization_id')`);
      const peligrosas = vistas.filter((v) => String(v.invoker) !== "true");
      assert(peligrosas.length === 0,
        `vistas con empresa que se conceden al anónimo SIN respetar la RLS: ${peligrosas.map((v) => v.table_name).join(", ")}`);
    });

  await check("B3. Y en la práctica no lee ni una fila de empresa", async () => {
    // La comprobación que de verdad importa: se PIDE, con la clave pública, a
    // unas cuantas tablas con datos de empresa, y no vuelve nada.
    for (const tabla of ["audit_dossiers", "quality_processes", "quality_risks",
      "evidences", "trazadoc_documents", "organizations", "memberships"]) {
      const { data, error } = await anonimo.from(tabla).select("id").limit(1);
      assert(error || !data || data.length === 0,
        `el anónimo leyó una fila de ${tabla}`);
    }
  });

  // =========================================================================
  console.log("\nC · El personal de plataforma");
  // =========================================================================

  await check("C1. Solo alcanza datos administrativos y de soporte", async () => {
    const filas = await q(`
      select distinct p.tablename from pg_policies p
      where p.schemaname='public'
        and (p.qual like '%is_platform_staff%' or p.qual like '%is_platform_superadmin%')
        and exists (select 1 from information_schema.columns c
                    where c.table_schema='public' and c.table_name=p.tablename
                      and c.column_name='organization_id')
      order by 1`);
    const esperadas = new Set(["intelligence_limit_overrides", "intelligence_usage_limits",
      "organization_subscriptions", "subscription_plan_history", "support_tickets",
      "support_ticket_messages", "support_ticket_status_history"]);
    const nuevas = filas.map((r) => String(r.tablename)).filter((t) => !esperadas.has(t));
    assert(nuevas.length === 0,
      `la plataforma alcanza tablas de empresa nuevas: ${nuevas.join(", ")} — la respuesta publicada dejaría de ser cierta`);
  });

  await check("C2. No puede añadirse a una empresa", async () => {
    const filas = await q(`
      select policyname, coalesce(qual, with_check) as regla
      from pg_policies where tablename='memberships'`);
    assert(filas.length >= 4, `hay ${filas.length} políticas de membresía`);
    for (const f of filas) {
      assert(/is_org_admin/.test(String(f.regla)),
        `la política ${f.policyname} no exige administrador de la empresa`);
      assert(!/is_platform/.test(String(f.regla)),
        `la política ${f.policyname} da acceso a la plataforma`);
    }
  });

  await check("C3. Y no existe suplantación", async () => {
    const fs = await import("node:fs");
    const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true })
      .flatMap((e) => e.isDirectory()
        ? (e.name === "node_modules" || e.name === ".next" ? [] : walk(`${dir}/${e.name}`))
        : /\.(ts|tsx|sql)$/.test(e.name) ? [`${dir}/${e.name}`] : []);
    const infractores = [...walk("lib"), ...walk("server"), ...walk("app"),
      ...walk("supabase/migrations")]
      .filter((f) => /\b(impersonat|act_as|login_as|sudo_as)\b/i.test(fs.readFileSync(f, "utf8")));
    assert(infractores.length === 0, `hay suplantación: ${infractores.join(", ")}`);
  });

  // =========================================================================
  console.log("\nD · Archivos");
  // =========================================================================

  await check("D1. Los tres cubos siguen siendo privados", async () => {
    const filas = await q(`select id, public from storage.buckets order by id`);
    assert(filas.length === 3, `hay ${filas.length} cubos y eran 3`);
    for (const f of filas) {
      assert(f.public === false, `el cubo ${f.id} es público`);
    }
  });

  await check("D2. Y su lectura se acota a la empresa de la carpeta", async () => {
    const filas = await q(`
      select policyname, qual from pg_policies
      where schemaname='storage' and cmd='SELECT'`);
    assert(filas.length >= 3, `hay ${filas.length} políticas de lectura de almacenamiento`);
    for (const f of filas) {
      assert(/is_org_member/.test(String(f.qual)),
        `la política ${f.policyname} no acota por empresa`);
    }
  });

  // =========================================================================
  console.log("\nE · Trazaloop Intelligence");
  // =========================================================================

  await check("E1. El contexto se lee con la sesión, no con la clave de servicio",
    async () => {
      const fs = await import("node:fs");
      const archivos = fs.readdirSync("lib/ai/context").map((f) => `lib/ai/context/${f}`);
      for (const f of archivos) {
        const src = fs.readFileSync(f, "utf8")
          .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
        assert(!/createAdminClient|service_role/i.test(src),
          `${f} usa el cliente administrativo: la IA estaría elevando permisos`);
      }
      assert(archivos.length > 0, "no se encontró el constructor de contexto");
    });

  await check("E2. El modelo no recibe herramientas de base, web ni ficheros", async () => {
    const fs = await import("node:fs");
    const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true })
      .flatMap((e) => e.isDirectory() ? walk(`${dir}/${e.name}`)
        : /\.ts$/.test(e.name) ? [`${dir}/${e.name}`] : []);
    for (const f of walk("lib/ai")) {
      const src = fs.readFileSync(f, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      for (const h of ["web_search", "file_search", "code_interpreter", "retrieval"]) {
        assert(!src.includes(h), `${f} le da al modelo la herramienta «${h}»`);
      }
    }
  });

  await check("E3. Y se le pide al proveedor que no almacene", async () => {
    const fs = await import("node:fs");
    const openai = fs.readFileSync("lib/ai/providers/openai.ts", "utf8");
    assert(/store: false/.test(openai), "se dejó de pedir que no se almacene");
  });

  await check("E4. Las fuentes conocen su nivel de sensibilidad", async () => {
    const filas = await q(`
      select count(*)::int as n, count(*) filter (where privacy_class is null)::int as sin
      from quality_ai_sources`);
    assert(filas[0].n > 20, `solo hay ${filas[0].n} fuentes declaradas`);
    assert(filas[0].sin === 0, `${filas[0].sin} fuentes sin clase de privacidad`);
  });

  // =========================================================================
  console.log("\nF · Voz de cliente anónima");
  // =========================================================================

  await check("F1. La base rechaza identidad en una campaña anónima", async () => {
    const filas = await q(`
      select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname='public' and prosrc like '%anonymity_mode%'
        and prosrc like '%raise exception%'`);
    assert(filas.length > 0, "no hay ningún guardián del anonimato");
    const guardian = filas.map((r) => String(r.prosrc)).join("\n");
    for (const campo of ["respondent_name", "respondent_email", "customer_id",
      "contact_id", "invitation_id"]) {
      assert(guardian.includes(campo), `el guardián no protege «${campo}»`);
    }
  });

  await check("F2. Y las fuentes anónimas están marcadas como tales", async () => {
    const filas = await q(`
      select code from quality_ai_sources where privacy_class='anonymous' order by code`);
    assert(filas.length >= 2, `solo ${filas.length} fuentes marcadas anónimas`);
  });

  // =========================================================================
  console.log("\nG · Lo que NO existe, y por eso no se afirma");
  // =========================================================================

  await check("G1. No hay segundo factor, inicio único ni detección de filtraciones",
    async () => {
      const fs = await import("node:fs");
      const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true })
        .flatMap((e) => e.isDirectory() ? walk(`${dir}/${e.name}`)
          : /\.tsx?$/.test(e.name) ? [`${dir}/${e.name}`] : []);
      const implementado = [...walk("lib"), ...walk("server")]
        .filter((f) => /\b(enrollMFA|verifyOtp|challengeAndVerify|samlSso)\b/.test(
          fs.readFileSync(f, "utf8")));
      assert(implementado.length === 0,
        `hay autenticación reforzada implementada y la FAQ dice que no: ${implementado.join(", ")}`);
    });

  await check("G2. La FAQ pública no afirma nada de eso", async () => {
    const { data } = await anonimo.from("v_faq_public").select("answer_short, answer_long");
    const texto = (data ?? []).map((r) => {
      const x = r as { answer_short: string; answer_long: string | null };
      return `${x.answer_short} ${x.answer_long ?? ""}`;
    }).join(" ").toLowerCase();
    for (const p of ["segundo factor", "doble factor", "iso 27001", "soc 2",
      "cifrado de extremo a extremo", "conocimiento cero", "100 % segur",
      "inviolable", "imposible de vulnerar"]) {
      assert(!texto.includes(p), `una respuesta publicada afirma «${p}»`);
    }
  });

  await pg.end();
  console.log(`\nPE-02B5A · base de seguridad: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
