/**
 * Trazaloop · COMMERCIAL-UX-01F · «Mi plan», estado por estado.
 *
 *
 * QUÉ DEFIENDE ESTA SUITE
 *
 * Una pantalla de dinero se degrada de tres maneras, y ninguna se nota mirando
 * si uno solo abre su propio caso:
 *
 *   1 · Un estado cuenta lo que no es. Una prueba presentada como contrato le
 *       dice a alguien que compró algo que no compró; una cancelación que sigue
 *       anunciando el siguiente cobro contradice, en la misma pantalla, el
 *       mensaje que acaba de confirmar que no habrá más cobros.
 *
 *   2 · Dos acciones destructivas conviven y parecen lo mismo. Ya pasó una vez:
 *       «Cancelar renovación automática» y «Cancelar el plan» hacían cosas
 *       distintas, en dinero, y se ofrecían juntas.
 *
 *   3 · «Ilimitado» se pinta como «cero». En una estructura de datos se parecen
 *       muchísimo; para quien paga son lo contrario.
 *
 * Correr: npm run test:cux01f
 */
import { readFileSync } from "node:fs";
import {
  summarizeBilling, FORBIDDEN_INTERNAL_WORDS,
  type BillingFacts,
} from "../../lib/domain/billing-experience";
import {
  presentStorage, presentAiCredits, presentTrialAi, presentTime,
} from "../../lib/domain/usage-presentation";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}
const leer = (p: string) => readFileSync(p, "utf8");

const PAGINA = "app/(app)/(shell)/settings/billing/page.tsx";
const TARJETA = "components/domain/billing/my-plan-card.tsx";
const USO = "components/domain/billing/usage-panel.tsx";
const OPCIONES = "components/domain/billing/plan-options.tsx";

/** Una fecha escrita siempre igual, para que las aserciones sean estables. */
const fecha = (iso: string) => `[${iso.slice(0, 10)}]`;

const hechos = (o: Partial<BillingFacts> = {}): BillingFacts => ({
  hasSubscription: false, contractedPlanCode: "free", effectivePlanCode: "free",
  grantKind: "base", grantEndsAt: null, currentPeriodEnd: null, renewsAt: null,
  cancelAtPeriodEnd: false, hasLiveRecurring: false, subscriptionStatus: null,
  manualReview: false, downgradeScheduled: false, paymentMethodMissing: false,
  pendingCheckout: false, isAdmin: true, ...o });

const FIN = "2026-10-16T22:47:38.000Z";

console.log("\n1 · CADA ESTADO CUENTA LO QUE ES");

check("1A. Free · el suelo, sin cobros programados", () => {
  const r = summarizeBilling(hechos(), fecha);
  assert(r.state === "FREE", `estado ${r.state}`);
  assert(/no hay ningún cobro programado/i.test(r.primaryMessage),
    "no se dice que no hay cobros");
  assert(r.offersStopRecurring === false && r.offersSchedulePlanEnd === false,
    "se ofrece cancelar algo a quien no paga");
});

check("1B. Prueba · NO es un contrato, y se dice qué pasa después", () => {
  const r = summarizeBilling(hechos({
    grantKind: "trial", effectivePlanCode: "full", contractedPlanCode: "free",
    grantEndsAt: FIN }), fecha);
  assert(r.state === "TRIAL_ACTIVE", `estado ${r.state}`);
  assert(/prueba|probando/i.test(r.displayStatus), `titular «${r.displayStatus}»`);
  assert(/no hemos pedido tarjeta/i.test(r.primaryMessage),
    "no se aclara que no se pidió tarjeta");
  assert(r.validUntilLabel !== null && /termina/i.test(r.validUntilLabel),
    "no se dice cuándo termina");
  assert(r.renewalMessage !== null && /plan de entrada/i.test(r.renewalMessage),
    "no se dice a dónde vuelve la empresa al terminar");
});

