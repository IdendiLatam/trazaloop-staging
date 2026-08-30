/**
 * Trazaloop · QUALITY-13B2 · El mirador, pintado de verdad.
 *
 * POR QUÉ HACE FALTA ADEMÁS DE LA SUITE DE DECISIONES
 *
 * Porque una decisión correcta puede no llegar a la pantalla. En QUALITY-12.2C
 * hubo cincuenta y dos comprobaciones en verde mientras el botón no hacía nada.
 * Aquí se monta el componente en un DOM real y se mira **lo que queda escrito**:
 * qué número aparece, cuántas filas, qué enlaces hay y —sobre todo— qué NO
 * aparece cuando una sección viene denegada o rota.
 *
 * Eso último es lo que ninguna prueba de código fuente puede garantizar: que un
 * recuento que no se debe enseñar no acabe en el HTML por otro camino.
 *
 * Correr: npm run test:quality13b2-cockpit-ui
 */
import { JSDOM } from "jsdom";
import { createElement } from "react";
import {
  CURRENT, deepLink, period,
  type ContextItem, type ContextSection,
} from "@/lib/domain/quality-integration";

const dom = new JSDOM('<!doctype html><html><body><div id="raiz"></div></body></html>', {
  url: "https://trazaloop.test", pretendToBeVisual: true,
});
const g = globalThis as unknown as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(g, "navigator", {
  value: dom.window.navigator, configurable: true, writable: true,
});
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
// Los datos: un proceso con nueve secciones y de todo dentro
// ---------------------------------------------------------------------------

const fila = (
  kind: ContextItem["subjectKind"], id: string, label: string,
  extra: Partial<ContextItem> = {}
): ContextItem => ({
  subjectKind: kind, subjectId: id, label,
  state: null, severity: null, href: deepLink(kind, id), ...extra,
});

function seccion(
  key: string, label: string, extra: Partial<ContextSection> = {}
): ContextSection {
  return {
    key, label, status: "ok", count: 0, attentionCount: null, items: [],
    href: "/quality/x", temporal: CURRENT, ...extra,
  };
}

const REQ_ID = "req-1";

function secciones(): ContextSection[] {
  return [
    seccion("requirements", "Requisitos de partes interesadas", {
      count: 1, href: deepLink("quality_stakeholder_requirement"),
      items: [fila("quality_stakeholder_requirement", REQ_ID, "SLA de 48 horas",
        { state: "relevant" })],
    }),
    // CINCO riesgos en el dominio, CUATRO en la muestra: es el caso que separa
    // «cuántos hay» de «cuántos se pintaron».
    seccion("risks", "Riesgos", {
      count: 5, attentionCount: 3, href: deepLink("quality_risk"),
      items: [0, 1, 2, 3].map((i) =>
        fila("quality_risk", `risk-${i}`, `Riesgo ${i}`, { state: "active" })),
    }),
    seccion("opportunities", "Oportunidades", { href: deepLink("quality_opportunity") }),
    seccion("objectives", "Objetivos", {
      count: 1, href: deepLink("quality_objective"),
      items: [fila("quality_objective", "obj-1", "Cumplir el plazo", { state: "active" })],
    }),
    seccion("indicators", "Indicadores", {
      count: 2, href: deepLink("quality_indicator"),
      items: [fila("quality_indicator", "ind-1", "Cumplimiento de plazo", { state: "active" })],
    }),
    seccion("documents", "Documentos", {
      count: 2, href: deepLink("trazadoc_document"),
      items: [
        fila("trazadoc_document", "doc-1", "PR-01 Despacho", { state: "approved" }),
        // El de otro módulo: su ficha no está en Quality, y el cargador lo dice.
        fila("trazadoc_document", "doc-2", "IN-02 Instructivo · de PCR",
          { state: "approved", href: deepLink("trazadoc_document"), linksToDetail: false }),
      ],
    }),
    seccion("audit_findings", "Hallazgos de auditoría", {
      count: 2, attentionCount: 1, href: deepLink("quality_audit_finding"),
      items: [fila("quality_audit_finding", "find-1", "No se registra la verificación",
        { state: "pending", severity: "major" })],
    }),
    seccion("cases", "Casos y acciones", {
      count: 3, attentionCount: 2, href: deepLink("work_case"),
      items: [fila("work_case", "case-1", "Retraso reiterado", { state: "open" })],
    }),
    seccion("competencies", "Competencias requeridas", {
      count: 1, href: deepLink("quality_competency"),
      items: [fila("quality_competency", "comp-1", "Manejo de montacargas")],
    }),
  ];
}

