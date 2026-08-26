"use client";

import Link from "next/link";
import { ExportPdfButton } from "@/components/ui/export-pdf-button";
import {
  CLOSE_REVIEWS_METHODOLOGY, COMPARABILITY_BROKEN, CUSTOMER_SIGNAL_LABEL,
  formatDate, LOW_SATISFACTION_IS_A_SIGNAL, METHODOLOGY_VERDICT_LABEL,
  METHODOLOGY_VERDICTS, METRIC_METHOD_HINT, METRIC_METHOD_LABEL, METRIC_METHODS,
  NO_IMPOSED_METHODOLOGY, SIGNAL_DECIDES_NOTHING, splitComparableSeries,
  type CustomerSignalKind,
} from "@/lib/domain/quality-customer-voice";
import type {
  CustomerSignalRow, MetricDefinitionRow, MetricResultRow, VoiceReviewRow,
} from "@/lib/db/quality-customer-voice";
import {
  closeVoiceReviewAction, createMetricAction, createVoiceReviewAction,
  dismissSignalAction, scanCustomerVoiceAction,
} from "@/server/actions/quality-customer-voice";
import { ActionForm, Card, DomainNote, Field, inputClass, Table } from "./shared";

/**
 * Trazaloop Quality · QUALITY-08 · El resumen de la Voz del Cliente.
 *
 * §41 · Contesta cuatro preguntas y se detiene ahí: qué están diciendo los
 * clientes, cómo cambia, dónde hay señales y qué requiere atención.
 *
 * Lo que NO hace: un ranking de clientes. Ordenar a los clientes por lo
 * contentos que están produce una lista humillante que no ayuda a decidir nada,
 * y en una campaña anónima además reidentifica.
 */
