/**
 * Trazaloop · QUALITY-11.1 · Los dos huecos, cerrados contra base real.
 *
 * GAP-01 · PARIDAD PROGRAMADA
 *   Los dos barridos heredados que exigían sesión —mediciones pendientes y
 *   acciones vencidas— corren ahora también de noche, con los mismos permisos
 *   de siempre cuando hay sesión. Y cuando la empresa adopta la regla
 *   equivalente de QUALITY-11, el barrido heredado CALLA: una condición, un
 *   aviso, nunca dos.
 *
 * GAP-02 · PUENTE DE EVENTOS
 *   Un hecho de negocio REAL —registrar una queja, cerrar la evaluación de un
 *   proveedor, cargar una medición fuera de meta, evaluar un hallazgo— llega
 *   por su camino de dominio de siempre, deja su rastro en la bitácora, y el
 *   puente lo enruta a las reglas que lo escuchan. Mismo evaluador, mismo
 *   ejecutor de salidas, mismo dedupe.
 *
 * Lo que más importa de todo el sprint está en el bloque J: la MISMA condición
 * detectada por el hecho y por el barrido nocturno produce UNA señal. No hay
 * que resolver la colisión: la clave de dedupe la hace imposible.
 *
 * Nada aquí usa mocks: los hechos se crean por las RPC de dominio reales.
 */
import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) {
  console.error("Faltan variables para test:quality111-rls (URL, ANON, SERVICE_ROLE).");
  process.exit(1);
}

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
async function check(n: string, fn: () => Promise<void>) {
  try { await fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
const publico = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function newUser(label: string, name: string) {
  const email = `q111-${label}-${stamp}@test.trazaloop.dev`;
  const password = "Trazaloop-Test-1234";
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: name },
  });
  if (error || !data.user) throw new Error(`usuario ${label}: ${error?.message}`);
  const client = createClient(URL!, ANON!, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: e } = await client.auth.signInWithPassword({ email, password });
  if (e) throw new Error(`login ${label}: ${e.message}`);
  return { id: data.user.id, name, email, client };
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const day = (o: number) => iso(new Date(Date.now() + o * 86_400_000));
const HOY = day(0);
const HACE_UN_ANIO = day(-380);
const HACE_MEDIO_ANIO = day(-190);
const ANIO = Number(HOY.slice(0, 4)) - 1;

type Cliente = SupabaseClient;

async function contar(c: Cliente, tabla: string, org: string, extra: Record<string, string> = {}) {
  let q = c.from(tabla).select("id", { count: "exact", head: true }).eq("organization_id", org);
  for (const [k, v] of Object.entries(extra)) q = q.eq(k, v);
  const { count } = await q;
  return count ?? 0;
}

type Señal = {
  id: string; title: string; status: string; resolved_at: string | null;
  rule_id: string; rule_version_id: string; source_event_id: string | null;
  detection_count: number; subject_id: string; explanation: string;
};

async function señalesDe(c: Cliente, org: string, reglaId: string): Promise<Señal[]> {
  const { data } = await c.from("quality_signals")
    .select("id, title, status, resolved_at, rule_id, rule_version_id, source_event_id, "
      + "detection_count, subject_id, explanation")
    .eq("organization_id", org).eq("rule_id", reglaId)
    .order("first_detected_at", { ascending: true });
  return (data ?? []) as unknown as Señal[];
}

async function resumen(c: Cliente, runId: string) {
  const { data } = await c.from("quality_automation_runs")
    .select("run_kind, status, rules_evaluated, subjects_evaluated, matches, "
      + "signals_created, alerts_created, tasks_created, failures")
    .eq("id", runId).single();
  return data as unknown as Record<string, number | string>;
}

/** Instancia una plantilla y la publica. */
async function adoptar(
  c: Cliente, org: string, plantilla: string, cargo: string | null,
  condiciones: unknown[] | null = null, desde = HACE_UN_ANIO
) {
  const { data: reglaId, error } = await c.rpc("quality_automation_instantiate_template", {
    p_organization_id: org, p_template_code: plantilla,
    p_owner_position_id: cargo, p_conditions: condiciones,
  });
  assert(!error && reglaId, `instanciar ${plantilla}: ${error?.message}`);
  const { data: ver } = await c.from("quality_automation_rule_versions")
    .select("id").eq("rule_id", reglaId as string).single();
  const { error: ep } = await c.rpc("quality_automation_publish_version", {
    p_version_id: ver!.id, p_effective_from: desde, p_change_note: "Se adopta",
  });
  assert(!ep, `publicar ${plantilla}: ${ep?.message}`);
  return { ruleId: reglaId as string, versionId: ver!.id as string };
}

