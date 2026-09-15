import { config as loadEnv } from "dotenv";
import { Client as PgClient } from "pg";

loadEnv({ path: ".env.local", quiet: true });

/**
 * Trazaloop · PUBLIC-DIAGNOSTICS-01G · El resultado que recibe la empresa.
 *
 * Lo que se comprueba aquí, contra base real y como `anon`:
 *
 *   · que lo que se entrega es la INSTANTÁNEA congelada, byte a byte, y no
 *     algo recompuesto —si se recalculara, un cambio de código movería un
 *     resultado ya entregado—;
 *   · que solo lo ve quien trae el testigo de ESA participación;
 *   · que cerrar o archivar la campaña no se lo quita a quien ya lo tenía;
 *   · que el consentimiento comercial no cambia ni una coma del informe; y
 *   · que repetir crea una participación nueva sin tocar la anterior.
 *
 * Correr: npm run test:pd01g-db
 */

const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) { console.log("falta SUPABASE_DB_URL en .env.local"); process.exit(1); }

let passed = 0, failed = 0;
async function check(nombre: string, fn: () => Promise<void>) {
  try { await fn(); passed += 1; console.log(`  ✔ ${nombre}`); }
  catch (e) { failed += 1; console.log(`  ✘ ${nombre}: ${e instanceof Error ? e.message : e}`); }
}
function assert(cond: boolean, mensaje: string) { if (!cond) throw new Error(mensaje); }

/**
 * `jsonb` reordena las claves, así que comparar dos `JSON.stringify` da falsos
 * rojos: lo que vuelve de la base y lo que se compuso en TypeScript son el
 * mismo dato con las claves en otro orden. Se compara canónicamente.
 */
