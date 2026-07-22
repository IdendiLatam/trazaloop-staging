/**
 * Trazaloop · Sprint T2 (Textil) · Scoring PURO del diagnóstico textil.
 *
 * Sin BD, sin sesión: función determinista testeable (tests/diagnostic/
 * textiles-scoring.test.ts), invocada por la server action de completar.
 * Modelo: docs/modules/textiles/TEXTILES_DIAGNOSTIC_MODEL.md §5 (DL-09).
 *
 * Reglas (deliberadamente distintas del scoring booleano CPR):
 *  - Escala: yes = 1.0 · partial = 0.5 · no = 0.0 · not_applicable =
 *    excluida del denominador.
 *  - Pregunta de CONTEXTO (TQ49): nunca puntúa. Si su respuesta es "no" o
 *    "not_applicable", las demás preguntas de su dimensión (TQ50–52) se
 *    tratan como No aplica sin importar lo guardado.
 *  - Puntaje de dimensión = Σ(valor × peso) / Σ(peso aplicable) × 100.
 *    Dimensión sin preguntas aplicables → excluida del global.
 *  - CRÍTICAS: un "No" en una pregunta crítica limita el puntaje de su
 *    dimensión a 49 (techo del nivel Básico) y limita el NIVEL global a
 *    "basico" aunque el promedio dé más — la brecha crítica impide
 *    declarar mayor preparación.
 *  - Global = Σ(puntaje_dimensión × peso_dimensión) / Σ(pesos aplicables).
 *  - Niveles: 0–24 inicial · 25–49 basico · 50–69 intermedio ·
 *    70–84 avanzado · 85–100 preparado.
 *
 * El resultado SIEMPRE se presenta con la advertencia obligatoria
 * (TEXTILE_DIAGNOSTIC_DISCLAIMER): nivel interno de preparación — nunca
 * certificación, verificación independiente ni cumplimiento.
 */

export const TEXTILE_ANSWER_VALUES = ["yes", "partial", "no", "not_applicable"] as const;
export type TextileAnswerValue = (typeof TEXTILE_ANSWER_VALUES)[number];

export function isTextileAnswerValue(v: unknown): v is TextileAnswerValue {
  return typeof v === "string" && (TEXTILE_ANSWER_VALUES as readonly string[]).includes(v);
}

export const TEXTILE_ANSWER_LABEL: Record<TextileAnswerValue, string> = {
  yes: "Sí",
  partial: "Parcial",
  no: "No",
  not_applicable: "No aplica",
};

export const TEXTILE_ANSWER_SCORE: Record<Exclude<TextileAnswerValue, "not_applicable">, number> = {
  yes: 1,
  partial: 0.5,
  no: 0,
};

export type TextileMaturityLevel = "inicial" | "basico" | "intermedio" | "avanzado" | "preparado";

export const TEXTILE_LEVEL_LABEL: Record<TextileMaturityLevel, string> = {
  inicial: "Inicial",
  basico: "Básico",
  intermedio: "Intermedio",
  avanzado: "Avanzado",
  preparado: "Preparado",
};

/** Techo numérico del nivel Básico: tope de dimensión con crítica en "No". */
export const CRITICAL_DIMENSION_CAP = 49;

export const TEXTILE_DIAGNOSTIC_DISCLAIMER =
  "Nivel de preparación interno con base en las respuestas registradas. No constituye " +
  "certificación, verificación independiente ni garantía de cumplimiento regulatorio.";

export const TEXTILE_LEVEL_RECOMMENDATION: Record<TextileMaturityLevel, string> = {
  inicial:
    "Crear el catálogo de productos/referencias y proveedores; iniciar el manual técnico de trazabilidad cuando TrazaDocs Textil esté disponible.",
  basico:
    "Completar la composición de fibras de las referencias activas y cargar las evidencias de proveedor.",
  intermedio:
    "Cerrar la trazabilidad orden → lote y documentar los procesos tercerizados; preparar la evaluación de circularidad.",
  avanzado:
    "Preparar fichas consolidadas (pasaporte técnico en borrador) por referencia y cerrar las brechas priorizadas.",
  preparado:
    "Mantener las vigencias de evidencias y preparar una revisión técnica con comprador o tercero.",
};

export type TextileScoringQuestion = {
  id: string;
  code: string;
  sectionCode: string;
  questionText: string;
  weight: number;
  isCritical: boolean;
  allowsNa: boolean;
  isContext: boolean;
  recommendedAction: string | null;
};

export type TextileScoringSection = {
  code: string;
  title: string;
  weight: number;
};

export type TextileDimensionScore = {
  sectionCode: string;
  /** null cuando la dimensión completa quedó No aplica. */
  percent: number | null;
  rawPercent: number | null;
  cappedByCritical: boolean;
  applicableCount: number;
  totalCount: number;
};

export type TextileGap = {
  questionId: string;
  code: string;
  sectionCode: string;
  questionText: string;
  answer: "no" | "partial";
  isCritical: boolean;
  recommendedAction: string | null;
};

export type TextileDiagnosticResult = {
  complete: boolean;
  missingQuestionIds: string[];
  invalidNaQuestionIds: string[];
  maturityPercent: number;
  maturityLevel: TextileMaturityLevel;
  criticalGaps: number;
  dimensionScores: TextileDimensionScore[];
  gaps: TextileGap[];
};

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export function resolveTextileMaturityLevel(percent: number): TextileMaturityLevel {
  if (percent >= 85) return "preparado";
  if (percent >= 70) return "avanzado";
  if (percent >= 50) return "intermedio";
  if (percent >= 25) return "basico";
  return "inicial";
}

