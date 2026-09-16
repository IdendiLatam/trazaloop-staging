/**
 * Trazaloop · MP-REC-01B · La vuelta y el botón.
 *
 *
 * QUÉ DEFIENDE ESTA SUITE
 *
 * Dos cosas que solo se pueden comprobar leyendo el código, y que si se rompen
 * no dan error: dan algo peor.
 *
 *   · Que la pantalla de vuelta NO active con lo que venga en la URL. Si lo
 *     hiciera, el plan Full costaría teclear una cadena. Eso no lanza ninguna
 *     excepción: simplemente regala el producto.
 *
 *   · Que el botón de recurrencia no aparezca en Producción. Tampoco lanza
 *     nada: solo deja contratar un carril que no está aprobado.
 *
 * Y una tercera, de fontanería con consecuencias: que el `back_url` salga del
 * despliegue actual. Escrito a mano apuntaría a Producción, y quien autorizara
 * en Staging volvería al sitio equivocado a que no le encontraran la
 * autorización.
 *
 * Correr: npm run test:mprec01c
 */
import { readFileSync, existsSync } from "node:fs";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}
const leer = (p: string) => readFileSync(p, "utf8");

const RUTA_RETORNO =
  "app/(app)/(shell)/settings/billing/recurring/return/page.tsx";
const SERVICIO = "lib/db/recurring-checkout.ts";
const PANEL = "components/domain/billing/recurring-checkout-panel.tsx";
const CHECKOUT = "app/(app)/(shell)/settings/billing/checkout/page.tsx";
const ACCIONES = "server/actions/billing.ts";

console.log("\n1 · LA RUTA DE VUELTA EXISTE Y ES DE SERVIDOR");

check("1A. La página existe en la ruta que se le da al proveedor", () => {
  assert(existsSync(RUTA_RETORNO), `no existe ${RUTA_RETORNO}`);
  // Y es la MISMA que se manda como `back_url`. Que existan dos cadenas
  // parecidas en dos ficheros es exactamente cómo se llega a una vuelta a 404.
  const servicio = leer(SERVICIO);
  assert(/\/settings\/billing\/recurring\/return\?a=/.test(servicio),
    "el servicio no manda al proveedor a la ruta de vuelta real");
});

check("1B. No se prerenderiza", () => {
  assert(/export const dynamic = "force-dynamic"/.test(leer(RUTA_RETORNO)),
    "una pantalla con sesión y dinero no puede prerenderizarse");
});

console.log("\n2 · DE LA URL SOLO SE LEE UN PUNTERO");

check("2A. No se lee estado, importe, moneda ni cobrador de los parámetros", () => {
  const p = leer(RUTA_RETORNO);
  for (const prohibido of ["status", "collection_status", "payment_id",
                           "preapproval_id", "amount", "currency",
                           "collector_id", "external_reference"]) {
    assert(!new RegExp(`params\\.${prohibido}\\b`).test(p),
      `la vuelta lee «${prohibido}» de la URL`);
    assert(!new RegExp(`searchParams\\.${prohibido}\\b`).test(p),
      `la vuelta lee «${prohibido}» de la URL`);
  }
  // Lo ÚNICO que se lee es el puntero a nuestra autorización.
  assert(/params\.a\b/.test(p), "la vuelta no lee el puntero a la autorización");
});

check("2B. Un puntero con forma inválida no llega a preguntar nada", () => {
  const p = leer(RUTA_RETORNO);
  assert(/\/\^\[0-9a-f-\]\{36\}\$\/i\.test\(autorizacionId\)/.test(p),
    "no se valida la forma del identificador antes de usarlo");
});

check("2C. La autorización tiene que ser de ESTA empresa", () => {
  // Sin esto, conocer un identificador ajeno dispararía la conciliación de
  // otra empresa. La RLS ya lo impediría; esto es la segunda cerradura.
  const p = leer(RUTA_RETORNO);
  assert(/\.eq\("organization_id", org\.organizationId\)/.test(p),
    "la vuelta no comprueba que la autorización sea de la empresa activa");
});

console.log("\n3 · AUTORIZADO NO SE ANUNCIA COMO PAGADO");

check("3A. Existe un estado propio para «autorizado sin cobro»", () => {
  const p = leer(RUTA_RETORNO);
  assert(/authorization_received/.test(p),
    "no hay estado para la autorización sin cobro");
  assert(/Autorización recibida/.test(p),
    "no se le dice a quien vuelve que su autorización se registró");
  assert(/Todavía no se ha cobrado nada/.test(p),
    "no se dice que aún no se cobró");
});

check("3B. «Tu plan está activo» SOLO cuelga del estado conciliado", () => {
  const p = leer(RUTA_RETORNO);
  const i = p.indexOf('r.state === "active"');
  const j = p.indexOf("Tu plan está activo");
  assert(i > 0 && j > i,
    "el anuncio de plan activo no está dentro de la rama conciliada");
  // Y esa rama sale de `settledNow > 0`, que solo lo pone la conciliación.
  assert(/settledNow > 0 \? "active"/.test(leer(SERVICIO)),
    "«active» no depende de que se haya saldado un cobro");
});

