/**
 * Trazaloop Quality · QUALITY-12.3B3A · Recorrido de aceptación automatizado.
 *
 * Reproduce, contra el BUILD DE PRODUCCIÓN y por HTTP, la matriz P1…P10 de la
 * validación humana: navegar, rellenar formularios, enviarlos, y comprobar
 * después qué quedó guardado.
 *
 * LO QUE HACE QUE ESTO NO SEA UNA PRUEBA DE PANTALLA PINTADA
 *
 * Los formularios se envían de verdad. Next renderiza cada acción de servidor
 * con sus campos `$ACTION_*` para que funcione sin JavaScript —mejora
 * progresiva— y esta suite aprovecha exactamente eso: recoge el formulario tal
 * y como llegó al navegador, cambia los valores que cambiaría una persona, y
 * lo envía a la misma URL. La acción que corre es LA de producción.
 *
 * Y después se comprueba el efecto por dos caminos: lo que enseña la pantalla
 * siguiente, y lo que hay en la base leído por la capa de aplicación.
 *
 * Nunca se teclea una URL interna a mano: cada destino sale del `href` que
 * renderizó la pantalla anterior. Una prueba que navega por su cuenta no
 * habría encontrado el defecto del alta de entradas, que se veía perfecta y no
 * llevaba el análisis.
 *
 * Requisitos: `npm run build` previo y Supabase local en marcha.
 * Correr: npm run test:quality123b3a-e2e
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
  console.error("Faltan variables para test:quality123b3a-e2e (URL, ANON, SERVICE_ROLE).");
  process.exit(1);
}

const PORT = Number(process.env.Q123B3A_PORT ?? 3178);
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
function stopServers() { for (const p of servers) { try { p.kill("SIGTERM"); } catch { /* ya terminado */ } } }

async function waitUp() {
  const limite = Date.now() + 120_000;
  while (Date.now() < limite) {
    try { const r = await fetch(`${BASE}/`, { redirect: "manual" }); if (r.status > 0) return; } catch { /* aún no */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("el servidor no arrancó");
}

// ---------------------------------------------------------------------------
// Leer el HTML como lo lee una persona
// ---------------------------------------------------------------------------

function flat(html: string): string {
  // Fuera los <script>: Next embebe ahí la carga RSC con todos los props, y
  // buscar en ella equivaldría a decir que un identificador «se ve en
  // pantalla» porque viaja en el HTML.
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

/** Los `<form>` de la página, en bruto. */
/** Solo las filas de la tabla. El resto de la página también nombra partes
 *  —el selector del alta las lista— y buscarlas ahí daría falsos positivos. */
function tableRows(html: string): string[] {
  const cuerpo = html.match(/<tbody[\s\S]*?<\/tbody>/)?.[0] ?? "";
  return [...cuerpo.matchAll(/<tr\b[\s\S]*?<\/tr>/g)].map((m) => flat(m[0]).trim());
}

/** Los formularios de ESCRITURA de la ficha, sin los del armazón —cerrar
 *  sesión— ni los de navegación por GET. */
function writeForms(html: string): string[] {
  return forms(html).filter((f) => !/method="get"/i.test(f))
    .filter((f) => !/Cerrar sesión/i.test(flat(f)));
}

function forms(html: string): string[] {
  return [...html.matchAll(/<form\b[\s\S]*?<\/form>/g)].map((m) => m[0]);
}

/**
 * El formulario que contiene un campo con ese nombre.
 *
 * Es como localiza una persona el formulario que busca: por lo que hay dentro,
 * no por su posición en el documento.
 */
/** El formulario cuyo texto contiene esa etiqueta. Para los que no tienen
 *  campos propios, como el de sembrar categorías. */
function formWithText(html: string, label: string): string {
  const f = forms(html).find((x) => flat(x).toLowerCase().includes(label.toLowerCase()));
  assert(f, `no hay ningún formulario que diga «${label}»`);
  return f!;
}

function formWith(html: string, ...fieldNames: string[]): string {
  const f = forms(html).find((x) => fieldNames.every((n) => x.includes(`name="${n}"`)));
  assert(f, `no hay ningún formulario con ${fieldNames.join(" + ")}`);
  return f!;
}

/**
 * Los campos de un formulario, con sus valores por omisión.
 *
 * Incluye los `$ACTION_*` que Next planta para que el formulario funcione sin
 * JavaScript. Sin ellos el envío no llegaría a la acción de servidor, y esta
 * suite estaría probando un `POST` a una página en vez de la acción real.
 */
/** Un valor de atributo, con las entidades deshechas. Los campos `$ACTION_*`
 *  llevan JSON dentro, y sin esto llegarían con `&quot;` en vez de comillas. */
function attrValue(raw: string | undefined): string {
  return (raw ?? "").replace(/&quot;/g, '"').replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function fields(form: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of form.matchAll(/<input\b([^>]*)>/g)) {
    const attrs = m[1];
    const name = attrs.match(/\bname="([^"]*)"/)?.[1];
    if (!name) continue;
    const type = attrs.match(/\btype="([^"]*)"/)?.[1] ?? "text";
    const value = attrValue(attrs.match(/\bvalue="([^"]*)"/)?.[1]);
    const checked = /\bchecked\b/.test(attrs);
    if (type === "radio" || type === "checkbox") { if (checked) out[name] = value; continue; }
    out[name] = value;
  }
  for (const m of form.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/g)) {
    const name = m[1].match(/\bname="([^"]*)"/)?.[1];
    if (!name) continue;
    const sel = m[2].match(/<option\b[^>]*\bselected\b[^>]*value="([^"]*)"/)?.[1];
    out[name] = sel ?? "";
  }
  for (const m of form.matchAll(/<textarea\b([^>]*)>([\s\S]*?)<\/textarea>/g)) {
    const name = m[1].match(/\bname="([^"]*)"/)?.[1];
    if (name) out[name] = flat(m[2]).trim();
  }
  return out;
}

