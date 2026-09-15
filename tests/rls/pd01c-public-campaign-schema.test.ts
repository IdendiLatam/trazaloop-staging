import { config as loadEnv } from "dotenv";
import { Client as PgClient } from "pg";

loadEnv({ path: ".env.local", quiet: true });

/**
 * Trazaloop · PUBLIC-DIAGNOSTICS-01C · El esquema de campañas públicas.
 *
 * Todo lo que aquí se prueba vive en la BASE a propósito. Este subsistema va a
 * recibir escrituras desde Internet en PD-01E, y una invariante que viviera en
 * la interfaz se saltaría con una llamada. Si la guarda no la tiene Postgres,
 * no la tiene nadie.
 *
 * Y esta fase NO abre nada: la mitad de la batería comprueba justo eso.
 *
 * Correr: npm run test:pd01c-db
 */

const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) { console.log("falta SUPABASE_DB_URL en .env.local"); process.exit(1); }

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
  const falla = async (sql: string, p: unknown[] = []): Promise<string> => {
    await pg.query("savepoint s");
    try { await pg.query(sql, p); await pg.query("release savepoint s"); return ""; }
    catch (e) { await pg.query("rollback to savepoint s");
                return e instanceof Error ? e.message : String(e); }
  };
  await q("set role postgres");
  await q("begin");

  const sello = Date.now();
  const [v1] = await q(
    `select id from public.diagnostic_versions where diagnostic_type='pcr' and version_number=1`);
  const [preg] = await q(
    `select id from public.diagnostic_questions where version_id=$1 order by order_index limit 1`,
    [v1.id]);
  const [preg2] = await q(
    `select id from public.diagnostic_questions where version_id=$1 order by order_index offset 1 limit 1`,
    [v1.id]);

  console.log("\nA · La campaña fija una versión, y no la suelta\n");

  const [camp] = await q(
    `insert into public.public_diagnostic_campaigns
       (slug, name, diagnostic_type, diagnostic_version_id, status, partner_name)
     values ($1,'Campaña de prueba','pcr',$2,'open','Socio de prueba') returning id`,
    [`prueba-pcr-${sello}`, v1.id]);

  await check("A. Una campaña queda fijada a PCR v1", async () => {
    const [c] = await q(
      `select diagnostic_version_id v, status s from public.public_diagnostic_campaigns
        where id=$1`, [camp.id]);
    assert(c.v === v1.id, "la campaña no quedó atada a la v1");
    assert(c.s === "open", `estado «${c.s}»`);
  });

  await check("B. No puede abrirse contra un borrador", async () => {
    const [borrador] = await q(
      `insert into public.diagnostic_versions
         (diagnostic_type, version_number, status, scoring_config)
       values ('pcr', 90, 'draft', '{}'::jsonb) returning id`);
    const e = await falla(
      `insert into public.public_diagnostic_campaigns
         (slug, name, diagnostic_type, diagnostic_version_id, status)
       values ($1,'Contra borrador','pcr',$2,'open')`,
      [`borrador-${sello}`, borrador.id]);
    assert(/CAMPAIGN_VERSION_NOT_PUBLISHED/.test(e),
      `se abrió una campaña contra un borrador (${e || "sin error"})`);
  });

  await check("C. Abierta, no se le puede cambiar la versión", async () => {
    const [otra] = await q(
      `insert into public.diagnostic_versions
         (diagnostic_type, version_number, status, scoring_config, published_at)
       values ('pcr', 91, 'retired', '{}'::jsonb, now()) returning id`);
    const e = await falla(
      `update public.public_diagnostic_campaigns set diagnostic_version_id=$1 where id=$2`,
      [otra.id, camp.id]);
    assert(/CAMPAIGN_VERSION_LOCKED|CAMPAIGN_FROZEN_BY_SUBMISSIONS/.test(e),
      `se pudo reapuntar la versión (${e || "sin error"})`);
  });

  await check("Y una versión de otro tipo tampoco encaja", async () => {
    const e = await falla(
      `update public.public_diagnostic_campaigns set diagnostic_type='pcr'
        where id=$1`, [camp.id]);
    assert(e === "", "un cambio inocuo se bloqueó sin motivo");
  });

  console.log("\nB · La participación hereda, y no inventa\n");

  const nuevaSub = async (email: string, campaña = camp.id, version = v1.id) => {
    const [s] = await q(
      `insert into public.public_diagnostic_submissions
         (campaign_id, diagnostic_version_id, participant_name, participant_email,
          participant_email_normalized, company_name)
       values ($1,$2,'Persona de Prueba',$3,lower(trim($3)),'Empresa X') returning id`,
      [campaña, version, email]);
    return s.id as string;
  };

  const sub1 = await nuevaSub(`  Persona@Ejemplo.COM  `);

  await check("D. La participación hereda la versión de la campaña", async () => {
    const [s] = await q(
      `select diagnostic_version_id v, participant_email_normalized n
         from public.public_diagnostic_submissions where id=$1`, [sub1]);
    assert(s.v === v1.id, "no heredó la versión");
    assert(s.n === "persona@ejemplo.com",
      `el correo normalizado quedó «${s.n}»: el esquema debe soportar la normalización`);
  });

  await check("Y no puede declarar otra versión distinta", async () => {
    const [otra] = await q(
      `select id from public.diagnostic_versions where version_number=91`);
    const e = await falla(
      `insert into public.public_diagnostic_submissions
         (campaign_id, diagnostic_version_id, participant_name, participant_email,
          participant_email_normalized, company_name)
       values ($1,$2,'X','x@y.z','x@y.z','E')`, [camp.id, otra.id]);
    assert(/SUBMISSION_VERSION_MISMATCH/.test(e),
      `se aceptó una versión ajena a la campaña (${e || "sin error"})`);
  });

  console.log("\nC · Las respuestas son de la versión que se está respondiendo\n");

  await check("E/G. Se responde, y no dos veces la misma pregunta", async () => {
    await q(`insert into public.public_diagnostic_answers (submission_id, question_id, answer)
             values ($1,$2,true)`, [sub1, preg.id]);
    const e = await falla(
      `insert into public.public_diagnostic_answers (submission_id, question_id, answer)
       values ($1,$2,false)`, [sub1, preg.id]);
    assert(/duplicate key|submission_question_uniq/.test(e),
      `se duplicó la respuesta de una pregunta (${e || "sin error"})`);
  });

  await check("F. Una pregunta de OTRA versión no entra", async () => {
    const [borrador] = await q(
      `select id from public.diagnostic_versions where version_number=90`);
    const [s2] = await q(
      `insert into public.diagnostic_sections (version_id, code, title, order_index)
       values ($1,'input_materials','S',1) returning id`, [borrador.id]);
    const [ajena] = await q(
      `insert into public.diagnostic_questions
         (version_id, section_id, code, question_text, weight, is_critical, order_index, is_active)
       values ($1,$2,'S1Q01','De otra versión',1,false,1,true) returning id`,
      [borrador.id, s2.id]);
    const e = await falla(
      `insert into public.public_diagnostic_answers (submission_id, question_id, answer)
       values ($1,$2,true)`, [sub1, ajena.id]);
    assert(/ANSWER_QUESTION_VERSION_MISMATCH/.test(e),
      `entró una pregunta de otra versión: no falla, calcula mal (${e || "sin error"})`);
  });

  console.log("\nD · Completar congela; en curso se avanza\n");

  await check("I. En curso se pueden añadir y cambiar respuestas", async () => {
    await q(`insert into public.public_diagnostic_answers (submission_id, question_id, answer)
             values ($1,$2,false)`, [sub1, preg2.id]);
    await q(`update public.public_diagnostic_answers set answer=true
              where submission_id=$1 and question_id=$2`, [sub1, preg2.id]);
    const [a] = await q(
      `select answer from public.public_diagnostic_answers
        where submission_id=$1 and question_id=$2`, [sub1, preg2.id]);
    assert(a.answer === true, "no se pudo corregir una respuesta en curso");
  });

  await check("J/K. El consentimiento obligatorio se identifica; el comercial va aparte", async () => {
    const [doc] = await q(
      `select id, version, content_hash from public.legal_documents
        where document_type='privacy' and status='active' limit 1`);
    if (!doc) { console.log("      (sin documento legal activo; se omite)"); return; }
    await q(
      `update public.public_diagnostic_submissions
          set consent_document_id=$1, consent_version=$2, consent_content_hash=$3,
              consent_at=now()
        where id=$4`, [doc.id, doc.version, doc.content_hash, sub1]);
    const [s] = await q(
      `select consent_document_id d, consent_content_hash h, marketing_opt_in m,
              marketing_opt_in_at ma from public.public_diagnostic_submissions where id=$1`,
      [sub1]);
    assert(s.d === doc.id && s.h === doc.content_hash,
      "el consentimiento no queda demostrable: falta documento o huella");
    assert(s.m === false && s.ma === null, "el consentimiento comercial nace marcado");
    // Y no se puede tener fecha sin consentimiento.
    const e = await falla(
      `update public.public_diagnostic_submissions set marketing_opt_in_at=now() where id=$1`,
      [sub1]);
    assert(/marketing_check/.test(e),
      `se aceptó una fecha de consentimiento comercial sin consentimiento (${e || "sin error"})`);
  });

  await check("Completar exige resultado y consentimiento", async () => {
    const e = await falla(
      `update public.public_diagnostic_submissions set status='completed' where id=$1`, [sub1]);
    assert(/completed_check/.test(e),
      `se completó sin resultado (${e || "sin error"})`);
    await q(
      `update public.public_diagnostic_submissions
          set status='completed', completed_at=now(), maturity_percent=50,
              readiness_level='medium', critical_gaps=3,
              section_scores='{}'::jsonb, result_payload='{}'::jsonb
        where id=$1`, [sub1]);
  });

  await check("H. Completada es historia: ni respuestas ni resultado", async () => {
    const e1 = await falla(
      `update public.public_diagnostic_answers set answer=false where submission_id=$1`, [sub1]);
    assert(/ANSWER_SUBMISSION_NOT_EDITABLE/.test(e1),
      `se editó una respuesta ya completada (${e1 || "sin error"})`);
    const e2 = await falla(
      `update public.public_diagnostic_submissions set maturity_percent=99 where id=$1`, [sub1]);
    assert(/SUBMISSION_COMPLETED_IS_HISTORY/.test(e2),
      `se reescribió un resultado completado (${e2 || "sin error"})`);
    const e3 = await falla(
      `delete from public.public_diagnostic_submissions where id=$1`, [sub1]);
    assert(/SUBMISSION_COMPLETED_IS_HISTORY/.test(e3),
      `se borró una participación completada (${e3 || "sin error"})`);
  });

  console.log("\nE · Repetir y retomar\n");

  await check("L/M. Repetir crea otra participación; el correo NO es único", async () => {
    const sub2 = await nuevaSub("persona@ejemplo.com");
    await q(`update public.public_diagnostic_submissions set supersedes_id=$1 where id=$2`,
            [sub1, sub2]);
    await q(`update public.public_diagnostic_submissions set superseded_by_id=$1 where id=$2`,
            [sub2, sub1]);
    const [n] = await q(
      `select count(*)::int c from public.public_diagnostic_submissions
        where campaign_id=$1 and participant_email_normalized='persona@ejemplo.com'`, [camp.id]);
    assert(n.c === 2, `hay ${n.c} participaciones: un único rígido lo habría impedido`);
    // Y la cadena se mantiene lineal.
    const sub3 = await nuevaSub("persona@ejemplo.com");
    const e = await falla(
      `update public.public_diagnostic_submissions set supersedes_id=$1 where id=$2`,
      [sub1, sub3]);
    assert(/SUBMISSION_ALREADY_SUPERSEDED/.test(e),
      `se pudo supersedir dos veces lo mismo (${e || "sin error"})`);
  });

  await check("El testigo de reanudación se guarda como HASH, y es único", async () => {
    const cols = await q(
      `select column_name from information_schema.columns
        where table_name='public_diagnostic_submissions' and column_name like 'resume%'`);
    const nombres = cols.map((c) => c.column_name).sort();
    assert(JSON.stringify(nombres) === JSON.stringify(["resume_token_hash", "resume_token_prefix"]),
      `columnas de reanudación: ${nombres.join(", ")}`);
    assert(!nombres.includes("resume_token"), "se guarda el testigo en claro");
  });

  console.log("\nF · La frontera de datos personales\n");

  await check("Las respuestas no llevan ni un dato personal", async () => {
    const cols = (await q(
      `select column_name from information_schema.columns
        where table_name='public_diagnostic_answers'`)).map((c) => c.column_name);
    for (const pii of ["participant_name", "participant_email", "participant_phone",
                       "company_name", "ip", "ip_address", "email", "phone"]) {
      assert(!cols.includes(pii), `las respuestas contienen «${pii}»`);
    }
  });

  await check("Y en ningún sitio se guarda la IP en claro", async () => {
    // «ip» como SEGMENTO del nombre, no como subcadena: sin esto casaba dentro
    // de «participant_...» y acusaba a la tabla de guardar direcciones que no
    // guarda. Es el mismo descuido que ya cometí buscando «NIT» dentro de
    // «initPoint».
    const cols = await q(
      `select table_name||'.'||column_name c from information_schema.columns
        where table_name like 'public_diagnostic%'
          and column_name ~* '(^|_)(ip|ip_address|remote_addr)(_|$)'`);
    const enClaro = cols.filter((r) => !/hash|prefix/i.test(r.c as string));
    assert(enClaro.length === 0, `hay columnas de IP: ${enClaro.map((r) => r.c).join(", ")}`);
  });

  console.log("\nG · Nace cerrado\n");

  await check("N-Q. anon no puede leer, insertar, actualizar ni borrar", async () => {
    for (const t of ["public_diagnostic_campaigns", "public_diagnostic_submissions",
                     "public_diagnostic_answers"]) {
      for (const [op, sql] of [
        ["SELECT", `select count(*) from public.${t}`],
        ["INSERT", `insert into public.${t} default values`],
        ["UPDATE", `update public.${t} set created_at=now()`],
        ["DELETE", `delete from public.${t}`],
      ] as const) {
        await q("savepoint a");
        await q("set local role anon");
        let permitido = false; let err = "";
        try { await pg.query(sql); permitido = true; }
        catch (e) { err = e instanceof Error ? e.message : String(e); }
        await q("rollback to savepoint a");
        await q("set local role postgres");
        assert(!permitido && /permission denied|violates row-level|new row/i.test(err),
          `anon pudo hacer ${op} en ${t} (${err || "sin error"})`);
      }
    }
  });

  await check("R. Una persona autenticada normal tampoco administra", async () => {
    const [u] = await q(
      `select m.user_id from public.memberships m
        where m.status='active' and not exists (
          select 1 from public.platform_staff ps where ps.user_id=m.user_id and ps.status='active')
        limit 1`);
    if (!u) { console.log("      (sin usuaria normal en esta base; se omite)"); return; }
    await q("savepoint b");
    await q("set local role authenticated");
    await q(`select set_config('request.jwt.claims',
              json_build_object('sub',$1::text,'role','authenticated')::text, true)`, [u.user_id]);
    const [n] = await q(`select count(*)::int c from public.public_diagnostic_campaigns`);
    const e = await falla(
      `insert into public.public_diagnostic_campaigns
         (slug,name,diagnostic_type,diagnostic_version_id) values ('x','X','pcr',$1)`, [v1.id]);
    await q("rollback to savepoint b");
    await q("set local role postgres");
    assert(n.c === 0, `una usuaria normal ve ${n.c} campañas`);
    assert(e !== "", "una usuaria normal pudo crear una campaña");
  });

  await check("S. La administración de plataforma sí, con el patrón de siempre", async () => {
    const [ps] = await q(
      `select user_id from public.platform_staff where role_code='superadmin'
        and status='active' limit 1`);
    if (!ps) { console.log("      (sin superadministrador en esta base; se omite)"); return; }
    await q("savepoint c");
    await q("set local role authenticated");
    await q(`select set_config('request.jwt.claims',
              json_build_object('sub',$1::text,'role','authenticated')::text, true)`, [ps.user_id]);
    const [n] = await q(`select count(*)::int c from public.public_diagnostic_campaigns`);
    await q("rollback to savepoint c");
    await q("set local role postgres");
    assert(n.c >= 1, "la administración de plataforma no ve las campañas");
  });

  await check("T. La superficie pública es EXACTAMENTE la declarada", async () => {
    /*
      En PD-01C esta comprobación exigía CERO funciones públicas, y era correcta:
      entonces no había ninguna. PD-01E abrió tres a propósito.

      La invariante que de verdad protege este renglón —y lo que hay que
      conservar— no es el número, es que la superficie sea la DECLARADA: que no
      aparezca una más sin que nadie la haya escrito aquí. Las tablas siguen
      cerradas, y eso se comprueba arriba y aparte.

      PD-01F añadió dos: leer el instrumento y guardar una sección. La que
      ESCRIBE el resultado —`public_diagnostic_finalize_submission`— no está en
      esta lista a propósito: solo la ejecuta `service_role`.
    */
    const esperadas = ["public_diagnostic_begin_submission",
                       "public_diagnostic_get_assessment",
                       "public_diagnostic_resolve_campaign",
                       "public_diagnostic_resume_submission",
                       "public_diagnostic_save_progress"];
    const fns = await q(
      `select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public'
          and (p.proname like 'public_diagnostic%' or p.proname like 'public_intake%')
          and array_to_string(p.proacl,',') like '%anon=X%'
        order by 1`);
    const nombres = fns.map((f) => f.proname as string);
    const sobran = nombres.filter((n) => !esperadas.includes(n));
    assert(sobran.length === 0,
      `funciones públicas sin declarar: ${sobran.join(", ")}`);
  });

  await q("rollback");
  await pg.end();
  console.log(`\nPUBLIC-DIAGNOSTICS-01C · esquema: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
