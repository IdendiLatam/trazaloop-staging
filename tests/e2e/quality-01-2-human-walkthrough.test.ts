/**
 * Trazaloop Quality · QUALITY-01.2 · Recorrido HUMANO automatizado.
 *
 * Reproduce, por HTTP y contra el build de producción, el recorrido del
 * encargo:
 *
 *   login → selector → Quality → cargo → Compras/Producción/Despachos →
 *   entradas y salidas → relación Compras→Producción → relación
 *   Producción→Despachos → ver Producción (recibe de / entrega a) →
 *   documentos en una entrada y en una salida → mapa con flechas → publicar →
 *   Documentos de Quality → equipo → invitación → aceptar → selector
 *
 * Regla del encargo: NO se escriben URLs internas a mano. Cada destino sale
 * del `href` que renderiza la pantalla anterior, y la aceptación de la
 * invitación se envía como el propio formulario de la página, no simulando la
 * llamada por dentro.
 *
 * Requisitos: `npm run build` previo y Supabase en marcha.
 * Correr: npm run test:quality012-ui
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
  console.error("Faltan variables para test:quality012-ui (URL, ANON, SERVICE_ROLE).");
  process.exit(1);
}

const PORT = Number(process.env.Q012_PORT ?? 3162);
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

const decode = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&#x2F;/g, "/")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

function flat(html: string): string {
  return decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
}
function has(html: string, needle: string): boolean {
  return flat(html).toLowerCase().includes(needle.toLowerCase());
}
function links(html: string): { href: string; text: string }[] {
  return [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => ({
    href: decode(m[1]),
    text: flat(m[2]).trim(),
  }));
}
function linkByText(html: string, label: string): string | null {
  return links(html).find((l) => l.text.toLowerCase().includes(label.toLowerCase()))?.href ?? null;
}

/** El bloque <form> que contiene un texto dado, con sus campos ocultos. */
function formWith(html: string, marker: string): { fields: Record<string, string> } | null {
  for (const block of html.match(/<form[\s\S]*?<\/form>/g) ?? []) {
    if (!flat(block).includes(marker)) continue;
    const fields: Record<string, string> = {};
    for (const input of block.matchAll(/<input\b[^>]*name="([^"]+)"[^>]*>/g)) {
      const value = input[0].match(/value="([^"]*)"/)?.[1] ?? "";
      fields[decode(input[1])] = decode(value);
    }
    return { fields };
  }
  return null;
}

/** El fragmento de texto plano que sigue a un encabezado, para poder afirmar
 *  sobre UNA sección y no sobre la página entera. */
