/**
 * Trazaloop Quality · QUALITY-03 · Recorrido HUMANO automatizado.
 *
 * Reproduce, por HTTP y contra el build de producción, el recorrido del
 * encargo (§53):
 *
 *   login → selector → Quality → Objetivos → crear objetivo con cargo
 *   responsable y proceso → crear indicador manual con meta → registrar
 *   medición → evaluación automática → segundo periodo → tendencia →
 *   crear indicador AUTOMÁTICO → «Calcular ahora» → resultado desde datos
 *   de Quality → ver el objetivo y su desempeño → Mis tareas y alertas →
 *   indicador fuera de meta → alerta → volver al panel
 *
 * Regla del encargo: NO se escriben URLs internas a mano. Cada destino sale
 * del `href` que renderiza la pantalla anterior, y cada acción se envía como
 * el propio formulario de la página.
 *
 * Requisitos: `npm run build` previo y Supabase en marcha.
 * Correr: npm run test:quality03-ui
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
  console.error("Faltan variables para test:quality03-ui (URL, ANON, SERVICE_ROLE).");
  process.exit(1);
}

const PORT = Number(process.env.Q03_PORT ?? 3182);
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
  console.log("\nQUALITY-03 · recorrido humano automatizado\n");
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
    const email = `q03ui-${label}-${stamp}@test.trazaloop.dev`;
    const { data, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name: fullName },
    });
    assert(!error && data.user, `crear ${label}: ${error?.message}`);
    const client = createClient(URL_ENV!, ANON!, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: s, error: e } = await client.auth.signInWithPassword({ email, password });
    assert(!e && s.session, `login ${label}: ${e?.message}`);
    return { id: data.user!.id, name: fullName, client, session: s.session! };
  }

  const owner = await newUser("coord", "Coordinadora de Calidad");
  await owner.client.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "q03-ui" });

  const { data: orgId } = await owner.client.rpc("create_organization", { p_name: `Q03 UI ${stamp}` });
  const org = orgId as string;

  // QUALITY-ONLY (§39): PCR y Textiles deshabilitados a propósito.
  await admin.from("organization_modules")
    .update({ access_mode: "full", access_expires_at: null })
    .eq("organization_id", org).eq("module_code", "quality");
  await admin.from("organization_modules")
    .update({ enabled: false }).eq("organization_id", org).neq("module_code", "quality");

  // El escenario de partida: un cargo con titular y un proceso. Es lo mínimo
  // para que la responsabilidad apunte a un CARGO y el objetivo tenga a qué
  // aplicar; se crea con la sesión real, no con el cliente administrativo.
  const { data: pos } = await owner.client.from("quality_positions")
    .insert({ organization_id: org, name: "Coordinador de Calidad", code: "CC" })
    .select("id").single();
  await owner.client.from("quality_position_assignments").insert({
    organization_id: org, position_id: pos!.id, profile_id: owner.id, assignment_type: "holder",
  });
  await owner.client.from("quality_processes")
    .insert({ organization_id: org, name: `Despachos ${stamp}`, category_code: "core" });

  // Dos documentos de Quality, uno aprobado: le da algo real que medir al
  // indicador automático.
  const docIds: string[] = [];
  for (let i = 1; i <= 2; i += 1) {
    const { data } = await owner.client.from("trazadoc_documents").insert({
      organization_id: org, source_type: "custom", module_key: "quality",
      category_code: "procedure", title: `Procedimiento ${i} ${stamp}`, revision_model: "controlled",
    }).select("id").single();
    docIds.push(data!.id as string);
  }
  const { data: rev } = await owner.client.rpc("trazadoc_create_document_revision", {
    p_document_id: docIds[0], p_change_note: null,
  });
  await owner.client.rpc("trazadoc_submit_document_revision", {
    p_revision_id: rev, p_reviewers: [],
    p_approvers: [{ profile_id: owner.id, position_id: null, step_order: 1 }],
    p_route_mode: "sequential", p_effective_from: null, p_review_due_at: null, p_note: null,
  });
  await owner.client.rpc("trazadoc_record_document_decision", {
    p_revision_id: rev, p_decision: "approved", p_reason: null,
  });

  function cookieFor(s: { access_token: string }, activeOrg: string | null) {
    const b64 = Buffer.from(JSON.stringify(s), "utf8").toString("base64url");
    if (!activeOrg) return `${AUTH_COOKIE}=base64-${b64}`;
    const sig = ORG_SECRET
      ? `.${createHmac("sha256", ORG_SECRET).update(activeOrg).digest("base64url")}`
      : "";
    return `${AUTH_COOKIE}=base64-${b64}; tz-active-org=${activeOrg}${sig}`;
  }
  const cookie = cookieFor(owner.session, org);

  async function get(path: string) {
    const r = await fetch(`${BASE}${path}`, { headers: { cookie }, redirect: "manual" });
    return { status: r.status, location: r.headers.get("location"), body: r.status === 200 ? await r.text() : "" };
  }

  async function submitForm(
    path: string, html: string, marker: string,
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

  const YEAR = new Date().getUTCFullYear();
  const monthPeriod = (m: number) => ({
    start: `${YEAR}-${String(m).padStart(2, "0")}-01`,
    end: new Date(Date.UTC(YEAR, m, 0)).toISOString().slice(0, 10),
    label: `${YEAR}-${String(m).padStart(2, "0")}`,
  });

  let qualityHref = "";
  let objectivesHref = "";
  let indicatorsHref = "";
  let objectiveHref = "";
  let manualHref = "";
  let nativeHref = "";
  let tasksHref = "";

  // -------------------------------------------------------------------------
  await check("1. El selector ofrece Quality y se entra desde ahí", async () => {
    const r = await get("/modules");
    assert(r.status === 200, `/modules dio ${r.status} → ${r.location}`);
    const href = links(r.body).find((l) => l.href === "/quality");
    assert(href, "el selector no ofrece entrar a Quality");
    qualityHref = href!.href;
  });

  await check("2. La portada de Quality lleva a Objetivos e Indicadores", async () => {
    const r = await get(qualityHref);
    assert(r.status === 200, `dio ${r.status} → ${r.location}`);
    objectivesHref = links(r.body).find((l) => l.href === "/quality/objectives")?.href ?? "";
    tasksHref = links(r.body).find((l) => l.href === "/quality/tasks")?.href ?? "";
    assert(objectivesHref === "/quality/objectives", `Objetivos enlaza a ${objectivesHref}`);
    assert(tasksHref === "/quality/tasks", `Mis tareas enlaza a ${tasksHref}`);
  });

  await check("3. Objetivos ofrece crear y lleva a Indicadores", async () => {
    const r = await get(objectivesHref);
    assert(r.status === 200, `dio ${r.status}`);
    assert(has(r.body, "Crear objetivo"), "no se ofrece crear un objetivo");
    indicatorsHref = links(r.body).find((l) => l.href === "/quality/indicators")?.href ?? "";
    assert(indicatorsHref === "/quality/indicators", `Indicadores enlaza a ${indicatorsHref}`);
    assert(has(r.body, "no se escribe a mano"), "no se explica que el desempeño se deriva");
  });

  const OBJETIVO = `Mejorar el desempeño documental ${stamp}`;

  await check("4. Crear el objetivo con cargo responsable y proceso relacionado", async () => {
    const r = await get(objectivesHref);
    const opciones = optionsOf(r.body, "Nuevo objetivo", "owner_position_id");
    const cargo = opciones.find((o) => o.label.includes("Coordinador de Calidad"));
    assert(cargo, `el cargo no está en el desplegable: ${JSON.stringify(opciones)}`);

    // El proceso se marca desde la propia casilla que renderiza la pantalla.
    const procesos = [...r.body.matchAll(/<input[^>]*name="process_id"[^>]*value="([^"]+)"/g)]
      .map((m) => m[1]);
    assert(procesos.length >= 1, "la pantalla no ofrece relacionar procesos");

    const res = await submitForm(objectivesHref, r.body, "Nuevo objetivo", {
      name: OBJETIVO, code: `OBJ-${stamp.slice(-4)}`,
      description: "Objetivo de la prueba de aceptación.",
      owner_position_id: cargo!.value,
      process_id: procesos[0],
      evaluation_rule: "worst_indicator",
    });
    assert(res.status < 400, `crear objetivo dio ${res.status}`);

    const after = await get(objectivesHref);
    assert(has(after.body, OBJETIVO), "el objetivo no aparece en la lista");
    assert(has(after.body, "Coordinador de Calidad"), "no se muestra el cargo responsable");
    assert(has(after.body, "Despachos"), "no se muestra el proceso relacionado");
    objectiveHref = linkByText(after.body, OBJETIVO) ?? "";
    assert(objectiveHref.startsWith("/quality/objectives/"), `el detalle enlaza a ${objectiveHref}`);
  });

  const IND_MANUAL = `Cumplimiento de entregas ${stamp}`;

  await check("5. Crear un indicador MANUAL con meta, unidad y periodicidad", async () => {
    const r = await get(indicatorsHref);
    assert(has(r.body, "Crear indicador"), "no se ofrece crear un indicador");
    const res = await submitForm(indicatorsHref, r.body, "Qué se mide", {
      name: IND_MANUAL, code: `IND-M-${stamp.slice(-4)}`,
      description: "Porcentaje de entregas dentro del plazo comprometido.",
      scope_type: "organization", scope_process_id: "",
      unit_code: "percent", unit_label: "", frequency: "monthly",
      direction: "higher_is_better",
      target_value: "90", warning_value: "85",
      effective_from: `${YEAR}-01-01`,
      target_min: "", target_max: "",
      source_kind: "manual", source_key: "",
      calc_operation: "ratio_percent", component_label: ["", ""], component_key: ["a", "b"],
      formula_text: "",
    });
    assert(res.status < 400, `crear indicador dio ${res.status}`);

    const after = await get(indicatorsHref);
    assert(has(after.body, IND_MANUAL), "el indicador no aparece en la lista");
    assert(has(after.body, "≥ 90 %"), "no se muestra la meta");
    assert(has(after.body, "Mensual"), "no se muestra la periodicidad");
    manualHref = linkByText(after.body, IND_MANUAL) ?? "";
    assert(manualHref.startsWith("/quality/indicators/"), `el detalle enlaza a ${manualHref}`);
  });

  await check("6. Registrar una medición: la evaluación la deriva el sistema", async () => {
    const r = await get(manualHref);
    assert(has(r.body, "Registrar medición"), "no se ofrece registrar una medición");
    // Nada en el formulario permite elegir el veredicto.
    assert(!/name="evaluation"/.test(r.body), "el formulario deja elegir la evaluación");

    const ene = monthPeriod(1);
    const res = await submitForm(manualHref, r.body, "Registrar medición", {
      period_start: ene.start, period_end: ene.end, value: "92",
      data_state: "reported", note: "",
    });
    assert(res.status < 400, `registrar dio ${res.status}`);

    const after = await get(manualHref);
    assert(has(after.body, "Cumple"), "la medición no se evaluó como «cumple»");
    assert(has(after.body, "92 ≥ meta 90"), "no se muestra la explicación de la evaluación");
  });

  await check("7. Un segundo y un tercer periodo dan TENDENCIA", async () => {
    for (const [m, value] of [[2, "94"], [3, "97"]] as [number, string][]) {
      const p = monthPeriod(m);
      const r = await get(manualHref);
      const res = await submitForm(manualHref, r.body, "Registrar medición", {
        period_start: p.start, period_end: p.end, value, data_state: "reported", note: "",
      });
      assert(res.status < 400, `registrar ${p.label} dio ${res.status}`);
    }
    const after = await get(manualHref);
    assert(has(after.body, "Mejora"), "92 → 94 → 97 debería leerse como mejora");
    assert(has(after.body, "Evolución"), "no se muestra la serie");
    // La gráfica existe y la tabla también: los números no dependen del dibujo.
    assert(after.body.includes("<svg"), "no se dibujó la serie");
    assert(has(after.body, "Historial por periodos"), "no está la tabla del historial");
  });

  await check("8. Cero NO es «sin dato»", async () => {
    const abr = monthPeriod(4);
    const r = await get(manualHref);
    await submitForm(manualHref, r.body, "Registrar medición", {
      period_start: abr.start, period_end: abr.end, value: "0", data_state: "reported", note: "",
    });
    const may = monthPeriod(5);
    const r2 = await get(manualHref);
    await submitForm(manualHref, r2.body, "Registrar medición", {
      period_start: may.start, period_end: may.end, value: "", data_state: "no_data", note: "",
    });
    const after = await get(manualHref);
    const historial = sectionAfter(after.body, "Historial por periodos", 3000);
    assert(historial.includes("0 %"), `el cero no se muestra como resultado. Sección: ${historial.slice(0, 300)}`);
    assert(historial.includes("Sin dato"), "el periodo sin medir no se declara");
    assert(historial.includes("No cumple"), "el cero no se evaluó");
  });

  await check("9. Cambiar la meta NO reescribe el pasado", async () => {
    const r = await get(manualHref);
    assert(has(r.body, "Cambiar la meta o la configuración"), "no se ofrece cambiar la meta");
    const res = await submitForm(r.body.includes("effective_from") ? manualHref : manualHref, r.body,
      "Cambiar la meta o la configuración", {
        effective_from: `${YEAR}-07-01`, target_value: "95",
        target_min: "", target_max: "", warning_value: "90",
        change_note: "La dirección eleva la meta",
      });
    assert(res.status < 400, `publicar la meta nueva dio ${res.status}`);

    const after = await get(manualHref);
    const historial = sectionAfter(after.body, "Historial por periodos", 4000);
    // Enero sigue evaluado contra 90 y sigue cumpliendo.
    assert(historial.includes("≥ 90 %"), "enero perdió su meta histórica");
    assert(has(after.body, "no reescribe lo que ya se evaluó"), "no se explica la regla");
  });

  const IND_AUTO = `Cumplimiento documental ${stamp}`;

  await check("10. Crear un indicador AUTOMÁTICO desde el catálogo de la pantalla", async () => {
    const r = await get(indicatorsHref);
    const fuentes = optionsOf(r.body, "De dónde sale el dato", "source_key");
    assert(fuentes.length >= 3, `el catálogo ofrece ${fuentes.length} fuentes`);
    const fuente = fuentes.find((f) => f.label.includes("Cumplimiento documental"));
    assert(fuente, `no está la fuente esperada: ${JSON.stringify(fuentes.map((f) => f.label))}`);

    const res = await submitForm(indicatorsHref, r.body, "Qué se mide", {
      name: IND_AUTO, code: `IND-A-${stamp.slice(-4)}`,
      description: "Se alimenta solo desde los documentos de Quality.",
      scope_type: "organization", scope_process_id: "",
      unit_code: "percent", unit_label: "", frequency: "monthly",
      direction: "higher_is_better",
      target_value: "95", warning_value: "90",
      effective_from: `${YEAR}-01-01`, target_min: "", target_max: "",
      source_kind: "native", source_key: fuente!.value,
      calc_operation: "ratio_percent", component_label: ["", ""], component_key: ["a", "b"],
      formula_text: "",
    });
    assert(res.status < 400, `crear indicador automático dio ${res.status}`);

    const after = await get(indicatorsHref);
    assert(has(after.body, IND_AUTO), "el indicador automático no aparece");
    nativeHref = linkByText(after.body, IND_AUTO) ?? "";
    assert(nativeHref.startsWith("/quality/indicators/"), `enlaza a ${nativeHref}`);
  });

  await check("11. «Calcular ahora»: el resultado sale de los datos de Quality", async () => {
    const r = await get(nativeHref);
    assert(has(r.body, "Calcular desde los datos de Trazaloop"), "no se ofrece calcular");
    // No hay campo para escribir el resultado: eso es lo que lo hace automático.
    assert(!/name="value"/.test(r.body), "el indicador automático ofrece escribir el resultado");
    assert(has(r.body, "Nadie escribe el resultado"), "no se explica que se alimenta solo");

    const ene = monthPeriod(1);
    const res = await submitForm(nativeHref, r.body, "Calcular desde los datos de Trazaloop", {
      period_start: ene.start, period_end: ene.end,
    });
    assert(res.status < 400, `calcular dio ${res.status}`);

    const after = await get(nativeHref);
    // Un documento de dos está vigente: 50 %.
    assert(has(after.body, "50 %"), "el cálculo no dio el resultado esperado");
    assert(has(after.body, "No cumple"), "50 % con meta 95 % debería no cumplir");
    const historial = sectionAfter(after.body, "Historial por periodos", 2000);
    assert(historial.includes("Automático"), "no se declara el origen automático");
    assert(historial.includes("total_active") || historial.includes("effective"),
      `no se muestra el linaje del cálculo. Sección: ${historial.slice(0, 300)}`);
  });

  await check("12. El objetivo muestra su desempeño DERIVADO y explicado", async () => {
    // Se asocian los dos indicadores desde la ficha del objetivo.
    const r = await get(objectiveHref);
    assert(has(r.body, "Qué indicadores lo miden"), "no se ofrece asociar indicadores");
    const casillas = [...r.body.matchAll(/<input[^>]*name="indicator_id"[^>]*value="([^"]+)"/g)]
      .map((m) => m[1]);
    assert(casillas.length >= 2, `${casillas.length} indicadores disponibles`);
    const res = await submitForm(objectiveHref, r.body, "Qué indicadores lo miden", {
      indicator_id: casillas,
    });
    assert(res.status < 400, `asociar indicadores dio ${res.status}`);

    const after = await get(objectiveHref);
    assert(has(after.body, "No cumple"), "el objetivo no refleja el indicador que no cumple");
    assert(has(after.body, "Regla: manda el peor indicador"),
      "no se explica con qué regla se calculó el desempeño");
    assert(has(after.body, IND_MANUAL) && has(after.body, IND_AUTO),
      "no se listan los indicadores del objetivo");
    assert(has(after.body, "Coordinador de Calidad"), "no se muestra el responsable");
  });

  await check("13. Revisar mediciones pendientes crea tarea y alerta", async () => {
    const r = await get(indicatorsHref);
    const res = await submitForm(indicatorsHref, r.body, "Revisar mediciones pendientes", {});
    assert(res.status < 400, `revisar dio ${res.status}`);

    const tareas = await get(tasksHref);
    assert(tareas.status === 200, `Mis tareas dio ${tareas.status}`);
    assert(has(tareas.body, "Medir"), "no apareció ninguna tarea de medición");
    assert(has(tareas.body, "Medición pendiente"), "no apareció la alerta de medición pendiente");
  });

  await check("14. Un indicador fuera de meta genera alerta al responsable", async () => {
    const tareas = await get(tasksHref);
    assert(has(tareas.body, "Indicador fuera de meta"), "no llegó la alerta de meta incumplida");
    assert(has(tareas.body, IND_AUTO), "la alerta no nombra el indicador");
    // Y NO se convierte en una no conformidad.
    assert(!has(tareas.body, "no conformidad"), "se creó una no conformidad automáticamente");
  });

  await check("15. La portada resume el desempeño con datos reales", async () => {
    const r = await get(qualityHref);
    assert(has(r.body, "Desempeño"), "la portada no resume el desempeño");
    assert(has(r.body, "indicador fuera de meta") || has(r.body, "indicadores fuera de meta"),
      "la portada no dice cuántos indicadores están fuera de meta");
    assert(has(r.body, "no es una no conformidad"), "la portada no aclara qué significa");
    assert(has(r.body, "Objetivos e indicadores"), "la portada no ofrece el acceso al desempeño");
  });

  await check("16. Cerrar el ciclo congela los resultados", async () => {
    const r = await get(objectivesHref);
    assert(has(r.body, "Ciclo de gestión"), "no se ofrece cerrar el ciclo");
    const res = await submitForm(objectivesHref, r.body, "Cerrar un periodo", {
      label: `${YEAR} · prueba`, period_start: `${YEAR}-01-01`, period_end: `${YEAR}-06-30`,
      note: "Cierre de la prueba",
    });
    assert(res.status < 400, `cerrar dio ${res.status}`);

    const after = await get(objectivesHref);
    assert(has(after.body, `${YEAR} · prueba`), "el cierre no aparece");
    assert(has(after.body, "Cerrado el"), "no se dice cuándo se cerró");

    // Y ahora el periodo cerrado no admite mediciones nuevas.
    const ind = await get(manualHref);
    const jun = monthPeriod(6);
    const denied = await submitForm(manualHref, ind.body, "Registrar medición", {
      period_start: jun.start, period_end: jun.end, value: "80", data_state: "reported", note: "",
    });
    assert(denied.status < 400, `la petición falló con ${denied.status}`);
    const afterDenied = await get(manualHref);
    const historial = sectionAfter(afterDenied.body, "Historial por periodos", 4000);
    assert(!historial.includes(`${YEAR}-06`), "se registró una medición en un periodo cerrado");
  });

  await check("17. Quality-only: nada del recorrido depende de PCR ni Textiles", async () => {
    for (const path of ["/dashboard", "/trazadocs", "/textiles"]) {
      const r = await get(path);
      assert(r.status !== 200, `${path} respondió 200 en una empresa sin ese módulo`);
    }
    for (const path of [qualityHref, objectivesHref, indicatorsHref, objectiveHref, manualHref, nativeHref, tasksHref]) {
      const r = await get(path);
      assert(r.status === 200, `${path} dio ${r.status} en una empresa quality-only`);
    }
  });

  console.log(`\nQUALITY-03 · recorrido humano: ${passed} correctas, ${failed} fallidas\n`);
  stopServers();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  stopServers();
  process.exit(1);
});
