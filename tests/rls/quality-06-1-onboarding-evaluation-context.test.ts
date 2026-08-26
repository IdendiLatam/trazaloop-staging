/**
 * Trazaloop · QUALITY-06.1 · Onboarding y contexto, contra base real.
 *
 * Esta suite ejercita LA MISMA derivación que corre en producción: importa
 * `getOnboarding` y `getEvaluationContext` y les pasa el cliente de un usuario
 * real. No reimplementa las consultas — reimplementarlas habría probado una
 * copia, y la copia siempre acaba siendo más amable que el original.
 *
 * Lo que se demuestra aquí solo se puede demostrar ejecutándolo:
 *
 *   · el onboarding usa el perfil que regía en la FECHA de la asignación, no el
 *     último publicado;
 *   · funciona con una persona SIN cuenta de Trazaloop;
 *   · el contexto habla de procesos, viene del periodo evaluado, y cambiar un
 *     indicador NO mueve ni un carácter del resultado formal;
 *   · un consultor no puede abrir ni la evaluación ni su contexto;
 *   · y otra empresa no obtiene nada, ni pasando identificadores conocidos.
 */
import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) {
  console.error("Faltan variables para test:quality061-rls (URL, ANON, SERVICE_ROLE).");
  process.exit(1);
}

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
async function check(n: string, fn: () => Promise<void>) {
  try { await fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const day = (o: number) => iso(new Date(Date.now() + o * 86_400_000));

/**
 * Un mes natural completo, desplazado respecto del actual.
 *
 * QUALITY-03 exige que el periodo de una medición cuadre con la periodicidad
 * del indicador, así que aquí no vale una ventana de treinta días: tiene que
 * ser un mes de calendario.
 */
function monthPeriod(offset: number): { start: string; end: string } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset + 1, 0));
  return { start: iso(start), end: iso(end) };
}

