// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupportTicketAction } from "@/server/actions/support";
import { TICKET_CATEGORY_LABEL, TICKET_MODULE_LABEL, FIRST_RESPONSE_TARGET_MESSAGE, type TicketCategory, type TicketModule } from "@/lib/domain/support";
import { TicketStatusBadge, TicketPriorityBadge, SlaStatusBadge } from "@/components/domain/support/ticket-badges";
import { SupportTicketThread } from "@/components/domain/support/support-ticket-thread";
import { ReplySupportTicketForm, ReopenSupportTicketButton } from "@/components/domain/support/support-ticket-reply-forms";
import { InfoAlert } from "@/components/ui/alert";

export default async function SupportTicketDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { id } = await params;
  const { created } = await searchParams;
  const { ticket, messages, canReopen } = await getSupportTicketAction(id);
  if (!ticket) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <p className="eyebrow">
          <Link href="/support" className="hover:underline">
            Centro de soporte
          </Link>
        </p>
        {created === "1" ? <InfoAlert message="Ticket creado correctamente." /> : null}
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{ticket.subject}</h1>
          <TicketStatusBadge status={ticket.status} />
          <TicketPriorityBadge priority={ticket.priority} />
        </div>
        <p className="text-sm text-ink-soft">
          {TICKET_CATEGORY_LABEL[ticket.category as TicketCategory]} · {TICKET_MODULE_LABEL[ticket.relatedModule as TicketModule]} · Creado{" "}
          {new Date(ticket.createdAt).toLocaleString("es-CO")}
        </p>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <SlaStatusBadge status={ticket.slaStatus} />
          <span className="text-xs text-ink-soft">{FIRST_RESPONSE_TARGET_MESSAGE}</span>
        </div>
        {ticket.firstResponseAt ? (
          <p className="text-xs text-ink-soft">
            Primera respuesta: {new Date(ticket.firstResponseAt).toLocaleString("es-CO")}
          </p>
        ) : null}
      </header>

      <section className="space-y-2">
        <h2 className="eyebrow">Descripción inicial</h2>
        <p className="whitespace-pre-wrap rounded-lg border border-hairline bg-surface p-3 text-sm">{ticket.description}</p>
      </section>

      <section className="space-y-3">
        <h2 className="eyebrow">Conversación</h2>
        <SupportTicketThread messages={messages} />
      </section>

      {canReopen ? (
        <ReopenSupportTicketButton ticketId={id} />
      ) : (
        <section className="space-y-2">
          <h2 className="eyebrow">Responder</h2>
          <ReplySupportTicketForm ticketId={id} />
        </section>
      )}
    </div>
  );
}
