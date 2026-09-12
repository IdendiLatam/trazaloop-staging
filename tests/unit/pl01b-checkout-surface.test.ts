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

console.log(`\nPROD-LAUNCH-01B · superficie: ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
