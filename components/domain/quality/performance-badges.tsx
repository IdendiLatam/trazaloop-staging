import {
  EVALUATION_LABEL, evaluationTone,
  OBJECTIVE_PERFORMANCE_LABEL, objectivePerformanceTone,
  INDICATOR_ADMIN_STATE_LABEL, OBJECTIVE_ADMIN_STATE_LABEL,
  TREND_LABEL, TREND_SYMBOL,
  type Evaluation, type EvaluationTone, type IndicatorAdminState,
  type ObjectiveAdminState, type ObjectivePerformance, type Trend,
} from "@/lib/domain/quality-indicators";

/**
 * Trazaloop Quality · QUALITY-03 · Distintivos de estado y desempeño.
 *
 * Son DOS familias a propósito, y no se mezclan nunca (OI-03):
 *
 *   AdminStateBadge   dice si el objeto está activo, suspendido o retirado.
 *   EvaluationBadge   dice si cumple, requiere atención o no cumple.
 *
 * Un indicador ACTIVO puede NO CUMPLIR, y uno RETIRADO puede haber cumplido
 * siempre. Un solo distintivo para las dos cosas haría imposible leer eso.
 */

const TONE: Record<EvaluationTone, string> = {
  ok: "border-loop/30 bg-loop/5 text-loop-deep",
  attention: "border-amber/40 bg-amber/10 text-amber",
  bad: "border-danger/30 bg-danger/5 text-danger",
  neutral: "border-hairline bg-paper text-ink-soft",
};

const DOT: Record<EvaluationTone, string> = {
  ok: "bg-loop",
  attention: "bg-amber",
  bad: "bg-danger",
  neutral: "bg-ink-soft/60",
};

function Pill({ tone, children }: { tone: EvaluationTone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONE[tone]}`}>
      {children}
    </span>
  );
}

/** Variante compacta para tablas densas: un punto y el texto, sin píldora. */
function Compact({ tone, children }: { tone: EvaluationTone; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-start gap-1.5">
      <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${DOT[tone]}`} aria-hidden="true" />
      <span>{children}</span>
    </span>
  );
}

export function EvaluationBadge({
  evaluation, compact = false,
}: { evaluation: Evaluation; compact?: boolean }) {
  const tone = evaluationTone(evaluation);
  const label = EVALUATION_LABEL[evaluation];
  return compact ? <Compact tone={tone}>{label}</Compact> : <Pill tone={tone}>{label}</Pill>;
}

export function ObjectivePerformanceBadge({
  performance, compact = false,
}: { performance: ObjectivePerformance; compact?: boolean }) {
  const tone = objectivePerformanceTone(performance);
  const label = OBJECTIVE_PERFORMANCE_LABEL[performance];
  return compact ? <Compact tone={tone}>{label}</Compact> : <Pill tone={tone}>{label}</Pill>;
}

export function IndicatorStateBadge({ state }: { state: IndicatorAdminState }) {
  const tone: EvaluationTone =
    state === "active" ? "neutral" : state === "retired" ? "neutral" : "attention";
  return (
    <span
      title="Estado administrativo del indicador. No dice nada sobre su desempeño."
      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONE[tone]}`}
    >
      {INDICATOR_ADMIN_STATE_LABEL[state]}
    </span>
  );
}

export function ObjectiveStateBadge({ state }: { state: ObjectiveAdminState }) {
  const tone: EvaluationTone = state === "active" ? "neutral" : "attention";
  return (
    <span
      title="Estado administrativo del objetivo. No dice nada sobre si se cumple."
      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONE[tone]}`}
    >
      {OBJECTIVE_ADMIN_STATE_LABEL[state]}
    </span>
  );
}

/** La tendencia lleva su símbolo, pero el color NO es el significado: el texto
 *  lo dice, para que se entienda también sin distinguir colores. */
export function TrendBadge({ trend }: { trend: Trend }) {
  const tone: EvaluationTone =
    trend === "improving" ? "ok" : trend === "declining" ? "bad" : "neutral";
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${
      tone === "ok" ? "text-loop-deep" : tone === "bad" ? "text-danger" : "text-ink-soft"
    }`}>
      <span aria-hidden="true">{TREND_SYMBOL[trend]}</span>
      {TREND_LABEL[trend]}
    </span>
  );
}
