"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorAlert, InfoAlert } from "@/components/ui/alert";
import type { AutomationActionState } from "@/server/actions/quality-automation";

/**
 * Trazaloop Quality · QUALITY-11 · Piezas compartidas de la Automatización.
 *
 * El mensaje del servidor se muestra tal cual. En este dominio esos mensajes
 * dicen cosas como «no se creó ninguna señal: era una simulación» o «lo vi no
 * es lo resolví»: reescribirlos como «Guardado» tiraría justo la parte que
 * enseña a usar el motor.
 */

export const initialState: AutomationActionState = { error: null };

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
  action: (prev: AutomationActionState, form: FormData) => Promise<AutomationActionState>;
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
      {state.validation && state.validation.length > 1 ? (
        <ul className="space-y-0.5">
          {state.validation.map((v) => (
            <li key={v} className="text-xs text-red-700 dark:text-red-400">· {v}</li>
          ))}
        </ul>
      ) : null}
      {state.success && state.message ? <InfoAlert message={state.message} /> : null}
      {/* §144 · Las tres cifras que hacen comprobable la promesa de la simulación. */}
      {state.simulation ? <SimulationResult result={state.simulation} /> : null}
      <Button type="submit" disabled={disabled || pending}>
        {pending ? "Guardando…" : submitLabel}
      </Button>
    </form>
  );
}

function SimulationResult({ result }: { result: Record<string, unknown> }) {
  const ejemplos = Array.isArray(result.examples)
    ? (result.examples as Record<string, unknown>[]) : [];
  return (
    <div className="space-y-2 rounded-md border border-loop/30 bg-loop/5 px-3 py-2">
      <p className="text-xs font-medium text-ink">
        {String(result.matches ?? 0)} coincidencia(s) de{" "}
        {String(result.subjects_evaluated ?? 0)} sujeto(s), al{" "}
        {String(result.business_date ?? "")}
      </p>
      <p className="text-xs text-ink-soft">
        Señales creadas: {String(result.signals_created ?? 0)} · Alertas:{" "}
        {String(result.alerts_created ?? 0)} · Tareas: {String(result.tasks_created ?? 0)}
      </p>
      {ejemplos.length > 0 ? (
        <ul className="space-y-0.5">
          {ejemplos.map((e, i) => (
            <li key={i} className="text-xs text-ink">
              · {String(e.label ?? "—")}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-xs text-ink-soft">{String(result.note ?? "")}</p>
    </div>
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
  { key: "home", href: "/quality/automation", label: "Resumen" },
  { key: "rules", href: "/quality/automation/rules", label: "Reglas" },
  { key: "signals", href: "/quality/automation/signals", label: "Señales" },
  { key: "runs", href: "/quality/automation/runs", label: "Ejecuciones" },
] as const;

/** §73 · Cuatro entradas. Las versiones, las condiciones y las supresiones
 *  viven DENTRO de su regla o de su señal, porque fuera no significan nada. */
export function AutomationSubnav({ current }: { current: (typeof TABS)[number]["key"] }) {
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
