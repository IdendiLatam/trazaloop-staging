/**
 * Trazaloop · PROD-LAUNCH-01B.9 · Dos defectos de lanzamiento.
 *
 *
 * A · A FACTURACIÓN SE LLEGA SIN TENER MÓDULOS
 *
 * `/settings/billing` estaba registrada como pantalla pero no figuraba en
 * ningún grupo de navegación: solo se llegaba escribiendo la URL. La
 * consecuencia era la peor posible — una empresa sin módulos activos, que es
 * justo la que necesita comprar, no tenía camino hasta donde se compra.
 *
 * El acceso a facturación depende de ser miembro autorizado de la empresa, no
 * de tener contratado un módulo. Por eso va en el grupo transversal, que se
 * pinta siempre.
 *
 *
 * B · NO SE PROMETE UN COBRO QUE NO VA A OCURRIR
 *
 * Tras el primer pago único la ficha decía «Siguiente cobro: 12 de octubre» y
 * ofrecía «Cancelar el plan». Con `renewal_mode = manual` las dos cosas son
 * falsas: no hay cargo programado ni recurrencia que cancelar.
 *
 * Y eso no es un detalle de redacción. Quien lee «siguiente cobro» se
 * despreocupa, y el día del vencimiento se queda sin plan creyendo que había
 * pagado. La frase amable cuesta el cliente.
 *
 * Correr: npm run test:pl01b9-cleanup
 */
import { readFileSync } from "node:fs";
import {
  renewalCopyFor, FORBIDDEN_AUTO_CHARGE_WORDS,
} from "../../lib/domain/billing-renewal-copy";
import { SISTEMA_GROUP } from "../../lib/modules/registry";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}
const leer = (f: string) => readFileSync(f, "utf8");
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/[^\n]*/g, "$1");

console.log("\nA · Facturación se alcanza sin módulos");
// ===========================================================================

check("«Plan y facturación» está en el grupo transversal", () => {
  const enlace = SISTEMA_GROUP.items.find((i) => i.href === "/settings/billing");
  assert(enlace !== undefined,
    "no hay entrada de navegación a facturación: solo se llegaría por URL directa");
  assert(enlace.label === "Plan y facturación",
    `la entrada se llama «${enlace.label}»`);
});

check("Y ese grupo se pinta SIEMPRE, sin condición de módulo", () => {
  const nav = sinComentarios(leer("components/layout/nav.tsx"));
  // Se busca la línea que lo RENDERIZA, no la que lo importa: el import está
  // arriba del todo y no dice nada sobre condiciones.
  const i = nav.indexOf("group={SISTEMA_GROUP}");
  assert(i > -1, "el grupo transversal ya no se renderiza");
  const linea = nav.slice(nav.lastIndexOf("\n", i) + 1, nav.indexOf("\n", i));
  // Si algún día se envuelve en un ternario que dependa de módulos, esto cae.
  assert(/<NavGroupSection group=\{SISTEMA_GROUP\}/.test(linea),
    `el grupo transversal se pinta condicionalmente: «${linea.trim()}»`);
  assert(!/\?|&&/.test(linea),
    `el grupo transversal quedó tras una condición: «${linea.trim()}»`);
});

check("La pantalla exige empresa activa, no un módulo", () => {
  const pagina = sinComentarios(leer("app/(app)/(shell)/settings/billing/page.tsx"));
  assert(/requireActiveOrg\(\)/.test(pagina),
    "la pantalla no comprueba la empresa activa");
  for (const modulo of ["requireCprModule", "requireQualityModule", "requireTextilesModule"]) {
    assert(!new RegExp(modulo).test(pagina),
      `facturación exige «${modulo}»: entonces desaparece para quien no lo tenga`);
  }
});

check("Y las acciones que cobran siguen exigiendo administración", () => {
  const acciones = sinComentarios(leer("server/actions/billing.ts"));
  for (const accion of ["startOneTimeCheckoutAction", "startRenewalCheckoutAction",
                        "verifyOneTimeCheckoutAction"]) {
    const i = acciones.indexOf(`export async function ${accion}`);
    assert(i > -1, `falta ${accion}`);
    const cuerpo = acciones.slice(i, i + 700);
    assert(/exigirAdministracion\(\)/.test(cuerpo),
      `«${accion}» no exige administración de la empresa activa`);
  }
});

console.log("\nB · La copia no promete cobros inexistentes");
// ===========================================================================

check("Con renovación MANUAL la fecha es un vencimiento, no un cobro", () => {
  const c = renewalCopyFor("manual");
  assert(c.dateLabel === "Activo hasta", `la fecha se titula «${c.dateLabel}»`);
  assert(c.impliesAutomaticCharge === false, "se sigue insinuando un cargo automático");
  assert(c.offersCancellation === false,
    "se ofrece cancelar una recurrencia que no existe");
  assert(c.note !== null && /no se renueva solo/.test(c.note),
    "no se avisa de que el plan no se renueva solo");
});

check("Y ninguna palabra suya insinúa un cargo automático", () => {
  const c = renewalCopyFor("manual");
  const texto = `${c.dateLabel} ${c.note ?? ""}`.toLowerCase();
  for (const p of FORBIDDEN_AUTO_CHARGE_WORDS) {
    assert(!texto.includes(p),
      `la copia de pago único dice «${p}»: eso promete un cobro que no llega`);
  }
});

