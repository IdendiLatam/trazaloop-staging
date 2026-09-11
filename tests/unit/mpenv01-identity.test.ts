/**
 * Trazaloop · MP-ENV-01 · De qué entorno y de qué aplicación hablamos.
 *
 *
 * DE DÓNDE SALE ESTA SUITE
 *
 * El entorno del proveedor se deducía de una etiqueta de la cuenta:
 *
 *     tags.includes("test_user") ? "test" : "live"
 *
 * Eso mezcla tres cosas distintas —quién es el titular, qué clase de credencial
 * es, y en qué entorno operamos— y falla en los dos sentidos:
 *
 *   · una credencial de PRUEBA de aplicación pertenece a una cuenta productiva
 *     y no lleva la etiqueta: se habría clasificado como `live` estando en
 *     sandbox, y el webhook habría rechazado TODOS los avisos legítimos con un
 *     200 silencioso y un evento «environment_mismatch»;
 *   · un token de un `test_user` lleva la etiqueta aunque pertenezca a OTRA
 *     aplicación. Eso pasó: un ensayo real creó una preaprobación y cobró
 *     190 400 COP bajo la aplicación 2865672781510830 mientras los webhooks
 *     estaban configurados en otra. Firma válida, entorno «correcto», cobro
 *     real, y ni una sola notificación.
 *
 * De ahí las dos reglas que esta suite defiende: el entorno se DECLARA, y la
 * aplicación se COMPRUEBA. Firma válida no basta; entorno válido tampoco.
 *
 * Correr: npm run test:mpenv01
 */
import { readFileSync } from "node:fs";
import {
  resolveMercadoPagoIdentity, environmentMatchesConfigured,
  applicationMatches, ownerMatches,
} from "../../lib/billing/mercadopago/identity";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const APP = 3944173067958336;      // Trazaloop Sandbox
const OWNER = 2536124156;
const OTRA_APP = 2865672781510830; // la del ensayo que se perdió los webhooks
const COMPLETA = {
  MERCADOPAGO_ENVIRONMENT: "test",
  MERCADOPAGO_EXPECTED_APPLICATION_ID: String(APP),
  MERCADOPAGO_EXPECTED_OWNER_ID: String(OWNER),
};

const RUTA_QA = readFileSync("app/api/billing/qa/mercadopago-smoke/route.ts", "utf8");
const RUTA_WH = readFileSync("app/api/billing/webhooks/mercadopago/route.ts", "utf8");
const ADAPTADOR = readFileSync("lib/billing/providers/mercadopago.ts", "utf8");

console.log("\nMP-ENV-01 · Identidad de entorno y aplicación\n");

// ===========================================================================
console.log("A · La configuración manda, y falla cerrado");
// ===========================================================================

check("A1. Con entorno, aplicación y titular declarados, resuelve", () => {
  const r = resolveMercadoPagoIdentity(COMPLETA);
  assert(r.ok, `no resolvió: ${JSON.stringify(r)}`);
  assert(r.value.environment === "test" && r.value.expectedApplicationId === APP
    && r.value.expectedOwnerId === OWNER, JSON.stringify(r.value));
});

check("C. Sin entorno declarado, falla cerrado", () => {
  for (const vacio of [undefined, "", "   "]) {
    const r = resolveMercadoPagoIdentity({ ...COMPLETA, MERCADOPAGO_ENVIRONMENT: vacio });
    assert(!r.ok && r.reason === "MP_ENVIRONMENT_NOT_CONFIGURED", JSON.stringify(r));
  }
});

check("D. Un entorno que no es `test` ni `live`, falla", () => {
  for (const malo of ["sandbox", "TEST", "prod", "preview", "0"]) {
    const r = resolveMercadoPagoIdentity({ ...COMPLETA, MERCADOPAGO_ENVIRONMENT: malo });
    assert(!r.ok && r.reason === "MP_ENVIRONMENT_INVALID", `«${malo}»: ${JSON.stringify(r)}`);
  }
});

check("N. Sin aplicación o sin titular esperados, falla cerrado", () => {
  const sinApp = resolveMercadoPagoIdentity(
    { ...COMPLETA, MERCADOPAGO_EXPECTED_APPLICATION_ID: "" });
  assert(!sinApp.ok && sinApp.reason === "MP_EXPECTED_APPLICATION_NOT_CONFIGURED",
    JSON.stringify(sinApp));
  const sinOwner = resolveMercadoPagoIdentity(
    { ...COMPLETA, MERCADOPAGO_EXPECTED_OWNER_ID: "" });
  assert(!sinOwner.ok && sinOwner.reason === "MP_EXPECTED_OWNER_NOT_CONFIGURED",
    JSON.stringify(sinOwner));
  for (const basura of ["abc", "-1", "0", "12.5", "1e9", " 12 3"]) {
    const r = resolveMercadoPagoIdentity(
      { ...COMPLETA, MERCADOPAGO_EXPECTED_APPLICATION_ID: basura });
    assert(!r.ok, `«${basura}» pasó como identificador de aplicación`);
  }
});

// ===========================================================================
console.log("\nB · El entorno del aviso se compara con el DECLARADO");
// ===========================================================================

