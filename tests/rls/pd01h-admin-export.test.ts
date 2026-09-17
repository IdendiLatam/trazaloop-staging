import { config as loadEnv } from "dotenv";
import { Client as PgClient } from "pg";
import { createClient } from "@supabase/supabase-js";

loadEnv({ path: ".env.local", quiet: true });

/**
 * Trazaloop · PUBLIC-DIAGNOSTICS-01H · La puerta anónima y la exportación.
 *
 * Tres cosas, contra base real:
 *
 *   · la superficie anónima MEDIDA, no deducida: se recorre el esquema entero
 *     como `anon` y se comprueba qué responde de verdad;
 *   · que ver y exportar participaciones exige superadministración, y que a
 *     una usuaria normal o a la administradora de una empresa se le niega; y
 *   · que una campaña de mil participaciones con 52 respuestas cada una se
 *     exporta ENTERA, sin que ninguna página se coma filas por el camino.
 *
 * El fixture de escala se CONFIRMA en la base —la exportación real viaja por
 * HTTP y no vería una transacción abierta— y se retira al terminar.
 *
 * Correr: npm run test:pd01h-db
 */

const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) { console.log("falta SUPABASE_DB_URL en .env.local"); process.exit(1); }

/** La lista CERRADA. Si nace una función pública sin pasar por aquí, sale roja. */
const PUBLIC_ANON_EXECUTE_ALLOWLIST = [
  "public_diagnostic_begin_submission",
  "public_diagnostic_get_assessment",
  "public_diagnostic_get_result",
  "public_diagnostic_resolve_campaign",
  "public_diagnostic_resume_submission",
  "public_diagnostic_save_progress",
  "quality_resolve_survey_token",
  "quality_submit_survey_response",
  "resolve_textile_passport_share",
];

/** Y las relaciones que se leen sin sesión, por diseño. */
/**
 * Las relaciones que se leen SIN SESIÓN, declaradas una a una.
 *
 * Las tres primeras vienen de 0202: los textos legales de `/terms` y
 * `/privacy`, y las preguntas frecuentes de `/faq`.
 *
 * Las tres últimas las añaden COMMERCIAL-UX-01D0 y 01D: el catálogo comercial
 * de `/planes` y la política de prueba que esa página anuncia. Lo mira quien
 * todavía no es cliente y por tanto no tiene sesión. Son VISTAS con proyección
 * fija —sin notas internas, sin borradores, sin revisiones retiradas, sin
 * recursos privados, sin auditoría— y las tablas de debajo siguen cerradas a
 * `anon`. La vista es la frontera; la tabla no se abre.
 *
 * Esta lista es la declaración, y el recorrido de más abajo la comprueba
 * intentando leer el esquema entero. Añadir una relación aquí sin querer es
 * fácil; que el recorrido no lo note, imposible.
 */
const RELACIONES_PUBLICAS = [
  "legal_documents", "v_faq_public", "v_faq_public_categories",
  "v_public_plan_catalog", "v_public_plan_limits", "v_public_trial_policy",
  "v_public_home_video",
];

let passed = 0, failed = 0;
async function check(nombre: string, fn: () => Promise<void>) {
  try { await fn(); passed += 1; console.log(`  ✔ ${nombre}`); }
  catch (e) { failed += 1; console.log(`  ✘ ${nombre}: ${e instanceof Error ? e.message : e}`); }
}
function assert(cond: boolean, mensaje: string) { if (!cond) throw new Error(mensaje); }

