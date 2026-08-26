"use client";

import Link from "next/link";
import { ExportPdfButton } from "@/components/ui/export-pdf-button";
import {
  EVALUATION_STATUS_LABEL, formatDate, PERFORMANCE_CYCLE_STATUS_LABEL,
  PERFORMANCE_RESULT_LABEL, PERFORMANCE_RESULTS,
} from "@/lib/domain/quality-people";
import type {
  PerformanceCycleRow, PerformanceEvaluationRow, PersonRow,
} from "@/lib/db/quality-people";
import {
  addCycleMemberAction, addEvaluationItemAction, closeEvaluationAction,
  createCycleAction, createEvaluationAction, setCycleStatusAction,
} from "@/server/actions/quality-people";
import { ActionForm, Card, DomainNote, Field, inputClass, Table } from "./shared";

/**
 * Trazaloop Quality · QUALITY-06 · Desempeño.
 *
 * PC-06 · Es un dominio APARTE de la competencia. Aquí no se escribe en la
 * competencia de nadie: una persona puede ser competente y estar rindiendo mal
 * —por el proceso, por la carga, por las herramientas— y eso es información
 * distinta que merece un registro distinto.
 *
 * PC-28 · Y el resultado lo escribe una persona. La plataforma puede poner
 * contexto delante del evaluador; lo que no hace es calcular una nota ni
 * ordenar a nadie.
 */
export function PerformanceView({
  cycles, evaluations, people, canManage, today,
}: {
  cycles: PerformanceCycleRow[];
  evaluations: Omit<PerformanceEvaluationRow, "items">[];
  people: PersonRow[];
  canManage: boolean;
  today: string;
}) {
  const year = today.slice(0, 4);

  return (
    <div className="space-y-6">
      <DomainNote>
        <strong>Competencia</strong> es lo que alguien sabe hacer; <strong>desempeño</strong>{" "}
        es cómo le está yendo. Evaluar el desempeño no cambia la competencia declarada, y
        esta pantalla no calcula notas ni ordena personas.
      </DomainNote>

      {cycles.map((c) => (
        <Card
          key={c.id}
          title={`${c.name} · ${PERFORMANCE_CYCLE_STATUS_LABEL[c.status]}`}
          description={`${formatDate(c.periodStart)} → ${formatDate(c.periodEnd)}`}
          action={
            <ExportPdfButton
              exportKey="quality.performance-cycle.detail" id={c.id} label="Descargar PDF"
            />
          }
        >
          <Table
            headers={["Persona aplicable", "Por qué está incluida"]}
            empty="Todavía no has declarado quién es aplicable en este ciclo."
            rows={c.population.map((p) => [p.personName, p.reason ?? "—"])}
          />
          <DomainNote>
            El ciclo aplica a quien está en esta lista, no necesariamente a toda la empresa.
            La población se declara antes de evaluar, para que «sin evaluar» no se confunda
            con «no aplicable».
          </DomainNote>

          <Table
            headers={["Persona", "Evaluador", "Fecha", "Estado", ""]}
            empty="Sin evaluaciones en este ciclo."
            rows={evaluations.filter((e) => e.cycleId === c.id).map((e) => [
              <Link
                key="n" href={`/quality/people/performance/${e.id}`}
                className="font-medium text-loop hover:underline"
              >
                {e.personName}
              </Link>,
              e.evaluatorName ?? "—",
              e.evaluatedOn ? formatDate(e.evaluatedOn) : "—",
              EVALUATION_STATUS_LABEL[e.status],
              <ExportPdfButton
                key="x" exportKey="quality.performance-evaluation.detail" id={e.id}
                label="Descargar PDF"
              />,
            ])}
          />

          {canManage ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <ActionForm action={addCycleMemberAction} submitLabel="Añadir a la población">
                <input type="hidden" name="cycle_id" value={c.id} />
                <Field label="Persona">
                  <select name="person_id" required className={inputClass}>
                    <option value="">Elige</option>
                    {people.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
                  </select>
                </Field>
                <Field label="Por qué es aplicable">
                  <input name="inclusion_reason" className={inputClass} />
                </Field>
              </ActionForm>

              <ActionForm action={setCycleStatusAction} submitLabel="Cambiar estado del ciclo">
                <input type="hidden" name="cycle_id" value={c.id} />
                <Field label="Estado">
                  <select name="status" className={inputClass} defaultValue={c.status}>
                    <option value="draft">Borrador</option>
                    <option value="open">Abierto</option>
                    <option value="closed">Cerrado</option>
                  </select>
                </Field>
              </ActionForm>

              <ActionForm action={createEvaluationAction} submitLabel="Crear evaluación">
                <input type="hidden" name="cycle_id" value={c.id} />
                <Field label="Persona evaluada">
                  <select name="person_id" required className={inputClass}>
                    <option value="">Elige</option>
                    {c.population.map((p) => (
                      <option key={p.personId} value={p.personId}>{p.personName}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Quién evalúa" hint="Una persona real. Nadie se evalúa a sí mismo.">
                  <select name="evaluator_person_id" required className={inputClass}>
                    <option value="">Elige</option>
                    {people.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
                  </select>
                </Field>
                <Field label="Contexto" hint="Lo que rodea al desempeño también es el registro.">
                  <textarea name="context_note" rows={2} className={inputClass} />
                </Field>
              </ActionForm>
            </div>
          ) : null}
        </Card>
      ))}

      {evaluations.filter((e) => e.status !== "closed").length > 0 && canManage ? (
        <Card title="Evaluar" description="Contra criterios escritos, no contra un número.">
          <ActionForm action={addEvaluationItemAction} submitLabel="Añadir criterio evaluado">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Evaluación">
                <select name="evaluation_id" required className={inputClass}>
                  {evaluations.filter((e) => e.status !== "closed").map((e) => (
                    <option key={e.id} value={e.id}>{e.personName} · {e.cycleName}</option>
                  ))}
                </select>
              </Field>
              <Field label="Contra qué se evalúa">
                <input name="criterion" required className={inputClass} />
              </Field>
              <Field label="Resultado">
                <select name="result" className={inputClass} defaultValue="meets">
                  {PERFORMANCE_RESULTS.map((r) => (
                    <option key={r} value={r}>{PERFORMANCE_RESULT_LABEL[r]}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Observación">
              <textarea name="observation" rows={2} className={inputClass} />
            </Field>
          </ActionForm>

          <ActionForm action={closeEvaluationAction} submitLabel="Cerrar evaluación">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Evaluación">
                <select name="evaluation_id" required className={inputClass}>
                  {evaluations.filter((e) => e.status !== "closed").map((e) => (
                    <option key={e.id} value={e.id}>{e.personName} · {e.cycleName}</option>
                  ))}
                </select>
              </Field>
              <Field label="Conclusión">
                <input name="summary" required className={inputClass} />
              </Field>
            </div>
          </ActionForm>
        </Card>
      ) : null}

      {canManage ? (
        <Card title="Nuevo ciclo" description="Anual, con su población aplicable.">
          <ActionForm action={createCycleAction} submitLabel="Crear ciclo">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Nombre">
                <input name="name" required defaultValue={`Ciclo ${year}`} className={inputClass} />
              </Field>
              <Field label="Desde">
                <input name="period_start" type="date" required className={inputClass} />
              </Field>
              <Field label="Hasta">
                <input name="period_end" type="date" required className={inputClass} />
              </Field>
            </div>
            <Field label="Propósito">
              <input name="purpose" className={inputClass} />
            </Field>
          </ActionForm>
        </Card>
      ) : null}
    </div>
  );
}
