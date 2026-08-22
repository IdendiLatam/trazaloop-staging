"use client";

import { useActionState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ErrorAlert, InfoAlert, SuccessAlert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import {
  EvaluationBadge, IndicatorStateBadge, TrendBadge,
} from "@/components/domain/quality/performance-badges";
import { formatDate } from "@/lib/domain/document-control";
import {
  CALC_OPERATIONS, CALC_OPERATION_LABEL, DIRECTIONS, DIRECTION_LABEL,
  FREQUENCIES, FREQUENCY_LABEL, NATIVE_SOURCES, NATIVE_SOURCE_NATURE_HELP,
  SELECTABLE_SCOPE_TYPES, SCOPE_TYPE_LABEL, SOURCE_KINDS, SOURCE_KIND_LABEL,
  UNIT_CODES, UNIT_LABEL,
  type Evaluation, type IndicatorAdminState, type Trend,
} from "@/lib/domain/quality-indicators";
import {
  createIndicatorAction, scanPendingMeasurementsAction,
  type QualityIndicatorActionState,
} from "@/server/actions/quality-indicators";

/**
 * Trazaloop Quality · QUALITY-03 · Indicadores.
 *
 * El formulario de creación publica también la configuración inicial: un
 * indicador sin unidad, periodicidad ni fuente no se puede medir, y dejarlo a
 * medias obliga a recordar volver.
 */

const initial: QualityIndicatorActionState = { error: null };
const inputClass =
  "block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-soft/60 focus:border-loop";

export type IndicatorListRow = {
  indicatorId: string;
  code: string | null;
  name: string;
  adminState: IndicatorAdminState;
  scopeLabel: string;
  ownerLabel: string;
  targetLabel: string;
  frequencyLabel: string;
  sourceLabel: string;
  lastPeriodLabel: string | null;
  lastValueLabel: string;
  lastEvaluation: Evaluation | null;
  trend: Trend;
  measurementPending: boolean;
  duePeriodLabel: string | null;
  nextMeasurementDueOn: string | null;
};

export function QualityIndicatorsView({
  indicators, positions, processes, canManage, today,
}: {
  indicators: IndicatorListRow[];
  positions: { id: string; name: string; holderName: string | null }[];
  processes: { id: string; name: string }[];
  canManage: boolean;
  today: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createIndicatorAction, initial);
  const [scanState, scanAction, scanPending] = useActionState(scanPendingMeasurementsAction, initial);

  useEffect(() => {
    if (state.success && state.indicatorId) router.push(`/quality/indicators/${state.indicatorId}`);
  }, [state.success, state.indicatorId, router]);

  return (
    <div className="max-w-5xl space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">Trazaloop Quality</p>
        <h1 className="text-2xl font-semibold tracking-tight">Indicadores</h1>
        <p className="max-w-3xl text-sm text-ink-soft">
          Cada indicador dice qué se mide, con qué unidad, cada cuánto, contra qué meta y de dónde
          sale el dato. Los automáticos no piden que nadie escriba el resultado: Trazaloop lo toma
          de lo que ya está registrado.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Link
            href="/quality/objectives"
            className="inline-flex w-auto items-center justify-center rounded-md border border-hairline bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:border-loop"
          >
            Objetivos
          </Link>
          {canManage ? (
            <form action={scanAction} className="inline">
              <button
                type="submit" disabled={scanPending}
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

      {canManage ? (
        <details className="rounded-lg border border-hairline bg-surface" open={state.error !== null}>
          <summary className="cursor-pointer list-none rounded-lg px-4 py-3 text-sm font-semibold text-loop hover:bg-loop/5">
            Crear indicador
          </summary>
          <form action={formAction} className="space-y-4 border-t border-hairline p-4">
            <h2 className="text-sm font-semibold">Qué se mide</h2>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Nombre</span>
              <input name="name" required maxLength={200} className={inputClass}
                     placeholder="Ej.: Cumplimiento de entregas" />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Código (opcional)</span>
                <input name="code" maxLength={40} className={inputClass} placeholder="IND-01" />
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
              <span className="mb-1.5 block text-sm font-medium">Definición (opcional)</span>
              <textarea name="description" rows={2} className={inputClass}
                        placeholder="Qué mide exactamente y qué NO mide." />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Alcance</span>
                <select name="scope_type" defaultValue="organization" className={inputClass}>
                  {SELECTABLE_SCOPE_TYPES.map((s) => (
                    <option key={s} value={s}>{SCOPE_TYPE_LABEL[s]}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Proceso (solo si el alcance es un proceso)</span>
                <select name="scope_process_id" defaultValue="" className={inputClass}>
                  <option value="">— ninguno —</option>
                  {processes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
            </div>

            <h2 className="border-t border-hairline pt-3 text-sm font-semibold">Cómo se mide</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Unidad</span>
                <select name="unit_code" defaultValue="percent" className={inputClass}>
                  {UNIT_CODES.map((u) => <option key={u} value={u}>{UNIT_LABEL[u]}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Nombre de la unidad (si es «otra»)</span>
                <input name="unit_label" maxLength={30} className={inputClass} placeholder="p. ej. reclamos" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Periodicidad</span>
                <select name="frequency" defaultValue="monthly" className={inputClass}>
                  {FREQUENCIES.map((f) => <option key={f} value={f}>{FREQUENCY_LABEL[f]}</option>)}
                </select>
              </label>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Dirección de la meta</span>
              <select name="direction" defaultValue="higher_is_better" className={inputClass}>
                {DIRECTIONS.map((d) => <option key={d} value={d}>{DIRECTION_LABEL[d]}</option>)}
              </select>
              <span className="mt-1 block text-[11px] text-ink-soft">
                Subir no siempre es mejorar: en un indicador de reclamos, mejorar es bajar.
              </span>
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Meta</span>
                <input name="target_value" inputMode="decimal" className={inputClass} placeholder="95" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Umbral de atención (opcional)</span>
                <input name="warning_value" inputMode="decimal" className={inputClass} placeholder="90" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Rige desde</span>
                <input type="date" name="effective_from" required defaultValue={today} className={inputClass} />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Mínimo del rango (solo rangos)</span>
                <input name="target_min" inputMode="decimal" className={inputClass} placeholder="18" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Máximo del rango (solo rangos)</span>
                <input name="target_max" inputMode="decimal" className={inputClass} placeholder="24" />
              </label>
            </div>

            <h2 className="border-t border-hairline pt-3 text-sm font-semibold">De dónde sale el dato</h2>
            <fieldset className="space-y-1">
              {SOURCE_KINDS.map((k, i) => (
                <label key={k} className="flex items-start gap-2 text-xs">
                  <input type="radio" name="source_kind" value={k} defaultChecked={i === 0} className="mt-0.5" />
                  <span>{SOURCE_KIND_LABEL[k]}</span>
                </label>
              ))}
            </fieldset>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Fuente automática (solo si es automático)</span>
              <select name="source_key" defaultValue="" className={inputClass}>
                <option value="">— ninguna —</option>
                {NATIVE_SOURCES.map((s) => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
              <span className="mt-1 block text-[11px] text-ink-soft">
                {NATIVE_SOURCES.map((s) => `${s.label}: ${s.description} ${NATIVE_SOURCE_NATURE_HELP[s.nature]}`).join(" · ")}
              </span>
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Operación (solo si es calculado)</span>
                <select name="calc_operation" defaultValue="ratio_percent" className={inputClass}>
                  {CALC_OPERATIONS.map((o) => (
                    <option key={o} value={o}>{CALC_OPERATION_LABEL[o]}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Componente A</span>
                <input name="component_label" className={inputClass} placeholder="Entregas conformes" />
                <input type="hidden" name="component_key" value="a" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Componente B</span>
                <input name="component_label" className={inputClass} placeholder="Entregas totales" />
                <input type="hidden" name="component_key" value="b" />
              </label>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Fórmula, en palabras (opcional)</span>
              <input name="formula_text" className={inputClass}
                     placeholder="Entregas conformes ÷ Entregas totales × 100" />
            </label>

            <Button type="submit" disabled={pending} className="sm:w-auto">
              {pending ? "Creando…" : "Crear indicador"}
            </Button>
          </form>
        </details>
      ) : (
        <InfoAlert message="Puedes consultar los indicadores y registrar mediciones. Definirlos corresponde a la administración o al área de calidad." />
      )}

      {indicators.length === 0 ? (
        <EmptyState
          title="Todavía no hay indicadores"
          description="Un indicador útil es el que alguien mira. Empieza por los pocos que de verdad dicen algo del sistema de gestión."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-hairline bg-surface">
          <table className="w-full min-w-[56rem] text-left text-xs">
            <thead className="border-b border-hairline text-ink-soft">
              <tr>
                <th className="px-3 py-2 font-medium">Código</th>
                <th className="px-3 py-2 font-medium">Indicador</th>
                <th className="px-3 py-2 font-medium">Meta</th>
                <th className="px-3 py-2 font-medium">Periodicidad</th>
                <th className="px-3 py-2 font-medium">Fuente</th>
                <th className="px-3 py-2 font-medium">Último resultado</th>
                <th className="px-3 py-2 font-medium">Desempeño</th>
                <th className="px-3 py-2 font-medium">Tendencia</th>
                <th className="px-3 py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {indicators.map((i) => (
                <tr key={i.indicatorId} className="border-b border-hairline align-top last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 code">{i.code ?? "—"}</td>
                  <td className="px-3 py-2">
                    <Link href={`/quality/indicators/${i.indicatorId}`} className="font-medium text-loop hover:underline">
                      {i.name}
                    </Link>
                    <span className="block text-ink-soft">{i.scopeLabel} · {i.ownerLabel}</span>
                  </td>
                  <td className="px-3 py-2">{i.targetLabel}</td>
                  <td className="px-3 py-2">{i.frequencyLabel}</td>
                  <td className="px-3 py-2">{i.sourceLabel}</td>
                  <td className="px-3 py-2">
                    {i.lastPeriodLabel ? (
                      <>
                        <span className="font-medium">{i.lastValueLabel}</span>
                        <span className="block text-ink-soft">{i.lastPeriodLabel}</span>
                      </>
                    ) : (
                      <span className="text-ink-soft">Sin mediciones</span>
                    )}
                    {i.measurementPending ? (
                      <span className="mt-0.5 block text-amber">
                        Falta {i.duePeriodLabel}
                      </span>
                    ) : i.nextMeasurementDueOn ? (
                      <span className="mt-0.5 block text-ink-soft">
                        Próxima: {formatDate(i.nextMeasurementDueOn)}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    {i.lastEvaluation ? <EvaluationBadge evaluation={i.lastEvaluation} compact /> : "—"}
                  </td>
                  <td className="px-3 py-2"><TrendBadge trend={i.trend} /></td>
                  <td className="px-3 py-2"><IndicatorStateBadge state={i.adminState} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-ink-soft">
        El <strong>estado</strong> dice si el indicador está en uso; el <strong>desempeño</strong>,
        si cumple. Son cosas distintas: un indicador activo puede no cumplir, y uno retirado
        conserva que cumplía.
      </p>
    </div>
  );
}
