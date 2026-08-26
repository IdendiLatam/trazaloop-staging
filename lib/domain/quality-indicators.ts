/**
 * Trazaloop Quality · QUALITY-03 · Lógica PURA de objetivos e indicadores.
 *
 * Refleja, sin Supabase ni Next ni servidor, las mismas reglas que la
 * migración 0117 impone en la base. La base es la barrera; esta capa existe
 * para que la pantalla hable el idioma de un responsable de calidad y para que
 * las reglas sean comprobables sin levantar una base de datos.
 *
 * Las separaciones que este archivo NO deja que se difuminen:
 *
 *   OBJETIVO ≠ INDICADOR ≠ META ≠ MEDICIÓN ≠ RESULTADO DE DESEMPEÑO
 *   ESTADO ADMINISTRATIVO ≠ DESEMPEÑO                            (OI-03)
 *   CERO ≠ SIN DATO ≠ NO APLICA                                  (OI-21)
 *   CALIDAD DEL DATO ≠ DESEMPEÑO                          (OI-11, OI-31)
 */

// ---------------------------------------------------------------------------
// Estados administrativos (OI-03) — NUNCA dicen nada sobre el desempeño
// ---------------------------------------------------------------------------
export const OBJECTIVE_ADMIN_STATES = ["draft", "active", "suspended", "closed", "cancelled"] as const;
export type ObjectiveAdminState = (typeof OBJECTIVE_ADMIN_STATES)[number];

export const OBJECTIVE_ADMIN_STATE_LABEL: Record<ObjectiveAdminState, string> = {
  draft: "Borrador",
  active: "Activo",
  suspended: "Suspendido",
  closed: "Cerrado",
  cancelled: "Cancelado",
};

export const INDICATOR_ADMIN_STATES = ["draft", "active", "suspended", "retired"] as const;
export type IndicatorAdminState = (typeof INDICATOR_ADMIN_STATES)[number];

export const INDICATOR_ADMIN_STATE_LABEL: Record<IndicatorAdminState, string> = {
  draft: "Borrador",
  active: "Activo",
  suspended: "Suspendido",
  retired: "Retirado",
};

// ---------------------------------------------------------------------------
// Desempeño (OI-22) — SIEMPRE derivado, nunca elegido a mano
// ---------------------------------------------------------------------------
export const EVALUATIONS = ["complies", "attention", "not_met", "no_target", "no_data"] as const;
export type Evaluation = (typeof EVALUATIONS)[number];

export const EVALUATION_LABEL: Record<Evaluation, string> = {
  complies: "Cumple",
  attention: "Atención",
  not_met: "No cumple",
  no_target: "Sin meta",
  no_data: "Sin datos",
};

export type EvaluationTone = "ok" | "attention" | "bad" | "neutral";

export function evaluationTone(evaluation: Evaluation): EvaluationTone {
  switch (evaluation) {
    case "complies": return "ok";
    case "attention": return "attention";
    case "not_met": return "bad";
    default: return "neutral";
  }
}

export const OBJECTIVE_PERFORMANCES = [
  "complies", "attention", "not_met", "no_data", "no_indicators",
] as const;
export type ObjectivePerformance = (typeof OBJECTIVE_PERFORMANCES)[number];

export const OBJECTIVE_PERFORMANCE_LABEL: Record<ObjectivePerformance, string> = {
  complies: "En cumplimiento",
  attention: "Requiere atención",
  not_met: "No cumple",
  no_data: "Sin mediciones",
  no_indicators: "Sin indicadores",
};

export function objectivePerformanceTone(p: ObjectivePerformance): EvaluationTone {
  switch (p) {
    case "complies": return "ok";
    case "attention": return "attention";
    case "not_met": return "bad";
    default: return "neutral";
  }
}

/** OI-18 · Cómo se deriva el desempeño del objetivo. OI no define ponderación,
 *  así que no se inventa: dos reglas explícitas y explicables. */
export const OBJECTIVE_RULES = ["worst_indicator", "majority_comply"] as const;
export type ObjectiveRule = (typeof OBJECTIVE_RULES)[number];

