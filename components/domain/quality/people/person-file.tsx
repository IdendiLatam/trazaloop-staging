"use client";

import Link from "next/link";
import { ExportPdfButton } from "@/components/ui/export-pdf-button";
import {
  ASSIGNMENT_TYPE_LABEL, ASSIGNMENT_TYPES, ATTENDANCE_STATUS_LABEL,
  COMPETENCE_METHOD_LABEL, COMPETENCE_METHODS, CRITICALITY_LABEL,
  describeEvidenceExpiry, EVIDENCE_STATUS_LABEL, formatDate, HOLDER_LEVEL_LABEL,
  LEARNING_RESULT_LABEL, NEED_ORIGIN_LABEL, NEED_STATUS_LABEL,
  PERSON_COMPETENCE_STATUS_LABEL, PERSON_RELATIONSHIP_LABEL, PERSON_STATUS_LABEL,
} from "@/lib/domain/quality-people";
import type { OffboardingReport, PersonFile } from "@/lib/db/quality-people";
import {
  addEvidenceAction, assignPositionAction, endAssignmentAction, recordCompetenceAction,
  retirePersonAction,
} from "@/server/actions/quality-people";
import { ActionForm, Card, DomainNote, Field, inputClass, Table } from "./shared";

/**
 * Trazaloop Quality · QUALITY-06 · La ficha de una persona.
 *
 * Es la pantalla donde más fácil sería mentir, así que es donde más explícitas
 * están las separaciones: la asignación anterior no se sobrescribe, la
 * competencia anterior no se borra, una evidencia vencida no declara a nadie
 * incompetente, y desvincular a alguien no elimina nada de lo que hizo.
 */