const REQUISITOS = [{
  requirementId: REQ_ID, partyLabel: "Andina Textil S.A.", linkKind: "addressed_by",
  entryKind: "requirement", requirementKind: "contractual", since: "2026-01-01",
}];

async function main() {
  const { createRoot } = await import("react-dom/client");
  const { act } = await import("react");
  const { QualityProcessCockpit } =
    await import("@/components/domain/quality/process-cockpit");

  async function check(n: string, fn: () => Promise<void>) {
    try { await fn(); passed += 1; console.log(`  ✔ ${n}`); }
    catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? (e.message || e.stack) : e}`); }
  }

  /** Monta el mirador y devuelve el nodo donde quedó. */
  async function pintar(props: Parameters<typeof QualityProcessCockpit>[0]) {
    const host = dom.window.document.createElement("div");
    dom.window.document.getElementById("raiz")!.appendChild(host);
    const root = createRoot(host);
    await act(async () => { root.render(createElement(QualityProcessCockpit, props)); });
    return host;
  }

  const BASE = {
    processId: "proc-1", sections: secciones(), requirements: REQUISITOS,
    derived: [], viewScope: CURRENT,
  } as Parameters<typeof QualityProcessCockpit>[0];

  const texto = (el: Element) => (el.textContent ?? "").replace(/\s+/g, " ").trim();
  const enlaces = (el: Element) =>
    [...el.querySelectorAll("a")].map((a) => ({
      href: a.getAttribute("href") ?? "", texto: texto(a) }));

  console.log("\nQUALITY-13B2 · Mirador de proceso · pintado en un DOM real\n");

  // =========================================================================
  console.log("N · Se pinta, y con las nueve secciones");
  // =========================================================================

  await check("N1. Las nueve secciones aparecen con su nombre", async () => {
    const host = await pintar(BASE);
    for (const s of secciones()) {
      assert(texto(host).includes(s.label), `no se pintó la sección «${s.label}»`);
    }
  });

  await check("N2. Cada sección lleva su etiqueta temporal", async () => {
    const host = await pintar(BASE);
    const cajas = [...host.querySelectorAll("article")];
    assert(cajas.length === 9, `esperaba 9 cajas de sección, hay ${cajas.length}`);
    for (const caja of cajas) {
      assert(texto(caja).includes("Estado actual"),
        `una sección sin momento declarado: «${texto(caja).slice(0, 60)}»`);
    }
  });

  // =========================================================================
  console.log("\nO · El recuento es el del dominio, y la muestra está acotada");
  // =========================================================================

  await check("O1. Cinco riesgos en el dominio y cuatro filas: se enseña 5", async () => {
    const host = await pintar(BASE);
    const caja = [...host.querySelectorAll("article")]
      .find((a) => texto(a).startsWith("Riesgos"))!;
    assert(caja, "no hay caja de riesgos");
    // «5» es el recuento del dominio; en la muestra hay cuatro filas.
    assert(/3 por atender\s*5(?![0-9])/.test(texto(caja)),
      `la cabecera de riesgos dice «${texto(caja).slice(0, 60)}»`);
    assert(caja.querySelectorAll("li").length === 4,
      `la muestra tiene ${caja.querySelectorAll("li").length} filas`);
  });

  await check("O2. Ninguna sección pinta más de cinco filas", async () => {
    const host = await pintar(BASE);
    for (const caja of host.querySelectorAll("article")) {
      const n = caja.querySelectorAll("li").length;
      assert(n <= 5, `una sección pintó ${n} filas: el mirador se convierte en una tabla`);
    }
  });

  // =========================================================================
  console.log("\nP · Los enlaces llevan al dominio dueño, y ninguno se inventa");
  // =========================================================================

  await check("P1. Todos los enlaces son de Quality", async () => {
    const host = await pintar(BASE);
    const todos = enlaces(host);
    assert(todos.length > 0, "el mirador no ofrece ni un destino");
    for (const l of todos) {
      assert(l.href.startsWith("/quality/"), `enlace fuera de Quality: ${l.href}`);
      assert(l.texto.length > 0, `un enlace sin nombre accesible: ${l.href}`);
    }
  });

  await check("P2. La fila de un riesgo lleva a SU ficha", async () => {
    const host = await pintar(BASE);
    assert(enlaces(host).some((l) => l.href === "/quality/risks/risk-0"),
      "el riesgo de la muestra no lleva a su ficha");
  });

  await check("P3. Un hallazgo no fabrica una URL con su identificador", async () => {
    const host = await pintar(BASE);
    for (const l of enlaces(host)) {
      assert(!l.href.includes("find-1"), `se fabricó una URL para el hallazgo: ${l.href}`);
      assert(!l.href.includes("comp-1"), `se fabricó una URL para la competencia: ${l.href}`);
      assert(!l.href.includes(REQ_ID), `se fabricó una URL para el requisito: ${l.href}`);
    }
    // Y su nombre sí se ve: no enlazar no es esconder.
    assert(texto(host).includes("No se registra la verificación"),
      "el hallazgo no se enseña por no tener ficha propia");
  });

  await check("P3b. Un documento de otro módulo se ve sin ficha inventada", async () => {
    const host = await pintar(BASE);
    assert(texto(host).includes("IN-02 Instructivo"),
      "el documento de otro módulo se escondió por no tener ficha aquí");
    for (const l of enlaces(host)) {
      assert(!l.href.includes("doc-2"), `se fabricó una URL de Quality: ${l.href}`);
    }
    assert(enlaces(host).some((l) => l.href === "/quality/documents/doc-1"),
      "el documento propio perdió su ficha");
  });

  await check("P4. Cada sección ofrece su «Ver…», y ninguno crea nada", async () => {
    const host = await pintar(BASE);
    const vistas = enlaces(host).filter((l) => l.texto.startsWith("Ver"));
    assert(vistas.length >= 9, `esperaba un destino por sección, hay ${vistas.length}`);
    for (const l of enlaces(host)) {
      assert(!/crear|nuevo|añadir|agregar|editar/i.test(l.texto),
        `el mirador ofrece «${l.texto}»`);
    }
  });

  // =========================================================================
  console.log("\nQ · De quién viene el requisito");
  // =========================================================================

  await check("Q1. El requisito enseña su parte interesada y cómo se relaciona", async () => {
    const host = await pintar(BASE);
    const caja = [...host.querySelectorAll("article")]
      .find((a) => texto(a).includes("SLA de 48 horas"))!;
    assert(caja, "no se pintó el requisito");
    assert(texto(caja).includes("Andina Textil S.A."),
      "el requisito no dice de qué parte interesada viene");
    assert(texto(caja).includes("Lo gestiona"),
      "el requisito no dice cómo se relaciona con el proceso");
    assert(texto(caja).includes("Pertinente"),
      "el requisito no enseña su pertinencia con la palabra de su dominio");
  });

  await check("Q2. Y se llega a Partes interesadas", async () => {
    const host = await pintar(BASE);
    assert(enlaces(host).some((l) => l.href === "/quality/context/interested-parties"),
      "no hay vuelta a Partes interesadas");
  });

  // =========================================================================
  console.log("\nR · Sin dato NO es cero, en pantalla");
  // =========================================================================

  await check("R1. Una sección DENEGADA no filtra recuento, ni filas, ni destino", async () => {
    const rotas = secciones().map((s) => s.key === "risks"
      ? { ...s, status: "not_visible" as const, count: null, attentionCount: null, items: [],
          reason: "Tu rol no da acceso a este dominio." }
      : s);
    const host = await pintar({ ...BASE, sections: rotas });
    const caja = [...host.querySelectorAll("article")]
      .find((a) => texto(a).startsWith("Riesgos"))!;
    assert(caja, "desapareció la sección denegada en vez de decir que no hay acceso");
    const t = texto(caja);
    assert(/no da acceso/i.test(t), `la sección denegada dice «${t}»`);
    assert(!/\b5\b|\b3\b|\b0\b/.test(t), `la sección denegada filtró un número: «${t}»`);
    assert(!/Riesgo 0|Riesgo 1/.test(t), "la sección denegada filtró etiquetas de filas");
    assert(caja.querySelectorAll("a").length === 0,
      "la sección denegada ofrece la puerta de un dominio que este rol no puede abrir");
  });

  await check("R2. Una sección ROTA dice que no se pudo, no que hay cero", async () => {
    const rotas = secciones().map((s) => s.key === "cases"
      ? { ...s, status: "unavailable" as const, count: null, attentionCount: null, items: [],
          reason: 'PGRST301: permission denied for relation "work_cases"' }
      : s);
    const host = await pintar({ ...BASE, sections: rotas });
    const caja = [...host.querySelectorAll("article")]
      .find((a) => texto(a).startsWith("Casos"))!;
    const t = texto(caja);
    assert(/No fue posible cargar esta sección/i.test(t), `la sección rota dice «${t}»`);
    assert(!/\b0\b/.test(t), `la sección rota enseñó un cero: «${t}»`);
    assert(!/PGRST|permission denied|relation/i.test(texto(host)),
      "el error del motor acabó en pantalla");
  });

  await check("R3. Un fallo de UNA sección no se lleva el mirador", async () => {
    const rotas = secciones().map((s) => s.key === "cases"
      ? { ...s, status: "unavailable" as const, count: null, items: [] } : s);
    const host = await pintar({ ...BASE, sections: rotas });
    assert(host.querySelectorAll("article").length === 9,
      "una sección rota se llevó por delante a las demás");
    assert(texto(host).includes("Riesgo 0"), "las demás secciones dejaron de pintarse");
    assert(/Falta parte del contexto/i.test(texto(host)),
      "no se avisa de que lo que se ve está incompleto");
  });

  await check("R4. Vacío se dice con palabras, no con un cero", async () => {
    const host = await pintar(BASE);
    const caja = [...host.querySelectorAll("article")]
      .find((a) => texto(a).startsWith("Oportunidades"))!;
    assert(/No hay oportunidades relacionadas con este proceso/.test(texto(caja)),
      `la sección vacía dice «${texto(caja)}»`);
    // El 0 sí se enseña como recuento —es un dato cierto— pero acompañado.
    assert(texto(caja).length > 40, "la sección vacía se quedó en un número pelado");
  });

  // =========================================================================
  console.log("\nS · La atención, con su causa y su enlace");
  // =========================================================================

  await check("S1. Tres líneas de atención, cada una con su enlace", async () => {
    const host = await pintar(BASE);
    const bloque = [...host.querySelectorAll("section")]
      .find((s) => texto(s).startsWith("Requiere atención"))!;
    assert(bloque, "no hay bloque de atención");
    const filas = [...bloque.querySelectorAll("li")];
    assert(filas.length === 3, `esperaba 3 puntos de atención, hay ${filas.length}`);
    for (const f of filas) {
      assert(f.querySelector("a"), "un punto de atención sin enlace a su causa");
      assert(/\d/.test(texto(f)), "un punto de atención sin cifra");
      assert(texto(f).includes("Estado actual"), "un punto de atención sin momento");
    }
    assert(texto(bloque).includes("3 riesgos siguen activos"), "no dice qué pasa con los riesgos");
    assert(texto(bloque).includes("1 hallazgo sin evaluar"), "no dice qué pasa con los hallazgos");
    assert(!/no conformidad/i.test(texto(bloque).replace(/no aparece[\s\S]*/, "")),
      "llama no conformidad a un hallazgo");
  });

  await check("S2. Sin nada pendiente NO hay bloque de atención", async () => {
    const tranquilas = secciones().map((s) => ({ ...s, attentionCount: null }));
    const host = await pintar({ ...BASE, sections: tranquilas });
    assert(!texto(host).includes("Requiere atención"),
      "se pinta un bloque de atención vacío en un proceso sin nada pendiente");
  });

  // =========================================================================
  console.log("\nT · El tiempo, cuando no es el mismo");
  // =========================================================================

  await check("T1. Viendo una revisión pasada, se avisa", async () => {
    const host = await pintar({ ...BASE, viewScope: period("2024-01-01", "2024-12-31") });
    const t = texto(host);
    assert(t.includes("2024-01-01") && t.includes("2024-12-31"),
      "no se dice de qué periodo habla el proceso");
    assert(/Estado actual/i.test(t), "no se dice que el contexto es el de hoy");
    assert(/no se reconstruyen/i.test(t),
      "no se explica que esos dominios no se pueden reconstruir a esa fecha");
  });

  await check("T2. Viendo el presente, no se avisa de nada", async () => {
    const host = await pintar(BASE);
    assert(!/no se reconstruyen/i.test(texto(host)),
      "se avisa de una mezcla de momentos que no existe");
  });

  // =========================================================================
  console.log("\nU · Lo derivado");
  // =========================================================================

  const DERIVADO = [{
    key: "derived_suppliers", label: "Proveedores relacionados",
    status: "ok" as const, count: 1,
    items: [{
      subjectKind: "quality_supplier_profile" as const, id: "sup-1", label: "Empaques del Norte",
      via: "Relacionado por un caso abierto desde un incidente de este proveedor",
      href: deepLink("quality_supplier_profile", "sup-1"),
    }],
    href: deepLink("quality_supplier_profile"), temporal: CURRENT,
    note: "Relación DERIVADA de lo que ya es cierto. No es una lista que alguien mantenga a mano.",
  }];

  await check("U1. El proveedor derivado dice por qué camino llegó", async () => {
    const host = await pintar({ ...BASE, derived: DERIVADO });
    const t = texto(host);
    assert(t.includes("Empaques del Norte"), "no se pinta el proveedor derivado");
    assert(t.includes("un caso abierto desde un incidente"),
      "no se explica de dónde sale la relación");
    assert(/DERIVADA/.test(t), "no se advierte que la relación es derivada y no mantenida");
    assert(t.includes("Relacionado indirectamente"),
      "lo derivado se presenta como si fuera una relación directa");
  });

  await check("U2. Sin derivación válida no se pinta el bloque", async () => {
    const host = await pintar(BASE);
    assert(!texto(host).includes("Relacionado indirectamente"),
      "se pinta un bloque de relaciones derivadas vacío");
  });

  // =========================================================================
  console.log("\nV · Estructura, accesibilidad y pantalla pequeña");
  // =========================================================================

  await check("V1. Encabezados anidados en orden, sin saltos", async () => {
    const host = await pintar({ ...BASE, derived: DERIVADO });
    const niveles = [...host.querySelectorAll("h2,h3,h4")]
      .map((h) => Number(h.tagName.slice(1)));
    assert(niveles[0] === 2, `el mirador empieza en h${niveles[0]}`);
    for (let i = 1; i < niveles.length; i += 1) {
      assert(niveles[i] - niveles[i - 1] <= 1,
        `salto de h${niveles[i - 1]} a h${niveles[i]}`);
    }
  });

  await check("V2. Cada región tiene nombre accesible", async () => {
    const host = await pintar({ ...BASE, derived: DERIVADO });
    for (const s of host.querySelectorAll("section, article")) {
      const id = s.getAttribute("aria-labelledby");
      assert(id, `una región sin nombre: «${texto(s).slice(0, 40)}»`);
      assert(host.querySelector(`#${id}`) ?? dom.window.document.getElementById(id!),
        `el nombre accesible apunta a un elemento que no existe: ${id}`);
    }
  });

  await check("V3. Las muestras son listas, no tablas", async () => {
    const host = await pintar({ ...BASE, derived: DERIVADO });
    assert(host.querySelectorAll("table").length === 0,
      "hay una tabla: en un teléfono se sale de la pantalla");
    for (const caja of host.querySelectorAll("article")) {
      const filas = caja.querySelectorAll("li");
      if (filas.length > 0) {
        assert(caja.querySelector("ul"), "hay filas sueltas fuera de una lista");
      }
    }
  });

  await check("V4. Apila en móvil y reparte en escritorio", async () => {
    const host = await pintar({ ...BASE, derived: DERIVADO });
    const rejillas = [...host.querySelectorAll("div")]
      .filter((d) => (d.getAttribute("class") ?? "").includes("grid"));
    assert(rejillas.length > 0, "las secciones no se reparten en ninguna rejilla");
    for (const r of rejillas) {
      const clase = r.getAttribute("class") ?? "";
      assert(clase.includes("sm:grid-cols-"),
        `una rejilla sin punto de ruptura: «${clase}»`);
      assert(!/^\s*grid-cols-[3-9]/.test(clase),
        `una rejilla arranca con varias columnas en móvil: «${clase}»`);
    }
  });

  await check("V5. El estado no se dice solo con color", async () => {
    const host = await pintar(BASE);
    const bloque = [...host.querySelectorAll("section")]
      .find((s) => texto(s).startsWith("Requiere atención"))!;
    // Cada distintivo de color lleva su texto dentro.
    for (const marca of bloque.querySelectorAll("[class*='amber']")) {
      assert(texto(marca).length > 0, "un distintivo de color sin texto que lo explique");
    }
    const caja = [...host.querySelectorAll("article")]
      .find((a) => texto(a).startsWith("Riesgos"))!;
    assert(texto(caja).includes("por atender"),
      "el número de pendientes se distingue solo por el color");
  });

  console.log(`\nQUALITY-13B2 · mirador (pantalla): ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
