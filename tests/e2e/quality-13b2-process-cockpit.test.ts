/**
 * Trazaloop Quality · QUALITY-13B2 · Recorrido de aceptación del mirador.
 *
 * Reproduce, contra el BUILD DE PRODUCCIÓN y por HTTP, la matriz P1…P8 de la
 * validación humana: entrar a Quality, llegar al proceso desde el menú, y
 * comprobar que la ficha responde las dos preguntas del tramo —qué significa
 * este proceso en el sistema, y qué requiere atención a su alrededor—.
 *
 * LO QUE HACE QUE ESTO NO SEA UNA PRUEBA DE PANTALLA PINTADA
 *
 * Nunca se teclea una URL interna a mano: cada destino sale del `href` que
 * renderizó la pantalla anterior. Y los destinos del mirador **se abren**: un
 * enlace que lleva a un 404 es peor que no ofrecerlo.
 *
 * Requisitos: `npm run build` previo y Supabase local en marcha.
 * Correr: npm run test:quality13b2-cockpit-e2e
 */
import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";

loadEnv({ path: ".env.local" });

const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ORG_SECRET = process.env.ACTIVE_ORG_COOKIE_SECRET ?? null;
if (!URL_SB || !ANON || !SERVICE) {
  console.error("Faltan variables para test:quality13b2-cockpit-e2e.");
  process.exit(1);
}

