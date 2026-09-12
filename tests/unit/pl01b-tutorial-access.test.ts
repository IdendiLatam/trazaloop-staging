/**
 * Trazaloop · PROD-LAUNCH-01B · Qué tutorial ve cada plan.
 *
 *
 * QUÉ DEFIENDE ESTA SUITE
 *
 * Tres cosas que es fácil romper sin darse cuenta:
 *
 *   1. Que el Dashboard siga siendo la ÚNICA excepción. La forma más común de
 *      perder esta regla es añadir «y el de bienvenida», «y el de la primera
 *      importación»… hasta que Full ya no incluye nada que Free no tenga.
 *   2. Que una pantalla NUEVA caiga del lado de Full. Si alguien cambia la
 *      comparación por una lista de claves bloqueadas, cada pantalla que nazca
 *      quedará abierta hasta que alguien se acuerde de añadirla.
 *   3. Que un fallo de lectura NO se presente como «eres Free». Eso le vendería
 *      Full a quien ya lo tiene, que es la peor cara posible del producto.
 *
 * Correr: npm run test:pl01b-tutorials
 */
import { readFileSync } from "node:fs";
import {
  resolveTutorialAccess, tutorialIsDiscoverable, FREE_TUTORIAL_PAGE_KEY,
  TUTORIAL_UPSELL_TITLE, TUTORIAL_UPSELL_BODY,
  TUTORIAL_UPSELL_ACTIVATE, TUTORIAL_UPSELL_REACTIVATE, TUTORIAL_UPSELL_DISMISS,
} from "../../lib/domain/tutorial-access";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

// Claves reales del registro, para que la suite no invente pantallas.
const REGISTRO = readFileSync("lib/modules/page-keys.ts", "utf8");

console.log("\nA · El Dashboard, y solo el Dashboard");
// ===========================================================================

check("J. Free ve el tutorial del Dashboard", () => {
  const r = resolveTutorialAccess({ plan: "free" }, FREE_TUTORIAL_PAGE_KEY);
  assert(r.allowed, "Free se quedó sin el único tutorial que le corresponde");
});

check("La clave del Dashboard existe de verdad en el registro de pantallas", () => {
  assert(REGISTRO.includes(`key: "${FREE_TUTORIAL_PAGE_KEY}"`),
    `«${FREE_TUTORIAL_PAGE_KEY}» no está en PAGE_KEYS: la excepción apunta a una pantalla que no existe`);
});

check("K. Free NO ve ningún otro tutorial, y se le ofrece Full", () => {
  for (const clave of ["cpr.diagnostic", "cpr.catalog.suppliers", "quality.audits"]) {
    const r = resolveTutorialAccess({ plan: "free" }, clave);
    assert(!r.allowed && r.reason === "plan_required", `Free entró en «${clave}»`);
    assert(r.title === TUTORIAL_UPSELL_TITLE, "el título del aviso cambió");
    assert(r.body === TUTORIAL_UPSELL_BODY, "el texto del aviso cambió");
    assert(r.dismissLabel === TUTORIAL_UPSELL_DISMISS, "desapareció el botón de cerrar");
  }
});

check("Una pantalla que NADIE ha clasificado cae del lado de Full", () => {
  // Este es el punto entero de la regla: lo nuevo no se regala.
  const r = resolveTutorialAccess({ plan: "free" }, "modulo.que.aun.no.existe");
  assert(!r.allowed && r.reason === "plan_required",
    "una pantalla desconocida quedó abierta para Free");
});

check("Una clave vacía tampoco se interpreta a favor de quien pregunta", () => {
  const r = resolveTutorialAccess({ plan: "free" }, "");
  assert(!r.allowed, "la clave vacía abrió el tutorial");
});

console.log("\nB · Full, Extra y el backoffice");
// ===========================================================================

check("L. Full y Extra ven todos los tutoriales", () => {
  for (const plan of ["full", "extra"] as const) {
    for (const clave of [FREE_TUTORIAL_PAGE_KEY, "cpr.diagnostic", "lo.que.sea"]) {
      assert(resolveTutorialAccess({ plan }, clave).allowed,
        `${plan} se quedó fuera de «${clave}»`);
    }
  }
});

check("El superadministrador ve el contenido aunque su plan diga otra cosa", () => {
  const r = resolveTutorialAccess(
    { plan: "free", isPlatformStaff: true }, "cpr.diagnostic");
  assert(r.allowed, "el backoffice no puede revisar lo que administra");
});

console.log("\nC · Activar no es reactivar");
// ===========================================================================

check("Quien nunca tuvo Full recibe «Activar Full»", () => {
  const r = resolveTutorialAccess({ plan: "free" }, "cpr.diagnostic");
  assert(!r.allowed && r.reason === "plan_required", "no hubo oferta");
  assert(r.cta === "activate" && r.ctaLabel === TUTORIAL_UPSELL_ACTIVATE,
    `se ofreció «${r.ctaLabel}» a quien nunca tuvo Full`);
});

check("Quien tuvo Full y se le venció recibe «Reactivar Full»", () => {
  const r = resolveTutorialAccess(
    { plan: "free", hadFullBefore: true }, "cpr.diagnostic");
  assert(!r.allowed && r.reason === "plan_required", "no hubo oferta");
  assert(r.cta === "reactivate" && r.ctaLabel === TUTORIAL_UPSELL_REACTIVATE,
    `se ofreció «${r.ctaLabel}» a quien ya fue cliente de Full`);
});

check("Haber tenido Full NO devuelve el acceso por sí solo", () => {
  const r = resolveTutorialAccess(
    { plan: "free", hadFullBefore: true }, "cpr.diagnostic");
  assert(!r.allowed, "un Full vencido siguió abriendo tutoriales");
});

console.log("\nD · No saber no es no tener");
// ===========================================================================

check("Si el plan no se pudo resolver, NO se vende Full", () => {
  const r = resolveTutorialAccess({ plan: "unknown" }, "cpr.diagnostic");
  assert(!r.allowed, "un plan ilegible abrió el tutorial");
  assert(r.reason === "unavailable",
    "un fallo de lectura se presentó como «eres Free»: eso le ofrece Full a quien ya lo paga");
});

check("Y tampoco se abre el Dashboard a ciegas", () => {
  const r = resolveTutorialAccess({ plan: "unknown" }, FREE_TUTORIAL_PAGE_KEY);
  assert(!r.allowed && r.reason === "unavailable",
    "con el plan ilegible se decidió igualmente");
});

console.log("\nE · El tutorial se descubre aunque no se pueda ver");
// ===========================================================================

check("Un tutorial que existe se muestra en la navegación, se pueda ver o no", () => {
  assert(tutorialIsDiscoverable(true), "se escondió un tutorial que existe");
  assert(!tutorialIsDiscoverable(false), "se anunció un tutorial que no existe");
});

check("La regla no consulta el plan para decidir si se muestra", () => {
  const fuente = readFileSync("lib/domain/tutorial-access.ts", "utf8");
  const i = fuente.indexOf("export function tutorialIsDiscoverable");
  const cuerpo = fuente.slice(i);
  assert(!/plan|viewer/i.test(cuerpo.slice(0, cuerpo.indexOf("}") + 1)),
    "descubrir el tutorial volvió a depender del plan");
});

console.log(`\nPROD-LAUNCH-01B · tutoriales: ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
