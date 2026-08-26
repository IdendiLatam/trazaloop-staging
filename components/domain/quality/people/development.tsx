"use client";

import { ExportPdfButton } from "@/components/ui/export-pdf-button";
import {
  ACTIVITY_KIND_LABEL, ACTIVITY_KINDS, ATTENDANCE_STATUS_LABEL, ATTENDANCE_STATUSES,
  DEVELOPMENT_KIND_LABEL, DEVELOPMENT_KINDS, EFFECTIVENESS_METHOD_LABEL,
  EFFECTIVENESS_METHODS, EFFECTIVENESS_RESULT_LABEL, formatDate, LEARNING_RESULT_LABEL,
  LEARNING_RESULTS, NEED_ORIGIN_LABEL, NEED_ORIGINS, NEED_STATUS_LABEL,
  PLAN_ITEM_STATUS_LABEL,
} from "@/lib/domain/quality-people";
import type {
  CompetencyRow, DevelopmentNeedRow, DevelopmentPlanRow, LearningActivityRow, PersonRow,
} from "@/lib/db/quality-people";
import {
  addParticipantAction, addPlanItemAction, createActivityAction, createNeedAction,
  createPlanAction, planEffectivenessAction, recordAttendanceAction, recordLearningAction,
  reviewEffectivenessAction, setActivityStatusAction,
} from "@/server/actions/quality-people";
import { ActionForm, Card, DomainNote, Field, inputClass, Table } from "./shared";

/**
 * Trazaloop Quality · QUALITY-06 · Desarrollo.
 *
 * La pantalla se llama DESARROLLO y no «Capacitación» a propósito (PC-08). El
 * desplegable de tipo de acción abre con nueve opciones y solo una es un
 * curso: si el dominio se llamara «capacitación», la respuesta a cualquier
 * brecha acabaría siendo inscribir a alguien en algo.
 *
 * Y las cuatro capas —asistencia, aprendizaje, competencia, eficacia— tienen
 * cada una su propio formulario. No hay ninguna casilla que rellene dos.
 */
