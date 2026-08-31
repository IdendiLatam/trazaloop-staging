/**
 * Trazaloop · PE-02B6.2 · El documento legal, pintado de verdad.
 *
 * El intérprete se comprueba aparte, sobre su árbol. Aquí se comprueba lo
 * único que no se puede comprobar sobre un árbol: qué llega al navegador.
 *
 * Que un `<script>` escrito dentro del documento salga como TEXTO no es una
 * afirmación sobre el diseño, es un hecho que hay que ver en el DOM. Y que la
 * tabla lleve su propio contenedor de desplazamiento tampoco se ve en el árbol.
 *
 * Correr: npm run test:pe02b62-legal-ui
 */
import { JSDOM } from "jsdom";
import { createElement } from "react";
import { readFileSync } from "node:fs";

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

const BORRADOR = readFileSync("docs/legal/V1.1.0_PRIVACY_POLICY_SUCCESSOR_DRAFT.md", "utf8");

/** La política vigente: texto plano, cinco puntos numerados. */
const V1 = `Esta es una versión preliminar de la política de privacidad de Trazaloop, publicada para la beta / lanzamiento controlado de Trazaloop CPR.

1. Trazaloop recopila los datos que registras dentro de la plataforma con el único fin de operar el servicio para tu organización.

2. Usamos tu información para operar la plataforma y brindarte soporte técnico.

3. No compartimos tus datos con terceros salvo cuando la ley lo exija.

4. Puedes solicitar información sobre tus datos desde el Centro de soporte.

5. Este documento es una versión preliminar y puede actualizarse.`;