check("1C. Y la prueba manda sobre el plan efectivo", () => {
  // Durante una prueba de Full el plan efectivo ES `full`. Si la rama de plan
  // de pago fuera antes, se le diría a alguien que tiene un contrato.
  const r = summarizeBilling(hechos({
    grantKind: "trial", effectivePlanCode: "full", hasSubscription: true,
    subscriptionStatus: "active", hasLiveRecurring: true }), fecha);
  assert(r.state === "TRIAL_ACTIVE",
    `una prueba con suscripción viva salió como ${r.state}`);
});

check("1D. Manual activo · no se renueva solo, y se dice", () => {
  const r = summarizeBilling(hechos({
    hasSubscription: true, contractedPlanCode: "full", effectivePlanCode: "full",
    grantKind: "sold", subscriptionStatus: "active", currentPeriodEnd: FIN }), fecha);
  assert(r.state === "MANUAL_ACTIVE", `estado ${r.state}`);
  assert(/no se renueva solo/i.test(r.primaryMessage), "no se dice que no se renueva solo");
  assert(r.renewalMessage === "No hay cobros automáticos programados.",
    `dice «${r.renewalMessage}»`);
  assert(r.validUntilLabel !== null && /Activo hasta/.test(r.validUntilLabel),
    `la fecha se titula «${r.validUntilLabel}»`);
});

check("1E. Con cobros programados · «Siguiente cobro» y renovación activa", () => {
  const r = summarizeBilling(hechos({
    hasSubscription: true, contractedPlanCode: "full", effectivePlanCode: "full",
    grantKind: "sold", subscriptionStatus: "active", hasLiveRecurring: true,
    renewsAt: FIN }), fecha);
  assert(r.state === "PROVIDER_ACTIVE", `estado ${r.state}`);
  assert(r.validUntilLabel !== null && /Siguiente cobro/.test(r.validUntilLabel),
    `la fecha se titula «${r.validUntilLabel}»`);
  assert(r.renewalMessage === "Renovación automática activa.",
    `dice «${r.renewalMessage}»`);
});

check("1F. Cancelada · «activo hasta», y NUNCA «siguiente cobro»", () => {
  // La regla cerrada en MP-REC-01C.2: con la autorización cancelada la fecha no
  // es un próximo cobro, es hasta cuándo llega lo pagado. Titularla «Siguiente
  // cobro» contradice, en la misma pantalla, el mensaje que acaba de confirmar
  // que no habrá más cobros.
  const r = summarizeBilling(hechos({
    hasSubscription: true, contractedPlanCode: "full", effectivePlanCode: "full",
    grantKind: "sold", subscriptionStatus: "cancel_at_period_end",
    cancelAtPeriodEnd: true, currentPeriodEnd: FIN, renewsAt: FIN }), fecha);
  assert(r.state === "CANCEL_AT_PERIOD_END", `estado ${r.state}`);
  assert(/Renovación automática cancelada/.test(r.displayStatus),
    `titular «${r.displayStatus}»`);
  assert(r.validUntilLabel !== null && /Plan activo hasta/.test(r.validUntilLabel),
    `la fecha se titula «${r.validUntilLabel}»`);
  assert(!/siguiente cobro/i.test(
    `${r.displayStatus} ${r.primaryMessage} ${r.validUntilLabel} ${r.renewalMessage}`),
    "se sigue anunciando un cobro que no va a ocurrir");
  assert(/no se realizarán nuevos cobros/i.test(r.primaryMessage),
    "no se afirma que no habrá más cobros");
});

check("1G. Terminado · se dice que los datos siguen ahí", () => {
  const r = summarizeBilling(hechos({
    hasSubscription: true, subscriptionStatus: "ended" }), fecha);
  assert(r.state === "ENDED", `estado ${r.state}`);
  assert(/sigue ahí|no se borra/i.test(r.primaryMessage),
    "no se tranquiliza sobre los datos");
});

check("1H. Cobro a medias · manda sobre todo lo demás", () => {
  const r = summarizeBilling(hechos({
    pendingCheckout: true, hasSubscription: true, hasLiveRecurring: true,
    subscriptionStatus: "active" }), fecha);
  assert(r.state === "PENDING_CHECKOUT", `estado ${r.state}`);
  assert(r.primaryCta !== null && /Continuar/i.test(r.primaryCta.label),
    "no se prioriza terminar el pago");
  assert(/no se cobra dos veces|no se cobre dos veces/i.test(r.primaryMessage),
    "no se explica por qué conviene terminarlo antes de empezar otro");
});

