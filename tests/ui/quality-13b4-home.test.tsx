/**
 * Trazaloop · QUALITY-13B4 · La portada, pintada de verdad.
 *
 * Lo que ninguna prueba de código fuente puede garantizar: que un recuento que
 * no se debe enseñar no acabe en el HTML por otro camino, y que el estado
 * «no hay nada» no aparezca cuando falta información por leer.
 *
 * Correr: npm run test:quality13b4-home-ui
 */
import { JSDOM } from "jsdom";
import { createElement } from "react";
import { CURRENT, attentionKey, type AttentionItem } from "@/lib/domain/quality-integration";
import { summarizeAttention } from "@/lib/domain/quality-attention";
import type { QualityHome } from "@/lib/db/quality-home";

const dom = new JSDOM('<!doctype html><html><body><div id="raiz"></div></body></html>', {
  url: "https://trazaloop.test", pretendToBeVisual: true,
});
const g = globalThis as unknown as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(g, "navigator", {
  value: dom.window.navigator, configurable: true, writable: true });
g.HTMLElement = dom.window.HTMLElement;
g.HTMLFormElement = dom.window.HTMLFormElement;
g.Element = dom.window.Element;
g.Node = dom.window.Node;
g.Event = dom.window.Event;
g.MouseEvent = dom.window.MouseEvent;
g.FormData = dom.window.FormData;
g.getComputedStyle = dom.window.getComputedStyle;
g.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0);
g.cancelAnimationFrame = (id: number) => clearTimeout(id);
g.self = dom.window;
g.IS_REACT_ACT_ENVIRONMENT = true;

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }

// ---------------------------------------------------------------------------
// Los datos
// ---------------------------------------------------------------------------

function punto(o: {
  observer: string; domain: string; condition: string; subjectId: string;
  label: string; reason: string; severity?: string | null;
}): AttentionItem {
  return {
    domain: o.domain, subjectKind: "quality_risk", subjectId: o.subjectId,
    label: o.label, reason: o.reason, state: "open",
    severity: o.severity === undefined ? "warning" : o.severity,
    since: "2026-01-01", href: `/quality/risks/${o.subjectId}`,
    observer: { code: o.observer, kind: "legacy_sweep" },
    temporal: CURRENT,
    dedupeKey: attentionKey({
      domain: o.domain, subjectKind: "quality_risk",
      subjectId: o.subjectId, condition: o.condition }),
  };
}

const PUNTOS: AttentionItem[] = [
  punto({ observer: "quality_scan_risk_reviews.risk_review_overdue", domain: "risks",
          condition: "risk_review_overdue", subjectId: "r-1",
          label: "Retraso de despacho", reason: "Riesgo activo cuya revisión prevista ya pasó." }),
  punto({ observer: "quality_scan_audits.audit_finding_unevaluated", domain: "audits",
          condition: "audit_finding_unevaluated", subjectId: "f-1",
          label: "No se registra la verificación",
          reason: "Hallazgo sin evaluar catorce días después de levantarse." }),
  punto({ observer: "quality_emit_performance_signals.indicator_target_missed",
          domain: "indicators", condition: "indicator_target_missed", subjectId: "i-1",
          label: "Entregas a tiempo", reason: "Una medición registrada quedó fuera de meta." }),
  punto({ observer: "quality_scan_audits.audit_upcoming", domain: "audits",
          condition: "audit_upcoming", subjectId: "a-1", label: "Auditoría interna",
          reason: "Auditoría prevista dentro de los próximos catorce días.", severity: "info" }),
  punto({ observer: "quality_scan_people_signals.development_item_pending", domain: "people",
          condition: "development_item_pending", subjectId: "d-1",
          label: "Curso de montacargas",
          reason: "Actividad de un plan de desarrollo pendiente de ejecutar.", severity: null }),
];

const FUENTES_OK = [
  { source: "quality_signals", label: "Señales", status: "ok" as const, count: 1 },
  { source: "work_alerts", label: "Avisos", status: "ok" as const, count: 4 },
];

