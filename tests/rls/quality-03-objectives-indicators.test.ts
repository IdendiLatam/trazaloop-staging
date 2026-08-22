/**
 * Trazaloop Quality · QUALITY-03 · Pruebas contra base REAL.
 *
 *   A · Objetivos: crear, responsable por cargo, procesos, estados.
 *   B · Indicadores: manual, calculado, automático; direcciones y unidades.
 *   C · Mediciones: cero ≠ sin dato, periodos, duplicados, corrección.
 *   D · La historia NO se reescribe al cambiar la meta.
 *   E · Fuentes automáticas: catálogo cerrado y acotado por empresa.
 *   F · Desempeño del objetivo, derivado y explicable.
 *   G · Medición pendiente, eventos y alertas.
 *   H · Cierre de ciclo.
 *   X · Ataques directos y aislamiento entre empresas.
 *   Z · Sin regresión en QUALITY-01/02.
 *
 * Todo corre con la SESIÓN REAL de cada usuario (RLS incluida). El cliente
 * administrativo se usa solo para crear cuentas y ajustar el plan comercial.
 *
 * Correr: npm run test:quality03-rls
 */
import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DB_URL = process.env.SUPABASE_DB_URL;

if (!URL || !ANON || !SERVICE) {
  console.error("Faltan variables para test:quality03-rls (URL, ANON, SERVICE_ROLE).");
  process.exit(1);
}

