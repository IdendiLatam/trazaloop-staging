/**
 * Trazaloop · PROD-LAUNCH-01D.3A · Quién cobra la contratación.
 *
 *
 * EL DEFECTO QUE ESTO CIERRA
 *
 * El primer intento de contratar en Producción —Empresa de Prueba 1, Full
 * mensual, con la tasa ya vigente y el importe correcto en pantalla— mostró:
 *
 *     PAGO SEGURO CON WOMPI
 *     El pago con tarjeta no está disponible ahora mismo. No se cobró nada.
 *
 * Las dos frases eran ciertas. Juntas no tenían sentido: se anunciaba una
 * pasarela sin configurar mientras Mercado Pago —con su tasa, su credencial y
 * su frontera ya validadas— ni se consultaba.
 *
 *
 * LA CAUSA
 *
 * No era una elección equivocada: NO HABÍA ELECCIÓN. La pantalla de contratar
 * llamaba a la base con `p_provider: 'wompi'` escrito a mano. El carril de pago
 * único de Mercado Pago existía entero desde PROD-LAUNCH-01B y solo se
 * alcanzaba desde el panel de RENOVACIÓN, así que quien contrataba por primera
 * vez nunca pasaba por él.
 *
 *
 * LO QUE SE DEFIENDE AQUÍ
 *
 *   · La contratación self-service la cobra Mercado Pago.
 *   · Si Mercado Pago no está completo, NO hay pago. Nunca se cae a Wompi.
 *   · Wompi sigue entera; lo que deja de existir es que se elija sola.
 *   · Dibujar la pantalla no crea ninguna preferencia.
 *   · El importe que se cobra es el que se enseñó, no uno recalculado.
 *
 * Correr: npm run test:pl01d3a
 */
import { readFileSync } from "node:fs";
import {
  resolvePurchaseRouting, selectedPurchaseProvider,
  PURCHASE_UNAVAILABLE_MESSAGE, type PurchaseRoutingEnv,
} from "../../lib/billing/purchase-routing";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}
const leer = (f: string) => readFileSync(f, "utf8");
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/[^\n]*/g, "$1");

/** Lo que hay HOY en Production. */
const MP_COMPLETO: PurchaseRoutingEnv = {
  MERCADOPAGO_ACCESS_TOKEN: "no-es-un-token-de-verdad-solo-forma",
  MERCADOPAGO_ENVIRONMENT: "live",
  MERCADOPAGO_EXPECTED_APPLICATION_ID: "2164202221012782",
  MERCADOPAGO_EXPECTED_OWNER_ID: "2536124156",
};

console.log("\nA · Mercado Pago cobra la contratación");
// ===========================================================================

check("Con Mercado Pago completo y sin declarar nada, cobra Mercado Pago", () => {
  const r = resolvePurchaseRouting(MP_COMPLETO);
  assert(r.available, `no disponible: ${JSON.stringify(r)}`);
  assert(r.provider === "mercadopago", `cobra «${r.provider}»`);
});

check("Y da igual el plan y la periodicidad: la ruta no los mira", () => {
  // Full mensual y Full anual comparten pantalla y proveedor. Si algún día
  // dependiera del plan, esta comprobación lo obligaría a declararse.
  const firma = JSON.stringify(Object.keys(MP_COMPLETO).sort());
  assert(!/plan|interval/i.test(firma),
    "la ruta empezó a depender del plan o del intervalo sin decirlo");
  const r = resolvePurchaseRouting(MP_COMPLETO);
  assert(r.available && r.provider === "mercadopago", "no cobra Mercado Pago");
});

console.log("\nB · Falla cerrado, y nunca de lado");
// ===========================================================================

check("Sin token, NO hay pago — y NO se cae a Wompi", () => {
  const r = resolvePurchaseRouting({ ...MP_COMPLETO, MERCADOPAGO_ACCESS_TOKEN: "" });
  assert(!r.available, "ofrece pagar sin credencial");
  assert(r.provider !== "wompi",
    "sin Mercado Pago se eligió Wompi sola: eso cambia en quién ingresa el dinero");
  assert(r.reason === "MERCADOPAGO_NOT_CONFIGURED", `motivo «${r.reason}»`);
  assert(r.detail === "ACCESS_TOKEN_MISSING", `detalle «${r.detail}»`);
});

