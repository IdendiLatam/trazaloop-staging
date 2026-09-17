/**
 * Trazaloop · COMMERCIAL-UX-01C · El catálogo comercial es de LECTURA.
 *
 *
 * QUÉ DEFIENDE ESTA SUITE
 *
 * Que la capa nueva no se convierta en una segunda autoridad. Es el riesgo real
 * de construir un read model comercial: empieza leyendo, y un día alguien
 * escribe «USD 40» dentro para no tener que ir a buscarlo, y a partir de ahí
 * hay dos verdades sobre cuánto cuesta un plan. La que está en la página de
 * marketing se desincroniza sin que nadie lo note, porque nadie prueba una
 * página de marketing.
 *
 * Lo que aquí se comprueba:
 *
 *   · precios y límites LLEGAN, no se declaran;
 *   · el texto comercial no contiene ni una cifra de dinero o de cuota;
 *   · `saasPlans` son los planes SaaS y el Acompañamiento no está dentro;
 *   · el tiempo de uso no asume que todo plan tenga minutos;
 *   · la prueba no es un cuarto plan y hereda de Full;
 *   · el checkout sigue saliendo de `billing_create_quote`.
 *
 * Correr: npm run test:cux01c
 */
import { readFileSync } from "node:fs";
import {
  buildCommercialCatalog, trialTagline,
  type CatalogPlanRow, type CatalogLimitRow,
} from "../../lib/plans/commercial-catalog";
import {
  formatUsdPrice, formatMonthlyPrice, formatStorage, formatAiCredits,
  formatTimeUsage, resolveTimeUsage, formatLimitForCustomer,
  UNLIMITED_USAGE_LABEL,
} from "../../lib/plans/commercial-presentation";
import { PLAN_COPY, COMMERCIAL_SERVICES } from "../../lib/plans/commercial-copy";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}
const leer = (p: string) => readFileSync(p, "utf8");

// ---------------------------------------------------------------------------
// Un catálogo de mentira con la forma EXACTA de la autoridad de hoy. Los
// valores están aquí para poder comprobar que ATRAVIESAN la capa; que sean los
// de verdad lo comprueba la batería de base, contra la base.
// ---------------------------------------------------------------------------
const PLANES: CatalogPlanRow[] = [
  { planCode: "free", displayOrder: 1, planRevisionId: "r-free",
    displayName: "Free", description: "El plano de entrada.", publicConditions: null,
    priceState: "configured", currency: "USD",
    monthlyPriceMinor: 0, annualPriceMinor: 0 },
  { planCode: "full", displayOrder: 2, planRevisionId: "r-full",
    displayName: "Full", description: "La operación completa.", publicConditions: null,
    priceState: "configured", currency: "USD",
    monthlyPriceMinor: 4000, annualPriceMinor: 40000 },
  { planCode: "extra", displayOrder: 3, planRevisionId: "r-extra",
    displayName: "Extra", description: "Más de todo.", publicConditions: null,
    priceState: "configured", currency: "USD",
    monthlyPriceMinor: 10000, annualPriceMinor: 100000 },
];

const lim = (plan: string, code: string,
             state: "finite" | "unlimited" | "not_configured",
             value: number | null): CatalogLimitRow =>
  ({ planCode: plan, resourceCode: code, resourceLabel: code, unit: null,
     limitState: state, limitValue: value });

const LIMITES: CatalogLimitRow[] = [
  lim("free", "active_minutes_daily", "finite", 30),
  lim("free", "active_minutes_monthly", "finite", 300),
  lim("free", "storage_bytes", "finite", 52428800),
  lim("free", "ai_weighted_credits_monthly", "finite", 25),
  lim("full", "active_minutes_daily", "unlimited", null),
  lim("full", "active_minutes_monthly", "unlimited", null),
  lim("full", "storage_bytes", "finite", 524288000),
  lim("full", "ai_weighted_credits_monthly", "finite", 500),
  lim("extra", "active_minutes_daily", "unlimited", null),
  lim("extra", "active_minutes_monthly", "unlimited", null),
  lim("extra", "storage_bytes", "finite", 5368709120),
  lim("extra", "ai_weighted_credits_monthly", "finite", 2000),
];

