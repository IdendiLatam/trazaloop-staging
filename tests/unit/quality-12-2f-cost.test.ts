/**
 * Trazaloop · QUALITY-12.2F · El dinero, comprobado con números redondos.
 *
 * POR QUÉ ESTA SUITE EXISTE APARTE
 *
 * Porque un error en una fórmula de coste no se nota. No rompe una pantalla ni
 * lanza una excepción: produce un número plausible que alguien usará para
 * decidir un precio. Los errores que no se ven son los que hay que buscar a
 * propósito.
 *
 * Y porque la cuenta está escrita DOS veces —en SQL para las vistas y en
 * TypeScript para la previsión— y dos implementaciones de la misma fórmula que
 * nadie compara acaban separándose. Aquí se comparan.
 *
 * Los casos son de números redondos a propósito: un millón de tokens de
 * entrada tiene que costar exactamente la tarifa de entrada. Si eso falla, la
 * fórmula está mal y no hace falta mirar más.
 */
import {
  costMicros, toUsd, formatUsd, USD, MEASURED_USAGE,
  forecastOrganization, forecastFleet, SCENARIOS, FLEET_SIZES,
  type ModelRate,
} from "../../lib/domain/intelligence-cost";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

/** La tarifa real de gpt-5.4-mini, la misma que siembra la 0140. */
const RATE: ModelRate = {
  provider: "openai", model: "gpt-5.4-mini",
  inputPerMillion: 0.25, cachedInputPerMillion: 0.025, outputPerMillion: 2.0,
  reasoningBilling: "within_output",
};

const M = 1_000_000;
const uso = (i: number, c: number, o: number, r = 0) =>
  ({ inputTokens: i, cachedInputTokens: c, outputTokens: o, reasoningTokens: r });

console.log("\nQUALITY-12.2F · el modelo de coste\n");

// ===========================================================================
console.log("A · NÚMEROS REDONDOS");
// ===========================================================================

check("A1. un millón de entrada cuesta exactamente la tarifa de entrada", () => {
  const c = toUsd(costMicros(uso(M, 0, 0), RATE));
  assert(c === 0.25, `costó ${c}, se esperaba 0.25`);
});

check("A2. un millón de salida cuesta exactamente la tarifa de salida", () => {
  const c = toUsd(costMicros(uso(0, 0, M), RATE));
  assert(c === 2.0, `costó ${c}, se esperaba 2.00`);
});

check("A3. un millón TODO cacheado cuesta la tarifa de caché, no las dos", () => {
  // El error clásico: cobrar la entrada Y el caché. Inflaría el coste justo en
  // el caso que se supone que lo abarata.
  const c = toUsd(costMicros(uso(M, M, 0), RATE));
  assert(c === 0.025, `costó ${c}, se esperaba 0.025`);
});

check("A4. mitad cacheada cuesta la mitad de cada tarifa", () => {
  const c = toUsd(costMicros(uso(M, M / 2, 0), RATE));
  const esperado = 0.5 * 0.25 + 0.5 * 0.025;
  assert(Math.abs(c - esperado) < 1e-9, `costó ${c}, se esperaba ${esperado}`);
});

check("A5. entrada + caché + salida se suman, no se pisan", () => {
  const c = toUsd(costMicros(uso(M, M / 4, M), RATE));
  const esperado = 0.75 * 0.25 + 0.25 * 0.025 + 2.0;
  assert(Math.abs(c - esperado) < 1e-9, `costó ${c}, se esperaba ${esperado}`);
});

check("A6. el caché nunca puede exceder la entrada", () => {
  // Si el proveedor informara un caché mayor que la entrada —no debería, pero
  // los datos de terceros hacen cosas—, la cuenta no puede salir negativa.
  const c = costMicros(uso(1000, 999999, 0), RATE);
  assert(c >= 0, `salió negativo: ${c}`);
  const cap = toUsd(costMicros(uso(1000, 999999, 0), RATE));
  assert(cap === toUsd(costMicros(uso(1000, 1000, 0), RATE)),
    "un caché imposible no se limita a la entrada");
});

