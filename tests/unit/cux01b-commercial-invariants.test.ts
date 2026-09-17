/**
 * Trazaloop · COMMERCIAL-UX-01B · Tres promesas que la pantalla no puede romper.
 *
 *
 * DE DÓNDE SALE ESTA SUITE
 *
 * De la auditoría COMMERCIAL-UX-01A, que encontró tres cosas antes de que
 * existiera ninguna página nueva:
 *
 *   1. La autoridad decía que Full no medía minutos; la decisión comercial dice
 *      600 al mes. Una página de precios construida encima habría prometido algo
 *      que el producto no aplicaba.
 *
 *   2. «Subir a Extra» se ofrecía siempre, y lo cobra un carril que con Mercado
 *      Pago no puede cobrar. Un botón muerto en una pantalla de dinero.
 *
 *   3. «Cancelar renovación automática» y «Cancelar el plan» podían convivir. El
 *      segundo NO toca la preapproval: alguien podía cancelar creyendo que dejaba
 *      de pagar y seguir siendo cobrado.
 *
 * Correr: npm run test:cux01b
 */
import { readFileSync } from "node:fs";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}
const leer = (p: string) => readFileSync(p, "utf8");

const PAGINA = "app/(app)/(shell)/settings/billing/page.tsx";
const M0211 = "supabase/migrations/0211_full_monthly_minutes_authority.sql";
const DISPONIBILIDAD = "lib/billing/upgrade-availability.ts";
const ACCIONES = "server/actions/billing.ts";

console.log("\nA · LOS 600 MINUTOS VIVEN EN LA AUTORIDAD, NO EN UNA PANTALLA");

check("A1. La corrección publica una revisión nueva, no reescribe la vigente", () => {
  // Una revisión publicada es el precio y las condiciones con las que alguien
  // contrató. Cambiarla por debajo reescribiría lo que se le vendió.
  const m = leer(M0211);
  assert(!/update public\.plan_revision_limits/i.test(m),
    "0211 reescribe los límites de una revisión ya publicada");
  assert(/insert into public\.plan_revisions/i.test(m),
    "0211 no publica una revisión nueva");
  assert(/set effective_to = v_ahora, status = 'retired'/.test(m),
    "0211 no retira la revisión anterior: quedarían dos vigentes");
});

check("A2. Y no toca el precio ni inventa un tope diario", () => {
  const m = leer(M0211);
  assert(/0211_EL_PRECIO_DE_FULL_CAMBIO/.test(m),
    "0211 no comprueba que el precio siga intacto");
  assert(/0211_APARECIO_UN_TOPE_DIARIO_EN_FULL/.test(m),
    "0211 no comprueba que el diario siga sin tope");
  assert(/v_vieja\.monthly_price_minor, v_vieja\.annual_price_minor/.test(m),
    "el precio no se copia de la revisión anterior");
});

check("A3. Es idempotente: aplicarla dos veces no encadena revisiones", () => {
  const m = leer(M0211);
  assert(/ya declara 600 min\/mes; nada que hacer/.test(m),
    "0211 no se detiene si la corrección ya está aplicada");
});

