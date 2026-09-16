/**
 * Trazaloop · MP-REC-01B.11 · La vuelta va al despliegue que atiende.
 *
 *
 * DE DÓNDE SALE ESTA SUITE
 *
 * El primer cobro recurrente real se autorizó y se cobró, y el comprador
 * aterrizó en un 404. El `back_url` llevaba el origen DECLARADO, que en Preview
 * guarda la URL inmutable de un despliegue de hace semanas: seguía vivo,
 * seguía sirviendo la aplicación, y le faltaba justo la ruta de vuelta.
 *
 * Nada avisó. Una URL clavada en una variable no deja de resolver nunca; solo
 * se queda vieja. Por eso esto se comprueba aquí y no se confía a que alguien
 * se acuerde de actualizar la variable cada vez que se despliega.
 *
 * Correr: npm run test:mprec01e
 */
import { readFileSync } from "node:fs";
import {
  resolveRecurringReturnOrigin,
} from "../../lib/billing/recurring/return-origin";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}
const leer = (p: string) => readFileSync(p, "utf8");
const ACCIONES = "server/actions/billing.ts";

/** El despliegue viejo al que fue a parar el primer cobro real. */
const VIEJO = "https://trazaloop-production-evbxval3u-idendi-latam-s-projects.vercel.app";
const ACTUAL = "trazaloop-production-81tubyh2d-idendi-latam-s-projects.vercel.app";

console.log("\n1 · MANDA EL HOST QUE ATIENDE LA PETICIÓN");

check("1A. El origen declarado NO gana al host de la petición", () => {
  // Es exactamente el caso que produjo el 404.
  const o = resolveRecurringReturnOrigin(
    { forwardedHost: ACTUAL, forwardedProto: "https", host: null },
    { NEXT_PUBLIC_SITE_URL: VIEJO });
  assert(o === `https://${ACTUAL}`, `salió «${o}»`);
});

check("1B. `host` sirve cuando no hay cabecera reenviada", () => {
  const o = resolveRecurringReturnOrigin(
    { forwardedHost: null, forwardedProto: null, host: ACTUAL },
    { NEXT_PUBLIC_SITE_URL: VIEJO });
  assert(o === `https://${ACTUAL}`, `salió «${o}»`);
});

check("1C. El protocolo se respeta si el borde lo declara", () => {
  const o = resolveRecurringReturnOrigin(
    { forwardedHost: "localhost:3000", forwardedProto: "http", host: null }, {});
  assert(o === "http://localhost:3000", `salió «${o}»`);
});

check("1D. Sin protocolo declarado se asume https", () => {
  const o = resolveRecurringReturnOrigin(
    { forwardedHost: ACTUAL, forwardedProto: "", host: null }, {});
  assert(o === `https://${ACTUAL}`, `salió «${o}»`);
});

check("1E. Sin ninguna cabecera se cae a lo declarado", () => {
  // Un trabajo de servidor sin petición detrás. No es el caso de alguien
  // contratando, pero devolver cadena vacía sería peor.
  const o = resolveRecurringReturnOrigin(
    { forwardedHost: null, forwardedProto: null, host: null },
    { NEXT_PUBLIC_SITE_URL: `${VIEJO}/` });
  assert(o === VIEJO, `salió «${o}» (y debía quitar la barra final)`);
});

check("1F. Y sin nada, cadena vacía en vez de un host inventado", () => {
  const o = resolveRecurringReturnOrigin(
    { forwardedHost: null, forwardedProto: null, host: null }, {});
  assert(o === "", `salió «${o}»`);
});

console.log("\n2 · NINGÚN HOST ESCRITO A MANO");

check("2A. El resolutor no contiene ningún dominio", () => {
  const f = leer("lib/billing/recurring/return-origin.ts");
  const codigo = f.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert(!/https?:\/\/[a-z]/i.test(codigo),
    "el resolutor lleva una URL escrita a mano");
});

check("2B. Y el servicio tampoco", () => {
  const s = leer("lib/db/recurring-checkout.ts");
  const codigo = s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert(!/https?:\/\/[a-z]/i.test(codigo),
    "el servicio recurrente lleva una URL escrita a mano");
});

console.log("\n3 · EL CARRIL MANUAL NO SE TOCA");

check("3A. El pago único conserva su resolución de origen", () => {
  const a = leer(ACCIONES);
  const manual = a.slice(a.indexOf("export async function startOneTimeCheckoutForQuoteAction"));
  assert(/origin: await origenDePeticion\(\)/.test(manual),
    "se cambió el origen del carril manual");
});

check("3B. Y el recurrente usa el suyo", () => {
  const a = leer(ACCIONES);
  const i = a.indexOf("export async function startRecurringCheckoutForQuoteAction");
  const rec = a.slice(i, a.indexOf("export async function startOneTimeCheckout", i));
  assert(/origin: await origenDeVueltaRecurrente\(\)/.test(rec),
    "el carril recurrente no usa su propio origen de vuelta");
  assert(!/origin: await origenDePeticion\(\)/.test(rec),
    "el carril recurrente sigue usando el origen declarado");
});

console.log("\n4 · LA RUTA Y EL PARÁMETRO NO CAMBIAN");

check("4A. La vuelta sigue siendo la ruta real, con su puntero", () => {
  const s = leer("lib/db/recurring-checkout.ts");
  assert(/\/settings\/billing\/recurring\/return\?a=/.test(s),
    "cambió la ruta de vuelta o su parámetro");
});

console.log(`\nMP-REC-01B.11 · origen de vuelta: ${passed} en verde, ${failed} en rojo`);
if (failed > 0) process.exit(1);
