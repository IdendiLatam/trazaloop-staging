/**
 * Trazaloop · PROD-LAUNCH-01B.4 · Qué pago activa un plan.
 *
 *
 * DE DÓNDE SALE ESTA SUITE, EN SU FORMA ACTUAL
 *
 * Un pago real de sandbox llegó `approved`, por 190 400 COP, con la referencia
 * exacta del cobro… y `live_mode: true`. El verificador lo rechazó porque el
 * cobro se abrió en `test`, y durante un rato pareció un defecto del pago.
 *
 * No lo era. `live_mode` describe LA NATURALEZA DE LA CREDENCIAL, no el
 * entorno de nuestro despliegue: un usuario de prueba operando con sus propias
 * credenciales produce operaciones que el proveedor marca como productivas —de
 * una cuenta falsa—. La regla estaba mal, no el pago.
 *
 * Así que la bandera dejó de ser autoridad EN PRUEBAS y su sitio lo ocupó la
 * identidad: la credencial tiene que ser la del titular esperado, y el pago
 * tiene que haberlo cobrado ese mismo titular.
 *
 *
 * LO QUE ESTA SUITE VIGILA POR ENCIMA DE TODO
 *
 * Que aflojar la lectura en PRUEBAS no haya aflojado la de PRODUCCIÓN. Ese era
 * el riesgo entero de tocar esto: con `live`, `live_mode === true` sigue siendo
 * obligatorio, y ni `false` ni `null` pasan. Los casos G, H e I existen para
 * eso y son los que no se pueden perder nunca.
 *
 * Correr: npm run test:pl01b-verification
 */
import { readFileSync } from "node:fs";
import {
  decideOneTimeSettlement, REFUSAL_MESSAGE,
  type ObservedPayment, type OneTimeExpectation,
} from "../../lib/billing/one-time/verification";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const COBRO = "792727bb-84b1-4cbb-bec1-6c3b9dfe1fd6";
const TITULAR = 3663569024;

function espera(p: Partial<OneTimeExpectation> = {}): OneTimeExpectation {
  return {
    checkoutId: COBRO,
    expectedTotalMinor: 190400,
    expectedCurrency: "COP",
    configuredEnvironment: "test",
    checkoutEnvironment: "test",
    expectedOwnerId: TITULAR,
    credentialOwnerMatches: true,
    ...p,
  };
}

function pago(p: Partial<ObservedPayment> = {}): ObservedPayment {
  return {
    providerPaymentId: "178660068608",
    canonicalStatus: "approved",
    amountMinor: 190400,
    currency: "COP",
    externalReference: COBRO,
    liveMode: true,
    collectorId: TITULAR,
    ...p,
  };
}

console.log("\nA · Pruebas: la bandera NO manda, la identidad sí");
// ===========================================================================

check("A. TEST · titular correcto y live_mode=true → se asienta", () => {
  // Este es EXACTAMENTE el pago real que se quedó bloqueado.
  const v = decideOneTimeSettlement(espera(), [pago({ liveMode: true })]);
  assert(v.settle, `se rechazó el pago real de sandbox: ${JSON.stringify(v)}`);
  assert(v.reason === "PAYMENT_VERIFIED", `motivo «${v.reason}»`);
  assert(v.providerPaymentId === "178660068608", "se eligió otro pago");
  assert(v.liveMode === true, "la bandera no se conserva como evidencia");
  assert(v.collectorId === TITULAR, "no se conserva quién cobró");
});

check("B. TEST · titular correcto y live_mode=false → también se asienta", () => {
  const v = decideOneTimeSettlement(espera(), [pago({ liveMode: false })]);
  assert(v.settle && v.liveMode === false,
    `las credenciales de prueba de aplicación quedaron fuera: ${JSON.stringify(v)}`);
});

check("Y con live_mode ausente en pruebas tampoco se bloquea", () => {
  const v = decideOneTimeSettlement(espera(), [pago({ liveMode: null })]);
  assert(v.settle && v.liveMode === null, JSON.stringify(v));
});

check("C. TEST · titular INCORRECTO → no se asienta", () => {
  const v = decideOneTimeSettlement(
    espera({ credentialOwnerMatches: false }), [pago()]);
  assert(!v.settle && v.reason === "CREDENTIAL_OWNER_MISMATCH", JSON.stringify(v));
});

