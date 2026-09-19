/**
 * Trazaloop · COMMERCIAL-UX-01B · Tres promesas que la pantalla no puede romper.
 *
 *
 * DE DÓNDE SALE ESTA SUITE
 *
 * De la auditoría COMMERCIAL-UX-01A, que encontró tres cosas antes de que
 * existiera ninguna página nueva:
 *
 *   1. La autoridad y la decisión comercial no decían lo mismo sobre los
 *      minutos de Full. Una página de precios construida encima habría
 *      prometido algo que el producto no aplicaba.
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
const M0212 = "supabase/migrations/0212_paid_plans_have_no_clock.sql";
const DISPONIBILIDAD = "lib/billing/upgrade-availability.ts";
const ACCIONES = "server/actions/billing.ts";

console.log("\nA · LOS MINUTOS VIVEN EN LA AUTORIDAD, NO EN UNA PANTALLA");

check("A1. Las dos correcciones publican revisión nueva, no reescriben la vigente", () => {
  // Una revisión publicada es el precio y las condiciones con las que alguien
  // contrató. Cambiarla por debajo reescribiría lo que se le vendió, y
  // `t_plan_revision_limits_immutable` está ahí precisamente para impedirlo.
  for (const [nombre, m] of [["0211", leer(M0211)], ["0212", leer(M0212)]] as const) {
    assert(!/update public\.plan_revision_limits/i.test(m),
      `${nombre} reescribe los límites de una revisión ya publicada`);
    assert(/insert into public\.plan_revisions/i.test(m),
      `${nombre} no publica una revisión nueva`);
    assert(/set effective_to = v_ahora, status = 'retired'/.test(m),
      `${nombre} no retira la anterior: quedarían dos vigentes`);
  }
});

check("A2. 0212 NO borra ni corrige 0211: la sucede", () => {
  // La decisión comercial cambió, y eso es historia, no un error que tapar.
  // Quien lea el repositorio dentro de un año tiene que poder ver que Full
  // tuvo 600 minutos durante unas horas y por qué dejó de tenerlos.
  const m = leer(M0212);
  assert(/0211/.test(m), "0212 no explica a qué migración sucede");
  assert(/el historial no se reescribe|no se reescribe/.test(m),
    "0212 no deja escrito por qué 0211 se queda donde está");
});

check("A3. El tiempo deja de limitar a quien paga, y solo eso cambia", () => {
  const m = leer(M0212);
  // Los DOS límites, no solo el mensual: dejar el diario con tope habría
  // mantenido el reloj encendido por la otra puerta.
  assert(/'active_minutes_daily',\s*\n?\s*'active_minutes_monthly'/.test(m)
      || /'active_minutes_daily', 'active_minutes_monthly'/.test(m),
    "0212 no libera los dos límites de minutos");
  assert(/then 'unlimited' else l\.limit_state end/.test(m),
    "0212 no pone los minutos en ilimitado");
  assert(/then null else l\.limit_value end/.test(m),
    "0212 deja un valor con estado ilimitado, que la tabla no admite");
  // Y lo que SÍ es la economía del plan se comprueba intacto.
  for (const guardia of ["0212_EL_PRECIO_DE_FULL_CAMBIO",
                         "0212_EL_ALMACENAMIENTO_DE_FULL_CAMBIO",
                         "0212_LOS_CREDITOS_DE_FULL_CAMBIARON",
                         "0212_FREE_SE_MOVIO",
                         "0212_EXTRA_TIENE_RELOJ",
                         "0212_MAS_DE_UNA_REVISION_FULL_VIGENTE"]) {
    assert(new RegExp(guardia).test(m), `0212 no comprueba ${guardia}`);
  }
});

check("A4. Es idempotente: aplicarla dos veces no encadena revisiones", () => {
  assert(/ya declara 600 min\/mes; nada que hacer/.test(leer(M0211)),
    "0211 no se detiene si ya está aplicada");
  assert(/ya es ilimitada en tiempo; nada que hacer/.test(leer(M0212)),
    "0212 no se detiene si ya está aplicada");
});

check("A5. Ningún componente escribe un límite de minutos a mano", () => {
  // La autoridad es `plan_revision_limits`. Un número aquí sería una segunda
  // verdad, y las segundas verdades se desincronizan sin avisar. Se vigilan los
  // tres: el que Full tuvo, y los dos que Free sigue teniendo.
  for (const f of [PAGINA,
                   "components/domain/billing/plan-decisions.tsx",
                   "lib/domain/commercial-catalog.ts"]) {
    const src = leer(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    for (const n of ["600", "300", "30"]) {
      assert(!new RegExp(`\\b${n}\\b`).test(src),
        `${f} escribe ${n} a mano: la pantalla no decide límites`);
    }
  }
});

check("A6. Y la política de planes pagos no vive en una constante", () => {
  // La invariante «quien paga no tiene reloj» se comprueba INTERROGANDO la
  // autoridad en `cux01b-minutes-authority`, no declarando los valores en un
  // fichero. Una constante con la política sería justo la segunda fuente de
  // verdad que este tramo vino a eliminar.
  const db = leer("tests/rls/cux01b-minutes-authority.test.ts");
  assert(/coalesce\(r\.monthly_price_minor, 0\) > 0/.test(db),
    "la invariante usa una lista de planes en vez de deducir cuáles se pagan");
  assert(/limit_state <> 'unlimited'/.test(db),
    "la invariante no interroga el estado real del límite");
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

check("C3. El panel transaccional sigue condicionado a que el cobro pueda darse", () => {
  // BILLING-EXTRA-01D movió la CONDICIÓN, no la regla. Antes se escribía en la
  // pantalla; ahora la decide `resolveExtraAction`, que es una sola autoridad
  // para las dos superficies. La garantía es la misma: un panel que cobra sólo
  // aparece donde hay un carril capaz de cobrar.
  const p = leer(PAGINA);
  assert(/accionExtra\.kind === "upgrade" \? \(/.test(p),
    "el panel de mejora no depende de la decisión sobre Extra");
  const i = p.indexOf("<UpgradePanel");
  const j = p.indexOf("accionExtra.kind");
  assert(j > 0 && j < i, "la condición va después del panel que debe condicionar");

  // Y la pantalla SIGUE pasándole al resolutor si ese carril puede cobrar: sin
  // eso, la decisión no podría negarse.
  assert(/storedSourceUpgradeAvailable: mejora\.transactional/.test(p),
    "la pantalla ya no consulta si el carril de medio guardado puede cobrar");
  const resolutor = leer("lib/billing/extra-action.ts");
  assert(/storedSourceUpgradeAvailable\s*\?/.test(resolutor)
    || /f\.storedSourceUpgradeAvailable/.test(resolutor),
    "el resolutor ignora si el carril puede cobrar");
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
  // BILLING-EXTRA-01D · El cuerpo se acota por la función SIGUIENTE, no por un
  // número de caracteres. La ventana fija se quedó corta en cuanto la acción
  // creció, y una prueba que falla por la LONGITUD de una función no está
  // comprobando esta regla.
  const a = leer(ACCIONES);
  const cuerpoDe = (nombre: string) => {
    const i = a.indexOf(`export async function ${nombre}`);
    assert(i > 0, `no existe ${nombre}`);
    const j = a.indexOf("\nexport ", i + 10);
    return a.slice(i, j === -1 ? a.length : j);
  };
  for (const accion of ["quoteUpgradeAction", "confirmUpgradeAction"]) {
    assert(/resolveUpgradeAvailability\(\)\.transactional/.test(cuerpoDe(accion)),
      `${accion} atiende una mejora que el carril no puede cobrar`);
  }
});

check("C6. Y va DELANTE de la primera escritura", () => {
  // Éste es el orden que importa. `openUpgradeIntent` deja el cambio en
  // `submitted`, y desde ahí no se puede ni retirar ni reintentar: la empresa se
  // queda sin poder subir de plan nunca más, sin que se haya movido un peso.
  const a = leer(ACCIONES);
  const i = a.indexOf("export async function confirmUpgradeAction");
  const j = a.indexOf("\nexport ", i + 10);
  const cuerpo = a.slice(i, j === -1 ? a.length : j);
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
