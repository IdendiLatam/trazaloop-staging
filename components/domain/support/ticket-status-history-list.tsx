import type { TicketStatusHistoryRow } from "@/lib/db/support";
import { TICKET_STATUS_LABEL, type TicketStatus } from "@/lib/domain/support";
import { EmptyState } from "@/components/ui/empty-state";

export function TicketStatusHistoryList({ history }: { history: TicketStatusHistoryRow[] }) {
  if (history.length === 0) {
    return <EmptyState title="Sin cambios de estado registrados todavía." description="" />;
  }

  return (
    <ul className="space-y-2">
      {history.map((h) => (
        <li key={h.id} className="rounded-md border border-hairline bg-surface p-2 text-xs">
          <span className="font-medium">
            {h.fromStatus ? `${TICKET_STATUS_LABEL[h.fromStatus as TicketStatus]} → ` : ""}
            {TICKET_STATUS_LABEL[h.toStatus as TicketStatus]}
          </span>
          {h.changeNote ? <span className="text-ink-soft"> — {h.changeNote}</span> : null}
          <div className="mt-0.5 text-ink-soft">
            {h.changedByName ?? "Sistema"} · {new Date(h.createdAt).toLocaleString("es-CO")}
          </div>
        </li>
      ))}
    </ul>
  );
}
