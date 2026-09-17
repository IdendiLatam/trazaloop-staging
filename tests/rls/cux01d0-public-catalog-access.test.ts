import { config as loadEnv } from "dotenv";
import { Client as PgClient } from "pg";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

loadEnv({ path: ".env.local", quiet: true });

/**
 * Trazaloop · COMMERCIAL-UX-01D0 · Leer el catálogo sin sesión, y solo eso.
 *
 *
 * EL CONTRATO QUE ESTA BATERÍA CONGELA
 *
 * Hay UN mecanismo: dos vistas con proyección fija, evaluadas con los
 * privilegios de su propietario, concedidas a `anon` solo para leer. La vista
 * es la frontera. Las tablas de debajo siguen cerradas.
 *
 * Lo que se vigila no es que funcione —eso se nota en cuanto alguien abre
 * /planes— sino las cuatro formas en que esto se degrada en silencio:
 *
 *   1 · Que alguien amplíe la proyección. Con la vista como frontera, una
 *       columna nueva es superficie pública el mismo día, sin que nadie tenga
 *       que conceder nada. Es el riesgo que este diseño acepta a cambio de no
 *       abrir las tablas, y por eso la lista de columnas se declara entera.
 *
 *   2 · Que aparezca un segundo camino de lectura «por si acaso». Dos caminos
 *       significan dos comportamientos, y el que no se prueba es el que se
 *       usa el día que el otro falla.
 *
 *   3 · Que la clave de servicio acabe en el navegador. Es la manera rápida de
 *       resolver esto, y entrega el esquema entero a cualquiera.
 *
 *   4 · Que la superficie pública crezca sin declararse. Una lista blanca que
 *       no se actualiza deja de ser una lista blanca y pasa a ser un
 *       comentario.
 *
 * Correr: npm run test:cux01d0
 */

const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) { console.log("falta SUPABASE_DB_URL en .env.local"); process.exit(1); }

let passed = 0, failed = 0;
async function check(nombre: string, fn: () => Promise<void> | void) {
  try { await fn(); passed += 1; console.log(`  ✔ ${nombre}`); }
  catch (e) { failed += 1; console.log(`  ✘ ${nombre}: ${e instanceof Error ? e.message : e}`); }
}
function assert(cond: boolean, mensaje: string) { if (!cond) throw new Error(mensaje); }
const leer = (p: string) => readFileSync(p, "utf8");

/** Las columnas que `/planes` puede enseñar. Ni una más. */
const COLUMNAS_CATALOGO = [
  "plan_code", "display_order", "plan_revision_id", "display_name",
  "description", "public_conditions", "price_state", "currency",
  "monthly_price_minor", "annual_price_minor", "effective_from"];
const COLUMNAS_LIMITES = [
  "plan_code", "plan_revision_id", "resource_code", "resource_label",
  "unit", "limit_state", "limit_value"];

/** Lo que NUNCA puede salir por aquí. */
const JAMAS = ["internal_notes", "created_by", "published_by", "status",
               "effective_to", "revision_number"];

