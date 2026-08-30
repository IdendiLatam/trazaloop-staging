/**
 * Trazaloop · QUALITY-13B4 · La portada contra base REAL.
 *
 * Se monta una empresa con problemas de verdad en cinco dominios y se le hace a
 * la composición la pregunta que la pantalla le hará: **qué requiere atención**.
 *
 * Lo que se comprueba, y es lo que decide si la portada sirve:
 *
 *   · un asunto visto por dos mecanismos se cuenta UNA vez;
 *   · dos condiciones del mismo sujeto se cuentan DOS;
 *   · un bloque que falla NO aporta un cero, y la portada lo dice;
 *   · el número de consultas no crece con el número de asuntos.
 *
 * Correr: npm run test:quality13b4-home-db
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
  const email = `q13b4-${tag}-${stamp}@test.trazaloop.dev`;
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
        return (t: string) => { estado.n += 1; estado.tablas.push(t);
                                return (target as SupabaseClient).from(t); };
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
  const HOME = await import("../../lib/db/quality-home");

  console.log("\nQUALITY-13B4 · Portada de Quality · base real\n");

  const a = await persona("a");
  const { data: orgAId } = await a.cli.rpc("create_organization", { p_name: `Q13B4 A ${stamp}` });
  const orgA = orgAId as string;
  await admin.from("organization_modules")
    .update({ access_mode: "full", access_expires_at: null })
    .eq("organization_id", orgA).eq("module_code", "quality");

  const b = await persona("b");
  const { data: orgBId } = await b.cli.rpc("create_organization", { p_name: `Q13B4 B ${stamp}` });
  const orgB = orgBId as string;
  await admin.from("organization_modules")
    .update({ access_mode: "full", access_expires_at: null })
    .eq("organization_id", orgB).eq("module_code", "quality");

  const corto = (s: string) => s.slice(0, 24);

  // ── Los datos de QA · «QA Q13 B4 ·» ───────────────────────────────────────
  const { data: cargo } = await a.cli.from("quality_positions")
    .insert({ organization_id: orgA, name: "QA Q13 B4 · Jefe de calidad" }).select("id").single();
  await a.cli.from("quality_position_assignments").insert({
    organization_id: orgA, position_id: cargo!.id, profile_id: a.id,
    assignment_type: "holder", effective_from: "2026-01-01" });

  const { data: proc } = await a.cli.from("quality_processes").insert({
    organization_id: orgA, name: "QA Q13 B4 · Despacho", category_code: "core",
    status: "active", owner_position_id: cargo!.id }).select("id").single();

  // Riesgo con la revisión vencida · el barrido deja AVISO y PENDIENTE: dos
  // mecanismos, un solo asunto.
  const { data: riesgo } = await a.cli.from("quality_risks").insert({
    organization_id: orgA, code: corto(`QB4-R-${stamp}`),
    title: "QA Q13 B4 · Riesgo sin revisar",
    event_description: "Lleva sin revisarse desde enero.",
    owner_position_id: cargo!.id, status: "active", next_review_on: "2026-01-05" })
    .select("id").single();
  await a.cli.from("quality_risk_processes").insert({
    organization_id: orgA, risk_id: riesgo!.id, process_id: proc!.id });

  // Auditoría vencida + hallazgo sin evaluar · dos condiciones, dos sujetos.
  const { data: auditoria } = await a.cli.from("quality_audits").insert({
    organization_id: orgA, code: corto(`QB4-A-${stamp}`),
    title: "QA Q13 B4 · Auditoría interna", status: "planned",
    scheduled_from: "2026-01-02", scheduled_to: "2026-01-10",
    owner_position_id: cargo!.id }).select("id").single();
  await a.cli.from("quality_audit_findings").insert({
    organization_id: orgA, audit_id: auditoria!.id, code: corto(`QB4-H-${stamp}`),
    statement: "QA Q13 B4 · No se registra la verificación",
    process_id: proc!.id, evaluation_status: "pending", raised_on: "2026-01-03" });

  // Proveedor con reevaluación vencida.
  const { data: parteProv } = await a.cli.from("quality_external_parties").insert({
    organization_id: orgA, legal_name: `QA Q13 B4 Empaques ${stamp}` }).select("id").single();
  await a.cli.from("quality_supplier_profiles").insert({
    organization_id: orgA, party_id: parteProv!.id,
    next_review_on: "2026-01-04", owner_position_id: cargo!.id });

  // Contexto · una parte pertinente con su requisito.
  await a.cli.rpc("quality_seed_stakeholder_categories", { p_organization_id: orgA });
  const { data: cat } = await a.cli.from("quality_stakeholder_categories")
    .select("id").eq("organization_id", orgA).eq("code", "customers").single();
  const { data: parte } = await a.cli.from("quality_external_parties").insert({
    organization_id: orgA, legal_name: `QA Q13 B4 Cliente ${stamp}` }).select("id").single();
  const { data: analisis } = await a.cli.from("quality_stakeholder_assessments").insert({
    organization_id: orgA, category_id: cat!.id, subject_kind: "external_party",
    external_party_id: parte!.id, relevance_status: "relevant" }).select("id").single();
  await a.cli.from("quality_stakeholder_requirements").insert({
    organization_id: orgA, assessment_id: analisis!.id, entry_kind: "requirement",
    requirement_kind: "contractual", title: "QA Q13 B4 · Entrega en 48 horas" });

  // Los barridos, que es como llega la atención.
  for (const rpc of ["quality_scan_risk_reviews", "quality_scan_audits",
                     "quality_scan_supplier_reviews"]) {
    const { error } = await a.cli.rpc(rpc, { p_organization_id: orgA });
    assert(!error, `${rpc}: ${error?.message}`);
  }

  // =========================================================================
  console.log("M · La portada compone lo que se va a enseñar");
  // =========================================================================

  await check("M1. Devuelve atención, resumen y contexto de todos los dominios", async () => {
    const h = await HOME.loadQualityHome({ organizationId: orgA }, a.cli);
    assert(h.summary.total > 0, "no hay ningún asunto que atender");
    assert(h.items.length > 0 && h.items.length <= 8,
      `la muestra trae ${h.items.length} líneas`);
    assert(h.sources.every((s) => s.status === "ok"),
      `alguna fuente no se leyó: ${JSON.stringify(h.sources.filter((s) => s.status !== "ok"))}`);
    for (const clave of ["quality", "context", "performance", "risks", "cases",
                         "managementReview", "suppliers", "engineFailing"] as const) {
      assert(h.structure[clave].status === "ok",
        `el bloque ${clave} llegó ${h.structure[clave].status}`);
    }
  });

  await check("M2. UN asunto visto por DOS mecanismos se cuenta una vez", async () => {
    // El barrido de riesgos deja aviso Y pendiente para la misma condición.
    const { count: avisos } = await a.cli.from("work_alerts")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", orgA).eq("subject_id", riesgo!.id);
    const { count: tareas } = await a.cli.from("work_tasks")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", orgA).eq("subject_id", riesgo!.id);
    assert((avisos ?? 0) >= 1 && (tareas ?? 0) >= 1,
      "el barrido no dejó las dos salidas para el mismo riesgo");

    const h = await HOME.loadQualityHome({ organizationId: orgA, domain: "risks" }, a.cli);
    const delRiesgo = h.items.filter((i) => i.subjectId === riesgo!.id);
    assert(delRiesgo.length === 1,
      `el mismo asunto aparece ${delRiesgo.length} veces`);
    assert(h.summary.byDomain.risks === 1,
      `el resumen cuenta ${h.summary.byDomain.risks} riesgos y hay un asunto`);
  });

  await check("M3. DOS condiciones distintas se cuentan dos veces", async () => {
    const h = await HOME.loadQualityHome({ organizationId: orgA, domain: "audits" }, a.cli);
    assert(h.summary.byDomain.audits >= 2,
      `auditorías cuenta ${h.summary.byDomain.audits} y hay al menos dos condiciones`);
    const claves = h.items.map((i) => i.dedupeKey);
    assert(claves.length === new Set(claves).size, "hay dos líneas con la misma identidad");
  });

  await check("M4. Cada línea lleva a su causa, y ninguna sale de Quality", async () => {
    const h = await HOME.loadQualityHome({ organizationId: orgA }, a.cli);
    for (const i of h.items) {
      assert(i.href.startsWith("/quality/"), `enlace fuera de Quality: ${i.href}`);
      assert(i.reason.length > 0, "una línea sin motivo");
      assert(i.subjectId, "una línea sin sujeto");
    }
  });

  await check("M5. El total y los recuentos por dominio cuadran entre sí", async () => {
    const h = await HOME.loadQualityHome({ organizationId: orgA }, a.cli);
    const suma = Object.values(h.summary.byDomain).reduce((n, x) => n + x, 0);
    assert(suma === h.summary.total,
      `el total dice ${h.summary.total} y los dominios suman ${suma}`);
  });

  // =========================================================================
  console.log("\nN · Los filtros, resueltos en servidor");
  // =========================================================================

  await check("N1. Filtrar por dominio devuelve MENOS, no otra cosa", async () => {
    const todo = await HOME.loadQualityHome({ organizationId: orgA }, a.cli);
    const soloAud = await HOME.loadQualityHome({ organizationId: orgA, domain: "audits" }, a.cli);
    assert(soloAud.summary.total < todo.summary.total, "filtrar no redujo nada");
    assert(soloAud.summary.total === (todo.summary.byDomain.audits ?? 0),
      "el total filtrado no coincide con el del dominio en el total general");
    assert(soloAud.items.every((i) => i.domain === "audits"), "el filtro deja pasar otros");
  });

  await check("N2. Filtrar por proceso acota y trae su nombre", async () => {
    const h = await HOME.loadQualityHome(
      { organizationId: orgA, processId: proc!.id as string }, a.cli);
    assert(h.processName?.includes("Despacho"),
      `no se resuelve el nombre del proceso: «${h.processName}»`);
    const todo = await HOME.loadQualityHome({ organizationId: orgA }, a.cli);
    assert(h.summary.total < todo.summary.total, "acotar al proceso no redujo nada");
    assert(h.items.some((i) => i.subjectId === riesgo!.id),
      "no ve el riesgo que sí pertenece al proceso");
  });

  await check("N3. Un dominio sin nada devuelve cero, y es un cero honesto", async () => {
    const h = await HOME.loadQualityHome({ organizationId: orgA, domain: "documents" }, a.cli);
    assert(h.summary.total === 0, `documentos trae ${h.summary.total} asuntos`);
    assert(h.sources.every((s) => s.status === "ok"),
      "el cero de un dominio vacío llegó con alguna fuente sin leer");
  });

  // =========================================================================
  console.log("\nO · Sin dato NO es cero");
  // =========================================================================

  await check("O1. Una fuente de atención ROTA no aporta un cero", async () => {
    const h = await HOME.loadQualityHome({ organizationId: orgA },
      roto(a.cli, "work_alerts"));
    const f = h.sources.find((s) => s.source === "work_alerts")!;
    assert(f.status === "unavailable", `llegó como ${f.status}`);
    assert(f.count === null, `llegó con recuento ${f.count}`);
    assert(!h.sources.every((s) => s.status === "ok"),
      "la portada se presentaría como completa");
  });

  await check("O2. Un bloque de contexto DENEGADO no filtra nada", async () => {
    const h = await HOME.loadQualityHome({ organizationId: orgA },
      roto(a.cli, "quality_stakeholder_assessments", "42501"));
    assert(h.structure.context.status === "not_visible",
      `el contexto llegó ${h.structure.context.status}`);
    assert(!("data" in h.structure.context), "el bloque denegado trae datos dentro");
  });

  await check("O3. Un bloque roto no se lleva por delante a los demás", async () => {
    const h = await HOME.loadQualityHome({ organizationId: orgA },
      roto(a.cli, "v_quality_risk_overview"));
    assert(h.structure.risks.status === "unavailable",
      `riesgos llegó ${h.structure.risks.status}`);
    assert(h.structure.quality.status === "ok", "el fallo de riesgos tumbó a procesos");
    assert(h.summary.total > 0, "el fallo de un bloque se llevó la atención entera");
  });

  await check("O4. Y el estado de cada bloque viaja en las fuentes", async () => {
    const h = await HOME.loadQualityHome({ organizationId: orgA },
      roto(a.cli, "v_quality_risk_overview"));
    const f = h.sources.find((s) => s.source === "risks");
    assert(f, "el bloque de riesgos no aparece entre las fuentes");
    assert(f!.status === "unavailable",
      "la portada no sabría que le falta información para decir «no hay nada»");
  });

  // =========================================================================
  console.log("\nP · Aislamiento, escritura y coste");
  // =========================================================================

  await check("P1. La empresa de al lado no ve NADA", async () => {
    const h = await HOME.loadQualityHome({ organizationId: orgA }, b.cli);
    assert(h.summary.total === 0, `B vio ${h.summary.total} asuntos de A`);
    void orgB;
  });

  await check("P2. Mirar la portada no escribe una sola fila", async () => {
    const tablas = ["work_alerts", "work_tasks", "quality_signals", "quality_risks"];
    const antes = await Promise.all(tablas.map((t) => a.cli.from(t)
      .select("*", { count: "exact", head: true }).eq("organization_id", orgA)
      .then((r) => r.count ?? 0)));
    await HOME.loadQualityHome({ organizationId: orgA }, a.cli);
    const despues = await Promise.all(tablas.map((t) => a.cli.from(t)
      .select("*", { count: "exact", head: true }).eq("organization_id", orgA)
      .then((r) => r.count ?? 0)));
    assert(JSON.stringify(antes) === JSON.stringify(despues),
      `mirar cambió los datos: ${antes} → ${despues}`);
  });

  await check("P3. El coste no crece con el número de asuntos", async () => {
    const { proxy: p1, estado: e1 } = contador(a.cli);
    await HOME.loadQualityHome({ organizationId: orgA }, p1);

    const filas = Array.from({ length: 40 }, (_, i) => ({
      organization_id: orgA, code: corto(`QB4-V${i}-${stamp}`),
      title: `QA Q13 B4 · Riesgo de volumen ${i}`,
      event_description: "Riesgo de relleno para medir el coste.",
      owner_position_id: cargo!.id, status: "active", next_review_on: "2026-01-05",
    }));
    const { error } = await a.cli.from("quality_risks").insert(filas);
    assert(!error, `crear riesgos de volumen: ${error?.message}`);
    await a.cli.rpc("quality_scan_risk_reviews", { p_organization_id: orgA });

    const { proxy: p2, estado: e2 } = contador(a.cli);
    const h = await HOME.loadQualityHome({ organizationId: orgA }, p2);
    assert(h.summary.total > 40, `esperaba más de 40 asuntos, hay ${h.summary.total}`);
    // Lo que importa es que sea el MISMO número, no que sea pequeño: el coste
    // está acotado por los dominios que se leen —siete consultas de atención y
    // nueve bloques de contexto, cada uno con las suyas—, y no por cuántos
    // asuntos haya. El techo se deja holgado a propósito: apretarlo obligaría a
    // tocar esta prueba cada vez que un dominio añada una lectura, y lo que se
    // vigila aquí es el crecimiento con los datos.
    assert(e1.n === e2.n, `con pocos hizo ${e1.n} consultas y con muchos ${e2.n}`);
    assert(e2.n <= 45, `hace ${e2.n} consultas para una portada`);
    // Y ninguna tabla se consulta una vez por fila.
    const repetidas = e2.tablas.filter((t, i) => e2.tablas.indexOf(t) !== i);
    assert(repetidas.length <= 12,
      `hay ${repetidas.length} lecturas repetidas: huele a una consulta por fila`);
  });

  await check("P4. Y la muestra sigue acotada aunque haya cuarenta", async () => {
    const h = await HOME.loadQualityHome({ organizationId: orgA }, a.cli);
    assert(h.items.length <= 8, `la muestra trae ${h.items.length} líneas`);
    assert(h.summary.total > h.items.length,
      "con más asuntos que la muestra, el total debería ser mayor");
  });

  console.log(`\nQUALITY-13B4 · portada (base real): ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