check("Con la identidad incompleta tampoco, en los tres huecos", () => {
  const huecos: [string, PurchaseRoutingEnv, string][] = [
    ["sin entorno", { ...MP_COMPLETO, MERCADOPAGO_ENVIRONMENT: "" },
      "MP_ENVIRONMENT_NOT_CONFIGURED"],
    ["sin aplicación", { ...MP_COMPLETO, MERCADOPAGO_EXPECTED_APPLICATION_ID: "" },
      "MP_EXPECTED_APPLICATION_NOT_CONFIGURED"],
    ["sin titular", { ...MP_COMPLETO, MERCADOPAGO_EXPECTED_OWNER_ID: "" },
      "MP_EXPECTED_OWNER_NOT_CONFIGURED"],
  ];
  for (const [nombre, env, motivo] of huecos) {
    const r = resolvePurchaseRouting(env);
    assert(!r.available, `«${nombre}» dejó pagar`);
    assert(r.provider !== "wompi", `«${nombre}» se cayó a Wompi`);
    assert(r.detail === motivo, `«${nombre}» dio «${r.detail}»`);
  }
});

check("Y AUNQUE Wompi esté perfectamente configurada, sigue sin elegirse", () => {
  // Este es el caso que de verdad importa: la tentación de «pues usa la que
  // funciona» es exactamente lo que no se puede hacer.
  const r = resolvePurchaseRouting({
    ...MP_COMPLETO, MERCADOPAGO_ACCESS_TOKEN: "",
    WOMPI_PUBLIC_KEY: "pub_test_xxxxxxxx", WOMPI_PRIVATE_KEY: "prv_test_xxxxxxxx",
  });
  assert(!r.available, "con Wompi lista y Mercado Pago rota, ofreció pagar");
  assert(r.provider !== "wompi", "respaldo silencioso a Wompi");
});

check("Un proveedor que nadie reconoce se para, no se adivina", () => {
  const r = resolvePurchaseRouting({ ...MP_COMPLETO, BILLING_PURCHASE_PROVIDER: "paypal" });
  assert(!r.available, "un valor desconocido dejó pagar");
  assert(r.reason === "PROVIDER_NOT_RECOGNISED", `motivo «${r.reason}»`);
  assert(r.provider === null, "se eligió un proveedor pese a no reconocer el valor");
});

console.log("\nC · Wompi sigue ahí, pero hay que nombrarla");
// ===========================================================================

check("Declarada y configurada, Wompi cobra igual que siempre", () => {
  const r = resolvePurchaseRouting({
    BILLING_PURCHASE_PROVIDER: "wompi",
    WOMPI_PUBLIC_KEY: "pub_test_xxxxxxxx", WOMPI_PRIVATE_KEY: "prv_test_xxxxxxxx",
  });
  assert(r.available && r.provider === "wompi", `quedó ${JSON.stringify(r)}`);
});

check("Declarada y SIN configurar, tampoco se cae a Mercado Pago", () => {
  const r = resolvePurchaseRouting({ ...MP_COMPLETO, BILLING_PURCHASE_PROVIDER: "wompi" });
  assert(!r.available, "con Wompi elegida y vacía, cobró igual");
  assert(r.provider !== "mercadopago", "se cayó a Mercado Pago sin que nadie lo decidiera");
  assert(r.reason === "WOMPI_NOT_CONFIGURED", `motivo «${r.reason}»`);
});

check("El valor por omisión es Mercado Pago, y está escrito", () => {
  for (const v of [undefined, null, "", "  ", "MercadoPago", "MERCADOPAGO"]) {
    assert(selectedPurchaseProvider({ BILLING_PURCHASE_PROVIDER: v }) === "mercadopago",
      `«${v}» no eligió Mercado Pago`);
  }
  assert(selectedPurchaseProvider({ BILLING_PURCHASE_PROVIDER: "wompi" }) === "wompi",
    "«wompi» dejó de elegirse cuando se la nombra");
});

console.log("\nD · La pantalla ya no elige por su cuenta");
// ===========================================================================

const PAGINA = sinComentarios(leer("app/(app)/(shell)/settings/billing/checkout/page.tsx"));