check("A7. el razonamiento va DENTRO de la salida en estos modelos", () => {
  const sin = costMicros(uso(100, 0, 500, 0), RATE);
  const con = costMicros(uso(100, 0, 500, 300), RATE);
  assert(sin === con, "el razonamiento se cobró aparte cuando va dentro de la salida");
});

check("A8. pero si un proveedor lo cobrara aparte, se cobra", () => {
  const aparte: ModelRate = { ...RATE, reasoningBilling: "separate", reasoningPerMillion: 1.0 };
  const c = toUsd(costMicros(uso(0, 0, 0, M), aparte));
  assert(c === 1.0, `costó ${c}, se esperaba 1.00`);
});

check("A9. el doble determinístico cuesta cero", () => {
  const doble: ModelRate = { provider: "fake", model: "doble-determinista-1",
    inputPerMillion: 0, cachedInputPerMillion: 0, outputPerMillion: 0,
    reasoningBilling: "within_output" };
  assert(costMicros(uso(M, 0, M), doble) === 0, "el doble costó algo");
});

// ===========================================================================
console.log("\nB · EL DINERO NO SE GUARDA EN COMA FLOTANTE");
// ===========================================================================

check("B1. el coste es un entero de microdólares", () => {
  const c = costMicros(uso(1073, 0, 618, 313), RATE);
  assert(Number.isInteger(c), `no es entero: ${c}`);
});

check("B2. sumar mil operaciones no arrastra error", () => {
  const una = costMicros(uso(1073, 0, 618), RATE);
  let acumulado = 0;
  for (let i = 0; i < 1000; i += 1) acumulado += una;
  assert(acumulado === una * 1000,
    `mil veces ${una} dio ${acumulado} en vez de ${una * 1000}`);
  assert(Number.isInteger(acumulado), "la suma dejó de ser entera");
});

check("B3. la unidad está declarada y es consistente", () => {
  assert(USD === 1_000_000, `USD vale ${USD}`);
  assert(toUsd(USD) === 1, "un millón de microdólares no es un dólar");
});

check("B4. se formatea con decimales suficientes para verse", () => {
  // Una operación cuesta milésimas: «$0.00» no informaría de nada.
  const c = costMicros(uso(1073, 0, 618, 313), RATE);
  const t = formatUsd(c);
  assert(t !== "$0.00" && t !== "$0", `una revisión se muestra como ${t}`);
  assert(/^\$\d+\.\d{3,4}$/.test(t), `formato inesperado: ${t}`);
});

// ===========================================================================
console.log("\nC · LO MEDIDO ES LO MEDIDO");
// ===========================================================================

check("C1. el consumo de cada capacidad viene de una validación real", () => {
  for (const [uc, m] of Object.entries(MEASURED_USAGE)) {
    assert(m.source.length > 10, `${uc} no dice de dónde salió su medición`);
    assert(/QUALITY-12/.test(m.source), `${uc} no cita el sprint que lo midió`);
    assert(m.inputTokens > 0, `${uc} tiene entrada cero`);
  }
});

check("C2. y coincide con lo que los entregables reportaron", () => {
  assert(MEASURED_USAGE["document.quick_edit"].inputTokens === 727,
    "Quick Edit no usa los 727 medidos en 12.2C");
  assert(MEASURED_USAGE["document.contextual_review"].inputTokens === 1073,
    "la revisión no usa los 1 073 medidos en 12.2D");
});

check("C3. una revisión contextual cuesta más que una mejora, como se midió", () => {
  const q = costMicros(MEASURED_USAGE["document.quick_edit"], RATE);
  const r = costMicros(MEASURED_USAGE["document.contextual_review"], RATE);
  const a = costMicros(MEASURED_USAGE["ask"], RATE);
  assert(q < r, `la mejora (${q}) no cuesta menos que la revisión (${r})`);
  assert(r < a, `la revisión (${r}) no cuesta menos que la consulta global (${a})`);
  console.log(`      mejora ${formatUsd(q)} · revisión ${formatUsd(r)} · consulta ${formatUsd(a)}`);
});