const PORT = Number(process.env.Q13B2_PORT ?? 3181);
const BASE = `http://localhost:${PORT}`;
const AUTH_COOKIE = `sb-${new global.URL(URL_SB).hostname.split(".")[0]}-auth-token`;

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
async function check(n: string, fn: () => Promise<void>) {
  try { await fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const admin = createClient(URL_SB, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
const servers: ChildProcess[] = [];
function stopServers() {
  for (const p of servers) { try { p.kill("SIGTERM"); } catch { /* ya terminado */ } }
}

async function waitUp() {
  const limite = Date.now() + 120_000;
  while (Date.now() < limite) {
    try { const r = await fetch(`${BASE}/`, { redirect: "manual" }); if (r.status > 0) return; }
    catch { /* aún no */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("el servidor no arrancó");
}

// ---------------------------------------------------------------------------
// Leer el HTML como lo lee una persona
// ---------------------------------------------------------------------------

/** Fuera los `<script>`: Next embebe ahí la carga RSC con todos los props, y
 *  buscar en ella equivaldría a decir que algo «se ve en pantalla» porque viaja
 *  en el documento. */
function flat(html: string): string {
  return html.replace(/<script\b[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#x2F;/g, "/").replace(/&middot;/g, "·").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
}
function has(html: string, needle: string): boolean {
  return flat(html).toLowerCase().includes(needle.toLowerCase());
}
function links(html: string): { href: string; text: string }[] {
  return [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
    .map((m) => ({ href: m[1], text: flat(m[2]).trim() }));
}
function linkByText(html: string, label: string): string | null {
  return links(html).find((l) => l.text.toLowerCase().includes(label.toLowerCase()))?.href ?? null;
}

/**
 * El trozo de la ficha que es el MIRADOR.
 *
 * Se recorta entre su título y la sección siguiente de la ficha. Sin recortar,
 * cualquier comprobación daría falsos positivos con el resto de la página: la
 * ficha ya nombra documentos y procesos por su cuenta.
 */
function mirador(html: string): string {
  const desde = html.indexOf('id="cockpit-title"');
  if (desde < 0) return "";
  const hasta = html.indexOf("Documentos del proceso", desde);
  return html.slice(desde, hasta > 0 ? hasta : undefined);
}

async function main() {
  console.log("\nQUALITY-13B2 · aceptación del mirador · P1…P8\n");
  console.log("  · levantando el build de producción…");

  servers.push(spawn("npx", ["next", "start", "-p", String(PORT)], {
    env: { ...process.env, QUALITY_MODULE_ENABLED: "true" }, stdio: "ignore",
  }));
  await waitUp();

  // ── Una empresa con Quality y SIN PCR ni Textiles ────────────────────────
  const sello = Date.now();
  const email = `q13b2-e2e-${sello}@test.trazaloop.dev`;
  const password = "Trazaloop-Test-1234";
  const { data: creado } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: "QA Mirador" } });
  assert(creado.user, "no se pudo crear la persona de prueba");

  const cli: SupabaseClient = createClient(URL_SB!, ANON!, {
    auth: { autoRefreshToken: false, persistSession: false } });
  const { data: sesion } = await cli.auth.signInWithPassword({ email, password });
  assert(sesion.session, "no se pudo iniciar sesión");
  await cli.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "q13b2" });

  const { data: orgId } = await cli.rpc("create_organization", { p_name: `QA Q13B2 E2E ${sello}` });
  const org = orgId as string;
  await admin.from("organization_modules")
    .update({ access_mode: "full", access_expires_at: null })
    .eq("organization_id", org).eq("module_code", "quality");

  const b64 = Buffer.from(JSON.stringify(sesion.session), "utf8").toString("base64url");
  const firma = ORG_SECRET
    ? `.${createHmac("sha256", ORG_SECRET).update(org).digest("base64url")}` : "";
  const cookie = `${AUTH_COOKIE}=base64-${b64}; tz-active-org=${org}${firma}`;

  async function get(path: string) {
    const r = await fetch(`${BASE}${path}`, { headers: { cookie }, redirect: "manual" });
    return { status: r.status, location: r.headers.get("location"),
             body: r.status === 200 ? await r.text() : "" };
  }

  const corto = (s: string) => s.slice(0, 24);

  // =========================================================================
  // Los datos de QA. Un proceso con algo en cada eje, y nada inventado para
  // rellenar: cada fila existe porque la relación es real.
  // =========================================================================
  const { data: cargo } = await cli.from("quality_positions")
    .insert({ organization_id: org, name: "QA Mirador · Jefe de despacho" })
    .select("id").single();
  const { data: proc } = await cli.from("quality_processes")
    .insert({ organization_id: org, name: "QA Mirador · Despacho a cliente",
              code: "QA-PR-01", category_code: "core", status: "active",
              owner_position_id: cargo!.id })
    .select("id").single();
  assert(proc, "no se pudo crear el proceso");
  const procId = proc!.id as string;

  // Dos revisiones publicadas: la primera queda como historia.
  const { data: rev1 } = await cli.rpc("quality_open_process_revision",
    { p_process_id: procId, p_change_note: null });
  await cli.from("quality_process_io").insert({
    organization_id: org, revision_id: rev1 as string, process_id: procId,
    direction: "input", name: "QA Mirador · Pedido confirmado", sort_order: 1 });
  await cli.from("quality_process_io").insert({
    organization_id: org, revision_id: rev1 as string, process_id: procId,
    direction: "output", name: "QA Mirador · Pedido entregado", sort_order: 2 });
  const { error: ePub1 } = await cli.rpc("quality_publish_process_revision",
    { p_revision_id: rev1 as string });
  assert(!ePub1, `publicar la revisión 1: ${ePub1?.message}`);
  const { data: rev2 } = await cli.rpc("quality_open_process_revision",
    { p_process_id: procId, p_change_note: "QA Mirador · Se añade la verificación" });
  const { error: ePub2 } = await cli.rpc("quality_publish_process_revision",
    { p_revision_id: rev2 as string });
  assert(!ePub2, `publicar la revisión 2: ${ePub2?.message}`);

  const { data: riesgo } = await cli.from("quality_risks").insert({
    organization_id: org, code: corto(`QAM-R-${sello}`), title: "QA Mirador · Retraso de despacho",
    event_description: "Los despachos se retrasan y el cliente lo nota.",
    owner_position_id: cargo!.id, status: "active" }).select("id").single();
  await cli.from("quality_risk_processes")
    .insert({ organization_id: org, risk_id: riesgo!.id, process_id: procId });

  const { data: oport } = await cli.from("quality_opportunities").insert({
    organization_id: org, code: corto(`QAM-O-${sello}`), title: "QA Mirador · Ruta directa",
    situation: "Existe una ruta más corta al centro de distribución." })
    .select("id").single();
  await cli.from("quality_opportunity_processes")
    .insert({ organization_id: org, opportunity_id: oport!.id, process_id: procId });

  const { data: obj } = await cli.from("quality_objectives").insert({
    organization_id: org, name: "QA Mirador · Entregar en plazo",
    period_start: "2026-01-01", period_end: "2026-12-31", owner_position_id: cargo!.id })
    .select("id").single();
  await cli.from("quality_objective_processes")
    .insert({ organization_id: org, objective_id: obj!.id, process_id: procId });
  await cli.from("quality_indicators").insert({
    organization_id: org, name: "QA Mirador · Entregas a tiempo",
    scope_type: "process", scope_process_id: procId, admin_state: "active" });

  const { data: doc } = await cli.from("trazadoc_documents").insert({
    organization_id: org, source_type: "custom", code: "QA-DOC-01", module_key: "quality",
    title: "QA Mirador · Procedimiento de despacho", status: "approved" })
    .select("id").single();
  await cli.from("quality_process_documents").insert({
    organization_id: org, process_id: procId, document_id: doc!.id, relation_type: "governs" });

  // Y uno de OTRO módulo, que la pantalla de vinculación permite asociar: su
  // ficha no vive en Quality, y el mirador no puede fingir que sí.
  const { data: docAjeno } = await cli.from("trazadoc_documents").insert({
    organization_id: org, source_type: "custom", code: "QA-DOC-02", module_key: "cpr",
    title: "QA Mirador · Instructivo de PCR", status: "approved" })
    .select("id").single();
  await cli.from("quality_process_documents").insert({
    organization_id: org, process_id: procId, document_id: docAjeno!.id,
    relation_type: "supports" });

  const { data: auditoria } = await cli.from("quality_audits").insert({
    organization_id: org, code: corto(`QAM-A-${sello}`), title: "QA Mirador · Auditoría interna" })
    .select("id").single();
  await cli.from("quality_audit_findings").insert({
    organization_id: org, audit_id: auditoria!.id, code: corto(`QAM-H-${sello}`),
    statement: "QA Mirador · No se registra la verificación de salida",
    process_id: procId, evaluation_status: "pending" });

  const { data: caso } = await cli.from("work_cases").insert({
    organization_id: org, code: corto(`QAM-C-${sello}`), title: "QA Mirador · Retraso reiterado",
    case_type: "issue", origin_kind: "manual", detected_on: "2026-08-01" })
    .select("id").single();
  await cli.from("work_case_processes")
    .insert({ organization_id: org, case_id: caso!.id, process_id: procId });

  const { data: comp } = await cli.from("quality_competencies").insert({
    organization_id: org, name: "QA Mirador · Manejo de montacargas" }).select("id").single();
  await cli.from("quality_competency_requirements").insert({
    organization_id: org, competency_id: comp!.id, process_id: procId, required_level: 3 });

  await cli.rpc("quality_seed_stakeholder_categories", { p_organization_id: org });
  const { data: cat } = await cli.from("quality_stakeholder_categories")
    .select("id").eq("organization_id", org).eq("code", "customers").single();
  const { data: parte } = await cli.from("quality_external_parties").insert({
    organization_id: org, legal_name: `QA Mirador Andina S.A.S. ${sello}`,
    trade_name: "QA Mirador Andina" }).select("id").single();
  const { data: analisis } = await cli.from("quality_stakeholder_assessments").insert({
    organization_id: org, category_id: cat!.id, subject_kind: "external_party",
    external_party_id: parte!.id, relevance_status: "relevant" }).select("id").single();
  const { data: requisito } = await cli.from("quality_stakeholder_requirements").insert({
    organization_id: org, assessment_id: analisis!.id, entry_kind: "requirement",
    requirement_kind: "contractual", title: "QA Mirador · Entrega en 48 horas",
    relevance_status: "relevant" }).select("id").single();
  await cli.from("quality_stakeholder_requirement_processes").insert({
    organization_id: org, requirement_id: requisito!.id, process_id: procId,
    link_kind: "addressed_by" });

  const { data: parteProv } = await cli.from("quality_external_parties").insert({
    organization_id: org, legal_name: `QA Mirador Empaques ${sello}` }).select("id").single();
  const { data: perfil } = await cli.from("quality_supplier_profiles").insert({
    organization_id: org, party_id: parteProv!.id }).select("id").single();
  await cli.from("quality_supplier_incidents").insert({
    organization_id: org, profile_id: perfil!.id,
    title: "QA Mirador · Entrega tardía de empaque", case_id: caso!.id });

  const { data: parteCli } = await cli.from("quality_external_parties").insert({
    organization_id: org, legal_name: `QA Mirador Cliente ${sello}` }).select("id").single();
  const { data: perfilCli } = await cli.from("quality_customer_profiles").insert({
    organization_id: org, party_id: parteCli!.id }).select("id").single();
  await cli.from("quality_customer_feedback").insert({
    organization_id: org, customer_id: perfilCli!.id, feedback_kind: "complaint",
    title: "QA Mirador · El pedido llegó tarde",
    reporter_name: "QA Mirador Persona Anonima", case_id: caso!.id });

  // Un proceso SIN nada alrededor: el estado vacío tiene que ser útil.
  const { data: vacio } = await cli.from("quality_processes").insert({
    organization_id: org, name: "QA Mirador · Proceso recién creado",
    category_code: "support", status: "active" }).select("id").single();

  // =========================================================================
  // P1 · Cabecera y navegación
  // =========================================================================
  let fichaHtml = "";
  let fichaHref = "";

  await check("P1.1 · El menú de Quality dice «Evaluación», no dos «Desempeño»", async () => {
    const portada = await get("/quality");
    assert(portada.status === 200, `/quality dio ${portada.status} → ${portada.location}`);
    const nav = portada.body.match(/<nav[\s\S]*?<\/nav>/)?.[0] ?? portada.body;
    assert(has(nav, "Evaluación"), "el menú no tiene el grupo Evaluación");
    const objetivos = linkByText(nav, "Objetivos");
    assert(objetivos === "/quality/objectives", `Objetivos enlaza a ${objetivos}`);
    // El de Personas conserva su nombre.
    assert(linkByText(nav, "Desempeño") === "/quality/people/performance",
      "la entrada de Personas perdió su nombre propio");
  });

  await check("P1.2 · Del menú a Procesos, y de ahí al proceso", async () => {
    const portada = await get("/quality");
    const procesos = linkByText(portada.body, "Procesos");
    assert(procesos === "/quality/processes", `Procesos enlaza a ${procesos}`);
    const lista = await get(procesos!);
    assert(lista.status === 200, `la lista dio ${lista.status}`);
    const href = links(lista.body).find((l) => l.text.includes("Despacho a cliente"))?.href;
    assert(href, "la lista no ofrece el proceso de QA");
    fichaHref = href!;
    const ficha = await get(fichaHref);
    assert(ficha.status === 200, `la ficha dio ${ficha.status}`);
    fichaHtml = ficha.body;
  });

  await check("P1.3 · La cabecera conserva identidad, categoría, estado y propietario", async () => {
    assert(has(fichaHtml, "QA Mirador · Despacho a cliente"), "sin nombre");
    assert(has(fichaHtml, "QA-PR-01"), "sin código");
    assert(has(fichaHtml, "Propietario"), "sin cargo propietario");
    assert(has(fichaHtml, "Activo") || has(fichaHtml, "En servicio"), "sin estado del proceso");
    // Y el propietario sigue siendo un CARGO, y ahora lleva a su ficha.
    assert(links(fichaHtml).some((l) => l.href.startsWith("/quality/people/positions/")),
      "el cargo propietario no lleva a su ficha");
  });

  await check("P1.4 · La ficha conserva lo que ya hacía", async () => {
    for (const seccion of ["Identidad del proceso", "Propósito y alcance",
                           "Entradas y salidas", "Relaciones con otros procesos",
                           "Documentos del proceso", "Historial de revisiones"]) {
      assert(has(fichaHtml, seccion), `desapareció la sección «${seccion}»`);
    }
    assert(has(fichaHtml, "QA Mirador · Pedido confirmado"), "no se ven las entradas");
  });

  await check("P1.5 · El mirador existe y dice qué es", async () => {
    const m = mirador(fichaHtml);
    assert(m, "la ficha no monta el mirador");
    assert(has(m, "El proceso en el sistema de gestión"), "el mirador no se presenta");
    assert(has(m, "Aquí no se edita"), "el mirador no dice que solo se mira");
  });

  // =========================================================================
  // P2 · Partes interesadas
  // =========================================================================
  await check("P2.1 · El requisito aparece con su parte y su tipo de relación", async () => {
    const m = mirador(fichaHtml);
    assert(has(m, "Entrega en 48 horas"), "el requisito no se ve");
    assert(has(m, "QA Mirador Andina"), "no se dice de qué parte interesada viene");
    assert(has(m, "Lo gestiona"), "no se dice cómo se relaciona con el proceso");
    assert(has(m, "Pertinente"), "no se enseña la pertinencia del requisito");
  });

  await check("P2.2 · Y se vuelve a Partes interesadas", async () => {
    const destino = links(mirador(fichaHtml))
      .find((l) => l.href === "/quality/context/interested-parties");
    assert(destino, "el mirador no ofrece la vuelta a Partes interesadas");
    const r = await get(destino!.href);
    assert(r.status === 200, `Partes interesadas dio ${r.status}`);
  });

  // =========================================================================
  // P3 · Riesgos y oportunidades
  // =========================================================================
  await check("P3.1 · Riesgo y oportunidad son dos secciones, no un filtro", async () => {
    const m = mirador(fichaHtml);
    assert(has(m, "Retraso de despacho"), "no se ve el riesgo");
    assert(has(m, "Ruta directa"), "no se ve la oportunidad");
    assert(has(m, "Riesgos") && has(m, "Oportunidades"),
      "riesgos y oportunidades se fundieron en una sola caja");
  });

  await check("P3.2 · El riesgo lleva a SU ficha, con la palabra de su dominio", async () => {
    const m = mirador(fichaHtml);
    assert(links(m).some((l) => l.href === `/quality/risks/${riesgo!.id}`),
      "el riesgo no lleva a su ficha");
    assert(has(m, "Activo"), "el riesgo no enseña su estado con la palabra de Riesgos");
  });

  // =========================================================================
  // P4 · Objetivos e indicadores
  // =========================================================================
  await check("P4.1 · Objetivo e indicador conservan su semántica separada", async () => {
    const m = mirador(fichaHtml);
    assert(has(m, "Entregar en plazo"), "no se ve el objetivo");
    assert(has(m, "Entregas a tiempo"), "no se ve el indicador");
    assert(has(m, "Objetivos") && has(m, "Indicadores"),
      "objetivos e indicadores se fundieron en «métricas»");
    assert(!has(m, "métricas"), "se les llama métricas, que borra la diferencia");
  });

  await check("P4.2 · Un indicador fuera de meta NO es una no conformidad", async () => {
    const m = mirador(fichaHtml);
    assert(has(m, "no es por sí mismo una no conformidad"),
      "no se aclara qué significa un indicador fuera de meta");
  });

  // =========================================================================
  // P5 · Documentos y evidencia
  // =========================================================================
  await check("P5.1 · El documento se ve, y sigue viviendo en Documentos", async () => {
    const m = mirador(fichaHtml);
    assert(has(m, "Procedimiento de despacho"), "no se ve el documento vinculado");
    assert(links(m).some((l) => l.href === `/quality/documents/${doc!.id}`),
      "el documento no lleva a su ficha en Documentos");
    assert(has(m, "Aprobado"), "el documento no enseña su estado de TrazaDocs");
  });

  await check("P5.2 · Un documento de otro módulo se ve, y NO se le inventa ficha aquí", async () => {
    const m = mirador(fichaHtml);
    assert(has(m, "Instructivo de PCR"), "el documento de otro módulo se escondió");
    assert(has(m, "de PCR"), "no se dice de qué módulo es el documento");
    assert(!links(m).some((l) => l.href === `/quality/documents/${docAjeno!.id}`),
      "se fabricó una ficha de Quality para un documento que no es de Quality");
  });

  await check("P5.3 · No se sube nada desde el mirador", async () => {
    const m = mirador(fichaHtml);
    assert(!/<form/.test(m), "el mirador tiene un formulario");
    assert(!/type="file"/.test(m), "el mirador ofrece subir un archivo");
  });

  // =========================================================================
  // P6 · Auditorías, casos y acciones
  // =========================================================================
  await check("P6.1 · El hallazgo se ve, y NO se le llama no conformidad", async () => {
    const m = mirador(fichaHtml);
    assert(has(m, "No se registra la verificación de salida"), "no se ve el hallazgo");
    assert(has(m, "Sin evaluar") || has(m, "Pendiente"),
      "el hallazgo no enseña su estado de evaluación");
    assert(has(m, "lo decide su evaluación"),
      "no se aclara quién decide si un hallazgo es una no conformidad");
  });

  await check("P6.2 · El caso se ve y lleva a su ficha", async () => {
    const m = mirador(fichaHtml);
    assert(has(m, "Retraso reiterado"), "no se ve el caso");
    assert(links(m).some((l) => l.href === `/quality/cases/${caso!.id}`),
      "el caso no lleva a su ficha");
  });

  await check("P6.3 · La tarea propia de un dominio NO se cuenta como acción", async () => {
    const m = mirador(fichaHtml);
    assert(has(m, "no es una acción transversal y no se cuenta aquí"),
      "no se declara la frontera de la tarea propia");
  });

  await check("P6.4 · Lo derivado se presenta como derivado", async () => {
    const m = mirador(fichaHtml);
    assert(has(m, "Relacionado indirectamente"), "no hay bloque de relaciones derivadas");
    assert(has(m, "QA Mirador Empaques"), "no se deriva el proveedor");
    assert(has(m, "caso abierto desde un incidente"), "no se explica el camino del proveedor");
    assert(has(m, "El pedido llegó tarde"), "no se deriva la retroalimentación");
    assert(!has(m, "QA Mirador Persona Anonima"), "se filtró quién reportó la queja");
  });

  // =========================================================================
  // P7 · Tiempo, atención y estados vacíos
  // =========================================================================
  await check("P7.1 · Qué requiere atención, con su causa y su enlace", async () => {
    const m = mirador(fichaHtml);
    assert(has(m, "Requiere atención"), "no hay bloque de atención");
    assert(has(m, "1 riesgo sigue activo"), "no dice qué pasa con los riesgos");
    assert(has(m, "1 hallazgo sin evaluar"), "no dice qué pasa con los hallazgos");
    assert(has(m, "1 caso sin cerrar"), "no dice qué pasa con los casos");
  });

  await check("P7.2 · Viendo el presente, cada sección declara su momento", async () => {
    const m = mirador(fichaHtml);
    assert(has(m, "Estado actual"), "ninguna sección declara su momento");
    assert(!has(m, "no se reconstruyen"),
      "avisa de una mezcla de momentos que en el presente no existe");
  });

  await check("P7.3 · Viendo una revisión pasada, AVISA de que lo de alrededor es de hoy", async () => {
    const historico = links(fichaHtml)
      .filter((l) => l.href.includes("?revision="))
      .find((l) => l.text.includes("Revisión 1"));
    assert(historico, "el historial no ofrece la revisión anterior");
    const r = await get(historico!.href);
    assert(r.status === 200, `la revisión histórica dio ${r.status}`);
    const m = mirador(r.body);
    assert(has(m, "tal como rigió"), "no se dice que el proceso se muestra a una fecha pasada");
    assert(has(m, "no se reconstruyen"),
      "no se advierte que el contexto de alrededor es el de hoy");
    // Y lo de alrededor se sigue viendo, etiquetado: no se esconde.
    assert(has(m, "Retraso de despacho"), "se escondió el contexto en vez de etiquetarlo");
  });

  await check("P7.4 · Un proceso sin nada alrededor lo dice con palabras", async () => {
    const r = await get(`/quality/processes/${vacio!.id}`);
    assert(r.status === 200, `el proceso vacío dio ${r.status}`);
    const m = mirador(r.body);
    assert(has(m, "No hay riesgos relacionados con este proceso"), "el vacío no se explica");
    assert(has(m, "No hay casos ni acciones transversales relacionados"),
      "el vacío de casos no se explica");
    assert(!has(m, "Requiere atención"),
      "un proceso vacío enseña un bloque de atención sin nada que atender");
    assert(!has(m, "Relacionado indirectamente"),
      "un proceso sin derivaciones enseña el bloque derivado vacío");
  });

  await check("P7.5 · Un proceso de otra empresa no existe para esta", async () => {
    const otro = await persona2();
    const r = await get(`/quality/processes/${otro}`);
    assert(r.status === 404, `un proceso ajeno respondió ${r.status}, no 404`);
  });

  // =========================================================================
  // P8 · Enlaces, pantalla pequeña e independencia de módulo
  // =========================================================================
  await check("P8.1 · TODOS los destinos del mirador abren de verdad", async () => {
    const destinos = [...new Set(links(mirador(fichaHtml)).map((l) => l.href))];
    assert(destinos.length >= 10, `el mirador ofrece ${destinos.length} destinos`);
    for (const d of destinos) {
      const r = await get(d);
      assert(r.status === 200, `«${d}» respondió ${r.status} → ${r.location}`);
    }
  });

  await check("P8.2 · Ningún enlace sale de Quality", async () => {
    for (const l of links(mirador(fichaHtml))) {
      assert(l.href.startsWith("/quality/"), `enlace fuera de Quality: ${l.href}`);
    }
  });

  await check("P8.3 · Ni rastro de PCR o Textiles en una empresa que no los tiene", async () => {
    const enlaces = links(fichaHtml).map((l) => l.href);
    for (const prohibido of ["/traceability", "/textiles"]) {
      assert(!enlaces.some((h) => h.startsWith(prohibido)), `la ficha enlaza a ${prohibido}`);
    }
  });

  await check("P8.4 · En un teléfono se apila; no hay tablas que se salgan", async () => {
    const m = mirador(fichaHtml);
    assert(!/<table/.test(m), "el mirador usa una tabla");
    const rejillas = [...m.matchAll(/class="([^"]*grid[^"]*)"/g)].map((x) => x[1]);
    assert(rejillas.length > 0, "el mirador no reparte nada en rejilla");
    for (const c of rejillas) {
      assert(c.includes("sm:grid-cols-"), `una rejilla sin punto de ruptura: «${c}»`);
    }
  });

  await check("P8.5 · Cada sección ofrece VER, y ninguna ofrece crear", async () => {
    const m = mirador(fichaHtml);
    const textos = links(m).map((l) => l.text);
    assert(textos.filter((t) => t.startsWith("Ver")).length >= 9,
      `esperaba un «Ver…» por sección, hay ${textos.filter((t) => t.startsWith("Ver")).length}`);
    for (const t of textos) {
      assert(!/crear|nuevo|añadir|agregar|editar/i.test(t), `el mirador ofrece «${t}»`);
    }
  });

  /** Un proceso de OTRA empresa, para comprobar que aquí no existe. */
  async function persona2(): Promise<string> {
    const otroEmail = `q13b2-otro-${sello}@test.trazaloop.dev`;
    const { data: u } = await admin.auth.admin.createUser({
      email: otroEmail, password, email_confirm: true,
      user_metadata: { full_name: "QA Otro" } });
    assert(u.user, "no se pudo crear la otra persona");
    const otro = createClient(URL_SB!, ANON!, {
      auth: { autoRefreshToken: false, persistSession: false } });
    await otro.auth.signInWithPassword({ email: otroEmail, password });
    const { data: o } = await otro.rpc("create_organization", { p_name: `QA Q13B2 Otra ${sello}` });
    const { data: p } = await otro.from("quality_processes").insert({
      organization_id: o as string, name: "QA Mirador · Proceso ajeno",
      category_code: "core" }).select("id").single();
    return p!.id as string;
  }

  console.log(`\nQUALITY-13B2 · aceptación del mirador: ${passed} en verde, ${failed} en rojo\n`);
  stopServers();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); stopServers(); process.exit(1); });
