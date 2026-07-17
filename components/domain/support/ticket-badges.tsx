import { TICKET_STATUS_LABEL, TICKET_PRIORITY_LABEL, SLA_STATUS_LABEL, type TicketStatus, type TicketPriority, type SlaStatus } from "@/lib/domain/support";

const STATUS_TONE: Record<TicketStatus, string> = {
  open: "border-hairline bg-paper text-ink-soft",
  assigned: "border-loop/30 bg-loop/5 text-loop-deep",
  waiting_customer: "border-amber/40 bg-amber/10 text-amber",
  in_progress: "border-loop/30 bg-loop/5 text-loop-deep",
  resolved: "border-loop bg-loop/10 text-loop-deep",
  closed: "border-hairline bg-paper text-ink-soft",
};

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_TONE[status]}`}>
      {TICKET_STATUS_LABEL[status]}
    </span>
  );
}

const PRIORITY_TONE: Record<TicketPriority, string> = {
  low: "border-hairline bg-paper text-ink-soft",
  normal: "border-hairline bg-paper text-ink-soft",
  high: "border-amber/40 bg-amber/10 text-amber",
  urgent: "border-danger/40 bg-danger/5 text-danger",
};

export function TicketPriorityBadge({ priority }: { priority: TicketPriority }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${PRIORITY_TONE[priority]}`}>
      {TICKET_PRIORITY_LABEL[priority]}
    </span>
  );
}

const SLA_TONE: Record<SlaStatus, string> = {
  no_target: "border-hairline bg-paper text-ink-soft",
  within_target: "border-loop/30 bg-loop/5 text-loop-deep",
  due_soon: "border-amber/40 bg-amber/10 text-amber",
  overdue: "border-danger/40 bg-danger/5 text-danger",
  responded: "border-loop/30 bg-loop/5 text-loop-deep",
};

export function SlaStatusBadge({ status }: { status: SlaStatus }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${SLA_TONE[status]}`}>
      {SLA_STATUS_LABEL[status]}
    </span>
  );
}
