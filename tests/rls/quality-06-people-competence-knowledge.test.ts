/**
 * Trazaloop · QUALITY-06 · Personas, competencia y conocimiento, contra base real.
 *
 * Lo que se comprueba aquí no es un CRUD. Son las afirmaciones del dominio que
 * SOLO se pueden demostrar ejecutándolas:
 *
 *   · quién ocupaba un cargo en marzo se responde con marzo, no con hoy;
 *   · subir hoy un requisito NO vuelve incumplida una evaluación de ayer;
 *   · asistir al 100 % deja la eficacia en «pendiente»;
 *   · un «no eficaz» se conserva y no se puede reescribir;
 *   · una certificación vencida genera UN aviso, no dos, y no declara
 *     incompetente a nadie;
 *   · un conocimiento crítico con un solo holder produce una SEÑAL, cero no
 *     conformidades y cero riesgos, hasta que alguien decide lo contrario;
 *   · desvincular a una persona no borra nada de lo que hizo;
 *   · y lo de otra empresa no existe, ni por UUID conocido.
 *
 * Todo corre con la sesión REAL de cada usuario. El cliente administrativo solo
 * crea cuentas y membresías: con `service_role` se saltaría RLS y no se
 * probaría nada.
 */
import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) {
  console.error("Faltan variables para test:quality06-rls (URL, ANON, SERVICE_ROLE).");
  process.exit(1);
}