export const OBJECTIVE_RULE_LABEL: Record<ObjectiveRule, string> = {
  worst_indicator: "Manda el peor indicador",
  majority_comply: "Cumple si la mayoría cumple",
};

export const OBJECTIVE_RULE_HELP: Record<ObjectiveRule, string> = {
  worst_indicator:
    "El objetivo se lee como su indicador en peor situación. Es lo más exigente y lo más habitual en un sistema de gestión.",
  majority_comply:
    "El objetivo cumple si más de la mitad de sus indicadores cumple. Útil cuando el objetivo se mide con varias señales de peso parecido.",
};

// ---------------------------------------------------------------------------
// Estado del dato (OI-21) — cero, sin dato y no aplica son TRES cosas
// ---------------------------------------------------------------------------
export const DATA_STATES = ["reported", "no_data", "not_applicable"] as const;
export type DataState = (typeof DATA_STATES)[number];

export const DATA_STATE_LABEL: Record<DataState, string> = {
  reported: "Con resultado",
  no_data: "Sin dato",
  not_applicable: "No aplica",
};

export const DATA_QUALITIES = ["ok", "suspect", "failed_source"] as const;
export type DataQuality = (typeof DATA_QUALITIES)[number];

export const DATA_QUALITY_LABEL: Record<DataQuality, string> = {
  ok: "Dato correcto",
  suspect: "Dato dudoso",
  failed_source: "La fuente falló",
};

// ---------------------------------------------------------------------------
// Dirección de la meta (OI-04) — «mayor» no siempre es «mejor»
// ---------------------------------------------------------------------------
export const DIRECTIONS = ["higher_is_better", "lower_is_better", "within_range", "exact"] as const;
export type Direction = (typeof DIRECTIONS)[number];

export const DIRECTION_LABEL: Record<Direction, string> = {
  higher_is_better: "Cuanto más alto, mejor",
  lower_is_better: "Cuanto más bajo, mejor",
  within_range: "Dentro de un rango",
  exact: "Un valor exacto",
};

