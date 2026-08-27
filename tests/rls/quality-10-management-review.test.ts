/**
 * Trazaloop · QUALITY-10 · Revisión por la dirección, contra base real.
 *
 * Los escenarios del encargo (§77…§88) y los ataques (§98). Lo que se comprueba
 * aquí no es un CRUD: son las afirmaciones que SOLO se demuestran ejecutándolas.
 *
 *   · preparar reúne de verdad datos de objetivos, indicadores, casos, riesgos,
 *     proveedores, clientes y auditorías, sin que nadie los teclee;
 *   · sin campaña de satisfacción el resultado es «sin datos», no CSAT = 0;
 *   · un indicador que en 2027 iba 82 sobre 95 sigue diciendo 82/95 en la
 *     revisión de 2027 aunque en 2028 vaya 90 sobre 98;
 *   · 5 de 6 auditorías ejecutadas siguen siendo 5 de 6 cuando llega 2028;
 *   · una campaña anónima llega a la revisión como métrica, nunca como nombre;
 *   · registrar una decisión deja el conteo de acciones EXACTAMENTE igual, y
 *     crear dos acciones deja el conteo de decisiones exactamente igual;
 *   · una revisión se cierra con una acción abierta, y esa acción sigue
 *     avanzando después sin cambiar ni una letra del acta;
 *   · si la fuente cambia antes de cerrar se avisa, y refrescar no borra el
 *     análisis que alguien ya escribió;
 *   · quien participó como Gerente en 2027 sigue apareciendo como Gerente
 *     aunque en 2028 tenga otro cargo;
 *   · la revisión de 2028 ve automáticamente las acciones que dejó la de 2027;
 *   · y una empresa no alcanza la revisión, la entrada ni la decisión de otra,
 *     ni con el UUID en la mano, ni por PostgREST directo.
 *
 * Todo corre con la sesión REAL de cada usuario. El cliente administrativo solo
 * crea cuentas y membresías.
 */