export function PersonFileView({
  file, positions, competencies, levels, offboarding, canManage, today,
}: {
  file: PersonFile;
  positions: { id: string; name: string }[];
  competencies: { id: string; name: string }[];
  levels: { value: number; label: string }[];
  offboarding: OffboardingReport | null;
  canManage: boolean;
  today: string;
}) {
  const p = file.person;
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link href="/quality/people" className="text-xs font-medium text-loop hover:underline">
          ← Personas
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{p.fullName}</h1>
          <span className="text-xs text-ink-soft">
            {PERSON_STATUS_LABEL[p.status]} · {PERSON_RELATIONSHIP_LABEL[p.relationship]} ·{" "}
            {p.profileId ? "con cuenta de Trazaloop" : "sin cuenta de Trazaloop"}
          </span>
        </div>
        <div className="flex gap-2">
          <ExportPdfButton exportKey="quality.person.detail" id={p.id} label="Descargar PDF" />
          <ExportPdfButton
            exportKey="quality.person-competence.detail" id={p.id} label="Descargar PDF"
          />
        </div>
      </header>

      <Card title="Cargos ocupados" description="La historia completa, con sus vigencias.">
        <Table
          headers={["Cargo", "Vínculo", "Desde", "Hasta", ""]}
          empty="Esta persona todavía no ocupa ningún cargo."
          rows={file.assignments.map((a) => [
            a.positionName,
            ASSIGNMENT_TYPE_LABEL[a.assignmentType],
            formatDate(a.effectiveFrom),
            a.effectiveTo ? formatDate(a.effectiveTo) : "Vigente",
            canManage && a.effectiveTo === null ? (
              <form key="e" action={endAssignmentActionWrapper} className="inline">
                <input type="hidden" name="assignment_id" value={a.id} />
                <input type="hidden" name="person_id" value={p.id} />
                <button
                  type="submit"
                  className="text-xs font-medium text-loop hover:underline"
                >
                  Cerrar vigencia hoy
                </button>
              </form>
            ) : "",
          ])}
        />
        <DomainNote>
          Cerrar una vigencia no borra la asignación: la anterior sigue diciendo quién
          ocupaba el cargo y entre qué fechas. Por eso un informe de marzo puede
          responder con el titular de marzo, no con el de hoy.
        </DomainNote>
        {canManage ? (
          <ActionForm action={assignPositionAction} submitLabel="Asignar cargo">
            <input type="hidden" name="person_id" value={p.id} />
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Cargo">
                <select name="position_id" required className={inputClass}>
                  <option value="">Elige un cargo</option>
                  {positions.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </Field>
              <Field
                label="Vínculo"
                hint="Un cargo puede tener varios ocupantes; el titular principal es único."
              >
                <select name="assignment_type" className={inputClass} defaultValue="holder">
                  {ASSIGNMENT_TYPES.map((t) => (
                    <option key={t} value={t}>{ASSIGNMENT_TYPE_LABEL[t]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Desde">
                <input name="effective_from" type="date" defaultValue={today} className={inputClass} />
              </Field>
            </div>
          </ActionForm>
        ) : null}
      </Card>

      <Card title="Competencia demostrada" description="Decisiones con su método y su fundamento.">
        <Table
          headers={["Competencia", "Nivel", "Método", "Evaluada", "Estado"]}
          empty="Todavía no se ha declarado competencia demostrada."
          rows={file.competencies.map((c) => [
            c.competencyName, String(c.demonstratedLevel),
            COMPETENCE_METHOD_LABEL[c.method], formatDate(c.assessedOn),
            PERSON_COMPETENCE_STATUS_LABEL[c.status],
          ])}
        />
        <DomainNote>
          Registrar una competencia nueva SUSTITUYE a la anterior sin borrarla. Y demostrar
          competencia no es lo mismo que rendir bien: el desempeño se evalúa aparte.
        </DomainNote>
        {canManage ? (
          <ActionForm action={recordCompetenceAction} submitLabel="Registrar competencia">
            <input type="hidden" name="person_id" value={p.id} />
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Competencia">
                <select name="competency_id" required className={inputClass}>
                  <option value="">Elige</option>
                  {competencies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="Nivel demostrado">
                <select name="demonstrated_level" required className={inputClass}>
                  {levels.map((l) => (
                    <option key={l.value} value={l.value}>{l.value} · {l.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Cómo se demostró">
                <select name="method" className={inputClass} defaultValue="observation">
                  {COMPETENCE_METHODS.map((m) => (
                    <option key={m} value={m}>{COMPETENCE_METHOD_LABEL[m]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Fecha">
                <input name="assessed_on" type="date" defaultValue={today} className={inputClass} />
              </Field>
            </div>
            <Field label="Fundamento" hint="Qué se observó, no «sí sabe».">
              <textarea name="rationale" rows={2} className={inputClass} />
            </Field>
          </ActionForm>
        ) : null}
      </Card>

      <Card title="Evidencia" description="Educación, experiencia, certificación, observación…">
        <Table
          headers={["Competencia", "Evidencia", "Emisor", "Situación", "Estado"]}
          empty="Sin evidencia registrada."
          rows={file.competencies.flatMap((c) => c.evidence.map((e) => [
            c.competencyName, e.title, e.issuer ?? "—",
            describeEvidenceExpiry({ status: e.status, expiresOn: e.expiresOn }, today),
            EVIDENCE_STATUS_LABEL[e.status],
          ]))}
        />
        <DomainNote>
          Una evidencia vencida pide <strong>revisión</strong>. No convierte a nadie en
          incompetente: esa es una decisión aparte, y la toma una persona.
        </DomainNote>
        {canManage && file.competencies.length > 0 ? (
          <ActionForm action={addEvidenceAction} submitLabel="Añadir evidencia">
            <input type="hidden" name="person_id" value={p.id} />
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Sobre qué competencia">
                <select name="person_competency_id" required className={inputClass}>
                  {file.competencies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.competencyName} · nivel {c.demonstratedLevel}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Evidencia">
                <input name="title" required className={inputClass} />
              </Field>
              <Field label="Emisor">
                <input name="issuer" className={inputClass} />
              </Field>
              <Field label="Vence" hint="En blanco = no vence.">
                <input name="expires_on" type="date" className={inputClass} />
              </Field>
            </div>
          </ActionForm>
        ) : null}
      </Card>

      <Card title="Desarrollo">
        <Table
          headers={["Necesidad", "Origen", "Estado"]}
          empty="Sin necesidades de desarrollo registradas."
          rows={file.needs.map((n) => [
            n.title, NEED_ORIGIN_LABEL[n.origin], NEED_STATUS_LABEL[n.status],
          ])}
        />
      </Card>

      <Card title="Formación y aprendizaje">
        <Table
          headers={["Actividad", "Asistencia", "Aprendizaje"]}
          empty="Sin participaciones registradas."
          rows={file.participations.map((x) => [
            x.activityTitle,
            ATTENDANCE_STATUS_LABEL[x.participant.attendance],
            LEARNING_RESULT_LABEL[x.participant.learningResult],
          ])}
        />
        <DomainNote>
          Asistir no es aprender, y aprobar una evaluación de aprendizaje no es ser
          competente. Son tres registros distintos a propósito.
        </DomainNote>
      </Card>

      <Card title="Conocimiento que sostiene">
        <Table
          headers={["Conocimiento", "Criticidad", "Papel"]}
          empty="No figura como holder de ningún conocimiento."
          rows={file.knowledge.map((k) => [
            k.title, CRITICALITY_LABEL[k.criticality],
            k.isPrimaryHolder
              ? `${HOLDER_LEVEL_LABEL[k.holderLevel]} · responde primero`
              : HOLDER_LEVEL_LABEL[k.holderLevel],
          ])}
        />
        <DomainNote>
          La persona <strong>sostiene</strong> el conocimiento; no es su dueña. El
          conocimiento pertenece a la empresa.
        </DomainNote>
      </Card>

      <Card title="Evaluaciones de desempeño">
        <Table
          headers={["Ciclo", "Fecha", "Evaluador", "Estado", ""]}
          empty="Sin evaluaciones visibles con tu permiso."
          rows={file.evaluations.map((e) => [
            e.cycleName, e.evaluatedOn ? formatDate(e.evaluatedOn) : "—",
            e.evaluatorName ?? "—", e.status,
            <ExportPdfButton
              key="x" exportKey="quality.performance-evaluation.detail" id={e.id}
              label="Descargar PDF"
            />,
          ])}
        />
        <DomainNote>
          Competencia y desempeño son cosas distintas: una evaluación de desempeño no
          modifica la competencia declarada de esta persona.
        </DomainNote>
      </Card>

      {canManage && p.status === "active" ? (
        <Card
          title="Desvincular"
          description="Conserva íntegra la historia de la persona."
        >
          {offboarding ? <OffboardingSummary report={offboarding} /> : null}
          <ActionForm action={retirePersonAction} submitLabel="Marcar como desvinculada">
            <input type="hidden" name="person_id" value={p.id} />
            <Field label="Fecha de salida">
              <input name="left_on" type="date" defaultValue={today} className={inputClass} />
            </Field>
          </ActionForm>
        </Card>
      ) : null}
    </div>
  );
}

/**
 * §50/§77 · Lo que queda descubierto cuando alguien sale.
 *
 * Se muestra ANTES de desvincular, no después: el momento útil para saber que
 * un conocimiento crítico se queda sin nadie es antes de cerrar la puerta.
 */
function OffboardingSummary({ report }: { report: OffboardingReport }) {
  const nada =
    report.positionsLeftWithoutHolder.length === 0
    && report.knowledgeLeftConcentrated.length === 0
    && report.pendingTransfers.length === 0
    && report.openTasks.length === 0;
  if (nada) {
    return <p className="text-xs text-ink-soft">No queda nada descubierto por su salida.</p>;
  }
  return (
    <div className="space-y-2 text-xs text-ink">
      {report.positionsLeftWithoutHolder.length > 0 ? (
        <p>
          <strong>Cargos que quedarían sin titular:</strong>{" "}
          {report.positionsLeftWithoutHolder
            .map((x) => x.is_critical ? `${x.name} (crítico)` : x.name).join(", ")}
        </p>
      ) : null}
      {report.knowledgeLeftConcentrated.length > 0 ? (
        <p>
          <strong>Conocimiento crítico que quedaría sin cobertura:</strong>{" "}
          {report.knowledgeLeftConcentrated.map((x) => x.title).join(", ")}
        </p>
      ) : null}
      {report.pendingTransfers.length > 0 ? (
        <p>
          <strong>Transferencias pendientes:</strong>{" "}
          {report.pendingTransfers.map((x) => x.title).join(", ")}
        </p>
      ) : null}
      {report.openTasks.length > 0 ? (
        <p><strong>Tareas abiertas a su nombre:</strong> {report.openTasks.length}</p>
      ) : null}
    </div>
  );
}

/** El cierre de vigencia no necesita más campos que la fecha de hoy. */
async function endAssignmentActionWrapper(formData: FormData): Promise<void> {
  await endAssignmentAction({ error: null }, formData);
}