const POLITICA = { enabled: true, trialPlanCode: "full", trialDurationHours: 48 };

const catalogo = buildCommercialCatalog({
  plans: PLANES, limits: LIMITES, trialPolicy: POLITICA });
const plan = (code: string) => {
  const p = catalogo.saasPlans.find((x) => x.code === code);
  assert(p !== undefined, `no salió el plan ${code}`);
  return p;
};

console.log("\n1 · LOS TRES PLANES SAAS, Y SOLO ELLOS");

check("1A. saasPlans = Free / Full / Extra, en orden", () => {
  assert(catalogo.saasPlans.length === 3,
    `salieron ${catalogo.saasPlans.length} planes`);
  assert(catalogo.saasPlans.map((p) => p.code).join(",") === "free,full,extra",
    `orden: ${catalogo.saasPlans.map((p) => p.code).join(",")}`);
});

check("1B. El Acompañamiento NO está entre ellos", () => {
  // Dentro de `saasPlans` sería visualmente un cuarto plan, y quien lo leyera
  // creería que es una ALTERNATIVA a Full o Extra en vez de algo que se suma a
  // cualquiera de los dos.
  const codigos = catalogo.saasPlans.map((p) => p.code);
  assert(!codigos.some((c) => /acompa|support|service/i.test(c)),
    `un servicio se coló entre los planes: ${codigos.join(", ")}`);
  assert(catalogo.services.length >= 1, "el Acompañamiento no se presenta en ningún sitio");
  assert(catalogo.services.some((s) => s.code === "acompanamiento"),
    "no está el Acompañamiento en `services`");
});

check("1C. Y se presenta como complemento, con su salvedad escrita", () => {
  const s = COMMERCIAL_SERVICES.find((x) => x.code === "acompanamiento");
  assert(s !== undefined, "no hay Acompañamiento");
  assert(/complementario|complemento/i.test(s.disclaimer + s.shortDescription),
    "no se dice que es un complemento");
  assert(/no se contrata desde la plataforma|no se cobra autom/i.test(s.disclaimer),
    "no se aclara que no se contrata ni se cobra solo");
});

check("1D. Su referencia de precio es TEXTO, no un número", () => {
  // Un `string` no se puede sumar, ni multiplicar por un tipo de cambio, ni
  // pasar a `billing_create_quote` por accidente. La forma del dato impide el
  // error en vez de confiar en que nadie lo cometa.
  const s = COMMERCIAL_SERVICES.find((x) => x.code === "acompanamiento");
  assert(s !== undefined, "no hay Acompañamiento");
  assert(typeof s.referencePrice === "string" && typeof s.referenceScope === "string",
    "la referencia comercial es numérica y podría entrar en un cálculo");
  for (const [k, v] of Object.entries(s)) {
    assert(typeof v !== "number" || k === "displayOrder",
      `el Acompañamiento expone el número «${k}», que puede confundirse con un precio`);
  }
});

console.log("\n2 · EL PRECIO Y LOS LÍMITES LLEGAN · NO SE DECLARAN");

check("2A. Los precios salen de las filas, no del código", () => {
  assert(plan("full").monthlyPriceMinor === 4000, "el precio mensual no atravesó la capa");
  assert(plan("full").annualPriceMinor === 40000, "el precio anual no atravesó la capa");
  assert(plan("extra").monthlyPriceMinor === 10000, "Extra no atravesó la capa");
  // Y con otra fila da otro resultado: la capa LEE.
  const otro = buildCommercialCatalog({
    plans: PLANES.map((p) => p.planCode === "full"
      ? { ...p, monthlyPriceMinor: 123456 } : p),
    limits: LIMITES, trialPolicy: POLITICA });
  assert(otro.saasPlans.find((p) => p.code === "full")?.monthlyPriceMinor === 123456,
    "el precio no depende de la autoridad: hay un valor propio dentro de la capa");
});