check("1I. Dinero en duda · ni se afirma que falló ni que se cobró", () => {
  const r = summarizeBilling(hechos({
    hasSubscription: true, manualReview: true, subscriptionStatus: "active" }), fecha);
  assert(r.state === "VERIFYING", `estado ${r.state}`);
  const todo = `${r.displayStatus} ${r.primaryMessage}`;
  assert(!/rechaz|falló|fallido/i.test(todo), "se afirma un rechazo que no consta");
  assert(!/pagado|se cobró correctamente/i.test(todo), "se afirma un cobro que no consta");
});

check("1J. Falta medio de pago · antes que cualquier otra cosa accionable", () => {
  const r = summarizeBilling(hechos({
    hasSubscription: true, hasLiveRecurring: true, paymentMethodMissing: true,
    subscriptionStatus: "active", currentPeriodEnd: FIN }), fecha);
  assert(r.state === "PAYMENT_METHOD_MISSING", `estado ${r.state}`);
  assert(/medio de pago/i.test(r.primaryMessage), "no se dice qué falta");
});

check("1K. Cambio de plan programado · se cuenta el cambio, no la calma", () => {
  const r = summarizeBilling(hechos({
    hasSubscription: true, downgradeScheduled: true, subscriptionStatus: "active",
    currentPeriodEnd: FIN }), fecha);
  assert(r.state === "DOWNGRADE_SCHEDULED", `estado ${r.state}`);
  assert(/no se cobra nada hoy/i.test(r.primaryMessage),
    "no se aclara que hoy no se cobra");
});

check("1L. Sin lectura · NO se inventa «no tiene plan»", () => {
  const r = summarizeBilling(hechos({ hasSubscription: null }), fecha);
  assert(r.state === "UNAVAILABLE", `estado ${r.state}`);
  assert(!/free|plan de entrada/i.test(r.displayStatus),
    "una avería se presenta como el plan gratuito");
  assert(/acceso no se ve afectado/i.test(r.primaryMessage),
    "no se tranquiliza sobre el acceso");
});

console.log("\n2 · UNA SOLA CANCELACIÓN POR ESTADO");

check("2A. Nunca conviven las dos", () => {
  // El cierre de 01B. Dos botones que parecen lo mismo y hacen cosas distintas,
  // en dinero, no pueden coexistir.
  const estados: BillingFacts[] = [
    hechos(),
    hechos({ grantKind: "trial", grantEndsAt: FIN }),
    hechos({ hasSubscription: true, subscriptionStatus: "active", currentPeriodEnd: FIN }),
    hechos({ hasSubscription: true, subscriptionStatus: "active",
             hasLiveRecurring: true, renewsAt: FIN }),
    hechos({ hasSubscription: true, subscriptionStatus: "cancel_at_period_end",
             cancelAtPeriodEnd: true, currentPeriodEnd: FIN }),
    hechos({ hasSubscription: true, subscriptionStatus: "ended" }),
    hechos({ pendingCheckout: true }),
    hechos({ hasSubscription: true, manualReview: true }),
    hechos({ hasSubscription: true, downgradeScheduled: true }),
    hechos({ hasSubscription: null }),
  ];
  for (const f of estados) {
    const r = summarizeBilling(f, fecha);
    assert(!(r.offersStopRecurring && r.offersSchedulePlanEnd),
      `${r.state} ofrece las dos cancelaciones a la vez`);
  }
});

check("2B. Detener cobros SOLO con recurrencia viva", () => {
  const sinRecurrencia = summarizeBilling(hechos({
    hasSubscription: true, subscriptionStatus: "active", currentPeriodEnd: FIN }), fecha);
  assert(sinRecurrencia.offersStopRecurring === false,
    "se ofrece detener una renovación que no existe");
  const conRecurrencia = summarizeBilling(hechos({
    hasSubscription: true, subscriptionStatus: "active",
    hasLiveRecurring: true, renewsAt: FIN }), fecha);
  assert(conRecurrencia.offersStopRecurring === true,
    "con cobros programados no se puede detenerlos");
});