check("Y sin titular configurado tampoco: falla cerrado", () => {
  const v = decideOneTimeSettlement(
    espera({ expectedOwnerId: null, credentialOwnerMatches: true }), [pago()]);
  assert(!v.settle && v.reason === "CREDENTIAL_OWNER_MISMATCH",
    `sin titular esperado se asentó igual: ${JSON.stringify(v)}`);
});

check("Y un pago cobrado por OTRO vendedor tampoco", () => {
  const v = decideOneTimeSettlement(espera(), [pago({ collectorId: 999999999 })]);
  assert(!v.settle && v.reason === "PAYMENT_COLLECTOR_MISMATCH", JSON.stringify(v));
});

check("Pero si el proveedor no dice quién cobró, manda la credencial", () => {
  // Rechazar por un campo ausente dejaría fuera pagos legítimos; la identidad
  // ya está comprobada por el lado de la credencial.
  const v = decideOneTimeSettlement(espera(), [pago({ collectorId: null })]);
  assert(v.settle, `un pago sin vendedor declarado se rechazó: ${JSON.stringify(v)}`);
});

check("D. TEST · referencia externa incorrecta → no se asienta", () => {
  const v = decideOneTimeSettlement(espera(), [pago({ externalReference: "otro" })]);
  assert(!v.settle && v.reason === "EXTERNAL_REFERENCE_MISMATCH", JSON.stringify(v));
});

check("E. TEST · importe incorrecto → no se asienta", () => {
  for (const m of [190399, 190401, null]) {
    const v = decideOneTimeSettlement(espera(), [pago({ amountMinor: m })]);
    assert(!v.settle && v.reason === "AMOUNT_MISMATCH", `${m}: ${JSON.stringify(v)}`);
  }
});

check("F. TEST · moneda incorrecta → no se asienta", () => {
  const v = decideOneTimeSettlement(espera(), [pago({ currency: "USD", amountMinor: 40 })]);
  assert(!v.settle && v.reason === "CURRENCY_MISMATCH",
    `«40 dólares» se contó como problema de importe: ${JSON.stringify(v)}`);
});

check("TEST · pago no aprobado → no se asienta", () => {
  for (const e of ["pending", "declined", "failed", "refunded", null] as const) {
    const v = decideOneTimeSettlement(espera(), [pago({ canonicalStatus: e })]);
    assert(!v.settle && v.reason === "PAYMENT_NOT_APPROVED", `${e}: ${JSON.stringify(v)}`);
  }
});

check("TEST · cobro abierto en LIVE → no se asienta", () => {
  const v = decideOneTimeSettlement(
    espera({ checkoutEnvironment: "live" }), [pago()]);
  assert(!v.settle && v.reason === "CHECKOUT_ENVIRONMENT_MISMATCH", JSON.stringify(v));
});

console.log("\nB · Producción: aquí NO se relajó nada");
// ===========================================================================

const enVivo = (p: Partial<OneTimeExpectation> = {}) =>
  espera({ configuredEnvironment: "live", checkoutEnvironment: "live", ...p });

check("G. LIVE · live_mode=true y titular correcto → se asienta", () => {
  const v = decideOneTimeSettlement(enVivo(), [pago({ liveMode: true })]);
  assert(v.settle && v.reason === "PAYMENT_VERIFIED", JSON.stringify(v));
});

check("H. LIVE · live_mode=false → NO se asienta", () => {
  const v = decideOneTimeSettlement(enVivo(), [pago({ liveMode: false })]);
  assert(!v.settle && v.reason === "LIVE_MODE_REQUIRED",
    `un pago de sandbox activó un plan productivo: ${JSON.stringify(v)}`);
});

check("I. LIVE · live_mode ausente → NO se asienta", () => {
  const v = decideOneTimeSettlement(enVivo(), [pago({ liveMode: null })]);
  assert(!v.settle && v.reason === "LIVE_MODE_REQUIRED",
    `un pago de origen desconocido activó un plan productivo: ${JSON.stringify(v)}`);
});

check("J. LIVE · titular incorrecto → NO se asienta", () => {
  const v = decideOneTimeSettlement(
    enVivo({ credentialOwnerMatches: false }), [pago({ liveMode: true })]);
  assert(!v.settle && v.reason === "CREDENTIAL_OWNER_MISMATCH", JSON.stringify(v));
});

check("LIVE · cobro abierto en pruebas → NO se asienta", () => {
  const v = decideOneTimeSettlement(
    espera({ configuredEnvironment: "live", checkoutEnvironment: "test" }),
    [pago({ liveMode: true })]);
  assert(!v.settle && v.reason === "CHECKOUT_ENVIRONMENT_MISMATCH", JSON.stringify(v));
});

