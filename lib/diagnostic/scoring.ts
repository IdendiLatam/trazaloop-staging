/**
 * Puntuación del diagnóstico de preparación (Sí/No).
 * Función PURA: sin base de datos, para poder probarla de forma aislada.
 *
 * Reglas:
 * - Sí = 1, No = 0; ponderado por `weight` de cada pregunta.
 * - Porcentaje total = suma(peso de los Sí) / suma(peso de todas las activas) × 100.
 * - Puntaje por sección con la misma fórmula, por sección.
 * - Brecha crítica = pregunta `isCritical` respondida No.
 *
 * Niveles de preparación (nunca se habla de certificación):
 * - `audit_ready_candidate`: maturity >= 90 y 0 brechas críticas.
 * - `high`:   maturity >= 75 y máximo 4 brechas críticas.
 * - `medium`: maturity >= 50 y máximo 8 brechas críticas.
 * - `low`:    maturity < 50 o más de 8 brechas críticas.
 * Una sola brecha crítica impide `audit_ready_candidate`, sin importar el %.
 * (La cascada garantiza además que un % alto con brechas críticas caiga a
 * `high`/`medium` según sus límites de brechas, nunca a `audit_ready_candidate`.)
 */

export type ScoringQuestion = {
  id: string;
  code: string;
  sectionCode: string;
  questionText: string;
  weight: number;
  isCritical: boolean;
  recommendedAction: string | null;
};

export type ReadinessLevel = "low" | "medium" | "high" | "audit_ready_candidate";

export type SectionScore = {
  sectionCode: string;
  percent: number;
  answeredYes: number;
  total: number;
};

export type NoAnswer = {
  questionId: string;
  code: string;
  questionText: string;
  isCritical: boolean;
  recommendedAction: string | null;
};

export type DiagnosticResult = {
  complete: boolean;
  missingQuestionIds: string[];
  maturityPercent: number;
  readinessLevel: ReadinessLevel;
  criticalGaps: number;
  sectionScores: SectionScore[];
  noAnswers: NoAnswer[];
};

/**
 * PUBLIC-DIAGNOSTICS-01B · El perfil de puntuación, como DATO.
 *
 * Estos umbrales vivían solo aquí, en constantes. Versionar las preguntas y
 * dejarlos sueltos habría dado una falsa sensación de inmutabilidad: bastaría
 * con mover el 75 al 80 para que un diagnóstico ya cerrado —o una campaña
 * cerrada— cambiara de nivel sin que nadie tocara una respuesta.
 *
 * Ahora la versión del instrumento los lleva consigo
 * (`diagnostic_versions.scoring_config`) y el motor los recibe. NO hay un
 * algoritmo por versión: hay UN motor con entradas versionadas.
 *
 * Se evalúan EN ORDEN y gana el primero que se cumple, que es exactamente lo
 * que hacía la cascada de `if`. `maxCriticalGaps: null` significa sin tope.
 */
export type ScoringLevelRule = {
  code: ReadinessLevel;
  minPercent: number;
  maxCriticalGaps: number | null;
};

export type ScoringConfig = {
  roundingDecimals: number;
  levels: ScoringLevelRule[];
};

/**
 * El perfil de PCR v1: copia exacta de lo que hacía este archivo antes de
 * 01B. Es el valor por omisión, así que todo llamador que no pase perfil
 * obtiene el comportamiento de siempre — que es la razón de que este cambio no
 * altere ningún resultado.
 */
export const PCR_V1_SCORING: ScoringConfig = {
  roundingDecimals: 4,
  levels: [
    { code: "audit_ready_candidate", minPercent: 90, maxCriticalGaps: 0 },
    { code: "high", minPercent: 75, maxCriticalGaps: 4 },
    { code: "medium", minPercent: 50, maxCriticalGaps: 8 },
    { code: "low", minPercent: 0, maxCriticalGaps: null },
  ],
};

export const READINESS_LABEL: Record<ReadinessLevel, string> = {
  low: "Nivel de preparación bajo",
  medium: "Nivel de preparación medio",
  high: "Nivel de preparación alto",
  audit_ready_candidate: "Candidato a preparación para auditoría",
};

function redondear(n: number, decimales: number): number {
  const f = 10 ** decimales;
  return Math.round(n * f) / f;
}

export function resolveReadinessLevel(
  maturityPercent: number,
  criticalGaps: number,
  config: ScoringConfig = PCR_V1_SCORING
): ReadinessLevel {
  for (const regla of config.levels) {
    if (maturityPercent >= regla.minPercent
        && (regla.maxCriticalGaps === null || criticalGaps <= regla.maxCriticalGaps)) {
      return regla.code;
    }
  }
  // Una configuración sin regla que aplique no puede devolver «sin nivel»: el
  // último peldaño de todo perfil es el más bajo.
  return "low";
}

export function computeDiagnosticResult(
  questions: ScoringQuestion[],
  answers: Map<string, boolean>,
  config: ScoringConfig = PCR_V1_SCORING
): DiagnosticResult {
  const missingQuestionIds = questions
    .filter((q) => !answers.has(q.id))
    .map((q) => q.id);
  const complete = missingQuestionIds.length === 0;

  let totalWeight = 0;
  let yesWeight = 0;
  let criticalGaps = 0;
  const noAnswers: NoAnswer[] = [];

  const bySection = new Map<
    string,
    { totalWeight: number; yesWeight: number; answeredYes: number; total: number }
  >();

  for (const q of questions) {
    const answer = answers.get(q.id);
    totalWeight += q.weight;

    const section =
      bySection.get(q.sectionCode) ??
      { totalWeight: 0, yesWeight: 0, answeredYes: 0, total: 0 };
    section.totalWeight += q.weight;
    section.total += 1;

    if (answer === true) {
      yesWeight += q.weight;
      section.yesWeight += q.weight;
      section.answeredYes += 1;
    } else if (answer === false) {
      if (q.isCritical) criticalGaps += 1;
      noAnswers.push({
        questionId: q.id,
        code: q.code,
        questionText: q.questionText,
        isCritical: q.isCritical,
        recommendedAction: q.recommendedAction,
      });
    }
    // Sin respuesta: no suma Sí; el diagnóstico no está completo.

    bySection.set(q.sectionCode, section);
  }

  const maturityPercent =
    totalWeight > 0 ? redondear((yesWeight / totalWeight) * 100, config.roundingDecimals) : 0;

  const sectionScores: SectionScore[] = [...bySection.entries()].map(
    ([sectionCode, s]) => ({
      sectionCode,
      percent: s.totalWeight > 0
        ? redondear((s.yesWeight / s.totalWeight) * 100, config.roundingDecimals) : 0,
      answeredYes: s.answeredYes,
      total: s.total,
    })
  );

  return {
    complete,
    missingQuestionIds,
    maturityPercent,
    readinessLevel: resolveReadinessLevel(maturityPercent, criticalGaps, config),
    criticalGaps,
    sectionScores,
    noAnswers,
  };
}
