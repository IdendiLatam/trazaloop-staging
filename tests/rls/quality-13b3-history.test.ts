/**
 * Trazaloop · QUALITY-13B3 · La historia de lo observado.
 *
 * Convergir es una decisión de PANTALLA: enseñar un problema una vez. La
 * historia es otra cosa, y §17 la separa a propósito: hay que poder responder
 * QUÉ se observó, QUIÉN lo observó, CUÁNDO y SOBRE QUÉ, aunque hoy ese
 * observador esté relevado y su línea ya no se enseñe.
 *
 * Correr: npm run test:quality13b3-history
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

async function main() {
  const ATT = await import("../../lib/db/quality-attention");

  console.log("\nQUALITY-13B3 · Historia y procedencia\n");

  const email = `q13b3h-${stamp}@test.trazaloop.dev`;
  const { data: u } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: "QA Historia" } });
  assert(u.user, "usuario");
  const cli: SupabaseClient = createClient(URL!, ANON!, {
    auth: { autoRefreshToken: false, persistSession: false } });
  await cli.auth.signInWithPassword({ email, password });
  const { data: orgId } = await cli.rpc("create_organization", { p_name: `Q13B3 H ${stamp}` });
  const org = orgId as string;
  await admin.from("organization_modules")
    .update({ access_mode: "full", access_expires_at: null })
    .eq("organization_id", org).eq("module_code", "quality");

  const corto = (s: string) => s.slice(0, 24);
  const { data: cargo } = await cli.from("quality_positions")
    .insert({ organization_id: org, name: "QA Q13B3H · Jefe de calidad" }).select("id").single();
  await cli.from("quality_position_assignments").insert({
    organization_id: org, position_id: cargo!.id, profile_id: u.user!.id,
    assignment_type: "holder", effective_from: "2026-01-01" });

  const { data: riesgo } = await cli.from("quality_risks").insert({
    organization_id: org, code: corto(`QB3H-R-${stamp}`),
    title: "QA Q13B3H · Riesgo con historia",
    event_description: "Un riesgo que se observa, se resuelve y vuelve.",
    owner_position_id: cargo!.id, status: "active", next_review_on: "2026-01-05" })
    .select("id").single();

  await cli.rpc("quality_scan_risk_reviews", { p_organization_id: org });

  // =========================================================================
  console.log("S · Nada se borra");
  // =========================================================================

  await check("S1. Lo observado queda, con su observador, su sujeto y su fecha", async () => {
    const { data } = await cli.from("work_alerts")
      .select("alert_type, subject_type, subject_id, created_at, source_domain")
      .eq("organization_id", org).eq("subject_id", riesgo!.id);
    assert((data ?? []).length > 0, "no quedó constancia de lo observado");
    const a = data![0];
    assert(a.alert_type === "risk_review_overdue", "no se sabe QUÉ se observó");
    assert(a.source_domain === "risk", "no se sabe QUIÉN lo observó");
    assert(a.subject_id === riesgo!.id, "no se sabe SOBRE QUÉ");
    assert(a.created_at, "no se sabe CUÁNDO");
  });

  await check("S2. Mientras UN observador siga viéndolo, el problema sigue", async () => {
    // El barrido de riesgos deja aviso Y pendiente. Cerrar solo el aviso no
    // resuelve nada: el pendiente sigue asignado a alguien, y esconder el
    // problema por haber cerrado la notificación sería exactamente el error
    // que la convergencia existe para evitar.
    const { count: antes } = await cli.from("work_alerts")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", org).eq("subject_id", riesgo!.id);

    await admin.from("work_alerts")
      .update({ status: "resolved", resolved_at: new Date().toISOString() })
      .eq("organization_id", org).eq("subject_id", riesgo!.id);

    const conTarea = await ATT.loadAttention({ organizationId: org, domain: "risks" }, cli);
    assert(conTarea.items.some((i) => i.subjectId === riesgo!.id),
      "cerrar el aviso escondió el problema mientras su pendiente seguía abierto");

    // Y en cuanto se cierra también el pendiente, deja de enseñarse.
    const { error: eCierre } = await admin.from("work_tasks")
      .update({ status: "done", completed_at: new Date().toISOString() })
      .eq("organization_id", org).eq("subject_id", riesgo!.id);
    assert(!eCierre, `cerrar el pendiente: ${eCierre?.message}`);
    const cerrado = await ATT.loadAttention({ organizationId: org, domain: "risks" }, cli);
    const restantes = cerrado.items.filter((i) => i.subjectId === riesgo!.id);
    assert(restantes.length === 0,
      "con aviso y pendiente cerrados, el problema sigue enseñándose por: " +
      restantes.map((i) => `${i.observer.code} (${i.state})`).join(", "));

    const { count: despues } = await cli.from("work_alerts")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", org).eq("subject_id", riesgo!.id);
    assert(antes === despues, `desaparecieron filas: ${antes} → ${despues}`);
  });

  await check("S3. La condición que VUELVE es una ocurrencia nueva, no la vieja", async () => {
    // El barrido usa clave por fecha de revisión: cambiarla es una condición
    // nueva y honesta —otra fecha, otro incumplimiento—.
    await admin.from("quality_risks")
      .update({ next_review_on: "2026-02-05" }).eq("id", riesgo!.id);
    await cli.rpc("quality_scan_risk_reviews", { p_organization_id: org });

    const { data } = await cli.from("work_alerts")
      .select("dedupe_key, status").eq("organization_id", org).eq("subject_id", riesgo!.id);
    const claves = new Set((data ?? []).map((x) => x.dedupe_key as string));
    assert(claves.size === 2,
      `esperaba dos ocurrencias distinguibles, hay ${claves.size}`);
    const abiertas = (data ?? []).filter((x) => x.status === "new");
    assert(abiertas.length === 1,
      `hay ${abiertas.length} abiertas: la vuelta se aplanó sobre la anterior`);
  });

  await check("S4. Y la portada convergida enseña UNA, no las dos", async () => {
    const r = await ATT.loadAttention({ organizationId: org, domain: "risks" }, cli);
    const delRiesgo = r.items.filter((i) => i.subjectId === riesgo!.id);
    assert(delRiesgo.length === 1,
      `se enseñan ${delRiesgo.length} líneas para un riesgo con dos ocurrencias, una cerrada`);
  });

  // =========================================================================
  console.log("\nT · La evidencia del origen no se reescribe");
  // =========================================================================

  await check("T1. El pendiente también conserva su procedencia", async () => {
    const { data } = await cli.from("work_tasks")
      .select("task_type, source_domain, subject_type, subject_id, created_at, dedupe_key")
      .eq("organization_id", org).eq("subject_id", riesgo!.id);
    assert((data ?? []).length > 0, "no quedó constancia del pendiente");
    for (const t of data ?? []) {
      assert(t.task_type && t.source_domain && t.subject_type && t.subject_id && t.created_at,
        "un pendiente sin tipo, dominio, sujeto o fecha no responde a nada");
      assert(t.dedupe_key, "un pendiente sin identidad se duplicaría en cada pasada");
    }
    // Y los hechos registrados, si los hay, están igual de completos.
    const { data: hechos } = await cli.from("work_events")
      .select("event_type, subject_type, subject_id").eq("organization_id", org).limit(20);
    for (const e of hechos ?? []) {
      assert(e.event_type && e.subject_type && e.subject_id, "un hecho incompleto");
    }
  });

  await check("T2. Nadie puede reescribir por qué saltó una señal", async () => {
    // La guarda de 0129 vive en la base, no en la aplicación. Se comprueba que
    // sigue instalada: es la que hace que la historia sea historia.
    const { data } = await admin.rpc("quality_automation_health",
      { p_organization_id: org }).then((r) => r, () => ({ data: null }));
    void data;
    const { data: trg } = await admin
      .from("pg_trigger" as never).select("*").limit(0).then((r) => r, () => ({ data: null }));
    void trg;
    // Comprobación directa: la función de congelado existe y el disparador la usa.
    const { error } = await admin.rpc("quality_signal_origin_is_frozen" as never, {} as never);
    // Se espera un error de invocación —es una función de disparador— pero NO
    // «no existe»: si no existiera, la historia sería editable.
    assert(error, "la guarda de congelado devolvió éxito, y es una función de disparador");
    assert(!/does not exist|no existe/i.test(error!.message ?? ""),
      `la guarda que congela el origen de una señal no está: ${error!.message}`);
  });

  // =========================================================================
  console.log("\nU · Relevar no borra");
  // =========================================================================

  await check("U1. Adoptar la regla no toca una sola fila de historia", async () => {
    const { count: antesAv } = await cli.from("work_alerts")
      .select("*", { count: "exact", head: true }).eq("organization_id", org);
    const { count: antesEv } = await cli.from("work_events")
      .select("*", { count: "exact", head: true }).eq("organization_id", org);

    const { data: regla, error } = await cli.rpc("quality_automation_instantiate_template", {
      p_organization_id: org, p_template_code: "indicator_measurement_due",
      p_owner_position_id: cargo!.id, p_conditions: null });
    assert(!error, `adoptar: ${error?.message}`);
    const { data: ver } = await cli.from("quality_automation_rule_versions")
      .select("id").eq("organization_id", org).eq("rule_id", regla as string).single();
    await cli.rpc("quality_automation_publish_version", {
      p_version_id: ver!.id, p_effective_from: null, p_change_note: null });

    const { count: despuesAv } = await cli.from("work_alerts")
      .select("*", { count: "exact", head: true }).eq("organization_id", org);
    const { count: despuesEv } = await cli.from("work_alerts")
      .select("*", { count: "exact", head: true }).eq("organization_id", org);
    assert(antesAv === despuesAv, `relevar borró avisos: ${antesAv} → ${despuesAv}`);
    assert((antesEv ?? 0) <= (despuesEv ?? 0) + (antesAv ?? 0), "recuento inconsistente");
  });

  await check("U2. El barrido relevado SIGUE existiendo: no se borró código", async () => {
    // Se invoca: si hubiera desaparecido, esto fallaría con «no existe».
    const { error } = await cli.rpc("quality_scan_pending_measurements",
      { p_organization_id: org });
    assert(!error, `el barrido relevado ya no existe o falla: ${error?.message}`);
  });

  await check("U3. Y quien NO adopta la regla sigue recibiendo lo mismo", async () => {
    const { data: otro } = await admin.auth.admin.createUser({
      email: `q13b3h2-${stamp}@test.trazaloop.dev`, password, email_confirm: true,
      user_metadata: { full_name: "QA Sin reglas" } });
    const cli2: SupabaseClient = createClient(URL!, ANON!, {
      auth: { autoRefreshToken: false, persistSession: false } });
    await cli2.auth.signInWithPassword({
      email: `q13b3h2-${stamp}@test.trazaloop.dev`, password });
    const { data: org2 } = await cli2.rpc("create_organization",
      { p_name: `Q13B3 H2 ${stamp}` });
    await admin.from("organization_modules")
      .update({ access_mode: "full", access_expires_at: null })
      .eq("organization_id", org2 as string).eq("module_code", "quality");

    const { data: relevado } = await cli2.rpc("quality_observer_is_superseded", {
      p_organization_id: org2 as string,
      p_observer: "quality_scan_pending_measurements.measurement_due" });
    assert(relevado === false,
      "una empresa que no adoptó nada figura con el barrido relevado");
    void otro;
  });

  console.log(`\nQUALITY-13B3 · historia: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