check("3C. Un proveedor que no responde no es un error fatal", () => {
  const p = leer(RUTA_RETORNO);
  assert(/PROVIDER_UNAVAILABLE/.test(p), "no se distingue «no pude mirar»");
  assert(/No se cobró nada de más/.test(p),
    "no se tranquiliza a quien vuelve y no obtiene confirmación");
});

console.log("\n4 · EL BOTÓN SOLO EXISTE DONDE DEBE");

check("4A. La pantalla de contratación pregunta a la política", () => {
  const c = leer(CHECKOUT);
  assert(/isRecurringLaneOpen\(\)/.test(c),
    "la pantalla no consulta la política del carril");
  assert(/isRecurringLaneOpen\(\) && presupuesto\.billingInterval === "monthly"/.test(c),
    "el panel recurrente no está acotado al mensual");
});

check("4B. La decisión del carril NO se toma a mano en la pantalla", () => {
  // Se mira la REGIÓN del panel recurrente, no el fichero entero: el carril
  // manual tiene su propia línea de entorno desde antes, y no es de lo que
  // trata esta prueba. Lo que no puede aparecer es una segunda forma de
  // decidir si el recurrente se enseña.
  const c = leer(CHECKOUT);
  const i = c.indexOf("MP-REC-01B");
  assert(i > 0, "no se encontró la región del panel recurrente");
  const region = c.slice(i, c.indexOf("</div>", c.indexOf("RecurringCheckoutPanel")));
  assert(!/VERCEL_ENV|BILLING_RECURRING_ENABLED|process\.env/.test(region),
    "la pantalla decide el carril mirando el entorno a mano");
  assert(!/isProductionEnvironment|isStagingEnvironment/.test(region),
    "la pantalla reimplementa la decisión en vez de preguntar a la política");
});

check("4C. El carril manual sigue enseñándose siempre", () => {
  const c = leer(CHECKOUT);
  // El panel de pago único NO puede haber quedado dentro del condicional.
  const iManual = c.indexOf("<RedirectCheckoutPanel");
  const iCond = c.indexOf("isRecurringLaneOpen()");
  assert(iManual > 0 && iManual < iCond,
    "el carril manual quedó condicionado por la bandera del recurrente");
});

check("4D. La acción de servidor no se fía de que la pantalla acertara", () => {
  // Enseñar el botón y autorizar son dos decisiones. Si solo lo decidiera la
  // pantalla, un `fetch` a mano se saltaría el carril entero.
  const s = leer(SERVICIO);
  assert(/resolveRecurringLane\(\)/.test(s),
    "el servicio no comprueba el carril");
  const i = s.indexOf("resolveRecurringLane()");
  const j = s.indexOf("billing_open_checkout_intent");
  assert(i > 0 && i < j,
    "el carril se comprueba después de empezar a tocar la base");
});

console.log("\n5 · EL BACK_URL SALE DEL DESPLIEGUE, NO DE UNA CONSTANTE");

check("5A. El origen llega como parámetro y no está escrito a mano", () => {
  const s = leer(SERVICIO);
  assert(/input\.origin\.replace/.test(s),
    "el back_url no se construye desde el origen recibido");
  assert(!/https:\/\/www\.trazaloop\.com/.test(s),
    "hay un origen de Producción escrito a mano en el servicio");
});

check("5B. Y la acción lo deriva de la petición", () => {
  const a = leer(ACCIONES);
  const i = a.indexOf("startRecurringCheckoutForQuoteAction");
  const trozo = a.slice(i, i + 1600);
  assert(/origin: await origenDePeticion\(\)/.test(trozo),
    "la acción recurrente no deriva el origen de la petición");
});

console.log("\n6 · NI EL PANEL NI LA ACCIÓN MANEJAN DINERO");

check("6A. El panel solo conoce un presupuesto", () => {
  const p = leer(PANEL);
  for (const prohibido of ["amount", "currency", "importe", "precio"]) {
    assert(!new RegExp(`${prohibido}\\s*[:=]`, "i").test(p),
      `el panel maneja «${prohibido}»`);
  }
  assert(/quoteId/.test(p), "el panel no recibe el presupuesto");
});

check("6B. Y dice lo que va a pasar antes de que pase", () => {
  const p = leer(PANEL);
  assert(/cada mes/.test(p), "el panel no dice que el cobro se repite");
  assert(/se confirme el primer cobro, no al autorizar/.test(p),
    "el panel no advierte de que autorizar no es activar");
});

check("6C. El panel no nombra ninguna pasarela", () => {
  const p = leer(PANEL);
  assert(!/mercado\s*pago/i.test(p),
    "una pieza de interfaz nombra la pasarela en vez de recibirla como dato");
  assert(/providerName/.test(p), "el panel no recibe el nombre visible como dato");
});

console.log(`\nMP-REC-01B · vuelta e interfaz: ${passed} en verde, ${failed} en rojo`);
if (failed > 0) process.exit(1);
