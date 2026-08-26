"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ErrorAlert } from "@/components/ui/alert";
import { formatDate } from "@/lib/domain/document-control";
import {
  ALERT_TYPE_LABEL,
  TASK_STATUS_LABEL,
  TASK_TYPE_LABEL,
  type AlertType,
  type SubjectType,
  type TaskStatus,
  type TaskType,
} from "@/lib/domain/work-inbox";
import { trazadocDocumentHref } from "@/lib/modules/registry";
import {
  markQualityAlertAction,
  type QualityDocumentActionState,
} from "@/server/actions/quality-documents";
import { ExportPdfButton } from "@/components/ui/export-pdf-button";

/**
 * Trazaloop Quality · QUALITY-02 · Mis tareas.
 *
 * Dos listas, porque son dos cosas distintas y confundirlas es un error de
 * diseño, no de estilo:
 *
 *   TAREAS   lo que te toca HACER. Se cierran solas cuando lo haces.
 *   ALERTAS  lo que debes SABER. Las marcas tú cuando ya las has visto.
 *
 * No es un tablero: es una bandeja. Lo que no requiere acción de esta persona
 * no aparece aquí.
 */

const initial: QualityDocumentActionState = { error: null };

export type InboxTask = {
  id: string;
  taskType: TaskType;
  status: TaskStatus;
  title: string;
  description: string | null;
  documentId: string;
  documentCode: string | null;
  subjectType: string;
  moduleKey: string | null;
  createdAt: string;
};

export type InboxAlert = {
  id: string;
  alertType: AlertType;
  severity: string;
  title: string;
  message: string | null;
  documentId: string;
  subjectType: string;
  moduleKey: string | null;
  createdAt: string;
};

const TASK_TONE: Record<TaskType, string> = {
  document_review: "border-amber/40 bg-amber/5",
  document_approval: "border-loop/30 bg-loop/5",
  document_changes_requested: "border-danger/30 bg-danger/5",
  indicator_measurement_due: "border-amber/40 bg-amber/5",
  indicator_off_target: "border-danger/30 bg-danger/5",
  case_evaluation: "border-amber/40 bg-amber/5",
  case_closure: "border-loop/30 bg-loop/5",
  action_execution: "border-amber/40 bg-amber/5",
  action_effectiveness: "border-loop/30 bg-loop/5",
  risk_review_due: "border-amber/40 bg-amber/5",
  risk_assessment_due: "border-amber/40 bg-amber/5",
  risk_treatment_approval: "border-loop/30 bg-loop/5",
  control_verification: "border-loop/30 bg-loop/5",
  opportunity_review: "border-loop/30 bg-loop/5",
  competence_evidence_renewal: "border-amber/40 bg-amber/5",
  competence_assessment_due: "border-amber/40 bg-amber/5",
  performance_evaluation_due: "border-loop/30 bg-loop/5",
  development_item_execution: "border-loop/30 bg-loop/5",
  learning_effectiveness_review: "border-loop/30 bg-loop/5",
  knowledge_transfer_execution: "border-amber/40 bg-amber/5",
  knowledge_continuity_review: "border-amber/40 bg-amber/5",
  lesson_proposal_decision: "border-loop/30 bg-loop/5",
  supplier_reevaluation_due: "border-amber/40 bg-amber/5",
  supplier_evaluation_completion: "border-loop/30 bg-loop/5",
  supplier_approval_review: "border-amber/40 bg-amber/5",
  supplier_document_renewal: "border-amber/40 bg-amber/5",
  supplier_criticality_review: "border-loop/30 bg-loop/5",
  complaint_review: "border-amber/40 bg-amber/5",
  campaign_closing_review: "border-loop/30 bg-loop/5",
  customer_signal_review: "border-amber/40 bg-amber/5",
  customer_voice_review_due: "border-loop/30 bg-loop/5",
  audit_preparation: "border-loop/30 bg-loop/5",
  audit_plan_review: "border-loop/30 bg-loop/5",
  audit_execution: "border-amber/40 bg-amber/5",
  audit_report_issue: "border-amber/40 bg-amber/5",
  audit_finding_evaluation: "border-amber/40 bg-amber/5",
  audit_followup: "border-loop/30 bg-loop/5",
};