/**
 * Respuesta EFECTIVA por pregunta aplicando la regla de contexto: si la
 * pregunta de contexto de la dimensión respondió "no"/"not_applicable",
 * las no-contexto de esa dimensión se vuelven not_applicable.
 */
export function resolveEffectiveAnswers(
  questions: readonly TextileScoringQuestion[],
  answers: ReadonlyMap<string, TextileAnswerValue>
): Map<string, TextileAnswerValue | undefined> {
  const contextOff = new Set<string>();
  for (const q of questions) {
    if (!q.isContext) continue;
    const a = answers.get(q.id);
    if (a === "no" || a === "not_applicable") contextOff.add(q.sectionCode);
  }

  const effective = new Map<string, TextileAnswerValue | undefined>();
  for (const q of questions) {
    const stored = answers.get(q.id);
    if (!q.isContext && contextOff.has(q.sectionCode)) {
      effective.set(q.id, "not_applicable");
    } else {
      effective.set(q.id, stored);
    }
  }
  return effective;
}

export function computeTextileDiagnosticResult(
  sections: readonly TextileScoringSection[],
  questions: readonly TextileScoringQuestion[],
  answers: ReadonlyMap<string, TextileAnswerValue>
): TextileDiagnosticResult {
  // Completitud: TODAS las preguntas activas (incluida la de contexto,
  // porque gobierna la aplicabilidad de otras) deben tener respuesta.
  const missingQuestionIds = questions.filter((q) => !answers.has(q.id)).map((q) => q.id);

  // "No aplica" solo es válido donde allows_na = true (las críticas 1, 6,
  // 12, 18, 23 y 56 no lo admiten). La respuesta EFECTIVA por contexto sí
  // puede ser NA aunque allows_na sea false — lo inválido es guardarlo.
  const invalidNaQuestionIds = questions
    .filter((q) => !q.allowsNa && answers.get(q.id) === "not_applicable")
    .map((q) => q.id);

  const complete = missingQuestionIds.length === 0 && invalidNaQuestionIds.length === 0;

  const effective = resolveEffectiveAnswers(questions, answers);

  type DimAcc = {
    applicableWeight: number;
    scoreWeight: number;
    applicableCount: number;
    totalCount: number;
    hasCriticalNo: boolean;
  };
  const byDim = new Map<string, DimAcc>();
  for (const s of sections) {
    byDim.set(s.code, {
      applicableWeight: 0,
      scoreWeight: 0,
      applicableCount: 0,
      totalCount: 0,
      hasCriticalNo: false,
    });
  }

  let criticalGaps = 0;
  const gaps: TextileGap[] = [];

  for (const q of questions) {
    const acc = byDim.get(q.sectionCode);
    if (!acc) continue;
    acc.totalCount += 1;

    if (q.isContext) continue; // el contexto jamás puntúa

    const a = effective.get(q.id);
    if (a === undefined || a === "not_applicable") continue; // fuera del denominador

    acc.applicableWeight += q.weight;
    acc.applicableCount += 1;
    acc.scoreWeight += TEXTILE_ANSWER_SCORE[a] * q.weight;

    if (a === "no" && q.isCritical) {
      acc.hasCriticalNo = true;
      criticalGaps += 1;
    }
    if (a === "no" || a === "partial") {
      gaps.push({
        questionId: q.id,
        code: q.code,
        sectionCode: q.sectionCode,
        questionText: q.questionText,
        answer: a,
        isCritical: q.isCritical,
        recommendedAction: q.recommendedAction,
      });
    }
  }

  const dimensionScores: TextileDimensionScore[] = [];
  let globalWeight = 0;
  let globalScore = 0;

  for (const s of sections) {
    const acc = byDim.get(s.code)!;
    if (acc.applicableWeight <= 0) {
      dimensionScores.push({
        sectionCode: s.code,
        percent: null,
        rawPercent: null,
        cappedByCritical: false,
        applicableCount: acc.applicableCount,
        totalCount: acc.totalCount,
      });
      continue; // dimensión completa No aplica → fuera del global
    }
    const raw = round4((acc.scoreWeight / acc.applicableWeight) * 100);
    const capped = acc.hasCriticalNo && raw > CRITICAL_DIMENSION_CAP;
    const percent = capped ? CRITICAL_DIMENSION_CAP : raw;
    dimensionScores.push({
      sectionCode: s.code,
      percent,
      rawPercent: raw,
      cappedByCritical: capped,
      applicableCount: acc.applicableCount,
      totalCount: acc.totalCount,
    });
    globalWeight += s.weight;
    globalScore += percent * s.weight;
  }

  const maturityPercent = globalWeight > 0 ? round4(globalScore / globalWeight) : 0;

  // Tope de NIVEL por brechas críticas: nunca por encima de "basico".
  let maturityLevel = resolveTextileMaturityLevel(maturityPercent);
  if (criticalGaps > 0 && (maturityLevel === "intermedio" || maturityLevel === "avanzado" || maturityLevel === "preparado")) {
    maturityLevel = "basico";
  }

  // Brechas ordenadas: críticas primero, luego "No", luego "Parcial";
  // dentro de cada grupo, por peso de dimensión descendente.
  const dimWeight = new Map(sections.map((s) => [s.code, s.weight]));
  gaps.sort((a, b) => {
    const rank = (g: TextileGap) => (g.isCritical ? 0 : g.answer === "no" ? 1 : 2);
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    return (dimWeight.get(b.sectionCode) ?? 0) - (dimWeight.get(a.sectionCode) ?? 0);
  });

  return {
    complete,
    missingQuestionIds,
    invalidNaQuestionIds,
    maturityPercent,
    maturityLevel,
    criticalGaps,
    dimensionScores,
    gaps,
  };
}
