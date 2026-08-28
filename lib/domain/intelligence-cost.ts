/**
 * Trazaloop · QUALITY-12.2F · El dinero, y las tres cosas que no son lo mismo.
 *
 * Este archivo existe porque tres conceptos que se parecen se estaban a punto
 * de mezclar, y mezclarlos habría hecho inservible todo lo que viene después:
 *
 *     CONSUMO REAL      lo que el proveedor dijo que gastó. Es un hecho.
 *     COSTE ESTIMADO    lo que ese consumo vale en dinero, según la tarifa
 *                       vigente cuando ocurrió. Es una multiplicación.
 *     PREVISIÓN         lo que gastaría un escenario que todavía no ha pasado.
 *                       Es una hipótesis.
 *
 * El primero no se calcula: se lee. El segundo se calcula sobre el primero. El
 * tercero no se calcula sobre ninguno de los dos: se modela.
 *
 * Una previsión presentada como consumo es una mentira con formato de informe,
 * y un consumo estimado presentado como verdad del proveedor lo es igual. Cada
 * función de aquí devuelve un tipo que dice cuál de los tres es.
 *
 * NO es `server-only`: las pantallas necesitan formatear estas cifras.
 */

/** El dinero se representa en **microdólares** (1 USD = 1 000 000). Enteros:
 *  ni un céntimo se pierde por redondeo binario, y sumar mil runs no acumula
 *  error. Se convierte a USD solo para enseñarlo. */
export type Microdollars = number;

export const USD = 1_000_000;

export function toUsd(micro: Microdollars): number {
  return micro / USD;
}

/** Para pantalla. Cuatro decimales porque una operación cuesta milésimas de
 *  dólar y «$0.00» no informa de nada. */
export function formatUsd(micro: Microdollars): string {
  const usd = toUsd(micro);
  if (usd === 0) return "$0";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

/** Tarifa de un modelo, en USD por millón de tokens. */
export type ModelRate = {
  provider: string;
  model: string;
  inputPerMillion: number;
  cachedInputPerMillion: number;
  outputPerMillion: number;
  /** Cómo factura el proveedor el razonamiento. En los modelos que usamos va
   *  dentro de la salida; se declara para no tener que recordarlo. */
  reasoningBilling: "within_output" | "separate" | "not_billed";
  reasoningPerMillion?: number | null;
};

export type ProviderUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
};

/**
 * Cuánto vale un consumo. La misma fórmula que la función de la base, para
 * que las dos puedan compararse en una prueba y no se separen con el tiempo.
 *
 * Los tokens cacheados **se descuentan** de los de entrada: el proveedor los
 * informa como un subconjunto, no como algo aparte. Cobrarlos dos veces
 * inflaría el coste justo en el caso que se supone que lo abarata.
 */
export function costMicros(usage: ProviderUsage, rate: ModelRate): Microdollars {
  const cached = Math.min(Math.max(usage.cachedInputTokens, 0), Math.max(usage.inputTokens, 0));
  const frescos = Math.max(usage.inputTokens, 0) - cached;

  const micros =
      frescos * rate.inputPerMillion
    + cached * rate.cachedInputPerMillion
    + Math.max(usage.outputTokens, 0) * rate.outputPerMillion
    + (rate.reasoningBilling === "separate"
        ? Math.max(usage.reasoningTokens, 0) * (rate.reasoningPerMillion ?? 0)
        : 0);

  // Los USD/millón se aplican sobre tokens: el resultado ya está en
  // microdólares sin más conversión. Se redondea al entero para que sumar
  // muchos runs no arrastre decimales.
  return Math.round(micros);
}

// ===========================================================================
// PREVISIÓN
// ---------------------------------------------------------------------------
// Lo que costaría un escenario. NO es consumo, y por eso el tipo se llama
// distinto y todas las tablas que lo usan tienen que decir «previsión».
// ===========================================================================

/** El consumo medido de cada capacidad, con el proveedor real. No son
 *  suposiciones: cada cifra tiene su sprint y su validación humana detrás. */
