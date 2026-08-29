/**
 * Trazaloop · PT-02A · El estado operativo de un lote producido.
 *
 * LA DECISIÓN QUE ESTE MÓDULO IMPLEMENTA
 *
 * v2 es la ÚNICA metodología operativa. v1 queda como histórico interno:
 * su esquema, sus filas, sus snapshots y sus cálculos se conservan intactos
 * y siguen siendo reproducibles, pero deja de ser una opción de cálculo, un
 * requisito de completitud y un formulario activo.
 *
 *
 * LO QUE DEJA DE EXISTIR
 *
 *     ausencia de batch_composition  →  «trazabilidad incompleta»
 *
 * Esa regla la escribía `v_output_batch_completeness` (migración 0104), muy
 * anterior a v2. La vista NO se toca —v1 la necesita, y 0104 es histórica—
 * pero deja de gobernar el estado operativo: aquí se le retira ese elemento
 * antes de que llegue a ninguna pantalla.
 *
 *
 * DOS PREGUNTAS QUE NO SON LA MISMA
 *
 *     CALCULABILIDAD   ¿sale el número?      calculated | incomplete
 *     DEFENDIBILIDAD   ¿está sustentado?     defensible | with_warnings | preliminary
 *
 * Mezclarlas es lo que producía «Trazabilidad incompleta» sobre un lote que
 * calculaba perfectamente. Un 60 % puede ser calculable y poco defendible; lo
 * que no puede es aparecer como incalculable por un dato que nadie usa.
 *
 * Ninguno de los dos vocabularios se inventa: `result_state` y
 * `defensibility_level` ya existen en `recycled_content_calculations`.
 */

// ===========================================================================
// 1 · LO QUE YA NO CUENTA COMO CARENCIA OPERATIVA
// ===========================================================================

/**
 * Elementos de `missing_items` que pertenecen SOLO a la metodología histórica.
 *
 * Se comparan en su denominación OFICIAL: la lista debe venir pasada por
 * `normalizeVisibleTexts` (lib/domain/nomenclature.ts). La vista emite todavía
 * la histórica, y duplicar ese vocabulario aquí crearía una segunda copia
 * lista para desincronizarse — que es justo lo que RH-01 prohíbe.
 */
export const V1_ONLY_MISSING = ["composición del lote"] as const;

/** Lo que falta DE VERDAD, una vez retirado lo que solo interesaba a v1. */
export function operativeMissing(missingItems: readonly string[]): string[] {
  return missingItems.filter((m) => !(V1_ONLY_MISSING as readonly string[]).includes(m));
}

export type TraceabilityStatus = "incomplete" | "complete_with_warnings" | "complete";

/**
 * El estado de trazabilidad SIN la exigencia de composición.
 *
 * La derivación es fiel a la propia vista: su `traceability_status` vale
 * `incomplete` exactamente cuando alguno de los cinco elementos falta, así que
 * si al retirar la composición no queda ninguno, el lote no está incompleto.
 * Y las advertencias de balance que la vista calcula comparan CONTRA la masa
 * de composición: sin composición no pueden dispararse.
 */
export function operativeStatus(
  status: string,
  missingItems: readonly string[]
): TraceabilityStatus {
  const restante = operativeMissing(missingItems);
  if (restante.length > 0) return "incomplete";
  if (status === "incomplete") return "complete";
  return (status as TraceabilityStatus) ?? "complete";
}

// ===========================================================================
// 2 · CALCULABILIDAD
// ===========================================================================

export type CalculationState = "no_calculation" | "incomplete" | "calculated";

export const CALCULATION_STATE_LABEL: Record<CalculationState, string> = {
  no_calculation: "Sin cálculo",
  incomplete: "Cálculo incompleto",
  calculated: "Calculado",
};

/** El estado a partir de la última fila de cálculo, si la hay. */
export function calculationState(
  latest: { result_state?: string | null } | null | undefined
): CalculationState {
  if (!latest) return "no_calculation";
  return latest.result_state === "incomplete" ? "incomplete" : "calculated";
}