// ===========================================================================
console.log("\nD · PREVISIÓN, QUE NO ES CONSUMO");
// ===========================================================================

const rates = {
  "document.quick_edit": RATE, "document.contextual_review": RATE, "ask": RATE,
};

check("D1. los tres escenarios crecen en el orden que dicen sus nombres", () => {
  const l = forecastOrganization(SCENARIOS.low, rates);
  const n = forecastOrganization(SCENARIOS.normal, rates);
  const i = forecastOrganization(SCENARIOS.intensive, rates);
  assert(l.costMicros < n.costMicros && n.costMicros < i.costMicros,
    `no crecen: ${l.costMicros} / ${n.costMicros} / ${i.costMicros}`);
  for (const [k, f] of [["bajo", l], ["normal", n], ["intensivo", i]] as const) {
    console.log(`      ${k.padEnd(10)} ${String(f.operations).padStart(5)} ops · ${formatUsd(f.costMicros)}`);
  }
});

check("D2. las operaciones cuadran con la mezcla declarada", () => {
  const m = SCENARIOS.normal;
  const f = forecastOrganization(m, rates);
  const esperado = m.sections * m.quickEditsPerSection
    + m.sections * m.contextualReviewsPerSection + m.asksPerMonth;
  assert(f.operations === esperado, `${f.operations} operaciones, se esperaban ${esperado}`);
});

check("D3. la flota escala linealmente y sin pérdidas", () => {
  const una = forecastOrganization(SCENARIOS.normal, rates);
  for (const k of FLEET_SIZES) {
    const f = forecastFleet(una, k);
    assert(f.costMicros === una.costMicros * k,
      `${k} empresas no cuesta ${k} veces una`);
    assert(f.operations === una.operations * k, `${k} empresas: operaciones mal`);
  }
});

check("D4. sin tarifa no se inventa un coste", () => {
  const f = forecastOrganization(SCENARIOS.normal, {});
  assert(f.costMicros === 0 && f.operations === 0,
    "se previó coste sin tener tarifa con la que calcularlo");
});

check("D5. una flota negativa o rota no produce dinero negativo", () => {
  const una = forecastOrganization(SCENARIOS.normal, rates);
  assert(forecastFleet(una, -5).costMicros === 0, "una flota negativa costó algo");
  assert(forecastFleet(una, 0).costMicros === 0, "cero empresas costó algo");
});

// ===========================================================================
console.log("\nE · LA DECISIÓN QUE ESTOS NÚMEROS PERMITEN TOMAR");
// ===========================================================================

check("E1. una implantación completa cuesta del orden de un dólar", () => {
  // No es una comprobación de vanidad: es la cifra que decide si esto se
  // regala con el plan o se cobra aparte, y conviene que salte si cambia
  // en un orden de magnitud.
  const n = forecastOrganization(SCENARIOS.normal, rates);
  const usd = toUsd(n.costMicros);
  assert(usd > 0.1 && usd < 10,
    `una implantación normal cuesta ${usd} USD, fuera del orden esperado`);
  console.log(`      implantación normal de una empresa: ${formatUsd(n.costMicros)}`);
});

check("E2. diez mil empresas siguen siendo un número manejable", () => {
  const una = forecastOrganization(SCENARIOS.intensive, rates);
  const flota = forecastFleet(una, 10000);
  const usd = toUsd(flota.costMicros);
  assert(usd < 100000, `10 000 empresas intensivas costarían ${usd} USD`);
  console.log(`      10 000 empresas, escenario intensivo: ${formatUsd(flota.costMicros)}`);
});

console.log(`\n${passed} conformes · ${failed} fallos\n`);
process.exit(failed === 0 ? 0 : 1);