export const MEASURED_USAGE: Record<string, ProviderUsage & { source: string }> = {
  "document.quick_edit": {
    inputTokens: 727, cachedInputTokens: 0, outputTokens: 171, reasoningTokens: 80,
    source: "QUALITY-12.2C · 4 llamadas reales",
  },
  "document.contextual_review": {
    inputTokens: 1073, cachedInputTokens: 0, outputTokens: 618, reasoningTokens: 313,
    source: "QUALITY-12.2D · 3 llamadas reales",
  },
  "ask": {
    inputTokens: 2700, cachedInputTokens: 0, outputTokens: 700, reasoningTokens: 200,
    source: "QUALITY-12.1 · consultas reales (2 514–2 886 de entrada)",
  },
};

export type ScenarioMix = {
  /** Secciones documentales de la empresa. */
  sections: number;
  quickEditsPerSection: number;
  contextualReviewsPerSection: number;
  /** Consultas al Copilot global, al mes. */
  asksPerMonth: number;
};

export type OrganizationForecast = {
  operations: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costMicros: Microdollars;
  byUseCase: Record<string, { operations: number; costMicros: Microdollars }>;
};

/**
 * Lo que gastaría UNA empresa con esa mezcla de uso.
 *
 * La implantación —redactar las secciones— es un esfuerzo que ocurre una vez,
 * no todos los meses. Se modela aparte del uso recurrente, porque meterlo en
 * una media mensual daría un número que ninguna empresa gastará nunca: ni el
 * primer mes, que será mucho mayor, ni el sexto, que será mucho menor.
 */
export function forecastOrganization(
  mix: ScenarioMix, rates: Record<string, ModelRate>
): OrganizationForecast {
  const partes: [string, number][] = [
    ["document.quick_edit", mix.sections * mix.quickEditsPerSection],
    ["document.contextual_review", mix.sections * mix.contextualReviewsPerSection],
    ["ask", mix.asksPerMonth],
  ];

  let operations = 0, inputTokens = 0, outputTokens = 0, coste = 0;
  const byUseCase: OrganizationForecast["byUseCase"] = {};

  for (const [useCase, n] of partes) {
    const uso = MEASURED_USAGE[useCase];
    const rate = rates[useCase];
    if (!uso || !rate || n <= 0) continue;
    const c = costMicros(uso, rate) * n;
    operations += n;
    inputTokens += uso.inputTokens * n;
    outputTokens += uso.outputTokens * n;
    coste += c;
    byUseCase[useCase] = { operations: n, costMicros: c };
  }

  return {
    operations, inputTokens, outputTokens,
    totalTokens: inputTokens + outputTokens,
    costMicros: coste, byUseCase,
  };
}

/** Escala una previsión a N empresas. Trivial a propósito: la parte difícil es
 *  no confundir «empresas» con «personas usándolo a la vez», y eso no lo
 *  resuelve una multiplicación sino la documentación. */
export function forecastFleet(
  one: OrganizationForecast, organizations: number
): OrganizationForecast {
  const k = Math.max(0, Math.floor(organizations));
  return {
    operations: one.operations * k,
    inputTokens: one.inputTokens * k,
    outputTokens: one.outputTokens * k,
    totalTokens: one.totalTokens * k,
    costMicros: one.costMicros * k,
    byUseCase: Object.fromEntries(Object.entries(one.byUseCase).map(
      ([u, v]) => [u, { operations: v.operations * k, costMicros: v.costMicros * k }])),
  };
}

/** Los tres perfiles del documento de previsión. Cambiarlos aquí cambia el
 *  informe: no hay una segunda copia en ningún markdown. */
export const SCENARIOS: Record<"low" | "normal" | "intensive", ScenarioMix> = {
  low:       { sections: 350, quickEditsPerSection: 1, contextualReviewsPerSection: 1, asksPerMonth: 25 },
  normal:    { sections: 350, quickEditsPerSection: 2, contextualReviewsPerSection: 1, asksPerMonth: 50 },
  intensive: { sections: 350, quickEditsPerSection: 3, contextualReviewsPerSection: 1, asksPerMonth: 100 },
};

/** Los tamaños de flota del informe. La función acepta cualquiera; esta lista
 *  es solo la que el documento enseña. */
export const FLEET_SIZES = [100, 500, 1000, 5000, 10000] as const;
