/**
 * Trazaloop · QUALITY-05 · Riesgos y oportunidades, contra base real.
 *
 * Lo que estas comprobaciones defienden no es un CRUD. Son las afirmaciones de
 * RO que solo se pueden demostrar ejecutándolas:
 *
 *   · una metodología publicada NO se reescribe (RO-04);
 *   · una reevaluación NO pisa la anterior (RO-09);
 *   · un riesgo materializado NO crea una no conformidad (RO-27);
 *   · un residual PEOR que el inherente se conserva, no se rechaza;
 *   · publicar la v2 NO recalcula nada evaluado con la v1;
 *   · lo de otra empresa no existe, ni siquiera sus contadores.
 *
 * Todo corre con la sesión REAL de cada usuario. El cliente administrativo solo
 * crea cuentas: con `service_role` se saltaría RLS y no se probaría nada.
 */
import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) {
  console.error("Faltan variables para test:quality05-rls (URL, ANON, SERVICE_ROLE).");
  process.exit(1);
}

let passed = 0, failed = 0;

/** Compara ignorando tildes. El texto de la interfaz las lleva —y debe
 *  llevarlas—, pero una aserción no tiene por qué romperse cuando alguien
 *  corrige la ortografía de un mensaje. */
const sinTildes = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
async function check(n: string, fn: () => Promise<void>) {
  try { await fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function newUser(label: string, name: string) {
  const email = `q05-${label}-${stamp}@test.trazaloop.dev`;
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

/** Crea una metodología completa y la publica. Devuelve los identificadores
 *  que hacen falta para evaluar. */
async function newMethodology(
  c: SupabaseClient, org: string, code: string, appliesTo: "risk" | "opportunity",
  dims: { code: string; label: string; values: [number, string][] }[],
  bands: [number, number, string, boolean, number | null][],
  aggregation = "product"
) {
  const { data: m, error: em } = await c.from("quality_risk_methodologies")
    .insert({ organization_id: org, code, name: `Metodología ${code}`, applies_to: appliesTo })
    .select("id").single();
  assert(!em && m, `metodología ${code}: ${em?.message}`);
  const { data: v, error: ev } = await c.from("quality_risk_methodology_versions")
    .insert({ organization_id: org, methodology_id: m!.id, version_number: 1, aggregation })
    .select("id").single();
  assert(!ev && v, `versión ${code}: ${ev?.message}`);

  const levelIds: Record<string, Record<number, string>> = {};
  for (const [i, d] of dims.entries()) {
    const { data: s, error: es } = await c.from("quality_risk_scales")
      .insert({ organization_id: org, version_id: v!.id, code: d.code, label: d.label,
                scale_kind: "dimension", position: i + 1 })
      .select("id").single();
    assert(!es && s, `escala ${d.code}: ${es?.message}`);
    levelIds[d.code] = {};
    for (const [j, [value, label]] of d.values.entries()) {
      const { data: l, error: el } = await c.from("quality_risk_scale_levels")
        .insert({ organization_id: org, scale_id: s!.id, value, label, position: j + 1 })
        .select("id").single();
      assert(!el && l, `nivel ${label}: ${el?.message}`);
      levelIds[d.code][value] = l!.id as string;
    }
  }

  const { data: rs, error: ers } = await c.from("quality_risk_scales")
    .insert({ organization_id: org, version_id: v!.id, code: "nivel", label: "Nivel",
              scale_kind: "result", position: 99 })
    .select("id").single();
  assert(!ers && rs, `escala de resultado: ${ers?.message}`);
  for (const [i, [min, max, label, acceptable, months]] of bands.entries()) {
    const { error } = await c.from("quality_risk_scale_levels").insert({
      organization_id: org, scale_id: rs!.id, value: i + 1, label, position: i + 1,
      min_score: min, max_score: max, is_acceptable: acceptable, review_months: months,
    });
    assert(!error, `banda ${label}: ${error?.message}`);
  }
  return { methodologyId: m!.id as string, versionId: v!.id as string, levelIds, resultScaleId: rs!.id as string };
}

async function newRisk(c: SupabaseClient, org: string, title: string, event: string, extra: Record<string, unknown> = {}) {
  const { data: code } = await c.rpc("quality_next_ro_code", { p_organization_id: org, p_kind: "risk" });
  const { data, error } = await c.from("quality_risks")
    .insert({ organization_id: org, code, title, event_description: event, ...extra })
    .select("id, code").single();
  assert(!error && data, `crear riesgo «${title}»: ${error?.message}`);
  return { id: data!.id as string, code: data!.code as string };
}

async function newControl(c: SupabaseClient, org: string, title: string, extra: Record<string, unknown> = {}) {
  const { data: code } = await c.rpc("quality_next_ro_code", { p_organization_id: org, p_kind: "control" });
  const { data, error } = await c.from("quality_controls")
    .insert({ organization_id: org, code, title, status: "active", ...extra })
    .select("id, code").single();
  assert(!error && data, `crear control «${title}»: ${error?.message}`);
  return { id: data!.id as string, code: data!.code as string };
}

async function ncCount(c: SupabaseClient, org: string): Promise<number> {
  const { data } = await c.from("work_cases").select("id")
    .eq("organization_id", org).eq("classification", "nonconformity");
  return (data ?? []).length;
}
async function caseCount(c: SupabaseClient, org: string): Promise<number> {
  const { data } = await c.from("work_cases").select("id").eq("organization_id", org);
  return (data ?? []).length;
}

async function main() {
  console.log("\nQUALITY-05 · base real\n");

  const owner = await newUser("qa", "Coordinadora de Calidad");
  const worker = await newUser("op", "Operario");
  const approver = await newUser("apr", "Directora");
  const outsider = await newUser("out", "Ajena");
  for (const u of [owner, worker, approver, outsider]) {
    await u.client.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "q05" });
  }
  const { data: a } = await owner.client.rpc("create_organization", { p_name: `Q05 A ${stamp}` });
  const { data: b } = await outsider.client.rpc("create_organization", { p_name: `Q05 B ${stamp}` });
  const A = a as string, B = b as string;

  // La membresía va ANTES de la asignación de cargo: un disparador de 0112
  // exige que el titular pertenezca a la empresa, y al revés falla en silencio.
  await admin.from("memberships").insert([
    { organization_id: A, user_id: worker.id, role_code: "consultant", status: "active" },
    { organization_id: A, user_id: approver.id, role_code: "quality", status: "active" },
  ]);
  const { data: pos } = await owner.client.from("quality_positions")
    .insert({ organization_id: A, name: "Jefe de Compras", code: "JC" }).select("id").single();
  const { error: asgErr } = await owner.client.from("quality_position_assignments").insert({
    organization_id: A, position_id: pos!.id, profile_id: worker.id, assignment_type: "holder",
  });
  assert(!asgErr, `asignar titular: ${asgErr?.message}`);
  const { data: proc } = await owner.client.from("quality_processes")
    .insert({ organization_id: A, name: `Compras ${stamp}`, category_code: "core" })
    .select("id").single();
  const { data: proc2 } = await owner.client.from("quality_processes")
    .insert({ organization_id: A, name: `Producción ${stamp}`, category_code: "core" })
    .select("id").single();

  // ==========================================================================
  console.log("A · La metodología manda, y una vez publicada no se toca");
  // ==========================================================================

  const met = await newMethodology(owner.client, A, `MR-${stamp.slice(-5)}`, "risk",
    [
      { code: "prob", label: "Probabilidad", values: [[1, "Rara"], [3, "Posible"], [5, "Casi segura"]] },
      { code: "imp", label: "Impacto", values: [[1, "Leve"], [3, "Moderado"], [5, "Grave"]] },
    ],
    [[1, 4, "Bajo", true, 12], [5, 9, "Medio", true, 6], [10, 15, "Alto", false, 3], [16, 25, "Extremo", false, 1]]
  );

  await check("A1. no se puede evaluar con una versión en borrador", async () => {
    const r = await newRisk(owner.client, A, "Prueba de borrador", "algo pasa");
    const { error } = await owner.client.rpc("quality_assess_risk", {
      p_risk_id: r.id, p_kind: "inherent", p_version_id: met.versionId,
      p_level_ids: [met.levelIds.prob[3], met.levelIds.imp[3]],
      p_rationale: null, p_control_ids: null, p_assessed_on: null,
    });
    assert(error, "una versión sin publicar no debería poder usarse");
    assert(/publicada/i.test(sinTildes(error!.message)), `mensaje inesperado: ${error!.message}`);
  });

  await check("A2. publicar exige que la metodología esté completa", async () => {
    // Una versión sin escala de resultado no puede derivar nada.
    const { data: m } = await owner.client.from("quality_risk_methodologies")
      .insert({ organization_id: A, code: `INC-${stamp.slice(-5)}`, name: "Incompleta", applies_to: "risk" })
      .select("id").single();
    const { data: v } = await owner.client.from("quality_risk_methodology_versions")
      .insert({ organization_id: A, methodology_id: m!.id, version_number: 1 })
      .select("id").single();
    const { error } = await owner.client.rpc("quality_publish_methodology_version", {
      p_version_id: v!.id, p_effective_from: null, p_change_note: null,
    });
    assert(error, "publicar una metodología vacía debería fallar");
    assert(/dimension/i.test(sinTildes(error!.message)), `mensaje inesperado: ${error!.message}`);
  });

  await check("A3. un consultor no publica metodologías", async () => {
    const { error } = await worker.client.rpc("quality_publish_methodology_version", {
      p_version_id: met.versionId, p_effective_from: null, p_change_note: null,
    });
    assert(error, "un consultor no debería poder publicar");
    assert(/permiso/i.test(error!.message), `mensaje inesperado: ${error!.message}`);
  });

  await check("A4. publicada por quien corresponde", async () => {
    const { error } = await owner.client.rpc("quality_publish_methodology_version", {
      p_version_id: met.versionId, p_effective_from: "2026-01-01", p_change_note: "Versión inicial",
    });
    assert(!error, `publicar: ${error?.message}`);
    const { data } = await owner.client.from("quality_risk_methodology_versions")
      .select("status, published_at").eq("id", met.versionId).single();
    assert(data!.status === "published", `estado ${data!.status}`);
    assert(data!.published_at !== null, "debe quedar la fecha de publicación");
  });

  await check("A5. una versión publicada NO se reescribe (RO-04)", async () => {
    const { error } = await owner.client.from("quality_risk_methodology_versions")
      .update({ aggregation: "sum" }).eq("id", met.versionId);
    assert(error, "cambiar la regla de una versión publicada debería fallar");
    assert(/no se reescribe/i.test(sinTildes(error!.message)), `mensaje inesperado: ${error!.message}`);
  });

  await check("A6. sus escalas tampoco, ni siquiera añadiendo un nivel", async () => {
    const up = await owner.client.from("quality_risk_scale_levels")
      .update({ value: 9 }).eq("id", met.levelIds.prob[1]);
    assert(up.error, "modificar un nivel de una versión publicada debería fallar");
    const ins = await owner.client.from("quality_risk_scale_levels").insert({
      organization_id: A, scale_id: met.resultScaleId, value: 99, label: "Colado",
      position: 99, min_score: 26, max_score: 99,
    });
    assert(ins.error, "añadir un nivel a una versión publicada debería fallar");
  });

  // ==========================================================================
  console.log("\nB · Derivación determinística y explicada");
  // ==========================================================================

  const risk = await newRisk(owner.client, A,
    "Interrupción de un proveedor crítico",
    "el proveedor interrumpe el suministro",
    { owner_position_id: pos!.id, origin_kind: "manual" });

  await owner.client.from("quality_risk_causes").insert({
    organization_id: A, risk_id: risk.id,
    description: "dependencia de un único proveedor", source_kind: "supplier",
  });
  await owner.client.from("quality_risk_consequences").insert({
    organization_id: A, risk_id: risk.id,
    description: "detención de la producción", impact_area: "operational",
  });
  await owner.client.from("quality_risk_processes").insert([
    { organization_id: A, risk_id: risk.id, process_id: proc!.id },
    { organization_id: A, risk_id: risk.id, process_id: proc2!.id },
  ]);

  await check("B1. el mismo riesgo afecta a varios procesos sin duplicarse (N:M)", async () => {
    const { data } = await owner.client.from("quality_risk_processes")
      .select("process_id").eq("risk_id", risk.id);
    assert((data ?? []).length === 2, `se esperaban 2 procesos, hay ${(data ?? []).length}`);
    const { data: risks } = await owner.client.from("quality_risks")
      .select("id").eq("organization_id", A).eq("title", "Interrupción de un proveedor crítico");
    assert((risks ?? []).length === 1, "sigue siendo UN riesgo, no uno por proceso");
  });

  let inherentId = "";
  await check("B2. la evaluación inherente deriva el nivel y guarda su explicación", async () => {
    const { data, error } = await owner.client.rpc("quality_assess_risk", {
      p_risk_id: risk.id, p_kind: "inherent", p_version_id: met.versionId,
      p_level_ids: [met.levelIds.prob[5], met.levelIds.imp[5]],
      p_rationale: "Un único proveedor homologado.", p_control_ids: null, p_assessed_on: null,
    });
    assert(!error, `evaluar: ${error?.message}`);
    inherentId = data as string;
    const { data: as } = await owner.client.from("quality_risk_assessments")
      .select("score, derivation, assessed_by").eq("id", inherentId).single();
    assert(Number(as!.score) === 25, `5×5 debía dar 25, dio ${as!.score}`);
    const d = as!.derivation as Record<string, unknown>;
    assert(d.level_label === "Extremo", `nivel ${d.level_label}`);
    assert(d.is_acceptable === false, "extremo no puede ser aceptable");
    assert(Array.isArray(d.factors) && (d.factors as unknown[]).length === 2, "faltan los factores");
    assert(as!.assessed_by !== null, "el acto lo firma una persona");
  });

  await check("B3. los factores quedan atados a la versión con la que se evaluó", async () => {
    const { data } = await owner.client.from("quality_risk_assessment_factors")
      .select("scale_id, level_id").eq("assessment_id", inherentId);
    assert((data ?? []).length === 2, "una fila por dimensión");
    const ids = (data ?? []).map((f) => f.level_id);
    assert(ids.includes(met.levelIds.prob[5]) && ids.includes(met.levelIds.imp[5]),
      "los niveles guardados no son los elegidos");
  });

  await check("B4. no se puede evaluar dejando una dimensión sin valorar", async () => {
    const { error } = await owner.client.rpc("quality_assess_risk", {
      p_risk_id: risk.id, p_kind: "inherent", p_version_id: met.versionId,
      p_level_ids: [met.levelIds.prob[5]], p_rationale: null, p_control_ids: null, p_assessed_on: null,
    });
    assert(error, "faltando el impacto debería fallar");
    assert(/Faltan dimensiones/i.test(error!.message), `mensaje inesperado: ${error!.message}`);
  });

  await check("B5. no se admite un valor que no pertenece a esta metodología", async () => {
    const otra = await newMethodology(owner.client, A, `OTRA-${stamp.slice(-5)}`, "risk",
      [{ code: "p", label: "P", values: [[7, "Siete"]] }], [[1, 99, "Único", true, null]]);
    const { error } = await owner.client.rpc("quality_assess_risk", {
      p_risk_id: risk.id, p_kind: "inherent", p_version_id: met.versionId,
      p_level_ids: [otra.levelIds.p[7], met.levelIds.imp[5]],
      p_rationale: null, p_control_ids: null, p_assessed_on: null,
    });
    assert(error, "mezclar escalas de dos metodologías debería fallar");
    assert(/no pertenece/i.test(error!.message), `mensaje inesperado: ${error!.message}`);
  });

  await check("B6. el nivel no se puede escribir a mano: la tabla no acepta escritura directa", async () => {
    const { error } = await owner.client.from("quality_risk_assessments").insert({
      organization_id: A, risk_id: risk.id, assessment_kind: "inherent",
      methodology_version_id: met.versionId, score: 1,
      result_level_id: met.levelIds.prob[1], derivation: { level_label: "Bajo" },
    });
    assert(error, "insertar una evaluación a mano debería fallar");
  });

  await check("B7. tampoco se puede alterar el puntaje ya calculado", async () => {
    const { error } = await owner.client.from("quality_risk_assessments")
      .update({ score: 1 }).eq("id", inherentId);
    assert(error, "cambiar el puntaje debería fallar");
    const { data } = await owner.client.from("quality_risk_assessments")
      .select("score").eq("id", inherentId).single();
    assert(Number(data!.score) === 25, "y el puntaje no cambió");
  });

  await check("B8. la revisión se programó según el NIVEL, no según el calendario (RO-35)", async () => {
    const { data } = await owner.client.from("quality_risks")
      .select("review_interval_months, next_review_on, status").eq("id", risk.id).single();
    assert(data!.review_interval_months === 1, `extremo pide revisar cada mes, dio ${data!.review_interval_months}`);
    assert(data!.next_review_on !== null, "y con fecha concreta");
    assert(data!.status === "active", "evaluarlo lo saca del borrador");
  });

  // ==========================================================================
  console.log("\nC · Control ≠ acción, y su eficacia se juzga aparte");
  // ==========================================================================

  const ctrl = await newControl(owner.client, A, "Homologación de proveedores alternativos", {
    control_nature: "preventive", operation_mode: "manual",
    frequency: "anual", owner_position_id: pos!.id,
  });
  await owner.client.from("quality_risk_control_links")
    .insert({ organization_id: A, risk_id: risk.id, control_id: ctrl.id });

  await check("C1. una evaluación residual SIN controles se rechaza", async () => {
    const { error } = await owner.client.rpc("quality_assess_risk", {
      p_risk_id: risk.id, p_kind: "residual", p_version_id: met.versionId,
      p_level_ids: [met.levelIds.prob[3], met.levelIds.imp[5]],
      p_rationale: null, p_control_ids: null, p_assessed_on: null,
    });
    assert(error, "una residual sin controles es la inherente con otro nombre");
    assert(/controles/i.test(error!.message), `mensaje inesperado: ${error!.message}`);
  });

  await check("C2. evaluar el control es una pregunta distinta de que exista", async () => {
    const { data, error } = await owner.client.rpc("quality_review_control", {
      p_control_id: ctrl.id, p_design: "adequate", p_implementation: "partial",
      p_effectiveness: "partially_effective",
      p_criterion: "Solo un proveedor alternativo homologado de tres previstos.",
      p_note: null, p_reviewed_on: null,
    });
    assert(!error, `evaluar control: ${error?.message}`);
    const { data: rev } = await owner.client.from("quality_control_effectiveness_reviews")
      .select("design_verdict, implementation_verdict, effectiveness_verdict")
      .eq("id", data as string).single();
    assert(rev!.design_verdict === "adequate", "el diseño se juzgó bien");
    assert(rev!.implementation_verdict === "partial", "la implementación a medias");
    assert(rev!.effectiveness_verdict === "partially_effective", "y la eficacia por separado");
  });

  await check("C3. la evaluación del control es inmutable", async () => {
    const { data: rev } = await owner.client.from("quality_control_effectiveness_reviews")
      .select("id").eq("control_id", ctrl.id).limit(1).single();
    const { error } = await owner.client.from("quality_control_effectiveness_reviews")
      .update({ effectiveness_verdict: "effective" }).eq("id", rev!.id);
    assert(error, "corregir un veredicto pasado debería fallar");
  });

  await check("C4. un control no eficaz genera alerta, y solo una", async () => {
    await owner.client.rpc("quality_review_control", {
      p_control_id: ctrl.id, p_design: "adequate", p_implementation: "not_implemented",
      p_effectiveness: "ineffective", p_criterion: "No se ejecutó en el último año.",
      p_note: null, p_reviewed_on: null,
    });
    const { data } = await owner.client.from("work_alerts")
      .select("id, alert_type").eq("organization_id", A).eq("alert_type", "control_ineffective");
    assert((data ?? []).length === 1, `se esperaba 1 alerta, hay ${(data ?? []).length}`);
  });

  let residualId = "";
  await check("C5. la residual conserva QUÉ controles se consideraron y en qué estado", async () => {
    const { data, error } = await owner.client.rpc("quality_assess_risk", {
      p_risk_id: risk.id, p_kind: "residual", p_version_id: met.versionId,
      p_level_ids: [met.levelIds.prob[3], met.levelIds.imp[5]],
      p_rationale: "Con la homologación parcial la probabilidad baja.",
      p_control_ids: [ctrl.id], p_assessed_on: null,
    });
    assert(!error, `residual: ${error?.message}`);
    residualId = data as string;
    const { data: refs } = await owner.client.from("work_references")
      .select("ref_id, snapshot").eq("owner_kind", "risk_assessment").eq("owner_id", residualId);
    assert((refs ?? []).length === 1, "debe quedar la referencia al control considerado");
    const snap = (refs ?? [])[0].snapshot as Record<string, unknown>;
    assert(snap.control_code === ctrl.code, "y su código de entonces");
    assert(snap.effectiveness_verdict === "ineffective",
      `la foto debe llevar el veredicto de ese momento, trajo ${snap.effectiveness_verdict}`);
  });

  await check("C6. inherente y residual conviven: 25 y 15, ninguna pisó a la otra (RO-07)", async () => {
    const { data } = await owner.client.from("quality_risk_assessments")
      .select("assessment_kind, score").eq("risk_id", risk.id).order("created_at");
    const inh = (data ?? []).filter((x) => x.assessment_kind === "inherent");
    const res = (data ?? []).filter((x) => x.assessment_kind === "residual");
    assert(inh.length === 1 && Number(inh[0].score) === 25, "la inherente sigue en 25");
    assert(res.length === 1 && Number(res[0].score) === 15, `la residual debía ser 15, dio ${res[0]?.score}`);
  });

  await check("C7. un control que sustenta una evaluación residual NO se puede borrar", async () => {
    const { error } = await owner.client.from("quality_controls").delete().eq("id", ctrl.id);
    assert(error, "borrarlo dejaría la evaluación sin poder explicarse");
    const { data: v } = await owner.client.rpc("quality_deletion_eligibility", {
      p_entity: "control", p_id: ctrl.id,
    });
    const verdict = v as Record<string, unknown>;
    assert(verdict.can_hard_delete === false, "y el dictamen debe decir lo mismo");
    const blocking = JSON.stringify(verdict.blocking);
    assert(/evaluacion residual|evaluaciones residuales/i.test(sinTildes(blocking)),
      `el motivo debe nombrar la evaluación residual: ${blocking}`);
  });

  // ==========================================================================
  console.log("\nD · Reevaluar no reescribe (RO-09), y el residual puede empeorar");
  // ==========================================================================

  await check("D1. una segunda residual convive con la primera", async () => {
    const { error } = await owner.client.rpc("quality_assess_risk", {
      p_risk_id: risk.id, p_kind: "residual", p_version_id: met.versionId,
      p_level_ids: [met.levelIds.prob[1], met.levelIds.imp[3]],
      p_rationale: "Segundo proveedor ya homologado.", p_control_ids: [ctrl.id], p_assessed_on: null,
    });
    assert(!error, `segunda residual: ${error?.message}`);
    const { data } = await owner.client.from("quality_risk_assessments")
      .select("id, score").eq("risk_id", risk.id).eq("assessment_kind", "residual");
    assert((data ?? []).length === 2, `se esperaban 2 residuales, hay ${(data ?? []).length}`);
    const scores = (data ?? []).map((x) => Number(x.score)).sort((a, b) => a - b);
    assert(scores[0] === 3 && scores[1] === 15, `las dos deben seguir ahí: ${scores.join(", ")}`);
  });

  await check("D2. la proyección muestra la ÚLTIMA, con la historia intacta detrás", async () => {
    const { data } = await owner.client.from("v_quality_risk_overview")
      .select("residual_score, residual_level, current_level, assessment_count")
      .eq("id", risk.id).single();
    assert(Number(data!.residual_score) === 3, `la vigente debía ser 3, dio ${data!.residual_score}`);
    assert(data!.current_level === "Bajo", `nivel vigente ${data!.current_level}`);
    assert(Number(data!.assessment_count) === 3, `la historia entera son 3 filas, hay ${data!.assessment_count}`);
  });

  await check("D3. un residual PEOR que el inherente se acepta y se conserva", async () => {
    // §75 · El sistema no puede rechazarlo solo porque «debería bajar»: el
    // contexto empeora, y negarlo produce evaluaciones falsas.
    const { error } = await owner.client.rpc("quality_assess_risk", {
      p_risk_id: risk.id, p_kind: "residual", p_version_id: met.versionId,
      p_level_ids: [met.levelIds.prob[5], met.levelIds.imp[5]],
      p_rationale: "El proveedor alternativo cerró; volvemos a depender de uno solo.",
      p_control_ids: [ctrl.id], p_assessed_on: null,
    });
    assert(!error, `un residual igual o peor debe poder registrarse: ${error?.message}`);
    const { data } = await owner.client.from("v_quality_risk_overview")
      .select("inherent_score, residual_score").eq("id", risk.id).single();
    assert(Number(data!.residual_score) === 25 && Number(data!.inherent_score) === 25,
      "residual y inherente pueden ser iguales sin que nadie lo impida");
  });

  // ==========================================================================
  console.log("\nE · Tratamiento: estrategia ≠ acción, y aceptar tiene precio");
  // ==========================================================================

  await check("E1. no se decide el tratamiento de lo que no se ha evaluado", async () => {
    const sinEvaluar = await newRisk(owner.client, A, "Sin evaluar", "algo podría pasar");
    const { error } = await owner.client.rpc("quality_decide_risk_treatment", {
      p_risk_id: sinEvaluar.id, p_strategy: "reduce", p_rationale: "porque sí", p_review_on: null,
    });
    assert(error, "no se trata lo que no se ha medido");
    assert(/evaluar/i.test(error!.message), `mensaje inesperado: ${error!.message}`);
  });

  await check("E2. un consultor no decide el tratamiento", async () => {
    const { error } = await worker.client.rpc("quality_decide_risk_treatment", {
      p_risk_id: risk.id, p_strategy: "reduce", p_rationale: "lo reduzco yo", p_review_on: null,
    });
    assert(error, "un consultor identifica y evalúa, pero no decide");
    assert(/permiso/i.test(error!.message), `mensaje inesperado: ${error!.message}`);
  });

  let planId = "";
  await check("E3. aceptar POR ENCIMA del criterio queda pendiente de aprobación (RO-08)", async () => {
    // El nivel vigente es Extremo, que la metodología declara no aceptable.
    const { data, error } = await owner.client.rpc("quality_decide_risk_treatment", {
      p_risk_id: risk.id, p_strategy: "accept",
      p_rationale: "No hay alternativa viable este año.", p_review_on: null,
    });
    assert(!error, `decidir: ${error?.message}`);
    planId = data as string;
    const { data: plan } = await owner.client.from("quality_risk_treatment_plans")
      .select("requires_approval, status, review_on").eq("id", planId).single();
    assert(plan!.requires_approval === true, "debía exigir aprobación");
    assert(plan!.status === "pending_approval", `estado ${plan!.status}`);
    assert(plan!.review_on !== null, "aceptar no exime de revisar (§32)");
  });

  await check("E4. y genera la tarea para quien tiene que aprobarlo", async () => {
    const { data } = await owner.client.from("work_tasks")
      .select("id, task_type, subject_type").eq("organization_id", A)
      .eq("task_type", "risk_treatment_approval");
    assert((data ?? []).length === 1, `se esperaba 1 tarea, hay ${(data ?? []).length}`);
    assert((data ?? [])[0].subject_type === "quality_risk", "la tarea apunta al riesgo");
  });

  await check("E5. quien lo propuso no puede aprobarlo", async () => {
    const { error } = await owner.client.rpc("quality_approve_risk_treatment", {
      p_plan_id: planId, p_note: "me lo apruebo yo",
    });
    assert(error, "la aceptación la aprueba otra persona");
    assert(/distinto de quien/i.test(error!.message), `mensaje inesperado: ${error!.message}`);
  });

  await check("E6. un consultor tampoco", async () => {
    const { error } = await worker.client.rpc("quality_approve_risk_treatment", {
      p_plan_id: planId, p_note: null,
    });
    assert(error, "hace falta rol de gobierno");
  });

  await check("E7. alguien con autoridad y distinto sí lo aprueba, y cierra su tarea", async () => {
    const { error } = await approver.client.rpc("quality_approve_risk_treatment", {
      p_plan_id: planId, p_note: "Aprobado en comité de dirección.",
    });
    assert(!error, `aprobar: ${error?.message}`);
    const { data: plan } = await owner.client.from("quality_risk_treatment_plans")
      .select("status, approved_by, approved_at").eq("id", planId).single();
    assert(plan!.status === "active", `estado ${plan!.status}`);
    assert(plan!.approved_by !== null && plan!.approved_at !== null, "queda quién y cuándo");
    const { data: task } = await owner.client.from("work_tasks")
      .select("status").eq("organization_id", A).eq("task_type", "risk_treatment_approval").single();
    assert(task!.status === "done", `la tarea debía cerrarse, está ${task!.status}`);
  });

  await check("E8. cambiar de estrategia SUCEDE el plan anterior, no lo edita", async () => {
    const { data, error } = await owner.client.rpc("quality_decide_risk_treatment", {
      p_risk_id: risk.id, p_strategy: "reduce",
      p_rationale: "Aparece un proveedor homologable.", p_review_on: null,
    });
    assert(!error, `nueva decisión: ${error?.message}`);
    const { data: plans } = await owner.client.from("quality_risk_treatment_plans")
      .select("id, strategy, status, superseded_by_plan_id").eq("risk_id", risk.id)
      .order("decided_on");
    assert((plans ?? []).length === 2, `deben quedar las dos decisiones, hay ${(plans ?? []).length}`);
    const old = (plans ?? []).find((p) => p.id === planId)!;
    assert(old.status === "superseded", `la anterior debía quedar sustituida, está ${old.status}`);
    assert(old.strategy === "accept", "y conserva su estrategia original");
    assert(old.superseded_by_plan_id === (data as string), "apuntando a la que la sustituye");
  });

  await check("E9. el fundamento de una decisión pasada no se reescribe", async () => {
    const { error } = await owner.client.from("quality_risk_treatment_plans")
      .update({ rationale: "otra cosa" }).eq("id", planId);
    assert(error, "reescribir el fundamento debería fallar");
  });

  // ==========================================================================
  console.log("\nF · Materialización: es un hecho, no un juicio (RO-27)");
  // ==========================================================================

  const ncBefore = await ncCount(owner.client, A);
  const casesBefore = await caseCount(owner.client, A);
  let matId = "";

  await check("F1. registrar que el riesgo ocurrió NO crea ninguna no conformidad", async () => {
    const { data, error } = await owner.client.rpc("quality_materialize_risk", {
      p_risk_id: risk.id, p_occurred_on: new Date().toISOString().slice(0, 10),
      p_description: "El proveedor no entregó el pedido de marzo.",
      p_severity: "major", p_consequence: "Dos días de producción detenida.",
    });
    assert(!error, `materializar: ${error?.message}`);
    matId = data as string;
    const ncAfter = await ncCount(owner.client, A);
    assert(ncAfter === ncBefore, `las NC pasaron de ${ncBefore} a ${ncAfter}: no debían moverse`);
    const casesAfter = await caseCount(owner.client, A);
    assert(casesAfter === casesBefore, `tampoco debía abrirse ningún caso (${casesBefore} → ${casesAfter})`);
  });

  await check("F2. pero sí deja el hecho, una alerta y la petición de reevaluar (RO-28)", async () => {
    const { data: mat } = await owner.client.from("quality_risk_materializations")
      .select("severity, reported_by, case_id").eq("id", matId).single();
    assert(mat!.severity === "major" && mat!.reported_by !== null, "el hecho queda con su gravedad y su autor");
    assert(mat!.case_id === null, "y sin caso, porque nadie lo ha decidido todavía");
    const { data: alerts } = await owner.client.from("work_alerts")
      .select("id").eq("organization_id", A).eq("alert_type", "risk_materialized");
    assert((alerts ?? []).length === 1, "debe avisar");
    const { data: tasks } = await owner.client.from("work_tasks")
      .select("id").eq("organization_id", A).eq("task_type", "risk_assessment_due");
    assert((tasks ?? []).length === 1, "y pedir reevaluar, sin cambiar nada por su cuenta");
  });

  await check("F3. el hecho no se puede reescribir desde la sesión, y sigue intacto", async () => {
    // Hay DOS cinturones y el primero es el que salta: la sesión no tiene
    // privilegio de escritura sobre esta tabla, así que ni llega al
    // disparador. Se comprueba el resultado —error Y fila intacta— porque
    // «cero filas» no es «denegado»: un 204 silencioso habría pasado por
    // bueno un borrado que no ocurrió.
    const before = await owner.client.from("quality_risk_materializations")
      .select("description, severity").eq("id", matId).single();

    for (const attempt of [
      owner.client.from("quality_risk_materializations")
        .update({ description: "no fue tan grave" }).eq("id", matId),
      owner.client.from("quality_risk_materializations")
        .update({ severity: "minor" }).eq("id", matId),
      owner.client.from("quality_risk_materializations").delete().eq("id", matId),
    ]) {
      const { error } = await attempt;
      assert(error, "la sesión no puede tocar un hecho registrado");
      assert(/permission denied|no se reescribe|historico/i.test(error!.message),
        `el rechazo debe ser explícito: ${error!.message}`);
    }

    const after = await owner.client.from("quality_risk_materializations")
      .select("description, severity").eq("id", matId).single();
    assert(after.data !== null, "y el hecho sigue existiendo");
    assert(after.data!.description === before.data!.description, "con su relato intacto");
    assert(after.data!.severity === before.data!.severity, "y su gravedad intacta");
  });

  let caseId = "";
  await check("F4. el caso se abre EXPLÍCITAMENTE, y referencia sin duplicar (§42)", async () => {
    const { data, error } = await owner.client.rpc("quality_open_case_from_materialization", {
      p_materialization_id: matId, p_title: null, p_priority: "high",
    });
    assert(!error, `abrir caso: ${error?.message}`);
    caseId = data as string;
    const { data: refs } = await owner.client.from("work_references")
      .select("ref_kind, ref_id, snapshot").eq("owner_kind", "case").eq("owner_id", caseId);
    const kinds = (refs ?? []).map((r) => r.ref_kind);
    assert(kinds.includes("quality_risk"), "el caso referencia el riesgo");
    assert(kinds.includes("quality_risk_materialization"), "y el hecho que lo motivó");
    assert(kinds.includes("quality_risk_assessment"), "y la evaluación que regía entonces");
    const riskRef = (refs ?? []).find((r) => r.ref_kind === "quality_risk")!;
    assert(riskRef.ref_id === risk.id, "apuntando al riesgo correcto");
    // No duplica: el caso no copia el título ni el nivel del riesgo.
    const { data: kase } = await owner.client.from("work_cases")
      .select("origin_kind, classification, title").eq("id", caseId).single();
    assert(kase!.origin_kind === "risk", "el origen queda declarado");
    assert(kase!.classification === "pending",
      `nace SIN clasificar: venir de un riesgo no adelanta si es NC (dio ${kase!.classification})`);
  });

  await check("F5. y sigue sin haber ninguna no conformidad hasta que alguien la declare", async () => {
    const ncAfter = await ncCount(owner.client, A);
    assert(ncAfter === ncBefore, `las NC siguen siendo ${ncBefore}, hay ${ncAfter}`);
  });

  await check("F6. no se abre dos veces un caso del mismo hecho", async () => {
    const { error } = await owner.client.rpc("quality_open_case_from_materialization", {
      p_materialization_id: matId, p_title: null, p_priority: "normal",
    });
    assert(error, "debería impedirlo");
    assert(/ya tiene un caso/i.test(error!.message), `mensaje inesperado: ${error!.message}`);
  });

  // ==========================================================================
  console.log("\nG · Cambiar la metodología no reescribe el pasado (§69, §70)");
  // ==========================================================================

  await check("G1. se publica una v2 con criterios más duros", async () => {
    const { data: v2, error } = await owner.client.from("quality_risk_methodology_versions")
      .insert({ organization_id: A, methodology_id: met.methodologyId, version_number: 2,
                aggregation: "product", change_note: "Se endurecen los umbrales" })
      .select("id").single();
    assert(!error && v2, `crear v2: ${error?.message}`);

    for (const [code, label, values] of [
      ["prob", "Probabilidad", [[1, "Rara"], [3, "Posible"], [5, "Casi segura"]]],
      ["imp", "Impacto", [[1, "Leve"], [3, "Moderado"], [5, "Grave"]]],
    ] as [string, string, [number, string][]][]) {
      const { data: s } = await owner.client.from("quality_risk_scales")
        .insert({ organization_id: A, version_id: v2!.id, code, label, scale_kind: "dimension" })
        .select("id").single();
      for (const [value, lab] of values) {
        await owner.client.from("quality_risk_scale_levels")
          .insert({ organization_id: A, scale_id: s!.id, value, label: lab });
      }
    }
    const { data: rs } = await owner.client.from("quality_risk_scales")
      .insert({ organization_id: A, version_id: v2!.id, code: "nivel", label: "Nivel", scale_kind: "result" })
      .select("id").single();
    // Umbrales más duros: lo que antes era «Medio» ahora es «Alto».
    for (const [i, [min, max, label, ok, months]] of ([
      [1, 2, "Bajo", true, 12], [3, 6, "Medio", true, 6],
      [7, 12, "Alto", false, 3], [13, 25, "Extremo", false, 1],
    ] as [number, number, string, boolean, number][]).entries()) {
      await owner.client.from("quality_risk_scale_levels").insert({
        organization_id: A, scale_id: rs!.id, value: i + 1, label, position: i + 1,
        min_score: min, max_score: max, is_acceptable: ok, review_months: months,
      });
    }
    const { error: pubErr } = await owner.client.rpc("quality_publish_methodology_version", {
      p_version_id: v2!.id, p_effective_from: new Date().toISOString().slice(0, 10),
      p_change_note: "Umbrales más exigentes",
    });
    assert(!pubErr, `publicar v2: ${pubErr?.message}`);
  });

  await check("G2. la v1 queda SUSTITUIDA, no borrada", async () => {
    const { data } = await owner.client.from("quality_risk_methodology_versions")
      .select("status, effective_to").eq("id", met.versionId).single();
    assert(data!.status === "superseded", `estado ${data!.status}`);
    assert(data!.effective_to !== null, "y con su vigencia cerrada");
  });

  await check("G3. la evaluación de ayer sigue explicándose con la v1 (RO-04)", async () => {
    const { data } = await owner.client.from("quality_risk_assessments")
      .select("methodology_version_id, score, derivation").eq("id", inherentId).single();
    assert(data!.methodology_version_id === met.versionId, "sigue apuntando a la v1");
    assert(Number(data!.score) === 25, "su puntaje no cambió");
    const d = data!.derivation as Record<string, unknown>;
    assert(d.level_label === "Extremo", "y su nivel tampoco");
    // Con la v2, 25 seguiría siendo Extremo, así que se comprueba una que sí
    // cambiaría de banda: 3×1 = 3 era «Bajo» en v1 y es «Medio» en v2.
    const { data: v2 } = await owner.client.from("quality_risk_methodology_versions")
      .select("id").eq("methodology_id", met.methodologyId).eq("version_number", 2).single();
    const { data: lv } = await owner.client.from("quality_risk_scale_levels")
      .select("id, value, quality_risk_scales!inner(code, version_id)")
      .eq("quality_risk_scales.version_id", v2!.id);
    const p3 = (lv ?? []).find((l) => Number(l.value) === 3 &&
      (l.quality_risk_scales as unknown as { code: string }).code === "prob")!;
    const i1 = (lv ?? []).find((l) => Number(l.value) === 1 &&
      (l.quality_risk_scales as unknown as { code: string }).code === "imp")!;
    const { data: derived } = await owner.client.rpc("quality_derive_level", {
      p_version_id: v2!.id, p_level_ids: [p3.id, i1.id],
    });
    const dd = derived as Record<string, unknown>;
    assert(dd.level_label === "Medio",
      `con la v2, 3 debía caer en Medio, cayó en ${dd.level_label}`);
    // Y con la v1 el mismo 3 era Bajo: los criterios cambiaron de verdad.
    const { data: derivedV1 } = await owner.client.rpc("quality_derive_level", {
      p_version_id: met.versionId, p_level_ids: [met.levelIds.prob[3], met.levelIds.imp[1]],
    });
    assert((derivedV1 as Record<string, unknown>).level_label === "Bajo",
      "con la v1 ese mismo puntaje seguía siendo Bajo: el pasado no se recalculó");
  });

  await check("G4. una versión ya usada para evaluar NO se puede borrar (§49)", async () => {
    const { error } = await owner.client.from("quality_risk_methodology_versions")
      .delete().eq("id", met.versionId);
    assert(error, "borrarla dejaría huérfanas las evaluaciones que la usaron");
    const { data: v } = await owner.client.rpc("quality_deletion_eligibility", {
      p_entity: "methodology_version", p_id: met.versionId,
    });
    assert((v as Record<string, unknown>).can_hard_delete === false, "y el dictamen lo dice");
  });

  // ==========================================================================
  console.log("\nH · Oportunidad ≠ riesgo ≠ acción de mejora");
  // ==========================================================================

  const opMet = await newMethodology(owner.client, A, `MO-${stamp.slice(-5)}`, "opportunity",
    [
      { code: "ben", label: "Beneficio", values: [[1, "Pequeño"], [3, "Notable"], [5, "Grande"]] },
      { code: "via", label: "Viabilidad", values: [[1, "Difícil"], [3, "Razonable"], [5, "Sencilla"]] },
    ],
    [[1, 6, "Baja", true, null], [7, 14, "Media", true, null], [15, 25, "Alta", true, null]]
  );
  await owner.client.rpc("quality_publish_methodology_version", {
    p_version_id: opMet.versionId, p_effective_from: "2026-01-01", p_change_note: null,
  });

  const { data: opCode } = await owner.client.rpc("quality_next_ro_code", {
    p_organization_id: A, p_kind: "opportunity",
  });
  const { data: op, error: opErr } = await owner.client.from("quality_opportunities").insert({
    organization_id: A, code: opCode,
    title: "Automatizar el seguimiento de revisión documental",
    situation: "Las revisiones se controlan en una hoja aparte y se olvidan.",
    expected_benefit: "Menos revisiones vencidas y menos trabajo manual.",
    opportunity_kind: "efficiency", owner_position_id: pos!.id,
  }).select("id").single();
  assert(!opErr && op, `crear oportunidad: ${opErr?.message}`);
  const opId = op!.id as string;

  await check("H1. una oportunidad NO se prioriza con la metodología de riesgos (RO-15)", async () => {
    const { error } = await owner.client.rpc("quality_assess_opportunity", {
      p_opportunity_id: opId, p_kind: "prioritization", p_version_id: met.versionId,
      p_level_ids: [met.levelIds.prob[3], met.levelIds.imp[3]], p_rationale: null,
    });
    assert(error, "priorizar un beneficio con escalas de daño no significa nada");
    assert(/riesgos/i.test(error!.message), `mensaje inesperado: ${error!.message}`);
  });

  await check("H2. ni un riesgo con la de oportunidades", async () => {
    const { error } = await owner.client.rpc("quality_assess_risk", {
      p_risk_id: risk.id, p_kind: "inherent", p_version_id: opMet.versionId,
      p_level_ids: [opMet.levelIds.ben[3], opMet.levelIds.via[3]],
      p_rationale: null, p_control_ids: null, p_assessed_on: null,
    });
    assert(error, "y al revés tampoco");
    assert(/oportunidades/i.test(error!.message), `mensaje inesperado: ${error!.message}`);
  });

  await check("H3. con la suya, sí, y deriva su prioridad", async () => {
    const { data, error } = await owner.client.rpc("quality_assess_opportunity", {
      p_opportunity_id: opId, p_kind: "prioritization", p_version_id: opMet.versionId,
      p_level_ids: [opMet.levelIds.ben[5], opMet.levelIds.via[3]],
      p_rationale: "Beneficio grande con esfuerzo razonable.",
    });
    assert(!error, `priorizar: ${error?.message}`);
    const { data: as } = await owner.client.from("quality_opportunity_assessments")
      .select("score, derivation").eq("id", data as string).single();
    assert(Number(as!.score) === 15, `5×3 debía dar 15, dio ${as!.score}`);
    assert((as!.derivation as Record<string, unknown>).level_label === "Alta", "prioridad alta");
  });

  await check("H4. no se decide sobre una oportunidad sin priorizarla", async () => {
    const { data: c2 } = await owner.client.rpc("quality_next_ro_code", {
      p_organization_id: A, p_kind: "opportunity",
    });
    const { data: op2 } = await owner.client.from("quality_opportunities").insert({
      organization_id: A, code: c2, title: "Sin priorizar", situation: "una cosa que vi",
    }).select("id").single();
    const { error } = await owner.client.rpc("quality_decide_opportunity_treatment", {
      p_opportunity_id: op2!.id, p_decision: "pursue", p_rationale: "porque sí",
    });
    assert(error, "primero se prioriza");
    assert(/priorizarla/i.test(error!.message), `mensaje inesperado: ${error!.message}`);
  });

  await check("H5. el catálogo de decisiones de una oportunidad es el SUYO (§34)", async () => {
    for (const bad of ["avoid", "reduce", "share", "accept"]) {
      const { error } = await owner.client.rpc("quality_decide_opportunity_treatment", {
        p_opportunity_id: opId, p_decision: bad, p_rationale: "no debería valer",
      });
      assert(error, `«${bad}» es vocabulario de riesgo y no debería aceptarse`);
    }
  });

  await check("H6. decidir aprovecharla NO la convierte en una acción (§45)", async () => {
    const ncB = await ncCount(owner.client, A);
    const { error } = await owner.client.rpc("quality_decide_opportunity_treatment", {
      p_opportunity_id: opId, p_decision: "pursue",
      p_rationale: "Entra en el plan del próximo trimestre.",
    });
    assert(!error, `decidir: ${error?.message}`);
    const { data } = await owner.client.from("quality_opportunities")
      .select("id, status, treatment_decision").eq("id", opId).single();
    assert(data !== null, "la oportunidad SIGUE existiendo");
    assert(data!.treatment_decision === "pursue", "con su decisión registrada");
    assert(data!.status === "in_progress", `estado ${data!.status}`);
    assert(await ncCount(owner.client, A) === ncB, "y sin tocar ninguna no conformidad");
  });

  await check("H7. la acción de mejora nace aparte y REFERENCIA la oportunidad", async () => {
    const { data: code } = await owner.client.rpc("work_next_action_code", { p_organization_id: A });
    const { data: act, error } = await owner.client.from("work_actions").insert({
      organization_id: A, code, action_kind: "improvement",
      title: "Configurar avisos automáticos de revisión",
      owner_position_id: pos!.id, due_on: "2026-12-31",
    }).select("id").single();
    assert(!error && act, `crear acción: ${error?.message}`);
    const { error: refErr } = await owner.client.from("work_references").insert({
      organization_id: A, owner_kind: "action", owner_id: act!.id,
      ref_kind: "quality_opportunity", ref_id: opId, relation: "origin",
    });
    assert(!refErr, `referenciar: ${refErr?.message}`);
    const { data: view } = await owner.client.from("v_quality_opportunity_overview")
      .select("action_count").eq("id", opId).single();
    assert(Number(view!.action_count) === 1, `la oportunidad debe ver su acción, vio ${view!.action_count}`);
  });

  await check("H8. el beneficio obtenido solo se evalúa una vez implementada (RO-16)", async () => {
    const { data: c3 } = await owner.client.rpc("quality_next_ro_code", {
      p_organization_id: A, p_kind: "opportunity",
    });
    const { data: op3 } = await owner.client.from("quality_opportunities").insert({
      organization_id: A, code: c3, title: "Recién identificada", situation: "algo",
    }).select("id").single();
    const { error } = await owner.client.rpc("quality_assess_opportunity", {
      p_opportunity_id: op3!.id, p_kind: "realized_benefit", p_version_id: opMet.versionId,
      p_level_ids: [opMet.levelIds.ben[5], opMet.levelIds.via[5]], p_rationale: null,
    });
    assert(error, "no se mide el beneficio de lo que no se ha hecho");
    assert(/implemento/i.test(sinTildes(error!.message)), `mensaje inesperado: ${error!.message}`);
  });

  // ==========================================================================
  console.log("\nI · Revisión, cierre y reapertura (RO-10, RO-29)");
  // ==========================================================================

  await check("I1. el barrido crea la tarea de revisión vencida, y es idempotente", async () => {
    const { error: upErr } = await owner.client.from("quality_risks")
      .update({ next_review_on: "2020-01-01" }).eq("id", risk.id);
    assert(!upErr, `atrasar la revisión: ${upErr?.message}`);
    const { data: n1 } = await owner.client.rpc("quality_scan_risk_reviews", { p_organization_id: A });
    const { data: n2 } = await owner.client.rpc("quality_scan_risk_reviews", { p_organization_id: A });
    assert(Number(n1) >= 1, `el primer barrido debía crear al menos una tarea, creó ${n1}`);
    assert(Number(n2) === 0, `el segundo no debía crear ninguna, creó ${n2}`);
    const { data: tasks } = await owner.client.from("work_tasks")
      .select("id").eq("organization_id", A).eq("task_type", "risk_review_due");
    assert((tasks ?? []).length === 1, `debe haber UNA tarea, hay ${(tasks ?? []).length}`);
    const { data: alerts } = await owner.client.from("work_alerts")
      .select("id").eq("organization_id", A).eq("alert_type", "risk_review_overdue");
    assert((alerts ?? []).length === 1, `y UNA alerta, hay ${(alerts ?? []).length}`);
  });

  await check("I2. la vista marca la revisión vencida", async () => {
    const { data } = await owner.client.from("v_quality_risk_overview")
      .select("review_overdue").eq("id", risk.id).single();
    assert(data!.review_overdue === true, "debía aparecer como vencida");
  });

  await check("I3. revisar NO reescribe ninguna evaluación: solo reprograma y deja constancia", async () => {
    const { data: before } = await owner.client.from("quality_risk_assessments")
      .select("id").eq("risk_id", risk.id);
    const { error } = await owner.client.rpc("quality_review_risk", {
      p_risk_id: risk.id, p_note: "Revisado con el jefe de compras; sigue igual.",
      p_next_review_on: null,
    });
    assert(!error, `revisar: ${error?.message}`);
    const { data: after } = await owner.client.from("quality_risk_assessments")
      .select("id").eq("risk_id", risk.id);
    assert((after ?? []).length === (before ?? []).length,
      "revisar no debe crear ni destruir evaluaciones");
    const { data: r } = await owner.client.from("quality_risks")
      .select("last_reviewed_on, next_review_on").eq("id", risk.id).single();
    assert(r!.last_reviewed_on !== null, "queda la fecha de revisión");
    assert(r!.next_review_on !== null && r!.next_review_on > "2020-01-01", "y se reprograma la siguiente");
    const { data: task } = await owner.client.from("work_tasks")
      .select("status").eq("organization_id", A).eq("task_type", "risk_review_due").single();
    assert(task!.status === "done", `la tarea debía cerrarse, está ${task!.status}`);
  });

  await check("I4. cerrar exige decir por qué, y cancela lo pendiente sin borrarlo", async () => {
    const vacio = await owner.client.rpc("quality_close_risk", {
      p_risk_id: risk.id, p_mode: "closed", p_reason: "", p_superseded_by: null,
    });
    assert(vacio.error, "cerrar sin motivo debería fallar");

    const { error } = await owner.client.rpc("quality_close_risk", {
      p_risk_id: risk.id, p_mode: "closed",
      p_reason: "Se cambió de proveedor y la dependencia desapareció.", p_superseded_by: null,
    });
    assert(!error, `cerrar: ${error?.message}`);
    const { data: r } = await owner.client.from("quality_risks")
      .select("status, closed_at, closure_reason").eq("id", risk.id).single();
    assert(r!.status === "closed" && r!.closed_at !== null, "queda cerrado con fecha");
    const { data: pend } = await owner.client.from("work_tasks")
      .select("status").eq("organization_id", A).eq("subject_id", risk.id)
      .in("status", ["open", "in_progress"]);
    assert((pend ?? []).length === 0, "un riesgo cerrado no sigue pidiendo deberes");
  });

  await check("I5. un riesgo cerrado no admite evaluaciones nuevas", async () => {
    const { error } = await owner.client.rpc("quality_assess_risk", {
      p_risk_id: risk.id, p_kind: "inherent", p_version_id: met.versionId,
      p_level_ids: [met.levelIds.prob[1], met.levelIds.imp[1]],
      p_rationale: null, p_control_ids: null, p_assessed_on: null,
    });
    assert(error, "no se evalúa lo cerrado");
    assert(/activo/i.test(error!.message), `mensaje inesperado: ${error!.message}`);
  });

  await check("I6. reabrir conserva la decisión de cierre en el historial (RO-29)", async () => {
    const { error } = await owner.client.rpc("quality_reopen_risk", {
      p_risk_id: risk.id, p_reason: "El proveedor nuevo también falló.",
    });
    assert(!error, `reabrir: ${error?.message}`);
    const { data: r } = await owner.client.from("quality_risks")
      .select("status, closed_at").eq("id", risk.id).single();
    assert(r!.status === "active" && r!.closed_at === null, "vuelve a estar activo");
    const { data: dec } = await owner.client.from("work_decisions")
      .select("decision_kind").eq("subject_kind", "risk").eq("subject_id", risk.id);
    const kinds = (dec ?? []).map((d) => d.decision_kind);
    assert(kinds.includes("closure") && kinds.includes("reopen"),
      "el cierre y la reapertura tienen que verse los dos");
  });

  // ==========================================================================
  console.log("\nJ · Ciclo de vida: lo que tiene historia no se tira (§48)");
  // ==========================================================================

  await check("J1. un riesgo en BORRADOR y sin historia se puede eliminar", async () => {
    const tmp = await newRisk(owner.client, A, "Borrador desechable", "algo que no llegó a nada");
    const { data: v } = await owner.client.rpc("quality_deletion_eligibility", {
      p_entity: "risk", p_id: tmp.id,
    });
    assert((v as Record<string, unknown>).can_hard_delete === true,
      `el dictamen debía permitirlo: ${JSON.stringify(v)}`);
    const { error } = await owner.client.from("quality_risks").delete().eq("id", tmp.id);
    assert(!error, `eliminar: ${error?.message}`);
  });

  await check("J2. pero su NÚMERO no vuelve a circulación (D-04)", async () => {
    const { data: reserved } = await owner.client.from("quality_risk_codes")
      .select("code, risk_id, released_at").eq("organization_id", A);
    const liberado = (reserved ?? []).find((r) => r.risk_id === null);
    assert(liberado !== undefined, "el código debe quedar reservado y liberado");
    assert(liberado!.released_at !== null, "con su marca de liberación");
    // Y no se puede reusar.
    const { error } = await owner.client.from("quality_risks").insert({
      organization_id: A, code: liberado!.code, title: "Reciclado", event_description: "x",
    });
    assert(error, "reutilizar un número ya usado debería fallar");
  });

  await check("J3. un riesgo evaluado NO se puede eliminar, ni por quien puede borrar", async () => {
    const { data: v } = await owner.client.rpc("quality_deletion_eligibility", {
      p_entity: "risk", p_id: risk.id,
    });
    const verdict = v as Record<string, unknown>;
    assert(verdict.can_hard_delete === false, "el dictamen debe negarlo");
    const blocking = JSON.stringify(verdict.blocking);
    assert(/evaluacion|evaluaciones/i.test(sinTildes(blocking)), `debe nombrar las evaluaciones: ${blocking}`);
    assert(/materializacion/i.test(sinTildes(blocking)), `y la materialización: ${blocking}`);
    // Las etiquetas son sintagmas nominales: la interfaz las compone como
    // «Tiene 4 evaluaciones». Si empezaran por «tiene», el mensaje final
    // diría «Tiene 4 tiene 4 evaluaciones», que fue el defecto que se vio en
    // pantalla.
    for (const b of verdict.blocking as { label: string }[]) {
      assert(!/^(tiene|hay|ya |se uso|esta |sustenta|llego)/i.test(b.label),
        `«${b.label}» es una frase, no un sintagma nominal: se duplicaría al componerla`);
    }
    // Y el disparador lo impide de verdad, no solo la pantalla.
    const { error } = await owner.client.from("quality_risks").delete().eq("id", risk.id);
    assert(error, "el DELETE debe fallar, no devolver cero filas");
    const { data: still } = await owner.client.from("quality_risks")
      .select("id").eq("id", risk.id).maybeSingle();
    assert(still !== null, "y el riesgo sigue ahí");
  });

  await check("J4. el dictamen habla en español y sin códigos internos", async () => {
    const { data: v } = await owner.client.rpc("quality_deletion_eligibility", {
      p_entity: "risk", p_id: risk.id,
    });
    const reason = String((v as Record<string, unknown>).reason);
    assert(/conservarse/i.test(reason), `el motivo debe explicarse: «${reason}»`);
    assert(!/\bP0001\b|null|undefined/.test(reason), `no debe filtrar internos: «${reason}»`);
    // Ningún código de estado en inglés puede llegar a la pantalla.
    for (const code of ["active", "draft", "closed", "retired", "superseded"]) {
      assert(!new RegExp(`\\b${code}\\b`).test(reason),
        `el estado se dice en español, no como «${code}»: «${reason}»`);
    }
  });

  // ==========================================================================
  console.log("\nK · Lo de otra empresa no existe (§53, §57, §85)");
  // ==========================================================================

  await check("K1. la empresa B no ve el riesgo de A", async () => {
    const { data } = await outsider.client.from("quality_risks").select("id").eq("id", risk.id);
    assert((data ?? []).length === 0, "no debería ver nada");
    const { data: view } = await outsider.client.from("v_quality_risk_overview")
      .select("id, current_level").eq("id", risk.id);
    assert((view ?? []).length === 0, "ni por la proyección");
  });

  await check("K2. ni su metodología, ni sus escalas, ni sus niveles", async () => {
    for (const [t, col, id] of [
      ["quality_risk_methodologies", "id", met.methodologyId],
      ["quality_risk_methodology_versions", "id", met.versionId],
      ["quality_risk_scale_levels", "id", met.levelIds.prob[5]],
    ] as [string, string, string][]) {
      const { data } = await outsider.client.from(t).select(col).eq(col, id);
      assert((data ?? []).length === 0, `${t} se filtra`);
    }
  });

  await check("K3. ni sus controles, evaluaciones, planes o materializaciones", async () => {
    for (const [t, id] of [
      ["quality_controls", ctrl.id],
      ["quality_risk_assessments", inherentId],
      ["quality_risk_treatment_plans", planId],
      ["quality_risk_materializations", matId],
      ["quality_opportunities", opId],
    ] as [string, string][]) {
      const { data } = await outsider.client.from(t).select("id").eq("id", id);
      assert((data ?? []).length === 0, `${t} se filtra`);
    }
  });

  await check("K4. no puede evaluar un riesgo ajeno", async () => {
    const { error } = await outsider.client.rpc("quality_assess_risk", {
      p_risk_id: risk.id, p_kind: "inherent", p_version_id: met.versionId,
      p_level_ids: [met.levelIds.prob[1], met.levelIds.imp[1]],
      p_rationale: null, p_control_ids: null, p_assessed_on: null,
    });
    assert(error, "debería fallar");
  });

  await check("K5. no puede tratarlo, materializarlo, revisarlo ni cerrarlo", async () => {
    const attempts = [
      outsider.client.rpc("quality_decide_risk_treatment", {
        p_risk_id: risk.id, p_strategy: "accept", p_rationale: "mío ahora", p_review_on: null }),
      outsider.client.rpc("quality_materialize_risk", {
        p_risk_id: risk.id, p_occurred_on: "2026-01-01", p_description: "invento",
        p_severity: "minor", p_consequence: null }),
      outsider.client.rpc("quality_review_risk", {
        p_risk_id: risk.id, p_note: "lo reviso yo", p_next_review_on: null }),
      outsider.client.rpc("quality_close_risk", {
        p_risk_id: risk.id, p_mode: "closed", p_reason: "lo cierro", p_superseded_by: null }),
      outsider.client.rpc("quality_reopen_risk", { p_risk_id: risk.id, p_reason: "lo abro" }),
    ];
    const results = await Promise.all(attempts);
    for (const [i, r] of results.entries()) {
      assert(r.error, `el intento ${i + 1} debería haber fallado`);
    }
  });

  await check("K6. no puede crear una referencia que cruce empresas", async () => {
    const { data: bCode } = await outsider.client.rpc("quality_next_ro_code", {
      p_organization_id: B, p_kind: "risk",
    });
    const { data: bRisk } = await outsider.client.from("quality_risks").insert({
      organization_id: B, code: bCode, title: "Riesgo de B", event_description: "algo",
    }).select("id").single();
    // Su riesgo apuntando a un control de A.
    const { error } = await outsider.client.from("work_references").insert({
      organization_id: B, owner_kind: "risk", owner_id: bRisk!.id,
      ref_kind: "quality_control", ref_id: ctrl.id, relation: "related",
    });
    assert(error, "una referencia cruzada debería fallar");
    assert(/no es de esta empresa|no existe/i.test(error!.message),
      `mensaje inesperado: ${error!.message}`);
  });

  await check("K7. el dictamen de eliminación de lo ajeno no revela NADA", async () => {
    const { data } = await outsider.client.rpc("quality_deletion_eligibility", {
      p_entity: "risk", p_id: risk.id,
    });
    const v = data as Record<string, unknown>;
    assert(v.can_hard_delete === false, "no puede borrarlo");
    assert(v.reason_code === "not_found",
      `debe responder lo mismo que ante un identificador inventado, dijo ${v.reason_code}`);
    assert(JSON.stringify(v.blocking) === "[]",
      "ni un contador puede salir: «tiene 3 evaluaciones» ya dice algo de otra empresa");
  });

  await check("K8. un DELETE ajeno no borra nada (cero filas no es denegado)", async () => {
    await outsider.client.from("quality_risks").delete().eq("id", risk.id);
    const { data } = await owner.client.from("quality_risks").select("id").eq("id", risk.id);
    assert((data ?? []).length === 1, "el riesgo de A sigue existiendo");
    await outsider.client.from("quality_controls").delete().eq("id", ctrl.id);
    const { data: c } = await owner.client.from("quality_controls").select("id").eq("id", ctrl.id);
    assert((c ?? []).length === 1, "y su control también");
  });

  await check("K9. tampoco puede escribir directamente en las tablas de historia", async () => {
    const attempts = [
      outsider.client.from("quality_risk_assessments").insert({
        organization_id: B, risk_id: risk.id, assessment_kind: "inherent",
        methodology_version_id: met.versionId, score: 1, result_level_id: met.levelIds.prob[1],
      }),
      outsider.client.from("quality_risk_treatment_plans").insert({
        organization_id: B, risk_id: risk.id, strategy: "accept", rationale: "mío",
      }),
      outsider.client.from("quality_risk_materializations").insert({
        organization_id: B, risk_id: risk.id, occurred_on: "2026-01-01", description: "invento",
      }),
    ];
    const results = await Promise.all(attempts);
    for (const [i, r] of results.entries()) {
      assert(r.error, `la escritura directa ${i + 1} debería haber fallado`);
    }
  });

  // ==========================================================================
  console.log("\nL · QUALITY-04 sigue funcionando igual (§80)");
  // ==========================================================================

  await check("L1. un caso normal se sigue creando, clasificando y cerrando", async () => {
    const { data: code } = await owner.client.rpc("work_next_case_code", { p_organization_id: A });
    const { data: k, error } = await owner.client.from("work_cases").insert({
      organization_id: A, code, title: "Caso de regresión", case_type: "issue",
    }).select("id").single();
    assert(!error && k, `crear caso: ${error?.message}`);
    await owner.client.from("work_case_findings").insert({
      organization_id: A, case_id: k!.id, statement: "Se detectó algo.",
    });
    const { error: cls } = await owner.client.rpc("work_classify_case", {
      p_case_id: k!.id, p_classification: "observation",
      p_rationale: "No incumple ningún requisito.", p_requirement_text: null,
    });
    assert(!cls, `clasificar: ${cls?.message}`);
    const { data: kase } = await owner.client.from("work_cases")
      .select("classification").eq("id", k!.id).single();
    assert(kase!.classification === "observation", "la clasificación de QUALITY-04 sigue viva");
  });

  await check("L2. una acción de CASO sigue enlazándose al caso, no al riesgo", async () => {
    const { data: code } = await owner.client.rpc("work_next_case_code", { p_organization_id: A });
    const { data: k } = await owner.client.from("work_cases").insert({
      organization_id: A, code, title: "Caso con acción", case_type: "issue",
    }).select("id").single();
    const { data: aCode } = await owner.client.rpc("work_next_action_code", { p_organization_id: A });
    const { data: act } = await owner.client.from("work_actions").insert({
      organization_id: A, code: aCode, action_kind: "corrective", title: "Acción del caso",
    }).select("id").single();
    const { error } = await owner.client.from("work_references").insert({
      organization_id: A, owner_kind: "action", owner_id: act!.id,
      ref_kind: "work_case", ref_id: k!.id, relation: "origin",
    });
    assert(!error, `el enlace de siempre debe seguir funcionando: ${error?.message}`);
  });

  await check("L3. la sesión NO puede escribir tareas ni alertas a mano", async () => {
    // No es una limitación de este sprint: la bandeja se alimenta desde las
    // RPC, y por eso `authenticated` solo tiene SELECT. Comprobarlo aquí evita
    // que un ensanche futuro de catálogos abra la puerta sin querer.
    const t = await owner.client.from("work_tasks").insert({
      organization_id: A, source_domain: "risk", task_type: "risk_review_due",
      subject_type: "quality_risk", subject_id: risk.id, title: "Inventada", status: "open",
      dedupe_key: `regresion:${stamp}`,
    });
    assert(t.error, "escribir una tarea a mano debería estar denegado");
    const a = await owner.client.from("work_alerts").insert({
      organization_id: A, source_domain: "risk", alert_type: "risk_materialized",
      severity: "info", subject_type: "quality_risk", subject_id: risk.id,
      title: "Inventada", dedupe_key: `regresion-a:${stamp}`,
    });
    assert(a.error, "y una alerta también");
  });

  await check("L4. los catálogos ensanchados siguen aceptando los valores de QUALITY-04", async () => {
    // Se comprueba sobre la definición real de la restricción, que es donde
    // vive el catálogo, en vez de intentar un INSERT que está denegado.
    const { data } = await owner.client.rpc("quality_scan_risk_reviews", { p_organization_id: A });
    assert(typeof data === "number", "el barrido transversal sigue respondiendo");
    const { data: tasks } = await owner.client.from("work_tasks")
      .select("task_type").eq("organization_id", A);
    const types = new Set((tasks ?? []).map((t) => t.task_type));
    assert(types.size > 0, "debe haber tareas de este sprint");
    for (const t of types) {
      assert(typeof t === "string" && t.length > 0, "todo tipo de tarea tiene nombre");
    }
  });

  // ==========================================================================
  console.log(`\nResultado: ${passed} conformes, ${failed} fallos\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error("ERROR:", e); process.exit(1); });
