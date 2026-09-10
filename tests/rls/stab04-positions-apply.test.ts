import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client as PgClient } from "pg";
import { normalizarIdentidad } from "../../lib/domain/identidad-normalizada";

loadEnv({ path: ".env.local", quiet: true });

/**
 * Trazaloop · STABILIZATION-04 · La aplicación de una importación de cargos.
 *
 * Lo que se comprueba aquí es lo que NO se puede comprobar en puro: que aplicar
 * sea de verdad todo-o-nada, que la jerarquía no pueda cerrarse sobre sí misma
 * VENGA POR DONDE VENGA —el importador, el alta manual o la edición de
 * estructura—, y que una empresa no alcance a otra.
 *
 * Correr: npm run test:stab04-apply
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const DB_URL = process.env.SUPABASE_DB_URL;
if (!URL || !SERVICE || !ANON || !DB_URL) {
  console.log("faltan credenciales locales en .env.local");
  process.exit(1);
}

const admin: SupabaseClient = createClient(URL, SERVICE, { auth: { persistSession: false } });
const pg = new PgClient({ connectionString: DB_URL });

let passed = 0, failed = 0;
const sello = Date.now();
const personas: string[] = [];
const orgs: string[] = [];

async function check(nombre: string, fn: () => Promise<void> | void) {
  try { await fn(); passed += 1; console.log(`  ✔ ${nombre}`); }
  catch (e) { failed += 1; console.log(`  ✘ ${nombre}: ${e instanceof Error ? e.message : e}`); }
}
function assert(cond: boolean, mensaje: string) { if (!cond) throw new Error(mensaje); }

async function empresa(etiqueta: string) {
  const email = `stab04-${etiqueta}-${sello}@test.trazaloop.dev`;
  const { data: u, error } = await admin.auth.admin.createUser({
    email, password: "Trazaloop-Test-1234", email_confirm: true });
  assert(!error && Boolean(u.user), `crear ${etiqueta}: ${error?.message}`);
  const uid = (u.user as { id: string }).id;
  personas.push(uid);
  const cli = createClient(URL!, ANON!, { auth: { persistSession: false } });
  await cli.auth.signInWithPassword({ email, password: "Trazaloop-Test-1234" });
  const { data: orgId } = await cli.rpc("create_organization",
    { p_name: `STAB04 ${etiqueta} ${sello}`, p_tax_id: null, p_country: "CO" });
  const org = orgId as string;
  orgs.push(org);
  await admin.from("memberships").update({ role_code: "admin" })
    .eq("organization_id", org).eq("user_id", uid);
  await admin.from("organization_modules").update({ access_mode: "full" })
    .eq("organization_id", org).eq("module_code", "quality");
  return { org, uid, cli };
}

/** Un trabajo de importación con sus filas, como lo deja la vista previa. */
async function trabajo(cli: SupabaseClient, org: string,
                       filas: Array<{ codigo: string; nombre: string; superior?: string }>) {
  const { data: job, error } = await cli.from("import_jobs").insert({
    organization_id: org, entity: "positions", filename: `stab04-${sello}.csv`,
    total_rows: filas.length, inserted_rows: 0, skipped_rows: 0,
    status: "validated", errors: { template_version: "cargos-v1" },
  }).select("id").single();
  assert(!error && Boolean(job), `crear trabajo: ${error?.message}`);
  const jobId = (job as { id: string }).id;
  const { error: e2 } = await cli.from("import_job_rows").insert(
    filas.map((f, i) => ({
      organization_id: org, import_job_id: jobId, row_number: i + 2,
      status: "valid", entity_type: "position",
      raw_data: f,
      normalized_data: { codigo: f.codigo, nombre_cargo: f.nombre,
                         cargo_superior: f.superior ?? "" },
      errors: [], warnings: [],
    })));
  assert(!e2, `crear filas: ${e2?.message}`);
  return jobId;
}

const cargos = async (org: string) => {
  const { rows } = await pg.query(
    `select name, code, parent_position_id, normalized_name from public.quality_positions
      where organization_id = $1 order by name`, [org]);
  return rows as Array<{ name: string; code: string | null;
                         parent_position_id: string | null; normalized_name: string }>;
};

