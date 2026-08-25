import {
  ACTION_KIND_LABEL, CASE_STATUS_LABEL, CLASSIFICATION_LABEL, EFFECTIVENESS_LABEL,
  actionStanding,
  type ActionKind, type ActionStatus, type CaseStatus, type Classification, type Effectiveness,
} from "@/lib/domain/work-cases";

/**
 * Distintivos del dominio de casos.
 *
 * Un punto de color y texto, nunca color solo: quien no distingue el ámbar del
 * verde debe poder leer lo mismo. Y la clasificación no comparte paleta con el
 * estado, porque son dos preguntas distintas y confundirlas visualmente es
 * confundirlas.
 */
function Pill({ tone, children }: { tone: "neutral" | "good" | "warn" | "bad"; children: React.ReactNode }) {
  const styles = {
    neutral: "border-hairline bg-surface text-ink-soft",
    good: "border-loop/30 bg-loop/5 text-loop-deep",
    warn: "border-amber/40 bg-amber/10 text-amber",
    bad: "border-danger/40 bg-danger/10 text-danger",
  } as const;
  const dot = { neutral: "bg-ink-soft", good: "bg-loop", warn: "bg-amber", bad: "bg-danger" } as const;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${styles[tone]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot[tone]}`} aria-hidden />
      {children}
    </span>
  );
}

export function ClassificationBadge({ value }: { value: Classification }) {
  const tone = value === "nonconformity" ? "bad"
    : value === "pending" ? "neutral"
    : value === "improvement_opportunity" ? "good" : "warn";
  return <Pill tone={tone}>{CLASSIFICATION_LABEL[value]}</Pill>;
}

export function CaseStatusBadge({ value }: { value: CaseStatus }) {
  const tone = value === "closed" ? "good" : value === "draft" ? "neutral" : "warn";
  return <Pill tone={tone}>{CASE_STATUS_LABEL[value]}</Pill>;
}

export function ActionKindBadge({ value }: { value: ActionKind }) {
  return <Pill tone="neutral">{ACTION_KIND_LABEL[value]}</Pill>;
}

/** El estado REAL: junta «completada» con «¿sirvió?», que es lo que importa. */
export function ActionStandingBadge({
  status, effectiveness,
}: { status: ActionStatus; effectiveness: Effectiveness }) {
  const s = actionStanding({ status, effectiveness });
  return <Pill tone={s.tone}>{s.label}</Pill>;
}

export function EffectivenessBadge({ value }: { value: Effectiveness }) {
  const tone = value === "effective" ? "good" : value === "not_effective" ? "bad"
    : value === "pending" ? "warn" : "neutral";
  return <Pill tone={tone}>{EFFECTIVENESS_LABEL[value]}</Pill>;
}
