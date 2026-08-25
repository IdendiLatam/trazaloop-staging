"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import {
  CASE_ORIGIN_LABEL, CASE_STATUS_LABEL, CASE_TYPE_LABEL,
  CLASSIFICATION_LABEL, PRIORITY_LABEL, SELECTABLE_CASE_TYPES, PRIORITIES,
  type CaseOrigin, type CaseStatus, type CaseType, type Classification, type Priority,
} from "@/lib/domain/work-cases";
import { createCaseAction, scanPendingActionsAction, type CaseActionState } from "@/server/actions/work-cases";
import { ClassificationBadge, CaseStatusBadge } from "./case-badges";

const initial: CaseActionState = { error: null };
const inputClass =
  "block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-soft/60 focus:border-loop";

export type CaseListRow = {
  caseId: string; code: string; title: string;
  caseType: CaseType; originKind: CaseOrigin;
  classification: Classification; status: CaseStatus; priority: Priority;
  detectedOn: string; processNames: string; ownerLabel: string;
  openActionCount: number; overdueActionCount: number; pendingEffectivenessCount: number;
};

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-ink">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-ink-soft">{hint}</span> : null}
    </label>
  );
}

/**
 * Trazaloop Quality · QUALITY-04 · Casos y acciones.
 *
 * El listado responde de un vistazo las preguntas que importan: qué pasó, si
 * alguien ya decidió si es no conformidad, quién responde y qué está vencido.
 * Los filtros son los que se usan de verdad; no hay una barra de veinte.
 */
