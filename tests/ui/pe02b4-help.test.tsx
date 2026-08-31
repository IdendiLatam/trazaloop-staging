/**
 * Trazaloop · PE-02B4 · La ayuda contextual, pintada de verdad.
 *
 * Correr: npm run test:pe02b4-help-ui
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
g.KeyboardEvent = dom.window.KeyboardEvent;
g.FormData = dom.window.FormData;
g.getComputedStyle = dom.window.getComputedStyle;
g.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0);
g.cancelAnimationFrame = (id: number) => clearTimeout(id);
g.self = dom.window;
g.IS_REACT_ACT_ENVIRONMENT = true;

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }

const COMPLETA = {
  title: "Qué es una parte interesada",
  explanation: "Quien puede afectar al sistema de gestión o verse afectado por él.",
  example: "Un cliente institucional del que dependen la mitad de los pedidos.",
  technicalReference: "ISO 9001:2015, 4.2. Pide determinar las partes pertinentes.",
};

async function main() {
  const { createRoot } = await import("react-dom/client");
  const { act } = await import("react");
  const { SectionHint } = await import("@/components/ui/section-hint");
  const { helpToHint, helpSectionsToRender } =
    await import("@/lib/domain/contextual-help");

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
  const abrir = async (host: Element) => {
    const boton = host.querySelector("button") as HTMLButtonElement;
    await act(async () => { boton.click(); });
  };

  console.log("\nPE-02B4 · La ayuda contextual · pintada en un DOM real\n");

  // =========================================================================
  console.log("A · Las tres partes");
  // =========================================================================

  await check("A1. Se pintan Qué es, Ejemplo y Respaldo, en ese orden", async () => {
    const host = await pintar(createElement(SectionHint, { hint: helpToHint(COMPLETA) }));
    await abrir(host);
    const t = texto(host);
    const iQue = t.indexOf("QUÉ ES"), iEj = t.indexOf("EJEMPLO"), iRes = t.indexOf("RESPALDO");
    assert(iQue >= 0 && iEj > iQue && iRes > iEj,
      `el orden es raro: ${iQue}, ${iEj}, ${iRes}`);
    assert(t.includes("Quien puede afectar"), "no se ve la explicación");
    assert(t.includes("cliente institucional"), "no se ve el ejemplo");
    assert(t.includes("ISO 9001:2015"), "no se ve el respaldo");
  });

  await check("A2. Sin ejemplo ni respaldo, no se pinta un rótulo que sobra", async () => {
    const host = await pintar(createElement(SectionHint, {
      hint: helpToHint({ ...COMPLETA, example: null, technicalReference: null }) }));
    await abrir(host);
    const t = texto(host);
    assert(t.includes("Quien puede afectar"), "no se ve la explicación");
    assert(!t.includes("QUÉ ES"), "se pinta «QUÉ ES» cuando es lo único que hay");
    assert(!t.includes("EJEMPLO"), "se pinta un rótulo de ejemplo sin ejemplo");
    assert(!t.includes("RESPALDO"), "se pinta un rótulo de respaldo sin respaldo");
  });

  await check("A3. Con ejemplo pero sin respaldo, se pintan dos", async () => {
    const partes = helpSectionsToRender({ ...COMPLETA, technicalReference: null });
    assert(partes.length === 2, `se pintan ${partes.length} bloques`);
    assert(partes[0].label === "Qué es" && partes[1].label === "Ejemplo",
      "los rótulos no son los esperados");
  });

  // =========================================================================
  console.log("\nB · Sigue siendo el mismo botón");
  // =========================================================================

  await check("B1. Es un botón accesible, y no envía formularios", async () => {
    const host = await pintar(createElement(SectionHint, { hint: helpToHint(COMPLETA) }));
    const boton = host.querySelector("button");
    assert(boton, "no hay botón");
    assert(boton!.getAttribute("type") === "button",
      "el botón enviaría el formulario donde viva");
    assert(boton!.getAttribute("aria-label") === "Más información",
      "el botón no tiene nombre accesible");
    assert(boton!.getAttribute("aria-expanded") === "false", "no anuncia si está abierto");
  });

  await check("B2. Al abrirlo lo anuncia, y se puede cerrar", async () => {
    const host = await pintar(createElement(SectionHint, { hint: helpToHint(COMPLETA) }));
    await abrir(host);
    const boton = host.querySelector("button")!;
    assert(boton.getAttribute("aria-expanded") === "true", "no anuncia que está abierto");
    const cerrar = [...host.querySelectorAll("button")].find((b) => texto(b) === "Cerrar");
    assert(cerrar, "no hay forma visible de cerrar");
    await act(async () => { (cerrar as HTMLButtonElement).click(); });
    assert(host.querySelector("button")!.getAttribute("aria-expanded") === "false",
      "no se cerró");
  });

  await check("B3. Escape cierra y devuelve el foco", async () => {
    const host = await pintar(createElement(SectionHint, { hint: helpToHint(COMPLETA) }));
    await abrir(host);
    await act(async () => {
      dom.window.document.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", { key: "Escape" }));
    });
    const boton = host.querySelector("button")!;
    assert(boton.getAttribute("aria-expanded") === "false", "Escape no cerró el panel");
    assert(dom.window.document.activeElement === boton,
      "Escape no devolvió el foco al botón");
  });

  await check("B4. Sin ayuda, no se pinta NADA", async () => {
    const host = await pintar(createElement(SectionHint, { hint: helpToHint(null) }));
    assert(host.querySelectorAll("button").length === 0,
      "se pinta un botón que abriría un panel vacío");
    assert(texto(host) === "", "se pinta algo");
  });

  await check("B5. Y una ayuda vacía tampoco", async () => {
    const vacia = helpToHint({
      title: "x", explanation: "   ", example: null, technicalReference: null });
    assert(vacia === null, "una explicación en blanco produce un panel");
  });

  // =========================================================================
  console.log("\nC · Lo que no se filtra");
  // =========================================================================

  await check("C1. El panel no enseña gobierno editorial", async () => {
    const host = await pintar(createElement(SectionHint, { hint: helpToHint(COMPLETA) }));
    await abrir(host);
    const t = texto(host).toLowerCase();
    for (const p of ["page_key", "target_kind", "normative", "revisión", "borrador",
      "no inventar", "do_not_invent"]) {
      assert(!t.includes(p), `el panel filtra «${p}»`);
    }
  });

  await check("C2. Y el texto nunca se interpreta como HTML", async () => {
    const host = await pintar(createElement(SectionHint, {
      hint: helpToHint({ ...COMPLETA,
        explanation: 'Un texto con <b>etiqueta</b> y <img src=x onerror="alert(1)">.' }) }));
    await abrir(host);
    assert(host.querySelectorAll("b, img").length === 0,
      "el contenido de la ayuda se interpretó como HTML");
    assert(texto(host).includes("<b>etiqueta</b>"),
      "el texto no se muestra literal");
  });

  console.log(`\nPE-02B4 · ayuda (pantalla): ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