export function DevelopmentView({
  needs, plans, activities, people, competencies, canManage, today,
}: {
  needs: DevelopmentNeedRow[];
  plans: DevelopmentPlanRow[];
  activities: LearningActivityRow[];
  people: PersonRow[];
  competencies: CompetencyRow[];
  canManage: boolean;
  today: string;
}) {
  const year = Number(today.slice(0, 4));

  return (
    <div className="space-y-6">
      <DomainNote>
        Desarrollar no es solo capacitar. Una brecha puede cerrarse con práctica
        supervisada, mentoría, acompañamiento, rotación, autoestudio o experiencia
        dirigida; el curso es una opción entre varias, no la respuesta por defecto.
      </DomainNote>

      <Card
        title="Necesidades de desarrollo"
        description={`${needs.length} registrada(s)`}
        action={
          <ExportPdfButton exportKey="quality.development-need.list" label="Descargar PDF" />
        }
      >
        <Table
          headers={["Necesidad", "Para", "Origen", "Prioridad", "Estado"]}
          empty="Sin necesidades registradas."
          rows={needs.map((n) => [
            n.title, n.personName ?? "Del cargo o de la empresa",
            NEED_ORIGIN_LABEL[n.origin], n.priority, NEED_STATUS_LABEL[n.status],
          ])}
        />
        {canManage ? (
          <ActionForm action={createNeedAction} submitLabel="Registrar necesidad">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Necesidad">
                <input name="title" required className={inputClass} />
              </Field>
              <Field label="Origen">
                <select name="origin_kind" className={inputClass} defaultValue="competency_gap">
                  {NEED_ORIGINS.map((o) => (
                    <option key={o} value={o}>{NEED_ORIGIN_LABEL[o]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Persona" hint="Opcional: puede ser una necesidad del cargo.">
                <select name="person_id" className={inputClass} defaultValue="">
                  <option value="">Del cargo o de la empresa</option>
                  {people.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
                </select>
              </Field>
              <Field label="Competencia relacionada">
                <select name="competency_id" className={inputClass} defaultValue="">
                  <option value="">Ninguna</option>
                  {competencies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
            </div>
          </ActionForm>
        ) : null}
      </Card>

      <Card
        title="Planes de desarrollo"
        description="Anuales y vivos: admiten items durante todo el año."
        action={
          <ExportPdfButton exportKey="quality.development-plan.list" label="Descargar PDF" />
        }
      >
        {plans.map((plan) => (
          <div key={plan.id} className="space-y-2 border-b border-hairline pb-3 last:border-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-semibold text-ink">
                {plan.year} · {plan.title} <span className="font-normal text-ink-soft">({plan.status})</span>
              </h3>
              <ExportPdfButton
                exportKey="quality.development-plan.detail" id={plan.id} label="Descargar PDF"
              />
            </div>
            <Table
              headers={["Item", "Tipo de desarrollo", "Para", "Objetivo", "Entró el", "Estado"]}
              empty="Este plan todavía no tiene items."
              rows={plan.items.map((i) => [
                i.title, DEVELOPMENT_KIND_LABEL[i.developmentKind],
                i.personName ?? "Del cargo",
                i.targetDate ? formatDate(i.targetDate) : "—",
                formatDate(i.addedOn), PLAN_ITEM_STATUS_LABEL[i.status],
              ])}
            />
            {canManage ? (
              <ActionForm action={addPlanItemAction} submitLabel="Añadir item">
                <input type="hidden" name="plan_id" value={plan.id} />
                <div className="grid gap-3 sm:grid-cols-4">
                  <Field label="Item">
                    <input name="title" required className={inputClass} />
                  </Field>
                  <Field label="Tipo de desarrollo">
                    <select name="development_kind" className={inputClass} defaultValue="supervised_practice">
                      {DEVELOPMENT_KINDS.map((k) => (
                        <option key={k} value={k}>{DEVELOPMENT_KIND_LABEL[k]}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Persona">
                    <select name="person_id" className={inputClass} defaultValue="">
                      <option value="">Del cargo</option>
                      {people.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
                    </select>
                  </Field>
                  <Field label="Fecha objetivo">
                    <input name="target_date" type="date" className={inputClass} />
                  </Field>
                </div>
                <Field label="Por qué entra ahora" hint="Se guarda con la fecha de entrada.">
                  <input name="added_reason" className={inputClass} />
                </Field>
              </ActionForm>
            ) : null}
          </div>
        ))}
        {plans.length === 0 ? (
          <p className="text-xs text-ink-soft">Todavía no hay planes de desarrollo.</p>
        ) : null}
        {canManage ? (
          <ActionForm action={createPlanAction} submitLabel="Crear plan">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Año">
                <input name="year" type="number" defaultValue={year} className={inputClass} />
              </Field>
              <Field label="Título">
                <input name="title" required className={inputClass} />
              </Field>
              <Field label="Objetivo">
                <input name="objective" className={inputClass} />
              </Field>
            </div>
          </ActionForm>
        ) : null}
      </Card>

      <Card
        title="Actividades de aprendizaje"
        description="Lo que de verdad ocurrió, con quién y con qué resultado."
        action={
          <ExportPdfButton exportKey="quality.learning-activity.list" label="Descargar PDF" />
        }
      >
        {activities.map((a) => (
          <div key={a.id} className="space-y-2 border-b border-hairline pb-3 last:border-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-semibold text-ink">
                {a.title}{" "}
                <span className="font-normal text-ink-soft">
                  {ACTIVITY_KIND_LABEL[a.activityKind]} · {a.status}
                </span>
              </h3>
              <span className="flex gap-2">
                <ExportPdfButton
                  exportKey="quality.learning-activity.detail" id={a.id} label="Descargar PDF"
                />
                <ExportPdfButton
                  exportKey="quality.effectiveness.detail" id={a.id} label="Descargar PDF"
                />
              </span>
            </div>

            <Table
              headers={["Persona", "Asistencia", "Aprendizaje", "Evaluado"]}
              empty="Sin participantes."
              rows={a.participants.map((p) => [
                p.personName, ATTENDANCE_STATUS_LABEL[p.attendance],
                LEARNING_RESULT_LABEL[p.learningResult],
                p.evaluatedOn ? formatDate(p.evaluatedOn) : "—",
              ])}
            />
            <DomainNote>
              Asistencia y aprendizaje son columnas distintas. Una persona puede asistir al
              100 % y no demostrar nada, y eso tiene que poder registrarse.
            </DomainNote>

            <Table
              headers={["Criterio de eficacia", "Método", "Resultado", "Revisado"]}
              empty="No se ha declarado ningún criterio de eficacia."
              rows={a.effectiveness.map((e) => [
                e.criterion, EFFECTIVENESS_METHOD_LABEL[e.method],
                EFFECTIVENESS_RESULT_LABEL[e.result],
                e.reviewedOn ? formatDate(e.reviewedOn) : "—",
              ])}
            />

            {canManage ? (
              <div className="grid gap-4 lg:grid-cols-2">
                <ActionForm action={addParticipantAction} submitLabel="Inscribir persona">
                  <input type="hidden" name="activity_id" value={a.id} />
                  <Field label="Persona">
                    <select name="person_id" required className={inputClass}>
                      <option value="">Elige</option>
                      {people.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
                    </select>
                  </Field>
                </ActionForm>

                <ActionForm action={setActivityStatusAction} submitLabel="Cambiar estado">
                  <input type="hidden" name="activity_id" value={a.id} />
                  <Field label="Estado" hint="Terminarla no la vuelve eficaz.">
                    <select name="status" className={inputClass} defaultValue={a.status}>
                      <option value="planned">Planificada</option>
                      <option value="in_progress">En curso</option>
                      <option value="completed">Terminada</option>
                      <option value="cancelled">Cancelada</option>
                    </select>
                  </Field>
                </ActionForm>

                {a.participants.length > 0 ? (
                  <>
                    <ActionForm action={recordAttendanceAction} submitLabel="Registrar asistencia">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Participante">
                          <select name="participant_id" required className={inputClass}>
                            {a.participants.map((p) => (
                              <option key={p.id} value={p.id}>{p.personName}</option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Asistencia">
                          <select name="attendance_status" className={inputClass} defaultValue="attended">
                            {ATTENDANCE_STATUSES.map((s) => (
                              <option key={s} value={s}>{ATTENDANCE_STATUS_LABEL[s]}</option>
                            ))}
                          </select>
                        </Field>
                      </div>
                    </ActionForm>

                    <ActionForm action={recordLearningAction} submitLabel="Registrar aprendizaje">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Participante">
                          <select name="participant_id" required className={inputClass}>
                            {a.participants.map((p) => (
                              <option key={p.id} value={p.id}>{p.personName}</option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Resultado" hint="«No se evalúa» es una respuesta legítima.">
                          <select name="learning_result" className={inputClass} defaultValue="pending">
                            {LEARNING_RESULTS.map((r) => (
                              <option key={r} value={r}>{LEARNING_RESULT_LABEL[r]}</option>
                            ))}
                          </select>
                        </Field>
                      </div>
                    </ActionForm>
                  </>
                ) : null}

                <ActionForm action={planEffectivenessAction} submitLabel="Declarar criterio de eficacia">
                  <input type="hidden" name="activity_id" value={a.id} />
                  <Field label="Criterio" hint="Se declara ANTES de juzgar.">
                    <input name="criterion" required className={inputClass} />
                  </Field>
                  <Field label="Cómo se comprobará">
                    <select name="method" className={inputClass} defaultValue="observation">
                      {EFFECTIVENESS_METHODS.map((m) => (
                        <option key={m} value={m}>{EFFECTIVENESS_METHOD_LABEL[m]}</option>
                      ))}
                    </select>
                  </Field>
                </ActionForm>

                {a.effectiveness.some((e) => e.result === "pending") ? (
                  <ActionForm action={reviewEffectivenessAction} submitLabel="Evaluar eficacia">
                    <Field label="Criterio">
                      <select name="review_id" required className={inputClass}>
                        {a.effectiveness.filter((e) => e.result === "pending").map((e) => (
                          <option key={e.id} value={e.id}>{e.criterion}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Resultado">
                      <select name="result" className={inputClass} defaultValue="effective">
                        <option value="effective">Eficaz</option>
                        <option value="partially_effective">Parcialmente eficaz</option>
                        <option value="not_effective">No eficaz</option>
                      </select>
                    </Field>
                    <Field label="En qué se comprobó">
                      <textarea name="observation" rows={2} required className={inputClass} />
                    </Field>
                  </ActionForm>
                ) : null}
              </div>
            ) : null}
          </div>
        ))}
        {activities.length === 0 ? (
          <p className="text-xs text-ink-soft">Sin actividades registradas.</p>
        ) : null}

        {canManage ? (
          <ActionForm action={createActivityAction} submitLabel="Registrar actividad">
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Actividad">
                <input name="title" required className={inputClass} />
              </Field>
              <Field label="Tipo">
                <select name="activity_kind" className={inputClass} defaultValue="course">
                  {ACTIVITY_KINDS.map((k) => (
                    <option key={k} value={k}>{ACTIVITY_KIND_LABEL[k]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Inicio">
                <input name="starts_on" type="date" className={inputClass} />
              </Field>
              <Field label="Fin">
                <input name="ends_on" type="date" className={inputClass} />
              </Field>
            </div>
            <Field label="Proveedor">
              <input name="provider" className={inputClass} />
            </Field>
          </ActionForm>
        ) : null}
      </Card>
    </div>
  );
}