check("La regla de producción está escrita como excepción explícita", () => {
  // Si alguien la reescribiera «simétrica» —la misma para los dos entornos—
  // producción quedaría tan blanda como pruebas. Se fija su forma.
  const src = readFileSync("lib/billing/one-time/verification.ts", "utf8");
  assert(/configuredEnvironment === "live"[\s\S]{0,120}liveMode === true/.test(src),
    "la exigencia de `live_mode` en producción dejó de ser explícita");
});

console.log("\nC · Elegir bien entre varios pagos");
// ===========================================================================

check("Entre un rechazo y un aprobado del mismo cobro, gana el aprobado", () => {
  const v = decideOneTimeSettlement(espera(), [
    pago({ providerPaymentId: "1", canonicalStatus: "declined" }),
    pago({ providerPaymentId: "2", canonicalStatus: "approved" }),
  ]);
  assert(v.settle && v.providerPaymentId === "2",
    "quien pagó a la segunda se quedó sin plan");
});

check("K. El mismo pago repetido devuelve SIEMPRE el mismo identificador", () => {
  // La no duplicación la garantizan el índice único y `already_settled` en la
  // base; lo que aquí se fija es que el juicio sea determinista, para que dos
  // llamadas no elijan pagos distintos del mismo cobro.
  const lista = [pago({ providerPaymentId: "A" }), pago({ providerPaymentId: "B" })];
  const uno = decideOneTimeSettlement(espera(), lista);
  const dos = decideOneTimeSettlement(espera(), lista);
  assert(uno.settle && dos.settle, "no se asentó");
  assert(uno.providerPaymentId === dos.providerPaymentId,
    "dos llamadas eligieron pagos distintos: eso duplicaría meses");
});

check("Sin pagos: NO_PAYMENT_FOUND", () => {
  const v = decideOneTimeSettlement(espera(), []);
  assert(!v.settle && v.reason === "NO_PAYMENT_FOUND", JSON.stringify(v));
});

console.log("\nD · Lo estructural va primero");
// ===========================================================================

check("Un entorno cruzado se denuncia antes que nada", () => {
  // Si los entornos no cuadran, mirar los pagos es irrelevante: hay algo mal
  // montado y eso es lo que hay que decir.
  const v = decideOneTimeSettlement(
    espera({ checkoutEnvironment: "live", credentialOwnerMatches: false }),
    [pago({ amountMinor: 1, currency: "USD" })]);
  assert(!v.settle && v.reason === "CHECKOUT_ENVIRONMENT_MISMATCH", JSON.stringify(v));
});

check("Cada motivo tiene un texto para la persona, y ninguno es un código", () => {
  const motivos = ["NO_PAYMENT_FOUND", "PAYMENT_NOT_APPROVED",
    "EXTERNAL_REFERENCE_MISMATCH", "AMOUNT_MISMATCH", "CURRENCY_MISMATCH",
    "CHECKOUT_ENVIRONMENT_MISMATCH", "CREDENTIAL_OWNER_MISMATCH",
    "PAYMENT_COLLECTOR_MISMATCH", "LIVE_MODE_REQUIRED"] as const;
  for (const m of motivos) {
    const t = REFUSAL_MESSAGE[m];
    assert(typeof t === "string" && t.length > 30, `«${m}» no tiene mensaje`);
    assert(!/_/.test(t), `el mensaje de «${m}» enseña el código crudo`);
  }
});

console.log("\nE · La frontera de la pasarela");
// ===========================================================================

check("Este módulo NO nombra ninguna pasarela", () => {
  const fuente = readFileSync("lib/billing/one-time/verification.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
  for (const p of ["mercadopago", "mercado_pago", "wompi", "preapproval", "preference"]) {
    assert(!new RegExp(p, "i").test(fuente),
      `la decisión nombra «${p}»: entonces no vale para el carril manual`);
  }
});

check("Y NO toca la semántica de las suscripciones del proveedor", () => {
  const fuente = readFileSync("lib/billing/one-time/verification.ts", "utf8");
  for (const p of ["subscription_preapproval", "authorized_payment", "recurrence"]) {
    assert(!new RegExp(p, "i").test(fuente),
      `el juicio del pago único habla de «${p}»: ese frente sigue pausado`);
  }
});

console.log(`\nPROD-LAUNCH-01B · verificación: ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
