/**
 * Trazaloop · PROD-LAUNCH-01B · La superficie del pago único.
 *
 *
 * QUÉ VIGILA ESTA SUITE
 *
 * Lo que la base ya no puede defender sola: que la capa de aplicación no se
 * salte la puerta.
 *
 * `billing_settle_one_time_checkout` comprueba pago aprobado, referencia,
 * importe y moneda. Pero si una pantalla decidiera activar leyendo
 * `?status=approved`, esa puerta no se cruzaría nunca — se rodearía. Aquí se
 * fija que no hay forma de rodearla:
 *
 *   · ninguna pantalla lee el resultado del pago de la URL;
 *   · ningún componente de cliente activa nada;
 *   · el importe no viaja desde el navegador en ninguna dirección;
 *   · y un cobro solo se puede verificar desde la empresa a la que pertenece.
 *
 * Esta última es la que impediría que conocer un identificador ajeno active el
 * plan de otra empresa.
 *
 * Correr: npm run test:pl01b-surface
 */
import { readFileSync } from "node:fs";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}
const leer = (f: string) => readFileSync(f, "utf8");
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/[^\n]*/g, "$1");

const VUELTA = "app/(app)/(shell)/settings/billing/checkout/return/page.tsx";
const BOTON = "components/domain/billing/verify-payment-button.tsx";
const SERVICIO = "lib/db/one-time-checkout.ts";
const ACCIONES = "server/actions/billing.ts";
const REGISTRO = "lib/billing/providers/one-time-registry.ts";
const PANEL = "components/domain/billing/renewal-panel.tsx";
const FACTURACION = "app/(app)/(shell)/settings/billing/page.tsx";
const PUERTA = "server/actions/tutorials.ts";
const DIALOGO = "components/domain/tutorials/page-tutorial-action.tsx";

console.log("\nA · La URL no activa nada");
// ===========================================================================

check("N. La pantalla de vuelta NO lee el resultado del pago de la URL", () => {
  const src = sinComentarios(leer(VUELTA));
  for (const p of ["status", "payment_id", "collection_status", "preference_id",
                   "merchant_order_id", "collection_id"]) {
    assert(!new RegExp(`params\\.${p}\\b|params\\[["']${p}["']\\]`).test(src),
      `la vuelta lee «${p}» de la URL: eso convierte el plan en algo que se escribe`);
  }
});

check("De la URL solo sale el identificador del cobro, y validado", () => {
  const src = sinComentarios(leer(VUELTA));
  assert(/params\.c\b/.test(src), "la vuelta no lee el identificador del cobro");
  assert(/\[0-9a-f-\]\{36\}/.test(src),
    "el identificador del cobro entra sin comprobar su forma");
});

