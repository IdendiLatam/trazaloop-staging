"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorAlert, SuccessAlert } from "@/components/ui/alert";
import { formatDate } from "@/lib/domain/document-control";
import {
  closePeriodAction, reopenPeriodAction, type QualityIndicatorActionState,
} from "@/server/actions/quality-indicators";

/**
 * Trazaloop Quality · QUALITY-03 · Cierre del ciclo de gestión (OI-24, OI-27).
 *
 * Cerrar un periodo congela sus resultados: dejan de ser preliminares y no se
 * recalculan porque cambie una meta, un responsable o una fórmula. Reabrir es
 * una decisión formal y exige motivo (OI-12).
 */

const initial: QualityIndicatorActionState = { error: null };
const inputClass =
  "block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink focus:border-loop";

export type ClosureRow = {
  id: string;
  label: string;
  periodStart: string;
  periodEnd: string;
  note: string | null;
  closedAt: string;
  closedByName: string | null;
  reopenedAt: string | null;
  reopenReason: string | null;
};

export function QualityPeriodClosures({
  closures, canClose, canReopen, suggested,
}: {
  closures: ClosureRow[];
  canClose: boolean;
  canReopen: boolean;
  suggested: { label: string; start: string; end: string };
}) {
  const [closeState, closeAction, closePending] = useActionState(closePeriodAction, initial);
  const [reopenState, reopenAction, reopenPending] = useActionState(reopenPeriodAction, initial);

  return (
    <section className="space-y-3 rounded-lg border border-hairline bg-surface p-4">
      <h2 className="text-sm font-semibold">Ciclo de gestión</h2>
      <p className="text-xs text-ink-soft">
        Al cerrar un periodo sus resultados quedan fijos. A partir de ahí, cambiar una meta o una
        fórmula ya no puede alterar lo que se evaluó: para corregir algo hay que reabrirlo
        explicando por qué.
      </p>

      {closures.length > 0 ? (
        <ul className="divide-y divide-hairline">
          {closures.map((c) => (
            <li key={c.id} className="flex flex-wrap items-baseline gap-2 py-2 text-xs">
              <span className="font-medium">{c.label}</span>
              <span className="text-ink-soft">
                {formatDate(c.periodStart)} a {formatDate(c.periodEnd)}
              </span>
              {c.reopenedAt ? (
                <span className="text-amber">
                  Reabierto el {formatDate(c.reopenedAt)} · «{c.reopenReason}»
                </span>
              ) : (
                <span className="text-loop-deep">
                  Cerrado el {formatDate(c.closedAt)}{c.closedByName ? ` por ${c.closedByName}` : ""}
                </span>
              )}
              {c.note ? <span className="w-full text-ink-soft">{c.note}</span> : null}
              {canReopen && !c.reopenedAt ? (
                <form action={reopenAction} className="flex w-full items-end gap-2 pt-1">
                  <input type="hidden" name="closure_id" value={c.id} />
                  <label className="flex-1">
                    <span className="mb-1 block text-[11px] font-medium">Motivo de la reapertura</span>
                    <input name="reason" required className={inputClass} />
                  </label>
                  <Button
                    type="submit" disabled={reopenPending} variant="quiet"
                    className="w-auto px-3 py-1.5 text-xs"
                  >
                    {reopenPending ? "Reabriendo…" : "Reabrir"}
                  </Button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-ink-soft">Todavía no se ha cerrado ningún periodo.</p>
      )}

      <ErrorAlert message={closeState.error ?? reopenState.error} />
      {closeState.success ? <SuccessAlert message={closeState.message ?? null} /> : null}
      {reopenState.success ? <SuccessAlert message={reopenState.message ?? null} /> : null}

      {canClose ? (
        <form action={closeAction} className="grid gap-3 border-t border-hairline pt-3 sm:grid-cols-4 sm:items-end">
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium">Nombre del periodo</span>
            <input name="label" required defaultValue={suggested.label} className={inputClass} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium">Desde</span>
            <input type="date" name="period_start" required defaultValue={suggested.start} className={inputClass} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium">Hasta</span>
            <input type="date" name="period_end" required defaultValue={suggested.end} className={inputClass} />
          </label>
          <Button type="submit" disabled={closePending} variant="quiet" className="w-auto px-3 py-1.5 text-xs">
            {closePending ? "Cerrando…" : "Cerrar periodo"}
          </Button>
          <label className="block sm:col-span-4">
            <span className="mb-1 block text-[11px] font-medium">Nota (opcional)</span>
            <input name="note" className={inputClass} />
          </label>
        </form>
      ) : null}
    </section>
  );
}
