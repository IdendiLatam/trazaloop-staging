/**
 * Trazaloop Quality · QUALITY-13B4 · Aceptación de la portada · P1…P8.
 *
 * Contra el BUILD DE PRODUCCIÓN y por HTTP: entrar a Quality, ver qué requiere
 * atención, filtrar, llegar a la causa, y comprobar que ni un enlace lleva a un
 * 404. Cada destino sale del `href` que renderizó la pantalla anterior.
 *
 * Requisitos: `npm run build` previo y Supabase local en marcha.
 * Correr: npm run test:quality13b4-home-e2e
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
  console.error("Faltan variables para test:quality13b4-home-e2e."); process.exit(1);
}

const PORT = Number(process.env.Q13B4_PORT ?? 3183);
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

/** El trozo que es la portada, sin el armazón: el menú lateral nombra los
 *  mismos dominios y daría falsos positivos en todo. */
function portada(html: string): string {
  const i = html.indexOf('id="atencion-title"');
  if (i < 0) return "";
  const j = html.indexOf('id="nota-title"', i);
  return html.slice(i, j > 0 ? j : undefined);
}

async function main() {
  console.log("\nQUALITY-13B4 · aceptación de la portada · P1…P8\n");
  console.log("  · levantando el build de producción…");

  servers.push(spawn("npx", ["next", "start", "-p", String(PORT)], {
    env: { ...process.env, QUALITY_MODULE_ENABLED: "true" }, stdio: "ignore",
  }));
  await waitUp();

  const sello = Date.now();
  const email = `q13b4-e2e-${sello}@test.trazaloop.dev`;
  const password = "Trazaloop-Test-1234";
  const { data: creado } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: "QA Portada" } });
  assert(creado.user, "no se pudo crear la persona de prueba");

  const cli: SupabaseClient = createClient(URL_SB!, ANON!, {
    auth: { autoRefreshToken: false, persistSession: false } });
  const { data: sesion } = await cli.auth.signInWithPassword({ email, password });
  assert(sesion.session, "no se pudo iniciar sesión");
  await cli.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "q13b4" });

  const { data: orgId } = await cli.rpc("create_organization", { p_name: `QA Q13 B4 ${sello}` });
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
  // Los avisos de cada dominio se titulan con el CÓDIGO del sujeto —«Revisión
  // vencida: QB4E-R-…»—, no con su título largo. Es la palabra del dominio y la
  // portada no la reescribe, así que es por lo que hay que buscar.
  const CODIGO_RIESGO = corto(`QB4E-R-${sello}`);
  const CODIGO_HALLAZGO = corto(`QB4E-H-${sello}`);

  // =========================================================================
  // P6 (primera parte) · la portada VACÍA, antes de crear nada
  // =========================================================================
  await check("P6.1 · Sin nada que atender, se dice — y sin prometer conformidad", async () => {
    const r = await get("/quality");
    assert(r.status === 200, `/quality dio ${r.status} → ${r.location}`);
    const p = portada(r.body);
    assert(has(p, "No hay asuntos que requieran atención"), "no se dice que no hay nada");
    assert(has(p, "observada ahora mismo"), "no se acota a lo observado ahora");
    const plano = flat(r.body);
    for (const prohibido of ["ISO 9001", "cumple la norma", "certificad"]) {
      assert(!plano.toLowerCase().includes(prohibido.toLowerCase()),
        `la portada promete cumplimiento: «${prohibido}»`);
    }
  });

  // ── Los datos de QA ───────────────────────────────────────────────────────
  const { data: cargo } = await cli.from("quality_positions")
    .insert({ organization_id: org, name: "QA Q13 B4 · Jefe de calidad" }).select("id").single();
  await cli.from("quality_position_assignments").insert({
    organization_id: org, position_id: cargo!.id, profile_id: creado.user!.id,
    assignment_type: "holder", effective_from: "2026-01-01" });

  const { data: proc } = await cli.from("quality_processes").insert({
    organization_id: org, name: "QA Q13 B4 · Despacho a cliente", code: "QA-B4-PR-01",
    category_code: "core", status: "active", owner_position_id: cargo!.id })
    .select("id").single();

  const { data: riesgo } = await cli.from("quality_risks").insert({
    organization_id: org, code: corto(`QB4E-R-${sello}`),
    title: "QA Q13 B4 · Riesgo sin revisar",
    event_description: "Lleva sin revisarse desde enero.",
    owner_position_id: cargo!.id, status: "active", next_review_on: "2026-01-05" })
    .select("id").single();
  await cli.from("quality_risk_processes").insert({
    organization_id: org, risk_id: riesgo!.id, process_id: proc!.id });

  const { data: auditoria } = await cli.from("quality_audits").insert({
    organization_id: org, code: corto(`QB4E-A-${sello}`),
    title: "QA Q13 B4 · Auditoría interna", status: "planned",
    scheduled_from: "2026-01-02", scheduled_to: "2026-01-10",
    owner_position_id: cargo!.id }).select("id").single();
  await cli.from("quality_audit_findings").insert({
    organization_id: org, audit_id: auditoria!.id, code: corto(`QB4E-H-${sello}`),
    statement: "QA Q13 B4 · No se registra la verificación de salida",
    process_id: proc!.id, evaluation_status: "pending", raised_on: "2026-01-03" });

  const { data: parteProv } = await cli.from("quality_external_parties").insert({
    organization_id: org, legal_name: `QA Q13 B4 Empaques ${sello}` }).select("id").single();
  await cli.from("quality_supplier_profiles").insert({
    organization_id: org, party_id: parteProv!.id,
    next_review_on: "2026-01-04", owner_position_id: cargo!.id });

  await cli.rpc("quality_seed_stakeholder_categories", { p_organization_id: org });
  const { data: cat } = await cli.from("quality_stakeholder_categories")
    .select("id").eq("organization_id", org).eq("code", "customers").single();
  const { data: parte } = await cli.from("quality_external_parties").insert({
    organization_id: org, legal_name: `QA Q13 B4 Cliente ${sello}` }).select("id").single();
  const { data: analisis } = await cli.from("quality_stakeholder_assessments").insert({
    organization_id: org, category_id: cat!.id, subject_kind: "external_party",
    external_party_id: parte!.id, relevance_status: "relevant" }).select("id").single();
  await cli.from("quality_stakeholder_requirements").insert({
    organization_id: org, assessment_id: analisis!.id, entry_kind: "requirement",
    requirement_kind: "contractual", title: "QA Q13 B4 · Entrega en 48 horas" });

  for (const rpc of ["quality_scan_risk_reviews", "quality_scan_audits",
                     "quality_scan_supplier_reviews"]) {
    const { error } = await cli.rpc(rpc, { p_organization_id: org });
    assert(!error, `${rpc}: ${error?.message}`);
  }

  let homeHtml = "";

  // =========================================================================
  // P1 · Jerarquía
  // =========================================================================
  await check("P1.1 · Lo que hay que atender va PRIMERO", async () => {
    const r = await get("/quality");
    assert(r.status === 200, `dio ${r.status}`);
    homeHtml = r.body;
    const plano = flat(homeHtml);
    const atencion = plano.indexOf("Necesita atención");
    const donde = plano.indexOf("Dónde entrar");
    assert(atencion > 0, "la portada no encabeza con lo que hay que atender");
    assert(donde > atencion, "los recuentos administrativos van antes que la atención");
  });

  await check("P1.2 · Y nada se llama «desempeño» siendo completitud", async () => {
    assert(!has(portada(homeHtml), "desempeño"),
      "la portada vuelve a llamar «desempeño» a algo que no lo es");
  });

  await check("P1.3 · No hay un formulario ni un botón de resolver", async () => {
    const p = portada(homeHtml);
    assert(!/<form/.test(p), "la portada tiene un formulario");
    assert(!has(p, "marcar como resuelto"), "la portada ofrece resolver desde aquí");
  });

  // =========================================================================
  // P2 · Atención deduplicada
  // =========================================================================
  await check("P2.1 · El total aparece y los asuntos se ven", async () => {
    const p = portada(homeHtml);
    assert(/asuntos?\b/.test(flat(p)), "no se dice cuántos asuntos hay");
    assert(has(p, CODIGO_RIESGO), "no se ve el riesgo");
    assert(has(p, CODIGO_HALLAZGO), "no se ve el hallazgo");
    assert(has(p, "Vencido"), "no se agrupa lo vencido");
  });

  await check("P2.2 · El riesgo aparece UNA vez, no dos", async () => {
    const plano = flat(portada(homeHtml));
    const veces = plano.split(CODIGO_RIESGO).length - 1;
    assert(veces === 1, `el mismo asunto aparece ${veces} veces (aviso y pendiente)`);
  });

  await check("P2.3 · No se enseña ni una palabra de cómo está hecho", async () => {
    const plano = flat(homeHtml).toLowerCase();
    for (const p of ["quality_scan", "work_alerts", "work_tasks", "dedupe",
                     "supersedes", "observador", "barrido"]) {
      assert(!plano.includes(p), `la portada enseña vocabulario de dentro: «${p}»`);
    }
  });

  await check("P2.4 · Y se aclara lo que NO es una no conformidad", async () => {
    assert(has(portada(homeHtml), "no es una no conformidad hasta que la auditoría lo evalúa"),
      "no se aclara que un hallazgo sin evaluar no es una no conformidad");
  });

  // =========================================================================
  // P3 · Navegación causal
  // =========================================================================
  await check("P3.1 · Cada asunto lleva a su causa, y ABRE", async () => {
    const destinos = [...new Set(links(portada(homeHtml)).map((l) => l.href))];
    assert(destinos.length >= 8, `la portada ofrece ${destinos.length} destinos`);
    for (const d of destinos) {
      const r = await get(d);
      assert(r.status === 200, `«${d}» respondió ${r.status} → ${r.location}`);
    }
  });

  await check("P3.2 · El riesgo lleva a SU ficha", async () => {
    assert(links(portada(homeHtml)).some((l) => l.href === `/quality/risks/${riesgo!.id}`),
      "el riesgo de la portada no lleva a su ficha");
  });

  // =========================================================================
  // P4 · Filtros
  // =========================================================================
  await check("P4.1 · Filtrar por dominio funciona EN SERVIDOR", async () => {
    const filtro = links(homeHtml).find((l) => l.href.includes("dominio=audits"));
    assert(filtro, "no se ofrece filtrar por auditorías");
    const r = await get(filtro!.href);
    assert(r.status === 200, `el filtro dio ${r.status}`);
    const p = portada(r.body);
    assert(has(p, CODIGO_HALLAZGO), "el filtro perdió el hallazgo");
    assert(!has(p, CODIGO_RIESGO), "el filtro de auditorías deja pasar los riesgos");
    assert(has(r.body, "Filtrado por: Auditorías"), "no se dice por qué se filtró");
  });

  await check("P4.2 · Y se puede quitar", async () => {
    const r = await get("/quality?dominio=audits");
    const quitar = links(r.body).find((l) => /quitar el filtro/i.test(l.text));
    assert(quitar?.href === "/quality", `el enlace para quitar el filtro es ${quitar?.href}`);
  });

  await check("P4.3 · Un dominio inventado no vacía la portada", async () => {
    const r = await get("/quality?dominio=tabla_secreta");
    assert(r.status === 200, `dio ${r.status}`);
    assert(has(portada(r.body), CODIGO_RIESGO),
      "un filtro con un valor inválido dejó la portada vacía, como si no hubiera nada");
  });

  // =========================================================================
  // P5 · Proceso y mirador
  // =========================================================================
  await check("P5.1 · Filtrando por proceso se acota y se ofrece el mirador", async () => {
    const r = await get(`/quality?proceso=${proc!.id}`);
    assert(r.status === 200, `dio ${r.status}`);
    assert(has(r.body, "Despacho a cliente"), "no se dice por qué proceso se filtró");
    const mirador = links(r.body).find((l) => /mirador/i.test(l.text));
    assert(mirador?.href === `/quality/processes/${proc!.id}`,
      `el mirador enlaza a ${mirador?.href}`);
    const ficha = await get(mirador!.href);
    assert(ficha.status === 200, `el mirador dio ${ficha.status}`);
    assert(has(ficha.body, "El proceso en el sistema de gestión"),
      "el enlace no lleva al mirador de proceso");
  });

  await check("P5.2 · Y lo que se ve acotado es lo del proceso", async () => {
    const r = await get(`/quality?proceso=${proc!.id}`);
    const p = portada(r.body);
    assert(has(p, CODIGO_RIESGO), "no se ve el riesgo del proceso");
    assert(!has(p, "Empaques"), "se cuela un asunto que no es de ese proceso");
  });

  // =========================================================================
  // P6 · Estados
  // =========================================================================
  await check("P6.2 · Con asuntos, ya no se dice que no hay nada", async () => {
    assert(!has(portada(homeHtml), "No hay asuntos que requieran atención"),
      "se dice «no hay nada» habiendo asuntos");
  });

  await check("P6.3 · Un proceso ajeno no filtra la portada de otra empresa", async () => {
    const otroEmail = `q13b4-otro-${sello}@test.trazaloop.dev`;
    await admin.auth.admin.createUser({
      email: otroEmail, password, email_confirm: true,
      user_metadata: { full_name: "QA Otro" } });
    const otro = createClient(URL_SB!, ANON!, {
      auth: { autoRefreshToken: false, persistSession: false } });
    await otro.auth.signInWithPassword({ email: otroEmail, password });
    const { data: o2 } = await otro.rpc("create_organization", { p_name: `QA Q13 B4 otra ${sello}` });
    const { data: pAjeno } = await otro.from("quality_processes").insert({
      organization_id: o2 as string, name: "QA Q13 B4 · Proceso ajeno",
      category_code: "core" }).select("id").single();

    const r = await get(`/quality?proceso=${pAjeno!.id}`);
    assert(r.status === 200, `dio ${r.status}`);
    assert(!has(r.body, "Proceso ajeno"), "se filtró el nombre de un proceso de otra empresa");
  });

  // =========================================================================
  // P7 · Dónde entrar
  // =========================================================================
  await check("P7.1 · Las doce baldosas, con Contexto entre ellas", async () => {
    const plano = flat(homeHtml);
    const donde = plano.slice(plano.indexOf("Dónde entrar"));
    for (const d of ["Contexto", "Procesos", "Riesgos y oportunidades",
                     "Objetivos e indicadores", "Casos y acciones", "Documentos", "Personas",
                     "Proveedores", "Voz del cliente", "Auditorías",
                     "Revisión por la dirección", "Automatización"]) {
      assert(donde.includes(d), `falta la baldosa «${d}»`);
    }
  });

  await check("P7.2 · Contexto trae su resumen y lleva a Partes interesadas", async () => {
    assert(has(homeHtml, "pertinentes"), "Contexto no dice cuántas partes son pertinentes");
    assert(links(homeHtml).some((l) => l.href === "/quality/context/interested-parties"),
      "no se llega a Partes interesadas desde la portada");
  });

  await check("P7.3 · Y cada baldosa dice cuánto pide atención", async () => {
    const plano = flat(homeHtml);
    assert(/asuntos? que atender/.test(plano),
      "ninguna baldosa dice cuántos asuntos tiene");
  });

  // =========================================================================
  // P8 · Pantalla pequeña e independencia de módulo
  // =========================================================================
  await check("P8.1 · Sin tablas y con punto de ruptura", async () => {
    const p = portada(homeHtml);
    assert(!/<table/.test(p), "la portada usa una tabla");
    const rejillas = [...homeHtml.matchAll(/class="([^"]*grid[^"]*)"/g)].map((m) => m[1]);
    assert(rejillas.length > 0, "la portada no reparte nada en rejilla");
    assert(rejillas.some((c) => c.includes("sm:grid-cols-")),
      "ninguna rejilla tiene punto de ruptura");
  });

  await check("P8.2 · Ni rastro de PCR o Textiles", async () => {
    const enlaces = links(homeHtml).map((l) => l.href);
    for (const prohibido of ["/traceability", "/textiles"]) {
      assert(!enlaces.some((h) => h.startsWith(prohibido)), `la portada enlaza a ${prohibido}`);
    }
  });

  await check("P8.3 · Todos los enlaces de la portada son de Quality", async () => {
    for (const l of links(portada(homeHtml))) {
      assert(l.href.startsWith("/quality"), `enlace fuera de Quality: ${l.href}`);
      assert(l.text.length > 0, `enlace sin nombre: ${l.href}`);
    }
  });

  console.log(`\nQUALITY-13B4 · aceptación de la portada: ${passed} en verde, ${failed} en rojo\n`);
  stopServers();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); stopServers(); process.exit(1); });
