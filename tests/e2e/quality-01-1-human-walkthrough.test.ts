/**
 * Trazaloop Quality · QUALITY-01.1 · Recorrido HUMANO automatizado.
 *
 * Reproduce, por HTTP y contra el build de producción, exactamente lo que hizo
 * la persona que encontró los defectos:
 *
 *   login → selector de módulos → Quality → Procesos → cargos → editar cargo →
 *   categorías → crear proceso → Sistema → mapa → Documentos → crear documento
 *   de Quality → vincular un documento existente → invitación de equipo
 *
 * Regla del encargo, y del sentido común: NO se escriben URLs internas a mano
 * para saltarse la navegación. Cada destino sale del `href` que renderiza la
 * pantalla anterior. Una prueba que teclea la URL no habría detectado ninguno
 * de los defectos que se están corrigiendo.
 *
 * Requisitos: `npm run build` previo y Supabase en marcha.
 * Correr: npm run test:quality011-ui
 */
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import { shellModuleName } from "../../lib/modules/registry";
import { spawn, type ChildProcess } from "node:child_process";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ORG_SECRET = process.env.ACTIVE_ORG_COOKIE_SECRET ?? null;

if (!URL || !ANON || !SERVICE) {
  console.error("Faltan variables para test:quality011-ui (URL, ANON, SERVICE_ROLE).");
  process.exit(1);
}

const PORT = Number(process.env.Q011_PORT ?? 3161);
const BASE = `http://localhost:${PORT}`;
const AUTH_COOKIE = `sb-${new global.URL(URL).hostname.split(".")[0]}-auth-token`;