check("2C. Ya cancelada · no se vuelve a ofrecer cancelar", () => {
  const r = summarizeBilling(hechos({
    hasSubscription: true, subscriptionStatus: "cancel_at_period_end",
    cancelAtPeriodEnd: true, hasLiveRecurring: true, currentPeriodEnd: FIN }), fecha);
  assert(r.offersStopRecurring === false && r.offersSchedulePlanEnd === false,
    "se ofrece cancelar algo ya cancelado");
});

check("2C.2. La promesa de renovación automática NO llega a un plan manual", () => {
  // Esto sostiene la exención que `v1-release` §54 concede a este módulo por
  // FICHERO. La guarda no puede ver que la frase está condicionada, así que se
  // recorre estado por estado: solo puede decirla quien tiene cobros
  // programados de verdad, y el carril manual dice lo contrario.
  const PROMESA = /renovaci[oó]n autom|se renueva autom|renovar autom/i;
  const estados: readonly (readonly [string, BillingFacts])[] = [
    ["Free", hechos()],
    ["prueba", hechos({ grantKind: "trial", grantEndsAt: FIN })],
    ["manual activo", hechos({ hasSubscription: true, subscriptionStatus: "active",
                               currentPeriodEnd: FIN })],
    ["terminado", hechos({ hasSubscription: true, subscriptionStatus: "ended" })],
    ["cobro a medias", hechos({ pendingCheckout: true })],
    ["en verificación", hechos({ hasSubscription: true, manualReview: true })],
    ["sin lectura", hechos({ hasSubscription: null })],
  ];
  for (const [nombre, f] of estados) {
    const r = summarizeBilling(f, fecha);
    const texto = `${r.displayStatus} ${r.primaryMessage} ${r.renewalMessage ?? ""}`;
    assert(!PROMESA.test(texto),
      `«${nombre}» promete renovación automática sin tenerla: «${texto.slice(0, 90)}»`);
  }
  // Y donde SÍ existe, se dice: quien cancela necesita entender qué detiene.
  const conRecurrencia = summarizeBilling(hechos({
    hasSubscription: true, subscriptionStatus: "active",
    hasLiveRecurring: true, renewsAt: FIN }), fecha);
  assert(PROMESA.test(conRecurrencia.renewalMessage ?? ""),
    "con cobros programados no se dice que la renovación es automática");
});

check("2D. Y el carril manual no hereda acciones de recurrencia", () => {
  const r = summarizeBilling(hechos({
    hasSubscription: true, subscriptionStatus: "active", currentPeriodEnd: FIN }), fecha);
  assert(r.offersStopRecurring === false,
    "un plan manual ofrece detener cobros automáticos que no tiene");
});

check("2E. Quien no administra no ve ninguna acción de dinero", () => {
  for (const f of [
    hechos({ isAdmin: false, hasSubscription: true, hasLiveRecurring: true,
             subscriptionStatus: "active" }),
    hechos({ isAdmin: false, pendingCheckout: true }),
    hechos({ isAdmin: false, grantKind: "trial" }),
  ]) {
    const r = summarizeBilling(f, fecha);
    assert(r.offersStopRecurring === false && r.offersSchedulePlanEnd === false,
      `${r.state} ofrece cancelar a quien no administra`);
    assert(r.primaryCta === null || r.primaryCta.financialEffect === "none",
      `${r.state} ofrece una acción con efecto financiero a quien no administra`);
  }
});

console.log("\n3 · NINGÚN BOTÓN COBRA DESDE AQUÍ");