/**
 * Cómo se escribe un porcentaje que puede no existir.
 *
 * `null` no es cero. La lista y los tableros hacían `Number(null).toFixed(2)`
 * y enseñaban «0,00 %» sobre un lote cuyo cálculo había salido incompleto:
 * un número inventado, y encima el peor posible de cara a una declaración.
 */
export function formatRecycledPercent(percent: number | null | undefined): string {
  return percent === null || percent === undefined ? "sin resultado" : `${percent.toFixed(2)}%`;
}

// ===========================================================================
// 3 · DEFENDIBILIDAD
// ===========================================================================

export type Defensibility = "preliminary" | "with_warnings" | "defensible";

/**
 * Cómo se dice el sustento de un número que SÍ existe.
 *
 * «Sustento incompleto» y no «trazabilidad incompleta»: el número está, lo que
 * flojea es lo que lo respalda. Confundir las dos frases es lo que hacía que
 * un cálculo correcto pareciera un fallo.
 */
export const DEFENSIBILITY_LABEL: Record<Defensibility, string> = {
  defensible: "Defendible",
  with_warnings: "Defendible con advertencias",
  preliminary: "Sustento incompleto",
};

export const DEFENSIBILITY_HELP: Record<Defensibility, string> = {
  defensible: "El cálculo se apoya en consumos trazados y soportes aplicables.",
  with_warnings: "El número está calculado, pero hay avisos que conviene revisar.",
  preliminary: "El número está calculado, pero el respaldo todavía no es suficiente para defenderlo.",
};

// ===========================================================================
// 4 · LO QUE SE PUEDE SABER ANTES DE CALCULAR
// ===========================================================================

/**
 * Impedimentos ESTRUCTURALES, los únicos que se pueden afirmar sin ejecutar el
 * cálculo.
 *
 * No se replican aquí las reglas de φ ni de evidencia: eso lo decide el motor,
 * y una segunda implementación acabaría discrepando de la primera. Lo que
 * falte por esos motivos lo dirá `incomplete_reasons` cuando se calcule, con
 * el código del lote concreto.
 */
export function structuralBlockers(input: {
  hasOrder: boolean;
  hasConsumption: boolean;
  outputBatchesInOrder: number;
}): string[] {
  const out: string[] = [];
  if (!input.hasOrder) out.push("La orden / corrida de producción no está registrada.");
  else if (!input.hasConsumption)
    out.push(
      "La orden / corrida de producción no tiene consumos registrados: " +
      "no hay de dónde salir el cálculo."
    );
  if (input.outputBatchesInOrder > 1)
    out.push(
      "La orden produjo varios lotes finales y no se registra qué consumo fue a cada uno: " +
      "no se puede repartir la mezcla sin inventarla."
    );
  return out;
}

// ===========================================================================
// 5 · LO QUE SE RETIRÓ, DICHO PARA QUIEN LO BUSQUE
// ===========================================================================

export const COMPOSITION_RETIRED_NOTE =
  "La composición del lote ya no se registra a mano: el contenido reciclado se " +
  "deriva de los consumos trazados de la orden. Las composiciones registradas " +
  "antes se conservan y siguen siendo consultables.";

export const V1_HISTORICAL_ONLY_NOTE =
  "Metodología anterior. Se conserva para consulta y no se puede usar para " +
  "cálculos nuevos.";

export const V1_CALCULATION_BLOCKED =
  "La metodología anterior es solo histórica: no se pueden generar cálculos nuevos con ella.";

export const COMPOSITION_WRITE_BLOCKED =
  "La composición del lote ya no se registra a mano. El contenido reciclado se " +
  "deriva de los consumos de la orden.";

/**
 * Por qué el producto asociado no entra en nada de esto.
 *
 * `products` solo aporta `declared_recycled_percent`, que v2 usa para AVISAR
 * si lo declarado supera a lo calculado. No aparece ni en el numerador ni en
 * el denominador: un lote sin producto calcula igual.
 */
export const PRODUCT_NOT_REQUIRED_FOR_V2 = true;
