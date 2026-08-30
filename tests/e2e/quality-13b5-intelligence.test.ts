/**
 * Trazaloop Quality · QUALITY-13B5 · Aceptación integrada · P1…P8.
 *
 * Contra el BUILD DE PRODUCCIÓN y por HTTP: llegar a Intelligence desde la
 * portada y desde el mirador de proceso, comprobar que el contexto queda fijado
 * a donde se pulsó, que las preguntas sugeridas son las de ese sitio, y que
 * ningún enlace lleva a un 404.
 *
 * NO se llama a ningún proveedor: se comprueba la composición y la navegación,
 * que es lo que este tramo entrega.
 *
 * Requisitos: `npm run build` previo y Supabase local en marcha.
 * Correr: npm run test:quality13b5-e2e
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
  console.error("Faltan variables para test:quality13b5-e2e."); process.exit(1);
}

const PORT = Number(process.env.Q13B5_PORT ?? 3185);
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
    // El `href` viene con las entidades del HTML: un enlace con varios
    // parámetros trae `&amp;`, y pedirlo tal cual convierte `id` en `amp;id`.
    // Se ve como un 200 perfecto en el que el contexto no llegó.
    .map((m) => ({ href: m[1].replace(/&amp;/g, "&"), text: flat(m[2]).trim() }));
}

/**
 * Las entradas CONTEXTUALES a Intelligence, que son las que este tramo añade.
 *
 * El menú lateral tiene su propia entrada a Intelligence desde QUALITY-12, y
 * sale en todas las páginas: contarla como una entrada de la pantalla haría
 * creer que hay tres donde hay una.
 */
function entradasContextuales(html: string) {
  return links(html).filter((l) => l.href.startsWith("/quality/copilot?type="));
}

