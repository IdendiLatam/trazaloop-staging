"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorAlert, InfoAlert } from "@/components/ui/alert";
import type { AuditActionState } from "@/server/actions/quality-audits";

/**
 * Trazaloop Quality · QUALITY-09 · Piezas compartidas de Auditorías.
 *
 * El mensaje que devuelve el servidor se muestra tal cual. En este dominio esos
 * mensajes dicen cosas como «un hallazgo no es una no conformidad» o «auditoría
 * cerrada no significa acciones eficaces»: reescribirlos como «Guardado» sería
 * tirar justo la parte que enseña a usar el sistema.
 */

export const initialState: AuditActionState = { error: null };

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
  action: (prev: AuditActionState, form: FormData) => Promise<AuditActionState>;
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
      {/* AR-11 · Lo que la comprobación encontró se enseña aquí mismo, sin
          convertirse en una declaración de independencia. */}
      {state.independence ? <IndependenceResult result={state.independence} /> : null}
      <Button type="submit" disabled={disabled || pending}>
        {pending ? "Guardando…" : submitLabel}
      </Button>
    </form>
  );
}

function IndependenceResult({ result }: { result: Record<string, unknown> }) {
  const conflicts = Array.isArray(result.conflicts)
    ? (result.conflicts as Record<string, string>[]) : [];
  return (
    <div className="rounded-md border border-hairline bg-canvas px-3 py-2 space-y-1.5">
      <p className="text-xs font-medium text-ink">
        Comprobación al {String(result.reference_date ?? "—")}
      </p>
      <p className="text-xs text-ink-soft">
        El sistema NO declara la independencia. Esto es lo que encontró.
      </p>
      {conflicts.length === 0
        ? <p className="text-xs text-ink">Sin conflictos detectados.</p>
        : (
          <ul className="space-y-1">
            {conflicts.map((c, i) => (
              <li key={i} className="text-xs text-ink">
                <span className="font-medium">{c.person_name}</span> — {c.detail}
              </li>
            ))}
          </ul>
        )}
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

const TABS = [
  { key: "summary", href: "/quality/audits", label: "Resumen" },
  { key: "programs", href: "/quality/audits/programs", label: "Programa" },
  { key: "audits", href: "/quality/audits/list", label: "Auditorías" },
  { key: "findings", href: "/quality/audits/findings", label: "Hallazgos" },
  { key: "checklists", href: "/quality/audits/checklists", label: "Checklists" },
] as const;

/**
 * §68 · Cinco entradas. La agenda, el equipo, la evidencia y el informe viven
 * DENTRO de la auditoría, porque fuera de ella no significan nada.
 */
export function AuditSubnav({ current }: { current: (typeof TABS)[number]["key"] }) {
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