async function main() {
  const pg = new PgClient({ connectionString: DB_URL });
  await pg.connect();
  const q = async (sql: string, params: unknown[] = []) => (await pg.query(sql, params)).rows;
  await q("set role postgres");

  /** Ejecuta algo REALMENTE como `anon`, y devuelve qué pasó. */
  const comoAnon = async <T>(sql: string): Promise<{ ok: true; filas: T[] }
                                                  | { ok: false; error: string }> => {
    // Transacción propia y siempre deshecha: la suplantación no puede
    // sobrevivir a la comprobación, y un intento de escritura que llegara a
    // funcionar tampoco dejaría rastro.
    await q("begin");
    try {
      await q("set local role anon");
      const filas = await q(sql);
      await q("rollback");
      await q("set role postgres");
      return { ok: true, filas: filas as T[] };
    } catch (e) {
      await q("rollback");
      await q("set role postgres");
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  };

  console.log("\n1 · SIN SESIÓN SE LEE EL CATÁLOGO");

  await check("1A. anon lee el catálogo de planes", async () => {
    const r = await comoAnon<{ n: number }>(
      "select count(*)::int n from public.v_public_plan_catalog");
    assert(r.ok, `denegado: ${!r.ok && r.error}`);
    assert(r.ok && Number(r.filas[0].n) > 0,
      "lee, pero no ve ningún plan: una página de precios vacía dice que no vendemos nada");
  });

  await check("1B. Y los límites de cada plan", async () => {
    const r = await comoAnon<{ n: number }>(
      "select count(*)::int n from public.v_public_plan_limits");
    assert(r.ok, `denegado: ${!r.ok && r.error}`);
    assert(r.ok && Number(r.filas[0].n) > 0, "no ve ningún límite");
  });

  await check("1C. Lo mismo que se ve CON sesión · ni de más ni de menos", async () => {
    // Las dos direcciones son defectos distintos e igual de graves: enseñar de
    // más es una fuga; enseñar de menos es una página que miente sobre el
    // producto.
    for (const vista of ["v_public_plan_catalog", "v_public_plan_limits"]) {
      const [todo] = await q(`select count(*)::int n from public.${vista}`);
      const r = await comoAnon<{ n: number }>(`select count(*)::int n from public.${vista}`);
      assert(r.ok && Number(r.filas[0].n) === Number(todo.n),
        `${vista}: sin sesión ${r.ok ? r.filas[0].n : "?"} frente a ${todo.n}`);
    }
  });

  console.log("\n2 · Y NADA MÁS");

  await check("2A. Las tablas de debajo siguen cerradas", async () => {
    // Es la diferencia entre este diseño y el que se descartó. Conceder SELECT
    // sobre `plan_revisions` la publicaría en PostgREST, y la RLS filtra filas,
    // no columnas: `internal_notes` de una revisión publicada saldría entera.
    for (const t of ["plans", "plan_revisions", "plan_revision_limits", "plan_resources"]) {
      const r = await comoAnon(`select 1 from public.${t} limit 1`);
      assert(!r.ok, `anon puede leer la tabla ${t}`);
    }
  });

  await check("2B. Solo las columnas comerciales declaradas", async () => {
    const cat = (await q(
      `select column_name from information_schema.columns
        where table_schema='public' and table_name='v_public_plan_catalog'`))
      .map((r) => String(r.column_name)).sort();
    const lim = (await q(
      `select column_name from information_schema.columns
        where table_schema='public' and table_name='v_public_plan_limits'`))
      .map((r) => String(r.column_name)).sort();
    assert(JSON.stringify(cat) === JSON.stringify([...COLUMNAS_CATALOGO].sort()),
      `el catálogo expone: ${cat.join(", ")}`);
    assert(JSON.stringify(lim) === JSON.stringify([...COLUMNAS_LIMITES].sort()),
      `los límites exponen: ${lim.join(", ")}`);
  });

  await check("2C. Ninguna columna interna se escapó", async () => {
    for (const col of JAMAS) {
      assert(!COLUMNAS_CATALOGO.includes(col) && !COLUMNAS_LIMITES.includes(col),
        `«${col}» está declarada como pública y no debería`);
      const [f] = await q(
        `select count(*)::int n from information_schema.columns
          where table_schema='public'
            and table_name in ('v_public_plan_catalog','v_public_plan_limits')
            and column_name = $1`, [col]);
      assert(Number(f.n) === 0, `«${col}» sale por una vista pública`);
    }
  });

  await check("2D. Ni borradores ni revisiones retiradas, leyendo como anon", async () => {
    // En DOS pasos, y el motivo es en sí mismo una comprobación: `anon` no
    // puede cruzar la vista con `plan_revisions` porque esa tabla le está
    // denegada. Así que se lee lo que ve, y se contrasta desde fuera.
    //
    // La primera versión de esto lo hacía en una sola consulta con una
    // subconsulta a la tabla. Fallaba —bien— pero el mensaje culpaba a las
    // revisiones retiradas en vez de decir «permiso denegado». Una prueba que
    // miente sobre por qué falla cuesta más que no tenerla.
    const r = await comoAnon<{ plan_revision_id: string }>(
      "select plan_revision_id from public.v_public_plan_catalog");
    assert(r.ok, `denegado: ${!r.ok && r.error}`);
    const vistos = (r.ok ? r.filas : []).map((f) => f.plan_revision_id);
    assert(vistos.length > 0, "sin sesión no se ve ninguna revisión");
    const impropias = await q(
      `select revision_number, plan_code, status, effective_to
         from public.plan_revisions
        where id = any($1::uuid[])
          and (status <> 'published' or effective_to is not null)`, [vistos]);
    assert(impropias.length === 0,
      `sin sesión se ven revisiones que no están vigentes: `
      + impropias.map((f) => `${f.plan_code} r${f.revision_number} (${f.status})`).join(", "));
  });

  console.log("\n3 · LEER · NUNCA ESCRIBIR");

  await check("3A. anon no puede INSERT, UPDATE ni DELETE en las vistas", async () => {
    for (const vista of ["v_public_plan_catalog", "v_public_plan_limits"]) {
      const i = await comoAnon(
        `insert into public.${vista} (plan_code) values ('pirata')`);
      assert(!i.ok, `anon puede insertar en ${vista}`);
      const u = await comoAnon(`update public.${vista} set plan_code = 'pirata'`);
      assert(!u.ok, `anon puede actualizar ${vista}`);
      const d = await comoAnon(`delete from public.${vista}`);
      assert(!d.ok, `anon puede borrar de ${vista}`);
    }
  });

  await check("3B. Ni en ninguna otra tabla del esquema", async () => {
    const filas = await q(
      `select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relkind in ('r','p')
          and (has_table_privilege('anon', c.oid,'INSERT')
            or has_table_privilege('anon', c.oid,'UPDATE')
            or has_table_privilege('anon', c.oid,'DELETE'))`);
    assert(filas.length === 0,
      `escribibles sin sesión: ${filas.map((f) => f.relname).join(", ")}`);
  });

  await check("3C. Y no puede ejecutar ninguna función financiera", async () => {
    for (const fn of ["billing_create_quote", "billing_settle_payment",
                      "billing_open_recurring_authorization",
                      "billing_request_cancellation", "billing_cancel_upgrade",
                      "commercial_apply_assignment"]) {
      const [f] = await q(
        `select coalesce(bool_or(has_function_privilege('anon', p.oid, 'EXECUTE')), false) puede
           from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='public' and p.proname = $1`, [fn]);
      assert(f.puede === false, `anon puede ejecutar ${fn}`);
    }
  });

  console.log("\n4 · LA SUPERFICIE PÚBLICA ESTÁ DECLARADA");

  await check("4A. Cinco relaciones, exactamente", async () => {
    const filas = await q(
      `select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relkind in ('r','p','v','m','f')
          and has_table_privilege('anon', c.oid,'SELECT') order by 1`);
    const nombres = filas.map((f) => String(f.relname));
    assert(JSON.stringify(nombres) === JSON.stringify([
      "legal_documents", "v_faq_public", "v_faq_public_categories",
      "v_public_plan_catalog", "v_public_plan_limits"]),
      `legibles sin sesión: ${nombres.join(", ")}`);
  });

  await check("4B. Y el documento de seguridad dice las mismas", async () => {
    // Una lista blanca que no se actualiza deja de ser una lista blanca y pasa
    // a ser un comentario.
    const doc = leer("docs/security/PUBLIC-ANON-EXECUTE-AUDIT-01.md");
    assert(/\*\*Estado:\*\*\s*CERRADA/.test(doc), "la auditoría dejó de estar cerrada");
    for (const rel of ["v_public_plan_catalog", "v_public_plan_limits"]) {
      assert(new RegExp(rel).test(doc),
        `el documento no declara ${rel}: la superficie creció sin dejarlo escrito`);
    }
    assert(/cinco relaciones/i.test(doc),
      "el documento sigue hablando de tres relaciones");
  });

  console.log("\n5 · UN SOLO CAMINO");

  await check("5A. El lector sigue siendo lib/db/commercial-catalog.ts", () => {
    const lector = leer("lib/db/commercial-catalog.ts");
    assert(/readCommercialCatalog/.test(lector), "desapareció el lector canónico");
    const db = leer("lib/db/commercial-plans.ts");
    assert(/from\("v_public_plan_catalog"\)/.test(db)
        && /from\("v_public_plan_limits"\)/.test(db),
      "el lector dejó de usar las vistas públicas");
  });

  await check("5B. No hay un segundo camino de lectura del catálogo", () => {
    // «Por si acaso» es como nacen los dos comportamientos: el que se prueba y
    // el que se usa el día que el otro falla.
    const raices = ["lib", "app", "components", "server"];
    const consumidores: string[] = [];
    const recorrer = (dir: string) => {
      for (const e of readdirSync(dir)) {
        const ruta = join(dir, e);
        if (statSync(ruta).isDirectory()) { recorrer(ruta); continue; }
        if (!/\.tsx?$/.test(e)) continue;
        const src = leer(ruta).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
        if (/v_public_plan_catalog|v_public_plan_limits/.test(src)) consumidores.push(ruta);
      }
    };
    for (const r of raices) recorrer(r);
    assert(JSON.stringify(consumidores) === JSON.stringify(["lib/db/commercial-plans.ts"]),
      `leen el catálogo: ${consumidores.join(", ")}`);
  });

  await check("5C. Y el mecanismo alternativo NO está activo a la vez", () => {
    // La alternativa era leer con una identidad de servidor. No se eligió, y no
    // puede quedarse rondando: el lector comercial no toca el cliente de
    // administración por ningún camino.
    for (const f of ["lib/db/commercial-catalog.ts", "lib/db/commercial-plans.ts",
                     "lib/plans/commercial-catalog.ts"]) {
      const src = leer(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
      assert(!/createAdminClient|service_role|SERVICE_ROLE/.test(src),
        `${f} usa una identidad de servidor: hay dos caminos de lectura`);
    }
  });

  console.log("\n6 · LA CLAVE DE SERVICIO NO SALE AL NAVEGADOR");

  await check("6A. Ningún componente de cliente la toca", () => {
    const sospechosos: string[] = [];
    const recorrer = (dir: string) => {
      for (const e of readdirSync(dir)) {
        const ruta = join(dir, e);
        if (statSync(ruta).isDirectory()) { recorrer(ruta); continue; }
        if (!/\.tsx?$/.test(e)) continue;
        const src = leer(ruta);
        if (!/^["']use client["']/m.test(src)) continue;
        if (/SERVICE_ROLE|createAdminClient/.test(src)) sospechosos.push(ruta);
      }
    };
    for (const r of ["app", "components"]) recorrer(r);
    assert(sospechosos.length === 0,
      `componentes de cliente con identidad de servidor: ${sospechosos.join(", ")}`);
  });

  await check("6B. Y no viaja en ninguna variable pública", () => {
    // `NEXT_PUBLIC_*` acaba en el paquete que descarga el navegador. Una clave
    // de servicio ahí entrega el esquema entero a cualquiera.
    const recorrer = (dir: string, acc: string[] = []): string[] => {
      for (const e of readdirSync(dir)) {
        const ruta = join(dir, e);
        if (statSync(ruta).isDirectory()) { recorrer(ruta, acc); continue; }
        if (!/\.tsx?$/.test(e)) continue;
        if (/NEXT_PUBLIC_[A-Z_]*SERVICE|NEXT_PUBLIC_[A-Z_]*SECRET/.test(leer(ruta))) {
          acc.push(ruta);
        }
      }
      return acc;
    };
    const malos = [...recorrer("app"), ...recorrer("components"), ...recorrer("lib")];
    assert(malos.length === 0, `secretos en variables públicas: ${malos.join(", ")}`);
  });

  console.log("\n7 · NO SE MOVIÓ NADA DE LO QUE NO TOCABA");

  await check("7A. billing_create_quote sigue siendo la única cotización", () => {
    const b = leer("lib/db/billing.ts");
    assert(/rpc\("billing_create_quote"/.test(b),
      "el presupuesto dejó de salir de billing_create_quote");
    const cat = leer("lib/db/commercial-catalog.ts");
    assert(!/billing_create_quote|quote/i.test(cat),
      "el catálogo se metió en el camino del cobro");
  });

  await check("7B. Las políticas de tiempo siguen donde estaban", async () => {
    const filas = await q(
      `select r.plan_code, r.monthly_price_minor,
              max(case when l.resource_code='active_minutes_daily'
                       then l.limit_state||coalesce(' '||l.limit_value::text,'') end) dia,
              max(case when l.resource_code='active_minutes_monthly'
                       then l.limit_state||coalesce(' '||l.limit_value::text,'') end) mes
         from plan_revisions r join plan_revision_limits l on l.plan_revision_id=r.id
        where r.status='published' and r.effective_to is null
        group by r.plan_code, r.monthly_price_minor order by r.plan_code`);
    const de = (c: string) => filas.find((f) => f.plan_code === c);
    assert(de("free")?.dia === "finite 30" && de("free")?.mes === "finite 300",
      `Free: ${de("free")?.dia} / ${de("free")?.mes}`);
    for (const c of ["full", "extra"]) {
      assert(de(c)?.dia === "unlimited" && de(c)?.mes === "unlimited",
        `${c}: ${de(c)?.dia} / ${de(c)?.mes}`);
    }
  });

  await check("7C. La prueba sigue intacta", async () => {
    const [p] = await q(`select enabled, trial_plan_code, trial_duration_hours,
                                trial_ai_credits from commercial_trial_policy`);
    assert(p.enabled === true && p.trial_plan_code === "full"
        && Number(p.trial_duration_hours) === 48 && Number(p.trial_ai_credits) === 50,
      `la política de prueba cambió: ${JSON.stringify(p)}`);
  });

  await check("7D. Y `authenticated` conserva su lectura", async () => {
    await q("begin");
    await q("set local role authenticated");
    await q(`select set_config('request.jwt.claims',
               json_build_object('sub', gen_random_uuid()::text,
                                 'role','authenticated')::text, true)`);
    const [cat] = await q("select count(*)::int n from public.v_public_plan_catalog");
    const [lim] = await q("select count(*)::int n from public.v_public_plan_limits");
    await q("rollback");
    await q("set role postgres");
    const [catTodo] = await q("select count(*)::int n from public.v_public_plan_catalog");
    const [limTodo] = await q("select count(*)::int n from public.v_public_plan_limits");
    assert(Number(cat.n) === Number(catTodo.n) && Number(lim.n) === Number(limTodo.n),
      `authenticated ve ${cat.n}/${lim.n} y hay ${catTodo.n}/${limTodo.n}`);
  });

  await pg.end();
  console.log(`\nCOMMERCIAL-UX-01D0 · catálogo sin sesión: ${passed} en verde, ${failed} en rojo`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