const TASK_CTA: Record<TaskType, string> = {
  document_review: "Revisar documento",
  document_approval: "Aprobar documento",
  document_changes_requested: "Corregir y reenviar",
  indicator_measurement_due: "Registrar la medición",
  indicator_off_target: "Ver el indicador",
  case_evaluation: "Evaluar el caso",
  case_closure: "Ver el caso",
  action_execution: "Ver la acción",
  action_effectiveness: "Verificar si sirvió",
  risk_review_due: "Revisar el riesgo",
  risk_assessment_due: "Reevaluar el riesgo",
  risk_treatment_approval: "Ver la aceptación pendiente",
  control_verification: "Comprobar el control",
  opportunity_review: "Ver la oportunidad",
  competence_evidence_renewal: "Ver la ficha de la persona",
  competence_assessment_due: "Evaluar la competencia",
  performance_evaluation_due: "Ir a desempeño",
  development_item_execution: "Ver el plan de desarrollo",
  learning_effectiveness_review: "Evaluar la eficacia",
  knowledge_transfer_execution: "Ver la transferencia",
  knowledge_continuity_review: "Ver el conocimiento",
  lesson_proposal_decision: "Ver la lección",
  supplier_reevaluation_due: "Reevaluar el proveedor",
  supplier_evaluation_completion: "Terminar la evaluación",
  supplier_approval_review: "Ver la ficha del proveedor",
  supplier_document_renewal: "Ver el documento",
  supplier_criticality_review: "Revisar la criticidad",
  complaint_review: "Revisar la queja",
  campaign_closing_review: "Ver la campaña",
  customer_signal_review: "Ver las señales",
  customer_voice_review_due: "Ir al cierre del periodo",
  audit_preparation: "Preparar la auditoría",
  audit_plan_review: "Revisar el plan",
  audit_execution: "Ir a la auditoría",
  audit_report_issue: "Emitir el informe",
  audit_finding_evaluation: "Ver los hallazgos",
  audit_followup: "Ver el seguimiento",
};

/**
 * A dónde lleva cada tarea. La bandeja es transversal, así que el destino lo
 * decide el TIPO DE ASUNTO, no el módulo: mandar una tarea de indicador a la
 * ruta de documentos daría un 404 con toda naturalidad.
 */
function subjectHref(
  subjectType: string, subjectId: string, moduleKey: string | null
): string | null {
  switch (subjectType as SubjectType) {
    case "trazadoc_document":
      return trazadocDocumentHref(moduleKey ?? "quality", subjectId);
    case "quality_indicator":
      return `/quality/indicators/${subjectId}`;
    case "quality_objective":
      return `/quality/objectives/${subjectId}`;
    // QUALITY-04 · Una acción no tiene página propia: se ve dentro de su caso,
    // así que la tarea lleva al caso. Enlazar a una ruta inventada sería peor
    // que no enlazar.
    case "work_case":
      return `/quality/cases/${subjectId}`;
    case "work_action":
      return `/quality/cases`;
    // QUALITY-05 · El riesgo SÍ tiene ficha propia, así que la tarea lleva
    // exactamente ahí. El control no la tiene —se ve dentro del riesgo al que
    // sirve—, así que lleva al listado en vez de a una ruta inventada.
    case "quality_risk":
      return `/quality/risks/${subjectId}`;
    case "quality_opportunity":
      return `/quality/risks/opportunities/${subjectId}`;
    case "quality_control":
      return `/quality/risks`;
    // QUALITY-06 · La persona y el cargo tienen ficha propia. Lo demás vive
    // dentro de su pantalla: se enlaza a la pantalla, no a una ruta inventada.
    case "quality_person":
      return `/quality/people/${subjectId}`;
    case "quality_position":
      return `/quality/people/positions/${subjectId}`;
    case "quality_person_competency":
    case "quality_competency_evidence":
      return `/quality/people`;
    case "quality_development_plan_item":
    case "quality_learning_activity":
      return `/quality/people/development`;
    case "quality_performance_evaluation":
      return `/quality/people/performance`;
    case "quality_knowledge_item":
    case "quality_knowledge_transfer_plan":
      return `/quality/people/knowledge`;
    case "quality_lesson_learned":
      return `/quality/people/lessons`;
    // QUALITY-07 · El proveedor y la evaluación tienen ficha propia. El alcance
    // y el documento se ven DENTRO de la ficha del proveedor, y la tarea no
    // guarda a cuál pertenecen, así que llevan al listado en lugar de a una
    // ruta que no existe.
    case "quality_supplier_profile":
      return `/quality/suppliers/${subjectId}`;
    case "quality_supplier_evaluation":
      return `/quality/suppliers/evaluations/${subjectId}`;
    case "quality_supplier_scope":
    case "quality_supplier_document":
      return `/quality/suppliers`;
    // QUALITY-08 · El cliente y la campaña tienen ficha propia. La
    // manifestación se ve dentro del listado de retroalimentación, y el cierre
    // del periodo vive en el resumen: se enlaza a la pantalla que existe.
    case "quality_customer_profile":
      return `/quality/customer-voice/customers/${subjectId}`;
    case "quality_survey_campaign":
      return `/quality/customer-voice/campaigns/${subjectId}`;
    case "quality_customer_feedback":
      return `/quality/customer-voice/feedback`;
    case "quality_customer_voice_review":
      return `/quality/customer-voice`;
    // QUALITY-09 · El programa y la auditoría tienen ficha propia. El hallazgo
    // se ve DENTRO de su auditoría y la tarea no guarda a cuál pertenece, así
    // que lleva a la pantalla de hallazgos, que existe.
    case "quality_audit_program":
      return `/quality/audits/programs/${subjectId}`;
    case "quality_audit":
      return `/quality/audits/${subjectId}`;
    case "quality_audit_finding":
      return `/quality/audits/findings`;
    default:
      return null;
  }
}

