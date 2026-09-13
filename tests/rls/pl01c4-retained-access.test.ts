import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

loadEnv({ path: ".env.local", quiet: true });

/**
 * Trazaloop · PROD-LAUNCH-01C.4 · La información sigue siendo suya.
 *
 *
 * QUÉ SE REPRODUCE
 *
 * El caso exacto que falló en el humo de Producción con «Empresa de Prueba 1»:
 * una empresa con Quality, Textiles y PCR en Demo, la prueba vencida, trabajo
 * ya creado dentro, y cero módulos activos.
 *
 * Se prueba contra la BASE, no contra pantallas, porque la promesa es sobre
 * datos: que se puedan leer, descargar y borrar los propios, que NO se pueda
 * crear más, y que nada de esto abra una rendija hacia la información de otra
 * empresa. Un mensaje de interfaz puede quedar bonito mientras la RLS deja
 * pasar; lo que decide es esto.
 *
 *
 * LA FRONTERA QUE MÁS IMPORTA
 *
 * Conservar consulta NO es regalar módulos. Un módulo que la empresa nunca
 * tuvo tiene que seguir cerrado aunque la empresa esté en Free, y aquí se
 * comprueba con una fila que no existe, no con un comentario.
 *
 * Correr: npm run test:pl01c4-db
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!URL || !SERVICE || !ANON) {
  console.log("faltan credenciales locales en .env.local");
  process.exit(1);
}

const admin: SupabaseClient = createClient(URL, SERVICE, { auth: { persistSession: false } });
let passed = 0, failed = 0;
const sello = Date.now();
const personas: string[] = [];
const orgs: string[] = [];

async function check(nombre: string, fn: () => Promise<void>) {
  try { await fn(); passed += 1; console.log(`  ✔ ${nombre}`); }
  catch (e) { failed += 1; console.log(`  ✘ ${nombre}: ${e instanceof Error ? e.message : e}`); }
}
function assert(cond: boolean, mensaje: string) { if (!cond) throw new Error(mensaje); }

const CLAVE = "Trazaloop-Test-1234";

async function empresa(etiqueta: string) {
  const email = `pl01c4-${etiqueta}-${sello}@test.trazaloop.dev`;
  const { data: u, error } = await admin.auth.admin.createUser({
    email, password: CLAVE, email_confirm: true });
  assert(!error && Boolean(u.user), `crear persona: ${error?.message}`);
  const uid = (u.user as { id: string }).id;
  personas.push(uid);
  const cli = createClient(URL!, ANON!, { auth: { persistSession: false } });
  await cli.auth.signInWithPassword({ email, password: CLAVE });
  const { data: orgId, error: eOrg } = await cli.rpc("create_organization",
    { p_name: `PL01C4 ${etiqueta} ${sello}`, p_tax_id: null, p_country: "CO" });
  assert(!eOrg && Boolean(orgId), `crear empresa: ${eOrg?.message}`);
  const org = orgId as string;
  orgs.push(org);
  await admin.from("memberships").update({ role_code: "admin" })
    .eq("organization_id", org).eq("user_id", uid);
  return { org, uid, cli };
}

/** Envejece la prueba de un módulo: es lo que hace el reloj, sin esperarlo. */
async function vencerPrueba(org: string, moduleCode: string) {
  const { error } = await admin.from("organization_modules")
    .update({ access_mode: "demo", access_expires_at: "2026-09-09T20:29:33.865Z" })
    .eq("organization_id", org).eq("module_code", moduleCode);
  assert(!error, `vencer ${moduleCode}: ${error?.message}`);
}

