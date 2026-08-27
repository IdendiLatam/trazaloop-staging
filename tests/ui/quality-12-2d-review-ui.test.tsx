/**
 * Trazaloop · QUALITY-12.2D · El botón de revisar, pulsado de verdad.
 *
 * POR QUÉ ESTA SUITE EXISTE ANTES DE QUE HAGA FALTA
 *
 * Porque en 12.2C hizo falta después. Cincuenta y dos comprobaciones en verde
 * mientras el botón no hacía absolutamente nada: todas llamaban a la acción de
 * servidor por su nombre, y esa parte funcionaba. Lo roto era el CABLEADO —un
 * `<form>` dentro de otro, que el navegador descarta y React no valida—.
 *
 * Así que el panel de 12.2D nace con su prueba de cableado. Monta el
 * componente en un DOM de verdad, dentro del formulario de guardado como está
 * en los tres editores, pulsa el botón y mira qué pasa. La acción se inyecta:
 * ni servidor, ni base, ni proveedor.
 */
import { JSDOM } from "jsdom";
import { createElement, StrictMode } from "react";
import type { DocumentReviewState } from "@/server/actions/document-review";

const dom = new JSDOM("<!doctype html><html><body><div id=\"raiz\"></div></body></html>", {
  url: "https://trazaloop.test", pretendToBeVisual: true,
});
const g = globalThis as unknown as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
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
// `next/link` se compila esperando `self`, que en un navegador es `window` y en
// Node no existe. Se expone aquí y no se cambia el componente: degradar el
// enlace a un `<a>` para que pase una prueba sería arreglar el termómetro.
g.self = dom.window;
g.IS_REACT_ACT_ENVIRONMENT = true;

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }

