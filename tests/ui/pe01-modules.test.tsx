/**
 * Trazaloop · PE-01B · La puerta, pintada de verdad.
 *
 * Lo que ninguna prueba de código fuente garantiza: que la jerarquía llegue al
 * HTML, que una tarjeta sin destino NO sea un enlace, y que un módulo que no se
 * pudo comprobar no acabe diciendo «no lo tienes» por otro camino.
 *
 * Correr: npm run test:pe01-modules-ui
 */
import { JSDOM } from "jsdom";
import { createElement } from "react";
import type { DerivedModuleState } from "@/lib/modules/access";
import { ENTRY_COPY, enterLabel } from "@/lib/modules/entry";
import { COMMERCIAL_MODULES } from "@/lib/modules/catalog";
import type { ModuleEntryModel } from "@/components/domain/modules/module-entry";

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

function modelo(
  key: string, state: DerivedModuleState, over: Partial<ModuleEntryModel> = {}
): ModuleEntryModel {
  const mod = COMMERCIAL_MODULES.find((m) => m.key === key)!;
  return {
    key, name: mod.name, copy: ENTRY_COPY[mod.key], state,
    expiresAt: null, href: mod.homePath, enterLabel: enterLabel(mod), ...over,
  };
}

async function main() {
  const { createRoot } = await import("react-dom/client");
  const { act } = await import("react");
  const { HeroModuleCard, SpecializedModuleCard } =
    await import("@/components/domain/modules/module-entry");

  async function check(n: string, fn: () => Promise<void>) {
    try { await fn(); passed += 1; console.log(`  ✔ ${n}`); }
    catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? (e.message || e.stack) : e}`); }
  }

  async function pintar(node: React.ReactElement) {
    const host = dom.window.document.createElement("div");
    dom.window.document.getElementById("raiz")!.appendChild(host);
    const root = createRoot(host);
    await act(async () => { root.render(node); });
    return host;
  }

  const texto = (el: Element) => (el.textContent ?? "").replace(/\s+/g, " ").trim();

  console.log("\nPE-01B · La puerta · pintada en un DOM real\n");

  // =========================================================================
  console.log("I · El protagonista");
  // =========================================================================

  await check("I1. Quality se pinta con su frase y su entrada", async () => {
    const host = await pintar(createElement(HeroModuleCard, { model: modelo("quality", "full") }));
    const t = texto(host);
    assert(t.includes("Trazaloop Quality"), "no se ve el nombre");
    assert(t.includes("Gestiona procesos, riesgos, objetivos"), "no se ve la frase acordada");
    assert(t.includes("Activo"), "no se ve el estado");
    const a = host.querySelector("a");
    assert(a?.getAttribute("href") === "/quality", `la entrada lleva a ${a?.getAttribute("href")}`);
    assert(texto(a!).includes("Entrar a Quality"), `el botón dice «${texto(a!)}»`);
  });

  await check("I2. Es un encabezado de nivel dos, y su región tiene nombre", async () => {
    const host = await pintar(createElement(HeroModuleCard, { model: modelo("quality", "full") }));
    const h2 = host.querySelector("h2");
    assert(h2 && texto(h2) === "Trazaloop Quality", "el protagonista no es un h2 con su nombre");
    const sec = host.querySelector("section");
    assert(sec?.getAttribute("aria-labelledby") === "hero-module",
      "la región del protagonista no tiene nombre accesible");
  });

  await check("I3. Sin acceso sigue siendo el protagonista, y NO ofrece entrada", async () => {
    const host = await pintar(createElement(HeroModuleCard,
      { model: modelo("quality", "not_assigned") }));
    const t = texto(host);
    assert(t.includes("Trazaloop Quality"), "desaparece cuando no se tiene");
    assert(t.includes("No incluido"), "no dice que no está incluido");
    assert(t.includes("no forma parte del acceso"), "no explica qué significa");
    assert(host.querySelectorAll("a").length === 0, "ofrece entrar a un módulo que no tiene");
  });

  // =========================================================================
  console.log("\nJ · Enlace solo si lleva a algún sitio");
  // =========================================================================

  await check("J1. Un módulo entrable ES un enlace", async () => {
    const host = await pintar(createElement(SpecializedModuleCard,
      { model: modelo("cpr", "demo_active", { expiresAt: "2026-12-31T12:00:00Z" }) }));
    const a = host.querySelector("a");
    assert(a?.getAttribute("href") === "/dashboard", "el módulo entrable no enlaza");
    assert(texto(host).includes("Prueba"), "no se ve que es una prueba");
    assert(texto(host).includes("Vence el"), "no se dice cuándo vence");
  });

  await check("J2. «Próximamente» NO es un enlace ni un botón deshabilitado", async () => {
    const host = await pintar(createElement(SpecializedModuleCard,
      { model: modelo("construccion", "coming_soon") }));
    assert(host.querySelectorAll("a").length === 0, "el futuro se ofrece como enlace");
    assert(host.querySelectorAll("button").length === 0,
      "el futuro se ofrece como botón deshabilitado, que se anuncia igual");
    const art = host.querySelector("article");
    assert(art, "no es un artículo");
    assert((art!.getAttribute("aria-label") ?? "").includes("Próximamente"),
      "el artículo no dice su estado en su nombre accesible");
    assert(texto(host).includes("Todavía no está disponible"), "no se explica");
  });

  await check("J3. Un módulo no incluido tampoco enlaza", async () => {
    const host = await pintar(createElement(SpecializedModuleCard,
      { model: modelo("textiles", "not_assigned") }));
    assert(host.querySelectorAll("a").length === 0, "ofrece entrar a lo que no se tiene");
    assert(texto(host).includes("Trazaloop Textiles"), "el módulo desaparece");
    assert(texto(host).includes("No incluido"), "no se ve su estado");
  });

  // =========================================================================
  console.log("\nK · «No se pudo comprobar» NO es «no lo tienes» · PE-D1");
  // =========================================================================

  await check("K1. Se ve distinto, y no afirma nada del contrato", async () => {
    const roto = await pintar(createElement(SpecializedModuleCard,
      { model: modelo("cpr", "unavailable") }));
    const t = texto(roto);
    assert(t.includes("No se pudo verificar"), `dice «${t}»`);
    assert(t.includes("No fue posible verificar el acceso"), "no explica qué pasó");
    assert(!/no incluido|no forma parte|no está asignado/i.test(t),
      "afirma algo sobre lo contratado cuando no lo sabe");
    assert(roto.querySelectorAll("a").length === 0, "ofrece entrar a lo que no pudo comprobar");
  });

  await check("K2. Y no filtra el error técnico", async () => {
    const host = await pintar(createElement(SpecializedModuleCard,
      { model: modelo("cpr", "unavailable") }));
    const t = texto(host);
    for (const p of ["PGRST", "SQL", "null", "undefined", "error:", "Error"]) {
      assert(!t.includes(p), `filtra jerga del motor: «${p}»`);
    }
  });

  await check("K3. El protagonista tampoco miente cuando no se sabe", async () => {
    const host = await pintar(createElement(HeroModuleCard,
      { model: modelo("quality", "unavailable") }));
    const t = texto(host);
    assert(t.includes("No se pudo verificar"), `el protagonista dice «${t.slice(0, 60)}»`);
    assert(host.querySelectorAll("a").length === 0, "ofrece entrar sin haber comprobado");
  });

  // =========================================================================
  console.log("\nL · Estado con texto, y jerarquía visible");
  // =========================================================================

  await check("L1. Ningún estado se dice solo con color", async () => {
    const estados: DerivedModuleState[] = ["full", "extra", "demo_active", "demo_permanent",
      "demo_expired", "not_assigned", "disabled", "globally_disabled", "coming_soon",
      "unavailable"];
    for (const s of estados) {
      const host = await pintar(createElement(SpecializedModuleCard,
        { model: modelo("cpr", s, { expiresAt: s === "demo_active" ? "2026-12-31T12:00:00Z" : null }) }));
      const marcas = [...host.querySelectorAll("span")]
        .filter((x) => (x.getAttribute("class") ?? "").includes("rounded-full"));
      assert(marcas.length > 0, `${s} no tiene distintivo`);
      assert(texto(marcas[0]).length > 3, `${s} tiene un distintivo sin texto`);
    }
  });

  await check("L2. El protagonista es visualmente mayor que un especializado", async () => {
    const hero = await pintar(createElement(HeroModuleCard, { model: modelo("quality", "full") }));
    const card = await pintar(createElement(SpecializedModuleCard, { model: modelo("cpr", "full") }));
    const heroTitulo = hero.querySelector("h2")!.getAttribute("class") ?? "";
    assert(/text-2xl|text-3xl/.test(heroTitulo), `el protagonista titula con «${heroTitulo}»`);
    const cardTitulo = [...card.querySelectorAll("span")]
      .find((x) => texto(x) === "Trazaloop PCR")!.getAttribute("class") ?? "";
    assert(/text-base|text-lg/.test(cardTitulo), `el especializado titula con «${cardTitulo}»`);
    assert(heroTitulo !== cardTitulo, "los dos se pintan igual: no hay jerarquía");
  });

  await check("L3. Un especializado no usa un encabezado que compita", async () => {
    const host = await pintar(createElement(SpecializedModuleCard, { model: modelo("cpr", "full") }));
    assert(host.querySelectorAll("h1,h2").length === 0,
      "un módulo secundario usa un encabezado de la altura del protagonista");
  });

  console.log(`\nPE-01B · puerta (pantalla): ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