/** Misma guarda que el resto de Quality: nunca mezclar entornos. */
function projectRefOf(value: string): string {
  if (/(127\.0\.0\.1|localhost)/.test(value)) return "local";
  const m =
    value.match(/(?:db\.|\/\/)([a-z0-9]{20})\.supabase\.co/) ??
    value.match(/postgres\.([a-z0-9]{20})(?::|@)/);
  return m ? m[1] : "desconocido";
}
if (DB_URL && projectRefOf(URL) !== projectRefOf(DB_URL)) {
  console.error(
    `\nABORTADO: la API apunta a «${projectRefOf(URL)}» y SUPABASE_DB_URL a «${projectRefOf(DB_URL)}».\n`
  );
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

const YEAR = 2026;
const month = (m: number) => ({
  start: `${YEAR}-${String(m).padStart(2, "0")}-01`,
  end: new Date(Date.UTC(YEAR, m, 0)).toISOString().slice(0, 10),
  label: `${YEAR}-${String(m).padStart(2, "0")}`,
});

async function newUser(label: string, name: string) {
  const email = `q03-${label}-${stamp}@test.trazaloop.dev`;
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

async function createOrg(client: SupabaseClient, name: string): Promise<string> {
  const { data, error } = await client.rpc("create_organization", { p_name: name });
  if (error || !data) throw new Error(`create_organization: ${error?.message}`);
  return data as string;
}

type ConfigInput = {
  effectiveFrom?: string; unit?: string; direction?: string; frequency?: string;
  target?: number | null; targetMin?: number | null; targetMax?: number | null;
  warning?: number | null; warningMin?: number | null; warningMax?: number | null;
  sourceKind?: string; sourceKey?: string | null; calc?: unknown; note?: string | null;
};

async function makeIndicator(
  client: SupabaseClient, orgId: string, code: string, name: string,
  cfg: ConfigInput = {}, ownerPositionId: string | null = null
) {
  const { data, error } = await client
    .from("quality_indicators")
    .insert({
      organization_id: orgId, code, name, admin_state: "active",
      owner_position_id: ownerPositionId,
    })
    .select("id").single();
  assert(!error && data, `crear indicador ${code}: ${error?.message}`);
  const id = data!.id as string;
  const { error: cfgErr } = await client.rpc("quality_publish_indicator_config", {
    p_indicator_id: id,
    p_effective_from: cfg.effectiveFrom ?? `${YEAR}-01-01`,
    p_unit_code: cfg.unit ?? "percent",
    p_direction: cfg.direction ?? "higher_is_better",
    p_frequency: cfg.frequency ?? "monthly",
    p_target_value: cfg.target === undefined ? 95 : cfg.target,
    p_target_min: cfg.targetMin ?? null,
    p_target_max: cfg.targetMax ?? null,
    p_warning_value: cfg.warning ?? null,
    p_warning_min: cfg.warningMin ?? null,
    p_warning_max: cfg.warningMax ?? null,
    p_source_kind: cfg.sourceKind ?? "manual",
    p_source_key: cfg.sourceKey ?? null,
    p_calc_definition: cfg.calc ?? null,
    p_formula_text: null, p_unit_label: null, p_source_note: null,
    p_consolidation: "none", p_comparability_break: false,
    p_comparability_note: null, p_change_note: cfg.note ?? null,
  });
  assert(!cfgErr, `configurar ${code}: ${cfgErr?.message}`);
  return id;
}

async function measure(
  client: SupabaseClient, indicatorId: string, m: number,
  value: number | null, dataState = "reported", components: unknown = null
) {
  const p = month(m);
  return client.rpc("quality_record_measurement", {
    p_indicator_id: indicatorId, p_period_start: p.start, p_period_end: p.end,
    p_value: value, p_data_state: dataState, p_components: components, p_note: null,
  });
}

async function evaluationOf(client: SupabaseClient, indicatorId: string, m: number) {
  const p = month(m);
  const { data } = await client
    .from("quality_measurements")
    .select("evaluation, value, config_id, evaluation_explanation")
    .eq("indicator_id", indicatorId).eq("period_start", p.start).eq("is_current", true)
    .maybeSingle();
  return data as { evaluation: string; value: number; config_id: string; evaluation_explanation: string } | null;
}

async function main() {
  console.log("\nQUALITY-03 · objetivos e indicadores contra base real\n");

  const owner = await newUser("owner", "Coordinador de Calidad");
  const consultant = await newUser("consultor", "Consultor Q3");
  const outsider = await newUser("ajeno", "Ajeno Q3");

  const orgA = await createOrg(owner.client, `Q03 Alfa ${stamp}`);
  const orgB = await createOrg(outsider.client, `Q03 Beta ${stamp}`);

  // QUALITY-ONLY: PCR y Textiles deshabilitados a propósito.
  for (const org of [orgA, orgB]) {
    await admin.from("organization_modules")
      .update({ access_mode: "full", access_expires_at: null })
      .eq("organization_id", org).eq("module_code", "quality");
    await admin.from("organization_modules")
      .update({ enabled: false }).eq("organization_id", org).neq("module_code", "quality");
  }
  await admin.from("memberships").insert([
    { organization_id: orgA, user_id: consultant.id, role_code: "consultant", status: "active" },
  ]);

  // Cargo con titular, para que la responsabilidad apunte a un CARGO.
  const { data: pos } = await owner.client.from("quality_positions")
    .insert({ organization_id: orgA, name: "Coordinador de Calidad", code: "CC" })
    .select("id").single();
  const positionId = pos!.id as string;
  await owner.client.from("quality_position_assignments").insert({
    organization_id: orgA, position_id: positionId, profile_id: owner.id, assignment_type: "holder",
  });

  const { data: proc } = await owner.client.from("quality_processes")
    .insert({ organization_id: orgA, name: "Despachos", category_code: "core" })
    .select("id").single();
  const processId = proc!.id as string;

  // -------------------------------------------------------------------------
  console.log("A · Objetivos");
  // -------------------------------------------------------------------------
  let objectiveId = "";

  await check("A1. crear un objetivo con responsable por CARGO", async () => {
    const { data, error } = await owner.client.from("quality_objectives").insert({
      organization_id: orgA, code: "OBJ-01",
      name: "Mejorar el desempeño del sistema documental",
      admin_state: "active", period_start: `${YEAR}-01-01`, period_end: `${YEAR}-12-31`,
      owner_position_id: positionId,
    }).select("id").single();
    assert(!error && data, `crear objetivo: ${error?.message}`);
    objectiveId = data!.id as string;

    const { data: view } = await owner.client
      .from("v_quality_objective_performance")
      .select("owner_position_name, owner_holder_name, performance, performance_explanation")
      .eq("objective_id", objectiveId).maybeSingle();
    assert(view?.owner_position_name === "Coordinador de Calidad", "el cargo no se resolvió");
    // MDR-33: la persona sale de la asignación vigente, no está clavada.
    assert(view?.owner_holder_name === "Coordinador de Calidad", `titular: ${view?.owner_holder_name}`);
    assert(view?.performance === "no_indicators", `sin indicadores: ${view?.performance}`);
  });

  await check("A2. el mismo objetivo aplica a VARIOS procesos, sin duplicarse", async () => {
    const { data: proc2 } = await owner.client.from("quality_processes")
      .insert({ organization_id: orgA, name: "Producción", category_code: "core" })
      .select("id").single();
    const { error } = await owner.client.from("quality_objective_processes").insert([
      { organization_id: orgA, objective_id: objectiveId, process_id: processId },
      { organization_id: orgA, objective_id: objectiveId, process_id: proc2!.id as string },
    ]);
    assert(!error, `relacionar procesos: ${error?.message}`);
    const { data } = await owner.client
      .from("v_quality_objective_performance")
      .select("process_count, process_names").eq("objective_id", objectiveId).maybeSingle();
    assert(Number(data?.process_count) === 2, `${data?.process_count} procesos`);
    // Y no hay dos objetivos: hay uno con dos procesos.
    const { count } = await owner.client.from("quality_objectives")
      .select("id", { count: "exact", head: true }).eq("organization_id", orgA);
    assert(count === 1, `${count} objetivos`);
  });

  await check("A3. un consultor NO define objetivos", async () => {
    const { error } = await consultant.client.from("quality_objectives").insert({
      organization_id: orgA, name: "Objetivo colado", admin_state: "active",
      period_start: `${YEAR}-01-01`, period_end: `${YEAR}-12-31`,
    });
    assert(error !== null, "un consultor creó un objetivo");
  });

  await check("A4. un objetivo cerrado no se reabre editándolo", async () => {
    const { data } = await owner.client.from("quality_objectives").insert({
      organization_id: orgA, name: `Objetivo a cerrar ${stamp}`, admin_state: "active",
      period_start: `${YEAR}-01-01`, period_end: `${YEAR}-12-31`,
    }).select("id").single();
    const id = data!.id as string;
    await owner.client.from("quality_objectives").update({ admin_state: "closed" }).eq("id", id);
    const { error } = await owner.client
      .from("quality_objectives").update({ admin_state: "active" }).eq("id", id);
    assert(error !== null, "se reabrió un objetivo cerrado");
    assert(/no vuelve a abrirse/i.test(error!.message), error!.message);
  });

  // -------------------------------------------------------------------------
  console.log("\nB · Indicadores y direcciones");
  // -------------------------------------------------------------------------

  const manualId = await makeIndicator(
    owner.client, orgA, "IND-M", "Cumplimiento de entregas",
    { target: 90, warning: 85 }, positionId
  );
  const lowerId = await makeIndicator(
    owner.client, orgA, "IND-R", "Reclamos de cliente",
    { unit: "count", direction: "lower_is_better", target: 3, warning: 5 }
  );
  const rangeId = await makeIndicator(
    owner.client, orgA, "IND-T", "Temperatura de cámara",
    { unit: "celsius", direction: "within_range", target: null,
      targetMin: 18, targetMax: 24, warningMin: 16, warningMax: 26 }
  );
  const noTargetId = await makeIndicator(
    owner.client, orgA, "IND-S", "Observatorio", { unit: "count", target: null }
  );
  const calcId = await makeIndicator(
    owner.client, orgA, "IND-C", "Entregas conformes",
    { target: 95, sourceKind: "calculated",
      calc: { operation: "ratio_percent",
              operands: [{ key: "conformes", label: "Conformes" }, { key: "totales", label: "Totales" }] } }
  );

  await check("B1. mayor es mejor: cumple, atención, no cumple", async () => {
    await measure(owner.client, manualId, 1, 92);
    await measure(owner.client, manualId, 2, 87);
    await measure(owner.client, manualId, 3, 80);
    assert((await evaluationOf(owner.client, manualId, 1))?.evaluation === "complies", "enero");
    assert((await evaluationOf(owner.client, manualId, 2))?.evaluation === "attention", "febrero");
    assert((await evaluationOf(owner.client, manualId, 3))?.evaluation === "not_met", "marzo");
  });

  await check("B2. menor es mejor: la dirección cambia el veredicto", async () => {
    await measure(owner.client, lowerId, 1, 2);
    await measure(owner.client, lowerId, 2, 4);
    await measure(owner.client, lowerId, 3, 9);
    assert((await evaluationOf(owner.client, lowerId, 1))?.evaluation === "complies", "2 reclamos");
    assert((await evaluationOf(owner.client, lowerId, 2))?.evaluation === "attention", "4 reclamos");
    assert((await evaluationOf(owner.client, lowerId, 3))?.evaluation === "not_met", "9 reclamos");
  });

  await check("B3. rango: dentro, margen, fuera", async () => {
    await measure(owner.client, rangeId, 1, 21);
    await measure(owner.client, rangeId, 2, 25);
    await measure(owner.client, rangeId, 3, 30);
    assert((await evaluationOf(owner.client, rangeId, 1))?.evaluation === "complies", "21 °C");
    assert((await evaluationOf(owner.client, rangeId, 2))?.evaluation === "attention", "25 °C");
    assert((await evaluationOf(owner.client, rangeId, 3))?.evaluation === "not_met", "30 °C");
  });

  await check("B4. sin meta no se evalúa, y no es «no cumple»", async () => {
    await measure(owner.client, noTargetId, 1, 42);
    const m = await evaluationOf(owner.client, noTargetId, 1);
    assert(m?.evaluation === "no_target", `${m?.evaluation}`);
    assert(/no tiene meta/i.test(m!.evaluation_explanation), m!.evaluation_explanation);
  });

  await check("B5. calculado: el usuario da los componentes, el sistema el resultado", async () => {
    const { error } = await measure(owner.client, calcId, 1, null, "reported",
      { conformes: 480, totales: 500 });
    assert(!error, `calcular: ${error?.message}`);
    const m = await evaluationOf(owner.client, calcId, 1);
    assert(Number(m?.value) === 96, `${m?.value}`);
    assert(m?.evaluation === "complies", `${m?.evaluation}`);
  });

  await check("B6. dividir entre cero se niega con un mensaje claro", async () => {
    const { error } = await measure(owner.client, calcId, 2, null, "reported",
      { conformes: 5, totales: 0 });
    assert(error !== null, "se dividió entre cero");
    assert(/entre cero/i.test(error!.message), error!.message);
  });

  await check("B7. una meta de rango mal declarada no se guarda", async () => {
    const { data } = await owner.client.from("quality_indicators")
      .insert({ organization_id: orgA, code: `IND-BAD-${stamp}`, name: "Rango a medias", admin_state: "active" })
      .select("id").single();
    const { error } = await owner.client.rpc("quality_publish_indicator_config", {
      p_indicator_id: data!.id, p_effective_from: `${YEAR}-01-01`, p_unit_code: "celsius",
      p_direction: "within_range", p_frequency: "monthly",
      p_target_value: null, p_target_min: 18, p_target_max: null,
      p_warning_value: null, p_warning_min: null, p_warning_max: null,
      p_source_kind: "manual", p_source_key: null, p_calc_definition: null,
      p_formula_text: null, p_unit_label: null, p_source_note: null,
      p_consolidation: "none", p_comparability_break: false,
      p_comparability_note: null, p_change_note: null,
    });
    assert(error !== null, "se guardó un rango con un solo extremo");
  });

  // -------------------------------------------------------------------------
  console.log("\nC · Mediciones");
  // -------------------------------------------------------------------------

  await check("C1. CERO no es SIN DATO ni NO APLICA", async () => {
    await measure(owner.client, manualId, 4, 0);
    await measure(owner.client, manualId, 5, null, "no_data");
    await measure(owner.client, manualId, 6, null, "not_applicable");
    const { data } = await owner.client.from("quality_measurements")
      .select("period_label, value, data_state, evaluation")
      .eq("indicator_id", manualId).in("period_start", [month(4).start, month(5).start, month(6).start])
      .eq("is_current", true).order("period_start");
    const rows = (data ?? []) as { value: number | null; data_state: string; evaluation: string }[];
    assert(rows.length === 3, `${rows.length} filas`);
    assert(rows[0].value === 0 && rows[0].data_state === "reported" && rows[0].evaluation === "not_met",
      "un cero medido debe evaluarse");
    assert(rows[1].value === null && rows[1].data_state === "no_data" && rows[1].evaluation === "no_data",
      "un sin dato no se evalúa");
    assert(rows[2].data_state === "not_applicable", "un no aplica se guardó como otra cosa");
  });

  await check("C2. un valor con estado «sin dato» es imposible", async () => {
    const p = month(7);
    const { error } = await owner.client.rpc("quality_record_measurement", {
      p_indicator_id: manualId, p_period_start: p.start, p_period_end: p.end,
      p_value: 50, p_data_state: "no_data", p_components: null, p_note: null,
    });
    // La RPC ignora el valor cuando el estado no es «reported»; lo que importa
    // es que NO quede un número guardado como si no hubiera dato.
    assert(!error, `${error?.message}`);
    const m = await evaluationOf(owner.client, manualId, 7);
    assert(m?.value === null, `quedó un valor ${m?.value} con estado sin dato`);
  });

  await check("C3. el periodo debe ser uno CANÓNICO de la periodicidad", async () => {
    const { error } = await owner.client.rpc("quality_record_measurement", {
      p_indicator_id: manualId, p_period_start: `${YEAR}-08-05`, p_period_end: `${YEAR}-08-20`,
      p_value: 90, p_data_state: "reported", p_components: null, p_note: null,
    });
    assert(error !== null, "se aceptó un periodo arbitrario");
    assert(/periodicidad/i.test(error!.message), error!.message);
  });

  await check("C4. no se registra dos veces el mismo periodo", async () => {
    const { error } = await measure(owner.client, manualId, 1, 99);
    assert(error !== null, "se duplicó la medición de enero");
    assert(/ya hay una medición/i.test(error!.message), error!.message);
  });

  await check("C5. corregir conserva el valor ORIGINAL (OI-09, OI-28)", async () => {
    const before = await evaluationOf(owner.client, manualId, 4);
    const { data: mid } = await owner.client.from("quality_measurements")
      .select("id").eq("indicator_id", manualId).eq("period_start", month(4).start)
      .eq("is_current", true).maybeSingle();
    const { error } = await owner.client.rpc("quality_correct_measurement", {
      p_measurement_id: mid!.id, p_value: 88, p_data_state: "reported",
      p_reason: "Se cargó el dato de otra línea", p_components: null,
    });
    assert(!error, `corregir: ${error?.message}`);

    const { data: all } = await owner.client.from("quality_measurements")
      .select("value, is_current, correction_reason, superseded_by_measurement_id")
      .eq("indicator_id", manualId).eq("period_start", month(4).start).order("created_at");
    const rows = (all ?? []) as { value: number; is_current: boolean; correction_reason: string | null }[];
    assert(rows.length === 2, `${rows.length} filas para el periodo corregido`);
    assert(Number(rows[0].value) === Number(before!.value) && !rows[0].is_current,
      "el valor original desapareció");
    assert(Number(rows[1].value) === 88 && rows[1].is_current, "la corrección no quedó vigente");
    assert(rows[1].correction_reason === "Se cargó el dato de otra línea", "sin motivo");
  });

  await check("C6. corregir SIN motivo es imposible", async () => {
    const { data: mid } = await owner.client.from("quality_measurements")
      .select("id").eq("indicator_id", manualId).eq("period_start", month(2).start)
      .eq("is_current", true).maybeSingle();
    const { error } = await owner.client.rpc("quality_correct_measurement", {
      p_measurement_id: mid!.id, p_value: 91, p_data_state: "reported",
      p_reason: "   ", p_components: null,
    });
    assert(error !== null, "se corrigió sin motivo");
    assert(/motivo/i.test(error!.message), error!.message);
  });

  await check("C7. un consultor SÍ mide, pero no configura", async () => {
    const { error: ok } = await measure(consultant.client, lowerId, 4, 1);
    assert(!ok, `un consultor no pudo medir: ${ok?.message}`);
    const { error: denied } = await consultant.client.rpc("quality_publish_indicator_config", {
      p_indicator_id: lowerId, p_effective_from: `${YEAR}-06-01`, p_unit_code: "count",
      p_direction: "lower_is_better", p_frequency: "monthly", p_target_value: 1,
      p_target_min: null, p_target_max: null, p_warning_value: null,
      p_warning_min: null, p_warning_max: null, p_source_kind: "manual",
      p_source_key: null, p_calc_definition: null, p_formula_text: null,
      p_unit_label: null, p_source_note: null, p_consolidation: "none",
      p_comparability_break: false, p_comparability_note: null, p_change_note: null,
    });
    assert(denied !== null, "un consultor cambió la meta");
  });

  // -------------------------------------------------------------------------
  console.log("\nD · La historia no se reescribe (§55, OI-07)");
  // -------------------------------------------------------------------------

  await check("D1. cambiar la meta hoy NO cambia el veredicto de enero", async () => {
    const before = await evaluationOf(owner.client, manualId, 1);
    assert(before?.evaluation === "complies", `enero antes: ${before?.evaluation}`);

    const { error } = await owner.client.rpc("quality_publish_indicator_config", {
      p_indicator_id: manualId, p_effective_from: `${YEAR}-07-01`, p_unit_code: "percent",
      p_direction: "higher_is_better", p_frequency: "monthly", p_target_value: 95,
      p_target_min: null, p_target_max: null, p_warning_value: 90,
      p_warning_min: null, p_warning_max: null, p_source_kind: "manual",
      p_source_key: null, p_calc_definition: null, p_formula_text: null,
      p_unit_label: null, p_source_note: null, p_consolidation: "none",
      p_comparability_break: false, p_comparability_note: null,
      p_change_note: "La dirección eleva la meta",
    });
    assert(!error, `publicar la meta nueva: ${error?.message}`);

    const after = await evaluationOf(owner.client, manualId, 1);
    assert(after?.evaluation === "complies", `enero después: ${after?.evaluation}`);
    assert(after?.config_id === before?.config_id, "enero cambió de configuración");

    const { data: cfg } = await owner.client.from("quality_indicator_configs")
      .select("target_value").eq("id", after!.config_id).maybeSingle();
    assert(Number(cfg?.target_value) === 90, `enero se evaluó contra ${cfg?.target_value}`);
  });

  await check("D2. el MISMO valor, en un periodo nuevo, se mide contra la meta nueva", async () => {
    await measure(owner.client, manualId, 8, 92);
    const m = await evaluationOf(owner.client, manualId, 8);
    assert(m?.evaluation === "attention", `agosto con 92 y meta 95: ${m?.evaluation}`);
    const { data: cfg } = await owner.client.from("quality_indicator_configs")
      .select("target_value").eq("id", m!.config_id).maybeSingle();
    assert(Number(cfg?.target_value) === 95, `agosto se evaluó contra ${cfg?.target_value}`);
  });

  await check("D3. una configuración ya sustituida es INMUTABLE", async () => {
    const { data: old } = await owner.client.from("quality_indicator_configs")
      .select("id").eq("indicator_id", manualId).not("effective_to", "is", null).maybeSingle();
    const { data, error } = await owner.client.from("quality_indicator_configs")
      .update({ target_value: 1 }).eq("id", old!.id).select("id");
    assert(error !== null || (data ?? []).length === 0, "se editó una configuración histórica");
  });

  await check("D4. no hay dos configuraciones vigentes a la vez", async () => {
    const { count } = await owner.client.from("quality_indicator_configs")
      .select("id", { count: "exact", head: true })
      .eq("indicator_id", manualId).is("effective_to", null);
    assert(count === 1, `${count} configuraciones vigentes`);
  });

  // -------------------------------------------------------------------------
  console.log("\nE · Fuentes automáticas");
  // -------------------------------------------------------------------------

  let nativeId = "";

  await check("E1. el catálogo es CERRADO: una clave inventada no se configura", async () => {
    const { data } = await owner.client.from("quality_indicators")
      .insert({ organization_id: orgA, code: `IND-X-${stamp}`, name: "Fuente inventada", admin_state: "active" })
      .select("id").single();
    const { error } = await owner.client.rpc("quality_publish_indicator_config", {
      p_indicator_id: data!.id, p_effective_from: `${YEAR}-01-01`, p_unit_code: "percent",
      p_direction: "higher_is_better", p_frequency: "monthly", p_target_value: 90,
      p_target_min: null, p_target_max: null, p_warning_value: null,
      p_warning_min: null, p_warning_max: null, p_source_kind: "native",
      p_source_key: "quality.robar_datos", p_calc_definition: null, p_formula_text: null,
      p_unit_label: null, p_source_note: null, p_consolidation: "none",
      p_comparability_break: false, p_comparability_note: null, p_change_note: null,
    });
    assert(error !== null, "se configuró una fuente inexistente");
    assert(/no existe en el catálogo/i.test(error!.message), error!.message);
  });

  await check("E2. un indicador AUTOMÁTICO se calcula desde datos reales de Quality", async () => {
    // Cuatro documentos de Quality; dos se aprueban y quedan vigentes.
    const ids: string[] = [];
    for (let i = 1; i <= 4; i += 1) {
      const { data } = await owner.client.from("trazadoc_documents").insert({
        organization_id: orgA, source_type: "custom", module_key: "quality",
        category_code: "procedure", title: `Doc Q3 ${i} ${stamp}`, revision_model: "controlled",
      }).select("id").single();
      ids.push(data!.id as string);
    }
    for (const id of ids.slice(0, 2)) {
      const { data: rev } = await owner.client.rpc("trazadoc_create_document_revision", {
        p_document_id: id, p_change_note: null,
      });
      await owner.client.rpc("trazadoc_submit_document_revision", {
        p_revision_id: rev, p_reviewers: [],
        p_approvers: [{ profile_id: owner.id, position_id: null, step_order: 1 }],
        p_route_mode: "sequential", p_effective_from: null, p_review_due_at: null, p_note: null,
      });
      await owner.client.rpc("trazadoc_record_document_decision", {
        p_revision_id: rev, p_decision: "approved", p_reason: null,
      });
    }

    nativeId = await makeIndicator(owner.client, orgA, "IND-A", "Cumplimiento documental",
      { target: 95, warning: 90, sourceKind: "native", sourceKey: "quality.documents_effective_ratio" },
      positionId);

    const p = month(1);
    const { data, error } = await owner.client.rpc("quality_run_indicator_calculation", {
      p_indicator_id: nativeId, p_period_start: p.start, p_period_end: p.end,
    });
    assert(!error && data, `calcular: ${error?.message}`);

    const m = await evaluationOf(owner.client, nativeId, 1);
    assert(Number(m?.value) === 50, `2 de 4 vigentes deberían dar 50 %, dio ${m?.value}`);
    assert(m?.evaluation === "not_met", `50 % con meta 95 %: ${m?.evaluation}`);
  });

  await check("E3. el linaje del cálculo queda registrado (OI-10)", async () => {
    const { data } = await owner.client.from("quality_measurements")
      .select("source_kind, source_key, source_detail, calculation_run_id")
      .eq("indicator_id", nativeId).eq("is_current", true).maybeSingle();
    assert(data?.source_kind === "native", `${data?.source_kind}`);
    assert(data?.source_key === "quality.documents_effective_ratio", `${data?.source_key}`);
    assert(data?.calculation_run_id !== null, "la medición no apunta a su ejecución");
    const detail = data?.source_detail as Record<string, unknown>;
    assert(Number(detail.total_active) === 4 && Number(detail.effective) === 2,
      `linaje: ${JSON.stringify(detail)}`);
    const { data: run } = await owner.client.from("quality_calculation_runs")
      .select("status, output_value, inputs").eq("id", data!.calculation_run_id as string).maybeSingle();
    assert(run?.status === "ok", `${run?.status}`);
  });

  await check("E4. escribir a mano el resultado de un automático es imposible", async () => {
    const { error } = await measure(owner.client, nativeId, 2, 100);
    assert(error !== null, "se escribió a mano el resultado de un indicador automático");
    assert(/se alimenta solo/i.test(error!.message), error!.message);
  });

  await check("E5. recalcular sin cambios NO ensucia el historial", async () => {
    const p = month(1);
    const before = await owner.client.from("quality_measurements")
      .select("id", { count: "exact", head: true }).eq("indicator_id", nativeId);
    await owner.client.rpc("quality_run_indicator_calculation", {
      p_indicator_id: nativeId, p_period_start: p.start, p_period_end: p.end,
    });
    const after = await owner.client.from("quality_measurements")
      .select("id", { count: "exact", head: true }).eq("indicator_id", nativeId);
    assert(before.count === after.count, `${before.count} → ${after.count} mediciones`);
    // Pero la ejecución sí queda registrada: se volvió a mirar.
    const { count: runs } = await owner.client.from("quality_calculation_runs")
      .select("id", { count: "exact", head: true }).eq("indicator_id", nativeId);
    assert((runs ?? 0) >= 2, `${runs} ejecuciones registradas`);
  });

  await check("E6. un cálculo NUNCA usa datos de otra empresa", async () => {
    // La empresa B crea seis documentos, todos vigentes. Si el catálogo se
    // colara, el resultado de A cambiaría.
    for (let i = 1; i <= 6; i += 1) {
      await outsider.client.from("trazadoc_documents").insert({
        organization_id: orgB, source_type: "custom", module_key: "quality",
        category_code: "procedure", title: `Doc B ${i} ${stamp}`, revision_model: "controlled",
      });
    }
    const p = month(3);
    await owner.client.rpc("quality_run_indicator_calculation", {
      p_indicator_id: nativeId, p_period_start: p.start, p_period_end: p.end,
    });
    const m = await evaluationOf(owner.client, nativeId, 3);
    const detail = (await owner.client.from("quality_measurements")
      .select("source_detail").eq("indicator_id", nativeId).eq("period_start", p.start)
      .eq("is_current", true).maybeSingle()).data?.source_detail as Record<string, unknown>;
    assert(Number(detail.total_active) === 4,
      `el cálculo de A contó ${detail.total_active} documentos: se coló otra empresa`);
    assert(Number(m?.value) === 50, `${m?.value}`);
  });

  await check("E7. segunda fuente: tiempo de aprobación documental", async () => {
    const leadId = await makeIndicator(owner.client, orgA, "IND-L", "Tiempo de aprobación",
      { unit: "days", direction: "lower_is_better", target: 5, warning: 10,
        sourceKind: "native", sourceKey: "quality.document_approval_lead_time_days" });
    const today = new Date();
    const p = {
      start: `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}-01`,
      end: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)).toISOString().slice(0, 10),
    };
    const { error } = await owner.client.rpc("quality_run_indicator_calculation", {
      p_indicator_id: leadId, p_period_start: p.start, p_period_end: p.end,
    });
    assert(!error, `calcular: ${error?.message}`);
    const { data } = await owner.client.from("quality_measurements")
      .select("value, evaluation, source_detail").eq("indicator_id", leadId)
      .eq("is_current", true).maybeSingle();
    assert(data !== null, "no se registró la medición");
    const detail = data!.source_detail as Record<string, unknown>;
    assert(detail.nature === "period", `naturaleza: ${detail.nature}`);
  });

  // -------------------------------------------------------------------------
  console.log("\nF · Desempeño del objetivo");
  // -------------------------------------------------------------------------

  await check("F1. el desempeño se DERIVA de los indicadores y se explica", async () => {
    await owner.client.from("quality_objective_indicators").insert([
      { organization_id: orgA, objective_id: objectiveId, indicator_id: manualId },
      { organization_id: orgA, objective_id: objectiveId, indicator_id: nativeId },
    ]);
    const { data } = await owner.client
      .from("v_quality_objective_performance")
      .select("performance, performance_explanation, indicator_count, indicators_not_met")
      .eq("objective_id", objectiveId).maybeSingle();
    assert(Number(data?.indicator_count) === 2, `${data?.indicator_count} indicadores`);
    assert(data?.performance === "not_met", `${data?.performance}`);
    assert(/peor indicador/i.test(data?.performance_explanation as string),
      data?.performance_explanation as string);
  });

  await check("F2. la regla «mayoría cumple» da un resultado distinto y lo explica", async () => {
    await owner.client.from("quality_objectives")
      .update({ evaluation_rule: "majority_comply" }).eq("id", objectiveId);
    const { data } = await owner.client
      .from("v_quality_objective_performance")
      .select("performance, performance_explanation").eq("objective_id", objectiveId).maybeSingle();
    // La vista lo dice con las palabras que usaría una persona —«más de la
    // mitad»—, no con el nombre técnico de la regla.
    assert(/más de la mitad/i.test(data?.performance_explanation as string),
      data?.performance_explanation as string);
    assert(/\d+ de \d+ cumplen/.test(data?.performance_explanation as string),
      `la explicación no dice el recuento: ${data?.performance_explanation}`);
    await owner.client.from("quality_objectives")
      .update({ evaluation_rule: "worst_indicator" }).eq("id", objectiveId);
  });

  await check("F3. nadie puede escribir el desempeño a mano", async () => {
    const { error } = await owner.client
      .from("v_quality_objective_performance")
      .update({ performance: "complies" }).eq("objective_id", objectiveId);
    assert(error !== null, "se pudo escribir sobre el desempeño derivado");
  });

  // -------------------------------------------------------------------------
  console.log("\nG · Medición pendiente, eventos y alertas");
  // -------------------------------------------------------------------------

  await check("G1. la medición pendiente se DERIVA, sin correr nada", async () => {
    const { data } = await owner.client
      .from("v_quality_indicator_status")
      .select("measurement_pending, due_period_label, next_measurement_due_on")
      .eq("indicator_id", lowerId).maybeSingle();
    assert(data?.measurement_pending === true, "el indicador debería tener medición pendiente");
    assert((data?.due_period_label as string).length > 0, "sin periodo pendiente identificado");
    assert(data?.next_measurement_due_on !== null, "no se sabe cuándo toca la próxima");
  });

  await check("G2. el barrido crea tarea y alerta para el RESPONSABLE del cargo", async () => {
    const { data, error } = await owner.client.rpc("quality_scan_pending_measurements", {
      p_organization_id: orgA,
    });
    assert(!error, `barrido: ${error?.message}`);
    assert(Number(data) > 0, `${data} pendientes`);
    const { data: tasks } = await owner.client.from("work_tasks")
      .select("task_type, assignee_profile_id, subject_id")
      .eq("organization_id", orgA).eq("task_type", "indicator_measurement_due");
    assert((tasks ?? []).length > 0, "no se creó ninguna tarea");
    const forOwner = (tasks ?? []).filter((t) => t.subject_id === manualId);
    assert(forOwner.every((t) => t.assignee_profile_id === owner.id),
      "la tarea del indicador con cargo no fue a su titular");
  });

  await check("G3. repetir el barrido no duplica (AT-07)", async () => {
    const before = await owner.client.from("work_tasks")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgA).eq("task_type", "indicator_measurement_due");
    await owner.client.rpc("quality_scan_pending_measurements", { p_organization_id: orgA });
    const after = await owner.client.from("work_tasks")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgA).eq("task_type", "indicator_measurement_due");
    assert(before.count === after.count, `${before.count} → ${after.count} tareas`);
  });

  await check("G4. fuera de meta produce EVENTO y alerta, nunca no conformidad (OI-13)", async () => {
    const { data: events } = await owner.client.from("work_events")
      .select("event_type, severity, summary, subject_period")
      .eq("organization_id", orgA).eq("event_type", "indicator.target_missed");
    assert((events ?? []).length > 0, "no se registró ningún evento de meta incumplida");
    assert((events ?? []).every((e) => e.severity === "warning"), "severidad");

    const { data: alerts } = await owner.client.from("work_alerts")
      .select("alert_type, recipient_profile_id")
      .eq("organization_id", orgA).eq("alert_type", "indicator_target_missed");
    assert((alerts ?? []).length > 0, "no se avisó a nadie");
    assert((alerts ?? []).some((a) => a.recipient_profile_id === owner.id),
      "la alerta no llegó al responsable");
  });

  await check("G5. los eventos son INMUTABLES (AT-03)", async () => {
    const { data: ev } = await owner.client.from("work_events")
      .select("id").eq("organization_id", orgA).limit(1).maybeSingle();
    const upd = await owner.client.from("work_events")
      .update({ summary: "reescrito" }).eq("id", ev!.id as string);
    assert(upd.error !== null, "se reescribió un evento");
    const del = await owner.client.from("work_events").delete().eq("id", ev!.id as string);
    assert(del.error !== null, "se borró un evento");
  });

  await check("G6. medir cierra la tarea de medición pendiente", async () => {
    const { data: task } = await owner.client.from("work_tasks")
      .select("id, subject_id, status").eq("organization_id", orgA)
      .eq("task_type", "indicator_measurement_due").eq("subject_id", lowerId)
      .eq("status", "open").maybeSingle();
    assert(task !== null, "no había tarea abierta para el indicador de reclamos");
    const { data: due } = await owner.client.from("v_quality_indicator_status")
      .select("due_period_start, due_period_end").eq("indicator_id", lowerId).maybeSingle();
    const { error } = await owner.client.rpc("quality_record_measurement", {
      p_indicator_id: lowerId, p_period_start: due!.due_period_start,
      p_period_end: due!.due_period_end, p_value: 1, p_data_state: "reported",
      p_components: null, p_note: null,
    });
    assert(!error, `medir: ${error?.message}`);
    const { data: after } = await owner.client.from("work_tasks")
      .select("status, resolution").eq("id", task!.id as string).maybeSingle();
    assert(after?.status === "done", `la tarea quedó en ${after?.status}`);
  });

  // -------------------------------------------------------------------------
  console.log("\nH · Cierre de ciclo");
  // -------------------------------------------------------------------------

  await check("H1. cerrar un periodo marca sus resultados como cerrados (OI-27)", async () => {
    const { error } = await owner.client.rpc("quality_close_period", {
      p_organization_id: orgA, p_label: `${YEAR} · primer semestre`,
      p_period_start: `${YEAR}-01-01`, p_period_end: `${YEAR}-06-30`,
      p_note: "Cierre semestral",
    });
    assert(!error, `cerrar: ${error?.message}`);
    const { data } = await owner.client.from("quality_measurements")
      .select("period_label, result_state").eq("indicator_id", manualId)
      .eq("is_current", true).order("period_start");
    const rows = (data ?? []) as { period_label: string; result_state: string }[];
    const enero = rows.find((r) => r.period_label === `${YEAR}-01`);
    const agosto = rows.find((r) => r.period_label === `${YEAR}-08`);
    assert(enero?.result_state === "closed", `enero: ${enero?.result_state}`);
    assert(agosto?.result_state === "preliminary", `agosto: ${agosto?.result_state}`);
  });

  await check("H2. dentro de un periodo cerrado no se mide ni se corrige", async () => {
    const { error: rec } = await measure(owner.client, noTargetId, 5, 10);
    assert(rec !== null, "se registró una medición en un periodo cerrado");
    assert(/cerrado/i.test(rec!.message), rec!.message);

    const { data: mid } = await owner.client.from("quality_measurements")
      .select("id").eq("indicator_id", manualId).eq("period_start", month(1).start)
      .eq("is_current", true).maybeSingle();
    const { error: corr } = await owner.client.rpc("quality_correct_measurement", {
      p_measurement_id: mid!.id, p_value: 10, p_data_state: "reported",
      p_reason: "intento", p_components: null,
    });
    assert(corr !== null, "se corrigió una medición cerrada");
  });

  await check("H3. no se puede cambiar la meta pisando un tramo cerrado (OI-12)", async () => {
    const { error } = await owner.client.rpc("quality_publish_indicator_config", {
      p_indicator_id: lowerId, p_effective_from: `${YEAR}-03-01`, p_unit_code: "count",
      p_direction: "lower_is_better", p_frequency: "monthly", p_target_value: 1,
      p_target_min: null, p_target_max: null, p_warning_value: null,
      p_warning_min: null, p_warning_max: null, p_source_kind: "manual",
      p_source_key: null, p_calc_definition: null, p_formula_text: null,
      p_unit_label: null, p_source_note: null, p_consolidation: "none",
      p_comparability_break: false, p_comparability_note: null, p_change_note: null,
    });
    assert(error !== null, "se cambió la meta dentro de un periodo cerrado");
    assert(/cerrado/i.test(error!.message), error!.message);
  });

  await check("H4. reabrir exige motivo y solo puede el administrador", async () => {
    const { data: closure } = await owner.client.from("quality_period_closures")
      .select("id").eq("organization_id", orgA).is("reopened_at", null).maybeSingle();

    const { error: noReason } = await owner.client.rpc("quality_reopen_period", {
      p_closure_id: closure!.id, p_reason: "  ",
    });
    assert(noReason !== null, "se reabrió sin motivo");

    const { error: byConsultant } = await consultant.client.rpc("quality_reopen_period", {
      p_closure_id: closure!.id, p_reason: "porque sí",
    });
    assert(byConsultant !== null, "un consultor reabrió un periodo");

    const { error } = await owner.client.rpc("quality_reopen_period", {
      p_closure_id: closure!.id, p_reason: "Error detectado en la fuente de enero",
    });
    assert(!error, `reabrir: ${error?.message}`);
    const { data: after } = await owner.client.from("quality_measurements")
      .select("result_state").eq("indicator_id", manualId).eq("period_start", month(1).start)
      .eq("is_current", true).maybeSingle();
    assert(after?.result_state === "preliminary", `tras reabrir: ${after?.result_state}`);
  });

  // -------------------------------------------------------------------------
  console.log("\nX · Ataques y aislamiento");
  // -------------------------------------------------------------------------

  await check("X1. no se puede insertar una medición a mano", async () => {
    const { data: cfg } = await owner.client.from("quality_indicator_configs")
      .select("id").eq("indicator_id", manualId).is("effective_to", null).maybeSingle();
    const { error } = await owner.client.from("quality_measurements").insert({
      organization_id: orgA, indicator_id: manualId, config_id: cfg!.id,
      period_label: `${YEAR}-12`, period_start: `${YEAR}-12-01`, period_end: `${YEAR}-12-31`,
      value: 100, data_state: "reported", source_kind: "native", evaluation: "complies",
    });
    assert(error !== null, "se fabricó una medición");
  });

  await check("X2. no se puede alterar una evaluación calculada", async () => {
    const { data: mid } = await owner.client.from("quality_measurements")
      .select("id").eq("indicator_id", manualId).eq("is_current", true).limit(1).maybeSingle();
    const { error } = await owner.client.from("quality_measurements")
      .update({ evaluation: "complies", value: 100 }).eq("id", mid!.id as string);
    assert(error !== null, "se alteró una evaluación");
  });

  await check("X3. no se puede fabricar una ejecución de cálculo", async () => {
    const { data: cfg } = await owner.client.from("quality_indicator_configs")
      .select("id").eq("indicator_id", nativeId).is("effective_to", null).maybeSingle();
    const { error } = await owner.client.from("quality_calculation_runs").insert({
      organization_id: orgA, indicator_id: nativeId, config_id: cfg!.id,
      period_start: `${YEAR}-12-01`, period_end: `${YEAR}-12-31`,
      source_kind: "native", status: "ok", output_value: 100,
    });
    assert(error !== null, "se fabricó la procedencia de un número");
  });

  await check("X4. no se puede fabricar un cierre de periodo", async () => {
    const { error } = await owner.client.from("quality_period_closures").insert({
      organization_id: orgA, label: "falso", period_start: `${YEAR}-01-01`, period_end: `${YEAR}-12-31`,
    });
    assert(error !== null, "se fabricó un cierre");
  });

  await check("X5. una empresa ajena no ve NADA de la otra", async () => {
    for (const table of [
      "quality_objectives", "quality_indicators", "quality_indicator_configs",
      "quality_measurements", "quality_calculation_runs", "quality_period_closures",
      "work_events", "v_quality_indicator_status", "v_quality_objective_performance",
    ]) {
      const { data } = await outsider.client.from(table).select("*").eq("organization_id", orgA);
      assert((data ?? []).length === 0, `un ajeno vio ${data?.length} filas de ${table}`);
    }
  });

  await check("X6. un ajeno no puede medir, calcular ni cerrar en otra empresa", async () => {
    const p = month(11);
    const r1 = await outsider.client.rpc("quality_record_measurement", {
      p_indicator_id: manualId, p_period_start: p.start, p_period_end: p.end,
      p_value: 1, p_data_state: "reported", p_components: null, p_note: null,
    });
    assert(r1.error !== null, "un ajeno midió en otra empresa");
    const r2 = await outsider.client.rpc("quality_run_indicator_calculation", {
      p_indicator_id: nativeId, p_period_start: p.start, p_period_end: p.end,
    });
    assert(r2.error !== null, "un ajeno calculó en otra empresa");
    const r3 = await outsider.client.rpc("quality_close_period", {
      p_organization_id: orgA, p_label: "robo", p_period_start: `${YEAR}-01-01`,
      p_period_end: `${YEAR}-12-31`, p_note: null,
    });
    assert(r3.error !== null, "un ajeno cerró el periodo de otra empresa");
    const r4 = await outsider.client.rpc("quality_scan_pending_measurements", {
      p_organization_id: orgA,
    });
    assert(r4.error !== null, "un ajeno barrió las mediciones de otra empresa");
  });

  await check("X7. un indicador no puede apuntar a un proceso de otra empresa", async () => {
    const { error } = await owner.client.from("quality_indicators").insert({
      organization_id: orgA, name: `Cruzado ${stamp}`, admin_state: "active",
      scope_type: "process", scope_process_id: processId,
    }).select("id").single();
    assert(!error, `el caso legítimo falló: ${error?.message}`);

    const { data: procB } = await outsider.client.from("quality_processes")
      .insert({ organization_id: orgB, name: "Proceso B", category_code: "core" })
      .select("id").single();
    const { error: cross } = await owner.client.from("quality_indicators").insert({
      organization_id: orgA, name: `Cruzado malo ${stamp}`, admin_state: "active",
      scope_type: "process", scope_process_id: procB!.id as string,
    });
    assert(cross !== null, "un indicador apuntó a un proceso de otra empresa");
  });

  // -------------------------------------------------------------------------
  console.log("\nZ · Sin regresión en QUALITY-01/02");
  // -------------------------------------------------------------------------

  await check("Z1. el control documental de QUALITY-02 sigue intacto", async () => {
    const { error: a } = await owner.client
      .from("v_trazadoc_document_control").select("document_id").eq("organization_id", orgA).limit(1);
    assert(!a, `v_trazadoc_document_control se rompió: ${a?.message}`);
    const { data: docs } = await owner.client
      .from("v_trazadoc_document_control").select("lifecycle_state, current_revision_number")
      .eq("organization_id", orgA).eq("module_key", "quality");
    assert((docs ?? []).length >= 4, `${docs?.length} documentos`);
    // Dos de los cuatro nunca abrieron revisión: su número es NULL, no cero.
    // Los que sí la abrieron deben seguir en la 1: ni el motor de indicadores
    // ni sus cálculos pueden haberla movido.
    const withRevision = (docs ?? []).filter((d) => d.current_revision_number !== null);
    assert(withRevision.length === 2, `${withRevision.length} documentos con revisión`);
    assert(withRevision.every((d) => Number(d.current_revision_number) === 1),
      "alguna revisión documental se movió sola");
  });

  await check("Z2. la bandeja de QUALITY-02 sigue funcionando y ahora es compartida", async () => {
    const { data } = await owner.client.from("work_tasks")
      .select("source_domain").eq("organization_id", orgA);
    const domains = new Set((data ?? []).map((t) => t.source_domain));
    assert(domains.has("indicator"), "no hay tareas del dominio de indicadores");
    // Y las tablas siguen siendo UNA, no dos.
    const { error } = await owner.client.from("work_tasks").select("id").limit(1);
    assert(!error, `work_tasks se rompió: ${error?.message}`);
  });

  await check("Z3. las vistas históricas de TrazaDocs responden", async () => {
    for (const view of ["v_trazadoc_document_summary", "v_trazadoc_document_master"]) {
      const { error } = await owner.client.from(view).select("document_id")
        .eq("organization_id", orgA).limit(1);
      assert(!error, `${view} se rompió: ${error?.message}`);
    }
  });

  console.log(`\nQUALITY-03 · base real: ${passed} correctas, ${failed} fallidas\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
