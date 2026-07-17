"use client";

import { useActionState } from "react";
import {
  assignSupportTicketAction,
  assignSupportTicketToMeAction,
  updateSupportTicketStatusAction,
  updateSupportTicketPriorityAction,
  replyPlatformSupportTicketAction,
  addInternalSupportNoteAction,
  type SupportActionState,
} from "@/server/actions/support";
import { TICKET_STATUSES, TICKET_STATUS_LABEL, TICKET_PRIORITIES, TICKET_PRIORITY_LABEL } from "@/lib/domain/support";
import { SelectField } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/alert";

const initial: SupportActionState = { error: null };

export function AssignTicketForm({
  ticketId,
  assignedTo,
  staff,
}: {
  ticketId: string;
  assignedTo: string | null;
  staff: { userId: string; name: string | null; email: string }[];
}) {
  const [state, formAction, pending] = useActionState(assignSupportTicketAction, initial);
  const [meState, meAction, mePending] = useActionState(assignSupportTicketToMeAction, initial);

  return (
    <div className="space-y-2 rounded-lg border border-hairline bg-surface p-4">
      <h3 className="text-sm font-semibold">Asignación</h3>
      <ErrorAlert message={state.error ?? meState.error} />
      <form action={formAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="ticket_id" value={ticketId} />
        <div className="min-w-[14rem]">
          <SelectField
            label="Asignar a"
            name="assignee_id"
            options={staff.map((s) => ({ value: s.userId, label: s.name ?? s.email }))}
            placeholder="Sin asignar"
            defaultValue={assignedTo ?? ""}
          />
        </div>
        <Button type="submit" disabled={pending} className="!w-auto">
          {pending ? "Guardando…" : "Guardar"}
        </Button>
      </form>
      <form action={meAction}>
        <input type="hidden" name="ticket_id" value={ticketId} />
        <button type="submit" disabled={mePending} className="text-sm text-loop hover:underline disabled:opacity-60">
          {mePending ? "Asignando…" : "Asignarme"}
        </button>
      </form>
    </div>
  );
}

export function UpdateTicketStatusForm({ ticketId, status }: { ticketId: string; status: string }) {
  const [state, formAction, pending] = useActionState(updateSupportTicketStatusAction, initial);

  return (
    <form action={formAction} className="space-y-2 rounded-lg border border-hairline bg-surface p-4">
      <input type="hidden" name="ticket_id" value={ticketId} />
      <h3 className="text-sm font-semibold">Estado</h3>
      <ErrorAlert message={state.error} />
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[12rem]">
          <SelectField
            label="Cambiar a"
            name="status"
            options={TICKET_STATUSES.map((s) => ({ value: s, label: TICKET_STATUS_LABEL[s] }))}
            defaultValue={status}
          />
        </div>
        <Button type="submit" disabled={pending} className="!w-auto">
          {pending ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </form>
  );
}

export function UpdateTicketPriorityForm({ ticketId, priority }: { ticketId: string; priority: string }) {
  const [state, formAction, pending] = useActionState(updateSupportTicketPriorityAction, initial);

  return (
    <form action={formAction} className="space-y-2 rounded-lg border border-hairline bg-surface p-4">
      <input type="hidden" name="ticket_id" value={ticketId} />
      <h3 className="text-sm font-semibold">Prioridad</h3>
      <ErrorAlert message={state.error} />
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[12rem]">
          <SelectField
            label="Cambiar a"
            name="priority"
            options={TICKET_PRIORITIES.map((p) => ({ value: p, label: TICKET_PRIORITY_LABEL[p] }))}
            defaultValue={priority}
          />
        </div>
        <Button type="submit" disabled={pending} className="!w-auto">
          {pending ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </form>
  );
}

export function PlatformReplyForm({ ticketId }: { ticketId: string }) {
  const [state, formAction, pending] = useActionState(replyPlatformSupportTicketAction, initial);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="ticket_id" value={ticketId} />
      <ErrorAlert message={state.error} />
      <textarea
        name="body"
        required
        rows={3}
        placeholder="Responder a la empresa…"
        className="block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink focus:border-loop"
      />
      <Button type="submit" disabled={pending} className="!w-auto">
        {pending ? "Enviando…" : "Responder a la empresa"}
      </Button>
    </form>
  );
}

export function InternalNoteForm({ ticketId }: { ticketId: string }) {
  const [state, formAction, pending] = useActionState(addInternalSupportNoteAction, initial);

  return (
    <form action={formAction} className="space-y-2 rounded-lg border border-amber/40 bg-amber/5 p-3">
      <input type="hidden" name="ticket_id" value={ticketId} />
      <p className="text-xs font-medium text-amber">Nota interna — nunca visible para la empresa</p>
      <ErrorAlert message={state.error} />
      <textarea
        name="body"
        required
        rows={2}
        placeholder="Nota interna para el equipo de soporte…"
        className="block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink focus:border-loop"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-amber/40 bg-amber/10 px-3 py-1.5 text-sm font-medium text-amber hover:bg-amber/20 disabled:opacity-60"
      >
        {pending ? "Guardando…" : "Agregar nota interna"}
      </button>
    </form>
  );
}
