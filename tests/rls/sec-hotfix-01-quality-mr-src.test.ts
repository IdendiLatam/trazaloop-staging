import { config as loadEnv } from "dotenv";
import { Client as PgClient } from "pg";

loadEnv({ path: ".env.local", quiet: true });

/**
 * Trazaloop · SECURITY-HOTFIX-01 · La revisión por la dirección deja de ser
 * legible sin sesión.
 *
 *
 * QUÉ PASÓ
 *
 * 0128 cerró el despachador de la revisión por la dirección y las once
 * funciones de orquestación del subsistema, y se olvidó de sus catorce
 * ADAPTADORES. Como Supabase concede EXECUTE a `anon` sobre todo lo que nace en
 * `public`, y como los adaptadores son `SECURITY DEFINER` —la RLS no los
 * frena—, bastaba conocer un uuid de organización para leer sus auditorías sin
 * sesión. Comprobado en Staging: siete auditorías reales.
 *
 * Y no era solo la concesión: los quince comprueban la pertenencia UNA vez,
 * en su primera subconsulta, teniendo hasta ocho filtradas por organización.
 *
 *
 * QUÉ SE COMPRUEBA AQUÍ
 *
 * Las DOS capas, porque una sola no habría bastado:
 *
 *   · que nadie salvo el dueño puede llamarlos —`anon`, `PUBLIC`,
 *     `authenticated` y `service_role` fuera—; y
 *   · que si algún día alguien vuelve a conceder uno, la propia función se
 *     niega a responder por una organización que no es de quien pregunta.
 *
 * Y que la revisión por la dirección sigue funcionando igual para quien tiene
 * sesión, que es la mitad que se rompe cuando un hotfix se pasa de frenada.
 *
 * Correr: npm run test:sec-hotfix-01
 */

const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) { console.log("falta SUPABASE_DB_URL en .env.local"); process.exit(1); }

/**
 * Los quince adaptadores, DECLARADOS a mano.
 *
 * Lista cerrada a propósito: si mañana nace un `quality_mr_src_*` que nadie
 * escribió aquí, esta batería se pone roja antes de que herede la concesión
 * por omisión de Supabase. Es justo la comprobación que faltaba en 0128.
 */
const ADAPTADORES = [
  "quality_mr_src_audits",
  "quality_mr_src_cases",
  "quality_mr_src_changes",
  "quality_mr_src_customer_voice",
  "quality_mr_src_improvement",
  "quality_mr_src_interested_parties",
  "quality_mr_src_monitoring",
  "quality_mr_src_objectives",
  "quality_mr_src_previous_actions",
  "quality_mr_src_process_performance",
  "quality_mr_src_product_conformity",
  "quality_mr_src_resources",
  "quality_mr_src_risks",
  "quality_mr_src_suppliers",
  "quality_mr_src_system_performance",
] as const;

/** Las entradas del catálogo: lo que de verdad pide la pantalla. */
const CODIGOS = [
  "audits", "changes", "customer_voice", "improvement_opportunities",
  "interested_parties", "monitoring_results", "nonconformities_actions",
  "objectives", "previous_actions", "process_performance", "product_conformity",
  "resources_adequacy", "risk_action_effectiveness", "supplier_performance",
  "system_performance",
] as const;