async function main() {
  console.log("\nSTABILIZATION-04 · aplicar una importación de cargos\n");
  await pg.connect();

  const A = await empresa("a");
  const B = await empresa("b");

  // =========================================================================
  console.log("A · Aplicar");
  // =========================================================================

  await check("1. La vista previa NO crea cargos", async () => {
    const antes = (await cargos(A.org)).length;
    await trabajo(A.cli, A.org, [{ codigo: "X", nombre: "Solo validado" }]);
    assert((await cargos(A.org)).length === antes,
      "registrar la validación creó cargos");
  });

  await check("2. Aplicar crea los cargos y su jerarquía · el orden no importa", async () => {
    const job = await trabajo(A.cli, A.org, [
      { codigo: "ANL", nombre: `Analista ${sello}`, superior: "COORD" },
      { codigo: "DIR", nombre: `Dirección ${sello}` },
      { codigo: "COORD", nombre: `Coordinación ${sello}`, superior: "DIR" },
    ]);
    const { data, error } = await A.cli.rpc("quality_import_positions_apply", { p_job_id: job });
    assert(!error, `aplicar: ${error?.message}`);
    assert((data as Record<string, unknown>).outcome === "committed", JSON.stringify(data));
    assert(Number((data as Record<string, unknown>).created) === 3, JSON.stringify(data));

    const filas = await cargos(A.org);
    const porNombre = new Map(filas.map((f) => [f.name, f]));
    const dir = porNombre.get(`Dirección ${sello}`)!;
    const coord = porNombre.get(`Coordinación ${sello}`)!;
    const anl = porNombre.get(`Analista ${sello}`)!;
    assert(dir.parent_position_id === null, "la dirección quedó colgando de alguien");
    assert(coord.parent_position_id !== null, "la coordinación no quedó bajo la dirección");
    assert(anl.parent_position_id !== null, "el analista no quedó bajo la coordinación");
    // Y la identidad normalizada se calculó sola.
    assert(dir.normalized_name === normalizarIdentidad(dir.name),
      `identidad: ${dir.normalized_name}`);
  });

  await check("3. Un trabajo ya aplicado no se aplica dos veces", async () => {
    const { data: job } = await pg.query(
      `select id from public.import_jobs where organization_id=$1 and status='committed' limit 1`,
      [A.org]).then((r) => ({ data: r.rows[0] }));
    const antes = (await cargos(A.org)).length;
    const { data } = await A.cli.rpc("quality_import_positions_apply", { p_job_id: job.id });
    assert((data as Record<string, unknown>).outcome === "job_not_applicable",
      JSON.stringify(data));
    assert((await cargos(A.org)).length === antes, "se duplicaron cargos");
  });

  // =========================================================================
  console.log("\nB · Todo o nada");
  // =========================================================================

  await check("4. Un choque de nombre deshace el archivo ENTERO", async () => {
    const antes = (await cargos(A.org)).length;
    const job = await trabajo(A.cli, A.org, [
      { codigo: "N1", nombre: `Cargo nuevo uno ${sello}` },
      { codigo: "N2", nombre: `Cargo nuevo dos ${sello}` },
      // El tercero choca con uno que ya existe, solo por espacios y mayúsculas.
      { codigo: "N3", nombre: `  DIRECCIÓN   ${sello}  ` },
    ]);
    const { error } = await A.cli.rpc("quality_import_positions_apply", { p_job_id: job });
    assert(Boolean(error), "aceptó un cargo que ya existía");
    assert((await cargos(A.org)).length === antes,
      "quedaron cargos creados a medias: la aplicación no fue todo o nada");
  });

  await check("5. Un ciclo en el archivo deshace el archivo ENTERO", async () => {
    const antes = (await cargos(A.org)).length;
    const job = await trabajo(A.cli, A.org, [
      { codigo: "C1", nombre: `Ciclo uno ${sello}`, superior: "C2" },
      { codigo: "C2", nombre: `Ciclo dos ${sello}`, superior: "C1" },
    ]);
    const { error } = await A.cli.rpc("quality_import_positions_apply", { p_job_id: job });
    assert(Boolean(error) && String(error?.message).includes("POSITION_HIERARCHY_CYCLE"),
      `esperaba el ciclo y vino: ${error?.message}`);
    assert((await cargos(A.org)).length === antes, "quedó media estructura");
  });

  await check("6. Un superior que no está en el archivo también lo deshace", async () => {
    const antes = (await cargos(A.org)).length;
    const job = await trabajo(A.cli, A.org, [
      { codigo: "H1", nombre: `Huérfano ${sello}`, superior: "NO_EXISTE" },
    ]);
    const { error } = await A.cli.rpc("quality_import_positions_apply", { p_job_id: job });
    assert(Boolean(error) && String(error?.message).includes("POSITION_PARENT_UNRESOLVED"),
      `mensaje: ${error?.message}`);
    assert((await cargos(A.org)).length === antes, "quedó el huérfano creado");
  });

  // =========================================================================
  console.log("\nC · La regla de los ciclos alcanza a TODOS los caminos");
  // =========================================================================

  await check("7. Alta manual · un cargo no puede ser su propio superior", async () => {
    const filas = await cargos(A.org);
    const uno = filas[0];
    const { rows } = await pg.query(
      "select id from public.quality_positions where organization_id=$1 and name=$2",
      [A.org, uno.name]);
    let paro = false;
    try {
      await pg.query("update public.quality_positions set parent_position_id=$1 where id=$1",
        [rows[0].id]);
    } catch (e) { paro = /POSITION_HIERARCHY_CYCLE|not_self_parent/.test(String((e as Error).message)); }
    assert(paro, "el autociclo pasó por la vía manual");
  });

  await check("8. Y tampoco A → B → A ni cadenas más largas", async () => {
    const { rows } = await pg.query(
      `select id, name from public.quality_positions where organization_id=$1 order by name limit 3`,
      [A.org]);
    assert(rows.length >= 3, "el fixture no tiene tres cargos");
    const [x, y, z] = rows as Array<{ id: string; name: string }>;
    // Se parte de cero: el fixture ya trae una jerarquía de la prueba 2, y
    // montar la cadena encima chocaría con ella —que es precisamente lo que la
    // guarda hace bien, pero aquí impediría preparar el ensayo.
    await pg.query(
      "update public.quality_positions set parent_position_id=null where organization_id=$1",
      [A.org]);
    await pg.query("update public.quality_positions set parent_position_id=$2 where id=$1", [y.id, x.id]);
    await pg.query("update public.quality_positions set parent_position_id=$2 where id=$1", [z.id, y.id]);
    let paroCorto = false, paroLargo = false;
    try { await pg.query("update public.quality_positions set parent_position_id=$2 where id=$1", [x.id, y.id]); }
    catch (e) { paroCorto = String((e as Error).message).includes("POSITION_HIERARCHY_CYCLE"); }
    try { await pg.query("update public.quality_positions set parent_position_id=$2 where id=$1", [x.id, z.id]); }
    catch (e) { paroLargo = String((e as Error).message).includes("POSITION_HIERARCHY_CYCLE"); }
    assert(paroCorto, "A → B → A pasó por la vía manual");
    assert(paroLargo, "A → B → C → A pasó por la vía manual");
    // Se deshace el montaje para no dejar la jerarquía del fixture cambiada.
    await pg.query("update public.quality_positions set parent_position_id=null where id in ($1,$2)",
      [y.id, z.id]);
  });

  // =========================================================================
  console.log("\nD · Inquilino y permisos");
  // =========================================================================

  await check("9. El mismo cargo puede existir en otra empresa", async () => {
    const job = await trabajo(B.cli, B.org, [{ codigo: "DIR", nombre: `Dirección ${sello}` }]);
    const { data, error } = await B.cli.rpc("quality_import_positions_apply", { p_job_id: job });
    assert(!error && (data as Record<string, unknown>).outcome === "committed",
      `la unicidad se escapó del inquilino: ${error?.message}`);
  });

  await check("10. B no puede aplicar un trabajo de A", async () => {
    const job = await trabajo(A.cli, A.org, [{ codigo: "Z9", nombre: `Ajeno ${sello}` }]);
    const antes = (await cargos(A.org)).length;
    const { data, error } = await B.cli.rpc("quality_import_positions_apply", { p_job_id: job });
    assert(Boolean(error) || (data as Record<string, unknown>)?.outcome !== "committed",
      `B aplicó un trabajo de A: ${JSON.stringify(data)}`);
    assert((await cargos(A.org)).length === antes, "B creó cargos en A");
  });

  await check("11. Ni leer sus filas", async () => {
    const { data } = await B.cli.from("import_jobs").select("id")
      .eq("organization_id", A.org);
    assert((data ?? []).length === 0, "B leyó los trabajos de A");
  });

  await check("12. El archivo no puede gobernar la empresa", async () => {
    // La organización sale del TRABAJO, y el trabajo de la sesión: la primitiva
    // no recibe ningún parámetro de empresa.
    const { rows } = await pg.query(
      `select pg_get_function_arguments(p.oid) as args from pg_proc p
         join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='quality_import_positions_apply'`);
    assert(String(rows[0].args) === "p_job_id uuid",
      `la primitiva recibe: ${rows[0].args}`);
  });

  // =========================================================================
  console.log("\nE · Auditoría");
  // =========================================================================

  await check("13. Queda constancia de quién importó, qué y con qué plantilla", async () => {
    const { rows } = await pg.query(
      `select entity, filename, total_rows, inserted_rows, status, errors, created_by, created_at
         from public.import_jobs where organization_id=$1 and status='committed' limit 1`, [A.org]);
    const j = rows[0];
    assert(j.entity === "positions", `entidad: ${j.entity}`);
    assert(Boolean(j.filename), "no se guardó el nombre del archivo");
    assert(Number(j.total_rows) > 0 && Number(j.inserted_rows) > 0, JSON.stringify(j));
    assert((j.errors as Record<string, unknown>).template_version === "cargos-v1",
      `versión de plantilla: ${JSON.stringify(j.errors)}`);
    assert(Boolean(j.created_by) && Boolean(j.created_at), "falta quién y cuándo");
    // Y no se guarda el archivo entero.
    const { rows: cols } = await pg.query(
      `select count(*)::int n from information_schema.columns
        where table_schema='public' and table_name='import_jobs'
          and column_name in ('file_content','raw_file','csv')`);
    assert(cols[0].n === 0, "el marco guarda el archivo completo");
  });

  // ---- Limpieza, comprobada ------------------------------------------------
  const { rows: conOrg } = await pg.query(
    `select c.relname as tabla from pg_constraint k
       join pg_class c on c.oid = k.conrelid
       join pg_class r on r.oid = k.confrelid
       join pg_namespace n on n.oid = c.relnamespace
      where k.contype='f' and n.nspname='public' and r.relname='organizations'
        and c.relname <> 'organizations'`);
  let quedan = conOrg.map((r: { tabla: string }) => r.tabla);
  await pg.query("begin");
  // La jerarquía se suelta antes: un cargo referencia a otro de la misma tabla.
  await pg.query(
    "update public.quality_positions set parent_position_id=null where organization_id = any($1::uuid[])",
    [orgs]);
  for (let vuelta = 0; vuelta < 10 && quedan.length > 0; vuelta += 1) {
    const fallaron: string[] = [];
    for (const t of quedan) {
      await pg.query("savepoint s");
      try {
        await pg.query(`delete from public.${t} where organization_id = any($1::uuid[])`, [orgs]);
        await pg.query("release savepoint s");
      } catch { await pg.query("rollback to savepoint s"); fallaron.push(t); }
    }
    if (fallaron.length === quedan.length) break;
    quedan = fallaron;
  }
  await pg.query("savepoint o");
  try { await pg.query("delete from public.organizations where id = any($1::uuid[])", [orgs]); await pg.query("release savepoint o"); }
  catch { await pg.query("rollback to savepoint o"); }
  await pg.query("commit");
  for (const uid of personas) await admin.auth.admin.deleteUser(uid);

  await check("14. La suite no deja un solo fixture detrás", async () => {
    const { rows: o } = await pg.query(
      "select count(*)::int n from public.organizations where name like 'STAB04 %'");
    const { rows: c } = await pg.query(
      "select count(*)::int n from public.quality_positions where organization_id = any($1::uuid[])", [orgs]);
    const { rows: j } = await pg.query(
      "select count(*)::int n from public.import_jobs where organization_id = any($1::uuid[])", [orgs]);
    const { rows: jr } = await pg.query(
      "select count(*)::int n from public.import_job_rows where organization_id = any($1::uuid[])", [orgs]);
    const { data: usuarios } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const vivos = usuarios.users.filter((u) => u.email?.startsWith("stab04-")).length;
    assert(o[0].n === 0, `quedaron ${o[0].n} organizaciones`);
    assert(c[0].n === 0, `quedaron ${c[0].n} cargos`);
    assert(j[0].n === 0, `quedaron ${j[0].n} trabajos de importación`);
    assert(jr[0].n === 0, `quedaron ${jr[0].n} filas de importación`);
    assert(vivos === 0, `quedaron ${vivos} usuarios de prueba`);
  });

  await pg.end();
  console.log(`\nSTABILIZATION-04 · aplicar: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
