"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ErrorAlert, InfoAlert, SuccessAlert } from "@/components/ui/alert";
import {
  EvaluationBadge, IndicatorStateBadge, TrendBadge,
} from "@/components/domain/quality/performance-badges";
import { IndicatorChart, type ChartPoint } from "@/components/domain/quality/indicator-chart";
import { formatDate } from "@/lib/domain/document-control";
import {
  DATA_STATE_LABEL, DATA_QUALITY_LABEL, DIRECTION_LABEL, FREQUENCY_LABEL,
  NATIVE_SOURCE_NATURE_HELP, SOURCE_KIND_LABEL,
  describeFormula,
  type CalcDefinition, type DataQuality, type DataState, type Direction,
  type Evaluation, type Frequency, type IndicatorAdminState, type NativeSource,
  type SourceKind, type Trend,
} from "@/lib/domain/quality-indicators";
import {
  recordMeasurementAction, runIndicatorCalculationAction, correctMeasurementAction,
  setIndicatorStateAction, publishIndicatorConfigAction,
  type QualityIndicatorActionState,
} from "@/server/actions/quality-indicators";

/**
 * Trazaloop Quality · QUALITY-03 · Ficha de un indicador.
 *
 * Ordenada como se trabaja: primero lo que hay que hacer ahora (medir, o
 * calcular), después el resultado y su evolución, y al final la definición y
 * el historial, que se consultan.
 *
 * La evaluación NUNCA se elige: la deriva el servidor y la pantalla muestra su
 * explicación tal cual, para que se pueda defender ante un auditor.
 */

const initial: QualityIndicatorActionState = { error: null };
const inputClass =
  "block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-soft/60 focus:border-loop";
const cardClass = "space-y-3 rounded-lg border border-hairline bg-surface p-4";

export type MeasurementView = {
  id: string;
  periodLabel: string;
  valueLabel: string;
  dataState: DataState;
  dataQuality: DataQuality;
  evaluation: Evaluation;
  evaluationExplanation: string | null;
  appliedTargetLabel: string;
  sourceKind: SourceKind;
  measuredAt: string;
  resultState: string;
  isCurrent: boolean;
  correctionReason: string | null;
  createdByName: string | null;
  componentsLabel: string | null;
  lineageLabel: string | null;
};

export type ConfigView = {
  id: string;
  versionNumber: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  targetLabel: string;
  warningLabel: string | null;
  frequency: Frequency;
  directionLabel: string;
  sourceLabel: string;
  changeNote: string | null;
  comparabilityBreak: boolean;
};