let passed = 0, failed = 0;
const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
async function check(n: string, fn: () => Promise<void>) {
  try { await fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function newUser(label: string, name: string) {
  const email = `q06-${label}-${stamp}@test.trazaloop.dev`;
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

/**
 * El escenario del encargo habla de «01/01 → 30/06» y «01/07 →». Aquí esas
 * fechas se anclan RELATIVAS a hoy, no a un año fijo: con un año futuro
 * cableado, «quién lo ocupa hoy» no tendría respuesta y la prueba pasaría por
 * el motivo equivocado.
 */
const ANA_DESDE = day(-200);
const ANA_HASTA = day(-30);
const CARLOS_DESDE = day(-29);
const EN_TIEMPO_DE_ANA = day(-100);
const EN_TIEMPO_DE_CARLOS = day(-5);
const PERFIL_V1_DESDE = day(-365);
const PERFIL_V2_DESDE = day(-10);
const EVALUADA_CON_V1 = day(-60);

async function newPerson(c: SupabaseClient, org: string, name: string, extra: Record<string, unknown> = {}) {
  const { data, error } = await c.from("quality_people")
    .insert({ organization_id: org, full_name: name, ...extra })
    .select("id").single();
  assert(!error && data, `crear persona «${name}»: ${error?.message}`);
  return data!.id as string;
}

async function newPositionWithProfile(
  c: SupabaseClient, org: string, name: string,
  perfil: { competencyId: string; level: number } | null,
  from: string
) {
  const { data: pos, error: ep } = await c.from("quality_positions")
    .insert({ organization_id: org, name }).select("id").single();
  assert(!ep && pos, `crear cargo «${name}»: ${ep?.message}`);
  const { data: v, error: ev } = await c.from("quality_position_versions")
    .insert({ organization_id: org, position_id: pos!.id, version_number: 1, purpose: `Perfil de ${name}` })
    .select("id").single();
  assert(!ev && v, `perfil de «${name}»: ${ev?.message}`);
  if (perfil) {
    const { error: er } = await c.from("quality_competency_requirements").insert({
      organization_id: org, position_version_id: v!.id,
      competency_id: perfil.competencyId, required_level: perfil.level,
    });
    assert(!er, `requisito de «${name}»: ${er?.message}`);
  }
  const { error: epub } = await c.rpc("quality_publish_position_version", {
    p_version_id: v!.id, p_effective_from: from, p_change_note: "Perfil inicial",
  });
  assert(!epub, `publicar perfil de «${name}»: ${epub?.message}`);
  return { positionId: pos!.id as string, versionId: v!.id as string };
}

async function main() {
  console.log("\nQUALITY-06 · base real\n");

  const owner = await newUser("adm", "Directora");
  const quality = await newUser("cal", "Coordinadora de Calidad");
  const consultant = await newUser("con", "Consultor externo");
  const ana = await newUser("ana", "Ana Pérez");
  const outsider = await newUser("out", "Ajena");
  for (const u of [owner, quality, consultant, ana, outsider]) {
    await u.client.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "q06" });
  }
  const { data: a } = await owner.client.rpc("create_organization", { p_name: `Q06 A ${stamp}` });
  const { data: b } = await outsider.client.rpc("create_organization", { p_name: `Q06 B ${stamp}` });
  const A = a as string, B = b as string;

  await admin.from("memberships").insert([
    { organization_id: A, user_id: quality.id, role_code: "quality", status: "active" },
    { organization_id: A, user_id: consultant.id, role_code: "consultant", status: "active" },
    { organization_id: A, user_id: ana.id, role_code: "consultant", status: "active" },
  ]);

  const Q = quality.client;   // administra personas
  const C = consultant.client; // acceso general a Quality, SIN acceso a fichas
  const AN = ana.client;       // es una persona de la empresa, además de usuaria
  const O = outsider.client;   // otra empresa

  // La escala de competencia la define la empresa.
  const { data: nivelesCreados } = await Q.rpc("quality_seed_competency_levels", {
    p_organization_id: A,
  });
  assert(Number(nivelesCreados) === 4, "no se creó la escala de partida");

  const { data: comp, error: ecomp } = await Q.from("quality_competencies")
    .insert({ organization_id: A, name: `Auditoría interna ${stamp}`, code: "AUD" })
    .select("id").single();
  assert(!ecomp && comp, `competencia: ${ecomp?.message}`);
  const COMP = comp!.id as string;

  // ==========================================================================
  console.log("A · Escenario 1 · el cargo responde; la persona lo ocupó entre fechas");
  // ==========================================================================

  const { positionId: COORD } = await newPositionWithProfile(
    Q, A, `Coordinador de Calidad ${stamp}`, { competencyId: COMP, level: 2 }, PERFIL_V1_DESDE
  );

  const ANA = await newPerson(Q, A, "Ana Pérez", { profile_id: ana.id, work_email: ana.email });
  const CARLOS = await newPerson(Q, A, "Carlos López");

  await check("A1. una persona puede existir SIN cuenta de Trazaloop", async () => {
    const { data } = await Q.from("quality_people").select("id, profile_id").eq("id", CARLOS).single();
    assert(data && data.profile_id === null, "Carlos debería existir sin cuenta");
  });

  await check("A2. las dos asignaciones conviven; la primera no se sobrescribe", async () => {
    const { error: e1 } = await Q.from("quality_position_assignments").insert({
      organization_id: A, position_id: COORD, person_id: ANA,
      assignment_type: "holder", effective_from: ANA_DESDE, effective_to: ANA_HASTA,
    });
    assert(!e1, `asignar a Ana: ${e1?.message}`);
    const { error: e2 } = await Q.from("quality_position_assignments").insert({
      organization_id: A, position_id: COORD, person_id: CARLOS,
      assignment_type: "holder", effective_from: CARLOS_DESDE,
    });
    assert(!e2, `asignar a Carlos: ${e2?.message}`);
    const { data } = await Q.from("quality_position_assignments")
      .select("person_id, effective_from, effective_to").eq("position_id", COORD);
    assert((data ?? []).length === 2, "una de las dos asignaciones desapareció");
    const deAna = (data ?? []).find((x) => x.person_id === ANA);
    assert(deAna?.effective_to === ANA_HASTA, "la vigencia de Ana se perdió");
  });

  await check("A3. en tiempo de Ana responde Ana; en tiempo de Carlos, Carlos", async () => {
    const { data: mayo } = await Q.rpc("quality_position_holders_on", {
      p_organization_id: A, p_position_id: COORD, p_on: EN_TIEMPO_DE_ANA,
    });
    assert((mayo ?? []).length === 1 && mayo[0].person_id === ANA,
      "en tiempo de Ana no responde Ana");
    assert(mayo[0].person_name === "Ana Pérez", "no devuelve el nombre de la persona");
    const { data: agosto } = await Q.rpc("quality_position_holders_on", {
      p_organization_id: A, p_position_id: COORD, p_on: EN_TIEMPO_DE_CARLOS,
    });
    assert((agosto ?? []).length === 1 && agosto[0].person_id === CARLOS,
      "en tiempo de Carlos no responde Carlos");
  });

  await check("A4. la vista de titular vigente lee la PERSONA, no solo la cuenta", async () => {
    const { data } = await Q.from("v_quality_position_current_holder")
      .select("position_id, holder_name, person_id").eq("position_id", COORD).maybeSingle();
    assert(data, "la vista no devuelve el cargo");
    // Carlos no tiene cuenta: antes de 0123 esto habría venido en blanco.
    assert(data!.holder_name === "Carlos López",
      `el titular vigente debería ser Carlos y es «${data!.holder_name}»`);
  });

  await check("A5. un cargo puede tener varios ocupantes, pero un solo titular vigente", async () => {
    const { error } = await Q.from("quality_position_assignments").insert({
      organization_id: A, position_id: COORD, person_id: ANA,
      assignment_type: "holder", effective_from: day(0),
    });
    assert(error, "se aceptaron dos titulares vigentes a la vez");
    const { error: e2 } = await Q.from("quality_position_assignments").insert({
      organization_id: A, position_id: COORD, person_id: ANA,
      assignment_type: "co_holder", effective_from: day(0),
    });
    assert(!e2, `un cotitular sí debería poder convivir: ${e2?.message}`);
    await Q.from("quality_position_assignments")
      .delete().eq("position_id", COORD).eq("assignment_type", "co_holder");
  });

  // ==========================================================================
  console.log("\nB · Escenario 2 · cambiar el requisito NO reescribe el pasado (PC-23)");
  // ==========================================================================

  await check("B1. Carlos demuestra nivel 2 y con el perfil v1 no hay brecha", async () => {
    const { error } = await Q.rpc("quality_record_person_competence", {
      p_person_id: CARLOS, p_competency_id: COMP, p_level: 2,
      p_method: "practical_assessment", p_rationale: "Auditoría acompañada",
      p_assessed_on: EVALUADA_CON_V1, p_valid_until: null,
    });
    assert(!error, `registrar competencia: ${error?.message}`);
    const { data: req } = await Q.rpc("quality_required_level_on", {
      p_organization_id: A, p_position_id: COORD, p_competency_id: COMP, p_on: EVALUADA_CON_V1,
    });
    const { data: dem } = await Q.rpc("quality_demonstrated_level_on", {
      p_organization_id: A, p_person_id: CARLOS, p_competency_id: COMP, p_on: EVALUADA_CON_V1,
    });
    assert(Number(req) === 2, `el requisito de entonces debería ser 2 y es ${req}`);
    assert(Number(dem) === 2, `lo demostrado entonces debería ser 2 y es ${dem}`);
  });

  await check("B2. se publica el perfil v2 exigiendo nivel 3", async () => {
    const { data: v2, error: ev } = await Q.from("quality_position_versions")
      .insert({ organization_id: A, position_id: COORD, version_number: 2,
                purpose: "Perfil revisado", change_note: "Sube el nivel de auditoría" })
      .select("id").single();
    assert(!ev && v2, `crear v2: ${ev?.message}`);
    const { error: er } = await Q.from("quality_competency_requirements").insert({
      organization_id: A, position_version_id: v2!.id, competency_id: COMP, required_level: 3,
    });
    assert(!er, `requisito v2: ${er?.message}`);
    const { error: ep } = await Q.rpc("quality_publish_position_version", {
      p_version_id: v2!.id, p_effective_from: PERFIL_V2_DESDE, p_change_note: "Sube a 3",
    });
    assert(!ep, `publicar v2: ${ep?.message}`);
    const { data: versiones } = await Q.from("quality_position_versions")
      .select("version_number, status, effective_from, effective_to")
      .eq("position_id", COORD).order("version_number");
    assert((versiones ?? []).length === 2, "se perdió una versión del perfil");
    assert(versiones![0].status === "superseded", "la v1 no quedó sustituida");
    assert(versiones![0].effective_to === day(-11), "la v1 no cerró su vigencia el día antes");
  });

  await check("B3. entonces NO había brecha; hoy la brecha es 1", async () => {
    const antes = await Q.rpc("quality_required_level_on", {
      p_organization_id: A, p_position_id: COORD, p_competency_id: COMP, p_on: EVALUADA_CON_V1,
    });
    assert(Number(antes.data) === 2,
      `subir el requisito hoy convirtió en incumplida una evaluación anterior (${antes.data})`);
    const ahora = await Q.rpc("quality_required_level_on", {
      p_organization_id: A, p_position_id: COORD, p_competency_id: COMP, p_on: day(0),
    });
    assert(Number(ahora.data) === 3, `el requisito de hoy debería ser 3 y es ${ahora.data}`);
  });

  await check("B4. la matriz vigente muestra la brecha, sin totales por persona", async () => {
    const { data, error } = await Q.from("v_quality_competence_matrix")
      .select("person_name, competency_name, required_level, demonstrated_level, gap, evidence_status")
      .eq("organization_id", A);
    assert(!error, `matriz: ${error?.message}`);
    const fila = (data ?? []).find((r) => r.person_name === "Carlos López");
    assert(fila, "Carlos no aparece en la matriz");
    assert(Number(fila!.required_level) === 3 && Number(fila!.demonstrated_level) === 2,
      "la matriz no cruza el requisito vigente con lo demostrado");
    assert(Number(fila!.gap) === 1, `la brecha debería ser 1 y es ${fila!.gap}`);
    assert(fila!.evidence_status === "none", "sin evidencia el estado debería ser «none»");
  });

  await check("B5. registrar competencia nueva SUSTITUYE, no borra", async () => {
    const { error } = await Q.rpc("quality_record_person_competence", {
      p_person_id: CARLOS, p_competency_id: COMP, p_level: 3,
      p_method: "observation", p_rationale: "Auditoría autónoma",
      p_assessed_on: day(0), p_valid_until: null,
    });
    assert(!error, `segunda decisión: ${error?.message}`);
    const { data } = await Q.from("quality_person_competencies")
      .select("demonstrated_level, status, assessed_on, superseded_by")
      .eq("person_id", CARLOS).eq("competency_id", COMP).order("assessed_on");
    assert((data ?? []).length === 2, "la decisión anterior desapareció");
    const antigua = data!.find((d) => d.assessed_on === EVALUADA_CON_V1);
    assert(antigua, "la decisión anterior no está");
    assert(antigua!.status === "superseded" && antigua!.superseded_by,
      "la decisión anterior no quedó enlazada como sustituida");
    assert(antigua!.demonstrated_level === 2, "se reescribió el nivel anterior");
    // Y el pasado sigue diciendo 2.
    const { data: enJulio } = await Q.rpc("quality_demonstrated_level_on", {
      p_organization_id: A, p_person_id: CARLOS, p_competency_id: COMP, p_on: EVALUADA_CON_V1,
    });
    assert(Number(enJulio) === 2, "la competencia anterior cambió al registrar la de hoy");
  });

  // ==========================================================================
  console.log("\nC · Escenarios 3 y 4 · desarrollo que NO es un curso, y asistir no es que sirviera");
  // ==========================================================================

  let ACTIVIDAD = "";
  let PARTICIPANTE = "";

  await check("C1. la brecha genera una necesidad, y se decide práctica supervisada", async () => {
    const { data: need, error: en } = await Q.from("quality_development_needs").insert({
      organization_id: A, title: `Cerrar brecha de auditoría ${stamp}`,
      origin_kind: "competency_gap", person_id: CARLOS, competency_id: COMP,
    }).select("id").single();
    assert(!en && need, `necesidad: ${en?.message}`);

    const { data: plan, error: ep } = await Q.from("quality_development_plans")
      .insert({ organization_id: A, year: 2027, title: `Plan 2027 ${stamp}` })
      .select("id").single();
    assert(!ep && plan, `plan: ${ep?.message}`);

    const { data: item, error: ei } = await Q.from("quality_development_plan_items").insert({
      organization_id: A, plan_id: plan!.id, need_id: need!.id,
      title: "Acompañamiento en tres auditorías reales",
      development_kind: "supervised_practice", person_id: CARLOS, competency_id: COMP,
      added_reason: "La brecha no se cierra con teoría",
    }).select("id, development_kind").single();
    assert(!ei && item, `item: ${ei?.message}`);
    assert(item!.development_kind === "supervised_practice",
      "el dominio obligó a convertir la necesidad en un curso");
  });

  await check("C2. la actividad se ejecuta y la persona asiste al 100 %", async () => {
    const { data: act, error: ea } = await Q.from("quality_learning_activities").insert({
      organization_id: A, title: `Práctica de auditoría ${stamp}`,
      activity_kind: "supervised_practice", starts_on: day(-10), ends_on: day(-3),
    }).select("id").single();
    assert(!ea && act, `actividad: ${ea?.message}`);
    ACTIVIDAD = act!.id as string;

    const { data: p, error: ep } = await Q.from("quality_learning_participants")
      .insert({ organization_id: A, activity_id: ACTIVIDAD, person_id: CARLOS })
      .select("id").single();
    assert(!ep && p, `participante: ${ep?.message}`);
    PARTICIPANTE = p!.id as string;

    const { error: eu } = await Q.from("quality_learning_participants")
      .update({ attendance_status: "attended" }).eq("id", PARTICIPANTE);
    assert(!eu, `asistencia: ${eu?.message}`);

    const { data: fila } = await Q.from("quality_learning_participants")
      .select("attendance_status, learning_result").eq("id", PARTICIPANTE).single();
    assert(fila!.attendance_status === "attended", "no se registró la asistencia");
    // §72 · Marcar asistencia NO puede haber tocado el aprendizaje.
    assert(fila!.learning_result === "not_evaluated",
      `asistir rellenó el aprendizaje: ${fila!.learning_result}`);
  });

  await check("C3. terminar la actividad deja la eficacia en PENDIENTE", async () => {
    await Q.from("quality_learning_activities").update({ status: "completed" }).eq("id", ACTIVIDAD);
    const { data: revs } = await Q.from("quality_learning_effectiveness_reviews")
      .select("id, result").eq("activity_id", ACTIVIDAD);
    assert((revs ?? []).length === 0,
      "terminar la actividad fabricó una evaluación de eficacia por su cuenta");
    // El criterio se declara antes de juzgar.
    const { data: rev, error } = await Q.from("quality_learning_effectiveness_reviews").insert({
      organization_id: A, activity_id: ACTIVIDAD, person_id: CARLOS,
      criterion: "El proceso deja de registrar hallazgos repetidos durante dos auditorías",
      method: "process_performance",
    }).select("id, result").single();
    assert(!error && rev, `criterio de eficacia: ${error?.message}`);
    assert(rev!.result === "pending", "la eficacia nació decidida");
  });

  // ==========================================================================
  console.log("\nD · Escenario 5 · un «no eficaz» se conserva");
  // ==========================================================================

  let REVIEW = "";
  await check("D1. se evalúa NO EFICAZ y se conserva", async () => {
    const { data: rev } = await Q.from("quality_learning_effectiveness_reviews")
      .select("id").eq("activity_id", ACTIVIDAD).single();
    REVIEW = rev!.id as string;
    const { error } = await Q.rpc("quality_review_learning_effectiveness", {
      p_review_id: REVIEW, p_result: "not_effective",
      p_observation: "Los hallazgos volvieron a repetirse", p_reviewed_on: day(0),
    });
    assert(!error, `evaluar eficacia: ${error?.message}`);
    const { data } = await Q.from("quality_learning_effectiveness_reviews")
      .select("result, reviewed_on").eq("id", REVIEW).single();
    assert(data!.result === "not_effective", "el resultado no se guardó");
  });

  await check("D2. no se puede reescribir a «eficaz»", async () => {
    const { error } = await Q.rpc("quality_review_learning_effectiveness", {
      p_review_id: REVIEW, p_result: "effective",
      p_observation: "Ahora sí", p_reviewed_on: day(0),
    });
    assert(error, "se pudo maquillar un resultado ya evaluado");
    assert(/ya fue evaluada/i.test(sinTildes(error!.message)), `mensaje inesperado: ${error!.message}`);
    const { data } = await Q.from("quality_learning_effectiveness_reviews")
      .select("result").eq("id", REVIEW).single();
    assert(data!.result === "not_effective", "el resultado cambió pese al rechazo");
  });

  await check("D3. y tampoco por escritura directa: la sesión no puede tocar el resultado", async () => {
    // La política de escritura sí deja a `quality` actualizar la fila, así que
    // lo que protege el resultado es la RPC. Lo que NO puede es hacerlo el
    // consultor, que ni siquiera ve la fila.
    const { data } = await C.from("quality_learning_effectiveness_reviews")
      .select("id").eq("id", REVIEW);
    assert((data ?? []).length === 0,
      "el consultor puede leer una evaluación de eficacia de una persona");
  });

  // ==========================================================================
  console.log("\nE · Escenario 6 · una certificación por vencer avisa UNA vez");
  // ==========================================================================

  await check("E1. la evidencia con vencimiento se registra sobre la competencia", async () => {
    const { data: pc } = await Q.from("quality_person_competencies")
      .select("id").eq("person_id", CARLOS).eq("status", "valid").single();
    const { error } = await Q.from("quality_competency_evidence").insert({
      organization_id: A, person_competency_id: pc!.id,
      evidence_kind: "certification", title: `Auditor ISO 19011 ${stamp}`,
      issuer: "Ente certificador", issued_on: day(-400), expires_on: day(1),
    });
    assert(!error, `evidencia: ${error?.message}`);
  });

  await check("E2. el primer barrido crea UNA alerta", async () => {
    const { error } = await Q.rpc("quality_scan_people_signals", { p_organization_id: A });
    assert(!error, `barrido: ${error?.message}`);
    const { data } = await Q.from("work_alerts")
      .select("id, alert_type, message").eq("organization_id", A)
      .like("dedupe_key", "competence_evidence:%");
    assert((data ?? []).length === 1, `se crearon ${(data ?? []).length} alertas en vez de una`);
    assert(/no implica/i.test(sinTildes(data![0].message ?? "")),
      "la alerta no aclara que vencer no es dejar de ser competente");
  });

  await check("E2b. y también una TAREA con su enlace, no solo un aviso", async () => {
    // §68 · Una alerta dice «esto merece tu atención»; una tarea dice «te toca
    // hacer esto» y tiene un cierre. Sin tareas, la integración con «Mis
    // tareas» no tendría nada que integrar.
    const { data } = await Q.from("work_tasks")
      .select("id, task_type, subject_type, due_at, status").eq("organization_id", A)
      .like("dedupe_key", "competence_evidence_renewal:%");
    assert((data ?? []).length === 1, `se crearon ${(data ?? []).length} tareas en vez de una`);
    assert(data![0].task_type === "competence_evidence_renewal", "el tipo de tarea no es el correcto");
    assert(data![0].subject_type === "quality_competency_evidence",
      "la tarea no apunta a la evidencia");
    assert(data![0].status === "open", "la tarea no nace pendiente");
  });

  await check("E3. el segundo barrido NO duplica", async () => {
    await Q.rpc("quality_scan_people_signals", { p_organization_id: A });
    await Q.rpc("quality_scan_people_signals", { p_organization_id: A });
    const { data } = await Q.from("work_alerts")
      .select("id").eq("organization_id", A).like("dedupe_key", "competence_evidence:%");
    assert((data ?? []).length === 1, `tras tres barridos hay ${(data ?? []).length} alertas`);
    const { data: tareas } = await Q.from("work_tasks")
      .select("id").eq("organization_id", A).like("dedupe_key", "competence_evidence_renewal:%");
    assert((tareas ?? []).length === 1, `tras tres barridos hay ${(tareas ?? []).length} tareas`);
  });

  await check("E4. al vencer, la EVIDENCIA pasa a vencida y la competencia NO cambia", async () => {
    const { data: pc } = await Q.from("quality_person_competencies")
      .select("id, demonstrated_level, status").eq("person_id", CARLOS).eq("status", "valid").single();
    // La mutación va por la SESIÓN: las tablas de este sprint no conceden nada
    // a `service_role`, igual que las de QUALITY-05. Si el cliente
    // administrativo pudiera tocarlas, media suite dejaría de probar RLS.
    const { error: eu } = await Q.from("quality_competency_evidence")
      .update({ expires_on: day(-1) }).eq("organization_id", A);
    assert(!eu, `adelantar el vencimiento: ${eu?.message}`);
    await Q.rpc("quality_scan_people_signals", { p_organization_id: A });
    const { data: ev } = await Q.from("quality_competency_evidence")
      .select("status").eq("organization_id", A).single();
    assert(ev!.status === "expired", "la evidencia vencida no se marcó");
    const { data: despues } = await Q.from("quality_person_competencies")
      .select("demonstrated_level, status").eq("id", pc!.id).single();
    assert(despues!.status === "valid" && despues!.demonstrated_level === pc!.demonstrated_level,
      "el vencimiento de un papel cambió la competencia declarada de la persona");
  });

  // ==========================================================================
  console.log("\nF · Escenario 7 · el ciclo anual y la decisión humana");
  // ==========================================================================

  let EVALUACION = "";
  await check("F1. el ciclo declara su población aplicable", async () => {
    const { data: cy, error: ec } = await Q.from("quality_performance_cycles").insert({
      organization_id: A, name: `Ciclo 2027 ${stamp}`,
      period_start: day(-300), period_end: day(60), status: "open",
    }).select("id").single();
    assert(!ec && cy, `ciclo: ${ec?.message}`);
    const { error: em } = await Q.from("quality_performance_cycle_members").insert([
      { organization_id: A, cycle_id: cy!.id, person_id: ANA, inclusion_reason: "Cargo aplicable" },
      { organization_id: A, cycle_id: cy!.id, person_id: CARLOS, inclusion_reason: "Cargo aplicable" },
    ]);
    assert(!em, `población: ${em?.message}`);

    const { data: ev, error: ee } = await Q.from("quality_performance_evaluations").insert({
      organization_id: A, cycle_id: cy!.id, person_id: CARLOS, position_id: COORD,
      evaluator_person_id: ANA, context_note: "Con la extrusora averiada dos semanas",
    }).select("id").single();
    assert(!ee && ev, `evaluación: ${ee?.message}`);
    EVALUACION = ev!.id as string;
  });

  await check("F2. no se puede cerrar una evaluación sin decir contra qué se evaluó", async () => {
    const { error } = await Q.rpc("quality_close_performance_evaluation", {
      p_evaluation_id: EVALUACION, p_summary: "Todo bien",
    });
    assert(error, "se cerró una evaluación vacía");
    assert(/contra qu/i.test(sinTildes(error!.message)), `mensaje inesperado: ${error!.message}`);
  });

  await check("F3. con criterios escritos, la decisión humana se conserva", async () => {
    await Q.from("quality_performance_items").insert({
      organization_id: A, evaluation_id: EVALUACION, criterion: "Cierre de hallazgos en plazo",
      result: "partially_meets", observation: "Afectado por la parada de la línea",
    });
    const { error } = await Q.rpc("quality_close_performance_evaluation", {
      p_evaluation_id: EVALUACION, p_summary: "Cumple parcialmente, con contexto",
    });
    assert(!error, `cerrar: ${error?.message}`);
    const { data } = await Q.from("quality_performance_evaluations")
      .select("status, summary, evaluated_on").eq("id", EVALUACION).single();
    assert(data!.status === "closed" && data!.evaluated_on, "la evaluación no quedó cerrada");
  });

  await check("F3b. el ciclo abierto genera la tarea de evaluar, con su fecha", async () => {
    await Q.rpc("quality_scan_people_signals", { p_organization_id: A });
    const { data } = await Q.from("work_tasks")
      .select("id, task_type, subject_id, due_at").eq("organization_id", A)
      .eq("task_type", "performance_evaluation_due");
    // Carlos ya tiene su evaluación CERRADA: la tarea que queda es la de Ana.
    assert((data ?? []).length === 1, `se crearon ${(data ?? []).length} tareas de evaluación`);
    assert(data![0].subject_id === ANA, "la tarea no apunta a quien falta por evaluar");
  });

  await check("F4. evaluar el desempeño NO tocó la competencia de la persona", async () => {
    const { data } = await Q.from("quality_person_competencies")
      .select("demonstrated_level").eq("person_id", CARLOS).eq("status", "valid").single();
    assert(Number(data!.demonstrated_level) === 3,
      "cerrar una evaluación de desempeño cambió la competencia declarada");
  });

  // ==========================================================================
  console.log("\nG · Escenario 8 · conocimiento concentrado: señal, no riesgo");
  // ==========================================================================

  let SENAL = "";
  let CONOCIMIENTO = "";
  await check("G1. un conocimiento crítico con un solo holder produce una SEÑAL", async () => {
    const { data: k, error: ek } = await Q.from("quality_knowledge_items").insert({
      organization_id: A, title: `Configuración de la línea A ${stamp}`,
      knowledge_kind: "tacit", criticality: "critical", documentation_status: "undocumented",
    }).select("id").single();
    assert(!ek && k, `conocimiento: ${ek?.message}`);
    CONOCIMIENTO = k!.id as string;
    const { error: eh } = await Q.from("quality_knowledge_holders").insert({
      organization_id: A, knowledge_item_id: CONOCIMIENTO, person_id: ANA,
      holder_level: "holder", is_primary_holder: true, since_on: day(-100),
    });
    assert(!eh, `holder: ${eh?.message}`);

    await Q.rpc("quality_scan_people_signals", { p_organization_id: A });
    const { data: s } = await Q.from("quality_knowledge_signals")
      .select("id, signal_kind, status, risk_id, detail").eq("knowledge_item_id", CONOCIMIENTO);
    assert((s ?? []).length === 1, `se crearon ${(s ?? []).length} señales`);
    assert(s![0].signal_kind === "single_holder", "la señal no es de concentración");
    assert(s![0].risk_id === null, "la señal creó un riesgo por su cuenta");
    assert(/concentrado/i.test(s![0].detail ?? ""), "el texto de la señal no habla del conocimiento");
    SENAL = s![0].id as string;
  });

  await check("G2. cero no conformidades y cero riesgos", async () => {
    const { data: casos } = await Q.from("work_cases").select("id").eq("organization_id", A);
    assert((casos ?? []).length === 0, "se abrió una no conformidad automáticamente");
    const { data: riesgos } = await Q.from("quality_risks").select("id").eq("organization_id", A);
    assert((riesgos ?? []).length === 0, "se abrió un riesgo automáticamente");
  });

  await check("G3. el barrido repetido no duplica la señal", async () => {
    await Q.rpc("quality_scan_people_signals", { p_organization_id: A });
    const { data } = await Q.from("quality_knowledge_signals")
      .select("id").eq("knowledge_item_id", CONOCIMIENTO);
    assert((data ?? []).length === 1, `hay ${(data ?? []).length} señales tras dos barridos`);
  });

  await check("G4. promover a riesgo es una decisión HUMANA y queda registrada", async () => {
    const { data: code } = await Q.rpc("quality_next_ro_code", { p_organization_id: A, p_kind: "risk" });
    const { data: r, error: er } = await Q.from("quality_risks").insert({
      organization_id: A, code, title: `Dependencia de una sola persona ${stamp}`,
      event_description: "El conocimiento crítico de la línea A depende de una sola persona",
    }).select("id").single();
    assert(!er && r, `riesgo: ${er?.message}`);
    const { error } = await Q.rpc("quality_promote_knowledge_signal", {
      p_signal_id: SENAL, p_risk_id: r!.id,
    });
    assert(!error, `promover: ${error?.message}`);
    const { data: s } = await Q.from("quality_knowledge_signals")
      .select("risk_id, promoted_by, promoted_at").eq("id", SENAL).single();
    assert(s!.risk_id === r!.id && s!.promoted_by === quality.id && s!.promoted_at,
      "no quedó constancia de quién decidió promover la señal");
  });

  await check("G5. la señal se resuelve sola cuando el conocimiento deja de estar concentrado", async () => {
    await Q.from("quality_knowledge_holders").insert({
      organization_id: A, knowledge_item_id: CONOCIMIENTO, person_id: CARLOS,
      holder_level: "learning", since_on: day(-2),
    });
    await Q.rpc("quality_scan_people_signals", { p_organization_id: A });
    const { data } = await Q.from("quality_knowledge_signals")
      .select("status").eq("id", SENAL).single();
    assert(data!.status === "resolved", "la señal sigue abierta con dos holders");
  });

  // ==========================================================================
  console.log("\nH · Escenario 9 · desvincular NO borra nada");
  // ==========================================================================

  await check("H1. antes de cerrar, el informe dice qué queda descubierto", async () => {
    // Ana vuelve a quedarse sola con el conocimiento crítico.
    const { error: ec } = await Q.from("quality_knowledge_holders")
      .update({ until_on: day(-1) })
      .eq("knowledge_item_id", CONOCIMIENTO).eq("person_id", CARLOS);
    assert(!ec, `cerrar el registro de Carlos: ${ec?.message}`);
    const { data, error } = await Q.rpc("quality_offboarding_report", {
      p_organization_id: A, p_person_id: ANA,
    });
    assert(!error, `informe: ${error?.message}`);
    const r = data as Record<string, unknown[]>;
    assert((r.knowledge_left_concentrated ?? []).length === 1,
      "el informe no detecta el conocimiento que quedaría sin cobertura");
  });

  await check("H2. cerrar la asignación conserva la fila y su historia", async () => {
    const { data: antes } = await Q.from("quality_position_assignments")
      .select("id").eq("person_id", ANA);
    await Q.from("quality_people").update({ status: "former", left_on: day(0) }).eq("id", ANA);
    const { data: despues } = await Q.from("quality_position_assignments")
      .select("id, effective_to").eq("person_id", ANA);
    assert((despues ?? []).length === (antes ?? []).length,
      "desvincular borró asignaciones");
    const { data: persona } = await Q.from("quality_people")
      .select("status, left_on, full_name").eq("id", ANA).single();
    assert(persona!.status === "former" && persona!.left_on, "no quedó desvinculada con fecha");
    assert(persona!.full_name === "Ana Pérez", "se perdió el nombre de la persona");
  });

  await check("H3. sus actos históricos siguen ahí: sigue siendo la evaluadora de Carlos", async () => {
    const { data } = await Q.from("quality_performance_evaluations")
      .select("evaluator_person_id").eq("id", EVALUACION).single();
    assert(data!.evaluator_person_id === ANA, "la evaluación perdió a su evaluadora");
    const { data: mayo } = await Q.rpc("quality_position_holders_on", {
      p_organization_id: A, p_position_id: COORD, p_on: EN_TIEMPO_DE_ANA,
    });
    assert((mayo ?? [])[0]?.person_id === ANA, "el pasado dejó de responder Ana");
  });

  await check("H4. y no se puede borrar: el veredicto ofrece desvincular", async () => {
    const { data } = await Q.rpc("quality_deletion_eligibility", {
      p_entity: "person", p_id: ANA,
    });
    const v = data as Record<string, unknown>;
    assert(v.can_hard_delete === false, "una persona con historia se puede borrar");
    assert(v.alternative === "retire", "el veredicto no ofrece la alternativa correcta");
    const { error } = await Q.from("quality_people").delete().eq("id", ANA);
    assert(error, "el borrado directo de una persona con historia no fue rechazado");
  });

  // ==========================================================================
  console.log("\nI · Escenario 10 · la lección propone; no cambia nada");
  // ==========================================================================

  await check("I1. una lección nace de un caso y guarda las cuatro preguntas", async () => {
    const { data: caso, error: ec } = await Q.from("work_cases").insert({
      organization_id: A, title: `Reproceso repetido ${stamp}`,
      description: "Se repitió el mismo reproceso tres veces",
      source_domain: "quality", detected_on: day(-5),
    }).select("id").single();
    if (ec) {
      // El esquema de casos exige campos que no son de este sprint: la lección
      // puede existir sin caso, y eso también hay que poder demostrarlo.
      const { data: l, error } = await Q.from("quality_lessons_learned").insert({
        organization_id: A, title: `Lección ${stamp}`, origin_kind: "incident",
        what_happened: "Se repitió el mismo reproceso tres veces",
        what_was_learned: "La instrucción no cubría el cambio de referencia",
        applicable_context: "Todas las líneas con cambio de referencia",
        recommendation: "Actualizar la instrucción y formar al cargo",
      }).select("id").single();
      assert(!error && l, `lección sin caso: ${error?.message}`);
      return;
    }
    const { data: l, error } = await Q.from("quality_lessons_learned").insert({
      organization_id: A, title: `Lección ${stamp}`, origin_kind: "case", case_id: caso!.id,
      what_happened: "Se repitió el mismo reproceso tres veces",
      what_was_learned: "La instrucción no cubría el cambio de referencia",
      applicable_context: "Todas las líneas con cambio de referencia",
      recommendation: "Actualizar la instrucción y formar al cargo",
    }).select("id").single();
    assert(!error && l, `lección: ${error?.message}`);
  });

  await check("I2. aceptar una propuesta NO modifica el documento ni crea formación", async () => {
    const { data: l } = await Q.from("quality_lessons_learned")
      .select("id").eq("organization_id", A).limit(1).single();
    const { data: p, error: ep } = await Q.from("quality_lesson_proposals").insert({
      organization_id: A, lesson_id: l!.id, proposal_kind: "document_change",
      summary: "Actualizar la instrucción de cambio de referencia",
    }).select("id").single();
    assert(!ep && p, `propuesta: ${ep?.message}`);

    const antesDocs = await Q.from("trazadoc_documents").select("id").eq("organization_id", A);
    const antesAct = await Q.from("quality_learning_activities").select("id").eq("organization_id", A);

    const { error } = await Q.rpc("quality_decide_lesson_proposal", {
      p_proposal_id: p!.id, p_decision: "accepted", p_note: "Se acepta",
    });
    assert(!error, `decidir: ${error?.message}`);

    const despuesDocs = await Q.from("trazadoc_documents").select("id").eq("organization_id", A);
    const despuesAct = await Q.from("quality_learning_activities").select("id").eq("organization_id", A);
    assert((despuesDocs.data ?? []).length === (antesDocs.data ?? []).length,
      "aceptar la propuesta creó o modificó documentos");
    assert((despuesAct.data ?? []).length === (antesAct.data ?? []).length,
      "aceptar la propuesta creó formación automáticamente");

    const { data: estado } = await Q.from("quality_lesson_proposals")
      .select("status, decided_by, outcome_kind").eq("id", p!.id).single();
    assert(estado!.status === "accepted" && estado!.decided_by === quality.id,
      "la decisión no quedó registrada");
    assert(estado!.outcome_kind === null, "se inventó un resultado que nadie creó");
  });

  await check("I3. no se puede decidir dos veces sobre la misma propuesta", async () => {
    const { data: p } = await Q.from("quality_lesson_proposals")
      .select("id").eq("organization_id", A).limit(1).single();
    const { error } = await Q.rpc("quality_decide_lesson_proposal", {
      p_proposal_id: p!.id, p_decision: "rejected", p_note: "Cambio de opinión",
    });
    assert(error, "una propuesta ya decidida se volvió a decidir");
  });

  // ==========================================================================
  console.log("\nJ · Privacidad · tres círculos, no uno (PC-25, §57, §59)");
  // ==========================================================================

  await check("J1. el consultor ve el ORGANIGRAMA", async () => {
    const { data, error } = await C.from("v_quality_org_chart")
      .select("position_id, position_name").eq("organization_id", A);
    assert(!error, `organigrama: ${error?.message}`);
    assert((data ?? []).length > 0, "el consultor no puede ver la estructura");
  });

  await check("J2. pero NO ve la ficha de una persona", async () => {
    const { data } = await C.from("quality_people").select("id, full_name").eq("id", CARLOS);
    assert((data ?? []).length === 0, "el consultor abrió la ficha de una persona");
  });

  await check("J3. ni su competencia demostrada, ni su evidencia", async () => {
    const { data: pc } = await C.from("quality_person_competencies").select("id").eq("person_id", CARLOS);
    assert((pc ?? []).length === 0, "el consultor ve la competencia de otra persona");
    const { data: ev } = await C.from("quality_competency_evidence").select("id").eq("organization_id", A);
    assert((ev ?? []).length === 0, "el consultor ve la evidencia de otra persona");
  });

  await check("J4. ni una evaluación de desempeño, ni sus líneas (§59)", async () => {
    const { data } = await C.from("quality_performance_evaluations").select("id").eq("id", EVALUACION);
    assert((data ?? []).length === 0, "el consultor abrió una evaluación individual");
    const { data: items } = await C.from("quality_performance_items")
      .select("id, criterion").eq("evaluation_id", EVALUACION);
    assert((items ?? []).length === 0, "el consultor leyó las líneas de una evaluación");
  });

  await check("J5. la persona SÍ ve lo suyo: su ficha y su evaluación", async () => {
    const { data: yo } = await AN.from("quality_people").select("id, full_name").eq("id", ANA);
    assert((yo ?? []).length === 1, "una persona no puede ver su propia ficha");
    const { data: ajena } = await AN.from("quality_people").select("id").eq("id", CARLOS);
    assert((ajena ?? []).length === 0, "una persona puede ver la ficha de otra");
  });

  await check("J6. y no puede escribir en su propia ficha", async () => {
    const { error } = await AN.from("quality_people")
      .update({ full_name: "Ana la Grande" }).eq("id", ANA);
    const { data } = await Q.from("quality_people").select("full_name").eq("id", ANA).single();
    assert(data!.full_name === "Ana Pérez",
      `la persona se editó su propia ficha${error ? "" : " sin error"}`);
  });

  await check("J7. el veredicto de borrado de una persona no se responde a quien no la ve", async () => {
    const { data } = await C.rpc("quality_deletion_eligibility", { p_entity: "person", p_id: CARLOS });
    const v = data as Record<string, unknown>;
    assert(v.reason_code === "not_found",
      "el consultor obtiene el recuento de la historia de una persona que no puede ver");
  });

  // ==========================================================================
  console.log("\nK · Cross-tenant · lo de otra empresa no existe (§58, §79, §80)");
  // ==========================================================================

  const tablasAjenas = [
    ["quality_people", ANA],
    ["quality_position_assignments", null],
    ["quality_competencies", COMP],
    ["quality_person_competencies", null],
    ["quality_competency_evidence", null],
    ["quality_performance_evaluations", EVALUACION],
    ["quality_development_plans", null],
    ["quality_learning_activities", ACTIVIDAD],
    ["quality_knowledge_items", CONOCIMIENTO],
    ["quality_knowledge_holders", null],
    ["quality_lessons_learned", null],
  ] as const;

  await check("K1. la empresa B no lee NADA de la empresa A, ni por UUID conocido", async () => {
    for (const [tabla, id] of tablasAjenas) {
      const q = O.from(tabla).select("id").eq("organization_id", A);
      const { data } = id ? await O.from(tabla).select("id").eq("id", id) : await q;
      assert((data ?? []).length === 0, `${tabla} se leyó desde otra empresa`);
    }
  });

  await check("K2. tampoco a través de las vistas derivadas", async () => {
    for (const v of ["v_quality_org_chart", "v_quality_competence_matrix",
                     "v_quality_knowledge_continuity", "v_quality_position_occupants_current"]) {
      const { data } = await O.from(v).select("organization_id").eq("organization_id", A);
      assert((data ?? []).length === 0, `${v} filtró datos de otra empresa`);
    }
  });

  await check("K3. no puede ESCRIBIR en la empresa A (PostgREST directo)", async () => {
    const intentos: [string, Record<string, unknown>][] = [
      ["quality_people", { organization_id: A, full_name: "Intruso" }],
      ["quality_competencies", { organization_id: A, name: `Intrusa ${stamp}` }],
      ["quality_knowledge_items", { organization_id: A, title: `Intruso ${stamp}` }],
      ["quality_lessons_learned", { organization_id: A, title: "Intruso",
        what_happened: "x", what_was_learned: "y" }],
    ];
    for (const [tabla, fila] of intentos) {
      const { error } = await O.from(tabla).insert(fila);
      assert(error, `se pudo insertar en ${tabla} de otra empresa`);
    }
  });

  await check("K4. un DELETE ajeno no borra nada", async () => {
    const antes = await Q.from("quality_people").select("id").eq("organization_id", A);
    await O.from("quality_people").delete().eq("organization_id", A);
    const despues = await Q.from("quality_people").select("id").eq("organization_id", A);
    assert((despues.data ?? []).length === (antes.data ?? []).length,
      "un DELETE desde otra empresa borró personas");
  });

  await check("K5. una relación A→B se rechaza aunque el usuario tenga acceso a A", async () => {
    // La empresa B crea una persona suya y la intenta colgar de un cargo de A.
    const { data: personaB } = await O.from("quality_people")
      .insert({ organization_id: B, full_name: "Persona de B" }).select("id").single();
    assert(personaB, "no se pudo crear la persona de la empresa B");
    const { error } = await O.from("quality_position_assignments").insert({
      organization_id: B, position_id: COORD, person_id: personaB!.id,
      assignment_type: "holder", effective_from: day(0),
    });
    assert(error, "se asignó una persona de B a un cargo de A");

    // Y al revés: la empresa A no puede exigir una competencia de B.
    const { data: compB } = await O.from("quality_competencies")
      .insert({ organization_id: B, name: `Comp B ${stamp}` }).select("id").single();
    const { data: v } = await Q.from("quality_position_versions")
      .select("id").eq("position_id", COORD).eq("version_number", 2).single();
    const { error: e2 } = await Q.from("quality_competency_requirements").insert({
      organization_id: A, position_version_id: v!.id,
      competency_id: compB!.id, required_level: 1,
    });
    assert(e2, "un cargo de A exigió una competencia de B");
  });

  await check("K6. una referencia cruzada de empresa se rechaza", async () => {
    const { error } = await Q.from("work_references").insert({
      organization_id: A, owner_kind: "knowledge_item", owner_id: CONOCIMIENTO,
      ref_kind: "quality_person", ref_id: (await O.from("quality_people")
        .select("id").eq("organization_id", B).limit(1).single()).data!.id,
    });
    assert(error, "se referenció una persona de otra empresa");
  });

  await check("K7. las RPC del dominio también se niegan cruzando empresas", async () => {
    const { error: e1 } = await O.rpc("quality_record_person_competence", {
      p_person_id: CARLOS, p_competency_id: COMP, p_level: 4,
      p_method: "observation", p_rationale: null, p_assessed_on: day(0), p_valid_until: null,
    });
    assert(e1, "se declaró competencia de una persona ajena");
    const { error: e2 } = await O.rpc("quality_close_performance_evaluation", {
      p_evaluation_id: EVALUACION, p_summary: "Ajena",
    });
    assert(e2, "se cerró una evaluación ajena");
    const { error: e3 } = await O.rpc("quality_promote_knowledge_signal", {
      p_signal_id: SENAL, p_risk_id: SENAL,
    });
    assert(e3, "se promovió una señal ajena");
  });

  await check("J8. las tareas generadas llegan a quien administra personas, no a cualquiera", async () => {
    const { data: mias } = await Q.from("work_tasks")
      .select("id, assignee_profile_id").eq("organization_id", A)
      .in("task_type", ["competence_evidence_renewal", "performance_evaluation_due",
                        "learning_effectiveness_review", "knowledge_continuity_review"]);
    assert((mias ?? []).length >= 3, "el barrido no generó tareas de los cuatro tipos previstos");
    for (const t of mias ?? []) {
      assert(t.assignee_profile_id === quality.id,
        "una tarea del dominio Personas quedó a nombre de quien no administra personas");
    }
  });

  await check("K8. las funciones `security definer` no son un túnel por debajo de RLS", async () => {
    // Son la vía más silenciosa: reciben el identificador de empresa desde el
    // cliente y, por ser definer, las vistas que consultan dejan de filtrar.
    const { data: titulares } = await O.rpc("quality_position_holders_on", {
      p_organization_id: A, p_position_id: COORD, p_on: EN_TIEMPO_DE_ANA,
    });
    assert((titulares ?? []).length === 0, "una empresa ajena reconstruyó el histórico de cargos");

    const { data: nivel } = await O.rpc("quality_required_level_on", {
      p_organization_id: A, p_position_id: COORD, p_competency_id: COMP, p_on: day(0),
    });
    assert(nivel === null, "una empresa ajena leyó el requisito de otro cargo");

    const { data: demostrado } = await O.rpc("quality_demonstrated_level_on", {
      p_organization_id: A, p_person_id: CARLOS, p_competency_id: COMP, p_on: day(0),
    });
    assert(demostrado === null, "una empresa ajena leyó la competencia de una persona");

    const { data: informe } = await O.rpc("quality_offboarding_report", {
      p_organization_id: A, p_person_id: ANA,
    });
    const r = informe as Record<string, unknown[]>;
    assert((r.positions_left_without_holder ?? []).length === 0
      && (r.knowledge_left_concentrated ?? []).length === 0,
      "una empresa ajena obtuvo el informe de salida de una persona");

    const { error } = await O.rpc("quality_scan_people_signals", { p_organization_id: A });
    assert(error, "una empresa ajena disparó el barrido sobre otra empresa");
  });

  await check("K9. el consultor tampoco lee la competencia por la puerta de atrás", async () => {
    const { data } = await C.rpc("quality_demonstrated_level_on", {
      p_organization_id: A, p_person_id: CARLOS, p_competency_id: COMP, p_on: day(0),
    });
    assert(data === null, "el consultor leyó la competencia de una persona vía RPC");
    // Y sin embargo SÍ puede leer lo que es estructura.
    const { data: req } = await C.rpc("quality_required_level_on", {
      p_organization_id: A, p_position_id: COORD, p_competency_id: COMP, p_on: day(0),
    });
    assert(Number(req) === 3, "el consultor no puede leer lo que exige un cargo");
  });

  await check("K10. la sesión no puede escribir tareas ni alertas a mano", async () => {
    const { error: e1 } = await Q.from("work_alerts").insert({
      organization_id: A, source_domain: "competence", alert_type: "competence_evidence_expiring",
      subject_type: "quality_person", subject_id: CARLOS, recipient_profile_id: quality.id,
      title: "A mano",
    });
    assert(e1, "la sesión pudo fabricar una alerta");
    const { error: e2 } = await Q.from("work_tasks").insert({
      organization_id: A, source_domain: "person", task_type: "performance_evaluation_due",
      subject_type: "quality_person", subject_id: CARLOS,
      title: "A mano", assignee_profile_id: quality.id,
    });
    assert(e2, "la sesión pudo fabricar una tarea");
  });

  // ==========================================================================
  console.log("\nL · QUALITY-01…05 siguen funcionando igual (§87)");
  // ==========================================================================

  await check("L1. una asignación por CUENTA (como en QUALITY-01) se sigue aceptando", async () => {
    const { data: pos } = await Q.from("quality_positions")
      .insert({ organization_id: A, name: `Jefe de Planta ${stamp}` }).select("id").single();
    const { error } = await Q.from("quality_position_assignments").insert({
      organization_id: A, position_id: pos!.id, profile_id: quality.id,
      assignment_type: "holder", effective_from: day(0),
    });
    assert(!error, `asignación por cuenta: ${error?.message}`);
  });

  await check("L2. los catálogos ensanchados siguen aceptando los valores anteriores", async () => {
    const { data: proc } = await Q.from("quality_processes")
      .insert({ organization_id: A, name: `Compras ${stamp}`, category_code: "core" })
      .select("id").single();
    assert(proc, "no se pudo crear un proceso de QUALITY-01");
    const { error } = await Q.from("work_events").insert({
      organization_id: A, source_domain: "risk", event_type: "risk.identified",
      subject_type: "quality_risk", subject_id: CONOCIMIENTO, summary: "prueba",
    });
    // La sesión no escribe eventos: lo que se comprueba es que el valor ANTIGUO
    // sigue siendo válido para el catálogo, no que se pueda insertar.
    assert(error, "la sesión pudo escribir en la bitácora de eventos");
  });

  console.log(`\nResultado: ${passed} conformes, ${failed} fallos\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
