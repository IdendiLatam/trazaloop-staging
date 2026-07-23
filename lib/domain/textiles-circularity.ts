/**
 * Trazaloop · Sprint T7 (Textil) · Dominio PURO de evaluación técnica de
 * circularidad. Sin BD ni sesión; espejo de la función SQL de 0080 y
 * testeable en tests/circularity/textiles-circularity.test.ts.
 *
 * LENGUAJE: "evaluación técnica", "preparación circular", "potencial",
 * "brecha", "recomendación interna". El nivel "preparado" describe mayor
 * preparación técnica interna según la metodología — jamás cumplimiento ni
 * el resultado de una verificación de terceros.
 */

export const TEXTILE_CIRCULARITY_DIMENSIONS = [
  "composition_transparency",
  "traceability_evidence",
  "material_strategy",
  "durability_care_repair",
  "recyclability_separability",
  "reuse_end_of_life",
] as const;
export type TextileCircularityDimension = (typeof TEXTILE_CIRCULARITY_DIMENSIONS)[number];

export const TEXTILE_CIRCULARITY_DIMENSION_LABEL: Record<TextileCircularityDimension, string> = {
  composition_transparency: "Transparencia de composición",
  traceability_evidence: "Trazabilidad y evidencia",
  material_strategy: "Estrategia de materiales",
  durability_care_repair: "Durabilidad, cuidado y reparación",
  recyclability_separability: "Reciclabilidad y separabilidad",
  reuse_end_of_life: "Reutilización y fin de vida",
};

/** Pesos por dimensión de la metodología v1 (suman 100). */
export const TEXTILE_CIRCULARITY_DIMENSION_WEIGHTS: Record<TextileCircularityDimension, number> = {
  composition_transparency: 20,
  traceability_evidence: 20,
  material_strategy: 15,
  durability_care_repair: 15,
  recyclability_separability: 20,
  reuse_end_of_life: 10,
};

export const TEXTILE_CIRCULARITY_ASSESSMENT_STATUSES = ["draft", "completed", "archived"] as const;
export type TextileCircularityAssessmentStatus =
  (typeof TEXTILE_CIRCULARITY_ASSESSMENT_STATUSES)[number];
export const TEXTILE_CIRCULARITY_STATUS_LABEL: Record<TextileCircularityAssessmentStatus, string> = {
  draft: "Borrador",
  completed: "Completada",
  archived: "Archivada",
};

export const TEXTILE_READINESS_LEVELS = [
  "inicial", "basico", "intermedio", "avanzado", "preparado",
] as const;
export type TextileReadinessLevel = (typeof TEXTILE_READINESS_LEVELS)[number];
export const TEXTILE_READINESS_LEVEL_LABEL: Record<TextileReadinessLevel, string> = {
  inicial: "Inicial",
  basico: "Básico",
  intermedio: "Intermedio",
  avanzado: "Avanzado",
  preparado: "Preparado",
};

export const TEXTILE_CIRCULARITY_DISCLAIMER =
  "Esta evaluación es una herramienta técnica interna. No equivale a certificación, " +
  "cumplimiento regulatorio ni pasaporte oficial.";

/** Nivel de preparación según puntaje 0–100 (espejo del SQL). */
export function readinessLevelFor(score: number): TextileReadinessLevel {
  if (score < 25) return "inicial";
  if (score < 50) return "basico";
  if (score < 70) return "intermedio";
  if (score < 85) return "avanzado";
  return "preparado";
}

/**
 * Soporte por estado de evidencia (encargo §17, espejo del SQL):
 * accepted = 1 (fuerte); pending_review = 0.5 (parcial); expired = 0.5
 * (no fuerte, con advertencia); rejected = 0 (brecha); archived = 0 (no
 * activa).
 */
export function evidenceSupportValue(status: string): number {
  if (status === "accepted") return 1;
  if (status === "pending_review" || status === "expired") return 0.5;
  return 0;
}

export function isStrongSupport(status: string): boolean {
  return status === "accepted";
}

// ---------------------------------------------------------------------------
// Cálculo del puntaje (fórmula del encargo §8, espejo del SQL)
// ---------------------------------------------------------------------------

export type CircularityCriterionInput = {
  code: string;
  dimension: TextileCircularityDimension;
  weight: number;
  /** 0..1, o null = N/A (excluido del denominador de su dimensión). */
  value: number | null;
};

export type CircularityScoreResult = {
  /** 0–100 con 1 decimal. */
  score: number;
  level: TextileReadinessLevel;
  dimensionScores: Record<
    string,
    { score: number | null; weight: number; applicableWeight: number }
  >;
};

/**
 * Por dimensión: earned = Σ peso·valor sobre criterios aplicables,
 * normalizado al peso total de la dimensión. Los N/A salen del
 * denominador; si una dimensión entera queda N/A, el total se renormaliza
 * (misma decisión que el SQL, documentada).
 */
