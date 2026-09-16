/**
 * Trazaloop · MP-REC-01B.6 · El pagador, el diagnóstico y la verdad del plan.
 *
 *
 * DE DÓNDE SALE ESTA SUITE
 *
 * Del primer clic humano real en Staging, que falló y dejó dos lecciones:
 *
 *   1. El camino de producto mandaba a la pasarela el correo del administrador
 *      que estaba contratando. En el sandbox eso no es un pagador válido, y
 *      PE-05B2 ya lo había pagado con semanas de bloqueo.
 *
 *   2. El rechazo se perdió. El adaptador traía el diagnóstico saneado y el
 *      servicio lo tiraba, así que no quedó en ningún sitio qué contestó
 *      Mercado Pago.
 *
 * Y de un tercer defecto que el fallo destapó: la empresa pasó a verse «Plan
 * Full · Todo en orden» sin haber pagado nada, porque el estado de facturación
 * confundía una suscripción `pending` con un plan.
 *
 * Correr: npm run test:mprec01d
 */
import { readFileSync } from "node:fs";
import {
  resolveRecurringPayer, RECURRING_PAYER_MESSAGE,
} from "../../lib/billing/recurring/payer";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}
const leer = (p: string) => readFileSync(p, "utf8");

const SERVICIO = "lib/db/recurring-checkout.ts";
const ACCIONES = "server/actions/billing.ts";
const M0206 = "supabase/migrations/0206_recurring_attempt_truth.sql";
const COMPRADOR = "test_user_1234567890@testuser.com";

console.log("\n1 · EL PAGADOR SALE DEL ENTORNO, NO DE LA SESIÓN");

check("1A. En pruebas, el comprador configurado", () => {
  const r = resolveRecurringPayer("test", { MERCADOPAGO_TEST_BUYER_EMAIL: COMPRADOR });
  assert(r.ok, "no resolvió el comprador de pruebas");
  assert(r.ok && r.email === COMPRADOR, "devolvió otro correo");
  assert(r.ok && r.source === "configured_test_buyer", "no declara su origen");
});

check("1B. Sin comprador configurado, falla cerrado", () => {
  for (const v of [undefined, null, "", "   "]) {
    const r = resolveRecurringPayer("test", { MERCADOPAGO_TEST_BUYER_EMAIL: v });
    assert(!r.ok && r.reason === "RECURRING_TEST_BUYER_NOT_CONFIGURED",
      `«${String(v)}» no falló cerrado`);
  }
});

check("1C. Un correo que no es identidad de prueba se rechaza", () => {
  // Es EXACTAMENTE lo que mandó el clic que falló.
  for (const v of ["qa-pe05b2-admin@test.trazaloop.dev", "alguien@empresa.com",
                   "test@testuser.com", "test_payer_1@testuser.com"]) {
    const r = resolveRecurringPayer("test", { MERCADOPAGO_TEST_BUYER_EMAIL: v });
    assert(!r.ok, `«${v}» se aceptó como pagador de sandbox`);
  }
});

check("1D. En producción no hay pagador: se niega, no se improvisa", () => {
  const r = resolveRecurringPayer("live", { MERCADOPAGO_TEST_BUYER_EMAIL: COMPRADOR });
  assert(!r.ok && r.reason === "RECURRING_PAYER_NOT_IMPLEMENTED_IN_PRODUCTION",
    "producción resolvió un pagador");
});

check("1E. Y el comprador de pruebas NO es respaldo productivo", () => {
  // La rama `live` ni siquiera mira la variable. Si algún día alguien la
  // convierte en respaldo, una suscripción real quedaría a nombre de una
  // identidad sintética.
  const f = leer("lib/billing/recurring/payer.ts");
  const i = f.indexOf('environment === "live"');
  const j = f.indexOf("resolveConfiguredTestBuyer(env.");
  assert(i > 0 && j > i, "la rama productiva no va antes de mirar el comprador");
});

