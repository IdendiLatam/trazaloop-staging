import { config as loadEnv } from "dotenv";
import { Client as PgClient } from "pg";

loadEnv({ path: ".env.local", quiet: true });

/**
 * Trazaloop · PUBLIC-DIAGNOSTICS-01B · Las guardas, contra la base.
 *
 * La lógica pura se prueba aparte. Aquí se prueba lo que solo la base puede
 * decir: que una versión publicada NO se puede mutar ni con SQL directo —una
 * guarda que viviera en la interfaz se salta con una llamada—, que dos
 * versiones no mezclan preguntas, y que los resultados históricos no se movieron.
 *
 * Correr: npm run test:pd01b-db
 */

const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) { console.log("falta SUPABASE_DB_URL en .env.local"); process.exit(1); }

let passed = 0, failed = 0;
async function check(nombre: string, fn: () => Promise<void>) {
  try { await fn(); passed += 1; console.log(`  ✔ ${nombre}`); }
  catch (e) { failed += 1; console.log(`  ✘ ${nombre}: ${e instanceof Error ? e.message : e}`); }
}
function assert(cond: boolean, mensaje: string) { if (!cond) throw new Error(mensaje); }
/** Ejecuta algo que DEBE fallar y devuelve el error. */
async function debeFallar(pg: PgClient, sql: string): Promise<string> {
  await pg.query("savepoint s");
  try {
    await pg.query(sql);
    await pg.query("release savepoint s");
    return "";
  } catch (e) {
    await pg.query("rollback to savepoint s");
    return e instanceof Error ? e.message : String(e);
  }
}

