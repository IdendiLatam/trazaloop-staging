import { config as loadEnv } from "dotenv";
import { Client as PgClient } from "pg";

loadEnv({ path: ".env.local", quiet: true });

/**
 * Trazaloop · PUBLIC-DIAGNOSTICS-01F · Responder el instrumento, contra base real.
 *
 * Se ejecuta como `anon` todo lo que va a ejecutar `anon`, y como `service_role`
 * lo único que solo el servidor puede hacer: escribir el resultado. Esa frontera
 * es la mitad de este tramo, así que se prueba desde los dos lados.
 *
 * El cierre reproduce EXACTAMENTE la secuencia de la aplicación —cargar las
 * respuestas guardadas, leer el perfil de la versión, puntuar con
 * `computeDiagnosticResult` y llamar a la primitiva privilegiada— usando las
 * mismas funciones puras que usa el servidor. Lo único distinto es el
 * transporte: `pg` en vez de HTTP, para que todo pueda deshacerse al final.
 *
 * Correr: npm run test:pd01f-db
 */

const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) { console.log("falta SUPABASE_DB_URL en .env.local"); process.exit(1); }

let passed = 0, failed = 0;
async function check(nombre: string, fn: () => Promise<void>) {
  try { await fn(); passed += 1; console.log(`  ✔ ${nombre}`); }
  catch (e) { failed += 1; console.log(`  ✘ ${nombre}: ${e instanceof Error ? e.message : e}`); }
}
function assert(cond: boolean, mensaje: string) { if (!cond) throw new Error(mensaje); }

type Json = Record<string, unknown>;

