/**
 * Trazaloop · P4 final · La ÚNICA definición de «lote producido completo».
 *
 * POR QUÉ ESTE ARCHIVO EXISTE
 *
 * Porque había dos, y las dos estaban en pantalla al mismo tiempo. Un lote
 * podía leerse «Completa» en su ficha y contarse entre los «Incompletos» del
 * tablero, y su dossier decía «Defendible» y «Trazabilidad incompleta» en el
 * mismo recuadro. No eran dos errores: era una definición legado que seguía
 * gobernando algunas superficies y otra vigente que gobernaba el resto.
 *
 * La legado es `v_output_batch_completeness` (migración 0104), que exige
 * composición manual. La composición dejó de ser un concepto operativo: no se
 * escribe por ninguna ruta, no entra en el cálculo y no se enseña. Un lote al
 * que solo «le falta» eso no le falta nada.
 *
 * La vista NO se toca. Es histórica, hay que poder reproducir lo que decía, y
 * la reescriben migraciones que ya se aplicaron. Lo que se hace es
 * normalizarla en el ÚNICO punto por el que sus filas entran a la aplicación,
 * y comprobar con una regresión que ninguna superficie se salta ese punto.
 *
 *
 * QUÉ CUENTA Y QUÉ NO
 *
 * Cuenta lo que rompe la reconstrucción real del lote: que no haya orden, que
 * no haya consumos, que la cadena hacia atrás no llegue al proveedor o al
 * material. Eso lo decide la vista y no se discute aquí.
 *
 * No cuenta la ausencia de composición manual. Y no cuenta la ausencia de
 * producto: `product_id` es opcional, no participa en el numerador ni en el
 * denominador y no bloquea nada — sale en el dossier como dato, no como
 * carencia.
 *
 * NO se inventan requisitos nuevos. Este módulo solo QUITA uno.
 */

import { normalizeVisibleTexts } from "@/lib/domain/nomenclature";

/**
 * Elementos de `missing_items` que pertenecen SOLO a la metodología retirada.
 *
 * Se comparan en su denominación OFICIAL: la lista se pasa por
 * `normalizeVisibleTexts` antes de comparar, porque la vista emite todavía la
 * histórica. Duplicar ese vocabulario aquí crearía una segunda copia lista
 * para desincronizarse, que es justo lo que RH-01 prohíbe.
 */
export const RETIRED_MISSING_ITEMS = ["composición del lote"] as const;

export type TraceabilityStatus = "incomplete" | "complete_with_warnings" | "complete";

export type OutputBatchReadiness = {
  status: TraceabilityStatus;
  /** Lo que falta DE VERDAD, ya normalizado y listo para enseñar. */
  missing: string[];
  /** Advertencia de balance de la vista, si sigue teniendo sentido. */
  massBalanceWarning: boolean;
};

/** Lo que falta, una vez retirado lo que solo interesaba a la metodología antigua. */
export function operativeMissing(missingItems: readonly string[]): string[] {
  const normalizados = normalizeVisibleTexts([...missingItems]);
  return normalizados.filter((m) => !(RETIRED_MISSING_ITEMS as readonly string[]).includes(m));
}

/**
 * El estado de trazabilidad de un lote producido. LA primitiva.
 *
 * La derivación es fiel a la propia vista: su `traceability_status` vale
 * `incomplete` exactamente cuando alguno de sus elementos falta, así que si al
 * retirar la composición no queda ninguno, el lote no está incompleto.
 *
 * Y la advertencia de balance de la vista compara el consumo CONTRA la masa de
 * composición: sin composición ese término es nulo y la advertencia no puede
 * dispararse. Se conserva la rama por fidelidad —si una base antigua tiene
 * composición, su advertencia sigue valiendo— pero no puede nacer una nueva.
 */
export function outputBatchReadiness(row: {
  traceability_status?: string | null;
  missing_items?: readonly string[] | null;
  mass_balance_warning?: boolean | null;
}): OutputBatchReadiness {
  const missing = operativeMissing(row.missing_items ?? []);
  const warning = Boolean(row.mass_balance_warning);
  if (missing.length > 0) {
    return { status: "incomplete", missing, massBalanceWarning: warning };
  }
  if (warning) return { status: "complete_with_warnings", missing, massBalanceWarning: true };
  // Si la vista decía `incomplete` y lo único que faltaba era la composición,
  // el lote está completo. Si decía otra cosa, se respeta.
  const previo = row.traceability_status;
  if (previo === "complete_with_warnings") {
    return { status: "complete_with_warnings", missing, massBalanceWarning: warning };
  }
  return { status: "complete", missing, massBalanceWarning: warning };
}

/** Atajo para quien solo necesita el estado. */
export function operativeStatus(
  status: string | null | undefined,
  missingItems: readonly string[]
): TraceabilityStatus {
  return outputBatchReadiness({ traceability_status: status, missing_items: missingItems }).status;
}

export const READINESS_RULE_TEXT =
  "Un lote producido / lote final está completo cuando tiene orden, consumos y " +
  "la información de proveedor y material de sus entradas.";

export const OUTPUT_BATCH_HINT =
  "Producto terminado, derivado de su orden y de los consumos trazados.";
