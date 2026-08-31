/**
 * Trazaloop · PE-02B5B · Lo publicado, abriendo las páginas de verdad.
 *
 * Todo lo que se comprueba aquí ya está comprobado contra la base. Y aun así
 * hace falta, porque entre la base y la página caben dos fallos que ninguna
 * consulta ve: que la política se pinte con la sintaxis a la vista, y que la
 * puerta de aceptación deje a alguien dando vueltas.
 *
 * El bucle de aceptación es el que justifica esta suite entera. Se comprueba
 * abriendo la puerta, aceptando, y volviendo a pedir la misma pantalla — que es
 * exactamente lo que hace una persona, y lo único que demuestra que sale.
 *
 * Requisitos: `npm run build` previo y Supabase local en marcha.
 * Correr: npm run test:pe02b5b-e2e
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

const PORT = Number(process.env.PE02B5B_PORT ?? 3195);
const BASE = `http://localhost:${PORT}`;
const AUTH_COOKIE = `sb-${new global.URL(URL_SB).hostname.split(".")[0]}-auth-token`;

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
async function check(n: string, fn: () => Promise<void>) {
  try { await fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const admin = createClient(URL_SB, SERVICE,
  { auth: { autoRefreshToken: false, persistSession: false } });
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

/** El texto que se ve, sin etiquetas ni cargas útiles de React. */
function flat(html: string): string {
  return html.replace(/<script\b[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#x2F;/g, "/").replace(/&middot;/g, "·").replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s+/g, " ");
}
const has = (html: string, s: string) => flat(html).toLowerCase().includes(s.toLowerCase());
function links(html: string): { href: string; text: string }[] {
  return [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
    .map((m) => ({ href: m[1].replace(/&amp;/g, "&"), text: flat(m[2]).trim() }));
}
const cuenta = (html: string, etiqueta: string) =>
  (html.match(new RegExp(`<${etiqueta}[ >]`, "g")) ?? []).length;

async function main() {
  console.log("\nPE-02B5B · Lo publicado, por HTTP\n");
  console.log("  · levantando el build de producción…");
  servers.push(spawn("npx", ["next", "start", "-p", String(PORT)], {
    env: { ...process.env, QUALITY_MODULE_ENABLED: "true" }, stdio: "ignore",
  }));
  await waitUp();

  const anon = async (path: string) => {
    const r = await fetch(`${BASE}${path}`, { redirect: "manual" });
    return { status: r.status, location: r.headers.get("location"),
             body: r.status === 200 ? await r.text() : "" };
  };

  // =========================================================================
  console.log("A–D · La política, tal como la lee un cliente");
  // =========================================================================

  const priv = await anon("/privacy");

  await check("A. /privacy sirve la v1.1", async () => {
    assert(priv.status === 200, `/privacy dio ${priv.status}`);
    assert(has(priv.body, "v1.1"), "la página no dice qué versión sirve");
    assert(has(priv.body, "Política de tratamiento de datos personales"),
      "no se pinta el título del documento");
    // Y no la preliminar de CPR.
    assert(!has(priv.body, "versión preliminar de la política"),
      "se sigue sirviendo el texto de la v1");
  });

  await check("B. Y se lee, en vez de enseñar su sintaxis", async () => {
    const texto = flat(priv.body);
    assert(!texto.includes("##"), "quedan almohadillas a la vista");
    assert(!texto.includes("**"), "quedan asteriscos dobles a la vista");
    assert(!texto.includes("|---"), "queda una línea separadora de tabla");
    assert(!/\s\|\s/.test(texto), "quedan tuberías de tabla en el texto");
    // Y la estructura llegó: encabezados, tablas y listas de verdad.
    assert(cuenta(priv.body, "h2") >= 15, `solo hay ${cuenta(priv.body, "h2")} artículos`);
    assert(cuenta(priv.body, "table") >= 5, `solo hay ${cuenta(priv.body, "table")} tablas`);
    assert(cuenta(priv.body, "li") >= 40, "no se pintaron las listas");
    assert(cuenta(priv.body, "strong") >= 50, "no se pintó la negrita");
  });

  await check("C. Cada tabla lleva su propio desplazamiento", async () => {
    // Sin esto, una tabla de cuatro columnas empuja la página entera en un
    // teléfono y el documento se lee de lado.
    const tablas = cuenta(priv.body, "table");
    const envoltorios = (priv.body.match(/overflow-x-auto/g) ?? []).length;
    assert(envoltorios >= tablas,
      `hay ${tablas} tablas y ${envoltorios} contenedores de desplazamiento`);
  });

  await check("D. Y no se publicó ni una palabra de andamiaje", async () => {
    const texto = flat(priv.body);
    for (const rastro of ["BORRADOR", "docs/platform-experience", "PE_02B", "PE-02B",
      "Pendiente de confirmación", "TODO", "Resend"]) {
      assert(!texto.includes(rastro), `la política publicada dice «${rastro}»`);
    }
    // Ni el proveedor, que es una decisión de negocio que nadie tomó.
    for (const nombre of ["OpenAI", "Anthropic", "QUALITY_AI"]) {
      assert(!texto.includes(nombre), `la política nombra «${nombre}»`);
    }
    // Sí lo que se aprobó.
    assert(texto.includes("No se ha activado"), "falta la confirmación del entrenamiento");
    assert(texto.includes("No se tiene contratado"), "falta la confirmación de la retención");
  });

  // =========================================================================
  console.log("\nE–H · La FAQ que ve un visitante");
  // =========================================================================

  const faq = await anon("/faq");

  await check("E. La categoría de seguridad se ofrece, y con su nombre", async () => {
    assert(faq.status === 200, `/faq dio ${faq.status}`);
    assert(has(faq.body, "Seguridad y privacidad"),
      "la categoría de seguridad no aparece pese a tener contenido publicado");
    assert(links(faq.body).some((l) => l.href.includes("tema=seguridad")),
      "la categoría no es navegable");
  });

  await check("F. Las respuestas públicas abren y dicen lo suyo", async () => {
    const r = await anon("/faq/seguridad_como_protege");
    assert(r.status === 200, `la bandera dio ${r.status}`);
    assert(has(r.body, "aislamiento entre empresas"), "no se pinta la respuesta");
    assert(has(r.body, "Ninguna medida elimina el riesgo"),
      "se perdió el límite declarado al pintar");
    // Y nada del metadato editorial llega a la página.
    for (const interno of ["verified_with_qualifier", "source_basis", "AI_PROVIDER_POLICY",
      "PE-02B5A", "external_source"]) {
      assert(!has(r.body, interno), `la página expone metadato interno: «${interno}»`);
    }
  });

  await check("G. Las de sesión NO se leen sin sesión", async () => {
    for (const slug of ["seguridad_archivos", "seguridad_permisos",
      "seguridad_intelligence", "seguridad_ia_no_decide", "seguridad_anonimato"]) {
      const r = await anon(`/faq/${slug}`);
      // La página existe y responde con cortesía, pero sin el contenido.
      assert(!has(r.body, "almacenamiento privado") && !has(r.body, "enlace firmado"),
        `«${slug}» filtra su contenido a un visitante`);
      assert(!has(r.body, "campaña identificada"), `«${slug}» filtra su contenido`);
    }
  });

  await check("H. Buscar en español encuentra lo publicado, y nada más", async () => {
    // La promesa es que la búsqueda LLEGUE al contenido nuevo y no filtre lo de
    // sesión. No se exige que un término concreto devuelva una fila concreta:
    // eso sería fijar el índice, y el índice cambia cada vez que se edita una
    // respuesta. Lo que sí se exige es que ninguna búsqueda vuelva vacía.
    const términos = ["seguridad", "otra empresa", "inteligencia artificial",
      "entrenamiento", "archivos", "acceso"];
    const deSesion = ["seguridad_archivos", "seguridad_permisos", "seguridad_intelligence",
      "seguridad_ia_no_decide", "seguridad_anonimato"];
    for (const q of términos) {
      const r = await anon(`/faq?q=${encodeURIComponent(q)}`);
      assert(r.status === 200, `buscar «${q}» dio ${r.status}`);
      const encontrados = links(r.body).map((l) => l.href)
        .filter((h) => h.startsWith("/faq/"));
      assert(encontrados.some((h) => h.includes("/faq/seguridad_")),
        `buscar «${q}» no encuentra ninguna respuesta de seguridad`);
      for (const oculta of deSesion) {
        assert(!encontrados.some((h) => h.includes(oculta)),
          `buscar «${q}» sin sesión saca «${oculta}»`);
      }
    }
    // Y las palabras exactas de una respuesta sí llevan a ESA respuesta.
    const exactas: [string, string][] = [
      ["entrenar modelos", "seguridad_entrenamiento_modelos"],
      ["otra empresa", "seguridad_otra_empresa"],
    ];
    for (const [q, esperada] of exactas) {
      const r = await anon(`/faq?q=${encodeURIComponent(q)}`);
      assert(links(r.body).some((l) => l.href.includes(esperada)),
        `buscar «${q}» no encuentra «${esperada}»`);
    }
  });

  // =========================================================================
  console.log("\nI–L · La reaceptación, abriendo la puerta de verdad");
  // =========================================================================

  const sello = Date.now();
  const password = "Trazaloop-Test-1234";

  await check("I. Quien aceptó la v1 topa con la puerta", async () => {
    const email = `pe02b5b-e2e-vieja-${sello}@test.trazaloop.dev`;
    const { data: creado } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name: "QA vieja" } });
    const cli: SupabaseClient = createClient(URL_SB!, ANON!,
      { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: sesion } = await cli.auth.signInWithPassword({ email, password });
    assert(sesion.session, "iniciar sesión");

    // Su pasado: aceptó la v1 y los términos cuando eran lo vigente.
    const { data: docs } = await admin.from("legal_documents")
      .select("id, document_type, version")
      .or("and(document_type.eq.privacy,version.eq.v1),and(document_type.eq.terms,status.eq.active)");
    for (const d of (docs ?? []) as { id: string; document_type: string; version: string }[]) {
      await admin.from("user_legal_acceptances").insert({
        user_id: creado.user!.id, legal_document_id: d.id,
        document_type: d.document_type, version: d.version });
    }

    const b64 = Buffer.from(JSON.stringify(sesion.session), "utf8").toString("base64url");
    const cookie = `${AUTH_COOKIE}=base64-${b64}`;
    const r = await fetch(`${BASE}/modules`, { headers: { cookie }, redirect: "manual" });
    assert(r.status === 307 || r.status === 302,
      `quien no aceptó la vigente entró directo: ${r.status}`);
    assert((r.headers.get("location") ?? "").includes("/legal/accept"),
      `se le mandó a ${r.headers.get("location")} en vez de a aceptar`);
  });

  await check("J. La pantalla de aceptar dice qué se acepta", async () => {
    const email = `pe02b5b-e2e-pantalla-${sello}@test.trazaloop.dev`;
    const { data: creado } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name: "QA pantalla" } });
    const cli: SupabaseClient = createClient(URL_SB!, ANON!,
      { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: sesion } = await cli.auth.signInWithPassword({ email, password });
    const b64 = Buffer.from(JSON.stringify(sesion.session!), "utf8").toString("base64url");
    const cookie = `${AUTH_COOKIE}=base64-${b64}`;
    const r = await fetch(`${BASE}/legal/accept`, { headers: { cookie }, redirect: "manual" });
    assert(r.status === 200, `/legal/accept dio ${r.status}`);
    const html = await r.text();
    assert(has(html, "privacidad"), "no se nombra la política de privacidad");
    assert(links(html).some((l) => l.href === "/privacy"),
      "no se puede leer la política antes de aceptarla");
    assert(creado.user, "crear persona");
  });

  await check("K. Se acepta, y se SALE: no hay bucle", async () => {
    // La comprobación que justifica esta suite. Aceptar y volver a pedir la
    // misma pantalla es lo que hace una persona, y es lo único que demuestra
    // que la puerta se abre en vez de repetirse.
    const email = `pe02b5b-e2e-bucle-${sello}@test.trazaloop.dev`;
    const { data: creado } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name: "QA bucle" } });
    const cli: SupabaseClient = createClient(URL_SB!, ANON!,
      { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: sesion } = await cli.auth.signInWithPassword({ email, password });
    const b64 = Buffer.from(JSON.stringify(sesion.session!), "utf8").toString("base64url");
    const cookie = `${AUTH_COOKIE}=base64-${b64}`;

    // Antes: la puerta lo desvía.
    const antes = await fetch(`${BASE}/modules`, { headers: { cookie }, redirect: "manual" });
    assert((antes.headers.get("location") ?? "").includes("/legal/accept"),
      "no se le pidió aceptar antes de nada");

    // Acepta, por la misma vía que el formulario.
    const { error } = await cli.rpc("accept_active_legal_documents",
      { p_ip_address: null, p_user_agent: "b5b-e2e" });
    assert(!error, `aceptar: ${error?.message}`);

    // Después: entra. Y si volviera a /legal/accept, tampoco se queda atrapado.
    const despues = await fetch(`${BASE}/modules`, { headers: { cookie }, redirect: "manual" });
    assert(despues.status === 200,
      `tras aceptar sigue sin entrar: ${despues.status} → ${despues.headers.get("location")}`);
    const puerta = await fetch(`${BASE}/legal/accept`, { headers: { cookie }, redirect: "manual" });
    assert(puerta.status === 307 || puerta.status === 302 || puerta.status === 200,
      `la pantalla de aceptar dio ${puerta.status}`);
    if (puerta.status !== 200) {
      assert(!(puerta.headers.get("location") ?? "").includes("/legal/accept"),
        "la pantalla de aceptar se redirige a sí misma");
    }
    assert(creado.user, "crear persona");
  });

  await check("L. Y lo que aceptó es la v1.1", async () => {
    const email = `pe02b5b-e2e-nueva-${sello}@test.trazaloop.dev`;
    const { data: creado } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name: "QA nueva" } });
    const cli: SupabaseClient = createClient(URL_SB!, ANON!,
      { auth: { autoRefreshToken: false, persistSession: false } });
    await cli.auth.signInWithPassword({ email, password });
    await cli.rpc("accept_active_legal_documents",
      { p_ip_address: null, p_user_agent: "b5b-e2e" });
    const { data } = await admin.from("user_legal_acceptances")
      .select("version, document_type").eq("user_id", creado.user!.id);
    const privacidad = (data ?? []).filter((r) =>
      (r as { document_type: string }).document_type === "privacy");
    assert(privacidad.length === 1 &&
      String((privacidad[0] as { version: string }).version) === "v1.1",
      `aceptó «${privacidad.map((r) => (r as { version: string }).version).join(", ")}»`);
  });

  // =========================================================================
  console.log("\nM–N · Lo de PE-02 que no puede haberse movido");
  // =========================================================================

  await check("M. «Ayuda» sigue en la barra, y lleva a la FAQ", async () => {
    const email = `pe02b5b-e2e-ayuda-${sello}@test.trazaloop.dev`;
    const { data: creado } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name: "QA ayuda" } });
    const cli: SupabaseClient = createClient(URL_SB!, ANON!,
      { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: sesion } = await cli.auth.signInWithPassword({ email, password });
    await cli.rpc("accept_active_legal_documents",
      { p_ip_address: null, p_user_agent: "b5b-e2e" });
    const { data: orgId } = await cli.rpc("create_organization", { p_name: `QA B5B ${sello}` });
    await admin.from("organization_modules")
      .update({ enabled: true, access_mode: "full", access_expires_at: null })
      .eq("organization_id", orgId as string);

    const b64 = Buffer.from(JSON.stringify(sesion.session!), "utf8").toString("base64url");
    const firma = ORG_SECRET
      ? `.${createHmac("sha256", ORG_SECRET).update(String(orgId)).digest("base64url")}` : "";
    const cookie = `${AUTH_COOKIE}=base64-${b64}; tz-active-org=${orgId}${firma}`;
    for (const ruta of ["/modules", "/quality"]) {
      const r = await fetch(`${BASE}${ruta}`, { headers: { cookie }, redirect: "manual" });
      assert(r.status === 200, `${ruta} dio ${r.status}`);
      const html = await r.text();
      const ayudas = links(html).filter((l) => /^ayuda$/i.test(l.text));
      assert(ayudas.length > 0, `${ruta} se quedó sin entrada «Ayuda»`);
      for (const a of ayudas) {
        assert(/^\/faq(\?|$)/.test(a.href), `en ${ruta} «Ayuda» lleva a ${a.href}`);
      }
    }
    assert(creado.user, "crear persona");
  });

  await check("N. Y la portada pública sigue diciendo «Preguntas frecuentes»",
    async () => {
      // Dentro es «Ayuda» porque va a crecer; fuera es como se busca desde
      // fuera. Publicar contenido no puede haber movido ninguna de las dos.
      const r = await anon("/");
      assert(r.status === 200, `la portada dio ${r.status}`);
      const aLaFaq = links(r.body).filter((l) => l.href === "/faq");
      assert(aLaFaq.length > 0, "la portada perdió el enlace a la FAQ");
      assert(aLaFaq.some((l) => /preguntas frecuentes/i.test(l.text)),
        `la portada llama a la FAQ «${aLaFaq.map((l) => l.text).join(", ")}»`);
    });

  console.log(`\nPE-02B5B · publicado (HTTP): ${passed} en verde, ${failed} en rojo\n`);
  stopServers();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); stopServers(); process.exit(1); });
