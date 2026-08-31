/**
 * Trazaloop · PE-02B3 · La FAQ, pintada de verdad.
 *
 * Lo que solo se ve en un DOM: que el buscador tenga nombre accesible, que el
 * tema activo se anuncie, que los cuatro vacíos se distingan, y que una
 * respuesta no se pinte con jerga interna de módulos.
 *
 * Correr: npm run test:pe02b3-faq-ui
 */
import { JSDOM } from "jsdom";
import { createElement } from "react";

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

const RESPUESTA = {
  slug: "que_es_trazaloop",
  categoryCode: "primeros_pasos",
  categoryLabel: "Primeros pasos",
  question: "¿Qué es Trazaloop?",
  answerShort: "Una plataforma con varios módulos que comparten una sola cuenta.",
  answerLong: null as string | null,
  isFeatured: true,
  moduleKeys: [] as string[],
  publishedAt: "2026-08-31T00:00:00Z",
};

async function main() {
  const { createRoot } = await import("react-dom/client");
  const { act } = await import("react");
  const { FaqSearch, FaqCategoryNav, FaqAnswerCard, FaqEmptyState } =
    await import("@/components/domain/faq/faq-reader");

  async function check(n: string, fn: () => Promise<void>) {
    try { await fn(); passed += 1; console.log(`  ✔ ${n}`); }
    catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
  }
  async function pintar(node: React.ReactElement) {
    const host = dom.window.document.createElement("div");
    dom.window.document.getElementById("raiz")!.appendChild(host);
    const root = createRoot(host);
    await act(async () => { root.render(node); });
    return host;
  }
  const texto = (el: Element) => (el.textContent ?? "").replace(/\s+/g, " ").trim();

  console.log("\nPE-02B3 · La FAQ · pintada en un DOM real\n");

  // =========================================================================
  console.log("A · El buscador");
  // =========================================================================

  await check("A1. Tiene nombre accesible y se anuncia como búsqueda", async () => {
    const host = await pintar(createElement(FaqSearch, {
      action: "/faq", defaultValue: "", categoryCode: null, moduleKey: null }));
    const form = host.querySelector("form");
    assert(form?.getAttribute("role") === "search", "no se anuncia como búsqueda");
    const input = host.querySelector('input[type="search"]');
    assert(input, "no hay campo de búsqueda");
    assert((input!.getAttribute("aria-label") ?? "").length > 5,
      "el campo no tiene nombre accesible");
    assert(host.querySelector(".sr-only"), "no hay etiqueta para lectores de pantalla");
    assert(host.querySelector('button[type="submit"]'), "no se puede enviar");
  });

  await check("A2. Buscar dentro de un tema conserva el tema", async () => {
    const host = await pintar(createElement(FaqSearch, {
      action: "/faq", defaultValue: "hola", categoryCode: "soporte", moduleKey: "quality" }));
    const ocultos = [...host.querySelectorAll('input[type="hidden"]')]
      .map((i) => [i.getAttribute("name"), i.getAttribute("value")]);
    assert(ocultos.some(([n, v]) => n === "tema" && v === "soporte"),
      "buscar perdería el tema en el que estabas");
    assert(ocultos.some(([n, v]) => n === "modulo" && v === "quality"),
      "buscar perdería el filtro de módulo");
    const input = host.querySelector('input[type="search"]') as HTMLInputElement;
    assert(input.getAttribute("value") === "hola" || input.value === "hola",
      "el campo no conserva lo que se buscó");
  });

  // =========================================================================
  console.log("\nB · Los temas");
  // =========================================================================

  const CATS = [
    { code: "primeros_pasos", label: "Primeros pasos", entries: 4 },
    { code: "soporte", label: "Soporte", entries: 2 },
  ];

  await check("B1. Son enlaces, no pestañas mudas", async () => {
    const host = await pintar(createElement(FaqCategoryNav, {
      base: "/faq", categories: CATS, active: null, search: "" }));
    const nav = host.querySelector("nav");
    assert((nav?.getAttribute("aria-label") ?? "").includes("Temas"),
      "la lista de temas no se anuncia");
    const enlaces = host.querySelectorAll("a");
    assert(enlaces.length === CATS.length + 1, `hay ${enlaces.length} enlaces y deberían ser 3`);
    assert(texto(enlaces[0]) === "Todas", "falta «Todas»");
    assert(enlaces[0].getAttribute("href") === "/faq", "«Todas» no vuelve a la lista entera");
  });

  await check("B2. El tema activo se anuncia, y no solo con color", async () => {
    const host = await pintar(createElement(FaqCategoryNav, {
      base: "/faq", categories: CATS, active: "soporte", search: "" }));
    const activo = [...host.querySelectorAll("a")]
      .find((a) => a.getAttribute("aria-current") === "page");
    assert(activo, "ningún tema se anuncia como el actual");
    assert(texto(activo!).startsWith("Soporte"), `el activo es «${texto(activo!)}»`);
    assert((activo!.getAttribute("class") ?? "").includes("font-medium"),
      "el tema activo se distingue solo por color");
  });

  await check("B3. Cada tema dice cuántas preguntas tiene", async () => {
    const host = await pintar(createElement(FaqCategoryNav, {
      base: "/faq", categories: CATS, active: null, search: "" }));
    assert(texto(host).includes("Primeros pasos 4"), "no se ve la cuenta del tema");
  });

  await check("B4. Cambiar de tema conserva la búsqueda", async () => {
    const host = await pintar(createElement(FaqCategoryNav, {
      base: "/faq", categories: CATS, active: null, search: "contraseña" }));
    const soporte = [...host.querySelectorAll("a")].find((a) => texto(a).startsWith("Soporte"));
    assert((soporte?.getAttribute("href") ?? "").includes("q=contrase"),
      "elegir un tema tiraría lo que se estaba buscando");
  });

  // =========================================================================
  console.log("\nC · Una respuesta en la lista");
  // =========================================================================

  await check("C1. Es un encabezado con enlace a su dirección estable", async () => {
    const host = await pintar(createElement(FaqAnswerCard, {
      answer: RESPUESTA, base: "/faq" }));
    const h3 = host.querySelector("h3");
    assert(h3, "la respuesta no lleva encabezado");
    const a = h3!.querySelector("a");
    assert(a?.getAttribute("href") === "/faq/que_es_trazaloop",
      `enlaza a ${a?.getAttribute("href")}`);
    assert(texto(host).includes("¿Qué es Trazaloop?"), "no se ve la pregunta");
    assert(texto(host).includes("varios módulos"), "no se ve la respuesta");
  });

  await check("C2. Los módulos se dicen por su NOMBRE, nunca por su clave", async () => {
    const host = await pintar(createElement(FaqAnswerCard, {
      answer: { ...RESPUESTA, moduleKeys: ["cpr", "quality"] }, base: "/faq" }));
    const t = texto(host);
    assert(t.includes("Trazaloop PCR"), "no se ve el nombre del módulo");
    assert(t.includes("Trazaloop Quality"), "no se ve el segundo módulo");
    for (const clave of ["cpr", "traceability_6632", "quality_key"]) {
      assert(!new RegExp(`\\b${clave}\\b`).test(t), `se enseña la clave interna «${clave}»`);
    }
  });

  await check("C3. Una clave desconocida no pinta un hueco raro", async () => {
    const host = await pintar(createElement(FaqAnswerCard, {
      answer: { ...RESPUESTA, moduleKeys: ["modulo_que_no_existe"] }, base: "/faq" }));
    assert(!texto(host).includes("modulo_que_no_existe"),
      "se pinta una clave que no está en el catálogo");
  });

  await check("C4. Y no se filtra procedencia editorial", async () => {
    const host = await pintar(createElement(FaqAnswerCard, {
      answer: RESPUESTA, base: "/faq" }));
    const t = texto(host).toLowerCase();
    for (const p of ["verificad", "se apoya", "salvedad", "revisión", "borrador"]) {
      assert(!t.includes(p), `la tarjeta filtra «${p}»`);
    }
  });

  // =========================================================================
  console.log("\nD · Los cuatro vacíos");
  // =========================================================================

  await check("D1. Cada uno dice algo distinto", async () => {
    const vistos = new Set<string>();
    for (const caso of ["nothing_published", "no_search_results",
      "empty_category", "unavailable"] as const) {
      const host = await pintar(createElement(FaqEmptyState, { outcome: caso }));
      const t = texto(host);
      assert(t.length > 20, `«${caso}» no dice nada`);
      assert(!vistos.has(t), `«${caso}» dice lo mismo que otro caso`);
      vistos.add(t);
    }
  });

  await check("D2. La avería NO se lee como ausencia de contenido", async () => {
    const host = await pintar(createElement(FaqEmptyState, { outcome: "unavailable" }));
    const t = texto(host);
    assert(t.includes("temporal"), "no se dice que es temporal");
    assert(!/no encontramos|no hay preguntas|no hay resultados/i.test(t),
      "una avería se cuenta como que no hay respuestas");
    // Y se ve distinta: aviso, no vacío.
    assert((host.querySelector("div")?.getAttribute("class") ?? "").includes("amber"),
      "la avería se pinta igual que un vacío normal");
  });

  await check("D3. Todos se anuncian a un lector de pantalla", async () => {
    for (const caso of ["nothing_published", "no_search_results",
      "empty_category", "unavailable"] as const) {
      const host = await pintar(createElement(FaqEmptyState, { outcome: caso }));
      assert(host.querySelector('[role="status"]'), `«${caso}» no se anuncia`);
    }
  });

  await check("D4. Y con resultados no se pinta ningún vacío", async () => {
    const host = await pintar(createElement(FaqEmptyState, { outcome: "ok" }));
    assert(texto(host) === "", "se pinta un vacío cuando sí hay resultados");
  });

  console.log(`\nPE-02B3 · FAQ (pantalla): ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
