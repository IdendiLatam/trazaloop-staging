import { config as loadEnv } from "dotenv";
import { Client as PgClient } from "pg";
import { createClient } from "@supabase/supabase-js";

loadEnv({ path: ".env.local", quiet: true });

/**
 * Trazaloop · PUBLIC-DIAGNOSTICS-01J · El resultado desde la administración.
 *
 * Lo que se defiende aquí es una sola idea, y es la que sostiene todo el
 * subsistema: el resultado que ve la administración es EL MISMO dato que vio
 * la empresa, congelado. Ni recalculado, ni recompuesto desde el catálogo de
 * hoy.
 *
 * La prueba que más importa es la del catálogo: se publica una PCR v2 con otras
 * recomendaciones y se comprueba que un archivo histórico no cambia ni una
 * palabra. Si algún día alguien «mejora» el exportador leyendo las preguntas
 * actuales, ahí se entera.
 *
 * Correr: npm run test:pd01j-db
 */

const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) { console.log("falta SUPABASE_DB_URL en .env.local"); process.exit(1); }

let passed = 0, failed = 0;
async function check(nombre: string, fn: () => Promise<void>) {
  try { await fn(); passed += 1; console.log(`  ✔ ${nombre}`); }
  catch (e) { failed += 1; console.log(`  ✘ ${nombre}: ${e instanceof Error ? e.message : e}`); }
}
function assert(cond: boolean, mensaje: string) { if (!cond) throw new Error(mensaje); }

type Fila = Record<string, unknown>;

