/**
 * Trazaloop · PROD-LAUNCH-01B · Qué pago activa un plan.
 *
 * Esta suite existe porque el juicio que decide si alguien recibe Full tiene
 * seis formas de equivocarse y cinco de ellas cuestan dinero:
 *
 *   · activar sin pago                      → se regala el producto
 *   · activar con un pago de otra empresa   → se regala Y se descuadra
 *   · activar con un importe menor          → se cobra de menos, para siempre
 *   · activar con un pago de sandbox        → se activa gratis
 *   · NO activar a quien sí pagó            → la única que cuesta reputación
 *
 * La última es la razón de mirar la lista entera de pagos y no el primero:
 * quien paga con una tarjeta rechazada y luego con otra deja dos pagos con la
 * misma referencia, y el bueno es el segundo.
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

const COBRO = "11111111-2222-3333-4444-555555555555";
const ESPERA: OneTimeExpectation = {
  checkoutId: COBRO,
  expectedTotalMinor: 190400,
  expectedCurrency: "COP",
  environment: "test",
};

function pago(p: Partial<ObservedPayment> = {}): ObservedPayment {
  return {
    providerPaymentId: "177618648793",
    canonicalStatus: "approved",
    amountMinor: 190400,
    currency: "COP",
    externalReference: COBRO,
    liveMode: false,
    ...p,
  };
}

console.log("\nA · Lo que SÍ activa");
// ===========================================================================

check("Un pago aprobado, del cobro, del entorno, con su importe y su moneda", () => {
  const v = decideOneTimeSettlement(ESPERA, [pago()]);
  assert(v.settle, `no se aceptó un pago correcto: ${JSON.stringify(v)}`);
  assert(v.providerPaymentId === "177618648793", "se devolvió otro identificador");
  assert(v.amountMinor === 190400 && v.currency === "COP", "se devolvió otro importe");
});

check("Y en producción, con `liveMode` verdadero", () => {
  const v = decideOneTimeSettlement(
    { ...ESPERA, environment: "live" }, [pago({ liveMode: true })]);
  assert(v.settle, "un pago real de producción no se aceptó");
});

check("Entre un rechazo y un aprobado del mismo cobro, gana el aprobado", () => {
  const v = decideOneTimeSettlement(ESPERA, [
    pago({ providerPaymentId: "1", canonicalStatus: "declined" }),
    pago({ providerPaymentId: "2", canonicalStatus: "approved" }),
  ]);
  assert(v.settle && v.providerPaymentId === "2",
    "quien pagó a la segunda se quedó sin plan");
});

console.log("\nB · Lo que NO activa, y por qué exactamente");
// ===========================================================================

check("Sin pagos: NO_PAYMENT_FOUND", () => {
  const v = decideOneTimeSettlement(ESPERA, []);
  assert(!v.settle && v.reason === "NO_PAYMENT_FOUND", JSON.stringify(v));
});

check("Pago de OTRA referencia: EXTERNAL_REFERENCE_MISMATCH", () => {
  const v = decideOneTimeSettlement(ESPERA, [pago({ externalReference: "otro-cobro" })]);
  assert(!v.settle && v.reason === "EXTERNAL_REFERENCE_MISMATCH", JSON.stringify(v));
  assert(v.observed === "otro-cobro", "no se dice qué referencia llegó");
});

check("Referencia ausente tampoco cuenta como propia", () => {
  const v = decideOneTimeSettlement(ESPERA, [pago({ externalReference: null })]);
  assert(!v.settle && v.reason === "EXTERNAL_REFERENCE_MISMATCH", JSON.stringify(v));
});

check("Pago pendiente o rechazado: PAYMENT_NOT_APPROVED", () => {
  for (const estado of ["pending", "declined", "failed", "refunded", null] as const) {
    const v = decideOneTimeSettlement(ESPERA, [pago({ canonicalStatus: estado })]);
    assert(!v.settle && v.reason === "PAYMENT_NOT_APPROVED",
      `el estado ${estado} dio ${JSON.stringify(v)}`);
  }
});

check("Pago de sandbox contra un cobro de producción: ENVIRONMENT_MISMATCH", () => {
  const v = decideOneTimeSettlement(
    { ...ESPERA, environment: "live" }, [pago({ liveMode: false })]);
  assert(!v.settle && v.reason === "ENVIRONMENT_MISMATCH", JSON.stringify(v));
});

check("Y sin `liveMode` NO se decide a favor", () => {
  const v = decideOneTimeSettlement(ESPERA, [pago({ liveMode: null })]);
  assert(!v.settle && v.reason === "ENVIRONMENT_MISMATCH",
    `un pago de origen desconocido activó el plan: ${JSON.stringify(v)}`);
});

check("Otra moneda: CURRENCY_MISMATCH, no AMOUNT_MISMATCH", () => {
  const v = decideOneTimeSettlement(ESPERA, [pago({ currency: "USD", amountMinor: 40 })]);
  assert(!v.settle && v.reason === "CURRENCY_MISMATCH",
    `«40 dólares» se contó como problema de importe: ${JSON.stringify(v)}`);
});

check("Un peso de menos: AMOUNT_MISMATCH", () => {
  const v = decideOneTimeSettlement(ESPERA, [pago({ amountMinor: 190399 })]);
  assert(!v.settle && v.reason === "AMOUNT_MISMATCH", JSON.stringify(v));
  assert(v.observed === "190399", "no se dice qué importe llegó");
});

check("Un peso de MÁS tampoco activa", () => {
  const v = decideOneTimeSettlement(ESPERA, [pago({ amountMinor: 190401 })]);
  assert(!v.settle && v.reason === "AMOUNT_MISMATCH",
    "pagar de más activó el plan: eso deja una diferencia que nadie devuelve");
});

check("Importe ausente no se interpreta como el esperado", () => {
  const v = decideOneTimeSettlement(ESPERA, [pago({ amountMinor: null })]);
  assert(!v.settle && v.reason === "AMOUNT_MISMATCH", JSON.stringify(v));
});

console.log("\nC · El orden de los motivos");
// ===========================================================================

check("Un pago de otra empresa se denuncia como tal aunque además falle todo", () => {
  const v = decideOneTimeSettlement(ESPERA, [pago({
    externalReference: "de-otra-empresa", canonicalStatus: "pending",
    amountMinor: 1, currency: "USD", liveMode: null })]);
  assert(!v.settle && v.reason === "EXTERNAL_REFERENCE_MISMATCH",
    `se respondió «${(v as { reason: string }).reason}» a un pago ajeno`);
});

check("Cada motivo tiene un texto para la persona, y ninguno es un código", () => {
  const motivos = ["NO_PAYMENT_FOUND", "PAYMENT_NOT_APPROVED",
    "EXTERNAL_REFERENCE_MISMATCH", "AMOUNT_MISMATCH", "CURRENCY_MISMATCH",
    "ENVIRONMENT_MISMATCH"] as const;
  for (const m of motivos) {
    const t = REFUSAL_MESSAGE[m];
    assert(typeof t === "string" && t.length > 30, `«${m}» no tiene mensaje`);
    assert(!/_/.test(t), `el mensaje de «${m}» enseña el código crudo`);
    assert(!/error|fall(o|ó)|inválid/i.test(t),
      `el mensaje de «${m}» culpa a quien paga en vez de decirle qué hacer`);
  }
});

console.log("\nD · La frontera de la pasarela");
// ===========================================================================

check("Este módulo NO nombra ninguna pasarela", () => {
  const fuente = readFileSync("lib/billing/one-time/verification.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
  for (const p of ["mercadopago", "mercado_pago", "wompi", "preapproval", "preference"]) {
    assert(!new RegExp(p, "i").test(fuente),
      `la decisión nombra «${p}»: entonces no vale para el carril manual`);
  }
});

console.log(`\nPROD-LAUNCH-01B · verificación: ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