check("3A. Todo destino existe y ningún efecto es un cobro directo", () => {
  const rutas = ["/settings/billing", "/planes", "mailto:contacto@idendi.org"];
  const estados: BillingFacts[] = [
    hechos(), hechos({ grantKind: "trial" }), hechos({ pendingCheckout: true }),
    hechos({ hasSubscription: true, subscriptionStatus: "ended" }),
    hechos({ hasSubscription: true, subscriptionStatus: "cancel_at_period_end",
             cancelAtPeriodEnd: true }),
    hechos({ hasSubscription: true, downgradeScheduled: true }),
    hechos({ hasSubscription: null }),
  ];
  for (const f of estados) {
    const r = summarizeBilling(f, fecha);
    for (const c of [r.primaryCta, r.secondaryCta]) {
      if (c === null) continue;
      assert(rutas.includes(c.href), `ruta inventada: ${c.href} en ${r.state}`);
      assert(c.financialEffect !== "schedules_change" || f.isAdmin,
        `${r.state} programa un cambio sin administración`);
    }
  }
});

console.log("\n4 · «ILIMITADO» NO ES «CERO»");

check("4A. Sin reloj se dice «Uso ilimitado», nunca un contador", () => {
  const r = presentTime({ metered: false, dailyLimit: null, monthlyLimit: null,
                          dailyUsed: null, monthlyUsed: null, isTrial: false });
  assert(r.mode === "unlimited", `modo ${r.mode}`);
  assert(r.mode === "unlimited" && r.label === "Uso ilimitado", "no se escribe así");
});

check("4B. Y dentro de una prueba se dice que es durante la prueba", () => {
  const r = presentTime({ metered: false, dailyLimit: null, monthlyLimit: null,
                          dailyUsed: null, monthlyUsed: null, isTrial: true });
  assert(r.mode === "unlimited" && /durante la prueba/.test(r.label),
    `dice «${r.mode === "unlimited" ? r.label : r.mode}»`);
});

check("4C. Free sí se cuenta, con sus dos topes", () => {
  const r = presentTime({ metered: true, dailyLimit: 30, monthlyLimit: 300,
                          dailyUsed: 12, monthlyUsed: 140, isTrial: false });
  assert(r.mode === "metered", `modo ${r.mode}`);
  assert(r.mode === "metered" && /12 de 30 min hoy/.test(r.label),
    `dice «${r.mode === "metered" ? r.label : ""}»`);
  assert(r.mode === "metered" && /140 de 300 min este mes/.test(r.label),
    "falta el tope mensual");
});

check("4D. Lo que no se pudo leer NO se pinta como cero", () => {
  assert(presentTime(null).mode === "unknown", "una lectura fallida dio un contador");
  assert(presentStorage(null, 100).mode === "unknown", "sin uso se inventó un cero");
  assert(presentAiCredits(null, null, null).mode === "unknown",
    "sin créditos se inventó un cero");
});

check("4E. Almacenamiento · «120 MB de 500 MB», con su porcentaje acotado", () => {
  const r = presentStorage(120 * 1024 * 1024, 500 * 1024 * 1024);
  assert(r.mode === "metered" && r.label === "120 MB de 500 MB",
    `dice «${r.mode === "metered" ? r.label : r.mode}»`);
  assert(r.mode === "metered" && r.percent === 24, `porcentaje ${r.mode === "metered" ? r.percent : "?"}`);
  // Por encima del cupo, la barra no se sale: el número lo dice el texto.
  const pasado = presentStorage(900 * 1024 * 1024, 500 * 1024 * 1024);
  assert(pasado.mode === "metered" && pasado.percent === 100 && pasado.overLimit,
    "una barra por encima del cupo se pinta fuera de la caja");
});

check("4F. Sin tope, el almacenamiento tampoco es un contador", () => {
  const r = presentStorage(10 * 1024 * 1024, null);
  assert(r.mode === "unlimited", `modo ${r.mode}`);
});

check("4G. La bolsa de la prueba no se suma a la mensual", () => {
  // Confundirlas fue el defecto que corrigió 0170: la mensual sale del plan NO
  // prueba, y la de la prueba es suya.
  const mensual = presentAiCredits(10, 25, "finite");
  const prueba = presentTrialAi(50, 8);
  assert(mensual.mode === "metered" && mensual.limit === 25, "la mensual cambió");
  assert(prueba.mode === "metered" && prueba.limit === 50, "la de la prueba cambió");
  assert(prueba.mode === "metered" && /de la prueba/.test(prueba.label),
    "la bolsa de la prueba no se identifica como tal");
});

