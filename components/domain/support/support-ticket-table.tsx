import Link from "next/link";
import type { SupportTicketSummaryRow } from "@/lib/db/support";
import { TICKET_CATEGORY_LABEL, TICKET_MODULE_LABEL, type TicketCategory, type TicketModule } from "@/lib/domain/support";
import { TicketStatusBadge, TicketPriorityBadge, SlaStatusBadge } from "./ticket-badges";
import { EmptyState } from "@/components/ui/empty-state";

export function SupportTicketTable({ tickets }: { tickets: SupportTicketSummaryRow[] }) {
  if (tickets.length === 0) {
    return (
      <EmptyState
        title="Todavía no has registrado tickets de soporte."
        description="Usa “Nuevo ticket” para pedir ayuda sobre cualquier módulo de Trazaloop."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-hairline bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-hairline text-left text-xs text-ink-soft">
            <th className="px-3 py-2 font-medium">Asunto</th>
            <th className="px-3 py-2 font-medium">Categoría</th>
            <th className="px-3 py-2 font-medium">Módulo</th>
            <th className="px-3 py-2 font-medium">Prioridad</th>
            <th className="px-3 py-2 font-medium">Estado</th>
            <th className="px-3 py-2 font-medium">Última actividad</th>
            <th className="px-3 py-2 font-medium">Primera respuesta</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {tickets.map((t) => (
            <tr key={t.ticketId} className="border-b border-hairline last:border-0 align-top">
              <td className="px-3 py-2 font-medium">{t.subject}</td>
              <td className="px-3 py-2 text-xs text-ink-soft">{TICKET_CATEGORY_LABEL[t.category as TicketCategory]}</td>
              <td className="px-3 py-2 text-xs text-ink-soft">{TICKET_MODULE_LABEL[t.relatedModule as TicketModule]}</td>
              <td className="px-3 py-2">
                <TicketPriorityBadge priority={t.priority} />
              </td>
              <td className="px-3 py-2">
                <TicketStatusBadge status={t.status} />
              </td>
              <td className="px-3 py-2 text-xs text-ink-soft">
                {new Date(t.lastMessageAt ?? t.updatedAt).toLocaleString("es-CO")}
              </td>
              <td className="px-3 py-2">
                <SlaStatusBadge status={t.slaStatus} />
              </td>
              <td className="px-3 py-2 text-right text-xs">
                <Link href={`/support/${t.ticketId}`} className="text-loop hover:underline">
                  Abrir
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