check("1F. El servicio no admite un pagador por parámetro", () => {
  // La garantía más fuerte no es una comprobación: es que la firma no lo acepte.
  const s = leer(SERVICIO);
  const i = s.indexOf("export async function openRecurringCheckout");
  const firma = s.slice(i, s.indexOf("): Promise<OpenRecurringResult>", i));
  assert(!/payerEmail/.test(firma),
    "el servicio sigue aceptando un correo de pagador desde fuera");
  assert(/resolveRecurringPayer\(/.test(s),
    "el servicio no usa la primitiva de pagador");
});

check("1G. Y la acción de servidor ya no manda el correo de la sesión", () => {
  const a = leer(ACCIONES);
  const i = a.indexOf("startRecurringCheckoutForQuoteAction");
  const trozo = a.slice(i, a.indexOf("export async function startOneTimeCheckout", i));
  assert(!/payerEmail:\s*quien\.email/.test(trozo),
    "la acción recurrente sigue mandando el correo del administrador");
  // Y el carril manual NO cambia: allí el pagador sí es quien compra.
  const manual = a.slice(a.indexOf("startOneTimeCheckoutForQuoteAction"));
  assert(/payerEmail:\s*quien\.email/.test(manual),
    "se tocó el pagador del carril manual");
});

console.log("\n2 · EL DIAGNÓSTICO DEL PROVEEDOR SOBREVIVE, Y VA SANEADO");

check("2A. El servicio ya no descarta `detail`", () => {
  const s = leer(SERVICIO);
  assert(/\(creada as \{ detail\?: string \| null \}\)\.detail/.test(s),
    "el rechazo de la pasarela se sigue tirando");
});

check("2B. Queda en el registro de servidor", () => {
  const s = leer(SERVICIO);
  assert(/log_recurrente\("preapproval_rechazada"/.test(s),
    "el rechazo no se registra");
  assert(/diagnostic: diagnostico/.test(s), "el registro no lleva el diagnóstico");
});

check("2C. Y se persiste en la autorización", () => {
  const s = leer(SERVICIO);
  assert(/p_diagnostic: diagnostico/.test(s),
    "el diagnóstico no llega a la base");
  const m = leer(M0206);
  assert(/last_provider_diagnostic text/.test(m),
    "la autorización no tiene dónde guardarlo");
});

check("2D. El registro no puede llevar credenciales", () => {
  const s = leer(SERVICIO);
  const i = s.indexOf('log_recurrente("preapproval_rechazada"');
  const bloque = s.slice(i, i + 320);
  // Se buscan CREDENCIALES, no la subcadena. `authorization_id` es el
  // identificador de nuestra propia fila y contiene «authorization»: perseguir
  // la subcadena da rojos que no son, y un rojo que no es acaba desactivándose.
  for (const prohibido of ["access_token", "accessToken", "Bearer ", "apikey",
                           "api_key", "secret", "service_role", "serviceRole",
                           "password", "cvv"]) {
    assert(!bloque.toLowerCase().includes(prohibido.toLowerCase()),
      `el registro del rechazo menciona «${prohibido}»`);
  }
  // Y lo que sí lleva: la clase del fallo y el diagnóstico ya saneado.
  assert(/failure: creada\.failure/.test(bloque), "no registra la clase del fallo");
});

check("2E. El saneado lo hace el adaptador, y descarta correos", () => {
  // `diagnostico()` recorta y filtra cualquier fragmento con arroba, así que un
  // correo del comprador no puede viajar dentro del error.
  const a = leer("lib/billing/providers/mercadopago.ts");
  assert(/partes\.filter\(\(x\) => !x\.includes\("@"\)\)/.test(a),
    "el diagnóstico del adaptador ya no descarta lo que lleva arroba");
});

check("2F. La UI pública no enseña la respuesta cruda", () => {
  // El mensaje que ve quien contrata sale del catálogo fijo, no del proveedor.
  const s = leer(SERVICIO);
  assert(/OPEN_RECURRING_MESSAGE/.test(s), "no hay catálogo de mensajes");
  const a = leer(ACCIONES);
  const i = a.indexOf("startRecurringCheckoutForQuoteAction");
  const trozo = a.slice(i, a.indexOf("export async function startOneTimeCheckout", i));
  assert(/OPEN_RECURRING_MESSAGE\[r\.code\]/.test(trozo),
    "la acción no traduce el código a un mensaje estable");
  assert(!/r\.detail/.test(trozo),
    "la acción filtra el diagnóstico crudo hacia la interfaz");
});

console.log("\n3 · UNA SUSCRIPCIÓN PENDING NO ES UN PLAN");

check("3A. El estado comercial exige periodo pagado o estado no pendiente", () => {
  const m = leer(M0206);
  assert(/v_efectiva := \(v_s\.status <> 'pending'\) or \(v_pagados > 0\)/.test(m),
    "la regla de plan efectivo no está en la fuente canónica");
});

check("3B. Y una pendiente se informa como preparación, no como plan", () => {
  const m = leer(M0206);
  const i = m.indexOf("if not v_efectiva then");
  const bloque = m.slice(i, i + 700);
  assert(/'has_subscription', false/.test(bloque),
    "una suscripción sin pagar sigue devolviéndose como plan");
  assert(/'pending_authorization', true/.test(bloque),
    "no se informa de que hay una autorización en preparación");
});

check("3C. El carril manual no cambia de respuesta", () => {
  // Sus suscripciones nacen `active` en las cinco funciones que las crean, así
  // que `v_efectiva` es verdadera para todas ellas. La migración lo dice.
  const m = leer(M0206);
  assert(/nacen `active` en las cinco/.test(m),
    "0206 no justifica por qué el carril manual no se entera");
  assert(!/billing_settle_payment|billing_one_time_checkouts/.test(
    m.replace(/--[^\n]*/g, "")),
    "0206 toca código del carril manual");
});

console.log("\n4 · LOS TRES FINALES DE UN INTENTO");

check("4A. Rechazo definitivo cierra y libera el carril manual", () => {
  const m = leer(M0206);
  const i = m.indexOf("-- CASO B");
  const bloque = m.slice(i, i + 900);
  assert(/set status = 'ended'/.test(bloque), "la autorización no se cierra");
  assert(/update public\.billing_subscriptions[\s\S]{0,120}set status = 'ended'/.test(bloque),
    "la suscripción sigue viva tras un rechazo definitivo");
  assert(/and renewal_mode = 'provider'/.test(bloque),
    "el cierre no está acotado al carril recurrente");
});

check("4B. Fallo ambiguo NO cierra: deja vivo y bloquea el segundo intento", () => {
  const m = leer(M0206);
  assert(/'uncertain'/.test(m), "no existe el estado incierto");
  assert(/where status in \('awaiting_authorization', 'authorized', 'uncertain'\)/.test(m),
    "el estado incierto no cuenta como vivo, así que no bloquea nada");
});

check("4C. Y el servicio distingue las dos causas", () => {
  const s = leer(SERVICIO);
  assert(/const incierto = creada\.failure === "provider_unavailable"/.test(s),
    "el servicio no separa el timeout del rechazo");
  assert(/p_outcome: incierto \? "uncertain" : "refused"/.test(s),
    "el servicio no cierra el intento según la causa");
});

check("4D. Nunca se cierra un intento con recurso o con dinero", () => {
  const m = leer(M0206);
  assert(/'has_provider_resource'/.test(m),
    "se podría cerrar un intento que ya tiene preapproval");
  assert(/'has_settled_period'/.test(m),
    "se podría cerrar un intento que ya produjo un periodo pagado");
});

check("4E. Cerrar conserva la fila: es auditoría, no basura", () => {
  const m = leer(M0206);
  assert(!/delete from public\.billing_recurring_authorizations/i.test(m),
    "0206 borra autorizaciones en vez de cerrarlas");
  assert(!/delete from public\.billing_subscriptions/i.test(m),
    "0206 borra suscripciones");
});

check("4F. La primitiva de cierre es de servicio, no del navegador", () => {
  const m = leer(M0206);
  assert(/revoke all on function public\.billing_close_recurring_attempt[\s\S]{0,120}from public, anon, authenticated/.test(m),
    "quien contrata puede cerrar su propio intento");
  assert(/grant execute on function public\.billing_close_recurring_attempt[\s\S]{0,120}to service_role/.test(m),
    "el servicio no puede cerrar el intento");
});

console.log("\n5 · MENSAJES");

check("5A. Ningún mensaje nombra la pasarela ni filtra el motivo técnico", () => {
  for (const msg of Object.values(RECURRING_PAYER_MESSAGE)) {
    assert(!/mercado\s*pago/i.test(msg), `«${msg}» nombra la pasarela`);
    assert(!/token|sandbox|test_user|payer/i.test(msg),
      `«${msg}» filtra vocabulario técnico`);
  }
});

console.log(`\nMP-REC-01B.6 · pagador y diagnóstico: ${passed} en verde, ${failed} en rojo`);
if (failed > 0) process.exit(1);
