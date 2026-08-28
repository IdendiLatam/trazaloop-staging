/**
 * Trazaloop · QUALITY-12.2C · El botón, pulsado de verdad.
 *
 * POR QUÉ EXISTE ESTA SUITE
 *
 * Porque las cincuenta y dos comprobaciones anteriores estaban verdes y el
 * botón no hacía nada. Todas llamaban a la acción de servidor por su nombre, y
 * esa parte funcionaba: lo que estaba roto era el CABLEADO del componente —un
 * `<form>` dentro de otro `<form>`, que el navegador descarta y React no
 * valida—.
 *
 * Una prueba que invoca la función de servidor no prueba que alguien pueda
 * llegar a ella. Ésta monta el componente en un DOM, pulsa el botón y mira qué
 * pasa. La acción se inyecta, así que no hace falta ni servidor ni proveedor.
 */
import { JSDOM } from "jsdom";
import { createElement, StrictMode } from "react";
import type { QuickEditState } from "@/server/actions/document-authoring";

const dom = new JSDOM("<!doctype html><html><body><div id=\"raiz\"></div></body></html>", {
  url: "https://trazaloop.test", pretendToBeVisual: true,
});
const g = globalThis as unknown as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
// `navigator` de Node solo tiene captador: se define encima en vez de asignar.
Object.defineProperty(g, "navigator", {
  value: dom.window.navigator, configurable: true, writable: true,
});
g.HTMLElement = dom.window.HTMLElement;
g.Element = dom.window.Element;
g.Node = dom.window.Node;
g.Event = dom.window.Event;
g.MouseEvent = dom.window.MouseEvent;
g.FormData = dom.window.FormData;
g.getComputedStyle = dom.window.getComputedStyle;
g.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0);
g.cancelAnimationFrame = (id: number) => clearTimeout(id);
g.IS_REACT_ACT_ENVIRONMENT = true;

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }

