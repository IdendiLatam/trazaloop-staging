"use client";

import { useActionState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ErrorAlert, InfoAlert, SuccessAlert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import {
  ObjectivePerformanceBadge, ObjectiveStateBadge,
} from "@/components/domain/quality/performance-badges";
import { formatDate } from "@/lib/domain/document-control";
import {
  OBJECTIVE_RULES, OBJECTIVE_RULE_LABEL, OBJECTIVE_RULE_HELP,
  type ObjectiveAdminState, type ObjectivePerformance,
} from "@/lib/domain/quality-indicators";
import {
  createObjectiveAction, scanPendingMeasurementsAction,
  type QualityIndicatorActionState,
} from "@/server/actions/quality-indicators";

/**
 * Trazaloop Quality · QUALITY-03 · Objetivos.
 *
 * Es una herramienta de gestión, no un tablero de indicadores: lo que se ve de
 * un vistazo es quién responde por cada objetivo, en qué periodo, cómo va y
 * qué está esperando por alguien.
 */

const initial: QualityIndicatorActionState = { error: null };
const inputClass =
  "block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-soft/60 focus:border-loop";

export type ObjectiveListRow = {
  objectiveId: string;
  code: string | null;
  name: string;
  adminState: ObjectiveAdminState;
  periodStart: string;
  periodEnd: string;
  ownerLabel: string;
  indicatorCount: number;
  indicatorsNotMet: number;
  indicatorsAttention: number;
  indicatorsPendingMeasurement: number;
  processNames: string;
  performance: ObjectivePerformance;
  performanceExplanation: string;
};

export function QualityObjectivesView({
  objectives, positions, processes, canManage, thisYear,
}: {
  objectives: ObjectiveListRow[];
  positions: { id: string; name: string; holderName: string | null }[];
  processes: { id: string; name: string }[];
  canManage: boolean;
  thisYear: { start: string; end: string };
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createObjectiveAction, initial);
  const [scanState, scanAction, scanPending] = useActionState(scanPendingMeasurementsAction, initial);

  useEffect(() => {
    if (state.success && state.objectiveId) router.push(`/quality/objectives/${state.objectiveId}`);
  }, [state.success, state.objectiveId, router]);

  const pendingTotal = objectives.reduce((n, o) => n + o.indicatorsPendingMeasurement, 0);

  return (
    <div className="max-w-5xl space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">Trazaloop Quality</p>
        <h1 className="text-2xl font-semibold tracking-tight">Objetivos</h1>
        <p className="max-w-3xl text-sm text-ink-soft">
          Qué se quiere lograr, quién responde y con qué indicadores se comprueba. El desempeño de
          un objetivo no se escribe a mano: sale de sus indicadores, y la pantalla dice con qué
          regla se calculó.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Link
            href="/quality/indicators"
            className="inline-flex w-auto items-center justify-center rounded-md border border-hairline bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:border-loop"
          >
            Indicadores
          </Link>
          {canManage ? (
            <form action={scanAction} className="inline">
              <button
                type="submit"
                disabled={scanPending}
                className="inline-flex w-auto items-center justify-center rounded-md border border-hairline bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:border-loop disabled:opacity-60"
              >
                {scanPending ? "Revisando…" : "Revisar mediciones pendientes"}
              </button>
            </form>
          ) : null}
        </div>
      </header>

      <ErrorAlert message={state.error ?? scanState.error} />
      {scanState.success ? <SuccessAlert message={scanState.message ?? null} /> : null}

      {pendingTotal > 0 ? (
        <InfoAlert
          message={`${pendingTotal} ${pendingTotal === 1 ? "indicador tiene" : "indicadores tienen"} su medición pendiente. Un periodo sin medir no vale cero: falta el dato.`}
        />
      ) : null}

      {canManage ? (
        <details className="rounded-lg border border-hairline bg-surface" open={state.error !== null}>
          <summary className="cursor-pointer list-none rounded-lg px-4 py-3 text-sm font-semibold text-loop hover:bg-loop/5">
            Crear objetivo
          </summary>
          <form action={formAction} className="space-y-3 border-t border-hairline p-4">
            <h2 className="text-sm font-semibold">Nuevo objetivo</h2>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Nombre</span>
              <input name="name" required maxLength={200} className={inputClass}
                     placeholder="Ej.: Mejorar el desempeño del sistema documental" />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Código (opcional)</span>
                <input name="code" maxLength={40} className={inputClass} placeholder="OBJ-01" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Cargo responsable</span>
                <select name="owner_position_id" defaultValue="" className={inputClass}>
                  <option value="">— sin cargo asignado —</option>
                  {positions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}{p.holderName ? ` · ${p.holderName}` : " · sin titular"}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Descripción (opcional)</span>
              <textarea name="description" rows={2} className={inputClass}
                        placeholder="Qué se busca, en una o dos líneas." />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Desde</span>
                <input type="date" name="period_start" required defaultValue={thisYear.start} className={inputClass} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Hasta</span>
                <input type="date" name="period_end" required defaultValue={thisYear.end} className={inputClass} />
              </label>
            </div>
            <fieldset className="space-y-1">
              <legend className="mb-1 text-sm font-medium">¿Cómo se decide si el objetivo se cumple?</legend>
              {OBJECTIVE_RULES.map((rule, i) => (
                <label key={rule} className="flex items-start gap-2 text-xs">
                  <input type="radio" name="evaluation_rule" value={rule} defaultChecked={i === 0} className="mt-0.5" />
                  <span>
                    <span className="font-medium">{OBJECTIVE_RULE_LABEL[rule]}</span>
                    <span className="block text-ink-soft">{OBJECTIVE_RULE_HELP[rule]}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            {processes.length > 0 ? (
              <fieldset className="space-y-1">
                <legend className="mb-1 text-sm font-medium">Procesos a los que aplica (opcional)</legend>
                <div className="grid gap-1 sm:grid-cols-2">
                  {processes.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 text-xs">
                      <input type="checkbox" name="process_id" value={p.id} />
                      {p.name}
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}
            <Button type="submit" disabled={pending} className="sm:w-auto">
              {pending ? "Creando…" : "Crear objetivo"}
            </Button>
          </form>
        </details>
      ) : (
        <InfoAlert message="Puedes consultar los objetivos. Definirlos corresponde a la administración o al área de calidad." />
      )}

      {objectives.length === 0 ? (
        <EmptyState
          title="Todavía no hay objetivos"
          description="Un objetivo dice qué quiere lograr la empresa y con qué indicadores se comprueba. Empieza por uno: es preferible un objetivo que se mida de verdad a diez que nadie mire."
        />
      ) : (
        <ul className="space-y-2">
          {objectives.map((o) => (
            <li key={o.objectiveId}>
              <Link
                href={`/quality/objectives/${o.objectiveId}`}
                className="block rounded-lg border border-hairline bg-surface p-4 transition-colors hover:border-loop"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      {o.name}
                      {o.code ? <span className="ml-2 code text-xs text-ink-soft">{o.code}</span> : null}
                    </p>
                    <p className="text-xs text-ink-soft">
                      {o.ownerLabel} · {formatDate(o.periodStart)} a {formatDate(o.periodEnd)} ·{" "}
                      {o.indicatorCount === 0
                        ? "sin indicadores"
                        : `${o.indicatorCount} ${o.indicatorCount === 1 ? "indicador" : "indicadores"}`}
                    </p>
                    {o.processNames.length > 0 ? (
                      <p className="mt-0.5 text-xs text-ink-soft">Procesos: {o.processNames}</p>
                    ) : null}
                    <p className="mt-1 text-xs text-ink-soft">{o.performanceExplanation}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <ObjectivePerformanceBadge performance={o.performance} />
                    <ObjectiveStateBadge state={o.adminState} />
                  </div>
                </div>
                {o.indicatorsPendingMeasurement > 0 || o.indicatorsNotMet > 0 ? (
                  <p className="mt-2 text-xs">
                    {o.indicatorsNotMet > 0 ? (
                      <span className="text-danger">
                        {o.indicatorsNotMet} sin cumplir.{" "}
                      </span>
                    ) : null}
                    {o.indicatorsPendingMeasurement > 0 ? (
                      <span className="text-amber">
                        {o.indicatorsPendingMeasurement} con medición pendiente.
                      </span>
                    ) : null}
                  </p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