export function QualityTasksView({
  tasks,
  alerts,
  closedTasks,
}: {
  tasks: InboxTask[];
  alerts: InboxAlert[];
  closedTasks: InboxTask[];
}) {
  return (
    <div className="max-w-3xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Mis tareas</h1>
        <div className="pt-1 flex flex-wrap gap-2">
          <ExportPdfButton exportKey="quality.task.list" label="Descargar PDF · mis tareas" />
          <ExportPdfButton exportKey="quality.action.list" label="Descargar PDF · acciones" />
        </div>
        <p className="text-sm text-ink-soft">
          Lo que está esperando por ti en el sistema de gestión. Cada tarea lleva al sitio exacto
          —el documento, el indicador— donde tienes que hacer algo.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Pendientes ({tasks.length})</h2>
        {tasks.length === 0 ? (
          <p className="rounded-lg border border-hairline bg-surface p-6 text-sm text-ink-soft">
            No tienes nada pendiente. Cuando alguien te envíe un documento a revisar o aprobar, o te
            devuelvan uno tuyo, aparecerá aquí.
          </p>
        ) : (
          <ul className="space-y-2">
            {tasks.map((t) => {
              const href = subjectHref(t.subjectType, t.documentId, t.moduleKey);
              return (
                <li key={t.id} className={`rounded-lg border p-4 ${TASK_TONE[t.taskType]}`}>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-ink-soft">
                    {TASK_TYPE_LABEL[t.taskType]}
                  </p>
                  <p className="mt-0.5 text-sm font-semibold">{t.title}</p>
                  {t.documentCode ? (
                    <p className="code text-xs text-ink-soft">{t.documentCode}</p>
                  ) : null}
                  {t.description ? (
                    <p className="mt-1 text-sm text-ink">{t.description}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-ink-soft">
                    Te llegó el {formatDate(t.createdAt)}
                  </p>
                  {href ? (
                    <Link
                      href={href}
                      className="mt-2 inline-flex w-auto items-center justify-center rounded-md bg-loop px-3 py-1.5 text-xs font-semibold text-white hover:bg-loop-deep"
                    >
                      {TASK_CTA[t.taskType]} →
                    </Link>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Alertas ({alerts.length})</h2>
        {alerts.length === 0 ? (
          <p className="rounded-lg border border-hairline bg-surface p-6 text-sm text-ink-soft">
            No tienes alertas sin atender.
          </p>
        ) : (
          <ul className="space-y-2">
            {alerts.map((a) => (
              <AlertItem key={a.id} alert={a} />
            ))}
          </ul>
        )}
      </section>

      {closedTasks.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Tareas cerradas recientemente</h2>
          <ul className="divide-y divide-hairline rounded-lg border border-hairline bg-surface">
            {closedTasks.map((t) => (
              <li key={t.id} className="flex flex-wrap items-baseline gap-2 px-4 py-2 text-xs">
                <span className="flex-1">{t.title}</span>
                <span className="text-ink-soft">{TASK_STATUS_LABEL[t.status]}</span>
                <span className="text-ink-soft">{formatDate(t.createdAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function AlertItem({ alert }: { alert: InboxAlert }) {
  const [state, formAction, pending] = useActionState(markQualityAlertAction, initial);
  const href = subjectHref(alert.subjectType, alert.documentId, alert.moduleKey);
  const tone =
    alert.severity === "warning"
      ? "border-danger/30 bg-danger/5"
      : alert.severity === "critical"
        ? "border-danger/50 bg-danger/10"
        : "border-hairline bg-surface";

  return (
    <li className={`rounded-lg border p-4 ${tone}`}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-soft">
        {ALERT_TYPE_LABEL[alert.alertType]}
      </p>
      <p className="mt-0.5 text-sm font-semibold">{alert.title}</p>
      {alert.message ? <p className="mt-1 text-sm text-ink">{alert.message}</p> : null}
      <p className="mt-1 text-xs text-ink-soft">{formatDate(alert.createdAt)}</p>
      <ErrorAlert message={state.error} />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {href ? (
          <Link href={href} className="text-xs font-medium text-loop hover:underline">
            {alert.subjectType === "trazadoc_document" ? "Abrir el documento →" : "Abrir →"}
          </Link>
        ) : null}
        <form action={formAction} className="inline">
          <input type="hidden" name="alert_id" value={alert.id} />
          <input type="hidden" name="status" value="resolved" />
          <button
            type="submit"
            disabled={pending}
            className="rounded-md border border-hairline px-2 py-1 text-xs text-ink-soft hover:border-loop disabled:opacity-50"
          >
            {pending ? "…" : "Marcar como atendida"}
          </button>
        </form>
      </div>
    </li>
  );
}
