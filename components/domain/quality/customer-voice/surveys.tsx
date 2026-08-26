"use client";

import { ExportPdfButton } from "@/components/ui/export-pdf-button";
import {
  formatDate, QUESTION_TYPE_LABEL, QUESTION_TYPES, QUESTION_TYPES_ARE_ENOUGH,
  SURVEY_VERSION_STATUS_LABEL, VERSION_IS_FROZEN,
} from "@/lib/domain/quality-customer-voice";
import type { SurveyRow, TopicRow } from "@/lib/db/quality-customer-voice";
import {
  addQuestionAction, createSurveyAction, createVersionAction, deleteQuestionAction,
  publishVersionAction, retireSurveyAction,
} from "@/server/actions/quality-customer-voice";
import { ActionForm, Card, DomainNote, Field, inputClass, Table } from "./shared";

/**
 * Trazaloop Quality · QUALITY-08 · Encuestas y versiones.
 *
 * Una encuesta se VERSIONA en lugar de editarse. La razón no es técnica: si se
 * cambia una pregunta que ya tiene respuestas, todas ellas empiezan a
 * significar otra cosa sin que nadie las haya tocado, y comparar 2027 con 2028
 * deja de tener sentido.
 */
export function SurveysView({
  surveys, topics, positions, canManage, today,
}: {
  surveys: SurveyRow[];
  topics: TopicRow[];
  positions: { id: string; name: string }[];
  canManage: boolean;
  today: string;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <ExportPdfButton exportKey="quality.survey.list" label="Descargar PDF" />
      </div>

      <DomainNote>{VERSION_IS_FROZEN}</DomainNote>

      {canManage ? (
        <Card title="Encuesta nueva" description="Nace con su primera versión en borrador.">
          <ActionForm action={createSurveyAction} submitLabel="Crear encuesta">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Nombre"><input name="name" required className={inputClass} /></Field>
              <Field label="Código"><input name="code" className={inputClass} /></Field>
              <Field label="Responsable">
                <select name="owner_position_id" className={inputClass} defaultValue="">
                  <option value="">Sin asignar</option>
                  {positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
            </div>
            <Field
              label="Para qué existe"
              hint="Una encuesta sin propósito escrito acaba preguntando lo que a nadie le sirve."
            >
              <textarea name="purpose" rows={2} className={inputClass} />
            </Field>
          </ActionForm>
        </Card>
      ) : null}

      {surveys.length === 0 ? (
        <p className="text-sm text-ink-soft">Todavía no hay encuestas.</p>
      ) : null}

      {surveys.map((s) => (
        <Card
          key={s.id}
          title={s.code ? `${s.code} · ${s.name}` : s.name}
          description={s.purpose ?? s.description ?? undefined}
          action={
            <ExportPdfButton exportKey="quality.survey.detail" id={s.id} label="Descargar PDF" />
          }
        >
          {s.versions.map((v) => (
            <div key={v.id} className="space-y-2 rounded-md border border-hairline p-3">
              <p className="flex flex-wrap items-center gap-2 text-xs font-medium text-ink">
                <span>
                  Versión {v.versionNumber} · {SURVEY_VERSION_STATUS_LABEL[v.status]}
                  {v.effectiveFrom ? ` · desde ${formatDate(v.effectiveFrom)}` : ""}
                  {v.effectiveTo ? ` hasta ${formatDate(v.effectiveTo)}` : ""}
                </span>
                <ExportPdfButton
                  exportKey="quality.survey-version.detail" id={v.id} label="Descargar PDF"
                />
              </p>

              <Table
                headers={["Orden", "Clave estable", "Pregunta", "Tipo", "Escala", "Obligatoria", "N/A", ""]}
                empty="Esta versión no tiene preguntas: sin ellas no se puede publicar."
                rows={v.questions.map((q) => [
                  String(q.order),
                  <code key="k" className="text-[11px]">{q.stableKey}</code>,
                  q.label,
                  QUESTION_TYPE_LABEL[q.questionType],
                  q.scaleMin !== null && q.scaleMax !== null ? `${q.scaleMin}–${q.scaleMax}` : "—",
                  q.isRequired ? "Sí" : "No",
                  q.allowsNotApplicable ? "Sí" : "No",
                  canManage && v.status === "draft" ? (
                    <ActionForm
                      key="d" action={deleteQuestionAction} submitLabel="Quitar"
                      className="flex items-end gap-2"
                    >
                      <input type="hidden" name="question_id" value={q.id} />
                    </ActionForm>
                  ) : "",
                ])}
              />

              {canManage && v.status === "draft" ? (
                <>
                  <ActionForm action={addQuestionAction} submitLabel="Añadir pregunta">
                    <input type="hidden" name="version_id" value={v.id} />
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Field
                        label="Clave estable"
                        hint="Identifica esta pregunta a través de las versiones. Repítela en v2 para poder comparar."
                      >
                        <input name="stable_key" required className={inputClass}
                          placeholder="entrega.puntualidad" />
                      </Field>
                      <Field label="Pregunta"><input name="label" required className={inputClass} /></Field>
                      <Field label="Tipo">
                        <select name="question_type" className={inputClass} defaultValue="scale">
                          {QUESTION_TYPES.map((t) => (
                            <option key={t} value={t}>{QUESTION_TYPE_LABEL[t]}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Escala mínima" hint="Solo para escalas.">
                        <input name="scale_min" type="number" className={inputClass} />
                      </Field>
                      <Field label="Escala máxima" hint="0 y 10 si vas a calcular NPS.">
                        <input name="scale_max" type="number" className={inputClass} />
                      </Field>
                      <Field label="Orden">
                        <input name="position_order" type="number" min={1}
                          defaultValue={v.questions.length + 1} className={inputClass} />
                      </Field>
                      <Field label="Etiqueta del mínimo"><input name="scale_min_label" className={inputClass} /></Field>
                      <Field label="Etiqueta del máximo"><input name="scale_max_label" className={inputClass} /></Field>
                      <Field label="Tema">
                        <select name="topic_id" className={inputClass} defaultValue="">
                          <option value="">Sin tema</option>
                          {topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      </Field>
                    </div>
                    <Field
                      label="Opciones"
                      hint="Una por línea. Solo para preguntas de una o varias opciones."
                    >
                      <textarea name="options" rows={3} className={inputClass} />
                    </Field>
                    <div className="flex flex-wrap gap-4">
                      <label className="flex items-center gap-2 text-xs text-ink">
                        <input type="checkbox" name="is_required" /> Obligatoria
                      </label>
                      <label className="flex items-center gap-2 text-xs text-ink">
                        <input type="checkbox" name="allows_not_applicable" /> Permite «no aplica»
                      </label>
                    </div>
                    <DomainNote>{QUESTION_TYPES_ARE_ENOUGH}</DomainNote>
                  </ActionForm>

                  <ActionForm
                    action={publishVersionAction} submitLabel="Publicar versión"
                    disabled={v.questions.length === 0}
                  >
                    <input type="hidden" name="version_id" value={v.id} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="En vigor desde">
                        <input name="effective_from" type="date" defaultValue={today}
                          className={inputClass} />
                      </Field>
                      <Field label="Qué cambia"><input name="change_note" className={inputClass} /></Field>
                    </div>
                    <DomainNote>
                      Una vez publicada no se reescribe. Las respuestas que reciba se
                      interpretarán siempre con estas preguntas, aunque después publiques
                      otra versión.
                    </DomainNote>
                  </ActionForm>
                </>
              ) : null}
            </div>
          ))}

          {canManage && !s.versions.some((v) => v.status === "draft") ? (
            <ActionForm action={createVersionAction} submitLabel="Nueva versión">
              <input type="hidden" name="survey_id" value={s.id} />
              <Field label="Por qué se versiona"><input name="change_note" className={inputClass} /></Field>
              <DomainNote>
                La versión nueva empieza con una copia de las preguntas actuales, para
                que las claves estables se conserven y las series sigan siendo
                comparables.
              </DomainNote>
            </ActionForm>
          ) : null}

          {canManage && s.isActive ? (
            <ActionForm action={retireSurveyAction} submitLabel="Retirar encuesta">
              <input type="hidden" name="survey_id" value={s.id} />
            </ActionForm>
          ) : null}
        </Card>
      ))}
    </div>
  );
}
