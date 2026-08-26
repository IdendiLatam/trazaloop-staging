/**
 * Trazaloop Quality · QUALITY-03 · Pruebas PURAS y ESTÁTICAS.
 *
 *   A · Las cuatro separaciones que el sprint no deja difuminar.
 *   B · Evaluación: dirección, umbrales, rango, sin meta.
 *   C · Tendencia consciente de la dirección.
 *   D · Forma de la meta y de la fórmula.
 *   E · Unidades y formato.
 *   F · Catálogo de fuentes automáticas.
 *   M · Convenciones e invariantes de la migración 0117.
 *   N · Coherencia entre capas.
 *
 * Correr: npm run test:quality03
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DATA_STATES, DIRECTIONS, EVALUATIONS, FREQUENCIES, INDICATOR_ADMIN_STATES,
  NATIVE_SOURCES, NATIVE_SOURCE_KEYS, OBJECTIVE_ADMIN_STATES, OBJECTIVE_RULES,
  SCOPE_TYPES, SOURCE_KINDS, TRENDS, UNIT_CODES,
  DATA_STATE_LABEL, EVALUATION_LABEL, INDICATOR_ADMIN_STATE_LABEL,
  OBJECTIVE_ADMIN_STATE_LABEL, OBJECTIVE_RULE_HELP, OBJECTIVE_RULE_LABEL,
  TREND_LABEL, UNIT_LABEL,
  canManageObjectives, canRecordMeasurement, canClosePeriod, canReopenPeriod,
  computeCalculated, computeTrend, describeFormula, describeTarget, describeWarning,
  evaluate, evaluationTone, formatValue, nativeSource,
  validateCalcDefinition, validateTargetShape,
  type SeriesPoint, type TargetShape,
} from "../../lib/domain/quality-indicators";

const ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const stripSql = (s: string) => s.replace(/^\s*--.*$/gm, "");
const MIG = "supabase/migrations/0117_quality_objectives_indicators_and_measurements.sql";
const MIG_PRIV = "supabase/migrations/0118_quality_measurement_engine_privilege_hardening.sql";

let passed = 0;
let failed = 0;
function check(name: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${name}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${name}: ${e instanceof Error ? e.message : e}`); }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }

const SQL = stripSql(read(MIG));

/**
 * QUALITY-08 · El catálogo de fuentes automáticas se declaró en 0117 y se
 * ENSANCHA en migraciones posteriores. Comprobarlo contra 0117 dejaría de
 * defender nada en cuanto alguien añadiera una fuente: la invariante real es
 * que el dominio y la definición VIGENTE de la base digan lo mismo, así que se
 * lee la última migración que redefine esas dos funciones.
 */