export function isDirection(v: string | null | undefined): v is Direction {
  return !!v && (DIRECTIONS as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// Periodicidad (§14) — y la pregunta que debe poder responder
// ---------------------------------------------------------------------------
export const FREQUENCIES = [
  "daily", "weekly", "monthly", "bimonthly", "quarterly", "biannual", "annual",
] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  daily: "Diaria",
  weekly: "Semanal",
  monthly: "Mensual",
  bimonthly: "Bimestral",
  quarterly: "Trimestral",
  biannual: "Semestral",
  annual: "Anual",
};

export function isFrequency(v: string | null | undefined): v is Frequency {
  return !!v && (FREQUENCIES as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// Unidades (§10) — presentación y semántica, jamás transformación del valor
// ---------------------------------------------------------------------------
export const UNIT_CODES = [
  "percent", "count", "units", "cop", "usd", "days", "hours", "minutes",
  "kg", "ton", "kwh", "index", "ratio", "celsius", "custom",
] as const;
export type UnitCode = (typeof UNIT_CODES)[number];

export const UNIT_LABEL: Record<UnitCode, string> = {
  percent: "Porcentaje (%)",
  count: "Conteo",
  units: "Unidades",
  cop: "Pesos (COP)",
  usd: "Dólares (USD)",
  days: "Días",
  hours: "Horas",
  minutes: "Minutos",
  kg: "Kilogramos",
  ton: "Toneladas",
  kwh: "Kilovatios hora",
  index: "Índice",
  ratio: "Razón",
  celsius: "Grados Celsius",
  custom: "Otra unidad",
};

/** Sufijo que se pega al número. Vacío cuando la unidad va delante o no lleva. */
const UNIT_SUFFIX: Record<UnitCode, string> = {
  percent: " %", count: "", units: " unidades", cop: "", usd: "",
  days: " días", hours: " h", minutes: " min", kg: " kg", ton: " t",
  kwh: " kWh", index: "", ratio: "", celsius: " °C", custom: "",
};

export function isUnitCode(v: string | null | undefined): v is UnitCode {
  return !!v && (UNIT_CODES as readonly string[]).includes(v);
}

function formatNumber(value: number): string {
  // Sin decimales cuando es entero; hasta dos cuando no. Un «96,00 %» donde
  // basta «96 %» hace que la pantalla parezca un informe contable.
  const rounded = Math.round(value * 100) / 100;
  return new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(rounded);
}

/**
 * Un valor, tal como debe leerse. `null` NO se convierte en cero: devuelve la
 * marca que corresponda al estado del dato (OI-21).
 */
export function formatValue(
  value: number | null,
  unitCode: string | null | undefined,
  unitLabel?: string | null,
  dataState: DataState = "reported"
): string {
  if (dataState === "not_applicable") return "No aplica";
  if (value === null || value === undefined) return "Sin dato";
  const unit: UnitCode = isUnitCode(unitCode) ? unitCode : "count";
  if (unit === "cop") return `$ ${formatNumber(value)}`;
  if (unit === "usd") return `US$ ${formatNumber(value)}`;
  if (unit === "custom") {
    const label = (unitLabel ?? "").trim();
    return label.length > 0 ? `${formatNumber(value)} ${label}` : formatNumber(value);
  }
  return `${formatNumber(value)}${UNIT_SUFFIX[unit]}`;
}

// ---------------------------------------------------------------------------
// Meta y umbrales (§11, §12) — descritos como los diría una persona
// ---------------------------------------------------------------------------
export type TargetShape = {
  direction: Direction;
  targetValue: number | null;
  targetMin: number | null;
  targetMax: number | null;
  warningValue: number | null;
  warningMin: number | null;
  warningMax: number | null;
  unitCode: string | null;
  unitLabel?: string | null;
};

export function describeTarget(t: TargetShape): string {
  const f = (v: number | null) => formatValue(v, t.unitCode, t.unitLabel);
  switch (t.direction) {
    case "higher_is_better":
      return t.targetValue === null ? "Sin meta" : `≥ ${f(t.targetValue)}`;
    case "lower_is_better":
      return t.targetValue === null ? "Sin meta" : `≤ ${f(t.targetValue)}`;
    case "within_range":
      return t.targetMin === null || t.targetMax === null
        ? "Sin rango"
        : `entre ${f(t.targetMin)} y ${f(t.targetMax)}`;
    case "exact":
      return t.targetValue === null ? "Sin meta" : `exactamente ${f(t.targetValue)}`;
  }
}

/** El umbral de atención, que NO es la meta: es el margen antes de incumplir. */
export function describeWarning(t: TargetShape): string | null {
  const f = (v: number | null) => formatValue(v, t.unitCode, t.unitLabel);
  if (t.direction === "within_range") {
    if (t.warningMin === null || t.warningMax === null) return null;
    return `Atención entre ${f(t.warningMin)} y ${f(t.warningMax)}`;
  }
  if (t.warningValue === null) return null;
  if (t.direction === "higher_is_better") return `Atención desde ${f(t.warningValue)}`;
  if (t.direction === "lower_is_better") return `Atención hasta ${f(t.warningValue)}`;
  return `Tolerancia de ± ${f(t.warningValue)}`;
}

export type TargetValidation = { error: string | null };

/**
 * Misma forma que exige la CHECK de 0117: un rango necesita sus dos extremos y
 * no usa valor único; las demás direcciones usan valor único y no extremos.
 * Comprobarlo aquí permite explicarlo antes de intentar guardar.
 */
export function validateTargetShape(t: TargetShape): TargetValidation {
  if (t.direction === "within_range") {
    const hasMin = t.targetMin !== null;
    const hasMax = t.targetMax !== null;
    if (hasMin !== hasMax) {
      return { error: "Un rango necesita sus dos extremos: el mínimo y el máximo." };
    }
    if (hasMin && hasMax && (t.targetMax as number) < (t.targetMin as number)) {
      return { error: "El máximo del rango no puede ser menor que el mínimo." };
    }
    if (t.targetValue !== null) {
      return { error: "Un indicador de rango no lleva un valor de meta único." };
    }
    if ((t.warningMin === null) !== (t.warningMax === null)) {
      return { error: "El margen de atención de un rango necesita sus dos extremos." };
    }
    return { error: null };
  }
  if (t.targetMin !== null || t.targetMax !== null) {
    return { error: "Solo un indicador de rango usa mínimo y máximo." };
  }
  if (t.warningValue !== null && t.targetValue === null) {
    return { error: "No puedes fijar un umbral de atención sin una meta." };
  }
  if (t.direction === "higher_is_better" && t.targetValue !== null && t.warningValue !== null
      && t.warningValue > t.targetValue) {
    return { error: "En un indicador donde más es mejor, el umbral de atención va por debajo de la meta." };
  }
  if (t.direction === "lower_is_better" && t.targetValue !== null && t.warningValue !== null
      && t.warningValue < t.targetValue) {
    return { error: "En un indicador donde menos es mejor, el umbral de atención va por encima de la meta." };
  }
  return { error: null };
}

/**
 * La MISMA evaluación que hace la base (0117 §13). Vive también aquí para que
 * la regla se pueda comprobar sin base de datos y para que la pantalla pueda
 * anticipar el resultado. Si alguna vez discreparan, manda la base: es la que
 * escribe el dato.
 */
export function evaluate(t: TargetShape, value: number | null, dataState: DataState = "reported"): Evaluation {
  if (dataState !== "reported" || value === null) return "no_data";
  if (t.direction === "within_range") {
    if (t.targetMin === null || t.targetMax === null) return "no_target";
    if (value >= t.targetMin && value <= t.targetMax) return "complies";
    if (t.warningMin !== null && t.warningMax !== null
        && value >= t.warningMin && value <= t.warningMax) return "attention";
    return "not_met";
  }
  if (t.targetValue === null) return "no_target";
  switch (t.direction) {
    case "higher_is_better":
      if (value >= t.targetValue) return "complies";
      if (t.warningValue !== null && value >= t.warningValue) return "attention";
      return "not_met";
    case "lower_is_better":
      if (value <= t.targetValue) return "complies";
      if (t.warningValue !== null && value <= t.warningValue) return "attention";
      return "not_met";
    case "exact":
      if (value === t.targetValue) return "complies";
      if (t.warningValue !== null && Math.abs(value - t.targetValue) <= t.warningValue) return "attention";
      return "not_met";
  }
}

// ---------------------------------------------------------------------------
// Tendencia (§25, §56) — consciente de la dirección
// ---------------------------------------------------------------------------
export const TRENDS = ["improving", "stable", "declining", "insufficient_data"] as const;
export type Trend = (typeof TRENDS)[number];

export const TREND_LABEL: Record<Trend, string> = {
  improving: "Mejora",
  stable: "Estable",
  declining: "Deterioro",
  insufficient_data: "Información insuficiente",
};

export const TREND_SYMBOL: Record<Trend, string> = {
  improving: "▲",
  stable: "▬",
  declining: "▼",
  insufficient_data: "–",
};

export type SeriesPoint = { periodStart: string; value: number | null; dataState: DataState };

/**
 * Tendencia a partir de los últimos periodos CON DATO.
 *
 * Subir no significa mejorar: en un indicador de reclamos, bajar es mejorar, y
 * en uno de rango lo que mejora es acercarse al rango. Por eso la dirección
 * entra en el cálculo (§56).
 *
 * Se exigen tres puntos con dato: con dos, cualquier oscilación normal
 * parecería una tendencia, y prefiero decir «información insuficiente» a
 * insinuar algo que los datos no sostienen. Nada de pseudoestadística: se
 * compara el primero con el último de los tres últimos, con una tolerancia
 * relativa para no llamar «cambio» al ruido.
 */
export function computeTrend(
  series: SeriesPoint[],
  direction: Direction,
  target?: { targetMin: number | null; targetMax: number | null; targetValue: number | null },
  tolerance = 0.02
): Trend {
  const reported = series
    .filter((p) => p.dataState === "reported" && p.value !== null)
    .sort((a, b) => a.periodStart.localeCompare(b.periodStart));
  if (reported.length < 3) return "insufficient_data";

  const last = reported.slice(-3);
  const first = last[0].value as number;
  const latest = last[last.length - 1].value as number;

  // En rango y en valor exacto, «mejor» es «más cerca del objetivo»: la
  // distancia es lo que hay que mirar, no el valor.
  if (direction === "within_range" || direction === "exact") {
    const distance = (v: number): number => {
      if (direction === "exact") {
        return target?.targetValue === null || target?.targetValue === undefined
          ? 0 : Math.abs(v - target.targetValue);
      }
      const min = target?.targetMin ?? null;
      const max = target?.targetMax ?? null;
      if (min === null || max === null) return 0;
      if (v < min) return min - v;
      if (v > max) return v - max;
      return 0;
    };
    const d0 = distance(first);
    const d1 = distance(latest);
    const scale = Math.max(Math.abs(d0), 1);
    if (Math.abs(d1 - d0) <= scale * tolerance) return "stable";
    return d1 < d0 ? "improving" : "declining";
  }

  const delta = latest - first;
  const scale = Math.max(Math.abs(first), 1);
  if (Math.abs(delta) <= scale * tolerance) return "stable";
  const wentUp = delta > 0;
  const upIsBetter = direction === "higher_is_better";
  return wentUp === upIsBetter ? "improving" : "declining";
}

// ---------------------------------------------------------------------------
// Fórmulas declarativas (OI-05) — un conjunto cerrado, no un lenguaje
// ---------------------------------------------------------------------------
export const CALC_OPERATIONS = ["ratio_percent", "ratio", "difference", "sum", "average"] as const;
export type CalcOperation = (typeof CALC_OPERATIONS)[number];

export const CALC_OPERATION_LABEL: Record<CalcOperation, string> = {
  ratio_percent: "A ÷ B × 100  (porcentaje)",
  ratio: "A ÷ B  (razón)",
  difference: "A − B  (diferencia)",
  sum: "Suma de los componentes",
  average: "Promedio de los componentes",
};

export type CalcOperand = { key: string; label: string };
export type CalcDefinition = { operation: CalcOperation; operands: CalcOperand[] };

export function isCalcOperation(v: string | null | undefined): v is CalcOperation {
  return !!v && (CALC_OPERATIONS as readonly string[]).includes(v);
}

/** Espejo exacto de quality_validate_calc_definition (0117 §15). */
export function validateCalcDefinition(calc: CalcDefinition): TargetValidation {
  if (!isCalcOperation(calc.operation)) return { error: "Elige una operación para la fórmula." };
  const operands = calc.operands ?? [];
  if (["ratio", "ratio_percent", "difference"].includes(calc.operation) && operands.length !== 2) {
    return { error: "Esta operación necesita exactamente dos componentes." };
  }
  if (["sum", "average"].includes(calc.operation) && operands.length < 1) {
    return { error: "Esta operación necesita al menos un componente." };
  }
  const keys = new Set<string>();
  for (const o of operands) {
    const key = (o.key ?? "").trim();
    if (key.length === 0) return { error: "Cada componente necesita una clave." };
    if (keys.has(key)) return { error: `La fórmula repite el componente «${key}».` };
    keys.add(key);
  }
  return { error: null };
}

/** Misma aritmética que quality_compute_calculated, para poder anticiparla. */
export function computeCalculated(
  calc: CalcDefinition, components: Record<string, number>
): { value: number | null; error: string | null } {
  const values: number[] = [];
  for (const o of calc.operands) {
    const raw = components[o.key];
    if (raw === undefined || raw === null || Number.isNaN(raw)) {
      return { value: null, error: `Falta el componente «${o.label || o.key}».` };
    }
    values.push(raw);
  }
  switch (calc.operation) {
    case "ratio":
      if (values[1] === 0) return { value: null, error: "No se puede dividir entre cero." };
      return { value: Math.round((values[0] / values[1]) * 10000) / 10000, error: null };
    case "ratio_percent":
      if (values[1] === 0) return { value: null, error: "No se puede dividir entre cero." };
      return { value: Math.round((values[0] * 100) / values[1] * 100) / 100, error: null };
    case "difference":
      return { value: values[0] - values[1], error: null };
    case "sum":
      return { value: values.reduce((a, b) => a + b, 0), error: null };
    case "average":
      return {
        value: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10000) / 10000,
        error: null,
      };
  }
}

export function describeFormula(calc: CalcDefinition | null): string {
  if (!calc) return "—";
  const names = calc.operands.map((o) => o.label || o.key);
  switch (calc.operation) {
    case "ratio_percent": return `${names[0]} ÷ ${names[1]} × 100`;
    case "ratio": return `${names[0]} ÷ ${names[1]}`;
    case "difference": return `${names[0]} − ${names[1]}`;
    case "sum": return names.join(" + ");
    case "average": return `promedio de ${names.join(", ")}`;
    default: return "—";
  }
}

// ---------------------------------------------------------------------------
// Cómo se alimenta un indicador (OI-08, OI-26)
// ---------------------------------------------------------------------------
export const SOURCE_KINDS = ["manual", "calculated", "native"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const SOURCE_KIND_LABEL: Record<SourceKind, string> = {
  manual: "Manual — alguien registra el resultado",
  calculated: "Calculado — se registran los componentes y Trazaloop hace la cuenta",
  native: "Automático — Trazaloop lo obtiene de lo que ya está registrado",
};

export function isSourceKind(v: string | null | undefined): v is SourceKind {
  return !!v && (SOURCE_KINDS as readonly string[]).includes(v);
}

/**
 * CATÁLOGO DE FUENTES AUTOMÁTICAS (OI-16).
 *
 * Los mismos identificadores que admite quality_native_source_keys() en la
 * base. Aquí viven solo las ETIQUETAS: el cálculo ocurre entero en SQL, de modo
 * que el navegador no puede aportar un valor. Una prueba comprueba que las dos
 * listas digan exactamente lo mismo — si divergieran, se podría configurar un
 * indicador que después no supiera calcularse.
 *
 * `nature` es honestidad, no adorno: una fuente «instantánea» mide el estado en
 * el momento de calcular, no reconstruye el que había al cierre del periodo.
 */
export type NativeSourceNature = "snapshot" | "period";

export type NativeSource = {
  key: string;
  label: string;
  description: string;
  nature: NativeSourceNature;
  suggestedUnit: UnitCode;
  suggestedDirection: Direction;
};

export const NATIVE_SOURCES: NativeSource[] = [
  {
    key: "quality.documents_effective_ratio",
    label: "Cumplimiento documental",
    description:
      "Porcentaje de documentos de Quality que están vigentes hoy, sobre los que siguen activos.",
    nature: "snapshot",
    suggestedUnit: "percent",
    suggestedDirection: "higher_is_better",
  },
  {
    key: "quality.documents_review_overdue_count",
    label: "Documentos con revisión vencida",
    description:
      "Cuántos documentos de Quality tienen su revisión periódica pasada de fecha. Vencer no los vuelve obsoletos: pide atención.",
    nature: "snapshot",
    suggestedUnit: "count",
    suggestedDirection: "lower_is_better",
  },
  {
    key: "quality.document_approval_lead_time_days",
    label: "Tiempo de aprobación documental",
    description:
      "Días promedio entre enviar un documento a revisión y aprobarlo, contando las revisiones aprobadas dentro del periodo.",
    nature: "period",
    suggestedUnit: "days",
    suggestedDirection: "lower_is_better",
  },
  {
    key: "quality.processes_published_ratio",
    label: "Procesos con versión publicada",
    description: "Porcentaje de procesos activos que tienen una revisión publicada vigente.",
    nature: "snapshot",
    suggestedUnit: "percent",
    suggestedDirection: "higher_is_better",
  },
  {
    key: "quality.open_document_tasks_count",
    label: "Tareas documentales abiertas",
    description: "Cuántas tareas de revisión, aprobación o corrección siguen sin cerrarse.",
    nature: "snapshot",
    suggestedUnit: "count",
    suggestedDirection: "lower_is_better",
  },
  // -------------------------------------------------------------------
  // QUALITY-08 · Voz del cliente.
  //
  // Se añaden AQUÍ y no en un catálogo propio: un indicador de satisfacción se
  // configura como cualquier otro, con el mismo motor y la misma verdad
  // histórica. Y ninguna de estas fuentes mide satisfacción por sí sola:
  // contar quejas es contar quejas.
  // -------------------------------------------------------------------
  {
    key: "quality.customer_complaints_count",
    label: "Quejas y reclamos recibidos",
    description:
      "Cuántas quejas y reclamos de clientes se recibieron dentro del periodo. Es un recuento de lo que llegó, no una medida de satisfacción.",
    nature: "period",
    suggestedUnit: "count",
    suggestedDirection: "lower_is_better",
  },
  {
    key: "quality.customer_complaints_closed_ratio",
    label: "Quejas atendidas",
    description:
      "Porcentaje de las quejas del periodo que ya se respondieron o cerraron. Sin quejas no hay porcentaje: un 100 % sobre cero afirmaría una gestión que no ocurrió.",
    nature: "period",
    suggestedUnit: "percent",
    suggestedDirection: "higher_is_better",
  },
  {
    key: "quality.customer_survey_responses_count",
    label: "Respuestas de encuesta recibidas",
    description:
      "Cuántas respuestas de encuesta se enviaron dentro del periodo. Cuántas llegaron, no cómo de contentos están.",
    nature: "period",
    suggestedUnit: "count",
    suggestedDirection: "higher_is_better",
  },
  {
    key: "quality.customer_open_complaints_count",
    label: "Quejas sin atender",
    description:
      "Cuántas quejas de clientes siguen sin revisar o en revisión hoy. Una queja abierta no es una no conformidad: es trabajo pendiente.",
    nature: "snapshot",
    suggestedUnit: "count",
    suggestedDirection: "lower_is_better",
  },
];

export const NATIVE_SOURCE_KEYS = NATIVE_SOURCES.map((s) => s.key);

export function nativeSource(key: string | null | undefined): NativeSource | null {
  return NATIVE_SOURCES.find((s) => s.key === key) ?? null;
}

export const NATIVE_SOURCE_NATURE_HELP: Record<NativeSourceNature, string> = {
  snapshot:
    "Mide el estado en el momento de calcular. No reconstruye cómo estaban las cosas al cerrar el periodo.",
  period: "Mide lo que ocurrió dentro del periodo.",
};

// ---------------------------------------------------------------------------
// Alcance del indicador (OI-25)
// ---------------------------------------------------------------------------
export const SCOPE_TYPES = ["organization", "objective", "process", "stage", "activity"] as const;
export type ScopeType = (typeof SCOPE_TYPES)[number];

export const SCOPE_TYPE_LABEL: Record<ScopeType, string> = {
  organization: "Toda la empresa",
  objective: "Un objetivo",
  process: "Un proceso",
  stage: "Una etapa",
  activity: "Una actividad",
};

/** Los alcances que esta versión permite elegir. El resto del enumerado está
 *  declarado en la base para no tener que migrar la columna más adelante. */
export const SELECTABLE_SCOPE_TYPES: ScopeType[] = ["organization", "process"];

// ---------------------------------------------------------------------------
// Permisos
// ---------------------------------------------------------------------------
import type { TeamRoleCode } from "./team";

/** Definir objetivos e indicadores es gobierno del sistema: admin y calidad. */
export function canManageObjectives(role: TeamRoleCode | null | undefined): boolean {
  return role === "admin" || role === "quality";
}

/** Registrar una medición sí puede hacerlo también un consultor: es el trabajo
 *  operativo de alimentar el sistema, no el de decidir qué se mide. */
export function canRecordMeasurement(role: TeamRoleCode | null | undefined): boolean {
  return role === "admin" || role === "quality" || role === "consultant";
}

export function canClosePeriod(role: TeamRoleCode | null | undefined): boolean {
  return role === "admin" || role === "quality";
}

/** Reabrir un ciclo cerrado deshace una decisión formal: solo administración. */
export function canReopenPeriod(role: TeamRoleCode | null | undefined): boolean {
  return role === "admin";
}
