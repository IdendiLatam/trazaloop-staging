"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ErrorAlert, InfoAlert, SuccessAlert } from "@/components/ui/alert";
import {
  EvaluationBadge, ObjectivePerformanceBadge, ObjectiveStateBadge, TrendBadge,
} from "@/components/domain/quality/performance-badges";
import { formatDate } from "@/lib/domain/document-control";
import {
  OBJECTIVE_RULES, OBJECTIVE_RULE_LABEL, OBJECTIVE_RULE_HELP,
  type Evaluation, type ObjectiveAdminState, type ObjectivePerformance,
  type ObjectiveRule, type Trend,
} from "@/lib/domain/quality-indicators";
import {
  updateObjectiveAction, setObjectiveStateAction, deleteObjectiveAction,
  setObjectiveProcessesAction, setObjectiveIndicatorsAction,
  type QualityIndicatorActionState,
} from "@/server/actions/quality-indicators";
import { LifecyclePanel } from "@/components/domain/quality/lifecycle-panel";
import type { DeletionEligibility } from "@/lib/domain/lifecycle";
import { ExportPdfButton } from "@/components/ui/export-pdf-button";

/** Trazaloop Quality · QUALITY-03 · Ficha de un objetivo. */

const initial: QualityIndicatorActionState = { error: null };
const inputClass =
  "block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-soft/60 focus:border-loop";
const cardClass = "space-y-3 rounded-lg border border-hairline bg-surface p-4";

export type ObjectiveIndicatorRow = {
  indicatorId: string;
  code: string | null;
  name: string;
  targetLabel: string;
  lastPeriodLabel: string | null;
  lastValueLabel: string;
  lastEvaluation: Evaluation | null;
  trend: Trend;
  measurementPending: boolean;
  duePeriodLabel: string | null;
  nextMeasurementDueOn: string | null;
};

export type ObjectiveDetailModel = {
  objectiveId: string;
  code: string | null;
  name: string;
  description: string | null;
  purpose: string | null;
  adminState: ObjectiveAdminState;
  periodStart: string;
  periodEnd: string;
  evaluationRule: ObjectiveRule;
  ownerPositionId: string | null;
  ownerLabel: string;
  performance: ObjectivePerformance;
  performanceExplanation: string;
  processNames: string;
  closedAt: string | null;

  indicators: ObjectiveIndicatorRow[];
  selectedProcessIds: string[];
  selectedIndicatorIds: string[];
  allProcesses: { id: string; name: string }[];
  allIndicators: { id: string; name: string; code: string | null }[];
  positions: { id: string; name: string; holderName: string | null }[];
  canManage: boolean;
  /** Dictamen de eliminación, resuelto en servidor (QUALITY-03.1). */
  eligibility: DeletionEligibility;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium">{label}</span>
      {children}
    </label>
  );
}

function DataPoint({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-soft">{label}</dt>
      <dd className="text-sm text-ink">{value}</dd>
    </div>
  );
}