check("2B. Los límites también", () => {
  assert(plan("full").storageBytes === 524288000, "el almacenamiento no atravesó la capa");
  assert(plan("extra").storageBytes === 5368709120, "Extra no atravesó la capa");
  assert(plan("full").aiCreditsMonthly === 500, "los créditos no atravesaron la capa");
  assert(plan("free").aiCreditsMonthly === 25, "Free no atravesó la capa");
  const otro = buildCommercialCatalog({
    plans: PLANES,
    limits: LIMITES.map((l) => l.planCode === "full" && l.resourceCode === "storage_bytes"
      ? { ...l, limitValue: 999 } : l),
    trialPolicy: POLITICA });
  assert(otro.saasPlans.find((p) => p.code === "full")?.storageBytes === 999,
    "el almacenamiento no depende de la autoridad");
});

check("2C. El texto comercial NO contiene ni una cifra de negocio", () => {
  // La línea que este tramo no puede cruzar. Si aparece aquí un precio o una
  // cuota, el día que cambie en la autoridad la página seguirá diciendo lo
  // viejo y nadie se enterará hasta que un cliente reclame.
  const copia = leer("lib/plans/commercial-copy.ts")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  for (const cifra of ["4000", "40000", "10000", "100000", "524288000", "52428800",
                       "5368709120", "500", "2000", "300", "30", "25"]) {
    assert(!new RegExp(`\\b${cifra}\\b`).test(copia),
      `el texto comercial lleva la cifra ${cifra} escrita a mano`);
  }
  // La referencia del Acompañamiento sí puede llevar números: va en texto y es
  // lo único que está aprobado enseñar así.
  assert(/8 h\/mes/.test(leer("lib/plans/commercial-copy.ts")),
    "se perdió la referencia de alcance del Acompañamiento");
});

check("2D. Y la capa de ensamblado tampoco", () => {
  const capa = leer("lib/plans/commercial-catalog.ts")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  for (const cifra of ["4000", "40000", "10000", "100000", "600", "300", "500"]) {
    assert(!new RegExp(`\\b${cifra}\\b`).test(capa),
      `el read model lleva la cifra ${cifra} escrita a mano`);
  }
});

console.log("\n3 · EL TIEMPO NO SE ASUME");

check("3A. Free se presenta medido: 30 min/día · 300 min/mes", () => {
  const t = plan("free").timeUsage;
  assert(t.mode === "metered", `Free salió como ${t.mode}`);
  assert(t.mode === "metered" && t.dailyMinutes === 30 && t.monthlyMinutes === 300,
    "los minutos de Free no atravesaron la capa");
  assert(formatTimeUsage(t) === "30 min/día · 300 min/mes",
    `Free se escribe «${formatTimeUsage(t)}»`);
});

check("3B. Full y Extra se presentan como uso ilimitado", () => {
  for (const code of ["full", "extra"]) {
    const t = plan(code).timeUsage;
    assert(t.mode === "unlimited", `${code} salió como ${t.mode}`);
    assert(formatTimeUsage(t) === UNLIMITED_USAGE_LABEL,
      `${code} se escribe «${formatTimeUsage(t)}»`);
  }
});

check("3C. La decisión NO vive en el componente: el modelo trae el modo", () => {
  // Es la diferencia entre que una pantalla pregunte «¿cuántos minutos?» —y
  // tenga que decidir ella qué hacer con la ausencia— y que reciba «ilimitado».
  // Decidir qué significa la ausencia es política, y la política no vive en un
  // componente.
  const t = plan("full").timeUsage;
  assert(!("dailyMinutes" in t),
    "un plan ilimitado expone minutos, y alguien acabará pintando `null`");
});