async function main() {
  const pg = new PgClient({ connectionString: DB_URL });
  await pg.connect();
  const q = async (sql: string, p: unknown[] = []) => (await pg.query(sql, p)).rows;
  await q("set role postgres");
  await q("begin");

  console.log("\nA · PCR v1 es exactamente el instrumento de siempre\n");

  const [v1] = await q(
    `select id, version_number, status, scoring_config
       from public.diagnostic_versions where diagnostic_type='pcr' and version_number=1`);

  await check("A/B. Seis secciones y 52 preguntas, publicadas", async () => {
    assert(Boolean(v1), "no existe PCR v1");
    assert(v1.status === "published", `la v1 está en «${v1.status}»`);
    const [s] = await q(
      `select count(*)::int c from public.diagnostic_sections where version_id=$1`, [v1.id]);
    const [p] = await q(
      `select count(*)::int c from public.diagnostic_questions where version_id=$1 and is_active`,
      [v1.id]);
    assert(s.c === 6, `${s.c} secciones`);
    assert(p.c === 52, `${p.c} preguntas`);
  });

  await check("Con su perfil de puntuación congelado", async () => {
    const cfg = v1.scoring_config;
    assert(cfg.rounding_decimals === 4, `redondeo ${cfg.rounding_decimals}`);
    assert(Array.isArray(cfg.levels) && cfg.levels.length === 4,
      "el perfil no lleva los cuatro niveles");
    const umbrales = cfg.levels.map((l: { min_percent: number }) => l.min_percent);
    assert(JSON.stringify(umbrales) === JSON.stringify([90, 75, 50, 0]),
      `umbrales ${umbrales.join(", ")}`);
  });

  await check("Y la versión vigente se resuelve sin ambigüedad", async () => {
    const [r] = await q(`select public.diagnostic_current_version('pcr') as id`);
    assert(r.id === v1.id, "la función no devuelve la v1");
  });

  console.log("\nB · Lo publicado no se toca\n");

  await check("G. Una pregunta publicada no se puede mutar", async () => {
    const e = await debeFallar(pg,
      `update public.diagnostic_questions set question_text='alterada'
        where version_id='${v1.id}'`);
    assert(/DIAGNOSTIC_VERSION_FROZEN/.test(e), `se permitió mutarla (${e || "sin error"})`);
  });

  await check("Ni su peso, ni su criticidad, ni borrarla", async () => {
    for (const sql of [
      `update public.diagnostic_questions set weight=5 where version_id='${v1.id}'`,
      `update public.diagnostic_questions set is_critical=false where version_id='${v1.id}'`,
      `delete from public.diagnostic_questions where version_id='${v1.id}'`,
    ]) {
      const e = await debeFallar(pg, sql);
      assert(/DIAGNOSTIC_VERSION_FROZEN/.test(e), `se permitió: ${sql.slice(0, 60)}`);
    }
  });

  await check("H. Una sección publicada tampoco", async () => {
    const e = await debeFallar(pg,
      `update public.diagnostic_sections set title='otra' where version_id='${v1.id}'`);
    assert(/DIAGNOSTIC_VERSION_FROZEN/.test(e), `se permitió mutarla (${e || "sin error"})`);
  });

  await check("I. Ni el perfil de puntuación de la versión", async () => {
    const e = await debeFallar(pg,
      `update public.diagnostic_versions set scoring_config='{}'::jsonb where id='${v1.id}'`);
    assert(/DIAGNOSTIC_VERSION_FROZEN/.test(e), `se permitió reescribirlo (${e || "sin error"})`);
  });

  await check("Y una versión publicada no se borra: se retira", async () => {
    const e = await debeFallar(pg, `delete from public.diagnostic_versions where id='${v1.id}'`);
    assert(/DIAGNOSTIC_VERSION_IS_HISTORY/.test(e), `se permitió borrarla (${e || "sin error"})`);
  });

  console.log("\nC · El borrador sí se prepara, y no se mezcla\n");

  const [v2] = await q(
    `insert into public.diagnostic_versions
       (diagnostic_type, version_number, status, scoring_config, change_note)
     values ('pcr', 2, 'draft', $1::jsonb, 'borrador de prueba') returning id`,
    [JSON.stringify(v1.scoring_config)]);

  await check("J. Un borrador se puede editar", async () => {
    const [s2] = await q(
      `insert into public.diagnostic_sections (version_id, code, title, order_index)
       values ($1,'input_materials','Material de entrada (v2)',1) returning id`, [v2.id]);
    await q(`insert into public.diagnostic_questions
             (version_id, section_id, code, question_text, weight, is_critical, order_index, is_active)
             values ($1,$2,'S1Q01','Texto nuevo de la v2',1,true,1,true)`, [v2.id, s2.id]);
    await q(`update public.diagnostic_questions set question_text='y otra vez'
              where version_id=$1`, [v2.id]);
    const [r] = await q(
      `select question_text t from public.diagnostic_questions where version_id=$1`, [v2.id]);
    assert(r.t === "y otra vez", "no se pudo editar el borrador");
  });

  await check("K. La misma clave lógica existe en las dos versiones", async () => {
    const [r] = await q(
      `select count(distinct version_id)::int c from public.diagnostic_questions
        where code='S1Q01'`);
    assert(r.c === 2, `«S1Q01» existe en ${r.c} versión(es): la clave estable no relaciona`);
    const [d] = await q(
      `select count(distinct question_text)::int c from public.diagnostic_questions
        where code='S1Q01'`);
    assert(d.c === 2, "las dos versiones comparten texto: no se congeló nada");
  });

  await check("F. Y las preguntas de cada versión no se mezclan", async () => {
    const [a] = await q(
      `select count(*)::int c from public.diagnostic_questions where version_id=$1 and is_active`,
      [v1.id]);
    const [b] = await q(
      `select count(*)::int c from public.diagnostic_questions where version_id=$1 and is_active`,
      [v2.id]);
    assert(a.c === 52, `la v1 pasó a tener ${a.c}`);
    assert(b.c === 1, `la v2 tiene ${b.c}`);
    const [t] = await q(`select count(*)::int c from public.diagnostic_questions where is_active`);
    assert(t.c === 53,
      `preguntar por is_active devuelve ${t.c}: por eso cargar sin versión estaría mal`);
  });

  await check("Publicar la v2 exige retirar la v1: nunca dos vigentes", async () => {
    const e = await debeFallar(pg,
      `update public.diagnostic_versions set status='published', published_at=now()
        where id='${v2.id}'`);
    assert(/duplicate key|diagnostic_versions_one_published/.test(e),
      `se pudo publicar una segunda versión a la vez (${e || "sin error"})`);
  });

  console.log("\nD · La historia no se reinterpreta\n");

  await check("E/L. Un diagnóstico atado a la v1 conserva su versión y su resultado", async () => {
    const [d] = await q(
      `select id, diagnostic_version_id, maturity_percent, readiness_level, critical_gaps
         from public.diagnostics where diagnostic_version_id is not null limit 1`);
    if (!d) { console.log("      (no hay diagnósticos en esta base; se omite)"); return; }
    assert(d.diagnostic_version_id === v1.id, "un diagnóstico histórico no quedó en la v1");
    // Publicar otra versión no puede tocar su resultado.
    await q(`update public.diagnostic_versions set status='retired' where id=$1`, [v1.id]);
    await q(`update public.diagnostic_versions set status='published', published_at=now()
              where id=$1`, [v2.id]);
    const [despues] = await q(
      `select diagnostic_version_id, maturity_percent, readiness_level, critical_gaps
         from public.diagnostics where id=$1`, [d.id]);
    assert(despues.diagnostic_version_id === d.diagnostic_version_id,
      "publicar otra versión le cambió la versión al diagnóstico");
    assert(String(despues.maturity_percent) === String(d.maturity_percent)
        && despues.readiness_level === d.readiness_level
        && despues.critical_gaps === d.critical_gaps,
      "publicar otra versión cambió un resultado ya guardado");
  });

  await check("Un diagnóstico completado sigue blindado salvo para anotar su versión", async () => {
    // La excepción que 0195 abrió es quirúrgica; esta comprobación existe para
    // que no se ensanche sin que nadie se entere.
    const [org] = await q(`select id from public.organizations limit 1`);
    const [perfil] = await q(`select id from public.profiles limit 1`);
    if (!org || !perfil) { console.log("      (base sin datos base; se omite)"); return; }
    const [d] = await q(
      `insert into public.diagnostics
         (organization_id, started_by, status, maturity_percent, readiness_level, critical_gaps)
       values ($1,$2,'completed', 42.5, 'low', 3) returning id`, [org.id, perfil.id]);

    // Lo permitido: anotar la versión donde no había ninguna.
    await q(`update public.diagnostics set diagnostic_version_id=$1 where id=$2`, [v1.id, d.id]);
    const [ok] = await q(
      `select diagnostic_version_id v from public.diagnostics where id=$1`, [d.id]);
    assert(ok.v === v1.id, "no se pudo anotar la versión de un diagnóstico completado");

    // Todo lo demás, prohibido.
    for (const [qué, sql] of [
      ["cambiar el porcentaje", `update public.diagnostics set maturity_percent=99 where id='${d.id}'`],
      ["cambiar el nivel", `update public.diagnostics set readiness_level='high' where id='${d.id}'`],
      ["reabrirlo", `update public.diagnostics set status='in_progress' where id='${d.id}'`],
      ["borrarlo", `delete from public.diagnostics where id='${d.id}'`],
      ["reescribir la versión ya puesta",
       `update public.diagnostics set diagnostic_version_id='${v2.id}' where id='${d.id}'`],
    ] as const) {
      const e = await debeFallar(pg, sql);
      assert(/no puede modificarse ni eliminarse/.test(e),
        `se permitió ${qué} en un diagnóstico completado (${e || "sin error"})`);
    }
  });

  console.log("\nE · Nada de esto se abrió al público\n");

  await check("anon no ve versiones, secciones, preguntas ni diagnósticos", async () => {
    // Dos formas legítimas de no ver nada, y las dos valen: la RLS devuelve
    // cero filas, o directamente no hay concesión y salta «permission denied».
    // La segunda es MÁS fuerte —ni siquiera llega a la política— y es la que
    // deja `revoke all ... from anon` en la tabla nueva. Exigir solo la
    // primera habría marcado en rojo la defensa más dura.
    for (const t of ["diagnostic_versions", "diagnostic_sections", "diagnostic_questions",
                     "diagnostics", "diagnostic_answers"]) {
      await q("savepoint anon");
      await q("set local role anon");
      let visto: number | null = null;
      let error = "";
      try {
        const r = await q(`select count(*)::int c from public.${t}`);
        visto = r[0].c as number;
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
      await q("rollback to savepoint anon");
      await q("set local role postgres");
      assert(visto === 0 || /permission denied/i.test(error),
        `anon ve ${visto} filas de ${t}`);
    }
  });

  await check("Ni puede resolver la versión vigente", async () => {
    await q("savepoint anon2");
    await q("set local role anon");
    const e = await debeFallar(pg, `select public.diagnostic_current_version('pcr')`);
    await q("rollback to savepoint anon2");
    await q("set local role postgres");
    assert(/permission denied/i.test(e), `anon la pudo ejecutar (${e || "sin error"})`);
  });

  await q("rollback");
  await pg.end();
  console.log(`\nPUBLIC-DIAGNOSTICS-01B · guardas en base: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
