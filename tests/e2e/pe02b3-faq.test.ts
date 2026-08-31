/**
 * Trazaloop · PE-02B3 · La FAQ recorrida por HTTP · P1…P8.
 *
 * Contra el BUILD DE PRODUCCIÓN. Lo que solo se ve aquí: que la portada tenga
 * de verdad una jerarquía en el HTML, que se llegue a la FAQ sin saberse la
 * URL, que una respuesta con sesión no se filtre al visitante por ninguna de
 * las puertas, y que ningún enlace muera.
 *
 * Requisitos: `npm run build` previo y Supabase local en marcha.
 * Correr: npm run test:pe02b3-e2e
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

const PORT = Number(process.env.PE02B3_PORT ?? 3193);
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

function flat(html: string): string {
  return html.replace(/<script\b[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#x2F;/g, "/").replace(/&middot;/g, "·").replace(/&nbsp;/g, " ")
    .replace(/&iquest;/g, "¿").replace(/\s+/g, " ");
}
const has = (html: string, s: string) => flat(html).toLowerCase().includes(s.toLowerCase());
function links(html: string): { href: string; text: string }[] {
  return [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
    .map((m) => ({ href: m[1].replace(/&amp;/g, "&"), text: flat(m[2]).trim() }));
}

async function main() {
  console.log("\nPE-02B3 · La FAQ por HTTP · P1…P8\n");
  console.log("  · levantando el build de producción…");
  servers.push(spawn("npx", ["next", "start", "-p", String(PORT)], {
    env: { ...process.env, QUALITY_MODULE_ENABLED: "true" }, stdio: "ignore",
  }));
  await waitUp();

  const sello = Date.now();
  const password = "Trazaloop-Test-1234";

  // Sin sesión: exactamente lo que tiene un visitante.
  const anon = async (path: string) => {
    const r = await fetch(`${BASE}${path}`, { redirect: "manual" });
    return { status: r.status, location: r.headers.get("location"),
             body: r.status === 200 ? await r.text() : "" };
  };

  // Con sesión, en una empresa SIN Textiles: es el escenario de P5.
  const email = `pe02b3-e2e-${sello}@test.trazaloop.dev`;
  const { data: creado } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: "QA B3" } });
  assert(creado.user, "crear persona");
  const cli: SupabaseClient = createClient(URL_SB!, ANON!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: sesion } = await cli.auth.signInWithPassword({ email, password });
  assert(sesion.session, "iniciar sesión");
  await cli.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "b3" });
  const { data: orgId } = await cli.rpc("create_organization", { p_name: `QA B3 ${sello}` });
  await admin.from("organization_modules").update({ enabled: false })
    .eq("organization_id", orgId as string);
  await admin.from("organization_modules")
    .update({ enabled: true, access_mode: "full", access_expires_at: null })
    .eq("organization_id", orgId as string).eq("module_code", "quality");

  const b64 = Buffer.from(JSON.stringify(sesion.session), "utf8").toString("base64url");
  const firma = ORG_SECRET
    ? `.${createHmac("sha256", ORG_SECRET).update(String(orgId)).digest("base64url")}` : "";
  const cookie = `${AUTH_COOKIE}=base64-${b64}; tz-active-org=${orgId}${firma}`;
  const conSesion = async (path: string) => {
    const r = await fetch(`${BASE}${path}`, { headers: { cookie }, redirect: "manual" });
    return { status: r.status, location: r.headers.get("location"),
             body: r.status === 200 ? await r.text() : "" };
  };

  // =========================================================================
  // P1 · La portada: la jerarquía
  // =========================================================================
  let portada = "";
  await check("P1.1 · Quality se pinta antes y más grande", async () => {
    const r = await anon("/");
    assert(r.status === 200, `la portada dio ${r.status}`);
    portada = r.body;
    const hero = portada.indexOf('id="modulo-principal"');
    const resto = portada.indexOf('id="modulos-especializados"');
    assert(hero > 0 && resto > 0, "no están los dos bloques");
    assert(hero < resto, "el protagonista se pinta después");
    const bloqueHero = portada.slice(hero - 400, resto);
    assert(/text-2xl|text-3xl/.test(bloqueHero), "el protagonista no titula más grande");
  });

  await check("P1.2 · Con su nombre y su frase congelada", async () => {
    assert(has(portada, "Trazaloop Quality"), "no está el protagonista");
    assert(has(portada, "Gestiona procesos, riesgos, objetivos, personas, proveedores"),
      "no está la frase acordada");
    assert(has(portada, "Módulos especializados"), "no se separan los especializados");
  });

  await check("P1.3 · Los tres, en su orden, y Construcción inerte", async () => {
    const plano = flat(portada);
    const pos = ["Trazaloop Quality", "Trazaloop PCR", "Trazaloop Textiles",
      "Trazaloop Construcción"].map((n) => plano.indexOf(n));
    assert(pos.every((p, i) => p >= 0 && (i === 0 || p > pos[i - 1])),
      `el orden cambió: ${pos.join(", ")}`);
    const bloque = portada.slice(portada.indexOf('id="modulos-especializados"'));
    assert(!/<button/.test(bloque), "el módulo futuro se ofrece como botón");
    assert(has(bloque, "Todavía no está disponible"), "no se explica el módulo futuro");
    const destinos = links(bloque).map((l) => l.href);
    assert(!destinos.some((h) => /construc/i.test(h)), "el módulo futuro enlaza");
  });

  await check("P1.4 · Y no se enseña estado de empresa a quien no ha entrado", async () => {
    for (const p of ["No incluido", "Acceso suspendido", "No se pudo verificar",
      "Prueba finalizada"]) {
      assert(!has(portada, p), `la portada enseña «${p}» sin que nadie haya entrado`);
    }
  });

  // =========================================================================
  // P2 · Encontrar la FAQ sin saberse la URL
  // =========================================================================
  let faq = "";
  await check("P2.1 · Desde la portada, sin sesión", async () => {
    const enlaces = links(portada).filter((l) => l.href === "/faq");
    assert(enlaces.length >= 2,
      `solo hay ${enlaces.length} caminos a la FAQ desde la portada`);
    const r = await anon("/faq");
    assert(r.status === 200, `/faq dio ${r.status} → ${r.location ?? "—"}`);
    faq = r.body;
  });

  await check("P2.2 · Y desde dentro, en la navegación transversal", async () => {
    const puerta = await conSesion("/modules");
    assert(puerta.status === 200, `/modules dio ${puerta.status}`);
    assert(links(puerta.body).some((l) => l.href === "/faq"),
      "desde la puerta no se llega a la FAQ");
    const quality = await conSesion("/quality");
    assert(quality.status === 200, `/quality dio ${quality.status}`);
    assert(links(quality.body).some((l) => l.href.startsWith("/faq")),
      "dentro de un módulo no se llega a la FAQ");
  });

  await check("P2.3 · La página abre preguntando, no vendiendo", async () => {
    assert(has(faq, "¿En qué podemos ayudarte?"), "no está el encabezado");
    assert(has(faq, "Lo que más se pregunta"), "no hay destacadas");
    assert(has(faq, "Por temas"), "no hay temas");
    assert((faq.match(/<h1/g) ?? []).length === 1,
      "la página tiene más de un encabezado principal");
  });

  // =========================================================================
  // P3 · Buscar, filtrar, encontrar
  // =========================================================================
  await check("P3.1 · Buscar en español encuentra lo que se busca", async () => {
    const r = await anon("/faq?q=contrase%C3%B1a");
    assert(r.status === 200, `la búsqueda dio ${r.status}`);
    assert(has(r.body, "Perdí mi contraseña"), "no encuentra la pregunta de la contraseña");
    assert(has(r.body, "Resultados"), "no se dice que son resultados");
  });

  await check("P3.2 · Una búsqueda sin resultados NO se cuenta como avería", async () => {
    const r = await anon("/faq?q=xilofonoinexistente");
    assert(r.status === 200, `la búsqueda dio ${r.status}`);
    assert(has(r.body, "No hay resultados para esa búsqueda"), "no se dice que no hay");
    assert(!has(r.body, "No se pudieron cargar"), "una búsqueda vacía se cuenta como avería");
  });

  await check("P3.3 · Los temas filtran, y se conservan al buscar", async () => {
    const r = await anon("/faq?tema=soporte");
    assert(r.status === 200, `el tema dio ${r.status}`);
    assert(has(r.body, "Soporte"), "no se ve el tema elegido");
    assert(!has(r.body, "Perdí mi contraseña"),
      "el filtro por tema deja pasar preguntas de otro tema");
    // El buscador conserva el tema: buscar no debe sacarte de donde estabas.
    assert(/name="tema" value="soporte"/.test(r.body),
      "buscar dentro de un tema perdería el tema");
  });

  await check("P3.5 · A un visitante no se le ofrece un tema vacío para él",
    async () => {
      // Buena parte de las respuestas de PCR o de Intelligence hablan del uso
      // diario y exigen sesión. Ofrecer esos temas a quien no ha entrado sería
      // llevarlo a una pantalla vacía: un menú que promete lo que no cumple.
      const temas = links(faq).filter((l) => l.href.startsWith("/faq?tema="));
      assert(temas.length >= 3, `solo se ofrecen ${temas.length} temas`);
      for (const t of temas) {
        const r = await anon(t.href);
        assert(r.status === 200, `${t.href} dio ${r.status}`);
        assert(!has(r.body, "Este tema todavía no tiene preguntas"),
          `se ofrece el tema «${t.text}» y para un visitante está vacío`);
      }
      // Y con sesión se ofrecen MÁS temas, porque hay más que leer.
      const conSes = await conSesion("/faq");
      const temasConSesion = links(conSes.body).filter((l) => l.href.startsWith("/faq?tema="));
      assert(temasConSesion.length > temas.length,
        `con sesión se ofrecen ${temasConSesion.length} temas y sin ella ${temas.length}`);
    });

  await check("P3.4 · Las destacadas salen del dato", async () => {
    // Se quita una destacada y desaparece de la portada de la FAQ.
    const { data } = await admin.from("faq_entries")
      .select("id, is_featured").eq("slug", "papeles").single();
    const id = (data as { id: string }).id;
    await admin.from("faq_entries").update({ is_featured: false }).eq("id", id);
    const sin = await anon("/faq");
    const dest = sin.body.slice(sin.body.indexOf("Lo que más se pregunta"),
      sin.body.indexOf("Todas las preguntas"));
    assert(!has(dest, "¿Qué papeles existen"),
      "quitar una destacada no la quita de las destacadas");
    await admin.from("faq_entries").update({ is_featured: true }).eq("id", id);
  });

  // =========================================================================
  // P4 · Con sesión se lee más
  // =========================================================================
  await check("P4.1 · Aparecen las respuestas que exigen sesión", async () => {
    const r = await conSesion("/faq");
    assert(r.status === 200, `/faq con sesión dio ${r.status}`);
    assert(has(r.body, "Empieza por la pantalla de módulos"),
      "no aparece una respuesta que exige sesión");
    assert(!has(r.body, "Hay más respuestas dentro de Trazaloop"),
      "a quien ya entró se le sigue ofreciendo entrar");
  });

  await check("P4.2 · Y a quien no ha entrado se le dice que hay más", async () => {
    assert(has(faq, "Hay más respuestas dentro de Trazaloop"),
      "no se dice que con sesión hay más");
    assert(links(faq).some((l) => l.href === "/login"), "no se ofrece iniciar sesión");
  });

  // =========================================================================
  // P5 · Lo que no se filtra
  // =========================================================================
  await check("P5.1 · Una respuesta con sesión no se lee sin ella", async () => {
    const r = await anon("/faq/por_donde_empiezo");
    assert(r.status === 200, `dio ${r.status}`);
    assert(has(r.body, "No encontramos esa pregunta"),
      "una respuesta que exige sesión se leyó sin sesión");
    assert(!has(r.body, "Empieza por la pantalla de módulos"),
      "se filtró el texto de una respuesta que exige sesión");
    // Ni por el título de la pestaña.
    assert(!/<title>[^<]*Empieza por/.test(r.body),
      "se filtró por los metadatos");
  });

  await check("P5.2 · Ni buscándola, ni por su tema", async () => {
    const buscada = await anon("/faq?q=%22Empieza+por+la+pantalla%22");
    assert(!has(buscada.body, "Empieza por la pantalla de módulos"),
      "buscando su texto aparece una respuesta que exige sesión");
    const tema = await anon("/faq?tema=primeros_pasos");
    assert(!has(tema.body, "Empieza por la pantalla de módulos"),
      "por su tema aparece una respuesta que exige sesión");
  });

  await check("P5.3 · No se filtra procedencia editorial por ningún lado", async () => {
    for (const [n, html] of [["la lista", faq],
      ["una respuesta", (await anon("/faq/que_es_trazaloop")).body],
      ["con sesión", (await conSesion("/faq")).body]] as const) {
      const plano = flat(html).toLowerCase();
      for (const p of ["verificada", "se apoya en", "salvedad", "nota del cambio",
        "revisión 1", "borrador"]) {
        assert(!plano.includes(p), `${n} filtra «${p}»`);
      }
    }
  });

  await check("P5.4 · Un módulo no contratado NO oculta su documentación", async () => {
    // Esta empresa solo tiene Quality; la respuesta de Textiles se lee igual.
    const r = await conSesion("/faq/pasaporte_textil");
    assert(r.status === 200, `dio ${r.status}`);
    assert(has(r.body, "pasaporte textil"),
      "una empresa sin Textiles no puede leer la documentación de Textiles");
    const porModulo = await conSesion("/faq?modulo=textiles");
    assert(porModulo.status === 200 && has(porModulo.body, "Trazaloop Textiles"),
      "el filtro por un módulo no contratado no devuelve nada");
  });

  // =========================================================================
  // P6 · El enlace directo
  // =========================================================================
  await check("P6.1 · Cada respuesta tiene su dirección, y funciona", async () => {
    const enlaces = links(faq).filter((l) => /^\/faq\/[a-z0-9_]+$/.test(l.href));
    assert(enlaces.length >= 5, `solo hay ${enlaces.length} respuestas enlazadas`);
    for (const l of enlaces.slice(0, 8)) {
      const r = await anon(l.href);
      assert(r.status === 200, `${l.href} dio ${r.status}`);
      assert(!has(r.body, "No encontramos esa pregunta"),
        `${l.href} está enlazada desde la lista y no se puede abrir`);
    }
  });

  await check("P6.2 · Con su título propio y sin indexar lo que no se puede leer",
    async () => {
      const r = await anon("/faq/que_es_trazaloop");
      assert(/<title>[^<]*Trazaloop/.test(r.body), "la respuesta no tiene título propio");
      const sin = await anon("/faq/no_existe_esta_pregunta");
      assert(sin.status === 200, `una dirección inexistente dio ${sin.status}`);
      assert(has(sin.body, "No encontramos esa pregunta"), "no se explica");
      assert(/noindex/.test(sin.body) || !/<meta name="robots"[^>]*index/.test(sin.body),
        "una dirección que no lleva a nada se ofrece para indexar");
    });

  await check("P6.3 · Ningún enlace de la FAQ muere", async () => {
    const internos = [...new Set(links(faq).map((l) => l.href))]
      .filter((h) => h.startsWith("/"));
    assert(internos.length >= 8, `solo hay ${internos.length} enlaces internos`);
    for (const href of internos) {
      const r = await anon(href);
      assert(r.status !== 404, `${href} da 404`);
      assert(r.status !== 500, `${href} da 500`);
    }
  });

  // =========================================================================
  // P7 · La copia de /modules
  // =========================================================================
  await check("P7.1 · La nota técnica ya no está, y sí la acordada", async () => {
    const r = await conSesion("/modules");
    assert(r.status === 200, `/modules dio ${r.status}`);
    assert(!has(r.body, "hora del servidor"), "la puerta sigue hablando de la hora del servidor");
    assert(has(r.body, "Los módulos disponibles dependen del acceso de tu empresa"),
      "no está la frase acordada");
    assert(has(r.body, "tu rol define las funciones que puedes usar"),
      "falta la segunda mitad");
  });

  await check("P7.2 · Y sigue sin haber jerga interna", async () => {
    const r = await conSesion("/modules");
    for (const jerga of ["entitlement", "derivedState", "RLS", "kill switch", "tenant"]) {
      assert(!has(r.body, jerga), `la puerta enseña «${jerga}»`);
    }
  });

  // =========================================================================
  // P8 · Pantalla estrecha, accesibilidad, independencia
  // =========================================================================
  await check("P8.1 · El buscador se anuncia y tiene nombre", async () => {
    assert(/role="search"/.test(faq), "el formulario no se anuncia como búsqueda");
    assert(/aria-label="Buscar en las preguntas frecuentes"/.test(faq),
      "el campo de búsqueda no tiene nombre accesible");
    assert(/aria-current="page"/.test((await anon("/faq?tema=soporte")).body),
      "el tema activo no se anuncia");
  });

  await check("P8.2 · Nada obliga a desplazarse en horizontal", async () => {
    for (const [n, html] of [["la portada", portada], ["la FAQ", faq],
      ["una respuesta", (await anon("/faq/que_es_trazaloop")).body]] as const) {
      assert(!/overflow-x-(auto|scroll)/.test(html), `${n} se desplaza en horizontal`);
      assert(!/\bw-\[\d{3,}px\]/.test(html), `${n} tiene un ancho fijo en píxeles`);
      assert(!/<table/.test(html), `${n} usa una tabla`);
    }
  });

  await check("P8.3 · La FAQ es transversal: no vive dentro de un módulo", async () => {
    const enlaces = links(faq).map((l) => l.href);
    for (const propio of ["/quality/", "/dashboard", "/textiles/"]) {
      assert(!enlaces.some((h) => h.startsWith(propio)),
        `la FAQ enlaza al interior de un módulo: ${propio}`);
    }
    // Y su dirección no cuelga de ninguno.
    assert(!enlaces.some((h) => /^\/(quality|textiles|traceability)\/faq/.test(h)),
      "hay una FAQ dentro de un módulo");
  });

  await check("P8.4 · La consola de la FAQ no se ofrece a quien no es plataforma",
    async () => {
      const dentro = await conSesion("/quality");
      assert(!links(dentro.body).some((l) => l.href.startsWith("/platform")),
        "a una empresa se le ofrece la consola de plataforma");
      const consola = await conSesion("/platform/faq");
      assert(consola.status !== 200 || !has(consola.body, "Nueva pregunta"),
        "una empresa entró a administrar la FAQ");
    });

  stopServers();
  console.log(`\nPE-02B3 · FAQ (HTTP): ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); stopServers(); process.exit(1); });
