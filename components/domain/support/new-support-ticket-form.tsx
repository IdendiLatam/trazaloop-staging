"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSupportTicketAction } from "@/server/actions/support";
import type { SupportActionState } from "@/server/actions/support";
import { TICKET_CATEGORIES, TICKET_CATEGORY_LABEL, TICKET_MODULES, TICKET_MODULE_LABEL, TICKET_PRIORITIES, TICKET_PRIORITY_LABEL, FIRST_RESPONSE_TARGET_MESSAGE } from "@/lib/domain/support";
import { Field, SelectField } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { ErrorAlert, InfoAlert } from "@/components/ui/alert";

const initial: SupportActionState = { error: null };
const CATEGORY_OPTIONS = TICKET_CATEGORIES.map((c) => ({ value: c, label: TICKET_CATEGORY_LABEL[c] }));
const MODULE_OPTIONS = TICKET_MODULES.map((m) => ({ value: m, label: TICKET_MODULE_LABEL[m] }));
const PRIORITY_OPTIONS = TICKET_PRIORITIES.map((p) => ({ value: p, label: TICKET_PRIORITY_LABEL[p] }));

export function NewSupportTicketForm({
  defaultModule = "other",
  defaultCategory = "technical_support",
}: {
  defaultModule?: string;
  defaultCategory?: string;
}) {
  const [state, formAction, pending] = useActionState(createSupportTicketAction, initial);
  const router = useRouter();

  useEffect(() => {
    if (state.success && state.ticketId) {
      router.push(`/support/${state.ticketId}?created=1`);
    }
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-4">
      <ErrorAlert message={state.error} />
      <InfoAlert message={FIRST_RESPONSE_TARGET_MESSAGE} />

      <Field label="Asunto" name="subject" required placeholder="Ej.: No puedo crear un documento" />
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink">Descripción</span>
        <textarea
          name="description"
          required
          rows={5}
          placeholder="Cuéntanos qué pasó, qué esperabas y qué módulo estabas usando."
          className="block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink focus:border-loop"
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField label="Categoría" name="category" options={CATEGORY_OPTIONS} defaultValue={defaultCategory} />
        <SelectField label="Módulo relacionado" name="related_module" options={MODULE_OPTIONS} defaultValue={defaultModule} />
        <SelectField label="Prioridad" name="priority" options={PRIORITY_OPTIONS} defaultValue="normal" />
      </div>

      <Button type="submit" disabled={pending} className="!w-auto">
        {pending ? "Creando…" : "Crear ticket"}
      </Button>
    </form>
  );
}