export function computeCircularityScore(
  criteria: CircularityCriterionInput[]
): CircularityScoreResult {
  const dims = new Map<string, { earned: number; wsum: number; wtotal: number }>();
  for (const c of criteria) {
    const d = dims.get(c.dimension) ?? { earned: 0, wsum: 0, wtotal: 0 };
    d.wtotal += c.weight;
    if (c.value !== null) {
      d.wsum += c.weight;
      d.earned += c.weight * Math.min(1, Math.max(0, c.value));
    }
    dims.set(c.dimension, d);
  }

  let total = 0;
  let max = 0;
  const dimensionScores: CircularityScoreResult["dimensionScores"] = {};
  for (const [key, d] of dims) {
    if (d.wsum > 0) {
      const dimScore = (d.earned / d.wsum) * d.wtotal;
      total += dimScore;
      max += d.wtotal;
      dimensionScores[key] = {
        score: Math.round(dimScore * 10) / 10,
        weight: d.wtotal,
        applicableWeight: d.wsum,
      };
    } else {
      dimensionScores[key] = { score: null, weight: d.wtotal, applicableWeight: 0 };
    }
  }

  const score = max > 0 ? Math.round((total / max) * 100 * 10) / 10 : 0;
  return { score, level: readinessLevelFor(score), dimensionScores };
}

// ---------------------------------------------------------------------------
// Brechas (espejo estructural del SQL; usadas también para tests)
// ---------------------------------------------------------------------------

export type CircularityGap = { code: string; dimension: string; message: string };

export type CircularityGapContext = {
  hasComposition: boolean;
  compositionSumsOk: boolean;
  recycledDeclared: boolean;
  recycledSupport: number;
  organicDeclared: boolean;
  organicSupport: number;
  compositionSupport: number;
  rejectedInContext: boolean;
  expiredInContext: boolean;
  materialsCount: number;
  materialsWithSupplier: number;
  materialSupportAvg: number;
  componentsCount: number;
  componentsEvaluated: number;
  maxFibersPerScope: number;
  hasOutputLot: boolean;
  lotConsumptions: number;
  overconsumption: boolean;
  outsourcedWithoutSupport: number;
  /** Indicador AUXILIAR (encargo §2): nunca es la única fuente. */
  lotTraceabilityStatus: string | null;
};

export function computeCircularityGaps(ctx: CircularityGapContext): CircularityGap[] {
  const gaps: CircularityGap[] = [];
  const add = (code: string, dimension: string, message: string) =>
    gaps.push({ code, dimension, message });

  if (!ctx.hasComposition) {
    add("no_composition", "composition_transparency", "La referencia no tiene composición estructurada de fibras.");
  } else if (!ctx.compositionSumsOk) {
    add("composition_not_100", "composition_transparency", "La composición no suma 100 ± 0,5 en todos los alcances.");
  }
  if (ctx.hasComposition && ctx.compositionSupport === 0) {
    add("composition_without_support", "traceability_evidence", "Hay composición registrada sin soporte documental de composición.");
  }
  if (ctx.recycledDeclared && ctx.recycledSupport === 0) {
    add("recycled_without_support", "material_strategy", "Hay declaración reciclada sin evidencia aceptada o pendiente.");
  }
  if (ctx.organicDeclared && ctx.organicSupport === 0) {
    add("organic_without_support", "material_strategy", "Hay declaración orgánica sin evidencia aceptada o pendiente.");
  }
  if (ctx.rejectedInContext) {
    add("rejected_as_support", "traceability_evidence", "Hay evidencia rechazada vinculada como soporte: no cuenta como soporte válido.");
  }
  if (ctx.expiredInContext) {
    add("expired_support", "traceability_evidence", "Advertencia: hay evidencia vencida en el contexto; no cuenta como soporte fuerte.");
  }
  if (ctx.materialsCount > 0 && ctx.materialsWithSupplier < ctx.materialsCount) {
    add("material_without_supplier", "traceability_evidence", "Hay materiales asociados sin proveedor registrado.");
  }
  if (ctx.materialsCount > 0 && ctx.materialSupportAvg < 0.5) {
    add("material_without_datasheet", "traceability_evidence", "Hay materiales asociados sin ficha técnica o soporte documental.");
  }
  if (ctx.componentsCount > 0 && ctx.componentsEvaluated < ctx.componentsCount) {
    add("components_without_separability", "recyclability_separability", "Hay avíos/componentes sin separabilidad evaluada.");
  }
  if (ctx.hasComposition && ctx.maxFibersPerScope > 3) {
    add("complex_fiber_mix", "recyclability_separability", "La mezcla de fibras es compleja; documenta la justificación técnica.");
  }
  if (ctx.hasOutputLot) {
    if (ctx.lotConsumptions === 0) {
      add("lot_without_consumptions", "traceability_evidence", "El lote producido evaluado no registra consumos de lotes de entrada.");
    }
    if (ctx.overconsumption) {
      add("overconsumption", "traceability_evidence", "Se detecta sobreconsumo en lotes de entrada de la orden evaluada.");
    }
    if (ctx.outsourcedWithoutSupport > 0) {
      add("outsourced_without_support", "traceability_evidence", "Hay procesos tercerizados sin soporte documental vinculado.");
    }
    if (ctx.lotTraceabilityStatus === "needs_review") {
      add("traceability_needs_review", "traceability_evidence", "La trazabilidad del lote está marcada como \"requiere revisión\" (indicador auxiliar).");
    }
  }
  return gaps;
}

/** Valor de respuesta manual permitido (0, 0.5 o 1). */
export function parseAnswerValue(raw: unknown):
  | { value: number; error: null }
  | { value: null; error: string } {
  const text = typeof raw === "string" ? raw.trim().replace(",", ".") : String(raw ?? "");
  const num = Number(text);
  if (!Number.isFinite(num) || num < 0 || num > 1) {
    return { value: null, error: "La respuesta debe estar entre 0 y 1." };
  }
  return { value: Math.round(num * 100) / 100, error: null };
}