check("3D. Se replica el CRITERIO del motor, no sus valores", () => {
  // `organization_time_status` solo deja de medir cuando los DOS son
  // ilimitados. Mismo criterio aquí: uno solo no basta.
  assert(resolveTimeUsage({ state: "unlimited", value: null },
                          { state: "unlimited", value: null }).mode === "unlimited",
    "dos ilimitados no dan uso ilimitado");
  assert(resolveTimeUsage({ state: "unlimited", value: null },
                          { state: "finite", value: 600 }).mode === "metered",
    "un tope mensual con el diario libre debería seguir siendo medido");
  assert(resolveTimeUsage({ state: "finite", value: 30 },
                          { state: "unlimited", value: null }).mode === "metered",
    "un tope diario con el mensual libre debería seguir siendo medido");
});

check("3E. Sin decisión NO se inventa un ilimitado", () => {
  // `not_configured` significa que nadie lo ha decidido. Presentarlo como
  // «ilimitado» sería prometerle a un cliente algo que nadie aprobó.
  assert(resolveTimeUsage({ state: "not_configured", value: null },
                          { state: "unlimited", value: null }).mode === "undeclared",
    "un límite sin decidir se presentó como ilimitado");
  assert(resolveTimeUsage(null, null).mode === "undeclared",
    "sin filas de límite se inventó un modo");
  assert(formatTimeUsage({ mode: "undeclared" }) === null,
    "se escribe algo sobre un límite que nadie ha decidido");
});

console.log("\n4 · LA PRUEBA NO ES UN CUARTO PLAN");

check("4A. Vive aparte de los planes", () => {
  assert(!catalogo.saasPlans.some((p) => /trial|prueba/i.test(p.code)),
    "la prueba se coló como plan");
  assert(catalogo.trial !== null, "no se presenta la prueba");
});

check("4B. Full 48 h, sin tarjeta", () => {
  const t = catalogo.trial;
  assert(t !== null, "no hay prueba");
  assert(t.durationHours === 48, `la prueba dura ${t.durationHours} h`);
  assert(t.cardRequired === false, "la prueba pide tarjeta");
  assert(t.effectivePlanCode === "full", `la prueba concede ${t.effectivePlanCode}`);
  assert(trialTagline(t, catalogo.saasPlans) === "Prueba Full 48 horas · sin tarjeta de crédito",
    `el titular es «${trialTagline(t, catalogo.saasPlans)}»`);
});

check("4C. Su duración sale de la POLÍTICA, no de una constante", () => {
  const otro = buildCommercialCatalog({
    plans: PLANES, limits: LIMITES,
    trialPolicy: { ...POLITICA, trialDurationHours: 72 } });
  assert(otro.trial?.durationHours === 72,
    "la duración está escrita en el código en vez de leerse de la política");
  // Y se escribe en horas mientras sea corta: «48 horas» se lee como una
  // prueba; «2 días», como un plazo.
  assert(otro.trial?.durationLabel === "3 días",
    `72 horas se escribe «${otro.trial?.durationLabel}»`);
  const corta = buildCommercialCatalog({
    plans: PLANES, limits: LIMITES,
    trialPolicy: { ...POLITICA, trialDurationHours: 24 } });
  assert(corta.trial?.durationLabel === "24 horas",
    `24 horas se escribe «${corta.trial?.durationLabel}»`);
});

check("4D. Hereda el tiempo del plan que concede, no lo declara", () => {
  // Si lo declarara aparte sería una segunda verdad, y se desincronizaría en la
  // primera revisión nueva de Full.
  assert(catalogo.trial?.timeUsage.mode === "unlimited",
    "la prueba no hereda el tiempo ilimitado de Full");
  const conFullMedido = buildCommercialCatalog({
    plans: PLANES,
    limits: LIMITES.map((l) => l.planCode === "full"
        && l.resourceCode === "active_minutes_monthly"
      ? { ...l, limitState: "finite" as const, limitValue: 600 } : l),
    trialPolicy: POLITICA });
  assert(conFullMedido.trial?.timeUsage.mode === "metered",
    "la prueba no siguió a Full al cambiar Full: declara su propio tiempo");
});

