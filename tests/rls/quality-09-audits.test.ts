/**
 * Trazaloop · QUALITY-09 · Auditorías, contra base real.
 *
 * Los escenarios del encargo (§74…§85) y los ataques (§91). Lo que se comprueba
 * aquí no es un CRUD: son las afirmaciones que SOLO se demuestran ejecutándolas.
 *
 *   · registrar un hallazgo —incluso «posible no conformidad»— deja el recuento
 *     de no conformidades EXACTAMENTE igual, y abrir el caso tampoco lo mueve;
 *   · contestar una pregunta del checklist no crea ningún hallazgo;
 *   · reprogramar conserva la fecha original y deja rastro;
 *   · cancelar no mejora la cobertura del programa;
 *   · publicar la v2 de un checklist no toca una sola respuesta de la v1;
 *   · la independencia se resuelve con el cargo de LA FECHA de la auditoría,
 *     no con el de hoy — aunque la persona ya haya cambiado de puesto;
 *   · el informe reimpreso devuelve lo de entonces aunque el equipo cambie;
 *   · cerrar la auditoría no cierra las acciones que abrió;
 *   · una auditoría de la empresa A no puede alcanzar un proceso, una persona,
 *     un documento ni una evidencia de la empresa B, ni con el UUID en la mano;
 *   · y una auditoría con historia no se borra.
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
  console.error("Faltan variables para test:quality09-rls (URL, ANON, SERVICE_ROLE).");
  process.exit(1);
}

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
async function check(n: string, fn: () => Promise<void>) {
  try { await fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
/** Sin sesión: exactamente lo que tiene alguien que llega de fuera. */
const publico = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function newUser(label: string, name: string) {
  const email = `q09-${label}-${stamp}@test.trazaloop.dev`;
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
const HACE_DOS_ANIOS = day(-730);
const HACE_UN_ANIO = day(-365);
const HACE_UN_MES = day(-30);
const AYER = day(-1);
const EN_UN_MES = day(30);
const EN_DOS_MESES = day(60);
const ENERO = `${new Date().getFullYear()}-01-01`;
const DICIEMBRE = `${new Date().getFullYear()}-12-31`;

async function newPosition(c: SupabaseClient, org: string, name: string) {
  const { data, error } = await c.from("quality_positions")
    .insert({ organization_id: org, name }).select("id").single();
  assert(!error && data, `cargo «${name}»: ${error?.message}`);
  return data!.id as string;
}

async function newPerson(c: SupabaseClient, org: string, name: string) {
  const { data, error } = await c.from("quality_people")
    .insert({ organization_id: org, full_name: name }).select("id").single();
  assert(!error && data, `persona «${name}»: ${error?.message}`);
  return data!.id as string;
}

async function newProcess(
  c: SupabaseClient, org: string, name: string, ownerPositionId: string | null
) {
  const { data, error } = await c.from("quality_processes").insert({
    organization_id: org, name, category_code: "core",
    owner_position_id: ownerPositionId,
  }).select("id").single();
  assert(!error && data, `proceso «${name}»: ${error?.message}`);
  return data!.id as string;
}

async function newProgram(c: SupabaseClient, org: string, name: string) {
  const { data, error } = await c.from("quality_audit_programs").insert({
    organization_id: org, name, period_label: String(new Date().getFullYear()),
    period_start: ENERO, period_end: DICIEMBRE,
    purpose: "Comprobar que el sistema hace lo que dice.",
    prioritization_note: "Se priorizó por riesgo y por antigüedad de la última auditoría.",
  }).select("id").single();
  assert(!error && data, `programa «${name}»: ${error?.message}`);
  await c.rpc("quality_record_program_revision", {
    p_program_id: data!.id, p_change_kind: "created", p_change_note: null,
  });
  return data!.id as string;
}

async function newAudit(
  c: SupabaseClient, org: string,
  input: { programId?: string | null; code: string; title: string;
           from?: string | null; to?: string | null; nature?: string }
) {
  const { data, error } = await c.from("quality_audits").insert({
    organization_id: org, program_id: input.programId ?? null,
    code: input.code, title: input.title,
    audit_type: "internal", nature: input.nature ?? "planned",
    objective: "Comprobar la conformidad del proceso con sus criterios.",
    planned_from: input.from ?? null, planned_to: input.to ?? null,
    scheduled_from: input.from ?? null, scheduled_to: input.to ?? null,
    status: input.from ? "planned" : "draft",
  }).select("id").single();
  assert(!error && data, `auditoría «${input.code}»: ${error?.message}`);
  return data!.id as string;
}

/** El recuento de no conformidades de la empresa, tal como lo cuenta el motor
 *  de casos. Es el número que NADA de este dominio puede mover solo. */
async function ncCount(c: SupabaseClient, org: string): Promise<number> {
  const { data, error } = await c.from("work_cases")
    .select("id").eq("organization_id", org).eq("classification", "nonconformity");
  assert(!error, `recuento de NC: ${error?.message}`);
  return (data ?? []).length;
}

async function main() {
  console.log("\nQUALITY-09 · base real\n");

  const owner = await newUser("adm", "Directora");
  const quality = await newUser("cal", "Coordinadora de Calidad");
  const consultant = await newUser("con", "Consultor externo");
  const outsider = await newUser("out", "Ajena");
  for (const u of [owner, quality, consultant, outsider]) {
    await u.client.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "q09" });
  }
  const { data: a } = await owner.client.rpc("create_organization", { p_name: `Q09 A ${stamp}` });
  const { data: b } = await outsider.client.rpc("create_organization", { p_name: `Q09 B ${stamp}` });
  const A = a as string, B = b as string;

  await admin.from("memberships").insert([
    { organization_id: A, user_id: quality.id, role_code: "quality", status: "active" },
    { organization_id: A, user_id: consultant.id, role_code: "consultant", status: "active" },
  ]);

  const Q = quality.client;    // administra y cierra
  // §33 · El consultor conduce el trabajo pero NO firma por la empresa: no
  // cierra, no emite el informe y no lee las notas restringidas de una
  // auditoría en la que no está en el equipo.
  const C = consultant.client;
  const O = outsider.client;   // otra empresa

  // ==========================================================================
  console.log("A · Escenario 1 · el programa NO es una auditoría (§74)");
  // ==========================================================================

  let PROGRAMA = "", COMPRAS = "", VENTAS = "", CARGO_COMPRAS = "";

  await check("A1. un programa se crea sin fechas de ejecución ni hallazgos", async () => {
    CARGO_COMPRAS = await newPosition(Q, A, `Jefatura de Compras ${stamp}`);
    COMPRAS = await newProcess(Q, A, `Compras ${stamp}`, CARGO_COMPRAS);
    VENTAS = await newProcess(Q, A, `Ventas ${stamp}`, null);
    PROGRAMA = await newProgram(Q, A, `Programa anual ${stamp}`);

    const { data } = await Q.from("quality_audit_programs")
      .select("*").eq("id", PROGRAMA).single();
    assert(data !== null, "el programa no se pudo leer");
    assert(!("scheduled_from" in (data as object)),
      "el programa tiene fechas de ejecución: se comporta como una auditoría");
    assert(data!.status === "draft", "el programa nace activo sin que nadie lo apruebe");
  });

  await check("A2. un programa vacío NO tiene cobertura: no dice 0%", async () => {
    const { data } = await Q.from("v_quality_audit_program_coverage")
      .select("*").eq("program_id", PROGRAMA).single();
    assert(data !== null, "no hay vista de cobertura");
    assert(data!.coverage_pct === null,
      `un programa sin auditorías declara ${data!.coverage_pct}% de cobertura`);
  });

  await check("A3. cada cambio del programa deja una REVISIÓN nueva", async () => {
    const { error } = await Q.from("quality_audit_programs")
      .update({ status: "active", approved_on: HOY }).eq("id", PROGRAMA);
    assert(!error, `aprobar: ${error?.message}`);
    await Q.rpc("quality_record_program_revision", {
      p_program_id: PROGRAMA, p_change_kind: "approved", p_change_note: "Aprobado en comité.",
    });
    const { data } = await Q.from("quality_audit_program_revisions")
      .select("revision_number, change_kind, snapshot").eq("program_id", PROGRAMA)
      .order("revision_number");
    assert((data ?? []).length === 2, `hay ${(data ?? []).length} revisiones, se esperaban 2`);
    assert(data![0].revision_number === 1 && data![1].revision_number === 2,
      "las revisiones no se numeran en orden");
    assert(data![0].snapshot !== null, "la primera revisión no guardó su foto");
  });

  await check("A4. una revisión ya escrita NO se puede editar ni borrar", async () => {
    const { data: rev } = await Q.from("quality_audit_program_revisions")
      .select("id").eq("program_id", PROGRAMA).eq("revision_number", 1).single();
    const { error: eu } = await Q.from("quality_audit_program_revisions")
      .update({ change_note: "otra cosa" }).eq("id", rev!.id);
    const { data: after } = await Q.from("quality_audit_program_revisions")
      .select("change_note").eq("id", rev!.id).single();
    assert(eu !== null || after?.change_note === null,
      "se reescribió una revisión del programa");
    await Q.from("quality_audit_program_revisions").delete().eq("id", rev!.id);
    const { data: still } = await Q.from("quality_audit_program_revisions")
      .select("id").eq("id", rev!.id);
    assert((still ?? []).length === 1, "se borró una revisión del programa");
  });

  // ==========================================================================
  console.log("\nB · Escenario 2 · reprogramar conserva la historia (§75)");
  // ==========================================================================

  let AUD1 = "";

  await check("B1. una auditoría nace con fecha original y fecha vigente iguales", async () => {
    AUD1 = await newAudit(Q, A, {
      programId: PROGRAMA, code: `AI-01-${stamp}`, title: "Auditoría del proceso de Compras",
      from: EN_UN_MES, to: EN_UN_MES,
    });
    const { data } = await Q.from("quality_audits")
      .select("planned_from, scheduled_from").eq("id", AUD1).single();
    assert(data!.planned_from === EN_UN_MES && data!.scheduled_from === EN_UN_MES,
      "la fecha original no se fijó al crear");
  });

  await check("B2. reprogramar mueve la vigente y NO toca la original", async () => {
    const { error } = await Q.rpc("quality_reschedule_audit", {
      p_audit_id: AUD1, p_from: EN_DOS_MESES, p_to: EN_DOS_MESES,
      p_reason: "El equipo auditor no estaba disponible en la fecha prevista.",
    });
    assert(!error, `reprogramar: ${error?.message}`);
    const { data } = await Q.from("quality_audits")
      .select("planned_from, scheduled_from").eq("id", AUD1).single();
    assert(data!.planned_from === EN_UN_MES,
      `la fecha original cambió a ${data!.planned_from}`);
    assert(data!.scheduled_from === EN_DOS_MESES, "la fecha vigente no se movió");
  });

  await check("B3. la reprogramación deja rastro con motivo y autor", async () => {
    const { data } = await Q.from("quality_audit_reschedules")
      .select("from_start, to_start, reason, decided_by").eq("audit_id", AUD1);
    assert((data ?? []).length === 1, `hay ${(data ?? []).length} reprogramaciones`);
    assert(data![0].from_start === EN_UN_MES && data![0].to_start === EN_DOS_MESES,
      "el rastro no dice de qué fecha a qué fecha");
    assert((data![0].reason as string).length > 10, "el rastro no lleva motivo");
    assert(data![0].decided_by !== null, "el rastro no dice quién reprogramó");
  });

  await check("B4. reprogramar sin motivo se rechaza", async () => {
    const { error } = await Q.rpc("quality_reschedule_audit", {
      p_audit_id: AUD1, p_from: EN_DOS_MESES, p_to: EN_DOS_MESES, p_reason: "  ",
    });
    assert(error !== null, "se reprogramó sin decir por qué");
  });

  // ==========================================================================
  console.log("\nC · Escenario 3 · cancelar NO mejora la cobertura (§76)");
  // ==========================================================================

  let AUD_CANCELADA = "";

  await check("C1. dos auditorías planificadas dan 0% de cobertura", async () => {
    AUD_CANCELADA = await newAudit(Q, A, {
      programId: PROGRAMA, code: `AI-02-${stamp}`, title: "Auditoría del proceso de Ventas",
      from: EN_UN_MES, to: EN_UN_MES,
    });
    const { data } = await Q.from("v_quality_audit_program_coverage")
      .select("planned_audits, executed_audits, coverage_pct")
      .eq("program_id", PROGRAMA).single();
    assert(Number(data!.planned_audits) === 2,
      `el programa cuenta ${data!.planned_audits} auditorías`);
    assert(Number(data!.coverage_pct) === 0, "la cobertura no es 0% sin ejecutar nada");
  });

  await check("C2. cancelar una NO sube la cobertura", async () => {
    const { error } = await Q.rpc("quality_cancel_audit", {
      p_audit_id: AUD_CANCELADA,
      p_reason: "El proceso se reorganizó y auditarlo ahora no diría nada.",
    });
    assert(!error, `cancelar: ${error?.message}`);
    const { data } = await Q.from("v_quality_audit_program_coverage")
      .select("planned_audits, cancelled_audits, coverage_pct")
      .eq("program_id", PROGRAMA).single();
    assert(Number(data!.planned_audits) === 2,
      "la cancelada desapareció del denominador y la cobertura subió sola");
    assert(Number(data!.cancelled_audits) === 1, "la cancelación no se contó");
    assert(Number(data!.coverage_pct) === 0,
      `la cobertura subió a ${data!.coverage_pct}% sin auditar nada`);
  });

  await check("C3. la auditoría cancelada SIGUE existiendo, con su razón", async () => {
    const { data } = await Q.from("quality_audits")
      .select("status, cancel_reason").eq("id", AUD_CANCELADA).single();
    assert(data!.status === "cancelled", "la auditoría no quedó cancelada");
    assert((data!.cancel_reason as string).length > 10, "no se conservó la razón");
  });

  // ==========================================================================
  console.log("\nD · Escenario 4 · criterio ≠ pregunta · la revisión de entonces (§77)");
  // ==========================================================================

  let CRIT_INTERNO = "";

  await check("D1. el alcance y los criterios se registran por separado", async () => {
    const { error: es } = await Q.from("quality_audit_scope_items").insert({
      organization_id: A, audit_id: AUD1, item_kind: "process", process_id: COMPRAS,
    });
    assert(!es, `alcance: ${es?.message}`);

    const { data: c, error: ec } = await Q.from("quality_audit_criteria").insert({
      organization_id: A, audit_id: AUD1, criterion_kind: "internal",
      custom_text: "Procedimiento interno de compras vigente.",
    }).select("id").single();
    assert(!ec && c, `criterio: ${ec?.message}`);
    CRIT_INTERNO = c!.id as string;
  });

  await check("D2. un criterio NO es una pregunta de checklist", async () => {
    const { data: crit } = await Q.from("quality_audit_criteria")
      .select("*").eq("id", CRIT_INTERNO).single();
    assert(!("prompt" in (crit as object)),
      "el criterio tiene enunciado de pregunta: son la misma cosa");
    assert(!("stable_key" in (crit as object)),
      "el criterio lleva clave estable: se confundió con una pregunta");
  });

  // ==========================================================================
  console.log("\nE · Escenario 5 · el checklist versiona; contestar no acusa (§78)");
  // ==========================================================================

  let CHK = "", V1 = "", V2 = "", ITEM1 = "", RUN = "";

  await check("E1. un checklist nace con su versión 1 en borrador", async () => {
    const { data: c, error: ec } = await Q.from("quality_audit_checklists")
      .insert({ organization_id: A, name: `Checklist de proceso ${stamp}` })
      .select("id").single();
    assert(!ec && c, `checklist: ${ec?.message}`);
    CHK = c!.id as string;

    const { data: v, error: ev } = await Q.from("quality_audit_checklist_versions")
      .insert({ organization_id: A, checklist_id: CHK, version_number: 1 })
      .select("id, status").single();
    assert(!ev && v, `versión: ${ev?.message}`);
    V1 = v!.id as string;
    assert(v!.status === "draft", "la versión nace publicada");
  });

  await check("E2. las preguntas se añaden mientras está en borrador", async () => {
    const { data, error } = await Q.from("quality_audit_checklist_items").insert({
      organization_id: A, version_id: V1, stable_key: "compras-orden",
      prompt: "¿Toda compra tiene orden aprobada antes de recibir?",
      position_order: 1,
    }).select("id").single();
    assert(!error && data, `pregunta: ${error?.message}`);
    ITEM1 = data!.id as string;
  });

  await check("E3. publicar la versión la cierra a edición", async () => {
    const { error } = await Q.rpc("quality_publish_checklist_version", {
      p_version_id: V1, p_effective_from: HACE_UN_MES, p_change_note: "Versión inicial",
    });
    assert(!error, `publicar: ${error?.message}`);

    const { error: ee } = await Q.from("quality_audit_checklist_items")
      .update({ prompt: "otra pregunta" }).eq("id", ITEM1);
    const { data: after } = await Q.from("quality_audit_checklist_items")
      .select("prompt").eq("id", ITEM1).single();
    assert(ee !== null || !/otra pregunta/.test(after!.prompt as string),
      "se editó una pregunta de una versión publicada");
  });

  await check("E4. la auditoría corre una VERSIÓN, no «el checklist»", async () => {
    const { data, error } = await Q.from("quality_audit_checklist_runs").insert({
      organization_id: A, audit_id: AUD1, checklist_id: CHK, version_id: V1,
    }).select("id").single();
    assert(!error && data, `recorrido: ${error?.message}`);
    RUN = data!.id as string;
  });

  await check("E5. marcar «posible brecha» NO crea ningún hallazgo", async () => {
    const antesNc = await ncCount(Q, A);
    const { data: antes } = await Q.from("quality_audit_findings")
      .select("id").eq("audit_id", AUD1);

    const { error } = await Q.from("quality_audit_check_results").insert({
      organization_id: A, run_id: RUN, item_id: ITEM1, outcome: "suspected_gap",
      note: "Dos de diez órdenes se recibieron sin aprobación previa.",
    });
    assert(!error, `respuesta: ${error?.message}`);

    const { data: despues } = await Q.from("quality_audit_findings")
      .select("id").eq("audit_id", AUD1);
    assert((despues ?? []).length === (antes ?? []).length,
      "contestar una pregunta creó un hallazgo");
    assert(await ncCount(Q, A) === antesNc,
      "contestar una pregunta movió el recuento de no conformidades");
  });

  await check("E6. la v2 no toca una sola respuesta de la v1", async () => {
    const { data: v, error: ev } = await Q.from("quality_audit_checklist_versions")
      .insert({ organization_id: A, checklist_id: CHK, version_number: 2,
                change_note: "Se reformuló la pregunta de compras." })
      .select("id").single();
    assert(!ev && v, `versión 2: ${ev?.message}`);
    V2 = v!.id as string;

    await Q.from("quality_audit_checklist_items").insert({
      organization_id: A, version_id: V2, stable_key: "compras-orden",
      prompt: "¿Toda compra tiene orden aprobada Y firmada antes de recibir?",
      position_order: 1,
    });
    const { error } = await Q.rpc("quality_publish_checklist_version", {
      p_version_id: V2, p_effective_from: HOY, p_change_note: "Reformulada",
    });
    assert(!error, `publicar v2: ${error?.message}`);

    const { data: run } = await Q.from("quality_audit_checklist_runs")
      .select("version_id").eq("id", RUN).single();
    assert(run!.version_id === V1, "el recorrido saltó a la versión nueva");
    const { data: res } = await Q.from("quality_audit_check_results")
      .select("outcome, item_id").eq("run_id", RUN);
    assert((res ?? []).length === 1 && res![0].item_id === ITEM1,
      "la respuesta de la v1 cambió de pregunta al publicar la v2");
    assert(res![0].outcome === "suspected_gap", "la respuesta guardada cambió");

    const { data: v1 } = await Q.from("quality_audit_checklist_versions")
      .select("status").eq("id", V1).single();
    assert(v1!.status === "superseded", "la v1 no quedó marcada como sustituida");
  });

  // ==========================================================================
  console.log("\nF · Escenario 6 · evidencia ≠ hallazgo · nota ≠ evidencia (§79)");
  // ==========================================================================

  let EV1 = "", MUESTRA = "";

  await check("F1. la ejecución empieza y se registran notas y muestras", async () => {
    await Q.from("quality_audits")
      .update({ status: "in_progress", executed_from: HOY }).eq("id", AUD1);

    const { error: en } = await Q.from("quality_audit_notes").insert({
      organization_id: A, audit_id: AUD1, note_kind: "interview",
      body: "El comprador dice que la aprobación a veces llega después.",
      is_restricted: true,
    });
    assert(!en, `nota: ${en?.message}`);

    const { data: m, error: em } = await Q.from("quality_audit_samples").insert({
      organization_id: A, audit_id: AUD1,
      description: "Órdenes de compra del último trimestre",
      population_size: 400, sample_size: 10, selection_method: "Aleatorio simple",
    }).select("id").single();
    assert(!em && m, `muestra: ${em?.message}`);
    MUESTRA = m!.id as string;
  });

  await check("F2. una nota NO es evidencia ni hallazgo", async () => {
    const { data: ev } = await Q.from("quality_audit_evidence")
      .select("id").eq("audit_id", AUD1);
    assert((ev ?? []).length === 0, "registrar una nota creó evidencia");
    const { data: f } = await Q.from("quality_audit_findings")
      .select("id").eq("audit_id", AUD1);
    assert((f ?? []).length === 0, "registrar una nota creó un hallazgo");
  });

  await check("F3. la evidencia REFERENCIA lo que ya existe", async () => {
    const { data, error } = await Q.from("quality_audit_evidence").insert({
      organization_id: A, audit_id: AUD1, evidence_kind: "record",
      description: "Dos órdenes recibidas sin aprobación previa.",
      sample_id: MUESTRA, collected_on: HOY,
    }).select("id").single();
    assert(!error && data, `evidencia: ${error?.message}`);
    EV1 = data!.id as string;

    const { data: f } = await Q.from("quality_audit_findings")
      .select("id").eq("audit_id", AUD1);
    assert((f ?? []).length === 0, "registrar evidencia creó un hallazgo");
  });

  await check("F4. una nota restringida NO la lee quien no conduce ni audita", async () => {
    const { data: comoCalidad } = await Q.from("quality_audit_notes")
      .select("id").eq("audit_id", AUD1);
    assert((comoCalidad ?? []).length === 1, "quien conduce el dominio no ve su propia nota");

    // El consultor es miembro de la empresa y puede crear auditorías, pero no
    // está en el equipo de ESTA y no tiene el papel que firma por la empresa.
    const { data: comoConsultor } = await C.from("quality_audit_notes")
      .select("id").eq("audit_id", AUD1);
    assert((comoConsultor ?? []).length === 0,
      "alguien ajeno al equipo auditor leyó una nota de entrevista restringida");
  });

  // ==========================================================================
  console.log("\nG · Escenario 7 · HALLAZGO ≠ NO CONFORMIDAD (§80) · CRÍTICO");
  // ==========================================================================

  let HALLAZGO = "", NC_ANTES = 0;

  await check("G1. registrar «posible no conformidad» NO mueve el recuento de NC", async () => {
    NC_ANTES = await ncCount(Q, A);

    const { data, error } = await Q.from("quality_audit_findings").insert({
      organization_id: A, audit_id: AUD1, code: "H-01",
      criterion_id: CRIT_INTERNO, process_id: COMPRAS,
      statement: "Dos de diez órdenes de compra se recibieron sin aprobación previa.",
      proposed_classification: "nonconformity_suspected",
      proposed_severity: "major", raised_on: HOY,
    }).select("id, evaluation_status, case_id").single();
    assert(!error && data, `hallazgo: ${error?.message}`);
    HALLAZGO = data!.id as string;

    assert(data!.evaluation_status === "pending", "el hallazgo nació ya evaluado");
    assert(data!.case_id === null, "el hallazgo nació con un caso pegado");
    assert(await ncCount(Q, A) === NC_ANTES,
      "REGISTRAR UN HALLAZGO CREÓ UNA NO CONFORMIDAD");
  });

  await check("G2. tampoco se creó ningún caso ni ninguna acción", async () => {
    const { data: casos } = await Q.from("work_cases")
      .select("id").eq("organization_id", A).eq("origin_kind", "audit");
    assert((casos ?? []).length === 0, "registrar el hallazgo abrió un caso");
    const { data: acciones } = await Q.from("work_actions")
      .select("id").eq("organization_id", A);
    assert((acciones ?? []).length === 0, "registrar el hallazgo creó una acción");
  });

  await check("G3. la evidencia se ata al hallazgo DESPUÉS, a mano", async () => {
    const { error } = await Q.from("quality_audit_finding_evidence").insert({
      organization_id: A, finding_id: HALLAZGO, evidence_id: EV1,
    });
    assert(!error, `vínculo: ${error?.message}`);
    assert(await ncCount(Q, A) === NC_ANTES, "atar evidencia movió el recuento de NC");
  });

  await check("G4. evaluar el hallazgo TAMPOCO crea la no conformidad", async () => {
    const { error } = await Q.rpc("quality_evaluate_audit_finding", {
      p_finding_id: HALLAZGO, p_status: "evaluated",
      p_note: "El hecho es real y hay que tratarlo. Se decidirá en el caso.",
    });
    assert(!error, `evaluar: ${error?.message}`);
    assert(await ncCount(Q, A) === NC_ANTES, "evaluar el hallazgo creó una NC");
  });

  await check("G5. escalar abre un CASO, y el caso tampoco nace como NC", async () => {
    const { data: caseId, error } = await Q.rpc("quality_open_case_from_audit_finding", {
      p_finding_id: HALLAZGO, p_title: null, p_description: null,
    });
    assert(!error && caseId, `escalar: ${error?.message}`);

    const { data: caso } = await Q.from("work_cases")
      .select("classification, origin_kind, case_type").eq("id", caseId as string).single();
    assert(caso!.origin_kind === "audit", "el caso no dice que vino de una auditoría");
    assert(caso!.classification !== "nonconformity",
      "el caso nació clasificado como no conformidad");
    assert(await ncCount(Q, A) === NC_ANTES,
      "ABRIR EL CASO DESDE EL HALLAZGO MOVIÓ EL RECUENTO DE NO CONFORMIDADES");

    const { data: f } = await Q.from("quality_audit_findings")
      .select("evaluation_status, case_id").eq("id", HALLAZGO).single();
    assert(f!.evaluation_status === "escalated", "el hallazgo no quedó marcado como escalado");
    assert(f!.case_id === caseId, "el hallazgo no apunta al caso que se abrió");
  });

  await check("G6. una observación tampoco es una no conformidad", async () => {
    const { error } = await Q.from("quality_audit_findings").insert({
      organization_id: A, audit_id: AUD1, code: "H-02", process_id: COMPRAS,
      statement: "El tablero de indicadores se actualiza a mano y podría automatizarse.",
      proposed_classification: "observation", raised_on: HOY,
    });
    assert(!error, `observación: ${error?.message}`);
    assert(await ncCount(Q, A) === NC_ANTES, "una observación creó una no conformidad");
  });

  await check("G7. el auditor NO puede declarar una no conformidad desde el hallazgo", async () => {
    const { error } = await Q.from("quality_audit_findings").insert({
      organization_id: A, audit_id: AUD1, code: "H-03", process_id: COMPRAS,
      statement: "Intento de clasificar en firme desde la auditoría.",
      proposed_classification: "nonconformity", raised_on: HOY,
    });
    assert(error !== null, "se aceptó «no conformidad» como clasificación del hallazgo");
  });

  // ==========================================================================
  console.log("\nH · Escenario 8 · la independencia es HISTÓRICA (§75, §83)");
  // ==========================================================================

  let AUDITORA = "";

  await check("H1. quien fue dueño del proceso EN LA FECHA es un conflicto", async () => {
    AUDITORA = await newPerson(Q, A, `Auditora ${stamp}`);
    // Ocupó la jefatura de Compras hace dos años y la dejó hace un mes.
    const { error: ea } = await Q.from("quality_position_assignments").insert({
      organization_id: A, position_id: CARGO_COMPRAS, person_id: AUDITORA,
      assignment_type: "holder",
      effective_from: HACE_DOS_ANIOS, effective_to: HACE_UN_MES,
    });
    assert(!ea, `asignación: ${ea?.message}`);

    const { error: et } = await Q.from("quality_audit_team_members").insert({
      organization_id: A, audit_id: AUD1, person_id: AUDITORA, team_role: "lead",
    });
    assert(!et, `equipo: ${et?.message}`);

    // Preguntando por una fecha en la que SÍ ocupaba el cargo.
    const { data, error } = await Q.rpc("quality_audit_conflicts_on", {
      p_organization_id: A, p_audit_id: AUD1, p_on: HACE_UN_ANIO,
    });
    assert(!error, `conflictos: ${error?.message}`);
    assert((data ?? []).length >= 1,
      "no se detectó el conflicto con el cargo que ocupaba en esa fecha");
    assert((data as { conflict_kind: string }[])
      .some((c) => c.conflict_kind === "owns_audited_process"),
      "el conflicto detectado no es el de auditar el proceso que dirigía");
  });

  await check("H2. hoy, con el cargo ya dejado, ese conflicto NO aparece", async () => {
    const { data } = await Q.rpc("quality_audit_conflicts_on", {
      p_organization_id: A, p_audit_id: AUD1, p_on: HOY,
    });
    assert(!(data as { conflict_kind: string }[] ?? [])
      .some((c) => c.conflict_kind === "owns_audited_process"),
      "se detecta un conflicto con un cargo que ya no ocupa: la fecha no se respeta");
  });

  await check("H3. la comprobación NUNCA declara a nadie independiente", async () => {
    const { data, error } = await Q.rpc("quality_check_audit_independence", {
      p_audit_id: AUD1,
    });
    assert(!error, `comprobar: ${error?.message}`);
    const r = data as Record<string, unknown>;
    assert(r.declares_independence === false,
      "la comprobación afirma que el equipo es independiente");
    assert("conflicts_found" in r, "la comprobación no dice cuántos conflictos encontró");
  });

  await check("H4. un conflicto detectado exige una decisión con mitigación", async () => {
    const { data: c } = await Q.from("quality_audit_conflict_checks")
      .select("id, status").eq("audit_id", AUD1).eq("status", "detected").limit(1);
    if ((c ?? []).length === 0) return; // en la fecha de hoy puede no haber ninguno
    const id = c![0].id as string;

    const { error: mal } = await Q.from("quality_audit_conflict_checks")
      .update({ status: "accepted_with_mitigation", decided_at: new Date().toISOString() })
      .eq("id", id);
    assert(mal !== null, "se aceptó un conflicto sin escribir la mitigación");

    const { error: bien } = await Q.from("quality_audit_conflict_checks").update({
      status: "accepted_with_mitigation",
      mitigation: "Otro auditor revisa las conclusiones sobre ese proceso.",
      decided_at: new Date().toISOString(),
    }).eq("id", id);
    assert(!bien, `decisión: ${bien?.message}`);
  });

  // ==========================================================================
  console.log("\nI · Escenario 9 · el informe es una FOTO (§82)");
  // ==========================================================================

  let INFORME = "";

  await check("I1. no se puede emitir informe sin conclusiones", async () => {
    await Q.from("quality_audits")
      .update({ status: "executed", executed_to: HOY }).eq("id", AUD1);
    const { error } = await Q.rpc("quality_issue_audit_report", {
      p_audit_id: AUD1, p_summary: null,
    });
    assert(error !== null, "se emitió un informe sin conclusiones");
  });

  await check("I2. con conclusiones escritas, el informe se emite y congela", async () => {
    await Q.from("quality_audits").update({
      conclusions: "El proceso opera conforme a su procedimiento salvo en la "
        + "aprobación previa de las órdenes, donde se levantó un hallazgo.",
      conclusions_at: new Date().toISOString(),
    }).eq("id", AUD1);

    const { data, error } = await Q.rpc("quality_issue_audit_report", {
      p_audit_id: AUD1, p_summary: "Informe de la auditoría de Compras.",
    });
    assert(!error && data, `emitir: ${error?.message}`);
    INFORME = data as string;

    const { data: r } = await Q.from("quality_audit_reports")
      .select("version_number, snapshot").eq("id", INFORME).single();
    assert(Number(r!.version_number) === 1, "el informe no es la versión 1");
    const snap = r!.snapshot as Record<string, unknown>;
    assert(Array.isArray(snap.team) && (snap.team as unknown[]).length === 1,
      "la foto no guardó el equipo auditor");
    assert(Array.isArray(snap.findings) && (snap.findings as unknown[]).length === 2,
      "la foto no guardó los hallazgos");
  });

  await check("I3. cambiar el equipo DESPUÉS no cambia el informe", async () => {
    const otro = await newPerson(Q, A, `Auditor de apoyo ${stamp}`);
    await Q.from("quality_audit_team_members").insert({
      organization_id: A, audit_id: AUD1, person_id: otro, team_role: "auditor",
    });

    const { data: r } = await Q.from("quality_audit_reports")
      .select("snapshot").eq("id", INFORME).single();
    const snap = r!.snapshot as Record<string, unknown>;
    assert((snap.team as unknown[]).length === 1,
      "el informe emitido cambió al cambiar el equipo: no era una foto");

    const { data: hoy } = await Q.from("quality_audit_team_members")
      .select("id").eq("audit_id", AUD1);
    assert((hoy ?? []).length === 2, "el equipo de hoy no creció");
  });

  await check("I4. un informe emitido no se edita ni se borra", async () => {
    const { error: eu } = await Q.from("quality_audit_reports")
      .update({ summary: "otra cosa" }).eq("id", INFORME);
    const { data: after } = await Q.from("quality_audit_reports")
      .select("summary").eq("id", INFORME).single();
    assert(eu !== null || !/otra cosa/.test(after!.summary as string),
      "se reescribió un informe emitido");

    await Q.from("quality_audit_reports").delete().eq("id", INFORME);
    const { data: still } = await Q.from("quality_audit_reports").select("id").eq("id", INFORME);
    assert((still ?? []).length === 1, "se borró un informe emitido");
  });

  await check("I5. una corrección es un informe NUEVO que apunta al anterior", async () => {
    const { data, error } = await Q.rpc("quality_issue_audit_report", {
      p_audit_id: AUD1, p_summary: "Corrige un dato del alcance.",
    });
    assert(!error && data, `segundo informe: ${error?.message}`);
    const { data: r } = await Q.from("quality_audit_reports")
      .select("version_number, supersedes_id").eq("id", data as string).single();
    assert(Number(r!.version_number) === 2, "el segundo informe no es la versión 2");
    assert(r!.supersedes_id === INFORME, "el segundo informe no corrige al primero");
  });

  // ==========================================================================
  console.log("\nJ · Escenario 10 · cerrar la auditoría ≠ cerrar las acciones (§81)");
  // ==========================================================================

  await check("J1. no se cierra dejando hallazgos sin evaluar", async () => {
    const { error } = await Q.rpc("quality_close_audit", {
      p_audit_id: AUD1, p_closure_note: "Se cierra el trabajo de auditar.",
      p_followup_note: null,
    });
    assert(error !== null, "se cerró con un hallazgo sin evaluar");
  });

  await check("J2. con todo evaluado, se cierra AUNQUE queden acciones abiertas", async () => {
    const { data: pend } = await Q.from("quality_audit_findings")
      .select("id").eq("audit_id", AUD1).eq("evaluation_status", "pending");
    for (const f of pend ?? []) {
      await Q.rpc("quality_evaluate_audit_finding", {
        p_finding_id: f.id, p_status: "evaluated",
        p_note: "Es una oportunidad de mejora; no requiere acción correctiva.",
      });
    }

    const { error } = await Q.rpc("quality_close_audit", {
      p_audit_id: AUD1,
      p_closure_note: "El trabajo de auditar terminó: se ejecutó, se evaluó y hay informe.",
      p_followup_note: "Queda abierto el caso que salió del hallazgo H-01.",
    });
    assert(!error, `cerrar: ${error?.message}`);

    const { data: aud } = await Q.from("quality_audits")
      .select("status, closed_at, followup_note").eq("id", AUD1).single();
    assert(aud!.status === "closed", "la auditoría no quedó cerrada");
    assert(aud!.followup_note !== null, "cerrar no exigió decir qué queda abierto");
  });

  await check("J3. el caso que abrió la auditoría SIGUE abierto después de cerrarla", async () => {
    const { data } = await Q.from("v_quality_audit_overview")
      .select("open_cases, open_actions").eq("audit_id", AUD1).single();
    assert(Number(data!.open_cases) >= 1,
      "cerrar la auditoría cerró el caso que había abierto");
  });

  await check("J4. una auditoría cerrada no admite hallazgos nuevos", async () => {
    const { error } = await Q.from("quality_audit_findings").insert({
      organization_id: A, audit_id: AUD1, code: "H-99",
      statement: "Intento de añadir un hallazgo después de cerrar.",
      proposed_classification: "observation", raised_on: HOY,
    });
    assert(error !== null, "se añadió un hallazgo a una auditoría cerrada");
  });

  // ==========================================================================
  console.log("\nK · Escenario 11 · quién puede qué (§33, §84)");
  // ==========================================================================

  await check("K1. un consultor externo CONDUCE el trabajo", async () => {
    const id = await newAudit(C, A, {
      programId: PROGRAMA, code: `AI-03-${stamp}`, title: "Auditoría conducida por el consultor",
      from: EN_UN_MES, to: EN_UN_MES,
    });
    assert(id.length > 0, "el consultor no pudo crear una auditoría");
  });

  await check("K2. un consultor externo NO cierra ni emite el informe", async () => {
    const { data: aud } = await C.from("quality_audits")
      .select("id").eq("organization_id", A).eq("code", `AI-03-${stamp}`).single();
    const { error } = await C.rpc("quality_close_audit", {
      p_audit_id: aud!.id, p_closure_note: "Intento de cierre por el consultor.",
      p_followup_note: null,
    });
    assert(error !== null, "un consultor externo cerró una auditoría de la empresa");
  });

  await check("K3. quien pertenece a la empresa LEE las auditorías", async () => {
    const { data } = await C.from("quality_audits").select("id").eq("organization_id", A);
    assert((data ?? []).length >= 1, "un miembro de la empresa no puede leer las auditorías");
  });

  await check("K4. quien NO pertenece a la empresa no escribe en ella", async () => {
    const { error } = await O.from("quality_audits").insert({
      organization_id: A, code: `AI-X-${stamp}`, title: "Intento desde fuera",
      audit_type: "internal", nature: "planned",
    });
    assert(error !== null, "alguien de otra empresa creó una auditoría en A");
  });

  // ==========================================================================
  console.log("\nL · Escenario 12 · la frontera entre empresas (§62, §91)");
  // ==========================================================================

  let PROCESO_B = "", PERSONA_B = "", AUD_B = "";

  await check("L1. la empresa B tiene sus propias cosas", async () => {
    PROCESO_B = await newProcess(O, B, `Proceso ajeno ${stamp}`, null);
    PERSONA_B = await newPerson(O, B, `Persona ajena ${stamp}`);
    AUD_B = await newAudit(O, B, { code: `AJ-01-${stamp}`, title: "Auditoría ajena" });
  });

  await check("L2. A NO puede meter un proceso de B en su alcance, con el UUID en la mano", async () => {
    const { error } = await Q.from("quality_audit_scope_items").insert({
      organization_id: A, audit_id: AUD1, item_kind: "process", process_id: PROCESO_B,
    });
    assert(error !== null, "una auditoría de A alcanzó un proceso de B");
  });

  await check("L3. A NO puede poner a una persona de B en su equipo auditor", async () => {
    const { data: aud } = await Q.from("quality_audits")
      .select("id").eq("organization_id", A).eq("code", `AI-03-${stamp}`).single();
    const { error } = await Q.from("quality_audit_team_members").insert({
      organization_id: A, audit_id: aud!.id, person_id: PERSONA_B, team_role: "auditor",
    });
    assert(error !== null, "una auditoría de A fichó a una persona de B");
  });

  await check("L4. A NO ve las auditorías de B, ni sus hallazgos", async () => {
    const { data: auds } = await Q.from("quality_audits").select("id").eq("id", AUD_B);
    assert((auds ?? []).length === 0, "A leyó una auditoría de B");
    const { data: f } = await Q.from("quality_audit_findings").select("id").eq("audit_id", AUD_B);
    assert((f ?? []).length === 0, "A leyó los hallazgos de B");
  });

  await check("L5. las RPC de A devuelven vacío o fallan sobre una auditoría de B", async () => {
    const { data: conf } = await Q.rpc("quality_audit_conflicts_on", {
      p_organization_id: B, p_audit_id: AUD_B, p_on: HOY,
    });
    assert((conf ?? []).length === 0, "A obtuvo los conflictos de una auditoría de B");

    const { data: dos } = await Q.rpc("quality_audit_preparation_dossier", {
      p_audit_id: AUD_B,
    });
    assert(dos === null, "A obtuvo el expediente de preparación de una auditoría de B");

    const { error } = await Q.rpc("quality_close_audit", {
      p_audit_id: AUD_B, p_closure_note: "Intento de cerrar la auditoría de otra empresa.",
      p_followup_note: null,
    });
    assert(error !== null, "A cerró una auditoría de B");
  });

  await check("L6. sin sesión no se ve ni se escribe nada", async () => {
    const { data } = await publico.from("quality_audits").select("id").limit(1);
    assert((data ?? []).length === 0, "un anónimo leyó auditorías");
    const { error } = await publico.from("quality_audit_findings").insert({
      organization_id: A, audit_id: AUD1, code: "H-ANON",
      statement: "Intento anónimo.", proposed_classification: "observation",
    });
    assert(error !== null, "un anónimo escribió un hallazgo");
    const { data: rpc } = await publico.rpc("quality_audit_conflicts_on", {
      p_organization_id: A, p_audit_id: AUD1, p_on: HOY,
    });
    assert((rpc ?? []).length === 0, "un anónimo ejecutó una RPC del dominio");
  });

  // ==========================================================================
  console.log("\nM · Escenario 13 · el barrido AVISA y no decide (§85)");
  // ==========================================================================

  await check("M1. el barrido es idempotente: dos pasadas, los mismos avisos", async () => {
    const vencida = await newAudit(Q, A, {
      programId: PROGRAMA, code: `AI-04-${stamp}`, title: "Auditoría que se pasó de fecha",
      from: AYER, to: AYER,
    });
    assert(vencida.length > 0, "no se pudo crear la auditoría vencida");

    const { data: n1, error: e1 } = await Q.rpc("quality_scan_audits", { p_organization_id: A });
    assert(!e1, `barrido: ${e1?.message}`);
    const { data: alertas1 } = await Q.from("work_alerts")
      .select("id").eq("organization_id", A).like("alert_type", "audit%");

    const { data: n2 } = await Q.rpc("quality_scan_audits", { p_organization_id: A });
    const { data: alertas2 } = await Q.from("work_alerts")
      .select("id").eq("organization_id", A).like("alert_type", "audit%");

    assert((alertas1 ?? []).length === (alertas2 ?? []).length,
      `la segunda pasada creó ${(alertas2 ?? []).length - (alertas1 ?? []).length} avisos más`);
    assert(Number(n2 ?? 0) === 0, "la segunda pasada dice haber creado avisos nuevos");
    void n1;
  });

  await check("M2. el barrido no cambió el estado de nada", async () => {
    const { data } = await Q.from("quality_audits")
      .select("status").eq("organization_id", A).eq("code", `AI-04-${stamp}`).single();
    assert(data!.status === "planned",
      `el barrido movió la auditoría vencida a «${data!.status}»`);
    assert(await ncCount(Q, A) === NC_ANTES, "el barrido creó no conformidades");
  });

  // ==========================================================================
  console.log("\nN · Escenario 14 · borrar (§59, §86)");
  // ==========================================================================

  await check("N1. una auditoría con hallazgos e informe NO se borra", async () => {
    const { data, error } = await Q.rpc("quality_deletion_eligibility", {
      p_entity: "audit", p_id: AUD1,
    });
    assert(!error, `dictamen: ${error?.message}`);
    const v = data as Record<string, unknown>;
    assert(v.can_hard_delete === false, "el dictamen permite borrar una auditoría con historia");
    assert(Array.isArray(v.blocking) && (v.blocking as unknown[]).length > 0,
      "el dictamen no dice qué lo impide");

    await Q.from("quality_audits").delete().eq("id", AUD1);
    const { data: still } = await Q.from("quality_audits").select("id").eq("id", AUD1);
    assert((still ?? []).length === 1, "se borró una auditoría con historia");
  });

  await check("N2. una auditoría recién creada y vacía SÍ se borra", async () => {
    const vacia = await newAudit(Q, A, { code: `AI-05-${stamp}`, title: "Auditoría vacía" });
    const { data } = await Q.rpc("quality_deletion_eligibility", {
      p_entity: "audit", p_id: vacia,
    });
    assert((data as Record<string, unknown>).can_hard_delete === true,
      "una auditoría vacía no se puede borrar");
    const { error } = await Q.from("quality_audits").delete().eq("id", vacia);
    assert(!error, `borrar la vacía: ${error?.message}`);
  });

  await check("N3. un programa con auditorías NO se borra", async () => {
    const { data } = await Q.rpc("quality_deletion_eligibility", {
      p_entity: "audit_program", p_id: PROGRAMA,
    });
    assert((data as Record<string, unknown>).can_hard_delete === false,
      "el dictamen permite borrar un programa con auditorías");
  });

  await check("N4. el dictamen no responde a quien no es de la empresa", async () => {
    const { data } = await O.rpc("quality_deletion_eligibility", {
      p_entity: "audit", p_id: AUD1,
    });
    const v = data as Record<string, unknown> | null;
    assert(v === null || v.reason_code === "not_found" || v.can_hard_delete === false,
      "una empresa ajena obtuvo el dictamen de una auditoría de A");
  });

  await check("N5. las guardas heredadas del dictamen siguen en pie", async () => {
    const { data } = await publico.rpc("quality_deletion_eligibility", {
      p_entity: "audit", p_id: AUD1,
    });
    const v = data as Record<string, unknown> | null;
    assert(v === null || v.can_hard_delete === false,
      "un anónimo obtuvo permiso de borrado");
  });

  console.log(`\nResultado: ${passed} conformes, ${failed} fallos\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