export function CustomerVoiceSummary({
  definitions, series, signals, reviews, positions, canManage, canClose, today,
}: {
  definitions: MetricDefinitionRow[];
  series: MetricResultRow[];
  signals: CustomerSignalRow[];
  reviews: VoiceReviewRow[];
  positions: { id: string; name: string }[];
  canManage: boolean;
  canClose: boolean;
  today: string;
}) {
  const abiertas = signals.filter((s) => s.status === "open");

  return (
    <div className="space-y-6">
      <Card
        title="Señales"
        description={`${abiertas.length} abierta${abiertas.length === 1 ? "" : "s"}`}
      >
        <Table
          headers={["Señal", "Detalle", "Desde", ""]}
          empty="No hay ninguna señal abierta."
          rows={abiertas.map((s) => [
            CUSTOMER_SIGNAL_LABEL[s.kind as CustomerSignalKind] ?? s.kind,
            s.detail ?? "—",
            formatDate(s.firstSeenAt.slice(0, 10)),
            canManage ? (
              <ActionForm
                key="d" action={dismissSignalAction} submitLabel="Descartar"
                className="flex items-end gap-2"
              >
                <input type="hidden" name="signal_id" value={s.id} />
              </ActionForm>
            ) : "",
          ])}
        />
        <DomainNote>{SIGNAL_DECIDES_NOTHING}</DomainNote>
        <DomainNote>{LOW_SATISFACTION_IS_A_SIGNAL}</DomainNote>
        {canManage ? (
          <ActionForm action={scanCustomerVoiceAction} submitLabel="Revisar ahora">
            <DomainNote>
              La revisión solo <strong>avisa</strong>. No abre casos, no clasifica no
              conformidades, no crea riesgos y no duplica los avisos que ya existían.
            </DomainNote>
          </ActionForm>
        ) : null}
      </Card>

      <Card
        title="Cómo evoluciona"
        description="Cada tramo es una serie comparable. Donde cambia el instrumento, la línea se corta."
        action={
          <span className="flex flex-wrap gap-2">
            <ExportPdfButton exportKey="quality.customer-satisfaction.list" label="Descargar PDF" />
            <ExportPdfButton exportKey="quality.customer-voice-trend.list" label="Descargar PDF" />
          </span>
        }
      >
        {definitions.length === 0 ? (
          <p className="text-xs text-ink-soft">
            Todavía no hay métricas definidas. Trazaloop no impone ninguna: defínelas
            abajo con la metodología de tu empresa.
          </p>
        ) : (
          definitions.map((d) => {
            const puntos = series.filter((s) => s.definitionId === d.id);
            const tramos = splitComparableSeries(puntos);
            return (
              <div key={d.id} className="space-y-1">
                <p className="text-xs font-medium text-ink">
                  {d.name} · {METRIC_METHOD_LABEL[d.method]}
                </p>
                {puntos.length === 0 ? (
                  <p className="text-xs text-ink-soft">Sin mediciones todavía.</p>
                ) : (
                  tramos.map((tramo, i) => (
                    <div key={i} className="space-y-1">
                      {i > 0 ? <DomainNote>{COMPARABILITY_BROKEN}</DomainNote> : null}
                      <Table
                        headers={["Periodo", "Resultado", "Respuestas", "No aplica"]}
                        empty=""
                        rows={tramo.map((p) => [
                          p.periodLabel ?? formatDate(p.periodStart),
                          p.value === null
                            ? (p.sampleSize === 0 ? "Sin respuestas" : "Sin datos")
                            : String(p.value),
                          String(p.sampleSize),
                          String(p.notApplicable),
                        ])}
                      />
                    </div>
                  ))
                )}
              </div>
            );
          })
        )}
      </Card>

      {canManage ? (
        <Card title="Métricas de la empresa">
          <Table
            headers={["Métrica", "Método", "Pregunta", "Escala", "Qué significa"]}
            empty="Sin métricas definidas."
            rows={definitions.map((d) => [
              d.name,
              METRIC_METHOD_LABEL[d.method],
              d.questionStableKey ?? "—",
              d.expectsScaleMin !== null ? `${d.expectsScaleMin}–${d.expectsScaleMax}` : "—",
              METRIC_METHOD_HINT[d.method],
            ])}
          />
          <DomainNote>{NO_IMPOSED_METHODOLOGY}</DomainNote>
          <ActionForm action={createMetricAction} submitLabel="Definir métrica">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Nombre"><input name="name" required className={inputClass} /></Field>
              <Field label="Método">
                <select name="method" className={inputClass} defaultValue="average">
                  {METRIC_METHODS.map((m) => (
                    <option key={m} value={m}>{METRIC_METHOD_LABEL[m]}</option>
                  ))}
                </select>
              </Field>
              <Field
                label="Clave estable de la pregunta"
                hint="La misma que pusiste al crear la pregunta."
              >
                <input name="question_stable_key" className={inputClass} />
              </Field>
              <Field label="Escala esperada — mínimo" hint="0 para NPS.">
                <input name="expects_scale_min" type="number" className={inputClass} />
              </Field>
              <Field label="Escala esperada — máximo" hint="10 para NPS.">
                <input name="expects_scale_max" type="number" className={inputClass} />
              </Field>
              <Field label="Umbral favorable" hint="Solo para «porcentaje favorable».">
                <input name="top_box_min" type="number" className={inputClass} />
              </Field>
            </div>
            <DomainNote>
              Si eliges NPS, la escala tiene que ser 0–10: el sistema se niega a llamar
              NPS a un promedio, porque entonces la palabra dejaría de significar algo.
            </DomainNote>
          </ActionForm>
        </Card>
      ) : null}

      <Card
        title="Cierre del periodo"
        description="La revisión consolidada y formal de la satisfacción."
      >
        <Table
          headers={["Periodo", "Desde", "Hasta", "Estado", "Metodología", ""]}
          empty="Todavía no se ha abierto ningún periodo."
          rows={reviews.map((r) => [
            r.periodLabel,
            formatDate(r.periodStart),
            formatDate(r.periodEnd),
            r.status === "closed" ? "Cerrado" : "Abierto",
            r.methodologyVerdict ? METHODOLOGY_VERDICT_LABEL[r.methodologyVerdict] : "—",
            <ExportPdfButton
              key="x" exportKey="quality.customer-voice-review.detail" id={r.id}
              label="Descargar PDF"
            />,
          ])}
        />
        <DomainNote>{CLOSE_REVIEWS_METHODOLOGY}</DomainNote>

        {canManage ? (
          <ActionForm action={createVoiceReviewAction} submitLabel="Abrir periodo">
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Nombre" hint="Por ejemplo: 2027."><input name="period_label" required className={inputClass} /></Field>
              <Field label="Desde"><input name="period_start" type="date" required className={inputClass} /></Field>
              <Field label="Hasta"><input name="period_end" type="date" required className={inputClass} /></Field>
              <Field label="Responsable">
                <select name="owner_position_id" className={inputClass} defaultValue="">
                  <option value="">Sin asignar</option>
                  {positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Qué segmentos cubre"><input name="scope_note" className={inputClass} /></Field>
          </ActionForm>
        ) : null}

        {canClose && reviews.some((r) => r.status === "draft") ? (
          <ActionForm action={closeVoiceReviewAction} submitLabel="Cerrar periodo">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Periodo">
                <select name="review_id" required className={inputClass}>
                  {reviews.filter((r) => r.status === "draft").map((r) => (
                    <option key={r.id} value={r.id}>{r.periodLabel}</option>
                  ))}
                </select>
              </Field>
              <Field label="¿La metodología sigue sirviendo?">
                <select name="methodology_verdict" className={inputClass} defaultValue="adequate">
                  {METHODOLOGY_VERDICTS.map((v) => (
                    <option key={v} value={v}>{METHODOLOGY_VERDICT_LABEL[v]}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Conclusiones" hint="Obligatorias: un cierre sin conclusiones no es una revisión.">
              <textarea name="conclusions" rows={3} required className={inputClass} />
            </Field>
            <DomainNote>
              Al cerrar se congela el retrato del periodo —respuestas, quejas,
              felicitaciones y métricas— y ya no se reescribe.
            </DomainNote>
          </ActionForm>
        ) : null}
      </Card>

      <p className="text-xs text-ink-soft">
        ¿Buscas una queja concreta?{" "}
        <Link href="/quality/customer-voice/feedback" className="font-medium text-loop hover:underline">
          Retroalimentación
        </Link>. ¿Una campaña?{" "}
        <Link href="/quality/customer-voice/campaigns" className="font-medium text-loop hover:underline">
          Campañas
        </Link>.
      </p>
      <p className="text-xs text-ink-soft">
        Hoy es {formatDate(today)}.
      </p>
    </div>
  );
}
