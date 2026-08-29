/**
 * Trazaloop · PT-02A · Dos preguntas que la interfaz estaba respondiendo como
 * si fueran una.
 *
 * EL DEFECTO QUE ESTE MÓDULO EXISTE PARA CERRAR
 *
 * `v_output_batch_completeness` —de la migración 0104, muy anterior a v2—
 * define UNA sola idea de «trazabilidad completa», y dentro de ella exige
 * `batch_composition`. Dos pantallas la presentaban como el estado del lote:
 *
 *     «Trazabilidad incompleta · Falta: composición del lote»
 *
 * junto al formulario de composición. Para la metodología v1 eso es cierto y
 * sigue siéndolo. Para v2 es falso: v2 deriva el cálculo de los consumos
 * reales y no lee `batch_composition` en ninguna parte (PT-F10).
 *
 * Comprobado antes de escribir esto, sobre un lote sin composición, sin
 * producto asociado y con un consumo de 100 kg al 60 %: v2 devuelve
 * `calculated` con 60 %. El motor nunca estuvo roto; lo que fallaba era que la
 * pantalla le pedía a la persona un dato que el cálculo no usa.
 *
 *
 * LO QUE AQUÍ SE SEPARA
 *
 *     COMPLETITUD v1     lo que la metodología histórica necesita, incluida
 *                        la composición tecleada. NO se toca: v1 sigue viva y
 *                        sus cálculos siguen siendo reproducibles (PT-H03).
 *
 *     CALCULABILIDAD v2  orden y consumos. Nada más. La composición no
 *                        aparece, y su ausencia no puede bloquear nada.
 *
 * La vista de la base no se modifica: sigue diciendo lo que siempre dijo, que
 * es lo correcto para v1. Lo que cambia es que la interfaz deja de tomar esa
 * respuesta por la única.
 */

/**
 * Los elementos que `v_output_batch_completeness.missing_items` puede emitir,
 * EN SU DENOMINACIÓN OFICIAL.
 *
 * Las funciones de aquí esperan la lista ya pasada por
 * `normalizeVisibleTexts` (lib/domain/nomenclature.ts). La vista de la base
 * emite todavía la nomenclatura histórica —«orden de producción»— y el helper
 * central la traduce a la vigente. Comparar contra la histórica habría metido
 * esa cadena en un fichero de dominio, que es justo lo que RH-01 prohíbe: una
 * segunda copia del vocabulario, lista para desincronizarse.
 */
export const V1_ONLY_MISSING = ["composición del lote"] as const;

/**
 * Lo que la metodología v2 necesita de verdad, y por qué solo esto.
 *
 *   orden / corrida       los consumos cuelgan de ella.
 *   consumos de la orden  son el denominador entero.
 *
 * `información de proveedor` no entra: v2 no lee el proveedor en ningún
 * término de la fórmula —lo usaba v1 para graduar la defendibilidad—.
 * `información de material` tampoco hace falta comprobarla aquí:
 * `input_batches.material_id` es NOT NULL desde 0025, así que un consumo sin
 * material no puede existir.
 */
const V2_REQUIERE = ["orden / corrida de producción", "consumos de la orden"] as const;

export type Readiness = {
  /** ¿Puede v2 intentar el cálculo? */
  ready: boolean;
  /** Lo que le falta a v2, si algo. */
  missing: string[];
  /** Lo que le falta SOLO a v1 y que v2 no necesita. */
  v1Only: string[];
};

/**
 * Reparte lo que la vista de completitud dice que falta entre las dos
 * metodologías.
 *
 * Se apoya en la lista que emite la base y no la reinterpreta: si mañana
 * aparece un elemento nuevo, cae del lado de v2 —el conservador— en vez de
 * ignorarse en silencio.
 */
export function splitMissing(missingItems: readonly string[]): Readiness {
  // `missingItems` debe venir de `normalizeVisibleTexts`. Si llegara en crudo,
  // «orden de producción» no coincidiría con ningún requisito y v2 se
  // declararía lista sin estarlo — por eso la comprobación de abajo.
  const v1Only = missingItems.filter((m) =>
    (V1_ONLY_MISSING as readonly string[]).includes(m));
  const paraV2 = missingItems.filter((m) =>
    (V2_REQUIERE as readonly string[]).includes(m));
  return { ready: paraV2.length === 0, missing: paraV2, v1Only };
}

/** ¿Necesita v1 algo que v2 no? Sirve para decidir si hay algo que aclarar. */
export function hasV1OnlyGap(missingItems: readonly string[]): boolean {
  return splitMissing(missingItems).v1Only.length > 0;
}

/** Cómo se dice el estado de v2 en pantalla. */
export function v2ReadinessLabel(r: Readiness): string {
  if (r.ready) return "La metodología v2 puede calcular con lo registrado";
  return `La metodología v2 necesita: ${r.missing.join(", ")}`;
}

/**
 * La aclaración que se enseña cuando v1 pide composición y v2 no.
 *
 * Es el texto que faltaba: sin él, «Falta: composición del lote» en rojo se
 * lee como «no puedes calcular», que es justo lo contrario de lo que ocurre.
 */
export const V1_COMPOSITION_NOTE =
  "La composición del lote la necesita la metodología v1, que es la histórica. " +
  "La v2 no la usa: deriva el cálculo de los consumos registrados en la orden.";

/**
 * Por qué el producto asociado no entra aquí.
 *
 * `products` solo aporta `declared_recycled_percent`, que v2 usa para AVISAR
 * si lo declarado supera a lo calculado. No aparece ni en el numerador ni en
 * el denominador, así que un lote sin producto calcula igual. Se deja escrito
 * para que nadie lo añada como requisito creyendo que falta algo.
 */
export const PRODUCT_NOT_REQUIRED_FOR_V2 = true;