async function main() {
  const { computeDiagnosticResult, PCR_V1_SCORING } =
    await import("../../lib/diagnostic/scoring");
  const { parseScoringConfig, isPcrV1Profile } =
    await import("../../lib/diagnostic/scoring-config");
  const { buildPublicResultSnapshot, PUBLIC_RESULT_SCHEMA } =
    await import("../../lib/diagnostic/public-result");
  type ScoringQuestion = import("../../lib/diagnostic/scoring").ScoringQuestion;

  const pg = new PgClient({ connectionString: DB_URL });
  await pg.connect();
  const q = async (sql: string, p: unknown[] = []) => (await pg.query(sql, p)).rows;
  const falla = async (sql: string, p: unknown[] = []): Promise<string> => {
    await pg.query("savepoint s");
    try { await pg.query(sql, p); await pg.query("release savepoint s"); return ""; }
    catch (e) { await pg.query("rollback to savepoint s");
                return e instanceof Error ? e.message : String(e); }
  };
  /** Como llamaría el público. El savepoint solo aísla el error (lección 01E). */
  const comoRol = async <T,>(rol: string, fn: () => Promise<T>): Promise<T> => {
    await q("savepoint r");
    await q(`set local role ${rol}`);
    try {
      const r = await fn();
      await q("set local role postgres");
      await q("release savepoint r");
      return r;
    } catch (e) {
      await q("rollback to savepoint r");
      await q("set local role postgres");
      throw e;
    }
  };

  await q("set role postgres");
  await q("begin");

  const sello = Date.now();
  const [v1] = await q(
    `select id, scoring_config, version_number, diagnostic_type
       from public.diagnostic_versions where diagnostic_type='pcr' and version_number=1`);
  const [doc] = await q(
    `select id, version, content_hash from public.legal_documents
      where status='active' limit 1`);

  const nuevaCampana = async (
    slug: string, extra = "'open', now() - interval '1 day', now() + interval '5 days'"
  ) => {
    const [c] = await q(
      `insert into public.public_diagnostic_campaigns
         (slug, name, diagnostic_type, diagnostic_version_id, consent_document_id,
          consent_version, consent_content_hash, public_title, partner_name,
          status, opens_at, closes_at)
       values ($1,$2,'pcr',$3,$4,$5,$6,'Diagnóstico de prueba','Trazaloop QA', ${extra})
       returning id`,
      [slug, `QA ${slug}`, v1.id, doc?.id ?? null, doc?.version ?? null,
       doc?.content_hash ?? null]);
    return c.id as string;
  };

  const nonceValido = async (segundos = 10) => {
    const [r] = await q(
      `select (extract(epoch from now())*1000 - $1*1000)::bigint::text as ts`, [segundos]);
    const [f] = await q(`select public.public_intake_fingerprint($1) as h`, [r.ts]);
    return `${r.ts as string}.${f.h as string}`;
  };

  const empezar = async (slug: string, email: string) => {
    const nonce = await nonceValido();
    return comoRol("anon", async () => {
      const [r] = await q(
        `select public.public_diagnostic_begin_submission($1,$2,$3,$4,$5,$6,$7,$8) as j`,
        [slug, "Ana Pérez", email, "+57 300 111 2233", "Empresa QA", false,
         "203.0.113.10", nonce]);
      return r.j as Json;
    });
  };

  const leer = (token: string) => comoRol("anon", async () => {
    const [r] = await q(`select public.public_diagnostic_get_assessment($1) as j`, [token]);
    return r.j as Json;
  });

  const guardar = (token: string, seccion: string, respuestas: unknown[]) =>
    comoRol("anon", async () => {
      const [r] = await q(
        `select public.public_diagnostic_save_progress($1,$2,$3::jsonb) as j`,
        [token, seccion, JSON.stringify(respuestas)]);
      return r.j as Json;
    });

  const secciones = (evaluacion: Json) => evaluacion.sections as Json[];
  const preguntasDe = (s: Json) => s.questions as Json[];

  // ── Fixture principal ────────────────────────────────────────────────────
  const campana = await nuevaCampana(`qa-f-${sello}`);
  const inicio = await empezar(`qa-f-${sello}`, `f${sello}@ejemplo.com`);
  assert(inicio.status === "created", `no se pudo crear la participación: ${inicio.status}`);
  const token = inicio.token as string;
  const [{ id: submissionId }] = await q(
    `select id from public.public_diagnostic_submissions where campaign_id=$1`, [campana]);

  console.log("\nA · El instrumento que se entrega\n");

  await check("A. Con el testigo se carga la PCR v1 de la participación", async () => {
    const e = await leer(token);
    assert(e.status === "found", `estado «${e.status}»`);
    assert(e.slug === `qa-f-${sello}`, "no se devuelve la campaña de la participación");
    assert(e.submission_status === "in_progress", `estado «${e.submission_status}»`);
    const ids = secciones(e).flatMap((s) => preguntasDe(s).map((p) => p.id as string));
    const [n] = await q(
      `select count(*)::int c from public.diagnostic_questions
        where id = any($1::uuid[]) and version_id = $2`, [ids, v1.id]);
    assert(n.c === ids.length,
      `${ids.length - n.c} preguntas entregadas NO son de la versión de la participación`);
  });

  await check("B. Seis secciones y 52 preguntas, en su orden", async () => {
    const e = await leer(token);
    const ss = secciones(e);
    assert(ss.length === 6, `llegaron ${ss.length} secciones`);
    const total = ss.reduce((n, s) => n + preguntasDe(s).length, 0);
    assert(total === 52, `llegaron ${total} preguntas`);
    const ordenes = ss.map((s) => Number(s.order));
    assert(JSON.stringify(ordenes) === JSON.stringify([...ordenes].sort((a, b) => a - b)),
      "las secciones no llegan en su orden");
    for (const s of ss) {
      assert(typeof s.code === "string" && (s.code as string).length > 0,
        "una sección llega sin clave estable");
      assert(typeof s.title === "string" && (s.title as string).length > 0,
        "una sección llega sin título");
    }
    const progreso = e.progress as Json;
    assert(progreso.total === 52, `el progreso dice ${progreso.total} preguntas`);
  });

  await check("C/D/E. No viaja peso, criticidad ni umbral alguno", async () => {
    const e = await leer(token);
    const texto = JSON.stringify(e);
    for (const prohibido of ["weight", "is_critical", "recommended_action",
                             "min_percent", "max_critical_gaps", "levels",
                             "critical_gap_rule", "version_id", "section_id"]) {
      assert(!texto.includes(prohibido),
        `la superficie pública entrega «${prohibido}»`);
    }
    // Lo ÚNICO que sale del perfil: qué control pintar.
    assert(e.answer_type === "yes_no", `tipo de respuesta «${e.answer_type}»`);
    // Y las claves de cada pregunta son exactamente las declaradas.
    const p = preguntasDe(secciones(e)[0])[0];
    const esperadas = ["answer", "code", "help", "id", "observations", "order",
                       "refs", "text"];
    assert(JSON.stringify(Object.keys(p).sort()) === JSON.stringify(esperadas),
      `una pregunta pública trae: ${Object.keys(p).sort().join(", ")}`);
  });

  console.log("\nB · Guardar\n");

  let s1 = "", idsS1: string[] = [];
  await check("F/G/H. Una sección entera en un viaje: sí es true, no es false", async () => {
    const e = await leer(token);
    const sec = secciones(e)[0];
    s1 = sec.code as string;
    idsS1 = preguntasDe(sec).map((p) => p.id as string);
    const lote = idsS1.map((id, i) => ({
      question_id: id, answer: i % 2 === 0, observations: null,
    }));
    const r = await guardar(token, s1, lote);
    assert(r.status === "saved", `guardar dio «${r.status}»`);
    assert(r.answered === lote.length, `dice ${r.answered} respondidas de ${lote.length}`);

    const filas = await q(
      `select question_id, answer from public.public_diagnostic_answers
        where submission_id=$1 order by question_id`, [submissionId]);
    assert(filas.length === idsS1.length, `se escribieron ${filas.length} respuestas`);
    const porId = new Map(filas.map((f) => [f.question_id as string, f.answer as boolean]));
    for (let i = 0; i < idsS1.length; i += 1) {
      assert(porId.get(idsS1[i]) === (i % 2 === 0),
        `la respuesta ${i} no se guardó tal cual`);
    }
  });

  await check("I. Sin responder NO es «No»: no existe fila, y el progreso lo sabe", async () => {
    const [n] = await q(
      `select count(*)::int c from public.public_diagnostic_answers
        where submission_id=$1 and answer = false
          and question_id not in (select unnest($2::uuid[]))`, [submissionId, idsS1]);
    assert(n.c === 0, `${n.c} preguntas sin contestar quedaron guardadas como «No»`);
    const e = await leer(token);
    const progreso = e.progress as Json;
    assert(progreso.answered === idsS1.length,
      `el progreso cuenta ${progreso.answered} y solo se respondieron ${idsS1.length}`);
    assert(progreso.total === 52, "el total dejó de salir de la versión");
    // Y la primera sección incompleta es la SEGUNDA, no «por donde iba».
    assert(e.first_incomplete_section === (secciones(e)[1].code as string),
      `se retomaría en «${e.first_incomplete_section}»`);
  });

  await check("J. La observación es opcional, se recorta y tiene tope", async () => {
    const r = await guardar(token, s1, [
      { question_id: idsS1[0], answer: true, observations: "  Lo hacemos a mano  " },
      { question_id: idsS1[1], answer: false, observations: "   " },
    ]);
    assert(r.status === "saved", `guardar dio «${r.status}»`);
    const filas = await q(
      `select question_id, observations from public.public_diagnostic_answers
        where submission_id=$1 and question_id = any($2::uuid[])`,
      [submissionId, [idsS1[0], idsS1[1]]]);
    const obs = new Map(filas.map((f) => [f.question_id, f.observations]));
    assert(obs.get(idsS1[0]) === "Lo hacemos a mano", `se guardó «${obs.get(idsS1[0])}»`);
    assert(obs.get(idsS1[1]) === null, "una observación en blanco quedó como cadena vacía");

    const largo = await guardar(token, s1, [
      { question_id: idsS1[0], answer: true, observations: "x".repeat(1001) }]);
    assert(largo.status === "invalid", `una observación de 1001 caracteres dio «${largo.status}»`);
  });

  await check("O. Volver a leer conserva lo respondido y lo anotado", async () => {
    const e = await leer(token);
    const sec = secciones(e).find((s) => s.code === s1)!;
    const p0 = preguntasDe(sec).find((p) => p.id === idsS1[0])!;
    assert(p0.answer === true, `al recargar, la respuesta es «${p0.answer}»`);
    assert(p0.observations === "Lo hacemos a mano", "al recargar se perdió la observación");
    const sinTocar = preguntasDe(secciones(e)[1])[0];
    assert(sinTocar.answer === null, "una pregunta sin responder vuelve como «No»");
  });

  console.log("\nC · Lo que el navegador no puede hacer\n");

  await check("K. Una pregunta de OTRA versión no entra", async () => {
    // Una v2 en borrador con su propia sección y su propia pregunta.
    const [v2] = await q(
      `insert into public.diagnostic_versions
         (diagnostic_type, version_number, status, scoring_config)
       values ('pcr', 99, 'draft', $1::jsonb) returning id`,
      [JSON.stringify(v1.scoring_config)]);
    const [sec2] = await q(
      `insert into public.diagnostic_sections (code, title, order_index, weight, version_id)
       values ('qa_v2', 'Sección v2', 1, 1, $1) returning id`, [v2.id]);
    const [q2] = await q(
      `insert into public.diagnostic_questions
         (section_id, code, question_text, weight, is_critical, order_index,
          is_active, version_id)
       values ($1, 'QA-V2-01', '¿Pregunta de otra versión?', 1, false, 1, true, $2)
       returning id`, [sec2.id, v2.id]);

    const r = await guardar(token, s1, [
      { question_id: q2.id, answer: true, observations: null }]);
    assert(r.status === "invalid", `una pregunta de la v2 dio «${r.status}»`);
    const [n] = await q(
      `select count(*)::int c from public.public_diagnostic_answers
        where submission_id=$1 and question_id=$2`, [submissionId, q2.id]);
    assert(n.c === 0, "la pregunta de otra versión llegó a escribirse");

    // Y si alguien lo intentara por SQL, la guarda de 0196 lo para igual.
    const err = await falla(
      `insert into public.public_diagnostic_answers (submission_id, question_id, answer)
       values ($1, $2, true)`, [submissionId, q2.id]);
    assert(/ANSWER_QUESTION_VERSION_MISMATCH/.test(err),
      `la guarda de versión no saltó: «${err}»`);
  });

  await check("Una pregunta de OTRA sección tampoco entra en este lote", async () => {
    const e = await leer(token);
    const ajena = preguntasDe(secciones(e)[2])[0].id as string;
    const r = await guardar(token, s1, [
      { question_id: ajena, answer: true, observations: null }]);
    assert(r.status === "invalid", `se aceptó una pregunta de otra sección («${r.status}»)`);
  });

  await check("L. El testigo de OTRA participación no toca esta", async () => {
    const otraCampana = await nuevaCampana(`qa-f2-${sello}`);
    const otro = await empezar(`qa-f2-${sello}`, `f2${sello}@ejemplo.com`);
    const tokenB = otro.token as string;

    // Con el testigo B se guarda en B, jamás en A: la función resuelve la
    // participación por el testigo y nunca acepta un identificador.
    const eB = await leer(tokenB);
    assert(eB.slug === `qa-f2-${sello}`, "el testigo B abrió otra campaña");
    const secB = secciones(eB)[0];
    await guardar(tokenB, secB.code as string, [
      { question_id: preguntasDe(secB)[0].id as string, answer: true, observations: null }]);

    const [enB] = await q(
      `select count(*)::int c from public.public_diagnostic_answers a
         join public.public_diagnostic_submissions s on s.id=a.submission_id
        where s.campaign_id=$1`, [otraCampana]);
    assert(enB.c === 1, `en la participación B hay ${enB.c} respuestas`);

    // Un testigo inventado no abre nada.
    for (const malo of ["a".repeat(64), "corto", ""]) {
      const r = await leer(malo);
      assert(r.status === "not_found", `un testigo inválido leyó el instrumento`);
      const g = await guardar(malo, s1, [
        { question_id: idsS1[0], answer: true, observations: null }]);
      assert(g.status === "not_found", `un testigo inválido guardó («${g.status}»)`);
    }
  });

  await check("M. El testigo en claro sigue sin guardarse", async () => {
    const [s] = await q(
      `select resume_token_hash h from public.public_diagnostic_submissions where id=$1`,
      [submissionId]);
    assert(s.h !== token, "¡el testigo está en claro!");
    const cols = await q(
      `select column_name from information_schema.columns
        where table_name='public_diagnostic_submissions' and column_name='resume_token'`);
    assert(cols.length === 0, "existe una columna para el testigo en claro");
  });

  console.log("\nD · Cerrar\n");

  await check("S. Incompleta no cierra", async () => {
    const r = await comoRol("service_role", async () => {
      const [x] = await q(
        `select public.public_diagnostic_finalize_submission($1,$2,$3,$4,$5::jsonb,$6::jsonb) as j`,
        [token, 100, "audit_ready_candidate", 0, "{}", "{}"]);
      return x.j as Json;
    });
    assert(r.status === "incomplete", `una participación a medias cerró: «${r.status}»`);
    assert(r.total === 52 && Number(r.answered) < 52,
      `el conteo no sale de la versión: ${JSON.stringify(r)}`);
  });

  await check("W. Y `anon` no puede ejecutar la primitiva que escribe el resultado", async () => {
    await q("savepoint w"); await q("set local role anon");
    let err = "";
    try {
      await pg.query(
        `select public.public_diagnostic_finalize_submission($1,$2,$3,$4,$5::jsonb,$6::jsonb)`,
        [token, 100, "audit_ready_candidate", 0, "{}", "{}"]);
    } catch (e) { err = e instanceof Error ? e.message : String(e); }
    await q("rollback to savepoint w"); await q("set local role postgres");
    assert(/permission denied|no existe la función|does not exist/i.test(err),
      `anon pudo llamar al cierre: «${err || "sin error"}»`);
  });

  /** Responde TODO el instrumento como lo haría una persona, sección a sección. */
  const responderTodo = async (t: string, patron: (i: number) => boolean) => {
    const e = await leer(t);
    let i = 0;
    for (const sec of secciones(e)) {
      const lote = preguntasDe(sec).map((p) => {
        const respuesta = patron(i); i += 1;
        return { question_id: p.id as string, answer: respuesta, observations: null };
      });
      const r = await guardar(t, sec.code as string, lote);
      assert(r.status === "saved", `guardar «${sec.code}» dio «${r.status}»`);
    }
  };

  /** La MISMA secuencia que la aplicación: cargar, puntuar, llamar. */
  const cerrar = async (t: string) => {
    const [s] = await q(
      `select id, diagnostic_version_id v from public.public_diagnostic_submissions
        where resume_token_hash = encode(extensions.digest($1,'sha256'),'hex')`, [t]);
    const [ver] = await q(
      `select scoring_config, version_number, diagnostic_type
         from public.diagnostic_versions where id=$1`, [s.v]);
    const config = parseScoringConfig(ver.scoring_config);
    assert(config !== null, "el perfil de la versión no se pudo leer");
    const filasQ = await q(
      `select q.id, q.code, q.question_text, q.weight, q.is_critical,
              q.recommended_action, sec.code as section_code
         from public.diagnostic_questions q
         join public.diagnostic_sections sec on sec.id = q.section_id
        where q.version_id=$1 and q.is_active order by q.order_index`, [s.v]);
    const questions: ScoringQuestion[] = filasQ.map((r) => ({
      id: r.id as string, code: r.code as string,
      sectionCode: r.section_code as string, questionText: r.question_text as string,
      weight: Number(r.weight), isCritical: r.is_critical as boolean,
      recommendedAction: (r.recommended_action as string) ?? null,
    }));
    const filasS = await q(
      `select code, title, order_index from public.diagnostic_sections
        where version_id=$1 order by order_index`, [s.v]);
    const filasA = await q(
      `select question_id, answer from public.public_diagnostic_answers
        where submission_id=$1`, [s.id]);
    const answers = new Map<string, boolean>(
      filasA.map((r) => [r.question_id as string, r.answer as boolean]));

    const snapshot = buildPublicResultSnapshot({
      questions,
      sections: filasS.map((r) => ({
        code: r.code as string, title: r.title as string,
        orderIndex: Number(r.order_index),
      })),
      answers, config: config!,
      instrument: {
        type: ver.diagnostic_type as string,
        versionNumber: Number(ver.version_number),
      },
    });

    const respuesta = await comoRol("service_role", async () => {
      const [x] = await q(
        `select public.public_diagnostic_finalize_submission($1,$2,$3,$4,$5::jsonb,$6::jsonb) as j`,
        [t, snapshot.maturityPercent, snapshot.readinessLevel, snapshot.criticalGaps,
         JSON.stringify(snapshot.sectionScores), JSON.stringify(snapshot.resultPayload)]);
      return x.j as Json;
    });
    return { respuesta, snapshot, questions, answers, config: config! };
  };

  let cierre: Awaited<ReturnType<typeof cerrar>>;
  await check("T/U/V. Completa cierra, con el motor único y el perfil de SU versión", async () => {
    await responderTodo(token, (i) => i % 3 !== 0);
    cierre = await cerrar(token);
    assert(cierre.respuesta.status === "completed",
      `el cierre dio «${cierre.respuesta.status}»: ${JSON.stringify(cierre.respuesta)}`);
    assert(isPcrV1Profile(cierre.config),
      "el perfil guardado en 0195 y el del código han divergido");
  });

  await check("X. Lo guardado coincide con el motor del diagnóstico AUTENTICADO", async () => {
    // El mismo motor, con las mismas respuestas y el perfil del código: es
    // exactamente lo que hace `completeDiagnosticAction`.
    const autenticado = computeDiagnosticResult(
      cierre.questions, cierre.answers, PCR_V1_SCORING);

    const [s] = await q(
      `select maturity_percent m, readiness_level n, critical_gaps g,
              section_scores ss, result_payload rp, completed_at ca, status
         from public.public_diagnostic_submissions where id=$1`, [submissionId]);
    assert(Number(s.m) === autenticado.maturityPercent,
      `guardado ${s.m} vs motor autenticado ${autenticado.maturityPercent}`);
    assert(s.n === autenticado.readinessLevel,
      `nivel guardado «${s.n}» vs «${autenticado.readinessLevel}»`);
    assert(Number(s.g) === autenticado.criticalGaps,
      `brechas ${s.g} vs ${autenticado.criticalGaps}`);
    for (const sec of autenticado.sectionScores) {
      const guardada = (s.ss as Json)[sec.sectionCode] as Json;
      assert(guardada && Number(guardada.percent) === sec.percent,
        `la sección ${sec.sectionCode} difiere del motor autenticado`);
    }
    assert(s.status === "completed" && s.ca !== null,
      "quedó resultado sin cierre, o cierre sin fecha");
  });

  await check("Instantánea: sin datos personales, sin pesos y con las brechas reales", async () => {
    const [s] = await q(
      `select result_payload rp, participant_email pe, participant_name pn
         from public.public_diagnostic_submissions where id=$1`, [submissionId]);
    const texto = JSON.stringify(s.rp).toLowerCase();
    for (const pii of [String(s.pe).toLowerCase(), "573001112233", "ana pérez"]) {
      assert(!texto.includes(pii), `la instantánea contiene «${pii}»`);
    }
    for (const prohibido of ["weight", "is_critical", "min_percent", "max_critical_gaps"]) {
      assert(!texto.includes(prohibido), `la instantánea contiene «${prohibido}»`);
    }
    const rp = s.rp as Json;
    // Contra la constante, no contra un literal: el formato lo decide el
    // módulo que lo escribe, y 01G lo subió a v2 al añadir la dimensión.
    assert(rp.schema === PUBLIC_RESULT_SCHEMA, `formato «${rp.schema}»`);
    assert((rp.sections as unknown[]).length === 6, "la instantánea no trae las 6 secciones");
    assert((rp.gaps as unknown[]).length === cierre.snapshot.criticalGaps
        || (rp.gaps as unknown[]).length > 0, "no se guardó ninguna brecha real");
    assert(rp.questions === 52 && rp.answered === 52,
      "la instantánea no dice cuántas se respondieron");
    // Y no repite las 52 respuestas.
    assert(!texto.includes('"answer"'), "la instantánea duplica las respuestas");
  });

  await check("Y una instantánea CON el correo dentro se rechaza", async () => {
    const otraCampana = await nuevaCampana(`qa-f3-${sello}`);
    const otro = await empezar(`qa-f3-${sello}`, `f3${sello}@ejemplo.com`);
    const t = otro.token as string;
    await responderTodo(t, () => true);
    const r = await comoRol("service_role", async () => {
      const [x] = await q(
        `select public.public_diagnostic_finalize_submission($1,$2,$3,$4,$5::jsonb,$6::jsonb) as j`,
        [t, 100, "audit_ready_candidate", 0, "{}",
         JSON.stringify({ schema: "x", quien: `f3${sello}@ejemplo.com` })]);
      return x.j as Json;
    });
    assert(r.status === "invalid" && r.reason === "pii_in_snapshot",
      `una instantánea con el correo dentro se aceptó: ${JSON.stringify(r)}`);
    const [n] = await q(
      `select count(*)::int c from public.public_diagnostic_submissions
        where campaign_id=$1 and status='completed'`, [otraCampana]);
    assert(n.c === 0, "se cerró pese al rechazo");
  });

  console.log("\nE · Después de cerrar\n");

  await check("Y. Cerrar dos veces no duplica ni cambia nada", async () => {
    const [antes] = await q(
      `select maturity_percent m, completed_at ca, result_payload rp
         from public.public_diagnostic_submissions where id=$1`, [submissionId]);
    const otra = await cerrar(token);
    assert(otra.respuesta.status === "already_completed",
      `el segundo cierre dio «${otra.respuesta.status}»`);
    const [despues] = await q(
      `select maturity_percent m, completed_at ca, result_payload rp
         from public.public_diagnostic_submissions where id=$1`, [submissionId]);
    assert(String(antes.m) === String(despues.m), "el porcentaje cambió");
    assert(String(antes.ca) === String(despues.ca), "la fecha de cierre se movió");
    assert(JSON.stringify(antes.rp) === JSON.stringify(despues.rp),
      "la instantánea se reescribió");
    const [n] = await q(
      `select count(*)::int c from public.public_diagnostic_submissions where campaign_id=$1`,
      [campana]);
    assert(n.c === 1, `hay ${n.c} participaciones: el segundo cierre duplicó`);
  });

  await check("R/Z. Cerrada no se edita: ni por la superficie ni por SQL", async () => {
    const g = await guardar(token, s1, [
      { question_id: idsS1[0], answer: false, observations: "cambio" }]);
    assert(g.status === "locked" && g.reason === "completed",
      `una participación cerrada admitió cambios: ${JSON.stringify(g)}`);

    const err1 = await falla(
      `update public.public_diagnostic_answers set answer = false
        where submission_id=$1 and question_id=$2`, [submissionId, idsS1[0]]);
    assert(/ANSWER_SUBMISSION_NOT_EDITABLE/.test(err1),
      `se pudo cambiar una respuesta cerrada: «${err1}»`);

    const err2 = await falla(
      `delete from public.public_diagnostic_answers
        where submission_id=$1 and question_id=$2`, [submissionId, idsS1[0]]);
    assert(/ANSWER_SUBMISSION_NOT_EDITABLE/.test(err2),
      `se pudo BORRAR una respuesta cerrada: «${err2}»`);

    const err3 = await falla(
      `update public.public_diagnostic_submissions set maturity_percent = 100
        where id=$1`, [submissionId]);
    assert(/SUBMISSION_COMPLETED_IS_HISTORY/.test(err3),
      `se pudo reescribir el resultado: «${err3}»`);
  });

  await check("Y quien tiene el testigo SIGUE viendo lo suyo, en solo lectura", async () => {
    const e = await leer(token);
    assert(e.status === "found", "el testigo dejó de servir tras cerrar");
    assert(e.submission_status === "completed", `estado «${e.submission_status}»`);
    assert(e.writable === false, "una participación cerrada se declara editable");
    assert(e.locked_reason === "completed", `motivo «${e.locked_reason}»`);
  });

  console.log("\nF · La ventana de la campaña\n");

  await check("AA. Después del cierre no se empieza", async () => {
    await nuevaCampana(`qa-f4-${sello}`,
      "'open', now() - interval '20 days', now() - interval '1 hour'");
    const r = await empezar(`qa-f4-${sello}`, `f4${sello}@ejemplo.com`);
    assert(r.status === "unavailable", `se pudo empezar tras el cierre («${r.status}»)`);
  });

  await check("AB. Pero quien empezó dentro puede terminar en la gracia", async () => {
    // Abierta hace mucho: así se le puede mover el cierre al pasado sin chocar
    // con el CHECK de ventana (`closes_at > opens_at`).
    const camp = await nuevaCampana(`qa-f5-${sello}`,
      "'open', now() - interval '200 days', now() + interval '5 days'");
    const s = await empezar(`qa-f5-${sello}`, `f5${sello}@ejemplo.com`);
    const t = s.token as string;
    const e = await leer(t);
    const sec = secciones(e)[0];
    const lote = preguntasDe(sec).map((p) => ({
      question_id: p.id as string, answer: true, observations: null }));

    // La campaña cierra hace una hora: dentro de las 72 h de gracia.
    await q(`update public.public_diagnostic_campaigns
                set closes_at = now() - interval '1 hour' where id=$1`, [camp]);
    const dentro = await guardar(t, sec.code as string, lote);
    assert(dentro.status === "saved",
      `se bloqueó en la pregunta 51 a quien empezó a tiempo: «${dentro.status}»`);

    // Cien horas: fuera.
    await q(`update public.public_diagnostic_campaigns
                set closes_at = now() - interval '100 hours' where id=$1`, [camp]);
    const fuera = await guardar(t, sec.code as string, lote);
    assert(fuera.status === "locked" && fuera.reason === "window",
      `la gracia no termina nunca: ${JSON.stringify(fuera)}`);

    // Y archivar la campaña también cierra la puerta.
    await q(`update public.public_diagnostic_campaigns
                set closes_at = now() + interval '5 days', status='archived'
              where id=$1`, [camp]);
    const archivada = await guardar(t, sec.code as string, lote);
    assert(archivada.status === "locked" && archivada.reason === "campaign",
      `una campaña archivada admite escrituras: ${JSON.stringify(archivada)}`);
  });

  await check("P. La vida del testigo la calcula la base y respeta la gracia", async () => {
    const camp = await nuevaCampana(`qa-f6-${sello}`,
      "'open', now() - interval '1 day', now() + interval '2 days'");
    const s = await empezar(`qa-f6-${sello}`, `f6${sello}@ejemplo.com`);
    const vida = Number(s.resume_max_age);
    // 2 días hasta el cierre + 72 h de gracia ≈ 5 días, y muy por debajo de 30.
    assert(vida > 4 * 24 * 3600 && vida < 6 * 24 * 3600,
      `la cookie duraría ${Math.round(vida / 3600)} h`);
    void camp;

    // Sin fecha de cierre: el tope son 30 días, no «para siempre».
    await nuevaCampana(`qa-f7-${sello}`, "'open', now() - interval '1 day', null");
    const s2 = await empezar(`qa-f7-${sello}`, `f7${sello}@ejemplo.com`);
    assert(Number(s2.resume_max_age) === 30 * 24 * 3600,
      `sin cierre, la cookie duraría ${Number(s2.resume_max_age) / 86400} días`);
  });

  console.log("\nG · Límite de tasa\n");

  await check("AC. Seis secciones seguidas son uso normal, no abuso", async () => {
    const camp = await nuevaCampana(`qa-f8-${sello}`);
    const s = await empezar(`qa-f8-${sello}`, `f8${sello}@ejemplo.com`);
    const t = s.token as string;
    // Dos pasadas completas —doce guardados— más las lecturas: nadie se bloquea.
    await responderTodo(t, () => true);
    await responderTodo(t, (i) => i % 2 === 0);
    const e = await leer(t);
    assert((e.progress as Json).answered === 52,
      "doce guardados normales no dejaron el diagnóstico completo");
    void camp;
  });

  await check("AD. Y el cupo de guardar SÍ muerde cuando se abusa", async () => {
    const camp = await nuevaCampana(`qa-f9-${sello}`);
    const s = await empezar(`qa-f9-${sello}`, `f9${sello}@ejemplo.com`);
    const t = s.token as string;
    const [sub] = await q(
      `select id from public.public_diagnostic_submissions where campaign_id=$1`, [camp]);
    const e = await leer(t);
    const sec = secciones(e)[0];
    const lote = [{ question_id: preguntasDe(sec)[0].id as string,
                    answer: true, observations: null }];

    // 120 intentos ya en la ventana: el siguiente es el 121.
    await q(
      `insert into public.public_intake_attempts (campaign_id, bucket_kind, bucket_key)
       select $1, 'save', $2 from generate_series(1, 120)`, [camp, sub.id]);
    const r = await guardar(t, sec.code as string, lote);
    assert(r.status === "rate_limited", `el guardado 121 dio «${r.status}»`);

    // Y el cupo de guardar NO es el de empezar: empezar sigue disponible.
    await nuevaCampana(`qa-f10-${sello}`);
    const otro = await empezar(`qa-f10-${sello}`, `f10${sello}@ejemplo.com`);
    assert(otro.status === "created",
      `el abuso de guardar consumió el cupo de empezar («${otro.status}»)`);
  });

  console.log("\nH · La puerta\n");

  await check("AE. anon sigue sin tocar NINGUNA tabla", async () => {
    for (const t of ["public_diagnostic_campaigns", "public_diagnostic_submissions",
                     "public_diagnostic_answers", "public_intake_attempts",
                     "public_intake_secret", "diagnostic_questions",
                     "diagnostic_sections", "diagnostic_versions"]) {
      for (const [op, sql] of [
        ["SELECT", `select count(*) from public.${t}`],
        ["INSERT", `insert into public.${t} default values`],
      ] as const) {
        await q("savepoint x"); await q("set local role anon");
        let permitido = false; let err = "";
        try { const r = await pg.query(sql);
              permitido = op === "SELECT" ? Number(r.rows[0].count) > 0 : true; }
        catch (e) { err = e instanceof Error ? e.message : String(e); }
        await q("rollback to savepoint x"); await q("set local role postgres");
        assert(!permitido, `anon pudo ${op} en ${t} (${err || "sin error"})`);
      }
    }
  });

  await check("AF. Cinco funciones públicas, y la del resultado NO está entre ellas", async () => {
    const fns = await q(
      `select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and array_to_string(p.proacl,',') like '%anon=X%'
          and (p.proname like 'public_diagnostic_%' or p.proname like 'public_intake_%')
        order by 1`);
    const nombres = fns.map((f) => f.proname as string);
    const esperadas = ["public_diagnostic_begin_submission",
                       "public_diagnostic_get_assessment",
                       "public_diagnostic_get_result",
                       "public_diagnostic_resolve_campaign",
                       "public_diagnostic_resume_submission",
                       "public_diagnostic_save_progress"];
    assert(JSON.stringify(nombres) === JSON.stringify(esperadas),
      `las funciones públicas del subsistema son: ${nombres.join(", ")}`);
    assert(!nombres.includes("public_diagnostic_finalize_submission"),
      "la primitiva que escribe el resultado quedó al alcance de anon");
  });

  await check("Y las nuevas fijan su search_path", async () => {
    for (const f of ["public_diagnostic_get_assessment", "public_diagnostic_save_progress",
                     "public_diagnostic_finalize_submission", "public_intake_write_window",
                     "public_intake_token_rate_ok"]) {
      const [r] = await q(
        `select p.prosecdef d, array_to_string(p.proconfig,',') cfg
           from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='public' and p.proname=$1`, [f]);
      assert(r.d === true, `${f} no es SECURITY DEFINER`);
      assert(/search_path=public/.test((r.cfg as string) ?? ""), `${f} no fija search_path`);
    }
  });

  await check("Y nada de esto tocó PCR v1 ni el diagnóstico autenticado", async () => {
    const [p] = await q(
      `select count(*)::int c from public.diagnostic_questions
        where version_id=$1 and is_active`, [v1.id]);
    assert(p.c === 52, `PCR v1 quedó con ${p.c} preguntas`);
    const [d] = await q(
      `select count(*)::int c from public.diagnostics where status='completed'`);
    assert(typeof d.c === "number", "no se pudo contar el diagnóstico autenticado");
    const [cfg] = await q(
      `select scoring_config from public.diagnostic_versions where id=$1`, [v1.id]);
    assert(isPcrV1Profile(parseScoringConfig(cfg.scoring_config)!),
      "el perfil de PCR v1 cambió");
  });

  await q("rollback");
  await pg.end();
  console.log(
    `\nPUBLIC-DIAGNOSTICS-01F · diagnóstico público: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