function canonico(x: unknown): string {
  if (Array.isArray(x)) return `[${x.map(canonico).join(",")}]`;
  if (x !== null && typeof x === "object") {
    const o = x as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonico(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(x);
}

type Json = Record<string, unknown>;

async function main() {
  const { parseScoringConfig } = await import("../../lib/diagnostic/scoring-config");
  const { buildPublicResultSnapshot } = await import("../../lib/diagnostic/public-result");
  const { parsePublicSnapshot, buildPublicReport } =
    await import("../../lib/domain/public-diagnostic-report");
  type ScoringQuestion = import("../../lib/diagnostic/scoring").ScoringQuestion;

  const pg = new PgClient({ connectionString: DB_URL });
  await pg.connect();
  const q = async (sql: string, p: unknown[] = []) => (await pg.query(sql, p)).rows;
  const comoAnon = async <T,>(fn: () => Promise<T>): Promise<T> => {
    await q("savepoint anon");
    await q("set local role anon");
    try {
      const r = await fn();
      await q("set local role postgres"); await q("release savepoint anon");
      return r;
    } catch (e) {
      await q("rollback to savepoint anon"); await q("set local role postgres");
      throw e;
    }
  };

  await q("set role postgres");
  await q("begin");

  const sello = Date.now();
  const [v1] = await q(
    `select id from public.diagnostic_versions where diagnostic_type='pcr' and version_number=1`);
  const [doc] = await q(
    `select id, version, content_hash from public.legal_documents
      where status='active' limit 1`);

  const nuevaCampana = async (
    slug: string, repetir = false,
    extra = "'open', now() - interval '1 day', now() + interval '10 days'"
  ) => {
    const [c] = await q(
      `insert into public.public_diagnostic_campaigns
         (slug, name, diagnostic_type, diagnostic_version_id, consent_document_id,
          consent_version, consent_content_hash, public_title, partner_name,
          allow_repeat, status, opens_at, closes_at)
       values ($1,$2,'pcr',$3,$4,$5,$6,'Diagnóstico de prueba','Trazaloop QA',$7, ${extra})
       returning id`,
      [slug, `QA ${slug}`, v1.id, doc?.id ?? null, doc?.version ?? null,
       doc?.content_hash ?? null, repetir]);
    return c.id as string;
  };
  const nonce = async () => {
    const [r] = await q(
      `select (extract(epoch from now())*1000 - 10000)::bigint::text as ts`);
    const [f] = await q(`select public.public_intake_fingerprint($1) as h`, [r.ts]);
    return `${r.ts as string}.${f.h as string}`;
  };
  const empezar = async (
    slug: string, email: string,
    o: { marketing?: boolean; empresa?: string; repeatToken?: string | null } = {}
  ) => {
    const n = await nonce();
    return comoAnon(async () => {
      const [r] = await q(
        `select public.public_diagnostic_begin_submission($1,$2,$3,$4,$5,$6,$7,$8,$9) as j`,
        [slug, "Ana Pérez", email, "+57 300 111 2233", o.empresa ?? "Empresa QA",
         o.marketing ?? false, "203.0.113.10", n, o.repeatToken ?? null]);
      return r.j as Json;
    });
  };
  const leerEval = (t: string) => comoAnon(async () => {
    const [r] = await q(`select public.public_diagnostic_get_assessment($1) as j`, [t]);
    return r.j as Json;
  });
  const guardar = (t: string, sec: string, lote: unknown[]) => comoAnon(async () => {
    const [r] = await q(
      `select public.public_diagnostic_save_progress($1,$2,$3::jsonb) as j`,
      [t, sec, JSON.stringify(lote)]);
    return r.j as Json;
  });
  const resultado = (t: string) => comoAnon(async () => {
    const [r] = await q(`select public.public_diagnostic_get_result($1) as j`, [t]);
    return r.j as Json;
  });

  /** Responde el instrumento entero y lo cierra, como hace la aplicación. */
  const completar = async (t: string, patron: (i: number) => boolean) => {
    const e = await leerEval(t);
    let i = 0;
    for (const sec of e.sections as Json[]) {
      const lote = (sec.questions as Json[]).map((p) => {
        const r = patron(i); i += 1;
        return { question_id: p.id as string, answer: r, observations: null };
      });
      const g = await guardar(t, sec.code as string, lote);
      assert(g.status === "saved", `guardar dio «${g.status}»`);
    }
    const [s] = await q(
      `select id, diagnostic_version_id v from public.public_diagnostic_submissions
        where resume_token_hash = encode(extensions.digest($1,'sha256'),'hex')`, [t]);
    const [ver] = await q(
      `select scoring_config, version_number, diagnostic_type
         from public.diagnostic_versions where id=$1`, [s.v]);
    const cfg = parseScoringConfig(ver.scoring_config);
    const filasQ = await q(
      `select q.id, q.code, q.question_text, q.weight, q.is_critical,
              q.recommended_action, sec.code as section_code
         from public.diagnostic_questions q
         join public.diagnostic_sections sec on sec.id=q.section_id
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
    const snap = buildPublicResultSnapshot({
      questions,
      sections: filasS.map((r) => ({
        code: r.code as string, title: r.title as string,
        orderIndex: Number(r.order_index) })),
      answers: new Map(filasA.map((r) => [r.question_id as string, r.answer as boolean])),
      config: cfg!,
      instrument: { type: ver.diagnostic_type as string,
                    versionNumber: Number(ver.version_number) },
    });
    const [x] = await q(
      `select public.public_diagnostic_finalize_submission($1,$2,$3,$4,$5::jsonb,$6::jsonb) as j`,
      [t, snap.maturityPercent, snap.readinessLevel, snap.criticalGaps,
       JSON.stringify(snap.sectionScores), JSON.stringify(snap.resultPayload)]);
    assert((x.j as Json).status === "completed",
      `el cierre dio «${(x.j as Json).status}»`);
    return { submissionId: s.id as string, snapshot: snap };
  };

  // ── Fixture ──────────────────────────────────────────────────────────────
  const camp = await nuevaCampana(`qa-g-${sello}`);
  const inicio = await empezar(`qa-g-${sello}`, `g${sello}@ejemplo.com`,
    { empresa: "Recicladora de Prueba SAS" });
  const token = inicio.token as string;

  console.log("\nA · De dónde sale el resultado\n");

  await check("B. A medias no hay resultado, y se dice sin filtrar nada", async () => {
    const r = await resultado(token);
    assert(r.status === "not_completed", `estado «${r.status}»`);
    assert(!("result" in r), "se devolvió un resultado de algo sin cerrar");
    assert(!("company_name" in r), "se devolvió la empresa antes de cerrar");
  });

  const cerrado = await completar(token, (i) => i % 3 !== 0);

  await check("A/D. Cerrado, devuelve la INSTANTÁNEA guardada, byte a byte", async () => {
    const r = await resultado(token);
    assert(r.status === "found", `estado «${r.status}»`);
    const [fila] = await q(
      `select result_payload rp from public.public_diagnostic_submissions where id=$1`,
      [cerrado.submissionId]);
    assert(JSON.stringify(r.result) === JSON.stringify(fila.rp),
      "lo devuelto no es exactamente lo persistido: en algún punto se recompuso");
    // Y es lo que se congeló al cerrar, no algo equivalente.
    assert(canonico(r.result) === canonico(cerrado.snapshot.resultPayload),
      "lo devuelto difiere de lo que se congeló al cerrar");
  });

  await check("F/G/H. Porcentaje, nivel y las seis dimensiones en su orden", async () => {
    const r = await resultado(token);
    const snap = parsePublicSnapshot(r.result);
    assert(snap !== null, "la instantánea entregada no se puede leer");
    assert(snap!.maturity_percent === cerrado.snapshot.maturityPercent,
      `porcentaje ${snap!.maturity_percent} vs ${cerrado.snapshot.maturityPercent}`);
    assert(snap!.readiness_level === cerrado.snapshot.readinessLevel, "nivel distinto");
    assert(snap!.readiness_label.length > 0, "el nivel llega sin etiqueta legible");
    assert(snap!.sections.length === 6, `llegaron ${snap!.sections.length} dimensiones`);
    const orden = await q(
      `select sec.code from public.diagnostic_sections sec
        where sec.version_id=$1 order by sec.order_index`, [v1.id]);
    assert(JSON.stringify(snap!.sections.map((s) => s.code))
        === JSON.stringify(orden.map((o) => o.code)),
      "las dimensiones no llegan en el orden del instrumento");
    for (const s of snap!.sections) {
      assert(typeof s.title === "string" && s.title.length > 0,
        `la dimensión ${s.code} llega sin nombre`);
    }
  });

  await check("K/L. Brechas y recomendaciones salen de la instantánea", async () => {
    const r = await resultado(token);
    const snap = parsePublicSnapshot(r.result)!;
    const [noes] = await q(
      `select count(*)::int c from public.public_diagnostic_answers
        where submission_id=$1 and answer=false`, [cerrado.submissionId]);
    assert(snap.gaps.length === noes.c,
      `${snap.gaps.length} brechas frente a ${noes.c} respuestas «No»`);
    for (const g of snap.gaps) {
      assert(typeof g.question === "string" && g.question.length > 0,
        "una brecha llega sin su pregunta");
      assert(g.section !== null, "una brecha llega sin decir de qué dimensión es");
    }
    const informe = buildPublicReport(snap);
    assert(informe.recommendations.length > 0, "no se compuso ninguna recomendación");
    // Sin repetir la misma acción dentro de una dimensión.
    for (const grupo of informe.recommendations) {
      assert(new Set(grupo.actions).size === grupo.actions.length,
        `«${grupo.sectionTitle}» repite una recomendación`);
    }
    // Y cada acción existe tal cual en el catálogo: no se reescribió nada.
    const catalogo = await q(
      `select distinct recommended_action a from public.diagnostic_questions
        where version_id=$1 and recommended_action is not null`, [v1.id]);
    const conocidas = new Set(catalogo.map((c) => c.a as string));
    for (const grupo of informe.recommendations) {
      for (const a of grupo.actions) {
        assert(conocidas.has(a), `recomendación inventada: «${a.slice(0, 40)}…»`);
      }
    }
  });

  console.log("\nB · Qué NO viaja\n");

  await check("I/J. Ni puntuación interna ni datos personales, salvo la empresa", async () => {
    const r = await resultado(token);
    const texto = JSON.stringify(r).toLowerCase();
    for (const prohibido of ["weight", "is_critical", "criticality", "min_percent",
                             "max_critical_gaps", "scoring_config", "levels",
                             "resume_token", "consent_content_hash", "consent_version",
                             "submission_id", "campaign_id", "diagnostic_version_id"]) {
      assert(!texto.includes(prohibido), `el resultado público entrega «${prohibido}»`);
    }
    const [s] = await q(
      `select participant_email pe, participant_name pn, participant_phone_normalized pt
         from public.public_diagnostic_submissions where id=$1`, [cerrado.submissionId]);
    for (const pii of [String(s.pe).toLowerCase(), String(s.pn).toLowerCase(),
                       String(s.pt)]) {
      assert(!texto.includes(pii), `el resultado público entrega «${pii}»`);
    }
    // La empresa SÍ: la escribió quien está mirando su propio resultado.
    assert(r.company_name === "Recicladora de Prueba SAS",
      `la empresa llegó como «${r.company_name}»`);
  });

  console.log("\nC · Quién puede verlo\n");

  await check("C/R. Un testigo ajeno o inválido no abre este resultado", async () => {
    const otraCamp = await nuevaCampana(`qa-g2-${sello}`);
    const otro = await empezar(`qa-g2-${sello}`, `g2${sello}@ejemplo.com`);
    const tokenB = otro.token as string;
    const b = await resultado(tokenB);
    assert(b.status === "not_completed",
      `el testigo B leyó algo distinto de lo suyo: «${b.status}»`);
    void otraCamp;

    for (const malo of ["a".repeat(64), "corto", "", token.slice(0, 63) + "0"]) {
      const r = await resultado(malo);
      assert(r.status === "not_found",
        `un testigo inválido obtuvo «${r.status}» en vez de la respuesta genérica`);
      assert(Object.keys(r).length === 1,
        `la respuesta a un testigo inválido dice de más: ${Object.keys(r).join(", ")}`);
    }
  });

  await check("Z. Y `anon` sigue sin tocar ninguna tabla", async () => {
    for (const t of ["public_diagnostic_submissions", "public_diagnostic_campaigns",
                     "public_diagnostic_answers", "public_intake_attempts",
                     "public_intake_secret"]) {
      await q("savepoint x"); await q("set local role anon");
      let permitido = false;
      try { const r = await pg.query(`select count(*) from public.${t}`);
            permitido = Number(r.rows[0].count) > 0; } catch { /* denegado */ }
      await q("rollback to savepoint x"); await q("set local role postgres");
      assert(!permitido, `anon pudo leer ${t}`);
    }
    const fns = await q(
      `select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public'
          and (p.proname like 'public_diagnostic_%' or p.proname like 'public_intake_%')
          and has_function_privilege('anon', p.oid, 'EXECUTE') order by 1`);
    const esperadas = ["public_diagnostic_begin_submission",
                       "public_diagnostic_get_assessment",
                       "public_diagnostic_get_result",
                       "public_diagnostic_resolve_campaign",
                       "public_diagnostic_resume_submission",
                       "public_diagnostic_save_progress"];
    assert(JSON.stringify(fns.map((f) => f.proname)) === JSON.stringify(esperadas),
      `superficie pública: ${fns.map((f) => f.proname).join(", ")}`);
  });

  console.log("\nD · El consentimiento comercial no cambia el informe\n");

  await check("M/N. Con y sin «sí» comercial, el resultado es el MISMO", async () => {
    const patron = (i: number) => i % 4 !== 0;
    const campNo = await nuevaCampana(`qa-g-no-${sello}`);
    const sinMkt = await empezar(`qa-g-no-${sello}`, `no${sello}@ejemplo.com`,
      { marketing: false, empresa: "Idéntica SAS" });
    await completar(sinMkt.token as string, patron);

    const campSi = await nuevaCampana(`qa-g-si-${sello}`);
    const conMkt = await empezar(`qa-g-si-${sello}`, `si${sello}@ejemplo.com`,
      { marketing: true, empresa: "Idéntica SAS" });
    await completar(conMkt.token as string, patron);

    const a = await resultado(sinMkt.token as string);
    const b = await resultado(conMkt.token as string);
    assert(a.status === "found" && b.status === "found",
      "alguno de los dos no obtuvo resultado");
    assert(canonico(a.result) === canonico(b.result),
      "el informe cambia según el consentimiento comercial: eso es cobrar el "
      + "resultado con una autorización");

    const [f] = await q(
      `select marketing_opt_in m from public.public_diagnostic_submissions s
         join public.public_diagnostic_campaigns c on c.id=s.campaign_id
        where c.id=$1`, [campNo]);
    const [g] = await q(
      `select marketing_opt_in m from public.public_diagnostic_submissions s
         join public.public_diagnostic_campaigns c on c.id=s.campaign_id
        where c.id=$1`, [campSi]);
    assert(f.m === false && g.m === true, "el fixture no distingue los dos casos");
  });

  console.log("\nE · La campaña se cierra, el resultado no\n");

  await check("P/Q. Cerrada, vencida y archivada siguen entregando el resultado", async () => {
    const antes = JSON.stringify((await resultado(token)).result);
    for (const [qué, sql] of [
      ["vencida", `update public.public_diagnostic_campaigns
                      set opens_at = now() - interval '200 days',
                          closes_at = now() - interval '100 hours' where id=$1`],
      ["cerrada", `update public.public_diagnostic_campaigns
                      set status='closed' where id=$1`],
      ["archivada", `update public.public_diagnostic_campaigns
                      set status='archived' where id=$1`],
    ] as const) {
      await q(sql, [camp]);
      const r = await resultado(token);
      assert(r.status === "found",
        `con la campaña ${qué} el resultado dejó de verse: «${r.status}»`);
      assert(JSON.stringify(r.result) === antes,
        `con la campaña ${qué} el resultado cambió`);
    }
    await q(`update public.public_diagnostic_campaigns
                set status='open', closes_at = now() + interval '10 days' where id=$1`,
            [camp]);
  });

  console.log("\nF · Repetir\n");

  await check("W. Si la campaña NO admite repetir, no se repite", async () => {
    const r = await empezar(`qa-g-${sello}`, `g${sello}@ejemplo.com`,
      { repeatToken: token });
    assert(r.status === "existing",
      `con allow_repeat=false se pudo repetir: «${r.status}»`);
    const [n] = await q(
      `select count(*)::int c from public.public_diagnostic_submissions where campaign_id=$1`,
      [camp]);
    assert(n.c === 1, `se crearon ${n.c} participaciones`);
  });

  await check("X/Y. Con allow_repeat, nace una nueva y la anterior queda intacta", async () => {
    const campR = await nuevaCampana(`qa-g-rep-${sello}`, true);
    const uno = await empezar(`qa-g-rep-${sello}`, `rep${sello}@ejemplo.com`);
    const primera = await completar(uno.token as string, (i) => i % 2 === 0);
    const antes = await resultado(uno.token as string);

    // Sin el testigo, el correo solo no repite: es la puerta que impide que un
    // tercero deje superada la participación de otro.
    const soloCorreo = await empezar(`qa-g-rep-${sello}`, `rep${sello}@ejemplo.com`);
    assert(soloCorreo.status === "existing",
      `se repitió con el correo solo: «${soloCorreo.status}»`);

    const dos = await empezar(`qa-g-rep-${sello}`, `rep${sello}@ejemplo.com`,
      { repeatToken: uno.token as string });
    assert(dos.status === "created", `repetir dio «${dos.status}»`);
    assert(dos.repeated === true, "no se marcó como repetición");

    // OJO: dentro de UNA transacción `now()` no avanza, así que las dos filas
    // comparten `created_at` y ordenar por ahí no distingue nada. Se
    // identifican por lo único que no depende del reloj: quién supera a quién.
    const filas = await q(
      `select id, status, supersedes_id, superseded_by_id, source
         from public.public_diagnostic_submissions where campaign_id=$1`, [campR]);
    assert(filas.length === 2, `hay ${filas.length} participaciones`);
    const anterior = filas.find((f) => f.supersedes_id === null);
    const nueva = filas.find((f) => f.supersedes_id !== null);
    assert(!!anterior && !!nueva, "no quedó una cadena de dos");
    assert(anterior!.id === primera.submissionId, "la primera cambió de identidad");
    assert(anterior!.status === "completed", "la anterior se reabrió");
    assert(anterior!.superseded_by_id === nueva!.id, "la cadena no quedó cerrada");
    assert(nueva!.supersedes_id === anterior!.id, "la nueva no dice a quién supera");
    assert(nueva!.status === "in_progress", "la nueva no nace en curso");
    assert(nueva!.source === "public_link_repeat", `origen «${nueva!.source}»`);

    // Y el resultado anterior sigue ahí, igual.
    const despues = await resultado(uno.token as string);
    assert(canonico(despues.result) === canonico(antes.result),
      "el resultado anterior cambió al repetir");
    const [respuestas] = await q(
      `select count(*)::int c from public.public_diagnostic_answers where submission_id=$1`,
      [primera.submissionId]);
    assert(respuestas.c === 52, `la anterior quedó con ${respuestas.c} respuestas`);
    // La nueva empieza en blanco: no hereda nada.
    const [nuevas] = await q(
      `select count(*)::int c from public.public_diagnostic_answers where submission_id=$1`,
      [nueva!.id]);
    assert(nuevas.c === 0, `la repetición nació con ${nuevas.c} respuestas`);
  });

  await check("Y una cadena no se supersede dos veces", async () => {
    const campR2 = await nuevaCampana(`qa-g-rep2-${sello}`, true);
    const uno = await empezar(`qa-g-rep2-${sello}`, `r2${sello}@ejemplo.com`);
    await completar(uno.token as string, () => true);
    const dos = await empezar(`qa-g-rep2-${sello}`, `r2${sello}@ejemplo.com`,
      { repeatToken: uno.token as string });
    assert(dos.status === "created", "la primera repetición falló");
    // Con el MISMO testigo viejo otra vez: ya está superada, no se encadena dos veces.
    const tres = await empezar(`qa-g-rep2-${sello}`, `r2${sello}@ejemplo.com`,
      { repeatToken: uno.token as string });
    assert(tres.status === "existing",
      `se volvió a superar una participación ya superada: «${tres.status}»`);
    const [n] = await q(
      `select count(*)::int c from public.public_diagnostic_submissions where campaign_id=$1`,
      [campR2]);
    assert(n.c === 2, `hay ${n.c} participaciones`);
  });

  await check("Y nada de esto tocó PCR v1", async () => {
    const [p] = await q(
      `select count(*)::int c from public.diagnostic_questions
        where version_id=$1 and is_active`, [v1.id]);
    assert(p.c === 52, `PCR v1 quedó con ${p.c} preguntas`);
  });

  await q("rollback");
  await pg.end();
  console.log(
    `\nPUBLIC-DIAGNOSTICS-01G · resultado público: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
