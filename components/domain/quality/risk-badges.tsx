import {
  CONTROL_NATURE_LABEL, CONTROL_STATUS_LABEL, EFFECTIVENESS_VERDICT_LABEL,
  MATERIALIZATION_SEVERITY_LABEL, OPPORTUNITY_DECISION_LABEL, OPPORTUNITY_KIND_LABEL,
  OPPORTUNITY_STATUS_LABEL, PLAN_STATUS_LABEL, RISK_STATUS_LABEL, RISK_STRATEGY_LABEL,
  type ControlNature, type ControlStatus, type EffectivenessVerdict,
  type MaterializationSeverity, type OpportunityDecision, type OpportunityKind,
  type OpportunityStatus, type PlanStatus, type RiskStatus, type RiskStrategy,
} from "@/lib/domain/risks";

/**
 * QUALITY-05 · Insignias.
 *
 * Regla de accesibilidad que se repite en §61 del encargo y que aquí se
 * cumple sin excepción: NINGUNA insignia comunica solo con color. El color
 * acompaña; la palabra informa. Quien no distingue rojo de verde tiene que
 * poder auditar igual.
 */

const TONE = {
  neutral: "border-hairline bg-surface text-ink-soft",
  info: "border-loop/30 bg-loop/10 text-loop-deep",
  warn: "border-amber/40 bg-amber/10 text-amber-deep",
  danger: "border-rose/40 bg-rose/10 text-rose-deep",
  good: "border-emerald/40 bg-emerald/10 text-emerald-deep",
} as const;
type Tone = keyof typeof TONE;

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${TONE[tone]}`}>
      {children}
    </span>
  );
}

export function RiskStatusBadge({ status }: { status: RiskStatus }) {
  const tone: Tone =
    status === "active" ? "info" :
    status === "draft" ? "neutral" :
    status === "superseded" ? "warn" : "neutral";
  return <Badge tone={tone}>{RISK_STATUS_LABEL[status]}</Badge>;
}

/**
 * El NIVEL vigente. Distinto del estado (RO-18): esta insignia habla de
 * cuánto preocupa, no de en qué punto del trámite está.
 *
 * Cuando la metodología declara que el nivel NO es aceptable, se dice con
 * palabras —«sobre el criterio»— además del color.
 */
export function RiskLevelBadge({
  level, isAcceptable,
}: { level: string | null; isAcceptable: boolean | null }) {
  if (!level) return <Badge tone="neutral">Sin evaluar</Badge>;
  return (
    <Badge tone={isAcceptable === false ? "danger" : "good"}>
      {level}
      {isAcceptable === false ? " · sobre el criterio" : ""}
    </Badge>
  );
}

export function TreatmentBadge({
  strategy, status,
}: { strategy: RiskStrategy | null; status: PlanStatus | null }) {
  if (!strategy) return <Badge tone="neutral">Sin tratar</Badge>;
  const pending = status === "pending_approval";
  return (
    <Badge tone={pending ? "warn" : "info"}>
      {RISK_STRATEGY_LABEL[strategy]}
      {pending ? ` · ${PLAN_STATUS_LABEL.pending_approval.toLowerCase()}` : ""}
    </Badge>
  );
}

export function ControlBadges({
  nature, status, effectiveness,
}: {
  nature: ControlNature; status: ControlStatus; effectiveness: EffectivenessVerdict | null;
}) {
  return (
    <>
      <Badge tone="neutral">{CONTROL_NATURE_LABEL[nature]}</Badge>
      <Badge tone={status === "active" ? "info" : "neutral"}>{CONTROL_STATUS_LABEL[status]}</Badge>
      {effectiveness ? (
        <Badge
          tone={
            effectiveness === "effective" ? "good" :
            effectiveness === "ineffective" ? "danger" :
            effectiveness === "partially_effective" ? "warn" : "neutral"
          }
        >
          {EFFECTIVENESS_VERDICT_LABEL[effectiveness]}
        </Badge>
      ) : (
        <Badge tone="warn">Sin evaluar su eficacia</Badge>
      )}
    </>
  );
}

export function SeverityBadge({ severity }: { severity: MaterializationSeverity }) {
  const tone: Tone =
    severity === "severe" || severity === "major" ? "danger" :
    severity === "moderate" ? "warn" : "neutral";
  return <Badge tone={tone}>{MATERIALIZATION_SEVERITY_LABEL[severity]}</Badge>;
}

export function OpportunityBadges({
  kind, status, decision,
}: {
  kind: OpportunityKind; status: OpportunityStatus; decision: OpportunityDecision | null;
}) {
  return (
    <>
      <Badge tone="neutral">{OPPORTUNITY_KIND_LABEL[kind]}</Badge>
      <Badge tone={status === "implemented" ? "good" : status === "discarded" ? "neutral" : "info"}>
        {OPPORTUNITY_STATUS_LABEL[status]}
      </Badge>
      {decision ? <Badge tone="info">{OPPORTUNITY_DECISION_LABEL[decision]}</Badge> : null}
    </>
  );
}

export function ReviewBadge({ overdue, text }: { overdue: boolean; text: string }) {
  return <Badge tone={overdue ? "warn" : "neutral"}>{text}</Badge>;
}
