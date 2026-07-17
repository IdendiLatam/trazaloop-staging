"use client";

import { useActionState } from "react";
import { replySupportTicketAction, reopenSupportTicketAction, type SupportActionState } from "@/server/actions/support";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/alert";

const initial: SupportActionState = { error: null };

export function ReplySupportTicketForm({ ticketId }: { ticketId: string }) {
  const [state, formAction, pending] = useActionState(replySupportTicketAction, initial);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="ticket_id" value={ticketId} />
      <ErrorAlert message={state.error} />
      <textarea
        name="body"
        required
        rows={3}
        placeholder="Escribe tu respuesta…"
        className="block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink focus:border-loop"
      />
      <Button type="submit" disabled={pending} className="!w-auto">
        {pending ? "Enviando…" : "Enviar respuesta"}
      </Button>
    </form>
  );
}

export function ReopenSupportTicketButton({ ticketId }: { ticketId: string }) {
  const [state, formAction, pending] = useActionState(reopenSupportTicketAction, initial);

  return (
    <div className="space-y-2">
      <ErrorAlert message={state.error} />
      <form action={formAction}>
        <input type="hidden" name="ticket_id" value={ticketId} />
        <input type="hidden" name="note" value="Reabierto por la empresa." />
        <Button type="submit" disabled={pending} className="!w-auto">
          {pending ? "Reabriendo…" : "Reabrir ticket"}
        </Button>
      </form>
    </div>
  );
}
