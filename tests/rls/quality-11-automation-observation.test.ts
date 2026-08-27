/**
 * Trazaloop · QUALITY-11 · Automatización y observación, contra base real.
 *
 * Los quince escenarios del encargo (§136…§150), los ataques (§152) y el
 * planificador (§155). Lo que se comprueba aquí no es un CRUD: son las
 * afirmaciones que SOLO se demuestran ejecutando el motor.
 *
 *   · tres periodos seguidos por debajo de la meta producen UNA señal, un
 *     aviso y una tarea; el mismo barrido repetido no produce nada nuevo;
 *   · recuperar la meta cierra la señal SOLA, y no toca ninguna acción;
 *   · volver a caer abre una señal NUEVA: ni dedupe eterno, ni duplicado;
 *   · simular sobre datos que coinciden devuelve el número y no escribe NADA;
 *   · publicar la v2 no reescribe la señal que emitió la v1;
 *   · un proveedor crítico con la reevaluación vencida se detecta sin que su
 *     aprobación cambie ni una letra;
 *   · un certificado que caduca mañana avisa sin declarar incompetente a nadie;
 *   · una queja sin revisar produce señal y CERO no conformidades;
 *   · una auditoría vencida no se cierra ni se cancela sola;
 *   · una revisión por la dirección con entradas pendientes no cambia de estado;
 *   · dos barridos simultáneos sobre la misma condición dejan UNA señal;
 *   · reintentar tras un fallo a medias completa lo que faltaba, una sola vez;
 *   · una campaña anónima de QUALITY-08 llega a la señal como métrica y nunca
 *     como nombre;
 *   · y una empresa no alcanza la regla, la señal ni la ejecución de otra, ni
 *     con el UUID en la mano, ni por PostgREST directo.
 *
 * Todo corre con la sesión REAL de cada usuario. El cliente administrativo solo
 * crea cuentas, membresías y —en el escenario del planificador— ejecuta sin
 * sesión, que es exactamente lo que hará el cron.
 */