export function QualityCasesView({
  cases, positions, processes, canManage, prefill,
}: {
  cases: CaseListRow[];
  positions: { id: string; name: string; holderName: string | null }[];
  processes: { id: string; name: string }[];
  canManage: boolean;
  /** Cuando el caso nace de una señal: qué referencia y qué contexto congela. */
  prefill?: { refKind: string; refId: string; snapshot: string; originKind: string; label: string } | null;
}) {
  const [state, formAction, pending] = useActionState(createCaseAction, initial);
  const [scanState, scanAction, scanPending] = useActionState(scanPendingActionsAction, initial);
  const [filter, setFilter] = useState<"all" | "open" | "nc" | "overdue">("open");

  const shown = cases.filter((c) => {
    if (filter === "open") return c.status !== "closed";
    if (filter === "nc") return c.classification === "nonconformity";
    if (filter === "overdue") return c.overdueActionCount > 0;
    return true;
  });

  const counts = {
    all: cases.length,
    open: cases.filter((c) => c.status !== "closed").length,
    nc: cases.filter((c) => c.classification === "nonconformity").length,
    overdue: cases.filter((c) => c.overdueActionCount > 0).length,
  };

  return (
    <div className="max-w-5xl space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">Trazaloop Quality</p>
        <h1 className="text-2xl font-semibold tracking-tight">Casos y acciones</h1>
        <p className="max-w-3xl text-sm text-ink-soft">
          Un caso es lo que hay que atender: qué pasó, si incumple algo, qué se hizo y qué
          se hará para que no se repita. Que un indicador quede fuera de meta o que un
          documento venza son <strong>señales</strong>: alguien decide si abren un caso, y
          si ese caso es una no conformidad.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {([["open", "Abiertos"], ["nc", "No conformidades"], ["overdue", "Con vencidos"], ["all", "Todos"]] as const)
          .map(([key, label]) => (
            <button
              key={key} type="button" onClick={() => setFilter(key)}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
                filter === key ? "border-loop bg-loop/10 text-loop-deep" : "border-hairline bg-surface text-ink-soft"
              }`}
            >
              {label} · {counts[key]}
            </button>
          ))}
        <form action={scanAction} className="ml-auto">
          <Button type="submit" disabled={scanPending} variant="quiet" className="w-auto px-3 py-1.5 text-xs">
            {scanPending ? "Revisando…" : "Revisar pendientes"}
          </Button>
        </form>
      </div>
      <ErrorAlert message={scanState.error} />

      {canManage ? (
        <details className="rounded-lg border border-hairline bg-surface p-4" open={!!prefill}>
          <summary className="cursor-pointer text-sm font-medium text-loop">Registrar un caso</summary>
          <form action={formAction} className="mt-3 space-y-3">
            <h3 className="text-sm font-semibold">Nuevo caso</h3>
            <p className="text-xs text-ink-soft">
              Registra primero lo que pasó. Evaluar si es una no conformidad viene después,
              y lo hace quien tiene esa autoridad.
            </p>
            <ErrorAlert message={state.error} />
            {prefill ? (
              <div className="rounded-md border border-loop/30 bg-loop/5 p-3 text-xs">
                <p className="font-medium text-loop-deep">Este caso nacerá de una señal</p>
                <p className="mt-0.5 text-ink">{prefill.label}</p>
                <p className="mt-0.5 text-ink-soft">
                  El caso apuntará al indicador y guardará el contexto de hoy. Que la señal
                  exista no lo convierte en no conformidad: eso se evalúa después.
                </p>
                <input type="hidden" name="ref_kind" value={prefill.refKind} />
                <input type="hidden" name="ref_id" value={prefill.refId} />
                <input type="hidden" name="ref_snapshot" value={prefill.snapshot} />
                <input type="hidden" name="origin_kind" value={prefill.originKind} />
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Título">
                <input name="title" required maxLength={200} className={inputClass}
                       placeholder="Ej.: Revisión documental vencida" />
              </Field>
              <Field label="Tipo">
                <select name="case_type" defaultValue="issue" className={inputClass}>
                  {SELECTABLE_CASE_TYPES.map((t) => (
                    <option key={t} value={t}>{CASE_TYPE_LABEL[t]}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Qué pasó (opcional)">
              <textarea name="description" rows={2} className={inputClass}
                        placeholder="El contexto que necesitará quien lo evalúe." />
            </Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Detectado el">
                <input type="date" name="detected_on" className={inputClass}
                       defaultValue={new Date().toISOString().slice(0, 10)} />
              </Field>
              <Field label="Responsable (cargo)" hint="Cuando alguien cambia de puesto, el caso conserva su dueño.">
                <select name="owner_position_id" defaultValue="" className={inputClass}>
                  <option value="">— sin asignar —</option>
                  {positions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}{p.holderName ? ` · ${p.holderName}` : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Prioridad">
                <select name="priority" defaultValue="normal" className={inputClass}>
                  {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Proceso relacionado (opcional)">
              <select name="process_id" defaultValue="" className={inputClass}>
                <option value="">— ninguno —</option>
                {processes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Button type="submit" disabled={pending} className="w-auto px-4 py-2 text-sm">
              {pending ? "Creando…" : "Crear caso"}
            </Button>
          </form>
        </details>
      ) : null}

      {shown.length === 0 ? (
        <EmptyState
          title={cases.length === 0 ? "Todavía no hay casos" : "Nada con ese filtro"}
          description={
            cases.length === 0
              ? "Un caso se registra cuando algo hay que atender. También puede nacer de un indicador fuera de meta o de un documento vencido."
              : "Prueba con otro filtro."
          }
        />
      ) : (
        <ul className="space-y-2">
          {shown.map((c) => (
            <li key={c.caseId}>
              <Link
                href={`/quality/cases/${c.caseId}`}
                className="block rounded-lg border border-hairline bg-surface p-4 transition-colors hover:border-loop"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-ink-soft">{c.code}</span>
                  <span className="text-sm font-semibold">{c.title}</span>
                  <ClassificationBadge value={c.classification} />
                  <CaseStatusBadge value={c.status} />
                </div>
                <p className="mt-1 text-xs text-ink-soft">
                  {CASE_TYPE_LABEL[c.caseType]} · Origen: {CASE_ORIGIN_LABEL[c.originKind]} ·
                  Detectado el {c.detectedOn}
                  {c.processNames ? ` · ${c.processNames}` : ""}
                  {c.ownerLabel ? ` · ${c.ownerLabel}` : ""}
                </p>
                {(c.openActionCount > 0 || c.overdueActionCount > 0 || c.pendingEffectivenessCount > 0) && (
                  <p className="mt-1 text-xs text-ink">
                    {c.overdueActionCount > 0 && (
                      <span className="font-medium text-amber">
                        {c.overdueActionCount} {c.overdueActionCount === 1 ? "acción vencida" : "acciones vencidas"}
                      </span>
                    )}
                    {c.overdueActionCount > 0 && (c.openActionCount > 0 || c.pendingEffectivenessCount > 0) ? " · " : ""}
                    {c.openActionCount > 0 && `${c.openActionCount} en curso`}
                    {c.openActionCount > 0 && c.pendingEffectivenessCount > 0 ? " · " : ""}
                    {c.pendingEffectivenessCount > 0 &&
                      `${c.pendingEffectivenessCount} ${c.pendingEffectivenessCount === 1 ? "eficacia pendiente" : "eficacias pendientes"}`}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-ink-soft">
        La <strong>clasificación</strong> dice si algo incumple un requisito; el{" "}
        <strong>estado</strong> dice en qué punto del ciclo va. Son cosas distintas:
        un caso abierto puede no ser una no conformidad, y una no conformidad puede
        estar cerrada. {CLASSIFICATION_LABEL.pending} significa que todavía nadie ha decidido.
        {" "}{CASE_STATUS_LABEL.closed} significa que el ciclo terminó.
      </p>
    </div>
  );
}
