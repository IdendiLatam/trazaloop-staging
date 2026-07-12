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

export const READINESS_LABEL: Record<ReadinessLevel, string> = {
  low: "Nivel de preparación bajo",
  medium: "Nivel de preparación medio",
  high: "Nivel de preparación alto",
  audit_ready_candidate: "Candidato a preparación para auditoría",
};

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export function resolveReadinessLevel(
  maturityPercent: number,
  criticalGaps: number
): ReadinessLevel {
  if (maturityPercent >= 90 && criticalGaps === 0) return "audit_ready_candidate";
  if (maturityPercent >= 75 && criticalGaps <= 4) return "high";
  if (maturityPercent >= 50 && criticalGaps <= 8) return "medium";
  return "low";
}

export function computeDiagnosticResult(
  questions: ScoringQuestion[],
  answers: Map<string, boolean>
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
    totalWeight > 0 ? round4((yesWeight / totalWeight) * 100) : 0;

  const sectionScores: SectionScore[] = [...bySection.entries()].map(
    ([sectionCode, s]) => ({
      sectionCode,
      percent: s.totalWeight > 0 ? round4((s.yesWeight / s.totalWeight) * 100) : 0,
      answeredYes: s.answeredYes,
      total: s.total,
    })
  );

  return {
    complete,
    missingQuestionIds,
    maturityPercent,
    readinessLevel: resolveReadinessLevel(maturityPercent, criticalGaps),
    criticalGaps,
    sectionScores,
    noAnswers,
  };
}
