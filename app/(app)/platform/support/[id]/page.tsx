// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1). Exige platform_staff activo.
export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformStaff } from "@/lib/auth/require-platform-staff";
import { getPlatformSupportTicketAction } from "@/server/actions/support";
import { TICKET_CATEGORY_LABEL, TICKET_MODULE_LABEL, FIRST_RESPONSE_TARGET_MESSAGE, type TicketCategory, type TicketModule } from "@/lib/domain/support";
import { TicketStatusBadge, TicketPriorityBadge, SlaStatusBadge } from "@/components/domain/support/ticket-badges";
import { SupportTicketThread } from "@/components/domain/support/support-ticket-thread";
import { TicketStatusHistoryList } from "@/components/domain/support/ticket-status-history-list";
import {
  AssignTicketForm,
  UpdateTicketStatusForm,
  UpdateTicketPriorityForm,
  PlatformReplyForm,
  InternalNoteForm,
} from "@/components/domain/support/platform-ticket-actions";

export default async function PlatformSupportTicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformStaff();
  const { id } = await params;
  const { ticket, messages, history, assignableStaff } = await getPlatformSupportTicketAction(id);
  if (!ticket) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <p className="eyebrow">
          <Link href="/platform/support" className="hover:underline">
            Tickets de soporte
          </Link>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{ticket.subject}</h1>
          <TicketStatusBadge status={ticket.status} />
          <TicketPriorityBadge priority={ticket.priority} />
        </div>
        <p className="text-sm text-ink-soft">
          {ticket.organizationName}
          {ticket.organizationTaxId ? ` · NIT ${ticket.organizationTaxId}` : ""} · Plan {ticket.planCode} ({ticket.planStatus})
        </p>
        <p className="text-sm text-ink-soft">
          {TICKET_CATEGORY_LABEL[ticket.category as TicketCategory]} · {TICKET_MODULE_LABEL[ticket.relatedModule as TicketModule]} · Creado por{" "}
          {ticket.createdByName ?? "—"} el {new Date(ticket.createdAt).toLocaleString("es-CO")}
        </p>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <SlaStatusBadge status={ticket.slaStatus} />
          <span className="text-xs text-ink-soft">{FIRST_RESPONSE_TARGET_MESSAGE}</span>
        </div>
        {ticket.firstResponseAt ? (
          <p className="text-xs text-ink-soft">Primera respuesta: {new Date(ticket.firstResponseAt).toLocaleString("es-CO")}</p>
        ) : null}
      </header>

      <section className="space-y-2">
        <h2 className="eyebrow">Descripción inicial</h2>
        <p className="whitespace-pre-wrap rounded-lg border border-hairline bg-surface p-3 text-sm">{ticket.description}</p>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <AssignTicketForm ticketId={id} assignedTo={ticket.assignedTo} staff={assignableStaff} />
        <UpdateTicketPriorityForm ticketId={id} priority={ticket.priority} />
      </div>
      <UpdateTicketStatusForm ticketId={id} status={ticket.status} />

      <section className="space-y-3">
        <h2 className="eyebrow">Conversación</h2>
        <SupportTicketThread messages={messages} />
      </section>

      <section className="space-y-2">
        <h2 className="eyebrow">Responder</h2>
        <PlatformReplyForm ticketId={id} />
      </section>

      <InternalNoteForm ticketId={id} />

      <section className="space-y-3">
        <h2 className="eyebrow">Historial de estado</h2>
        <TicketStatusHistoryList history={history} />
      </section>
    </div>
  );
}