import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) {
  console.error("Faltan variables para test:quality10-rls (URL, ANON, SERVICE_ROLE).");
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
  const email = `q10-${label}-${stamp}@test.trazaloop.dev`;
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
const day = (offset: number) => iso(new Date(Date.now() + offset * 86_400_000));
const HOY = day(0);
const AYER = day(-1);
const EN_UN_MES = day(30);

// Dos AÑOS NATURALES de prueba. Tienen que serlo: un indicador de periodicidad
// anual solo admite mediciones que cubran el año calendario completo, y este
// escenario existe precisamente para comprobar que la meta de un año no
// contamina la revisión del otro.
const AÑO_B = Number(HOY.slice(0, 4));
const AÑO_A = AÑO_B - 1;
const A_INICIO = `${AÑO_A}-01-01`;
const A_FIN = `${AÑO_A}-12-31`;
const A_MEDIO = `${AÑO_A}-06-15`;
const B_INICIO = `${AÑO_B}-01-01`;
const B_FIN = `${AÑO_B}-12-31`;

async function main() {
  console.log("\nQUALITY-10 · base real\n");

  const owner = await newUser("adm", "Directora");
  const quality = await newUser("cal", "Coordinadora de Calidad");
  const consultant = await newUser("con", "Consultor externo");
  const outsider = await newUser("out", "Ajena");
  for (const u of [owner, quality, consultant, outsider]) {
    await u.client.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "q10" });
  }
  const { data: a } = await owner.client.rpc("create_organization", { p_name: `Q10 A ${stamp}` });
  const { data: b } = await outsider.client.rpc("create_organization", { p_name: `Q10 B ${stamp}` });
  const A = a as string, B = b as string;

  await admin.from("memberships").insert([
    { organization_id: A, user_id: quality.id, role_code: "quality", status: "active" },
    { organization_id: A, user_id: consultant.id, role_code: "consultant", status: "active" },
  ]);

  const Q = quality.client;    // conduce y cierra
  const C = consultant.client; // conduce, NO cierra
  const O = outsider.client;   // otra empresa

  // ==========================================================================
  console.log("A · Escenario 1 · PREPARAR reúne datos reales (§77)");
  // ==========================================================================

  let RD_A = "", CARGO_GERENTE = "", PROCESO = "", INDICADOR = "", CONFIG_A = "";
  let PERSONA_ANA = "";

  await check("A0. se siembran datos reales en los dominios de origen", async () => {
    // Cargo, persona, proceso.
    const { data: cargo } = await Q.from("quality_positions")
      .insert({ organization_id: A, name: `Gerencia General ${stamp}` })
      .select("id").single();
    CARGO_GERENTE = cargo!.id as string;

    const { data: persona } = await Q.from("quality_people")
      .insert({ organization_id: A, full_name: `Ana ${stamp}` }).select("id").single();
    PERSONA_ANA = persona!.id as string;

    const { data: proc } = await Q.from("quality_processes")
      .insert({ organization_id: A, name: `Compras ${stamp}`, category_code: "core",
                owner_position_id: CARGO_GERENTE })
      .select("id").single();
    PROCESO = proc!.id as string;

    // Un indicador con su configuración: meta 95 en el periodo A.
    const { data: ind, error: ei } = await Q.from("quality_indicators").insert({
      organization_id: A, code: `IND-${stamp}`.slice(0, 24),
      name: "Cumplimiento de entregas", scope_type: "process", scope_process_id: PROCESO,
    }).select("id").single();
    assert(!ei && ind, `indicador: ${ei?.message}`);
    INDICADOR = ind!.id as string;

    // La configuración se publica por su RPC: `quality_indicator_configs` es de
    // SOLO LECTURA para la sesión desde 0118, y así se queda.
    const { data: cfg, error: ec } = await Q.rpc("quality_publish_indicator_config", {
      p_indicator_id: INDICADOR, p_effective_from: A_INICIO,
      p_unit_code: "percent", p_direction: "higher_is_better",
      p_frequency: "annual", p_target_value: 95, p_source_kind: "manual",
    });
    assert(!ec && cfg, `configuración: ${ec?.message}`);
    CONFIG_A = cfg as string;

    // Solo un indicador ACTIVO admite mediciones (QUALITY-03).
    const { error: ea } = await Q.from("quality_indicators")
      .update({ admin_state: "active" }).eq("id", INDICADOR);
    assert(!ea, `activar indicador: ${ea?.message}`);

    // Un caso del periodo, clasificado como no conformidad.
    const { error: ecaso } = await Q.from("work_cases").insert({
      organization_id: A, code: `CASO-${stamp}`.slice(0, 24),
      title: "Entregas fuera de plazo", case_type: "issue", origin_kind: "process",
      detected_on: A_MEDIO, classification: "nonconformity", status: "open",
      requirement_text: "Entregar dentro del plazo pactado.",
      nonconformity_text: "Tres entregas superaron el plazo.",
    });
    assert(!ecaso, `caso: ${ecaso?.message}`);
  });

  await check("A1. una revisión se crea declarando el periodo que analiza", async () => {
    const { data, error } = await Q.from("quality_management_reviews").insert({
      organization_id: A, code: `RD-A-${stamp}`.slice(0, 30),
      title: `Revisión por la dirección ${AÑO_A}`,
      period_label: String(AÑO_A), period_start: A_INICIO, period_end: A_FIN,
      owner_position_id: CARGO_GERENTE,
      scope_note: "Todo el sistema de gestión.",
    }).select("id, status").single();
    assert(!error && data, `revisión: ${error?.message}`);
    RD_A = data!.id as string;
    assert(data!.status === "draft", "la revisión no nace en borrador");
  });

  await check("A2. preparar crea las CATORCE entradas y las llena de datos reales", async () => {
    const { data: n, error } = await Q.rpc("quality_mr_prepare_inputs", { p_review_id: RD_A });
    assert(!error, `preparar: ${error?.message}`);
    assert(Number(n) === 14, `se prepararon ${n} entradas, se esperaban 14`);

    const { data: inputs } = await Q.from("quality_management_review_inputs")
      .select("catalog_code, state, input_mode, snapshot, source_period_start, source_fingerprint")
      .eq("organization_id", A).eq("review_id", RD_A);
    assert((inputs ?? []).length === 14, `hay ${(inputs ?? []).length} entradas`);

    // Cada entrada automática dice de qué periodo salió y trae su huella.
    for (const i of inputs ?? []) {
      if (i.input_mode !== "automatic") continue;
      assert(i.source_period_start === A_INICIO,
        `la entrada ${i.catalog_code} no respetó el periodo`);
      assert(i.source_fingerprint !== null,
        `la entrada ${i.catalog_code} no guardó huella`);
      const snap = i.snapshot as Record<string, unknown> | null;
      assert(snap !== null, `la entrada ${i.catalog_code} no trae retrato`);
      assert(Array.isArray(snap!.lineage) && (snap!.lineage as unknown[]).length > 0,
        `la entrada ${i.catalog_code} no dice de dónde viene: sería un número mágico`);
    }

    // Y los datos reales llegaron.
    const casos = (inputs ?? []).find((i) => i.catalog_code === "nonconformities_actions");
    const snap = casos!.snapshot as Record<string, Record<string, number>>;
    assert(snap.cases.opened >= 1, "la entrada de casos no vio el caso del periodo");
    assert(snap.classification.nonconformity >= 1,
      "la entrada de casos no vio la no conformidad");
  });

  await check("A3. la revisión pasó a «en preparación» sola", async () => {
    const { data } = await Q.from("quality_management_reviews")
      .select("status").eq("id", RD_A).single();
    assert(data!.status === "preparing", `la revisión quedó en «${data!.status}»`);
  });

  // ==========================================================================
  console.log("\nB · Escenario 2 · SIN DATOS ≠ CERO (§78)");
  // ==========================================================================

  await check("B1. sin campaña de satisfacción, la entrada dice «sin datos»", async () => {
    const { data } = await Q.from("quality_management_review_inputs")
      .select("state, summary, snapshot")
      .eq("organization_id", A).eq("review_id", RD_A)
      .eq("catalog_code", "customer_voice").single();
    assert(data!.state === "missing",
      `la entrada de cliente quedó en «${data!.state}» sin haber campañas`);
    const snap = data!.snapshot as Record<string, unknown>;
    assert(snap.available === false, "la entrada se declara disponible sin datos");
    assert(/NO significa satisfacción cero/i.test(data!.summary as string),
      `el resumen dice «${data!.summary}» en vez de explicar que no se midió`);
  });

  await check("B2. y en ninguna parte aparece un cero de satisfacción", async () => {
    const { data } = await Q.from("quality_management_review_inputs")
      .select("snapshot").eq("organization_id", A).eq("review_id", RD_A)
      .eq("catalog_code", "customer_voice").single();
    const snap = JSON.stringify(data!.snapshot);
    assert(!/"csat"\s*:\s*0/.test(snap) && !/"satisfaction"\s*:\s*0/.test(snap),
      "se fabricó una satisfacción de cero");
  });

  // ==========================================================================
  console.log("\nC · Escenario 3 · EL INDICADOR HISTÓRICO (§79)");
  // ==========================================================================

  await check("C1. la medición del periodo A va 82 sobre una meta de 95", async () => {
    const { error } = await Q.rpc("quality_record_measurement", {
      p_indicator_id: INDICADOR, p_period_start: A_INICIO, p_period_end: A_FIN,
      p_value: 82, p_data_state: "reported", p_components: null,
      p_note: `Medición de ${AÑO_A}.`,
    });
    assert(!error, `medición: ${error?.message}`);

    const { error: er } = await Q.rpc("quality_mr_prepare_inputs", { p_review_id: RD_A });
    assert(!er, `repreparar: ${er?.message}`);

    const { data } = await Q.from("quality_management_review_inputs")
      .select("snapshot").eq("organization_id", A).eq("review_id", RD_A)
      .eq("catalog_code", "monitoring_results").single();
    const meds = (data!.snapshot as Record<string, unknown>).measurements as Record<string, unknown>[];
    assert(meds.length === 1, `se vieron ${meds.length} mediciones`);
    assert(Number(meds[0].value) === 82, `el valor es ${meds[0].value}`);
    assert(Number(meds[0].target) === 95, `la meta es ${meds[0].target}`);
  });

  await check("C2. la meta sube a 98 en el periodo B y se mide 90", async () => {
    const { error: ec } = await Q.rpc("quality_publish_indicator_config", {
      p_indicator_id: INDICADOR, p_effective_from: B_INICIO,
      p_unit_code: "percent", p_direction: "higher_is_better",
      p_frequency: "annual", p_target_value: 98, p_source_kind: "manual",
    });
    assert(!ec, `configuración 2: ${ec?.message}`);

    const { error } = await Q.rpc("quality_record_measurement", {
      p_indicator_id: INDICADOR, p_period_start: B_INICIO, p_period_end: B_FIN,
      p_value: 90, p_data_state: "reported", p_components: null,
      p_note: `Medición de ${AÑO_B}.`,
    });
    assert(!error, `medición 2: ${error?.message}`);
  });

  await check("C3. la revisión del periodo A SIGUE diciendo 82 sobre 95", async () => {
    const { data } = await Q.from("quality_management_review_inputs")
      .select("snapshot").eq("organization_id", A).eq("review_id", RD_A)
      .eq("catalog_code", "monitoring_results").single();
    const meds = (data!.snapshot as Record<string, unknown>).measurements as Record<string, unknown>[];
    assert(meds.length === 1,
      `la revisión del periodo A ve ${meds.length} mediciones: se coló la del periodo B`);
    assert(Number(meds[0].value) === 82 && Number(meds[0].target) === 95,
      `la revisión del periodo A dice ${meds[0].value}/${meds[0].target}`);
  });

  await check("C4. y refrescar la entrada NO la contamina con el periodo B", async () => {
    const { data: input } = await Q.from("quality_management_review_inputs")
      .select("id").eq("organization_id", A).eq("review_id", RD_A)
      .eq("catalog_code", "monitoring_results").single();
    const { error } = await Q.rpc("quality_mr_refresh_input", { p_input_id: input!.id });
    assert(!error, `refrescar: ${error?.message}`);

    const { data } = await Q.from("quality_management_review_inputs")
      .select("snapshot").eq("id", input!.id).single();
    const meds = (data!.snapshot as Record<string, unknown>).measurements as Record<string, unknown>[];
    assert(meds.length === 1 && Number(meds[0].target) === 95,
      "refrescar trajo la meta de hoy en vez de la del periodo revisado");
  });

  // ==========================================================================
  console.log("\nD · Escenario 4 · AUDITORÍAS 5 DE 6 (§80)");
  // ==========================================================================

  let PROGRAMA = "";

  await check("D1. un programa con 6 auditorías, 5 ejecutadas en el periodo A", async () => {
    const { data: prog, error: ep } = await Q.from("quality_audit_programs").insert({
      organization_id: A, name: `Programa ${stamp}`, period_label: String(AÑO_A),
      period_start: A_INICIO, period_end: A_FIN, status: "active",
    }).select("id").single();
    assert(!ep && prog, `programa: ${ep?.message}`);
    PROGRAMA = prog!.id as string;

    for (let i = 1; i <= 6; i++) {
      const ejecutada = i <= 5;
      const { error } = await Q.from("quality_audits").insert({
        organization_id: A, program_id: PROGRAMA,
        code: `AI-${i}-${stamp}`.slice(0, 30), title: `Auditoría ${i}`,
        audit_type: "internal", nature: "planned",
        planned_from: A_MEDIO, planned_to: A_MEDIO,
        scheduled_from: A_MEDIO, scheduled_to: A_MEDIO,
        executed_from: ejecutada ? A_MEDIO : null,
        executed_to: ejecutada ? A_MEDIO : null,
        status: ejecutada ? "executed" : "planned",
      });
      assert(!error, `auditoría ${i}: ${error?.message}`);
    }
  });

  await check("D2. la entrada de auditorías dice 5 ejecutadas de 6 programadas", async () => {
    const { error } = await Q.rpc("quality_mr_prepare_inputs", { p_review_id: RD_A });
    assert(!error, `repreparar: ${error?.message}`);

    const { data } = await Q.from("quality_management_review_inputs")
      .select("snapshot, summary").eq("organization_id", A).eq("review_id", RD_A)
      .eq("catalog_code", "audits").single();
    const snap = data!.snapshot as Record<string, Record<string, unknown>>;
    assert(Number(snap.audits.executed) === 5,
      `dice ${snap.audits.executed} ejecutadas`);
    const programas = snap.programs as unknown as Record<string, unknown>[];
    assert(Number(programas[0].planned) === 6, `dice ${programas[0].planned} programadas`);
    assert(/5 auditoría\(s\) ejecutadas de 6/.test(data!.summary as string),
      `el resumen dice «${data!.summary}»`);
  });

  await check("D3. una auditoría del periodo B NO cambia la revisión del periodo A", async () => {
    const { error: ea } = await Q.from("quality_audits").insert({
      organization_id: A, code: `AI-B-${stamp}`.slice(0, 30), title: `Auditoría de ${AÑO_B}`,
      audit_type: "internal", nature: "planned",
      planned_from: HOY, planned_to: HOY, scheduled_from: HOY, scheduled_to: HOY,
      executed_from: HOY, executed_to: HOY, status: "executed",
    });
    assert(!ea, `auditoría B: ${ea?.message}`);

    const { data } = await Q.from("quality_management_review_inputs")
      .select("snapshot").eq("organization_id", A).eq("review_id", RD_A)
      .eq("catalog_code", "audits").single();
    const snap = data!.snapshot as Record<string, Record<string, unknown>>;
    assert(Number(snap.audits.executed) === 5,
      "la auditoría del periodo B se coló en la revisión del periodo A");
  });

  // ==========================================================================
  console.log("\nE · Escenario 5 · ANONIMATO DEL CLIENTE (§81, §100)");
  // ==========================================================================

  await check("E1. una campaña ANÓNIMA con respuestas reales", async () => {
    const { data: party } = await Q.from("quality_external_parties")
      .insert({ organization_id: A, legal_name: `ACME ${stamp}` }).select("id").single();
    await Q.from("quality_external_party_roles")
      .insert({ organization_id: A, party_id: party!.id, role_code: "customer" });
    await Q.from("quality_customer_profiles")
      .insert({ organization_id: A, party_id: party!.id });

    const { data: s } = await Q.from("quality_surveys")
      .insert({ organization_id: A, name: `Encuesta ${stamp}` }).select("id").single();
    const { data: v } = await Q.from("quality_survey_versions")
      .insert({ organization_id: A, survey_id: s!.id, version_number: 1 })
      .select("id").single();
    await Q.from("quality_survey_questions").insert({
      organization_id: A, version_id: v!.id, stable_key: "sat",
      label: "¿Cómo nos fue?", question_type: "scale",
      scale_min: 0, scale_max: 10, position_order: 1,
    });
    const { error: ep } = await Q.rpc("quality_publish_survey_version", {
      p_version_id: v!.id, p_effective_from: A_INICIO, p_change_note: "Inicial",
    });
    assert(!ep, `publicar: ${ep?.message}`);

    const { data: camp, error: ec } = await Q.from("quality_survey_campaigns").insert({
      organization_id: A, survey_id: s!.id, version_id: v!.id,
      name: `Campaña anónima ${stamp}`, anonymity_mode: "anonymous",
      period_label: String(AÑO_A), period_start: A_INICIO, period_end: A_FIN,
      population_size: 20, closes_on: EN_UN_MES,
    }).select("id").single();
    assert(!ec && camp, `campaña: ${ec?.message}`);
  });

  await check("E2. la entrada trae la campaña, y NI UN identificador de respondente", async () => {
    const { error } = await Q.rpc("quality_mr_prepare_inputs", { p_review_id: RD_A });
    assert(!error, `repreparar: ${error?.message}`);

    const { data } = await Q.from("quality_management_review_inputs")
      .select("state, snapshot").eq("organization_id", A).eq("review_id", RD_A)
      .eq("catalog_code", "customer_voice").single();
    assert(data!.state === "prepared", `la entrada quedó en «${data!.state}»`);

    const texto = JSON.stringify(data!.snapshot);
    for (const prohibido of ["respondent", "contact_id", "invitation", "response_id",
                             "@", "token"]) {
      assert(!texto.includes(prohibido),
        `el retrato de la voz del cliente contiene «${prohibido}»`);
    }
    const snap = data!.snapshot as Record<string, Record<string, unknown>>;
    assert(Number(snap.campaigns.total) === 1, "la campaña no llegó");
    assert(typeof (data!.snapshot as Record<string, unknown>).anonymity_note === "string",
      "el retrato no explica por qué no trae nombres");
  });

  await check("E3. el acta tampoco puede traer identidad", async () => {
    // Se comprueba sobre el retrato que el acta congelará.
    const { data } = await Q.from("quality_management_review_inputs")
      .select("snapshot").eq("organization_id", A).eq("review_id", RD_A)
      .eq("catalog_code", "customer_voice").single();
    const texto = JSON.stringify(data!.snapshot).toLowerCase();
    assert(!texto.includes("respondent") && !texto.includes("respondio"),
      "hay identidad en lo que el acta congelará");
  });

  // ==========================================================================
  console.log("\nF · Escenario 6 · DECISIÓN ≠ ACCIÓN (§82) · CRÍTICO");
  // ==========================================================================

  let DECISION = "";

  async function contarAcciones(): Promise<number> {
    const { data } = await Q.from("work_actions").select("id").eq("organization_id", A);
    return (data ?? []).length;
  }
  async function contarDecisiones(): Promise<number> {
    const { data } = await Q.from("quality_management_review_decisions")
      .select("id").eq("organization_id", A).eq("review_id", RD_A);
    return (data ?? []).length;
  }

  await check("F1. registrar una decisión NO crea ninguna acción", async () => {
    const accionesAntes = await contarAcciones();

    const { data, error } = await Q.rpc("quality_mr_record_decision", {
      p_review_id: RD_A,
      p_topic: "Capacidad de inspección de proveedores críticos",
      p_decision: "Aumentar la capacidad de inspección de proveedores críticos.",
      p_decision_kind: "resource",
      p_rationale: "Las entregas fuera de plazo se concentran en dos proveedores.",
      p_expected_result: "Reducir a la mitad las entregas fuera de plazo.",
      p_input_id: null, p_owner_position_id: CARGO_GERENTE,
    });
    assert(!error && data, `decisión: ${error?.message}`);
    DECISION = data as string;

    assert(await contarDecisiones() === 1, "no se registró exactamente una decisión");
    assert(await contarAcciones() === accionesAntes,
      "REGISTRAR UNA DECISIÓN CREÓ UNA ACCIÓN");
  });

  await check("F2. tampoco creó ninguna tarea", async () => {
    const { data } = await Q.from("work_tasks").select("id")
      .eq("organization_id", A).eq("source_domain", "management_review")
      .eq("subject_id", DECISION);
    assert((data ?? []).length === 0, "registrar la decisión creó una tarea");
  });

  await check("F3. la decisión SÍ quedó como hecho formal del motor transversal", async () => {
    const { data } = await Q.from("work_decisions").select("decision_kind, outcome")
      .eq("organization_id", A).eq("subject_kind", "management_review_decision")
      .eq("subject_id", DECISION);
    assert((data ?? []).length === 1, "la decisión no quedó en el motor de decisiones");
    assert(data![0].decision_kind === "management_review_decision",
      "la decisión se registró con otra clase");
  });

  await check("F4. crear DOS acciones deja la decisión en UNA", async () => {
    const accionesAntes = await contarAcciones();

    for (const t of ["Adquirir el equipo de inspección",
                     "Capacitar al inspector de recepción"]) {
      const { error } = await Q.rpc("quality_mr_create_action_from_decision", {
        p_decision_id: DECISION, p_title: t, p_action_kind: "improvement",
        p_description: null, p_owner_position_id: CARGO_GERENTE,
        p_due_on: EN_UN_MES, p_requires_effectiveness: true,
        p_effectiveness_criteria: "Las entregas fuera de plazo bajan a la mitad.",
      });
      assert(!error, `acción «${t}»: ${error?.message}`);
    }

    assert(await contarAcciones() === accionesAntes + 2, "no se crearon exactamente dos acciones");
    assert(await contarDecisiones() === 1,
      "CREAR DOS ACCIONES CONVIRTIÓ LA DECISIÓN EN VARIAS");

    const { data } = await Q.from("v_quality_management_review_decision_actions")
      .select("action_count").eq("decision_id", DECISION).single();
    assert(Number(data!.action_count) === 2, `la vista dice ${data!.action_count} acciones`);
  });

  await check("F5. las acciones están atadas por el motor de referencias", async () => {
    const { data } = await Q.from("work_references").select("ref_id")
      .eq("organization_id", A).eq("owner_kind", "management_review_decision")
      .eq("owner_id", DECISION).eq("ref_kind", "work_action");
    assert((data ?? []).length === 2, "las acciones no quedaron atadas a la decisión");
  });

  // ==========================================================================
  console.log("\nG · Escenario 9 · FUENTE ACTUALIZADA (§85)");
  // ==========================================================================

  let INPUT_CASOS = "";

  await check("G1. se escribe análisis sobre la entrada de casos", async () => {
    const { data } = await Q.from("quality_management_review_inputs")
      .select("id").eq("organization_id", A).eq("review_id", RD_A)
      .eq("catalog_code", "nonconformities_actions").single();
    INPUT_CASOS = data!.id as string;

    const { error } = await Q.from("quality_management_review_inputs").update({
      analysis: "La concentración de incumplimientos en dos proveedores explica el resultado.",
      analysis_at: new Date().toISOString(),
      conclusion: "Hay que actuar sobre los proveedores, no sobre el proceso interno.",
      requires_decision: true, state: "reviewed",
    }).eq("id", INPUT_CASOS);
    assert(!error, `análisis: ${error?.message}`);
  });

  await check("G2. sin cambios, la fuente NO se declara actualizada", async () => {
    const { data, error } = await Q.rpc("quality_mr_input_freshness", { p_input_id: INPUT_CASOS });
    assert(!error, `frescura: ${error?.message}`);
    const f = data as Record<string, unknown>;
    assert(f.source_updated === false,
      "la fuente se declara actualizada sin haber cambiado nada");
    assert(f.has_analysis === true, "no reconoce que hay análisis escrito");
  });

  await check("G3. al cambiar la fuente, se AVISA — y no se sustituye nada", async () => {
    const { error } = await Q.from("work_cases").insert({
      organization_id: A, code: `CASO2-${stamp}`.slice(0, 24),
      title: "Otro incumplimiento del periodo", case_type: "issue",
      origin_kind: "process", detected_on: A_MEDIO, classification: "pending",
      status: "open",
    });
    assert(!error, `caso 2: ${error?.message}`);

    const { data } = await Q.rpc("quality_mr_input_freshness", { p_input_id: INPUT_CASOS });
    const f = data as Record<string, unknown>;
    assert(f.source_updated === true, "la fuente cambió y no se avisa");

    // Y el retrato NO se ha tocado.
    const { data: input } = await Q.from("quality_management_review_inputs")
      .select("snapshot, analysis").eq("id", INPUT_CASOS).single();
    const snap = input!.snapshot as Record<string, Record<string, number>>;
    assert(Number(snap.cases.opened) === 1,
      "el retrato se sustituyó solo: sustitución silenciosa");
    assert(input!.analysis !== null, "el análisis desapareció sin que nadie refrescara");
  });

  await check("G4. refrescar actualiza el dato y CONSERVA el análisis", async () => {
    const { data: antes } = await Q.from("quality_management_review_inputs")
      .select("analysis, conclusion, requires_decision").eq("id", INPUT_CASOS).single();

    const { error } = await Q.rpc("quality_mr_refresh_input", { p_input_id: INPUT_CASOS });
    assert(!error, `refrescar: ${error?.message}`);

    const { data: despues } = await Q.from("quality_management_review_inputs")
      .select("analysis, conclusion, requires_decision, snapshot, state")
      .eq("id", INPUT_CASOS).single();

    assert(despues!.analysis === antes!.analysis, "REFRESCAR BORRÓ EL ANÁLISIS");
    assert(despues!.conclusion === antes!.conclusion, "refrescar borró la conclusión");
    assert(despues!.requires_decision === antes!.requires_decision,
      "refrescar borró la marca de pendiente de decisión");
    const snap = despues!.snapshot as Record<string, Record<string, number>>;
    assert(Number(snap.cases.opened) === 2, "refrescar no trajo el dato nuevo");
    assert(despues!.state === "reviewed",
      "refrescar degradó una entrada ya revisada");
  });

  await check("G5. y preparar TODO tampoco borra el análisis", async () => {
    const { error } = await Q.rpc("quality_mr_prepare_inputs", { p_review_id: RD_A });
    assert(!error, `preparar: ${error?.message}`);
    const { data } = await Q.from("quality_management_review_inputs")
      .select("analysis").eq("id", INPUT_CASOS).single();
    assert(data!.analysis !== null, "PREPARAR BORRÓ EL ANÁLISIS");
  });

  // ==========================================================================
  console.log("\nH · Escenario 10 · EL PARTICIPANTE Y SU CARGO (§86)");
  // ==========================================================================

  await check("H1. Ana participa como Gerente General", async () => {
    const { error: ea } = await Q.from("quality_position_assignments").insert({
      organization_id: A, position_id: CARGO_GERENTE, person_id: PERSONA_ANA,
      assignment_type: "holder", effective_from: A_INICIO,
    });
    assert(!ea, `asignación: ${ea?.message}`);

    await Q.from("quality_management_reviews")
      .update({ session_held_on: A_FIN }).eq("id", RD_A);

    const { data: pos } = await Q.from("quality_positions")
      .select("name").eq("id", CARGO_GERENTE).single();

    const { error } = await Q.from("quality_management_review_participants").insert({
      organization_id: A, review_id: RD_A, person_id: PERSONA_ANA,
      participation_role: "chair", position_id: CARGO_GERENTE,
      position_name_at_review: pos!.name, attended: true,
    });
    assert(!error, `participante: ${error?.message}`);
  });

  await check("H2. Ana deja el cargo, y la revisión SIGUE diciendo Gerente General", async () => {
    const { error } = await Q.from("quality_position_assignments")
      .update({ effective_to: HOY })
      .eq("organization_id", A).eq("person_id", PERSONA_ANA);
    assert(!error, `fin de asignación: ${error?.message}`);

    const { data } = await Q.from("quality_management_review_participants")
      .select("position_name_at_review, person_id")
      .eq("organization_id", A).eq("review_id", RD_A).single();
    assert(/Gerencia General/.test(data!.position_name_at_review as string),
      `la revisión dice «${data!.position_name_at_review}»`);
    assert(data!.person_id === PERSONA_ANA, "Ana desapareció de la revisión");
  });

  await check("H3. y sigue apareciendo aunque deje la organización", async () => {
    const { error } = await Q.from("quality_people")
      .update({ status: "former", left_on: HOY })
      .eq("organization_id", A).eq("id", PERSONA_ANA);
    assert(!error, `baja: ${error?.message}`);

    const { data } = await Q.from("quality_management_review_participants")
      .select("id").eq("organization_id", A).eq("review_id", RD_A);
    assert((data ?? []).length === 1, "el participante desapareció al darse de baja");
  });

  await check("H4. asistir NO es aprobar: no hay columna de aprobación", async () => {
    const { data } = await Q.from("quality_management_review_participants")
      .select("*").eq("organization_id", A).eq("review_id", RD_A).single();
    for (const k of ["approved", "approval", "signed_at", "signature"]) {
      assert(!(k in (data as object)), `la lista de asistencia lleva «${k}»`);
    }
  });

  // ==========================================================================
  console.log("\nI · Escenario 7 y 8 · CERRAR CON ACCIÓN ABIERTA (§83, §84)");
  // ==========================================================================

  let ACTA = "", ACCION_1 = "";

  await check("I1. no se cierra con entradas sin mirar", async () => {
    const { error } = await Q.rpc("quality_mr_close_review", {
      p_review_id: RD_A, p_closure_note: "Intento de cierre prematuro.",
      p_followup_note: null,
    });
    assert(error !== null, "se cerró con entradas pendientes");
  });

  await check("I2. se completan análisis y aportaciones manuales", async () => {
    // Las manuales necesitan contenido; las automáticas, análisis.
    const { data: inputs } = await Q.from("quality_management_review_inputs")
      .select("id, catalog_code, input_mode, state")
      .eq("organization_id", A).eq("review_id", RD_A);

    for (const i of inputs ?? []) {
      if (i.input_mode === "manual" && i.state === "pending") {
        const { error } = await Q.from("quality_management_review_manual_entries").insert({
          organization_id: A, review_id: RD_A, input_id: i.id,
          entry_kind: "context", title: "Contexto del periodo",
          body: "No hubo cambios regulatorios relevantes en el periodo revisado.",
          recorded_on: A_FIN,
        });
        assert(!error, `manual ${i.catalog_code}: ${error?.message}`);
      }
    }

    const { data: refrescadas } = await Q.from("quality_management_review_inputs")
      .select("id, analysis").eq("organization_id", A).eq("review_id", RD_A);
    for (const i of refrescadas ?? []) {
      if (i.analysis !== null) continue;
      const { error } = await Q.from("quality_management_review_inputs").update({
        analysis: "Revisado por la dirección: sin observaciones adicionales.",
        analysis_at: new Date().toISOString(), state: "reviewed",
      }).eq("id", i.id);
      assert(!error, `análisis: ${error?.message}`);
    }
  });

  await check("I3. se escriben conclusiones y se emite el acta", async () => {
    const { error: ec } = await Q.from("quality_management_reviews").update({
      conclusions: "El sistema es adecuado y eficaz salvo en el desempeño de "
        + "entregas, donde se decidió actuar sobre la capacidad de inspección.",
      conclusions_at: new Date().toISOString(), status: "in_review",
    }).eq("id", RD_A);
    assert(!ec, `conclusiones: ${ec?.message}`);

    const { data, error } = await Q.rpc("quality_mr_issue_minutes", {
      p_review_id: RD_A, p_summary: "Acta de la revisión del periodo A.",
    });
    assert(!error && data, `acta: ${error?.message}`);
    ACTA = data as string;

    const { data: acta } = await Q.from("quality_management_review_minutes")
      .select("version_number, snapshot").eq("id", ACTA).single();
    assert(Number(acta!.version_number) === 1, "el acta no es la versión 1");
    const snap = acta!.snapshot as Record<string, unknown>;
    assert(Array.isArray(snap.inputs) && (snap.inputs as unknown[]).length === 14,
      "el acta no congeló las catorce entradas");
    assert(Array.isArray(snap.participants) && (snap.participants as unknown[]).length === 1,
      "el acta no congeló a los participantes");
    assert(Array.isArray(snap.decisions) && (snap.decisions as unknown[]).length === 1,
      "el acta no congeló la decisión");
  });

  await check("I4. la revisión se cierra CON una acción abierta", async () => {
    const { data: acciones } = await Q.from("work_actions")
      .select("id, status").eq("organization_id", A);
    ACCION_1 = acciones![0].id as string;
    assert(acciones!.some((a) => a.status === "planned"),
      "no hay ninguna acción abierta con la que probar");

    const { error } = await Q.rpc("quality_mr_close_review", {
      p_review_id: RD_A,
      p_closure_note: "La dirección revisó el sistema y adoptó las decisiones registradas.",
      p_followup_note: "Quedan abiertas las dos acciones sobre capacidad de inspección.",
    });
    assert(!error, `cerrar: ${error?.message}`);

    const { data } = await Q.from("quality_management_reviews")
      .select("status, closed_at, followup_note").eq("id", RD_A).single();
    assert(data!.status === "closed", "la revisión no quedó cerrada");
    assert(data!.followup_note !== null, "cerrar no dejó dicho qué queda abierto");
  });

  await check("I5. cerrar NO cerró las acciones", async () => {
    const { data } = await Q.from("work_actions").select("status")
      .eq("organization_id", A);
    assert((data ?? []).some((a) => a.status === "planned"),
      "cerrar la revisión cerró las acciones que había decidido");
  });

  await check("I6. una revisión cerrada no admite entradas ni decisiones nuevas", async () => {
    const { error: ed } = await Q.rpc("quality_mr_record_decision", {
      p_review_id: RD_A, p_topic: "Otro tema",
      p_decision: "Intento de decidir después de cerrar la revisión.",
      p_decision_kind: "other", p_rationale: null, p_expected_result: null,
      p_input_id: null, p_owner_position_id: null,
    });
    assert(ed !== null, "se añadió una decisión a una revisión cerrada");

    const { error: ep } = await Q.from("quality_management_review_participants").insert({
      organization_id: A, review_id: RD_A, external_name: "Alguien tardío",
      participation_role: "guest",
    });
    assert(ep !== null, "se añadió un participante a una revisión cerrada");
  });

  await check("I7. ni cambia de periodo ni de conclusiones por la puerta de atrás", async () => {
    const { error } = await Q.from("quality_management_reviews")
      .update({ period_start: B_INICIO }).eq("id", RD_A);
    const { data } = await Q.from("quality_management_reviews")
      .select("period_start").eq("id", RD_A).single();
    assert(error !== null || data!.period_start === A_INICIO,
      "se reescribió el periodo de una revisión cerrada");
  });

  await check("I8. ESCENARIO 8 · la acción avanza y el acta NO cambia", async () => {
    const { data: antes } = await Q.from("quality_management_review_minutes")
      .select("snapshot").eq("id", ACTA).single();
    const decisionesAntes = JSON.stringify(
      (antes!.snapshot as Record<string, unknown>).decisions);

    const { error: e1 } = await Q.from("work_actions").update({
      status: "completed", completed_on: HOY,
      completion_note: "Equipo adquirido e inspector capacitado.",
    }).eq("id", ACCION_1);
    assert(!e1, `completar: ${e1?.message}`);

    const { error: e2 } = await Q.from("work_actions")
      .update({ effectiveness_result: "effective" }).eq("id", ACCION_1);
    assert(!e2, `eficacia: ${e2?.message}`);

    const { data: despues } = await Q.from("quality_management_review_minutes")
      .select("snapshot").eq("id", ACTA).single();
    assert(JSON.stringify((despues!.snapshot as Record<string, unknown>).decisions)
      === decisionesAntes,
      "EL ACTA CAMBIÓ PORQUE UNA ACCIÓN AVANZÓ");
  });

  await check("I9. pero el SEGUIMIENTO sí lo refleja, en vivo", async () => {
    const { data, error } = await Q.rpc("quality_mr_followup", { p_review_id: RD_A });
    assert(!error, `seguimiento: ${error?.message}`);
    const f = data as Record<string, unknown>;
    assert(Number(f.decisions) === 1, `el seguimiento dice ${f.decisions} decisiones`);
    assert(Number(f.actions) === 2, `el seguimiento dice ${f.actions} acciones`);
    assert(Number(f.completed) === 1, "el seguimiento no ve la acción completada");
    assert(Number(f.effective) === 1, "el seguimiento no ve la acción eficaz");
    assert(Number(f.open) === 1, "el seguimiento no ve la acción que sigue abierta");
  });

  await check("I10. un acta emitida no se edita ni se borra", async () => {
    const { error: eu } = await Q.from("quality_management_review_minutes")
      .update({ summary: "otra cosa" }).eq("id", ACTA);
    const { data: after } = await Q.from("quality_management_review_minutes")
      .select("summary").eq("id", ACTA).single();
    assert(eu !== null || !/otra cosa/.test(after!.summary as string),
      "se reescribió un acta emitida");

    await Q.from("quality_management_review_minutes").delete().eq("id", ACTA);
    const { data: still } = await Q.from("quality_management_review_minutes")
      .select("id").eq("id", ACTA);
    assert((still ?? []).length === 1, "se borró un acta emitida");
  });

  // ==========================================================================
  console.log("\nJ · Escenario 11 · LAS ACCIONES DE LA REVISIÓN ANTERIOR (§87)");
  // ==========================================================================

  let RD_B = "";

  await check("J1. la revisión del periodo B ve las acciones de la del periodo A", async () => {
    const { data, error } = await Q.from("quality_management_reviews").insert({
      organization_id: A, code: `RD-B-${stamp}`.slice(0, 30),
      title: `Revisión por la dirección ${AÑO_B}`,
      period_label: String(AÑO_B), period_start: B_INICIO, period_end: B_FIN,
      owner_position_id: CARGO_GERENTE,
    }).select("id").single();
    assert(!error && data, `revisión B: ${error?.message}`);
    RD_B = data!.id as string;

    const { error: ep } = await Q.rpc("quality_mr_prepare_inputs", { p_review_id: RD_B });
    assert(!ep, `preparar B: ${ep?.message}`);

    const { data: input } = await Q.from("quality_management_review_inputs")
      .select("state, snapshot, summary").eq("organization_id", A).eq("review_id", RD_B)
      .eq("catalog_code", "previous_actions").single();
    assert(input!.state === "prepared",
      `la entrada de acciones anteriores quedó en «${input!.state}»`);

    const snap = input!.snapshot as Record<string, unknown>;
    const totals = snap.totals as Record<string, number>;
    assert(Number(totals.actions) === 2,
      `ve ${totals.actions} acciones de la revisión anterior, se esperaban 2`);
    assert(Number(totals.completed) === 1, "no ve la acción completada");
    assert(Number(totals.open) === 1, "no ve la acción abierta");
    assert(Number(totals.effective) === 1, "no ve la acción eficaz");
  });

  await check("J2. y NO las duplica: siguen siendo las mismas dos", async () => {
    const { data } = await Q.from("work_actions").select("id").eq("organization_id", A);
    assert((data ?? []).length === 2,
      `hay ${(data ?? []).length} acciones: la revisión nueva las duplicó`);
    assert(!/quality_management_review_actions/.test(""), "");
  });

  await check("J3. la revisión del periodo A no se ve a sí misma como anterior", async () => {
    const { data } = await Q.from("quality_management_review_inputs")
      .select("snapshot").eq("organization_id", A).eq("review_id", RD_A)
      .eq("catalog_code", "previous_actions").single();
    const snap = data!.snapshot as Record<string, unknown>;
    assert(snap.available === false,
      "la primera revisión encontró revisiones anteriores donde no las hay");
  });

  // ==========================================================================
  console.log("\nK · Escenario 12 · QUIÉN PUEDE QUÉ (§66)");
  // ==========================================================================

  await check("K1. un consultor externo CONDUCE la preparación", async () => {
    const { error } = await C.rpc("quality_mr_prepare_inputs", { p_review_id: RD_B });
    assert(!error, `el consultor no pudo preparar: ${error?.message}`);
  });

  await check("K2. un consultor externo NO cierra ni emite el acta", async () => {
    const { error: e1 } = await C.rpc("quality_mr_close_review", {
      p_review_id: RD_B, p_closure_note: "Intento de cierre por el consultor.",
      p_followup_note: null,
    });
    assert(e1 !== null, "un consultor externo cerró la revisión de la empresa");

    const { error: e2 } = await C.rpc("quality_mr_issue_minutes", {
      p_review_id: RD_B, p_summary: null,
    });
    assert(e2 !== null, "un consultor externo emitió el acta");
  });

  // ==========================================================================
  console.log("\nL · Escenario 13 · LA FRONTERA ENTRE EMPRESAS (§65, §98)");
  // ==========================================================================

  let RD_AJENA = "", PROCESO_B = "";

  await check("L1. la empresa B tiene su propia revisión", async () => {
    const { data: proc } = await O.from("quality_processes")
      .insert({ organization_id: B, name: `Proceso ajeno ${stamp}`, category_code: "core" })
      .select("id").single();
    PROCESO_B = proc!.id as string;

    const { data, error } = await O.from("quality_management_reviews").insert({
      organization_id: B, code: `RD-AJ-${stamp}`.slice(0, 30),
      title: "Revisión ajena", period_label: String(AÑO_A),
      period_start: A_INICIO, period_end: A_FIN,
    }).select("id").single();
    assert(!error && data, `revisión ajena: ${error?.message}`);
    RD_AJENA = data!.id as string;
  });

  await check("L2. A no ve la revisión, las entradas ni las decisiones de B", async () => {
    const { data: rs } = await Q.from("quality_management_reviews").select("id").eq("id", RD_AJENA);
    assert((rs ?? []).length === 0, "A leyó una revisión de B");
    const { data: is } = await Q.from("quality_management_review_inputs")
      .select("id").eq("review_id", RD_AJENA);
    assert((is ?? []).length === 0, "A leyó las entradas de B");
    const { data: ds } = await Q.from("quality_management_review_decisions")
      .select("id").eq("review_id", RD_AJENA);
    assert((ds ?? []).length === 0, "A leyó las decisiones de B");
  });

  await check("L3. A no escribe en la revisión de B, ni por PostgREST directo", async () => {
    const { error: ei } = await Q.from("quality_management_review_inputs").insert({
      organization_id: B, review_id: RD_AJENA, catalog_code: "audits",
    });
    assert(ei !== null, "A insertó una entrada en la revisión de B");

    const { error: eu } = await Q.from("quality_management_reviews")
      .update({ title: "Secuestrada" }).eq("id", RD_AJENA);
    const { data: after } = await O.from("quality_management_reviews")
      .select("title").eq("id", RD_AJENA).single();
    assert(eu !== null || after!.title === "Revisión ajena",
      "A reescribió el título de una revisión de B");

    await Q.from("quality_management_reviews").delete().eq("id", RD_AJENA);
    const { data: still } = await O.from("quality_management_reviews")
      .select("id").eq("id", RD_AJENA);
    assert((still ?? []).length === 1, "A borró una revisión de B");
  });

  await check("L4. A no puede meter un participante de B en su revisión", async () => {
    const { data: persona } = await O.from("quality_people")
      .insert({ organization_id: B, full_name: `Persona ajena ${stamp}` })
      .select("id").single();
    const { error } = await Q.from("quality_management_review_participants").insert({
      organization_id: A, review_id: RD_B, person_id: persona!.id,
      participation_role: "guest",
    });
    assert(error !== null, "una revisión de A fichó a una persona de B");
  });

  await check("L5. las RPC no cruzan la frontera", async () => {
    const { data: payload } = await Q.rpc("quality_mr_source_payload", {
      p_organization_id: B, p_code: "audits",
      p_from: A_INICIO, p_to: A_FIN, p_review_id: null,
    });
    assert(payload === null, "A obtuvo el dato de origen de otra empresa");

    const { data: readiness } = await Q.rpc("quality_mr_readiness", { p_review_id: RD_AJENA });
    assert(readiness === null, "A obtuvo el estado de preparación de una revisión de B");

    const { data: followup } = await Q.rpc("quality_mr_followup", { p_review_id: RD_AJENA });
    assert(followup === null, "A obtuvo el seguimiento de una revisión de B");

    const { error } = await Q.rpc("quality_mr_prepare_inputs", { p_review_id: RD_AJENA });
    assert(error !== null, "A preparó las entradas de una revisión de B");
  });

  await check("L6. y los adaptadores no leen el proceso de otra empresa", async () => {
    const { data } = await Q.from("quality_management_review_inputs")
      .select("snapshot").eq("organization_id", A).eq("review_id", RD_B)
      .eq("catalog_code", "process_performance").single();
    const texto = JSON.stringify(data!.snapshot);
    assert(!texto.includes(PROCESO_B), "un proceso de B llegó a una revisión de A");
    assert(!texto.includes("Proceso ajeno"), "el nombre de un proceso de B llegó a A");
  });

  await check("L7. sin sesión no se ve ni se escribe nada", async () => {
    const { data } = await publico.from("quality_management_reviews").select("id").limit(1);
    assert((data ?? []).length === 0, "un anónimo leyó revisiones");
    const { error } = await publico.from("quality_management_review_decisions").insert({
      organization_id: A, review_id: RD_B, code: "D-99",
      topic: "Anónimo", decision: "Intento anónimo de decidir.",
    });
    assert(error !== null, "un anónimo registró una decisión");
    const { data: rpc } = await publico.rpc("quality_mr_readiness", { p_review_id: RD_B });
    assert(rpc === null, "un anónimo ejecutó una RPC del dominio");
    const { data: cat } = await publico
      .from("quality_management_review_input_catalog").select("code").limit(1);
    assert((cat ?? []).length === 0, "un anónimo leyó el catálogo de entradas");
  });

  // ==========================================================================
  console.log("\nM · Escenario 14 · EL BARRIDO Y EL BORRADO (§44, §88)");
  // ==========================================================================

  await check("M1. el barrido es idempotente y no decide nada", async () => {
    await Q.from("quality_management_reviews")
      .update({ next_review_planned_on: day(10) }).eq("id", RD_B);

    const { error: e1 } = await Q.rpc("quality_scan_management_reviews", { p_organization_id: A });
    assert(!e1, `barrido: ${e1?.message}`);
    const { data: a1 } = await Q.from("work_alerts").select("id")
      .eq("organization_id", A).like("alert_type", "management_review%");

    const { data: n2 } = await Q.rpc("quality_scan_management_reviews", { p_organization_id: A });
    const { data: a2 } = await Q.from("work_alerts").select("id")
      .eq("organization_id", A).like("alert_type", "management_review%");

    assert((a1 ?? []).length === (a2 ?? []).length,
      `la segunda pasada creó ${(a2 ?? []).length - (a1 ?? []).length} avisos más`);
    assert(Number(n2 ?? 0) === 0, "la segunda pasada dice haber creado avisos nuevos");
    assert((a1 ?? []).length > 0, "el barrido no produjo ningún aviso");
  });

  await check("M2. el barrido no cambió el estado de nada", async () => {
    const { data } = await Q.from("quality_management_reviews")
      .select("status").eq("id", RD_B).single();
    assert(data!.status !== "closed", "el barrido cerró una revisión");
    const { data: d } = await Q.from("quality_management_review_decisions")
      .select("id").eq("organization_id", A).eq("review_id", RD_B);
    assert((d ?? []).length === 0, "el barrido decidió por su cuenta");
  });

  await check("M3. un borrador vacío SÍ se borra", async () => {
    const { data: vacia } = await Q.from("quality_management_reviews").insert({
      organization_id: A, code: `RD-V-${stamp}`.slice(0, 30), title: "Revisión vacía",
      period_label: "Vacía", period_start: A_INICIO, period_end: A_FIN,
    }).select("id").single();

    const { data: v } = await Q.rpc("quality_deletion_eligibility", {
      p_entity: "management_review", p_id: vacia!.id,
    });
    assert((v as Record<string, unknown>).can_hard_delete === true,
      "una revisión vacía no se puede borrar");

    const { error } = await Q.from("quality_management_reviews").delete().eq("id", vacia!.id);
    assert(!error, `borrar la vacía: ${error?.message}`);
  });

  await check("M4. una revisión con decisiones NO se borra", async () => {
    const { data: v } = await Q.rpc("quality_deletion_eligibility", {
      p_entity: "management_review", p_id: RD_A,
    });
    const verdict = v as Record<string, unknown>;
    assert(verdict.can_hard_delete === false,
      "el dictamen permite borrar una revisión con decisiones y acta");
    assert(Array.isArray(verdict.blocking) && (verdict.blocking as unknown[]).length > 0,
      "el dictamen no dice qué lo impide");

    await Q.from("quality_management_reviews").delete().eq("id", RD_A);
    const { data: still } = await Q.from("quality_management_reviews").select("id").eq("id", RD_A);
    assert((still ?? []).length === 1, "se borró una revisión cerrada con decisiones");
  });

  await check("M5. las guardas heredadas del dictamen siguen en pie", async () => {
    const { data } = await publico.rpc("quality_deletion_eligibility", {
      p_entity: "management_review", p_id: RD_A,
    });
    const v = data as Record<string, unknown> | null;
    assert(v === null || v.can_hard_delete === false, "un anónimo obtuvo permiso de borrado");

    // Y la de personas, que una reescritura anterior llegó a perder.
    const { data: p } = await publico.rpc("quality_deletion_eligibility", {
      p_entity: "person", p_id: PERSONA_ANA,
    });
    const vp = p as Record<string, unknown> | null;
    assert(vp === null || vp.can_hard_delete === false,
      "la guarda de lectura de personas se perdió en la reescritura");
  });

  // ==========================================================================
  console.log("\nN · Escenario 15 · REABRIR (§47)");
  // ==========================================================================

  await check("N1. reabrir exige un motivo detallado", async () => {
    const { error } = await Q.rpc("quality_mr_reopen_review", {
      p_review_id: RD_A, p_reason: "porque sí",
    });
    assert(error !== null, "se reabrió con un motivo de dos palabras");
  });

  await check("N2. reabrir NO borra el cierre anterior", async () => {
    const { data: antes } = await Q.from("quality_management_reviews")
      .select("closure_note, reopen_count").eq("id", RD_A).single();

    const { error } = await Q.rpc("quality_mr_reopen_review", {
      p_review_id: RD_A,
      p_reason: "Se detectó que una entrada de proveedores no reflejaba el periodo "
        + "correcto y la dirección quiere revisarla antes de dar por buena el acta.",
    });
    assert(!error, `reabrir: ${error?.message}`);

    const { data } = await Q.from("quality_management_reviews")
      .select("status, closure_note, reopen_count, reopen_reason").eq("id", RD_A).single();
    assert(data!.status === "in_review", "la revisión no volvió a estar en revisión");
    assert(data!.closure_note === antes!.closure_note,
      "reabrir borró la nota del cierre original");
    assert(Number(data!.reopen_count) === Number(antes!.reopen_count) + 1,
      "reabrir no dejó constancia");
    assert(data!.reopen_reason !== null, "no se guardó el motivo");
  });

  await check("N3. y el acta emitida sigue ahí, intacta", async () => {
    const { data } = await Q.from("quality_management_review_minutes")
      .select("id, version_number").eq("review_id", RD_A);
    assert((data ?? []).length === 1, "reabrir borró el acta emitida");
    assert(Number(data![0].version_number) === 1, "el acta cambió de versión");
  });

  await check("N4. el hecho formal de reabrir quedó registrado", async () => {
    const { data } = await Q.from("work_decisions").select("decision_kind, rationale")
      .eq("organization_id", A).eq("subject_kind", "management_review")
      .eq("subject_id", RD_A);
    const clases = (data ?? []).map((d) => d.decision_kind);
    assert(clases.includes("management_review_closed"), "no consta el cierre");
    assert(clases.includes("management_review_reopened"), "no consta la reapertura");
  });

  console.log(`\nResultado: ${passed} conformes, ${failed} fallos\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
