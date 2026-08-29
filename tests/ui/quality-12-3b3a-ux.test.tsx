/**
 * Trazaloop · QUALITY-12.3B3A · Los botones, pulsados de verdad.
 *
 * POR QUÉ HACE FALTA ADEMÁS DE LA SUITE ESTÁTICA
 *
 * Porque en QUALITY-12.2C hubo cincuenta y dos comprobaciones en verde
 * mientras el botón no hacía nada: todas nombraban la acción correcta, y esa
 * parte funcionaba. Lo roto era el CABLEADO.
 *
 * Aquí se monta el componente en un DOM real, se pulsa, y se mira qué sale.
 * Las secciones de partes interesadas tienen justo el patrón que se rompe sin
 * avisar: un botón `type="button"` que abre un diálogo y un `requestSubmit()`
 * que envía el formulario desde otro sitio. Si ese hilo se corta, la pantalla
 * sigue pintándose perfecta y no guarda nada.
 *
 * LAS ACCIONES DE SERVIDOR NO SE EJECUTAN. Un escuchador en fase de captura
 * intercepta el envío, se queda con los datos del formulario y lo cancela: lo
 * que se comprueba es que el envío OCURRE y con QUÉ, no qué hace el servidor,
 * que es lo que prueban las suites contra base real.
 *
 * Correr: npm run test:quality123b3a-ui
 */
import { JSDOM } from "jsdom";
import { createElement, StrictMode } from "react";

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

/** Lo que un envío interceptado deja ver. */
type Envio = { campos: Record<string, string[]> };

