/**
 * Trazaloop · QUALITY-03.1 · Base real.
 *
 * Tres cosas que la prueba humana encontró y que no se pueden verificar sin
 * una base de verdad:
 *
 *   · un indicador vigente desde agosto pedía medir julio, y su propio motor
 *     rechazaba julio. La aplicación fabricaba una obligación imposible;
 *   · borrar un indicador arrastraba EN CASCADA sus mediciones, y la política
 *     dejaba hacerlo a cualquier administrador;
 *   · un código documental liberado por un borrado volvía a estar disponible,
 *     contra D-04.
 *
 * Todo corre con la sesión REAL de cada usuario. El cliente administrativo se
 * usa solo para crear cuentas.
 */
import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !ANON || !SERVICE) {
  console.error("Faltan variables para test:quality031-rls (URL, ANON, SERVICE_ROLE).");
  process.exit(1);
}

let passed = 0;
let failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
async function check(n: string, fn: () => Promise<void>) {
  try { await fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function newUser(label: string, name: string) {
  const email = `q031-${label}-${stamp}@test.trazaloop.dev`;
  const password = "Trazaloop-Test-1234";
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: name },
  });
  if (error || !data.user) throw new Error(`usuario ${label}: ${error?.message}`);
  const client = createClient(URL!, ANON!, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: e } = await client.auth.signInWithPassword({ email, password });
  if (e) throw new Error(`login ${label}: ${e.message}`);
  return { id: data.user.id, name, client };
}

/** El periodo canónico que contiene una fecha, según la periodicidad. */
function periodOf(frequency: string, iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  const y = d.getUTCFullYear(), m = d.getUTCMonth();
  if (frequency === "annual") {
    return { start: `${y}-01-01`, end: `${y}-12-31`, label: `${y}` };
  }
  if (frequency === "quarterly") {
    const q = Math.floor(m / 3);
    const end = new Date(Date.UTC(y, q * 3 + 3, 0));
    return { start: `${y}-${String(q * 3 + 1).padStart(2, "0")}-01`,
             end: end.toISOString().slice(0, 10), label: `${y}-Q${q + 1}` };
  }
  const end = new Date(Date.UTC(y, m + 1, 0));
  return { start: `${y}-${String(m + 1).padStart(2, "0")}-01`,
           end: end.toISOString().slice(0, 10), label: `${y}-${String(m + 1).padStart(2, "0")}` };
}

/** El periodo ANTERIOR al que contiene hoy. Es el que la vista solía fabricar
 *  sin preguntar si pertenecía a la vida del indicador. */
function previousPeriod(frequency: string) {
  const now = new Date();
  const y = now.getUTCFullYear(), m = now.getUTCMonth();
  if (frequency === "annual") return periodOf("annual", `${y - 1}-06-15`);
  if (frequency === "quarterly") {
    const q = Math.floor(m / 3);
    const pm = q === 0 ? 11 : (q - 1) * 3 + 1;
    const py = q === 0 ? y - 1 : y;
    return periodOf("quarterly", `${py}-${String(pm + 1).padStart(2, "0")}-15`);
  }
  const pd = new Date(Date.UTC(y, m - 1, 15));
  return periodOf("monthly", pd.toISOString().slice(0, 10));
}
/** El periodo EN CURSO. */
function currentPeriod(frequency: string) {
  return periodOf(frequency, new Date().toISOString().slice(0, 10));
}

async function makeIndicator(
  client: SupabaseClient, orgId: string, code: string, name: string,
  effectiveFrom: string, frequency = "monthly", ownerPositionId: string | null = null
) {
  const { data, error } = await client.from("quality_indicators")
    .insert({ organization_id: orgId, code, name, admin_state: "active", owner_position_id: ownerPositionId })
    .select("id").single();
  assert(!error && data, `crear ${code}: ${error?.message}`);
  const id = data!.id as string;
  const { error: e } = await client.rpc("quality_publish_indicator_config", {
    p_indicator_id: id, p_effective_from: effectiveFrom,
    p_unit_code: "percent", p_direction: "higher_is_better", p_frequency: frequency,
    p_target_value: 90, p_target_min: null, p_target_max: null,
    p_warning_value: null, p_warning_min: null, p_warning_max: null,
    p_source_kind: "manual", p_source_key: null, p_calc_definition: null,
    p_formula_text: null, p_unit_label: null, p_source_note: null,
    p_consolidation: "none", p_comparability_break: false,
    p_comparability_note: null, p_change_note: null,
  });
  assert(!e, `configurar ${code}: ${e?.message}`);
  return id;
}

