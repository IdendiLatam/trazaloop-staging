/**
 * Trazaloop Quality · QUALITY-02 · Recorrido HUMANO automatizado.
 *
 * Reproduce, por HTTP y contra el build de producción, el recorrido del
 * encargo (Parte 21):
 *
 *   login → selector → Quality → Documentos → Crear → agregar secciones →
 *   guardar → enviar a revisión eligiendo responsables → el revisor abre Mis
 *   tareas → devuelve con motivo → el creador ve la alerta y el motivo →
 *   corrige → reenvía → el revisor acepta → el aprobador abre su tarea →
 *   aprueba → Lista Maestra → descargar PDF → crear Revisión 2 → comprobar
 *   que la Lista Maestra se actualizó
 *
 * Regla del encargo: NO se escriben URLs internas a mano. Cada destino sale
 * del `href` que renderiza la pantalla anterior, y cada acción se envía como
 * el propio formulario de la página, no llamando a la acción por dentro.
 *
 * Incluye la VALIDACIÓN REAL de los dos PDF (Parte 22): no basta un HTTP 200.
 *
 * Requisitos: `npm run build` previo y Supabase en marcha.
 * Correr: npm run test:quality02-ui
 */
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";

loadEnv({ path: ".env.local" });

const URL_ENV = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ORG_SECRET = process.env.ACTIVE_ORG_COOKIE_SECRET ?? null;

if (!URL_ENV || !ANON || !SERVICE) {
  console.error("Faltan variables para test:quality02-ui (URL, ANON, SERVICE_ROLE).");
  process.exit(1);
}

const PORT = Number(process.env.Q02_PORT ?? 3172);
const BASE = `http://localhost:${PORT}`;
const AUTH_COOKIE = `sb-${new global.URL(URL_ENV).hostname.split(".")[0]}-auth-token`;

let passed = 0;
let failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
async function check(n: string, fn: () => Promise<void>) {
  try { await fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const admin = createClient(URL_ENV, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
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
    href: decode(m[1]), text: flat(m[2]).trim(),
  }));
}
function linkByText(html: string, label: string): string | null {
  return links(html).find((l) => l.text.toLowerCase().includes(label.toLowerCase()))?.href ?? null;
}
/** El fragmento de texto plano que sigue a un encabezado, para afirmar sobre
 *  UNA sección y no sobre la página entera. */
function sectionAfter(html: string, heading: string, length = 900): string {
  const text = flat(html);
  const i = text.toLowerCase().indexOf(heading.toLowerCase());
  return i < 0 ? "" : text.slice(i, i + length);
}

/**
 * El bloque <form> que contiene un texto dado, con TODOS sus campos:
 * ocultos, textos, áreas de texto y desplegables (con su opción por defecto).
 * Es lo que envía un navegador sin JavaScript.
 */
type FormFields = Record<string, string[]>;
function formWith(html: string, marker: string): FormFields | null {
  for (const block of html.match(/<form[\s\S]*?<\/form>/g) ?? []) {
    if (!flat(block).includes(marker)) continue;
    const fields: FormFields = {};
    const push = (name: string, value: string) => {
      const key = decode(name);
      (fields[key] ??= []).push(decode(value));
    };
    for (const input of block.matchAll(/<input\b[^>]*>/g)) {
      const tag = input[0];
      const name = tag.match(/name="([^"]+)"/)?.[1];
      if (!name) continue;
      const type = tag.match(/type="([^"]+)"/)?.[1] ?? "text";
      // Una casilla sin marcar no se envía; un radio solo si está marcado.
      if ((type === "checkbox" || type === "radio") && !/\bchecked\b/.test(tag)) continue;
      push(name, tag.match(/value="([^"]*)"/)?.[1] ?? (type === "checkbox" ? "on" : ""));
    }
    for (const area of block.matchAll(/<textarea\b[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/textarea>/g)) {
      push(area[1], area[2]);
    }
    for (const select of block.matchAll(/<select\b[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
      const selected = select[2].match(/<option\b[^>]*selected[^>]*value="([^"]*)"/)
        ?? select[2].match(/<option\b[^>]*value="([^"]*)"[^>]*selected/);
      push(select[1], selected?.[1] ?? select[2].match(/<option\b[^>]*value="([^"]*)"/)?.[1] ?? "");
    }
    return fields;
  }
  return null;
}