check("A4. Ningún componente escribe 600 a mano", () => {
  // La autoridad es `plan_revision_limits`. Un 600 en un componente sería una
  // segunda verdad, y las segundas verdades se desincronizan sin avisar.
  for (const f of [PAGINA,
                   "components/domain/billing/plan-decisions.tsx",
                   "lib/domain/commercial-catalog.ts"]) {
    const src = leer(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    assert(!/\b600\b/.test(src), `${f} escribe 600 a mano`);
  }
});

console.log("\nC · NINGÚN BOTÓN PROMETE UN COBRO QUE NO PUEDE HACERSE");

check("C1. La disponibilidad se pregunta por CAPACIDAD, no por marca", () => {
  const f = leer(DISPONIBILIDAD);
  const codigo = f.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert(/supportsStoredPaymentSource/.test(codigo),
    "no se comprueba si el carril puede guardar un medio de pago");
  assert(!/mercadopago/i.test(codigo),
    "la decisión está atada al nombre de una pasarela en vez de a su capacidad");
});

check("C2. Sin carril configurado, tampoco", () => {
  const f = leer(DISPONIBILIDAD);
  assert(/UPGRADE_PROVIDER_NOT_CONFIGURED/.test(f),
    "no se contempla que el carril de la mejora no exista en el despliegue");
});

check("C3. La pantalla condiciona el panel transaccional", () => {
  const p = leer(PAGINA);
  assert(/mejora\.transactional \? \(/.test(p),
    "el panel de mejora no depende de que el cobro pueda completarse");
  const i = p.indexOf("<UpgradePanel");
  const j = p.indexOf("mejora.transactional");
  assert(j > 0 && j < i, "la condición va después del panel que debe condicionar");
});

check("C4. Y el carril de Wompi NO se borra", () => {
  // Sigue entero donde está configurado. Lo que se impide es exponerlo donde no
  // puede completarse, no su existencia.
  const f = leer(DISPONIBILIDAD);
  assert(/wompiFromEnv/.test(f), "se eliminó la referencia al carril de la mejora");
  assert(/No borra el carril de Wompi/.test(f),
    "no se declara que el carril se conserva");
});

check("C5. Y la puerta de verdad está en el SERVIDOR, no en la pantalla", () => {
  // Esconder el botón protege a quien mira la pantalla. Una acción de servidor
  // se puede invocar sin pantalla —para eso existe— así que la comprobación
  // tiene que estar también ahí, o la protección es decorativa.
  const a = leer(ACCIONES);
  for (const accion of ["quoteUpgradeAction", "confirmUpgradeAction"]) {
    const i = a.indexOf(`export async function ${accion}`);
    assert(i > 0, `no existe ${accion}`);
    const cuerpo = a.slice(i, i + 1400);
    assert(/resolveUpgradeAvailability\(\)\.transactional/.test(cuerpo),
      `${accion} atiende una mejora que el carril no puede cobrar`);
  }
});

check("C6. Y va DELANTE de la primera escritura", () => {
  // Éste es el orden que importa. `openUpgradeIntent` deja el cambio en
  // `submitted`, y desde ahí no se puede ni retirar ni reintentar: la empresa se
  // queda sin poder subir de plan nunca más, sin que se haya movido un peso.
  const a = leer(ACCIONES);
  const i = a.indexOf("export async function confirmUpgradeAction");
  const cuerpo = a.slice(i, i + 1800);
  const guarda = cuerpo.indexOf("resolveUpgradeAvailability()");
  const escritura = cuerpo.indexOf("openUpgradeIntent(");
  assert(guarda > 0 && escritura > 0, "no se encontraron guarda y escritura");
  assert(guarda < escritura,
    "se abre el intento ANTES de comprobar si el cobro puede completarse");
});

check("C7. La negativa dice que no quedó nada a medias", () => {
  const a = leer(ACCIONES);
  const i = a.indexOf("upgrade_not_available:");
  assert(i > 0, "no hay mensaje propio para «este carril no puede cobrar»");
  const mensaje = a.slice(i, i + 320).replace(/"\s*\+\s*"/g, "").replace(/\s+/g, " ");
  assert(/No se cambió nada/.test(mensaje) && /no se cobró nada/.test(mensaje),
    `la negativa no aclara que no se cambió ni se cobró nada: ${mensaje.slice(0, 160)}`);
});

console.log("\nD · UNA SOLA CANCELACIÓN POR ESTADO");

check("D1. Con recurrencia viva, «Cancelar el plan» no se ofrece", () => {
  const p = leer(PAGINA);
  assert(/offersCancellation=\{recurrenteViva !== null\s*\n?\s*\? false : copiaRenovacion\.offersCancellation\}/
    .test(p.replace(/\s+/g, " ").replace(/ /g, " ")) ||
    /recurrenteViva !== null[\s\S]{0,60}\? false : copiaRenovacion\.offersCancellation/.test(p),
    "con una recurrencia viva se siguen ofreciendo dos cancelaciones");
});

check("D2. Y el panel de cancelación recurrente solo aparece si la hay", () => {
  const p = leer(PAGINA);
  assert(/recurrenteViva !== null \? \(\s*<RecurringCancelPanel/.test(
    p.replace(/\s+/g, " ")),
    "el panel de cancelación recurrente no está condicionado a que exista");
});

check("D3. La razón queda escrita donde se toma la decisión", () => {
  // Esta es la que se rompe sola dentro de seis meses si nadie sabe por qué
  // estaba: «Cancelar el plan» no toca la preapproval.
  const p = leer(PAGINA).replace(/\s+/g, " ");
  assert(/NO toca la preapproval/.test(p),
    "no se explica por qué las dos cancelaciones no pueden convivir");
});

check("D4. Cancelada la recurrencia, la ficha deja de ofrecer cancelar", () => {
  // Lo resuelve `renewalCopyFor(mode, chargesStopped)`: con los cobros
  // detenidos, `offersCancellation` es falso.
  const c = leer("lib/domain/billing-renewal-copy.ts");
  assert(/const COBRO_DETENIDO: RenewalCopy = \{[\s\S]{0,200}offersCancellation: false/.test(c),
    "una recurrencia ya cancelada seguiría ofreciendo cancelar");
});

check("D5. El carril manual no hereda acciones de recurrencia", () => {
  // `renewalCopyFor` manda a SIN_COBRO_AUTOMATICO todo lo que no sea
  // `platform` ni `provider`. Con pago único no hay recurrencia que cancelar, y
  // ofrecerlo invitaría a cancelar algo inexistente —con el riesgo añadido de
  // que alguien crea que cancelando recupera dinero—.
  const c = leer("lib/domain/billing-renewal-copy.ts");
  assert(/if \(mode !== "platform" && mode !== "provider"\) return SIN_COBRO_AUTOMATICO;/
    .test(c), "un modo desconocido ya no cae del lado prudente");
  assert(/const SIN_COBRO_AUTOMATICO: RenewalCopy = \{[\s\S]{0,240}offersCancellation: false/
    .test(c), "el carril manual ofrece cancelar una recurrencia que no tiene");
});

check("D6. Y quien termina un plan manual lee que no habrá cobro nuevo", () => {
  const d = leer("components/domain/billing/plan-decisions.tsx");
  const plano = d.replace(/\s+/g, " ");
  assert(/No se cobrará nada más/.test(plano),
    "confirmar el final de un plan no aclara que no habrá otro cobro");
  assert(/no se borra ningún dato/.test(plano),
    "no se dice que cancelar no borra datos");
});

console.log("\nE · LO QUE NO SE HA TOCADO");

check("E1. El checkout sigue tomando el importe de la base", () => {
  const b = leer("lib/db/billing.ts");
  assert(/rpc\("billing_create_quote"/.test(b),
    "el presupuesto dejó de salir de billing_create_quote");
});

check("E2. La copia comercial FORMATEA precios, pero no los decide", () => {
  // Matiz que la primera versión de esta prueba confundía: dar formato a un
  // importe no es ser su autoridad. Lo que no puede haber es un VALOR escrito
  // aquí, porque entonces sí habría dos verdades sobre cuánto cuesta.
  // Y ojo con perseguir números: `INSTITUTIONAL_FULL_MAX_BPS = 4000` son PUNTOS
  // BÁSICOS, no centavos. Un 4000 ahí no es un precio, y una prueba que no
  // distingue las dos cosas da un rojo que no es.
  //
  // Lo que de verdad no puede existir aquí es un MAPA plan → precio: eso sería
  // una segunda verdad sobre cuánto cuesta cada plan.
  const c = leer("lib/domain/commercial-catalog.ts");
  const codigo = c.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert(!/monthly_price_minor|annual_price_minor|monthlyPrice|annualPrice/.test(codigo),
    "el catálogo de presentación declara precios de plan");
  assert(!/(free|full|extra)\s*:\s*\d{3,}/i.test(codigo),
    "el catálogo de presentación asocia un importe a un plan");
  assert(/formatPrice/.test(codigo), "ya no da formato a los precios");
});

check("E3. 0211 no toca Free ni Extra", () => {
  const m = leer(M0211);
  const codigo = m.replace(/--[^\n]*/g, "");
  assert(!/'free'/.test(codigo), "0211 toca Free");
  assert(!/'extra'/.test(codigo), "0211 toca Extra");
});

console.log(`\nCOMMERCIAL-UX-01B · invariantes: ${passed} en verde, ${failed} en rojo`);
if (failed > 0) process.exit(1);