async function main() {
  const { createRoot } = await import("react-dom/client");
  const { act } = await import("react");
  const { LegalContent } = await import("@/components/legal/legal-content");

  async function check(n: string, fn: () => Promise<void>) {
    try { await fn(); passed += 1; console.log(`  ✔ ${n}`); }
    catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
  }
  async function pintar(content: string) {
    const host = dom.window.document.createElement("div");
    dom.window.document.getElementById("raiz")!.appendChild(host);
    const root = createRoot(host);
    await act(async () => { root.render(createElement(LegalContent, { content })); });
    return host;
  }
  const texto = (el: Element) => (el.textContent ?? "").replace(/\s+/g, " ").trim();

  console.log("\nPE-02B6.2 · El documento legal, en un DOM real\n");

  // =========================================================================
  console.log("A · La política vigente sigue viéndose bien");
  // =========================================================================

  await check("A1. El texto plano se pinta entero, en párrafos de verdad", async () => {
    const host = await pintar(V1);
    const t = texto(host);
    assert(t.includes("versión preliminar de la política de privacidad"),
      "se perdió el primer párrafo");
    assert(t.includes("Centro de soporte"), "se perdió el punto 4");
    assert(host.querySelectorAll("p").length >= 1, "no se pintó ningún párrafo");
  });

  await check("A2. Y los cinco puntos numerados se pintan como UNA lista", async () => {
    const host = await pintar(V1);
    const listas = host.querySelectorAll("ol");
    assert(listas.length === 1, `se pintaron ${listas.length} listas y debía ser una`);
    assert(listas[0].querySelectorAll("li").length === 5,
      "la lista no tiene los cinco puntos");
  });

  await check("A3. Sin marcadores no aparece ni un encabezado inventado", async () => {
    const host = await pintar(V1);
    assert(host.querySelectorAll("h2, h3, h4").length === 0, "se inventó un encabezado");
    assert(host.querySelectorAll("table").length === 0, "se inventó una tabla");
  });

  // =========================================================================
  console.log("\nB · La sucesora ya no enseña su sintaxis");
  // =========================================================================

  await check("B1. Los encabezados son encabezados, no almohadillas", async () => {
    const host = await pintar(BORRADOR);
    const encabezados = host.querySelectorAll("h2, h3, h4");
    assert(encabezados.length >= 20, `solo se pintaron ${encabezados.length} encabezados`);
    for (const h of encabezados) {
      assert(!texto(h).startsWith("#"), `un encabezado enseña la almohadilla: «${texto(h)}»`);
    }
    assert(!texto(host).includes("## "), "quedó una almohadilla en el cuerpo");
  });

  await check("B2. La negrita es <strong>, y no quedan asteriscos dobles", async () => {
    const host = await pintar(BORRADOR);
    assert(host.querySelectorAll("strong").length >= 20,
      "casi no se pintó negrita: probablemente no se interpretó");
    assert(!texto(host).includes("**"), "quedaron asteriscos dobles a la vista");
  });

  await check("B3. Las tablas son tablas, con cabecera y filas", async () => {
    const host = await pintar(BORRADOR);
    const tablas = host.querySelectorAll("table");
    assert(tablas.length >= 5, `solo se pintaron ${tablas.length} tablas`);
    for (const t of tablas) {
      assert(t.querySelectorAll("thead th").length >= 2,
        "una tabla se pintó sin cabecera");
      assert(t.querySelectorAll("tbody tr").length >= 1, "una tabla se pintó sin filas");
      for (const th of t.querySelectorAll("th")) {
        assert(th.getAttribute("scope") === "col",
          "una celda de cabecera no declara su ámbito");
      }
    }
    assert(!texto(host).includes("|---"), "quedó una línea separadora a la vista");
  });

  await check("B4. Y ni una tubería suelta en todo el documento", async () => {
    const host = await pintar(BORRADOR);
    const t = texto(host);
    assert(!t.includes(" | "), "quedó una tubería de tabla en el texto");
  });

  // =========================================================================
  console.log("\nC · Nada de lo que entre se ejecuta");
  // =========================================================================

  await check("C1. Un <script> dentro del documento se VE, no se ejecuta", async () => {
    const veneno = 'Aviso: <script>window.__colado = 1</script> fin del aviso.';
    const host = await pintar(veneno);
    assert(host.querySelectorAll("script").length === 0,
      "se creó un elemento <script> de verdad");
    assert((g.window as { __colado?: number }).__colado === undefined,
      "el script del documento llegó a ejecutarse");
    assert(texto(host).includes("<script>"),
      "el texto se perdió en vez de mostrarse tal cual");
  });

  await check("C2. Una imagen con manejador tampoco se crea", async () => {
    const host = await pintar('Foto: <img src=x onerror="window.__img = 1"> fin.');
    assert(host.querySelectorAll("img").length === 0, "se creó una imagen");
    assert((g.window as { __img?: number }).__img === undefined, "se ejecutó el manejador");
  });

  await check("C3. Un enlace con javascript: se pinta como texto, sin <a>", async () => {
    const host = await pintar("Pulsa [aquí](javascript:window.__js=1) ahora.");
    const enlaces = host.querySelectorAll("a");
    assert(enlaces.length === 0, "se pintó un enlace peligroso");
    assert(texto(host).includes("aquí"), "se perdió el texto del enlace");
  });

  await check("C4. Los enlaces legítimos sí se pintan, y los de fuera con rel", async () => {
    const host = await pintar(
      "Ver [el sitio](https://www.trazaloop.com) y los [términos](/terms).");
    const enlaces = [...host.querySelectorAll("a")];
    assert(enlaces.length === 2, `se pintaron ${enlaces.length} enlaces y son 2`);
    const externo = enlaces.find((a) => a.getAttribute("href")?.startsWith("https://"));
    assert(externo?.getAttribute("target") === "_blank", "el externo no abre en otra pestaña");
    const rel = externo?.getAttribute("rel") ?? "";
    assert(rel.includes("noopener") && rel.includes("noreferrer"),
      `el externo va sin rel seguro: «${rel}»`);
    const interno = enlaces.find((a) => a.getAttribute("href") === "/terms");
    assert(interno && !interno.getAttribute("target"),
      "un enlace interno se abre en otra pestaña sin motivo");
  });

  // =========================================================================
  console.log("\nD · En un teléfono, la página no se lee de lado");
  // =========================================================================

  await check("D1. Cada tabla lleva SU propio contenedor de desplazamiento", async () => {
    const host = await pintar(BORRADOR);
    const tablas = [...host.querySelectorAll("table")];
    assert(tablas.length >= 5, "no hay tablas que comprobar");
    for (const t of tablas) {
      const padre = t.parentElement;
      assert(padre, "una tabla se pintó sin contenedor");
      assert((padre!.getAttribute("class") ?? "").includes("overflow-x-auto"),
        "una tabla puede empujar la página entera en un teléfono");
    }
  });

  await check("D2. Y el desbordamiento se queda dentro: nada lo suelta al cuerpo", async () => {
    const host = await pintar(BORRADOR);
    // Ningún contenedor de tabla puede declarar un ancho mínimo propio: el
    // mínimo va en la tabla, dentro del que desplaza. Al revés, el que
    // desplazaría sería la página.
    for (const t of host.querySelectorAll("table")) {
      const clasePadre = t.parentElement?.getAttribute("class") ?? "";
      assert(!clasePadre.includes("min-w-"),
        "el contenedor de una tabla fija un ancho mínimo y arrastra la página");
      assert((t.getAttribute("class") ?? "").includes("min-w-"),
        "la tabla no reserva ancho: se comprimiría hasta ser ilegible");
    }
  });

  // =========================================================================
  console.log("\nE · Se lee como un documento, no como un fichero");
  // =========================================================================

  await check("E1. La jerarquía de encabezados no salta niveles", async () => {
    const host = await pintar(BORRADOR);
    // La página ya pone su <h1> con el título. El cuerpo empieza en h2, así que
    // un lector de pantalla recorre 1 → 2 → 3 sin huecos.
    assert(host.querySelectorAll("h1").length === 0,
      "el cuerpo pinta un h1 y competiría con el título de la página");
    assert(host.querySelectorAll("h2").length >= 15, "faltan los artículos como h2");
    const niveles = [...host.querySelectorAll("h2, h3, h4")]
      .map((h) => Number(h.tagName.slice(1)));
    let previo = 2;
    for (const n of niveles) {
      assert(n <= previo + 1, `se salta del h${previo} al h${n}`);
      previo = n;
    }
  });

  await check("E2. Las listas y las citas se distinguen de los párrafos", async () => {
    const host = await pintar(BORRADOR);
    assert(host.querySelectorAll("ul li").length >= 20, "faltan las viñetas");
    assert(host.querySelectorAll("ol li").length >= 5, "faltan las listas numeradas");
    assert(host.querySelectorAll("hr").length >= 5, "faltan los separadores");
  });

  console.log(`\nPE-02B6.2 · legal (DOM): ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
