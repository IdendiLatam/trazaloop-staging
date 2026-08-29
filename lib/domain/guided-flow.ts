/**
 * Trazaloop · Sprint 5B · Lógica PURA del flujo guiado.
 *
 * Esta función es la ESPECIFICACIÓN de las reglas de "siguiente paso" y
 * "readiness". La vista SQL v_output_batch_readiness (0032) implementa
 * exactamente la misma cadena, y el test de integración (test:rls) cruza
 * ambas salidas fila a fila para garantizar que no diverjan.
 *
 * Sin imports de Supabase ni de servidor: testeable con `npm run test:guided`.
 * El flujo guiado NO cambia la metodología de cálculo: solo lee estados.
 */

export type NextStepCode =
  | "create_product_or_link_product"
  | "complete_order"
  | "add_consumption"
  | "add_composition"
  | "add_evidence"
  | "validate_evidence"
  | "calculate"
  | "review_gaps"
  | "open_dossier";

export type ReadinessLevel =
  | "not_ready"
  | "needs_data"
  | "needs_evidence"
  | "ready_to_calculate"
  | "calculated_with_gaps"
  | "calculated_ready";

export type ReadinessFacts = {
  hasProductionOrder: boolean;
  hasConsumption: boolean;
  hasComposition: boolean;
  /** Algún material elegible (no mismo proceso) SIN evidencia de soporte, o
   *  con evidencia rechazada/vencida, o reclasificación sin justificación. */
  anySupportMissing: boolean;
  /** Algún material elegible con evidencia de soporte en estado pendiente. */
  anySupportPending: boolean;
  hasCalculation: boolean;
  latestDefensibilityLevel: "preliminary" | "with_warnings" | "defensible" | null;
  latestRiskFlag: boolean;
};

export type NextStep = {
  code: NextStepCode;
  readiness: ReadinessLevel;
};

/**
 * Cadena de decisión (misma que la vista SQL):
 * orden → consumo → composición → soporte faltante → soporte pendiente →
 * calcular → (con cálculo) brechas o dossier.
 */
export function resolveNextStep(f: ReadinessFacts): NextStep {
  if (!f.hasProductionOrder) {
    return { code: "complete_order", readiness: "not_ready" };
  }
  if (!f.hasConsumption) {
    return { code: "add_consumption", readiness: "needs_data" };
  }
  if (!f.hasComposition) {
    return { code: "add_composition", readiness: "needs_data" };
  }
  if (!f.hasCalculation && f.anySupportMissing) {
    return { code: "add_evidence", readiness: "needs_evidence" };
  }
  if (!f.hasCalculation && f.anySupportPending) {
    return { code: "validate_evidence", readiness: "needs_evidence" };
  }
  if (!f.hasCalculation) {
    return { code: "calculate", readiness: "ready_to_calculate" };
  }
  if (f.latestDefensibilityLevel !== "defensible" || f.latestRiskFlag) {
    return { code: "review_gaps", readiness: "calculated_with_gaps" };
  }
  return { code: "open_dossier", readiness: "calculated_ready" };
}

/**
 * PT-02A · La cadena OPERATIVA, que ya no pasa por la composición.
 *
 * POR QUÉ SON DOS FUNCIONES Y NO UNA MODIFICADA
 *
 * `resolveNextStep` es el espejo exacto de `v_output_batch_readiness`, y el
 * test de integración cruza sus salidas fila a fila. Ese cruce es lo que
 * garantiza que la vista y su especificación no diverjan en silencio, y sigue
 * siendo valioso: la vista no se toca —es histórica y v1 la necesita—, así que
 * su espejo tampoco.
 *
 * Lo que cambia es cuál de las dos gobierna la pantalla. La divergencia es
 * DELIBERADA y está aquí, en una función con nombre propio, en vez de
 * escondida en un `if` de una página: cuando el paso «composición» deja de
 * existir, `add_composition` deja de poder ser la respuesta a «¿qué hago
 * ahora?», porque la respuesta sería teclear datos que ninguna fórmula usa.
 *
 * Y el `readiness` que devolvía `needs_data` por ese motivo pasa a lo que
 * corresponda al siguiente eslabón real de la cadena.
 */
export function operativeNextStep(f: ReadinessFacts): NextStep {
  // Se delega en la cadena canónica declarando que la composición ya está: es
  // la manera de no reescribir aquí las otras seis ramas y que las dos
  // funciones no se separen por descuido.
  return resolveNextStep({ ...f, hasComposition: true });
}

/**
 * El mismo salto, aplicado a una fila que ya trae su veredicto de la base.
 *
 * La vista sigue emitiendo `add_composition`, así que la fila hay que
 * recalcularla; los hechos que necesita la cadena vienen todos en ella.
 */
export function operativeStepFromRow(row: {
  has_production_order: boolean;
  has_consumption: boolean;
  has_missing_required_evidence?: boolean | null;
  has_pending_required_evidence?: boolean | null;
  has_calculation: boolean;
  latest_defensibility_level: "preliminary" | "with_warnings" | "defensible" | null;
  latest_risk_flag: boolean | null;
}): NextStep {
  return operativeNextStep({
    hasProductionOrder: Boolean(row.has_production_order),
    hasConsumption: Boolean(row.has_consumption),
    hasComposition: true,
    anySupportMissing: Boolean(row.has_missing_required_evidence),
    anySupportPending: Boolean(row.has_pending_required_evidence),
    hasCalculation: Boolean(row.has_calculation),
    latestDefensibilityLevel: row.latest_defensibility_level,
    latestRiskFlag: Boolean(row.latest_risk_flag),
  });
}

export const NEXT_STEP_HREF: Record<NextStepCode, string> = {
  create_product_or_link_product: "/traceability/output-batches",
  complete_order: "/traceability/production-orders",
  add_consumption: "/traceability/production-orders",
  add_composition: "/traceability/output-batches",
  add_evidence: "/evidences",
  validate_evidence: "/evidences",
  calculate: "/recycled-content/output-batches",
  review_gaps: "/audit-support",
  open_dossier: "/audit-support",
};

export const NEXT_STEP_LABEL: Record<NextStepCode, string> = {
  create_product_or_link_product: "Asociar producto",
  complete_order: "Completar orden / corrida de producción",
  add_consumption: "Agregar consumo",
  add_composition: "Registrar composición",
  add_evidence: "Cargar evidencia",
  validate_evidence: "Validar evidencia",
  calculate: "Calcular contenido reciclado",
  review_gaps: "Revisar brechas",
  open_dossier: "Ver dossier técnico",
};

export const READINESS_LABEL: Record<ReadinessLevel, string> = {
  not_ready: "No listo",
  needs_data: "Faltan datos",
  needs_evidence: "Faltan evidencias",
  ready_to_calculate: "Listo para calcular",
  calculated_with_gaps: "Calculado con brechas",
  calculated_ready: "Calculado listo",
};

/** Tono visual por nivel (el color nunca es el único indicador: el badge
 *  siempre lleva el texto de READINESS_LABEL). */
export const READINESS_TONE: Record<ReadinessLevel, string> = {
  not_ready: "border-danger/30 bg-danger/5 text-danger",
  needs_data: "border-danger/30 bg-danger/5 text-danger",
  needs_evidence: "border-amber/40 bg-amber/10 text-amber",
  ready_to_calculate: "border-loop/30 bg-loop/5 text-loop-deep",
  calculated_with_gaps: "border-amber/40 bg-amber/10 text-amber",
  calculated_ready: "border-loop/30 bg-loop/5 text-loop-deep",
};
