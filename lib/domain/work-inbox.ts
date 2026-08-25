/**
 * Trazaloop · QUALITY-02 · Lógica PURA de la bandeja transversal.
 *
 * Tarea y Alerta son cosas distintas (AT-02, AT-14) y este archivo mantiene la
 * distinción visible también en el lenguaje:
 *
 *   TAREA   «te toca hacer esto»      → tiene un cierre: hecha o cancelada.
 *   ALERTA  «esto merece tu atención» → se ve, se atiende o se descarta.
 *
 * Las dos son transversales: QUALITY-02 las estrena con documentos, pero nada
 * aquí conoce documentos más allá de un tipo de asunto. Acciones correctivas,
 * auditorías y riesgos añadirán sus tipos sin tocar la estructura (AT-04).
 */

export const TASK_STATUSES = ["open", "in_progress", "done", "cancelled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** A dónde lleva una tarea o una alerta según el objeto del que habla. Sin
 *  esto, la bandeja mandaría una tarea de indicador a la ruta de documentos.
 *  Devuelve null cuando el asunto no se reconoce: mejor sin enlace que con uno
 *  que lleva a un 404. */
export const SUBJECT_TYPES = [
  "trazadoc_document", "quality_indicator", "quality_objective",
  // QUALITY-04 · Casos y acciones. Se añaden AQUÍ por la misma razón que los
  // de QUALITY-03: si el dominio no conoce el tipo de asunto, el enlace de la
  // tarea acaba apuntando a Documentos, que fue el defecto histórico.
  "work_case", "work_action",
] as const;
export type SubjectType = (typeof SUBJECT_TYPES)[number];

export function isSubjectType(v: string | null | undefined): v is SubjectType {
  return !!v && (SUBJECT_TYPES as readonly string[]).includes(v);
}

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  open: "Pendiente",
  in_progress: "En curso",
  done: "Hecha",
  cancelled: "Ya no aplica",
};

export const TASK_TYPES = [
  "document_review",
  "document_approval",
  "document_changes_requested",
  // QUALITY-03 · La bandeja se diseñó transversal en 0116 y este es el primer
  // dominio que la comparte. Los tipos nuevos entran AQUÍ, no en un enumerado
  // paralelo: si el dominio no los conoce, la pantalla los pinta sin etiqueta.
  "indicator_measurement_due",
  "indicator_off_target",
  // QUALITY-04
  "case_evaluation",
  "case_closure",
  "action_execution",
  "action_effectiveness",
] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const TASK_TYPE_LABEL: Record<TaskType, string> = {
  document_review: "Revisar documento",
  document_approval: "Aprobar documento",
  document_changes_requested: "Corregir y reenviar",
  indicator_measurement_due: "Registrar medición",
  indicator_off_target: "Indicador fuera de meta",
  case_evaluation: "Evaluar un caso",
  case_closure: "Cerrar un caso",
  action_execution: "Ejecutar una acción",
  action_effectiveness: "Verificar si la acción sirvió",
};

export const ALERT_STATUSES = ["new", "seen", "acknowledged", "resolved", "dismissed"] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];

export const ALERT_STATUS_LABEL: Record<AlertStatus, string> = {
  new: "Nueva",
  seen: "Vista",
  acknowledged: "En atención",
  resolved: "Resuelta",
  dismissed: "Descartada",
};

export const ALERT_TYPES = [
  "document_review_requested",
  "document_approval_requested",
  "document_changes_requested",
  "document_approved",
  "document_retired",
  "indicator_measurement_due",
  "indicator_target_missed",
  "objective_at_risk",
  // QUALITY-04
  "case_assigned",
  "action_assigned",
  "action_overdue",
  "effectiveness_due",
] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

export const ALERT_TYPE_LABEL: Record<AlertType, string> = {
  document_review_requested: "Te pidieron revisar un documento",
  document_approval_requested: "Te pidieron aprobar un documento",
  document_changes_requested: "Te devolvieron un documento",
  document_approved: "Un documento quedó aprobado",
  document_retired: "Un documento fue retirado",
  indicator_measurement_due: "Falta una medición",
  indicator_target_missed: "Un indicador no cumplió su meta",
  objective_at_risk: "Un objetivo está en riesgo",
  case_assigned: "Te asignaron un caso",
  action_assigned: "Te asignaron una acción",
  action_overdue: "Una acción tuya venció",
  effectiveness_due: "Falta verificar si una acción sirvió",
};

export const ALERT_SEVERITIES = ["info", "warning", "critical"] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export function isTaskType(v: string | null | undefined): v is TaskType {
  return !!v && (TASK_TYPES as readonly string[]).includes(v);
}
export function isTaskStatus(v: string | null | undefined): v is TaskStatus {
  return !!v && (TASK_STATUSES as readonly string[]).includes(v);
}
export function isAlertStatus(v: string | null | undefined): v is AlertStatus {
  return !!v && (ALERT_STATUSES as readonly string[]).includes(v);
}
export function isAlertType(v: string | null | undefined): v is AlertType {
  return !!v && (ALERT_TYPES as readonly string[]).includes(v);
}

/** Una tarea abierta o en curso es lo que cuenta como «pendiente». */
export function isPendingTask(status: TaskStatus): boolean {
  return status === "open" || status === "in_progress";
}

/** Una alerta deja de pesar cuando se resuelve o se descarta. */
export function isPendingAlert(status: AlertStatus): boolean {
  return status === "new" || status === "seen" || status === "acknowledged";
}

/**
 * Resumen de «Mis tareas» para la portada del módulo (Parte 24). Devuelve los
 * tres números que el encargo pide y nada más: no es un tablero.
 */
export type InboxSummary = {
  toReview: number;
  toApprove: number;
  returned: number;
  toMeasure: number;
  total: number;
};

export function summarizeInbox(
  tasks: { taskType: TaskType; status: TaskStatus }[]
): InboxSummary {
  const pending = tasks.filter((t) => isPendingTask(t.status));
  const toReview = pending.filter((t) => t.taskType === "document_review").length;
  const toApprove = pending.filter((t) => t.taskType === "document_approval").length;
  const returned = pending.filter((t) => t.taskType === "document_changes_requested").length;
  const toMeasure = pending.filter((t) => t.taskType === "indicator_measurement_due").length;
  return { toReview, toApprove, returned, toMeasure, total: pending.length };
}

/** Frases en singular/plural correctos: aparecen en la portada de Quality. */
export function summaryLines(summary: InboxSummary): string[] {
  const lines: string[] = [];
  const n = (count: number, one: string, many: string) =>
    `${count} ${count === 1 ? one : many}`;
  if (summary.toReview > 0) {
    lines.push(n(summary.toReview, "documento por revisar", "documentos por revisar"));
  }
  if (summary.toApprove > 0) {
    lines.push(n(summary.toApprove, "documento por aprobar", "documentos por aprobar"));
  }
  if (summary.returned > 0) {
    lines.push(n(summary.returned, "documento devuelto", "documentos devueltos"));
  }
  if (summary.toMeasure > 0) {
    lines.push(n(summary.toMeasure, "medición pendiente", "mediciones pendientes"));
  }
  return lines;
}
