import { config as loadEnv } from "dotenv";
import { Client as PgClient } from "pg";

loadEnv({ path: ".env.local", quiet: true });

/**
 * Trazaloop · PUBLIC-DIAGNOSTICS-01D · La administración, contra la base.
 *
 * La lógica de preparación y ciclo de vida se prueba pura aparte. Aquí se
 * prueba lo que solo la base puede decir: quién ve las campañas, quién puede
 * crearlas, y que el rastro de auditoría se escribe solo.
 *
 * Correr: npm run test:pd01d-db
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
  const como = async (userId: string) => {
    await q("set local role authenticated");
    await q(`select set_config('request.jwt.claims',
              json_build_object('sub',$1::text,'role','authenticated')::text, true)`, [userId]);
  };
  await q("set role postgres");
  await q("begin");

  const sello = Date.now();
  const [v1] = await q(
    `select id from public.diagnostic_versions where diagnostic_type='pcr' and version_number=1`);
  const [doc] = await q(
    `select id, version, content_hash from public.legal_documents
      where status='active' limit 1`);
  const [ps] = await q(
    `select user_id from public.platform_staff where role_code='superadmin'
      and status='active' limit 1`);
  const [normal] = await q(
    `select m.user_id from public.memberships m where m.status='active'
       and not exists (select 1 from public.platform_staff s
                        where s.user_id=m.user_id and s.status='active') limit 1`);

  const [camp] = await q(
    `insert into public.public_diagnostic_campaigns
       (slug, name, diagnostic_type, diagnostic_version_id, status, partner_name,
        consent_document_id, consent_version, consent_content_hash)
     values ($1,'Campaña PD01D','pcr',$2,'draft','Entidad de prueba',$3,$4,$5) returning id`,
    [`pd01d-${sello}`, v1.id, doc?.id ?? null, doc?.version ?? null, doc?.content_hash ?? null]);

  console.log("\nA · Quién ve y quién administra\n");

  await check("A. La superadministración lista las campañas", async () => {
    if (!ps) { console.log("      (sin superadministrador; se omite)"); return; }
    await q("savepoint a"); await como(ps.user_id);
    const [n] = await q(`select count(*)::int c from public.public_diagnostic_campaigns`);
    await q("rollback to savepoint a"); await q("set local role postgres");
    assert(n.c >= 1, "la superadministración no ve las campañas");
  });

  await check("B/P. Una usuaria normal ni ve ni crea", async () => {
    if (!normal) { console.log("      (sin usuaria normal; se omite)"); return; }
    await q("savepoint b"); await como(normal.user_id);
    const [n] = await q(`select count(*)::int c from public.public_diagnostic_campaigns`);
    const e = await falla(
      `insert into public.public_diagnostic_campaigns
         (slug,name,diagnostic_type,diagnostic_version_id) values ($1,'X','pcr',$2)`,
      [`intruso-${sello}`, v1.id]);
    const e2 = await falla(
      `update public.public_diagnostic_campaigns set status='open' where id=$1`, [camp.id]);
    await q("rollback to savepoint b"); await q("set local role postgres");
    assert(n.c === 0, `una usuaria normal ve ${n.c} campañas`);
    assert(e !== "", "una usuaria normal pudo crear una campaña");
    // El UPDATE no lanza: la RLS hace que no alcance ninguna fila. Así que lo
    // que se comprueba es el EFECTO, no el error — un `assert` sobre `e2`
    // habría pasado siempre sin demostrar nada.
    void e2;
    const [c] = await q(`select status from public.public_diagnostic_campaigns where id=$1`, [camp.id]);
    assert(c.status === "draft", "una usuaria normal pudo abrir la campaña");
  });

  await check("Q. anon sigue sin poder nada", async () => {
    for (const [op, sql] of [
      ["SELECT", `select count(*) from public.public_diagnostic_campaigns`],
      ["INSERT", `insert into public.public_diagnostic_campaigns default values`],
      ["UPDATE", `update public.public_diagnostic_campaigns set status='open'`],
    ] as const) {
      await q("savepoint c"); await q("set local role anon");
      let permitido = false; let err = "";
      try { await pg.query(sql); permitido = true; }
      catch (e) { err = e instanceof Error ? e.message : String(e); }
      await q("rollback to savepoint c"); await q("set local role postgres");
      assert(!permitido && /permission denied|row-level|new row/i.test(err),
        `anon pudo ${op} (${err || "sin error"})`);
    }
  });

  console.log("\nB · Slug y ciclo de vida, en la base\n");

  await check("E. El slug es único", async () => {
    const e = await falla(
      `insert into public.public_diagnostic_campaigns
         (slug,name,diagnostic_type,diagnostic_version_id) values ($1,'Otra','pcr',$2)`,
      [`pd01d-${sello}`, v1.id]);
    assert(/duplicate key|slug_uniq/.test(e), `se repitió el slug (${e || "sin error"})`);
  });

  await check("D. Y tiene forma de URL", async () => {
    for (const malo of ["Con Mayúsculas", "con espacios", "ab", "-empieza"]) {
      const e = await falla(
        `insert into public.public_diagnostic_campaigns
           (slug,name,diagnostic_type,diagnostic_version_id) values ($1,'X','pcr',$2)`,
        [malo, v1.id]);
      assert(/slug_shape|violates check/.test(e), `se aceptó el slug «${malo}»`);
    }
  });

  await check("J/K/L. Borrador → abierta → cerrada → archivada", async () => {
    await q(`update public.public_diagnostic_campaigns set status='open' where id=$1`, [camp.id]);
    await q(`update public.public_diagnostic_campaigns set status='closed' where id=$1`, [camp.id]);
    await q(`update public.public_diagnostic_campaigns set status='archived' where id=$1`, [camp.id]);
    const [c] = await q(`select status from public.public_diagnostic_campaigns where id=$1`, [camp.id]);
    assert(c.status === "archived", `quedó en «${c.status}»`);
  });

  await check("O. Con participaciones, el instrumento y la evidencia quedan fijos", async () => {
    const [c2] = await q(
      `insert into public.public_diagnostic_campaigns
         (slug, name, diagnostic_type, diagnostic_version_id, status, consent_document_id)
       values ($1,'Con participación','pcr',$2,'open',$3) returning id`,
      [`pd01d-sub-${sello}`, v1.id, doc?.id ?? null]);
    await q(
      `insert into public.public_diagnostic_submissions
         (campaign_id, diagnostic_version_id, participant_name, participant_email,
          participant_email_normalized, company_name)
       values ($1,$2,'P','p@e.com','p@e.com','E')`, [c2.id, v1.id]);
    const congelados: { qué: string; sql: string; p: unknown[] }[] = [
      { qué: "el slug",
        sql: `update public.public_diagnostic_campaigns set slug=$1 where id=$2`,
        p: [`otro-${sello}`, c2.id] },
      { qué: "el documento de consentimiento",
        sql: `update public.public_diagnostic_campaigns set consent_document_id=null where id=$1`,
        p: [c2.id] },
    ];
    for (const { qué, sql, p } of congelados) {
      const e = await falla(sql, p);
      assert(/CAMPAIGN_FROZEN_BY_SUBMISSIONS/.test(e),
        `se pudo cambiar ${qué} con participaciones (${e || "sin error"})`);
    }
    // Presentación y fechas SÍ siguen editables: no tocan el estudio.
    const ok = await falla(
      `update public.public_diagnostic_campaigns set public_title='Otro título' where id=$1`,
      [c2.id]);
    assert(ok === "", `se bloqueó un cambio legítimo de presentación (${ok})`);
  });

  console.log("\nC · Auditoría y aislamiento\n");

  await check("El rastro se escribe solo, sin que la acción lo pida", async () => {
    const [n] = await q(
      `select count(*)::int c from public.audit_log
        where table_name='public_diagnostic_campaigns' and row_id=$1`, [camp.id]);
    assert(n.c >= 2, `solo hay ${n.c} anotaciones: se esperaban al menos creación y cambios`);
    const ops = await q(
      `select distinct operation from public.audit_log
        where table_name='public_diagnostic_campaigns' and row_id=$1`, [camp.id]);
    const lista = ops.map((o) => o.operation).sort();
    assert(lista.includes("INSERT") && lista.includes("UPDATE"),
      `operaciones anotadas: ${lista.join(", ")}`);
  });

  await check("Las participaciones NO se auditan fila a fila", async () => {
    const [n] = await q(
      `select count(*)::int c from public.audit_log
        where table_name='public_diagnostic_submissions'`);
    assert(n.c === 0,
      `hay ${n.c} anotaciones de participaciones: duplicaría datos personales en una tabla que nadie limpia`);
  });

  await check("R. Y nada de esto tocó PCR v1", async () => {
    const [s] = await q(
      `select count(*)::int c from public.diagnostic_sections where version_id=$1`, [v1.id]);
    const [p] = await q(
      `select count(*)::int c from public.diagnostic_questions where version_id=$1 and is_active`,
      [v1.id]);
    assert(s.c === 6 && p.c === 52, `PCR v1 quedó con ${s.c} secciones y ${p.c} preguntas`);
  });

  await q("rollback");
  await pg.end();
  console.log(`\nPUBLIC-DIAGNOSTICS-01D · guardas en base: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
