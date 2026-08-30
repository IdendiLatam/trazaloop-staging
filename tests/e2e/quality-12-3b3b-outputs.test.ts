/**
 * Trazaloop · QUALITY-12.3B3B · Los tres PDF y el contexto de Intelligence.
 *
 * Contra el BUILD DE PRODUCCIÓN y por HTTP, con la sesión de una persona real.
 * Un PDF se prueba descargándolo: pedirle al adaptador que devuelva su modelo
 * probaría el modelo, no la descarga, y la descarga es donde viven el guardián
 * de módulo, el rol, la RLS y el nombre del archivo.
 *
 * Correr: npm run test:quality123b3b-outputs
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
if (!URL_SB || !ANON || !SERVICE) { console.error("Faltan variables."); process.exit(1); }

const PORT = Number(process.env.Q123B3B_PORT ?? 3182);
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
function stop() { for (const p of servers) { try { p.kill("SIGTERM"); } catch { /* ya está */ } } }

async function waitUp() {
  const limite = Date.now() + 120_000;
  while (Date.now() < limite) {
    try { const r = await fetch(`${BASE}/`, { redirect: "manual" }); if (r.status > 0) return; }
    catch { /* aún no */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("el servidor no arrancó");
}

const dia = (o: number) => new Date(Date.now() + o * 86_400_000).toISOString().slice(0, 10);

async function main() {
  const IP = await import("../../lib/db/quality-interested-parties");

  console.log("\nQUALITY-12.3B3B · PDF e Intelligence · build de producción\n");
  console.log("  · levantando el build…");
  servers.push(spawn("npx", ["next", "start", "-p", String(PORT)], {
    env: { ...process.env, QUALITY_MODULE_ENABLED: "true" }, stdio: "ignore" }));
  await waitUp();

  const sello = Date.now();
  const password = "Trazaloop-Test-1234";
  async function persona(tag: string) {
    const email = `q123b3bo-${tag}-${sello}@test.trazaloop.dev`;
    const { data } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name: `QA ${tag}` } });
    assert(data.user, `usuario ${tag}`);
    const cli: SupabaseClient = createClient(URL_SB!, ANON!, {
      auth: { autoRefreshToken: false, persistSession: false } });
    const { data: s } = await cli.auth.signInWithPassword({ email, password });
    assert(s.session, `sesión ${tag}`);
    await cli.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "q123b3b" });
    const { data: orgId } = await cli.rpc("create_organization", { p_name: `QA Q123 B3B ${tag} ${sello}` });
    const org = orgId as string;
    await admin.from("organization_modules")
      .update({ access_mode: "full", access_expires_at: null })
      .eq("organization_id", org).eq("module_code", "quality");
    const b64 = Buffer.from(JSON.stringify(s.session), "utf8").toString("base64url");
    const firma = ORG_SECRET
      ? `.${createHmac("sha256", ORG_SECRET).update(org).digest("base64url")}` : "";
    return { cli, org, cookie: `${AUTH_COOKIE}=base64-${b64}; tz-active-org=${org}${firma}` };
  }

  const a = await persona("a");
  const b = await persona("b");

  // --- Una historia con pasado: pertinente en su día, sucedida después.
  await IP.seedCategories(a.org, a.cli);
  const cats = await IP.listCategories(a.org, {}, a.cli);
  const catCli = cats.find((c) => c.code === "customers")!;
  const { data: parte } = await a.cli.from("quality_external_parties")
    .insert({ organization_id: a.org, legal_name: `QA Q123 Andina ${sello}`,
              trade_name: `QA Q123 Andina` }).select("id").single();

  const v1 = await IP.createAssessment(a.org, {
    categoryId: catCli.id, subjectKind: "external_party", subjectId: parte!.id,
    relevanceStatus: "relevant", relevanceRationale: "Canal institucional.",
    summary: "Primera lectura.",
  }, a.cli);
  assert(v1.ok, "no se pudo crear el análisis");
  const req1 = await IP.createRequirement(a.org, {
    assessmentId: v1.data, entryKind: "requirement", requirementKind: "contractual",
    title: "QA Q123 · SLA de 48 horas", relevanceStatus: "relevant",
  }, a.cli);
  assert(req1.ok, "no se pudo crear el requisito");
  // Se retrasa la primera lectura para que exista una ventana histórica real.
  await a.cli.from("quality_stakeholder_assessments")
    .update({ effective_from: dia(-30), assessed_on: dia(-30) }).eq("id", v1.data);
  await a.cli.from("quality_stakeholder_requirements")
    .update({ effective_from: dia(-30) }).eq("id", req1.data);

  const v2 = await IP.supersedeAssessment(a.org, {
    assessmentId: v1.data, relevanceStatus: "not_relevant",
    relevanceRationale: "Cerró su operación en el país.",
    summary: "Segunda lectura.",
  }, a.cli);
  assert(v2.ok, "no se pudo suceder el análisis");

  async function pdf(cookie: string, url: string) {
    const r = await fetch(`${BASE}${url}`, { headers: { cookie }, redirect: "manual" });
    const buf = r.status === 200 ? Buffer.from(await r.arrayBuffer()) : Buffer.alloc(0);
    return {
      status: r.status,
      disposition: r.headers.get("content-disposition") ?? "",
      type: r.headers.get("content-type") ?? "",
      buf,
      texto: buf.toString("latin1"),
    };
  }

  const EXPORT = "/export";

  // =========================================================================
  await check("N. El informe corriente se descarga y es un PDF de verdad", async () => {
    const r = await pdf(a.cookie, `${EXPORT}/quality.interested-party.list`);
    assert(r.status === 200, `dio ${r.status}`);
    assert(r.type.includes("application/pdf"), `tipo ${r.type}`);
    assert(r.buf.subarray(0, 4).toString() === "%PDF", "no empieza por %PDF");
    assert(/filename/i.test(r.disposition), "no propone nombre de archivo");
    assert(r.buf.length > 1000, `el PDF pesa ${r.buf.length} bytes: parece vacío`);
  });

  await check("O. La ficha de una parte se descarga con su nombre en el archivo", async () => {
    const r = await pdf(a.cookie, `${EXPORT}/quality.interested-party.detail?id=${v2.data}`);
    assert(r.status === 200, `dio ${r.status}`);
    assert(r.buf.subarray(0, 4).toString() === "%PDF", "no es un PDF");
    assert(/Parte-interesada/i.test(r.disposition),
      `el nombre del archivo no dice de qué es: ${r.disposition}`);
  });

  await check("P. El PDF «al [fecha]» lleva la fecha en el nombre y NO es el de hoy", async () => {
    const antes = await pdf(a.cookie,
      `${EXPORT}/quality.interested-party.historical?date=${dia(-15)}`);
    const ahora = await pdf(a.cookie,
      `${EXPORT}/quality.interested-party.historical?date=${dia(0)}`);
    assert(antes.status === 200 && ahora.status === 200,
      `dieron ${antes.status} y ${ahora.status}`);
    assert(antes.disposition.includes(dia(-15)),
      `el nombre no lleva la fecha de corte: ${antes.disposition}`);
    // Dos fechas, dos documentos. Si fueran iguales, el corte no se aplicaría.
    assert(!antes.buf.equals(ahora.buf),
      "el PDF de hace quince días es byte a byte el mismo que el de hoy");
  });

  await check("Q. El PDF histórico no filtra el análisis de HOY", async () => {
    // El renderizador escribe el texto en el flujo del PDF. No se necesita
    // extraerlo con una librería: basta comprobar que la cadena está o no.
    const antes = await pdf(a.cookie,
      `${EXPORT}/quality.interested-party.historical?date=${dia(-15)}`);
    const t = antes.texto;
    assert(/Estado al/.test(t) || /al 20/.test(t), "el papel no dice a qué fecha corresponde");
    assert(!/Segunda lectura/.test(t),
      "el documento histórico trae el resumen del análisis de hoy");
  });

  await check("R. El informe corriente SÍ declara que es el estado vigente", async () => {
    const r = await pdf(a.cookie, `${EXPORT}/quality.interested-party.list`);
    assert(/vigente/i.test(r.texto) || /Estado actual/i.test(r.texto),
      "el informe corriente no declara que retrata el presente");
  });

  await check("S. Otra empresa no descarga la ficha aunque tenga el identificador", async () => {
    const r = await pdf(b.cookie, `${EXPORT}/quality.interested-party.detail?id=${v2.data}`);
    assert(r.status !== 200, `B descargó la ficha de A (${r.status})`);
  });

  await check("T. Sin sesión no hay PDF", async () => {
    const r = await fetch(`${BASE}${EXPORT}/quality.interested-party.list`, { redirect: "manual" });
    assert(r.status !== 200, `se descargó sin sesión (${r.status})`);
  });

  await check("U. Los tres botones están en la pantalla y nombran claves reales", async () => {
    const r = await fetch(`${BASE}/quality/context/interested-parties`,
      { headers: { cookie: a.cookie } });
    const html = await r.text();
    assert(html.includes("quality.interested-party.list"), "falta el informe corriente");
    assert(html.includes("quality.interested-party.historical"), "falta el informe por fecha");
    assert(html.includes("Descargar PDF"), "el botón no usa la nomenclatura de la plataforma");

    const ficha = await fetch(`${BASE}/quality/context/interested-parties/${v2.data}`,
      { headers: { cookie: a.cookie } });
    const h2 = await ficha.text();
    assert(h2.includes("quality.interested-party.detail"), "la ficha no ofrece su PDF");
    // Y en modo histórico el botón cambia al documento que respeta la fecha.
    const hist = await fetch(
      `${BASE}/quality/context/interested-parties/${v2.data}?fecha=${dia(-15)}`,
      { headers: { cookie: a.cookie } });
    const h3 = await hist.text();
    assert(h3.includes("quality.interested-party.historical"),
      "en modo histórico se ofrece el PDF del presente");
    assert(!h3.includes("quality.interested-party.detail"),
      "en modo histórico sigue ofreciéndose la ficha de hoy");
  });

  await check("V. Intelligence se ofrece desde la ficha, con el contexto fijado", async () => {
    const r = await fetch(`${BASE}/quality/context/interested-parties/${v2.data}`,
      { headers: { cookie: a.cookie } });
    const html = await r.text();
    assert(html.includes("quality_stakeholder_assessment"),
      "el enlace a Intelligence no fija el contexto de esta parte");
    assert(/\/quality\/copilot\?/.test(html), "no enlaza al Copilot existente");
    // Y no hay una segunda caja de chat: es el mismo motor de siempre.
    assert(!/<textarea[^>]*name="question"/.test(html),
      "la ficha incrusta su propio chat en vez de reutilizar el Copilot");
  });

  console.log(`\n  ${passed} correctas, ${failed} fallidas\n`);
  stop();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); stop(); process.exit(1); });