async function statusOf(client: SupabaseClient, indicatorId: string) {
  const { data } = await client.from("v_quality_indicator_status")
    .select("due_period_label, measurement_pending, current_period_label, next_measurement_due_on")
    .eq("indicator_id", indicatorId).maybeSingle();
  return data;
}

async function eligibility(client: SupabaseClient, entity: string, id: string) {
  const { data } = await client.rpc("quality_deletion_eligibility", { p_entity: entity, p_id: id });
  return (data ?? {}) as Record<string, unknown>;
}

async function main() {
  console.log("\nQUALITY-03.1 · base real\n");

  const owner = await newUser("owner", "Responsable de Calidad");
  const outsider = await newUser("out", "Ajena");
  await owner.client.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "q031" });
  await outsider.client.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "q031" });

  const { data: orgA } = await owner.client.rpc("create_organization", { p_name: `Q031 A ${stamp}` });
  const { data: orgB } = await outsider.client.rpc("create_organization", { p_name: `Q031 B ${stamp}` });
  const A = orgA as string, B = orgB as string;

  // El periodo EN CURSO como fecha de vigencia: el indicador «empieza ahora».
  const thisMonth = currentPeriod("monthly");
  const lastMonth = previousPeriod("monthly");

  // -------------------------------------------------------------------------
  console.log("T · Semántica temporal: no se exige lo que no era exigible");
  // -------------------------------------------------------------------------

  const startsNow = await makeIndicator(owner.client, A, `T-NOW-${stamp}`, "Empieza este mes", thisMonth.start);

  await check("T1. un indicador que empieza este mes NO pide el mes anterior", async () => {
    const s = await statusOf(owner.client, startsNow);
    assert(s !== null, "el indicador no aparece en la vista");
    assert(s!.due_period_label !== lastMonth.label,
      `sigue pidiendo ${s!.due_period_label}, que es anterior a su vigencia`);
    assert(s!.due_period_label === null, `pide ${s!.due_period_label} y no debía pedir nada`);
    assert(s!.measurement_pending === false, "lo marca como pendiente sin periodo exigible");
  });

  await check("T2. y SÍ reconoce el periodo en curso como suyo", async () => {
    const s = await statusOf(owner.client, startsNow);
    assert(s!.current_period_label === thisMonth.label,
      `periodo en curso ${s!.current_period_label}, se esperaba ${thisMonth.label}`);
    assert(s!.next_measurement_due_on === thisMonth.end, "la próxima medición no cae al cierre del periodo");
  });

  await check("T3. la vista y el motor dicen LO MISMO sobre el mes anterior", async () => {
    // Este es el defecto entero en una comprobación: antes la vista pedía un
    // periodo que el motor rechazaba dos clics después.
    const { error } = await owner.client.rpc("quality_record_measurement", {
      p_indicator_id: startsNow, p_period_start: lastMonth.start, p_period_end: lastMonth.end,
      p_value: 95, p_data_state: "reported", p_components: null, p_note: null,
    });
    assert(error !== null, "el motor aceptó un periodo anterior a la vigencia");
    const s = await statusOf(owner.client, startsNow);
    assert(s!.due_period_label === null, "y la vista seguía pidiéndolo");
  });

  await check("T4. vigencia a MITAD de periodo: el periodo sí es suyo, el anterior no", async () => {
    const mid = `${thisMonth.start.slice(0, 8)}15`;
    const midStart = await makeIndicator(owner.client, A, `T-MID-${stamp}`, "Desde mitad de mes", mid);
    const s = await statusOf(owner.client, midStart);
    assert(s!.due_period_label === null, `pide ${s!.due_period_label}`);
    assert(s!.current_period_label === thisMonth.label,
      "el periodo en curso debía seguir siendo suyo: la configuración SOLAPA el periodo");
    // Y se puede medir, que es la otra mitad de la afirmación.
    const { error } = await owner.client.rpc("quality_record_measurement", {
      p_indicator_id: midStart, p_period_start: thisMonth.start, p_period_end: thisMonth.end,
      p_value: 92, p_data_state: "reported", p_components: null, p_note: null,
    });
    assert(!error, `no dejó medir el periodo en curso: ${error?.message}`);
  });

  await check("T5. trimestral que empieza en el trimestre en curso no retrocede", async () => {
    const q = currentPeriod("quarterly");
    const id = await makeIndicator(owner.client, A, `T-Q-${stamp}`, "Trimestral", q.start, "quarterly");
    const s = await statusOf(owner.client, id);
    assert(s!.due_period_label === null, `pide ${s!.due_period_label}, un trimestre anterior a su vigencia`);
    assert(s!.current_period_label === q.label, `trimestre en curso ${s!.current_period_label}`);
  });

  await check("T6. anual que empieza este año no pide el año pasado", async () => {
    const y = currentPeriod("annual");
    const id = await makeIndicator(owner.client, A, `T-AN-${stamp}`, "Anual", y.start, "annual");
    const s = await statusOf(owner.client, id);
    assert(s!.due_period_label === null, `pide ${s!.due_period_label}`);
    assert(s!.current_period_label === y.label, `año en curso ${s!.current_period_label}`);
  });

  await check("T7. un indicador ANTIGUO sí conserva su periodo pendiente", async () => {
    // La corrección no puede haber apagado la función: lo que existía debe
    // seguir existiendo, o habríamos cambiado un defecto por otro.
    const old = await makeIndicator(owner.client, A, `T-OLD-${stamp}`, "Vigente hace tiempo", "2020-01-01");
    const s = await statusOf(owner.client, old);
    assert(s!.due_period_label === lastMonth.label,
      `debía pedir ${lastMonth.label} y pide ${s!.due_period_label}`);
    assert(s!.measurement_pending === true, "no lo marca pendiente");
  });

  await check("T8. el barrido NO crea tarea para un periodo anterior a la vigencia", async () => {
    const { error } = await owner.client.rpc("quality_scan_pending_measurements", { p_organization_id: A });
    assert(!error, `barrido: ${error?.message}`);
    const { data: tasks } = await owner.client.from("work_tasks")
      .select("subject_id, description").eq("organization_id", A)
      .eq("task_type", "indicator_measurement_due").eq("subject_id", startsNow);
    assert((tasks ?? []).length === 0,
      `creó ${tasks!.length} tarea(s) para un indicador sin periodo exigible`);
    const { data: alerts } = await owner.client.from("work_alerts")
      .select("id").eq("organization_id", A)
      .eq("alert_type", "indicator_measurement_due").eq("subject_id", startsNow);
    assert((alerts ?? []).length === 0, "creó alerta para un periodo no exigible");
    const { data: events } = await owner.client.from("work_events")
      .select("id").eq("organization_id", A)
      .eq("event_type", "indicator.measurement_due").eq("subject_id", startsNow);
    assert((events ?? []).length === 0, "dejó un hecho en la bitácora por un periodo no exigible");
  });

  await check("T9. repetir el barrido sigue siendo idempotente", async () => {
    const { data: before } = await owner.client.from("work_tasks")
      .select("id", { count: "exact" }).eq("organization_id", A);
    await owner.client.rpc("quality_scan_pending_measurements", { p_organization_id: A });
    const { data: after } = await owner.client.from("work_tasks")
      .select("id", { count: "exact" }).eq("organization_id", A);
    assert((after ?? []).length === (before ?? []).length,
      `el segundo barrido añadió ${(after ?? []).length - (before ?? []).length} tareas`);
  });

  await check("T10. cero sigue siendo un dato, y la ausencia sigue siendo sin dato", async () => {
    const id = await makeIndicator(owner.client, A, `T-ZERO-${stamp}`, "Cero real", "2020-01-01");
    const p = periodOf("monthly", `${new Date().getUTCFullYear()}-01-15`);
    const { error } = await owner.client.rpc("quality_record_measurement", {
      p_indicator_id: id, p_period_start: p.start, p_period_end: p.end,
      p_value: 0, p_data_state: "reported", p_components: null, p_note: null,
    });
    assert(!error, `medir 0: ${error?.message}`);
    const { data } = await owner.client.from("quality_measurements")
      .select("value, data_state, evaluation").eq("indicator_id", id).eq("period_start", p.start).maybeSingle();
    assert(data!.value === 0, `el cero se guardó como ${data!.value}`);
    assert(data!.data_state === "reported", "un cero no puede quedar como «sin dato»");
    assert(data!.evaluation === "not_met", "un cero contra meta 90 debía evaluarse, no ignorarse");
  });

  await check("T11. cambiar la meta sigue sin reescribir el pasado", async () => {
    const id = await makeIndicator(owner.client, A, `T-HIST-${stamp}`, "Histórico intacto", "2020-01-01");
    const p = periodOf("monthly", `${new Date().getUTCFullYear()}-02-15`);
    await owner.client.rpc("quality_record_measurement", {
      p_indicator_id: id, p_period_start: p.start, p_period_end: p.end,
      p_value: 92, p_data_state: "reported", p_components: null, p_note: null,
    });
    const { data: before } = await owner.client.from("quality_measurements")
      .select("evaluation").eq("indicator_id", id).eq("period_start", p.start).maybeSingle();
    assert(before!.evaluation === "complies", `92 contra meta 90 debía cumplir, dio ${before!.evaluation}`);

    const nextYear = `${new Date().getUTCFullYear() + 1}-01-01`;
    const { error } = await owner.client.rpc("quality_publish_indicator_config", {
      p_indicator_id: id, p_effective_from: nextYear,
      p_unit_code: "percent", p_direction: "higher_is_better", p_frequency: "monthly",
      p_target_value: 95, p_target_min: null, p_target_max: null,
      p_warning_value: null, p_warning_min: null, p_warning_max: null,
      p_source_kind: "manual", p_source_key: null, p_calc_definition: null,
      p_formula_text: null, p_unit_label: null, p_source_note: null,
      p_consolidation: "none", p_comparability_break: false,
      p_comparability_note: null, p_change_note: "meta más exigente",
    });
    assert(!error, `publicar meta nueva: ${error?.message}`);
    const { data: after } = await owner.client.from("quality_measurements")
      .select("evaluation").eq("indicator_id", id).eq("period_start", p.start).maybeSingle();
    assert(after!.evaluation === "complies", "la evaluación histórica cambió al cambiar la meta");
  });

  await check("T12. una empresa ajena no ve el estado de un indicador de otra", async () => {
    const s = await statusOf(outsider.client, startsNow);
    assert(s === null, "la vista filtró datos a una empresa ajena");
  });

  // -------------------------------------------------------------------------
  console.log("\nL · Ciclo de vida: qué se elimina y qué ya no");
  // -------------------------------------------------------------------------

  await check("L1. un cargo sin nada asociado puede eliminarse", async () => {
    const { data } = await owner.client.from("quality_positions")
      .insert({ organization_id: A, name: `Cargo libre ${stamp}`, code: `CL${stamp.slice(-4)}` })
      .select("id").single();
    const e = await eligibility(owner.client, "position", data!.id as string);
    assert(e.can_hard_delete === true, `dictamen: ${e.reason}`);
    const { error } = await owner.client.from("quality_positions").delete().eq("id", data!.id as string);
    assert(!error, `no dejó borrarlo: ${error?.message}`);
  });

  await check("L2. un cargo EN USO no se elimina, y el motivo dice cuántos", async () => {
    const { data: pos } = await owner.client.from("quality_positions")
      .insert({ organization_id: A, name: `Cargo con proceso ${stamp}`, code: `CP${stamp.slice(-4)}` })
      .select("id").single();
    await owner.client.from("quality_processes").insert({
      organization_id: A, name: `Proceso de cargo ${stamp}`, category_code: "core",
      owner_position_id: pos!.id,
    });
    const e = await eligibility(owner.client, "position", pos!.id as string);
    assert(e.can_hard_delete === false, "dejó borrar un cargo en uso");
    const blocking = (e.blocking ?? []) as { label: string; count: number }[];
    assert(blocking.some((b) => b.label.includes("proceso") && b.count === 1),
      `no explica el proceso: ${JSON.stringify(blocking)}`);
    assert(e.alternative === "deactivate", "no ofrece desactivarlo");
    const { error } = await owner.client.from("quality_positions").delete().eq("id", pos!.id as string);
    assert(error !== null, "la base dejó borrarlo de todos modos");
  });

  await check("L3. un indicador sin resultados puede eliminarse", async () => {
    const id = await makeIndicator(owner.client, A, `L-FREE-${stamp}`, "Sin resultados", "2020-01-01");
    const e = await eligibility(owner.client, "indicator", id);
    assert(e.can_hard_delete === true, `dictamen: ${e.reason}`);
    const { error } = await owner.client.from("quality_indicators").delete().eq("id", id);
    assert(!error, `no dejó borrarlo: ${error?.message}`);
    const { data } = await owner.client.from("quality_indicators").select("id").eq("id", id).maybeSingle();
    assert(data === null, "sigue existiendo");
  });

  await check("L4. un indicador CON medición no se elimina — ni por un administrador", async () => {
    const id = await makeIndicator(owner.client, A, `L-HIST-${stamp}`, "Con histórico", "2020-01-01");
    const p = periodOf("monthly", `${new Date().getUTCFullYear()}-03-15`);
    await owner.client.rpc("quality_record_measurement", {
      p_indicator_id: id, p_period_start: p.start, p_period_end: p.end,
      p_value: 91, p_data_state: "reported", p_components: null, p_note: null,
    });
    const e = await eligibility(owner.client, "indicator", id);
    assert(e.can_hard_delete === false, "dejó borrar un indicador con histórico");
    const blocking = (e.blocking ?? []) as { label: string; count: number }[];
    assert(blocking.some((b) => b.label.includes("medici")), `no menciona la medición: ${JSON.stringify(blocking)}`);
    assert(e.alternative === "retire", "no ofrece retirarlo");

    // Y el intento REAL falla. Quien lo intenta es el creador de la empresa,
    // que es su administrador: administrar no es poder destruir la historia.
    const { error } = await owner.client.from("quality_indicators").delete().eq("id", id);
    assert(error !== null, "la base permitió el borrado en cascada del histórico");
    const { data: m } = await owner.client.from("quality_measurements").select("id").eq("indicator_id", id);
    assert((m ?? []).length === 1, "la medición desapareció");
  });

  await check("L5. retirarlo SÍ se puede, y conserva el histórico completo", async () => {
    const { data: ind } = await owner.client.from("quality_indicators")
      .select("id").eq("code", `L-HIST-${stamp}`).maybeSingle();
    const { error } = await owner.client.from("quality_indicators")
      .update({ admin_state: "retired", retired_at: new Date().toISOString(), retirement_reason: "prueba" })
      .eq("id", ind!.id as string);
    assert(!error, `retirar: ${error?.message}`);
    const { data: m } = await owner.client.from("quality_measurements").select("id").eq("indicator_id", ind!.id as string);
    assert((m ?? []).length === 1, "retirar perdió la medición");
  });

  await check("L6. una medición no se borra a mano por PostgREST", async () => {
    const { data: m } = await owner.client.from("quality_measurements")
      .select("id, indicator_id").limit(1).maybeSingle();
    const { error } = await owner.client.from("quality_measurements").delete().eq("id", m!.id as string);
    assert(error !== null, "se borró una medición desde el cliente");
  });

  await check("L7. un objetivo en borrador y sin resultados puede eliminarse", async () => {
    const { data } = await owner.client.from("quality_objectives")
      .insert({
        organization_id: A, code: `OBJ-F-${stamp.slice(-6)}`, name: `Objetivo libre ${stamp}`,
        admin_state: "draft", period_start: "2026-01-01", period_end: "2026-12-31",
      })
      .select("id").single();
    const e = await eligibility(owner.client, "objective", data!.id as string);
    assert(e.can_hard_delete === true, `dictamen: ${e.reason}`);
    const { error } = await owner.client.from("quality_objectives").delete().eq("id", data!.id as string);
    assert(!error, `no dejó borrarlo: ${error?.message}`);
  });

  await check("L8. un objetivo ya ACTIVO no se elimina", async () => {
    const { data } = await owner.client.from("quality_objectives")
      .insert({
        organization_id: A, code: `OBJ-A-${stamp.slice(-6)}`, name: `Objetivo activo ${stamp}`,
        admin_state: "active", period_start: "2026-01-01", period_end: "2026-12-31",
      })
      .select("id").single();
    const e = await eligibility(owner.client, "objective", data!.id as string);
    assert(e.can_hard_delete === false, "dejó borrar un objetivo activo");
    const { error } = await owner.client.from("quality_objectives").delete().eq("id", data!.id as string);
    assert(error !== null, "la base lo borró igualmente");
  });

  await check("L9. un documento en borrador puede eliminarse", async () => {
    const { data } = await owner.client.from("trazadoc_documents").insert({
      organization_id: A, source_type: "custom", module_key: "quality",
      category_code: "procedure", title: `Borrador libre ${stamp}`,
      code: `PR-QA-${stamp.slice(-4)}`, revision_model: "controlled",
    }).select("id").single();
    const e = await eligibility(owner.client, "document", data!.id as string);
    assert(e.can_hard_delete === true, `dictamen: ${e.reason}`);
    const { error } = await owner.client.rpc("trazadoc_delete_document_safely", { p_document_id: data!.id });
    assert(!error, `no dejó borrarlo: ${error?.message}`);
  });

  await check("L10. D-04 · el código del borrador eliminado NO se recicla", async () => {
    const code = `PR-QA-${stamp.slice(-4)}`;
    const { error } = await owner.client.from("trazadoc_documents").insert({
      organization_id: A, source_type: "custom", module_key: "quality",
      category_code: "procedure", title: `Otro documento ${stamp}`,
      code, revision_model: "controlled",
    });
    assert(error !== null, "el código volvió a estar disponible tras eliminar el borrador");
    assert(/recicl/i.test(error!.message), `el motivo no lo explica: ${error!.message}`);
  });

  await check("L11. y tampoco lo comparten dos documentos vivos", async () => {
    const code = `PR-DUP-${stamp.slice(-4)}`;
    const { error: first } = await owner.client.from("trazadoc_documents").insert({
      organization_id: A, source_type: "custom", module_key: "quality",
      category_code: "procedure", title: `Doc uno ${stamp}`, code, revision_model: "controlled",
    });
    assert(!first, `el primero debía crearse: ${first?.message}`);
    const { error: second } = await owner.client.from("trazadoc_documents").insert({
      organization_id: A, source_type: "custom", module_key: "quality",
      category_code: "procedure", title: `Doc dos ${stamp}`, code, revision_model: "controlled",
    });
    assert(second !== null, "dos documentos vivos compartieron código");
  });

  await check("L12. la reserva de código es POR EMPRESA, no global", async () => {
    // Que PR-QA-007 esté ocupado en una empresa no puede impedir que otra lo use.
    const code = `PR-DUP-${stamp.slice(-4)}`;
    const { error } = await outsider.client.from("trazadoc_documents").insert({
      organization_id: B, source_type: "custom", module_key: "quality",
      category_code: "procedure", title: `Doc de otra empresa ${stamp}`, code, revision_model: "controlled",
    });
    assert(!error, `una empresa ajena no pudo usar su propio código: ${error?.message}`);
  });

  await check("L13. una decisión de workflow no se borra (D-20)", async () => {
    const { data: d } = await owner.client.from("trazadoc_document_decisions").select("id").limit(1).maybeSingle();
    if (!d) return; // sin decisiones en esta base, nada que comprobar
    const { error } = await owner.client.from("trazadoc_document_decisions").delete().eq("id", d.id as string);
    assert(error !== null, "se borró una decisión formal");
  });

  await check("L14. un cierre de periodo no se borra", async () => {
    const { error } = await owner.client.from("quality_period_closures").delete().eq("organization_id", A);
    assert(error !== null, "se pudo borrar un cierre de periodo");
  });

  await check("L15. una empresa ajena no averigua NADA sobre lo de otra", async () => {
    const { data: ind } = await owner.client.from("quality_indicators")
      .select("id").eq("code", `L-HIST-${stamp}`).maybeSingle();
    const e = await eligibility(outsider.client, "indicator", ind!.id as string);
    assert(e.can_hard_delete === false, "le dijo que podía borrarlo");
    assert(e.reason_code === "not_found", `filtró el motivo real: ${e.reason_code}`);
    assert(((e.blocking ?? []) as unknown[]).length === 0,
      "filtró los contadores de otra empresa, que ya son información");
  });

  await check("L16. una empresa ajena no puede eliminar lo de otra", async () => {
    const { data: pos } = await owner.client.from("quality_positions")
      .insert({ organization_id: A, name: `Cargo ajeno ${stamp}`, code: `CA${stamp.slice(-4)}` })
      .select("id").single();
    const { data, error } = await outsider.client.from("quality_positions")
      .delete().eq("id", pos!.id as string).select("id");
    assert(error !== null || (data ?? []).length === 0, "borró un cargo de otra empresa");
    const { data: still } = await owner.client.from("quality_positions").select("id").eq("id", pos!.id as string).maybeSingle();
    assert(still !== null, "el cargo desapareció");
  });

  await check("L17. el servidor vuelve a comprobar en el INSTANTE del borrado", async () => {
    // Se emite el dictamen —dice que sí—, después ocurre algo, y el borrado
    // debe fallar igualmente. Es la ventana que un modal abierto deja abierta.
    const id = await makeIndicator(owner.client, A, `L-RACE-${stamp}`, "Carrera", "2020-01-01");
    const before = await eligibility(owner.client, "indicator", id);
    assert(before.can_hard_delete === true, "el dictamen inicial debía permitirlo");

    const p = periodOf("monthly", `${new Date().getUTCFullYear()}-04-15`);
    await owner.client.rpc("quality_record_measurement", {
      p_indicator_id: id, p_period_start: p.start, p_period_end: p.end,
      p_value: 88, p_data_state: "reported", p_components: null, p_note: null,
    });

    const { error } = await owner.client.from("quality_indicators").delete().eq("id", id);
    assert(error !== null, "el borrado se ejecutó con un dictamen ya caducado");
  });

  await check("L18. retirar conserva el histórico y sigue siendo consultable", async () => {
    const { data: ind } = await owner.client.from("quality_indicators")
      .select("id, admin_state, retired_at").eq("code", `L-HIST-${stamp}`).maybeSingle();
    assert(ind!.admin_state === "retired", "el indicador no quedó retirado");
    const { data: rows } = await owner.client.from("v_quality_indicator_status")
      .select("indicator_id, measurement_count").eq("indicator_id", ind!.id as string).maybeSingle();
    assert(rows !== null, "un indicador retirado dejó de ser consultable");
    assert((rows!.measurement_count as number) >= 1, "perdió su histórico");
  });

  console.log(`\nQUALITY-03.1 · base real: ${passed} correctas, ${failed} fallidas\n`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
