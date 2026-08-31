/**
 * Trazaloop · PE-02B2 · La consola, pintada de verdad.
 *
 * Lo que ninguna prueba de código fuente garantiza: que la vista previa
 * distinga de verdad las dos caras, que la procedencia interna no acabe en el
 * HTML de una respuesta, y que el aviso de por qué no se puede publicar se lea
 * antes de pulsar nada.
 *
 * Correr: npm run test:pe02b2-admin-ui
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

const BASE = {
  question: "¿Puede otra empresa ver mi información?",
  answerShort: "No. Cada empresa solo ve lo suyo.",
  answerLong: "El detalle largo de la respuesta.",
  categoryLabel: "Seguridad y privacidad",
  isFeatured: true,
  moduleNames: [] as string[],
};

async function main() {
  const { createRoot } = await import("react-dom/client");
  const { act } = await import("react");
  const { FaqPreview, FaqGovernancePanel } =
    await import("@/components/domain/faq/faq-preview");
  const { faqPublishBlockReason } = await import("@/lib/domain/faq-admin");

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

  console.log("\nPE-02B2 · La consola · pintada en un DOM real\n");

  // =========================================================================
  console.log("A · La vista previa y sus dos caras");
  // =========================================================================

  await check("A1. Una respuesta pública se ve en las dos caras", async () => {
    const host = await pintar(createElement(FaqPreview,
      { view: { ...BASE, visibility: "public" } }));
    const t = texto(host);
    assert(t.includes("Cara pública"), "no hay cara pública");
    assert(t.includes("Cara con sesión"), "no hay cara con sesión");
    const articulos = host.querySelectorAll("article");
    assert(articulos.length === 2, `se pintan ${articulos.length} caras y deberían ser 2`);
    for (const a of articulos) {
      assert(texto(a).includes(BASE.question), "una cara no lleva la pregunta");
      assert(texto(a).includes("Cada empresa solo ve lo suyo"), "una cara no lleva la respuesta");
    }
  });

  await check("A2. Una respuesta con sesión NO aparece en la cara pública", async () => {
    const host = await pintar(createElement(FaqPreview,
      { view: { ...BASE, visibility: "authenticated" } }));
    const articulos = host.querySelectorAll("article");
    assert(articulos.length === 1, `se pintan ${articulos.length} respuestas y debería ser 1`);
    const t = texto(host);
    assert(t.includes("no aparece"),
      "no se avisa de que no saldrá para quien no ha iniciado sesión");
    // Y el aviso está en la cara pública, no escondido al final.
    const secciones = [...host.querySelectorAll("section")];
    assert(texto(secciones[0]).includes("no aparece"),
      "el aviso no está donde se busca: en la cara pública");
  });

  await check("A3. Y se dice que esto todavía no lo ve nadie", async () => {
    const host = await pintar(createElement(FaqPreview,
      { view: { ...BASE, visibility: "public" } }));
    assert(/todavía no lo ve nadie fuera de esta consola/i.test(texto(host)),
      "la vista previa no aclara que no publica nada");
  });

  await check("A4. La vista previa NO pinta la procedencia interna", async () => {
    const host = await pintar(createElement(FaqPreview,
      { view: { ...BASE, visibility: "public" } }));
    const t = texto(host).toLowerCase();
    for (const p of ["verificada", "se apoya", "salvedad", "política externa",
      "comprobada el", "procedencia"]) {
      assert(!t.includes(p), `la vista previa filtra «${p}»`);
    }
  });

  // =========================================================================
  console.log("\nB · El bloque de procedencia");
  // =========================================================================

  await check("B1. Se pinta aparte, y dice que no se publica", async () => {
    const host = await pintar(createElement(FaqGovernancePanel, {
      verificationStatus: "verified",
      sourceBasis: "PE-02A §1 · medición del esquema",
      verificationNote: null, externalSourceUrl: null,
      externalSourceCheckedOn: null, blockReason: null,
    }));
    const t = texto(host);
    assert(t.includes("solo para la plataforma"), "no se dice para quién es");
    assert(t.includes("PE-02A §1"), "no se ve en qué se apoya");
    assert(t.includes("Nada de este bloque sale"),
      "no se dice que la procedencia no se publica");
  });

  await check("B2. Cuando no se puede publicar, se dice POR QUÉ y se ve", async () => {
    const razon = faqPublishBlockReason({
      verificationStatus: "external_policy_verification_required",
      verificationNote: null, externalSourceUrl: null, externalSourceCheckedOn: null,
    });
    assert(razon, "no hay explicación");
    const host = await pintar(createElement(FaqGovernancePanel, {
      verificationStatus: "external_policy_verification_required",
      sourceBasis: null, verificationNote: null, externalSourceUrl: null,
      externalSourceCheckedOn: null, blockReason: razon,
    }));
    const t = texto(host);
    assert(t.includes("Todavía no se puede publicar"), "no se anuncia el bloqueo");
    assert(t.includes("política de un tercero"), "no se explica de qué depende");
    const aviso = host.querySelector('[role="status"]');
    assert(aviso, "el aviso no se anuncia como tal a un lector de pantalla");
  });

  await check("B3. Y cuando sí se puede, no hay aviso que estorbe", async () => {
    const host = await pintar(createElement(FaqGovernancePanel, {
      verificationStatus: "verified", sourceBasis: "prueba",
      verificationNote: null, externalSourceUrl: null,
      externalSourceCheckedOn: null, blockReason: null,
    }));
    assert(!texto(host).includes("Todavía no se puede publicar"),
      "se avisa de un bloqueo que no existe");
    assert(host.querySelectorAll('[role="status"]').length === 0,
      "se anuncia una alerta cuando no hay nada que alertar");
  });

  await check("B4. El estado se dice con TEXTO, no solo con color", async () => {
    for (const estado of ["verified", "verified_with_qualifier",
      "external_policy_verification_required", "not_verified", "must_not_claim"] as const) {
      const host = await pintar(createElement(FaqGovernancePanel, {
        verificationStatus: estado, sourceBasis: null, verificationNote: null,
        externalSourceUrl: null, externalSourceCheckedOn: null, blockReason: null,
      }));
      const marcas = [...host.querySelectorAll("span")]
        .filter((x) => (x.getAttribute("class") ?? "").includes("rounded-full"));
      assert(marcas.length > 0 && texto(marcas[0]).length > 3,
        `«${estado}» no se dice con palabras`);
    }
  });

  // =========================================================================
  console.log("\nC · Las razones, en el idioma de quien las lee");
  // =========================================================================

  await check("C1. Cada bloqueo explica qué hacer, no solo que no se puede", async () => {
    const casos = [
      { v: "external_policy_verification_required" as const, esperado: /compru[eé]bala/i },
      { v: "not_verified" as const, esperado: /en qué se apoya/i },
      { v: "must_not_claim" as const, esperado: /no es cierto|no afirmable/i },
    ];
    for (const c of casos) {
      const razon = faqPublishBlockReason({
        verificationStatus: c.v, verificationNote: null,
        externalSourceUrl: null, externalSourceCheckedOn: null,
      });
      assert(razon && c.esperado.test(razon),
        `«${c.v}» se explica mal: «${razon}»`);
      assert(!/PGRST|SQL|constraint|null/i.test(razon!),
        `«${c.v}» filtra jerga del motor`);
    }
  });

  await check("C2. Sin borrador, se dice que no hay nada que publicar", async () => {
    const razon = faqPublishBlockReason(null);
    assert(razon && /borrador/i.test(razon), `dice «${razon}»`);
  });

  await check("C3. Una fecha que falta se cuenta como lo que es", async () => {
    const razon = faqPublishBlockReason({
      verificationStatus: "verified", verificationNote: null,
      externalSourceUrl: "https://openai.com/policies/", externalSourceCheckedOn: null,
    });
    assert(razon && /qué día la comprobaste/i.test(razon), `dice «${razon}»`);
    assert(razon.includes("cambia"),
      "no se explica por qué importa la fecha de una política ajena");
  });

  console.log(`\nPE-02B2 · consola (pantalla): ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
