"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorAlert, InfoAlert } from "@/components/ui/alert";
import type { VoiceActionState } from "@/server/actions/quality-customer-voice";

/**
 * Trazaloop Quality · QUALITY-08 · Piezas compartidas de la Voz del Cliente.
 *
 * El mensaje que devuelve el servidor se muestra tal cual. En este dominio esos
 * mensajes dicen cosas como «NO es una no conformidad» o «cero respuestas no es
 * cero satisfacción»: reescribirlos como «Guardado» sería tirar justo la parte
 * que enseña a usar el sistema.
 */

export const initialState: VoiceActionState = { error: null };

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

export function ActionForm({
  action, submitLabel, children, disabled, className,
}: {
  action: (prev: VoiceActionState, form: FormData) => Promise<VoiceActionState>;
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
      {/* §66 · El enlace se enseña UNA vez, aquí, y no se guarda en ninguna
          parte: la base solo tiene su huella. */}
      {state.token ? (
        <p className="break-all rounded-md border border-loop/30 bg-loop/5 px-3 py-2 font-mono text-xs text-ink">
          {surveyLink(state.token)}
        </p>
      ) : null}
      <Button type="submit" disabled={disabled || pending}>
        {pending ? "Guardando…" : submitLabel}
      </Button>
    </form>
  );
}

/** El enlace completo que se le manda al cliente. Se compone en el navegador a
 *  partir del origen real, así que funciona igual en Preview y en producción. */
export function surveyLink(token: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/survey/${token}`;
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
 * El aviso que acompaña a casi todo en este dominio. Las frases que aparecen
 * aquí son exactamente las confusiones que el módulo existe para evitar, y
 * aparecen en la pantalla donde cada una se produce.
 */
export function DomainNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-hairline bg-canvas px-3 py-2 text-xs text-ink-soft">
      {children}
    </p>
  );
}

const TABS = [
  { key: "summary", href: "/quality/customer-voice", label: "Resumen" },
  { key: "customers", href: "/quality/customer-voice/customers", label: "Clientes" },
  { key: "surveys", href: "/quality/customer-voice/surveys", label: "Encuestas" },
  { key: "campaigns", href: "/quality/customer-voice/campaigns", label: "Campañas" },
  { key: "feedback", href: "/quality/customer-voice/feedback", label: "Retroalimentación" },
] as const;

/**
 * §90 · Cinco entradas. Métricas, temas y cierres de periodo son configuración
 * del dominio y viven dentro: un módulo con quince opciones no se explora, se
 * sufre.
 */
export function VoiceSubnav({ current }: { current: (typeof TABS)[number]["key"] }) {
  return (
    <nav className="flex flex-wrap gap-1 border-b border-hairline pb-2">
      {TABS.map((t) => (
        <a
          key={t.key}
          href={t.href}
          aria-current={t.key === current ? "page" : undefined}
          className={
            "rounded-md px-3 py-1.5 text-sm "
            + (t.key === current
              ? "bg-canvas font-medium text-ink"
              : "text-ink-soft hover:text-ink")
          }
        >
          {t.label}
        </a>
      ))}
    </nav>
  );
}