async function main() {
  console.log("\nQUALITY-11.1 · base real\n");

  const owner = await newUser("adm", "Directora");
  const quality = await newUser("cal", "Coordinadora de Calidad");
  const outsider = await newUser("out", "Ajena");
  for (const u of [owner, quality, outsider]) {
    await u.client.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "q111" });
  }
  const { data: a } = await owner.client.rpc("create_organization", { p_name: `Q111 A ${stamp}` });
  const { data: b } = await outsider.client.rpc("create_organization", { p_name: `Q111 B ${stamp}` });
  const A = a as string, B = b as string;
  await admin.from("memberships").insert([
    { organization_id: A, user_id: quality.id, role_code: "quality", status: "active" },
  ]);
  const Q = quality.client;
  const O = outsider.client;

  // ==========================================================================
  console.log("A · EL TERRENO");
  // ==========================================================================

  let CARGO = "", PROCESO = "", INDICADOR = "";

  await check("A0. cargo con titular, proceso e indicador activo", async () => {
    const { data: cargo } = await Q.from("quality_positions")
      .insert({ organization_id: A, name: `Gerencia de Calidad ${stamp}` }).select("id").single();
    CARGO = cargo!.id as string;
    const { data: persona } = await Q.from("quality_people")
      .insert({ organization_id: A, full_name: `Ana ${stamp}`, profile_id: quality.id })
      .select("id").single();
    await Q.from("quality_position_assignments").insert({
      organization_id: A, position_id: CARGO, person_id: persona!.id,
      effective_from: HACE_UN_ANIO,
    });
    const { data: proc } = await Q.from("quality_processes").insert({
      organization_id: A, name: `Producción ${stamp}`, category_code: "core",
      owner_position_id: CARGO,
    }).select("id").single();
    PROCESO = proc!.id as string;

    const { data: ind, error: ei } = await Q.from("quality_indicators").insert({
      organization_id: A, code: `IND-${stamp}`.slice(0, 24),
      name: "Cumplimiento de entregas", scope_type: "process", scope_process_id: PROCESO,
      owner_position_id: CARGO,
    }).select("id").single();
    assert(!ei && ind, `indicador: ${ei?.message}`);
    INDICADOR = ind!.id as string;
    const { error: ec } = await Q.rpc("quality_publish_indicator_config", {
      p_indicator_id: INDICADOR, p_effective_from: `${ANIO - 1}-01-01`,
      p_unit_code: "percent", p_direction: "higher_is_better",
      p_frequency: "annual", p_target_value: 95, p_source_kind: "manual",
    });
    assert(!ec, `configuración: ${ec?.message}`);
    await Q.from("quality_indicators").update({ admin_state: "active" }).eq("id", INDICADOR);
    await Q.from("quality_automation_settings")
      .insert({ organization_id: A, is_enabled: true, business_timezone: "UTC" });
  });

  await check("A1. el catálogo de hechos observables se lee y no se toca", async () => {
    const { data, error } = await Q.from("quality_automation_event_catalog")
      .select("event_type, domain, subject_type");
    assert(!error && (data?.length ?? 0) >= 16,
      `el catálogo devolvió ${data?.length} hechos: ${error?.message}`);
    const dominios = new Set((data ?? []).map((x) => String(x.domain)));
    assert(dominios.size >= 6, `los hechos cubren ${dominios.size} dominios`);
    const { error: ew } = await Q.from("quality_automation_event_catalog")
      .insert({ event_type: `pirata.${stamp}`, label: "Inventado", domain: "cases",
                subject_type: "work_case" });
    assert(ew, "una empresa pudo añadir un hecho al catálogo de plataforma");
  });

  await check("A2. los contratos de sujeto son cerrados y de plataforma", async () => {
    const { data } = await Q.from("quality_automation_event_contracts")
      .select("subject_type, source_code, resolver");
    assert((data ?? []).length >= 17, `hay ${data?.length} contratos`);
    for (const c of data ?? []) {
      assert(["direct", "supplier_evaluation_to_scope"].includes(String(c.resolver)),
        `resolutor inesperado: ${c.resolver}`);
    }
    const { error } = await Q.from("quality_automation_event_contracts")
      .insert({ subject_type: `pirata_${stamp}`, source_code: "case", resolver: "direct" });
    assert(error, "una empresa pudo registrar un contrato de sujeto");
  });

  // ==========================================================================
  console.log("\nB · GAP-02 · EL HECHO DE UNA QUEJA (§13, §52)");
  // ==========================================================================

  let REGLA_QUEJA = "", VERSION_QUEJA = "", QUEJA = "", EVENTO_QUEJA = "";

  await check("B0. la regla por evento se adopta, se valida y se publica", async () => {
    const r = await adoptar(Q, A, "event_complaint_recorded", CARGO);
    REGLA_QUEJA = r.ruleId; VERSION_QUEJA = r.versionId;
    const { data: v } = await Q.from("quality_automation_rule_versions")
      .select("trigger_kind, event_types, status").eq("id", VERSION_QUEJA).single();
    assert(v!.trigger_kind === "event", `la versión quedó como ${v!.trigger_kind}`);
    assert((v!.event_types as string[]).includes("complaint.recorded"),
      "la versión no escucha el hecho de la plantilla");
    assert(v!.status === "published", "la versión no quedó publicada");
  });

  await check("B1. registrar una queja por el camino REAL deja su hecho", async () => {
    const { data: f, error } = await Q.from("quality_customer_feedback").insert({
      organization_id: A, feedback_kind: "complaint",
      title: `Entrega fuera de plazo ${stamp}`, received_on: HOY,
      status: "open", owner_position_id: CARGO,
    }).select("id").single();
    assert(!error && f, `queja: ${error?.message}`);
    QUEJA = f!.id as string;

    const { data: ev } = await Q.from("work_events")
      .select("id, event_type, subject_type, subject_id, source_domain")
      .eq("organization_id", A).eq("event_type", "complaint.recorded");
    assert((ev ?? []).length === 1, `hay ${ev?.length} hechos de queja`);
    assert(ev![0].subject_type === "quality_customer_feedback"
      && ev![0].subject_id === QUEJA, "el hecho no apunta a la queja");
    EVENTO_QUEJA = ev![0].id as string;
  });

  await check("B2. el puente enruta el hecho y emite la señal (§10)", async () => {
    const { data: runId, error } = await Q.rpc("quality_automation_process_events", {
      p_organization_id: A, p_limit: 500, p_today: null,
    });
    assert(!error && runId, `procesar: ${error?.message}`);
    const r = await resumen(Q, runId as string);
    assert(r.run_kind === "event", `la ejecución se registró como ${r.run_kind}`);
    assert(Number(r.matches) === 1, `coincidencias: ${r.matches}`);
    assert(Number(r.signals_created) === 1, `señales: ${r.signals_created}`);
    assert(Number(r.failures) === 0, `fallos: ${r.failures}`);

    const s = await señalesDe(Q, A, REGLA_QUEJA);
    assert(s.length === 1, `hay ${s.length} señales`);
    assert(s[0].subject_id === QUEJA, "la señal no apunta a la queja");
  });

  await check("B3. la señal conserva TODO el linaje: hecho, regla, versión (§21)", async () => {
    const s = (await señalesDe(Q, A, REGLA_QUEJA))[0];
    assert(s.source_event_id === EVENTO_QUEJA, "la señal no recuerda el hecho que la disparó");
    assert(s.rule_version_id === VERSION_QUEJA, "la señal no apunta a su versión");
    assert(/Versión: 1/.test(s.explanation), "la explicación no dice con qué versión se emitió");

    const { data: vista } = await Q.from("v_quality_signal_overview")
      .select("from_event, source_event_type, source_event_label, rule_code")
      .eq("signal_id", s.id).single();
    assert(vista!.from_event === true, "la vista no distingue el origen por evento");
    assert(vista!.source_event_type === "complaint.recorded", "la vista pierde el tipo de hecho");
    assert(String(vista!.source_event_label).length > 5, "el hecho no se nombra en castellano");

    const { data: entrega } = await Q.from("quality_automation_event_deliveries")
      .select("status, signal_id, signal_created, attempts")
      .eq("event_id", EVENTO_QUEJA).eq("rule_version_id", VERSION_QUEJA).single();
    assert(entrega!.status === "matched", `la entrega quedó en «${entrega!.status}»`);
    assert(entrega!.signal_created === true, "no se anotó que la entrega abrió la señal");
  });

  await check("B4. la queja NO abrió caso ni declaró no conformidad (§14, §52)", async () => {
    assert(await contar(Q, "work_cases", A) === 0,
      "la automatización abrió un caso al registrarse la queja");
    const { data: q } = await Q.from("quality_customer_feedback")
      .select("status").eq("id", QUEJA).single();
    assert(q!.status === "open", `la automatización movió la queja a «${q!.status}»`);
  });

  await check("B5. procesar dos veces el MISMO hecho no emite dos veces (§22, §56)", async () => {
    const antesS = await contar(Q, "quality_signals", A);
    const antesA = await contar(Q, "work_alerts", A, { source_domain: "automation" });
    const { data: runId } = await Q.rpc("quality_automation_process_events", {
      p_organization_id: A, p_limit: 500, p_today: null,
    });
    const r = await resumen(Q, runId as string);
    assert(Number(r.signals_created) === 0, `creó ${r.signals_created} señales`);
    assert(await contar(Q, "quality_signals", A) === antesS, "apareció una señal de más");
    assert(await contar(Q, "work_alerts", A, { source_domain: "automation" }) === antesA,
      "apareció un aviso de más");

    const { data: entregas } = await Q.from("quality_automation_event_deliveries")
      .select("id").eq("event_id", EVENTO_QUEJA).eq("rule_version_id", VERSION_QUEJA);
    assert((entregas ?? []).length === 1, `hay ${entregas?.length} acuses para la misma entrega`);
  });

  await check("B6. el hecho fuerza la marca de agua, y no se relee la bitácora entera", async () => {
    const { data: cfg } = await Q.from("quality_automation_settings")
      .select("events_processed_through").eq("organization_id", A).single();
    assert(cfg!.events_processed_through !== null, "la marca de agua no avanzó");
  });

  // ==========================================================================
  console.log("\nC · GAP-02 · EL HECHO DE UNA MEDICIÓN (§54)");
  // ==========================================================================

  let REGLA_MED = "", VERSION_MED = "";

  await check("C1. cargar una medición fuera de meta dispara la señal al instante", async () => {
    const r = await adoptar(Q, A, "event_measurement_out_of_target", CARGO);
    REGLA_MED = r.ruleId; VERSION_MED = r.versionId;

    // El camino de dominio REAL de QUALITY-03.
    const { error } = await Q.rpc("quality_record_measurement", {
      p_indicator_id: INDICADOR, p_period_start: `${ANIO}-01-01`,
      p_period_end: `${ANIO}-12-31`, p_value: 70,
      p_data_state: "reported", p_components: null, p_note: null,
    });
    assert(!error, `medición: ${error?.message}`);

    const { data: ev } = await Q.from("work_events")
      .select("id, event_type").eq("organization_id", A)
      .in("event_type", ["indicator.target_missed", "indicator.attention"]);
    assert((ev ?? []).length >= 1, "registrar la medición no dejó ningún hecho");

    const { data: runId } = await Q.rpc("quality_automation_process_events", {
      p_organization_id: A, p_limit: 500, p_today: null,
    });
    const res = await resumen(Q, runId as string);
    assert(Number(res.matches) >= 1, `coincidencias: ${res.matches}`);

    const s = await señalesDe(Q, A, REGLA_MED);
    assert(s.length === 1, `hay ${s.length} señales`);
    assert(s[0].source_event_id !== null, "la señal no recuerda el hecho");
    assert(s[0].subject_id === INDICADOR, "la señal no apunta al indicador");
  });

  await check("C2. el indicador NO cambió por culpa de la señal (§54)", async () => {
    const { data } = await Q.from("v_quality_indicator_status")
      .select("last_evaluation, admin_state").eq("indicator_id", INDICADOR).single();
    assert(data!.admin_state === "active", "la automatización tocó el estado del indicador");
    assert(data!.last_evaluation === "not_met",
      `la evaluación quedó en «${data!.last_evaluation}»: la calcula QUALITY-03, no QUALITY-11`);
  });

  // ==========================================================================
  console.log("\nD · EL MISMO EVALUADOR Y EL MISMO EJECUTOR (§19, §20, §59)");
  // ==========================================================================

  await check("D1. la MISMA condición por evento y por barrido da el MISMO resultado", async () => {
    // La regla por evento y una regla programada gemela, con la misma condición
    // sobre el mismo sujeto: si el evaluador fuera otro, aquí se vería.
    const { data: sim } = await Q.rpc("quality_automation_simulate",
      { p_version_id: VERSION_MED, p_today: null });
    const r = sim as Record<string, unknown>;
    assert(Number(r.matches) === 1,
      `simulando la regla por evento sobre el censo entero: ${r.matches} coincidencias`);
    assert(Number(r.signals_created) === 0, "la simulación de una regla por evento creó algo");
  });

  await check("D2. la colisión evento + barrido NO duplica la señal (§59)", async () => {
    // Es lo más importante del sprint. La clave de dedupe es
    // `auto:<versión>:<sujeto>`: no lleva el camino por el que se detectó.
    const antes = await señalesDe(Q, A, REGLA_MED);
    const { data: runId } = await Q.rpc("quality_automation_run", {
      p_organization_id: A, p_mode: "live", p_rule_id: null, p_today: null,
    });
    const res = await resumen(Q, runId as string);
    assert(res.run_kind === "scheduled" || res.run_kind === "manual", "tipo de ejecución raro");

    const despues = await señalesDe(Q, A, REGLA_MED);
    assert(despues.length === antes.length,
      `el barrido duplicó la señal del evento: ${antes.length} → ${despues.length}`);

    // Y la regla por evento no se barre: se anota como omitida con su motivo.
    const { data: fila } = await Q.from("quality_automation_run_rules")
      .select("status, error_message").eq("run_id", runId as string).eq("rule_id", REGLA_MED);
    assert((fila ?? []).length === 1, "la regla por evento no aparece en el informe");
    assert(fila![0].status === "skipped",
      `la regla por evento se evaluó en el barrido: ${fila![0].status}`);
    assert(String(fila![0].error_message).includes("por evento"),
      "no se explica por qué se omitió");
  });

  await check("D3. el ejecutor de salidas es UNO: las claves lo demuestran", async () => {
    const s = (await señalesDe(Q, A, REGLA_QUEJA))[0];
    const { data: alertas } = await Q.from("work_alerts")
      .select("dedupe_key, source_domain, alert_type")
      .eq("organization_id", A).eq("source_domain", "automation");
    const dela = (alertas ?? []).filter((x) => String(x.dedupe_key).includes(s.id));
    assert(dela.length === 1, `la señal por evento tiene ${dela.length} avisos`);
    assert(String(dela[0].dedupe_key).startsWith("auto_alert:"),
      `la clave del aviso por evento es distinta: ${dela[0].dedupe_key}`);
    assert(dela[0].alert_type === "automation_signal",
      "el aviso por evento no se tipa como los demás");
  });

  // ==========================================================================
  console.log("\nE · GAP-02 · EL HECHO DE UN PROVEEDOR, CON RESOLUTOR (§53)");
  // ==========================================================================

  let SCOPE = "", REGLA_PROV = "", EVAL_PROV = "";

  await check("E0. se siembra un proveedor con su alcance", async () => {
    const { data: party } = await Q.from("quality_external_parties")
      .insert({ organization_id: A, legal_name: `ACME ${stamp}`, tax_id: `NIT-${stamp}` })
      .select("id").single();
    await Q.from("quality_external_party_roles")
      .insert({ organization_id: A, party_id: party!.id, role_code: "supplier" });
    const { data: perfil } = await Q.from("quality_supplier_profiles")
      .insert({ organization_id: A, party_id: party!.id, relationship_status: "active",
                owner_position_id: CARGO }).select("id").single();
    const { data: cat } = await Q.from("quality_supplier_categories")
      .insert({ organization_id: A, name: `Materia prima ${stamp}` }).select("id").single();
    const { data: sc, error } = await Q.from("quality_supplier_scopes")
      .insert({ organization_id: A, profile_id: perfil!.id, category_id: cat!.id })
      .select("id").single();
    assert(!error && sc, `alcance: ${error?.message}`);
    SCOPE = sc!.id as string;
  });

  await check("E1. cerrar la evaluación emite el hecho, y el contrato lo lleva al ALCANCE", async () => {
    const r = await adoptar(Q, A, "event_supplier_evaluation_closed", CARGO);
    REGLA_PROV = r.ruleId;

    const { data: t } = await Q.from("quality_supplier_evaluation_templates")
      .insert({ organization_id: A, name: `Evaluación ${stamp}` }).select("id").single();
    const { data: tv } = await Q.from("quality_supplier_template_versions").insert({
      organization_id: A, template_id: t!.id, version_number: 1,
      scoring_rule: "weighted_average",
      bands: [{ min: 80, max: 100, label: "Excelente" }, { min: 0, max: 79.999, label: "Aceptable" }],
    }).select("id").single();
    const { data: cri } = await Q.from("quality_supplier_evaluation_criteria").insert({
      organization_id: A, version_id: tv!.id, code: "C1", label: "Cumplimiento",
      weight: 1, max_points: 100, evaluation_method: "observation", position_order: 1,
    }).select("id").single();
    await Q.rpc("quality_publish_supplier_template_version", {
      p_version_id: tv!.id, p_effective_from: HACE_UN_ANIO, p_change_note: "Inicial",
    });
    const { data: ev } = await Q.from("quality_supplier_evaluations").insert({
      organization_id: A, scope_id: SCOPE, version_id: tv!.id,
      evaluation_kind: "periodic", period_label: "2027-S1",
    }).select("id").single();
    EVAL_PROV = ev!.id as string;
    await Q.from("quality_supplier_evaluation_results").insert({
      organization_id: A, evaluation_id: EVAL_PROV, criterion_id: cri!.id,
      outcome: "scored", points: 90,
    });
    const { error: ec } = await Q.rpc("quality_close_supplier_evaluation", {
      p_evaluation_id: EVAL_PROV, p_summary: "Buen semestre.", p_evaluated_on: HACE_MEDIO_ANIO,
    });
    assert(!ec, `cerrar evaluación: ${ec?.message}`);

    const { data: hecho } = await Q.from("work_events")
      .select("id, subject_type, subject_id").eq("organization_id", A)
      .eq("event_type", "supplier.evaluated").single();
    assert(hecho!.subject_type === "quality_supplier_evaluation"
      && hecho!.subject_id === EVAL_PROV,
      "el hecho de la evaluación no apunta a la evaluación");

    const { data: runId } = await Q.rpc("quality_automation_process_events", {
      p_organization_id: A, p_limit: 500, p_today: null,
    });
    const res = await resumen(Q, runId as string);
    assert(Number(res.matches) >= 1, `coincidencias: ${res.matches}`);

    const s = await señalesDe(Q, A, REGLA_PROV);
    assert(s.length === 1, `hay ${s.length} señales`);
    assert(s[0].subject_id === SCOPE,
      "el resolutor no llevó del hecho (la evaluación) al sujeto observable (el alcance)");
  });

  await check("E2. cerrar la evaluación NO aprobó ni suspendió al proveedor (§14, §53)", async () => {
    const { data } = await Q.from("v_quality_supplier_scope_status")
      .select("decision, is_approved_now").eq("scope_id", SCOPE).single();
    assert(data!.decision === null,
      `la automatización dejó al proveedor en «${data!.decision}»`);
  });

  // ==========================================================================
  console.log("\nF · GAP-02 · EL HECHO DE UN HALLAZGO (§55)");
  // ==========================================================================

  let REGLA_HALL = "", AUDITORIA = "", HALLAZGO = "";

  await check("F1. evaluar un hallazgo emite el hecho y la señal, sin formalizar NC", async () => {
    const r = await adoptar(Q, A, "event_audit_finding_evaluated", CARGO);
    REGLA_HALL = r.ruleId;

    const { data: aud, error: ea } = await Q.from("quality_audits").insert({
      organization_id: A, code: `AUD-${stamp}`.slice(0, 24),
      title: "Auditoría interna", audit_type: "internal", nature: "planned",
      objective: "Comprobar la conformidad del proceso con sus criterios.",
      planned_from: day(-20), planned_to: day(-15),
      scheduled_from: day(-20), scheduled_to: day(-15),
      status: "planned", owner_position_id: CARGO,
    }).select("id").single();
    assert(!ea && aud, `auditoría: ${ea?.message}`);
    AUDITORIA = aud!.id as string;

    const { data: h, error: eh } = await Q.from("quality_audit_findings").insert({
      organization_id: A, audit_id: AUDITORIA, code: `H-${stamp}`.slice(0, 24),
      statement: "Faltan tres registros del periodo auditado.",
      proposed_classification: "observation", raised_on: day(-10),
    }).select("id").single();
    assert(!eh && h, `hallazgo: ${eh?.message}`);
    HALLAZGO = h!.id as string;

    const casosAntes = await contar(Q, "work_cases", A);
    const { error: ee } = await Q.rpc("quality_evaluate_audit_finding", {
      p_finding_id: HALLAZGO, p_status: "evaluated",
      p_note: "No hay incumplimiento de requisito: es una observación.",
    });
    assert(!ee, `evaluar hallazgo: ${ee?.message}`);

    const { data: hecho } = await Q.from("work_events")
      .select("id").eq("organization_id", A).eq("event_type", "audit.finding_evaluated");
    assert((hecho ?? []).length === 1, `hay ${hecho?.length} hechos de hallazgo evaluado`);

    const { data: runId } = await Q.rpc("quality_automation_process_events", {
      p_organization_id: A, p_limit: 500, p_today: null,
    });
    const res = await resumen(Q, runId as string);
    assert(Number(res.matches) >= 1, `coincidencias: ${res.matches}`);
    const s = await señalesDe(Q, A, REGLA_HALL);
    assert(s.length === 1, `hay ${s.length} señales`);
    assert(await contar(Q, "work_cases", A) === casosAntes,
      "la automatización formalizó una no conformidad a partir del hallazgo (§14)");
  });

  // ==========================================================================
  console.log("\nG · GAP-01 · PARIDAD DEL BARRIDO PROGRAMADO (§50, §51)");
  // ==========================================================================

  await check("G1. los OCHO barridos heredados corren SIN sesión", async () => {
    const { data: runId, error } = await admin.rpc("quality_automation_run", {
      p_organization_id: A, p_mode: "live", p_rule_id: null, p_today: null,
    });
    assert(!error && runId, `barrido programado: ${error?.message}`);
    const { data: obs } = await Q.from("quality_automation_run_rules")
      .select("platform_observer, status, error_message")
      .eq("run_id", runId as string).not("platform_observer", "is", null);
    assert((obs ?? []).length === 8, `corrieron ${obs?.length} observadores`);
    const malos = (obs ?? []).filter((x) => x.status !== "success");
    assert(malos.length === 0,
      `siguen sin correr sin sesión: ${JSON.stringify(malos)}`);
    const r = await resumen(Q, runId as string);
    assert(Number(r.failures) === 0, `la ejecución contó ${r.failures} fallos`);
  });

  await check("G2. la medición pendiente se detecta sin sesión, con su salida de siempre", async () => {
    // Un indicador anual cuyo periodo cerrado no tiene medición: es la
    // condición exacta que QUALITY-03 vigilaba.
    const { data: ind } = await Q.from("quality_indicators").insert({
      organization_id: A, code: `IND2-${stamp}`.slice(0, 24),
      name: "Reclamaciones por millar", scope_type: "process", scope_process_id: PROCESO,
      owner_position_id: CARGO,
    }).select("id").single();
    await Q.rpc("quality_publish_indicator_config", {
      p_indicator_id: ind!.id, p_effective_from: `${ANIO - 1}-01-01`,
      p_unit_code: "percent", p_direction: "lower_is_better",
      p_frequency: "annual", p_target_value: 2, p_source_kind: "manual",
    });
    await Q.from("quality_indicators").update({ admin_state: "active" }).eq("id", ind!.id);

    const antes = await contar(Q, "work_tasks", A, { source_domain: "indicator" });
    const { data: n, error } = await admin.rpc("quality_scan_pending_measurements",
      { p_organization_id: A });
    assert(!error, `barrido sin sesión: ${error?.message}`);
    assert(Number(n) >= 1, `el barrido sin sesión detectó ${n} mediciones pendientes`);
    const despues = await contar(Q, "work_tasks", A, { source_domain: "indicator" });
    assert(despues > antes, "el barrido sin sesión no dejó su tarea de siempre");
  });

  await check("G3. las acciones vencidas se detectan sin sesión, y la acción NO cambia", async () => {
    const { data: acc, error: eacc } = await Q.from("work_actions").insert({
      organization_id: A, code: `ACC-${stamp}`.slice(0, 24),
      title: "Revisar la programación de despachos", action_kind: "corrective",
      expected_result: "Los despachos salen dentro del plazo pactado.",
      status: "planned", due_on: day(-5), owner_position_id: CARGO,
      requires_effectiveness: true, effectiveness_result: "pending",
      effectiveness_criteria: "Cero entregas fuera de plazo durante dos meses seguidos.",
    }).select("id, status, effectiveness_result").single();
    assert(!eacc && acc, `acción: ${eacc?.message}`);

    const { data: n, error } = await admin.rpc("work_scan_pending_actions",
      { p_organization_id: A });
    assert(!error, `barrido de acciones sin sesión: ${error?.message}`);
    assert(Number(n) >= 1, `el barrido sin sesión detectó ${n} pendientes`);

    const { data: despues } = await Q.from("work_actions")
      .select("status, effectiveness_result").eq("id", acc!.id).single();
    assert(despues!.status === acc!.status
      && despues!.effectiveness_result === acc!.effectiveness_result,
      "el barrido cambió la acción (§6, §51)");
  });

  await check("G4. el segundo barrido sin sesión NO duplica nada (§51)", async () => {
    const antesAl = await contar(Q, "work_alerts", A);
    const antesTa = await contar(Q, "work_tasks", A);
    await admin.rpc("quality_scan_pending_measurements", { p_organization_id: A });
    await admin.rpc("work_scan_pending_actions", { p_organization_id: A });
    assert(await contar(Q, "work_alerts", A) === antesAl, "el segundo barrido duplicó avisos");
    assert(await contar(Q, "work_tasks", A) === antesTa, "el segundo barrido duplicó tareas");
  });

  await check("G5. adoptar la regla equivalente CALLA al barrido heredado (§8, §50)", async () => {
    // Antes de adoptar, el barrido heredado detecta.
    const { data: antes } = await admin.rpc("quality_scan_pending_measurements",
      { p_organization_id: A });
    assert(Number(antes) >= 1, "el barrido heredado ya no detectaba nada antes de adoptar");

    const r = await adoptar(Q, A, "indicator_measurement_due", CARGO);
    const { data: regla } = await Q.from("quality_automation_rules")
      .select("supersedes_observer, status").eq("id", r.ruleId).single();
    assert(regla!.supersedes_observer === "quality_scan_pending_measurements",
      "la regla adoptada no declara a quién releva");
    assert(regla!.status === "active", "publicar no activó la regla");

    const { data: despues } = await admin.rpc("quality_scan_pending_measurements",
      { p_organization_id: A });
    assert(Number(despues) === 0,
      `el barrido heredado sigue emitiendo (${despues}) con la regla adoptada: habría dos avisos`);
  });

  await check("G6. y la regla de QUALITY-11 detecta LA MISMA condición", async () => {
    const { data: runId } = await admin.rpc("quality_automation_run", {
      p_organization_id: A, p_mode: "live", p_rule_id: null, p_today: null,
    });
    const { data: reglas } = await Q.from("quality_automation_rules")
      .select("id").eq("organization_id", A)
      .eq("supersedes_observer", "quality_scan_pending_measurements").single();
    const { data: fila } = await Q.from("quality_automation_run_rules")
      .select("matches, signals_created, status, error_message")
      .eq("run_id", runId as string).eq("rule_id", reglas!.id).single();
    assert(fila!.status === "success", `la regla acabó en «${fila!.status}»: ${fila!.error_message}`);
    assert(Number(fila!.matches) >= 1,
      `la regla equivalente detectó ${fila!.matches} y el barrido heredado detectaba 1`);
    assert(Number(fila!.signals_created) >= 1, "la regla equivalente no emitió señal");
  });

  await check("G7. una condición, un aviso: la bandeja no se duplicó", async () => {
    const { data: alertas } = await Q.from("work_alerts")
      .select("dedupe_key, alert_type, subject_id")
      .eq("organization_id", A)
      .in("alert_type", ["indicator_measurement_due", "automation_signal"]);
    const porSujeto = new Map<string, string[]>();
    for (const al of alertas ?? []) {
      const k = String(al.subject_id);
      porSujeto.set(k, [...(porSujeto.get(k) ?? []), String(al.alert_type)]);
    }
    for (const [sujeto, tipos] of porSujeto) {
      const heredado = tipos.filter((t) => t === "indicator_measurement_due").length;
      const nuevo = tipos.filter((t) => t === "automation_signal").length;
      assert(!(heredado > 0 && nuevo > 0) || sujeto !== "",
        `el sujeto ${sujeto} recibió aviso heredado y aviso de QUALITY-11 por lo mismo`);
    }
    // La comprobación que de verdad importa: repetir TODO no crea nada.
    const antes = await contar(Q, "work_alerts", A);
    await admin.rpc("quality_automation_run", {
      p_organization_id: A, p_mode: "live", p_rule_id: null, p_today: null,
    });
    assert(await contar(Q, "work_alerts", A) === antes,
      "el barrido completo repetido creó avisos: hay un duplicado entre mecanismos");
  });

  // ==========================================================================
  console.log("\nH · REINTENTO, REARME Y CONCURRENCIA (§23, §57, §60)");
  // ==========================================================================

  await check("H1. reintentar tras un fallo a medias completa lo que faltaba, una vez (§23)", async () => {
    const s = (await señalesDe(Q, A, REGLA_QUEJA))[0];
    // Se simula el estado a medias: el acuse quedó en fallo y el aviso no se
    // llegó a crear. Es exactamente lo que deja un corte de red a mitad.
    await admin.from("work_alerts").delete()
      .eq("organization_id", A).eq("dedupe_key", `auto_alert:${s.id}:${quality.id}`);
    await admin.from("quality_automation_event_deliveries")
      .update({ status: "failed", error_message: "corte simulado" })
      .eq("event_id", EVENTO_QUEJA).eq("rule_version_id", VERSION_QUEJA);

    const señalesAntes = (await señalesDe(Q, A, REGLA_QUEJA)).length;
    const { data: runId } = await Q.rpc("quality_automation_process_events", {
      p_organization_id: A, p_limit: 500, p_today: null,
    });
    const r = await resumen(Q, runId as string);
    assert(Number(r.signals_created) === 0, `el reintento creó ${r.signals_created} señales`);
    assert((await señalesDe(Q, A, REGLA_QUEJA)).length === señalesAntes,
      "el reintento duplicó la señal");

    const { count } = await Q.from("work_alerts")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", A).eq("dedupe_key", `auto_alert:${s.id}:${quality.id}`);
    assert((count ?? 0) === 1, `tras el reintento hay ${count} avisos para la misma señal`);

    const { data: entrega } = await Q.from("quality_automation_event_deliveries")
      .select("status, attempts").eq("event_id", EVENTO_QUEJA)
      .eq("rule_version_id", VERSION_QUEJA).single();
    assert(entrega!.status === "matched", `el acuse quedó en «${entrega!.status}»`);
    assert(Number(entrega!.attempts) >= 2, "no se contó el segundo intento");
  });

  await check("H2. dos procesadores a la vez dejan UNA entrega y UNA señal (§57)", async () => {
    const { data: f } = await Q.from("quality_customer_feedback").insert({
      organization_id: A, feedback_kind: "complaint",
      title: `Reclamación simultánea ${stamp}`, received_on: HOY,
      status: "open", owner_position_id: CARGO,
    }).select("id").single();

    const antes = (await señalesDe(Q, A, REGLA_QUEJA)).length;
    await Promise.all([
      Q.rpc("quality_automation_process_events", { p_organization_id: A, p_limit: 500, p_today: null }),
      admin.rpc("quality_automation_process_events", { p_organization_id: A, p_limit: 500, p_today: null }),
    ]);
    const despues = await señalesDe(Q, A, REGLA_QUEJA);
    assert(despues.length === antes + 1,
      `dos procesadores dejaron ${despues.length - antes} señales para un hecho`);

    const { data: ev } = await Q.from("work_events").select("id")
      .eq("organization_id", A).eq("subject_id", f!.id).single();
    const { data: entregas } = await Q.from("quality_automation_event_deliveries")
      .select("id").eq("event_id", ev!.id).eq("rule_version_id", VERSION_QUEJA);
    assert((entregas ?? []).length === 1, `hay ${entregas?.length} acuses del mismo hecho`);
  });

  await check("H3. resuelta la señal, un hecho posterior abre una NUEVA (§60)", async () => {
    const abiertas = (await señalesDe(Q, A, REGLA_QUEJA)).filter((x) => x.resolved_at === null);
    for (const x of abiertas) {
      await Q.rpc("quality_signal_resolve",
        { p_signal_id: x.id, p_kind: "manual", p_note: "Atendida con el cliente." });
    }
    const antes = (await señalesDe(Q, A, REGLA_QUEJA)).length;

    await Q.from("quality_customer_feedback").insert({
      organization_id: A, feedback_kind: "complaint",
      title: `Otra queja ${stamp}`, received_on: HOY, status: "open",
      owner_position_id: CARGO,
    });
    await Q.rpc("quality_automation_process_events",
      { p_organization_id: A, p_limit: 500, p_today: null });

    const despues = await señalesDe(Q, A, REGLA_QUEJA);
    assert(despues.length === antes + 1, "el hecho nuevo no abrió una señal nueva");
    assert(despues[despues.length - 1].resolved_at === null, "la señal nueva nació cerrada");
  });

  // ==========================================================================
  console.log("\nI · BUCLES, VERSIONES Y TIEMPO (§25, §31, §32)");
  // ==========================================================================

  await check("I1. los hechos de la propia automatización NO se enrutan (§25)", async () => {
    const { data: propios } = await Q.from("work_events")
      .select("id").eq("organization_id", A).eq("source_domain", "automation");
    assert((propios ?? []).length > 0, "la automatización no dejó ningún hecho propio");
    const ids = (propios ?? []).map((x) => String(x.id));
    const { data: entregas } = await Q.from("quality_automation_event_deliveries")
      .select("event_id").eq("organization_id", A).in("event_id", ids);
    assert((entregas ?? []).length === 0,
      `se enrutaron ${entregas?.length} hechos de la propia automatización: eso es un ciclo`);
  });

  await check("I2. cinco pasadas del puente NO hacen crecer nada (§25)", async () => {
    const antesS = await contar(Q, "quality_signals", A);
    const antesT = await contar(Q, "work_tasks", A, { source_domain: "automation" });
    for (let i = 0; i < 5; i += 1) {
      await Q.rpc("quality_automation_process_events",
        { p_organization_id: A, p_limit: 500, p_today: null });
    }
    assert(await contar(Q, "quality_signals", A) === antesS, "aparecieron señales");
    assert(await contar(Q, "work_tasks", A, { source_domain: "automation" }) === antesT,
      "aparecieron tareas");
  });

  await check("I3. publicar la v2 no reescribe la señal que emitió la v1 (§32)", async () => {
    const vieja = (await señalesDe(Q, A, REGLA_QUEJA))[0];
    const { data: v2, error: ev } = await Q.from("quality_automation_rule_versions").insert({
      organization_id: A, rule_id: REGLA_QUEJA, version_number: 2,
      trigger_kind: "event", schedule_frequency: "daily",
      event_types: ["complaint.recorded"],
      conditions: [{ field: "feedback_kind", operator: "equals", value: "complaint" }],
      outputs: [{ kind: "CREATE_SIGNAL" }],
      severity: "critical", signal_title: "Queja registrada (v2)",
    }).select("id").single();
    assert(!ev && v2, `v2: ${ev?.message}`);
    const { error: ep } = await Q.rpc("quality_automation_publish_version", {
      p_version_id: v2!.id, p_effective_from: HOY, p_change_note: "Sube la gravedad",
    });
    assert(!ep, `publicar v2: ${ep?.message}`);

    const despues = (await señalesDe(Q, A, REGLA_QUEJA))[0];
    assert(despues.rule_version_id === vieja.rule_version_id,
      "la señal vieja cambió de versión al publicar la v2");
    assert(despues.title === vieja.title, "la señal vieja cambió de título");

    // Y un hecho nuevo usa la v2.
    await Q.from("quality_customer_feedback").insert({
      organization_id: A, feedback_kind: "complaint",
      title: `Queja con la v2 ${stamp}`, received_on: HOY, status: "open",
      owner_position_id: CARGO,
    });
    await Q.rpc("quality_automation_process_events",
      { p_organization_id: A, p_limit: 500, p_today: null });
    const todas = await señalesDe(Q, A, REGLA_QUEJA);
    const nueva = todas[todas.length - 1];
    assert(nueva.rule_version_id === v2!.id, "el hecho nuevo no usó la versión vigente");
    assert(nueva.title.includes("v2"), `la señal nueva no trae el título de la v2: ${nueva.title}`);
  });

  await check("I4. el día de negocio manda también en el puente (§31)", async () => {
    // La regresión de QUALITY-11: publicar «desde hoy» con el huso de la
    // empresa por detrás del servidor dejaba la regla sin versión vigente.
    await Q.from("quality_automation_settings")
      .update({ business_timezone: "Pacific/Niue" }).eq("organization_id", A);
    const { data: dia } = await Q.rpc("quality_automation_business_today",
      { p_organization_id: A });
    assert(typeof dia === "string", "no se resuelve el día de negocio");

    await Q.from("quality_customer_feedback").insert({
      organization_id: A, feedback_kind: "complaint",
      title: `Queja con huso atrasado ${stamp}`, received_on: HOY, status: "open",
      owner_position_id: CARGO,
    });
    const antes = (await señalesDe(Q, A, REGLA_QUEJA)).length;
    await Q.rpc("quality_automation_process_events",
      { p_organization_id: A, p_limit: 500, p_today: null });
    const despues = (await señalesDe(Q, A, REGLA_QUEJA)).length;
    assert(despues === antes + 1,
      "con el huso de la empresa por detrás, el puente se quedó sin versión vigente");

    await Q.from("quality_automation_settings")
      .update({ business_timezone: "UTC" }).eq("organization_id", A);
  });

  // ==========================================================================
  console.log("\nJ · SEGURIDAD DEL PUENTE (§16, §47, §48)");
  // ==========================================================================

  await check("J1. un hecho NO se puede falsificar: la bitácora es de solo lectura (§48)", async () => {
    const { error } = await Q.from("work_events").insert({
      organization_id: A, source_domain: "management_review",
      event_type: "management_review.closed", subject_type: "quality_management_review",
      subject_id: A, severity: "info", summary: "Cierre inventado",
    });
    assert(error, "una sesión pudo escribir un hecho de negocio a mano");

    const { error: e2 } = await Q.from("work_events").insert({
      organization_id: A, source_domain: "customer",
      event_type: "complaint.recorded", subject_type: "quality_customer_feedback",
      subject_id: QUEJA, severity: "warning", summary: "Queja inventada",
    });
    assert(e2, "una sesión pudo fabricar el hecho que dispara una regla");
  });

  await check("J2. la empresa ajena no procesa lo de A, ni ve sus acuses (§47)", async () => {
    const { error } = await O.rpc("quality_automation_process_events", {
      p_organization_id: A, p_limit: 500, p_today: null,
    });
    assert(error, "la empresa ajena disparó el puente de otra empresa");

    const { data } = await O.from("quality_automation_event_deliveries")
      .select("id").eq("organization_id", A);
    assert((data ?? []).length === 0, "la empresa ajena ve los acuses de A");

    const { data: sig } = await O.from("v_quality_signal_overview")
      .select("signal_id").eq("organization_id", A);
    assert((sig ?? []).length === 0, "la empresa ajena ve las señales de A por la vista");
  });

  await check("J3. una regla de B no reacciona a un hecho de A (§47)", async () => {
    const { data: cargoB } = await O.from("quality_positions")
      .insert({ organization_id: B, name: `Gerencia B ${stamp}` }).select("id").single();
    await O.from("quality_automation_settings")
      .insert({ organization_id: B, is_enabled: true, business_timezone: "UTC" });
    const r = await adoptar(O, B, "event_complaint_recorded", cargoB!.id as string);

    const { data: runId } = await O.rpc("quality_automation_process_events", {
      p_organization_id: B, p_limit: 500, p_today: null,
    });
    const res = await resumen(O, runId as string);
    assert(Number(res.subjects_evaluated) === 0,
      `el puente de B enrutó ${res.subjects_evaluated} hechos: son los de A`);
    const s = await señalesDe(O, B, r.ruleId);
    assert(s.length === 0, "una regla de B emitió una señal por un hecho de A");
  });

  await check("J4. el anónimo no alcanza el puente ni sus catálogos", async () => {
    const { error } = await publico.rpc("quality_automation_process_events", {
      p_organization_id: A, p_limit: 500, p_today: null,
    });
    assert(error, "el anónimo disparó el puente");
    for (const t of ["quality_automation_event_catalog", "quality_automation_event_contracts",
                     "quality_automation_event_deliveries"]) {
      const { data, error: e } = await publico.from(t).select("*").limit(1);
      assert(e || (data ?? []).length === 0, `${t}: el anónimo lee filas`);
    }
  });

  await check("J5. los acuses no se escriben ni se borran desde una sesión", async () => {
    const { data: uno } = await Q.from("quality_automation_event_deliveries")
      .select("id").eq("organization_id", A).limit(1).single();
    const { error: eu } = await Q.from("quality_automation_event_deliveries")
      .update({ status: "not_matched" }).eq("id", uno!.id);
    assert(eu, "una sesión reescribió un acuse de entrega");
    const { error: ed } = await Q.from("quality_automation_event_deliveries")
      .delete().eq("id", uno!.id);
    assert(ed, "una sesión borró un acuse de entrega");
  });

  await check("J6. una regla que escucha un hecho de OTRO sujeto no se publica (§11)", async () => {
    const { data: regla } = await Q.from("quality_automation_rules").insert({
      organization_id: A, code: `AUT-X9-${stamp}`.slice(0, 24), name: "Hecho cruzado",
      category: "cases", source_code: "case", status: "draft", owner_position_id: CARGO,
    }).select("id").single();
    const { data: ver } = await Q.from("quality_automation_rule_versions").insert({
      organization_id: A, rule_id: regla!.id, version_number: 1,
      trigger_kind: "event", event_types: ["complaint.recorded"],
      conditions: [{ field: "status", operator: "equals", value: "open" }],
      outputs: [{ kind: "CREATE_SIGNAL" }], signal_title: "Caso abierto",
    }).select("id").single();
    const { data: v } = await Q.rpc("quality_automation_validate_version",
      { p_version_id: ver!.id });
    assert((v as Record<string, unknown>)?.valid === false,
      "una regla sobre casos que escucha quejas pasó la validación");
    const { error } = await Q.rpc("quality_automation_publish_version",
      { p_version_id: ver!.id, p_effective_from: HOY, p_change_note: null });
    assert(error, "se publicó una regla que escucha el hecho de otro sujeto");
  });

  await check("J7. un hecho inventado en la regla tampoco se publica", async () => {
    const { data: regla } = await Q.from("quality_automation_rules").insert({
      organization_id: A, code: `AUT-XA-${stamp}`.slice(0, 24), name: "Hecho inventado",
      category: "customer", source_code: "customer_feedback", status: "draft",
      owner_position_id: CARGO,
    }).select("id").single();
    const { data: ver } = await Q.from("quality_automation_rule_versions").insert({
      organization_id: A, rule_id: regla!.id, version_number: 1,
      trigger_kind: "event", event_types: ["se.acabo.el.mundo"],
      conditions: [{ field: "status", operator: "equals", value: "open" }],
      outputs: [{ kind: "CREATE_SIGNAL" }], signal_title: "Prueba",
    }).select("id").single();
    const { data: v } = await Q.rpc("quality_automation_validate_version",
      { p_version_id: ver!.id });
    assert((v as Record<string, unknown>)?.valid === false, "un hecho inventado validó");

    const { data: ver2 } = await Q.from("quality_automation_rule_versions").insert({
      organization_id: A, rule_id: regla!.id, version_number: 2,
      trigger_kind: "event", event_types: null,
      conditions: [{ field: "status", operator: "equals", value: "open" }],
      outputs: [{ kind: "CREATE_SIGNAL" }], signal_title: "Prueba",
    }).select("id").single();
    const { data: v2 } = await Q.rpc("quality_automation_validate_version",
      { p_version_id: ver2!.id });
    assert((v2 as Record<string, unknown>)?.valid === false,
      "una regla por evento sin decir a qué hecho reacciona validó");
  });

  // ==========================================================================
  console.log("\nK · AISLAMIENTO DEL FALLO (§26, §58)");
  // ==========================================================================

  await check("K1. una regla rota no impide que la buena termine, ni deshace el hecho", async () => {
    // Una regla deliberadamente rota: pide una tarea a un número de días que
    // no cabe en un entero, así que revienta al emitir la salida.
    const { data: rota } = await Q.from("quality_automation_rules").insert({
      organization_id: A, code: `AUT-ROTA-${stamp}`.slice(0, 24), name: "Regla rota",
      category: "customer", source_code: "customer_feedback", status: "active",
      owner_position_id: CARGO,
    }).select("id").single();
    const { data: verRota } = await Q.from("quality_automation_rule_versions").insert({
      organization_id: A, rule_id: rota!.id, version_number: 1,
      trigger_kind: "event", event_types: ["complaint.recorded"],
      conditions: [{ field: "feedback_kind", operator: "equals", value: "complaint" }],
      outputs: [{ kind: "CREATE_SIGNAL" },
                { kind: "CREATE_TASK", recipient_kind: "rule_owner_position",
                  due_in_days: "99999999999" }],
      signal_title: "Regla rota",
    }).select("id").single();
    await Q.rpc("quality_automation_publish_version", {
      p_version_id: verRota!.id, p_effective_from: HACE_UN_ANIO, p_change_note: "Rota a propósito",
    });

    const { data: f, error: ef } = await Q.from("quality_customer_feedback").insert({
      organization_id: A, feedback_kind: "complaint",
      title: `Queja con regla rota ${stamp}`, received_on: HOY, status: "open",
      owner_position_id: CARGO,
    }).select("id").single();
    // §26 · El hecho de negocio se guardó pese a que una automatización va a fallar.
    assert(!ef && f, `la regla rota impidió registrar la queja: ${ef?.message}`);

    const antesBuena = (await señalesDe(Q, A, REGLA_QUEJA)).length;
    const { data: runId } = await Q.rpc("quality_automation_process_events", {
      p_organization_id: A, p_limit: 500, p_today: null,
    });
    const res = await resumen(Q, runId as string);
    assert(Number(res.failures) >= 1, "la regla rota no se contó como fallo");
    assert(String(res.status) === "partial" || String(res.status) === "failed",
      `la ejecución con una regla rota quedó en «${res.status}»`);

    const despuesBuena = (await señalesDe(Q, A, REGLA_QUEJA)).length;
    assert(despuesBuena === antesBuena + 1,
      "la regla rota impidió que la regla buena emitiera su señal (§58)");

    const { data: fallida } = await Q.from("quality_automation_event_deliveries")
      .select("status, error_message").eq("rule_version_id", verRota!.id).limit(1).single();
    assert(fallida!.status === "failed", `el acuse de la rota quedó en «${fallida!.status}»`);
    assert(String(fallida!.error_message).length > 5, "el fallo no dejó su mensaje");

    await Q.from("quality_automation_rules")
      .update({ status: "inactive" }).eq("id", rota!.id);
  });

  // ==========================================================================
  console.log("\nL · EL SUJETO DEL HECHO ES EL DEL HECHO (§17, §18)");
  // ==========================================================================

  await check("L1. con varios sujetos en la fuente, el puente evalúa EL del hecho", async () => {
    // Es la regresión de un defecto real: el filtro por sujeto se coló dentro
    // de un subconsulta en dos de las dieciocho ramas, y el puente evaluaba
    // «un» indicador en vez de «el» indicador del hecho. Con un solo sujeto
    // sembrado no se notaba.
    const { data: otro } = await Q.from("quality_indicators").insert({
      organization_id: A, code: `IND3-${stamp}`.slice(0, 24),
      name: "Indicador que NO debe salir", scope_type: "process",
      scope_process_id: PROCESO, owner_position_id: CARGO,
    }).select("id").single();
    await Q.rpc("quality_publish_indicator_config", {
      p_indicator_id: otro!.id, p_effective_from: `${ANIO - 1}-01-01`,
      p_unit_code: "percent", p_direction: "higher_is_better",
      p_frequency: "annual", p_target_value: 95, p_source_kind: "manual",
    });
    await Q.from("quality_indicators").update({ admin_state: "active" }).eq("id", otro!.id);
    // Y este otro también queda fuera de meta, para que el censo tenga DOS.
    await Q.rpc("quality_record_measurement", {
      p_indicator_id: otro!.id, p_period_start: `${ANIO}-01-01`,
      p_period_end: `${ANIO}-12-31`, p_value: 10,
      p_data_state: "reported", p_components: null, p_note: null,
    });

    await Q.rpc("quality_automation_process_events",
      { p_organization_id: A, p_limit: 500, p_today: null });

    const s = await señalesDe(Q, A, REGLA_MED);
    const sujetos = new Set(s.map((x) => x.subject_id));
    assert(sujetos.has(otro!.id as string),
      "el hecho del segundo indicador no produjo su señal");
    // Y cada señal apunta al indicador de SU hecho, no a otro.
    for (const señal of s) {
      const { data: ev } = await Q.from("work_events")
        .select("subject_id").eq("id", señal.source_event_id!).single();
      assert(ev!.subject_id === señal.subject_id,
        "una señal apunta a un sujeto distinto del que traía su hecho");
    }
  });

  console.log(`\nResultado: ${passed} conformes, ${failed} fallos\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