/** Las de orquestación que 0128 sí cerró y que tienen que seguir igual. */
const ORQUESTACION = [
  "quality_mr_source_payload", "quality_mr_prepare_inputs",
  "quality_mr_refresh_input", "quality_mr_input_freshness",
  "quality_mr_readiness", "quality_mr_followup", "quality_mr_record_decision",
  "quality_mr_create_action_from_decision", "quality_mr_issue_minutes",
  "quality_mr_close_review", "quality_mr_reopen_review",
] as const;

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
  /** Ejecuta y devuelve el error, sin arrastrar la transacción. */
  const falla = async (sql: string, p: unknown[] = []): Promise<string> => {
    await pg.query("savepoint s");
    try { await pg.query(sql, p); await pg.query("release savepoint s"); return ""; }
    catch (e) { await pg.query("rollback to savepoint s");
                return e instanceof Error ? e.message : String(e); }
  };
  /** Con la sesión de una persona concreta, o sin ninguna. */
  const conSesion = async <T,>(
    userId: string | null, rol: string, fn: () => Promise<T>
  ): Promise<T> => {
    await q("savepoint u");
    await q(`set local role ${rol}`);
    if (userId) {
      await q(`select set_config('request.jwt.claims',
                 json_build_object('sub',$1::text,'role',$2::text)::text, true)`, [userId, rol]);
    } else {
      await q(`select set_config('request.jwt.claims', null, true)`);
    }
    try {
      const r = await fn();
      await q("set local role postgres");
      await q("release savepoint u");
      return r;
    } catch (e) {
      await q("rollback to savepoint u");
      await q("set local role postgres");
      throw e;
    }
  };

  await q("set role postgres");
  await q("begin");

  const [socia] = await q(
    `select m.user_id, m.organization_id from public.memberships m
      where m.status='active' order by m.user_id limit 1`);
  assert(!!socia, "el entorno no tiene ninguna membresía activa con la que probar");
  const [ajena] = await q(
    `select o.id from public.organizations o
      where not exists (select 1 from public.memberships m
                         where m.organization_id=o.id and m.user_id=$1 and m.status='active')
      order by o.id limit 1`, [socia.user_id]);
  assert(!!ajena, "el entorno no tiene una organización ajena con la que probar");

  console.log("\nA · La frontera de privilegio\n");

  await check("A. `anon` NO puede ejecutar quality_mr_src_audits", async () => {
    const err = await conSesion(null, "anon", () => falla(
      `select public.quality_mr_src_audits($1,'2000-01-01','2030-01-01')`, [ajena.id]));
    assert(/permission denied/i.test(err),
      `anon pudo llamar al adaptador de auditorías: «${err || "sin error"}»`);
  });

  await check("B. Ni ninguno de los quince, ni sus cuerpos", async () => {
    const filas = await q(
      `select p.proname,
              has_function_privilege('anon', p.oid, 'EXECUTE') as anon
         from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname like 'quality\\_mr\\_src\\_%'
        order by 1`);
    const abiertas = filas.filter((f) => f.anon === true).map((f) => f.proname);
    assert(abiertas.length === 0,
      `alcanzables por anon: ${abiertas.join(", ")}`);
    // La familia entera está declarada: puertas y cuerpos, ni uno de más.
    const nombres = filas.map((f) => f.proname as string).sort();
    const esperados = [...ADAPTADORES, ...ADAPTADORES.map((a) => `${a}_impl`)].sort();
    assert(JSON.stringify(nombres) === JSON.stringify(esperados),
      `la familia no es la declarada. Sobran/faltan: ${
        nombres.filter((n) => !esperados.includes(n)).join(", ") || "—"} / ${
        esperados.filter((n) => !nombres.includes(n)).join(", ") || "—"}`);
  });

  await check("C. Y `PUBLIC` tampoco: la concesión por omisión quedó retirada", async () => {
    const filas = await q(
      `select p.proname, coalesce(array_to_string(p.proacl, ','), '') as acl
         from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname like 'quality\\_mr\\_src\\_%'
        order by 1`);
    for (const f of filas) {
      // `=X/…` sin rol delante es exactamente la concesión a PUBLIC.
      assert(!/(^|,)=X\//.test(f.acl as string),
        `${f.proname} sigue concedida a PUBLIC: «${f.acl}»`);
      assert(!/authenticated=X/.test(f.acl as string),
        `${f.proname} sigue concedida a authenticated, y nadie la llama directamente`);
      assert(!/service_role=X/.test(f.acl as string),
        `${f.proname} sigue concedida a service_role`);
    }
  });

  console.log("\nB · La autorización interna\n");

  await check("Los quince delegan DETRÁS de la puerta de pertenencia", async () => {
    for (const a of ADAPTADORES) {
      const [f] = await q(
        `select pg_get_functiondef(p.oid) as def, p.prosecdef as definer,
                array_to_string(p.proconfig, ',') as cfg
           from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='public' and p.proname=$1`, [a]);
      assert(/is_org_member\(p_organization_id\)/.test(f.def as string),
        `${a} no comprueba la pertenencia`);
      assert(new RegExp(`${a}_impl\\(`).test(f.def as string),
        `${a} no delega en su cuerpo original: se reescribió algo`);
      assert(f.definer === true, `${a} dejó de ser SECURITY DEFINER`);
      assert(/search_path=public/.test((f.cfg as string) ?? ""), `${a} no fija search_path`);
    }
  });

  await check("E/F. Con sesión de OTRA empresa, el adaptador no responde", async () => {
    // Se llama como el DUEÑO —el único que puede— con la sesión de una persona
    // real: es exactamente lo que hace el despachador por dentro.
    for (const a of ADAPTADORES) {
      const args = a === "quality_mr_src_previous_actions"
        ? `$1,'2000-01-01','2030-01-01',null` : `$1,'2000-01-01','2030-01-01'`;
      await q(`select set_config('request.jwt.claims',
                 json_build_object('sub',$1::text,'role','authenticated')::text, true)`,
              [socia.user_id]);
      const [ajeno] = await q(`select public.${a}(${args}) as r`, [ajena.id]);
      assert(ajeno.r === null,
        `${a} devolvió datos de una organización de la que no se es miembro`);
      const [propio] = await q(`select public.${a}(${args}) as r`, [socia.organization_id]);
      assert(propio.r !== null, `${a} dejó de responder a un miembro de su propia empresa`);
    }
    await q(`select set_config('request.jwt.claims', null, true)`);
  });

  await check("Y sin sesión ninguna, tampoco", async () => {
    await q(`select set_config('request.jwt.claims', null, true)`);
    const [r] = await q(
      `select public.quality_mr_src_audits($1,'2000-01-01','2030-01-01') as r`,
      [socia.organization_id]);
    assert(r.r === null,
      "el adaptador respondió sin sesión: la puerta interna no está puesta");
  });

  console.log("\nC · Lo que tenía que seguir funcionando\n");

  await check("D/H. Un miembro sigue obteniendo las quince entradas del catálogo", async () => {
    const vacias: string[] = [];
    await conSesion(socia.user_id as string, "authenticated", async () => {
      for (const code of CODIGOS) {
        const [r] = await q(
          `select public.quality_mr_source_payload($1,$2,'2000-01-01','2030-01-01',null) as r`,
          [socia.organization_id, code]);
        if (r.r === null) vacias.push(code);
      }
    });
    assert(vacias.length === 0,
      `el despachador dejó de servir estas entradas a un miembro: ${vacias.join(", ")}`);
  });

  await check("E. Y ese mismo miembro no ve la empresa de al lado", async () => {
    await conSesion(socia.user_id as string, "authenticated", async () => {
      for (const code of CODIGOS) {
        const [r] = await q(
          `select public.quality_mr_source_payload($1,$2,'2000-01-01','2030-01-01',null) as r`,
          [ajena.id, code]);
        assert(r.r === null, `«${code}» filtró datos de otra organización`);
      }
    });
  });

  await check("G. Las once de orquestación conservan su concesión", async () => {
    for (const f of ORQUESTACION) {
      const [r] = await q(
        `select bool_or(has_function_privilege('authenticated', p.oid, 'EXECUTE')) as auth,
                bool_or(has_function_privilege('anon', p.oid, 'EXECUTE')) as anon
           from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='public' and p.proname=$1`, [f]);
      assert(r.auth === true, `${f} dejó de estar disponible para quien tiene sesión`);
      assert(r.anon === false, `${f} quedó alcanzable sin sesión`);
    }
  });

  await check("H. Y la preparación de una revisión real sigue en pie", async () => {
    const [rev] = await q(
      `select id, organization_id from public.quality_management_reviews
        order by created_at limit 1`);
    if (!rev) { console.log("      (sin revisiones en este entorno; se omite)"); return; }
    const [u] = await q(
      `select user_id from public.memberships
        where organization_id=$1 and status='active' limit 1`, [rev.organization_id]);
    assert(!!u, "la revisión existente no tiene ningún miembro con quien probar");
    await conSesion(u.user_id as string, "authenticated", async () => {
      const [d] = await q(`select public.quality_mr_readiness($1) as r`, [rev.id]);
      assert(d.r !== null, "la preparación de la revisión dejó de calcularse");

      // OJO con la firma: `quality_mr_input_freshness` recibe el id de una
      // ENTRADA, no el de la revisión. Pasarle el de la revisión devuelve
      // `null` y parece una regresión del hotfix — me pasó, y no lo era.
      const [entrada] = await q(
        `select id, catalog_code from public.quality_management_review_inputs
          where review_id=$1 and input_mode='automatic' limit 1`, [rev.id]);
      if (!entrada) {
        console.log("      (la revisión no tiene entradas automáticas; se omite la frescura)");
        return;
      }
      const [f] = await q(`select public.quality_mr_input_freshness($1) as r`, [entrada.id]);
      assert(f.r !== null,
        `la frescura de «${entrada.catalog_code}» dejó de calcularse`);
      // Y su huella se sigue pudiendo calcular: eso significa que el
      // despachador alcanzó su adaptador a través de la puerta nueva.
      assert((f.r as Record<string, unknown>).current_fingerprint !== null,
        `la huella de «${entrada.catalog_code}» dejó de calcularse: el despachador `
        + `ya no alcanza su adaptador`);
    });
  });

  await check("Y el defecto original ya no se reproduce con datos reales", async () => {
    // Si este entorno tiene auditorías, se comprueba contra ellas; si no, la
    // prueba lo dice en vez de dar un verde vacío.
    const [conDatos] = await q(
      `select organization_id, count(*)::int c from public.quality_audits
        group by 1 order by 2 desc limit 1`);
    if (!conDatos) { console.log("      (sin auditorías en este entorno; se omite)"); return; }
    const err = await conSesion(null, "anon", () => falla(
      `select public.quality_mr_src_audits($1,'2000-01-01','2030-01-01')`,
      [conDatos.organization_id]));
    assert(/permission denied/i.test(err),
      `anon sigue leyendo las ${conDatos.c} auditorías de una empresa real: «${err}»`);
  });

  await q("rollback");
  await pg.end();
  console.log(
    `\nSECURITY-HOTFIX-01 · superficie anónima de QUALITY: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