async function main() {
  const { createRoot } = await import("react-dom/client");
  const { act } = await import("react");
  const { ContextualReviewPanel } =
    await import("@/components/domain/documents/contextual-review");

  async function check(n: string, fn: () => Promise<void>) {
    try { await fn(); passed += 1; console.log(`  ✔ ${n}`); }
    catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? (e.message || e.stack) : e}`); }
  }

  const TEXTO = "El Coordinador de Calidad revisará mensualmente los proveedores "
    + "aprobados y dejará constancia de la revisión.";

  async function montar(opts: {
    action: (prev: DocumentReviewState, form: FormData) => Promise<DocumentReviewState>;
    texto?: string;
  }) {
    const host = dom.window.document.createElement("div");
    dom.window.document.getElementById("raiz")!.replaceChildren(host);
    let aplicado: string | null = null;
    const root = createRoot(host);
    await act(async () => {
      root.render(createElement(StrictMode, null,
        // El formulario de guardado de la sección. Está aquí porque es lo que
        // rompió el panel de 12.2C, y una prueba que no lo reproduce no habría
        // encontrado aquel defecto.
        createElement("form", { action: "/guardar" },
          createElement("textarea", { name: "section:1", defaultValue: opts.texto ?? TEXTO }),
          createElement(ContextualReviewPanel, {
            documentId: "doc-1", sectionId: "sec-1",
            currentText: opts.texto ?? TEXTO,
            onApply: (t: string) => { aplicado = t; },
            disabled: false,
            action: opts.action,
          }))));
    });
    return {
      host, root,
      get aplicado() { return aplicado; },
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

  /** Una revisión con las tres cosas que la pantalla tiene que saber pintar. */
  const REVISION: DocumentReviewState = {
    error: null,
    review: {
      summary: "Se contrastó el texto con 3 hechos registrados en Trazaloop.",
      findings: [
        {
          type: "confirmed_conflict", severity: "conflict",
          userTextExcerpt: "El Coordinador de Calidad revisará",
          systemFact: "Responsable registrado de este documento: cargo «Coordinador de Compras».",
          explanation: "El texto nombra un cargo distinto del registrado.",
          sourceRefs: [1, 2], suggestedNextStep: "Decide cuál de los dos hay que corregir.",
          suggestedWording: "El Coordinador de Compras revisará los proveedores aprobados.",
        },
        {
          type: "possible_conflict", severity: "attention",
          userTextExcerpt: "mensualmente",
          systemFact: "Control «Evaluación de proveedores» (CTR-09): frecuencia «anual».",
          explanation: "La periodicidad escrita no coincide con la registrada.",
          sourceRefs: [3], suggestedNextStep: "Comprueba cuál es la buena.",
          suggestedWording: "",
        },
        {
          type: "guidance_gap", severity: "info",
          userTextExcerpt: "", systemFact: "",
          explanation: "La guía pide quién decide y el texto no lo dice.",
          sourceRefs: [], suggestedNextStep: "Añádelo si está definido.",
          suggestedWording: "",
        },
      ],
    },
    used: {
      guidance: true, guidanceRevisionId: "rev-1",
      types: ["position", "process", "control"], factCount: 3, refCount: 3,
      queries: 5,
      limits: [{ kind: "unscoped_type", type: "objective" }],
    },
    sources: [], findingSources: [
      [{ ordinal: 1, sourceCode: "position", entityType: "quality_position",
         entityId: "p1", label: "Cargo Coordinador de Compras",
         deepLink: "/quality/people/positions/p1", asOf: null, revisionLabel: null }],
      [{ ordinal: 3, sourceCode: "control", entityType: "quality_control",
         entityId: "c1", label: "Control CTR-09",
         deepLink: "/quality/risks/controls/c1", asOf: null, revisionLabel: null }],
      [],
    ],
    providerCalled: true, runId: "run-1", model: "gpt-5.4-mini", latencyMs: 2100,
  };

  console.log("\nQUALITY-12.2D · el botón de revisar, pulsado de verdad\n");

  // =========================================================================
  console.log("A · EL CABLEADO, QUE ES LO QUE FALLÓ LA VEZ ANTERIOR");
  // =========================================================================

  await check("A1. el panel NO mete un formulario dentro del de guardado", async () => {
    const v = await montar({ action: async () => REVISION });
    await v.click("Revisar consistencia");
    const forms = v.host.querySelectorAll("form");
    assert(forms.length === 1,
      `hay ${forms.length} formularios anidados: el navegador descartaría el interno`);
  });

  await check("A2. ningún botón del panel puede enviar el formulario de guardado", async () => {
    const v = await montar({ action: async () => REVISION });
    await v.click("Revisar consistencia");
    for (const b of v.host.querySelectorAll("button")) {
      assert(b.getAttribute("type") === "button",
        `un botón del panel es «${b.getAttribute("type") ?? "submit"}» y enviaría el guardado`);
    }
  });

  await check("A3. pulsar Revisar llama a la acción con lo que hay en el editor", async () => {
    let recibido: FormData | null = null;
    const v = await montar({
      action: async (_p, f) => { recibido = f; return REVISION; },
    });
    await v.click("Revisar consistencia");
    await v.click("Revisar contra Trazaloop");
    assert(recibido !== null, "la acción no llegó a llamarse: el botón no hace nada");
    const f = recibido as unknown as FormData;
    assert(f.get("document_id") === "doc-1", "no viajó el documento");
    assert(f.get("section_id") === "sec-1", "no viajó la sección");
    assert(String(f.get("user_text")).includes("Coordinador de Calidad"),
      "no viajó el texto vivo del editor");
  });

  // =========================================================================
  console.log("\nB · LO QUE SE VE AL PULSAR");
  // =========================================================================

  await check("B1. se ve el estado «revisando» mientras trabaja", async () => {
    let resolver: ((v: DocumentReviewState) => void) | null = null;
    const v = await montar({
      action: () => new Promise<DocumentReviewState>((r) => { resolver = r; }),
    });
    await v.click("Revisar consistencia");
    await v.click("Revisar contra Trazaloop");
    assert(v.host.querySelector("[data-testid=\"review-pending\"]") !== null,
      "no se ve nada mientras trabaja: eso es un botón que parece roto");
    await act(async () => { resolver!(REVISION); });
  });

  await check("B2. los hallazgos se pintan, uno por uno", async () => {
    const v = await montar({ action: async () => REVISION });
    await v.click("Revisar consistencia");
    await v.click("Revisar contra Trazaloop");
    const n = v.host.querySelectorAll("[data-testid=\"review-finding\"]").length;
    assert(n === 3, `se pintaron ${n} hallazgos de 3`);
  });

  await check("B3. cada hallazgo enseña los DOS lados", async () => {
    const v = await montar({ action: async () => REVISION });
    await v.click("Revisar consistencia");
    await v.click("Revisar contra Trazaloop");
    const t = v.texto();
    assert(t.includes("Tu texto dice"), "no se enseña lo que dice el texto");
    assert(t.includes("Trazaloop tiene registrado"), "no se enseña lo registrado");
    assert(t.includes("El Coordinador de Calidad revisará"), "falta el extracto");
    assert(t.includes("Coordinador de Compras"), "falta el hecho registrado");
  });

  await check("B4. un error se ve, y el texto no se toca", async () => {
    const v = await montar({
      action: async () => ({ error: "La revisión no está disponible ahora." }),
    });
    await v.click("Revisar consistencia");
    await v.click("Revisar contra Trazaloop");
    assert(v.texto().includes("no está disponible"), "el error no se ve");
    assert(v.aplicado === null, "se aplicó algo pese al error");
  });

  // =========================================================================
  console.log("\nC · LA PERSONA SIGUE DECIDIENDO");
  // =========================================================================

  await check("C1. «Aplicar redacción» solo cambia el editor", async () => {
    const v = await montar({ action: async () => REVISION });
    await v.click("Revisar consistencia");
    await v.click("Revisar contra Trazaloop");
    await v.click("Aplicar redacción");
    assert(v.aplicado === "El Coordinador de Compras revisará los proveedores aprobados.",
      `se aplicó «${v.aplicado}»`);
  });

  await check("C2. solo ofrece aplicar donde hay redacción que aplicar", async () => {
    const v = await montar({ action: async () => REVISION });
    await v.click("Revisar consistencia");
    await v.click("Revisar contra Trazaloop");
    const botones = [...v.host.querySelectorAll("button")]
      .filter((b) => (b.textContent ?? "").includes("Aplicar redacción"));
    assert(botones.length === 1,
      `hay ${botones.length} botones de aplicar para un solo hallazgo con redacción`);
  });

  await check("C3. ignorar un hallazgo lo esconde y no toca el resto", async () => {
    const v = await montar({ action: async () => REVISION });
    await v.click("Revisar consistencia");
    await v.click("Revisar contra Trazaloop");
    await v.click("Ignorar");
    const n = v.host.querySelectorAll("[data-testid=\"review-finding\"]").length;
    assert(n === 2, `quedaron ${n} hallazgos tras ignorar uno`);
    assert(v.aplicado === null, "ignorar aplicó algo");
  });

  await check("C4. nada de lo que hace el panel guarda", async () => {
    let llamadas = 0;
    const v = await montar({ action: async () => { llamadas += 1; return REVISION; } });
    await v.click("Revisar consistencia");
    await v.click("Revisar contra Trazaloop");
    await v.click("Aplicar redacción");
    await v.click("Ignorar");
    assert(llamadas === 1, `la acción se llamó ${llamadas} veces: aplicar o ignorar llaman al servidor`);
  });

  // =========================================================================
  console.log("\nD · LO QUE LA PANTALLA DICE DE SÍ MISMA");
  // =========================================================================

  await check("D1. avisa de que esto no es una auditoría", async () => {
    const v = await montar({ action: async () => REVISION });
    await v.click("Revisar consistencia");
    await v.click("Revisar contra Trazaloop");
    const t = v.texto();
    assert(/no es una auditoría ni una no conformidad/.test(t),
      "la pantalla no aclara qué NO es");
    assert(/ha cambiado el documento/.test(t), "no dice que no cambió nada");
  });

  await check("D2. dice lo que NO pudo mirar", async () => {
    const v = await montar({ action: async () => REVISION });
    await v.click("Revisar consistencia");
    await v.click("Revisar contra Trazaloop");
    assert(v.texto().includes("no ha podido mirar todo"), "no declara sus límites");
    assert(v.texto().includes("Objetivos"), "no dice qué tipo quedó sin revisar");
  });

  await check("D3. sin llamada al modelo, lo dice", async () => {
    const v = await montar({
      action: async () => ({
        ...REVISION,
        review: { summary: "No encontré registros relacionados.", findings: [] },
        providerCalled: false,
      }),
    });
    await v.click("Revisar consistencia");
    await v.click("Revisar contra Trazaloop");
    assert(v.texto().includes("sin llamada al modelo"),
      "no se distingue una respuesta determinista de una del modelo");
    assert(v.texto().includes("No hay nada que señalar"),
      "no se dice que no hay hallazgos");
  });

  // =========================================================================
  console.log("\nE · SIN TEXTO NO SE OFRECE");
  // =========================================================================

  await check("E1. con el editor casi vacío el botón está apagado", async () => {
    const v = await montar({ action: async () => REVISION, texto: "Se revisa." });
    const b = v.boton("Revisar consistencia");
    assert(b !== null, "no está el botón");
    assert(b!.hasAttribute("disabled"), "el botón está activo con un texto de diez caracteres");
    assert(v.texto().includes("Escribe primero"), "no se explica por qué está apagado");
  });

  await check("E2. y si aun así se pulsa, no se llama a nadie", async () => {
    let llamadas = 0;
    const v = await montar({
      action: async () => { llamadas += 1; return REVISION; }, texto: "Se revisa.",
    });
    const b = v.boton("Revisar consistencia");
    await act(async () => {
      b!.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    });
    assert(llamadas === 0, "se abrió el panel y se llamó al servidor con el texto vacío");
  });

  console.log(`\n${passed} conformes · ${failed} fallos\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