function latestNativeSourceSql(): string {
  const dir = join(ROOT, "supabase/migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  let latest = SQL;
  for (const f of files) {
    const sql = stripSql(read(join("supabase/migrations", f)));
    if (sql.includes("function public.quality_native_source_value(")
        && sql.includes("function public.quality_native_source_keys(")) {
      latest = sql;
    }
  }
  return latest;
}
const NATIVE_SQL = latestNativeSourceSql();

console.log("\nQUALITY-03 · objetivos e indicadores (puras y estáticas)\n");

// ---------------------------------------------------------------------------
console.log("A · Las separaciones que no se difuminan");
// ---------------------------------------------------------------------------

check("A1. estado administrativo y desempeño son vocabularios DISTINTOS (OI-03)", () => {
  for (const st of OBJECTIVE_ADMIN_STATES) {
    assert(OBJECTIVE_ADMIN_STATE_LABEL[st]?.length > 0, `falta la etiqueta de ${st}`);
  }
  // Si un valor apareciera en los dos, alguien acabaría usando uno por el otro.
  const admin = new Set<string>([...INDICATOR_ADMIN_STATES, ...OBJECTIVE_ADMIN_STATES]);
  for (const e of EVALUATIONS) {
    assert(!admin.has(e), `«${e}» está en los dos vocabularios`);
  }
  assert(admin.has("active") && !admin.has("complies"), "el vocabulario administrativo cambió");
  // Y sus etiquetas tampoco se confunden en pantalla.
  assert(INDICATOR_ADMIN_STATE_LABEL.active === "Activo", INDICATOR_ADMIN_STATE_LABEL.active);
  assert(EVALUATION_LABEL.complies === "Cumple", EVALUATION_LABEL.complies);
});

check("A2. un indicador ACTIVO puede NO CUMPLIR, y uno RETIRADO haber cumplido", () => {
  // No es una comprobación de código: es la comprobación de que el modelo
  // permite las dos combinaciones, que es lo que OI-03 exige.
  const target: TargetShape = {
    direction: "higher_is_better", targetValue: 95, targetMin: null, targetMax: null,
    warningValue: null, warningMin: null, warningMax: null, unitCode: "percent",
  };
  assert(evaluate(target, 80) === "not_met", "un indicador activo no puede quedar en «no cumple»");
  assert(evaluate(target, 97) === "complies", "un indicador retirado no puede conservar «cumple»");
});

check("A3. cero, sin dato y no aplica son TRES cosas (OI-21)", () => {
  assert(DATA_STATES.length === 3, `${DATA_STATES.length} estados del dato`);
  const target: TargetShape = {
    direction: "higher_is_better", targetValue: 95, targetMin: null, targetMax: null,
    warningValue: null, warningMin: null, warningMax: null, unitCode: "percent",
  };
  // Un cero SE EVALÚA: es un resultado.
  assert(evaluate(target, 0, "reported") === "not_met", "un cero medido no se evaluó");
  // Un «sin dato» NO se evalúa.
  assert(evaluate(target, null, "no_data") === "no_data", "un sin dato se evaluó igualmente");
  assert(evaluate(target, null, "not_applicable") === "no_data", "un no aplica se evaluó igualmente");
  // Y en pantalla se leen distinto.
  assert(formatValue(0, "percent") === "0 %", formatValue(0, "percent"));
  assert(formatValue(null, "percent") === "Sin dato", formatValue(null, "percent"));
  assert(formatValue(null, "percent", null, "not_applicable") === "No aplica",
    formatValue(null, "percent", null, "not_applicable"));
});

check("A4. la calidad del dato no es desempeño (OI-11, OI-31)", () => {
  // Una fuente caída deja «sin dato», nunca «no cumple»: la evaluación de un
  // valor ausente es no_data cualquiera que sea la meta.
  const target: TargetShape = {
    direction: "lower_is_better", targetValue: 3, targetMin: null, targetMax: null,
    warningValue: null, warningMin: null, warningMax: null, unitCode: "count",
  };
  assert(evaluate(target, null, "no_data") === "no_data", "una fuente caída produjo un veredicto");
  assert(DATA_STATE_LABEL.no_data === "Sin dato", DATA_STATE_LABEL.no_data);
});

// ---------------------------------------------------------------------------
console.log("\nB · Evaluación");
// ---------------------------------------------------------------------------

const higher: TargetShape = {
  direction: "higher_is_better", targetValue: 95, targetMin: null, targetMax: null,
  warningValue: 90, warningMin: null, warningMax: null, unitCode: "percent",
};
const lower: TargetShape = {
  direction: "lower_is_better", targetValue: 3, targetMin: null, targetMax: null,
  warningValue: 5, warningMin: null, warningMax: null, unitCode: "count",
};
const range: TargetShape = {
  direction: "within_range", targetValue: null, targetMin: 18, targetMax: 24,
  warningValue: null, warningMin: 16, warningMax: 26, unitCode: "celsius",
};

check("B1. mayor es mejor: cumple, atención, no cumple", () => {
  assert(evaluate(higher, 97) === "complies", "97 con meta 95");
  assert(evaluate(higher, 95) === "complies", "el valor igual a la meta cumple");
  assert(evaluate(higher, 92) === "attention", "92 entre umbral 90 y meta 95");
  assert(evaluate(higher, 89) === "not_met", "89 por debajo del umbral");
});

check("B2. menor es mejor: `actual >= target` NO es la regla", () => {
  assert(evaluate(lower, 2) === "complies", "2 reclamos con meta ≤ 3");
  assert(evaluate(lower, 3) === "complies", "el valor igual a la meta cumple");
  assert(evaluate(lower, 4) === "attention", "4 entre meta 3 y umbral 5");
  assert(evaluate(lower, 9) === "not_met", "9 muy por encima");
  // Y la comprobación que importa: el mismo número da resultados opuestos.
  assert(evaluate(higher, 2) === "not_met" && evaluate(lower, 2) === "complies",
    "la dirección no cambió el veredicto del mismo valor");
});

check("B3. rango: dentro, margen, fuera", () => {
  assert(evaluate(range, 21) === "complies", "21 dentro de 18–24");
  assert(evaluate(range, 18) === "complies" && evaluate(range, 24) === "complies", "los extremos cumplen");
  assert(evaluate(range, 25) === "attention", "25 en el margen 16–26");
  assert(evaluate(range, 30) === "not_met", "30 fuera de todo");
});

check("B4. valor exacto, con tolerancia opcional", () => {
  const exact: TargetShape = {
    direction: "exact", targetValue: 100, targetMin: null, targetMax: null,
    warningValue: 2, warningMin: null, warningMax: null, unitCode: "count",
  };
  assert(evaluate(exact, 100) === "complies", "100 = 100");
  assert(evaluate(exact, 101) === "attention", "101 dentro de la tolerancia ±2");
  assert(evaluate(exact, 110) === "not_met", "110 fuera de la tolerancia");
});

check("B5. sin meta NO es «no cumple»", () => {
  const none: TargetShape = {
    direction: "higher_is_better", targetValue: null, targetMin: null, targetMax: null,
    warningValue: null, warningMin: null, warningMax: null, unitCode: "count",
  };
  assert(evaluate(none, 42) === "no_target", evaluate(none, 42));
  assert(EVALUATION_LABEL.no_target === "Sin meta", EVALUATION_LABEL.no_target);
  // Y un rango a medio declarar tampoco inventa un veredicto.
  const halfRange: TargetShape = { ...range, targetMin: 18, targetMax: null };
  assert(evaluate(halfRange, 21) === "no_target", evaluate(halfRange, 21));
});

check("B6. sin umbral, solo hay cumple o no cumple", () => {
  const noWarning: TargetShape = { ...higher, warningValue: null };
  assert(evaluate(noWarning, 92) === "not_met", "sin umbral no debería existir «atención»");
});

check("B7. cada evaluación tiene tono y nombre en español", () => {
  for (const e of EVALUATIONS) {
    assert(EVALUATION_LABEL[e]?.length > 0, `falta la etiqueta de ${e}`);
    assert(EVALUATION_LABEL[e] !== e, `la etiqueta de ${e} es la clave técnica`);
    assert(["ok", "attention", "bad", "neutral"].includes(evaluationTone(e)), `tono de ${e}`);
  }
});

// ---------------------------------------------------------------------------
console.log("\nC · Tendencia consciente de la dirección");
// ---------------------------------------------------------------------------

const serie = (values: (number | null)[]): SeriesPoint[] =>
  values.map((v, i) => ({
    periodStart: `2026-0${i + 1}-01`,
    value: v,
    dataState: v === null ? "no_data" : "reported",
  }));

check("C1. subir mejora donde más es mejor", () => {
  assert(computeTrend(serie([90, 93, 96]), "higher_is_better") === "improving", "90→93→96");
  assert(computeTrend(serie([96, 93, 90]), "higher_is_better") === "declining", "96→93→90");
});

check("C2. BAJAR mejora donde menos es mejor (§56)", () => {
  // La comprobación que impide tratar «subió» como sinónimo de «mejoró».
  assert(computeTrend(serie([10, 7, 4]), "lower_is_better") === "improving", "10→7→4 debería mejorar");
  assert(computeTrend(serie([4, 7, 10]), "lower_is_better") === "declining", "4→7→10 debería empeorar");
  // Y la misma serie da resultados opuestos según la dirección.
  assert(
    computeTrend(serie([10, 7, 4]), "higher_is_better") === "declining",
    "la misma serie no cambió de lectura al cambiar la dirección"
  );
});

check("C3. en un rango, mejorar es ACERCARSE", () => {
  const target = { targetMin: 18, targetMax: 24, targetValue: null };
  assert(computeTrend(serie([30, 27, 25]), "within_range", target) === "improving",
    "30→27→25 se acerca al rango 18–24");
  assert(computeTrend(serie([25, 27, 30]), "within_range", target) === "declining",
    "25→27→30 se aleja");
  assert(computeTrend(serie([20, 21, 22]), "within_range", target) === "stable",
    "moverse dentro del rango no es mejorar ni empeorar");
});

check("C4. una oscilación pequeña es ESTABLE, no una tendencia", () => {
  assert(computeTrend(serie([90, 90.5, 90.8]), "higher_is_better") === "stable", "90→90,5→90,8");
});

check("C5. con menos de tres datos NO se afirma una tendencia", () => {
  assert(computeTrend(serie([90]), "higher_is_better") === "insufficient_data", "un punto");
  assert(computeTrend(serie([90, 96]), "higher_is_better") === "insufficient_data", "dos puntos");
  assert(computeTrend([], "higher_is_better") === "insufficient_data", "sin puntos");
});

check("C6. los periodos SIN DATO no cuentan como cero", () => {
  // Si un null se leyera como 0, esta serie parecería un desplome.
  assert(computeTrend(serie([90, null, 93, 96]), "higher_is_better") === "improving",
    "un hueco convirtió una mejora en otra cosa");
  assert(computeTrend(serie([90, null, null]), "higher_is_better") === "insufficient_data",
    "dos huecos deberían dejar información insuficiente");
});

check("C7. cada tendencia tiene nombre en español", () => {
  for (const t of TRENDS) {
    assert(TREND_LABEL[t]?.length > 0, `falta la etiqueta de ${t}`);
    assert(TREND_LABEL[t] !== t, `la etiqueta de ${t} es la clave técnica`);
  }
});

// ---------------------------------------------------------------------------
console.log("\nD · Forma de la meta y de la fórmula");
// ---------------------------------------------------------------------------

check("D1. un rango necesita sus dos extremos", () => {
  assert(validateTargetShape({ ...range, targetMax: null }).error !== null, "medio rango se aceptó");
  assert(validateTargetShape(range).error === null, "un rango completo se rechazó");
});

check("D2. una meta simple no lleva extremos de rango", () => {
  assert(validateTargetShape({ ...higher, targetMin: 1 }).error !== null,
    "una meta simple aceptó un mínimo de rango");
});

check("D3. el umbral va al lado correcto de la meta", () => {
  assert(validateTargetShape({ ...higher, warningValue: 99 }).error !== null,
    "en «más es mejor» el umbral no puede estar por encima de la meta");
  assert(validateTargetShape({ ...lower, warningValue: 1 }).error !== null,
    "en «menos es mejor» el umbral no puede estar por debajo de la meta");
  assert(validateTargetShape(higher).error === null && validateTargetShape(lower).error === null,
    "los casos correctos se rechazaron");
});

check("D4. no hay umbral sin meta", () => {
  const orphan: TargetShape = { ...higher, targetValue: null, warningValue: 90 };
  assert(validateTargetShape(orphan).error !== null, "se aceptó un umbral huérfano");
});

check("D5. la meta se describe como la diría una persona", () => {
  assert(describeTarget(higher) === "≥ 95 %", describeTarget(higher));
  assert(describeTarget(lower) === "≤ 3", describeTarget(lower));
  assert(describeTarget(range) === "entre 18 °C y 24 °C", describeTarget(range));
  assert(describeTarget({ ...higher, targetValue: null }) === "Sin meta", "sin meta");
  assert((describeWarning(higher) ?? "").includes("90"), describeWarning(higher) ?? "");
  assert(describeWarning({ ...higher, warningValue: null }) === null, "sin umbral debería ser nulo");
});

check("D6. la fórmula es un conjunto CERRADO, no un lenguaje", () => {
  const good = {
    operation: "ratio_percent" as const,
    operands: [{ key: "a", label: "Conformes" }, { key: "b", label: "Totales" }],
  };
  assert(validateCalcDefinition(good).error === null, "una fórmula válida se rechazó");
  assert(
    validateCalcDefinition({ ...good, operands: [good.operands[0]] }).error !== null,
    "una razón con un solo componente se aceptó"
  );
  assert(
    validateCalcDefinition({ ...good, operands: [good.operands[0], good.operands[0]] }).error !== null,
    "se aceptó una fórmula con el componente repetido"
  );
  assert(
    validateCalcDefinition({ operation: "eval" as never, operands: [] }).error !== null,
    "se aceptó una operación inventada"
  );
});

check("D7. el cálculo es el esperado, y dividir entre cero se niega", () => {
  const calc = {
    operation: "ratio_percent" as const,
    operands: [{ key: "a", label: "Conformes" }, { key: "b", label: "Totales" }],
  };
  assert(computeCalculated(calc, { a: 480, b: 500 }).value === 96, "480/500×100");
  assert(computeCalculated(calc, { a: 1, b: 0 }).error !== null, "se dividió entre cero");
  assert(computeCalculated(calc, { a: 1 }).error !== null, "faltaba un componente y no se avisó");
  assert(
    computeCalculated({ operation: "sum", operands: [{ key: "a", label: "A" }, { key: "b", label: "B" }] },
      { a: 2, b: 3 }).value === 5,
    "suma"
  );
  assert(describeFormula(calc) === "Conformes ÷ Totales × 100", describeFormula(calc));
});

// ---------------------------------------------------------------------------
console.log("\nE · Unidades");
// ---------------------------------------------------------------------------

check("E1. las unidades del encargo están todas", () => {
  for (const needed of ["percent", "units", "cop", "usd", "days", "hours", "minutes",
                        "kg", "ton", "kwh", "index", "count", "ratio", "custom"]) {
    assert((UNIT_CODES as readonly string[]).includes(needed), `falta la unidad ${needed}`);
  }
  for (const u of UNIT_CODES) assert(UNIT_LABEL[u]?.length > 0, `falta la etiqueta de ${u}`);
});

check("E3. la base escribe los números como los lee un hispanohablante", () => {
  // La explicación de la evaluación acaba junto al valor que formatea la
  // aplicación. Verlo escrito «66.67» al lado de «66,67 %» hace dudar de si
  // son el mismo dato.
  assert(SQL.includes("quality_fmt_number"), "la base no unifica el formato numérico");
  assert(!/to_char\(p_(target|warning), 'FM/.test(SQL), "quedó un formato numérico sin unificar");
  assert(SQL.includes("'.', ','"), "el ayudante no cambia el punto por la coma");
  // Y el dominio hace lo mismo del lado de la aplicación.
  assert(formatValue(66.67, "percent") === "66,67 %", formatValue(66.67, "percent"));
});

check("E2. la unidad es presentación: no transforma el valor", () => {
  assert(formatValue(96, "percent") === "96 %", formatValue(96, "percent"));
  assert(formatValue(96, "days") === "96 días", formatValue(96, "days"));
  assert(formatValue(1500000, "cop") === "$ 1.500.000", formatValue(1500000, "cop"));
  assert(formatValue(21, "celsius") === "21 °C", formatValue(21, "celsius"));
  assert(formatValue(7, "custom", "reclamos") === "7 reclamos", formatValue(7, "custom", "reclamos"));
  // Los decimales solo aparecen cuando existen.
  assert(formatValue(96.5, "percent") === "96,5 %", formatValue(96.5, "percent"));
  assert(formatValue(96.0, "percent") === "96 %", formatValue(96.0, "percent"));
});

// ---------------------------------------------------------------------------
console.log("\nF · Fuentes automáticas");
// ---------------------------------------------------------------------------

check("F1. el catálogo del dominio y el de la BASE dicen lo mismo", () => {
  // Si divergieran, se podría configurar un indicador que después no supiera
  // calcularse — o quedaría una fuente en la base que nadie puede elegir.
  const inSql = [...NATIVE_SQL.matchAll(/'(quality\.[a-z_]+)'/g)].map((m) => m[1]);
  const declared = [...new Set(inSql)].sort();
  const domain = [...NATIVE_SOURCE_KEYS].sort();
  assert(
    JSON.stringify(declared) === JSON.stringify(domain),
    `base: ${declared.join(", ")} · dominio: ${domain.join(", ")}`
  );
  // Y cada una aparece DOS veces en el SQL: en el catálogo de claves y en el
  // CASE que la calcula. Una sola aparición delataría una fuente sin cálculo.
  for (const key of domain) {
    const times = inSql.filter((k) => k === key).length;
    assert(times === 2, `«${key}» aparece ${times} veces en la definición vigente; se esperaban 2`);
  }
});

check("F2. cada fuente se explica, y declara si es instantánea o del periodo", () => {
  for (const s of NATIVE_SOURCES) {
    assert(s.label.length > 0 && s.description.length > 20, `${s.key} sin explicación suficiente`);
    assert(["snapshot", "period"].includes(s.nature), `${s.key} sin naturaleza declarada`);
    assert(!s.description.includes("_"), `la explicación de ${s.key} filtra jerga técnica`);
  }
  assert(nativeSource("quality.documents_effective_ratio")?.nature === "snapshot", "naturaleza");
  assert(nativeSource("quality.document_approval_lead_time_days")?.nature === "period", "naturaleza");
  assert(nativeSource("no.existe") === null, "una clave inventada devolvió algo");
});

check("F3. las fuentes salen de datos que Quality YA tiene", () => {
  // No se inventan fuentes de dominios que aún no existen.
  for (const key of NATIVE_SOURCE_KEYS) {
    assert(key.startsWith("quality."), `${key} no pertenece al dominio Quality`);
  }
  const block = SQL.slice(SQL.indexOf("function public.quality_native_source_value"));
  for (const table of ["trazadoc_documents", "quality_processes", "work_tasks"]) {
    assert(block.includes(table), `el catálogo no usa ${table}, que ya existe`);
  }
});

// ---------------------------------------------------------------------------
console.log("\nG · Permisos");
// ---------------------------------------------------------------------------

check("G1. definir es gobierno; medir es trabajo operativo", () => {
  assert(canManageObjectives("admin") && canManageObjectives("quality"), "admin/quality definen");
  assert(!canManageObjectives("consultant"), "un consultor no define objetivos");
  assert(canRecordMeasurement("consultant"), "un consultor sí registra mediciones");
  assert(canClosePeriod("quality") && !canClosePeriod("consultant"), "cerrar periodo");
  assert(canReopenPeriod("admin") && !canReopenPeriod("quality"),
    "reabrir un ciclo cerrado es solo del administrador");
});

// ---------------------------------------------------------------------------
console.log("\nM · Migración 0117");
// ---------------------------------------------------------------------------

check("M1. es append-only y no toca lo anterior", () => {
  assert(!/drop\s+table\s+(?!if\s+exists\s+public\.quality_)/i.test(SQL), "0117 elimina una tabla ajena");
  assert(!/delete\s+from\s+public\./i.test(SQL), "0117 borra filas existentes");
  // 0116 sigue intacta.
  const prev = read("supabase/migrations/0116_document_control_revisions_workflow_and_tasks.sql");
  assert(prev.includes("create table public.work_tasks"), "0116 fue modificada");
});

check("M2. toda tabla nueva es tenant-owned, con RLS y FK compuesta", () => {
  for (const table of [
    "quality_objectives", "quality_objective_processes", "quality_objective_indicators",
    "quality_indicators", "quality_indicator_configs", "quality_measurements",
    "quality_measurement_evidence", "quality_calculation_runs", "quality_period_closures",
    "work_events",
  ]) {
    assert(new RegExp(`create table public\\.${table}`).test(SQL), `falta ${table}`);
    assert(new RegExp(`alter table public\\.${table} enable row level security`).test(SQL),
      `${table} sin RLS`);
  }
  assert(
    (SQL.match(/foreign key \(organization_id,/g) ?? []).length >= 14,
    "faltan FK compuestas que aten cada hija a la empresa de su padre"
  );
});

check("M3. la CONFIGURACIÓN es versionada y con vigencia (OI-06, OI-07)", () => {
  assert(/create table public\.quality_indicator_configs/.test(SQL), "falta la tabla de configuración");
  assert(/effective_from\s+date not null/.test(SQL), "la configuración no tiene vigencia");
  assert(/quality_indicator_configs_single_current/.test(SQL),
    "nada impide dos configuraciones vigentes a la vez");
  assert(SQL.includes("protect_quality_indicator_config_immutability"),
    "una configuración sustituida se puede editar");
  assert(SQL.includes("Una configuración que ya no está vigente no se modifica"),
    "sin mensaje que explique la regla");
});

check("M4. la MEDICIÓN preserva la meta aplicable y el linaje (OI-07, OI-10)", () => {
  const block = SQL.slice(
    SQL.indexOf("create table public.quality_measurements"),
    SQL.indexOf("create index quality_measurements_indicator_period_idx")
  );
  assert(/config_id\s+uuid not null/.test(block), "la medición no apunta a su configuración");
  assert(block.includes("period_start") && block.includes("period_end"),
    "la medición no tiene periodo explícito");
  assert(block.includes("calculation_run_id"), "sin enlace a la ejecución del cálculo");
  assert(block.includes("source_detail"), "sin linaje de la fuente");
});

check("M5. cero ≠ sin dato lo exige la BASE, no la aplicación (OI-21)", () => {
  assert(/quality_measurements_value_consistent check/.test(SQL),
    "nada impide un NULL disfrazado de cero");
  assert(SQL.includes("data_state = 'reported' and value is not null"), "la restricción cambió de forma");
});

check("M6. corregir NO sobrescribe (OI-09, OI-28)", () => {
  assert(SQL.includes("corrects_measurement_id"), "sin enlace a la medición corregida");
  assert(SQL.includes("superseded_by_measurement_id"), "sin marca de sustitución");
  assert(/quality_measurements_correction_reason check/.test(SQL),
    "corregir no exige motivo");
  assert(SQL.includes("protect_quality_measurement_immutability"),
    "una medición registrada se puede reescribir");
});

check("M7. el motor de medición no concede escritura por política", () => {
  for (const table of [
    "quality_indicator_configs", "quality_measurements",
    "quality_calculation_runs", "quality_period_closures", "work_events",
  ]) {
    assert(!new RegExp(`create policy [a-z_]+ on public\\.${table}\\s+for insert`).test(SQL),
      `${table} concede INSERT directo: se podría fabricar un dato`);
  }
  assert(!/create policy [a-z_]+ on public\.work_events\s+for (update|delete)/.test(SQL),
    "los eventos admiten modificación: dejarían de ser inmutables (AT-03)");
});

check("M8. el catálogo automático está acotado por empresa", () => {
  const start = NATIVE_SQL.indexOf("function public.quality_native_source_value");
  const end = NATIVE_SQL.indexOf("revoke all on function public.quality_native_source_value");
  const block = NATIVE_SQL.slice(start, end > start ? end : undefined);
  const branches = (block.match(/when 'quality\./g) ?? []).length;
  const scoped = (block.match(/p_organization_id/g) ?? []).length;
  assert(branches === NATIVE_SOURCES.length, `${branches} ramas para ${NATIVE_SOURCES.length} fuentes`);
  // Cada rama filtra por empresa al menos una vez, más el parámetro de firma.
  assert(scoped >= branches, `solo ${scoped} usos de organization_id para ${branches} fuentes`);
  assert(!/execute\s+format|execute\s+p_/i.test(block), "el catálogo ejecuta SQL dinámico");
});

check("M9. el cierre de periodo congela y reabrir exige motivo (OI-12, OI-27)", () => {
  assert(SQL.includes("quality_period_is_closed"), "falta la comprobación de periodo cerrado");
  assert(SQL.includes("Ese periodo está cerrado"), "sin mensaje al escribir en un periodo cerrado");
  assert(/quality_period_closures_reopen_reason check/.test(SQL), "reabrir no exige motivo");
  assert(SQL.includes("result_state = 'closed'"), "cerrar no marca los resultados");
});

check("M10. quedar bajo la meta produce un EVENTO, nunca una no conformidad (OI-13)", () => {
  assert(SQL.includes("'indicator.target_missed'"), "falta el evento de meta incumplida");
  assert(!/no_?conformidad|nonconformity|nc_/i.test(SQL),
    "0117 menciona no conformidades: OI-13 lo prohíbe explícitamente");
  assert(SQL.includes("create table public.work_events"), "falta la tabla de eventos");
});

check("M11. la bandeja de QUALITY-02 se AMPLÍA, no se duplica", () => {
  assert(!/create table public\.(indicator|objective)_alerts/i.test(SQL),
    "se creó un sistema de alertas paralelo");
  assert(/alter table public\.work_tasks drop constraint if exists work_tasks_type_check/.test(SQL),
    "no se amplía el enumerado de tareas");
  assert(SQL.includes("'indicator_measurement_due'"), "falta el tipo de tarea de medición pendiente");
});

check("M12. privilegios explícitos y anon sin nada", () => {
  assert(/revoke truncate, references, trigger on table/.test(SQL),
    "no se retira TRUNCATE, que bypasea la RLS");
  assert(/revoke all on table[\s\S]*?from anon;/.test(SQL), "anon conserva privilegios");
  assert(!/alter default privileges/i.test(SQL), "se usó ALTER DEFAULT PRIVILEGES");
  assert(!/grant all on/i.test(SQL), "hay un GRANT ALL");
});

check("M13. las vistas heredan la RLS", () => {
  for (const view of ["v_quality_indicator_status", "v_quality_objective_performance"]) {
    const at = SQL.indexOf(`create view public.${view}`);
    assert(at > 0, `falta la vista ${view}`);
    assert(SQL.slice(at, at + 120).includes("security_invoker = true"),
      `${view} no hereda la RLS: sería una fuga entre empresas`);
  }
});

check("M14. la migración explica el porqué y ancla sus decisiones", () => {
  const comments = read(MIG).split("\n").filter((l) => l.trim().startsWith("--"));
  assert(comments.length > 200, `solo ${comments.length} líneas de comentario para 0117`);
  const text = comments.join("\n");
  for (const decision of ["OI-01", "OI-03", "OI-05", "OI-06", "OI-07", "OI-08", "OI-10",
                          "OI-13", "OI-16", "OI-21", "OI-22", "OI-26", "OI-31", "AT-02", "MDR-33"]) {
    assert(text.includes(decision), `la migración no ancla la decisión ${decision}`);
  }
});

check("M15. el motor de medición es de SOLO LECTURA también donde el entorno concede de más", () => {
  // Conceder SELECT no retira lo que el entorno ya concedió. En un proyecto
  // remoto de Supabase los privilegios por defecto dan arwdDxtm sobre cada
  // tabla nueva; en local solo Dxtm. Por eso 0117 §21 parecía correcta aquí y
  // en Staging dejaba a `authenticated` con UPDATE y DELETE sobre las
  // mediciones y los eventos: la RLS los filtraba a cero filas, que NO es lo
  // mismo que denegarlos. Lo cazó la validación contra Staging; 0118 lo revoca.
  //
  // Esta prueba existe para que la próxima tabla de solo lectura no repita el
  // olvido sin que nadie se entere hasta el despliegue.
  const sql = stripSql(read(MIG_PRIV));
  const readOnly = ["quality_indicator_configs", "quality_measurements",
                    "quality_calculation_runs", "quality_period_closures", "work_events"];
  const revoked = sql.match(/revoke insert, update, delete, truncate, references, trigger[\s\S]*?from authenticated/);
  assert(revoked !== null, "0118 debe revocar el DML que concede el entorno");
  for (const table of readOnly) {
    assert(revoked![0].includes(table), `${table} sigue con el DML del entorno`);
  }
  // La evidencia es el caso mixto: se adjunta y se quita, pero nunca se reescribe.
  assert(/revoke update, truncate, references, trigger[\s\S]*?quality_measurement_evidence[\s\S]*?from authenticated/.test(sql),
    "la evidencia no puede ser reescribible");
  assert(/revoke all on table[\s\S]*?from anon/.test(sql), "anon no puede conservar nada");
  // Anclado a inicio de sentencia: la palabra «UPDATE» aparece legítimamente
  // dentro de un `comment on table`, y buscarla como subcadena convertiría la
  // prueba en un detector de prosa.
  assert(!/^\s*(create|alter|drop|insert|update|delete)\b/im.test(sql),
    "0118 solo revoca y comenta: no crea, no altera y no toca datos");
});

// ---------------------------------------------------------------------------
console.log("\nN · Coherencia entre capas");
// ---------------------------------------------------------------------------

function enumFromSql(constraint: string, column: string): string[] {
  const re = new RegExp(`${constraint}[\\s\\S]{0,80}?${column} in \\(([\\s\\S]*?)\\)`);
  const m = SQL.match(re);
  assert(m, `no se encontró la restricción ${constraint}`);
  return [...m![1].matchAll(/'([a-z_.]+)'/g)].map((x) => x[1]).sort();
}

check("N1. los enumerados del dominio y los de la base coinciden", () => {
  const pairs: [string, string, readonly string[]][] = [
    ["quality_objectives_admin_state_check", "admin_state", OBJECTIVE_ADMIN_STATES],
    ["quality_indicators_admin_state_check", "admin_state", INDICATOR_ADMIN_STATES],
    ["quality_indicators_scope_type_check", "scope_type", SCOPE_TYPES],
    ["quality_indicator_configs_direction_check", "direction", DIRECTIONS],
    ["quality_indicator_configs_frequency_check", "frequency", FREQUENCIES],
    ["quality_indicator_configs_source_kind_check", "source_kind", SOURCE_KINDS],
    ["quality_measurements_data_state_check", "data_state", DATA_STATES],
    ["quality_measurements_evaluation_check", "evaluation", EVALUATIONS],
    ["quality_objectives_evaluation_rule_check", "evaluation_rule", OBJECTIVE_RULES],
  ];
  for (const [constraint, column, domain] of pairs) {
    const inDb = enumFromSql(constraint, column);
    const inDomain = [...domain].sort();
    assert(
      JSON.stringify(inDb) === JSON.stringify(inDomain),
      `${constraint} → base: ${inDb.join(",")} · dominio: ${inDomain.join(",")}`
    );
  }
});

check("N2. las dos reglas del objetivo están implementadas y explicadas (OI-18)", () => {
  for (const rule of OBJECTIVE_RULES) {
    assert(OBJECTIVE_RULE_LABEL[rule]?.length > 0, `falta la etiqueta de ${rule}`);
    assert(OBJECTIVE_RULE_HELP[rule]?.length > 40, `la regla ${rule} no se explica`);
    assert(SQL.includes(`'${rule}'`), `la base no conoce la regla ${rule}`);
  }
  // OI no define ponderación: no debe existir ni el campo ni el concepto.
  assert(!/weight|ponderaci[oó]n\s*[:=]/i.test(SQL),
    "se inventó una ponderación que OI no define");
  const view = SQL.slice(SQL.indexOf("as performance,") - 900, SQL.indexOf("as performance,"));
  assert(view.includes("majority_comply") && view.includes("worst_indicator"),
    "la vista no implementa las dos reglas");
  assert(SQL.includes("performance_explanation"), "el desempeño del objetivo no se explica");
});

check("N3. la evaluación del dominio y la de la base siguen la misma regla", () => {
  // No se puede ejecutar el SQL desde aquí, pero sí exigir que la función de la
  // base contemple exactamente las mismas ramas y salidas que el dominio.
  const fn = SQL.slice(
    SQL.indexOf("function public.quality_evaluate_value"),
    SQL.indexOf("revoke all on function public.quality_evaluate_value")
  );
  for (const direction of DIRECTIONS) {
    assert(fn.includes(`'${direction}'`) || fn.includes(`when ${direction}`),
      `la base no contempla la dirección ${direction}`);
  }
  for (const evaluation of EVALUATIONS) {
    assert(fn.includes(`'${evaluation}'`), `la base no puede devolver ${evaluation}`);
  }
  assert(fn.includes("not_applicable"), "la base no distingue «no aplica»");
});

check("N4. las server actions no envían resultados ni evaluaciones", () => {
  const actions = read("server/actions/quality-indicators.ts");
  assert(!/p_evaluation|evaluation:/.test(actions),
    "una server action envía la evaluación: debe derivarla la base");
  assert(!/p_value:\s*[^n]/.test(actions.slice(actions.indexOf("runIndicatorCalculation"))),
    "el cálculo automático envía un valor desde el cliente");
  const dbLayer = read("lib/db/quality-indicators.ts");
  assert(!/from\("quality_measurements"\)[\s\S]{0,200}\.insert\(/.test(dbLayer),
    "la capa de datos inserta mediciones directamente");
  assert(!/from\("quality_indicator_configs"\)[\s\S]{0,200}\.insert\(/.test(dbLayer),
    "la capa de datos inserta configuraciones directamente");
});

check("N5. la pantalla nunca decide la evaluación", () => {
  const detail = read("components/domain/quality/indicator-detail.tsx");
  assert(!/name="evaluation"/.test(detail), "el formulario permite elegir la evaluación");
  assert(detail.includes("evaluationExplanation"), "la pantalla no muestra la explicación de la base");
  const view = read("components/domain/quality/indicators-view.tsx");
  assert(!/name="evaluation"/.test(view), "la lista permite elegir la evaluación");
});

check("N6. la gráfica no dibuja los huecos como cero", () => {
  const chart = read("components/domain/quality/indicator-chart.tsx");
  assert(chart.includes("p.value === null"), "la gráfica no distingue los periodos sin dato");
  assert(chart.includes("role=\"img\"") && chart.includes("aria-label"),
    "la gráfica no es accesible");
  assert(chart.includes("no se dibujan como cero"), "no se explica el tratamiento de los huecos");
});

console.log(`\nQUALITY-03 · puras y estáticas: ${passed} correctas, ${failed} fallidas\n`);
process.exit(failed === 0 ? 0 : 1);
