/**
 * Trazaloop · QUALITY-13B1 · Aislamiento de las primitivas de integración.
 *
 * Una capa que compone trece dominios es la mejor oportunidad que ha tenido
 * este producto de filtrar datos de otra empresa: basta con que UNA sección se
 * salte la RLS para que el mirador se convierta en una ventana.
 *
 * Tres identidades: quien administra la empresa A, quien administra la B, y
 * quien no es miembro de ninguna.
 *
 * Correr: npm run test:quality13b1-rls
 */
import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) { console.error("Faltan variables."); process.exit(1); }

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
async function check(n: string, fn: () => Promise<void>) {
  try { await fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const password = "Trazaloop-Test-1234";
const hoy = new Date().toISOString().slice(0, 10);

async function persona(tag: string) {
  const email = `q13b1r-${tag}-${stamp}@test.trazaloop.dev`;
  const { data } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: `QA ${tag}` } });
  assert(data.user, `usuario ${tag}`);
  const cli: SupabaseClient = createClient(URL!, ANON!, {
    auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await cli.auth.signInWithPassword({ email, password });
  assert(!error, `login ${tag}: ${error?.message}`);
  return cli;
}

async function main() {
  const CTX = await import("../../lib/db/quality-process-context");
  const POS = await import("../../lib/db/quality-position-context");

  console.log("\nQUALITY-13B1 · Aislamiento · base real\n");

  const a = await persona("a");
  const { data: orgAId } = await a.rpc("create_organization", { p_name: `Q13B1R A ${stamp}` });
  const orgA = orgAId as string;
  await admin.from("organization_modules")
    .update({ access_mode: "full", access_expires_at: null })
    .eq("organization_id", orgA).eq("module_code", "quality");

  const b = await persona("b");
  const { data: orgBId } = await b.rpc("create_organization", { p_name: `Q13B1R B ${stamp}` });
  const orgB = orgBId as string;
  await admin.from("organization_modules")
    .update({ access_mode: "full", access_expires_at: null })
    .eq("organization_id", orgB).eq("module_code", "quality");

  const ajeno = await persona("ajeno");

  // --- Datos en A ---------------------------------------------------------
  const { data: cargoA } = await a.from("quality_positions")
    .insert({ organization_id: orgA, name: "QA Q13R · Dirección" }).select("id").single();
  const { data: procA } = await a.from("quality_processes")
    .insert({ organization_id: orgA, name: "QA Q13R · Proceso de A", category_code: "core",
              status: "active", owner_position_id: cargoA!.id })
    .select("id").single();
  const { data: riesgoA } = await a.from("quality_risks")
    .insert({ organization_id: orgA, code: `QA13R-${stamp}`.slice(0, 24),
              title: "QA Q13R · Riesgo de A",
              event_description: "Solo para comprobar el aislamiento.",
              owner_position_id: cargoA!.id })
    .select("id").single();
  await a.from("quality_risk_processes")
    .insert({ organization_id: orgA, risk_id: riesgoA!.id, process_id: procA!.id });

  // --- Datos en B, con el MISMO nombre, para que confundirlos se note -----
  const { data: procB } = await b.from("quality_processes")
    .insert({ organization_id: orgB, name: "QA Q13R · Proceso de B", category_code: "core",
              status: "active" })
    .select("id").single();

  // =========================================================================
  await check("RLS-1. B no compone el contexto de un proceso de A", async () => {
    const ctx = await CTX.loadProcessContext(orgA, procA!.id as string, b);
    assert(ctx === null, "B compuso el contexto de A");
  });

  await check("RLS-2. Ni pasando SU empresa con el proceso de A", async () => {
    // El intento evidente: mezclar el identificador de empresa propio con el
    // del proceso ajeno. La consulta filtra por los dos, y la RLS por encima.
    const ctx = await CTX.loadProcessContext(orgB, procA!.id as string, b);
    assert(ctx === null, "se compuso un contexto mezclando dos empresas");
  });

  await check("RLS-3. Quien no es miembro no obtiene nada, ni null a medias", async () => {
    const ctx = await CTX.loadProcessContext(orgA, procA!.id as string, ajeno);
    assert(ctx === null, "un no miembro compuso el contexto");
    const pos = await POS.loadPositionContext(orgA, cargoA!.id as string, ajeno);
    assert(pos === null, "un no miembro leyó el contexto de un cargo");
  });

  await check("RLS-4. El contexto de A no menciona nada de B", async () => {
    const ctx = await CTX.loadProcessContext(orgA, procA!.id as string, a);
    assert(ctx, "A no pudo componer su propio contexto");
    const texto = JSON.stringify(ctx);
    assert(!texto.includes(procB!.id as string), "el contexto de A cita un proceso de B");
    assert(!texto.includes("Proceso de B"), "el contexto de A nombra algo de B");
    assert(texto.includes(riesgoA!.id as string), "el contexto de A no cita su propio riesgo");
  });

  await check("RLS-5. Lo derivado tampoco cruza la frontera", async () => {
    const { data: parte } = await a.from("quality_external_parties")
      .insert({ organization_id: orgA, legal_name: `QA Q13R Proveedor ${stamp}` })
      .select("id").single();
    const { data: perfil } = await a.from("quality_supplier_profiles")
      .insert({ organization_id: orgA, party_id: parte!.id }).select("id").single();

    const desdeB = await CTX.deriveSupplierProcesses(orgA, perfil!.id as string, b);
    assert(desdeB.length === 0, "B derivó procesos de un proveedor de A");
    const desdeAjeno = await CTX.deriveSupplierProcesses(orgA, perfil!.id as string, ajeno);
    assert(desdeAjeno.length === 0, "un no miembro derivó procesos");
  });

  await check("RLS-6. La fuente de automatización de proceso respeta la empresa", async () => {
    const { data: propios, error } = await a.rpc("quality_automation_subjects", {
      p_organization_id: orgA, p_source_code: "process", p_today: hoy });
    assert(!error, `sujetos de A: ${error?.message}`);
    const filas = (propios ?? []) as { subject_id: string; facts: Record<string, unknown> }[];
    assert(filas.some((f) => f.subject_id === procA!.id), "A no observa su propio proceso");
    assert(!filas.some((f) => f.subject_id === procB!.id), "A observa un proceso de B");

    const { data: ajenos } = await b.rpc("quality_automation_subjects", {
      p_organization_id: orgA, p_source_code: "process", p_today: hoy });
    assert((ajenos ?? []).length === 0, "B observó los procesos de A");
  });

  await check("RLS-7. Los hechos del proceso son ciertos y no llevan personas", async () => {
    const { data } = await a.rpc("quality_automation_subjects", {
      p_organization_id: orgA, p_source_code: "process", p_today: hoy });
    const fila = ((data ?? []) as { subject_id: string; facts: Record<string, unknown> }[])
      .find((f) => f.subject_id === procA!.id);
    assert(fila, "no se observa el proceso");
    assert(fila!.facts.status === "active", "el estado no llega");
    assert(fila!.facts.owner_position === "QA Q13R · Dirección",
      `el cargo propietario no llega: ${JSON.stringify(fila!.facts.owner_position)}`);
    assert(Number(fila!.facts.risk_count) === 1, "no cuenta el riesgo relacionado");
    assert(fila!.facts.last_revision_on === null,
      "inventa una fecha de revisión donde no hay ninguna publicada");
    const texto = JSON.stringify(fila!.facts);
    assert(!/@|profile_id|person/i.test(texto), "los hechos del proceso llevan datos de personas");
  });

  await check("RLS-8. Un proceso retirado deja de observarse", async () => {
    const { data: retirado } = await a.from("quality_processes")
      .insert({ organization_id: orgA, name: "QA Q13R · Retirado", category_code: "core",
                status: "retired" })
      .select("id").single();
    const { data } = await a.rpc("quality_automation_subjects", {
      p_organization_id: orgA, p_source_code: "process", p_today: hoy });
    const filas = (data ?? []) as { subject_id: string }[];
    assert(!filas.some((f) => f.subject_id === retirado!.id),
      "se observa un proceso retirado: abriría señales sobre algo ya dejado atrás");
  });

  await check("RLS-9. Una tarea NO la escribe una persona: la escribe el motor", async () => {
    // Se intentó comprobar aquí que el CHECK de sujeto admite `quality_process`
    // insertando una tarea, y la RLS lo rechazó —correctamente—: `work_tasks`
    // no tiene política de escritura para usuarios. Las salidas las emite el
    // ejecutor, que es `security definer`.
    //
    // Así que aquí se comprueba lo que esta capa SÍ debe garantizar —que nadie
    // escribe tareas a mano— y la ampliación del CHECK se verifica leyendo la
    // migración, en la suite estática.
    const { error } = await a.from("work_tasks").insert({
      organization_id: orgA, source_domain: "automation", task_type: "automation_follow_up",
      subject_type: "quality_process", subject_id: procA!.id,
      title: "QA Q13R · intento manual", status: "open", dedupe_key: `qa13r-${stamp}`,
    });
    assert(error, "una persona pudo escribir una tarea a mano: las salidas son del motor");
  });

  console.log(`\n  ${passed} correctas, ${failed} fallidas\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