export function QualityObjectiveDetail({ model }: { model: ObjectiveDetailModel }) {
  const [metaState, metaAction, metaPending] = useActionState(updateObjectiveAction, initial);
  const [stateState, stateAction, statePending] = useActionState(setObjectiveStateAction, initial);
  const [procState, procAction, procPending] = useActionState(setObjectiveProcessesAction, initial);
  const [indState, indAction, indPending] = useActionState(setObjectiveIndicatorsAction, initial);

  const pending = model.indicators.filter((i) => i.measurementPending).length;

  return (
    <div className="max-w-4xl space-y-5">
      <header className="space-y-2">
        <Link href="/quality/objectives" className="text-xs text-loop hover:underline">
          ← Volver a Objetivos
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{model.name}</h1>
          <ExportPdfButton exportKey="quality.objective.detail" id={model.objectiveId} />
          <ObjectivePerformanceBadge performance={model.performance} />
          <ObjectiveStateBadge state={model.adminState} />
        </div>
        {model.code ? <p className="code text-xs text-ink-soft">{model.code}</p> : null}
        {model.description ? <p className="text-sm text-ink-soft">{model.description}</p> : null}
        <p className="text-xs text-ink-soft">{model.performanceExplanation}</p>
      </header>

      {pending > 0 ? (
        <InfoAlert
          message={`${pending} de sus indicadores ${pending === 1 ? "tiene" : "tienen"} la medición pendiente. Mientras falte el dato, el desempeño del objetivo está incompleto.`}
        />
      ) : null}

      <section className={cardClass}>
        <h2 className="text-sm font-semibold">Ficha</h2>
        <dl className="grid gap-3 sm:grid-cols-3">
          <DataPoint label="Responsable" value={model.ownerLabel} />
          <DataPoint
            label="Periodo"
            value={`${formatDate(model.periodStart)} a ${formatDate(model.periodEnd)}`}
          />
          <DataPoint label="Regla de evaluación" value={OBJECTIVE_RULE_LABEL[model.evaluationRule]} />
          <DataPoint
            label="Procesos relacionados"
            value={model.processNames.length > 0 ? model.processNames : "Ninguno"}
          />
          <DataPoint label="Propósito" value={model.purpose ?? "—"} />
          <DataPoint label="Cerrado" value={model.closedAt ? formatDate(model.closedAt) : "—"} />
        </dl>
      </section>

      <section className={cardClass}>
        <h2 className="text-sm font-semibold">Indicadores</h2>
        {model.indicators.length === 0 ? (
          <p className="text-xs text-ink-soft">
            Este objetivo todavía no tiene indicadores. Sin al menos uno, no hay forma de saber si
            se cumple.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-left text-xs">
              <thead className="text-ink-soft">
                <tr>
                  <th className="py-1 pr-3 font-medium">Indicador</th>
                  <th className="py-1 pr-3 font-medium">Último resultado</th>
                  <th className="py-1 pr-3 font-medium">Meta</th>
                  <th className="py-1 pr-3 font-medium">Desempeño</th>
                  <th className="py-1 pr-3 font-medium">Tendencia</th>
                  <th className="py-1 font-medium">Próxima medición</th>
                </tr>
              </thead>
              <tbody>
                {model.indicators.map((i) => (
                  <tr key={i.indicatorId} className="border-t border-hairline align-top">
                    <td className="py-1.5 pr-3">
                      <Link href={`/quality/indicators/${i.indicatorId}`} className="font-medium text-loop hover:underline">
                        {i.name}
                      </Link>
                      {i.code ? <span className="block code text-ink-soft">{i.code}</span> : null}
                    </td>
                    <td className="py-1.5 pr-3">
                      {i.lastPeriodLabel ? (
                        <>
                          <span className="font-medium">{i.lastValueLabel}</span>
                          <span className="block text-ink-soft">{i.lastPeriodLabel}</span>
                        </>
                      ) : (
                        <span className="text-ink-soft">Sin mediciones</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-3">{i.targetLabel}</td>
                    <td className="py-1.5 pr-3">
                      {i.lastEvaluation ? <EvaluationBadge evaluation={i.lastEvaluation} compact /> : "—"}
                    </td>
                    <td className="py-1.5 pr-3"><TrendBadge trend={i.trend} /></td>
                    <td className="py-1.5">
                      {i.measurementPending ? (
                        <span className="text-amber">Falta {i.duePeriodLabel}</span>
                      ) : i.nextMeasurementDueOn ? (
                        formatDate(i.nextMeasurementDueOn)
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {model.canManage ? (
        <>
          <section className={cardClass}>
            <form action={indAction} className="space-y-3">
              <h2 className="text-sm font-semibold">Qué indicadores lo miden</h2>
              <ErrorAlert message={indState.error} />
              {indState.success ? <SuccessAlert message={indState.message ?? null} /> : null}
              <input type="hidden" name="objective_id" value={model.objectiveId} />
              {model.allIndicators.length === 0 ? (
                <p className="text-xs text-ink-soft">
                  Todavía no hay indicadores en la empresa.{" "}
                  <Link href="/quality/indicators" className="text-loop hover:underline">Crear uno →</Link>
                </p>
              ) : (
                <div className="grid gap-1 sm:grid-cols-2">
                  {model.allIndicators.map((i) => (
                    <label key={i.id} className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox" name="indicator_id" value={i.id}
                        defaultChecked={model.selectedIndicatorIds.includes(i.id)}
                      />
                      {i.name}{i.code ? ` (${i.code})` : ""}
                    </label>
                  ))}
                </div>
              )}
              <Button type="submit" disabled={indPending} variant="quiet" className="w-auto px-3 py-1.5 text-xs">
                {indPending ? "Guardando…" : "Guardar indicadores"}
              </Button>
            </form>
          </section>

          <section className={cardClass}>
            <form action={procAction} className="space-y-3">
              <h2 className="text-sm font-semibold">A qué procesos aplica</h2>
              <p className="text-xs text-ink-soft">
                Un mismo objetivo puede aplicar a varios procesos. No se duplica el objetivo por
                proceso: se relaciona con todos.
              </p>
              <ErrorAlert message={procState.error} />
              {procState.success ? <SuccessAlert message={procState.message ?? null} /> : null}
              <input type="hidden" name="objective_id" value={model.objectiveId} />
              {model.allProcesses.length === 0 ? (
                <p className="text-xs text-ink-soft">Todavía no hay procesos en la empresa.</p>
              ) : (
                <div className="grid gap-1 sm:grid-cols-2">
                  {model.allProcesses.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox" name="process_id" value={p.id}
                        defaultChecked={model.selectedProcessIds.includes(p.id)}
                      />
                      {p.name}
                    </label>
                  ))}
                </div>
              )}
              <Button type="submit" disabled={procPending} variant="quiet" className="w-auto px-3 py-1.5 text-xs">
                {procPending ? "Guardando…" : "Guardar procesos"}
              </Button>
            </form>
          </section>

          <section className={cardClass}>
            <form action={metaAction} className="space-y-3">
              <h2 className="text-sm font-semibold">Editar el objetivo</h2>
              <ErrorAlert message={metaState.error} />
              {metaState.success ? <SuccessAlert message={metaState.message ?? null} /> : null}
              <input type="hidden" name="objective_id" value={model.objectiveId} />
              <Field label="Nombre">
                <input name="name" required defaultValue={model.name} maxLength={200} className={inputClass} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Código">
                  <input name="code" defaultValue={model.code ?? ""} maxLength={40} className={inputClass} />
                </Field>
                <Field label="Cargo responsable">
                  <select name="owner_position_id" defaultValue={model.ownerPositionId ?? ""} className={inputClass}>
                    <option value="">— sin cargo asignado —</option>
                    {model.positions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}{p.holderName ? ` · ${p.holderName}` : " · sin titular"}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Descripción">
                <textarea name="description" rows={2} defaultValue={model.description ?? ""} className={inputClass} />
              </Field>
              <Field label="Propósito">
                <input name="purpose" defaultValue={model.purpose ?? ""} className={inputClass} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Desde">
                  <input type="date" name="period_start" required defaultValue={model.periodStart} className={inputClass} />
                </Field>
                <Field label="Hasta">
                  <input type="date" name="period_end" required defaultValue={model.periodEnd} className={inputClass} />
                </Field>
              </div>
              <fieldset className="space-y-1">
                <legend className="mb-1 text-xs font-medium">¿Cómo se decide si se cumple?</legend>
                {OBJECTIVE_RULES.map((rule) => (
                  <label key={rule} className="flex items-start gap-2 text-xs">
                    <input
                      type="radio" name="evaluation_rule" value={rule}
                      defaultChecked={model.evaluationRule === rule} className="mt-0.5"
                    />
                    <span>
                      <span className="font-medium">{OBJECTIVE_RULE_LABEL[rule]}</span>
                      <span className="block text-ink-soft">{OBJECTIVE_RULE_HELP[rule]}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <Button type="submit" disabled={metaPending} className="w-auto px-3 py-1.5 text-xs">
                {metaPending ? "Guardando…" : "Guardar objetivo"}
              </Button>
            </form>
          </section>

          <section className={cardClass}>
            <form action={stateAction} className="space-y-2">
              <h2 className="text-sm font-semibold">Estado del objetivo</h2>
              <p className="text-xs text-ink-soft">
                Es su estado ADMINISTRATIVO. Un objetivo cerrado conserva su historial y no vuelve
                a abrirse: para el ciclo siguiente se crea uno nuevo.
              </p>
              <ErrorAlert message={stateState.error} />
              {stateState.success ? <SuccessAlert message={stateState.message ?? null} /> : null}
              <input type="hidden" name="objective_id" value={model.objectiveId} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Estado">
                  <select name="admin_state" defaultValue={model.adminState} className={inputClass}>
                    <option value="draft">Borrador</option>
                    <option value="active">Activo</option>
                    <option value="suspended">Suspendido</option>
                    <option value="closed">Cerrado</option>
                    <option value="cancelled">Cancelado</option>
                  </select>
                </Field>
                <Field label="Nota de cierre (opcional)">
                  <input name="closure_note" className={inputClass} />
                </Field>
              </div>
              <Button type="submit" disabled={statePending} variant="quiet" className="w-auto px-3 py-1.5 text-xs">
                {statePending ? "Guardando…" : "Guardar estado"}
              </Button>
            </form>
          </section>
        </>
      ) : null}

      {/* Eliminar, o entender por qué ya no (QUALITY-03.1). */}
      <LifecyclePanel
        entity="objective"
        name={model.name}
        eligibility={model.eligibility}
        idFieldName="objective_id"
        idValue={model.objectiveId}
        deleteAction={deleteObjectiveAction}
        canManage={model.canManage}
      />
    </div>
  );
}