export type IndicatorDetailModel = {
  indicatorId: string;
  code: string | null;
  name: string;
  description: string | null;
  adminState: IndicatorAdminState;
  scopeLabel: string;
  ownerLabel: string;
  unitCode: string | null;
  unitLabel: string | null;
  direction: Direction | null;
  frequency: Frequency | null;
  targetLabel: string;
  warningLabel: string | null;
  sourceKind: SourceKind | null;
  sourceKey: string | null;
  nativeSource: NativeSource | null;
  formulaText: string | null;
  calcDefinition: CalcDefinition | null;
  targetValue: number | null;
  targetMin: number | null;
  targetMax: number | null;

  lastPeriodLabel: string | null;
  lastValueLabel: string;
  lastEvaluation: Evaluation | null;
  lastEvaluationExplanation: string | null;
  lastMeasuredAt: string | null;
  trend: Trend;

  measurementPending: boolean;
  duePeriodLabel: string | null;
  duePeriodStart: string | null;
  duePeriodEnd: string | null;
  currentPeriodLabel: string | null;
  nextMeasurementDueOn: string | null;

  chart: ChartPoint[];
  measurements: MeasurementView[];
  configs: ConfigView[];
  objectives: { id: string; name: string }[];

  canManage: boolean;
  canRecord: boolean;
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

export function QualityIndicatorDetail({ model }: { model: IndicatorDetailModel }) {
  const [recordState, recordAction, recordPending] = useActionState(recordMeasurementAction, initial);
  const [calcState, calcAction, calcPending] = useActionState(runIndicatorCalculationAction, initial);
  const [stateState, stateAction, statePending] = useActionState(setIndicatorStateAction, initial);
  const [configState, configAction, configPending] = useActionState(publishIndicatorConfigAction, initial);

  const isNative = model.sourceKind === "native";
  const isCalculated = model.sourceKind === "calculated";

  return (
    <div className="max-w-4xl space-y-5">
      <header className="space-y-2">
        <Link href="/quality/indicators" className="text-xs text-loop hover:underline">
          ← Volver a Indicadores
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{model.name}</h1>
          <IndicatorStateBadge state={model.adminState} />
          {model.lastEvaluation ? <EvaluationBadge evaluation={model.lastEvaluation} /> : null}
        </div>
        {model.code ? <p className="code text-xs text-ink-soft">{model.code}</p> : null}
        {model.description ? <p className="text-sm text-ink-soft">{model.description}</p> : null}
        {model.objectives.length > 0 ? (
          <p className="text-xs text-ink-soft">
            Mide:{" "}
            {model.objectives.map((o, i) => (
              <span key={o.id}>
                {i > 0 ? ", " : ""}
                <Link href={`/quality/objectives/${o.id}`} className="text-loop hover:underline">{o.name}</Link>
              </span>
            ))}
          </p>
        ) : null}
      </header>

      {/* Lo primero: lo que hay que hacer ahora */}
      {model.measurementPending ? (
        <InfoAlert
          message={`Falta la medición de ${model.duePeriodLabel}. Un periodo sin medir no vale cero: falta el dato.`}
        />
      ) : null}

      {model.canRecord && model.adminState === "active" ? (
        isNative ? (
          <section className="space-y-3 rounded-lg border border-loop/30 bg-loop/5 p-4">
            <form action={calcAction} className="space-y-3">
              <h2 className="text-sm font-semibold">Calcular desde los datos de Trazaloop</h2>
              <p className="text-xs text-ink-soft">
                Este indicador se alimenta solo. Nadie escribe el resultado: Trazaloop lo obtiene de
                lo que ya está registrado en el sistema de gestión.
                {model.nativeSource ? ` ${NATIVE_SOURCE_NATURE_HELP[model.nativeSource.nature]}` : ""}
              </p>
              <ErrorAlert message={calcState.error} />
              {calcState.success ? <SuccessAlert message={calcState.message ?? null} /> : null}
              <input type="hidden" name="indicator_id" value={model.indicatorId} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Desde">
                  <input type="date" name="period_start" defaultValue={model.duePeriodStart ?? ""} className={inputClass} />
                </Field>
                <Field label="Hasta">
                  <input type="date" name="period_end" defaultValue={model.duePeriodEnd ?? ""} className={inputClass} />
                </Field>
              </div>
              <Button type="submit" disabled={calcPending} className="w-auto px-4 py-2 text-sm">
                {calcPending ? "Calculando…" : `Calcular ahora${model.duePeriodLabel ? ` · ${model.duePeriodLabel}` : ""}`}
              </Button>
            </form>
          </section>
        ) : (
          <section className="space-y-3 rounded-lg border border-loop/30 bg-loop/5 p-4">
            <form action={recordAction} className="space-y-3">
              <h2 className="text-sm font-semibold">Registrar medición</h2>
              <p className="text-xs text-ink-soft">
                {isCalculated
                  ? "Escribe los componentes; el resultado lo calcula Trazaloop con la fórmula del indicador."
                  : "Escribe el resultado del periodo. La evaluación la deriva el sistema contra la meta que regía en ese periodo."}
              </p>
              <ErrorAlert message={recordState.error} />
              {recordState.success ? <SuccessAlert message={recordState.message ?? null} /> : null}
              <input type="hidden" name="indicator_id" value={model.indicatorId} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Desde">
                  <input type="date" name="period_start" required defaultValue={model.duePeriodStart ?? ""} className={inputClass} />
                </Field>
                <Field label="Hasta">
                  <input type="date" name="period_end" required defaultValue={model.duePeriodEnd ?? ""} className={inputClass} />
                </Field>
              </div>

              {isCalculated && model.calcDefinition ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {model.calcDefinition.operands.map((o) => (
                    <Field key={o.key} label={o.label || o.key}>
                      <input name="component_value" inputMode="decimal" className={inputClass} />
                      <input type="hidden" name="component_key" value={o.key} />
                    </Field>
                  ))}
                </div>
              ) : (
                <Field label="Resultado del periodo">
                  <input name="value" inputMode="decimal" className={inputClass} placeholder="p. ej. 96" />
                </Field>
              )}

              <Field label="¿Y si no hay dato?">
                <select name="data_state" defaultValue="reported" className={inputClass}>
                  <option value="reported">Tengo el resultado</option>
                  <option value="no_data">No se pudo medir este periodo</option>
                  <option value="not_applicable">No aplica a este periodo</option>
                </select>
                <span className="mt-1 block text-[11px] text-ink-soft">
                  Cero no es lo mismo que «sin dato»: si el resultado fue cero, escríbelo.
                </span>
              </Field>
              <Field label="Observaciones (opcional)">
                <input name="note" className={inputClass} />
              </Field>
              <Button type="submit" disabled={recordPending} className="w-auto px-4 py-2 text-sm">
                {recordPending ? "Registrando…" : "Registrar medición"}
              </Button>
            </form>
          </section>
        )
      ) : null}

      {/* Estado actual */}
      <section className={cardClass}>
        <h2 className="text-sm font-semibold">Cómo va</h2>
        <dl className="grid gap-3 sm:grid-cols-4">
          <DataPoint label="Último resultado" value={model.lastValueLabel} />
          <DataPoint label="Periodo" value={model.lastPeriodLabel ?? "—"} />
          <DataPoint
            label="Desempeño"
            value={model.lastEvaluation ? <EvaluationBadge evaluation={model.lastEvaluation} compact /> : "—"}
          />
          <DataPoint label="Tendencia" value={<TrendBadge trend={model.trend} />} />
        </dl>
        {model.lastEvaluationExplanation ? (
          <p className="text-xs text-ink-soft">{model.lastEvaluationExplanation}</p>
        ) : null}
        <p className="text-xs text-ink-soft">
          {model.measurementPending
            ? `Pendiente: ${model.duePeriodLabel}.`
            : model.nextMeasurementDueOn
              ? `Próxima medición: al cerrar ${model.currentPeriodLabel}, el ${formatDate(model.nextMeasurementDueOn)}.`
              : ""}
        </p>
      </section>

      {/* Evolución */}
      <section className={cardClass}>
        <h2 className="text-sm font-semibold">Evolución</h2>
        <IndicatorChart
          points={model.chart}
          direction={model.direction ?? "higher_is_better"}
          targetValue={model.targetValue}
          targetMin={model.targetMin}
          targetMax={model.targetMax}
          unitCode={model.unitCode}
          unitLabel={model.unitLabel}
        />
      </section>

      {/* Historial */}
      <section className={cardClass}>
        <h2 className="text-sm font-semibold">Historial por periodos</h2>
        {model.measurements.length === 0 ? (
          <p className="text-xs text-ink-soft">Todavía no hay mediciones.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-left text-xs">
              <thead className="text-ink-soft">
                <tr>
                  <th className="py-1 pr-3 font-medium">Periodo</th>
                  <th className="py-1 pr-3 font-medium">Resultado</th>
                  <th className="py-1 pr-3 font-medium">Meta aplicada</th>
                  <th className="py-1 pr-3 font-medium">Evaluación</th>
                  <th className="py-1 pr-3 font-medium">Origen</th>
                  <th className="py-1 pr-3 font-medium">Registrada</th>
                  <th className="py-1 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {model.measurements.map((m) => (
                  <tr
                    key={m.id}
                    className={`border-t border-hairline align-top ${m.isCurrent ? "" : "opacity-60"}`}
                  >
                    <td className="whitespace-nowrap py-1.5 pr-3 font-medium">{m.periodLabel}</td>
                    <td className="py-1.5 pr-3">
                      {m.valueLabel}
                      {m.dataState !== "reported" ? (
                        <span className="block text-ink-soft">{DATA_STATE_LABEL[m.dataState]}</span>
                      ) : null}
                      {m.dataQuality !== "ok" ? (
                        <span className="block text-danger">{DATA_QUALITY_LABEL[m.dataQuality]}</span>
                      ) : null}
                      {m.componentsLabel ? (
                        <span className="block text-ink-soft">{m.componentsLabel}</span>
                      ) : null}
                    </td>
                    <td className="py-1.5 pr-3">{m.appliedTargetLabel}</td>
                    <td className="py-1.5 pr-3">
                      <EvaluationBadge evaluation={m.evaluation} compact />
                      {m.evaluationExplanation ? (
                        <span className="block text-ink-soft">{m.evaluationExplanation}</span>
                      ) : null}
                    </td>
                    <td className="py-1.5 pr-3">
                      {SOURCE_KIND_LABEL[m.sourceKind].split(" — ")[0]}
                      {m.lineageLabel ? (
                        <span className="block text-ink-soft">{m.lineageLabel}</span>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap py-1.5 pr-3">
                      {formatDate(m.measuredAt)}
                      <span className="block text-ink-soft">{m.createdByName ?? "—"}</span>
                    </td>
                    <td className="py-1.5">
                      {m.isCurrent ? (
                        m.resultState === "closed" ? "Cerrada" : "Vigente"
                      ) : (
                        <span title={m.correctionReason ?? ""}>Corregida</span>
                      )}
                      {m.correctionReason && m.isCurrent ? (
                        <span className="block text-ink-soft">«{m.correctionReason}»</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-ink-soft">
          La <strong>meta aplicada</strong> es la que regía en ese periodo, no la de hoy: cambiar la
          meta no reescribe lo que ya se evaluó.
        </p>
      </section>

      {/* Corregir */}
      {model.canRecord && model.measurements.some((m) => m.isCurrent && m.resultState !== "closed") ? (
        <CorrectionPanel indicatorId={model.indicatorId} measurements={model.measurements} />
      ) : null}

      {/* Definición */}
      <section className={cardClass}>
        <h2 className="text-sm font-semibold">Definición</h2>
        <dl className="grid gap-3 sm:grid-cols-3">
          <DataPoint label="Alcance" value={model.scopeLabel} />
          <DataPoint label="Responsable" value={model.ownerLabel} />
          <DataPoint label="Periodicidad" value={model.frequency ? FREQUENCY_LABEL[model.frequency] : "—"} />
          <DataPoint label="Meta vigente" value={model.targetLabel} />
          <DataPoint label="Umbral de atención" value={model.warningLabel ?? "Sin umbral"} />
          <DataPoint label="Dirección" value={model.direction ? DIRECTION_LABEL[model.direction] : "—"} />
          <DataPoint
            label="Fuente"
            value={model.sourceKind ? SOURCE_KIND_LABEL[model.sourceKind].split(" — ")[0] : "—"}
          />
          <DataPoint
            label="Método"
            value={
              model.nativeSource?.label
              ?? model.formulaText
              ?? (model.calcDefinition ? describeFormula(model.calcDefinition) : "—")
            }
          />
          <DataPoint label="Unidad" value={model.unitLabel ?? (model.unitCode ?? "—")} />
        </dl>
        {model.nativeSource ? (
          <p className="text-xs text-ink-soft">
            {model.nativeSource.description} {NATIVE_SOURCE_NATURE_HELP[model.nativeSource.nature]}
          </p>
        ) : null}
      </section>

      {/* Configuraciones */}
      <section className={cardClass}>
        <h2 className="text-sm font-semibold">Historial de configuración</h2>
        <p className="text-xs text-ink-soft">
          Cambiar la meta abre una configuración nueva y cierra la anterior. Las mediciones ya
          registradas siguen apuntando a la suya, así que el pasado no cambia de veredicto.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-ink-soft">
              <tr>
                <th className="py-1 pr-3 font-medium">Versión</th>
                <th className="py-1 pr-3 font-medium">Rige</th>
                <th className="py-1 pr-3 font-medium">Meta</th>
                <th className="py-1 pr-3 font-medium">Periodicidad</th>
                <th className="py-1 pr-3 font-medium">Fuente</th>
                <th className="py-1 font-medium">Nota</th>
              </tr>
            </thead>
            <tbody>
              {model.configs.map((c) => (
                <tr key={c.id} className="border-t border-hairline align-top">
                  <td className="py-1.5 pr-3 font-medium">v{c.versionNumber}</td>
                  <td className="whitespace-nowrap py-1.5 pr-3">
                    {formatDate(c.effectiveFrom)} — {c.effectiveTo ? formatDate(c.effectiveTo) : "vigente"}
                  </td>
                  <td className="py-1.5 pr-3">
                    {c.targetLabel}
                    {c.warningLabel ? <span className="block text-ink-soft">{c.warningLabel}</span> : null}
                  </td>
                  <td className="py-1.5 pr-3">{FREQUENCY_LABEL[c.frequency]}</td>
                  <td className="py-1.5 pr-3">{c.sourceLabel}</td>
                  <td className="py-1.5 text-ink-soft">
                    {c.changeNote ?? "—"}
                    {c.comparabilityBreak ? (
                      <span className="block text-amber">Ruptura de comparabilidad declarada</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Cambiar la meta */}
      {model.canManage && model.adminState !== "retired" ? (
        <section className={cardClass}>
          <form action={configAction} className="space-y-3">
            <h2 className="text-sm font-semibold">Cambiar la meta o la configuración</h2>
            <p className="text-xs text-ink-soft">
              Lo que guardes aquí rige DESDE la fecha que indiques. Lo anterior queda como está.
            </p>
            <ErrorAlert message={configState.error} />
            {configState.success ? <SuccessAlert message={configState.message ?? null} /> : null}
            <input type="hidden" name="indicator_id" value={model.indicatorId} />
            <input type="hidden" name="unit_code" value={model.unitCode ?? "percent"} />
            <input type="hidden" name="unit_label" value={model.unitLabel ?? ""} />
            <input type="hidden" name="direction" value={model.direction ?? "higher_is_better"} />
            <input type="hidden" name="frequency" value={model.frequency ?? "monthly"} />
            <input type="hidden" name="source_kind" value={model.sourceKind ?? "manual"} />
            <input type="hidden" name="source_key" value={model.sourceKey ?? ""} />
            <input type="hidden" name="formula_text" value={model.formulaText ?? ""} />
            {model.calcDefinition ? (
              <>
                <input type="hidden" name="calc_operation" value={model.calcDefinition.operation} />
                {model.calcDefinition.operands.map((o) => (
                  <span key={o.key}>
                    <input type="hidden" name="component_key" value={o.key} />
                    <input type="hidden" name="component_label" value={o.label} />
                  </span>
                ))}
              </>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Rige desde">
                <input type="date" name="effective_from" required className={inputClass} />
              </Field>
              <Field label="Meta">
                <input name="target_value" inputMode="decimal" defaultValue={model.targetValue ?? ""} className={inputClass} />
              </Field>
              <Field label="Mínimo (rango)">
                <input name="target_min" inputMode="decimal" defaultValue={model.targetMin ?? ""} className={inputClass} />
              </Field>
              <Field label="Máximo (rango)">
                <input name="target_max" inputMode="decimal" defaultValue={model.targetMax ?? ""} className={inputClass} />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Umbral de atención (opcional)">
                <input name="warning_value" inputMode="decimal" className={inputClass} />
              </Field>
              <Field label="Motivo del cambio">
                <input name="change_note" className={inputClass} placeholder="p. ej. La dirección eleva la meta" />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" name="comparability_break" />
              Este cambio rompe la comparabilidad con los periodos anteriores
            </label>
            <Button type="submit" disabled={configPending} variant="quiet" className="w-auto px-3 py-1.5 text-xs">
              {configPending ? "Publicando…" : "Publicar configuración"}
            </Button>
          </form>
        </section>
      ) : null}

      {/* Ciclo de vida */}
      {model.canManage ? (
        <section className={cardClass}>
          <form action={stateAction} className="space-y-2">
            <h2 className="text-sm font-semibold">Estado del indicador</h2>
            <p className="text-xs text-ink-soft">
              Es su estado ADMINISTRATIVO: si está en uso o no. No dice nada sobre si cumple.
              Retirarlo conserva todo su historial y permite señalar cuál lo sustituye.
            </p>
            <ErrorAlert message={stateState.error} />
            {stateState.success ? <SuccessAlert message={stateState.message ?? null} /> : null}
            <input type="hidden" name="indicator_id" value={model.indicatorId} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Estado">
                <select name="admin_state" defaultValue={model.adminState} className={inputClass}>
                  <option value="draft">Borrador</option>
                  <option value="active">Activo</option>
                  <option value="suspended">Suspendido</option>
                  <option value="retired">Retirado</option>
                </select>
              </Field>
              <Field label="Motivo (obligatorio al retirar)">
                <input name="retirement_reason" className={inputClass} />
              </Field>
            </div>
            <Button type="submit" disabled={statePending} variant="quiet" className="w-auto px-3 py-1.5 text-xs">
              {statePending ? "Guardando…" : "Guardar estado"}
            </Button>
          </form>
        </section>
      ) : null}
    </div>
  );
}

/** Corregir una medición: crea una versión nueva y conserva la original. */
function CorrectionPanel({
  indicatorId, measurements,
}: { indicatorId: string; measurements: MeasurementView[] }) {
  const [state, action, pending] = useActionState(correctMeasurementAction, initial);
  const correctable = measurements.filter((m) => m.isCurrent && m.resultState !== "closed");

  return (
    <section className={cardClass}>
      <form action={action} className="space-y-3">
        <h2 className="text-sm font-semibold">Corregir una medición</h2>
        <p className="text-xs text-ink-soft">
          Corregir no borra: el valor original se conserva con el motivo del cambio y quién lo hizo.
          Un periodo ya cerrado no aparece aquí.
        </p>
        <ErrorAlert message={state.error} />
        {state.success ? <SuccessAlert message={state.message ?? null} /> : null}
        <input type="hidden" name="indicator_id" value={indicatorId} />
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Periodo">
            <select name="measurement_id" className={inputClass}>
              {correctable.map((m) => (
                <option key={m.id} value={m.id}>{m.periodLabel} · {m.valueLabel}</option>
              ))}
            </select>
          </Field>
          <Field label="Valor corregido">
            <input name="value" inputMode="decimal" className={inputClass} />
          </Field>
          <Field label="Estado del dato">
            <select name="data_state" defaultValue="reported" className={inputClass}>
              <option value="reported">Con resultado</option>
              <option value="no_data">Sin dato</option>
              <option value="not_applicable">No aplica</option>
            </select>
          </Field>
        </div>
        <Field label="Motivo de la corrección (obligatorio)">
          <input name="reason" required className={inputClass} placeholder="p. ej. Se cargó el dato de otra línea" />
        </Field>
        <Button type="submit" disabled={pending} variant="quiet" className="w-auto px-3 py-1.5 text-xs">
          {pending ? "Corrigiendo…" : "Registrar corrección"}
        </Button>
      </form>
    </section>
  );
}
