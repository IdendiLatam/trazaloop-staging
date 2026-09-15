import {
  computeDiagnosticResult, READINESS_LABEL,
  type ReadinessLevel, type ScoringConfig, type ScoringQuestion,
} from "@/lib/diagnostic/scoring";

/**
 * Trazaloop · PUBLIC-DIAGNOSTICS-01F · La instantánea del resultado público.
 *
 *
 * UN SOLO MOTOR
 *
 * Aquí NO se puntúa nada. Se llama a `computeDiagnosticResult` —el mismo motor
 * que usa el diagnóstico autenticado, sin copia en SQL ni en el navegador— y
 * lo único que se hace después es DAR FORMA a lo que devuelve.
 *
 * La razón de que exista esta capa es poder probar la instantánea sin base de
 * datos, y que la acción de servidor se quede en «leer, calcular, escribir».
 *
 *
 * QUÉ ENTRA EN LA INSTANTÁNEA Y QUÉ NO
 *
 * Entra lo que hará falta para enseñar el resultado sin volver a calcularlo
 * contra un código futuro: el porcentaje, el nivel, las brechas, la foto por
 * sección y las recomendaciones de las brechas REALES.
 *
 * No entra:
 *
 *   · ningún dato personal — la instantánea es de presentación; quién
 *     respondió vive en su propia tabla y no se duplica;
 *   · las 52 respuestas otra vez — ya están en su tabla, y repetirlas sería
 *     dos verdades del mismo hecho;
 *   · `weight`, `is_critical` ni los umbrales — con eso cualquiera reconstruye
 *     el algoritmo y sabe exactamente qué contestar la próxima vez.
 *
 * El NÚMERO de brechas críticas sí sale: es una cifra del resultado. CUÁLES lo
 * son, no.
 *
 * Función PURA: sin fecha, sin base y sin azar, para poder compararla contra
 * el motor autenticado con las mismas respuestas.
 */

export type PublicResultSection = {
  code: string;
  title: string;
  orderIndex: number;
};

export type PublicResultInput = {
  questions: ScoringQuestion[];
  sections: PublicResultSection[];
  answers: Map<string, boolean>;
  config: ScoringConfig;
  instrument: { type: string; versionNumber: number };
};

export type PublicSectionScore = {
  percent: number;
  answeredYes: number;
  total: number;
};

export type PublicResultSnapshot = {
  complete: boolean;
  missing: number;
  maturityPercent: number;
  readinessLevel: ReadinessLevel;
  criticalGaps: number;
  /** Igual que el diagnóstico autenticado: por código de sección. */
  sectionScores: Record<string, PublicSectionScore>;
  resultPayload: Record<string, unknown>;
};

/**
 * El nombre del formato, para que quien lo lea sepa qué está leyendo.
 *
 * PD-01G lo sube a `v2` por un solo motivo: cada brecha pasa a decir DE QUÉ
 * DIMENSIÓN es. Sin ese dato la pantalla de resultado no puede agrupar las
 * recomendaciones ni ordenar las brechas por la dimensión más floja, y
 * deducirlo del código de la pregunta —«S1Q03» → sección 1— sería una
 * inferencia que se rompe en cuanto una versión futura numere distinto.
 *
 * Se sube la versión en vez de añadir el campo en silencio porque el nombre
 * del formato es una promesa sobre su contenido. Hoy no cuesta nada: no hay
 * ni una instantánea persistida en ningún entorno.
 */
export const PUBLIC_RESULT_SCHEMA = "public_pcr_result.v2";

export function buildPublicResultSnapshot(
  input: PublicResultInput
): PublicResultSnapshot {
  const resultado = computeDiagnosticResult(
    input.questions, input.answers, input.config);

  const seccionDe = new Map(input.questions.map((q) => [q.id, q.sectionCode]));

  const sectionScores: Record<string, PublicSectionScore> = {};
  for (const s of resultado.sectionScores) {
    sectionScores[s.sectionCode] = {
      percent: s.percent, answeredYes: s.answeredYes, total: s.total,
    };
  }

  const secciones = [...input.sections]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((s) => {
      const p = sectionScores[s.code];
      return {
        code: s.code,
        title: s.title,
        percent: p?.percent ?? 0,
        answered_yes: p?.answeredYes ?? 0,
        total: p?.total ?? 0,
      };
    });

  return {
    complete: resultado.complete,
    missing: resultado.missingQuestionIds.length,
    maturityPercent: resultado.maturityPercent,
    readinessLevel: resultado.readinessLevel,
    criticalGaps: resultado.criticalGaps,
    sectionScores,
    resultPayload: {
      schema: PUBLIC_RESULT_SCHEMA,
      instrument: {
        type: input.instrument.type,
        version: input.instrument.versionNumber,
      },
      answered: input.questions.length - resultado.missingQuestionIds.length,
      questions: input.questions.length,
      maturity_percent: resultado.maturityPercent,
      readiness_level: resultado.readinessLevel,
      readiness_label: READINESS_LABEL[resultado.readinessLevel],
      critical_gaps: resultado.criticalGaps,
      sections: secciones,
      // Las brechas REALES —lo que se respondió «No»— con su recomendación.
      // Sin decir cuáles eran críticas: eso es la regla de puntuación.
      gaps: resultado.noAnswers.map((g) => ({
        code: g.code,
        // De qué dimensión es. Sale del catálogo que ya está en memoria, no de
        // adivinar nada a partir del código de la pregunta.
        section: seccionDe.get(g.questionId) ?? null,
        question: g.questionText,
        recommended_action: g.recommendedAction,
      })),
    },
  };
}