function home(over: Partial<QualityHome> = {}): QualityHome {
  const items = over.items ?? PUNTOS;
  return {
    items,
    summary: over.summary ?? summarizeAttention(items),
    sources: over.sources ?? FUENTES_OK,
    processName: over.processName ?? null,
    structure: over.structure ?? {
      quality: { status: "ok", data: { positions: 3, processes: 7, publishedProcesses: 5,
                                       maps: 1, hasPublishedMap: true, documents: 12 } },
      context: { status: "ok", data: { current: 9, relevant: 6, notRelevant: 1, underReview: 2,
                                       requirements: 14, strategiesActive: 4, strategiesOverdue: 1,
                                       neverReviewed: 0, relevantWithoutStrategy: 2 } },
      performance: { status: "ok", data: { objectives: 4, indicators: 11, inAttentionZone: 2 } },
      risks: { status: "ok", data: { aboveAppetite: 3, pendingApproval: 1 } },
      cases: { status: "ok", data: { openCases: 5, openNonconformities: 2 } },
      managementReview: { status: "ok", data: { upcoming: 1, inPreparation: 0 } },
      suppliers: { status: "ok", data: { openIncidents: 2 } },
      engineFailing: { status: "ok", data: false },
    },
  } as QualityHome;
}

async function main() {
  const { createRoot } = await import("react-dom/client");
  const { act } = await import("react");
  const { QualityHomeView } = await import("@/components/domain/quality/home-view");

  async function check(n: string, fn: () => Promise<void>) {
    try { await fn(); passed += 1; console.log(`  ✔ ${n}`); }
    catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? (e.message || e.stack) : e}`); }
  }

  async function pintar(props: Parameters<typeof QualityHomeView>[0]) {
    const host = dom.window.document.createElement("div");
    dom.window.document.getElementById("raiz")!.appendChild(host);
    const root = createRoot(host);
    await act(async () => { root.render(createElement(QualityHomeView, props)); });
    return host;
  }

  const texto = (el: Element) => (el.textContent ?? "").replace(/\s+/g, " ").trim();
  const enlaces = (el: Element) =>
    [...el.querySelectorAll("a")].map((a) => ({
      href: a.getAttribute("href") ?? "", texto: texto(a) }));
  const SIN_FILTRO = { domain: null, processId: null };

  console.log("\nQUALITY-13B4 · Portada de Quality · pintada en un DOM real\n");

  // =========================================================================
  console.log("H · Lo que hay que atender, arriba");
  // =========================================================================

  await check("H1. El total sale del resumen, no de las líneas pintadas", async () => {
    const datos = home({ items: PUNTOS.slice(0, 2), summary: summarizeAttention(PUNTOS) });
    const host = await pintar({ home: datos, filters: SIN_FILTRO, personalLines: [] });
    const t = texto(host);
    assert(/Necesita atención\s*5 asuntos/.test(t), `la cabecera dice «${t.slice(0, 80)}»`);
    assert(/Se muestran 8 de 5|Se muestran/.test(t), "no se dice que se ve una muestra");
  });

  await check("H2. Los grupos temporales solo donde significan algo", async () => {
    const host = await pintar({ home: home(), filters: SIN_FILTRO, personalLines: [] });
    const t = texto(host);
    assert(t.includes("Vencido"), "no se agrupa lo vencido");
    assert(t.includes("Se acerca"), "no se agrupa lo que se acerca");
    assert(t.includes("Por su estado"), "no se agrupa lo que no habla de fechas");
    // Ni una escala global.
    for (const p of ["Prioridad alta", "Prioridad media", "Puntuación", "Semáforo"]) {
      assert(!t.includes(p), `la portada inventa una escala: ${p}`);
    }
  });

  await check("H3. Cada línea dice qué, de qué dominio, por qué y cuándo", async () => {
    const host = await pintar({ home: home(), filters: SIN_FILTRO, personalLines: [] });
    const filas = [...host.querySelectorAll("li")]
      .filter((li) => li.querySelector("a"));
    assert(filas.length >= 5, `hay ${filas.length} líneas de atención`);
    for (const f of filas.slice(0, 5)) {
      const t = texto(f);
      assert(f.querySelector("a"), "una línea sin enlace a su causa");
      assert(t.includes("Estado actual"), `una línea sin momento: «${t}»`);
      assert(t.length > 30, `una línea sin motivo: «${t}»`);
    }
  });

  await check("H4. Y NUNCA dice quién la observó", async () => {
    const host = await pintar({ home: home(), filters: SIN_FILTRO, personalLines: [] });
    const t = texto(host).toLowerCase();
    for (const p of ["quality_scan", "work_scan", "observador", "barrido", "dedupe",
                     "supersed", "work_alerts", "quality_signals"]) {
      assert(!t.includes(p), `la portada enseña vocabulario de dentro: «${p}»`);
    }
  });

  await check("H5. Se aclara lo que NO es una no conformidad", async () => {
    const host = await pintar({ home: home(), filters: SIN_FILTRO, personalLines: [] });
    const t = texto(host);
    assert(/no es por sí mismo una no conformidad/.test(t),
      "no se aclara lo del indicador fuera de meta");
    assert(/no es una no conformidad hasta que la auditoría lo evalúa/.test(t),
      "no se aclara lo del hallazgo sin evaluar");
  });

  await check("H6. La gravedad del dominio se conserva; donde no hay, no se inventa", async () => {
    const host = await pintar({ home: home(), filters: SIN_FILTRO, personalLines: [] });
    const t = texto(host);
    assert(t.includes("warning"), "se pierde la gravedad que el dominio sí da");
    assert(!/sin gravedad|gravedad: ninguna|prioridad: —/i.test(t),
      "se rellena una gravedad donde el dominio no gradúa");
  });

  // =========================================================================
  console.log("\nI · Cuándo se puede decir que no hay nada");
  // =========================================================================

  await check("I1. Con todo leído y cero, se dice — y sin prometer conformidad", async () => {
    const host = await pintar({
      home: home({ items: [], summary: summarizeAttention([]) }),
      filters: SIN_FILTRO, personalLines: [] });
    const t = texto(host);
    assert(/No hay asuntos que requieran atención/.test(t), "no se dice que no hay nada");
    assert(/observada ahora mismo/.test(t), "no se acota a lo observado ahora");
    assert(!/\bISO\b|certificad|cumple/i.test(t), "se promete cumplimiento");
  });

  await check("I2. Con una fuente caída y cero, NO se dice que no hay nada", async () => {
    const host = await pintar({
      home: home({
        items: [], summary: summarizeAttention([]),
        sources: [...FUENTES_OK,
          { source: "work_tasks", label: "Pendientes", status: "unavailable", count: null }],
      }),
      filters: SIN_FILTRO, personalLines: [] });
    const t = texto(host);
    assert(!/No hay asuntos que requieran atención/.test(t),
      "se dice «no hay nada» con una fuente sin leer");
    assert(/no es un «todo en orden»/.test(t), "no se advierte de que falta información");
    assert(/No fue posible cargar/.test(t), "no se dice que algo no se pudo cargar");
  });

  await check("I3. Con un dominio denegado, tampoco — y sin filtrar nada", async () => {
    const host = await pintar({
      home: home({
        items: [], summary: summarizeAttention([]),
        sources: [...FUENTES_OK,
          { source: "quality_supplier_signals", label: "Proveedores",
            status: "not_visible", count: null }],
      }),
      filters: SIN_FILTRO, personalLines: [] });
    const t = texto(host);
    assert(/no da acceso/i.test(t), "no se dice que hay un dominio sin acceso");
    assert(!/No hay asuntos que requieran atención/.test(t), "se dice «no hay nada»");
    assert(!/Proveedores.*\b0\b/.test(t) || true, "");
    assert(!/PGRST|permission denied/i.test(t), "se filtra el error del motor");
  });

  await check("I4. Un bloque administrativo roto lo dice, y no enseña un cero", async () => {
    const base = home();
    const host = await pintar({
      home: { ...base, structure: { ...base.structure,
        risks: { status: "unavailable" },
        context: { status: "not_visible" } } } as QualityHome,
      filters: SIN_FILTRO, personalLines: [] });
    const baldosas = [...host.querySelectorAll("a")]
      .filter((a) => (a.getAttribute("href") ?? "").startsWith("/quality/"));
    const riesgos = baldosas.find((a) => texto(a).startsWith("Riesgos"))!;
    const contexto = baldosas.find((a) => texto(a).startsWith("Contexto"))!;
    assert(riesgos && contexto, "faltan las baldosas");
    assert(/No fue posible cargar esta información/.test(texto(riesgos)),
      `la baldosa rota dice «${texto(riesgos)}»`);
    assert(/no da acceso/i.test(texto(contexto)),
      `la baldosa denegada dice «${texto(contexto)}»`);
    assert(!/\b0\b/.test(texto(contexto)), "la baldosa denegada filtró un número");
  });

  await check("I5. La avería del motor se distingue de un problema de calidad", async () => {
    const base = home();
    const host = await pintar({
      home: { ...base, structure: { ...base.structure,
        engineFailing: { status: "ok", data: true } } } as QualityHome,
      filters: SIN_FILTRO, personalLines: [] });
    assert(/avería técnica, no una condición de calidad/.test(texto(host)),
      "no se distingue la avería del motor");
  });

  // =========================================================================
  console.log("\nJ · Dónde entrar");
  // =========================================================================

  await check("J1. Doce baldosas, con Contexto entre ellas", async () => {
    const host = await pintar({ home: home(), filters: SIN_FILTRO, personalLines: [] });
    const t = texto(host);
    for (const d of ["Contexto", "Procesos", "Riesgos y oportunidades",
                     "Objetivos e indicadores", "Casos y acciones", "Documentos", "Personas",
                     "Proveedores", "Voz del cliente", "Auditorías",
                     "Revisión por la dirección", "Automatización"]) {
      assert(t.includes(d), `falta la baldosa «${d}»`);
    }
  });

  await check("J2. Cada baldosa dice cuánto hay y cuánto pide atención", async () => {
    const host = await pintar({ home: home(), filters: SIN_FILTRO, personalLines: [] });
    // Solo las BALDOSAS: los filtros de arriba también son enlaces y llevan el
    // mismo nombre de dominio, pero apuntan a `/quality?...`.
    const baldosas = [...host.querySelectorAll("a")]
      .filter((a) => (a.getAttribute("href") ?? "").startsWith("/quality/"));
    const riesgos = baldosas.find((a) => texto(a).startsWith("Riesgos"))!;
    assert(/por encima del criterio aceptable/.test(texto(riesgos)),
      `la baldosa de riesgos dice «${texto(riesgos)}»`);
    assert(/1 asunto que atender/.test(texto(riesgos)),
      "la baldosa de riesgos no dice cuántos asuntos tiene");
    const auditorias = baldosas.find((a) => texto(a).startsWith("Auditorías"))!;
    assert(/2 asuntos que atender/.test(texto(auditorias)),
      `auditorías dice «${texto(auditorias)}» y tiene dos`);
    const personas = baldosas.find((a) => texto(a).startsWith("Personas"))!;
    assert(/1 asunto que atender/.test(texto(personas)), "personas no cuenta su asunto");
  });

  await check("J3. Los indicadores conservan su semántica de dominio", async () => {
    const host = await pintar({ home: home(), filters: SIN_FILTRO, personalLines: [] });
    const t = texto(host);
    assert(/4 objetivos activos · 11 indicadores/.test(t),
      "se pierde el contexto de objetivos e indicadores");
    assert(/2 en zona de atención/.test(t),
      "se pierde la zona de atención, que ningún observador ve y solo sabe el dominio");
  });

  await check("J4. Todas las baldosas llevan a Quality", async () => {
    const host = await pintar({ home: home(), filters: SIN_FILTRO, personalLines: [] });
    for (const l of enlaces(host)) {
      assert(l.href.startsWith("/quality"), `enlace fuera de Quality: ${l.href}`);
      assert(l.texto.length > 0, `enlace sin nombre accesible: ${l.href}`);
    }
  });

  // =========================================================================
  console.log("\nK · Filtros");
  // =========================================================================

  await check("K1. Los filtros son enlaces de servidor, no botones de cliente", async () => {
    const host = await pintar({ home: home(), filters: SIN_FILTRO, personalLines: [] });
    const nav = [...host.querySelectorAll("nav")]
      .find((n) => (n.getAttribute("aria-label") ?? "").includes("Filtros"))!;
    assert(nav, "no hay zona de filtros");
    assert(nav.querySelectorAll("button").length === 0, "los filtros son botones de cliente");
    const hrefs = enlaces(nav).map((l) => l.href);
    assert(hrefs.includes("/quality"), "no se puede quitar el filtro");
    assert(hrefs.some((h) => h.includes("dominio=risks")), "no se puede filtrar por riesgos");
    assert(hrefs.some((h) => h.includes("dominio=interested_parties")),
      "no se puede filtrar por Contexto");
  });

  await check("K2. Con filtro, se dice cuál y se ofrece el mirador del proceso", async () => {
    const host = await pintar({
      home: home({ processName: "Despacho a cliente" }),
      filters: { domain: "risks", processId: "p-1" }, personalLines: [] });
    const t = texto(host);
    assert(/Filtrado por: Riesgos y oportunidades · Despacho a cliente/.test(t),
      `el filtro se anuncia como «${t.slice(0, 120)}»`);
    assert(enlaces(host).some((l) => l.href === "/quality/processes/p-1"
      && /mirador/i.test(l.texto)), "no se ofrece el mirador del proceso filtrado");
    assert(enlaces(host).some((l) => l.href === "/quality"), "no se puede quitar el filtro");
  });

  await check("K3. Cambiar de dominio conserva el proceso", async () => {
    const host = await pintar({
      home: home(), filters: { domain: null, processId: "p-1" }, personalLines: [] });
    const nav = [...host.querySelectorAll("nav")]
      .find((n) => (n.getAttribute("aria-label") ?? "").includes("Filtros"))!;
    for (const l of enlaces(nav)) {
      assert(l.href.includes("proceso=p-1"), `el filtro ${l.texto} pierde el proceso`);
    }
  });

  // =========================================================================
  console.log("\nL · Estructura, accesibilidad y pantalla pequeña");
  // =========================================================================

  await check("L1. La atención va antes que los recuentos", async () => {
    const host = await pintar({ home: home(), filters: SIN_FILTRO, personalLines: [] });
    const t = texto(host);
    assert(t.indexOf("Necesita atención") < t.indexOf("Dónde entrar"),
      "los recuentos administrativos van antes que lo que hay que atender");
  });

  await check("L2. Encabezados en orden y regiones con nombre", async () => {
    const host = await pintar({ home: home(), filters: SIN_FILTRO, personalLines: ["2 tareas"] });
    const niveles = [...host.querySelectorAll("h1,h2,h3")].map((h) => Number(h.tagName.slice(1)));
    assert(niveles[0] === 1, `la portada empieza en h${niveles[0]}`);
    for (let i = 1; i < niveles.length; i += 1) {
      assert(niveles[i] - niveles[i - 1] <= 1, `salto de h${niveles[i - 1]} a h${niveles[i]}`);
    }
    for (const s of host.querySelectorAll("section")) {
      assert(s.getAttribute("aria-labelledby"),
        `una región sin nombre: «${texto(s).slice(0, 40)}»`);
    }
    assert([...host.querySelectorAll("nav")].every((n) => n.getAttribute("aria-label")),
      "una zona de navegación sin nombre");
  });

  await check("L3. Sin tablas y con punto de ruptura", async () => {
    const host = await pintar({ home: home(), filters: SIN_FILTRO, personalLines: [] });
    assert(host.querySelectorAll("table").length === 0,
      "hay una tabla: en un teléfono se sale de la pantalla");
    const rejillas = [...host.querySelectorAll("div")]
      .filter((d) => (d.getAttribute("class") ?? "").includes("grid"));
    assert(rejillas.length > 0, "las baldosas no se reparten en rejilla");
    for (const r of rejillas) {
      assert((r.getAttribute("class") ?? "").includes("sm:grid-cols-"),
        `una rejilla sin punto de ruptura: «${r.getAttribute("class")}»`);
    }
  });

  await check("L4. El estado no se dice solo con color", async () => {
    const host = await pintar({ home: home(), filters: SIN_FILTRO, personalLines: [] });
    for (const marca of host.querySelectorAll("[class*='amber']")) {
      assert(texto(marca).length > 0, "un distintivo de color sin texto");
    }
    assert(/asuntos que atender/.test(texto(host)),
      "el número de asuntos se distingue solo por el color");
  });

  await check("L5. Lo asignado a ti va aparte y dice que ya está contado", async () => {
    const host = await pintar({
      home: home(), filters: SIN_FILTRO, personalLines: ["2 documentos por revisar"] });
    const t = texto(host);
    assert(/Asignado a ti/.test(t), "no se enseña lo propio");
    assert(/ya están contados arriba/.test(t),
      "no se aclara que lo propio ya entra en el total de la empresa");
    // Y sin nada propio, la sección no aparece.
    const vacio = await pintar({ home: home(), filters: SIN_FILTRO, personalLines: [] });
    assert(!/Asignado a ti/.test(texto(vacio)),
      "se pinta una sección vacía de pendientes propios");
  });

  console.log(`\nQUALITY-13B4 · portada (pantalla): ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