async function main() {
  const pg = new PgClient({ connectionString: DB_URL });
  await pg.connect();
  const q = async (sql: string, p: unknown[] = []) => (await pg.query(sql, p)).rows;

  const anfitrion = (u: string) => { try { return new URL(u).hostname; } catch { return ""; } };
  const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const CLAVE = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  const mismoStack = !!URL_SB && !!CLAVE
    && anfitrion(URL_SB) === anfitrion(String(DB_URL).replace(/^postgresql:/, "http:"));
  const cliente = mismoStack
    ? createClient(URL_SB!, CLAVE!, { auth: { autoRefreshToken: false, persistSession: false } })
    : null;

  await q("set role postgres");
  await q("begin");

  const sello = Date.now();
  const [v1] = await q(
    `select id, scoring_config from public.diagnostic_versions
      where diagnostic_type='pcr' and version_number=1`);
  const [doc] = await q(
    `select id, version, content_hash from public.legal_documents
      where status='active' limit 1`);

  const [camp] = await q(
    `insert into public.public_diagnostic_campaigns
       (slug, name, diagnostic_type, diagnostic_version_id, consent_document_id,
        consent_version, consent_content_hash, public_title, partner_name,
        allow_repeat, status, opens_at, closes_at)
     values ($1,$2,'pcr',$3,$4,$5,$6,'QA 01J','Trazaloop QA', true, 'open',
             now() - interval '1 day', now() + interval '30 days')
     returning id`,
    [`qa-j-${sello}`, `QA J ${sello}`, v1.id, doc.id, doc.version, doc.content_hash]);

  /** Una participación cerrada con la instantánea que se le indique. */
  const cerrada = async (
    empresa: string, correo: string, payload: Record<string, unknown>,
    supersedes: string | null = null
  ) => {
    const [s] = await q(
      `insert into public.public_diagnostic_submissions
         (campaign_id, diagnostic_version_id, status, participant_name, participant_email,
          participant_email_normalized, participant_phone, company_name,
          consent_document_id, consent_version, consent_content_hash, consent_at,
          marketing_opt_in, completed_at, maturity_percent, readiness_level,
          critical_gaps, section_scores, result_payload, supersedes_id, source)
       values ($1,$2,'completed','Ana Pérez',$3,$3,'+57 300 000 0000',$4,$5,$6,$7, now(),
               false, now(), $8, $9, 2, '{}'::jsonb, $10::jsonb, $11, 'public_link')
       returning id`,
      [camp.id, v1.id, correo, empresa, doc.id, doc.version, doc.content_hash,
       payload.maturity_percent, payload.readiness_level, JSON.stringify(payload), supersedes]);
    return s.id as string;
  };

  const instantanea = (pct: number, acciones: [string, string, string][]) => ({
    schema: "public_pcr_result.v2",
    instrument: { type: "pcr", version: 1 },
    answered: 52, questions: 52,
    maturity_percent: pct, readiness_level: "low",
    readiness_label: "Nivel de preparación bajo", critical_gaps: 2,
    sections: [
      { code: "input_materials", title: "Material de entrada y proveedores",
        percent: 40, answered_yes: 4, total: 10 },
      { code: "traceability", title: "Trazabilidad e identificación de lotes",
        percent: 70, answered_yes: 7, total: 10 },
    ],
    gaps: acciones.map(([code, section, accion]) => ({
      code, section, question: `¿Pregunta ${code}?`, recommended_action: accion,
    })),
  });

  const ACCION_HISTORICA = "ACCIÓN HISTÓRICA · registre los lotes consumidos";
  const primera = await cerrada("Recicladora Histórica S.A.S.", `j1-${sello}@ejemplo.test`,
    instantanea(42.5, [
      ["S1Q03", "input_materials", ACCION_HISTORICA],
      ["S3Q01", "traceability", "ACCIÓN HISTÓRICA · vincule lote y orden"],
      ["S1Q07", "input_materials", ACCION_HISTORICA],
    ]));

  const aMedias = (await q(
    `insert into public.public_diagnostic_submissions
       (campaign_id, diagnostic_version_id, status, participant_name, participant_email,
        participant_email_normalized, company_name, consent_document_id, consent_version,
        consent_content_hash, consent_at, marketing_opt_in, source)
     values ($1,$2,'in_progress','Beto Gómez',$3,$3,'Sin Terminar S.A.S.',$4,$5,$6, now(),
             false, 'public_link') returning id`,
    [camp.id, v1.id, `j2-${sello}@ejemplo.test`, doc.id, doc.version, doc.content_hash]))[0].id;

  console.log("\nA · Qué ve la administración\n");

  await check("Una participación cerrada trae su instantánea, tal cual", async () => {
    const [s] = await q(
      `select result_payload rp, maturity_percent m, readiness_level n, status
         from public.public_diagnostic_submissions where id=$1`, [primera]);
    assert(s.status === "completed", `estado «${s.status}»`);
    const rp = s.rp as Fila;
    assert(rp.schema === "public_pcr_result.v2", `formato «${rp.schema}»`);
    assert((rp.gaps as unknown[]).length === 3, "no llegan las brechas");
    assert(Number(s.m) === 42.5, `puntaje ${s.m}`);
  });

  await check("Una a medias no tiene resultado, y eso se puede distinguir", async () => {
    const [s] = await q(
      `select status, result_payload rp, maturity_percent m
         from public.public_diagnostic_submissions where id=$1`, [aMedias]);
    assert(s.status === "in_progress", `estado «${s.status}»`);
    assert(s.rp === null && s.m === null,
      "una participación sin cerrar trae resultado: la pantalla ofrecería verlo");
  });

  console.log("\nB · Quién puede verlo\n");

  const comoRol = async (rol: string, userId: string | null) => {
    await q("savepoint r");
    await q(`set local role ${rol}`);
    if (userId) {
      await q(`select set_config('request.jwt.claims',
                 json_build_object('sub',$1::text,'role',$2::text)::text, true)`, [userId, rol]);
    } else {
      await q(`select set_config('request.jwt.claims', null, true)`);
    }
    let n = -1;
    try {
      const r = await q(
        `select count(*)::int c from public.public_diagnostic_submissions where id=$1`,
        [primera]);
      n = Number(r[0]?.c ?? 0);
    } catch { n = -1; }
    await q("rollback to savepoint r");
    await q("set local role postgres");
    return n;
  };

  await check("anon → DENY", async () => {
    assert(await comoRol("anon", null) <= 0, "anon vio la participación");
  });

  await check("Una usuaria autenticada normal → DENY", async () => {
    const [u] = await q(
      `select m.user_id from public.memberships m where m.status='active'
         and not exists (select 1 from public.platform_staff s
                          where s.user_id=m.user_id and s.status='active') limit 1`);
    assert(!!u, "el entorno no tiene una usuaria normal");
    assert(await comoRol("authenticated", u.user_id as string) === 0,
      "una usuaria normal vio la participación");
  });

  await check("La administradora de una empresa → DENY", async () => {
    const [u] = await q(
      `select m.user_id from public.memberships m
        where m.status='active' and m.role_code in ('admin','owner')
          and not exists (select 1 from public.platform_staff s
                           where s.user_id=m.user_id and s.status='active') limit 1`);
    if (!u) { console.log("      (sin administradora de empresa; se omite)"); return; }
    assert(await comoRol("authenticated", u.user_id as string) === 0,
      "una administradora de empresa vio la participación");
  });

  await check("La superadministración → ALLOW", async () => {
    const [u] = await q(
      `select user_id from public.platform_staff
        where status='active' and role_code='superadmin' limit 1`);
    if (!u) { console.log("      (sin superadministración; se omite)"); return; }
    assert(await comoRol("authenticated", u.user_id as string) === 1,
      "la superadministración no vio la participación");
  });

  console.log("\nC · El catálogo cambia y la historia no\n");

  await check("Se publica una PCR v2 con OTRAS recomendaciones", async () => {
    await q(`update public.diagnostic_versions set status='retired' where id=$1`, [v1.id]);
    // Nace BORRADOR: 0195 congela secciones y preguntas de cualquier versión
    // que no lo sea, así que publicarla antes de llenarla es imposible — y eso
    // es exactamente lo que debe pasar.
    const [v2] = await q(
      `insert into public.diagnostic_versions
         (diagnostic_type, version_number, status, scoring_config, change_note)
       values ('pcr', 98, 'draft', $1::jsonb, 'QA 01J · catálogo nuevo')
       returning id`, [JSON.stringify(v1.scoring_config)]);
    // Las mismas secciones y preguntas, con la acción recomendada CAMBIADA.
    await q(
      `insert into public.diagnostic_sections (code, title, description, order_index, weight, version_id)
       select code, title, description, order_index, weight, $1
         from public.diagnostic_sections where version_id=$2`, [v2.id, v1.id]);
    await q(
      `insert into public.diagnostic_questions
         (section_id, requirement_id, code, question_text, help_text, standard_refs,
          weight, is_critical, order_index, recommended_action, is_active, version_id)
       select s2.id, q.requirement_id, q.code, q.question_text || ' (v2)', q.help_text,
              q.standard_refs, q.weight, q.is_critical, q.order_index,
              'ACCIÓN NUEVA DEL CATÁLOGO', q.is_active, $1
         from public.diagnostic_questions q
         join public.diagnostic_sections s1 on s1.id = q.section_id
         join public.diagnostic_sections s2 on s2.version_id = $1 and s2.code = s1.code
        where q.version_id = $2`, [v2.id, v1.id]);
    await q(`update public.diagnostic_versions
                set status='published', published_at=now() where id=$1`, [v2.id]);
    const [n] = await q(
      `select count(*)::int c from public.diagnostic_questions
        where version_id=$1 and is_active`, [v2.id]);
    assert(n.c === 52, `la v2 quedó con ${n.c} preguntas`);
    const [vig] = await q(
      `select version_number from public.diagnostic_versions
        where diagnostic_type='pcr' and status='published'`);
    assert(Number(vig.version_number) === 98, "la v2 no quedó como vigente");
  });

  await check("Y el resultado histórico NO cambia ni una palabra", async () => {
    const [s] = await q(
      `select result_payload rp from public.public_diagnostic_submissions where id=$1`,
      [primera]);
    const textos = ((s.rp as Fila).gaps as Fila[]).map((g) => String(g.recommended_action));
    assert(textos.includes(ACCION_HISTORICA),
      "la recomendación histórica desapareció de la instantánea");
    assert(!textos.some((t) => t.includes("ACCIÓN NUEVA")),
      "una recomendación del catálogo nuevo entró en un resultado viejo");
  });

  console.log("\nD · Repetir conserva las dos historias\n");

  await check("Cada participación de la cadena conserva SU resultado", async () => {
    const segunda = await cerrada("Recicladora Histórica S.A.S.", `j1-${sello}@ejemplo.test`,
      instantanea(88.25, [["S1Q03", "input_materials", "ACCIÓN DEL SEGUNDO INTENTO"]]),
      primera);
    await q(`update public.public_diagnostic_submissions set superseded_by_id=$1 where id=$2`,
            [segunda, primera]);

    const filas = await q(
      `select id, maturity_percent m, supersedes_id, superseded_by_id,
              result_payload->'gaps'->0->>'recommended_action' accion
         from public.public_diagnostic_submissions
        where campaign_id=$1 and status='completed' order by maturity_percent`, [camp.id]);
    assert(filas.length === 2, `hay ${filas.length} participaciones cerradas`);
    assert(Number(filas[0].m) === 42.5 && Number(filas[1].m) === 88.25,
      "los dos intentos no conservan su puntaje");
    assert(String(filas[0].accion) === ACCION_HISTORICA,
      "el primer intento perdió su recomendación");
    assert(String(filas[1].accion) === "ACCIÓN DEL SEGUNDO INTENTO",
      "el segundo intento no tiene la suya");
    assert(filas[0].superseded_by_id === filas[1].id && filas[1].supersedes_id === filas[0].id,
      "la cadena no quedó bien formada");
  });

  await q("rollback");

  // =========================================================================
  console.log("\nE · La exportación, con datos CONFIRMADOS\n");
  // =========================================================================
  //
  // Lo de arriba vive en una transacción abierta, y la exportación viaja por
  // HTTP: no vería nada. Así que esta parte confirma un fixture pequeño, lo
  // exporta de verdad y lo retira al terminar.
  //
  // Y demuestra lo mismo que el bloque C por otro camino: las recomendaciones
  // de estas instantáneas NO EXISTEN en el catálogo actual. Si el exportador
  // leyera las preguntas de hoy, no podría producirlas — y si además colara
  // alguna del catálogo, se vería.

  let campExp = "";
  try {
    const [c2] = await q(
      `insert into public.public_diagnostic_campaigns
         (slug, name, diagnostic_type, diagnostic_version_id, consent_document_id,
          consent_version, consent_content_hash, public_title, partner_name,
          allow_repeat, status, opens_at, closes_at)
       values ($1,$2,'pcr',$3,$4,$5,$6,'QA 01J export','Trazaloop QA', true, 'open',
               now() - interval '1 day', now() + interval '30 days')
       returning id`,
      [`qa-jx-${sello}`, `QA JX ${sello}`, v1.id, doc.id, doc.version, doc.content_hash]);
    campExp = c2.id as string;

    const crear = async (empresa: string, correo: string,
                         payload: Record<string, unknown>, supersedes: string | null) => {
      const [x] = await q(
        `insert into public.public_diagnostic_submissions
           (campaign_id, diagnostic_version_id, status, participant_name, participant_email,
            participant_email_normalized, participant_phone, company_name,
            consent_document_id, consent_version, consent_content_hash, consent_at,
            marketing_opt_in, completed_at, maturity_percent, readiness_level,
            critical_gaps, section_scores, result_payload, supersedes_id, source)
         values ($1,$2,'completed','Ana Pérez',$3,$3,'+57 300 000 0000',$4,$5,$6,$7, now(),
                 false, now(), $8, $9, 2, '{}'::jsonb, $10::jsonb, $11, 'public_link')
         returning id`,
        [campExp, v1.id, correo, empresa, doc.id, doc.version, doc.content_hash,
         payload.maturity_percent, payload.readiness_level, JSON.stringify(payload), supersedes]);
      return x.id as string;
    };

    const uno = await crear("Recicladora Histórica S.A.S.", `jx1-${sello}@ejemplo.test`,
      instantanea(42.5, [
        ["S1Q03", "input_materials", ACCION_HISTORICA],
        ["S3Q01", "traceability", "ACCIÓN HISTÓRICA · vincule lote y orden"],
        ["S1Q07", "input_materials", ACCION_HISTORICA],
      ]), null);
    const dos = await crear("Recicladora Histórica S.A.S.", `jx1-${sello}@ejemplo.test`,
      instantanea(88.25, [["S1Q03", "input_materials", "ACCIÓN DEL SEGUNDO INTENTO"]]), uno);
    await q(`update public.public_diagnostic_submissions set superseded_by_id=$1 where id=$2`,
            [dos, uno]);
    // Y una a medias, que no debe aportar ni una fila.
    await q(
      `insert into public.public_diagnostic_submissions
         (campaign_id, diagnostic_version_id, status, participant_name, participant_email,
          participant_email_normalized, company_name, consent_document_id, consent_version,
          consent_content_hash, consent_at, marketing_opt_in, source)
       values ($1,$2,'in_progress','Beto',$3,$3,'Sin Terminar',$4,$5,$6, now(), false,
               'public_link')`,
      [campExp, v1.id, `jx2-${sello}@ejemplo.test`, doc.id, doc.version, doc.content_hash]);

    await check("Cinco hojas, y la de recomendaciones poblada", async () => {
      if (!cliente) {
        console.log("      (las variables HTTP miran a otro stack; se omite)");
        return;
      }
      const { loadExportDataset } = await import("../../lib/db/public-diagnostic-admin");
      const { workbookSheets } = await import("../../lib/domain/public-diagnostic-export");
      const { buildXlsx } = await import("../../lib/xlsx");
      const datos = await loadExportDataset(campExp, cliente);
      assert(datos !== null, "no se pudo cargar el conjunto");
      const hojas = workbookSheets(datos!);
      assert(hojas.length === 5, `el libro tiene ${hojas.length} hojas`);
      assert(hojas[4].name === "Recomendaciones", `la quinta es «${hojas[4].name}»`);

      const filas = hojas[4].rows.slice(1);
      // Del primer intento: dos acciones distintas (la repetida se deduplica).
      // Del segundo: una. De la que sigue a medias: ninguna.
      assert(filas.length === 3, `la hoja tiene ${filas.length} filas`);
      const ids = new Set(filas.map((f) => String(f[1])));
      assert(ids.size === 2, `aparecen ${ids.size} participaciones y deberían ser 2`);
      const textos = filas.map((f) => String(f[10]));
      assert(textos.filter((t) => t === ACCION_HISTORICA).length === 1,
        "la misma acción de la misma dimensión salió repetida");
      assert(textos.includes("ACCIÓN DEL SEGUNDO INTENTO"),
        "el segundo intento perdió su recomendación: la cadena no conserva ambos");

      // El orden y la dimensión, tal como quedaron congelados.
      const delPrimero = filas.filter((f) => String(f[1]) === uno);
      assert(delPrimero[0][9] === 1 && delPrimero[1][9] === 2, "la numeración no se conserva");
      assert(String(delPrimero[0][7]) === "input_materials"
          && String(delPrimero[1][7]) === "traceability",
        "las dimensiones no se conservan en el orden del snapshot");

      const libro = buildXlsx(hojas);
      assert(libro[0] === 0x50 && libro[1] === 0x4b, "el libro no es un ZIP");
      const texto = JSON.stringify(hojas);
      assert(texto.includes("ACCIÓN HISTÓRICA"), "el unicode se perdió");
      for (const prohibido of ["resume_token", "token_hash", "content_hash", "prefix"]) {
        assert(!texto.toLowerCase().includes(prohibido), `el libro lleva «${prohibido}»`);
      }
    });

    await check("Y el catálogo de HOY no entra en la exportación", async () => {
      if (!cliente) {
        console.log("      (las variables HTTP miran a otro stack; se omite)");
        return;
      }
      const { loadExportDataset } = await import("../../lib/db/public-diagnostic-admin");
      const { workbookSheets } = await import("../../lib/domain/public-diagnostic-export");
      const datos = (await loadExportDataset(campExp, cliente))!;
      const textos = workbookSheets(datos)[4].rows.slice(1).map((f) => String(f[10]));

      // Ninguna de estas acciones existe en el catálogo: si el exportador lo
      // leyera, no podría producirlas.
      const delCatalogo = await q(
        `select distinct recommended_action a from public.diagnostic_questions
          where version_id=$1 and recommended_action is not null`, [v1.id]);
      const conocidas = new Set(delCatalogo.map((r) => String(r.a)));
      for (const t of textos) {
        assert(!conocidas.has(t),
          `«${t.slice(0, 40)}…» salió del catálogo actual, no de la instantánea`);
      }
      // Y a la inversa: ninguna acción del catálogo se coló.
      for (const t of textos) {
        assert(t.startsWith("ACCIÓN"),
          `apareció una recomendación que no estaba en la instantánea: «${t.slice(0, 40)}…»`);
      }
      assert(textos.length === 3, `salieron ${textos.length} recomendaciones`);
    });

  } finally {
    if (campExp) {
      await q("begin");
      await q(`alter table public.public_diagnostic_answers disable trigger t_public_answer_delete`);
      await q(`alter table public.public_diagnostic_submissions disable trigger t_public_submission_delete`);
      await q(`update public.public_diagnostic_submissions set superseded_by_id=null
                where campaign_id=$1`, [campExp]);
      await q(`delete from public.public_diagnostic_answers a
                using public.public_diagnostic_submissions s
                where s.id=a.submission_id and s.campaign_id=$1`, [campExp]);
      await q(`delete from public.public_diagnostic_submissions where campaign_id=$1`, [campExp]);
      await q(`delete from public.public_intake_attempts where campaign_id=$1`, [campExp]);
      await q(`delete from public.public_diagnostic_campaigns where id=$1`, [campExp]);
      await q(`alter table public.public_diagnostic_answers enable trigger t_public_answer_delete`);
      await q(`alter table public.public_diagnostic_submissions enable trigger t_public_submission_delete`);
      const guardas = await q(
        `select tgenabled from pg_trigger
          where tgname in ('t_public_answer_delete','t_public_submission_delete')`);
      await q("commit");
      const activas = guardas.every((g) => g.tgenabled === "O");
      console.log(`\n  fixture retirado · guardas de borrado activas: ${activas ? "sí" : "NO"}`);
      if (!activas) failed += 1;
    }
  }

  await pg.end();
  console.log(
    `\nPUBLIC-DIAGNOSTICS-01J · resultado administrativo: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
