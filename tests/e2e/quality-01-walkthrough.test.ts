/**
 * Trazaloop Quality · QUALITY-01 · Recorrido HTTP AUTENTICADO.
 *
 * Las pruebas de RLS validan la base; el typecheck y el build validan que el
 * código compila. Entre esas dos capas queda una franja que ninguna de las dos
 * ve: la capa de lectura (embeds de PostgREST con FK compuestas), los guards de
 * namespace y el kill switch. Un fallo ahí no rompe ni el build ni la BD — solo
 * la pantalla, al abrirla.
 *
 * Esta prueba levanta el build de producción, monta el estado con la sesión
 * REAL de un usuario y PIDE LAS PÁGINAS por HTTP, comprobando que el HTML
 * contiene los datos reales. Además arranca un segundo servidor con el kill
 * switch APAGADO para comprobar que, con la misma sesión válida, /quality
 * simplemente no existe.
 *
 * Requisitos:
 *   · `npm run build` ejecutado antes (usa el build de producción).
 *   · Supabase local en marcha, con .env.local apuntando a él.
 *
 * Correr:  npm run test:quality01-ui
 */
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ORG_SECRET = process.env.ACTIVE_ORG_COOKIE_SECRET ?? null;

if (!URL || !ANON || !SERVICE) {
  console.error("Faltan variables para test:quality01-ui (URL, ANON, SERVICE_ROLE).");
  process.exit(1);
}

const PORT_ON = Number(process.env.Q01_PORT_ON ?? 3121);
const PORT_OFF = Number(process.env.Q01_PORT_OFF ?? 3122);
const BASE_ON = `http://localhost:${PORT_ON}`;
const BASE_OFF = `http://localhost:${PORT_OFF}`;

let passed = 0;
let failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
async function check(n: string, fn: () => Promise<void>) {
  try { await fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

async function newUser(label: string) {
  const email = `q01ui-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.trazaloop.dev`;
  const password = "Trazaloop-Test-1234";
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: `QA ${label}` },
  });
  if (error || !data.user) throw new Error(`usuario ${label}: ${error?.message}`);
  const client = createClient(URL!, ANON!, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: s, error: e } = await client.auth.signInWithPassword({ email, password });
  if (e || !s.session) throw new Error(`login ${label}: ${e?.message}`);
  // El shell exige aceptación legal antes de cualquier ruta de módulo; se
  // registra por la MISMA vía que la aplicación (RPC de 0068), nunca a mano.
  const { error: le } = await client.rpc("accept_active_legal_documents", {
    p_ip_address: null, p_user_agent: "q01-walkthrough",
  });
  if (le) throw new Error(`aceptación legal: ${le.message}`);
  return { id: data.user.id, email, client, session: s.session };
}

/**
 * Nombre de la cookie de sesión: supabase-js lo deriva del PRIMER segmento del
 * host del proyecto ("127" en local, el ref en un proyecto gestionado). Se
 * calcula en lugar de fijarlo para que la misma prueba sirva contra local y
 * contra staging: con el nombre equivocado el servidor no ve sesión alguna y
 * todo redirige a /login, que es un verde falso muy fácil de confundir con un
 * fallo de la aplicación.
 */
const AUTH_COOKIE_NAME = `sb-${new global.URL(URL).hostname.split(".")[0]}-auth-token`;

/** Cookie de sesión con el formato de @supabase/ssr (base64url + prefijo). */
function sessionCookie(session: unknown): string {
  const b64 = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  return `${AUTH_COOKIE_NAME}=base64-${b64}`;
}

/** Cookie de empresa activa, firmada con HMAC igual que en la aplicación. */
function activeOrgCookie(orgId: string): string {
  if (!ORG_SECRET) return `tz-active-org=${orgId}`;
  return `tz-active-org=${orgId}.${createHmac("sha256", ORG_SECRET).update(orgId).digest("base64url")}`;
}

async function get(base: string, path: string, cookie: string) {
  const res = await fetch(`${base}${path}`, { headers: { cookie }, redirect: "manual" });
  return { status: res.status, location: res.headers.get("location"), body: res.status === 200 ? await res.text() : "" };
}

/** Texto plano del HTML: React escapa entidades, así que se compara normalizado. */
function has(html: string, needle: string): boolean {
  const flat = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/\s+/g, " ");
  return flat.toLowerCase().includes(needle.toLowerCase());
}

const servers: ChildProcess[] = [];