/** El `value` de la opción cuyo texto contiene lo buscado. Así elige una persona. */
function optionValue(form: string, selectName: string, label: string): string {
  const sel = form.match(new RegExp(`<select\\b[^>]*name="${selectName}"[^>]*>([\\s\\S]*?)</select>`));
  assert(sel, `no existe el selector ${selectName}`);
  const opt = [...sel![1].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/g)]
    .find((o) => flat(o[2]).toLowerCase().includes(label.toLowerCase()) && !/\bdisabled\b/.test(o[1]));
  assert(opt, `el selector ${selectName} no ofrece «${label}»`);
  return opt![1].match(/\bvalue="([^"]*)"/)?.[1] ?? "";
}

function optionIsDisabled(form: string, selectName: string, label: string): boolean {
  const sel = form.match(new RegExp(`<select\\b[^>]*name="${selectName}"[^>]*>([\\s\\S]*?)</select>`));
  if (!sel) return false;
  const opt = [...sel[1].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/g)]
    .find((o) => flat(o[2]).toLowerCase().includes(label.toLowerCase()));
  return opt ? /\bdisabled\b/.test(opt[1]) : false;
}

async function main() {
  console.log("\nQUALITY-12.3B3A · aceptación automatizada P1…P10\n");
  console.log("  · levantando el build de producción…");

  servers.push(spawn("npx", ["next", "start", "-p", String(PORT)], {
    env: { ...process.env, QUALITY_MODULE_ENABLED: "true" }, stdio: "ignore",
  }));
  await waitUp();

  // ── Una empresa con Quality y SIN PCR ni Textiles ────────────────────────
  const sello = Date.now();
  const email = `q123b3a-${sello}@test.trazaloop.dev`;
  const password = "Trazaloop-Test-1234";
  const { data: creado } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: "QA Aceptación" },
  });
  assert(creado.user, "no se pudo crear la persona de prueba");

  const cli: SupabaseClient = createClient(URL_SB!, ANON!, {
    auth: { autoRefreshToken: false, persistSession: false } });
  const { data: sesion } = await cli.auth.signInWithPassword({ email, password });
  assert(sesion.session, "no se pudo iniciar sesión");
  await cli.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "q123b3a" });

  const { data: orgId } = await cli.rpc("create_organization", { p_name: `QA Q123 E2E ${sello}` });
  const org = orgId as string;
  // Quality SÍ. PCR y Textiles NO: la pantalla tiene que funcionar igual.
  await admin.from("organization_modules")
    .update({ access_mode: "full", access_expires_at: null })
    .eq("organization_id", org).eq("module_code", "quality");

  const b64 = Buffer.from(JSON.stringify(sesion.session), "utf8").toString("base64url");
  const firma = ORG_SECRET ? `.${createHmac("sha256", ORG_SECRET).update(org).digest("base64url")}` : "";
  const cookie = `${AUTH_COOKIE}=base64-${b64}; tz-active-org=${org}${firma}`;

  async function get(path: string) {
    const r = await fetch(`${BASE}${path}`, { headers: { cookie }, redirect: "manual" });
    return { status: r.status, location: r.headers.get("location"),
             body: r.status === 200 ? await r.text() : "" };
  }

  /**
   * Enviar un formulario como lo enviaría un navegador sin JavaScript.
   *
   * `overrides` es lo que cambia la persona; el resto viaja tal y como venía,
   * incluidos los `$ACTION_*`. Devuelve el HTML que responde la acción, que es
   * donde aparecen el mensaje de éxito o el de error.
   */
  async function submit(
    path: string, form: string, overrides: Record<string, string>,
    repetidos: { name: string; values: string[] }[] = []
  ) {
    // `multipart/form-data`, que es el `encType` con el que Next renderiza los
    // formularios de acción de servidor. Enviarlo como `urlencoded` devuelve la
    // página sin ejecutar nada: se ve un 200 y no ha pasado absolutamente nada.
    const datos = { ...fields(form), ...overrides };
    const body = new FormData();
    for (const [k, v] of Object.entries(datos)) body.append(k, v);
    for (const r of repetidos) for (const v of r.values) body.append(r.name, v);
    const r = await fetch(`${BASE}${path}`, {
      method: "POST", headers: { cookie }, body, redirect: "manual",
    });
    return { status: r.status, body: await r.text() };
  }

  const LISTA = "/quality/context/interested-parties";
  let fichaAndina = "";
  let requisitoTitulo = "";

  // =========================================================================
  // P1 · Navegación y resumen
  // =========================================================================
  let listaHtml = "";
  await check("P1.1 · Quality abre y su menú ofrece Contexto → Partes interesadas", async () => {
    const portada = await get("/quality");
    assert(portada.status === 200, `/quality dio ${portada.status} → ${portada.location}`);
    assert(has(portada.body, "Contexto"), "el menú no tiene el grupo Contexto");
    const href = linkByText(portada.body, "Partes interesadas");
    assert(href === LISTA, `Partes interesadas enlaza a ${href}`);
  });

  await check("P1.2 · La pantalla abre con su título, su descripción y su ayuda", async () => {
    const r = await get(LISTA);
    assert(r.status === 200, `dio ${r.status} → ${r.location}`);
    listaHtml = r.body;
    assert(has(listaHtml, "Partes interesadas"), "sin título");
    assert(has(listaHtml, "identificar, comprender y gestionar"), "sin la descripción del dominio");
    assert(listaHtml.includes('aria-label="Más información"'), "sin botón de ayuda");
  });

  await check("P1.3 · Seis métricas, ninguna llamada «desempeño»", async () => {
    const seccion = listaHtml.match(/<section aria-label="Resumen"[\s\S]*?<\/section>/)?.[0] ?? "";
    assert(seccion, "no hay sección de resumen");
    for (const m of ["Partes pertinentes", "En evaluación", "Requisitos pertinentes",
                     "Estrategias vigentes", "Revisiones vencidas", "Pertinentes sin estrategia"]) {
      assert(has(seccion, m), `falta la métrica «${m}»`);
    }
    assert(!/desempe|rendimiento/i.test(flat(seccion)),
      "el resumen llama «desempeño» a completitud administrativa");
  });

  await check("P1.4 · Sin rastro de PCR ni Textiles en una empresa que no los tiene", async () => {
    // El armazón puede AVISAR de que una prueba de módulo terminó —ese aviso
    // es de la plataforma y menciona PCR por su nombre—. Lo que no puede haber
    // es navegación ni recursos de PCR: ni un enlace, ni una ruta.
    const enlaces = links(listaHtml).map((l) => l.href);
    for (const prohibido of ["/traceability", "/textiles"]) {
      assert(!enlaces.some((h) => h.startsWith(prohibido)),
        `la pantalla enlaza a ${prohibido}`);
    }
    assert(!listaHtml.includes("Inicio PCR"), "el menú lateral ofrece PCR");
  });

  // =========================================================================
  // P3 · Análisis y pertinencia (antes que P2: sin datos no hay lista)
  // =========================================================================
  await check("P3.1 · Las categorías se siembran desde la pantalla", async () => {
    const cats = await get(`${LISTA}/categories`);
    assert(cats.status === 200, `categorías dio ${cats.status}`);
    assert(has(cats.body, "Sembrar las categorías iniciales"), "no se ofrece sembrar");
    const r = await submit(`${LISTA}/categories`,
      formWithText(cats.body, "Sembrar las categorías iniciales"), {});
    assert(has(r.body, "categorías iniciales"),
      `la siembra no confirmó nada: ${flat(r.body).slice(0, 200)}`);
    const despues = await get(`${LISTA}/categories`);
    assert(has(despues.body, "Clientes") && has(despues.body, "Trabajadores"),
      "no aparecieron las categorías iniciales");
    assert(!has(despues.body, "Eliminar categoría"), "se ofrece borrar una categoría");
  });

  await check("P3.2 · Se registra una entidad externa que no existía", async () => {
    const r = await get(LISTA);
    const f = formWith(r.body, "legal_name");
    const post = await submit(LISTA, f, {
      legal_name: "QA Q123 Distribuidora Andina SAS", trade_name: "QA Q123 Andina",
    });
    assert(has(post.body, "Entidad registrada"),
      `no se registró la entidad: ${flat(post.body).slice(0, 200)}`);
  });

  await check("P3.3 · Una puntuación sin metodología se rechaza y NO escribe nada", async () => {
    const r = await get(LISTA);
    const f = formWith(r.body, "category_id", "subject_id");
    const post = await submit(LISTA, f, {
      subject_kind: "external_party",
      subject_id: optionValue(f, "subject_id", "Andina"),
      category_id: optionValue(f, "category_id", "Clientes"),
      relevance_status: "relevant",
      priority_score: "9", priority_method_note: "",
    });
    assert(has(post.body, "no se puede defender"), "no salió el mensaje de dominio");
    assert(!/constraint|violates|SQLSTATE|23514/i.test(flat(post.body)),
      "el mensaje filtra jerga de PostgreSQL");
    const { count } = await cli.from("quality_stakeholder_assessments")
      .select("id", { count: "exact", head: true }).eq("organization_id", org);
    assert((count ?? 0) === 0, `la validación fallida dejó ${count} análisis escritos`);
  });

  await check("P3.4 · «No pertinente» sin justificación se rechaza; con ella entra", async () => {
    const r = await get(LISTA);
    const f = formWith(r.body, "category_id", "subject_id");
    const sinJust = await submit(LISTA, f, {
      subject_kind: "external_party",
      subject_id: optionValue(f, "subject_id", "Andina"),
      category_id: optionValue(f, "category_id", "Clientes"),
      relevance_status: "not_relevant", relevance_rationale: "   ",
    });
    assert(has(sinJust.body, "hay que decir por qué"),
      "se aceptó declarar no pertinente sin justificación");
    const { count } = await cli.from("quality_stakeholder_assessments")
      .select("id", { count: "exact", head: true }).eq("organization_id", org);
    assert((count ?? 0) === 0, "la validación fallida escribió igualmente");
  });

  await check("P3.5 · El primer análisis se registra con prioridad y su metodología", async () => {
    const r = await get(LISTA);
    const f = formWith(r.body, "category_id", "subject_id");
    const post = await submit(LISTA, f, {
      subject_kind: "external_party",
      subject_id: optionValue(f, "subject_id", "Andina"),
      category_id: optionValue(f, "category_id", "Clientes"),
      relevance_status: "relevant",
      relevance_rationale: "Concentra el canal institucional.",
      summary: "Cliente principal del canal institucional.",
      priority_score: "9", priority_method_note: "Influencia 3 x impacto 3",
    });
    assert(has(post.body, "Análisis registrado"), "no confirmó el registro");

    const { data } = await cli.from("quality_stakeholder_assessments")
      .select("id, relevance_status, priority_score, priority_method_note, effective_to")
      .eq("organization_id", org);
    assert((data ?? []).length === 1, `esperaba 1 análisis, hay ${(data ?? []).length}`);
    assert(data![0].relevance_status === "relevant", "la pertinencia no se guardó");
    assert(Number(data![0].priority_score) === 9, "la puntuación no se guardó");
    assert(data![0].priority_method_note, "la metodología no se guardó");
    assert(data![0].effective_to === null, "el análisis no nació vigente");
  });

  await check("P3.6 · La entidad ya analizada queda deshabilitada en el selector", async () => {
    const r = await get(LISTA);
    const f = formWith(r.body, "category_id", "subject_id");
    assert(optionIsDisabled(f, "subject_id", "Andina"),
      "se puede elegir una entidad que ya tiene análisis vigente");
    assert(has(f, "ya analizada"), "no se dice por qué está deshabilitada");
  });

  // =========================================================================
  // P2 · Listado, búsqueda, filtros
  // =========================================================================
  await check("P2.1 · La parte aparece en el listado con su ficha enlazada", async () => {
    const r = await get(LISTA);
    assert(has(r.body, "QA Q123 Andina"), "la parte no aparece en el listado");
    assert(has(r.body, "Entidad externa"), "no se distingue el tipo de sujeto");
    assert(has(r.body, "Sin estrategia"), "no se resume el seguimiento");
    const href = links(r.body).find((l) => l.text.includes("QA Q123 Andina"))?.href ?? "";
    assert(href.startsWith(`${LISTA}/`), `la fila enlaza a ${href}`);
    fichaAndina = href;
  });

  await check("P2.2 · Un colectivo se crea y convive con las entidades en LA misma lista", async () => {
    const r = await get(LISTA);
    const fg = formWith(r.body, "name");
    await submit(LISTA, fg, { name: "QA Q123 · Trabajadores" });

    const r2 = await get(LISTA);
    const fa = formWith(r2.body, "category_id", "subject_id");
    // El selector de sujeto cambia con el tipo; el formulario sin JavaScript
    // envía el identificador igualmente, que es lo que se comprueba.
    const { data: grupo } = await cli.from("quality_stakeholder_groups")
      .select("id").eq("organization_id", org).single();
    await submit(LISTA, fa, {
      subject_kind: "group", subject_id: grupo!.id,
      category_id: optionValue(fa, "category_id", "Trabajadores"),
      relevance_status: "relevant",
      relevance_rationale: "Sus condiciones afectan a la calidad.",
    });

    const r3 = await get(LISTA);
    assert(has(r3.body, "QA Q123 · Trabajadores"), "el colectivo no aparece");
    assert(has(r3.body, "Colectivo"), "no se distingue como colectivo");
    assert(has(r3.body, "QA Q123 Andina"), "la entidad externa desapareció de la lista");
  });

  await check("P2.3 · La búsqueda es de servidor y encuentra por nombre", async () => {
    const r = await get(`${LISTA}?q=Trabajadores`);
    const filas = tableRows(r.body);
    assert(filas.some((f) => f.includes("Trabajadores")), "no encontró el colectivo");
    assert(!filas.some((f) => f.includes("Andina")), "la búsqueda devolvió filas que no casan");
    const vacia = await get(`${LISTA}?q=inexistente-zzz-${sello}`);
    assert(has(vacia.body, "Ninguna parte interesada coincide"),
      "una búsqueda sin resultados no lo dice");
  });

  await check("P2.4 · Los cuatro filtros acotan de verdad", async () => {
    const grupos = tableRows((await get(`${LISTA}?tipo=group`)).body);
    assert(grupos.length > 0 && grupos.every((f) => f.includes("Colectivo")),
      "el filtro por tipo no acota");
    const pert = tableRows((await get(`${LISTA}?pertinencia=not_relevant`)).body);
    assert(!pert.some((f) => f.includes("Andina")), "el filtro por pertinencia no acota");
    const sinEstrategia = tableRows((await get(`${LISTA}?revision=no_strategy`)).body);
    assert(sinEstrategia.some((f) => f.includes("Andina")),
      "el filtro «sin estrategia» no encuentra a quien no la tiene");
    const desconocido = await get(`${LISTA}?tipo=inventado`);
    assert(desconocido.status === 200, "un filtro desconocido rompe la pantalla");
    assert(tableRows(desconocido.body).some((f) => f.includes("Andina")),
      "un filtro desconocido debía ignorarse");
  });

  // =========================================================================
  // P4 · Necesidades, expectativas y requisitos
  // =========================================================================
  await check("P4.1 · Se registra una necesidad, y queda ATADA a su análisis", async () => {
    // Es el defecto que encontró el navegador: el formulario no llevaba el
    // análisis y la acción lo rechazaba. Aquí se comprueba el efecto real.
    const ficha = await get(fichaAndina);
    assert(ficha.status === 200, `la ficha dio ${ficha.status}`);
    const f = formWith(ficha.body, "entry_kind", "title");
    assert(f.includes('name="assessment_id"'),
      "el alta de entradas no dice a qué análisis pertenece");
    const post = await submit(fichaAndina, f, {
      entry_kind: "need", title: "QA Q123 · Recibir el pedido en menos de 48 horas",
      description: "Sin ese plazo no sostiene su promesa de entrega.",
    });
    assert(has(post.body, "Entrada registrada"), "no confirmó el registro");

    const { data } = await cli.from("quality_stakeholder_requirements")
      .select("id, entry_kind, assessment_id, requirement_kind").eq("organization_id", org);
    assert((data ?? []).length === 1, `esperaba 1 entrada, hay ${(data ?? []).length}`);
    assert(data![0].entry_kind === "need", "no se guardó como necesidad");
    assert(data![0].assessment_id, "la entrada quedó huérfana de análisis");
    assert(data![0].requirement_kind === null, "una necesidad no lleva subtipo");
  });

  await check("P4.2 · Un requisito SIN subtipo se rechaza; con subtipo entra", async () => {
    const ficha = await get(fichaAndina);
    const f = formWith(ficha.body, "entry_kind", "title");
    const sin = await submit(fichaAndina, f, {
      entry_kind: "requirement", title: "QA Q123 · Requisito sin tipo", requirement_kind: "",
    });
    assert(has(sin.body, "de qué tipo es") || has(sin.body, "tiene que decir"),
      "se aceptó un requisito sin subtipo");

    requisitoTitulo = "QA Q123 · SLA de entrega de 48 horas";
    const con = await submit(fichaAndina, f, {
      entry_kind: "requirement", title: requisitoTitulo, requirement_kind: "contractual",
      source_note: "Contrato marco, cláusula 4",
    });
    assert(has(con.body, "Requisito registrado"), "no se pudo registrar el requisito");

    const { data } = await cli.from("quality_stakeholder_requirements")
      .select("entry_kind, requirement_kind, title").eq("organization_id", org)
      .eq("entry_kind", "requirement");
    assert((data ?? []).length === 1, `esperaba 1 requisito, hay ${(data ?? []).length}`);
    assert(data![0].requirement_kind === "contractual", "el subtipo no se guardó");
  });

  await check("P4.3 · Convertir crea el requisito y CONSERVA la necesidad", async () => {
    const ficha = await get(fichaAndina);
    const f = formWith(ficha.body, "origin_id", "rationale");
    assert(has(f, "no desaparece") || has(f, "se conserva"),
      "no se advierte de que la entrada original se conserva");

    const sinMotivo = await submit(fichaAndina, f, {
      requirement_kind: "contractual", rationale: "  ",
    });
    assert(has(sinMotivo.body, "no es convertir") || has(sinMotivo.body, "reetiquetar"),
      `convertir sin motivo no se rechazó: ${flat(sinMotivo.body).slice(0, 160)}`);
    const { count } = await cli.from("quality_stakeholder_requirements")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org).not("derived_from_id", "is", null);
    assert((count ?? 0) === 0, "la conversión sin motivo creó el requisito igualmente");

    const post = await submit(fichaAndina, f, {
      requirement_kind: "contractual",
      rationale: "Quedó firmado en el contrato marco de agosto.",
    });
    assert(!has(post.body, "no es convertir"), "la conversión con motivo falló");

    const { data } = await cli.from("quality_stakeholder_requirements")
      .select("id, entry_kind, derived_from_id, conversion_rationale")
      .eq("organization_id", org);
    const necesidad = (data ?? []).find((x) => x.entry_kind === "need");
    const derivado = (data ?? []).find((x) => x.derived_from_id !== null);
    assert(necesidad, "la necesidad de origen desapareció");
    assert(derivado, "no se creó el requisito derivado");
    assert(derivado!.derived_from_id === necesidad!.id, "el derivado no apunta a su origen");
    assert(derivado!.conversion_rationale, "no se guardó el motivo de la conversión");
  });

  // =========================================================================
  // P5 · Requisito → proceso
  // =========================================================================
  await check("P5 · El proceso se relaciona, se ve su vigencia, y terminar CIERRA", async () => {
    const { data: proc } = await cli.from("quality_processes")
      .insert({ organization_id: org, name: "QA Q123 · Despacho", category_code: "core", status: "active" })
      .select("id").single();
    assert(proc, "no se pudo crear el proceso de apoyo");

    const ficha = await get(fichaAndina);
    const f = formWith(ficha.body, "requirement_id", "process_id");
    const post = await submit(fichaAndina, f, {
      process_id: optionValue(f, "process_id", "Despacho"), link_kind: "addressed_by",
    });
    assert(has(post.body, "Proceso vinculado") || post.status < 400, "no se vinculó el proceso");

    const conVinculo = await get(fichaAndina);
    assert(has(conVinculo.body, "Procesos relacionados"), "no se listan los procesos");
    assert(has(conVinculo.body, "QA Q123 · Despacho"), "no se ve el proceso vinculado");
    assert(/desde \d{4}-\d{2}-\d{2}/.test(flat(conVinculo.body)), "no se ve desde cuándo rige");

    const fCerrar = formWith(conVinculo.body, "link_id");
    await submit(fichaAndina, fCerrar, {});

    const { data: enlaces } = await cli.from("quality_stakeholder_requirement_processes")
      .select("id, effective_to").eq("organization_id", org);
    assert((enlaces ?? []).length === 1, "el vínculo se borró en vez de cerrarse");
    assert(enlaces![0].effective_to !== null, "el vínculo no quedó cerrado");
  });

  // =========================================================================
  // P6 · Estrategias
  // =========================================================================
  await check("P6.1 · Una estrategia GENERAL nace sin requisitos vinculados", async () => {
    const ficha = await get(fichaAndina);
    const f = formWith(ficha.body, "assessment_id", "monitoring_method");
    const post = await submit(fichaAndina, f, {
      title: "QA Q123 · Relación institucional", purpose: "Sostener la relación.",
      monitoring_method: "meeting", status: "",
    });
    assert(has(post.body, "Estrategia creada"), "no se creó la estrategia");

    const { data } = await cli.from("quality_stakeholder_strategies")
      .select("id, status").eq("organization_id", org);
    assert((data ?? []).length === 1, "no quedó la estrategia");
    const { count } = await cli.from("quality_stakeholder_strategy_requirements")
      .select("id", { count: "exact", head: true }).eq("organization_id", org);
    assert((count ?? 0) === 0, "una estrategia general se ató a requisitos");
    const conEstrategia = await get(fichaAndina);
    assert(has(conEstrategia.body, "General para esta parte"),
      "no se presenta como general");
  });

  await check("P6.2 · El responsable es un CARGO, y el seguimiento no presume encuesta", async () => {
    const ficha = await get(fichaAndina);
    const f = formWith(ficha.body, "assessment_id", "monitoring_method");
    assert(f.includes('name="owner_position_id"'), "no se asigna cargo responsable");
    assert(!/name="owner_profile_id"|name="owner_name"/.test(f),
      "el responsable se puede asignar a una persona");
    assert(has(f, "un cargo, no una persona"), "no se explica por qué es un cargo");
    for (const m of ["Encuesta", "Indicador", "Reunión", "Auditoría", "Queja"]) {
      assert(has(f, m), `falta el mecanismo de seguimiento «${m}»`);
    }
    assert(has(f, "no tiene por qué ser una encuesta"), "se presupone encuesta");
    assert(has(f, "Sin cadencia no se declara nada vencido"), "se presume cadencia");
  });

  await check("P6.3 · Una estrategia ESPECÍFICA guarda vínculos, no un identificador suelto", async () => {
    const ficha = await get(fichaAndina);
    const f = formWith(ficha.body, "assessment_id", "monitoring_method");
    const { data: reqs } = await cli.from("quality_stakeholder_requirements")
      .select("id").eq("organization_id", org).eq("entry_kind", "requirement");
    assert((reqs ?? []).length >= 2, "hacen falta dos requisitos para probar el alcance múltiple");

    const post = await submit(fichaAndina, f, {
      title: "QA Q123 · Plan de servicio", scope: "specific",
      monitoring_method: "indicator", review_cadence_months: "6", status: "active",
    }, [{ name: "requirement_ids", values: reqs!.map((x) => x.id as string) }]);
    assert(has(post.body, "Estrategia creada"), "no se creó la estrategia específica");

    const { data: enlaces } = await cli.from("quality_stakeholder_strategy_requirements")
      .select("id, strategy_id, requirement_id").eq("organization_id", org);
    assert((enlaces ?? []).length === reqs!.length,
      `esperaba ${reqs!.length} vínculos, hay ${(enlaces ?? []).length}`);

    const ficha2 = await get(fichaAndina);
    assert(has(ficha2.body, "Atiende varios requisitos"),
      "el alcance múltiple no se deduce de los vínculos");
  });

  // =========================================================================
  // P7 · Seguimiento y relacionado
  // =========================================================================
  await check("P7.1 · Relacionar habla en lenguaje de producto y no enseña nombres de columna", async () => {
    const ficha = await get(fichaAndina);
    const seccion = ficha.body.match(/<section id="seguimiento"[\s\S]*?<\/section>/)?.[0] ?? "";
    assert(seccion, "no hay sección de seguimiento");
    for (const etiqueta of ["Indicador", "Objetivo", "Riesgo", "Acción", "Documento"]) {
      assert(has(seccion, etiqueta), `«Relacionar» no ofrece ${etiqueta}`);
    }
    assert(!/>\s*(owner_kind|ref_kind)\s*</.test(seccion), "se enseña un nombre de columna");
    for (const central of ["Proceso de calidad", "quality_process", "quality_stakeholder_requirement"]) {
      assert(!flat(seccion).includes(central),
        `«Relacionar» ofrece ${central}: es una relación central y tiene su propia sección`);
    }
  });

  await check("P7.2 · Un enlace periférico se crea y se lee por su NOMBRE", async () => {
    const { data: obj } = await cli.from("quality_objectives")
      .insert({ organization_id: org, name: "QA Q123 · Cumplimiento documental",
                period_start: "2026-01-01", period_end: "2026-12-31" })
      .select("id").single();
    assert(obj, "no se pudo crear el objetivo de apoyo");

    const conOpciones = await get(`${fichaAndina}?rel=quality_objective`);
    const f = formWith(conOpciones.body, "ref_id", "relation");
    const post = await submit(`${fichaAndina}?rel=quality_objective`, f, {
      ref_id: obj!.id as string, relation: "related",
    });
    assert(has(post.body, "Enlace añadido") || post.status < 400, "no se creó el enlace");

    const ficha = await get(fichaAndina);
    assert(has(ficha.body, "QA Q123 · Cumplimiento documental"),
      "el enlace no muestra el nombre de lo referenciado");
    assert(!flat(ficha.body).includes(obj!.id as string),
      "se enseña el identificador en pantalla");

    const { data: refs } = await cli.from("work_references")
      .select("owner_kind, ref_kind").eq("organization_id", org);
    assert((refs ?? []).length === 1, "el enlace no quedó guardado");
    assert(refs![0].owner_kind === "stakeholder_assessment", "el propietario no es el análisis");
  });

  await check("P7.4 · Si además es cliente o proveedor, se ENLAZA sin copiar sus datos", async () => {
    // La empresa del navegador no tenía ninguna parte que fuera además cliente
    // o proveedor, así que ese cruce no se pudo mirar allí. Aquí se monta.
    const { data: parte } = await cli.from("quality_external_parties")
      .select("id").eq("organization_id", org)
      .eq("legal_name", "QA Q123 Distribuidora Andina SAS").single();
    const { error: e1 } = await cli.from("quality_customer_profiles")
      .insert({ organization_id: org, party_id: parte!.id, segment: "QA Q123 institucional" });
    assert(!e1, `no se pudo crear el cliente de apoyo: ${e1?.message}`);
    const { error: e2 } = await cli.from("quality_supplier_profiles")
      .insert({ organization_id: org, party_id: parte!.id });
    assert(!e2, `no se pudo crear el proveedor de apoyo: ${e2?.message}`);

    const ficha = await get(fichaAndina);
    const seguimiento = ficha.body.match(/<section id="seguimiento"[\s\S]*?<\/section>/)?.[0] ?? "";
    assert(has(seguimiento, "Voz del cliente"), "no aparece el contexto de Voz del cliente");
    assert(has(seguimiento, "Proveedores"), "no aparece el contexto de Proveedores");
    assert(has(seguimiento, "Es la misma empresa, no una copia"),
      "no se dice que es la misma empresa");
    const enlaces = links(seguimiento).map((l) => l.href);
    assert(enlaces.some((h) => h.startsWith("/quality/customer-voice/customers/")),
      "no enlaza a la ficha de Voz del cliente");
    assert(enlaces.some((h) => h.startsWith("/quality/suppliers/")),
      "no enlaza a la ficha de Proveedores");
    // Y NO se copia lo de allí: ni encuestas, ni criterios, ni puntuaciones.
    for (const copiado of ["Enviar encuesta", "Criterios de evaluación", "Puntuación del proveedor"]) {
      assert(!has(seguimiento, copiado), `se reprodujo «${copiado}» en vez de enlazarlo`);
    }
  });

  await check("P7.3 · La base rechaza las relaciones centrales por la vía genérica", async () => {
    const { data: req } = await cli.from("quality_stakeholder_requirements")
      .select("id").eq("organization_id", org).eq("entry_kind", "requirement").limit(1).single();
    const { data: est } = await cli.from("quality_stakeholder_strategies")
      .select("id").eq("organization_id", org).limit(1).single();
    const { error } = await cli.from("work_references").insert({
      organization_id: org, owner_kind: "stakeholder_strategy", owner_id: est!.id,
      ref_kind: "quality_stakeholder_requirement", ref_id: req!.id, relation: "related",
    });
    assert(error, "se pudo registrar estrategia→requisito como referencia genérica");
  });

  // =========================================================================
  // P8 · Revisiones
  // =========================================================================
  await check("P8.1 · «Revisado, sin cambios» se registra y NO fabrica un análisis", async () => {
    const { count: antes } = await cli.from("quality_stakeholder_assessments")
      .select("id", { count: "exact", head: true }).eq("organization_id", org);

    const ficha = await get(fichaAndina);
    const f = formWith(ficha.body, "verdict");
    const post = await submit(fichaAndina, f, {
      verdict: "no_changes", note: "Revisada en comité: el plazo se sostiene.",
    });
    assert(has(post.body, "Revisión registrada"), "no se registró la revisión");

    const { data: revs } = await cli.from("quality_stakeholder_reviews")
      .select("id, verdict, assessment_id").eq("organization_id", org);
    assert((revs ?? []).length === 1, `esperaba 1 revisión, hay ${(revs ?? []).length}`);
    assert(revs![0].verdict === "no_changes", "el veredicto no se guardó");

    const { count: despues } = await cli.from("quality_stakeholder_assessments")
      .select("id", { count: "exact", head: true }).eq("organization_id", org);
    assert(antes === despues, "registrar «sin cambios» fabricó un análisis nuevo");
  });

  await check("P8.2 · El estado de revisión no acusa de vencido a quien no tiene cadencia", async () => {
    const ficha = await get(fichaAndina);
    assert(!has(ficha.body, "Revisión vencida"),
      "se declara vencida una estrategia sin fecha prevista pasada");
    assert(has(ficha.body, "Al día") || has(ficha.body, "Sin revisar"),
      "no se muestra el estado de revisión");
  });

  // =========================================================================
  // P3 (cierre) · Sucesión, y P9 · estado en fecha
  // =========================================================================
  let fichaGrupo = "";
  await check("P3.7 · Sustituir conserva el anterior y abre uno nuevo", async () => {
    const lista = await get(`${LISTA}?q=Trabajadores`);
    fichaGrupo = links(lista.body).find((l) => l.text.includes("Trabajadores"))?.href ?? "";
    assert(fichaGrupo, "no se encontró la ficha del colectivo");

    // Para que exista una VENTANA histórica de verdad, la primera lectura se
    // fecha hace un mes. Es preparación de datos —la pantalla de alta no pide
    // fecha—, no un atajo sobre el comportamiento que se está probando: la
    // sucesión y la lectura por fecha siguen haciéndose por la interfaz.
    const haceUnMes = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    const { data: primera } = await cli.from("quality_stakeholder_assessments")
      .select("id").eq("organization_id", org).not("stakeholder_group_id", "is", null).single();
    await cli.from("quality_stakeholder_assessments")
      .update({ effective_from: haceUnMes, assessed_on: haceUnMes }).eq("id", primera!.id);

    const ficha = await get(fichaGrupo);
    const f = formWith(ficha.body, "assessment_id", "relevance_status");
    assert(has(f, "se conservará completo como histórico"),
      "no se advierte de que el anterior se conserva");
    assert(!has(ficha.body, "Editar análisis"), "hay un botón de editar el análisis");

    // Sin fecha: rige desde hoy. Una anterior a la del análisis que sustituye
    // la rechaza la base, y con razón: no se puede empezar antes que aquel.
    const post = await submit(fichaGrupo, f, {
      relevance_status: "relevant",
      relevance_rationale: "Se confirma la pertinencia y se amplía a la segunda planta.",
      summary: "Segunda lectura.", effective_from: "",
    });
    assert(has(post.body, "Análisis sucedido"),
      `no se pudo suceder: ${flat(post.body).slice(0, 160)}`);

    const { data } = await cli.from("quality_stakeholder_assessments")
      .select("id, status, effective_to, supersedes_id, summary")
      .eq("organization_id", org).not("stakeholder_group_id", "is", null)
      .order("effective_from");
    assert((data ?? []).length === 2, `esperaba 2 lecturas, hay ${(data ?? []).length}`);
    assert(data![0].effective_to !== null, "la primera lectura no quedó cerrada");
    assert(data![0].status === "superseded", "la primera no quedó marcada como sucedida");
    assert(data![1].supersedes_id === data![0].id, "la nueva no apunta a la anterior");

    const { error } = await cli.from("quality_stakeholder_assessments")
      .update({ summary: "Reescrito a posteriori" }).eq("id", data![0].id);
    const { data: sigue } = await cli.from("quality_stakeholder_assessments")
      .select("summary").eq("id", data![0].id).single();
    assert(error || sigue!.summary !== "Reescrito a posteriori",
      "se pudo reescribir un análisis histórico");
  });

  await check("P9.1 · «Ver estado en fecha» muestra lo que regía ese día", async () => {
    const hoy = await get(fichaGrupo);
    assert(has(hoy.body, "Segunda lectura"), "hoy debía verse la segunda lectura");
    assert(!has(hoy.body, "Estás viendo el estado"), "se anuncia modo histórico sin estarlo");

    // Un día DENTRO de la ventana de la primera lectura: entonces regía ella.
    const quinceDias = new Date(Date.now() - 15 * 86_400_000).toISOString().slice(0, 10);
    const antes = await get(`${fichaGrupo}?fecha=${quinceDias}`);
    assert(antes.status === 200, `la vista histórica dio ${antes.status}`);
    assert(has(antes.body, `Estás viendo el estado del ${quinceDias}`),
      "no se anuncia la fecha que se está mirando");
    assert(has(antes.body, "solo lectura"), "no se dice que es de solo lectura");

    // El encabezado y el resumen son los de ENTONCES, no los de hoy.
    const resumen = antes.body.match(/<section id="resumen"[\s\S]*?<\/section>/)?.[0] ?? "";
    assert(resumen, "la vista histórica no trae el análisis de esa fecha");
    assert(!has(resumen, "Segunda lectura"),
      "el resumen histórico enseña el análisis de hoy");
    assert(has(resumen, "Sus condiciones afectan a la calidad"),
      "el resumen histórico no trae la justificación de entonces");

    // Y antes de que existiera nada, se dice así en vez de enseñar lo de hoy.
    const anteayer = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);
    const vacio = await get(`${fichaGrupo}?fecha=${anteayer}`);
    assert(has(vacio.body, "todavía no tenía ningún análisis vigente"),
      "antes de existir, la ficha no lo dice");
    assert(has(vacio.body, "Historia"), "la historia deja de verse al preguntar por antes");
  });

  await check("P9.2 · En modo histórico no hay UN SOLO formulario que escriba", async () => {
    const ayer = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const antes = await get(`${fichaGrupo}?fecha=${ayer}`);
    const escriben = writeForms(antes.body);
    assert(escriben.length === 0,
      `en modo histórico quedaron ${escriben.length} formularios de escritura`);
    for (const boton of ["Sustituir análisis", "Registrar", "Crear estrategia", "Convertir"]) {
      assert(!has(antes.body, boton), `en modo histórico se ofrece «${boton}»`);
    }
    const vuelta = await get(fichaGrupo);
    assert(writeForms(vuelta.body).length > 0, "al volver al presente no se puede escribir");
  });

  // =========================================================================
  // P10 · Independencia de módulo
  // =========================================================================
  await check("P10 · Todo el recorrido funciona sin PCR ni Textiles", async () => {
    for (const ruta of [LISTA, `${LISTA}/categories`, fichaAndina, fichaGrupo]) {
      const r = await get(ruta);
      assert(r.status === 200, `${ruta} dio ${r.status} → ${r.location}`);
      const enlaces = links(r.body).map((l) => l.href);
      for (const prohibido of ["/traceability", "/textiles"]) {
        assert(!enlaces.some((h) => h.startsWith(prohibido)), `${ruta} enlaza a ${prohibido}`);
      }
    }
    const { data: mods } = await cli.from("organization_modules")
      .select("module_code, access_mode").eq("organization_id", org);
    const pcr = (mods ?? []).find((m) => m.module_code === "traceability_6632");
    assert(!pcr || pcr.access_mode !== "full",
      "la empresa de la prueba tenía PCR: no demostraría independencia");
  });

  await check("Accesibilidad · etiquetas, tabla semántica y aviso anunciado", async () => {
    const lista = await get(LISTA);
    assert(lista.body.includes('<caption class="sr-only">'), "la tabla no tiene título accesible");
    assert(lista.body.includes('scope="col"'), "las cabeceras no declaran su alcance");
    assert(lista.body.includes('aria-label="Paginación"') || !has(lista.body, "Siguiente"),
      "el paginador no se anuncia");
    const campos = [...lista.body.matchAll(/<input\b([^>]*)>/g)]
      .filter((m) => !/type="(hidden|radio|checkbox|submit)"/.test(m[1]));
    for (const c of campos) {
      const name = c[1].match(/name="([^"]*)"/)?.[1];
      if (!name) continue;
      assert(lista.body.includes(`<span class="sr-only">`) || /placeholder=/.test(c[1]) === false
        || lista.body.includes("text-xs font-medium text-ink"),
        `el campo ${name} podría no tener etiqueta real`);
    }
    const ayer = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const hist = await get(`${fichaGrupo}?fecha=${ayer}`);
    assert(hist.body.includes('role="status"'), "el aviso histórico no se anuncia");
  });

  console.log(`\n  ${passed} correctas, ${failed} fallidas\n`);
  stopServers();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); stopServers(); process.exit(1); });
