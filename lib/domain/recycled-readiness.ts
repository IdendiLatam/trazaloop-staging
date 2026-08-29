/**
 * Trazaloop · PT-02A / 0147 · El estado operativo de un lote producido.
 *
 * LA DECISIÓN QUE ESTE MÓDULO IMPLEMENTA
 *
 * Hay UNA metodología de contenido reciclado. No hay selector, no hay «v1» ni
 * «v2» de cara a quien usa el producto, y no hay una segunda fórmula
 * esperando su turno: 0147 retiró el motor anterior de la base.
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
// 1 · LA PREPARACIÓN DE TRAZABILIDAD VIVE EN OTRO SITIO
// ---------------------------------------------------------------------------
// P4 final · Aquí había una segunda copia de la regla de completitud. Dos
// copias de una regla son dos reglas, y eso fue exactamente el defecto: la
// ficha usaba esta y el tablero usaba la de la base. La definición canónica
// está ahora en `lib/domain/output-batch-readiness.ts`, y este módulo se queda
// con lo suyo: calculabilidad y defendibilidad.
//
// Se reexportan porque hay pruebas y pantallas que las importan de aquí, y
// mover el import no cambia nada salvo el sitio del que se lee.
// ===========================================================================

export {
  operativeMissing,
  operativeStatus,
  RETIRED_MISSING_ITEMS as V1_ONLY_MISSING,
  type TraceabilityStatus,
} from "@/lib/domain/output-batch-readiness";

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
  "Dato histórico. Se conserva para consulta y no interviene en el cálculo.";

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

/**
 * Las dos temporalidades del dossier técnico, dichas en voz alta.
 *
 * Las cifras y los componentes son el SNAPSHOT del cálculo: inmutables, y un
 * recálculo posterior no los toca. La matriz de evidencias y las brechas se
 * leen del estado ACTUAL del lote. Mezclarlas sin avisar es lo que convierte
 * un documento de auditoría en una fuente de discusiones.
 *
 * Para congelar también el contexto existe el expediente de preparación de
 * auditoría, que guarda snapshot y hash.
 */
export const DOSSIER_CURRENT_EVIDENCE_NOTE =
  "Las cifras y los componentes de arriba son el snapshot congelado de este " +
  "cálculo. Esta matriz, en cambio, refleja el estado ACTUAL de las evidencias " +
  "del lote: si una se valida o se archiva después, aquí se ve. Para congelar " +
  "también el contexto, usa el expediente de preparación de auditoría.";