/** Opciones de un desplegable concreto dentro del formulario marcado. */
function optionsOf(html: string, marker: string, selectName: string): { value: string; label: string }[] {
  for (const block of html.match(/<form[\s\S]*?<\/form>/g) ?? []) {
    if (!flat(block).includes(marker)) continue;
    for (const select of block.matchAll(/<select\b[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
      if (decode(select[1]) !== selectName) continue;
      return [...select[2].matchAll(/<option\b[^>]*value="([^"]*)"[^>]*>([\s\S]*?)<\/option>/g)]
        .map((m) => ({ value: decode(m[1]), label: flat(m[2]).trim() }))
        .filter((o) => o.value.length > 0);
    }
  }
  return [];
}

async function main() {
  console.log("\nQUALITY-02 · recorrido humano automatizado\n");
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

  async function newUser(label: string, fullName: string) {
    const email = `q02ui-${label}-${stamp}@test.trazaloop.dev`;
    const { data, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name: fullName },
    });
    assert(!error && data.user, `crear ${label}: ${error?.message}`);
    const client = createClient(URL_ENV!, ANON!, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: s, error: e } = await client.auth.signInWithPassword({ email, password });
    assert(!e && s.session, `login ${label}: ${e?.message}`);
    return { id: data.user!.id, name: fullName, client, session: s.session! };
  }

  const creator = await newUser("creador", "Ana Creadora");
  const reviewer = await newUser("revisor", "Beto Revisor");
  const approver = await newUser("aprobador", "Carla Aprobadora");

  await creator.client.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "q02-ui" });
  await reviewer.client.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "q02-ui" });
  await approver.client.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "q02-ui" });

  const { data: orgId } = await creator.client.rpc("create_organization", { p_name: `Q02 UI ${stamp}` });
  const org = orgId as string;

  // QUALITY-ONLY (Parte 15): PCR y Textiles deshabilitados para que ningún
  // enlace del recorrido pueda apoyarse en ellos.
  await admin.from("organization_modules")
    .update({ access_mode: "full", access_expires_at: null })
    .eq("organization_id", org).eq("module_code", "quality");
  await admin.from("organization_modules")
    .update({ enabled: false }).eq("organization_id", org).neq("module_code", "quality");

  await admin.from("memberships").insert([
    { organization_id: org, user_id: reviewer.id, role_code: "consultant", status: "active" },
    { organization_id: org, user_id: approver.id, role_code: "admin", status: "active" },
  ]);

  function cookieFor(s: { access_token: string }, activeOrg: string | null) {
    const b64 = Buffer.from(JSON.stringify(s), "utf8").toString("base64url");
    if (!activeOrg) return `${AUTH_COOKIE}=base64-${b64}`;
    const sig = ORG_SECRET
      ? `.${createHmac("sha256", ORG_SECRET).update(activeOrg).digest("base64url")}`
      : "";
    return `${AUTH_COOKIE}=base64-${b64}; tz-active-org=${activeOrg}${sig}`;
  }
  const asCreator = cookieFor(creator.session, org);
  const asReviewer = cookieFor(reviewer.session, org);
  const asApprover = cookieFor(approver.session, org);

  async function get(path: string, cookie: string) {
    const r = await fetch(`${BASE}${path}`, { headers: { cookie }, redirect: "manual" });
    return { status: r.status, location: r.headers.get("location"), body: r.status === 200 ? await r.text() : "" };
  }

  /** Envía un formulario de la página tal como lo haría un navegador sin JS. */
  async function submitForm(
    path: string, html: string, marker: string, cookie: string,
    overrides: Record<string, string | string[]> = {}
  ) {
    const fields = formWith(html, marker);
    assert(fields, `no se encontró el formulario de «${marker}» en ${path}`);
    const body = new FormData();
    for (const [k, values] of Object.entries(fields!)) {
      if (k in overrides) continue;
      for (const v of values) body.append(k, v);
    }
    for (const [k, v] of Object.entries(overrides)) {
      for (const item of Array.isArray(v) ? v : [v]) body.append(k, item);
    }
    const r = await fetch(`${BASE}${path}`, { method: "POST", headers: { cookie }, body, redirect: "manual" });
    return { status: r.status, location: r.headers.get("location"), text: await r.text() };
  }

  // Cada destino sale del HTML anterior.
  let qualityHref = "";
  let documentsHref = "";
  let documentHref = "";
  let masterHref = "";
  let tasksHref = "";
  let documentPdfHref = "";
  let masterPdfHref = "";

  // -------------------------------------------------------------------------
  await check("1. El selector ofrece Quality y se entra desde ahí", async () => {
    const r = await get("/modules", asCreator);
    assert(r.status === 200, `/modules dio ${r.status} → ${r.location}`);
    const href = links(r.body).find((l) => l.href === "/quality");
    assert(href, "el selector no ofrece entrar a Quality");
    qualityHref = href!.href;
  });

  await check("2. La portada de Quality lleva a Documentos y a Mis tareas", async () => {
    const r = await get(qualityHref, asCreator);
    assert(r.status === 200, `dio ${r.status} → ${r.location}`);
    documentsHref = linkByText(r.body, "Documentos") ?? "";
    tasksHref = links(r.body).find((l) => l.href === "/quality/tasks")?.href ?? "";
    assert(documentsHref.startsWith("/quality/documents"), `Documentos enlaza a ${documentsHref}`);
    assert(tasksHref === "/quality/tasks", `Mis tareas enlaza a ${tasksHref}`);
  });

  await check("3. Documentos ofrece crear, y la Lista Maestra desde la propia pantalla", async () => {
    const r = await get(documentsHref, asCreator);
    assert(r.status === 200, `dio ${r.status}`);
    assert(has(r.body, "Crear documento"), "no se ofrece crear un documento");
    masterHref = links(r.body).find((l) => l.href === "/quality/documents/master")?.href ?? "";
    assert(masterHref === "/quality/documents/master", `la Lista Maestra enlaza a ${masterHref}`);
    // El aviso que evita el malentendido de raíz.
    assert(
      has(r.body, "revisiones que solo avanzan cuando alguien lo decide"),
      "la pantalla no explica el modelo de revisión"
    );
  });

  const TITULO = `Procedimiento de compras ${stamp}`;

  await check("4. Crear el documento: nace en Revisión 1 y en borrador", async () => {
    const r = await get(documentsHref, asCreator);
    // La acción de creación se ejerce como POST del formulario de la página.
    const res = await submitForm(documentsHref, r.body, "Nuevo documento de Quality", asCreator, {
      title: TITULO, code: "PR-COM-001", category_code: "procedure",
      description: "Aplica a todas las compras críticas.",
    });
    assert(res.status < 400, `crear devolvió ${res.status}`);

    const after = await get(documentsHref, asCreator);
    assert(has(after.body, TITULO), "el documento no aparece en la lista tras crearlo");
    assert(has(after.body, "Revisión 1"), "la lista no muestra Revisión 1");
    assert(has(after.body, "Borrador"), "el documento no nace en borrador");
    documentHref = linkByText(after.body, TITULO) ?? "";
    assert(documentHref.startsWith("/quality/documents/"), `el detalle enlaza a ${documentHref}`);
  });

  await check("5. La ficha ofrece el editor por secciones y agregar una nueva", async () => {
    const r = await get(documentHref, asCreator);
    assert(r.status === 200, `dio ${r.status}`);
    for (const seccion of ["Objetivo", "Alcance", "Responsabilidades", "Desarrollo", "Registros"]) {
      assert(has(r.body, seccion), `falta la sección de partida «${seccion}»`);
    }
    assert(has(r.body, "Agregar sección"), "no se ofrece agregar una sección");
    assert(has(r.body, "Estructura del documento"), "no se ofrece reordenar ni eliminar secciones");
    documentPdfHref = links(r.body).find((l) => l.href.endsWith("/pdf"))?.href ?? "";
    assert(documentPdfHref.endsWith("/pdf"), `la descarga en PDF enlaza a ${documentPdfHref}`);
  });

  await check("6. Agregar una sección nueva y verla en el documento", async () => {
    const r = await get(documentHref, asCreator);
    const res = await submitForm(documentHref, r.body, "Agregar sección", asCreator, {
      section_title: "Criterios de aceptación",
    });
    assert(res.status < 400, `agregar sección devolvió ${res.status}`);
    const after = await get(documentHref, asCreator);
    assert(has(after.body, "Criterios de aceptación"), "la sección nueva no aparece");
  });

  await check("7. Escribir el contenido y guardarlo", async () => {
    const r = await get(documentHref, asCreator);
    const fields = formWith(r.body, "Guardar contenido");
    assert(fields, "no se encontró el formulario de contenido");
    const sectionKeys = Object.keys(fields!).filter((k) => k.startsWith("section:"));
    assert(sectionKeys.length >= 6, `${sectionKeys.length} secciones en el editor`);
    const overrides: Record<string, string> = {};
    overrides[sectionKeys[0]] = "Comprar con criterio.";
    const res = await submitForm(documentHref, r.body, "Guardar contenido", asCreator, overrides);
    assert(res.status < 400, `guardar devolvió ${res.status}`);
    const after = await get(documentHref, asCreator);
    assert(has(after.body, "Comprar con criterio."), "el contenido guardado no se relee");
  });

  await check("8. Enviar a revisión eligiendo revisor y aprobador de la propia pantalla", async () => {
    const r = await get(documentHref, asCreator);
    assert(has(r.body, "Enviar a revisión y aprobación"), "no se ofrece enviar");
    const opciones = optionsOf(r.body, "Enviar a revisión y aprobación", "reviewer");
    const revisor = opciones.find((o) => o.label.includes("Beto Revisor"));
    const aprobador = opciones.find((o) => o.label.includes("Carla Aprobadora"));
    assert(revisor && aprobador, `los responsables no están en el desplegable: ${JSON.stringify(opciones)}`);

    const res = await submitForm(documentHref, r.body, "Enviar a revisión y aprobación", asCreator, {
      reviewer: [revisor!.value, "", ""],
      approver: [aprobador!.value, "", ""],
      route_mode: "sequential",
      note: "Listo para revisar",
    });
    assert(res.status < 400, `enviar devolvió ${res.status}`);

    const after = await get(documentHref, asCreator);
    assert(has(after.body, "En revisión"), "el documento no quedó en revisión");
    assert(has(after.body, "Revisión 1"), "enviar cambió el número de revisión");
    assert(has(after.body, "Beto Revisor"), "no se muestra quién revisa");
  });

  await check("9. El revisor ve la tarea en Mis tareas, con enlace al documento", async () => {
    const r = await get(tasksHref, asReviewer);
    assert(r.status === 200, `dio ${r.status}`);
    assert(has(r.body, "Revisar documento"), "no aparece la tarea de revisión");
    assert(has(r.body, TITULO), "la tarea no nombra el documento");
    const href = linkByText(r.body, "Revisar documento");
    assert(href === documentHref, `la tarea enlaza a ${href}, no al documento`);
  });

  await check("10. La portada de Quality le anuncia el pendiente", async () => {
    const r = await get(qualityHref, asReviewer);
    assert(has(r.body, "1 documento por revisar"), "la portada no resume lo pendiente");
  });

  const MOTIVO = "Falta el criterio de selección de proveedores.";

  await check("11. El revisor devuelve el documento con motivo", async () => {
    const r = await get(documentHref, asReviewer);
    assert(has(r.body, "Te toca revisar este documento"), "el revisor no ve su panel de decisión");
    const res = await submitForm(documentHref, r.body, "Te toca revisar este documento", asReviewer, {
      reason: MOTIVO, decision: "changes_requested",
    });
    assert(res.status < 400, `devolver dio ${res.status}`);
    const after = await get(documentHref, asReviewer);
    assert(has(after.body, "Devuelto con observaciones"), "el documento no quedó devuelto");
  });

  await check("12. El creador ve la alerta CON el motivo y su tarea de corregir", async () => {
    const tareas = await get(tasksHref, asCreator);
    assert(has(tareas.body, "Corregir y reenviar"), "no aparece la tarea de corregir");
    assert(has(tareas.body, MOTIVO), "la tarea no trae el motivo");
    assert(has(tareas.body, "Te devolvieron un documento"), "no aparece la alerta de devolución");

    const ficha = await get(documentHref, asCreator);
    const bloque = sectionAfter(ficha.body, "Te devolvieron este documento");
    assert(bloque.includes(MOTIVO), `la ficha no muestra el motivo. Sección: ${bloque}`);
    assert(has(ficha.body, "Revisión 1"), "una devolución cambió el número de revisión");
  });

  await check("13. El creador corrige y reenvía; la revisión sigue siendo 1", async () => {
    const r = await get(documentHref, asCreator);
    const fields = formWith(r.body, "Guardar contenido")!;
    const first = Object.keys(fields).find((k) => k.startsWith("section:"))!;
    await submitForm(documentHref, r.body, "Guardar contenido", asCreator, {
      [first]: "Comprar con criterio, evaluando proveedores.",
    });

    const r2 = await get(documentHref, asCreator);
    const opciones = optionsOf(r2.body, "Enviar a revisión y aprobación", "reviewer");
    const revisor = opciones.find((o) => o.label.includes("Beto Revisor"))!;
    const aprobador = opciones.find((o) => o.label.includes("Carla Aprobadora"))!;
    const res = await submitForm(documentHref, r2.body, "Enviar a revisión y aprobación", asCreator, {
      reviewer: [revisor.value, "", ""], approver: [aprobador.value, "", ""],
      route_mode: "sequential", note: "Corregido",
    });
    assert(res.status < 400, `reenviar dio ${res.status}`);

    const after = await get(documentHref, asCreator);
    assert(has(after.body, "En revisión"), "el documento no volvió a revisión");
    assert(has(after.body, "Revisión 1"), "reenviar cambió el número de revisión");
    // El rechazo anterior NO desaparece del historial.
    const historial = sectionAfter(after.body, "Historial de decisiones", 2000);
    assert(historial.includes(MOTIVO), "el motivo del rechazo desapareció del historial");
    assert(historial.includes("Corregido y reenviado"), "no consta el reenvío");
  });

  await check("14. El revisor acepta la revisión", async () => {
    const r = await get(documentHref, asReviewer);
    const res = await submitForm(documentHref, r.body, "Te toca revisar este documento", asReviewer, {
      reason: "", decision: "approved",
    });
    assert(res.status < 400, `aceptar dio ${res.status}`);
    const after = await get(documentHref, asReviewer);
    assert(has(after.body, "Pendiente de aprobación"), "el documento no pasó a aprobación");
  });

  await check("15. El aprobador recibe su tarea y aprueba", async () => {
    const tareas = await get(tasksHref, asApprover);
    assert(has(tareas.body, "Aprobar documento"), "el aprobador no recibió tarea");
    const href = linkByText(tareas.body, "Aprobar documento");
    assert(href === documentHref, `la tarea enlaza a ${href}`);

    const r = await get(documentHref, asApprover);
    assert(has(r.body, "Te toca aprobar este documento"), "el aprobador no ve su panel");
    const res = await submitForm(documentHref, r.body, "Te toca aprobar este documento", asApprover, {
      reason: "", decision: "approved",
    });
    assert(res.status < 400, `aprobar dio ${res.status}`);
  });

  await check("16. Tras TODO el recorrido, la revisión sigue siendo la 1", async () => {
    const r = await get(documentHref, asCreator);
    assert(has(r.body, "Revisión 1"), "el documento no muestra Revisión 1");
    assert(!has(r.body, "Revisión 2"), "apareció una Revisión 2 que nadie pidió");
    assert(
      has(r.body, "Vigente") || has(r.body, "Aprobado"),
      "el documento no quedó aprobado ni vigente"
    );
  });

  await check("17. La Lista Maestra muestra el documento con sus columnas", async () => {
    const r = await get(masterHref, asCreator);
    assert(r.status === 200, `dio ${r.status}`);
    for (const columna of [
      "Código", "Título", "Tipo", "Revisión vigente", "Estado", "Propietario",
      "Revisor(es)", "Aprobador(es)", "Creado", "Enviado", "Aprobado", "Vigencia",
      "Próxima revisión", "Procesos", "Origen", "Última decisión",
    ]) {
      assert(has(r.body, columna), `falta la columna «${columna}»`);
    }
    assert(has(r.body, TITULO), "el documento no aparece en la Lista Maestra");
    assert(has(r.body, "PR-COM-001"), "no aparece el código");
    assert(has(r.body, "Beto Revisor") && has(r.body, "Carla Aprobadora"),
      "no aparecen revisor y aprobador");
    masterPdfHref = links(r.body).find((l) => l.href.startsWith("/quality/documents/master/pdf"))?.href ?? "";
    assert(masterPdfHref.length > 0, "la Lista Maestra no ofrece descarga en PDF");
  });

  await check("18. Los filtros de la Lista Maestra funcionan por URL", async () => {
    const vigentes = await get(`${masterHref}?lifecycle=effective`, asCreator);
    assert(vigentes.status === 200, `dio ${vigentes.status}`);
    assert(has(vigentes.body, TITULO), "el documento vigente desapareció al filtrar por vigente");
    const borradores = await get(`${masterHref}?lifecycle=draft`, asCreator);
    assert(!has(borradores.body, TITULO), "un documento vigente apareció al filtrar por borrador");
    assert(has(borradores.body, "Estado: Borrador"), "el filtro aplicado no se declara");
  });

  // -------------------------------------------------------------------------
  // PDF · Parte 22: validación REAL del archivo, no un HTTP 200.
  // -------------------------------------------------------------------------
  async function fetchPdf(path: string, cookie: string) {
    const r = await fetch(`${BASE}${path}`, { headers: { cookie }, redirect: "manual" });
    const buf = Buffer.from(await r.arrayBuffer());
    return {
      status: r.status,
      type: r.headers.get("content-type") ?? "",
      disposition: r.headers.get("content-disposition") ?? "",
      bytes: buf, text: buf.toString("latin1"),
    };
  }

  await check("19. Descargar el PDF del documento: es un PDF real y dice lo que debe", async () => {
    const pdf = await fetchPdf(documentPdfHref, asCreator);
    assert(pdf.status === 200, `dio ${pdf.status}`);
    assert(pdf.type.includes("application/pdf"), `content-type: ${pdf.type}`);
    assert(pdf.disposition.includes("attachment"), `no es una descarga: ${pdf.disposition}`);
    assert(pdf.disposition.includes("rev1"), `el nombre no identifica la revisión: ${pdf.disposition}`);
    assert(pdf.bytes.length > 3000, `pesa ${pdf.bytes.length} bytes`);
    assert(pdf.text.startsWith("%PDF-"), "no empieza por la cabecera de un PDF");
    assert(/startxref\n\d+\n%%EOF/.test(pdf.text), "estructura de PDF incompleta");
    const pages = Number(pdf.text.match(/\/Count (\d+)/)?.[1] ?? 0);
    assert(pages >= 1, `páginas: ${pages}`);
    for (const needle of [
      "PR-COM-001", TITULO, "Revisión 1", `Q02 UI ${stamp}`,
      "Beto Revisor", "Carla Aprobadora", "Comprar con criterio",
    ]) {
      assert(pdf.text.includes(needle), `el PDF no contiene «${needle}»`);
    }
    assert(pdf.text.includes(MOTIVO), "el PDF no conserva el motivo de la devolución");
    assert(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.test(pdf.text),
      "el PDF filtra un identificador técnico");
  });

  await check("20. Descargar el PDF de la Lista Maestra: empresa, filtros y fecha", async () => {
    const pdf = await fetchPdf(masterPdfHref, asCreator);
    assert(pdf.status === 200, `dio ${pdf.status}`);
    assert(pdf.type.includes("application/pdf"), `content-type: ${pdf.type}`);
    assert(pdf.disposition.includes("attachment"), `no es una descarga: ${pdf.disposition}`);
    assert(pdf.bytes.length > 2000, `pesa ${pdf.bytes.length} bytes`);
    assert(pdf.text.startsWith("%PDF-"), "no es un PDF");
    assert(pdf.text.includes("Lista maestra de documentos"), "sin título");
    assert(pdf.text.includes(`Q02 UI ${stamp}`), "sin la organización");
    // El título largo se reparte en varias líneas dentro de su columna, así que
    // no aparece como una cadena contigua: se comprueba por el código —que sí
    // cabe entero— y por las palabras del título.
    assert(pdf.text.includes("PR-COM-001"), "el documento no aparece en el PDF de la lista");
    for (const palabra of ["Procedimiento", "compras", stamp]) {
      assert(pdf.text.includes(palabra), `el PDF de la lista no contiene «${palabra}»`);
    }
    // Un nombre completo se reparte en dos líneas dentro de una columna estrecha
    // —16 columnas en A4 apaisado son densas por diseño—, así que se comprueban
    // los nombres de pila, que son los que identifican sin ambigüedad.
    assert(pdf.text.includes("Beto") && pdf.text.includes("Carla"),
      "el PDF de la lista no trae revisor y aprobador");
    assert(pdf.text.includes("Sin filtros"), "no declara los filtros aplicados");
    assert(/Generado el \d{2}\/\d{2}\/\d{4}/.test(pdf.text), "sin fecha de generación");
    assert(/Página 1 de \d+/.test(pdf.text), "sin paginación");
  });

  await check("21. El PDF con filtro declara ESE filtro", async () => {
    const pdf = await fetchPdf(`${masterPdfHref}?lifecycle=effective`, asCreator);
    assert(pdf.status === 200, `dio ${pdf.status}`);
    assert(pdf.text.includes("Estado: Vigente"), "el PDF no declara el filtro aplicado");
  });

  await check("22. El CSV de la Lista Maestra conserva la exportación de datos", async () => {
    const r = await fetch(`${BASE}/quality/documents/master/csv`, { headers: { cookie: asCreator } });
    const bytes = Buffer.from(await r.arrayBuffer());
    assert(r.status === 200, `dio ${r.status}`);
    assert((r.headers.get("content-type") ?? "").includes("text/csv"), r.headers.get("content-type") ?? "");
    // El BOM se comprueba sobre los BYTES: `Response.text()` lo elimina al
    // decodificar, así que mirarlo ahí daría un falso negativo. Sin BOM, Excel
    // en Windows abre «Revisión» como «RevisiÃ³n».
    assert(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf,
      `sin BOM UTF-8: los tres primeros bytes son ${bytes.subarray(0, 3).toString("hex")}`);
    const text = bytes.toString("utf8").replace(/^\uFEFF/, "");
    assert(text.includes("Revisión vigente"), "sin encabezados");
    assert(text.includes(TITULO), "sin el documento");
  });

  // -------------------------------------------------------------------------
  await check("23. Crear la Revisión 2 desde la propia ficha", async () => {
    const r = await get(documentHref, asApprover);
    assert(has(r.body, "Crear nueva revisión"), "no se ofrece crear una revisión nueva");
    const res = await submitForm(documentHref, r.body, "Crear nueva revisión", asApprover, {
      change_note: "Actualización anual",
    });
    assert(res.status < 400, `crear revisión dio ${res.status}`);

    const after = await get(documentHref, asApprover);
    assert(has(after.body, "Revisión 2"), "la revisión no avanzó a 2");
    assert(has(after.body, "Borrador"), "la revisión 2 no nace editable");
    // La revisión 1 sigue en el control de revisión, como histórico.
    const control = sectionAfter(after.body, "Control de revisión", 1500);
    assert(control.includes("Revisión 1"), "la revisión 1 desapareció del historial");
    assert(control.includes("Aprobada"), "la revisión 1 perdió su aprobación");
  });

  await check("24. La Lista Maestra refleja la revisión 2 sin perder la vigente", async () => {
    const r = await get(masterHref, asCreator);
    assert(has(r.body, TITULO), "el documento desapareció de la Lista Maestra");
    // La revisión VIGENTE sigue siendo la 1: la 2 está en borrador.
    assert(has(r.body, "Revisión 1"), "la lista no conserva la revisión vigente");
    assert(has(r.body, "Borrador"), "la lista no refleja que hay una revisión en curso");
  });

  await check("25. Un administrador no puede eliminar un documento con historia", async () => {
    const r = await get(documentHref, asApprover);
    assert(has(r.body, "Este documento no se elimina."), "no se explica por qué no se elimina");
    assert(has(r.body, "retira"), "no se propone retirarlo en su lugar");
    assert(has(r.body, "Retirar documento"), "no se ofrece retirar");
  });

  await check("26. Quality-only: ninguna pantalla del recorrido depende de PCR ni Textiles", async () => {
    for (const path of ["/dashboard", "/trazadocs", "/textiles"]) {
      const r = await get(path, asCreator);
      assert(r.status !== 200, `${path} respondió 200 en una empresa sin ese módulo`);
    }
    // Y todo el recorrido de Quality sigue respondiendo.
    for (const path of [qualityHref, documentsHref, documentHref, masterHref, tasksHref]) {
      const r = await get(path, asCreator);
      assert(r.status === 200, `${path} dio ${r.status} en una empresa quality-only`);
    }
  });

  console.log(`\nQUALITY-02 · recorrido humano: ${passed} correctas, ${failed} fallidas\n`);
  stopServers();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  stopServers();
  process.exit(1);
});
