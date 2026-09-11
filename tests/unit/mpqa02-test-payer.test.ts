/**
 * Trazaloop · MP-QA-HARDENING-02 · El comprador de las pruebas de sandbox.
 *
 *
 * EL FALLO QUE ESTO CIERRA
 *
 * `create_monthly` llevaba el comprador escrito a mano —`test_payer@example.com`,
 * el ejemplo de la documentación— y un comentario que defendía no ponerlo en una
 * variable «porque invitaría a confundirlo con un dato comercial». Los hechos lo
 * desmintieron: Mercado Pago responde
 *
 *     400 · Payer is associated with a different site
 *
 * y el repositorio ya lo tenía catalogado desde WCS-49142 para `test@testuser.com`.
 * Mientras tanto `probe_daily` creaba preaprobaciones TEST de verdad —HTTP 201—
 * porque recibía la forma que el proveedor sí emite.
 *
 * Un comprador de sandbox NO se puede inventar: es una identidad que crea el
 * proveedor y que pertenece a un sitio concreto. Por eso es configuración, y por
 * eso la regla vive en un solo módulo que comparten las tres acciones.
 *
 * Correr: npm run test:mpqa02-payer
 */
import { readFileSync } from "node:fs";
import {
  resolveConfiguredTestBuyer, isTestBuyerEmail, maskBuyerEmail,
  TEST_BUYER_PATTERN, TEST_PAYER_CUSTOMER_PATTERN,
} from "../../lib/billing/qa/test-payer";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const RUTA = readFileSync("app/api/billing/qa/mercadopago-smoke/route.ts", "utf8");
/** El cuerpo de `create_monthly` / `create_annual`, que comparten rama. */
const CREAR = (() => {
  const i = RUTA.indexOf('accion === "create_monthly"');
  return i === -1 ? "" : RUTA.slice(i, i + 2600);
})();

const VALIDO = "test_user_4701529764804170920@testuser.com";

console.log("\nMP-QA-HARDENING-02 · El comprador de prueba\n");

// ===========================================================================
console.log("A · La forma que el proveedor sí acepta");
// ===========================================================================

check("A1. Un comprador emitido por Mercado Pago pasa", () => {
  assert(isTestBuyerEmail(VALIDO), "se rechazó la forma que creó una preaprobación real");
  const r = resolveConfiguredTestBuyer(VALIDO);
  assert(r.ok && r.email === VALIDO, `no resolvió: ${JSON.stringify(r)}`);
});

check("A2. Los dos ejemplos de documentación que el proveedor RECHAZA, se rechazan aquí", () => {
  for (const malo of ["test_payer@example.com", "test@testuser.com"]) {
    assert(!isTestBuyerEmail(malo), `«${malo}» pasó la validación`);
    const r = resolveConfiguredTestBuyer(malo);
    assert(!r.ok && r.reason === "PAYER_EMAIL_FORM_NOT_ALLOWED",
      `«${malo}» no falló como debe: ${JSON.stringify(r)}`);
  }
});

check("A3. Y tampoco pasan las variantes de al lado", () => {
  for (const malo of ["test_user_@testuser.com", "test_user_abc@testuser.com",
                      "test_user_123@testuser.com.co", "TEST_USER_123@testuser.com",
                      " test_user_123@testuser.com", "test_payer_123@testuser.com"]) {
    assert(!isTestBuyerEmail(malo), `«${malo}» pasó como comprador`);
  }
});

check("A4. Sin variable configurada falla ANTES del proveedor, y con su propio código", () => {
  // El módulo NO lee el entorno: lo recibe. Así habla de formas y no de una
  // pasarela, y la frontera de PE-05B2 sigue siendo de cinco ficheros.
  for (const vacio of [undefined, null, "", "   "]) {
    const r = resolveConfiguredTestBuyer(vacio);
    assert(!r.ok && r.reason === "TEST_BUYER_EMAIL_NOT_CONFIGURED",
      `${JSON.stringify(vacio)} debería decir que no está configurada: ${JSON.stringify(r)}`);
  }
});

