/**
 * Trazaloop · QUALITY-04 · Casos y acciones, contra base real.
 *
 * Lo que estas comprobaciones defienden no es un CRUD: son las separaciones que
 * hacen que un sistema de calidad sirva para algo.
 *
 *   · una señal NO es una no conformidad (AC-04);
 *   · completada NO es eficaz (AC-13);
 *   · una verificación negativa NO se corrige, se conserva (AC-22);
 *   · un caso NO se cierra porque las tareas estén marcadas (AC-18).
 *
 * Todo corre con la sesión REAL de cada usuario. El cliente administrativo solo
 * crea cuentas.
 */
import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) {
  console.error("Faltan variables para test:quality04-rls (URL, ANON, SERVICE_ROLE).");
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

async function newUser(label: string, name: string) {
  const email = `q04-${label}-${stamp}@test.trazaloop.dev`;
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

async function newCase(c: SupabaseClient, org: string, title: string, extra: Record<string, unknown> = {}) {
  const { data: code } = await c.rpc("work_next_case_code", { p_organization_id: org });
  const { data, error } = await c.from("work_cases")
    .insert({ organization_id: org, code, title, ...extra }).select("id, code").single();
  assert(!error && data, `crear caso «${title}»: ${error?.message}`);
  return { id: data!.id as string, code: data!.code as string };
}

async function addFinding(c: SupabaseClient, org: string, caseId: string, statement: string) {
  const { error } = await c.from("work_case_findings")
    .insert({ organization_id: org, case_id: caseId, statement });
  assert(!error, `hallazgo: ${error?.message}`);
}

async function newAction(
  c: SupabaseClient, org: string, caseId: string, kind: string, title: string,
  opts: { requires?: boolean; criteria?: string; due?: string; owner?: string } = {}
) {
  const { data: code } = await c.rpc("work_next_action_code", { p_organization_id: org });
  const { data, error } = await c.from("work_actions").insert({
    organization_id: org, code, action_kind: kind, title,
    due_on: opts.due ?? null, original_due_on: opts.due ?? null,
    owner_position_id: opts.owner ?? null,
    requires_effectiveness: opts.requires ?? false,
    effectiveness_criteria: opts.criteria ?? null,
    effectiveness_result: opts.requires ? "pending" : "not_required",
  }).select("id, code").single();
  assert(!error && data, `crear acción «${title}»: ${error?.message}`);
  const { error: refErr } = await c.from("work_references").insert({
    organization_id: org, owner_kind: "action", owner_id: data!.id,
    ref_kind: "work_case", ref_id: caseId, relation: "origin",
  });
  assert(!refErr, `enlazar acción con caso: ${refErr?.message}`);
  return { id: data!.id as string, code: data!.code as string };
}

async function ncCount(c: SupabaseClient, org: string): Promise<number> {
  const { data } = await c.from("work_cases").select("id")
    .eq("organization_id", org).eq("classification", "nonconformity");
  return (data ?? []).length;
}

async function main() {
  console.log("\nQUALITY-04 · base real\n");

  const owner = await newUser("qa", "Coordinadora de Calidad");
  const worker = await newUser("op", "Operario");
  const outsider = await newUser("out", "Ajena");
  for (const u of [owner, worker, outsider]) {
    await u.client.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "q04" });
  }
  const { data: a } = await owner.client.rpc("create_organization", { p_name: `Q04 A ${stamp}` });
  const { data: b } = await outsider.client.rpc("create_organization", { p_name: `Q04 B ${stamp}` });
  const A = a as string, B = b as string;

  // Un cargo con titular, para que la responsabilidad apunte a un CARGO.
  // La membresía va ANTES de la asignación: un disparador de 0112 exige que el
  // titular de un cargo pertenezca a la empresa, y al revés falla en silencio.
  await admin.from("memberships").insert({
    organization_id: A, user_id: worker.id, role_code: "consultant", status: "active",
  });
  const { data: pos } = await owner.client.from("quality_positions")
    .insert({ organization_id: A, name: "Coordinador de Calidad", code: "CC" }).select("id").single();
  const { error: asgErr } = await owner.client.from("quality_position_assignments").insert({
    organization_id: A, position_id: pos!.id, profile_id: worker.id, assignment_type: "holder",
  });
  assert(!asgErr, `asignar titular: ${asgErr?.message}`);
  const { data: proc } = await owner.client.from("quality_processes")
    .insert({ organization_id: A, name: `Gestión de calidad ${stamp}`, category_code: "core" })
    .select("id").single();

  // -------------------------------------------------------------------------
  console.log("A · Señal ≠ caso ≠ no conformidad");
  // -------------------------------------------------------------------------

  const { data: indId } = await owner.client.from("quality_indicators").insert({
    organization_id: A, code: `IND-${stamp.slice(-5)}`, name: "Tiempo de aprobación",
    scope_type: "organization", admin_state: "active",
  }).select("id").single();
  await owner.client.rpc("quality_publish_indicator_config", {
    p_indicator_id: indId!.id, p_effective_from: "2020-01-01",
    p_unit_code: "percent", p_direction: "higher_is_better", p_frequency: "monthly",
    p_target_value: 95, p_target_min: null, p_target_max: null,
    p_warning_value: null, p_warning_min: null, p_warning_max: null,
    p_source_kind: "manual", p_source_key: null, p_calc_definition: null,
    p_formula_text: null, p_unit_label: null, p_source_note: null,
    p_consolidation: "none", p_comparability_break: false,
    p_comparability_note: null, p_change_note: null,
  });

  await check("A1. un indicador FUERA DE META no crea ninguna no conformidad", async () => {
    const y = new Date().getUTCFullYear();
    const { error } = await owner.client.rpc("quality_record_measurement", {
      p_indicator_id: indId!.id, p_period_start: `${y}-01-01`, p_period_end: `${y}-01-31`,
      p_value: 82, p_data_state: "reported", p_components: null, p_note: null,
    });
    assert(!error, `medir: ${error?.message}`);
    const { data: m } = await owner.client.from("quality_measurements")
      .select("evaluation").eq("indicator_id", indId!.id).maybeSingle();
    assert(m!.evaluation === "not_met", `la medición debía no cumplir, dio ${m!.evaluation}`);
    // La señal existe…
    await owner.client.rpc("quality_scan_pending_measurements", { p_organization_id: A });
    // …y el contador de no conformidades sigue en CERO.
    assert(await ncCount(owner.client, A) === 0, "se creó una no conformidad automáticamente");
    const { data: cases } = await owner.client.from("work_cases").select("id").eq("organization_id", A);
    assert((cases ?? []).length === 0, "se creó un caso automáticamente");
  });

  let signalCase = { id: "", code: "" };
  await check("A2. un usuario crea el caso DESDE la señal, y el caso la referencia", async () => {
    signalCase = await newCase(owner.client, A, "Tiempo de aprobación por encima de meta", {
      origin_kind: "indicator", created_by: owner.id, reported_by: owner.id,
    });
    const { error } = await owner.client.from("work_references").insert({
      organization_id: A, owner_kind: "case", owner_id: signalCase.id,
      ref_kind: "quality_indicator", ref_id: indId!.id, relation: "origin",
      snapshot: { label: "Tiempo de aprobación", context: "enero · resultado 82 · meta 95 · no cumple" },
    });
    assert(!error, `referenciar: ${error?.message}`);
    // No se copió el dato: el indicador sigue siendo la fuente.
    const { data: ref } = await owner.client.from("work_references")
      .select("ref_kind, ref_id, snapshot").eq("owner_id", signalCase.id).maybeSingle();
    assert(ref!.ref_kind === "quality_indicator", "la referencia no apunta al indicador");
    assert(ref!.ref_id === indId!.id, "apunta a otro indicador");
    assert(await ncCount(owner.client, A) === 0, "crear el caso creó una no conformidad");
  });

  await check("A3. evaluarlo como NO conformidad deja el contador en cero", async () => {
    await addFinding(owner.client, A, signalCase.id, "El promedio de enero fue 82 % frente a una meta de 95 %.");
    const { error } = await owner.client.rpc("work_classify_case", {
      p_case_id: signalCase.id, p_classification: "observation",
      p_rationale: "Variación puntual de un solo periodo; el trimestre sigue dentro de rango.",
      p_requirement_text: null, p_evidence_text: null, p_nonconformity_text: null,
    });
    assert(!error, `clasificar: ${error?.message}`);
    assert(await ncCount(owner.client, A) === 0, "una observación aumentó el contador de no conformidades");
    const { data: c } = await owner.client.from("work_cases")
      .select("classification, status").eq("id", signalCase.id).maybeSingle();
    assert(c!.classification === "observation", `quedó como ${c!.classification}`);
    assert(c!.status === "open", "el caso debía pasar de borrador a abierto");
  });

  await check("A4. una referencia a algo de OTRA empresa se rechaza", async () => {
    const other = await newCase(outsider.client, B, "Caso ajeno");
    const { error } = await owner.client.from("work_references").insert({
      organization_id: A, owner_kind: "case", owner_id: signalCase.id,
      ref_kind: "work_case", ref_id: other.id, relation: "related",
    });
    assert(error !== null, "se pudo referenciar un caso de otra empresa");
  });

  await check("A5. una referencia a algo INEXISTENTE se rechaza", async () => {
    const { error } = await owner.client.from("work_references").insert({
      organization_id: A, owner_kind: "case", owner_id: signalCase.id,
      ref_kind: "trazadoc_document", ref_id: "00000000-0000-0000-0000-000000000000", relation: "related",
    });
    assert(error !== null, "se pudo referenciar algo que no existe");
  });

  // -------------------------------------------------------------------------
  console.log("\nB · El ciclo completo de una no conformidad");
  // -------------------------------------------------------------------------

  const nc = await newCase(owner.client, A, "Revisión documental vencida", {
    origin_kind: "document", created_by: owner.id, reported_by: owner.id,
    owner_position_id: pos!.id,
  });

  await check("B1. sin hallazgo no se puede clasificar", async () => {
    const { error } = await owner.client.rpc("work_classify_case", {
      p_case_id: nc.id, p_classification: "nonconformity", p_rationale: "x",
      p_requirement_text: "r", p_evidence_text: "e", p_nonconformity_text: "n",
    });
    assert(error !== null, "clasificó un caso sin ningún hecho observado");
  });

  await check("B2. una NO CONFORMIDAD exige requisito e incumplimiento separados", async () => {
    await addFinding(owner.client, A, nc.id, "El procedimiento PR-QA-007 superó su fecha de revisión.");
    const { error } = await owner.client.rpc("work_classify_case", {
      p_case_id: nc.id, p_classification: "nonconformity",
      p_rationale: "Se incumple la periodicidad de revisión definida.",
      p_requirement_text: null, p_evidence_text: null, p_nonconformity_text: null,
    });
    assert(error !== null, "aceptó una no conformidad sin requisito ni declaración");
  });

  await check("B3. formalizar la NC registra la decisión, y el contador sube a UNO", async () => {
    const { error } = await owner.client.rpc("work_classify_case", {
      p_case_id: nc.id, p_classification: "nonconformity",
      p_rationale: "Se incumple la periodicidad de revisión definida en el propio procedimiento.",
      p_requirement_text: "El procedimiento PR-QA-007 exige revisión anual.",
      p_evidence_text: "La revisión vigente venció el 30/06/2026 y no existe una posterior.",
      p_nonconformity_text: "No se realizó la revisión documental dentro de la periodicidad definida.",
    });
    assert(!error, `formalizar: ${error?.message}`);
    assert(await ncCount(owner.client, A) === 1, "el contador de no conformidades no subió a 1");
    const { data: d } = await owner.client.from("work_decisions")
      .select("decision_kind, outcome, rationale").eq("subject_id", nc.id)
      .eq("decision_kind", "classification").maybeSingle();
    assert(d !== null, "no quedó registrada la decisión");
    assert(d!.outcome === "nonconformity", `la decisión dice ${d!.outcome}`);
    assert((d!.rationale as string).length > 10, "la decisión no conserva el fundamento");
  });

  await check("B4. una decisión formal NO se edita ni se borra (AC-22)", async () => {
    const { data: d } = await owner.client.from("work_decisions")
      .select("id").eq("subject_id", nc.id).limit(1).maybeSingle();
    const upd = await owner.client.from("work_decisions")
      .update({ outcome: "observation" }).eq("id", d!.id);
    assert(upd.error !== null, "se reescribió una decisión formal");
    const del = await owner.client.from("work_decisions").delete().eq("id", d!.id);
    assert(del.error !== null, "se borró una decisión formal");
  });

  await check("B5. el caso no se cierra con el ciclo a medias (AC-18)", async () => {
    const { data: elig } = await owner.client.rpc("work_case_closure_eligibility", { p_case_id: nc.id });
    const e = elig as { can_close: boolean; missing: string[] };
    assert(e.can_close === false, "dijo que se podía cerrar sin causa ni acciones");
    assert(e.missing.some((m) => /causa/i.test(m)), `no menciona la causa: ${JSON.stringify(e.missing)}`);
    assert(e.missing.some((m) => /correctiva/i.test(m)), "no menciona la acción correctiva");
    const { error } = await owner.client.rpc("work_close_case", { p_case_id: nc.id, p_note: "cerrando" });
    assert(error !== null, "cerró un caso con el ciclo incompleto");
  });

  let causeId = "";
  await check("B6. hipótesis ≠ causa validada (AC-10)", async () => {
    const { data, error } = await owner.client.from("work_case_causes").insert({
      organization_id: A, case_id: nc.id, methodology: "five_whys",
      analysis: "¿Por qué venció? Nadie lo revisó. ¿Por qué? No había recordatorio. ¿Por qué? El control era manual.",
      hypothesis: "El seguimiento de revisiones dependía de que alguien se acordara.",
    }).select("id").single();
    assert(!error && data, `análisis: ${error?.message}`);
    causeId = data!.id as string;
    const { data: c } = await owner.client.from("work_case_causes")
      .select("validated_cause, approved_at").eq("id", causeId).maybeSingle();
    assert(c!.validated_cause === null, "una hipótesis no puede nacer validada");
    assert(c!.approved_at === null, "una hipótesis no puede nacer aprobada");
  });

  await check("B7. aprobar la causa la vuelve historia y ya no se reescribe", async () => {
    const { error } = await owner.client.rpc("work_approve_cause", {
      p_cause_id: causeId,
      p_validated_cause: "El control de vencimientos era manual y sin responsable asignado.",
      p_rationale: "Confirmado con el histórico de revisiones.",
    });
    assert(!error, `aprobar: ${error?.message}`);
    const upd = await owner.client.from("work_case_causes")
      .update({ validated_cause: "otra cosa" }).eq("id", causeId);
    assert(upd.error !== null, "se reescribió una causa ya aprobada");
  });

  let corrective = { id: "", code: "" };
  await check("B8. corrección y acción correctiva son DOS cosas (AC-05)", async () => {
    await newAction(owner.client, A, nc.id, "correction", "Revisar y actualizar el procedimiento");
    corrective = await newAction(owner.client, A, nc.id, "corrective",
      "Configurar seguimiento preventivo con responsable",
      { requires: true, criteria: "Ningún documento vence sin aviso durante 3 meses",
        due: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10), owner: pos!.id });

    const { data: acts } = await owner.client.from("work_actions")
      .select("action_kind").eq("organization_id", A).in("id", [corrective.id]);
    assert((acts ?? []).length === 1, "no se creó la acción correctiva");
    const { data: all } = await owner.client.from("work_references")
      .select("owner_id").eq("owner_kind", "action").eq("ref_kind", "work_case").eq("ref_id", nc.id);
    assert((all ?? []).length === 2, `el caso debía tener 2 acciones, tiene ${all?.length}`);
  });

  await check("B9. exigir eficacia SIN criterio previo es imposible (AC-16)", async () => {
    const { data: code } = await owner.client.rpc("work_next_action_code", { p_organization_id: A });
    const { error } = await owner.client.from("work_actions").insert({
      organization_id: A, code, action_kind: "corrective", title: "Sin criterio",
      requires_effectiveness: true, effectiveness_criteria: null, effectiveness_result: "pending",
    });
    assert(error !== null, "aceptó exigir eficacia sin decir contra qué se comprobaría");
  });

  await check("B10. COMPLETADA no es EFICAZ (AC-13)", async () => {
    const { error } = await owner.client.rpc("work_complete_action", {
      p_action_id: corrective.id, p_completed_on: new Date().toISOString().slice(0, 10),
      p_note: "Se configuró el seguimiento y se asignó responsable.",
    });
    assert(!error, `completar: ${error?.message}`);
    const { data: act } = await owner.client.from("work_actions")
      .select("status, effectiveness_result, closed_at").eq("id", corrective.id).maybeSingle();
    assert(act!.status === "completed", "no quedó completada");
    assert(act!.effectiveness_result === "pending", `la eficacia quedó en ${act!.effectiveness_result}`);
    assert(act!.closed_at === null, "se cerró sin verificar si sirvió");
  });

  await check("B11. tampoco se cierra el caso con una eficacia pendiente", async () => {
    // Completar la corrección también, para aislar el motivo.
    const { data: corr } = await owner.client.from("work_actions")
      .select("id").eq("organization_id", A).eq("action_kind", "correction").maybeSingle();
    await owner.client.rpc("work_complete_action", {
      p_action_id: corr!.id, p_completed_on: null, p_note: "Procedimiento actualizado.",
    });
    const { data: elig } = await owner.client.rpc("work_case_closure_eligibility", { p_case_id: nc.id });
    const e = elig as { can_close: boolean; missing: string[] };
    assert(e.can_close === false, "dijo que se podía cerrar con una eficacia pendiente");
    assert(e.missing.some((m) => /eficacia/i.test(m)), `no menciona la eficacia: ${JSON.stringify(e.missing)}`);
  });

  await check("B12. verificar la eficacia como NO EFICAZ conserva todo y reabre el análisis (AC-17)", async () => {
    const { error } = await owner.client.rpc("work_verify_effectiveness", {
      p_action_id: corrective.id, p_result: "not_effective",
      p_criteria: "Ningún documento vence sin aviso durante 3 meses",
      p_comment: "Volvió a vencer un documento en el primer mes.",
    });
    assert(!error, `verificar: ${error?.message}`);
    const { data: act } = await owner.client.from("work_actions")
      .select("status, effectiveness_result").eq("id", corrective.id).maybeSingle();
    assert(act!.status === "completed", "la acción dejó de estar completada");
    assert(act!.effectiveness_result === "not_effective", "no quedó como no eficaz");
    const { data: v } = await owner.client.from("work_action_verifications")
      .select("result").eq("action_id", corrective.id);
    assert((v ?? []).length === 1, "no se registró la verificación");
    const { data: c } = await owner.client.from("work_cases").select("status").eq("id", nc.id).maybeSingle();
    assert(c!.status === "in_analysis", `el caso debía volver a análisis, está en ${c!.status}`);
  });

  await check("B13. una verificación NO EFICAZ no se convierte en EFICAZ con un UPDATE", async () => {
    const { data: v } = await owner.client.from("work_action_verifications")
      .select("id").eq("action_id", corrective.id).maybeSingle();
    const upd = await owner.client.from("work_action_verifications")
      .update({ result: "effective" }).eq("id", v!.id);
    assert(upd.error !== null, "se reescribió una verificación de eficacia");
    const del = await owner.client.from("work_action_verifications").delete().eq("id", v!.id);
    assert(del.error !== null, "se borró una verificación de eficacia");
  });

  let secondAction = { id: "", code: "" };
  await check("B14. tras una eficacia negativa se planifica OTRA acción, sin borrar la anterior", async () => {
    secondAction = await newAction(owner.client, A, nc.id, "corrective",
      "Automatizar el aviso 30 días antes del vencimiento",
      { requires: true, criteria: "Cero vencimientos sin aviso durante 6 meses", owner: pos!.id });
    await owner.client.rpc("work_complete_action", {
      p_action_id: secondAction.id, p_completed_on: null, p_note: "Aviso automático configurado.",
    });
    const { error } = await owner.client.rpc("work_verify_effectiveness", {
      p_action_id: secondAction.id, p_result: "effective",
      p_criteria: "Cero vencimientos sin aviso durante 6 meses", p_comment: "Sin vencimientos desde entonces.",
    });
    assert(!error, `verificar la segunda: ${error?.message}`);
    // La PRIMERA sigue ahí, con su «no eficaz».
    const { data: first } = await owner.client.from("work_actions")
      .select("effectiveness_result").eq("id", corrective.id).maybeSingle();
    assert(first!.effectiveness_result === "not_effective", "la acción fallida se sobrescribió");
    const { data: vs } = await owner.client.from("work_action_verifications")
      .select("result").eq("organization_id", A);
    assert((vs ?? []).length === 2, `debía haber 2 verificaciones, hay ${vs?.length}`);
  });

  await check("B15. ahora SÍ se puede cerrar, y el cierre exige fundamento", async () => {
    const sinNota = await owner.client.rpc("work_close_case", { p_case_id: nc.id, p_note: "" });
    assert(sinNota.error !== null, "cerró sin fundamento");
    const { data: elig } = await owner.client.rpc("work_case_closure_eligibility", { p_case_id: nc.id });
    assert((elig as { can_close: boolean }).can_close === true,
      `todavía no deja cerrar: ${JSON.stringify(elig)}`);
    const { error } = await owner.client.rpc("work_close_case", {
      p_case_id: nc.id, p_note: "Causa tratada y eficacia verificada.",
    });
    assert(!error, `cerrar: ${error?.message}`);
    const { data: c } = await owner.client.from("work_cases")
      .select("status, closed_at").eq("id", nc.id).maybeSingle();
    assert(c!.status === "closed" && c!.closed_at !== null, "no quedó cerrado");
  });

  await check("B16. un caso cerrado NO se edita por la puerta de atrás", async () => {
    const { error } = await owner.client.from("work_cases")
      .update({ classification: "observation" }).eq("id", nc.id);
    assert(error !== null, "se reclasificó un caso cerrado con un UPDATE");
  });

  await check("B17. reabrir exige motivo, y conserva el cierre anterior (AC-19)", async () => {
    const sinMotivo = await owner.client.rpc("work_reopen_case", { p_case_id: nc.id, p_reason: "" });
    assert(sinMotivo.error !== null, "reabrió sin motivo");
    const { error } = await owner.client.rpc("work_reopen_case", {
      p_case_id: nc.id, p_reason: "Reapareció el mismo incumplimiento en septiembre.",
    });
    assert(!error, `reabrir: ${error?.message}`);
    const { data: c } = await owner.client.from("work_cases")
      .select("status, reopen_count").eq("id", nc.id).maybeSingle();
    assert(c!.status === "in_analysis", `quedó en ${c!.status}`);
    assert(c!.reopen_count === 1, "no contó la reapertura");
    // El cierre anterior sigue en el historial.
    const { data: d } = await owner.client.from("work_decisions")
      .select("decision_kind").eq("subject_id", nc.id).eq("decision_kind", "closure");
    assert((d ?? []).length === 1, "el cierre anterior desapareció del historial");
  });

  await check("B18. el historial cuenta la historia completa", async () => {
    const { data: d } = await owner.client.from("work_decisions")
      .select("decision_kind").eq("organization_id", A).eq("subject_id", nc.id);
    const kinds = (d ?? []).map((x) => x.decision_kind);
    for (const k of ["classification", "cause_approved", "closure", "reopen"]) {
      assert(kinds.includes(k), `falta «${k}» en el historial: ${kinds.join(", ")}`);
    }
  });

  // -------------------------------------------------------------------------
  console.log("\nC · Tareas, vencimientos y bandeja");
  // -------------------------------------------------------------------------

  await check("C1. una acción vencida produce evento y alerta para el titular del CARGO", async () => {
    const past = new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10);
    const late = await newAction(owner.client, A, nc.id, "corrective", "Acción que venció",
      { due: past, owner: pos!.id });
    const { error } = await owner.client.rpc("work_scan_pending_actions", { p_organization_id: A });
    assert(!error, `barrido: ${error?.message}`);
    const { data: ev } = await owner.client.from("work_events")
      .select("id").eq("subject_type", "work_action").eq("subject_id", late.id)
      .eq("event_type", "action.overdue");
    assert((ev ?? []).length === 1, "no dejó el hecho en la bitácora");
    const { data: al } = await owner.client.from("work_alerts")
      .select("recipient_profile_id").eq("subject_id", late.id).eq("alert_type", "action_overdue");
    assert((al ?? []).length === 1, "no avisó a nadie");
    assert(al![0].recipient_profile_id === worker.id, "avisó a quien no es el titular del cargo");
  });

  await check("C2. repetir el barrido NO duplica nada (AC-23)", async () => {
    const before = await owner.client.from("work_alerts").select("id").eq("organization_id", A);
    await owner.client.rpc("work_scan_pending_actions", { p_organization_id: A });
    await owner.client.rpc("work_scan_pending_actions", { p_organization_id: A });
    const after = await owner.client.from("work_alerts").select("id").eq("organization_id", A);
    assert((after.data ?? []).length === (before.data ?? []).length,
      `el barrido duplicó ${(after.data ?? []).length - (before.data ?? []).length} alertas`);
  });

  // -------------------------------------------------------------------------
  console.log("\nX · Ataques directos y aislamiento");
  // -------------------------------------------------------------------------

  await check("X1. no se puede fabricar una decisión formal por PostgREST", async () => {
    const { error } = await owner.client.from("work_decisions").insert({
      organization_id: A, subject_kind: "case", subject_id: nc.id,
      decision_kind: "classification", outcome: "not_applicable", rationale: "a mano",
    });
    assert(error !== null, "se fabricó una decisión formal desde el cliente");
  });

  await check("X2. no se puede fabricar una verificación de eficacia", async () => {
    const { error } = await owner.client.from("work_action_verifications").insert({
      organization_id: A, action_id: corrective.id, criteria: "x", result: "effective",
    });
    assert(error !== null, "se fabricó una verificación de eficacia");
  });

  await check("X3. un consultor no clasifica ni verifica: eso es gobierno", async () => {
    const draft = await newCase(worker.client, A, "Caso del consultor");
    await addFinding(worker.client, A, draft.id, "Algo observado.");
    const cls = await worker.client.rpc("work_classify_case", {
      p_case_id: draft.id, p_classification: "nonconformity", p_rationale: "porque sí",
      p_requirement_text: "r", p_evidence_text: "e", p_nonconformity_text: "n",
    });
    assert(cls.error !== null, "un consultor clasificó un caso");
    const ver = await worker.client.rpc("work_verify_effectiveness", {
      p_action_id: secondAction.id, p_result: "effective", p_criteria: "x", p_comment: null,
    });
    assert(ver.error !== null, "un consultor verificó una eficacia");
  });

  await check("X4. solo la administración reabre un caso cerrado", async () => {
    const tmp = await newCase(owner.client, A, "Caso para reabrir");
    await addFinding(owner.client, A, tmp.id, "Observado.");
    await owner.client.rpc("work_classify_case", {
      p_case_id: tmp.id, p_classification: "observation", p_rationale: "Solo se anota.",
      p_requirement_text: null, p_evidence_text: null, p_nonconformity_text: null,
    });
    await owner.client.rpc("work_close_case", { p_case_id: tmp.id, p_note: "Nada que hacer." });
    const { error } = await worker.client.rpc("work_reopen_case", {
      p_case_id: tmp.id, p_reason: "quiero",
    });
    assert(error !== null, "un consultor reabrió un caso cerrado");
  });

  await check("X5. una empresa ajena no ve NADA de la otra", async () => {
    const { data: cases } = await outsider.client.from("work_cases").select("id").eq("organization_id", A);
    assert((cases ?? []).length === 0, "vio casos de otra empresa");
    const { data: dec } = await outsider.client.from("work_decisions").select("id").eq("organization_id", A);
    assert((dec ?? []).length === 0, "vio decisiones de otra empresa");
    const { data: ov } = await outsider.client.from("v_work_case_overview").select("case_id").eq("organization_id", A);
    assert((ov ?? []).length === 0, "la vista filtró datos a una empresa ajena");
  });

  await check("X6. una empresa ajena no clasifica, ni cierra, ni completa nada de la otra", async () => {
    for (const [label, call] of [
      ["clasificar", outsider.client.rpc("work_classify_case", {
        p_case_id: nc.id, p_classification: "not_applicable", p_rationale: "x",
        p_requirement_text: null, p_evidence_text: null, p_nonconformity_text: null })],
      ["cerrar", outsider.client.rpc("work_close_case", { p_case_id: nc.id, p_note: "x" })],
      ["completar", outsider.client.rpc("work_complete_action", {
        p_action_id: secondAction.id, p_completed_on: null, p_note: "x" })],
      ["barrer", outsider.client.rpc("work_scan_pending_actions", { p_organization_id: A })],
    ] as const) {
      const { error } = await call;
      assert(error !== null, `una ajena pudo ${label}`);
    }
  });

  await check("X7. el número de caso no se recicla", async () => {
    const tmp = await newCase(owner.client, A, "Caso desechable");
    const { error: delErr } = await owner.client.from("work_cases").delete().eq("id", tmp.id);
    assert(!delErr, `borrar un caso vacío: ${delErr?.message}`);
    const { error } = await owner.client.from("work_cases").insert({
      organization_id: A, code: tmp.code, title: "Otro caso con el mismo número",
    });
    assert(error !== null, "el número del caso eliminado volvió a estar disponible");
  });

  await check("X8. un caso con historia NO se elimina", async () => {
    const { error } = await owner.client.from("work_cases").delete().eq("id", nc.id);
    assert(error !== null, "se borró un caso con decisiones registradas");
    assert(/histor/i.test(error!.message), `el motivo no lo explica: ${error!.message}`);
    const { data: still } = await owner.client.from("work_cases").select("id").eq("id", nc.id).maybeSingle();
    assert(still !== null, "el caso desapareció");
    const { data: dec } = await owner.client.from("work_decisions").select("id").eq("subject_id", nc.id);
    assert((dec ?? []).length > 0, "las decisiones del caso desaparecieron");

    // Y una acción ya ejecutada tampoco.
    const act = await owner.client.from("work_actions").delete().eq("id", secondAction.id);
    assert(act.error !== null, "se borró una acción con verificación de eficacia");
  });

  console.log(`\nQUALITY-04 · base real: ${passed} correctas, ${failed} fallidas\n`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