check("Con platform y provider NO cambia nada de lo de antes", () => {
  for (const modo of ["platform", "provider"]) {
    const c = renewalCopyFor(modo);
    assert(c.dateLabel === "Siguiente cobro", `${modo}: la fecha dice «${c.dateLabel}»`);
    assert(c.impliesAutomaticCharge === true, `${modo}: dejó de haber cargo automático`);
    assert(c.offersCancellation === true, `${modo}: ya no se puede cancelar`);
    assert(c.note === null, `${modo}: apareció un aviso que no le toca`);
  }
});

check("Un modo desconocido o ausente cae del lado prudente", () => {
  for (const modo of [null, undefined, "", "loquesea"]) {
    const c = renewalCopyFor(modo);
    assert(c.impliesAutomaticCharge === false,
      `«${modo}» prometió un cobro automático: ante la duda no se promete`);
  }
});

check("La ficha del plan usa la regla, y no escribe la etiqueta a mano", () => {
  // COMMERCIAL-UX-01G. Desde 01F la pantalla no compone la frase: le pide el
  // resumen a `summarizeBilling` y pinta su `validUntilLabel`. La regla que
  // aquí se defiende no ha cambiado —la etiqueta la decide UN solo sitio— pero
  // se comprueba un eslabón más allá: que ese resumen tampoco la escriba a
  // mano, sino que se la pregunte a `billing-renewal-copy`.
  //
  // Durante un tiempo sí la escribió a mano, y las dos versiones ya habían
  // empezado a divergir: una trataba el carril `platform` como cobro
  // automático y la otra no.
  const pagina = sinComentarios(leer("app/(app)/(shell)/settings/billing/page.tsx"));
  assert(!/Siguiente cobro/.test(pagina),
    "la pantalla escribe «Siguiente cobro» a mano: entonces la regla no gobierna nada");
  const tarjeta = sinComentarios(leer("components/domain/billing/my-plan-card.tsx"));
  assert(/summary\.validUntilLabel/.test(tarjeta)
    || /copiaRenovacion\.dateLabel/.test(pagina),
    "no se pinta la etiqueta que decide la regla");
  assert(!/Siguiente cobro/.test(tarjeta),
    "la tarjeta escribe «Siguiente cobro» a mano");

  const resumen = sinComentarios(leer("lib/domain/billing-experience.ts"));
  assert(/renewalCopyFor\(/.test(resumen), "el resumen no usa la regla");
  for (const frase of ["Siguiente cobro", "Plan activo hasta", "Activo hasta"]) {
    assert(!new RegExp(`etiquetaFecha\\("${frase}`).test(resumen),
      `el resumen escribe «${frase}» a mano en vez de preguntarla`);
  }
});

check("Y el botón de cancelar depende del modo, no del gusto", () => {
  const panel = sinComentarios(leer("components/domain/billing/plan-decisions.tsx"));
  assert(/offersCancellation \? \(/.test(panel),
    "«Cancelar el plan» se pinta siempre, haya recurrencia o no");
  const pagina = sinComentarios(leer("app/(app)/(shell)/settings/billing/page.tsx"));
  // COMMERCIAL-UX-01B lo estrechó: con una recurrencia viva ya existe
  // «Cancelar renovación automática», y dos botones que parecen lo mismo y
  // mueven dinero distinto no pueden convivir. Lo que esta prueba defiende es
  // que el valor SALGA de la regla, no la forma exacta de escribirlo.
  assert(/offersCancellation=\{[^}]*copiaRenovacion\.offersCancellation/.test(pagina),
    "la pantalla no le pasa al panel si hay algo que cancelar");
});

console.log("\nC · La deuda queda escrita");
// ===========================================================================

check("AUTH-MAGIC-01 está registrada con su alcance", () => {
  const doc = leer("docs/AUTH-MAGIC-01.md");
  assert(/type=magiclink/.test(doc), "no se nombra el flujo afectado");
  assert(/fragmento/i.test(doc), "no se explica por qué falla");
  assert(/recuperaci[óo]n de contrase/i.test(doc),
    "no se dice si la recuperación de contraseña está afectada");
  assert(/exchangeCodeForSession|PKCE/.test(doc),
    "no se apoya en el flujo real de la recuperación");
});

check("Y la revisión de Auth de Producción tiene checklist, sin inventar valores", () => {
  const doc = leer("docs/PRODUCTION-AUTH-REVIEW.md");
  assert(/mvmpadeixomwkpxbnhky/.test(doc), "no identifica el proyecto de Producción");
  assert(/Site URL/.test(doc) && /Redirect URLs/.test(doc),
    "no cubre los dos campos que se tocaron");
  assert(/vercel\.app/.test(doc), "no dice qué contar como anomalía");
  // Lo importante: que NO proponga un valor concreto para Site URL.
  assert(!/Site URL\s*=\s*https?:\/\//.test(doc),
    "el documento propone un valor anterior que nadie verificó");
});

console.log(`\nPROD-LAUNCH-01B.9 · limpieza: ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