async function main() {
  console.log("\nQUALITY-13B5 · aceptación integrada · P1…P8\n");
  console.log("  · levantando el build de producción…");

  servers.push(spawn("npx", ["next", "start", "-p", String(PORT)], {
    env: { ...process.env, QUALITY_MODULE_ENABLED: "true" }, stdio: "ignore",
  }));
  await waitUp();

  const sello = Date.now();
  const email = `q13b5-e2e-${sello}@test.trazaloop.dev`;
  const password = "Trazaloop-Test-1234";
  const { data: creado } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: "QA Integrada" } });
  assert(creado.user, "no se pudo crear la persona de prueba");

  const cli: SupabaseClient = createClient(URL_SB!, ANON!, {
    auth: { autoRefreshToken: false, persistSession: false } });
  const { data: sesion } = await cli.auth.signInWithPassword({ email, password });
  assert(sesion.session, "no se pudo iniciar sesión");
  await cli.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "q13b5" });

  const { data: orgId } = await cli.rpc("create_organization", { p_name: `QA Q13 B5 ${sello}` });
  const org = orgId as string;
  await admin.from("organization_modules")
    .update({ access_mode: "full", access_expires_at: null })
    .eq("organization_id", org).eq("module_code", "quality");
  // Intelligence viene APAGADO por defecto —§77: nadie lo enciende por ti—, así
  // que la empresa de prueba lo enciende, que es lo que haría quien administra
  // Calidad antes de usarlo.
  const { error: eAjustes } = await admin.from("quality_ai_settings")
    .upsert({ organization_id: org, is_enabled: true, allow_customer: true },
            { onConflict: "organization_id" });
  assert(!eAjustes, `encender Intelligence: ${eAjustes?.message}`);

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
  const { data: cargo } = await cli.from("quality_positions")
    .insert({ organization_id: org, name: "QA Q13 B5 · Jefe de calidad" }).select("id").single();
  await cli.from("quality_position_assignments").insert({
    organization_id: org, position_id: cargo!.id, profile_id: creado.user!.id,
    assignment_type: "holder", effective_from: "2026-01-01" });
  const { data: proc } = await cli.from("quality_processes").insert({
    organization_id: org, name: "QA Q13 B5 · Despacho a cliente", code: "QA-B5-PR-01",
    category_code: "core", status: "active", owner_position_id: cargo!.id })
    .select("id").single();
  const { data: riesgo } = await cli.from("quality_risks").insert({
    organization_id: org, code: corto(`QB5E-R-${sello}`),
    title: "QA Q13 B5 · Riesgo sin revisar",
    event_description: "Lleva sin revisarse desde enero.",
    owner_position_id: cargo!.id, status: "active", next_review_on: "2026-01-05" })
    .select("id").single();
  await cli.from("quality_risk_processes").insert({
    organization_id: org, risk_id: riesgo!.id, process_id: proc!.id });
  await cli.rpc("quality_scan_risk_reviews", { p_organization_id: org });

  // =========================================================================
  // P1 · Portada → Intelligence
  // =========================================================================
  let copilotHome = "";
  await check("P1.1 · La portada ofrece preguntar, y es UN enlace", async () => {
    const r = await get("/quality");
    assert(r.status === 200, `/quality dio ${r.status}`);
    const entradas = entradasContextuales(r.body);
    assert(entradas.length === 1, `la portada ofrece ${entradas.length} entradas contextuales`);
    assert(entradas[0].href.includes("type=quality_home"),
      `la entrada no fija el contexto a la portada: ${entradas[0].href}`);
    const c = await get(entradas[0].href);
    assert(c.status === 200, `Intelligence dio ${c.status}`);
    copilotHome = c.body;
  });

  await check("P1.2 · Intelligence sabe de dónde vienes", async () => {
    assert(has(copilotHome, "Contexto:"), "no se dice desde dónde se pregunta");
    assert(has(copilotHome, "Portada de Quality"), "no se nombra la portada");
    assert(has(copilotHome, "fuentes relacionadas con portada de quality"),
      "no se dice qué se va a consultar");
  });

  // =========================================================================
  // P2 · Preguntas sugeridas
  // =========================================================================
  await check("P2.1 · Las sugerencias son las de la portada", async () => {
    assert(has(copilotHome, "Qué requiere atención"), "falta la sugerencia principal");
    assert(has(copilotHome, "Procesos con más abierto"), "falta la de procesos");
    assert(has(copilotHome, "Qué revisar hoy"), "falta la de qué revisar");
    // Y NO las genéricas de siempre, que no cruzan dominios.
    assert(!has(copilotHome, "Cambios del trimestre"),
      "se mezclan las sugerencias genéricas con las de la portada");
  });

  await check("P2.2b · Sin proveedor configurado, se dice y no se finge", async () => {
    if (!has(copilotHome, "no hay ningún proveedor")) return;
    assert(has(copilotHome, "sin pasar por ningún modelo"),
      "no se explica qué pasa cuando no hay proveedor configurado");
  });

  await check("P2.2 · Y ninguna le pide al modelo una decisión formal", async () => {
    const plano = flat(copilotHome);
    for (const p of ["marca como conforme", "declara la no conformidad", "aprueba el"]) {
      assert(!plano.toLowerCase().includes(p), `se sugiere una decisión formal: «${p}»`);
    }
  });

  // =========================================================================
  // P3 y P4 · Mirador de proceso → Intelligence, con el contexto fijado
  // =========================================================================
  let copilotProc = "";
  await check("P3.1 · Desde el proceso se llega con el contexto del proceso", async () => {
    const ficha = await get(`/quality/processes/${proc!.id}`);
    assert(ficha.status === 200, `la ficha dio ${ficha.status}`);
    const entrada = entradasContextuales(ficha.body)[0];
    assert(entrada, "el mirador de proceso no ofrece preguntar a Intelligence");
    assert(entrada!.href.includes("type=quality_process"),
      `no se fija el contexto al proceso: ${entrada!.href}`);
    assert(entrada!.href.includes(proc!.id as string), "no se fija A QUÉ proceso");
    const c = await get(entrada!.href);
    assert(c.status === 200, `Intelligence dio ${c.status}`);
    copilotProc = c.body;
  });

  await check("P4.1 · El contexto queda fijado AL PROCESO, y con sus sugerencias", async () => {
    assert(has(copilotProc, "Contexto:"), "no se dice desde dónde se pregunta");
    assert(has(copilotProc, "Despacho a cliente"), "no se nombra el proceso de origen");
    assert(has(copilotProc, "fuentes relacionadas con mirador de proceso"),
      "no se dice qué se va a consultar para este proceso");
    assert(has(copilotProc, "Resumir el proceso"), "falta la sugerencia de resumen");
    assert(has(copilotProc, "Requisitos que le afectan"),
      "falta la de requisitos de partes interesadas");
    assert(has(copilotProc, "Antes de una auditoría"), "falta la de preparación de auditoría");
  });

  await check("P4.2 · Una sola entrada por pantalla, sin proliferación", async () => {
    const ficha = await get(`/quality/processes/${proc!.id}`);
    const entradas = entradasContextuales(ficha.body);
    assert(entradas.length === 1,
      `la ficha de proceso ofrece ${entradas.length} entradas contextuales`);
  });

  // =========================================================================
  // P5 · Citas y enlaces
  // =========================================================================
  await check("P5.1 · Intelligence abre y todos sus enlaces son válidos", async () => {
    const destinos = [...new Set(links(copilotProc)
      .map((l) => l.href)
      .filter((h) => h.startsWith("/quality")))];
    assert(destinos.length > 0, "Intelligence no ofrece ningún destino");
    for (const d of destinos) {
      const r = await get(d);
      assert(r.status === 200, `«${d}» respondió ${r.status} → ${r.location}`);
    }
  });

  await check("P5.2 · Y se dice que cita de dónde sale cada cosa", async () => {
    assert(has(copilotProc, "cita de dónde sale cada cosa"),
      "no se explica que la respuesta va con fuentes");
  });

  // =========================================================================
  // P6 · Permisos y límites
  // =========================================================================
  await check("P6.1 · Se dice qué NO decide Intelligence", async () => {
    assert(has(copilotProc, "no decide nada por su cuenta"),
      "no se dice que Intelligence no decide");
    assert(has(copilotProc, "no aprende") || has(copilotProc, "no entrena"),
      "no se aclara que no aprende de la empresa");
  });

  await check("P6.2 · Un proceso ajeno no fija contexto de otra empresa", async () => {
    const otroEmail = `q13b5-otro-${sello}@test.trazaloop.dev`;
    await admin.auth.admin.createUser({
      email: otroEmail, password, email_confirm: true,
      user_metadata: { full_name: "QA Otro" } });
    const otro = createClient(URL_SB!, ANON!, {
      auth: { autoRefreshToken: false, persistSession: false } });
    await otro.auth.signInWithPassword({ email: otroEmail, password });
    const { data: o2 } = await otro.rpc("create_organization", { p_name: `QA Q13 B5 otra ${sello}` });
    const { data: pAjeno } = await otro.from("quality_processes").insert({
      organization_id: o2 as string, name: "QA Q13 B5 · Proceso ajeno",
      category_code: "core" }).select("id").single();

    const r = await get(`/quality/copilot?type=quality_process&id=${pAjeno!.id}&label=Ajeno`);
    assert(r.status === 200, `dio ${r.status}`);
    assert(!has(r.body, "Proceso ajeno"), "se filtró el nombre de un proceso de otra empresa");
  });

  // =========================================================================
  // P7 · Momento
  // =========================================================================
  await check("P7.1 · Se puede elegir sobre qué momento se pregunta", async () => {
    assert(has(copilotHome, "actual") || has(copilotHome, "momento"),
      "no se ofrece elegir el momento de la pregunta");
  });

  // =========================================================================
  // P8 · Independencia de módulo
  // =========================================================================
  await check("P8.1 · Ni rastro de PCR o Textiles", async () => {
    for (const html of [copilotHome, copilotProc]) {
      const enlaces = links(html).map((l) => l.href);
      for (const prohibido of ["/traceability", "/textiles"]) {
        assert(!enlaces.some((h) => h.startsWith(prohibido)),
          `Intelligence enlaza a ${prohibido}`);
      }
    }
  });

  await check("P8.2 · Y la portada y el mirador siguen funcionando", async () => {
    const home = await get("/quality");
    assert(home.status === 200 && has(home.body, "Necesita atención"),
      "la portada dejó de funcionar");
    const ficha = await get(`/quality/processes/${proc!.id}`);
    assert(ficha.status === 200 && has(ficha.body, "El proceso en el sistema de gestión"),
      "el mirador de proceso dejó de funcionar");
  });

  console.log(`\nQUALITY-13B5 · aceptación integrada: ${passed} en verde, ${failed} en rojo\n`);
  stopServers();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); stopServers(); process.exit(1); });