function startServer(port: number, env: Record<string, string>): ChildProcess {
  const proc = spawn("npx", ["next", "start", "-p", String(port)], {
    env: { ...process.env, ...env },
    stdio: "ignore",
  });
  servers.push(proc);
  return proc;
}

async function waitFor(base: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/`, { redirect: "manual" });
      if (res.status > 0) return;
    } catch {
      // el servidor todavía no escucha
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`el servidor de ${base} no arrancó a tiempo`);
}

function stopServers() {
  for (const p of servers) {
    try { p.kill("SIGTERM"); } catch { /* ya terminado */ }
  }
}

async function main() {
  console.log("\nTrazaloop Quality · QUALITY-01 · recorrido HTTP autenticado\n");
  console.log("  · levantando el build de producción…");

  startServer(PORT_ON, { QUALITY_MODULE_ENABLED: "true" });
  startServer(PORT_OFF, { QUALITY_MODULE_ENABLED: "false" });
  await Promise.all([waitFor(BASE_ON), waitFor(BASE_OFF)]);

  const user = await newUser("owner");
  const { data: orgId, error: orgErr } = await user.client.rpc("create_organization", {
    p_name: `Q01 UI ${Date.now()}`,
  });
  assert(!orgErr && orgId, `create_organization: ${orgErr?.message}`);
  const org = orgId as string;
  const cookie = `${sessionCookie(user.session)}; ${activeOrgCookie(org)}`;

  // La cookie es lo único que la prueba fabrica a mano. Si no autentica, TODAS
  // las comprobaciones fallarían con un 307 a /login y parecería un fallo de la
  // aplicación. Se comprueba una vez, aquí, con un diagnóstico claro.
  const sanity = await get(BASE_ON, "/dashboard", cookie);
  assert(
    sanity.status === 200,
    `la sesión fabricada no autentica contra ${BASE_ON} (/dashboard dio ${sanity.status} → ${sanity.location}). ` +
      `Cookie usada: ${AUTH_COOKIE_NAME}. Comprueba que la aplicación y la prueba apuntan al mismo proyecto Supabase.`
  );

  // --- Estado de partida: el recorrido funcional, con la sesión real -------

  const { data: position } = await user.client.from("quality_positions")
    .insert({ organization_id: org, name: "Director de Calidad", code: "DIR-CAL" })
    .select("id").single();
  await user.client.from("quality_position_assignments")
    .insert({ organization_id: org, position_id: position!.id, profile_id: user.id, assignment_type: "holder" });

  const { data: proc } = await user.client.from("quality_processes")
    .insert({ organization_id: org, name: "Gestión de la calidad", code: "P-SIS-01",
              category_code: "system", owner_position_id: position!.id })
    .select("id").single();
  const { data: proc2 } = await user.client.from("quality_processes")
    .insert({ organization_id: org, name: "Producción", code: "P-MIS-01", category_code: "core",
              owner_position_id: position!.id })
    .select("id").single();

  const rev = (await user.client.rpc("quality_open_process_revision", { p_process_id: proc!.id })).data as string;
  await user.client.from("quality_process_revisions")
    .update({ purpose: "Asegurar la eficacia del SGC", scope: "Toda la organización" }).eq("id", rev);
  const { data: out } = await user.client.from("quality_process_io")
    .insert({ organization_id: org, revision_id: rev, process_id: proc!.id,
              direction: "output", name: "Informe de revisión", io_kind: "record" })
    .select("id").single();
  await user.client.from("quality_process_io")
    .insert({ organization_id: org, revision_id: rev, process_id: proc!.id,
              direction: "input", name: "Política de calidad", io_kind: "document" });

  const rev2 = (await user.client.rpc("quality_open_process_revision", { p_process_id: proc2!.id })).data as string;
  const { data: inp } = await user.client.from("quality_process_io")
    .insert({ organization_id: org, revision_id: rev2, process_id: proc2!.id,
              direction: "input", name: "Informe de revisión", io_kind: "record" })
    .select("id").single();
  await user.client.from("quality_process_interactions").insert({
    organization_id: org, source_process_id: proc!.id, target_process_id: proc2!.id,
    source_output_id: out!.id, target_input_id: inp!.id, information_item: "Informe de revisión",
  });

  const { data: doc } = await user.client.from("trazadoc_documents")
    .insert({ organization_id: org, title: "Procedimiento de revisión por la dirección", source_type: "custom" })
    .select("id").single();
  await user.client.from("quality_process_documents")
    .insert({ organization_id: org, process_id: proc!.id, document_id: doc!.id, relation_type: "governs" });

  const { data: map } = await user.client.from("quality_process_maps")
    .insert({ organization_id: org, name: "Mapa de procesos", is_default: true }).select("id").single();
  const mapVersion = (await user.client.rpc("quality_open_map_version", { p_map_id: map!.id })).data as string;
  await user.client.from("quality_process_map_nodes").insert([
    { organization_id: org, map_version_id: mapVersion, process_id: proc!.id, category_code: "system" },
    { organization_id: org, map_version_id: mapVersion, process_id: proc2!.id, category_code: "core" },
  ]);

  // ------------------------------------------------------------------ //

  // --- El selector de módulos: el camino que recorre una persona -----------
  //
  // Entrar escribiendo /quality en la barra de direcciones NO demuestra que el
  // módulo sea usable. QUALITY-01.1 lo probó: la tarjeta resolvía Plan Full y
  // "Acceso funcional completo" pero no ofrecía enlace, porque el selector
  // mantenía a mano un mapa clave→ruta que no conocía Quality.

  /**
   * Aísla la tarjeta de un módulo dentro del HTML del selector.
   *
   * Las dos ramas de ModuleCard —enlace cuando se puede entrar, bloque inerte
   * cuando no— comparten el prefijo de clases `flex flex-col gap-2 rounded-lg`.
   * Se usan esas marcas como frontera: cada tarjeta va desde su apertura hasta
   * la apertura de la siguiente. Emparejar etiquetas con una expresión regular
   * no sirve aquí, porque las tarjetas anidan elementos y el emparejamiento
   * perezoso corta en el cierre equivocado.
   */
  const CARD_OPEN = /<(a|div)\b[^>]*class="flex flex-col gap-2 rounded-lg[^"]*"[^>]*>/g;

  function moduleCards(html: string): { tag: string; open: string; block: string }[] {
    const starts = [...html.matchAll(CARD_OPEN)].map((m) => ({
      index: m.index!, tag: m[1], open: m[0],
    }));
    return starts.map((s, i) => ({
      tag: s.tag,
      open: s.open,
      block: html.slice(s.index, starts[i + 1]?.index ?? html.length),
    }));
  }

  function moduleCard(html: string, moduleName: string) {
    return moduleCards(html).find((c) => c.block.includes(moduleName)) ?? null;
  }

  function moduleCardHref(html: string, moduleName: string): string | null {
    const card = moduleCard(html, moduleName);
    if (!card || card.tag !== "a") return null;
    return card.open.match(/href="([^"]+)"/)?.[1] ?? null;
  }

  function moduleCardBlock(html: string, moduleName: string): string {
    return moduleCard(html, moduleName)?.block ?? "";
  }

  await check("0a. El selector muestra Quality con su estado y con «Entrar →»", async () => {
    const r = await get(BASE_ON, "/modules", cookie);
    assert(r.status === 200, `/modules dio ${r.status} → ${r.location}`);
    assert(has(r.body, "Trazaloop Quality"), "no aparece la tarjeta de Quality");

    const card = moduleCard(r.body, "Trazaloop Quality");
    assert(card !== null, "no se pudo aislar la tarjeta de Quality");
    assert(has(card!.block, "Entrar →"), "la tarjeta de Quality NO ofrece «Entrar →» (el defecto de QUALITY-01.1)");
    assert(card!.tag === "a", "la tarjeta de Quality debe ser un enlace, no un bloque inerte");
  });

  await check("0b. El enlace de la tarjeta apunta a /quality y navega de verdad", async () => {
    const r = await get(BASE_ON, "/modules", cookie);
    const href = moduleCardHref(r.body, "Trazaloop Quality");
    assert(href === "/quality", `la tarjeta enlaza a ${href}, debía enlazar /quality`);

    // Y se sigue el enlace tal cual, como haría el navegador.
    const landed = await get(BASE_ON, href!, cookie);
    assert(landed.status === 200, `seguir el enlace dio ${landed.status} → ${landed.location}`);
    assert(has(landed.body, "Trazaloop Quality"), "el destino no es la portada del módulo");
  });

  await check("0c. Desde el módulo se llega a Procesos y se ven los datos reales", async () => {
    const home = await get(BASE_ON, "/quality", cookie);
    const href = moduleCardHref(home.body, "Procesos") ?? "/quality/processes";
    const procesos = await get(BASE_ON, href, cookie);
    assert(procesos.status === 200, `Procesos dio ${procesos.status}`);
    assert(has(procesos.body, "Gestión de la calidad"), "no se ven los datos de QUALITY-01");
  });

  await check("0d. PCR y Textiles conservan su «Entrar →» (sin regresión)", async () => {
    const r = await get(BASE_ON, "/modules", cookie);
    for (const [name, expected] of [["Trazaloop PCR", "/dashboard"], ["Trazaloop Textiles", "/textiles"]] as const) {
      const card = moduleCardBlock(r.body, name);
      assert(card.length > 0, `no se pudo aislar la tarjeta de ${name}`);
      assert(has(card, "Entrar →"), `${name} perdió su «Entrar →»`);
      const href = moduleCardHref(r.body, name);
      assert(href === expected, `${name} enlaza a ${href}, debía enlazar ${expected}`);
    }
  });

  await check("1. /quality abre y resume el estado real de la empresa", async () => {
    const r = await get(BASE_ON, "/quality", cookie);
    assert(r.status === 200, `esperaba 200, fue ${r.status} → ${r.location}`);
    assert(has(r.body, "Trazaloop Quality"), "falta el título del módulo");
    assert(has(r.body, "1 cargo definido"), "el resumen no contó el cargo real");
    assert(has(r.body, "2 procesos"), "el resumen no contó los procesos reales");
  });

  await check("2. /quality/positions muestra el cargo y su titular vigente", async () => {
    const r = await get(BASE_ON, "/quality/positions", cookie);
    assert(r.status === 200, `esperaba 200, fue ${r.status}`);
    assert(has(r.body, "Director de Calidad"), "no se listó el cargo");
    assert(has(r.body, "Titular actual:"), "no se resolvió el titular vigente");
    assert(has(r.body, "QA owner"), "no se mostró el nombre de la persona");
  });

  await check("3. /quality/processes lista los procesos con su cargo propietario", async () => {
    const r = await get(BASE_ON, "/quality/processes", cookie);
    assert(r.status === 200, `esperaba 200, fue ${r.status}`);
    assert(has(r.body, "Gestión de la calidad"), "falta el primer proceso");
    assert(has(r.body, "Producción"), "falta el segundo proceso");
    assert(has(r.body, "Propietario: Director de Calidad"), "no se incrustó el cargo propietario");
    assert(has(r.body, "Sistema"), "no se muestra el nombre de la categoría");
  });

  await check("4. El detalle reúne propósito, entradas, salidas, relaciones y documento", async () => {
    const r = await get(BASE_ON, `/quality/processes/${proc!.id}`, cookie);
    assert(r.status === 200, `esperaba 200, fue ${r.status}`);
    assert(has(r.body, "Asegurar la eficacia del SGC"), "no se mostró el propósito del borrador");
    assert(has(r.body, "Política de calidad"), "no se mostró la entrada");
    assert(has(r.body, "Informe de revisión"), "no se mostró la salida");
    assert(has(r.body, "Este proceso entrega a"), "falta la sección de relaciones");
    assert(has(r.body, "Procedimiento de revisión por la dirección"), "no se mostró el documento asociado");
    assert(has(r.body, "estás editando el borrador"), "no se comunicó que la revisión es editable");
  });

  await check("5. /quality/map agrupa los procesos por categoría", async () => {
    const r = await get(BASE_ON, "/quality/map", cookie);
    assert(r.status === 200, `esperaba 200, fue ${r.status}`);
    assert(has(r.body, "Sistema"), "falta la banda de sistema");
    assert(has(r.body, "Misionales"), "falta la banda misional");
    assert(has(r.body, "Gestión de la calidad") && has(r.body, "Producción"), "faltan bloques del mapa");
    assert(has(r.body, "Publicar mapa"), "un admin debía poder publicar");
  });

  await check("6. Publicado el proceso, la pantalla lo presenta como oficial NO editable", async () => {
    const { error } = await user.client.rpc("quality_publish_process_revision", { p_revision_id: rev });
    assert(!error, `no se pudo publicar: ${error?.message}`);
    const r = await get(BASE_ON, `/quality/processes/${proc!.id}`, cookie);
    assert(r.status === 200, `esperaba 200, fue ${r.status}`);
    assert(has(r.body, "versión oficial"), "no se anunció como versión oficial");
    assert(has(r.body, "no es editable"), "no se dijo que no es editable");
    assert(!has(r.body, "guardar borrador"), "seguía ofreciendo guardar un borrador ya publicado");
    assert(has(r.body, "abrir nueva revisión"), "no ofreció el único camino válido: una revisión nueva");
  });

  await check("7. Publicado el mapa, la versión vigente se consulta y no se edita", async () => {
    const { error } = await user.client.rpc("quality_publish_map_version", { p_version_id: mapVersion });
    assert(!error, `no se pudo publicar el mapa: ${error?.message}`);
    const r = await get(BASE_ON, "/quality/map", cookie);
    assert(r.status === 200, `esperaba 200, fue ${r.status}`);
    assert(has(r.body, "versión oficial del mapa"), "no se anunció la versión oficial");
    assert(!has(r.body, "quitar del mapa"), "seguía ofreciendo quitar bloques de una versión publicada");
    assert(!has(r.body, "colocar un proceso en el mapa"), "seguía ofreciendo añadir a una versión publicada");
  });

  await check("8. Otra empresa no ve nada de esto, ni con la URL exacta", async () => {
    const other = await newUser("outsider");
    const { data: otherOrg } = await other.client.rpc("create_organization", { p_name: `Q01 Otra ${Date.now()}` });
    const otherCookie = `${sessionCookie(other.session)}; ${activeOrgCookie(otherOrg as string)}`;

    const list = await get(BASE_ON, "/quality/processes", otherCookie);
    assert(list.status === 200, `esperaba 200, fue ${list.status}`);
    assert(!has(list.body, "Gestión de la calidad"), "otra empresa vio un proceso ajeno");
    assert(has(list.body, "Todavía no hay procesos"), "debía ver su propio estado vacío");

    const direct = await get(BASE_ON, `/quality/processes/${proc!.id}`, otherCookie);
    assert(direct.status === 404, `la URL directa de un proceso ajeno debía dar 404, dio ${direct.status}`);
  });

  await check("9. Sin sesión, /quality no entrega contenido", async () => {
    const r = await get(BASE_ON, "/quality", "");
    assert(r.status !== 200, "una petición sin sesión recibió 200");
  });

  await check("9b. Cerrar y volver a iniciar sesión conserva el acceso al módulo", async () => {
    // Una sesión nueva no debe depender de nada acumulado en la anterior.
    const fresh = createClient(URL!, ANON!, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data, error } = await fresh.auth.signInWithPassword({
      email: user.email, password: "Trazaloop-Test-1234",
    });
    assert(!error && data.session, `no se pudo volver a iniciar sesión: ${error?.message}`);
    const nuevo = `${sessionCookie(data.session)}; ${activeOrgCookie(org)}`;

    const selector = await get(BASE_ON, "/modules", nuevo);
    assert(selector.status === 200, `/modules dio ${selector.status}`);
    assert(has(moduleCardBlock(selector.body, "Trazaloop Quality"), "Entrar →"),
      "tras volver a entrar, la tarjeta perdió «Entrar →»");

    const quality = await get(BASE_ON, "/quality", nuevo);
    assert(quality.status === 200, `/quality dio ${quality.status} con la sesión nueva`);
    assert(has(quality.body, "Trazaloop Quality"), "el módulo no cargó con la sesión nueva");
  });

  await check("10. Con el kill switch APAGADO, /quality no existe ni con sesión válida", async () => {
    // Es lo que mantiene Quality invisible en Production: no un texto de
    // "próximamente" ni un 403 que confirme que el módulo está ahí — un 404.
    for (const path of ["/quality", "/quality/positions", "/quality/processes", "/quality/map"]) {
      const r = await get(BASE_OFF, path, cookie);
      assert(r.status === 404, `${path} con el switch apagado debía dar 404, dio ${r.status} → ${r.location}`);
    }
    // Y el selector tampoco ofrece entrada: la tarjeta deja de ser un enlace.
    const selector = await get(BASE_OFF, "/modules", cookie);
    assert(selector.status === 200, `/modules dio ${selector.status} con el switch apagado`);
    const card = moduleCardBlock(selector.body, "Trazaloop Quality");
    assert(!has(card, "Entrar →"), "con el switch apagado la tarjeta seguía ofreciendo «Entrar →»");
    assert(moduleCardHref(selector.body, "Trazaloop Quality") === null,
      "con el switch apagado la tarjeta seguía siendo un enlace");
    // Y el mismo servidor sigue sirviendo el resto de la aplicación con
    // normalidad: el switch apaga Quality, no la plataforma.
    const home = await get(BASE_OFF, "/dashboard", cookie);
    assert(home.status === 200, `el resto de la aplicación debía seguir en pie, /dashboard dio ${home.status}`);
  });

  console.log(`\nResultado: ${passed} en verde, ${failed} en rojo.\n`);
  stopServers();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Error inesperado:", e);
  stopServers();
  process.exit(1);
});
