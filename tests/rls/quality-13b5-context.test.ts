/**
 * Trazaloop · QUALITY-13B5 · La composición integrada, contra base REAL.
 *
 * LO QUE SE COMPRUEBA
 *
 * Que preguntar «qué requiere atención» desde la portada compone un contexto que
 * sale de B3 —ya deduplicado— y no de volver a contar señales; que preguntar por
 * UN proceso compone desde las primitivas de B1/B2 y **no carga la empresa
 * entera**; que un dominio denegado no filtra nada; y que los números llegan
 * contados.
 *
 * Y se MIDE: cuánto contexto se compone en cada uno de los tres casos
 * representativos. QUALITY-12.1 enseñó que un paquete global es mucho más caro
 * que uno especializado, y este tramo existe en parte por eso.
 *
 * Correr: npm run test:quality13b5-context
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
  const email = `q13b5-${tag}-${stamp}@test.trazaloop.dev`;
  const { data } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: `QA ${tag}` } });
  assert(data.user, `usuario ${tag}`);
  const cli: SupabaseClient = createClient(URL!, ANON!, {
    auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await cli.auth.signInWithPassword({ email, password });
  assert(!error, `login ${tag}: ${error?.message}`);
  return { cli, id: data.user!.id };
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

const medidas: { caso: string; pedidas: number; aportaron: number; refs: number;
                 hechos: number; chars: number }[] = [];

async function main() {
  const { buildContext } = await import("../../lib/ai/context/builder");
  await import("../../lib/ai/context/adapters");
  await import("../../lib/ai/context/integrated");
  const { selectSources, CONTEXT_PLANS } = await import("../../lib/domain/quality-intelligence");

  console.log("\nQUALITY-13B5 · Composición integrada · base real\n");

  const a = await persona("a");
  const { data: orgAId } = await a.cli.rpc("create_organization", { p_name: `Q13B5 A ${stamp}` });
  const orgA = orgAId as string;
  await admin.from("organization_modules")
    .update({ access_mode: "full", access_expires_at: null })
    .eq("organization_id", orgA).eq("module_code", "quality");

  const b = await persona("b");
  const { data: orgBId } = await b.cli.rpc("create_organization", { p_name: `Q13B5 B ${stamp}` });
  const orgB = orgBId as string;
  await admin.from("organization_modules")
    .update({ access_mode: "full", access_expires_at: null })
    .eq("organization_id", orgB).eq("module_code", "quality");

  const corto = (s: string) => s.slice(0, 24);

  // ── Datos de QA ──────────────────────────────────────────────────────────
  const { data: cargo } = await a.cli.from("quality_positions")
    .insert({ organization_id: orgA, name: "QA Q13 B5 · Jefe de calidad" }).select("id").single();
  await a.cli.from("quality_position_assignments").insert({
    organization_id: orgA, position_id: cargo!.id, profile_id: a.id,
    assignment_type: "holder", effective_from: "2026-01-01" });

  const { data: proc } = await a.cli.from("quality_processes").insert({
    organization_id: orgA, name: "QA Q13 B5 · Despacho a cliente", code: "QA-B5-PR-01",
    category_code: "core", status: "active", owner_position_id: cargo!.id })
    .select("id").single();
  const procId = proc!.id as string;

  const { data: riesgo } = await a.cli.from("quality_risks").insert({
    organization_id: orgA, code: corto(`QB5-R-${stamp}`),
    title: "QA Q13 B5 · Riesgo sin revisar",
    event_description: "Lleva sin revisarse desde enero.",
    owner_position_id: cargo!.id, status: "active", next_review_on: "2026-01-05" })
    .select("id").single();
  await a.cli.from("quality_risk_processes").insert({
    organization_id: orgA, risk_id: riesgo!.id, process_id: procId });

  const { data: caso } = await a.cli.from("work_cases").insert({
    organization_id: orgA, code: corto(`QB5-C-${stamp}`), title: "QA Q13 B5 · Retraso reiterado",
    case_type: "issue", origin_kind: "manual", detected_on: "2026-02-01" })
    .select("id").single();
  await a.cli.from("work_case_processes").insert({
    organization_id: orgA, case_id: caso!.id, process_id: procId });

  // Proveedor con un incidente convertido en caso → derivación QI-23.
  const { data: parteProv } = await a.cli.from("quality_external_parties").insert({
    organization_id: orgA, legal_name: `QA Q13 B5 Empaques ${stamp}` }).select("id").single();
  const { data: perfil } = await a.cli.from("quality_supplier_profiles").insert({
    organization_id: orgA, party_id: parteProv!.id, owner_position_id: cargo!.id })
    .select("id").single();
  await a.cli.from("quality_supplier_incidents").insert({
    organization_id: orgA, profile_id: perfil!.id,
    title: "QA Q13 B5 · Entrega tardía", case_id: caso!.id });

  // Queja anónima con caso → derivación, y con un texto que INTENTA dar órdenes.
  const { data: parteCli } = await a.cli.from("quality_external_parties").insert({
    organization_id: orgA, legal_name: `QA Q13 B5 Cliente ${stamp}` }).select("id").single();
  const { data: perfilCli } = await a.cli.from("quality_customer_profiles").insert({
    organization_id: orgA, party_id: parteCli!.id }).select("id").single();
  await a.cli.from("quality_customer_feedback").insert({
    organization_id: orgA, customer_id: perfilCli!.id, feedback_kind: "complaint",
    title: "QA Q13 B5 · El pedido llegó tarde",
    reporter_name: "QA Q13 B5 Persona Anonima", case_id: caso!.id });

  await a.cli.rpc("quality_scan_risk_reviews", { p_organization_id: orgA });

  const base = {
    organizationId: orgA, useCase: "ask", question: "¿Qué requiere atención?",
    temporal: { mode: "current" as const }, allow: { people: true, customer: true },
  };

  // =========================================================================
  console.log("A · La portada de Quality");
  // =========================================================================

  await check("A1. Compone desde la atención convergida y no vuelve a contar señales", async () => {
    const pack = await buildContext({
      ...base, pinned: { type: "quality_home", id: "" },
      sources: selectSources("quality_home"),
    }, a.cli as never);

    assert(pack.sourcesUsed.includes("attention"),
      `no se usó la fuente integrada: ${pack.sourcesUsed.join(", ")}`);
    // Y NO se usó la fuente de señales sueltas: contarlas aparte reintroduciría
    // la duplicación que B3 quitó.
    assert(!pack.sourcesAttempted.includes("signal"),
      "la portada volvió a leer las señales por su cuenta");
    const total = pack.facts.find((f) => /asunto\(s\) que requieren atención/.test(f.statement));
    assert(total, `no hay un hecho con el total: ${pack.facts.map((f) => f.statement).join(" | ")}`);
    assert(/ya deduplicados/.test(total!.statement),
      "el total no declara que está deduplicado");
    medidas.push({ caso: "Portada", pedidas: pack.sourcesAttempted.length,
                   aportaron: pack.sourcesUsed.length, refs: pack.refs.length,
                   hechos: pack.facts.length, chars: pack.charCount });
  });

  await check("A2. El mismo asunto aparece UNA vez, aunque lo vean dos mecanismos", async () => {
    const pack = await buildContext({
      ...base, pinned: { type: "quality_home", id: "" },
      sources: selectSources("quality_home"),
    }, a.cli as never);
    // El barrido dejó aviso Y pendiente para el mismo riesgo.
    const delRiesgo = pack.refs.filter((r) => r.entityId === riesgo!.id
      && r.sourceCode === "attention");
    assert(delRiesgo.length === 1,
      `el mismo asunto entró ${delRiesgo.length} veces en el contexto`);
  });

  await check("A3. Los números llegan CONTADOS, no para que los cuente el modelo", async () => {
    const pack = await buildContext({
      ...base, pinned: { type: "quality_home", id: "" },
      sources: selectSources("quality_home"),
    }, a.cli as never);
    const conCifra = pack.facts.filter((f) => /\d/.test(f.statement));
    assert(conCifra.length > 0, "no hay ni un hecho con una cifra ya calculada");
    assert(pack.facts.some((f) => /Reparto por dominio/.test(f.statement)),
      "no se entrega el reparto por dominio ya calculado");
  });

  await check("A4. Cada referencia lleva a su dominio, y ninguna sale de Quality", async () => {
    const pack = await buildContext({
      ...base, pinned: { type: "quality_home", id: "" },
      sources: selectSources("quality_home"),
    }, a.cli as never);
    assert(pack.refs.length > 0, "no hay referencias");
    for (const r of pack.refs) {
      if (!r.deepLink) continue;
      assert(r.deepLink.startsWith("/quality/"), `enlace fuera de Quality: ${r.deepLink}`);
      assert(!r.deepLink.startsWith("/traceability") && !r.deepLink.startsWith("/textiles"),
        `enlace a otro módulo: ${r.deepLink}`);
    }
  });

  // =========================================================================
  console.log("\nB · Un proceso concreto");
  // =========================================================================

  await check("B1. Compone desde las primitivas de proceso, no reuniendo veinticinco tablas", async () => {
    const pack = await buildContext({
      ...base, question: "Resume los asuntos de este proceso.",
      pinned: { type: "quality_process", id: procId },
      sources: selectSources("quality_process"),
    }, a.cli as never);
    assert(pack.sourcesUsed.includes("process_context"),
      `no se usó el contexto de proceso: ${pack.sourcesUsed.join(", ")}`);
    assert(pack.facts.some((f) => /Riesgos de este proceso/.test(f.statement)),
      "no llega el recuento de riesgos del proceso");
    assert(pack.facts.some((f) => /Casos y acciones de este proceso/.test(f.statement)),
      "no llega el recuento de casos del proceso");
    medidas.push({ caso: "Proceso", pedidas: pack.sourcesAttempted.length,
                   aportaron: pack.sourcesUsed.length, refs: pack.refs.length,
                   hechos: pack.facts.length, chars: pack.charCount });
  });

  await check("B2. La atención llega ACOTADA al proceso", async () => {
    const pack = await buildContext({
      ...base, pinned: { type: "quality_process", id: procId },
      sources: selectSources("quality_process"),
    }, a.cli as never);
    assert(pack.facts.some((f) => /SOLO los relacionados con el proceso/.test(f.statement)),
      "no se declara que la atención está acotada al proceso");
  });

  await check("B3. Proveedor y queja llegan DERIVADOS, diciendo por qué camino", async () => {
    const pack = await buildContext({
      ...base, pinned: { type: "quality_process", id: procId },
      sources: selectSources("quality_process"),
    }, a.cli as never);
    const derivados = pack.facts.filter((f) => /de forma DERIVADA/.test(f.statement));
    assert(derivados.length >= 2,
      `esperaba proveedor y queja derivados, hay ${derivados.length}`);
    for (const d of derivados) {
      assert(/caso|referencia/i.test(d.statement), `no explica el camino: «${d.statement}»`);
      assert(/No es una relación que alguien mantenga a mano/.test(d.statement),
        "no se advierte de que la relación es derivada");
    }
  });

  await check("B4. NO se carga la empresa entera para preguntar por un proceso", async () => {
    const especializado = await buildContext({
      ...base, pinned: { type: "quality_process", id: procId },
      sources: selectSources("quality_process"),
    }, a.cli as never);
    const todo = await buildContext({ ...base, pinned: null }, a.cli as never);
    // Se comparan las fuentes PEDIDAS, no las que aportaron: en una empresa de
    // prueba casi todas están vacías, y contar las que aportaron confundiría
    // «no se preguntó» con «se preguntó y no había».
    assert(especializado.sourcesAttempted.length < todo.sourcesAttempted.length,
      `especializado pidió ${especializado.sourcesAttempted.length} fuentes `
      + `y el global ${todo.sourcesAttempted.length}`);
    for (const fuera of ["knowledge_item", "person_competence", "customer_comment",
                         "automation_rule", "control", "supplier", "signal"]) {
      assert(!especializado.sourcesAttempted.includes(fuera),
        `preguntar por un proceso cargó «${fuera}»`);
    }
    medidas.push({ caso: "Global (sin plan)", pedidas: todo.sourcesAttempted.length,
                   aportaron: todo.sourcesUsed.length, refs: todo.refs.length,
                   hechos: todo.facts.length, chars: todo.charCount });
  });

  // =========================================================================
  console.log("\nC · Revisión por la dirección");
  // =========================================================================

  await check("C1. Compone sus dominios y NO redacta conclusiones", async () => {
    const pack = await buildContext({
      ...base, question: "Resume los cambios desde la última revisión.",
      pinned: { type: "quality_management_review", id: "" },
      sources: selectSources("quality_management_review"),
    }, a.cli as never);
    const plan = CONTEXT_PLANS.quality_management_review;
    for (const f of pack.sourcesAttempted) {
      assert(plan.sources.includes(f), `la revisión cargó una fuente fuera de su plan: ${f}`);
    }
    medidas.push({ caso: "Revisión", pedidas: pack.sourcesAttempted.length,
                   aportaron: pack.sourcesUsed.length, refs: pack.refs.length,
                   hechos: pack.facts.length, chars: pack.charCount });
  });

  // =========================================================================
  console.log("\nD · Selección de fuentes");
  // =========================================================================

  await check("D1. Sin plan, se comporta como antes de este tramo", async () => {
    const todo = await buildContext({ ...base, pinned: null }, a.cli as never);
    assert(todo.sourcesAttempted.length >= 15,
      `sin plan solo se pidieron ${todo.sourcesAttempted.length} fuentes: se rompió el comportamiento anterior`);
  });

  await check("D2. Con plan, NUNCA se carga una fuente que el plan no pide", async () => {
    for (const [contexto, plan] of Object.entries(CONTEXT_PLANS)) {
      const pack = await buildContext({
        ...base, pinned: { type: contexto, id: contexto === "quality_process" ? procId : "" },
        sources: selectSources(contexto),
      }, a.cli as never);
      for (const f of pack.sourcesAttempted) {
        assert(plan.sources.includes(f), `«${contexto}» cargó «${f}», que no está en su plan`);
      }
    }
  });

  await check("D3. Y la atención está en los cinco planes", async () => {
    for (const [contexto, plan] of Object.entries(CONTEXT_PLANS)) {
      assert(plan.sources.includes("attention"),
        `«${contexto}» no consume la atención convergida y volvería a contar por su cuenta`);
    }
  });

  // =========================================================================
  console.log("\nE · Permisos, privacidad y aislamiento");
  // =========================================================================

  await check("E1. La empresa de al lado no obtiene NADA", async () => {
    const pack = await buildContext({
      ...base, pinned: { type: "quality_home", id: "" },
      sources: selectSources("quality_home"),
    }, b.cli as never);
    assert(pack.refs.length === 0, `B obtuvo ${pack.refs.length} referencias de A`);
    const texto = JSON.stringify(pack);
    assert(!texto.includes(procId), "se filtró el proceso de A");
    assert(!texto.includes(riesgo!.id as string), "se filtró el riesgo de A");
    void orgB;
  });

  await check("E2. Una fuente denegada NO filtra ni cuenta, y se declara", async () => {
    const pack = await buildContext({
      ...base, pinned: { type: "quality_home", id: "" },
      sources: selectSources("quality_home"),
    }, roto(a.cli, "work_alerts", "42501") as never);
    const dice = pack.temporalLimitations.some((l) => /no da acceso|no se pudo leer/i.test(l));
    assert(dice, `no se declara la limitación: ${pack.temporalLimitations.join(" | ")}`);
    assert(!pack.facts.some((f) => /^No hay asuntos que requieran atención/.test(f.statement)),
      "con una fuente sin leer se afirmó que no hay nada");
  });

  await check("E3. Una fuente rota marca el contexto como incompleto", async () => {
    const pack = await buildContext({
      ...base, pinned: { type: "quality_home", id: "" },
      sources: selectSources("quality_home"),
    }, roto(a.cli, "quality_signals") as never);
    assert(pack.temporalLimitations.length > 0,
      "una fuente rota no dejó ninguna limitación declarada");
    for (const l of pack.temporalLimitations) {
      assert(!/PGRST|permission denied|relation "/i.test(l), `filtra jerga del motor: «${l}»`);
    }
  });

  await check("E4. La queja anónima NO se reidentifica al cruzar dominios", async () => {
    const pack = await buildContext({
      ...base, pinned: { type: "quality_process", id: procId },
      sources: selectSources("quality_process"),
    }, a.cli as never);
    const texto = JSON.stringify(pack);
    assert(!texto.includes("Persona Anonima"),
      "el contexto integrado revela quién puso la queja");
    assert(!texto.includes(perfilCli!.id as string),
      "el contexto integrado enlaza la queja con su cliente");
  });

  await check("E5. Cada cita es direccionable desde el servidor", async () => {
    const pack = await buildContext({
      ...base, pinned: { type: "quality_process", id: procId },
      sources: selectSources("quality_process"),
    }, a.cli as never);
    const ordinales = pack.refs.map((r) => r.ordinal);
    assert(ordinales.length === new Set(ordinales).size, "hay dos citas con el mismo número");
    assert(ordinales.every((n, i) => n === i + 1), "los números de cita no son correlativos");
    for (const r of pack.refs) {
      assert(r.sourceCode.length > 0, "una cita sin fuente");
      assert(r.entityType.length > 0, "una cita sin tipo de entidad");
      assert(r.label.length > 0, "una cita sin etiqueta legible");
      // Y ningún identificador de base suelto como etiqueta.
      assert(!/^[0-9a-f]{8}-[0-9a-f]{4}/.test(r.label),
        `una cita se presenta con un identificador crudo: «${r.label}»`);
    }
    // Y ningún hecho cita un número que no existe.
    for (const f of pack.facts) {
      for (const n of f.refs) {
        assert(ordinales.includes(n), `un hecho cita la fuente ${n}, que no existe`);
      }
    }
  });

  // =========================================================================
  console.log("\nF · Presupuesto");
  // =========================================================================

  await check("F1. El contexto especializado es MÁS PEQUEÑO que el global", async () => {
    const proceso = medidas.find((m) => m.caso === "Proceso")!;
    const global = medidas.find((m) => m.caso === "Global (sin plan)")!;
    assert(proceso && global, "faltan medidas");
    assert(proceso.pedidas < global.pedidas,
      `el especializado pide ${proceso.pedidas} fuentes y el global ${global.pedidas}`);
  });

  await check("F2. Ningún contexto revienta el presupuesto sin decirlo", async () => {
    for (const m of medidas) {
      assert(m.chars > 0, `«${m.caso}» compuso un contexto vacío`);
    }
  });

  console.log("\n  Tamaño del contexto compuesto:");
  for (const m of medidas) {
    console.log(`    ${m.caso.padEnd(20)} ${String(m.pedidas).padStart(2)} fuentes pedidas · `
      + `${String(m.aportaron).padStart(2)} con datos · ${String(m.refs).padStart(3)} refs · `
      + `${String(m.hechos).padStart(3)} hechos · ${String(m.chars).padStart(6)} caracteres`);
  }

  console.log(`\nQUALITY-13B5 · composición: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