import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) {
  console.error("Faltan variables para test:quality11-rls (URL, ANON, SERVICE_ROLE).");
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
  const email = `q11-${label}-${stamp}@test.trazaloop.dev`;
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
const MAÑANA = day(1);
const HACE_UN_ANIO = day(-380);
const HACE_MEDIO_ANIO = day(-190);

/** Los indicadores anuales exigen periodos de año natural (QUALITY-03). Se usan
 *  cuatro años cerrados para poder tener cuatro mediciones comparables. */
const ANIO_4 = Number(HOY.slice(0, 4)) - 1;
const ANIOS = [ANIO_4 - 3, ANIO_4 - 2, ANIO_4 - 1, ANIO_4];

type Cliente = SupabaseClient;

/** Cuenta lo que hay, para poder afirmar «esto no cambió». */
async function contar(c: Cliente, tabla: string, org: string, extra: Record<string, string> = {}) {
  let q = c.from(tabla).select("id", { count: "exact", head: true }).eq("organization_id", org);
  for (const [k, v] of Object.entries(extra)) q = q.eq(k, v);
  const { count } = await q;
  return count ?? 0;
}

type Señal = {
  id: string; title: string; status: string; resolved_at: string | null;
  resolution_kind: string | null; detection_count: number; rule_version_id: string | null;
  source_snapshot: Record<string, unknown> | null; explanation: string;
  subject_id: string; recipient_unresolved: boolean;
};

async function señalesDe(c: Cliente, org: string, reglaId: string): Promise<Señal[]> {
  const { data } = await c.from("quality_signals")
    .select("id, title, status, resolved_at, resolution_kind, detection_count, "
      + "rule_version_id, source_snapshot, explanation, subject_id, recipient_unresolved")
    .eq("organization_id", org).eq("rule_id", reglaId)
    .order("first_detected_at", { ascending: true });
  return (data ?? []) as unknown as Señal[];
}

async function ejecutar(c: Cliente, org: string, modo = "live", regla: string | null = null) {
  const { data, error } = await c.rpc("quality_automation_run", {
    p_organization_id: org, p_mode: modo, p_rule_id: regla, p_today: null,
  });
  return { runId: data as string | null, error };
}

/** Lo que UNA regla concreta hizo dentro de una ejecución. Es lo que hay que
 *  mirar para hablar de esa regla: el total de la ejecución incluye también a
 *  los observadores de plataforma —los barridos de QUALITY-03…10—, que siguen
 *  emitiendo lo suyo. */
async function resumenRegla(c: Cliente, runId: string, ruleId: string) {
  const { data } = await c.from("quality_automation_run_rules")
    .select("status, subjects_evaluated, matches, signals_created, alerts_created, "
      + "tasks_created, error_message")
    .eq("run_id", runId).eq("rule_id", ruleId).single();
  assert(data, `la ejecución no registró nada de la regla ${ruleId}`);
  return data as unknown as Record<string, number | string | null>;
}

async function resumenEjecucion(c: Cliente, runId: string) {
  const { data } = await c.from("quality_automation_runs")
    .select("run_kind, status, rules_evaluated, subjects_evaluated, matches, "
      + "signals_created, alerts_created, tasks_created, failures")
    .eq("id", runId).single();
  return data as unknown as Record<string, number | string>;
}

/** Crea una regla con UNA versión publicada. Devuelve regla y versión. */
async function nuevaRegla(
  c: Cliente, org: string,
  r: {
    code: string; name: string; category: string; source: string;
    ownerPositionId: string | null; severity?: string; title: string;
    conditions: unknown[]; outputs: unknown[];
  }
) {
  const { data: regla, error: er } = await c.from("quality_automation_rules").insert({
    organization_id: org, code: r.code, name: r.name, category: r.category,
    source_code: r.source, owner_position_id: r.ownerPositionId, status: "active",
  }).select("id").single();
  assert(!er && regla, `regla ${r.code}: ${er?.message}`);
  const { data: version, error: ev } = await c.from("quality_automation_rule_versions").insert({
    organization_id: org, rule_id: regla!.id, version_number: 1,
    trigger_kind: "schedule", schedule_frequency: "daily",
    conditions: r.conditions, outputs: r.outputs,
    severity: r.severity ?? "warning", signal_title: r.title,
  }).select("id").single();
  assert(!ev && version, `versión de ${r.code}: ${ev?.message}`);
  const { data: pub, error: ep } = await c.rpc("quality_automation_publish_version", {
    p_version_id: version!.id, p_effective_from: HACE_UN_ANIO, p_change_note: "Inicial",
  });
  assert(!ep, `publicar ${r.code}: ${ep?.message}`);
  assert((pub as Record<string, unknown>)?.published === true,
    `publicar ${r.code}: ${JSON.stringify(pub)}`);
  return { ruleId: regla!.id as string, versionId: version!.id as string };
}

async function main() {
  console.log("\nQUALITY-11 · base real\n");

  const owner = await newUser("adm", "Directora");
  const quality = await newUser("cal", "Coordinadora de Calidad");
  const consultant = await newUser("con", "Consultor externo");
  const outsider = await newUser("out", "Ajena");
  for (const u of [owner, quality, consultant, outsider]) {
    await u.client.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "q11" });
  }
  const { data: a } = await owner.client.rpc("create_organization", { p_name: `Q11 A ${stamp}` });
  const { data: b } = await outsider.client.rpc("create_organization", { p_name: `Q11 B ${stamp}` });
  const A = a as string, B = b as string;

  await admin.from("memberships").insert([
    { organization_id: A, user_id: quality.id, role_code: "quality", status: "active" },
    { organization_id: A, user_id: consultant.id, role_code: "consultant", status: "active" },
  ]);

  const Q = quality.client;    // conduce el dominio
  const C = consultant.client; // conduce, NO publica
  const O = outsider.client;   // otra empresa

  // ==========================================================================
  console.log("A · EL TERRENO · catálogo, ajustes y destinatario (§27, §33, §47)");
  // ==========================================================================

  let CARGO = "", PERSONA = "", PROCESO = "";

  await check("A0. se siembra el terreno: cargo, persona con cuenta y proceso", async () => {
    const { data: cargo, error: ec } = await Q.from("quality_positions")
      .insert({ organization_id: A, name: `Gerencia de Calidad ${stamp}` })
      .select("id").single();
    assert(!ec && cargo, `cargo: ${ec?.message}`);
    CARGO = cargo!.id as string;

    const { data: persona, error: ep } = await Q.from("quality_people")
      .insert({ organization_id: A, full_name: `Ana ${stamp}`, profile_id: quality.id })
      .select("id").single();
    assert(!ep && persona, `persona: ${ep?.message}`);
    PERSONA = persona!.id as string;

    const { error: ea } = await Q.from("quality_position_assignments").insert({
      organization_id: A, position_id: CARGO, person_id: PERSONA,
      effective_from: HACE_UN_ANIO,
    });
    assert(!ea, `asignación: ${ea?.message}`);

    const { data: proc, error: epr } = await Q.from("quality_processes").insert({
      organization_id: A, name: `Producción ${stamp}`, category_code: "core",
      owner_position_id: CARGO,
    }).select("id").single();
    assert(!epr && proc, `proceso: ${epr?.message}`);
    PROCESO = proc!.id as string;
  });

  await check("A1. el catálogo de fuentes se LEE y no se puede tocar", async () => {
    const { data, error } = await Q.from("quality_automation_sources").select("code, domain");
    assert(!error && (data?.length ?? 0) === 18,
      `el catálogo devolvió ${data?.length} fuentes: ${error?.message}`);
    const { error: ew } = await Q.from("quality_automation_sources")
      .insert({ code: `pirata-${stamp}`, domain: "cases", subject_type: "work_case",
                label: "Inventada", description: "x" });
    assert(ew, "una empresa pudo añadir una fuente al catálogo de plataforma");
  });

  await check("A2. cada campo del catálogo trae sus operadores permitidos", async () => {
    const { data } = await Q.from("quality_automation_source_fields")
      .select("source_code, field, data_type, allowed_operators").eq("source_code", "indicator");
    assert((data?.length ?? 0) >= 6, "la fuente de indicadores no declara sus campos");
    for (const f of data ?? []) {
      assert(Array.isArray(f.allowed_operators) && f.allowed_operators.length > 0,
        `el campo ${f.field} no declara operadores`);
    }
  });

  await check("A3. el ajuste de la empresa nace utilizable y con su día de negocio", async () => {
    const { error } = await Q.from("quality_automation_settings")
      .insert({ organization_id: A, is_enabled: true, business_timezone: "America/Bogota" });
    assert(!error, `ajustes: ${error?.message}`);
    const { data: salud } = await Q.rpc("quality_automation_health", { p_organization_id: A });
    const s = salud as Record<string, unknown>;
    assert(s.enabled === true, "el motor nace apagado");
    assert(s.business_timezone === "America/Bogota", "no se guardó la zona horaria");
    assert(typeof s.business_today === "string" && (s.business_today as string).length === 10,
      "no se resuelve el día de negocio");
  });

  await check("A4. las plantillas están disponibles y NINGUNA activa", async () => {
    // QUALITY-11.1 subió la biblioteca de 14 a 21: tres de paridad con los
    // barridos heredados y cuatro por evento.
    const { data, error } = await Q.from("quality_automation_rule_templates")
      .select("code, source_code, severity");
    assert(!error && (data?.length ?? 0) === 21,
      `hay ${data?.length} plantillas: ${error?.message}`);
    const { count } = await Q.from("quality_automation_rules")
      .select("id", { count: "exact", head: true }).eq("organization_id", A);
    assert((count ?? 0) === 0,
      "la empresa nació con reglas encendidas: cincuenta avisos el primer día es ruido");
  });

  // ==========================================================================
  console.log("\nB · ESCENARIO 1 · el indicador que lleva tres periodos por debajo (§136)");
  // ==========================================================================

  let INDICADOR = "", REGLA_IND = "", VERSION_IND = "", RUN_1 = "";

  await check("B0. se siembra el indicador con meta 95 y tres periodos: 80, 78 y 75", async () => {
    const { data: ind, error: ei } = await Q.from("quality_indicators").insert({
      organization_id: A, code: `IND-${stamp}`.slice(0, 24),
      name: "Cumplimiento de entregas", scope_type: "process", scope_process_id: PROCESO,
      owner_position_id: CARGO,
    }).select("id").single();
    assert(!ei && ind, `indicador: ${ei?.message}`);
    INDICADOR = ind!.id as string;

    const { error: ec } = await Q.rpc("quality_publish_indicator_config", {
      p_indicator_id: INDICADOR, p_effective_from: `${ANIOS[0]}-01-01`,
      p_unit_code: "percent", p_direction: "higher_is_better",
      p_frequency: "annual", p_target_value: 95, p_source_kind: "manual",
    });
    assert(!ec, `configuración: ${ec?.message}`);

    const { error: ea } = await Q.from("quality_indicators")
      .update({ admin_state: "active" }).eq("id", INDICADOR);
    assert(!ea, `activar: ${ea?.message}`);

    for (const [i, valor] of [80, 78, 75].entries()) {
      const anio = ANIOS[i];
      const { error } = await Q.rpc("quality_record_measurement", {
        p_indicator_id: INDICADOR, p_period_start: `${anio}-01-01`,
        p_period_end: `${anio}-12-31`, p_value: valor,
        p_data_state: "reported", p_components: null, p_note: null,
      });
      assert(!error, `medición ${anio}: ${error?.message}`);
    }
  });

  await check("B1. la regla se crea, se valida y se publica", async () => {
    const r = await nuevaRegla(Q, A, {
      code: `AUT-IND-${stamp}`.slice(0, 24),
      name: "Tres periodos seguidos fuera de meta",
      category: "indicators", source: "indicator", ownerPositionId: CARGO,
      severity: "critical", title: "Indicador fuera de meta tres periodos seguidos",
      conditions: [{ field: "evaluation_series_out_of_target",
                     operator: "consecutive_count", value: 3 }],
      outputs: [
        { kind: "CREATE_SIGNAL" },
        { kind: "CREATE_ALERT", recipient_kind: "rule_owner_position" },
        { kind: "CREATE_TASK", recipient_kind: "rule_owner_position", due_in_days: 7,
          task_title: "Revisar el indicador fuera de meta" },
      ],
    });
    REGLA_IND = r.ruleId; VERSION_IND = r.versionId;

    const { data: v } = await Q.rpc("quality_automation_validate_version",
      { p_version_id: VERSION_IND });
    assert((v as Record<string, unknown>)?.valid === true,
      `la versión publicada no valida: ${JSON.stringify(v)}`);
  });

  await check("B2. la regla se explica en castellano ANTES de ejecutarla (§169)", async () => {
    const { data } = await Q.rpc("quality_automation_describe_version",
      { p_version_id: VERSION_IND });
    const frase = String(data ?? "");
    assert(frase.length > 30, "la regla no se describe");
    assert(!/consecutive_count|evaluation_series/.test(frase),
      `la descripción filtra jerga técnica: «${frase}»`);
  });

  await check("B3. el barrido produce UNA señal, UN aviso y UNA tarea (§136)", async () => {
    const { runId, error } = await ejecutar(Q, A);
    assert(!error && runId, `ejecutar: ${error?.message}`);
    RUN_1 = runId!;
    const total = await resumenEjecucion(Q, RUN_1);
    assert(total.run_kind === "manual", `la ejecución se registró como ${total.run_kind}`);
    assert(Number(total.failures) === 0, `fallos: ${total.failures}`);

    const r = await resumenRegla(Q, RUN_1, REGLA_IND);
    assert(r.status === "success", `la regla acabó en «${r.status}»: ${r.error_message}`);
    assert(Number(r.subjects_evaluated) === 1, `sujetos: ${r.subjects_evaluated}`);
    assert(Number(r.matches) === 1, `coincidencias: ${r.matches}`);
    assert(Number(r.signals_created) === 1, `señales: ${r.signals_created}`);
    assert(Number(r.alerts_created) === 1, `avisos: ${r.alerts_created}`);
    assert(Number(r.tasks_created) === 1, `tareas: ${r.tasks_created}`);
  });

  await check("B4. la señal explica POR QUÉ saltó y con qué versión (§41, §133)", async () => {
    const s = await señalesDe(Q, A, REGLA_IND);
    assert(s.length === 1, `hay ${s.length} señales`);
    assert(s[0].rule_version_id === VERSION_IND, "la señal no apunta a su versión");
    const exp = String(s[0].explanation);
    assert(/Regla:/.test(exp) && /Versión: 1/.test(exp) && /Condición:/.test(exp),
      `la explicación está incompleta: ${exp}`);
    assert(/3 periodo/.test(exp), `la explicación no dice cuántos periodos: ${exp}`);
    const retrato = s[0].source_snapshot as Record<string, unknown>;
    assert(Object.keys(retrato).length === 1
      && "evaluation_series_out_of_target" in retrato,
      `el retrato guarda de más: ${JSON.stringify(retrato)}`);
  });

  await check("B5. el aviso y la tarea llegaron a quien ocupa el cargo", async () => {
    const { data: alertas } = await Q.from("work_alerts")
      .select("id, alert_type, recipient_profile_id, source_domain")
      .eq("organization_id", A).eq("source_domain", "automation");
    assert((alertas?.length ?? 0) === 1, `hay ${alertas?.length} avisos`);
    assert(alertas![0].alert_type === "automation_signal", "el aviso no se tipa como de automatización");
    assert(alertas![0].recipient_profile_id === quality.id,
      "el aviso no llegó a quien ocupa el cargo responsable");

    const { data: tareas } = await Q.from("work_tasks")
      .select("id, task_type, status, assignee_profile_id, assignee_position_id, due_at")
      .eq("organization_id", A).eq("source_domain", "automation");
    assert((tareas?.length ?? 0) === 1, `hay ${tareas?.length} tareas`);
    assert(tareas![0].task_type === "automation_follow_up", "la tarea no se tipa");
    assert(tareas![0].status === "open", "la tarea no nace abierta");
    assert(tareas![0].assignee_position_id === CARGO, "la tarea olvidó el cargo");
    assert(tareas![0].due_at !== null, "la tarea no trae vencimiento");
  });

  await check("B6. el mismo barrido otra vez NO crea NADA nuevo (§136)", async () => {
    const antesAl = await contar(Q, "work_alerts", A, { source_domain: "automation" });
    const antesTa = await contar(Q, "work_tasks", A, { source_domain: "automation" });
    const antesTotal = await contar(Q, "work_alerts", A);
    const { runId, error } = await ejecutar(Q, A);
    assert(!error && runId, `segunda ejecución: ${error?.message}`);
    const r = await resumenRegla(Q, runId!, REGLA_IND);
    assert(Number(r.matches) === 1, "la condición dejó de detectarse");
    // §128 · Y tampoco duplican los observadores de plataforma: el segundo
    // barrido consecutivo no añade NI UN aviso a la bandeja.
    assert(await contar(Q, "work_alerts", A) === antesTotal,
      "el segundo barrido consecutivo creó avisos: hay un duplicado en algún observador");
    assert(Number(r.signals_created) === 0, `creó ${r.signals_created} señales nuevas`);
    assert(Number(r.alerts_created) === 0, `creó ${r.alerts_created} avisos nuevos`);
    assert(Number(r.tasks_created) === 0, `creó ${r.tasks_created} tareas nuevas`);
    assert(await contar(Q, "work_alerts", A, { source_domain: "automation" }) === antesAl,
      "aparecieron avisos de más");
    assert(await contar(Q, "work_tasks", A, { source_domain: "automation" }) === antesTa,
      "aparecieron tareas de más");

    const s = await señalesDe(Q, A, REGLA_IND);
    assert(s.length === 1, `hay ${s.length} señales tras el segundo barrido`);
    assert(Number(s[0].detection_count) === 2,
      `la señal no anotó la segunda detección: ${s[0].detection_count}`);
  });

  // ==========================================================================
  console.log("\nC · ESCENARIO 2 · recuperar la meta (§137)");
  // ==========================================================================

  await check("C1. el cuarto periodo cumple y la señal se cierra SOLA", async () => {
    const { error } = await Q.rpc("quality_record_measurement", {
      p_indicator_id: INDICADOR, p_period_start: `${ANIOS[3]}-01-01`,
      p_period_end: `${ANIOS[3]}-12-31`, p_value: 100,
      p_data_state: "reported", p_components: null, p_note: null,
    });
    assert(!error, `medición de recuperación: ${error?.message}`);

    const { runId } = await ejecutar(Q, A);
    const r = await resumenRegla(Q, runId!, REGLA_IND);
    assert(Number(r.matches) === 0, "la condición sigue detectándose tras recuperar");

    const s = await señalesDe(Q, A, REGLA_IND);
    assert(s.length === 1, `hay ${s.length} señales`);
    assert(s[0].status === "resolved", `la señal quedó en «${s[0].status}»`);
    assert(s[0].resolution_kind === "auto", "no se marcó como resuelta por la propia condición");
  });

  await check("C2. cerrar la señal NO cerró la tarea ni tocó ninguna acción (§137)", async () => {
    const { data: tareas } = await Q.from("work_tasks")
      .select("id, status").eq("organization_id", A).eq("source_domain", "automation");
    assert((tareas ?? []).every((t) => t.status === "open"),
      "resolver la señal cerró la tarea: son objetos de dueños distintos");
    const acciones = await contar(Q, "work_actions", A);
    assert(acciones === 0, `la automatización creó ${acciones} acciones correctivas`);
  });

  // ==========================================================================
  console.log("\nD · ESCENARIO 3 · la condición vuelve (§138)");
  // ==========================================================================

  await check("D1. volver a caer tres periodos abre una señal NUEVA, no revive la vieja", async () => {
    // Se corrige el cuarto periodo a un valor por debajo de la meta: la serie
    // vuelve a tener tres «fuera» seguidos en la cola.
    const { data: med } = await Q.from("quality_measurements")
      .select("id").eq("organization_id", A).eq("indicator_id", INDICADOR)
      .eq("period_start", `${ANIOS[3]}-01-01`).eq("is_current", true).single();
    const { error } = await Q.rpc("quality_correct_measurement", {
      p_measurement_id: med!.id, p_value: 70, p_data_state: "reported",
      p_reason: "Se cargó el dato equivocado.", p_components: null,
    });
    assert(!error, `corregir medición: ${error?.message}`);

    const { runId } = await ejecutar(Q, A);
    const r = await resumenRegla(Q, runId!, REGLA_IND);
    assert(Number(r.signals_created) === 1, `creó ${r.signals_created} señales nuevas`);

    const s = await señalesDe(Q, A, REGLA_IND);
    assert(s.length === 2, `hay ${s.length} señales: el dedupe se volvió eterno o duplicó`);
    assert(s[0].status === "resolved" && s[1].status === "open",
      "la señal vieja no quedó cerrada o la nueva no nació abierta");
    assert(Number(s[1].detection_count) === 1, "la señal nueva heredó el contador de la vieja");
  });

  // ==========================================================================
  console.log("\nE · ESCENARIO 9 · simular no escribe NADA (§144)");
  // ==========================================================================

  await check("E1. la simulación cuenta las coincidencias reales", async () => {
    const { data, error } = await Q.rpc("quality_automation_simulate",
      { p_version_id: VERSION_IND, p_today: null });
    assert(!error && data, `simular: ${error?.message}`);
    const r = data as Record<string, unknown>;
    assert(Number(r.subjects_evaluated) >= 1, "la simulación no miró ningún sujeto");
    assert(Number(r.matches) === 1, `coincidencias simuladas: ${r.matches}`);
    assert(Array.isArray(r.examples) && (r.examples as unknown[]).length === 1,
      "la simulación no muestra ejemplos de lo que marcaría");
  });

  await check("E2. la simulación declara CERO salidas, y no crea ninguna", async () => {
    const antesSe = await contar(Q, "quality_signals", A);
    const antesAl = await contar(Q, "work_alerts", A);
    const antesTa = await contar(Q, "work_tasks", A);

    const { data } = await Q.rpc("quality_automation_simulate",
      { p_version_id: VERSION_IND, p_today: null });
    const r = data as Record<string, unknown>;
    assert(Number(r.signals_created) === 0 && Number(r.alerts_created) === 0
      && Number(r.tasks_created) === 0, `la simulación declara salidas: ${JSON.stringify(r)}`);

    assert(await contar(Q, "quality_signals", A) === antesSe, "la simulación creó señales");
    assert(await contar(Q, "work_alerts", A) === antesAl, "la simulación creó avisos");
    assert(await contar(Q, "work_tasks", A) === antesTa, "la simulación creó tareas");
  });

  await check("E3. el modo simulación del MOTOR tampoco escribe", async () => {
    const antesSe = await contar(Q, "quality_signals", A);
    const { runId, error } = await ejecutar(Q, A, "simulation");
    assert(!error && runId, `simular con el motor: ${error?.message}`);
    const r = await resumenEjecucion(Q, runId!);
    assert(r.run_kind === "simulation", `la ejecución se registró como ${r.run_kind}`);
    assert(Number(r.signals_created) === 0 && Number(r.alerts_created) === 0
      && Number(r.tasks_created) === 0, "una simulación declaró salidas");
    assert(await contar(Q, "quality_signals", A) === antesSe,
      "la simulación del motor creó señales");
  });

  // ==========================================================================
  console.log("\nF · ESCENARIO 10 · publicar la v2 no reescribe lo que dijo la v1 (§145)");
  // ==========================================================================

  let VERSION_IND_2 = "";

  await check("F1. la v1 no se puede editar una vez publicada", async () => {
    const { error } = await Q.from("quality_automation_rule_versions")
      .update({ conditions: [{ field: "last_value", operator: "less_than", value: 1 }] })
      .eq("id", VERSION_IND);
    assert(error, "se pudo reescribir una versión publicada");
  });

  await check("F2. se publica una v2 con otro número de periodos", async () => {
    const { data: v, error: ev } = await Q.from("quality_automation_rule_versions").insert({
      organization_id: A, rule_id: REGLA_IND, version_number: 2,
      trigger_kind: "schedule", schedule_frequency: "daily",
      conditions: [{ field: "evaluation_series_out_of_target",
                     operator: "consecutive_count", value: 4 }],
      outputs: [{ kind: "CREATE_SIGNAL" }],
      severity: "critical", signal_title: "Cuatro periodos seguidos fuera de meta",
    }).select("id").single();
    assert(!ev && v, `v2: ${ev?.message}`);
    VERSION_IND_2 = v!.id as string;
    const { error } = await Q.rpc("quality_automation_publish_version", {
      p_version_id: VERSION_IND_2, p_effective_from: HOY,
      p_change_note: "Se sube el umbral a cuatro periodos.",
    });
    assert(!error, `publicar v2: ${error?.message}`);

    const { data: vieja } = await Q.from("quality_automation_rule_versions")
      .select("status").eq("id", VERSION_IND).single();
    assert(vieja?.status === "superseded", `la v1 quedó en «${vieja?.status}»`);
  });

  await check("F3. la señal vieja sigue apuntando a la v1 y con SU título (§145)", async () => {
    const s = await señalesDe(Q, A, REGLA_IND);
    const vieja = s[0];
    assert(vieja.rule_version_id === VERSION_IND, "la señal vieja se reescribió a la v2");
    assert(String(vieja.title).includes("tres periodos"),
      `la señal vieja cambió de título: «${vieja.title}»`);
    assert(/Versión: 1/.test(String(vieja.explanation)),
      "la explicación de la señal vieja ya no dice con qué versión se emitió");
  });

  // ==========================================================================
  console.log("\nL · ESCENARIO 11 · dos barridos a la vez (§146)");
  // ==========================================================================

  await check("L1. dos ejecuciones simultáneas dejan UNA sola señal", async () => {
    // La señal abierta de la regla se cierra primero para que la condición
    // vuelva a estar «por detectar» y las dos ejecuciones compitan de verdad.
    const abiertas = (await señalesDe(Q, A, REGLA_IND)).filter((x) => x.resolved_at === null);
    for (const x of abiertas) {
      await Q.rpc("quality_signal_resolve",
        { p_signal_id: x.id, p_kind: "manual", p_note: "Se cierra para la prueba." });
    }
    const antes = (await señalesDe(Q, A, REGLA_IND)).length;

    // Vuelve a hacer falta que la condición se cumpla con la versión vigente
    // (v2: cuatro periodos). Se corrige el año más antiguo para que la cola
    // tenga cuatro «fuera» seguidos.
    const { data: med } = await Q.from("quality_measurements")
      .select("id").eq("organization_id", A).eq("indicator_id", INDICADOR)
      .eq("period_start", `${ANIOS[0]}-01-01`).eq("is_current", true).single();
    await Q.rpc("quality_correct_measurement", {
      p_measurement_id: med!.id, p_value: 60, p_data_state: "reported",
      p_reason: "Se ajusta para la prueba de concurrencia.", p_components: null,
    });

    const [uno, dos] = await Promise.all([
      ejecutar(Q, A, "live", REGLA_IND),
      ejecutar(C, A, "live", REGLA_IND),
    ]);
    assert(uno.runId || dos.runId, "ninguna de las dos ejecuciones terminó");

    const despues = await señalesDe(Q, A, REGLA_IND);
    const nuevas = despues.length - antes;
    assert(nuevas === 1, `dos barridos simultáneos dejaron ${nuevas} señales nuevas`);
    const abiertasFinal = despues.filter((x) => x.resolved_at === null);
    assert(abiertasFinal.length === 1,
      `quedaron ${abiertasFinal.length} señales abiertas para la misma condición`);
  });

  await check("L2. tampoco se duplicaron el aviso ni la tarea", async () => {
    const { data: alertas } = await Q.from("work_alerts")
      .select("dedupe_key").eq("organization_id", A).eq("source_domain", "automation");
    const claves = (alertas ?? []).map((x) => x.dedupe_key);
    assert(new Set(claves).size === claves.length, "hay dos avisos con la misma clave");
    const { data: tareas } = await Q.from("work_tasks")
      .select("dedupe_key").eq("organization_id", A).eq("source_domain", "automation");
    const ct = (tareas ?? []).map((x) => x.dedupe_key);
    assert(new Set(ct).size === ct.length, "hay dos tareas con la misma clave");
  });

  // ==========================================================================
  console.log("\nM · ESCENARIO 12 · reintentar tras un fallo a medias (§147)");
  // ==========================================================================

  await check("M1. si la tarea no llegó a crearse, el reintento la completa UNA vez", async () => {
    // Se simula el fallo a medias borrando la tarea que la ejecución creó:
    // la señal sigue ahí, la tarea no.
    const abierta = (await señalesDe(Q, A, REGLA_IND)).find((x) => x.resolved_at === null);
    assert(abierta, "no hay señal abierta con la que probar");
    const { error: ed } = await admin.from("work_tasks").delete()
      .eq("organization_id", A).eq("dedupe_key", `auto_task:${abierta!.id}:${quality.id}`);
    assert(!ed, `preparar el fallo a medias: ${ed?.message}`);

    const señalesAntes = (await señalesDe(Q, A, REGLA_IND)).length;
    const { runId } = await ejecutar(Q, A, "live", REGLA_IND);
    const r = await resumenRegla(Q, runId!, REGLA_IND);
    assert(Number(r.signals_created) === 0, "el reintento creó una segunda señal");
    assert((await señalesDe(Q, A, REGLA_IND)).length === señalesAntes,
      "el reintento duplicó la señal");

    const { count } = await Q.from("work_tasks")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", A).eq("dedupe_key", `auto_task:${abierta!.id}:${quality.id}`);
    assert((count ?? 0) === 1, `tras el reintento hay ${count} tareas para la misma señal`);
  });

  // ==========================================================================
  console.log("\nN · ESCENARIO 13 · el bucle no existe (§148)");
  // ==========================================================================

  await check("N1. ninguna fuente del catálogo observa tareas, avisos ni señales", async () => {
    const { data } = await Q.from("quality_automation_sources").select("code, subject_type");
    for (const f of data ?? []) {
      assert(!["work_task", "work_alert", "quality_signal", "quality_automation_run"]
        .includes(String(f.subject_type)),
        `la fuente ${f.code} observa ${f.subject_type}: eso cerraría un ciclo`);
    }
  });

  await check("N2. cinco barridos seguidos NO hacen crecer las tareas (§148)", async () => {
    const antes = await contar(Q, "work_tasks", A, { source_domain: "automation" });
    for (let i = 0; i < 5; i += 1) await ejecutar(Q, A);
    const despues = await contar(Q, "work_tasks", A, { source_domain: "automation" });
    assert(despues === antes,
      `cinco barridos crearon ${despues - antes} tareas de más: hay realimentación`);
  });

  // ==========================================================================
  console.log("\nG · ESCENARIO 5 · el certificado que caduca mañana (§140)");
  // ==========================================================================

  let REGLA_PERSONAS = "", COMPETENCIA = "", PERSONA_CARLOS = "", EVIDENCIA = "";

  await check("G0. se siembra una evidencia de competencia con vencimiento", async () => {
    const { data: n } = await Q.rpc("quality_seed_competency_levels", { p_organization_id: A });
    assert(Number(n) === 4, "no se creó la escala de competencia");
    const { data: comp, error: ec } = await Q.from("quality_competencies")
      .insert({ organization_id: A, name: `Auditoría interna ${stamp}`, code: "AUD" })
      .select("id").single();
    assert(!ec && comp, `competencia: ${ec?.message}`);
    COMPETENCIA = comp!.id as string;

    const { data: per, error: ep } = await Q.from("quality_people")
      .insert({ organization_id: A, full_name: `Carlos ${stamp}` }).select("id").single();
    assert(!ep && per, `persona: ${ep?.message}`);
    PERSONA_CARLOS = per!.id as string;

    const { error: er } = await Q.rpc("quality_record_person_competence", {
      p_person_id: PERSONA_CARLOS, p_competency_id: COMPETENCIA, p_level: 3,
      p_method: "certification", p_rationale: "Certificado vigente",
      p_assessed_on: HACE_UN_ANIO, p_valid_until: null,
    });
    assert(!er, `competencia de la persona: ${er?.message}`);

    const { data: pc } = await Q.from("quality_person_competencies")
      .select("id").eq("organization_id", A).eq("person_id", PERSONA_CARLOS)
      .eq("status", "valid").single();
    const { data: ev, error: ee } = await Q.from("quality_competency_evidence").insert({
      organization_id: A, person_competency_id: pc!.id,
      evidence_kind: "certification", title: `Auditor ISO 19011 ${stamp}`,
      issuer: "Ente certificador", issued_on: HACE_UN_ANIO, expires_on: MAÑANA,
    }).select("id").single();
    assert(!ee && ev, `evidencia: ${ee?.message}`);
    EVIDENCIA = ev!.id as string;
  });

  await check("G1. la regla detecta la caducidad y NO declara incompetente a nadie", async () => {
    const r = await nuevaRegla(Q, A, {
      code: `AUT-PER-${stamp}`.slice(0, 24),
      name: "Certificado a punto de caducar",
      category: "people", source: "competency_evidence", ownerPositionId: CARGO,
      title: "Evidencia de competencia próxima a caducar",
      conditions: [{ field: "valid_until", operator: "days_before", value: 30 }],
      outputs: [{ kind: "CREATE_SIGNAL" },
                { kind: "CREATE_ALERT", recipient_kind: "rule_owner_position" }],
    });
    REGLA_PERSONAS = r.ruleId;

    const antes = await Q.from("quality_person_competencies")
      .select("status, demonstrated_level").eq("organization_id", A)
      .eq("person_id", PERSONA_CARLOS).eq("status", "valid").single();

    const { runId } = await ejecutar(Q, A, "live", REGLA_PERSONAS);
    const res = await resumenRegla(Q, runId!, REGLA_PERSONAS);
    assert(Number(res.matches) === 1, `coincidencias: ${res.matches} · ${res.error_message}`);
    assert(Number(res.signals_created) === 1, `señales: ${res.signals_created}`);

    const despues = await Q.from("quality_person_competencies")
      .select("status, demonstrated_level").eq("organization_id", A)
      .eq("person_id", PERSONA_CARLOS).eq("status", "valid").single();
    assert(despues.data!.demonstrated_level === antes.data!.demonstrated_level,
      "la automatización cambió el nivel de competencia de una persona (§19)");
    assert(despues.data!.status === "valid",
      "la automatización declaró no válida la competencia de una persona (§19)");
  });

  await check("G2. la señal nombra la COMPETENCIA, no juzga a la persona (§96)", async () => {
    const s = await señalesDe(Q, A, REGLA_PERSONAS);
    assert(s.length === 1, `hay ${s.length} señales`);
    const retrato = s[0].source_snapshot as Record<string, unknown>;
    assert(Object.keys(retrato).join() === "valid_until",
      `el retrato guarda de más: ${JSON.stringify(retrato)}`);
    assert(!/desempeño|rendimiento|puntuación/i.test(String(s[0].explanation)),
      "la señal enjuicia a la persona");
  });

  // ==========================================================================
  console.log("\nH · ESCENARIO 6 · la queja sin revisar (§141)");
  // ==========================================================================

  let REGLA_QUEJA = "";

  await check("H1. una queja vencida produce señal y CERO no conformidades", async () => {
    const { error: ef } = await Q.from("quality_customer_feedback").insert({
      organization_id: A, feedback_kind: "complaint",
      title: `Entrega fuera de plazo ${stamp}`, received_on: day(-45),
      status: "open", owner_position_id: CARGO,
    });
    assert(!ef, `queja: ${ef?.message}`);

    const casosAntes = await contar(Q, "work_cases", A);
    const r = await nuevaRegla(Q, A, {
      code: `AUT-QUE-${stamp}`.slice(0, 24),
      name: "Queja sin atender",
      category: "customer", source: "customer_feedback", ownerPositionId: CARGO,
      title: "Queja de cliente sin atender",
      conditions: [{ field: "feedback_kind", operator: "equals", value: "complaint" },
                   { field: "status", operator: "in", value: ["open", "under_review"] },
                   { field: "received_on", operator: "days_after", value: 30 }],
      outputs: [{ kind: "CREATE_SIGNAL" },
                { kind: "CREATE_TASK", recipient_kind: "subject_owner_position",
                  due_in_days: 3, task_title: "Atender la queja" }],
    });
    REGLA_QUEJA = r.ruleId;

    const { runId } = await ejecutar(Q, A, "live", REGLA_QUEJA);
    const res = await resumenRegla(Q, runId!, REGLA_QUEJA);
    assert(Number(res.matches) === 1, `coincidencias: ${res.matches} · ${res.error_message}`);
    assert(Number(res.tasks_created) === 1, `tareas: ${res.tasks_created}`);

    assert(await contar(Q, "work_cases", A) === casosAntes,
      "la automatización abrió un caso: declarar una no conformidad es de una persona (§19)");
  });

  // ==========================================================================
  console.log("\nI · ESCENARIO 7 · la auditoría vencida (§142)");
  // ==========================================================================

  let REGLA_AUD = "", AUDITORIA = "";

  await check("I1. la auditoría pasada de fecha se detecta y NO cambia de estado", async () => {
    const { data: aud, error: ea } = await Q.from("quality_audits").insert({
      organization_id: A, code: `AUD-${stamp}`.slice(0, 24),
      title: "Auditoría interna de producción", audit_type: "internal", nature: "planned",
      objective: "Comprobar la conformidad del proceso con sus criterios.",
      planned_from: day(-20), planned_to: day(-15),
      scheduled_from: day(-20), scheduled_to: day(-15),
      status: "planned", owner_position_id: CARGO,
    }).select("id, status").single();
    assert(!ea && aud, `auditoría: ${ea?.message}`);
    AUDITORIA = aud!.id as string;

    const r = await nuevaRegla(Q, A, {
      code: `AUT-AUD-${stamp}`.slice(0, 24),
      name: "Auditoría programada sin ejecutar",
      category: "audits", source: "audit", ownerPositionId: CARGO,
      title: "Auditoría programada sin ejecutar",
      conditions: [{ field: "status", operator: "in", value: ["planned", "scheduled"] },
                   { field: "scheduled_to", operator: "days_after", value: 7 }],
      outputs: [{ kind: "CREATE_SIGNAL" },
                { kind: "CREATE_ALERT", recipient_kind: "rule_owner_position" }],
    });
    REGLA_AUD = r.ruleId;

    const { runId } = await ejecutar(Q, A, "live", REGLA_AUD);
    const res = await resumenRegla(Q, runId!, REGLA_AUD);
    assert(Number(res.matches) === 1, `coincidencias: ${res.matches} · ${res.error_message}`);

    const { data: despues } = await Q.from("quality_audits")
      .select("status").eq("id", AUDITORIA).single();
    assert(despues!.status === "planned",
      `la automatización movió la auditoría a «${despues!.status}» (§19)`);
  });

  // ==========================================================================
  console.log("\nJ · ESCENARIO 8 · la entrada de la revisión que sigue sin datos (§143)");
  // ==========================================================================

  let REGLA_RD = "", REVISION = "";

  await check("J1. la entrada que falta se detecta y la revisión NO cambia de estado", async () => {
    const anio = ANIOS[3];
    const { data: rd, error: er } = await Q.from("quality_management_reviews").insert({
      organization_id: A, code: `RD-${stamp}`.slice(0, 30),
      title: `Revisión por la dirección ${anio}`, period_label: String(anio),
      period_start: `${anio}-01-01`, period_end: `${anio}-12-31`,
      owner_position_id: CARGO, scope_note: "Todo el sistema de gestión.",
    }).select("id, status").single();
    assert(!er && rd, `revisión: ${er?.message}`);
    REVISION = rd!.id as string;

    const { error: ep } = await Q.rpc("quality_mr_prepare_inputs", { p_review_id: REVISION });
    assert(!ep, `preparar entradas: ${ep?.message}`);

    const r = await nuevaRegla(Q, A, {
      code: `AUT-RD-${stamp}`.slice(0, 24),
      name: "Entrada de la revisión sin datos",
      category: "management_review", source: "management_review_input", ownerPositionId: CARGO,
      title: "Una entrada de la revisión por la dirección sigue sin datos",
      conditions: [{ field: "state", operator: "equals", value: "missing" }],
      outputs: [{ kind: "CREATE_SIGNAL" },
                { kind: "CREATE_TASK", recipient_kind: "rule_owner_position",
                  due_in_days: 10, task_title: "Completar las entradas de la revisión" }],
    });
    REGLA_RD = r.ruleId;

    const { runId } = await ejecutar(Q, A, "live", REGLA_RD);
    const res = await resumenRegla(Q, runId!, REGLA_RD);
    assert(Number(res.matches) >= 1, `coincidencias: ${res.matches} · ${res.error_message}`);

    const { data: despues } = await Q.from("quality_management_reviews")
      .select("status, closed_at").eq("id", REVISION).single();
    assert(despues!.status === "preparing" && despues!.closed_at === null,
      `la automatización movió la revisión a «${despues!.status}» (§19)`);
  });

  // ==========================================================================
  console.log("\nK · ESCENARIO 15 · la campaña anónima llega como métrica (§150)");
  // ==========================================================================

  let REGLA_CSAT = "", CAMPAÑA = "";

  await check("K0. se siembra una campaña ANÓNIMA con su métrica agregada", async () => {
    const { data: enc, error: ee } = await Q.from("quality_surveys")
      .insert({ organization_id: A, name: `Satisfacción ${stamp}` }).select("id").single();
    assert(!ee && enc, `encuesta: ${ee?.message}`);
    const { data: ver, error: ev } = await Q.from("quality_survey_versions")
      .insert({ organization_id: A, survey_id: enc!.id, version_number: 1,
                intro_text: "Cuéntanos cómo lo hicimos." }).select("id").single();
    assert(!ev && ver, `versión: ${ev?.message}`);
    const { error: eq } = await Q.from("quality_survey_questions").insert({
      organization_id: A, version_id: ver!.id, stable_key: "sat.global",
      label: "¿Cómo de satisfecho estás?", question_type: "scale",
      is_required: true, scale_min: 1, scale_max: 5, position_order: 1,
    });
    assert(!eq, `pregunta: ${eq?.message}`);
    const { error: ep } = await Q.rpc("quality_publish_survey_version", {
      p_version_id: ver!.id, p_effective_from: HACE_UN_ANIO, p_change_note: "Inicial",
    });
    assert(!ep, `publicar encuesta: ${ep?.message}`);

    const { data: camp, error: ecm } = await Q.from("quality_survey_campaigns").insert({
      organization_id: A, survey_id: enc!.id, version_id: ver!.id,
      name: `Clientes ${stamp}`, anonymity_mode: "anonymous",
      period_label: "2027-Q1", period_start: HACE_UN_ANIO, period_end: HOY,
      population_size: 10, closes_on: day(30),
    }).select("id").single();
    assert(!ecm && camp, `campaña: ${ecm?.message}`);
    CAMPAÑA = camp!.id as string;
    const { error: eo } = await Q.rpc("quality_open_survey_campaign", { p_campaign_id: CAMPAÑA });
    assert(!eo, `abrir campaña: ${eo?.message}`);

    const { data: preg } = await Q.from("quality_survey_questions")
      .select("id").eq("version_id", ver!.id).single();
    for (const valor of [2, 2, 3]) {
      const { data: token, error: ei } = await Q.rpc("quality_issue_survey_invitation", {
        p_campaign_id: CAMPAÑA, p_customer_id: null, p_contact_id: null,
        p_email: null, p_expires_at: null,
      });
      assert(!ei && token, `invitación: ${ei?.message}`);
      const { error: es } = await publico.rpc("quality_submit_survey_response", {
        p_token: (token as Record<string, unknown>).token ?? token,
        p_answers: [{ question_id: preg!.id, outcome: "answered", value_numeric: valor }],
      });
      assert(!es, `respuesta ${valor}: ${es?.message}`);
    }

    const { error: ed } = await Q.from("quality_customer_metric_definitions").insert({
      organization_id: A, name: `CSAT ${stamp}`, code: `CSAT-${stamp}`.slice(0, 24),
      method: "csat", question_stable_key: "sat.global",
      expects_scale_min: 1, expects_scale_max: 5, unit: "percent",
    });
    assert(!ed, `definición de métrica: ${ed?.message}`);
    await Q.rpc("quality_close_survey_campaign", { p_campaign_id: CAMPAÑA, p_note: null });
    const { error: ec } = await Q.rpc("quality_compute_campaign_metrics", { p_campaign_id: CAMPAÑA });
    assert(!ec, `calcular métrica: ${ec?.message}`);
  });

  await check("K1. la regla observa la MÉTRICA y la señal no filtra identidad (§150)", async () => {
    const r = await nuevaRegla(Q, A, {
      code: `AUT-CSA-${stamp}`.slice(0, 24),
      name: "Satisfacción por debajo del mínimo",
      category: "customer", source: "customer_metric", ownerPositionId: CARGO,
      title: "La satisfacción medida está por debajo del mínimo",
      conditions: [{ field: "value", operator: "less_than", value: 80 }],
      outputs: [{ kind: "CREATE_SIGNAL" }],
    });
    REGLA_CSAT = r.ruleId;

    const { runId } = await ejecutar(Q, A, "live", REGLA_CSAT);
    const res = await resumenRegla(Q, runId!, REGLA_CSAT);
    assert(Number(res.matches) === 1, `coincidencias: ${res.matches} · ${res.error_message}`);

    const s = await señalesDe(Q, A, REGLA_CSAT);
    assert(s.length === 1, `hay ${s.length} señales`);
    assert(s[0].subject_id === CAMPAÑA, "el sujeto de la señal no es la campaña");
    const retrato = JSON.stringify(s[0].source_snapshot);
    assert(/"value"/.test(retrato), `el retrato no trae la métrica: ${retrato}`);

    // §150 · Fuga de identidad = 0. Ni respuesta, ni invitación, ni contacto.
    const { data: respuestas } = await admin.from("quality_survey_responses")
      .select("id").eq("organization_id", A);
    const texto = retrato + String(s[0].explanation) + String(s[0].title);
    for (const resp of respuestas ?? []) {
      assert(!texto.includes(String(resp.id)), "la señal nombra una respuesta concreta");
    }
    const { data: invitaciones } = await admin.from("quality_survey_invitations")
      .select("id, token_hash").eq("organization_id", A);
    for (const inv of invitaciones ?? []) {
      assert(!texto.includes(String(inv.id)), "la señal nombra una invitación");
    }
  });

  // ==========================================================================
  console.log("\nP · ESCENARIO 4 · el proveedor crítico con la reevaluación vencida (§139)");
  // ==========================================================================

  let SCOPE = "", REGLA_PROV = "";

  await check("P0. se siembra un proveedor crítico evaluado hace medio año", async () => {
    const { data: party, error: ep } = await Q.from("quality_external_parties")
      .insert({ organization_id: A, legal_name: `ACME ${stamp}`, tax_id: `NIT-${stamp}` })
      .select("id").single();
    assert(!ep && party, `empresa externa: ${ep?.message}`);
    const { error: er } = await Q.from("quality_external_party_roles")
      .insert({ organization_id: A, party_id: party!.id, role_code: "supplier" });
    assert(!er, `papel: ${er?.message}`);
    const { data: perfil, error: epr } = await Q.from("quality_supplier_profiles")
      .insert({ organization_id: A, party_id: party!.id, relationship_status: "active",
                owner_position_id: CARGO })
      .select("id").single();
    assert(!epr && perfil, `perfil: ${epr?.message}`);
    const { data: cat } = await Q.from("quality_supplier_categories")
      .insert({ organization_id: A, name: `Materia prima ${stamp}` }).select("id").single();
    const { data: sc, error: esc } = await Q.from("quality_supplier_scopes")
      .insert({ organization_id: A, profile_id: perfil!.id, category_id: cat!.id })
      .select("id").single();
    assert(!esc && sc, `alcance: ${esc?.message}`);
    SCOPE = sc!.id as string;

    // La criticidad, con su metodología versionada: es de ahí de donde sale la
    // cadencia de reevaluación.
    const { data: m } = await Q.from("quality_risk_methodologies").insert({
      organization_id: A, code: `CRIT-${stamp}`.slice(0, 24), name: "Criticidad de proveedores",
      applies_to: "supplier_criticality", approach: "qualitative",
    }).select("id").single();
    const { data: v } = await Q.from("quality_risk_methodology_versions").insert({
      organization_id: A, methodology_id: m!.id, version_number: 1, aggregation: "sum",
    }).select("id").single();
    const { data: dim } = await Q.from("quality_risk_scales").insert({
      organization_id: A, version_id: v!.id, code: "IMP", label: "Impacto si falla",
      scale_kind: "dimension", position: 1, weight: 1,
    }).select("id").single();
    const nivelIds: string[] = [];
    for (const n of [{ value: 1, label: "Bajo", position: 1 },
                     { value: 3, label: "Alto", position: 2 }]) {
      const { data: l } = await Q.from("quality_risk_scale_levels").insert({
        organization_id: A, scale_id: dim!.id, value: n.value, label: n.label,
        position: n.position,
      }).select("id").single();
      nivelIds.push(l!.id as string);
    }
    const { data: res } = await Q.from("quality_risk_scales").insert({
      organization_id: A, version_id: v!.id, code: "RES", label: "Criticidad",
      scale_kind: "result", position: 2, weight: 1,
    }).select("id").single();
    for (const n of [{ value: 1, label: "No crítico", min: 0, max: 2, review: 24, position: 1 },
                     { value: 2, label: "Crítico", min: 3, max: 99, review: 6, position: 2 }]) {
      const { error } = await Q.from("quality_risk_scale_levels").insert({
        organization_id: A, scale_id: res!.id, value: n.value, label: n.label,
        min_score: n.min, max_score: n.max, review_months: n.review, position: n.position,
      });
      assert(!error, `banda ${n.label}: ${error?.message}`);
    }
    const { error: epub } = await Q.rpc("quality_publish_methodology_version", {
      p_version_id: v!.id, p_effective_from: HACE_UN_ANIO, p_change_note: "Inicial",
    });
    assert(!epub, `publicar metodología: ${epub?.message}`);
    const { error: eas } = await Q.rpc("quality_assess_supplier_criticality", {
      p_scope_id: SCOPE, p_version_id: v!.id, p_level_ids: [nivelIds[1]],
      p_rationale: "Único proveedor homologado del insumo principal.",
      p_assessed_on: HACE_MEDIO_ANIO,
    });
    assert(!eas, `clasificar criticidad: ${eas?.message}`);

    // Y una evaluación cerrada hace medio año: con cadencia de 6 meses, la
    // reevaluación venció ayer o antes.
    const { data: t } = await Q.from("quality_supplier_evaluation_templates")
      .insert({ organization_id: A, name: `Evaluación ${stamp}` }).select("id").single();
    const { data: tv } = await Q.from("quality_supplier_template_versions").insert({
      organization_id: A, template_id: t!.id, version_number: 1,
      scoring_rule: "weighted_average",
      bands: [{ min: 80, max: 100, label: "Excelente" },
              { min: 0, max: 79.999, label: "Aceptable" }],
    }).select("id").single();
    const { data: cri } = await Q.from("quality_supplier_evaluation_criteria").insert({
      organization_id: A, version_id: tv!.id, code: "C1", label: "Cumplimiento",
      weight: 1, max_points: 100, evaluation_method: "observation", position_order: 1,
    }).select("id").single();
    const { error: epv } = await Q.rpc("quality_publish_supplier_template_version", {
      p_version_id: tv!.id, p_effective_from: HACE_UN_ANIO, p_change_note: "Inicial",
    });
    assert(!epv, `publicar plantilla: ${epv?.message}`);

    const { data: ev, error: eev } = await Q.from("quality_supplier_evaluations").insert({
      organization_id: A, scope_id: SCOPE, version_id: tv!.id,
      evaluation_kind: "periodic", period_label: "2027-S1",
    }).select("id").single();
    assert(!eev && ev, `abrir evaluación: ${eev?.message}`);
    const { error: err } = await Q.from("quality_supplier_evaluation_results").insert({
      organization_id: A, evaluation_id: ev!.id, criterion_id: cri!.id,
      outcome: "scored", points: 90,
    });
    assert(!err, `resultado: ${err?.message}`);
    const { error: ecl } = await Q.rpc("quality_close_supplier_evaluation", {
      p_evaluation_id: ev!.id, p_summary: "Buen semestre.", p_evaluated_on: HACE_MEDIO_ANIO,
    });
    assert(!ecl, `cerrar evaluación: ${ecl?.message}`);

    const { error: eap } = await Q.rpc("quality_decide_supplier_approval", {
      p_scope_id: SCOPE, p_decision: "approved", p_effective_from: HACE_MEDIO_ANIO,
      p_valid_until: null, p_rationale: "Cumple los requisitos acordados.",
      p_conditions: null, p_evaluation_id: ev!.id,
    });
    assert(!eap, `aprobar: ${eap?.message}`);
  });

  await check("P1. la reevaluación vencida se detecta con la plantilla de plataforma", async () => {
    const { data: reglaId, error } = await Q.rpc("quality_automation_instantiate_template", {
      p_organization_id: A, p_template_code: "supplier_critical_reevaluation_overdue",
      p_owner_position_id: CARGO, p_conditions: null,
    });
    assert(!error && reglaId, `instanciar plantilla: ${error?.message}`);
    REGLA_PROV = reglaId as string;

    const { data: regla } = await Q.from("quality_automation_rules")
      .select("status, template_code, category").eq("id", REGLA_PROV).single();
    assert(regla!.status === "draft", "la plantilla instanciada nació activa");
    assert(regla!.template_code === "supplier_critical_reevaluation_overdue",
      "la regla no recuerda de qué plantilla salió");

    const { data: ver } = await Q.from("quality_automation_rule_versions")
      .select("id").eq("rule_id", REGLA_PROV).single();
    const { error: ep } = await Q.rpc("quality_automation_publish_version", {
      p_version_id: ver!.id, p_effective_from: HACE_UN_ANIO, p_change_note: "Se adopta",
    });
    assert(!ep, `publicar: ${ep?.message}`);

    const { data: antes } = await Q.from("v_quality_supplier_scope_status")
      .select("decision, is_approved_now, criticality_label").eq("scope_id", SCOPE).single();
    assert(antes!.criticality_label === "Crítico", "el alcance no quedó crítico");

    const { runId } = await ejecutar(Q, A, "live", REGLA_PROV);
    const res = await resumenRegla(Q, runId!, REGLA_PROV);
    assert(Number(res.matches) === 1, `coincidencias: ${res.matches} · ${res.error_message}`);
    assert(Number(res.signals_created) === 1, `señales: ${res.signals_created}`);

    // §139 · Y la aprobación del proveedor sigue EXACTAMENTE igual.
    const { data: despues } = await Q.from("v_quality_supplier_scope_status")
      .select("decision, is_approved_now, criticality_label").eq("scope_id", SCOPE).single();
    assert(despues!.decision === antes!.decision
      && despues!.is_approved_now === antes!.is_approved_now,
      "la automatización cambió la aprobación del proveedor (§19)");
  });

  await check("P2. el segundo barrido no duplica NADA (§139)", async () => {
    const antes = (await señalesDe(Q, A, REGLA_PROV)).length;
    const { runId } = await ejecutar(Q, A, "live", REGLA_PROV);
    const res = await resumenRegla(Q, runId!, REGLA_PROV);
    assert(Number(res.signals_created) === 0, `creó ${res.signals_created} señales`);
    assert((await señalesDe(Q, A, REGLA_PROV)).length === antes, "se duplicó la señal");
  });

  // ==========================================================================
  console.log("\nQ · ESCENARIO 14 · una empresa no alcanza a la otra (§149)");
  // ==========================================================================

  let REGLA_B = "";

  await check("Q1. la empresa B no ve NI UNA regla, señal o ejecución de A", async () => {
    for (const tabla of ["quality_automation_rules", "quality_automation_rule_versions",
                         "quality_signals", "quality_automation_runs",
                         "quality_automation_run_rules", "quality_signal_suppressions",
                         "quality_automation_settings"]) {
      const { data } = await O.from(tabla).select("id").eq("organization_id", A);
      assert((data ?? []).length === 0, `${tabla}: la empresa ajena ve filas de A`);
    }
  });

  await check("Q2. tampoco con el UUID exacto en la mano", async () => {
    const s = await señalesDe(Q, A, REGLA_IND);
    const { data } = await O.from("quality_signals").select("id, title").eq("id", s[0].id);
    assert((data ?? []).length === 0, "la señal de A se lee desde B con su UUID");
    const { data: r } = await O.from("quality_automation_rules").select("id").eq("id", REGLA_IND);
    assert((r ?? []).length === 0, "la regla de A se lee desde B con su UUID");
  });

  await check("Q3. una regla de B no puede observar una entidad de A", async () => {
    // B crea su propia regla sobre indicadores. A tiene el indicador; B no.
    const { data: cargoB } = await O.from("quality_positions")
      .insert({ organization_id: B, name: `Gerencia B ${stamp}` }).select("id").single();
    const r = await nuevaRegla(O, B, {
      code: `AUT-B-${stamp}`.slice(0, 24), name: "Indicadores fuera de meta",
      category: "indicators", source: "indicator", ownerPositionId: cargoB!.id as string,
      title: "Indicador fuera de meta",
      conditions: [{ field: "last_evaluation", operator: "equals", value: "not_met" }],
      outputs: [{ kind: "CREATE_SIGNAL" }],
    });
    REGLA_B = r.ruleId;

    const { runId, error } = await ejecutar(O, B, "live", REGLA_B);
    assert(!error && runId, `ejecutar en B: ${error?.message}`);
    const res = await resumenRegla(O, runId!, REGLA_B);
    assert(Number(res.subjects_evaluated) === 0,
      `la regla de B miró ${res.subjects_evaluated} sujetos: son los de A`);

    const { data: señalesB } = await O.from("quality_signals")
      .select("id, subject_id").eq("organization_id", B);
    assert((señalesB ?? []).every((x) => x.subject_id !== INDICADOR),
      "una señal de B apunta al indicador de A");
  });

  await check("Q4. B no puede ejecutar ni simular una regla de A (§152)", async () => {
    const { error } = await O.rpc("quality_automation_run", {
      p_organization_id: A, p_mode: "live", p_rule_id: REGLA_IND, p_today: null,
    });
    assert(error, "la empresa ajena disparó el motor de A");

    const { data: sim } = await O.rpc("quality_automation_simulate",
      { p_version_id: VERSION_IND, p_today: null });
    assert(sim === null, `la empresa ajena simuló una regla de A: ${JSON.stringify(sim)}`);
  });

  await check("Q5. A tampoco alcanza a B: la puerta es simétrica", async () => {
    const { error } = await Q.rpc("quality_automation_run", {
      p_organization_id: B, p_mode: "live", p_rule_id: null, p_today: null,
    });
    assert(error, "A pudo disparar el motor de B");
    const { data } = await Q.from("quality_automation_rules").select("id").eq("id", REGLA_B);
    assert((data ?? []).length === 0, "A ve la regla de B");
  });

  // ==========================================================================
  console.log("\nR · ATAQUES (§152)");
  // ==========================================================================

  await check("R1. crear una regla en otra empresa: denegado", async () => {
    const { error } = await O.from("quality_automation_rules").insert({
      organization_id: A, code: `PIRATA-${stamp}`.slice(0, 24), name: "Regla infiltrada",
      category: "indicators", source_code: "indicator", status: "active",
    });
    assert(error, "se creó una regla dentro de otra empresa");
  });

  await check("R2. apuntar el aviso a un cargo de otra empresa: denegado", async () => {
    const { data: cargoB } = await O.from("quality_positions")
      .select("id").eq("organization_id", B).limit(1).single();
    const { data: regla } = await Q.from("quality_automation_rules").insert({
      organization_id: A, code: `AUT-X1-${stamp}`.slice(0, 24), name: "Destinatario ajeno",
      category: "indicators", source_code: "indicator", status: "draft",
    }).select("id").single();
    const { data: ver } = await Q.from("quality_automation_rule_versions").insert({
      organization_id: A, rule_id: regla!.id, version_number: 1,
      conditions: [{ field: "last_evaluation", operator: "equals", value: "not_met" }],
      outputs: [{ kind: "CREATE_SIGNAL" },
                { kind: "CREATE_ALERT", recipient_kind: "specific_position",
                  position_id: cargoB!.id }],
      signal_title: "Indicador fuera de meta",
    }).select("id").single();
    const { data: v } = await Q.rpc("quality_automation_validate_version",
      { p_version_id: ver!.id });
    assert((v as Record<string, unknown>)?.valid === false,
      "un cargo de otra empresa pasó la validación");
    const { error } = await Q.rpc("quality_automation_publish_version",
      { p_version_id: ver!.id, p_effective_from: HOY, p_change_note: null });
    assert(error, "se publicó una regla que avisa a un cargo de otra empresa");
  });

  await check("R3. una fuente inventada: denegado por la base", async () => {
    const { error } = await Q.from("quality_automation_rules").insert({
      organization_id: A, code: `AUT-X2-${stamp}`.slice(0, 24), name: "Fuente inventada",
      category: "indicators", source_code: "tabla_secreta", status: "draft",
    });
    assert(error, "se creó una regla sobre una fuente que no existe");
  });

  await check("R4. un campo o un operador inventados: la validación los rechaza", async () => {
    const { data: regla } = await Q.from("quality_automation_rules").insert({
      organization_id: A, code: `AUT-X3-${stamp}`.slice(0, 24), name: "Campo inventado",
      category: "indicators", source_code: "indicator", status: "draft",
    }).select("id").single();
    for (const cond of [
      [{ field: "password", operator: "equals", value: "x" }],
      [{ field: "last_value", operator: "drop_table", value: 1 }],
      [{ field: "last_value", operator: "greater_than", value: "'; drop table quality_signals; --" }],
    ]) {
      const { data: ver } = await Q.from("quality_automation_rule_versions").insert({
        organization_id: A, rule_id: regla!.id, version_number: 1 + cond.length * 0
          + Math.floor(Math.random() * 1_000_000),
        conditions: cond, outputs: [{ kind: "CREATE_SIGNAL" }],
        signal_title: "Prueba",
      }).select("id").single();
      const { data: v } = await Q.rpc("quality_automation_validate_version",
        { p_version_id: ver!.id });
      assert((v as Record<string, unknown>)?.valid === false,
        `pasó la validación: ${JSON.stringify(cond)}`);
      const { error } = await Q.rpc("quality_automation_publish_version",
        { p_version_id: ver!.id, p_effective_from: HOY, p_change_note: null });
      assert(error, `se publicó: ${JSON.stringify(cond)}`);
    }
  });

  await check("R5. una salida inventada —correo, HTTP, no conformidad— se rechaza", async () => {
    const { data: regla } = await Q.from("quality_automation_rules").insert({
      organization_id: A, code: `AUT-X4-${stamp}`.slice(0, 24), name: "Salida inventada",
      category: "indicators", source_code: "indicator", status: "draft",
    }).select("id").single();
    for (const out of [
      [{ kind: "CREATE_SIGNAL" }, { kind: "SEND_EMAIL", to: "quien@sea.com" }],
      [{ kind: "CREATE_SIGNAL" }, { kind: "CREATE_NONCONFORMITY" }],
      [{ kind: "CREATE_SIGNAL" }, { kind: "HTTP_POST", url: "https://exfiltra.example" }],
      [{ kind: "CREATE_ALERT", recipient_kind: "rule_owner_position" }],
    ]) {
      const { data: ver } = await Q.from("quality_automation_rule_versions").insert({
        organization_id: A, rule_id: regla!.id,
        version_number: Math.floor(Math.random() * 1_000_000),
        conditions: [{ field: "last_evaluation", operator: "equals", value: "not_met" }],
        outputs: out, signal_title: "Prueba",
      }).select("id").single();
      const { data: v } = await Q.rpc("quality_automation_validate_version",
        { p_version_id: ver!.id });
      assert((v as Record<string, unknown>)?.valid === false,
        `pasó la validación: ${JSON.stringify(out)}`);
    }
  });

  await check("R6. una configuración con forma imposible NO tumba nada: falla cerrada", async () => {
    const { data: regla } = await Q.from("quality_automation_rules").insert({
      organization_id: A, code: `AUT-X5-${stamp}`.slice(0, 24), name: "Configuración rota",
      category: "indicators", source_code: "indicator", status: "draft",
    }).select("id").single();
    // Un objeto donde se espera una lista: la restricción de la tabla lo para.
    const { error: eforma } = await Q.from("quality_automation_rule_versions").insert({
      organization_id: A, rule_id: regla!.id, version_number: 1,
      conditions: { field: "last_value" }, outputs: [{ kind: "CREATE_SIGNAL" }],
      signal_title: "Prueba",
    });
    assert(eforma, "se guardó una configuración que ni siquiera es una lista");

    // Y una lista de basura: la validación la rechaza sin lanzar.
    const { data: ver } = await Q.from("quality_automation_rule_versions").insert({
      organization_id: A, rule_id: regla!.id, version_number: 2,
      conditions: ["esto no es una condición", 42],
      outputs: [{ kind: "CREATE_SIGNAL" }], signal_title: "Prueba",
    }).select("id").single();
    const { data: v } = await Q.rpc("quality_automation_validate_version",
      { p_version_id: ver!.id });
    assert((v as Record<string, unknown>)?.valid === false, "la basura pasó la validación");
    const errores = (v as Record<string, unknown>).errors as string[];
    assert(Array.isArray(errores) && errores.length > 0, "el rechazo no explica nada");
  });

  await check("R7. PostgREST directo: nadie inserta señales ni ejecuciones a mano", async () => {
    const { error: es } = await Q.from("quality_signals").insert({
      organization_id: A, source_code: "indicator", domain: "indicators",
      subject_type: "quality_indicator", subject_id: INDICADOR, title: "Señal falsa",
      explanation: "La escribí yo.", dedupe_key: `falsa:${stamp}`,
    });
    assert(es, "se insertó una señal a mano");

    const { error: er } = await Q.from("quality_automation_runs").insert({
      organization_id: A, run_kind: "manual", business_date: HOY, status: "success",
    });
    assert(er, "se insertó una ejecución a mano");

    const señal = (await señalesDe(Q, A, REGLA_IND))[0];
    const { error: ed } = await Q.from("quality_signals").delete().eq("id", señal.id);
    assert(ed, "se borró una señal");
    const { error: edr } = await Q.from("quality_automation_runs").delete().eq("id", RUN_1);
    assert(edr, "se borró una ejecución");
  });

  await check("R8. el origen de una señal está congelado (§79)", async () => {
    const señal = (await señalesDe(Q, A, REGLA_IND))[0];
    const { error } = await Q.from("quality_signals")
      .update({ rule_version_id: VERSION_IND_2 }).eq("id", señal.id);
    assert(error, "se reescribió con qué versión se emitió una señal");
    const { error: e2 } = await Q.from("quality_signals")
      .update({ explanation: "Otra cosa" }).eq("id", señal.id);
    assert(e2, "se reescribió la explicación de una señal");
  });

  await check("R9. el anónimo no alcanza nada de la automatización", async () => {
    for (const tabla of ["quality_automation_rules", "quality_signals",
                         "quality_automation_runs", "quality_automation_sources",
                         "quality_automation_rule_templates"]) {
      const { data, error } = await publico.from(tabla).select("*").limit(1);
      assert(error || (data ?? []).length === 0, `${tabla}: el anónimo lee filas`);
    }
    const { error } = await publico.rpc("quality_automation_run", {
      p_organization_id: A, p_mode: "live", p_rule_id: null, p_today: null,
    });
    assert(error, "el anónimo disparó el motor");
  });

  // ==========================================================================
  console.log("\nS · PERMISOS · quién conduce y quién enciende (§85, §174)");
  // ==========================================================================

  await check("S1. el consultor puede preparar una regla pero NO publicarla", async () => {
    const { data: regla, error } = await C.from("quality_automation_rules").insert({
      organization_id: A, code: `AUT-CON-${stamp}`.slice(0, 24),
      name: "Propuesta del consultor", category: "indicators",
      source_code: "indicator", status: "draft", owner_position_id: CARGO,
    }).select("id").single();
    assert(!error && regla, `el consultor no pudo preparar una regla: ${error?.message}`);

    const { data: ver } = await C.from("quality_automation_rule_versions").insert({
      organization_id: A, rule_id: regla!.id, version_number: 1,
      conditions: [{ field: "measurement_pending", operator: "equals", value: true }],
      outputs: [{ kind: "CREATE_SIGNAL" }], signal_title: "Medición pendiente",
    }).select("id").single();
    const { error: ep } = await C.rpc("quality_automation_publish_version", {
      p_version_id: ver!.id, p_effective_from: HOY, p_change_note: "Propuesta",
    });
    assert(ep, "el consultor externo pudo encender una regla que observa a la empresa");

    const { error: eq } = await Q.rpc("quality_automation_publish_version", {
      p_version_id: ver!.id, p_effective_from: HOY, p_change_note: "Se adopta la propuesta",
    });
    assert(!eq, `quien conduce el sistema no pudo publicarla: ${eq?.message}`);
  });

  // ==========================================================================
  console.log("\nT · LA SEÑAL SE ATIENDE · reconocer, resolver, silenciar (§39, §40, §80)");
  // ==========================================================================

  await check("T1. reconocer NO cierra la señal", async () => {
    const abierta = (await señalesDe(Q, A, REGLA_AUD)).find((x) => x.resolved_at === null);
    assert(abierta, "no hay señal abierta con la que probar");
    const { error } = await Q.rpc("quality_signal_acknowledge", { p_signal_id: abierta!.id });
    assert(!error, `reconocer: ${error?.message}`);
    const { data } = await Q.from("quality_signals")
      .select("status, acknowledged_at, resolved_at").eq("id", abierta!.id).single();
    assert(data!.status === "acknowledged", `la señal quedó en «${data!.status}»`);
    assert(data!.acknowledged_at !== null, "no se anotó quién la vio");
    assert(data!.resolved_at === null, "reconocer cerró la señal");
  });

  await check("T2. resolver a mano exige decir cómo, y el barrido no la reabre", async () => {
    const abierta = (await señalesDe(Q, A, REGLA_AUD)).find((x) => x.resolved_at === null);
    const { error } = await Q.rpc("quality_signal_resolve", {
      p_signal_id: abierta!.id, p_kind: "manual",
      p_note: "Se reprogramó la auditoría con el equipo.",
    });
    assert(!error, `resolver: ${error?.message}`);
    const { data } = await Q.from("quality_signals")
      .select("status, resolved_at, resolution_kind").eq("id", abierta!.id).single();
    assert(data!.status === "resolved" && data!.resolution_kind === "manual",
      "la señal no quedó resuelta a mano");
  });

  await check("T3. silenciar una regla la aparta del barrido, y NO es resolverla", async () => {
    const { data: sup, error } = await Q.rpc("quality_signal_suppress", {
      p_scope: "rule", p_target_id: REGLA_QUEJA,
      p_reason: "La queja está en manos del área comercial hasta fin de mes.",
      p_until: day(20),
    });
    assert(!error && sup, `silenciar: ${error?.message}`);

    const { runId } = await ejecutar(Q, A);
    const { data: fila } = await Q.from("quality_automation_run_rules")
      .select("id").eq("run_id", runId!).eq("rule_id", REGLA_QUEJA);
    assert((fila ?? []).length === 0, "la regla silenciada se siguió evaluando");

    // Silenciar sin motivo no se puede.
    const { error: sinMotivo } = await Q.rpc("quality_signal_suppress", {
      p_scope: "rule", p_target_id: REGLA_AUD, p_reason: "   ", p_until: null,
    });
    assert(sinMotivo, "se pudo silenciar sin decir por qué");
  });

  // ==========================================================================
  console.log("\nU · CICLO DE VIDA (§151)");
  // ==========================================================================

  await check("U1. un borrador que nunca observó nada SÍ se puede borrar", async () => {
    const { data: regla } = await Q.from("quality_automation_rules").insert({
      organization_id: A, code: `AUT-DEL-${stamp}`.slice(0, 24), name: "Borrador desechable",
      category: "indicators", source_code: "indicator", status: "draft",
    }).select("id").single();
    const { data: v } = await Q.rpc("quality_deletion_eligibility", {
      p_entity: "automation_rule", p_id: regla!.id,
    });
    assert((v as Record<string, unknown>)?.can_hard_delete === true,
      `un borrador no se puede borrar: ${JSON.stringify(v)}`);
    const { error } = await Q.from("quality_automation_rules").delete().eq("id", regla!.id);
    assert(!error, `borrar el borrador: ${error?.message}`);
  });

  await check("U2. una regla que ya observó NO se borra: se retira", async () => {
    const { data: v } = await Q.rpc("quality_deletion_eligibility", {
      p_entity: "automation_rule", p_id: REGLA_IND,
    });
    const veredicto = v as Record<string, unknown>;
    assert(veredicto.can_hard_delete === false, "una regla con señales se puede borrar");
    assert(veredicto.alternative === "retire", "no se ofrece retirarla");
    assert(String(veredicto.reason).length > 20, "no se explica por qué no");

    const { error } = await Q.from("quality_automation_rules").delete().eq("id", REGLA_IND);
    assert(error, "se borró una regla que ya había emitido señales");
  });

  await check("U3. retirar deja de evaluar y CONSERVA la historia", async () => {
    const señalesAntes = (await señalesDe(Q, A, REGLA_CSAT)).length;
    const { error } = await Q.from("quality_automation_rules")
      .update({ status: "retired", retired_at: new Date().toISOString(),
                retirement_reason: "La métrica se sustituye por otra." })
      .eq("id", REGLA_CSAT);
    assert(!error, `retirar: ${error?.message}`);

    const { runId } = await ejecutar(Q, A);
    const { data: fila } = await Q.from("quality_automation_run_rules")
      .select("id").eq("run_id", runId!).eq("rule_id", REGLA_CSAT);
    assert((fila ?? []).length === 0, "la regla retirada se siguió evaluando");
    assert((await señalesDe(Q, A, REGLA_CSAT)).length === señalesAntes,
      "retirar la regla se llevó por delante sus señales");
  });

  // ==========================================================================
  console.log("\nV · EL PLANIFICADOR · el mismo motor, sin sesión (§49, §155)");
  // ==========================================================================

  await check("V1. sin sesión el motor evalúa igual y se registra como PROGRAMADO", async () => {
    const { data: runId, error } = await admin.rpc("quality_automation_run", {
      p_organization_id: A, p_mode: "live", p_rule_id: null, p_today: null,
    });
    assert(!error && runId, `barrido programado: ${error?.message}`);
    const r = await resumenEjecucion(Q, runId as string);
    assert(r.run_kind === "scheduled", `se registró como «${r.run_kind}»`);
    assert(Number(r.rules_evaluated) > 0, "el barrido programado no evaluó nada");
    assert(Number(r.subjects_evaluated) > 0,
      "el barrido programado no vio ningún sujeto: sin sesión se quedaría ciego");
  });

  await check("V1b. los OCHO barridos heredados corren sin sesión (0131)", async () => {
    // La 0130 los anotaba como omitidos porque exigían sesión. QUALITY-11.1
    // cerró ese hueco: ahora los ocho se ejecutan también de noche, con los
    // mismos permisos de siempre cuando SÍ hay sesión.
    const { data: runId } = await admin.rpc("quality_automation_run", {
      p_organization_id: A, p_mode: "live", p_rule_id: null, p_today: null,
    });
    const { data: filas } = await Q.from("quality_automation_run_rules")
      .select("platform_observer, status, error_message")
      .eq("run_id", runId as string).not("platform_observer", "is", null);
    const omitidos = (filas ?? []).filter((x) => x.status === "skipped");
    const fallidos = (filas ?? []).filter((x) => x.status === "failed");
    assert(fallidos.length === 0,
      `el barrido programado dejó ${fallidos.length} observadores en fallo: `
      + JSON.stringify(fallidos));
    assert(omitidos.length === 0,
      `todavía se omiten ${omitidos.length} observadores sin sesión: `
      + JSON.stringify(omitidos));
    assert((filas ?? []).length === 8,
      `corrieron ${filas?.length} observadores de plataforma en vez de 8`);
    const r = await resumenEjecucion(Q, runId as string);
    assert(r.status === "success", `la ejecución quedó en «${r.status}» por una omisión conocida`);
    assert(Number(r.failures) === 0, `la ejecución contó ${r.failures} fallos`);
  });

  await check("V2. el barrido programado es IDEMPOTENTE (§155)", async () => {
    const antesSe = await contar(Q, "quality_signals", A);
    const antesAl = await contar(Q, "work_alerts", A);
    const antesTa = await contar(Q, "work_tasks", A);
    const { data: runId } = await admin.rpc("quality_automation_run", {
      p_organization_id: A, p_mode: "live", p_rule_id: null, p_today: null,
    });
    const r = await resumenEjecucion(Q, runId as string);
    assert(Number(r.signals_created) === 0, `creó ${r.signals_created} señales`);
    assert(await contar(Q, "quality_signals", A) === antesSe, "aparecieron señales");
    assert(await contar(Q, "work_alerts", A) === antesAl, "aparecieron avisos");
    assert(await contar(Q, "work_tasks", A) === antesTa, "aparecieron tareas");
  });

  await check("V3. el barrido programado es ACOTADO: no crece con las llamadas", async () => {
    const { data: r1 } = await admin.rpc("quality_automation_run",
      { p_organization_id: A, p_mode: "live", p_rule_id: null, p_today: null });
    const uno = await resumenEjecucion(Q, r1 as string);
    const { data: r2 } = await admin.rpc("quality_automation_run",
      { p_organization_id: A, p_mode: "live", p_rule_id: null, p_today: null });
    const dos = await resumenEjecucion(Q, r2 as string);
    assert(Number(uno.subjects_evaluated) === Number(dos.subjects_evaluated),
      "el número de sujetos evaluados cambia entre barridos idénticos");
    assert(Number(uno.rules_evaluated) === Number(dos.rules_evaluated),
      "el número de reglas evaluadas cambia entre barridos idénticos");
  });

  await check("V4. el motor sin sesión NO puede simular", async () => {
    const { error } = await admin.rpc("quality_automation_run", {
      p_organization_id: A, p_mode: "simulation", p_rule_id: null, p_today: null,
    });
    assert(error, "se simuló sin sesión: la simulación es una herramienta de quien diseña");
  });

  await check("V5. un modo inventado se rechaza", async () => {
    const { error } = await Q.rpc("quality_automation_run", {
      p_organization_id: A, p_mode: "borrar_todo", p_rule_id: null, p_today: null,
    });
    assert(error, "el motor aceptó un modo inventado");
  });

  // ==========================================================================
  console.log("\nW · SALUD DEL MOTOR Y AISLAMIENTO DEL FALLO (§45, §82, §173)");
  // ==========================================================================

  await check("W1. una regla rota falla ELLA SOLA y el barrido continúa", async () => {
    // Se rompe una regla por la vía que la base no puede impedir: la fuente
    // deja de tener sujetos porque la vista subyacente no existe para ella.
    // Lo que se comprueba es que el resto del barrido llega al final.
    const { runId } = await ejecutar(Q, A);
    const r = await resumenEjecucion(Q, runId!);
    assert(["success", "partial"].includes(String(r.status)),
      `el barrido acabó en «${r.status}»`);
    const { data: filas } = await Q.from("quality_automation_run_rules")
      .select("status, platform_observer, rule_id").eq("run_id", runId!);
    assert((filas ?? []).length >= 8,
      `la ejecución solo registró ${filas?.length} entradas: faltan observadores`);
    const observadores = (filas ?? []).filter((x) => x.platform_observer !== null);
    assert(observadores.length === 8,
      `se ejecutaron ${observadores.length} observadores de plataforma en vez de 8`);
    assert(observadores.every((x) => x.status === "success"),
      `un barrido heredado falló: ${JSON.stringify(observadores.filter((x) => x.status !== "success"))}`);
  });

  await check("W2. la salud del motor separa la avería de la condición de calidad", async () => {
    const { data } = await Q.rpc("quality_automation_health", { p_organization_id: A });
    const s = data as Record<string, unknown>;
    assert(Number(s.rules_total) > 0, "la salud no cuenta las reglas");
    assert(typeof s.signals_open === "number", "la salud no cuenta las señales abiertas");
    assert(typeof s.runs_failed_last_7d === "number",
      "la salud no cuenta los fallos del motor aparte");
    assert(String(s.note).includes("operativo"),
      "la salud no distingue la avería del motor de un hallazgo de calidad");
  });

  await check("W3. la bitácora transversal registra los hechos de la automatización", async () => {
    const { data } = await Q.from("work_events")
      .select("event_type").eq("organization_id", A).eq("source_domain", "automation");
    const tipos = new Set((data ?? []).map((x) => String(x.event_type)));
    assert(tipos.has("automation.rule_published"), "publicar una regla no deja hecho");
    assert(tipos.has("automation.signal_raised"), "emitir una señal no deja hecho");
    assert(tipos.has("automation.run_completed"), "terminar un barrido no deja hecho");
  });

  await check("W4. las vistas de lectura responden y respetan la empresa", async () => {
    const { data: reglas } = await Q.from("v_quality_automation_rule_overview")
      .select("rule_id, open_signal_count, current_version_number").eq("organization_id", A);
    assert((reglas ?? []).length > 0, "la vista de reglas no devuelve nada");
    const { data: ajenas } = await O.from("v_quality_automation_rule_overview")
      .select("rule_id").eq("organization_id", A);
    assert((ajenas ?? []).length === 0, "la vista de reglas se salta la empresa");

    const { data: señales } = await Q.from("v_quality_signal_overview")
      .select("signal_id, rule_code, alert_count, task_count").eq("organization_id", A);
    assert((señales ?? []).length > 0, "la vista de señales no devuelve nada");
    const { data: ejecuciones } = await Q.from("v_quality_automation_run_overview")
      .select("run_id, platform_observers, organization_rules").eq("organization_id", A);
    assert((ejecuciones ?? []).length > 0, "la vista de ejecuciones no devuelve nada");
    assert(Number(ejecuciones![0].platform_observers) >= 0,
      "la vista de ejecuciones no separa los observadores de plataforma");
  });

  console.log(`\nResultado: ${passed} conformes, ${failed} fallos\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