check("Y la activación la decide el servidor preguntando al proveedor", () => {
  const src = sinComentarios(leer(VUELTA));
  assert(/verifyOneTimeCheckout\(/.test(src),
    "la vuelta no pasa por la verificación del servidor");
});

console.log("\nB · Un cobro solo lo verifica su propia empresa");
// ===========================================================================

check("La pantalla de vuelta ata el cobro a la empresa activa", () => {
  const src = sinComentarios(leer(VUELTA));
  assert(/\.eq\(\s*"organization_id",\s*org\.organizationId\s*\)/.test(src),
    "la vuelta no comprueba que el cobro sea de esta empresa: "
    + "conocer un identificador ajeno activaría el plan de otra");
});

check("Y la acción de verificar, también", () => {
  const src = sinComentarios(leer(ACCIONES));
  const i = src.indexOf("export async function verifyOneTimeCheckoutAction");
  assert(i > -1, "no existe la acción de verificar");
  const cuerpo = src.slice(i, i + 1800);
  assert(/exigirAdministracion\(\)/.test(cuerpo),
    "cualquiera con sesión puede verificar un cobro");
  assert(/\.eq\(\s*"organization_id",\s*quien\.organizationId\s*\)/.test(cuerpo),
    "la acción no ata el cobro a la empresa de quien pide");
});

console.log("\nC · El importe nunca viene del navegador");
// ===========================================================================

check("Abrir un cobro NO recibe importe de quien llama", () => {
  const src = sinComentarios(leer(SERVICIO));
  const i = src.indexOf("export async function openOneTimeCheckout");
  const firma = src.slice(i, src.indexOf("}): Promise<OpenCheckoutResult>", i));
  for (const p of ["amount", "total", "price", "importe"]) {
    assert(!new RegExp(p, "i").test(firma),
      `abrir un cobro acepta «${p}»: entonces una pantalla puede influir en lo que se cobra`);
  }
});

check("El importe que se manda a la pasarela sale de lo que devolvió la base", () => {
  const src = sinComentarios(leer(SERVICIO));
  assert(/amountMinor:\s*c\.expected_total_amount/.test(src),
    "el importe de la preferencia no sale del cobro que abrió la base");
  assert(/currency:\s*c\.expected_currency/.test(src),
    "la moneda de la preferencia no sale del cobro que abrió la base");
});

check("Y al asentar se manda lo VERIFICADO, no lo esperado", () => {
  const src = sinComentarios(leer(SERVICIO));
  const i = src.indexOf("billing_settle_one_time_checkout");
  const bloque = src.slice(i, i + 500);
  assert(/p_amount:\s*veredicto\.amountMinor/.test(bloque),
    "se asienta el importe esperado en vez del observado: "
    + "eso hace que la comprobación de la base no compruebe nada");
});

console.log("\nD · El cliente no activa");
// ===========================================================================

check("El botón de verificar no sabe nada de importes ni de pasarelas", () => {
  const src = sinComentarios(leer(BOTON));
  assert(/"use client"/.test(leer(BOTON)), "el botón dejó de ser de cliente");
  for (const p of ["amount", "importe", "mercadopago", "preference", "settle"]) {
    assert(!new RegExp(p, "i").test(src), `el botón de cliente menciona «${p}»`);
  }
  assert(/verifyOneTimeCheckoutAction\(checkoutId\)/.test(src),
    "el botón no llama a la acción de servidor");
});

check("Y se puede volver a pulsar tras un intento fallido", () => {
  const src = sinComentarios(leer(BOTON));
  // Si el botón se deshabilitara para siempre tras el primer «todavía no»,
  // quien pagó tendría que recargar para volver a intentarlo.
  assert(/disabled=\{pendiente\}/.test(src),
    "el botón se bloquea por algo que no es «hay una consulta en curso»");
});

console.log("\nE · El webhook no es requisito");
// ===========================================================================

check("La verificación no exige que haya llegado ningún aviso", () => {
  const src = sinComentarios(leer(SERVICIO));
  const i = src.indexOf("export async function verifyOneTimeCheckout");
  const cuerpo = src.slice(i);
  assert(!/billing_provider_events|webhook/i.test(cuerpo),
    "activar depende de que haya llegado un aviso: es justo el fallo que costó "
    + "un cobro real sin notificación");
  assert(/paymentsFor\(/.test(cuerpo),
    "no se le pregunta al proveedor por los pagos de la referencia");
});

console.log("\nF · La frontera de la pasarela sigue en un solo sitio");
// ===========================================================================

check("El servicio y las acciones NO nombran ninguna pasarela", () => {
  for (const f of [SERVICIO, ACCIONES, VUELTA, BOTON]) {
    const src = sinComentarios(leer(f));
    assert(!/mercadopago|mercado_pago/i.test(src),
      `«${f}» nombra la pasarela: para eso está el registro`);
  }
});

check("Y el registro es quien la traduce", () => {
  const src = sinComentarios(leer(REGISTRO));
  assert(/mercadopago/i.test(src), "el registro dejó de saber a quién llama");
  assert(/defaultOneTimeProviderCode/.test(src),
    "no hay un único sitio que diga con qué proveedor se cobra");
});

console.log("\nG · La renovación se ofrece donde se mira el plan");
// ===========================================================================

check("La página de facturación monta el panel de renovación", () => {
  const src = sinComentarios(leer(FACTURACION));
  assert(/<RenewalPanel/.test(src), "no se monta el panel de renovación");
  assert(/periodEndsAt=\{estado\?\.renewsAt/.test(src),
    "el panel no recibe el vencimiento real de la suscripción");
});

check("El instante lo pone el SERVIDOR, no el navegador", () => {
  const src = sinComentarios(leer(FACTURACION));
  assert(/nowIso=\{new Date\(\)\.toISOString\(\)\}/.test(src),
    "el vencimiento se compara contra el reloj del navegador: "
    + "adelantarlo bastaría para ver otro estado");
  const panel = sinComentarios(leer(PANEL));
  assert(!/new Date\(\)/.test(panel.replace(/new Date\(nowIso\)/g, "")),
    "el panel consulta el reloj del cliente por su cuenta");
});

check("Los TEXTOS salen de la regla pura; el tono lo elige el componente", () => {
  const panel = sinComentarios(leer(PANEL));
  assert(/resolveRenewalView\(/.test(panel), "el panel no usa la regla pura");
  // Lo que no puede estar aquí son las FRASES: si se escriben a mano, la
  // prueba que vigila «desactivada» deja de cubrir lo que la gente lee.
  for (const frase of ["vence en", "terminó", "intacta", "Reactivar", "Renovar Full"]) {
    assert(!panel.includes(frase),
      `el panel escribe «${frase}» a mano en vez de tomarlo de la regla`);
  }
  for (const campo of ["vista.title", "vista.body", "vista.ctaLabel"]) {
    assert(panel.includes(campo), `el panel no pinta ${campo}`);
  }
  // El umbral SÍ puede mirarse aquí: elegir color no es decidir cuándo avisar,
  // y esa decisión ya la tomó `noticeFor`.
  assert(/vista\.notice === 1/.test(panel),
    "el aviso crítico no se distingue visualmente del resto");
});

check("Renovar y reactivar NO son el mismo camino", () => {
  const panel = sinComentarios(leer(PANEL));
  assert(/startRenewalCheckoutAction\(\)/.test(panel), "renovar no abre el periodo siguiente");
  assert(/startOneTimeCheckoutAction\(/.test(panel), "reactivar no contrata de nuevo");
  // Vencido = contratar otra vez; vigente = periodo siguiente anclado al final
  // del vigente. Mezclarlos daría un periodo que empieza en una fecha que
  // nadie pactó.
  // Se comparan las LLAMADAS, no los imports: los dos nombres aparecen arriba
  // en la línea de importación y ahí no hay ninguna rama.
  const i = panel.indexOf('vista.kind === "expired"\n        ? await');
  const j = panel.indexOf("await startOneTimeCheckoutAction(");
  const k = panel.indexOf("await startRenewalCheckoutAction()");
  assert(i > -1, "la elección de camino no cuelga de si el periodo venció");
  assert(j > -1 && k > -1, "falta alguno de los dos caminos");
  assert(i < j && j < k,
    "la rama de vencido no es la que contrata de nuevo");
});

console.log("\nH · El tutorial no se entrega por escribir la URL");
// ===========================================================================

check("La puerta decide ANTES de firmar, y en las dos vías", () => {
  const src = sinComentarios(leer(PUERTA));
  const iPuerta = src.indexOf("await autorizar(pageKey)");
  const iFirma = src.indexOf("signTutorialPlayback({");
  assert(iPuerta > -1 && iFirma > -1 && iPuerta < iFirma,
    "se firma la reproducción antes de comprobar el plan");
  assert((src.match(/autorizar\(pageKey\)/g) ?? []).length >= 2,
    "solo una de las dos vías de entrega pasa por la puerta");
});

check("Y falla CERRADA si no hay empresa activa", () => {
  const src = sinComentarios(leer(PUERTA));
  const i = src.indexOf("async function autorizar");
  const cuerpo = src.slice(i);
  assert(/catch \{[\s\S]{0,120}status: "unavailable"/.test(cuerpo),
    "sin empresa activa la puerta no niega la entrega");
});

check("El diálogo enseña la oferta, y el botón de la barra NO se esconde", () => {
  const src = sinComentarios(leer(DIALOGO));
  assert(/plan_required/.test(src), "el diálogo no sabe enseñar la oferta");
  assert(/estado\.ctaLabel/.test(src) && /estado\.dismissLabel/.test(src),
    "los botones de la oferta no vienen del servidor");
  // El botón se pinta con `pageKey`, sin mirar plan: descubrir el tutorial es
  // la mitad de la oferta.
  assert(/if \(!pageKey\) return null;/.test(src),
    "el botón de la barra dejó de depender solo de si la pantalla tiene tutorial");
});

console.log(`\nPROD-LAUNCH-01B · superficie: ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
