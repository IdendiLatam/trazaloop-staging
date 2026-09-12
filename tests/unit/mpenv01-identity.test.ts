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

// ===========================================================================
console.log("\nE · El preflight publica el titular OBSERVADO, y nada más");
// ===========================================================================
/**
 * MP-ENV-01.3 · `MERCADOPAGO_EXPECTED_OWNER_ID` es el titular OBSERVADO de la
 * credencial de ese entorno, no el «User ID del propietario» que muestra el
 * panel de la aplicación. En pruebas son distintos —las credenciales de prueba
 * autentican como un usuario de prueba— y confundirlos bloqueó una credencial
 * legítima. Sin poder leer el observado había que adivinarlo.
 */

check("O. El preflight publica `observed_owner_id`", () => {
  assert(/observed_owner_id: duenno\.ownerId/.test(RUTA_QA),
    "el preflight no publica el titular observado, y sin él hay que adivinarlo");
});

check("P. Publicarlo NO hace que el candado se autocorrija", () => {
  // El bloqueo tiene que seguir comparando contra lo ESPERADO. Si alguien
  // cambiara la comparación por el observado, el candado no comprobaría nada.
  assert(/if \(!duenno\.ownerMatchesExpected\)/.test(RUTA_QA),
    "el candado dejó de comparar contra el titular esperado");
  assert(!/expectedOwnerId\s*=\s*duenno\.ownerId/.test(RUTA_QA),
    "hay un respaldo automático al titular observado");
  assert(!/ownerMatchesExpected\s*=\s*true/.test(RUTA_QA),
    "se fuerza la coincidencia en algún sitio");
  // Y la resolución de identidad sigue exigiendo el valor configurado.
  const sinConfig = resolveMercadoPagoIdentity(
    { ...COMPLETA, MERCADOPAGO_EXPECTED_OWNER_ID: "" });
  assert(!sinConfig.ok && sinConfig.reason === "MP_EXPECTED_OWNER_NOT_CONFIGURED",
    "sin titular configurado ya no falla cerrado");
});

check("Q. Y no se publica ningún secreto en esa respuesta", () => {
  // El bloque se recorta hasta donde de verdad TERMINA la respuesta, no a una
  // longitud fija: al añadir comentarios la ventana se quedó corta y la prueba
  // acusó al preflight de haber quitado un campo que seguía ahí.
  const i = RUTA_QA.indexOf('accion === "preflight"');
  const fin = RUTA_QA.indexOf('if (!tokenPuesto) return no(', i);
  assert(i > -1 && fin > i, "no se pudo delimitar el bloque del preflight");
  const bloque = RUTA_QA.slice(i, fin);
  // El token SÍ aparece en el bloque, pero solo dentro del cálculo de la
  // huella. Lo que importa no es que se mencione: es que ningún campo de la
  // respuesta lleve su valor. Se comprueban los campos, no las apariciones.
  const marcas = [...bloque.matchAll(/^ {6}([a-z_]+):/gm)];
  assert(marcas.length > 8, `no se reconocieron los campos del preflight: ${marcas.length}`);
  const campos = marcas.map((m, k) => ({
    campo: m[1],
    // El valor llega hasta el campo siguiente: un campo puede ocupar varias
    // líneas, y mirar solo la primera dejaría pasar un ternario que devuelva
    // el secreto crudo en una de sus ramas.
    valor: bloque.slice(m.index, marcas[k + 1]?.index ?? bloque.length),
  }));
  const SECRETOS = /process\.env\.MERCADOPAGO_(ACCESS_TOKEN|WEBHOOK_SECRET|TEST_BUYER_EMAIL)\b/g;
  for (const { campo, valor } of campos) {
    // Se descuentan los usos que NO devuelven el valor: decir que está, y
    // resumirlo en una huella. Lo que quede es el secreto viajando entero.
    const resto = valor
      .replace(/Boolean\(\s*process\.env\.MERCADOPAGO_[A-Z_]+\s*\)/g, "")
      .replace(/\.update\(\s*process\.env\.MERCADOPAGO_[A-Z_]+ as string\s*\)/g, "");
    assert(!SECRETOS.test(resto),
      `el campo «${campo}» publica un secreto en crudo: ${valor.trim().slice(0, 70)}`);
    SECRETOS.lastIndex = 0;
  }
  // Y los tres se publican solo como presencia o como huella recortada.
  assert(/webhook_secret_present: Boolean\(/.test(bloque),
    "el secreto del webhook dejó de publicarse como booleano");
  assert(/test_buyer_email_configured: compradorConfigurado/.test(bloque),
    "el correo del comprador dejó de publicarse como booleano");
  assert(/access_token_fingerprint/.test(bloque)
    && /digest\("hex"\)\s*\.slice\(0, 10\)/.test(RUTA_QA),
    "la huella del token dejó de ser un recorte no reversible");
});

check("R. `owner_is_test_user` sigue sin ser autoridad de entorno", () => {
  assert(/owner_is_test_user: duenno\.isTestUser/.test(RUTA_QA),
    "se perdió el diagnóstico del titular");
  assert(!/isTestUser[^\n]{0,40}\?[^\n]{0,40}"test"/.test(RUTA_QA),
    "la etiqueta volvió a decidir el entorno");
  assert(/configured_environment: proveedor\.identity\.ok/.test(RUTA_QA),
    "el entorno publicado ya no sale de la configuración");
});

console.log(`\nMP-ENV-01 · identidad: ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