check("4E. Y no se confunde con el Full contratado", () => {
  // Los créditos de IA de la prueba son los suyos (política), no los 500 del
  // Full contratado. El modelo NO los mezcla: la prueba no expone créditos.
  const t = catalogo.trial;
  assert(t !== null && !("aiCreditsMonthly" in t),
    "la prueba expone créditos y se confundirá con los del plan contratado");
  assert(plan("full").aiCreditsMonthly === 500,
    "los créditos del Full contratado se movieron");
});

check("4F. Una política apagada no promete ninguna prueba", () => {
  const sin = buildCommercialCatalog({
    plans: PLANES, limits: LIMITES,
    trialPolicy: { ...POLITICA, enabled: false } });
  assert(sin.trial === null, "se ofrece una prueba que está desactivada");
});

check("4G. Y sin el plan que concede, tampoco", () => {
  // Sin saber qué incluye, prometer una prueba es prometer a ciegas.
  const sin = buildCommercialCatalog({
    plans: PLANES.filter((p) => p.planCode !== "full"),
    limits: LIMITES, trialPolicy: POLITICA });
  assert(sin.trial === null, "se promete una prueba de un plan que no está publicado");
});

console.log("\n5 · LOS FORMATEADORES RECIBEN · NO SABEN");

check("5A. Precio, almacenamiento y créditos", () => {
  assert(formatUsdPrice(4000, "USD") === "USD 40", formatUsdPrice(4000, "USD") ?? "null");
  assert(formatMonthlyPrice(4000, "USD") === "USD 40 al mes",
    formatMonthlyPrice(4000, "USD") ?? "null");
  assert(formatStorage(524288000) === "500 MB", formatStorage(524288000) ?? "null");
  assert(formatStorage(5368709120) === "5 GB", formatStorage(5368709120) ?? "null");
  assert(formatStorage(52428800) === "50 MB", formatStorage(52428800) ?? "null");
  assert(formatAiCredits(500) === "500 créditos al mes", formatAiCredits(500) ?? "null");
});

check("5B. Un precio ausente NO es gratis", () => {
  // Devolver «USD 0» ante un precio sin publicar sería inventarse una oferta.
  assert(formatUsdPrice(null) === null, "un precio ausente se escribió como una cifra");
  assert(formatStorage(null) === null, "un almacenamiento ausente se escribió");
  assert(formatAiCredits(null) === null, "unos créditos ausentes se escribieron");
  // Y cero SÍ es cero: Free vale 0, y eso se escribe.
  assert(formatUsdPrice(0, "USD") === "USD 0", "el precio de Free no se escribe");
});

check("5C. Un límite sin decidir no se le enseña a un cliente", () => {
  assert(formatLimitForCustomer("storage_bytes", "not_configured", null) === null,
    "se le enseña a un cliente un hueco del catálogo interno");
  assert(formatLimitForCustomer("storage_bytes", "unlimited", null) === "Sin límite",
    "un ilimitado no se escribe");
  assert(formatLimitForCustomer("imports_enabled", "finite", 0) === "No incluido",
    "una bandera en cero se escribe como un número");
});

check("5D. Y no contienen autoridad", () => {
  const f = leer("lib/plans/commercial-presentation.ts")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  for (const cifra of ["4000", "40000", "10000", "524288000", "52428800",
                       "5368709120", "300", "600"]) {
    assert(!new RegExp(`\\b${cifra}\\b`).test(f),
      `un formateador lleva la cifra ${cifra} dentro`);
  }
});

console.log("\n6 · LA CAPA LEE · NO ES AUTORIDAD DE NADA");

