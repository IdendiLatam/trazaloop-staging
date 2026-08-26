"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorAlert, InfoAlert } from "@/components/ui/alert";
import type { PeopleActionState } from "@/server/actions/quality-people";

/**
 * Trazaloop Quality · QUALITY-06 · Piezas compartidas de las pantallas de
 * Personas.
 *
 * Están aquí y no repetidas en cada vista por una razón concreta: todas estas
 * pantallas escriben sobre datos de personas, y el mensaje que devuelve el
 * servidor —incluida la negativa— tiene que verse SIEMPRE igual. Un formulario
 * que se traga el error deja al usuario creyendo que guardó.
 */

export const initialState: PeopleActionState = { error: null };

export const inputClass =
  "block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink "
  + "placeholder:text-ink-soft/60 focus:border-loop";

export function Field({
  label, hint, children,
}: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-ink">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-ink-soft">{hint}</span> : null}
    </label>
  );
}

export function Card({
  title, description, action, children,
}: {
  title: string; description?: string;
  action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-hairline bg-surface p-4 space-y-3">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {description ? <p className="text-xs text-ink-soft">{description}</p> : null}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

/**
 * Un formulario contra una acción de servidor.
 *
 * El resultado se muestra tal cual llega. Los mensajes de este dominio dicen
 * cosas como «la eficacia sigue pendiente» o «la persona conserva su historia»:
 * reescribirlos en la pantalla los volvería a convertir en «Guardado».
 */
export function ActionForm({
  action, submitLabel, children, disabled, className,
}: {
  action: (prev: PeopleActionState, form: FormData) => Promise<PeopleActionState>;
  submitLabel: string;
  children?: React.ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  return (
    <form action={formAction} className={className ?? "space-y-3"}>
      {children}
      {state.error ? <ErrorAlert message={state.error} /> : null}
      {state.success && state.message ? <InfoAlert message={state.message} /> : null}
      <Button type="submit" disabled={disabled || pending}>
        {pending ? "Guardando…" : submitLabel}
      </Button>
    </form>
  );
}

export function Table({
  headers, rows, empty,
}: { headers: string[]; rows: React.ReactNode[][]; empty: string }) {
  if (rows.length === 0) {
    return <p className="text-xs text-ink-soft">{empty}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-hairline text-ink-soft">
            {headers.map((h) => <th key={h} className="py-1.5 pr-3 font-medium">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-hairline/60 last:border-0">
              {r.map((c, j) => <td key={j} className="py-1.5 pr-3 align-top text-ink">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * El aviso que acompaña a casi todo en este dominio.
 *
 * No es decoración: las cuatro frases que aparecen aquí son exactamente las
 * cuatro confusiones que este módulo existe para evitar, y aparecen en la
 * pantalla donde cada una se produce.
 */
export function DomainNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-hairline bg-canvas px-3 py-2 text-xs text-ink-soft">
      {children}
    </p>
  );
}