async function main() {
  const pg = new PgClient({ connectionString: DB_URL });
  await pg.connect();
  const q = async (sql: string, p: unknown[] = []) => (await pg.query(sql, p)).rows;

  /*
    Un cliente HTTP para la prueba de escala.

    `loadExportDataset` usa por omisión el cliente de la sesión, que necesita
    una petición de Next para leer cookies — y aquí no la hay. Se inyecta uno
    de servicio: lo que se mide es el RECORRIDO POR PÁGINAS contra PostgREST,
    que es donde estaba el riesgo de perder filas. Quién puede exportar se
    comprueba aparte, por rol, en el bloque B.
  */
  const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const CLAVE = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  /*
    Y solo si apuntan AL MISMO SITIO.

    `SUPABASE_DB_URL` puede llevar a Staging mientras las variables HTTP siguen
    mirando al stack local: entonces la exportación consultaría una base donde
    la campaña no existe y devolvería `null`. Eso no es un fallo del producto,
    así que no se cuenta como tal — se dice y se omite.
  */
  const anfitrion = (u: string) => { try { return new URL(u).hostname; } catch { return ""; } };
  const mismoStack = !!URL_SB && !!CLAVE
    && anfitrion(URL_SB) === anfitrion(String(DB_URL).replace(/^postgresql:/, "http:"));
  const clienteHttp = mismoStack
    ? createClient(URL_SB!, CLAVE!, { auth: { autoRefreshToken: false, persistSession: false } })
    : null;

  await q("set role postgres");

  // =========================================================================
  console.log("\nA · La superficie anónima, medida\n");
  // =========================================================================

  await q("begin");

  await check("Solo NUEVE funciones alcanzables por `anon`, y son las declaradas", async () => {
    const filas = await q(
      `select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.prokind='f'
          and has_function_privilege('anon', p.oid, 'EXECUTE') order by 1`);
    const nombres = filas.map((f) => f.proname as string);
    assert(JSON.stringify(nombres) === JSON.stringify(PUBLIC_ANON_EXECUTE_ALLOWLIST),
      `alcanzables: ${nombres.join(", ")}`);
  });

  await check("Y ninguna concesión heredada a `PUBLIC` sobre funciones", async () => {
    const filas = await q(
      `select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.prokind='f'
          and coalesce(array_to_string(p.proacl,','),'') ~ '(^|,)=X/' order by 1`);
    assert(filas.length === 0,
      `${filas.length} funciones siguen concedidas a PUBLIC: `
      + `${filas.slice(0, 5).map((f) => f.proname).join(", ")}…`);
  });

  await check("`anon` no puede ESCRIBIR en ninguna tabla", async () => {
    const filas = await q(
      `select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relkind in ('r','p')
          and (has_table_privilege('anon', c.oid,'INSERT')
            or has_table_privilege('anon', c.oid,'UPDATE')
            or has_table_privilege('anon', c.oid,'DELETE')) order by 1`);
    assert(filas.length === 0,
      `escribibles por anon: ${filas.map((f) => f.relname).join(", ")}`);
  });

  await check("Y solo LEE las declaradas · recorrido real del esquema", async () => {
    // No se mira el permiso: se INTENTA leer las 420 relaciones como `anon`.
    // Es la diferencia entre creer que está cerrado y saberlo.
    await q("savepoint barrido");
    await q("set local role anon");
    const conFilas: string[] = [];
    const permitidas: string[] = [];
    let denegadas = 0;
    const relaciones = await q(
      `select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relkind in ('r','p','v','m') order by 1`);
    for (const r of relaciones) {
      await q("savepoint una");
      try {
        const [n] = await q(`select count(*)::int c from public."${r.relname}"`);
        await q("release savepoint una");
        // NO alcanza con mirar si devolvió filas: una tabla vacía a la que
        // `anon` puede entrar está abierta igual, y se llenará algún día.
        permitidas.push(r.relname as string);
        if (n.c > 0) conFilas.push(r.relname as string);
      } catch {
        await q("rollback to savepoint una");
        denegadas += 1;
      }
    }
    await q("rollback to savepoint barrido");
    await q("set local role postgres");

    assert(JSON.stringify(permitidas.sort()) === JSON.stringify([...RELACIONES_PUBLICAS].sort()),
      `alcanzables por anon: ${permitidas.join(", ") || "ninguna"}`);
    // COMMERCIAL-UX-01E · Esto era una igualdad y ya no puede serlo.
    //
    // `v_public_home_video` está DECLARADA y puede estar legítimamente vacía:
    // mientras superadministración no publique un vídeo de portada, no hay
    // ninguno, y la portada simplemente no enseña aviso. Exigir que toda
    // relación declarada devuelva filas confundía «abierta» con «con
    // contenido», que son cosas distintas.
    //
    // La propiedad de SEGURIDAD no se toca y sigue siendo la igualdad exacta de
    // arriba —qué se puede ALCANZAR—. Aquí solo se exige que nada sin declarar
    // devuelva una sola fila.
    const indebidas = conFilas.filter((r) => !RELACIONES_PUBLICAS.includes(r));
    assert(indebidas.length === 0,
      `devuelven filas sin estar declaradas: ${indebidas.join(", ")}`);
    assert(denegadas === relaciones.length - RELACIONES_PUBLICAS.length,
      `${denegadas} denegadas de ${relaciones.length}: no cuadra con las `
      + `${RELACIONES_PUBLICAS.length} declaradas`);
    console.log(`      (${relaciones.length} relaciones recorridas · ${denegadas} denegadas)`);
  });

  await check("Los textos legales y el FAQ siguen leyéndose sin sesión", async () => {
    // La otra mitad: cerrar de más también es un defecto. `/terms`, `/privacy`
    // y `/faq` son públicos a propósito.
    await q("savepoint publico");
    await q("set local role anon");
    const [legales] = await q(`select count(*)::int c from public.legal_documents`);
    const [faq] = await q(`select count(*)::int c from public.v_faq_public`);
    await q("rollback to savepoint publico");
    await q("set local role postgres");
    assert(legales.c > 0, "los textos legales dejaron de leerse sin sesión");
    assert(faq.c > 0, "las preguntas frecuentes dejaron de leerse sin sesión");
  });

  await check("Una tabla nueva ya NO nace legible por `anon`", async () => {
    /*
      0202 cerró los privilegios por omisión para tablas y secuencias, y esto
      lo comprueba creando una de verdad.

      Para FUNCIONES esa vía no sirve —`ALTER DEFAULT PRIVILEGES … REVOKE
      EXECUTE FROM PUBLIC` es un no-op en este servidor— y se cierran con un
      disparador de evento, que se comprueba justo debajo.
    */
    await q(`create table _prueba_defecto(id int)`);
    const [t] = await q(
      `select has_table_privilege('anon','_prueba_defecto','SELECT') as p`);
    assert(t.p === false,
      "una tabla nueva nace legible por anon: el grifo por omisión se reabrió");
  });

  await check("Y una función nueva se cierra SOLA al crearse", async () => {
    /*
      `ALTER DEFAULT PRIVILEGES … REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` es un
      no-op en este servidor —se midió—, así que el cierre de las futuras lo
      hace un disparador de evento sobre `CREATE FUNCTION`. Esto lo comprueba
      creando una de verdad: declarar el disparador no basta, podría no
      dispararse y nadie se enteraría.
    */
    await q(`create function _cierre_automatico_probe() returns int
             language sql immutable as 'select 1'`);
    const [f] = await q(
      `select has_function_privilege('anon','_cierre_automatico_probe()','EXECUTE') as p,
              coalesce(array_to_string(proacl,','),'NULL') as acl
         from pg_proc where proname='_cierre_automatico_probe'`);
    assert(f.p === false,
      `una función nueva nació alcanzable por anon (acl=${f.acl}): el disparador no cerró`);

    // Y las nueve declaradas NO las toca: varias migraciones futuras harán
    // `create or replace` sobre ellas y no pueden perder su concesión.
    await q(`create or replace function public.public_diagnostic_get_result(p_token text)
             returns jsonb language plpgsql security definer set search_path to 'public'
             as $f$ begin return jsonb_build_object('status','not_found'); end $f$`);
    const [g] = await q(
      `select has_function_privilege('anon','public.public_diagnostic_get_result(text)','EXECUTE') as p`);
    assert(g.p === true,
      "reemplazar una de las nueve le quitó la concesión: la página pública se caería");

    // El propio disparador tampoco es alcanzable.
    const [d] = await q(
      `select has_function_privilege('anon','public.trazaloop_deny_public_execute()','EXECUTE') as p`);
    assert(d.p === false, "el disparador quedó alcanzable por anon");
  });

  await q("rollback");

  // =========================================================================
  console.log("\nB · Quién puede ver a los participantes\n");
  // =========================================================================

  await q("begin");

  const [v1] = await q(
    `select id from public.diagnostic_versions where diagnostic_type='pcr' and version_number=1`);
  const [doc] = await q(
    `select id, version, content_hash from public.legal_documents where status='active' limit 1`);
  const sello = Date.now();
  const [camp] = await q(
    `insert into public.public_diagnostic_campaigns
       (slug, name, diagnostic_type, diagnostic_version_id, consent_document_id,
        consent_version, consent_content_hash, public_title, partner_name,
        status, opens_at, closes_at)
     values ($1,$2,'pcr',$3,$4,$5,$6,'QA escala','Trazaloop QA','open',
             now() - interval '1 day', now() + interval '30 days')
     returning id`,
    [`qa-h-${sello}`, `QA H ${sello}`, v1.id, doc.id, doc.version, doc.content_hash]);

  await q(
    `insert into public.public_diagnostic_submissions
       (campaign_id, diagnostic_version_id, status, participant_name, participant_email,
        participant_email_normalized, company_name, consent_document_id, consent_version,
        consent_content_hash, consent_at, marketing_opt_in, marketing_opt_in_at, source)
     values ($1,$2,'in_progress','Ana','A@x.com','a@x.com','Empresa A',$3,$4,$5,now(),
             false,null,'public_link')`,
    [camp.id, v1.id, doc.id, doc.version, doc.content_hash]);

  const comoRol = async (rol: string, userId: string | null, sql: string) => {
    await q("savepoint r");
    await q(`set local role ${rol}`);
    if (userId) {
      await q(`select set_config('request.jwt.claims',
                 json_build_object('sub',$1::text,'role',$2::text)::text, true)`, [userId, rol]);
    } else {
      await q(`select set_config('request.jwt.claims', null, true)`);
    }
    let filas = -1; let err = "";
    try { const r = await q(sql); filas = Number(r[0]?.c ?? 0); }
    catch (e) { err = e instanceof Error ? e.message : String(e); }
    await q("rollback to savepoint r");
    await q("set local role postgres");
    return { filas, err };
  };
  const CONTAR = `select count(*)::int c from public.public_diagnostic_submissions`;

  await check("anon → DENY", async () => {
    const r = await comoRol("anon", null, CONTAR);
    assert(r.filas <= 0, `anon vio ${r.filas} participaciones`);
  });

  await check("Una usuaria autenticada normal → DENY", async () => {
    const [u] = await q(
      `select m.user_id from public.memberships m where m.status='active'
         and not exists (select 1 from public.platform_staff s
                          where s.user_id=m.user_id and s.status='active') limit 1`);
    assert(!!u, "el entorno no tiene una usuaria normal con la que probar");
    const r = await comoRol("authenticated", u.user_id as string, CONTAR);
    assert(r.filas === 0, `una usuaria normal vio ${r.filas} participaciones`);
  });

  await check("La administradora de una empresa → DENY", async () => {
    const [u] = await q(
      `select m.user_id from public.memberships m
        where m.status='active' and m.role_code in ('admin','owner')
          and not exists (select 1 from public.platform_staff s
                           where s.user_id=m.user_id and s.status='active') limit 1`);
    if (!u) { console.log("      (sin administradora de empresa; se omite)"); return; }
    const r = await comoRol("authenticated", u.user_id as string, CONTAR);
    assert(r.filas === 0, `una administradora de empresa vio ${r.filas} participaciones`);
  });

  await check("La superadministración de plataforma → ALLOW", async () => {
    const [u] = await q(
      `select s.user_id from public.platform_staff s
        where s.status='active' and s.role_code='superadmin' limit 1`);
    if (!u) { console.log("      (sin superadministración; se omite)"); return; }
    const r = await comoRol("authenticated", u.user_id as string, CONTAR);
    assert(r.filas >= 1, `la superadministración vio ${r.filas} participaciones`);
  });

  await check("Y los conteos por campaña también exigen superadministración", async () => {
    const [u] = await q(
      `select m.user_id from public.memberships m where m.status='active'
         and not exists (select 1 from public.platform_staff s
                          where s.user_id=m.user_id and s.status='active') limit 1`);
    const r = await comoRol("authenticated", u.user_id as string,
      `select count(*)::int c from public.public_diagnostic_campaign_counts()`);
    assert(r.filas === 0, `una usuaria normal obtuvo ${r.filas} conteos`);
    const [s] = await q(
      `select s.user_id from public.platform_staff s
        where s.status='active' and s.role_code='superadmin' limit 1`);
    if (!s) return;
    const r2 = await comoRol("authenticated", s.user_id as string,
      `select count(*)::int c from public.public_diagnostic_campaign_counts()`);
    assert(r2.filas >= 1, "la superadministración no obtuvo conteos");
  });

  await q("rollback");

  // =========================================================================
  console.log("\nC · Mil participaciones, 52 respuestas cada una\n");
  // =========================================================================

  const N = 1000;
  const slugEscala = `qa-escala-${sello}`;
  let campEscala = "";
  try {
    await q("begin");
    const [c] = await q(
      `insert into public.public_diagnostic_campaigns
         (slug, name, diagnostic_type, diagnostic_version_id, consent_document_id,
          consent_version, consent_content_hash, public_title, partner_name,
          status, opens_at, closes_at)
       values ($1,$2,'pcr',$3,$4,$5,$6,'QA escala','Trazaloop QA','open',
               now() - interval '1 day', now() + interval '30 days')
       returning id`,
      [slugEscala, `QA escala ${sello}`, v1.id, doc.id, doc.version, doc.content_hash]);
    campEscala = c.id as string;

    // Las participaciones nacen en curso y se cierran después: el disparador de
    // 0196 exige resultado para poder marcarlas completadas.
    await q(
      `insert into public.public_diagnostic_submissions
         (campaign_id, diagnostic_version_id, status, participant_name, participant_email,
          participant_email_normalized, participant_phone, company_name,
          consent_document_id, consent_version, consent_content_hash, consent_at,
          marketing_opt_in, marketing_opt_in_at, source)
       select $1, $2, 'in_progress', 'Persona ' || i,
              'e' || i || '@escala.test', 'e' || i || '@escala.test', '+57300000' || i,
              case when i = 1 then '=SUMA(A1)' else 'Empresa ' || i end,
              $3, $4, $5, now(),
              (i % 2 = 0), case when i % 2 = 0 then now() else null end, 'public_link'
         from generate_series(1, $6) i`,
      [campEscala, v1.id, doc.id, doc.version, doc.content_hash, N]);

    await q(
      `insert into public.public_diagnostic_answers (submission_id, question_id, answer)
       select s.id, q.id, ((row_number() over (partition by s.id order by q.order_index)) % 3 <> 0)
         from public.public_diagnostic_submissions s
         cross join (select id, order_index from public.diagnostic_questions
                      where version_id = $1 and is_active) q
        where s.campaign_id = $2`,
      [v1.id, campEscala]);

    // Y se cierran con una instantánea mínima pero con la forma real.
    await q(
      `update public.public_diagnostic_submissions s
          set status='completed', completed_at=now(), maturity_percent=66.6667,
              readiness_level='medium', critical_gaps=4,
              section_scores='{}'::jsonb,
              result_payload = jsonb_build_object(
                'schema','public_pcr_result.v2',
                'sections', (select jsonb_agg(jsonb_build_object(
                                'code', sec.code, 'title', sec.title,
                                'percent', 50, 'answered_yes', 5, 'total', 10)
                              order by sec.order_index)
                               from public.diagnostic_sections sec where sec.version_id=$1))
        where s.campaign_id=$2`,
      [v1.id, campEscala]);
    await q("commit");

    await check(`El fixture quedó en pie: ${N} participaciones y sus respuestas`, async () => {
      const [s] = await q(
        `select count(*)::int c from public.public_diagnostic_submissions where campaign_id=$1`,
        [campEscala]);
      const [a] = await q(
        `select count(*)::int c from public.public_diagnostic_answers a
           join public.public_diagnostic_submissions s on s.id=a.submission_id
          where s.campaign_id=$1`, [campEscala]);
      assert(s.c === N, `hay ${s.c} participaciones`);
      assert(a.c === N * 52, `hay ${a.c} respuestas y deberían ser ${N * 52}`);
    });

    await check("Los conteos se agrupan en la base y NO se cortan en mil", async () => {
      // La función exige superadministración: se pide con esa sesión, que es
      // como la pide la consola.
      const [s] = await q(
        `select user_id from public.platform_staff
          where status='active' and role_code='superadmin' limit 1`);
      assert(!!s, "el entorno no tiene superadministración con la que probar");
      await q("begin");
      await q("set local role authenticated");
      await q(`select set_config('request.jwt.claims',
                 json_build_object('sub',$1::text,'role','authenticated')::text, true)`,
              [s.user_id]);
      const [r] = await q(
        `select started, completed, incomplete
           from public.public_diagnostic_campaign_counts() where campaign_id=$1`,
        [campEscala]);
      await q("rollback");
      await q("set role postgres");
      assert(Number(r.started) === N,
        `la base dice ${r.started} iniciadas y son ${N}: el conteo se cortó`);
      assert(Number(r.completed) === N, `dice ${r.completed} completadas`);
      assert(Number(r.incomplete) === 0, `dice ${r.incomplete} incompletas`);
    });

    await check("La exportación REAL lee las 52 000 respuestas, sin perder ni repetir", async () => {
      if (!clienteHttp) {
        console.log("      (las variables HTTP miran a otro stack; se omite)");
        return;
      }
      const { loadExportDataset } = await import("../../lib/db/public-diagnostic-admin");
      const t0 = Date.now();
      const datos = await loadExportDataset(campEscala, clienteHttp!);
      const ms = Date.now() - t0;
      assert(datos !== null, "no se pudo cargar el conjunto");
      assert(datos!.submissions.length === N,
        `se leyeron ${datos!.submissions.length} participaciones de ${N}`);
      assert(datos!.questions.length === 52,
        `se leyeron ${datos!.questions.length} preguntas`);
      const respuestas = datos!.submissions.reduce(
        (n, s) => n + Object.keys(s.answers).length, 0);
      assert(respuestas === N * 52,
        `se leyeron ${respuestas} respuestas de ${N * 52}: alguna página se perdió filas`);
      // Sin repetidos: si una página repitiera, habría participaciones duplicadas.
      const ids = new Set(datos!.submissions.map((s) => s.submissionId));
      assert(ids.size === N, `hay ${N - ids.size} participaciones repetidas`);
      console.log(`      (${ms} ms para ${N} participaciones y ${respuestas} respuestas)`);
    });

    await check("Y el CSV y el libro salen completos, con la empresa peligrosa neutralizada", async () => {
      if (!clienteHttp) {
        console.log("      (las variables HTTP miran a otro stack; se omite)");
        return;
      }
      const { loadExportDataset } = await import("../../lib/db/public-diagnostic-admin");
      const { csvTable, workbookSheets } = await import("../../lib/domain/public-diagnostic-export");
      const { buildXlsx } = await import("../../lib/xlsx");
      const datos = (await loadExportDataset(campEscala, clienteHttp!))!;

      const tabla = csvTable(datos);
      assert(tabla.length === N + 1, `el CSV tiene ${tabla.length - 1} filas de datos`);
      assert(tabla[0].length === 20 + 6 + 52,
        `el CSV tiene ${tabla[0].length} columnas`);
      const peligrosa = tabla.slice(1).map((f) => f[10]).find((v) => v.includes("SUMA"));
      assert(peligrosa === "'=SUMA(A1)", `la empresa peligrosa salió «${peligrosa}»`);

      const hojas = workbookSheets(datos);
      const respuestas = hojas.find((h) => h.name === "Respuestas")!;
      assert(respuestas.rows.length === N * 52 + 1,
        `la hoja de respuestas tiene ${respuestas.rows.length - 1} filas`);
      const libro = buildXlsx(hojas);
      assert(libro.length > 100_000, `el libro salió de ${libro.length} bytes`);
      console.log(`      (libro de ${Math.round(libro.length / 1024)} KB)`);
    });

    await check("Marcar lo comercial no cambia quién aparece en el estudio", async () => {
      if (!clienteHttp) {
        console.log("      (las variables HTTP miran a otro stack; se omite)");
        return;
      }
      const { loadExportDataset } = await import("../../lib/db/public-diagnostic-admin");
      const { csvTable, csvHeaders } = await import("../../lib/domain/public-diagnostic-export");
      const datos = (await loadExportDataset(campEscala, clienteHttp!))!;
      const cab = csvHeaders(datos);
      const i = cab.indexOf("marketing_consent");
      const filas = csvTable(datos).slice(1);
      const sinMkt = filas.filter((f) => f[i] === "No").length;
      const conMkt = filas.filter((f) => f[i] === "Sí").length;
      assert(sinMkt === N / 2 && conMkt === N / 2,
        `con comercial ${conMkt}, sin comercial ${sinMkt}`);
      assert(sinMkt + conMkt === N,
        "alguien desapareció del conjunto por no autorizar comunicaciones");
    });

  } finally {
    // Limpieza. Las participaciones quedaron CERRADAS y sus guardas impiden
    // borrarlas: es la misma excepción documentada que se usa con los fixtures
    // de Staging — se apartan, se borra solo esto, se vuelven a poner y se
    // COMPRUEBA que quedaron activas.
    if (campEscala) {
      await q("begin");
      await q(`alter table public.public_diagnostic_answers disable trigger t_public_answer_delete`);
      await q(`alter table public.public_diagnostic_submissions disable trigger t_public_submission_delete`);
      await q(`delete from public.public_diagnostic_answers a
                using public.public_diagnostic_submissions s
                where s.id=a.submission_id and s.campaign_id=$1`, [campEscala]);
      await q(`delete from public.public_diagnostic_submissions where campaign_id=$1`, [campEscala]);
      await q(`delete from public.public_intake_attempts where campaign_id=$1`, [campEscala]);
      await q(`delete from public.public_diagnostic_campaigns where id=$1`, [campEscala]);
      await q(`alter table public.public_diagnostic_answers enable trigger t_public_answer_delete`);
      await q(`alter table public.public_diagnostic_submissions enable trigger t_public_submission_delete`);
      const guardas = await q(
        `select t.tgenabled from pg_trigger t
          where t.tgname in ('t_public_answer_delete','t_public_submission_delete')`);
      await q("commit");
      const activas = guardas.every((g) => g.tgenabled === "O");
      console.log(`\n  fixture retirado · guardas de borrado activas: ${activas ? "sí" : "NO"}`);
      if (!activas) failed += 1;
    }
  }

  await pg.end();
  console.log(
    `\nPUBLIC-DIAGNOSTICS-01H · puerta y exportación: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
