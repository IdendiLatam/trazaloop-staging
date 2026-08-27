"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorAlert, InfoAlert } from "@/components/ui/alert";
import type { ReviewActionState } from "@/server/actions/quality-management-review";

/**
 * Trazaloop Quality · QUALITY-10 · Piezas compartidas de la Revisión por la
 * Dirección.
 *
 * El mensaje que devuelve el servidor se muestra tal cual. En este dominio
 * esos mensajes dicen cosas como «NO se creó ninguna acción» o «sin datos no
 * es cero»: reescribirlos como «Guardado» sería tirar justo la parte que
 * enseña a usar el sistema.
 */

export const initialState: ReviewActionState = { error: null };

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
  action: (prev: ReviewActionState, form: FormData) => Promise<ReviewActionState>;
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

export function Pill({ tone, children }: {
  tone: "neutral" | "warn" | "bad" | "good"; children: React.ReactNode;
}) {
  const cls = {
    neutral: "border-hairline text-ink-soft",
    good: "border-emerald-500/40 text-emerald-700 dark:text-emerald-400",
    warn: "border-amber-500/40 text-amber-700 dark:text-amber-400",
    bad: "border-red-500/40 text-red-700 dark:text-red-400",
  }[tone];
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] ${cls}`}>
      {children}
    </span>
  );
}

export function Counter({ label, value, tone }: {
  label: string; value: number | string; tone?: "warn" | "bad" | "good";
}) {
  const color = tone === "bad"
    ? "text-red-700 dark:text-red-400"
    : tone === "warn"
      ? "text-amber-700 dark:text-amber-400"
      : tone === "good"
        ? "text-emerald-700 dark:text-emerald-400"
        : "text-ink";
  return (
    <div className="rounded-lg border border-hairline bg-surface px-3 py-2">
      <p className="text-xs text-ink-soft">{label}</p>
      <p className={`text-xl font-semibold ${color}`}>{value}</p>
    </div>
  );
}

const TABS = [
  { key: "reviews", href: "/quality/management-review", label: "Revisiones" },
  { key: "followup", href: "/quality/management-review/followup", label: "Seguimiento" },
] as const;

/**
 * §91 · Dos entradas, no quince. La preparación, la sesión, el análisis y las
 * decisiones viven DENTRO de su revisión, porque fuera de ella no significan
 * nada: no existe «la agenda» sin decir de qué revisión.
 */
export function ReviewSubnav({ current }: { current: (typeof TABS)[number]["key"] }) {
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

/**
 * §92 · Las seis etapas del flujo. Se pintan como un camino, no como un
 * asistente: se puede volver a cualquiera mientras la revisión siga abierta.
 * Un asistente rígido obligaría a rehacer el recorrido entero para corregir
 * una frase del segundo paso.
 */
const STAGES = [
  { n: 1, label: "Preparar" },
  { n: 2, label: "Revisar entradas" },
  { n: 3, label: "Analizar" },
  { n: 4, label: "Decidir" },
  { n: 5, label: "Cerrar" },
  { n: 6, label: "Seguimiento" },
] as const;

export function StageTrail({ current }: { current: number }) {
  return (
    <div className="space-y-1">
      <ol className="flex flex-wrap items-center gap-1 text-xs">
        {STAGES.map((s, i) => (
          <li key={s.n} className="flex items-center gap-1">
            <span
              className={
                "rounded-full border px-2 py-0.5 "
                + (s.n === current
                  ? "border-loop/40 bg-loop/5 font-medium text-ink"
                  : s.n < current
                    ? "border-hairline text-ink"
                    : "border-hairline text-ink-soft")
              }
            >
              {s.n}. {s.label}
            </span>
            {i < STAGES.length - 1 ? <span className="text-ink-soft">→</span> : null}
          </li>
        ))}
      </ol>
      <p className="text-xs text-ink-soft">
        Puedes volver a cualquier etapa mientras la revisión siga abierta. No es un
        asistente: es el orden en el que el trabajo suele ocurrir.
      </p>
    </div>
  );
}
