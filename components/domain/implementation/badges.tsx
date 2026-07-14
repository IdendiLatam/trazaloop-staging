import {
  MODULE_LABEL,
  CATEGORY_LABEL,
  SEVERITY_LABEL,
  STATUS_LABEL,
  type FeedbackModule,
  type FeedbackCategory,
  type FeedbackSeverity,
  type FeedbackStatus,
  type ChecklistStatus,
} from "@/lib/domain/implementation";

const SEVERITY_TONE: Record<FeedbackSeverity, string> = {
  low: "border-hairline bg-paper text-ink-soft",
  medium: "border-loop/30 bg-loop/5 text-loop-deep",
  high: "border-amber/40 bg-amber/10 text-amber",
  critical: "border-danger/30 bg-danger/5 text-danger",
};

export function FeedbackSeverityBadge({ severity }: { severity: FeedbackSeverity }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${SEVERITY_TONE[severity]}`}
    >
      {SEVERITY_LABEL[severity]}
    </span>
  );
}

const STATUS_TONE: Record<FeedbackStatus, string> = {
  open: "border-amber/40 bg-amber/10 text-amber",
  in_review: "border-loop/30 bg-loop/5 text-loop-deep",
  resolved: "border-loop/30 bg-loop/5 text-loop-deep",
  closed: "border-hairline bg-paper text-ink-soft",
};

export function FeedbackStatusBadge({ status }: { status: FeedbackStatus }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_TONE[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

export function FeedbackModuleBadge({ module }: { module: FeedbackModule }) {
  return (
    <span className="inline-flex rounded-full border border-hairline bg-surface px-2.5 py-0.5 text-xs font-medium text-ink-soft">
      {MODULE_LABEL[module]}
    </span>
  );
}

export function FeedbackCategoryBadge({ category }: { category: FeedbackCategory }) {
  return (
    <span className="inline-flex rounded-full border border-hairline bg-surface px-2.5 py-0.5 text-xs font-medium text-ink-soft">
      {CATEGORY_LABEL[category]}
    </span>
  );
}

const CHECKLIST_TONE: Record<ChecklistStatus, string> = {
  pendiente: "border-hairline text-ink-soft",
  "en progreso": "border-loop/30 bg-loop/5 text-loop-deep",
  completo: "border-loop/30 bg-loop/5 text-loop-deep",
  "con advertencias": "border-amber/40 bg-amber/10 text-amber",
};

export function ChecklistStatusBadge({ status }: { status: ChecklistStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${CHECKLIST_TONE[status]}`}
    >
      {status}
    </span>
  );
}