check("A5. El correo no se publica entero en las respuestas", () => {
  const m = maskBuyerEmail(VALIDO);
  assert(m.endsWith("@testuser.com"), `la máscara pierde el dominio: ${m}`);
  assert(!m.includes("4701529764804170920"), `la máscara publica el identificador: ${m}`);
});

// ===========================================================================
console.log("\nB · Las acciones que crean la suscripción usan la configuración");
// ===========================================================================

check("B1. `create_monthly` y `create_annual` resuelven desde el entorno", () => {
  assert(CREAR !== "", "no se encontró la rama de create_monthly");
  assert(CREAR.includes("resolveConfiguredTestBuyer(process.env.MERCADOPAGO_TEST_BUYER_EMAIL)"),
    "la rama que crea la suscripción no resuelve el comprador desde la variable de entorno");
  assert(/payerEmail: pagador\.email/.test(CREAR),
    "no es el comprador resuelto el que viaja al proveedor");
});

check("B2. Y las dos comparten rama · una sola fuente, no dos", () => {
  assert(/accion === "create_monthly" \|\| accion === "create_annual"/.test(RUTA),
    "mensual y anual dejaron de compartir la resolución del comprador");
});

check("B3. La validación va ANTES de llamar al proveedor", () => {
  const iResolver = CREAR.indexOf("resolveConfiguredTestBuyer(");
  const iProveedor = CREAR.indexOf("proveedor.createSubscription");
  assert(iResolver > -1 && iProveedor > -1, "falta alguna de las dos piezas");
  assert(iResolver < iProveedor,
    "se llama al proveedor antes de validar el comprador: el error vendría de fuera");
  assert(/if \(!pagador\.ok\) return no\(pagador\.reason/.test(CREAR),
    "no se corta con el motivo cuando el comprador no vale");
});

check("B4. No queda ningún comprador escrito a mano", () => {
  assert(!RUTA.includes("test_payer@example.com"),
    "sigue el correo del ejemplo de la documentación");
  assert(!RUTA.includes("PAGADOR_QA_DOCUMENTADO"),
    "sigue la constante del pagador escrito a mano");
  // Ni ningún otro literal con la forma de comprador dentro de la ruta.
  const literales = RUTA.match(/"test_user_[0-9]+@testuser\.com"/g) ?? [];
  assert(literales.length === 0, `hay ${literales.length} compradores incrustados`);
});

check("B5. Y no se acepta un comprador arbitrario desde el cuerpo de la petición", () => {
  assert(!/payerEmail:\s*String\(cuerpo/.test(CREAR),
    "la rama de creación acepta el comprador de quien llama");
  assert(!/cuerpo\.email/.test(CREAR),
    "la rama de creación lee un correo del cuerpo");
});

// ===========================================================================
console.log("\nC · Una sola regla · no tres copias de la expresión");
// ===========================================================================

check("C1. La ruta no reimplementa el patrón del comprador", () => {
  const copias = RUTA.match(/\^test_user_\[0-9\]/g) ?? [];
  assert(copias.length === 0,
    `la ruta lleva ${copias.length} copias del patrón en vez de usar el módulo compartido`);
});

check("C2. `probe_daily` conserva su interfaz pero comparte la validación", () => {
  const i = RUTA.indexOf('accion === "probe_daily"');
  assert(i > -1, "desapareció probe_daily");
  const cuerpo = RUTA.slice(i, i + 900);
  assert(/isTestBuyerEmail\(correo\)/.test(cuerpo),
    "probe_daily volvió a validar por su cuenta");
  assert(/cuerpo\.email/.test(cuerpo),
    "probe_daily perdió su interfaz de compatibilidad, que sí puede recibir el correo");
});

check("C3. Los dos patrones se exportan y son distintos entre sí", () => {
  assert(TEST_BUYER_PATTERN.source !== TEST_PAYER_CUSTOMER_PATTERN.source,
    "comprador y cliente de prueba no son la misma forma");
  assert(TEST_PAYER_CUSTOMER_PATTERN.test("test_payer_123@testuser.com"),
    "el patrón del cliente de prueba dejó de reconocer su forma");
});

console.log(`\nMP-QA-HARDENING-02 · comprador: ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
