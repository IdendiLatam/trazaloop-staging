/**
 * Trazaloop · QUALITY-12.3B3B · Partes interesadas en el motor de automatización.
 *
 * Contra base REAL, con la sesión de una persona. Lo que se prueba aquí es que
 * el dominio entró por la puerta de todos: una fuente más, con sus sujetos
 * observables, sus contratos de evento y sus plantillas. Y que NO trajo un
 * segundo motor detrás.
 *
 * Correr: npm run test:quality123b3b-automation
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
const hoy = new Date().toISOString().slice(0, 10);
const dia = (o: number) => new Date(Date.now() + o * 86_400_000).toISOString().slice(0, 10);

async function nuevoUsuario(tag: string) {
  const email = `q123b3b-${tag}-${stamp}@test.trazaloop.dev`;
  const { data } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: `QA ${tag}` } });
  assert(data.user, `usuario ${tag}`);
  const cli: SupabaseClient = createClient(URL!, ANON!, {
    auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await cli.auth.signInWithPassword({ email, password });
  assert(!error, `login ${tag}: ${error?.message}`);
  return { cli, id: data.user.id };
}

async function main() {
  const IP = await import("../../lib/db/quality-interested-parties");

  console.log("\nQUALITY-12.3B3B · Automatización · base real\n");

  const a = await nuevoUsuario("a");
  const { data: orgAId } = await a.cli.rpc("create_organization", { p_name: `Q123B3B A ${stamp}` });
  const orgA = orgAId as string;
  await admin.from("organization_modules")
    .update({ access_mode: "full", access_expires_at: null })
    .eq("organization_id", orgA).eq("module_code", "quality");

  const b = await nuevoUsuario("b");
  const { data: orgBId } = await b.cli.rpc("create_organization", { p_name: `Q123B3B B ${stamp}` });
  const orgB = orgBId as string;

  // --- Datos: una parte pertinente sin estrategia, un requisito sin proceso,
  //     y una estrategia vigente sin cargo, sin método y con la revisión pasada.
  await IP.seedCategories(orgA, a.cli);
  const cats = await IP.listCategories(orgA, {}, a.cli);
  const catCli = cats.find((c) => c.code === "customers")!;
  const { data: parte } = await a.cli.from("quality_external_parties")
    .insert({ organization_id: orgA, legal_name: `QA Q123 Andina ${stamp}` })
    .select("id").single();
  const alta = await IP.createAssessment(orgA, {
    categoryId: catCli.id, subjectKind: "external_party", subjectId: parte!.id,
    relevanceStatus: "relevant",
  }, a.cli);
  assert(alta.ok, "no se pudo crear el análisis");
  const req = await IP.createRequirement(orgA, {
    assessmentId: alta.data, entryKind: "requirement", requirementKind: "contractual",
    title: "QA Q123 · SLA de 48 horas", relevanceStatus: "relevant",
  }, a.cli);
  assert(req.ok, "no se pudo crear el requisito");

  // =========================================================================
  await check("A. Existe UNA fuente por sujeto observable, y ni una más", async () => {
    const { data } = await a.cli.from("quality_automation_sources")
      .select("code, domain, subject_type, supported_triggers")
      .eq("domain", "interested_parties").order("position_order");
    assert((data ?? []).length === 3, `esperaba 3 fuentes, hay ${(data ?? []).length}`);
    const porCodigo = new Map((data ?? []).map((s) => [s.code as string, s]));
    for (const [code, sujeto] of [
      ["interested_party", "quality_stakeholder_assessment"],
      ["interested_party_requirement", "quality_stakeholder_requirement"],
      ["interested_party_strategy", "quality_stakeholder_strategy"],
    ] as const) {
      const s = porCodigo.get(code);
      assert(s, `falta la fuente ${code}`);
      assert(s!.subject_type === sujeto, `${code} observa ${s!.subject_type}`);
      assert((s!.supported_triggers as string[]).includes("event"),
        `${code} no admite reglas por evento, y los cinco hechos existen`);
    }
    // Ni una fuente por evento: cinco eventos, tres fuentes.
    const { count } = await a.cli.from("quality_automation_event_catalog")
      .select("event_type", { count: "exact", head: true }).eq("domain", "interested_parties");
    assert((count ?? 0) === 5, `esperaba 5 eventos catalogados, hay ${count}`);
  });

  await check("B. Los CINCO eventos tienen contrato, y cada uno resuelve a su fuente", async () => {
    const { data: eventos } = await a.cli.from("quality_automation_event_catalog")
      .select("event_type, subject_type").eq("domain", "interested_parties");
    const { data: contratos } = await a.cli.from("quality_automation_event_contracts")
      .select("subject_type, source_code, resolver");
    const porSujeto = new Map((contratos ?? []).map((c) => [c.subject_type as string, c]));
    for (const e of eventos ?? []) {
      const c = porSujeto.get(e.subject_type as string);
      assert(c, `el evento ${e.event_type} no tiene contrato para ${e.subject_type}`);
      assert((c!.source_code as string).startsWith("interested_party"),
        `${e.event_type} resuelve a ${c!.source_code}`);
      assert(c!.resolver === "direct", `${e.event_type} usa un resolutor inesperado`);
    }
  });

  await check("C. Los campos observables no incluyen NI UN dato personal", async () => {
    const { data } = await a.cli.from("quality_automation_source_fields")
      .select("source_code, field, data_type, allowed_operators, enum_values")
      .like("source_code", "interested_party%");
    assert((data ?? []).length >= 15, `esperaba al menos 15 campos, hay ${(data ?? []).length}`);
    for (const f of data ?? []) {
      assert(!/email|correo|phone|telefono|contact|person_id|profile/i.test(f.field as string),
        `el campo ${f.field} huele a dato personal`);
    }
    // El cargo se observa por su NOMBRE y solo para saber si lo hay.
    const cargo = (data ?? []).find((f) => f.field === "owner_position");
    assert(cargo, "no se puede observar si una estrategia tiene cargo responsable");
    assert((cargo!.allowed_operators as string[]).includes("is_empty"),
      "«sin cargo responsable» no es observable");
  });

  await check("D. Los sujetos se materializan con hechos correctos", async () => {
    const { data, error } = await a.cli.rpc("quality_automation_subjects", {
      p_organization_id: orgA, p_source_code: "interested_party", p_today: hoy });
    assert(!error, `sujetos: ${error?.message}`);
    const filas = (data ?? []) as { subject_id: string; facts: Record<string, unknown> }[];
    assert(filas.length === 1, `esperaba 1 parte observable, hay ${filas.length}`);
    const f = filas[0].facts;
    assert(f.relevance_status === "relevant", "la pertinencia no llega a los hechos");
    assert(Number(f.active_strategy_count) === 0, "cuenta estrategias que no existen");
    assert(Number(f.relevant_requirement_count) === 1, "no cuenta el requisito pertinente");
    assert(Number(f.requirements_without_process) === 1,
      "no ve que el requisito no está en ningún proceso");
  });

  await check("E. Un análisis SUCEDIDO deja de observarse", async () => {
    const suc = await IP.supersedeAssessment(orgA, {
      assessmentId: alta.data, relevanceStatus: "relevant",
    }, a.cli);
    assert(suc.ok, `suceder: ${suc.ok ? "" : suc.message}`);
    const { data } = await a.cli.rpc("quality_automation_subjects", {
      p_organization_id: orgA, p_source_code: "interested_party", p_today: hoy });
    const filas = (data ?? []) as { subject_id: string }[];
    assert(filas.length === 1, `esperaba 1 sujeto vigente, hay ${filas.length}`);
    assert(filas[0].subject_id === suc.data,
      "se observa el análisis sucedido en vez del vigente");
  });

  await check("F. Una estrategia sin cargo y sin método es observable como tal", async () => {
    const { data: vigente } = await a.cli.from("quality_stakeholder_assessments")
      .select("id").eq("organization_id", orgA).is("effective_to", null).single();
    const est = await IP.createStrategy(orgA, {
      assessmentId: vigente!.id, title: "QA Q123 · Plan sin dueño",
      status: "active", nextReviewOn: dia(-10),
    }, a.cli);
    assert(est.ok, `estrategia: ${est.ok ? "" : est.message}`);

    const { data } = await a.cli.rpc("quality_automation_subjects", {
      p_organization_id: orgA, p_source_code: "interested_party_strategy", p_today: hoy });
    const filas = (data ?? []) as { facts: Record<string, unknown> }[];
    assert(filas.length === 1, `esperaba 1 estrategia observable, hay ${filas.length}`);
    const f = filas[0].facts;
    assert(f.status === "active", "el estado no llega");
    assert(f.owner_position === null, "declara un cargo que no hay");
    assert(f.monitoring_method === null, "declara un método que no hay");
    assert(f.next_review_on === dia(-10), "la fecha de revisión no llega");
  });

  await check("G. Las cinco plantillas existen, y NINGUNA está activa", async () => {
    const { data } = await a.cli.from("quality_automation_rule_templates")
      .select("code, source_code, severity, conditions, outputs")
      .like("source_code", "interested_party%");
    assert((data ?? []).length === 5, `esperaba 5 plantillas, hay ${(data ?? []).length}`);
    for (const t of data ?? []) {
      const salidas = (t.outputs as { kind: string }[]).map((o) => o.kind);
      assert(salidas.includes("CREATE_SIGNAL"), `${t.code} no abre señal`);
      assert(!salidas.includes("CREATE_TASK"),
        `${t.code} crea una tarea por omisión: quién y cuándo lo decide la empresa`);
      assert((t.conditions as unknown[]).length >= 2,
        `${t.code} tiene una condición demasiado laxa`);
    }
    // Una plantilla NO es una regla. Sin adopción no hay nada vigilando.
    const { count } = await a.cli.from("quality_automation_rules")
      .select("id", { count: "exact", head: true }).eq("organization_id", orgA);
    assert((count ?? 0) === 0,
      `sembrar el módulo activó ${count} regla(s): eso es correo que nadie pidió`);
  });

  await check("H. La regla adoptada evalúa, coincide y abre UNA señal", async () => {
    const { data: plantilla } = await a.cli.from("quality_automation_rule_templates")
      .select("*").eq("code", "stakeholder_strategy_without_owner").single();
    // Se adopta e IMPRIME versión, que es como una plantilla se convierte en
    // algo que vigila. Sin publicar, la regla existe y no mira nada.
    const { data: reglaId, error } = await a.cli.rpc("quality_automation_instantiate_template", {
      p_organization_id: orgA, p_template_code: plantilla!.code as string,
      p_owner_position_id: null, p_conditions: null,
    });
    assert(!error, `adoptar: ${error?.message}`);
    assert(reglaId, "la adopción no devolvió regla");

    const { data: version } = await a.cli.from("quality_automation_rule_versions")
      .select("id").eq("rule_id", reglaId as string).single();
    const { error: e3 } = await a.cli.rpc("quality_automation_publish_version", {
      p_version_id: version!.id, p_effective_from: hoy, p_change_note: "QA Q123",
    });
    assert(!e3, `publicar: ${e3?.message}`);

    const { error: e2 } = await a.cli.rpc("quality_automation_run", {
      p_organization_id: orgA, p_mode: "live", p_rule_id: null, p_today: hoy,
    });
    assert(!e2, `ejecutar: ${e2?.message}`);

    const { data: senales } = await a.cli.from("quality_signals")
      .select("id, subject_type, domain, dedupe_key, detection_count")
      .eq("organization_id", orgA).is("resolved_at", null);
    assert((senales ?? []).length === 1, `esperaba 1 señal, hay ${(senales ?? []).length}`);
    assert(senales![0].subject_type === "quality_stakeholder_strategy",
      `la señal habla de ${senales![0].subject_type}`);
    assert(senales![0].domain === "interested_parties", "la señal no declara su dominio");

    // Y el segundo barrido NO abre una segunda: misma condición, misma señal.
    await a.cli.rpc("quality_automation_run",
      { p_organization_id: orgA, p_mode: "live", p_rule_id: null, p_today: hoy });
    const { data: otra } = await a.cli.from("quality_signals")
      .select("id, detection_count").eq("organization_id", orgA).is("resolved_at", null);
    assert((otra ?? []).length === 1, `el segundo barrido abrió ${(otra ?? []).length} señales`);
    assert(Number(otra![0].detection_count) >= 2, "no se registró la segunda detección");
  });

  await check("I. Corregir el hueco RESUELVE la señal sola", async () => {
    const { data: pos } = await a.cli.from("quality_positions")
      .insert({ organization_id: orgA, name: "QA Q123 · Coordinador" }).select("id").single();
    const { data: est } = await a.cli.from("quality_stakeholder_strategies")
      .select("id").eq("organization_id", orgA).single();
    const upd = await IP.updateStrategy(orgA, est!.id, { ownerPositionId: pos!.id }, a.cli);
    assert(upd.ok, `asignar cargo: ${upd.ok ? "" : upd.message}`);

    await a.cli.rpc("quality_automation_run",
      { p_organization_id: orgA, p_mode: "live", p_rule_id: null, p_today: hoy });
    const { data: abiertas } = await a.cli.from("quality_signals")
      .select("id").eq("organization_id", orgA).is("resolved_at", null);
    assert((abiertas ?? []).length === 0,
      "la señal sigue abierta después de corregir lo que la abrió");
  });

  await check("J. Otra empresa no ve ni los sujetos ni las señales", async () => {
    const { data } = await b.cli.rpc("quality_automation_subjects", {
      p_organization_id: orgA, p_source_code: "interested_party", p_today: hoy });
    assert((data ?? []).length === 0, "B observó los sujetos de A");
    const { data: s } = await b.cli.from("quality_signals").select("id")
      .eq("organization_id", orgA);
    assert((s ?? []).length === 0, "B leyó las señales de A");
    void orgB;
  });

  await check("K. Los hechos del dominio se emiten solo tras un cambio real", async () => {
    const { data: antes } = await a.cli.from("work_events").select("id")
      .eq("organization_id", orgA).like("event_type", "interested_party.%");
    const n = (antes ?? []).length;
    assert(n > 0, "no se emitió ningún hecho del dominio en todo el recorrido");

    // Una lectura no emite nada.
    await IP.searchAssessments(orgA, {}, a.cli);
    await IP.getSummary(orgA, undefined, a.cli);
    const { data: despues } = await a.cli.from("work_events").select("id")
      .eq("organization_id", orgA).like("event_type", "interested_party.%");
    assert((despues ?? []).length === n, "leer emitió hechos");

    // Una mutación RECHAZADA tampoco.
    const malo = await IP.createRequirement(orgA, {
      assessmentId: "00000000-0000-0000-0000-000000000000",
      entryKind: "need", title: "no debería entrar",
    }, a.cli);
    assert(!malo.ok, "se aceptó un requisito de un análisis inexistente");
    const { data: final } = await a.cli.from("work_events").select("id")
      .eq("organization_id", orgA).like("event_type", "interested_party.%");
    assert((final ?? []).length === n, "una mutación fallida emitió un hecho");
  });

  await check("L. Un reintento del mismo cambio no duplica el hecho", async () => {
    const { data: est } = await a.cli.from("quality_stakeholder_strategies")
      .select("id").eq("organization_id", orgA).single();
    for (let i = 0; i < 3; i += 1) {
      await a.cli.rpc("quality_emit_stakeholder_change_event", {
        p_owner_kind: "strategy", p_owner_id: est!.id, p_change: "reintento",
      });
    }
    const { data } = await a.cli.from("work_events").select("id, dedupe_key")
      .eq("organization_id", orgA)
      .eq("event_type", "interested_party.strategy_changed")
      .like("dedupe_key", "%reintento%");
    assert((data ?? []).length === 1,
      `tres intentos del mismo cambio dejaron ${(data ?? []).length} hechos`);
  });

  await check("M. La entrada de Revisión por la Dirección se calcula sin IA", async () => {
    const { data, error } = await a.cli.rpc("quality_mr_source_payload", {
      p_organization_id: orgA, p_code: "interested_parties",
      p_from: dia(-30), p_to: dia(1),
    });
    assert(!error, `entrada de revisión: ${error?.message}`);
    const p = data as Record<string, unknown>;
    assert(p, "la entrada vino vacía");
    for (const clave of ["available", "relevant_count", "became_relevant",
                         "became_not_relevant", "new_requirements", "withdrawn_requirements",
                         "relevant_without_strategy", "strategies_without_owner_or_monitoring",
                         "reviews_in_period"]) {
      assert(clave in p, `la entrada no trae «${clave}»`);
    }
    assert(p.available === true, "con datos registrados la entrada debía estar disponible");
    assert(Number(p.relevant_count) >= 1, "no cuenta las partes pertinentes");
    const sinSeguimiento = p.strategies_without_owner_or_monitoring as { title: string }[];
    assert(Array.isArray(sinSeguimiento) && sinSeguimiento.length >= 1,
      "no señala la estrategia sin método de seguimiento");

    // Y ninguna consulta a un proveedor de IA se registró por el camino.
    const { count } = await a.cli.from("quality_ai_runs")
      .select("id", { count: "exact", head: true }).eq("organization_id", orgA);
    assert((count ?? 0) === 0, "la entrada determinística llamó a un modelo");
  });

  console.log(`\n  ${passed} correctas, ${failed} fallidas\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