async function main() {
  const { createRoot } = await import("react-dom/client");
  const { act } = await import("react");
  const { QuickEditPanel } = await import("@/components/domain/documents/quick-edit");

  async function check(n: string, fn: () => Promise<void>) {
    try { await fn(); passed += 1; console.log(`  ✔ ${n}`); }
    catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
  }

  const TEXTO = "Las actividades de recepción se revisan periódicamente por el área.";

  /** Monta el panel dentro de un formulario, como está en los tres editores. */
  async function montar(opts: {
    action: (prev: QuickEditState, form: FormData) => Promise<QuickEditState>;
    texto?: string;
  }) {
    // Un contenedor nuevo por prueba: reutilizar el mismo obliga a reutilizar
    // su raíz, y arrastrar el estado de una prueba a la siguiente es
    // exactamente lo que hace que una suite mienta.
    const host = dom.window.document.createElement("div");
    dom.window.document.getElementById("raiz")!.replaceChildren(host);
    let reemplazado: string | null = null;
    const root = createRoot(host);
    await act(async () => {
      root.render(createElement(StrictMode, null,
        // El formulario de guardado de la sección: es lo que hacía que el
        // panel no funcionara, y por eso la prueba lo reproduce.
        createElement("form", { action: "/guardar" },
          createElement("textarea", { name: "section:1", defaultValue: opts.texto ?? TEXTO }),
          createElement(QuickEditPanel, {
            documentId: "doc-1", sectionId: "sec-1",
            currentText: opts.texto ?? TEXTO,
            onReplace: (t: string) => { reemplazado = t; },
            disabled: false,
            action: opts.action,
          }))));
    });
    return {
      host, root,
      get reemplazado() { return reemplazado; },
      texto: () => host.textContent ?? "",
      boton: (etiqueta: string) =>
        [...host.querySelectorAll("button")]
          .find((b) => (b.textContent ?? "").includes(etiqueta)) ?? null,
      click: async (etiqueta: string) => {
        const b = [...host.querySelectorAll("button")]
          .find((x) => (x.textContent ?? "").includes(etiqueta));
        assert(b, `no existe el botón «${etiqueta}»`);
        await act(async () => {
          b!.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
        });
      },
    };
  }

  const PROPUESTA: QuickEditState = {
    error: null,
    suggestion: {
      suggestedText: "El área revisa periódicamente las actividades de recepción.",
      changeSummary: ["Se ordenó la frase."],
      missingInformation: ["Responsable", "Frecuencia"],
      warnings: [],
    },
    used: { userText: true, guidance: true, organizationProfile: true, documentMetadata: true },
    runId: "run-1", model: "gpt-5.4-mini", latencyMs: 900,
  };

  console.log("\nQUALITY-12.2C · el botón, pulsado de verdad\n");

  // =========================================================================
  console.log("A · EL DEFECTO QUE SE NOS ESCAPÓ");
  // =========================================================================

  await check("A1. el panel NO mete un formulario dentro del de guardado", async () => {
    const v = await montar({ action: async () => PROPUESTA });
    await v.click("Mejorar con Intelligence");
    const forms = v.host.querySelectorAll("form");
    assert(forms.length === 1,
      `hay ${forms.length} formularios anidados: el navegador descartaría el interno`);
  });

  await check("A2. ningún botón del panel puede enviar el formulario de guardado", async () => {
    const v = await montar({ action: async () => PROPUESTA });
    await v.click("Mejorar con Intelligence");
    for (const b of v.host.querySelectorAll("button")) {
      assert(b.getAttribute("type") === "button",
        `un botón del panel es «${b.getAttribute("type") ?? "submit"}» y enviaría el guardado`);
    }
  });

  // =========================================================================
  console.log("\nB · PULSAR PROPONER HACE ALGO");
  // =========================================================================

  await check("B1. se ve el estado de trabajo mientras trabaja", async () => {
    let resolver: ((v: QuickEditState) => void) | null = null;
    const lenta = () => new Promise<QuickEditState>((r) => { resolver = r; });
    const v = await montar({ action: lenta });
    await v.click("Mejorar con Intelligence");
    assert(!v.texto().includes("Preparando"), "aparece el estado de trabajo antes de pulsar");
    await v.click("Proponer");
    assert(v.texto().includes("Preparando"),
      "al pulsar Proponer no se ve ningún estado de trabajo");
    assert(v.host.querySelector("[data-testid=quick-edit-pending]"),
      "no hay indicador de trabajo con rol de estado");
    await act(async () => { resolver!(PROPUESTA); });
  });

  await check("B2. no se puede enviar dos veces", async () => {
    let veces = 0;
    let resolver: ((v: QuickEditState) => void) | null = null;
    const lenta = () => { veces += 1; return new Promise<QuickEditState>((r) => { resolver = r; }); };
    const v = await montar({ action: lenta });
    await v.click("Mejorar con Intelligence");
    await v.click("Proponer");
    const boton = v.boton("Preparando");
    assert(boton && (boton as HTMLButtonElement).disabled,
      "el botón sigue habilitado mientras trabaja");
    await v.click("Preparando");
    assert(veces === 1, `se envió ${veces} veces`);
    await act(async () => { resolver!(PROPUESTA); });
  });

  await check("B3. la propuesta se ve, con el texto original al lado", async () => {
    const v = await montar({ action: async () => PROPUESTA });
    await v.click("Mejorar con Intelligence");
    await v.click("Proponer");
    const t = v.texto();
    assert(t.includes("El área revisa periódicamente"), "no se pintó la propuesta");
    assert(t.includes("Las actividades de recepción se revisan"),
      "no se pintó el texto original para comparar");
    assert(t.includes("Se ordenó la frase."), "no se pintó el resumen del cambio");
    assert(t.includes("Responsable") && t.includes("Frecuencia"),
      "no se pintó lo que falta");
    assert(!t.includes("Preparando"), "sigue diciendo que está preparando");
  });

  await check("B4. se ve qué contexto se usó, sin lista de fuentes", async () => {
    const v = await montar({ action: async () => PROPUESTA });
    await v.click("Mejorar con Intelligence");
    await v.click("Proponer");
    const t = v.texto();
    assert(t.includes("Contexto utilizado"), "no se dice qué se usó");
    assert(t.includes("la guía de esta sección") && t.includes("el perfil de la empresa"),
      "no se enumera el contexto usado");
    assert(!/\[\d+\]/.test(t), "aparecieron marcadores de cita numerados");
  });

  // =========================================================================
  console.log("\nC · REEMPLAZAR");
  // =========================================================================

  await check("C1. Reemplazar entrega el texto al editor, y solo eso", async () => {
    const v = await montar({ action: async () => PROPUESTA });
    await v.click("Mejorar con Intelligence");
    await v.click("Proponer");
    assert(v.reemplazado === null, "se reemplazó sin pulsar Reemplazar");
    await v.click("Reemplazar");
    assert(v.reemplazado === PROPUESTA.suggestion!.suggestedText,
      "Reemplazar no entregó el texto al editor");
  });

  await check("C2. hasta pulsar Reemplazar, el editor conserva su texto", async () => {
    const v = await montar({ action: async () => PROPUESTA });
    const area = v.host.querySelector("textarea") as HTMLTextAreaElement;
    const antes = area.value;
    await v.click("Mejorar con Intelligence");
    await v.click("Proponer");
    assert((v.host.querySelector("textarea") as HTMLTextAreaElement).value === antes,
      "el editor cambió solo con ver la propuesta");
    assert(v.reemplazado === null, "se reemplazó sin pedirlo");
  });

  // =========================================================================
  console.log("\nD · CUANDO FALLA");
  // =========================================================================

  await check("D1. un error del servidor SE VE", async () => {
    const v = await montar({
      action: async () => ({ error: "La asistencia no está disponible en este momento." }),
    });
    await v.click("Mejorar con Intelligence");
    await v.click("Proponer");
    const t = v.texto();
    assert(t.includes("no está disponible"), "el error no se pinta");
    assert(!t.includes("Pensando"), "se queda colgado en «pensando» tras el error");
  });

  await check("D2. tras un error el texto sigue intacto y se puede reintentar", async () => {
    let veces = 0;
    const v = await montar({
      action: async () => {
        veces += 1;
        return veces === 1 ? { error: "Falló." } : PROPUESTA;
      },
    });
    const area = v.host.querySelector("textarea") as HTMLTextAreaElement;
    const antes = area.value;
    await v.click("Mejorar con Intelligence");
    await v.click("Proponer");
    assert(v.texto().includes("Falló."), "no se vio el error");
    assert((v.host.querySelector("textarea") as HTMLTextAreaElement).value === antes,
      "el editor perdió su texto tras el error");
    assert(v.reemplazado === null, "se reemplazó tras un error");
    await v.click("Proponer");
    assert(v.texto().includes("El área revisa periódicamente"),
      "no se pudo reintentar tras el error");
  });

  // =========================================================================
  console.log("\nE · SIN TEXTO NO SE PUEDE");
  // =========================================================================

  await check("E1. con el editor vacío el botón está apagado y dice por qué", async () => {
    let llamadas = 0;
    const v = await montar({
      action: async () => { llamadas += 1; return PROPUESTA; },
      texto: "  ",
    });
    const boton = v.boton("Mejorar con Intelligence") as HTMLButtonElement;
    assert(boton.disabled, "el botón se puede pulsar con el editor vacío");
    assert(v.texto().includes("Escribe primero el contenido"),
      "no se explica por qué está apagado");
    assert(llamadas === 0, "se llamó a la acción con el editor vacío");
  });

  // =========================================================================
  console.log("\nF · LO QUE SE ENVÍA");
  // =========================================================================

  await check("F1. el envío lleva documento, sección, texto vivo y acción", async () => {
    let recibido: Record<string, string> = {};
    const v = await montar({
      action: async (_p, form) => {
        recibido = Object.fromEntries(
          [...form.entries()].map(([k, val]) => [k, String(val)]));
        return PROPUESTA;
      },
    });
    await v.click("Mejorar con Intelligence");
    await v.click("Proponer");
    assert(recibido.document_id === "doc-1", `documento: ${recibido.document_id}`);
    assert(recibido.section_id === "sec-1", `sección: ${recibido.section_id}`);
    assert(recibido.user_text === TEXTO, "no se envió el texto vivo del editor");
    assert(recibido.action === "improve_writing", `acción: ${recibido.action}`);
    // Y nada más: el cliente no decide el módulo ni la empresa.
    assert(!("module_key" in recibido) && !("organization_id" in recibido),
      "el cliente está declarando el módulo o la empresa");
  });

  await check("F2. cambiar la acción cambia lo que se envía", async () => {
    let recibido = "";
    const v = await montar({
      action: async (_p, form) => { recibido = String(form.get("action")); return PROPUESTA; },
    });
    await v.click("Mejorar con Intelligence");
    const select = v.host.querySelector("select") as HTMLSelectElement;
    await act(async () => {
      select.value = "formalize";
      select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });
    await v.click("Proponer");
    assert(recibido === "formalize", `se envió «${recibido}»`);
  });

  console.log(`\nResultado: ${passed} conformes, ${failed} fallos\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