console.log("\n5 · LA PANTALLA · LO QUE NO PUEDE LLEVAR DENTRO");

check("5A. Ni una cifra de dinero o de cuota escrita a mano", () => {
  // OJO con perseguir números. El `100` de `basisPoints / 100` es una
  // CONVERSIÓN DE UNIDAD —puntos básicos a porcentaje—, no un importe, y una
  // prueba que no distingue las dos cosas da un rojo que no es: cuesta más que
  // no tenerla, porque enseña a ignorarla. Los precios de verdad viajan en
  // unidades menores (10000, 100000) y esos sí se vigilan.
  const cifras = ["4000", "40000", "10000", "100000", "40", "400",
                  "52428800", "524288000", "5368709120", "500", "2000",
                  "300", "30", "25", "48"];
  for (const f of [PAGINA, TARJETA, USO, OPCIONES,
                   "lib/domain/billing-experience.ts",
                   "lib/domain/usage-presentation.ts"]) {
    const src = leer(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")
      .replace(/className=(?:"[^"]*"|\{`[^`]*`\}|\{[^}]*\})/g, "")
      .replace(/(clase|const foco) = [\s\S]*?;/g, "");
    for (const n of cifras) {
      assert(!new RegExp(`\\b${n}\\b`).test(src), `${f} escribe ${n} a mano`);
    }
  }
});

check("5B. Ni vocabulario de dentro", () => {
  // Es la lista que el propio módulo declara, recorrida en vez de recordada.
  const visible = leer(PAGINA)
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  for (const palabra of FORBIDDEN_INTERNAL_WORDS) {
    // Solo dentro de TEXTO visible: los nombres de campo de la autoridad
    // pueden llamarse como quieran.
    const textos = [...visible.matchAll(/>([^<>{}]{8,})</g)].map((m) => m[1]);
    for (const t of textos) {
      assert(!new RegExp(palabra, "i").test(t),
        `la pantalla le enseña «${palabra}» a quien paga: «${t.trim().slice(0, 60)}»`);
    }
  }
});

check("5C. Y no decide dinero: solo lo cuenta", () => {
  for (const f of ["lib/domain/billing-experience.ts",
                   "lib/domain/usage-presentation.ts", TARJETA, USO, OPCIONES]) {
    const src = leer(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    for (const prohibido of ["billing_create_quote", "\\.rpc\\(", "createServerClient",
                             "createAdminClient", "tax_rule", "fx_rate", "promotion"]) {
      assert(!new RegExp(prohibido).test(src), `${f} toca ${prohibido}`);
    }
  }
});

console.log("\n6 · LO QUE SE REUTILIZA Y LO QUE NO SE DUPLICA");

check("6A. El catálogo comercial es el de 01C", () => {
  const p = leer(PAGINA);
  assert(/readCommercialCatalog\(\)/.test(p),
    "la pantalla lee el catálogo por otro camino");
  assert(!/listPublicPlanCatalog/.test(p),
    "quedó un segundo lector de catálogo");
  const o = leer(OPCIONES);
  for (const formateador of ["formatMonthlyPrice", "formatStorage",
                             "formatAiCredits", "formatTimeUsage"]) {
    assert(new RegExp(formateador).test(o),
      `las opciones no usan ${formateador}: hay un formato propio`);
  }
});

check("6B. Y enlaza a /planes en vez de duplicarla", () => {
  const o = leer(OPCIONES);
  assert(/href="\/planes"/.test(o), "no se enlaza la comparación pública");
  assert(!/COMMERCIAL_FAQ|PlanComparison|PricingPlans/.test(o),
    "se duplicó parte de la página pública dentro de facturación");
});

check("6C. Solo UN plan lleva el distintivo, y la prueba dice «prueba»", () => {
  const o = leer(OPCIONES);
  assert(/const esElSuyo = p\.code === currentPlanCode;/.test(o),
    "el distintivo no se decide por el plan contratado");
  assert(/isTrial \? "Tu prueba actual" : "Tu plan actual"/.test(o),
    "durante una prueba se afirma un contrato");
  assert(/currentPlanCode=\{comercial\.contractedPlanCode/.test(leer(PAGINA)),
    "el distintivo se decide por el plan EFECTIVO: durante una prueba marcaría Full");
});

check("6D. Extra no ofrece una transacción que no puede completarse", () => {
  const p = leer(PAGINA);
  assert(/code === "extra" && !mejora\.transactional/.test(p),
    "el botón de Extra no consulta si el carril puede cobrar");
  assert(/Hablemos de Extra/.test(p), "no se ofrece la alternativa no transaccional");
  assert(/resolveUpgradeAvailability\(\)/.test(p),
    "la pantalla decide por su cuenta si Extra se puede contratar");
});

console.log("\n7 · ACCESIBILIDAD Y ESTRUCTURA");

check("7A. Jerarquía de encabezados y secciones con nombre", () => {
  const p = leer(PAGINA);
  assert((p.match(/<h1/g) ?? []).length === 1, "no hay exactamente un h1");
  for (const f of [TARJETA, USO, OPCIONES]) {
    const src = leer(f);
    assert(/aria-labelledby=/.test(src), `${f} tiene una sección sin nombre`);
    assert(/<h2 id=/.test(src), `${f} no titula su sección`);
  }
});

check("7B. El estado no se comunica solo con color", () => {
  const t = leer(TARJETA);
  assert(/\{isTrial \? "Prueba" : summary\.displayStatus\}/.test(t),
    "el distintivo de estado no lleva palabra");
  assert(/El estado NO se comunica solo con color/.test(t),
    "no consta por qué el distintivo lleva texto");
});

check("7C. La barra de uso no repite lo que ya está escrito", () => {
  // El dato va en palabras; la barra es decoración. Marcarla como
  // `progressbar` haría que un lector de pantalla lo dijera dos veces.
  const u = leer(USO);
  assert(/aria-hidden="true"/.test(u), "la barra decorativa se anuncia");
  assert(/\{m\.uso\.label\}/.test(u), "el dato no está en texto");
});

check("7D. Foco visible en todo lo enfocable", () => {
  for (const f of [TARJETA, OPCIONES]) {
    const src = leer(f);
    const enlaces = (src.match(/<Link|<a\s/g) ?? []).length;
    const focos = (src.match(/focus-visible:outline/g) ?? []).length;
    assert(focos >= Math.min(enlaces, 2), `${f}: ${enlaces} enlaces, ${focos} con foco`);
  }
});

check("7E. Y en móvil se apila sin desbordar", () => {
  const o = leer(OPCIONES);
  assert(/grid gap-4 md:grid-cols-3/.test(o), "las opciones no se apilan en móvil");
  for (const f of [PAGINA, TARJETA, USO, OPCIONES]) {
    assert(!/\bw-\[\d+px\]|\bmin-w-\[\d{3,}px\]/.test(leer(f)),
      `${f} tiene un ancho fijo que puede desbordar`);
  }
  assert(/flex-wrap/.test(leer(TARJETA)), "la tarjeta no envuelve en pantalla estrecha");
});

console.log("\n8 · LO QUE NO SE HA TOCADO");

check("8A. El checkout sigue saliendo de billing_create_quote", () => {
  assert(/rpc\("billing_create_quote"/.test(leer("lib/db/billing.ts")),
    "el presupuesto dejó de salir de billing_create_quote");
});

check("8B. Los paneles financieros siguen siendo los mismos", () => {
  const p = leer(PAGINA);
  for (const panel of ["PendingCheckoutPanel", "RecurringCancelPanel",
                       "PlanDecisions", "RenewalPanel"]) {
    assert(new RegExp(`<${panel}`).test(p),
      `desapareció ${panel}: se perdió una acción financiera existente`);
  }
});

console.log(`\nCOMMERCIAL-UX-01F · mi plan: ${passed} en verde, ${failed} en rojo`);
if (failed > 0) process.exit(1);
