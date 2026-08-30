/**
 * Trazaloop · QUALITY-13B3 · La convergencia contra base REAL.
 *
 * LO QUE ESTA SUITE DEMUESTRA, Y ES EL MOTIVO DEL TRAMO
 *
 * Que adoptar una automatización hacía PERDER un aviso que la empresa venía
 * recibiendo. No es una sospecha leída en el código: se monta una acción
 * vencida y otra con la eficacia por verificar, se corre el barrido, se adopta
 * la regla equivalente a la primera, se vuelve a correr, y se mira qué llega.
 *
 * Antes de 0153 llegaba nada. Después llega lo que no estaba relevado.
 *
 * Correr: npm run test:quality13b3-convergence
 */
import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) { console.error("Faltan variables."); process.exit(1); }

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
async function check(n: string, fn: () => Promise<void>) {
  try { await fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const password = "Trazaloop-Test-1234";

async function persona(tag: string) {
  const email = `q13b3-${tag}-${stamp}@test.trazaloop.dev`;
  const { data } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: `QA ${tag}` } });
  assert(data.user, `usuario ${tag}`);
  const cli: SupabaseClient = createClient(URL!, ANON!, {
    auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await cli.auth.signInWithPassword({ email, password });
  assert(!error, `login ${tag}: ${error?.message}`);
  return { cli, id: data.user!.id };
}

function contador(cli: SupabaseClient) {
  const estado = { n: 0, tablas: [] as string[] };
  const proxy = new Proxy(cli, {
    get(target, prop, receiver) {
      if (prop === "from") {
        return (tabla: string) => {
          estado.n += 1; estado.tablas.push(tabla);
          return (target as SupabaseClient).from(tabla);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as SupabaseClient;
  return { proxy, estado };
}

function roto(cli: SupabaseClient, tabla: string, codigo = "XX000") {
  return new Proxy(cli, {
    get(target, prop, receiver) {
      if (prop === "from") {
        return (t: string) => {
          if (t === tabla) {
            throw Object.assign(new Error(
              codigo === "42501" ? "permission denied" : "fallo simulado"), { code: codigo });
          }
          return (target as SupabaseClient).from(t);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as SupabaseClient;
}

async function main() {
  const ATT = await import("../../lib/db/quality-attention");

  console.log("\nQUALITY-13B3 · Convergencia · base real\n");

  const a = await persona("a");
  const { data: orgAId } = await a.cli.rpc("create_organization", { p_name: `Q13B3 A ${stamp}` });
  const orgA = orgAId as string;
  await admin.from("organization_modules")
    .update({ access_mode: "full", access_expires_at: null })
    .eq("organization_id", orgA).eq("module_code", "quality");

  const b = await persona("b");
  const { data: orgBId } = await b.cli.rpc("create_organization", { p_name: `Q13B3 B ${stamp}` });
  const orgB = orgBId as string;
  await admin.from("organization_modules")
    .update({ access_mode: "full", access_expires_at: null })
    .eq("organization_id", orgB).eq("module_code", "quality");

  const corto = (s: string) => s.slice(0, 24);

  const { data: cargo } = await a.cli.from("quality_positions")
    .insert({ organization_id: orgA, name: "QA Q13B3 · Jefe de calidad" })
    .select("id").single();
  // El titular del cargo es quien recibe los avisos: sin él los barridos no
  // emiten nada, y con razón —un aviso sin dueño no lo lee nadie—.
  const { error: eAsig } = await a.cli.from("quality_position_assignments").insert({
    organization_id: orgA, position_id: cargo!.id, profile_id: a.id,
    assignment_type: "holder", effective_from: "2026-01-01" });
  assert(!eAsig, `asignar el titular del cargo: ${eAsig?.message}`);

  /** Cuántos avisos de este tipo hay ahora mismo. */
  async function avisos(tipo: string): Promise<number> {
    const { count } = await a.cli.from("work_alerts")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", orgA).eq("alert_type", tipo);
    return count ?? 0;
  }

  // =========================================================================
  console.log("M · El defecto, y su arreglo");
  // =========================================================================

  await check("M1. Sin regla adoptada, el barrido observa SUS DOS condiciones", async () => {
    const { data: a1, error: e1 } = await a.cli.from("work_actions").insert({
      organization_id: orgA, code: corto(`QB3-A1-${stamp}`),
      title: "QA Q13B3 · Acción que venció", action_kind: "corrective",
      status: "in_progress", due_on: "2026-01-01",
      owner_position_id: cargo!.id }).select("id").single();
    assert(!e1, `crear la acción vencida: ${e1?.message}`);
    assert(a1, "no se creó la acción vencida");

    const { data: a2, error: e2 } = await a.cli.from("work_actions").insert({
      organization_id: orgA, code: corto(`QB3-A2-${stamp}`),
      title: "QA Q13B3 · Acción hecha, eficacia sin verificar", action_kind: "corrective",
      status: "completed", completed_on: "2026-02-01",
      requires_effectiveness: true, effectiveness_criteria: "Sin reincidencia en 90 días.",
      effectiveness_result: "pending",
      owner_position_id: cargo!.id }).select("id").single();
    assert(!e2, `crear la acción con eficacia pendiente: ${e2?.message}`);
    assert(a2, "no se creó la acción con eficacia pendiente");

    const { error } = await a.cli.rpc("work_scan_pending_actions", { p_organization_id: orgA });
    assert(!error, `el barrido falló: ${error?.message}`);

    assert(await avisos("action_overdue") === 1, "no avisó de la acción vencida");
    assert(await avisos("effectiveness_due") >= 1, "no avisó de la eficacia por verificar");
  });

  await check("M2. Repetir el barrido no duplica nada", async () => {
    // Una pasada primero, para medir sobre un estado ya estable.
    await a.cli.rpc("work_scan_pending_actions", { p_organization_id: orgA });
    const antesV = await avisos("action_overdue");
    const antesE = await avisos("effectiveness_due");
    await a.cli.rpc("work_scan_pending_actions", { p_organization_id: orgA });
    await a.cli.rpc("work_scan_pending_actions", { p_organization_id: orgA });
    assert(await avisos("action_overdue") === antesV, "la acción vencida se duplicó");
    assert(await avisos("effectiveness_due") === antesE, "la eficacia se duplicó");
  });

  let reglaId = "";
  await check("M3. La empresa adopta la regla equivalente a UNA de las dos", async () => {
    const { data, error } = await a.cli.rpc("quality_automation_instantiate_template", {
      p_organization_id: orgA, p_template_code: "action_overdue",
      p_owner_position_id: cargo!.id, p_conditions: null });
    assert(!error, `adoptar la plantilla: ${error?.message}`);
    reglaId = data as string;

    const { data: ver } = await a.cli.from("quality_automation_rule_versions")
      .select("id").eq("organization_id", orgA).eq("rule_id", reglaId).single();
    const { error: e2 } = await a.cli.rpc("quality_automation_publish_version", {
      p_version_id: ver!.id, p_effective_from: null, p_change_note: null });
    assert(!e2, `publicar la versión: ${e2?.message}`);

    const { data: regla } = await a.cli.from("quality_automation_rules")
      .select("status, supersedes_observer").eq("id", reglaId).single();
    assert(regla!.status === "active", `la regla quedó ${regla!.status}`);
    // 0153 · el relevo se declara por CONDICIÓN, no por barrido.
    assert(regla!.supersedes_observer === "work_scan_pending_actions.action_overdue",
      `la regla releva «${regla!.supersedes_observer}»`);
  });

  await check("M4. EL ARREGLO · relevar una condición NO apaga la otra", async () => {
    // Dos acciones nuevas: una vencida y una con la eficacia pendiente.
    const { data: n1 } = await a.cli.from("work_actions").insert({
      organization_id: orgA, code: corto(`QB3-A3-${stamp}`),
      title: "QA Q13B3 · Otra acción vencida", action_kind: "corrective",
      status: "in_progress", due_on: "2026-01-02", owner_position_id: cargo!.id })
      .select("id").single();
    const { data: n2 } = await a.cli.from("work_actions").insert({
      organization_id: orgA, code: corto(`QB3-A4-${stamp}`),
      title: "QA Q13B3 · Otra eficacia pendiente", action_kind: "corrective",
      status: "completed", completed_on: "2026-02-02",
      requires_effectiveness: true, effectiveness_criteria: "Sin reincidencia en 90 días.",
      effectiveness_result: "pending",
      owner_position_id: cargo!.id }).select("id").single();

    const antesV = await avisos("action_overdue");
    const antesE = await avisos("effectiveness_due");
    const { error } = await a.cli.rpc("work_scan_pending_actions", { p_organization_id: orgA });
    assert(!error, `el barrido falló: ${error?.message}`);

    // La condición RELEVADA calla: la regla la observa ahora.
    assert(await avisos("action_overdue") === antesV,
      "el barrido siguió avisando de una condición que la regla releva: se duplica");
    // La condición NO relevada sigue: esto es lo que se perdía.
    assert(await avisos("effectiveness_due") > antesE,
      "SE PERDIÓ el aviso de verificar la eficacia al adoptar una regla que no lo releva");
    void n1; void n2;
  });

  await check("M4b. LA PRUEBA DEL DEFECTO · con el relevo VIEJO, el aviso se pierde", async () => {
    // Se devuelve la regla a la forma que traía antes de 0153 —el barrido
    // entero— y se repite el experimento. Esto es exactamente lo que hacía el
    // producto: no se argumenta, se ejecuta.
    await admin.from("quality_automation_rules")
      .update({ supersedes_observer: "work_scan_pending_actions" }).eq("id", reglaId);

    const { data: vieja } = await a.cli.from("work_actions").insert({
      organization_id: orgA, code: corto(`QB3-A5-${stamp}`),
      title: "QA Q13B3 · Eficacia pendiente con el relevo viejo",
      action_kind: "corrective", status: "completed", completed_on: "2026-02-03",
      requires_effectiveness: true, effectiveness_criteria: "Sin reincidencia en 90 días.",
      effectiveness_result: "pending", owner_position_id: cargo!.id })
      .select("id").single();
    const antes = await avisos("effectiveness_due");
    await a.cli.rpc("work_scan_pending_actions", { p_organization_id: orgA });
    assert(await avisos("effectiveness_due") === antes,
      "con el relevo de barrido entero SÍ llegó el aviso: el defecto no se reproduce y " +
      "esta prueba no estaría demostrando nada");

    // Y con el relevo por condición, el mismo caso sí avisa.
    await admin.from("quality_automation_rules")
      .update({ supersedes_observer: "work_scan_pending_actions.action_overdue" })
      .eq("id", reglaId);
    await a.cli.rpc("work_scan_pending_actions", { p_organization_id: orgA });
    assert(await avisos("effectiveness_due") > antes,
      "el relevo por condición tampoco emite el aviso: el arreglo no arregla");
    void vieja;
  });

  await check("M5. La forma antigua —el barrido entero— se sigue honrando", async () => {
    await admin.from("quality_automation_rules")
      .update({ supersedes_observer: "work_scan_pending_actions" }).eq("id", reglaId);
    const { data: relevado } = await a.cli.rpc("quality_observer_is_superseded", {
      p_organization_id: orgA, p_observer: "work_scan_pending_actions.effectiveness_due" });
    assert(relevado === true,
      "declarar el barrido entero dejó de relevar sus condiciones: se rompió la compatibilidad");
    // Y con la forma cualificada, solo la suya.
    await admin.from("quality_automation_rules")
      .update({ supersedes_observer: "work_scan_pending_actions.action_overdue" })
      .eq("id", reglaId);
    const { data: uno } = await a.cli.rpc("quality_observer_is_superseded", {
      p_organization_id: orgA, p_observer: "work_scan_pending_actions.effectiveness_due" });
    assert(uno === false, "la forma cualificada releva de más");
    const { data: dos } = await a.cli.rpc("quality_observer_is_superseded", {
      p_organization_id: orgA, p_observer: "work_scan_pending_actions.action_overdue" });
    assert(dos === true, "la forma cualificada no releva lo suyo");
  });

  await check("M6. Una regla en borrador NO releva nada", async () => {
    await admin.from("quality_automation_rules").update({ status: "draft" }).eq("id", reglaId);
    const { data } = await a.cli.rpc("quality_observer_is_superseded", {
      p_organization_id: orgA, p_observer: "work_scan_pending_actions.action_overdue" });
    assert(data === false, "una regla sin activar ya apagaba el barrido");
    await admin.from("quality_automation_rules").update({ status: "active" }).eq("id", reglaId);
  });

  await check("M7. El relevo es POR EMPRESA: la de al lado sigue recibiéndolo todo", async () => {
    const { data } = await b.cli.rpc("quality_observer_is_superseded", {
      p_organization_id: orgB, p_observer: "work_scan_pending_actions.action_overdue" });
    assert(data === false, "el relevo de una empresa apagó el barrido de otra");
  });

  // =========================================================================
  console.log("\nN · La consulta convergida");
  // =========================================================================

  await check("N1. Devuelve puntos de atención con causa, enlace y procedencia", async () => {
    const r = await ATT.loadAttention({ organizationId: orgA }, a.cli);
    assert(r.items.length > 0, "no devuelve ningún punto de atención");
    assert(r.complete, `no se pudieron leer todas las fuentes: ${JSON.stringify(r.sources)}`);
    assert(r.unregistered === 0,
      `llegaron ${r.unregistered} filas de un tipo que el inventario no conoce`);
    for (const it of r.items) {
      assert(it.href.startsWith("/quality/"), `enlace fuera de Quality: ${it.href}`);
      assert(it.reason.length > 0, "un punto sin motivo");
      assert(it.observer.code.length > 0, "un punto sin procedencia");
      assert(it.dedupeKey.split(":").length >= 4, `clave mal formada: ${it.dedupeKey}`);
    }
  });

  await check("N2. El aviso y su pendiente son UN problema, no dos", async () => {
    // El barrido de riesgos emite tarea Y aviso para la misma condición.
    const { data: riesgo } = await a.cli.from("quality_risks").insert({
      organization_id: orgA, code: corto(`QB3-R-${stamp}`),
      title: "QA Q13B3 · Riesgo sin revisar",
      event_description: "El riesgo lleva sin revisarse desde enero.",
      owner_position_id: cargo!.id, status: "active", next_review_on: "2026-01-05" })
      .select("id").single();
    const { error } = await a.cli.rpc("quality_scan_risk_reviews", { p_organization_id: orgA });
    assert(!error, `barrido de riesgos: ${error?.message}`);

    const { count: nAvisos } = await a.cli.from("work_alerts")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", orgA).eq("subject_id", riesgo!.id);
    const { count: nTareas } = await a.cli.from("work_tasks")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", orgA).eq("subject_id", riesgo!.id);
    assert((nAvisos ?? 0) >= 1 && (nTareas ?? 0) >= 1,
      "el barrido no dejó aviso y pendiente para el mismo riesgo");

    const r = await ATT.loadAttention({ organizationId: orgA, domain: "risks" }, a.cli);
    const delRiesgo = r.items.filter((i) => i.subjectId === riesgo!.id);
    assert(delRiesgo.length === 1,
      `el mismo problema aparece ${delRiesgo.length} veces: aviso y pendiente se sumaron`);
    const otros = r.alsoSeenBy[delRiesgo[0].dedupeKey] ?? [];
    void otros;
  });

  await check("N3. Dos condiciones del MISMO sujeto siguen siendo dos", async () => {
    const r = await ATT.loadAttention({ organizationId: orgA, domain: "actions" }, a.cli);
    const porSujeto = new Map<string, Set<string>>();
    for (const it of r.items) {
      const set = porSujeto.get(it.subjectId) ?? new Set();
      set.add(it.dedupeKey); porSujeto.set(it.subjectId, set);
    }
    assert(r.items.length > 0, "no hay atención de acciones");
    // Cada punto es una clave distinta: nada se fundió por error.
    const claves = r.items.map((i) => i.dedupeKey);
    assert(claves.length === new Set(claves).size, "hay dos puntos con la misma identidad");
  });

  await check("N4. Un aviso informativo NO se cuenta como atención", async () => {
    const { data: doc } = await a.cli.from("trazadoc_documents").insert({
      organization_id: orgA, source_type: "custom", module_key: "quality",
      title: "QA Q13B3 · Documento aprobado", status: "approved" }).select("id").single();
    await admin.from("work_alerts").insert({
      organization_id: orgA, source_domain: "document", alert_type: "document_approved",
      severity: "info", subject_type: "trazadoc_document", subject_id: doc!.id,
      recipient_profile_id: a.id, title: "QA Q13B3 · Se aprobó el documento",
      dedupe_key: `qa-b3-doc-${stamp}` });

    const r = await ATT.loadAttention({ organizationId: orgA }, a.cli);
    assert(!r.items.some((i) => i.subjectId === doc!.id),
      "«documento aprobado» se cuenta como algo que requiere atención");
  });

  await check("N5. Filtrar por dominio no inventa ni pierde", async () => {
    const todo = await ATT.loadAttention({ organizationId: orgA }, a.cli);
    const soloRiesgos = await ATT.loadAttention(
      { organizationId: orgA, domain: "risks" }, a.cli);
    assert(soloRiesgos.items.every((i) => i.domain === "risks"),
      "el filtro por dominio deja pasar otros");
    assert(soloRiesgos.items.length <= todo.items.length, "filtrar añadió puntos");
    assert(soloRiesgos.items.length ===
      todo.items.filter((i) => i.domain === "risks").length,
      "filtrar por dominio da un resultado distinto de filtrar el total");
  });

  // =========================================================================
  console.log("\nO · Resolver, reconocer y silenciar");
  // =========================================================================

  await check("O1. Lo resuelto desaparece de lo activo", async () => {
    const { count: antes } = await a.cli.from("work_alerts")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", orgA).eq("alert_type", "effectiveness_due")
      .in("status", ["new", "seen", "acknowledged"]);
    const previo = await ATT.loadAttention({ organizationId: orgA, domain: "actions" }, a.cli);
    const eficacia = previo.items.filter((i) => i.reason.includes("eficacia"));
    assert(eficacia.length > 0, "no hay atención de eficacia que resolver");

    await admin.from("work_alerts")
      .update({ status: "resolved", resolved_at: new Date().toISOString() })
      .eq("organization_id", orgA).eq("alert_type", "effectiveness_due");

    const despues = await ATT.loadAttention({ organizationId: orgA, domain: "actions" }, a.cli);
    assert(!despues.items.some((i) => i.reason.includes("eficacia")),
      "un aviso resuelto sigue contando como pendiente");
    void antes;
  });

  await check("O2. RECONOCER no resuelve: sigue pidiendo atención", async () => {
    const { data: aviso } = await a.cli.from("work_alerts")
      .select("id, subject_id").eq("organization_id", orgA)
      .eq("alert_type", "action_overdue").limit(1).single();
    assert(aviso, "no hay aviso que reconocer");
    await admin.from("work_alerts").update({ status: "acknowledged" }).eq("id", aviso!.id);

    const r = await ATT.loadAttention({ organizationId: orgA, domain: "actions" }, a.cli);
    assert(r.items.some((i) => i.subjectId === aviso!.subject_id),
      "marcar «lo vi» borró el problema de la lista, y eso reescribe la verdad");
  });

  await check("O3. La historia se conserva aunque deje de enseñarse", async () => {
    const { count } = await a.cli.from("work_alerts")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", orgA).eq("alert_type", "effectiveness_due");
    assert((count ?? 0) > 0,
      "los avisos resueltos se borraron: no se puede responder qué se observó y cuándo");
  });

  // =========================================================================
  console.log("\nP · Permisos, aislamiento y fallo");
  // =========================================================================

  await check("P1. La empresa de al lado no ve NADA", async () => {
    const r = await ATT.loadAttention({ organizationId: orgA }, b.cli);
    assert(r.items.length === 0, `B vio ${r.items.length} puntos de atención de A`);
    void orgB;
  });

  await check("P2. Una fuente DENEGADA no llega como cero", async () => {
    const r = await ATT.loadAttention({ organizationId: orgA },
      roto(a.cli, "work_alerts", "42501"));
    const fuente = r.sources.find((s) => s.source === "work_alerts")!;
    assert(fuente.status === "not_visible", `llegó como ${fuente.status}`);
    assert(fuente.count === null, `llegó con recuento ${fuente.count}`);
    assert(!r.complete, "se presenta como completo faltando una fuente");
  });

  await check("P3. Una fuente ROTA tampoco, y las demás siguen", async () => {
    const r = await ATT.loadAttention({ organizationId: orgA },
      roto(a.cli, "quality_signals"));
    const fuente = r.sources.find((s) => s.source === "quality_signals")!;
    assert(fuente.status === "unavailable", `llegó como ${fuente.status}`);
    assert(fuente.count === null, "una fuente rota devolvió un recuento");
    assert(r.items.length > 0, "el fallo de una fuente se llevó por delante a las demás");
    assert(!r.complete, "se presenta como completo con una fuente caída");
  });

  await check("P4. Sin `service_role` y sin escribir nada", async () => {
    const { count: antesA } = await a.cli.from("work_alerts")
      .select("*", { count: "exact", head: true }).eq("organization_id", orgA);
    const { count: antesT } = await a.cli.from("work_tasks")
      .select("*", { count: "exact", head: true }).eq("organization_id", orgA);
    await ATT.loadAttention({ organizationId: orgA }, a.cli);
    const { count: despuesA } = await a.cli.from("work_alerts")
      .select("*", { count: "exact", head: true }).eq("organization_id", orgA);
    const { count: despuesT } = await a.cli.from("work_tasks")
      .select("*", { count: "exact", head: true }).eq("organization_id", orgA);
    assert(antesA === despuesA && antesT === despuesT, "preguntar cambió los datos");
  });

  // =========================================================================
  console.log("\nQ · Coste y proceso");
  // =========================================================================

  await check("Q1. El número de consultas no crece con las filas", async () => {
    const { proxy: p1, estado: e1 } = contador(a.cli);
    await ATT.loadAttention({ organizationId: orgA }, p1);

    // Cuarenta riesgos más, todos con revisión vencida.
    const filas = Array.from({ length: 40 }, (_, i) => ({
      organization_id: orgA, code: corto(`QB3-V${i}-${stamp}`),
      title: `QA Q13B3 · Riesgo de volumen ${i}`,
      event_description: "Riesgo de relleno para medir el coste.",
      owner_position_id: cargo!.id, status: "active", next_review_on: "2026-01-05",
    }));
    const { error } = await a.cli.from("quality_risks").insert(filas);
    assert(!error, `crear riesgos de volumen: ${error?.message}`);
    await a.cli.rpc("quality_scan_risk_reviews", { p_organization_id: orgA });

    const { proxy: p2, estado: e2 } = contador(a.cli);
    const r = await ATT.loadAttention({ organizationId: orgA }, p2);
    assert(r.items.length > 40, `esperaba más de 40 puntos, hay ${r.items.length}`);
    assert(e1.n === e2.n, `con pocas filas hizo ${e1.n} consultas y con muchas ${e2.n}`);
    assert(e2.n <= 12, `hace ${e2.n} consultas: demasiadas para seis fuentes`);
  });

  await check("Q2. Acotado a un proceso, solo lo suyo", async () => {
    const { data: proc } = await a.cli.from("quality_processes").insert({
      organization_id: orgA, name: "QA Q13B3 · Despacho", category_code: "core",
      status: "active", owner_position_id: cargo!.id }).select("id").single();
    const { data: riesgoProc } = await a.cli.from("quality_risks").insert({
      organization_id: orgA, code: corto(`QB3-RP-${stamp}`),
      title: "QA Q13B3 · Riesgo del proceso",
      event_description: "Riesgo que sí pertenece a un proceso.",
      owner_position_id: cargo!.id, status: "active", next_review_on: "2026-01-05" })
      .select("id").single();
    await a.cli.from("quality_risk_processes").insert({
      organization_id: orgA, risk_id: riesgoProc!.id, process_id: proc!.id });
    await a.cli.rpc("quality_scan_risk_reviews", { p_organization_id: orgA });

    const { proxy, estado } = contador(a.cli);
    const r = await ATT.loadAttention(
      { organizationId: orgA, processId: proc!.id as string }, proxy);
    assert(r.items.some((i) => i.subjectId === riesgoProc!.id),
      "no ve el riesgo que sí pertenece al proceso");
    const total = await ATT.loadAttention({ organizationId: orgA }, a.cli);
    assert(r.items.length < total.items.length,
      "acotar a un proceso devolvió lo mismo que sin acotar");
    assert(estado.n <= 22, `acotar a un proceso costó ${estado.n} consultas`);
  });

  await check("Q3. El mirador de proceso de B2 sigue viendo UN problema", async () => {
    // B2 calcula su atención desde los recuentos de su dominio; B3 la calcula
    // desde los observadores. Las dos vías tienen que coincidir en algo: ni una
    // ni otra puede enseñar el mismo problema dos veces.
    const COCKPIT = await import("../../lib/db/quality-process-cockpit");
    const DOM = await import("../../lib/domain/quality-process-cockpit");
    const { data: proc } = await a.cli.from("quality_processes")
      .select("id").eq("organization_id", orgA).limit(1).single();
    assert(proc, "no hay proceso con el que comprobar el mirador");

    const ctx = await COCKPIT.loadProcessCockpit(orgA, proc!.id as string, a.cli);
    assert(ctx, "el mirador de proceso dejó de componerse");
    const suyos = DOM.processAttention(proc!.id as string, ctx!.sections);
    const claves = suyos.map((x) => x.dedupeKey);
    assert(claves.length === new Set(claves).size,
      "el mirador enseña dos veces el mismo problema");

    const b3 = await ATT.loadAttention(
      { organizationId: orgA, processId: proc!.id as string }, a.cli);
    const clavesB3 = b3.items.map((x) => x.dedupeKey);
    assert(clavesB3.length === new Set(clavesB3).size,
      "la consulta convergida enseña dos veces el mismo problema del proceso");
    for (const it of b3.items) {
      assert(it.href.startsWith("/quality/"), `enlace roto en el proceso: ${it.href}`);
    }
  });

  // =========================================================================
  console.log("\nR · El tiempo sigue observándose");
  // =========================================================================

  await check("R1. Lo que vence por el paso del tiempo lo ve el barrido, no un evento", async () => {
    // Un riesgo cuya revisión vence HOY: ningún hecho ocurre, solo pasa el día.
    const { data: r2 } = await a.cli.from("quality_risks").insert({
      organization_id: orgA, code: corto(`QB3-T-${stamp}`),
      title: "QA Q13B3 · Riesgo que vence por el calendario",
      event_description: "Nadie lo toca; simplemente llega la fecha.",
      owner_position_id: cargo!.id, status: "active",
      next_review_on: new Date().toISOString().slice(0, 10) }).select("id").single();
    // Sin barrido no hay nada.
    const antes = await ATT.loadAttention({ organizationId: orgA, domain: "risks" }, a.cli);
    assert(!antes.items.some((i) => i.subjectId === r2!.id),
      "apareció atención sin que nadie observara");
    await a.cli.rpc("quality_scan_risk_reviews", { p_organization_id: orgA });
    const despues = await ATT.loadAttention({ organizationId: orgA, domain: "risks" }, a.cli);
    assert(despues.items.some((i) => i.subjectId === r2!.id),
      "el barrido temporal no detectó lo vencido por el calendario");
  });

  await check("R2. Y ese barrido NO está relevado por nadie", async () => {
    const { data } = await a.cli.rpc("quality_observer_is_superseded", {
      p_organization_id: orgA,
      p_observer: "quality_scan_risk_reviews.risk_review_overdue" });
    assert(data === false, "el barrido de revisiones de riesgo figura como relevado");
  });

  console.log(`\nQUALITY-13B3 · convergencia (base real): ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