async function main() {
  // server-only: se importa DENTRO de main y con --conditions=react-server.
  const { resolveModuleAccessForOrg } = await import("../../lib/db/module-access");

  console.log("\nA · Se reproduce el caso de Producción\n");

  const a = await empresa("historica");
  for (const m of ["quality", "textiles", "traceability_6632"]) await vencerPrueba(a.org, m);

  // El trabajo que ya existía dentro del módulo.
  const { data: proc, error: eProc } = await admin.from("quality_processes")
    .insert({ organization_id: a.org, name: `Proceso histórico ${sello}`,
              category_code: "core", status: "active" })
    .select("id").single();
  assert(!eProc && Boolean(proc), `crear proceso histórico: ${eProc?.message}`);
  const procId = (proc as { id: string }).id;

  await check("Los tres módulos quedan vencidos: sin crear, con consulta", async () => {
    for (const m of ["quality", "textiles", "traceability_6632"]) {
      const d = await resolveModuleAccessForOrg(a.org, m, admin);
      assert(d.derivedState === "demo_expired", `${m}: estado «${d.derivedState}»`);
      assert(d.allowed === false, `${m}: sigue permitiendo crear con la prueba vencida`);
      assert(d.retainedRead === true,
        `${m}: la empresa no puede consultar el trabajo que ya hizo`);
    }
  });

  await check("Y la empresa SÍ lee su información histórica", async () => {
    const { data, error } = await a.cli.from("quality_processes")
      .select("id, name").eq("id", procId);
    assert(!error, `lectura denegada: ${error?.message}`);
    assert((data ?? []).length === 1,
      "la empresa no ve su propio proceso con la prueba vencida");
  });

  await check("Puede BORRAR lo suyo: agotar un plan no secuestra datos", async () => {
    const { data: extra } = await admin.from("quality_processes")
      .insert({ organization_id: a.org, name: `Proceso a borrar ${sello}`,
                category_code: "core", status: "draft" })
      .select("id").single();
    const id = (extra as { id: string }).id;
    const { error } = await a.cli.from("quality_processes").delete().eq("id", id);
    assert(!error, `borrado denegado: ${error?.message}`);
    const { data } = await admin.from("quality_processes").select("id").eq("id", id);
    assert((data ?? []).length === 0, "el borrado no llegó a la base");
  });

  console.log("\nB · Conservar consulta no es regalar módulos\n");

  await check("Un módulo SIN asignación no concede consulta", async () => {
    await admin.from("organization_modules")
      .delete().eq("organization_id", a.org).eq("module_code", "textiles");
    const d = await resolveModuleAccessForOrg(a.org, "textiles", admin);
    assert(d.derivedState === "not_assigned", `estado «${d.derivedState}»`);
    assert(d.retainedRead === false,
      "un módulo que la empresa nunca tuvo quedaría accesible en Free");
    assert(d.allowed === false, "y además dejaría crear");
  });

  await check("Una suspensión administrativa tampoco", async () => {
    await admin.from("organization_modules").update({ enabled: false })
      .eq("organization_id", a.org).eq("module_code", "traceability_6632");
    const d = await resolveModuleAccessForOrg(a.org, "traceability_6632", admin);
    assert(d.derivedState === "disabled", `estado «${d.derivedState}»`);
    assert(d.retainedRead === false,
      "deshabilitar un módulo se podría saltar entrando en modo consulta");
  });

  await check("Un acceso VIGENTE sigue leyendo y escribiendo igual que antes", async () => {
    await admin.from("organization_modules")
      .update({ access_mode: "full", access_expires_at: null, enabled: true })
      .eq("organization_id", a.org).eq("module_code", "quality");
    const d = await resolveModuleAccessForOrg(a.org, "quality", admin);
    assert(d.allowed === true && d.retainedRead === true,
      `Full quedó en allowed=${d.allowed} retainedRead=${d.retainedRead}`);
    await vencerPrueba(a.org, "quality");
  });

  console.log("\nC · Nada de esto abre la puerta de otra empresa\n");

  const b = await empresa("vecina");

  await check("Otra empresa NO ve el proceso histórico", async () => {
    const { data, error } = await b.cli.from("quality_processes").select("id").eq("id", procId);
    assert(!error, `error inesperado: ${error?.message}`);
    assert((data ?? []).length === 0,
      "la consulta retenida dejó ver datos de otra empresa");
  });

  await check("Ni puede borrarlo", async () => {
    await b.cli.from("quality_processes").delete().eq("id", procId);
    const { data } = await admin.from("quality_processes").select("id").eq("id", procId);
    assert((data ?? []).length === 1, "otra empresa borró un proceso que no es suyo");
  });

  await check("Y quien no es miembro de ninguna no ve nada", async () => {
    const email = `pl01c4-suelta-${sello}@test.trazaloop.dev`;
    const { data: u } = await admin.auth.admin.createUser({
      email, password: CLAVE, email_confirm: true });
    personas.push((u!.user as { id: string }).id);
    const cli = createClient(URL!, ANON!, { auth: { persistSession: false } });
    await cli.auth.signInWithPassword({ email, password: CLAVE });
    const { data } = await cli.from("quality_processes").select("id").eq("id", procId);
    assert((data ?? []).length === 0, "una persona sin empresa vio el proceso");
  });

  // ── limpieza ────────────────────────────────────────────────────────────
  for (const org of orgs) await admin.from("organizations").delete().eq("id", org);
  for (const uid of personas) await admin.auth.admin.deleteUser(uid);

  console.log(`\nPROD-LAUNCH-01C.4 · consulta retenida en base: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