check("El despachador no escribe ningún proveedor a mano", () => {
  // Acotado al DESPACHADOR y al carril de Mercado Pago. Dentro de
  // `CheckoutWompi` el string 'wompi' es correcto: ese carril ES Wompi. Lo que
  // no puede haber es un proveedor elegido sin preguntar.
  const despachador = PAGINA.slice(
    PAGINA.indexOf("export default async function CheckoutPage"),
    PAGINA.indexOf("async function CheckoutWompi"));
  assert(!/p_provider/.test(despachador),
    "el despachador nombra un proveedor a mano en vez de preguntar");
  assert(/resolvePurchaseRoutingFromEnv\(/.test(despachador),
    "el despachador no pregunta a la autoridad de proveedor");
  const mp = PAGINA.slice(PAGINA.indexOf("async function CheckoutRedirigido"),
                          PAGINA.indexOf("function Marco("));
  assert(!/p_provider/.test(mp), "el carril de redirección fija un proveedor a mano");
});

check("Y la ruta se decide ANTES de presupuestar o de dibujar nada", () => {
  // Se comparan SITIOS DE LLAMADA dentro del despachador, no líneas de import:
  // `createBillingQuote` se importa arriba del todo y esa posición no dice
  // nada sobre cuándo se ejecuta.
  const despachador = PAGINA.slice(
    PAGINA.indexOf("export default async function CheckoutPage"),
    PAGINA.indexOf("async function CheckoutWompi"));
  const decide = despachador.indexOf("resolvePurchaseRoutingFromEnv(");
  assert(decide > 0, "el despachador no decide la ruta");
  assert(!/createBillingQuote\(/.test(despachador),
    "el despachador presupuesta: presupuestar antes de saber quién cobra deja "
    + "cotizaciones huérfanas cada vez que no hay pasarela");
  for (const carril of ["<CheckoutRedirigido", "<CheckoutWompi"]) {
    const i = despachador.indexOf(carril);
    assert(i > decide, `se entra en ${carril} antes de saber quién cobra`);
  }
});

check("Sin proveedor disponible se dice que no, sin nombrar pasarela", () => {
  assert(/PURCHASE_UNAVAILABLE_MESSAGE/.test(PAGINA),
    "no se usa el mensaje canónico de indisponibilidad");
  const m = PURCHASE_UNAVAILABLE_MESSAGE.toLowerCase();
  for (const marca of ["wompi", "mercado pago", "mercadopago"]) {
    assert(!m.includes(marca),
      `el mensaje de «no se puede pagar» nombra a ${marca}: anunciar una marca que no funciona es como empezó este defecto`);
  }
  assert(/no se cobró nada/i.test(PURCHASE_UNAVAILABLE_MESSAGE),
    "no se dice que no se cobró nada");
});

check("La pantalla decide por FORMA de flujo, no por marca", () => {
  const despachador = PAGINA.slice(
    PAGINA.indexOf("export default async function CheckoutPage"),
    PAGINA.indexOf("async function CheckoutWompi"));
  assert(/ruta\.flow === "redirect"/.test(despachador),
    "el despachador ramifica por marca en vez de por forma de flujo");
  assert(!/mercadopago/i.test(PAGINA),
    "la pantalla nombra la pasarela: la frontera declarada es de servidor y "
    + "ninguno de interfaz");
});

console.log("\nE · En el carril de redirección no hay marca ajena");
// ===========================================================================

const PANEL = sinComentarios(leer("components/domain/billing/redirect-checkout-panel.tsx"));

check("El panel de redirección no nombra NINGUNA pasarela", () => {
  // Ni la ajena ni la propia. El nombre visible llega como DATO desde la
  // autoridad de proveedor, y por eso el panel puede vivir fuera de la
  // frontera de la pasarela — que está declarada como «ficheros de servidor,
  // ninguno de interfaz».
  for (const prohibido of ["wompi", "pci", "dss", "mercadopago", "mercado pago"]) {
    assert(!new RegExp(prohibido, "i").test(PANEL),
      `el panel de redirección dice «${prohibido}»`);
  }
  assert(/providerName/.test(PANEL),
    "el panel no recibe el nombre de la pasarela como dato");
  assert(/Pago seguro con/.test(PANEL), "el panel no anuncia de quién es el pago");
});

check("No pide la tarjeta: anuncia que se sale a pagar", () => {
  for (const campo of ["number", "cvc", "cvv", "card_holder", "exp_month"]) {
    assert(!new RegExp(campo, "i").test(PANEL),
      `el panel de redirección pide «${campo}»: en Checkout Pro la tarjeta no pasa por aquí`);
  }
  assert(/Continuar con \$\{providerName\}/.test(PANEL), "falta el botón de continuar");
  assert(/no recibe ni guarda los datos de tu tarjeta/i.test(PANEL),
    "no se dice que Trazaloop no guarda la tarjeta");
});

check("Y el carril de redirección no monta las piezas de Wompi", () => {
  const i = PAGINA.indexOf("async function CheckoutRedirigido");
  assert(i > 0, "desapareció el carril de redirección");
  const cuerpo = PAGINA.slice(i, PAGINA.indexOf("function Marco(", i));
  for (const pieza of ["WompiTrustPanel", "WompiCardForm", "getWompiPublicConfig"]) {
    assert(!cuerpo.includes(pieza), `el carril de Mercado Pago monta «${pieza}»`);
  }
  assert(cuerpo.includes("RedirectCheckoutPanel"), "no monta su propio panel");
});

console.log("\nF · Dibujar no cobra; pulsar cobra una sola vez");
// ===========================================================================

check("El carril de redirección NO crea preferencia al renderizar", () => {
  const i = PAGINA.indexOf("async function CheckoutRedirigido");
  const cuerpo = PAGINA.slice(i, PAGINA.indexOf("function Marco(", i));
  for (const efecto of ["openOneTimeCheckout", "createCheckout", "billing_open_one_time_checkout",
                        "startOneTimeCheckout"]) {
    assert(!cuerpo.includes(efecto),
      `dibujar la pantalla ejecuta «${efecto}»: cargar una pantalla no es contratar`);
  }
});

check("Y si ya hay un pago en curso, se reutiliza en vez de presupuestar otra vez", () => {
  const i = PAGINA.indexOf("async function CheckoutRedirigido");
  const cuerpo = PAGINA.slice(i, PAGINA.indexOf("function Marco(", i));
  const enCurso = cuerpo.indexOf("findOpenOneTimeCheckout");
  const presupuesta = cuerpo.indexOf("createBillingQuote");
  assert(enCurso > 0, "no se mira si ya hay un pago en curso");
  assert(presupuesta > enCurso,
    "se presupuesta antes de mirar si ya había un pago en curso");
});

check("El botón cobra el presupuesto QUE SE ENSEÑÓ, no uno nuevo", () => {
  assert(/startOneTimeCheckoutForQuoteAction\(quoteId\)/.test(PANEL),
    "el botón vuelve a presupuestar: el importe cobrado podría no ser el leído");
  assert(!/startOneTimeCheckoutAction\(/.test(PANEL),
    "el botón usa la acción que presupuesta de nuevo");
  const i = PAGINA.indexOf("RedirectCheckoutPanel quoteId=");
  assert(i > 0, "a la pantalla no se le pasa el presupuesto que enseñó");
});

check("La acción deriva la empresa del presupuesto y exige administración", () => {
  const acciones = sinComentarios(leer("server/actions/billing.ts"));
  const i = acciones.indexOf("export async function startOneTimeCheckoutForQuoteAction");
  assert(i > 0, "falta la acción");
  const cuerpo = acciones.slice(i, i + 1400);
  assert(/exigirAdministracion\(\)/.test(cuerpo),
    "la acción no exige administración de la empresa activa");
  assert(/purpose: "initial"/.test(cuerpo) && /targetId: c\.id/.test(cuerpo),
    "la acción no abre el checkout contra el presupuesto recibido");
  assert(!/organization_id:/.test(cuerpo),
    "la acción acepta una empresa del cliente en vez de derivarla del presupuesto");
});

console.log("\nG · El modelo financiero no se duplicó");
// ===========================================================================

check("Se reutiliza el carril de PROD-LAUNCH-01B, sin segunda liquidación", () => {
  const acciones = sinComentarios(leer("server/actions/billing.ts"));
  const i = acciones.indexOf("export async function startOneTimeCheckoutForQuoteAction");
  const cuerpo = acciones.slice(i, i + 1400);
  assert(/openOneTimeCheckout/.test(cuerpo),
    "no usa la primitiva de checkout de pago único ya validada");
  for (const otro of ["billing_settle", "billing_open_checkout_intent", "settlePayment"]) {
    assert(!cuerpo.includes(otro),
      `la acción de INICIAR toca «${otro}»: iniciar no liquida`);
  }
});

check("Y Wompi conserva su carril entero", () => {
  assert(/async function CheckoutWompi/.test(PAGINA), "desapareció el carril de Wompi");
  for (const pieza of ["findLiveCheckout", "WompiTrustPanel", "WompiCardForm",
                       "CheckoutWatcher", "alreadySubmitted"]) {
    assert(PAGINA.includes(pieza), `se perdió «${pieza}» al reordenar la pantalla`);
  }
  const wompi = PAGINA.indexOf("async function CheckoutWompi");
  const mp = PAGINA.indexOf("async function CheckoutRedirigido");
  // El orden no es estético: hay comprobaciones ajenas que buscan la PRIMERA
  // aparición de `findLiveCheckout` y `createBillingQuote(org.organizationId`
  // y exigen ese orden entre ellas. Mover Wompi detrás las rompería.
  assert(wompi < mp, "el carril de Wompi dejó de ir primero en el fichero");
});

console.log(`\nPROD-LAUNCH-01D.3A · quién cobra: ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