check("E. test + live_mode=false → coincide", () => {
  assert(environmentMatchesConfigured(false, "test"), "un aviso de sandbox se rechazó");
});
check("F. test + live_mode=true → se rechaza", () => {
  assert(!environmentMatchesConfigured(true, "test"), "un aviso de producción pasó en pruebas");
});
check("G. live + live_mode=true → coincide", () => {
  assert(environmentMatchesConfigured(true, "live"), "un aviso de producción se rechazó");
});
check("H. live + live_mode=false → se rechaza", () => {
  assert(!environmentMatchesConfigured(false, "live"), "un aviso de pruebas pasó en producción");
});
check("I. Sin `live_mode` se rechaza SIEMPRE", () => {
  for (const env of ["test", "live"] as const) {
    assert(!environmentMatchesConfigured(null, env), `null pasó con ${env}`);
    assert(!environmentMatchesConfigured(undefined, env), `undefined pasó con ${env}`);
  }
});

// ===========================================================================
console.log("\nC · La aplicación y el titular");
// ===========================================================================

check("J. La aplicación esperada coincide · texto o número dan igual", () => {
  assert(applicationMatches(APP, APP), "no reconoció su propia aplicación");
  assert(applicationMatches(String(APP), APP), "no reconoció el mismo id como texto");
});

check("K. Otra aplicación NO coincide · es el caso que ocurrió de verdad", () => {
  assert(!applicationMatches(OTRA_APP, APP),
    "la aplicación del ensayo perdido se aceptó como propia");
  for (const nada of [null, undefined, "", "abc", 0, -1]) {
    assert(!applicationMatches(nada as never, APP), `${JSON.stringify(nada)} pasó como aplicación`);
  }
});

check("M. `owner_is_test_user` NO convierte en `live` una configuración `test`", () => {
  // La etiqueta describe a una persona. El entorno lo declara el despliegue.
  const r = resolveMercadoPagoIdentity(COMPLETA);
  assert(r.ok && r.value.environment === "test",
    "la configuración dejó de mandar sobre el entorno");
  assert(!/tags/.test(JSON.stringify(r)), "la resolución mira etiquetas del titular");
  assert(ownerMatches(OWNER, OWNER) && !ownerMatches(999, OWNER),
    "el titular esperado no se compara por identificador");
});

// ===========================================================================
console.log("\nD · Y el producto lo usa · no es una biblioteca decorativa");
// ===========================================================================

check("B. La ruta QA exige titular esperado y ya NO la etiqueta `test_user`", () => {
  assert(!/!duenno\.isTestUser/.test(RUTA_QA),
    "la ruta QA sigue exigiendo la etiqueta `test_user` como candado");
  assert(!RUTA_QA.includes("MERCADOPAGO_CREDENTIAL_OWNER_IS_NOT_TEST_USER"),
    "sigue el rechazo por etiqueta");
  assert(/if \(!duenno\.ownerMatchesExpected\)/.test(RUTA_QA),
    "la ruta QA no exige que el titular sea el esperado");
  assert(/identidadQa\.value\.environment !== "test"/.test(RUTA_QA),
    "la ruta QA no exige que el entorno declarado sea de pruebas");
  assert(/owner_is_test_user: duenno\.isTestUser/.test(RUTA_QA),
    "se perdió el diagnóstico del titular, que sigue siendo útil");
});

check("L. El webhook usa el entorno configurado y comprueba la aplicación", () => {
  assert(/environmentMatchesConfigured\(aviso\.liveMode, entorno\)/.test(RUTA_WH),
    "el webhook no compara contra el entorno declarado");
  assert(!/environmentMatches\(/.test(RUTA_WH.replace(/environmentMatchesConfigured\(/g, "")),
    "el webhook sigue usando la comparación vieja");
  const veces = (RUTA_WH.match(/applicationMatches\(/g) ?? []).length;
  assert(veces >= 2,
    `la aplicación se comprueba en ${veces} rama(s); hacen falta las dos`);
  assert(/application_mismatch/.test(RUTA_WH),
    "no existe un resultado propio para «no es nuestra aplicación»");
  assert(/ownerMatchesExpected/.test(RUTA_WH),
    "el webhook no comprueba el titular de la credencial");
});

check("K bis. `create_monthly` no sella un objeto de otra aplicación, y lo deshace", () => {
  const i = RUTA_QA.indexOf('accion === "create_monthly"');
  const rama = RUTA_QA.slice(i, i + 3800);
  const iComprobacion = rama.indexOf("applicationMatches(");
  const iSello = rama.indexOf("billing_attach_provider_subscription");
  assert(iComprobacion > -1, "no se comprueba la aplicación al crear");
  assert(iComprobacion < iSello, "se sella antes de comprobar la aplicación");
  assert(/cancelSubscription\(/.test(rama),
    "no se compensa el objeto externo cuando la aplicación no coincide");
  assert(/orphan_external_subscription/.test(rama),
    "si la compensación falla, no se dice que quedó un objeto vivo");
});

check("El adaptador ya no deduce el entorno del prefijo del token", () => {
  assert(!/environmentFromAccessToken/.test(ADAPTADOR),
    "el adaptador sigue leyendo el prefijo del token");
  assert(/identity\.ok \? identity\.value\.environment : null/.test(ADAPTADOR),
    "el entorno del adaptador no sale de la configuración");
  assert(!/startsWith\("TEST-"\)|startsWith\("APP_USR/.test(ADAPTADOR),
    "se volvió a mirar el prefijo del token");
});

console.log(`\nMP-ENV-01 · identidad: ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