async function newUser(label: string, name: string) {
  const email = `q061-${label}-${stamp}@test.trazaloop.dev`;
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

async function main() {
  console.log("\nQUALITY-06.1 · base real\n");

  // Import dinámico: estos módulos son `server-only` y la suite corre con
  // `--conditions=react-server` para poder cargarlos. Se importan AQUÍ y no
  // arriba porque el nivel superior de este archivo se compila a CJS.
  const { getOnboarding } = await import("../../lib/db/quality-onboarding");
  const { getEvaluationContext } = await import("../../lib/db/quality-evaluation-context");

  const owner = await newUser("adm", "Directora");
  const quality = await newUser("cal", "Coordinadora de Calidad");
  const consultant = await newUser("con", "Consultor externo");
  const outsider = await newUser("out", "Ajena");
  for (const u of [owner, quality, consultant, outsider]) {
    await u.client.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "q061" });
  }
  const { data: a } = await owner.client.rpc("create_organization", { p_name: `Q061 A ${stamp}` });
  const { data: b } = await outsider.client.rpc("create_organization", { p_name: `Q061 B ${stamp}` });
  const A = a as string, B = b as string;

  await admin.from("memberships").insert([
    { organization_id: A, user_id: quality.id, role_code: "quality", status: "active" },
    { organization_id: A, user_id: consultant.id, role_code: "consultant", status: "active" },
  ]);

  const Q: SupabaseClient = quality.client;
  const C: SupabaseClient = consultant.client;
  const O: SupabaseClient = outsider.client;

  await Q.rpc("quality_seed_competency_levels", { p_organization_id: A });

  // --- catálogo -----------------------------------------------------------
  const { data: audit } = await Q.from("quality_competencies")
    .insert({ organization_id: A, name: `Auditoría interna ${stamp}`, code: "AUD" })
    .select("id").single();
  const { data: docs } = await Q.from("quality_competencies")
    .insert({ organization_id: A, name: `Gestión documental ${stamp}`, code: "GD" })
    .select("id").single();
  const AUDIT = audit!.id as string, GESTDOC = docs!.id as string;

  // --- cargo con perfil v1 ------------------------------------------------
  const { data: pos } = await Q.from("quality_positions")
    .insert({ organization_id: A, name: `Coordinador de Calidad ${stamp}`, code: "COORD" })
    .select("id").single();
  const COORD = pos!.id as string;

  const V1_DESDE = day(-200);
  const { data: v1 } = await Q.from("quality_position_versions")
    .insert({ organization_id: A, position_id: COORD, version_number: 1,
              purpose: "Coordinar el sistema de gestión" })
    .select("id").single();
  await Q.from("quality_competency_requirements").insert([
    { organization_id: A, position_version_id: v1!.id, competency_id: AUDIT, required_level: 2 },
    { organization_id: A, position_version_id: v1!.id, competency_id: GESTDOC, required_level: 2 },
  ]);
  await Q.from("quality_position_functions").insert({
    organization_id: A, position_version_id: v1!.id,
    description: "Responder por el programa de auditorías internas",
    function_kind: "responsibility",
  });
  await Q.rpc("quality_publish_position_version", {
    p_version_id: v1!.id, p_effective_from: V1_DESDE, p_change_note: "Perfil inicial",
  });

  // --- proceso, documento y conocimiento del cargo ------------------------
  const { data: proc } = await Q.from("quality_processes")
    .insert({ organization_id: A, name: `Gestión de Compras ${stamp}`,
              category_code: "core", owner_position_id: COORD })
    .select("id").single();
  const COMPRAS = proc!.id as string;

  const { data: doc } = await Q.from("trazadoc_documents")
    .insert({ organization_id: A, module_key: "quality", title: `PROC-01 Compras ${stamp}`,
              code: `PROC-01-${stamp.slice(-5)}`, source_type: "builder" })
    .select("id").single();
  if (doc) {
    await Q.from("quality_process_documents").insert({
      organization_id: A, process_id: COMPRAS, document_id: doc.id, relation_type: "governs",
    });
  }

  const { data: know } = await Q.from("quality_knowledge_items")
    .insert({ organization_id: A, title: `Trato con el proveedor crítico ${stamp}`,
              knowledge_kind: "tacit", criticality: "high", process_id: COMPRAS })
    .select("id").single();

  // --- Ana, SIN cuenta ----------------------------------------------------
  const { data: ana } = await Q.from("quality_people")
    .insert({ organization_id: A, full_name: "Ana Pérez" })
    .select("id, profile_id").single();
  const ANA = ana!.id as string;

  await Q.rpc("quality_record_person_competence", {
    p_person_id: ANA, p_competency_id: AUDIT, p_level: 2, p_method: "practical_assessment",
    p_rationale: "Auditoría acompañada", p_assessed_on: day(-150), p_valid_until: null,
  });
  await Q.rpc("quality_record_person_competence", {
    p_person_id: ANA, p_competency_id: GESTDOC, p_level: 2, p_method: "observation",
    p_rationale: "Gestión documental observada", p_assessed_on: day(-150), p_valid_until: null,
  });

  const { data: asg } = await Q.from("quality_position_assignments")
    .insert({ organization_id: A, position_id: COORD, person_id: ANA,
              assignment_type: "holder", effective_from: day(-120) })
    .select("id").single();
  const ASG = asg!.id as string;

  // ==========================================================================
  console.log("A · Escenario de onboarding (§31)");
  // ==========================================================================

  await check("A1. el onboarding se construye y nombra el cargo correcto", async () => {
    const v = await getOnboarding(A, ASG, Q);
    assert(v, "no se pudo construir el onboarding");
    assert(v!.position.id === COORD, "el onboarding apunta a otro cargo");
    assert(v!.person.id === ANA, "el onboarding apunta a otra persona");
    assert(v!.assignment.effectiveFrom === day(-120), "la fecha efectiva no es la de la asignación");
  });

  await check("A2. §33 · funciona con una persona SIN cuenta de Trazaloop", async () => {
    assert(ana!.profile_id === null, "Ana no debería tener cuenta en este escenario");
    const v = await getOnboarding(A, ASG, Q);
    assert(v && v.person.hasAccount === false, "el onboarding cree que Ana tiene cuenta");
    // Y aun así trae todo lo demás.
    assert(v!.profile !== null, "sin cuenta, el perfil dejó de resolverse");
    assert(v!.competencies.length === 2, "sin cuenta, las competencias dejaron de derivarse");
  });

  await check("A3. el perfil aplicable es el v1, con sus dos requisitos", async () => {
    const v = await getOnboarding(A, ASG, Q);
    assert(v!.profile?.versionNumber === 1, "no se resolvió la versión 1 del perfil");
    assert(v!.currentProfile === null, "hoy debería regir la misma versión");
    assert(v!.functions.length === 1, "la función del perfil no aparece");
  });

  await check("A4. Auditoría sin brecha y Gestión documental sin brecha (aún)", async () => {
    const v = await getOnboarding(A, ASG, Q);
    for (const c of v!.competencies) {
      assert(c.gap === 0, `«${c.name}» no debería tener brecha con el perfil v1: ${c.gap}`);
      assert(c.demonstratedLevel === 2, `«${c.name}» debería mostrar nivel 2 demostrado`);
      assert(c.method !== null, "no se dice cómo se demostró");
    }
  });

  await check("A5. los procesos y documentos salen de relaciones REALES", async () => {
    const v = await getOnboarding(A, ASG, Q);
    assert(v!.processes.length === 1 && v!.processes[0].id === COMPRAS,
      "el proceso del que el cargo es propietario no aparece");
    assert(v!.processes[0].source === "position", "no se dice por qué aparece el proceso");
    if (doc) {
      const d = v!.documents.find((x) => x.id === doc.id);
      assert(d, "el documento relacionado con el proceso no aparece");
      assert(d!.source === "process" && d!.via?.includes("Compras"),
        "no se dice que el documento llega por el proceso");
    }
  });

  await check("A6. el conocimiento del proceso aparece como «debería recibirlo»", async () => {
    const v = await getOnboarding(A, ASG, Q);
    const k = v!.knowledge.find((x) => x.id === know!.id);
    assert(k, "el conocimiento del proceso del cargo no aparece");
    assert(k!.state === "to_receive", `estado inesperado: ${k!.state}`);
  });

  await check("A7. y cambia a «ya lo sostiene» cuando se registra el holder", async () => {
    await Q.from("quality_knowledge_holders").insert({
      organization_id: A, knowledge_item_id: know!.id, person_id: ANA,
      holder_level: "holder", is_primary_holder: true, since_on: day(-100),
    });
    const v = await getOnboarding(A, ASG, Q);
    const k = v!.knowledge.find((x) => x.id === know!.id);
    assert(k!.state === "holder", `estado inesperado tras registrar el holder: ${k!.state}`);
  });

  // ==========================================================================
  console.log("\nB · Escenario histórico (§32)");
  // ==========================================================================

  await check("B1. se publica el perfil v2 exigiendo Auditoría 3", async () => {
    const { data: v2 } = await Q.from("quality_position_versions")
      .insert({ organization_id: A, position_id: COORD, version_number: 2,
                purpose: "Perfil revisado", change_note: "Sube auditoría a 3" })
      .select("id").single();
    await Q.from("quality_competency_requirements").insert([
      { organization_id: A, position_version_id: v2!.id, competency_id: AUDIT, required_level: 3 },
      { organization_id: A, position_version_id: v2!.id, competency_id: GESTDOC, required_level: 2 },
    ]);
    const { error } = await Q.rpc("quality_publish_position_version", {
      p_version_id: v2!.id, p_effective_from: day(-10), p_change_note: "Sube a 3",
    });
    assert(!error, `publicar v2: ${error?.message}`);
  });

  await check("B2. el onboarding de la asignación original SIGUE diciendo v1 / requerido 2", async () => {
    const v = await getOnboarding(A, ASG, Q);
    assert(v!.profile?.versionNumber === 1,
      `publicar la v2 reescribió el onboarding: ahora dice v${v!.profile?.versionNumber}`);
    const aud = v!.competencies.find((c) => c.competencyId === AUDIT);
    assert(aud!.requiredLevel === 2, `el requisito de entonces cambió a ${aud!.requiredLevel}`);
    assert(aud!.gap === 0, "una persona que cumplía pasó a figurar como incumplida");
  });

  await check("B3. pero la expectativa de HOY se muestra aparte, sin sustituir nada", async () => {
    const v = await getOnboarding(A, ASG, Q);
    assert(v!.currentProfile?.versionNumber === 2, "no se dice que hoy rige otra versión");
    const aud = v!.competencies.find((c) => c.competencyId === AUDIT);
    assert(aud!.currentRequiredLevel === 3,
      `la expectativa vigente debería ser 3 y es ${aud!.currentRequiredLevel}`);
    const gd = v!.competencies.find((c) => c.competencyId === GESTDOC);
    assert(gd!.currentRequiredLevel === null,
      "gestión documental no cambió: no debería mostrar expectativa distinta");
  });

  await check("B4. una asignación NUEVA bajo la v2 sí arranca con la brecha", async () => {
    const { data: carlos } = await Q.from("quality_people")
      .insert({ organization_id: A, full_name: "Carlos López" }).select("id").single();
    await Q.from("quality_position_assignments")
      .update({ effective_to: day(-6) }).eq("id", ASG);
    const { data: nueva, error } = await Q.from("quality_position_assignments")
      .insert({ organization_id: A, position_id: COORD, person_id: carlos!.id,
                assignment_type: "holder", effective_from: day(-5) })
      .select("id").single();
    assert(!error && nueva, `asignar a Carlos: ${error?.message}`);
    const v = await getOnboarding(A, nueva!.id as string, Q);
    assert(v!.profile?.versionNumber === 2, "la asignación nueva no toma el perfil vigente");
    const aud = v!.competencies.find((c) => c.competencyId === AUDIT);
    assert(aud!.requiredLevel === 3, "el requisito de la asignación nueva no es el de la v2");
    assert(aud!.gap === 3, `sin competencia declarada la brecha debería ser 3 y es ${aud!.gap}`);
    // Y el onboarding de Ana no se movió.
    const deAna = await getOnboarding(A, ASG, Q);
    assert(deAna!.profile?.versionNumber === 1, "el onboarding de Ana cambió al asignar a otro");
  });

  await check("B5. el recuento de pendientes es derivado y explicable", async () => {
    const v = await getOnboarding(A, ASG, Q);
    const suma = v!.pending.competencyGaps + v!.pending.developmentOpen
      + v!.pending.knowledgeToReceive + v!.pending.openTasks;
    assert(v!.pending.total === suma, "el total de pendientes no es la suma de sus partes");
    // Y el checklist tiene una línea informativa por los documentos, que NO
    // cuenta como pendiente porque no se puede demostrar la lectura.
    const info = v!.checklist.filter((l) => l.state === "informational");
    if (v!.documents.length > 0) {
      assert(info.length >= 1, "los documentos no aparecen como línea informativa");
    }
    assert(!v!.checklist.some((l) => /le[íi]do/i.test(l.text)),
      "aparece una casilla de documento leído");
  });

  // ==========================================================================
  console.log("\nC · Contexto operacional (§34)");
  // ==========================================================================

  let EVALUACION = "";
  let INDICADOR = "";
  let MEDICION = "";

  await check("C1. se prepara el ciclo, la evaluación y un indicador del proceso", async () => {
    const { data: cy } = await Q.from("quality_performance_cycles")
      .insert({ organization_id: A, name: `Ciclo ${stamp}`,
                period_start: day(-300), period_end: day(30), status: "open" })
      .select("id").single();
    await Q.from("quality_performance_cycle_members")
      .insert({ organization_id: A, cycle_id: cy!.id, person_id: ANA });

    const { data: evaluador } = await Q.from("quality_people")
      .insert({ organization_id: A, full_name: "Directora Evaluadora" }).select("id").single();
    const { data: ev, error: eEv } = await Q.from("quality_performance_evaluations")
      .insert({ organization_id: A, cycle_id: cy!.id, person_id: ANA, position_id: COORD,
                evaluator_person_id: evaluador!.id })
      .select("id").single();
    assert(!eEv && ev, `evaluación: ${eEv?.message}`);
    EVALUACION = ev!.id as string;

    const { data: ind, error: eInd } = await Q.from("quality_indicators")
      .insert({ organization_id: A, code: `IND-${stamp.slice(-5)}`,
                name: "Cumplimiento de entregas", scope_type: "process",
                scope_process_id: COMPRAS, owner_position_id: COORD,
                // Un indicador en borrador no admite mediciones: se crea activo
                // porque lo que aquí se prueba es el contexto, no el ciclo de
                // vida del indicador, que ya cubre QUALITY-03.
                admin_state: "active" })
      .select("id").single();
    assert(!eInd && ind, `indicador: ${eInd?.message}`);
    INDICADOR = ind!.id as string;

    // La configuración y la medición NO se escriben a mano: QUALITY-03 las
    // reservó a sus RPC, y la sesión no tiene privilegio sobre esas tablas.
    // Pasar por la vía real es además lo que hace válida esta prueba.
    const { data: cfgId, error: eCfg } = await Q.rpc("quality_publish_indicator_config", {
      p_indicator_id: INDICADOR, p_effective_from: day(-300),
      p_unit_code: "percent", p_direction: "higher_is_better", p_frequency: "monthly",
      p_target_value: 95, p_target_min: null, p_target_max: null,
      p_warning_value: null, p_warning_min: null, p_warning_max: null,
      p_source_kind: "manual", p_source_key: null, p_calc_definition: null,
      p_formula_text: null, p_unit_label: "%", p_source_note: null,
      p_consolidation: "none", p_comparability_break: false,
      p_comparability_note: null, p_change_note: "Configuración inicial",
    });
    assert(!eCfg && cfgId, `configuración: ${eCfg?.message}`);

    const { data: medId, error: eM } = await Q.rpc("quality_record_measurement", {
      p_indicator_id: INDICADOR,
      p_period_start: monthPeriod(-2).start, p_period_end: monthPeriod(-2).end,
      p_value: 82, p_data_state: "reported", p_components: null, p_note: null,
    });
    assert(!eM && medId, `medición: ${eM?.message}`);
    MEDICION = medId as string;
  });

  await check("C2. el panel trae el indicador DEL PROCESO, con su valor y su meta", async () => {
    const ctx = await getEvaluationContext(A, EVALUACION, Q);
    assert(ctx, "no se pudo construir el contexto");
    assert(ctx!.position?.id === COORD, "el contexto no parte del cargo evaluado");
    assert(ctx!.processes.some((p) => p.id === COMPRAS), "el proceso del cargo no aparece");
    const linea = ctx!.lines.find((l) => l.kind === "indicator" && l.label.includes("Cumplimiento"));
    assert(linea, "el indicador del proceso no aparece en el contexto");
    assert(linea!.value.startsWith("82"), `el valor debería ser 82 y es «${linea!.value}»`);
    assert((linea!.detail ?? "").includes("95"), "no se muestra la meta");
    assert(linea!.temporality === "period", "el dato no se declara del periodo evaluado");
  });

  await check("C3. §19 · la línea habla del PROCESO, no de la persona", async () => {
    const ctx = await getEvaluationContext(A, EVALUACION, Q);
    for (const l of ctx!.lines) {
      assert(!/Ana Pérez/.test(l.subject), `una línea atribuye el dato a la persona: ${l.subject}`);
      assert(!/desempeño de/i.test(`${l.label} ${l.value}`),
        "una línea redacta el dato como desempeño de alguien");
    }
    const ind = ctx!.lines.find((l) => l.kind === "indicator");
    assert(/^Proceso /.test(ind!.subject), `el sujeto debería ser el proceso: ${ind!.subject}`);
  });

  await check("C4. no hay ningún puntaje agregado en el contexto", async () => {
    const ctx = await getEvaluationContext(A, EVALUACION, Q);
    const json = JSON.stringify(ctx);
    for (const p of ["score", "puntaje", "calificacion", "rating"]) {
      assert(!new RegExp(p, "i").test(json), `el contexto devuelve «${p}»`);
    }
  });

  await check("C5. una medición FUERA del periodo no entra como si fuera de él", async () => {
    const { error } = await Q.rpc("quality_record_measurement", {
      p_indicator_id: INDICADOR,
      p_period_start: monthPeriod(13).start, p_period_end: monthPeriod(13).end,
      p_value: 10, p_data_state: "reported", p_components: null, p_note: null,
    });
    assert(!error, `medición posterior: ${error?.message}`);
    const ctx = await getEvaluationContext(A, EVALUACION, Q);
    const lineas = ctx!.lines.filter((l) => l.kind === "indicator");
    assert(!lineas.some((l) => l.value.startsWith("10")),
      "una medición fuera del periodo evaluado se coló en el contexto");
  });

  await check("C6. §22 · el contexto también trae lo favorable", async () => {
    const ctx = await getEvaluationContext(A, EVALUACION, Q);
    const buenas = ctx!.lines.filter((l) => l.tone === "good");
    // Las dos competencias de Ana se declararon dentro del periodo del ciclo.
    assert(buenas.length >= 1,
      "el panel no muestra nada favorable: sería un expediente, no un contexto");
    assert(buenas.some((l) => l.kind === "competence"),
      "la competencia declarada en el periodo no aparece como contexto favorable");
  });

  // ==========================================================================
  console.log("\nD · Negative test (§35)");
  // ==========================================================================

  await check("D1. cambiar el indicador de 82 a 20 NO mueve el resultado formal", async () => {
    await Q.from("quality_performance_items").insert({
      organization_id: A, evaluation_id: EVALUACION,
      criterion: "Cierre de hallazgos en plazo", result: "meets",
      observation: "Sin incidencias",
    });
    const antes = await Q.from("quality_performance_evaluations")
      .select("status, summary, evaluated_on").eq("id", EVALUACION).single();
    const itemsAntes = await Q.from("quality_performance_items")
      .select("result, observation").eq("evaluation_id", EVALUACION);

    // Corregir es la vía real: QUALITY-03 no deja pisar una medición, la
    // sustituye. Da igual: lo que se comprueba es que la evaluación no se
    // entere.
    const { error } = await Q.rpc("quality_correct_measurement", {
      p_measurement_id: MEDICION, p_value: 20, p_data_state: "reported",
      p_reason: "Corrección para la prueba negativa", p_components: null,
    });
    assert(!error, `corregir la medición: ${error?.message}`);

    const despues = await Q.from("quality_performance_evaluations")
      .select("status, summary, evaluated_on").eq("id", EVALUACION).single();
    const itemsDespues = await Q.from("quality_performance_items")
      .select("result, observation").eq("evaluation_id", EVALUACION);

    assert(JSON.stringify(antes.data) === JSON.stringify(despues.data),
      "la evaluación cambió al cambiar un indicador");
    assert(JSON.stringify(itemsAntes.data) === JSON.stringify(itemsDespues.data),
      "el resultado de una línea cambió al cambiar un indicador");
  });

  await check("D2. y el contexto sí refleja el dato nuevo, porque es contexto", async () => {
    const ctx = await getEvaluationContext(A, EVALUACION, Q);
    const linea = ctx!.lines.find((l) => l.kind === "indicator" && l.label.includes("Cumplimiento"));
    assert(linea!.value.startsWith("20"), "el contexto no se actualizó con el dato real");
  });

  await check("D3. cerrar la evaluación sigue exigiendo una decisión humana", async () => {
    const { error } = await Q.rpc("quality_close_performance_evaluation", {
      p_evaluation_id: EVALUACION, p_summary: "Cumple, con contexto del proceso",
    });
    assert(!error, `cerrar: ${error?.message}`);
    const { data } = await Q.from("quality_performance_evaluations")
      .select("status, summary").eq("id", EVALUACION).single();
    assert(data!.status === "closed", "la evaluación no quedó cerrada");
    assert(data!.summary === "Cumple, con contexto del proceso",
      "la conclusión que escribió la persona se perdió");
  });

  // ==========================================================================
  console.log("\nE · Usuario restringido (§37)");
  // ==========================================================================

  await check("E1. el consultor NO obtiene el contexto de la evaluación", async () => {
    const ctx = await getEvaluationContext(A, EVALUACION, C);
    assert(ctx === null,
      "un consultor con acceso general a Quality obtuvo el contexto de una evaluación");
  });

  await check("E2. ni el onboarding, que depende de la ficha de la persona", async () => {
    const v = await getOnboarding(A, ASG, C);
    assert(v === null, "un consultor abrió el onboarding de una persona");
  });

  await check("E3. y quien administra personas sí obtiene los dos", async () => {
    assert(await getEvaluationContext(A, EVALUACION, Q), "quality perdió el contexto");
    assert(await getOnboarding(A, ASG, Q), "quality perdió el onboarding");
  });

  // ==========================================================================
  console.log("\nF · Cross-tenant (§36)");
  // ==========================================================================

  await check("F1. otra empresa no obtiene el onboarding, ni con el identificador correcto", async () => {
    assert(await getOnboarding(A, ASG, O) === null,
      "una empresa ajena construyó el onboarding de otra");
    assert(await getOnboarding(B, ASG, O) === null,
      "pasar la empresa propia con una asignación ajena devolvió algo");
  });

  await check("F2. ni el contexto de la evaluación", async () => {
    assert(await getEvaluationContext(A, EVALUACION, O) === null,
      "una empresa ajena obtuvo el contexto de una evaluación de otra");
    assert(await getEvaluationContext(B, EVALUACION, O) === null,
      "pasar la empresa propia con una evaluación ajena devolvió algo");
  });

  await check("F3. §24 · una empresa arbitraria en el parámetro no abre nada", async () => {
    // Quien SÍ pertenece a A, pero pasa la empresa B: no obtiene datos de B.
    assert(await getOnboarding(B, ASG, Q) === null,
      "se pudo mezclar la empresa del parámetro con la asignación");
    const ctx = await getEvaluationContext(B, EVALUACION, Q);
    assert(ctx === null, "se pudo mezclar la empresa del parámetro con la evaluación");
  });

  await check("F4. §38 · las proyecciones no abren ningún bypass de RLS", async () => {
    // La derivación usa las MISMAS tablas que RLS protege. Con la sesión ajena,
    // cada consulta devuelve vacío, así que el resultado es vacío — no un error
    // que revele qué existe.
    for (const tabla of ["quality_position_assignments", "quality_people",
                         "quality_processes", "quality_knowledge_items",
                         "quality_performance_evaluations", "quality_measurements"]) {
      const { data } = await O.from(tabla).select("id").eq("organization_id", A);
      assert((data ?? []).length === 0, `${tabla} se leyó desde otra empresa`);
    }
  });

  console.log(`\nResultado: ${passed} conformes, ${failed} fallos\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