async function main() {
  const { createRoot } = await import("react-dom/client");
  const { act } = await import("react");
  const { AssessmentSection } =
    await import("@/components/domain/quality/interested-parties/assessment-section");
  const { RequirementsSection } =
    await import("@/components/domain/quality/interested-parties/requirements-section");
  const { StrategiesSection } =
    await import("@/components/domain/quality/interested-parties/strategies-section");
  const { ReviewsSection } =
    await import("@/components/domain/quality/interested-parties/reviews-section");
  const { InterestedPartyDetail } =
    await import("@/components/domain/quality/interested-parties/detail-view");

  async function check(n: string, fn: () => Promise<void>) {
    try { await fn(); passed += 1; console.log(`  ✔ ${n}`); }
    catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? (e.message || e.stack) : e}`); }
  }

  /** Los botones que envían un formulario de ESCRITURA. Los formularios GET
   *  —buscar, ver una fecha— navegan y deben seguir funcionando siempre. */
  function botonesQueEscriben(host: Element): Element[] {
    return [...host.querySelectorAll('button[type="submit"]')]
      .filter((b) => (b.closest("form")?.getAttribute("method") ?? "").toLowerCase() !== "get");
  }

  const envios: Envio[] = [];
  /** Cuántos envíos se han interceptado.
   *
   *  Es una función y no `envios.length` a pelo porque TypeScript, tras un
   *  `assert(envios.length === 0)`, estrecha el tipo a `0` y declara
   *  «imposible» la comprobación siguiente —que es justo la que importa: que
   *  el envío SÍ ocurrió al confirmar—. */
  const cuantos = () => envios.length;
  // Fase de CAPTURA: corre antes que el escuchador delegado de React, así que
  // la acción de servidor nunca llega a invocarse.
  dom.window.document.addEventListener("submit", (ev: Event) => {
    const form = ev.target as HTMLFormElement;
    const fd = new dom.window.FormData(form);
    const campos: Record<string, string[]> = {};
    for (const [k, v] of fd.entries()) {
      campos[k] = [...(campos[k] ?? []), String(v)];
    }
    envios.push({ campos });
    ev.preventDefault();
    ev.stopPropagation();
  }, true);

  async function montar(elemento: React.ReactElement) {
    const host = dom.window.document.createElement("div");
    dom.window.document.getElementById("raiz")!.replaceChildren(host);
    const root = createRoot(host);
    await act(async () => { root.render(createElement(StrictMode, null, elemento)); });
    return {
      host,
      texto: () => host.textContent ?? "",
      botones: () => [...host.querySelectorAll("button")],
      boton: (etiqueta: string) =>
        [...host.querySelectorAll("button")]
          .find((b) => (b.textContent ?? "").trim().includes(etiqueta)) ?? null,
      abrirTodo: async () => {
        await act(async () => {
          for (const d of host.querySelectorAll("details")) d.setAttribute("open", "");
        });
      },
      click: async (etiqueta: string) => {
        // Exacto primero: «Sustituir» y «Sustituir análisis» conviven en la
        // misma pantalla —el segundo abre el diálogo, el primero confirma— y
        // buscar por contenido pulsaría siempre el que abre.
        const todos = [...host.querySelectorAll("button")];
        const b = todos.find((x) => (x.textContent ?? "").trim() === etiqueta)
          ?? todos.find((x) => (x.textContent ?? "").trim().includes(etiqueta));
        assert(b, `no existe el botón «${etiqueta}»`);
        await act(async () => {
          b!.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
        });
      },
      marcar: async (name: string, value: string) => {
        const el = host.querySelector(
          `input[name="${name}"][value="${value}"]`) as HTMLInputElement | null;
        assert(el, `no existe la casilla ${name}=${value}`);
        // NO se asigna `checked` a mano. React lleva un rastreador del valor
        // de cada campo y solo dispara `onChange` cuando detecta un cambio
        // respecto a lo que él anotó; asignar la propiedad primero actualiza
        // ese rastreador y el evento posterior se descarta por «no cambió
        // nada». Un clic de verdad marca el radio y notifica.
        await act(async () => {
          el!.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
        });
      },
      escribir: async (name: string, value: string) => {
        const el = host.querySelector(
          `[name="${name}"]`) as HTMLInputElement | HTMLTextAreaElement | null;
        assert(el, `no existe el campo ${name}`);
        await act(async () => {
          el!.value = value;
          el!.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
          el!.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
        });
      },
    };
  }

  const ANALISIS = {
    id: "a-1", categoryId: "c-1", categoryName: "Clientes",
    subjectKind: "external_party" as const, subjectId: "p-1", subjectLabel: "IntegraCo",
    assessedOn: "2026-06-01", ownerPositionId: null,
    relevanceStatus: "relevant" as const, relevanceRationale: "Cliente principal.",
    priorityLabel: null, priorityScore: null, priorityMethodNote: null,
    summary: "Primera lectura.", effectiveFrom: "2026-06-01", effectiveTo: null,
    supersedesId: null, status: "current",
  };

  const NECESIDAD = {
    id: "r-1", assessmentId: "a-1", entryKind: "need" as const, requirementKind: null,
    code: null, title: "Entregas en menos de 48 horas", description: null, sourceNote: null,
    derivedFromId: null, conversionRationale: null, relevanceStatus: "relevant" as const,
    relevanceRationale: null, effectiveFrom: "2026-06-01", effectiveTo: null,
  };
  const REQUISITO = {
    ...NECESIDAD, id: "r-2", entryKind: "requirement" as const,
    requirementKind: "contractual", title: "SLA de 48 horas",
  };
  const OTRO_REQUISITO = { ...REQUISITO, id: "r-3", title: "Certificado de origen" };

  const ESTRATEGIA = {
    id: "e-1", assessmentId: "a-1", title: "Plan de servicio",
    purpose: null, approach: null, ownerPositionId: "pos-1", ownerPositionName: "Jefe de planta",
    monitoringMethod: "indicator", monitoringNote: null, reviewCadenceMonths: 6,
    nextReviewOn: "2027-01-01", lastReviewedOn: "2026-07-01", status: "active",
    effectiveFrom: "2026-06-01", effectiveTo: null,
    requirementIds: ["r-2"], requirementLinks: [{ linkId: "l-1", requirementId: "r-2" }],
    reviewState: "up_to_date" as const,
  };

  console.log("\nQUALITY-12.3B3A · Cableado de la interfaz\n");

  // =========================================================================
  await check("AH. Sustituir NO envía nada hasta confirmar, y al confirmar sí envía", async () => {
    envios.length = 0;
    const v = await montar(createElement(AssessmentSection, {
      assessment: ANALISIS, canMutate: true, historyCount: 1,
    }));
    await v.abrirTodo();

    await v.click("Sustituir análisis");
    assert(cuantos() === 0, "el formulario se envió antes de confirmar");
    assert(/se conservará completo como histórico/.test(v.texto()),
      "el diálogo no explica que el análisis anterior se conserva");

    await v.click("Sustituir");
    assert(cuantos() === 1, `esperaba 1 envío tras confirmar, hubo ${cuantos()}`);
    assert(envios[0].campos.assessment_id?.[0] === "a-1",
      "el envío no lleva el análisis que se sustituye");
    assert(envios[0].campos.relevance_status?.[0] === "relevant",
      "el envío no lleva la pertinencia");
  });

  await check("AI. Cancelar la confirmación no envía nada", async () => {
    envios.length = 0;
    const v = await montar(createElement(AssessmentSection, {
      assessment: ANALISIS, canMutate: true, historyCount: 1,
    }));
    await v.abrirTodo();
    await v.click("Sustituir análisis");
    await v.click("Cancelar");
    assert(cuantos() === 0, "cancelar envió el formulario igualmente");
  });

  await check("AJ. Sin permiso no hay formulario de sustitución", async () => {
    const v = await montar(createElement(AssessmentSection, {
      assessment: ANALISIS, canMutate: false, historyCount: 1,
    }));
    await v.abrirTodo();
    assert(v.boton("Sustituir análisis") === null,
      "se ofrece sustituir a quien no puede administrar");
    assert(/Cliente principal/.test(v.texto()), "sin permiso tampoco se puede leer");
  });

  await check("AK. Convertir exige motivo y solo envía tras confirmar", async () => {
    envios.length = 0;
    const v = await montar(createElement(RequirementsSection, {
      assessmentId: "a-1", requirements: [NECESIDAD], processLinks: [], processes: [],
      canMutate: true,
    }));
    await v.abrirTodo();
    await v.escribir("rationale", "Quedó firmado en el contrato marco.");
    await v.escribir("requirement_kind", "contractual");

    await v.click("Convertir");
    assert(cuantos() === 0, "convertir envió sin confirmar");
    assert(/no se\s+reetiqueta ni se borra|se conserva tal cual/.test(v.texto()),
      "el diálogo no dice que la entrada de origen se conserva");

    const confirmar = v.botones().filter((b) => (b.textContent ?? "").trim() === "Convertir");
    assert(confirmar.length >= 1, "no hay botón de confirmación");
    await act(async () => {
      confirmar[confirmar.length - 1]
        .dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    });
    assert(cuantos() === 1, `esperaba 1 envío, hubo ${cuantos()}`);
    assert(envios[0].campos.origin_id?.[0] === "r-1", "el envío no lleva la entrada de origen");
    assert(envios[0].campos.rationale?.[0]?.includes("contrato"),
      "el envío no lleva el motivo de la conversión");
  });

  await check("AK2. El alta de una entrada viaja CON el análisis al que pertenece", async () => {
    // EL DEFECTO QUE ESTA COMPROBACIÓN EXISTE PARA IMPEDIR
    //
    // La primera versión de esta sección no recibía `assessmentId` y su
    // formulario no llevaba el campo. Se pintaba entero, se enviaba, y la
    // acción respondía «falta el análisis al que pertenece»: no se podía
    // registrar ni una necesidad desde la interfaz.
    //
    // Ninguna prueba lo vio. La estática no podía —el campo no existía, así
    // que no había nada que buscar— y esta comprobaba que el envío OCURRÍA,
    // no QUÉ llevaba. Lo encontró un navegador de verdad al pulsar el botón.
    envios.length = 0;
    const v = await montar(createElement(RequirementsSection, {
      assessmentId: "a-1", requirements: [], processLinks: [], processes: [],
      canMutate: true,
    }));
    await v.abrirTodo();
    await v.escribir("title", "Entrega en menos de 48 horas");
    await v.click("Registrar");
    assert(cuantos() === 1, `esperaba 1 envío, hubo ${cuantos()}`);
    assert(envios[0].campos.assessment_id?.[0] === "a-1",
      "el alta de una entrada no dice a qué análisis pertenece");
    assert(envios[0].campos.entry_kind?.[0] === "need",
      "el tipo por omisión debía ser «necesidad»");
  });

  await check("AL. Una necesidad NO ofrece convertirse en proceso ni pide subtipo al listarse", async () => {
    const v = await montar(createElement(RequirementsSection, {
      assessmentId: "a-1", requirements: [NECESIDAD], processLinks: [],
      processes: [{ id: "p1", name: "Despacho" }], canMutate: true,
    }));
    await v.abrirTodo();
    // Los procesos cuelgan del REQUISITO, no de la necesidad.
    assert(!/Procesos relacionados/.test(v.texto()),
      "se ofrecen procesos para una necesidad, que todavía no obliga a nada");
  });

  await check("AM. Un requisito sí ofrece relacionar procesos, y con su vigencia", async () => {
    const v = await montar(createElement(RequirementsSection, {
      assessmentId: "a-1", requirements: [REQUISITO],
      processLinks: [{
        id: "l-9", requirementId: "r-2", processId: "p1", processName: "Despacho",
        processRevisionId: null, linkKind: "addressed_by" as const, note: null,
        effectiveFrom: "2026-06-10", effectiveTo: null,
      }],
      processes: [{ id: "p1", name: "Despacho" }], canMutate: true,
    }));
    await v.abrirTodo();
    assert(/Procesos relacionados/.test(v.texto()), "no se muestran los procesos del requisito");
    assert(/desde 2026-06-10/.test(v.texto()), "no se dice desde cuándo rige el vínculo");
    assert(v.boton("Terminar vínculo") !== null, "no se puede terminar el vínculo");
  });

  await check("AN. La estrategia multi-requisito envía VARIOS requirement_ids", async () => {
    envios.length = 0;
    const v = await montar(createElement(StrategiesSection, {
      assessmentId: "a-1", strategies: [],
      requirements: [REQUISITO, OTRO_REQUISITO],
      positions: [{ id: "pos-1", name: "Jefe de planta" }], canMutate: true,
    }));
    await v.abrirTodo();
    await v.escribir("title", "Plan de cumplimiento documental");
    await v.marcar("scope", "specific");

    const casillas = [
      ...v.host.querySelectorAll('input[name="requirement_ids"]')] as HTMLInputElement[];
    assert(casillas.length === 2, `esperaba 2 requisitos elegibles, hay ${casillas.length}`);
    await act(async () => {
      for (const c of casillas) {
        c.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
      }
    });

    await v.click("Crear estrategia");
    assert(cuantos() === 1, `esperaba 1 envío, hubo ${cuantos()}`);
    assert(envios[0].campos.requirement_ids?.length === 2,
      `esperaba 2 requisitos en el envío, llegaron ${envios[0].campos.requirement_ids?.length ?? 0}`);
    assert(envios[0].campos.assessment_id?.[0] === "a-1", "el envío no dice a qué análisis pertenece");
  });

  await check("AO. La estrategia general no envía ningún requisito", async () => {
    envios.length = 0;
    const v = await montar(createElement(StrategiesSection, {
      assessmentId: "a-1", strategies: [], requirements: [REQUISITO],
      positions: [{ id: "pos-1", name: "Jefe de planta" }], canMutate: true,
    }));
    await v.abrirTodo();
    await v.escribir("title", "Relación institucional");
    await v.click("Crear estrategia");
    assert(cuantos() === 1, `esperaba 1 envío, hubo ${cuantos()}`);
    assert(envios[0].campos.requirement_ids === undefined,
      "una estrategia general envió requisitos");
  });

  await check("AP. El alcance de una estrategia existente se lee de sus vínculos", async () => {
    const v = await montar(createElement(StrategiesSection, {
      assessmentId: "a-1", strategies: [ESTRATEGIA], requirements: [REQUISITO],
      positions: [{ id: "pos-1", name: "Jefe de planta" }], canMutate: true,
    }));
    assert(/Atiende un requisito/.test(v.texto()),
      "una estrategia con un vínculo no se presenta como específica");
    assert(/Jefe de planta/.test(v.texto()), "no se muestra el cargo responsable");
    assert(/Al día/.test(v.texto()), "no se muestra el estado de revisión");
  });

  await check("AQ. «Revisado, sin cambios» viaja como tal", async () => {
    envios.length = 0;
    const v = await montar(createElement(ReviewsSection, {
      assessmentId: "a-1", strategies: [ESTRATEGIA], reviews: [], canMutate: true,
    }));
    await v.abrirTodo();
    await v.click("Registrar revisión");
    assert(cuantos() === 1, `esperaba 1 envío, hubo ${cuantos()}`);
    assert(envios[0].campos.verdict?.[0] === "no_changes",
      `el veredicto por omisión debía ser no_changes, fue ${envios[0].campos.verdict?.[0]}`);
    assert(envios[0].campos.assessment_id?.[0] === "a-1",
      "la revisión no dice sobre qué análisis se hizo");
  });

  await check("AR. «Se requieren cambios» también, y no fabrica un análisis", async () => {
    envios.length = 0;
    const v = await montar(createElement(ReviewsSection, {
      assessmentId: "a-1", strategies: [ESTRATEGIA], reviews: [], canMutate: true,
    }));
    await v.abrirTodo();
    await v.marcar("verdict", "changes_applied");
    await v.click("Registrar revisión");
    assert(envios[0].campos.verdict?.[0] === "changes_applied", "el veredicto no viajó");
    assert(/El cambio se hace donde toque/.test(v.texto()),
      "no se explica que la revisión es el acta, no el cambio");
  });

  // =========================================================================
  const FICHA = {
    assessment: ANALISIS, history: [ANALISIS], requirements: [REQUISITO],
    processLinks: [], strategies: [ESTRATEGIA], allStrategies: [ESTRATEGIA],
    reviews: [], processes: [{ id: "p1", name: "Despacho" }],
    positions: [{ id: "pos-1", name: "Jefe de planta" }],
    refs: [], refLabels: new Map<string, string>(), customer: null, supplier: null,
    relKind: null, relQuery: "", relOptions: [],
    basePath: "/quality/context/interested-parties/a-1",
    listPath: "/quality/context/interested-parties",
  };

  await check("AS. En modo histórico la ficha se anuncia y NO tiene botones que escriban", async () => {
    const v = await montar(createElement(InterestedPartyDetail, {
      ...FICHA, canManage: true, asOf: "2026-03-15",
    }));
    await v.abrirTodo();
    assert(/Estás viendo el estado del 2026-03-15/.test(v.texto()),
      "no se anuncia que se está mirando el pasado");
    for (const prohibido of ["Sustituir análisis", "Registrar", "Crear estrategia",
                             "Convertir", "Retirar", "Relacionar proceso"]) {
      assert(v.boton(prohibido) === null,
        `en modo histórico se ofrece «${prohibido}»`);
    }
    // Se cuentan los envíos que ESCRIBEN. El de «Ver ese día» es un formulario
    // GET que solo navega: apagarlo dejaría el modo histórico sin salida.
    assert(botonesQueEscriben(v.host).length === 0,
      `en modo histórico quedaron ${botonesQueEscriben(v.host).length} botones que escriben`);
  });

  await check("AT. Sin permiso la ficha se lee entera y no ofrece escribir", async () => {
    const v = await montar(createElement(InterestedPartyDetail, {
      ...FICHA, canManage: false, asOf: null,
    }));
    await v.abrirTodo();
    assert(/IntegraCo/.test(v.texto()), "no se puede leer la ficha");
    assert(/SLA de 48 horas/.test(v.texto()), "no se leen los requisitos");
    assert(/Plan de servicio/.test(v.texto()), "no se leen las estrategias");
    assert(botonesQueEscriben(v.host).length === 0,
      `sin permiso quedaron ${botonesQueEscriben(v.host).length} botones que escriben`);
  });

  await check("AU. Con permiso y en el presente, la ficha sí deja trabajar", async () => {
    const v = await montar(createElement(InterestedPartyDetail, {
      ...FICHA, canManage: true, asOf: null,
    }));
    await v.abrirTodo();
    assert(v.boton("Sustituir análisis") !== null, "no se puede sustituir el análisis");
    assert(v.boton("Crear estrategia") !== null, "no se puede crear una estrategia");
    assert(v.boton("Registrar revisión") !== null, "no se puede registrar una revisión");
    assert(!/Estás viendo el estado/.test(v.texto()),
      "se anuncia modo histórico sin estarlo");
  });

  console.log(`\n  ${passed} correctas, ${failed} fallidas\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