check("6A. El read model no escribe", () => {
  for (const f of ["lib/plans/commercial-catalog.ts",
                   "lib/plans/commercial-presentation.ts",
                   "lib/plans/commercial-copy.ts",
                   "lib/db/commercial-catalog.ts"]) {
    const src = leer(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    for (const escritura of ["\\.insert\\(", "\\.update\\(", "\\.delete\\(",
                             "\\.upsert\\(", "\\.rpc\\("]) {
      assert(!new RegExp(escritura).test(src),
        `${f} escribe o invoca una primitiva: ${escritura}`);
    }
  }
});

check("6B. Ni calcula impuestos, ni descuentos, ni tipo de cambio", () => {
  for (const f of ["lib/plans/commercial-catalog.ts",
                   "lib/plans/commercial-presentation.ts",
                   "lib/db/commercial-catalog.ts"]) {
    const src = leer(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    for (const prohibido of ["tax", "impuest", "fx_rate", "basis_points",
                             "promotion", "discount"]) {
      assert(!new RegExp(prohibido, "i").test(src),
        `${f} toca ${prohibido}: eso lo produce la base al contratar`);
    }
  }
});

check("6C. El checkout SIGUE saliendo de billing_create_quote", () => {
  // Lo que una página pública enseña y lo que el checkout cobra pueden
  // coincidir porque leen la misma autoridad debajo. Pero el TOTAL que se cobra
  // —con su impuesto, su descuento y su cambio— lo produce la base.
  const b = leer("lib/db/billing.ts");
  assert(/rpc\("billing_create_quote"/.test(b),
    "el presupuesto dejó de salir de billing_create_quote");
  const capa = leer("lib/db/commercial-catalog.ts");
  assert(!/billing_create_quote/.test(capa),
    "el catálogo comercial se metió en el camino del cobro");
});

check("6D. Y lee de las vistas públicas, no de las tablas", () => {
  // Las vistas dejan fuera borradores, notas internas, revisiones retiradas y
  // recursos no públicos. Leer la tabla directamente sería decidir en una
  // pantalla qué es público, y esa decisión vive en la base.
  const db = leer("lib/db/commercial-plans.ts");
  assert(/from\("v_public_plan_catalog"\)/.test(db),
    "el catálogo no sale de la vista pública");
  assert(/from\("v_public_plan_limits"\)/.test(db),
    "los límites no salen de la vista pública");
});

console.log("\n7 · LO QUE SE ROMPE SOLO SI NADIE LO VIGILA");

check("7A. Un plan sin copia declarada no desaparece", () => {
  // Ocultar un plan publicado porque a alguien se le olvidó escribirle un
  // titular sería peor que enseñarlo con su nombre técnico.
  const c = buildCommercialCatalog({
    plans: [...PLANES, { planCode: "nuevo", displayOrder: 9, planRevisionId: "r-n",
      displayName: "Plan Nuevo", description: null, publicConditions: null,
      priceState: "configured", currency: "USD",
      monthlyPriceMinor: 7000, annualPriceMinor: 70000 }],
    limits: LIMITES, trialPolicy: POLITICA });
  const nuevo = c.saasPlans.find((p) => p.code === "nuevo");
  assert(nuevo !== undefined, "un plan publicado sin copia desapareció de la página");
  assert(nuevo.headline === "Plan Nuevo", "no cayó al nombre de la autoridad");
  assert(nuevo.timeUsage.mode === "undeclared",
    "a un plan sin límites declarados se le inventó un tiempo");
});

check("7B. Como mucho un plan destacado", () => {
  const destacados = Object.values(PLAN_COPY).filter((c) => c.featured);
  assert(destacados.length <= 1,
    `hay ${destacados.length} planes destacados: destacarlo todo es no destacar nada`);
});

console.log(`\nCOMMERCIAL-UX-01C · read model: ${passed} en verde, ${failed} en rojo`);
if (failed > 0) process.exit(1);