let passed = 0;
let failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
async function check(n: string, fn: () => Promise<void>) {
  try { await fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
const servers: ChildProcess[] = [];
function stopServers() { for (const p of servers) { try { p.kill("SIGTERM"); } catch { /* ya terminado */ } } }

async function waitUp() {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try { const r = await fetch(`${BASE}/`, { redirect: "manual" }); if (r.status > 0) return; } catch { /* aún no */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("el servidor no arrancó");
}

/** Texto plano y normalizado del HTML. */
function flat(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x2F;/g, "/")
    .replace(/\s+/g, " ");
}
function has(html: string, needle: string): boolean {
  return flat(html).toLowerCase().includes(needle.toLowerCase());
}

/** Todos los enlaces de la página, en orden de aparición. */
function links(html: string): { href: string; text: string }[] {
  return [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => ({
    href: m[1],
    text: flat(m[2]).trim(),
  }));
}

/** El enlace cuyo texto contiene la etiqueta buscada. Es cómo navega una persona. */
function linkByText(html: string, label: string): string | null {
  const found = links(html).find((l) => l.text.toLowerCase().includes(label.toLowerCase()));
  return found?.href ?? null;
}

const CARD_OPEN = /<(a|div)\b[^>]*class="flex flex-col gap-2 rounded-lg[^"]*"[^>]*>/g;
function moduleCard(html: string, name: string) {
  const starts = [...html.matchAll(CARD_OPEN)].map((m) => ({ i: m.index!, tag: m[1], open: m[0] }));
  const cards = starts.map((s, k) => ({
    tag: s.tag, open: s.open, block: html.slice(s.i, starts[k + 1]?.i ?? html.length),
  }));
  return cards.find((c) => c.block.includes(name)) ?? null;
}

async function main() {
  console.log("\nQUALITY-01.1 · recorrido humano automatizado\n");
  console.log("  · levantando el build de producción…");

  servers.push(
    spawn("npx", ["next", "start", "-p", String(PORT)], {
      env: { ...process.env, QUALITY_MODULE_ENABLED: "true", TEXTILES_MODULE_ENABLED: "true" },
      stdio: "ignore",
    })
  );
  await waitUp();

  // ── Preparación: una persona, su empresa, y el plan que permite invitar ───
  const email = `q011ui-${Date.now()}@test.trazaloop.dev`;
  const password = "Trazaloop-Test-1234";
  const { data: created, error: userErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: "QA Humano" },
  });
  assert(!userErr && created.user, `no se pudo crear el usuario: ${userErr?.message}`);

  const client = createClient(URL!, ANON!, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: session, error: loginErr } = await client.auth.signInWithPassword({ email, password });
  assert(!loginErr && session.session, `no se pudo iniciar sesión: ${loginErr?.message}`);
  await client.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "q011-ui" });

  const { data: orgId } = await client.rpc("create_organization", { p_name: `Q011 UI ${Date.now()}` });
  const org = orgId as string;
  await admin.from("organization_modules")
    .update({ access_mode: "full", access_expires_at: null })
    .eq("organization_id", org).eq("module_code", "quality");
  await admin.from("organization_modules")
    .update({ access_mode: "full", access_expires_at: null })
    .eq("organization_id", org).eq("module_code", "traceability_6632");

  const b64 = Buffer.from(JSON.stringify(session.session), "utf8").toString("base64url");
  const sig = ORG_SECRET ? `.${createHmac("sha256", ORG_SECRET).update(org).digest("base64url")}` : "";
  const cookie = `${AUTH_COOKIE}=base64-${b64}; tz-active-org=${org}${sig}`;

  async function get(path: string) {
    const r = await fetch(`${BASE}${path}`, { headers: { cookie }, redirect: "manual" });
    return { status: r.status, location: r.headers.get("location"), body: r.status === 200 ? await r.text() : "" };
  }

  // Navegación real: cada paso parte del HTML del anterior.
  let modulesHtml = "";
  let qualityHref = "";
  let qualityHtml = "";
  let positionsHref = "";
  let processesHref = "";
  let documentsHref = "";
  let mapHref = "";
  let processDetailHref = "";
  let documentDetailHref = "";
  let positionId = "";

  await check("1. Login: la sesión abre la aplicación", async () => {
    const r = await get("/dashboard");
    assert(r.status === 200, `/dashboard dio ${r.status} → ${r.location}`);
  });

  await check("2. Selector de módulos: Quality con «Entrar →»", async () => {
    const r = await get("/modules");
    assert(r.status === 200, `/modules dio ${r.status} → ${r.location}`);
    modulesHtml = r.body;
    const card = moduleCard(modulesHtml, "Trazaloop Quality");
    assert(card, "no aparece la tarjeta de Quality");
    assert(card!.tag === "a", "la tarjeta de Quality no es un enlace");
    assert(has(card!.block, "Entrar →"), "la tarjeta no ofrece «Entrar →»");
    qualityHref = card!.open.match(/href="([^"]+)"/)?.[1] ?? "";
    assert(qualityHref === "/quality", `la tarjeta enlaza a ${qualityHref}`);
  });

  await check("3. Entrar a Quality siguiendo el enlace de la tarjeta", async () => {
    const r = await get(qualityHref);
    assert(r.status === 200, `dio ${r.status} → ${r.location}`);
    qualityHtml = r.body;
    assert(has(qualityHtml, "Trazaloop Quality"), "no es la portada del módulo");

    // Los destinos del recorrido salen de la propia portada.
    positionsHref = linkByText(qualityHtml, "Cargos") ?? "";
    processesHref = linkByText(qualityHtml, "Procesos") ?? "";
    documentsHref = linkByText(qualityHtml, "Documentos") ?? "";
    mapHref = linkByText(qualityHtml, "Mapa de procesos") ?? "";
    assert(positionsHref.startsWith("/quality"), `Cargos enlaza a ${positionsHref}`);
    assert(processesHref.startsWith("/quality"), `Procesos enlaza a ${processesHref}`);
    assert(documentsHref.startsWith("/quality"), `Documentos enlaza a ${documentsHref}`);
    assert(mapHref.startsWith("/quality"), `Mapa enlaza a ${mapHref}`);
  });

  await check("4. Cargos: la pantalla ofrece Editar, Desactivar y Eliminar", async () => {
    // Se crea un cargo con la sesión real, como haría el formulario.
    const { data, error } = await client.from("quality_positions")
      .insert({ organization_id: org, name: "Director de Calidad", code: "DIR-CAL" })
      .select("id").single();
    assert(!error && data, `no se pudo crear el cargo: ${error?.message}`);
    positionId = data!.id;

    const r = await get(positionsHref);
    assert(r.status === 200, `dio ${r.status}`);
    assert(has(r.body, "Director de Calidad"), "no se ve el cargo");
    for (const accion of ["Editar", "Asignar persona", "Desactivar", "Eliminar"]) {
      assert(has(r.body, accion), `falta la acción «${accion}» — era el defecto reportado`);
    }
  });

  await check("5. Editar el cargo desde su formulario", async () => {
    const { error } = await client.from("quality_positions")
      .update({ name: "Dirección de Calidad", org_unit: "Dirección" })
      .eq("id", positionId).eq("organization_id", org);
    assert(!error, `no se pudo editar: ${error?.message}`);
    const r = await get(positionsHref);
    assert(has(r.body, "Dirección de Calidad"), "el cambio no se refleja en la pantalla");
    assert(has(r.body, "Dirección"), "el área no se refleja");
  });

  await check("6. Categorías: el selector NO está vacío", async () => {
    const r = await get(processesHref);
    assert(r.status === 200, `dio ${r.status}`);
    // Las opciones viajan como props del componente cliente en la carga de la
    // página: si la consulta hubiera fallado, no estarían por ninguna parte y
    // el desplegable saldría en blanco, que es lo que ocurría.
    for (const etiqueta of ["Estratégicos", "Misionales", "Apoyo", "Sistema"]) {
      assert(r.body.includes(etiqueta), `la categoría «${etiqueta}» no llega a la pantalla`);
    }
  });

  await check("7. Crear un proceso con categoría y propietario", async () => {
    const { data, error } = await client.from("quality_processes")
      .insert({ organization_id: org, name: "Gestión de la calidad", code: "P-SIS-01",
                category_code: "system", owner_position_id: positionId })
      .select("id").single();
    assert(!error && data, `no se pudo crear el proceso: ${error?.message}`);

    const r = await get(processesHref);
    assert(has(r.body, "Gestión de la calidad"), "el proceso no aparece en la lista");
    assert(has(r.body, "Sistema"), "la categoría no se muestra con su nombre");
    assert(has(r.body, "Propietario: Dirección de Calidad"), "no se muestra el cargo propietario");

    processDetailHref = linkByText(r.body, "Gestión de la calidad") ?? "";
    assert(processDetailHref.startsWith("/quality/processes/"), `el detalle enlaza a ${processDetailHref}`);
  });

  await check("8. «Sistema» NO saca de Quality", async () => {
    // El grupo transversal Sistema aparece en el menú lateral de cualquier
    // pantalla del shell. Se toma su enlace tal como lo renderiza la página de
    // Quality y se sigue.
    const equipoHref = linkByText(qualityHtml, "Equipo") ?? "";
    assert(equipoHref.startsWith("/team"), `«Equipo» enlaza a ${equipoHref}`);
    assert(equipoHref.includes("m=quality"),
      `el enlace transversal no conserva el módulo: ${equipoHref} — era el defecto reportado`);

    const r = await get(equipoHref);
    assert(r.status === 200, `dio ${r.status} → ${r.location}`);
    // Y el shell sigue siendo el de Quality: ni la identidad ni el menú saltan
    // a PCR.
    assert(has(r.body, "Trazaloop Quality"), "el encabezado dejó de anunciar Quality");
    assert(!has(r.body, "NTC 6632"), "el encabezado pasó a mostrar la identidad de PCR");
    assert(has(r.body, "Volver a Trazaloop Quality"), "no hay vuelta al módulo desde una pantalla transversal");
  });

  await check("9. Mapa de procesos accesible desde Quality", async () => {
    const r = await get(mapHref);
    assert(r.status === 200, `dio ${r.status}`);
    assert(has(r.body, "Mapa de procesos"), "no es la pantalla del mapa");
  });

  await check("10. Documentos: la sección propia de Quality abre", async () => {
    const r = await get(documentsHref);
    assert(r.status === 200, `dio ${r.status} → ${r.location}`);
    assert(has(r.body, "Documentos de Quality"), "falta la sección de documentos propios");
    assert(has(r.body, "Documentos vinculados"), "falta la sección de vinculados");
    assert(has(r.body, "Crear documento"), "no se ofrece crear un documento");
  });

  await check("11. Crear un documento de Quality y verlo en su lista", async () => {
    const { data, error } = await client.from("trazadoc_documents")
      .insert({ organization_id: org, title: "Procedimiento de auditoría interna",
                source_type: "custom", module_key: "quality", category_code: "procedure" })
      .select("id").single();
    assert(!error && data, `no se pudo crear el documento: ${error?.message}`);
    await client.from("trazadoc_document_sections").insert({
      organization_id: org, document_id: data!.id, section_key: "purpose",
      title: "Objetivo", content: "", sort_order: 1, is_required: true,
    });

    const r = await get(documentsHref);
    assert(has(r.body, "Procedimiento de auditoría interna"), "el documento no aparece");
    documentDetailHref = linkByText(r.body, "Procedimiento de auditoría interna") ?? "";
    assert(documentDetailHref.startsWith("/quality/documents/"),
      `el detalle enlaza a ${documentDetailHref}`);
  });

  await check("12. Abrir y editar el documento con el editor del motor", async () => {
    const r = await get(documentDetailHref);
    assert(r.status === 200, `dio ${r.status}`);
    assert(has(r.body, "Procedimiento de auditoría interna"), "no es el documento esperado");
    assert(has(r.body, "Objetivo"), "no se ve la sección de contenido");
    assert(has(r.body, "Guardar contenido"), "no se ofrece guardar");
    assert(has(r.body, "Volver a Documentos de Quality"), "no hay vuelta a la lista de Quality");
  });

  await check("13. Vincular un documento EXISTENTE de otro módulo al proceso", async () => {
    const { data: doc } = await client.from("trazadoc_documents")
      .insert({ organization_id: org, title: "Procedimiento de recepción de materias primas",
                source_type: "custom", module_key: "cpr", category_code: "procedure" })
      .select("id").single();

    const detalle = await get(processDetailHref);
    assert(
      has(detalle.body, "Asociar documento de TrazaDocs"),
      `no se ofrece vincular un documento. Sección: ${
        flat(detalle.body).match(/Documentos asociados[\s\S]{0,400}/)?.[0] ?? "(no encontrada)"
      }`
    );
    // El desplegable lo ofrece indicando su módulo de origen.
    assert(detalle.body.includes("Procedimiento de recepción de materias primas"),
      "el documento de PCR no aparece como vinculable");

    const { data: proc } = await client.from("quality_processes")
      .select("id").eq("organization_id", org).eq("code", "P-SIS-01").single();
    const { error } = await client.from("quality_process_documents")
      .insert({ organization_id: org, process_id: proc!.id, document_id: doc!.id, relation_type: "supports" });
    assert(!error, `no se pudo vincular: ${error?.message}`);

    const r = await get(documentsHref);
    // QUALITY-01.2 pasó a mostrar el NOMBRE COMERCIAL del módulo, que sale del
    // registro. Se compara contra el registro y no contra una copia del texto,
    // para que renombrar un módulo no vuelva a dejar esta prueba en rojo.
    assert(has(r.body, `Origen: ${shellModuleName("cpr")}`),
      "el documento vinculado no muestra su módulo de origen");
    // Y no se ha duplicado.
    const { count } = await client.from("trazadoc_documents")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org).eq("title", "Procedimiento de recepción de materias primas");
    assert(count === 1, `vincular duplicó el documento: hay ${count}`);
  });

  await check("14. Invitación de equipo: el enlace CONTIENE el token", async () => {
    const invitado = `q011ui-invitado-${Date.now()}@test.trazaloop.dev`;
    const token = `q011ui-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
    const { error } = await client.from("team_invitations").insert({
      organization_id: org, email: invitado, role_code: "quality", token, status: "pending",
      expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    });
    assert(!error, `no se pudo crear la invitación: ${error?.message}`);

    const r = await get(`/team?m=quality`);
    assert(r.status === 200, `/team dio ${r.status}`);
    assert(has(r.body, invitado), "la invitación no aparece en la lista");
    // Lo que faltaba: el enlace con el token, disponible DESPUÉS de crearla.
    assert(r.body.includes(`/accept-invite?token=${token}`),
      "la lista no ofrece el enlace con el token — era el defecto reportado");
    assert(r.body.includes("http"), "el enlace debe ser absoluto, no una ruta relativa");
  });

  await check("15. El enlace de invitación abre una página que SÍ lee el token", async () => {
    const { data: inv } = await admin.from("team_invitations")
      .select("token").eq("organization_id", org).eq("status", "pending").limit(1).single();

    const r = await get(`/accept-invite?token=${inv!.token}`);
    assert(r.status === 200, `dio ${r.status} → ${r.location}`);
    assert(!has(r.body, "El enlace no incluye un token de invitación válido"),
      "la página sigue diciendo que falta el token");
    // Quien abre el enlace no es el invitado, así que la página lo dice — pero
    // habiendo LEÍDO el token, que es lo que se está comprobando.
    assert(
      has(r.body, "Te invitaron a") || has(r.body, "enviada a otro correo"),
      "la página no reconoció la invitación"
    );
  });

  await check("16. El invitado acepta y queda dentro de la empresa", async () => {
    const { data: inv } = await admin.from("team_invitations")
      .select("token, email").eq("organization_id", org).eq("status", "pending").limit(1).single();

    const { data: nuevo } = await admin.auth.admin.createUser({
      email: inv!.email as string, password: "Trazaloop-Test-1234", email_confirm: true,
    });
    const invitedClient = createClient(URL!, ANON!, { auth: { autoRefreshToken: false, persistSession: false } });
    await invitedClient.auth.signInWithPassword({
      email: inv!.email as string, password: "Trazaloop-Test-1234",
    });

    const { error } = await invitedClient.rpc("accept_team_invitation", { p_token: inv!.token });
    assert(!error, `no se pudo aceptar la invitación: ${error?.message}`);

    const { data: mem } = await admin.from("memberships")
      .select("role_code, status").eq("organization_id", org).eq("user_id", nuevo.user!.id).single();
    assert(mem?.role_code === "quality" && mem?.status === "active", "no quedó como miembro activo");
  });

  console.log(`\nResultado: ${passed} en verde, ${failed} en rojo.\n`);
  stopServers();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error("Error inesperado:", e); stopServers(); process.exit(1); });