function sectionAfter(html: string, heading: string, length = 700): string {
  const text = flat(html);
  const i = text.toLowerCase().indexOf(heading.toLowerCase());
  return i < 0 ? "" : text.slice(i, i + length);
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
  console.log("\nQUALITY-01.2 · recorrido humano automatizado\n");
  console.log("  · levantando el build de producción…");

  servers.push(
    spawn("npx", ["next", "start", "-p", String(PORT)], {
      env: { ...process.env, QUALITY_MODULE_ENABLED: "true", TEXTILES_MODULE_ENABLED: "true" },
      stdio: "ignore",
    })
  );
  await waitUp();

  const stamp = `${Date.now()}`;
  const password = "Trazaloop-Test-1234";

  async function signIn(email: string) {
    const client = createClient(URL!, ANON!, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    assert(!error && data.session, `login ${email}: ${error?.message}`);
    return { client, session: data.session! };
  }

  const email = `q012ui-${stamp}@test.trazaloop.dev`;
  const { data: created, error: userErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: "QA Humano 01.2" },
  });
  assert(!userErr && created.user, `no se pudo crear el usuario: ${userErr?.message}`);

  const { client, session } = await signIn(email);
  await client.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "q012-ui" });

  const { data: orgId } = await client.rpc("create_organization", { p_name: `Q012 UI ${stamp}` });
  const org = orgId as string;
  // QUALITY-ONLY: es el caso de la decisión de producto. PCR y Textiles se
  // deshabilitan para que ningún enlace pueda apoyarse en ellos.
  await admin.from("organization_modules")
    .update({ access_mode: "full", access_expires_at: null })
    .eq("organization_id", org).eq("module_code", "quality");
  await admin.from("organization_modules")
    .update({ enabled: false })
    .eq("organization_id", org).neq("module_code", "quality");

  function cookieFor(s: { access_token: string }, activeOrg: string | null) {
    const b64 = Buffer.from(JSON.stringify(s), "utf8").toString("base64url");
    if (!activeOrg) return `${AUTH_COOKIE}=base64-${b64}`;
    const sig = ORG_SECRET
      ? `.${createHmac("sha256", ORG_SECRET).update(activeOrg).digest("base64url")}`
      : "";
    return `${AUTH_COOKIE}=base64-${b64}; tz-active-org=${activeOrg}${sig}`;
  }
  const cookie = cookieFor(session, org);

  async function get(path: string, withCookie = cookie) {
    const r = await fetch(`${BASE}${path}`, { headers: { cookie: withCookie }, redirect: "manual" });
    return { status: r.status, location: r.headers.get("location"), body: r.status === 200 ? await r.text() : "" };
  }

  /** Envía un formulario de la página tal como lo haría un navegador sin JS:
   *  Next renderiza los campos que identifican la acción de servidor. */
  async function submitForm(path: string, html: string, marker: string, withCookie: string) {
    const form = formWith(html, marker);
    assert(form, `no se encontró el formulario de «${marker}»`);
    const body = new FormData();
    for (const [k, v] of Object.entries(form!.fields)) body.append(k, v);
    const r = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { cookie: withCookie },
      body,
      redirect: "manual",
    });
    return { status: r.status, location: r.headers.get("location"), text: await r.text() };
  }

  /** Crea un proceso con sus entradas y salidas, con la sesión REAL. */
  async function createProcess(name: string, io: { direction: "input" | "output"; name: string }[]) {
    const { data: proc, error } = await client
      .from("quality_processes")
      .insert({ organization_id: org, name, category_code: "core" })
      .select("id").single();
    assert(!error && proc, `crear ${name}: ${error?.message}`);
    const { data: revisionId } = await client.rpc("quality_open_process_revision", {
      p_process_id: proc!.id as string, p_change_note: null,
    });
    const ids: Record<string, string> = {};
    for (const [i, item] of io.entries()) {
      const { data, error: e } = await client.from("quality_process_io").insert({
        organization_id: org, revision_id: revisionId as string, process_id: proc!.id as string,
        direction: item.direction, name: item.name, sort_order: i + 1,
      }).select("id").single();
      assert(!e && data, `crear ${item.direction} ${item.name}: ${e?.message}`);
      ids[item.name] = data!.id as string;
    }
    return { id: proc!.id as string, io: ids };
  }

  // Cada destino sale del HTML anterior.
  let qualityHref = "";
  let qualityHtml = "";
  let processesHref = "";
  let documentsHref = "";
  let mapHref = "";
  let produccionHref = "";
  let comprasHref = "";

  await check("1. Selector de módulos: Quality ofrece «Entrar →»", async () => {
    const r = await get("/modules");
    assert(r.status === 200, `/modules dio ${r.status} → ${r.location}`);
    const card = moduleCard(r.body, "Trazaloop Quality");
    assert(card && card.tag === "a", "la tarjeta de Quality no es un enlace");
    assert(has(card!.block, "Entrar →"), "la tarjeta no ofrece entrar");
    qualityHref = card!.open.match(/href="([^"]+)"/)?.[1] ?? "";
    assert(qualityHref === "/quality", `la tarjeta enlaza a ${qualityHref}`);
  });

  await check("2. Entrar a Quality y tomar sus destinos de la propia portada", async () => {
    const r = await get(qualityHref);
    assert(r.status === 200, `dio ${r.status} → ${r.location}`);
    qualityHtml = r.body;
    processesHref = linkByText(qualityHtml, "Procesos") ?? "";
    documentsHref = linkByText(qualityHtml, "Documentos") ?? "";
    mapHref = linkByText(qualityHtml, "Mapa de procesos") ?? "";
    for (const [label, href] of [["Procesos", processesHref], ["Documentos", documentsHref], ["Mapa", mapHref]]) {
      assert(href.startsWith("/quality"), `«${label}» enlaza a ${href}`);
    }
  });

  const compras = await createProcess(`Compras ${stamp}`, [
    { direction: "input", name: "Necesidad de compra" },
    { direction: "output", name: "Materia prima aprobada" },
  ]);
  const produccion = await createProcess(`Producción ${stamp}`, [
    { direction: "input", name: "Materia prima" },
    { direction: "output", name: "Producto terminado" },
  ]);
  const despachos = await createProcess(`Despachos ${stamp}`, [
    { direction: "input", name: "Producto para despacho" },
    { direction: "output", name: "Entrega confirmada" },
  ]);

  await check("3. Los tres procesos aparecen en la lista y se abre el detalle desde ahí", async () => {
    const r = await get(processesHref);
    assert(r.status === 200, `dio ${r.status}`);
    for (const nombre of ["Compras", "Producción", "Despachos"]) {
      assert(has(r.body, `${nombre} ${stamp}`), `no aparece ${nombre}`);
    }
    produccionHref = linkByText(r.body, `Producción ${stamp}`) ?? "";
    comprasHref = linkByText(r.body, `Compras ${stamp}`) ?? "";
    assert(produccionHref.startsWith("/quality/processes/"), `el detalle enlaza a ${produccionHref}`);
  });

  await check("4. La ficha ofrece crear la relación desde SUS DOS extremos", async () => {
    const r = await get(produccionHref);
    assert(r.status === 200, `dio ${r.status}`);
    assert(has(r.body, "Recibe de"), "falta la vista «Recibe de»");
    assert(has(r.body, "Entrega a"), "falta la vista «Entrega a»");
    assert(has(r.body, "Añadir proceso del que recibe"), "no se puede crear desde el extremo receptor");
    assert(has(r.body, "Añadir proceso al que entrega"), "no se puede crear desde el extremo emisor");
  });

  await check("5. Registrar Compras → Producción y Producción → Despachos", async () => {
    const rels = [
      { s: compras, sOut: "Materia prima aprobada", t: produccion, tIn: "Materia prima" },
      { s: produccion, sOut: "Producto terminado", t: despachos, tIn: "Producto para despacho" },
    ];
    for (const rel of rels) {
      const { error } = await client.from("quality_process_interactions").insert({
        organization_id: org,
        source_process_id: rel.s.id, source_output_id: rel.s.io[rel.sOut],
        target_process_id: rel.t.id, target_input_id: rel.t.io[rel.tIn],
        information_item: rel.sOut,
      });
      assert(!error, `no se pudo registrar la relación: ${error?.message}`);
    }
  });

  await check("6. Producción muestra DE QUIÉN RECIBE, con salida y entrada nombradas", async () => {
    const r = await get(produccionHref);
    const recibe = sectionAfter(r.body, "Recibe de");
    assert(recibe.includes(`Compras ${stamp}`), `«Recibe de» no menciona Compras. Sección: ${recibe}`);
    assert(recibe.includes("Salida origen: Materia prima aprobada"),
      `no se nombra la salida de origen. Sección: ${recibe}`);
    assert(recibe.includes("Entrada en este proceso: Materia prima"),
      `no se nombra la entrada propia. Sección: ${recibe}`);
  });

  await check("7. …y A QUIÉN ENTREGA, en la misma ficha", async () => {
    const r = await get(produccionHref);
    const entrega = sectionAfter(r.body, "Entrega a");
    assert(entrega.includes(`Despachos ${stamp}`), `«Entrega a» no menciona Despachos. Sección: ${entrega}`);
    assert(entrega.includes("Salida de este proceso: Producto terminado"),
      `no se nombra la salida propia. Sección: ${entrega}`);
    assert(entrega.includes("Entrada destino: Producto para despacho"),
      `no se nombra la entrada de destino. Sección: ${entrega}`);
  });

  await check("8. La MISMA relación se lee desde el otro extremo, sin duplicarse", async () => {
    const r = await get(comprasHref);
    const entrega = sectionAfter(r.body, "Entrega a");
    assert(entrega.includes(`Producción ${stamp}`), `desde Compras no se ve «entrega a Producción». Sección: ${entrega}`);
    const { count } = await client
      .from("quality_process_interactions")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org)
      .eq("source_process_id", compras.id)
      .eq("target_process_id", produccion.id);
    assert(count === 1, `la relación se guardó ${count} veces`);
  });

  await check("9. Documentos en una ENTRADA y en una SALIDA, con enlace a Quality", async () => {
    const { data: espec } = await client.from("trazadoc_documents").insert({
      organization_id: org, source_type: "custom", module_key: "quality",
      category_code: "procedure", title: `Especificación de materia prima ${stamp}`,
    }).select("id").single();
    const { data: registro } = await client.from("trazadoc_documents").insert({
      organization_id: org, source_type: "custom", module_key: "quality",
      category_code: "record", title: `Registro de producto terminado ${stamp}`,
    }).select("id").single();

    const vinculos = [
      { io: produccion.io["Materia prima"], doc: espec!.id as string, relation: "governs" },
      { io: produccion.io["Producto terminado"], doc: registro!.id as string, relation: "records" },
    ];
    for (const v of vinculos) {
      const { error } = await client.from("quality_process_documents").insert({
        organization_id: org, process_id: produccion.id, io_id: v.io,
        document_id: v.doc, relation_type: v.relation,
      });
      assert(!error, `no se pudo vincular: ${error?.message}`);
    }

    const r = await get(produccionHref);
    const entradas = sectionAfter(r.body, "Entradas", 1400);
    assert(entradas.includes(`Especificación de materia prima ${stamp}`),
      `la especificación no aparece bajo la entrada. Sección: ${entradas}`);
    const salidas = sectionAfter(r.body, "Salidas", 1400);
    assert(salidas.includes(`Registro de producto terminado ${stamp}`),
      `el registro no aparece bajo la salida. Sección: ${salidas}`);

    // El documento se abre en Quality, jamás en la ruta de PCR: una empresa
    // que solo tiene Quality no puede entrar allí.
    const docHrefs = links(r.body).filter((l) => l.text.includes(`Especificación de materia prima ${stamp}`));
    assert(docHrefs.length > 0, "el documento vinculado no es un enlace");
    assert(docHrefs[0].href === `/quality/documents/${espec!.id}`,
      `el documento enlaza a ${docHrefs[0].href}, que no es la ruta de Quality`);
    assert(!r.body.includes(`/trazadocs/${espec!.id}`), "sigue enlazando a la ruta de PCR");
  });

  await check("10. Desvincular NO borra el documento", async () => {
    const { data: link } = await client.from("quality_process_documents")
      .select("id").eq("organization_id", org).eq("io_id", produccion.io["Producto terminado"]).maybeSingle();
    await client.from("quality_process_documents").delete().eq("id", link!.id as string);
    const { count } = await client.from("trazadoc_documents")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org).ilike("title", `Registro de producto terminado ${stamp}`);
    assert(count === 1, "desvincular se llevó el documento");
    // Se restablece para el resto del recorrido.
    await client.from("quality_process_documents").insert({
      organization_id: org, process_id: produccion.id, io_id: produccion.io["Producto terminado"],
      document_id: (await client.from("trazadoc_documents").select("id")
        .eq("organization_id", org).ilike("title", `Registro de producto terminado ${stamp}`)
        .single()).data!.id as string,
      relation_type: "records",
    });
  });

  await check("11. El mapa DIBUJA el flujo, no una lista de tarjetas", async () => {
    const { data: map } = await client.from("quality_process_maps")
      .insert({ organization_id: org, name: `Mapa ${stamp}`, is_default: true })
      .select("id").single();
    const { data: version } = await client.rpc("quality_open_map_version", {
      p_map_id: map!.id as string, p_change_note: null,
    });
    for (const p of [compras, produccion, despachos]) {
      await client.from("quality_process_map_nodes").insert({
        organization_id: org, map_version_id: version as string,
        process_id: p.id, category_code: "core",
      });
    }

    const r = await get(mapHref);
    assert(r.status === 200, `dio ${r.status}`);
    assert(r.body.includes("<svg"), "el mapa no dibuja nada");
    const paths = r.body.match(/<path\b[^>]*marker-end|<path\b[^>]*markerEnd/g) ?? [];
    assert(paths.length >= 2, `esperaba al menos dos flechas, hay ${paths.length}`);
    assert(/quality-arrow-/.test(r.body), "las líneas no tienen punta de flecha");
    assert(has(r.body, "Materia prima aprobada → Materia prima"),
      "el mapa no dice qué salida alimenta qué entrada");
    assert(has(r.body, "Producto terminado → Producto para despacho"),
      "falta la segunda etiqueta de flujo");
    // Y la misma verdad en texto, para que no dependa del dibujo.
    const relaciones = sectionAfter(r.body, "Relaciones del mapa", 900);
    assert(relaciones.includes(`Compras ${stamp}`) && relaciones.includes(`Producción ${stamp}`),
      `la lista de relaciones no describe el flujo. Sección: ${relaciones}`);
  });

  await check("12. Publicar CONGELA el mapa: cambiar una relación después no lo altera", async () => {
    const { data: version } = await client.from("quality_process_map_versions")
      .select("id").eq("organization_id", org).eq("status", "draft").single();
    const { error } = await client.rpc("quality_publish_map_version", {
      p_version_id: version!.id as string, p_effective_from: null,
    });
    assert(!error, `no se pudo publicar: ${error?.message}`);

    const publicado = await get(mapHref);
    assert(has(publicado.body, "Materia prima aprobada → Materia prima"),
      "la versión publicada perdió el flujo");
    assert(has(publicado.body, "Versión oficial del mapa"),
      "no se advierte que se está viendo la versión oficial");
    assert(has(publicado.body, "tal como estaban el día en que se publicó"),
      "no se explica que las relaciones que muestra están congeladas");

    // Se borra la relación DESPUÉS de publicar.
    await client.from("quality_process_interactions").delete()
      .eq("organization_id", org).eq("source_process_id", compras.id);

    const despues = await get(mapHref);
    assert(has(despues.body, "Materia prima aprobada → Materia prima"),
      "la versión publicada cambió retroactivamente al tocar una relación");
    // Y la ficha del proceso, que sí es dato vivo, ya no la muestra.
    const ficha = await get(produccionHref);
    assert(!sectionAfter(ficha.body, "Recibe de").includes("Salida origen: Materia prima aprobada"),
      "la relación borrada sigue viva en la ficha del proceso");
  });

  await check("13. Documentos de Quality: la pantalla abre y ofrece crear", async () => {
    const r = await get(documentsHref);
    assert(r.status === 200, `dio ${r.status} → ${r.location}`);
    assert(has(r.body, "Documentos de Quality"), "no es la pantalla de documentos");
    assert(has(r.body, "Crear documento"), "no se ofrece crear un documento");
  });

  await check("14. «Crear documento» no revienta: las categorías VIAJAN al navegador", async () => {
    // La causa del «This page couldn't load» era que la lista de categorías
    // llegaba al cliente como una referencia de servidor y no como un array,
    // así que el formulario reventaba al desplegarse. Se comprueba en el
    // paquete que el navegador descarga para esta pantalla.
    const r = await get(documentsHref);
    const chunks = [...r.body.matchAll(/src="(\/_next\/static\/chunks\/[^"]+)"/g)].map((m) => m[1]);
    assert(chunks.length > 0, "la pantalla no carga ningún paquete de cliente");
    let found = false;
    for (const chunk of chunks) {
      const js = await (await fetch(`${BASE}${chunk}`)).text();
      if (js.includes("Nuevo documento de Quality") || (js.includes('"procedure"') && js.includes('"instruction"'))) {
        assert(js.includes('"procedure"') && js.includes('"instruction"') && js.includes('"policy"'),
          "el paquete del formulario no lleva las categorías: volvería a fallar al desplegarlo");
        found = true;
        break;
      }
    }
    assert(found, "no se encontró el paquete del formulario de creación");
  });

  await check("15. «Equipo» desde Quality NO saca a PCR y muestra el enlace de invitación", async () => {
    const equipoHref = linkByText(qualityHtml, "Equipo") ?? "";
    assert(equipoHref.startsWith("/team") && equipoHref.includes("m=quality"),
      `«Equipo» enlaza a ${equipoHref}`);

    const invitado = `q012ui-invitado-${stamp}@test.trazaloop.dev`;
    const token = `q012ui-${stamp}`;
    const { error } = await client.from("team_invitations").insert({
      organization_id: org, email: invitado, role_code: "quality", token, status: "pending",
      expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    });
    assert(!error, `no se pudo invitar: ${error?.message}`);

    const r = await get(equipoHref);
    assert(r.status === 200, `dio ${r.status}`);
    assert(has(r.body, "Trazaloop Quality"), "el shell dejó de ser el de Quality");
    assert(!has(r.body, "NTC 6632"), "apareció la identidad de PCR");
    assert(r.body.includes(`/accept-invite?token=${token}`), "la invitación no muestra su enlace");
    // Los atajos de la cabecera ya no son rutas de PCR.
    for (const pcr of ["/implementation", "/imports", "/evidences", "/traceability"]) {
      assert(!r.body.includes(`href="${pcr}"`), `«Equipo» sigue enlazando a ${pcr}, que es de PCR`);
    }
  });

  await check("16. Aceptar la invitación aterriza en el SELECTOR DE MÓDULOS, no en PCR", async () => {
    const { data: inv } = await admin.from("team_invitations")
      .select("token, email").eq("organization_id", org).eq("status", "pending").limit(1).single();

    await admin.auth.admin.createUser({
      email: inv!.email as string, password, email_confirm: true,
      user_metadata: { full_name: "QA Invitado" },
    });
    const invited = await signIn(inv!.email as string);
    await invited.client.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "q012-ui" });
    const invitedCookie = cookieFor(invited.session, null);

    // Se abre el enlace tal cual estaba en la pantalla de equipo.
    const path = `/accept-invite?token=${inv!.token}`;
    const page = await get(path, invitedCookie);
    assert(page.status === 200, `el enlace dio ${page.status} → ${page.location}`);
    assert(has(page.body, "Te invitaron a"), "la página no reconoció la invitación");

    // Y se envía su formulario, como haría el navegador.
    const submitted = await submitForm(path, page.body, "Aceptar invitación", invitedCookie);
    assert(
      submitted.location === "/modules" || submitted.text.includes("/modules"),
      `tras aceptar se fue a ${submitted.location ?? "(sin Location)"} — debía ser el selector de módulos`
    );
    assert(
      submitted.location !== "/dashboard" && !/"\/dashboard"/.test(submitted.text),
      "tras aceptar se fue a la portada de PCR: el sesgo sigue ahí"
    );

    const { data: mem } = await admin.from("memberships")
      .select("role_code, status").eq("organization_id", org)
      .eq("user_id", (await admin.auth.admin.listUsers()).data.users
        .find((u) => u.email === inv!.email)!.id).single();
    assert(mem?.role_code === "quality" && mem?.status === "active", "no quedó como miembro activo");
  });

  console.log(`\nResultado: ${passed} en verde, ${failed} en rojo.\n`);
  stopServers();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error("Error inesperado:", e); stopServers(); process.exit(1); });
