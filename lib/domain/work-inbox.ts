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
  // QUALITY-05 · Riesgos, oportunidades y controles. Igual que antes: el tipo
  // entra aqui, no en un enumerado paralelo, para que la tarea sepa a donde
  // lleva.
  "quality_risk", "quality_opportunity", "quality_control",
  // QUALITY-06 · Personas. Mismo criterio de siempre: el tipo entra AQUÍ para
  // que la bandeja sepa a dónde lleva. Un aviso de certificación por vencer
  // que enlazara a Documentos sería peor que uno sin enlace.
  "quality_person", "quality_position", "quality_person_competency",
  "quality_competency_evidence", "quality_development_plan_item",
  "quality_learning_activity", "quality_performance_evaluation",
  "quality_knowledge_item", "quality_knowledge_transfer_plan",
  "quality_lesson_learned",
  // QUALITY-07 · Proveedores. El asunto de una tarea de proveedor es el
  // ALCANCE o la evaluación, no «el proveedor» a secas: la mayoría de las
  // preguntas de este dominio no tienen respuesta sin decir para qué.
  "quality_supplier_profile", "quality_supplier_scope",
  "quality_supplier_evaluation", "quality_supplier_document",
  // QUALITY-08 · Voz del cliente. El asunto de una tarea de queja es la
  // MANIFESTACIÓN, no el cliente: es lo que hay que revisar.
  "quality_customer_profile", "quality_survey_campaign",
  "quality_customer_feedback", "quality_customer_voice_review",
  // QUALITY-09 · Auditorías. El asunto de una tarea de hallazgo es el HALLAZGO,
  // no la auditoría: es lo que hay que evaluar, y evaluarlo no lo convierte en
  // no conformidad.
  "quality_audit_program", "quality_audit", "quality_audit_finding",
  // QUALITY-10 · Revisión por la dirección. El asunto de una tarea de entrada
  // es la ENTRADA, no la revisión: es lo que hay que preparar o analizar.
  "quality_management_review", "quality_management_review_input",
  "quality_management_review_decision",
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
  // QUALITY-05
  "risk_review_due",
  "risk_assessment_due",
  "risk_treatment_approval",
  "control_verification",
  "opportunity_review",
  // QUALITY-06
  "competence_evidence_renewal",
  "competence_assessment_due",
  "performance_evaluation_due",
  "development_item_execution",
  "learning_effectiveness_review",
  "knowledge_transfer_execution",
  "knowledge_continuity_review",
  "lesson_proposal_decision",
  // QUALITY-07
  "supplier_reevaluation_due",
  "supplier_evaluation_completion",
  "supplier_approval_review",
  "supplier_document_renewal",
  "supplier_criticality_review",
  // QUALITY-08
  "complaint_review",
  "campaign_closing_review",
  "customer_signal_review",
  "customer_voice_review_due",
  // QUALITY-09
  "audit_preparation",
  "audit_plan_review",
  "audit_execution",
  "audit_report_issue",
  "audit_finding_evaluation",
  "audit_followup",
  // QUALITY-10 · Preparar y seguir son tareas. Decidir NO se convierte en tarea
  // sola: llenaría la bandeja de recordatorios que nadie pidió.
  "management_review_preparation",
  "management_review_input",
  "management_review_analysis",
  "management_review_closure",
  "management_review_action_followup",
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
  risk_review_due: "Revisar un riesgo",
  risk_assessment_due: "Reevaluar un riesgo",
  risk_treatment_approval: "Aprobar la aceptación de un riesgo",
  control_verification: "Comprobar si un control funciona",
  opportunity_review: "Revisar una oportunidad",
  competence_evidence_renewal: "Renovar una evidencia de competencia",
  competence_assessment_due: "Evaluar una competencia",
  performance_evaluation_due: "Evaluar el desempeño de alguien",
  development_item_execution: "Ejecutar una acción de desarrollo",
  learning_effectiveness_review: "Evaluar si una acción de desarrollo sirvió",
  knowledge_transfer_execution: "Transferir conocimiento",
  knowledge_continuity_review: "Revisar un conocimiento concentrado",
  lesson_proposal_decision: "Decidir sobre una propuesta de una lección",
  supplier_reevaluation_due: "Reevaluar un proveedor",
  supplier_evaluation_completion: "Terminar una evaluación de proveedor",
  supplier_approval_review: "Revisar la aprobación de un proveedor",
  supplier_document_renewal: "Renovar un documento de un proveedor",
  supplier_criticality_review: "Revisar la criticidad de un proveedor",
  complaint_review: "Revisar una queja de un cliente",
  campaign_closing_review: "Revisar una campaña que cierra",
  customer_signal_review: "Revisar una señal de los clientes",
  customer_voice_review_due: "Cerrar el periodo de satisfacción",
  audit_preparation: "Preparar una auditoría",
  audit_plan_review: "Revisar el plan de una auditoría",
  audit_execution: "Ejecutar una auditoría",
  audit_report_issue: "Emitir el informe de una auditoría",
  audit_finding_evaluation: "Evaluar un hallazgo de auditoría",
  audit_followup: "Seguir lo que dejó abierto una auditoría",
  management_review_preparation: "Preparar una revisión por la dirección",
  management_review_input: "Preparar una entrada de la revisión",
  management_review_analysis: "Analizar una entrada de la revisión",
  management_review_closure: "Cerrar una revisión por la dirección",
  management_review_action_followup: "Seguir una acción decidida por la dirección",
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
  // QUALITY-05
  "risk_review_overdue",
  "risk_above_appetite",
  "risk_materialized",
  "control_ineffective",
  "opportunity_assigned",
  // QUALITY-06 · Ninguno de estos avisos declara a nadie incompetente ni abre
  // un riesgo: dicen que hay algo que revisar.
  "competence_evidence_expiring",
  "competence_evidence_expired",
  "performance_evaluation_pending",
  "development_plan_overdue",
  "learning_effectiveness_pending",
  "knowledge_single_holder",
  "knowledge_transfer_overdue",
  "critical_position_vacant",
  // QUALITY-07 · Ninguno de estos suspende a nadie ni retira una aprobación:
  // dicen que hay algo que mirar, y quien decide sigue siendo una persona.
  "supplier_reevaluation_overdue",
  "supplier_approval_expiring",
  "supplier_approval_expired",
  "supplier_document_expiring",
  "supplier_document_expired",
  "supplier_critical_unapproved",
  "supplier_incident_streak",
  // QUALITY-08 · Ninguno abre casos, clasifica no conformidades ni crea
  // riesgos: dicen que hay algo que mirar.
  "complaint_unreviewed",
  "campaign_closing_soon",
  "campaign_low_response",
  "satisfaction_drop",
  "customer_signal_raised",
  "voice_review_due",
  // QUALITY-09 · Ninguno clasifica un hallazgo, abre un caso ni cambia el
  // estado de una auditoría: dicen que hay algo que mirar.
  "audit_upcoming",
  "audit_overdue",
  "audit_report_pending",
  "audit_finding_unevaluated",
  "audit_independence_conflict",
  "audit_program_coverage_gap",
  // QUALITY-10 · Ninguno concluye, decide ni cierra nada: dicen que hay algo
  // que mirar.
  "management_review_due",
  "management_review_overdue",
  "management_review_input_pending",
  "management_review_source_updated",
  "management_review_action_overdue",
  "management_review_followup_pending",
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
  risk_review_overdue: "La revisión de un riesgo venció",
  risk_above_appetite: "Un riesgo está por encima del criterio aceptable",
  risk_materialized: "Un riesgo se materializó",
  control_ineffective: "Un control resultó no eficaz",
  opportunity_assigned: "Te asignaron una oportunidad",
  competence_evidence_expiring: "Una evidencia de competencia está por vencer",
  competence_evidence_expired: "Una evidencia de competencia venció",
  performance_evaluation_pending: "Falta una evaluación de desempeño",
  development_plan_overdue: "Un plan de desarrollo se pasó de fecha",
  learning_effectiveness_pending: "Falta evaluar si una acción de desarrollo sirvió",
  knowledge_single_holder: "Un conocimiento crítico depende de una sola persona",
  knowledge_transfer_overdue: "Una transferencia de conocimiento venció",
  critical_position_vacant: "Un cargo crítico se quedó sin titular",
  supplier_reevaluation_overdue: "La reevaluación de un proveedor venció",
  supplier_approval_expiring: "Una aprobación de proveedor está por caducar",
  supplier_approval_expired: "Una aprobación de proveedor caducó",
  supplier_document_expiring: "Un documento de un proveedor está por vencer",
  supplier_document_expired: "Un documento de un proveedor venció",
  supplier_critical_unapproved: "Hay un alcance crítico sin decisión de aprobación",
  supplier_incident_streak: "Un proveedor acumula incidentes",
  complaint_unreviewed: "Una queja de un cliente lleva días sin revisar",
  campaign_closing_soon: "Una campaña de satisfacción cierra pronto",
  campaign_low_response: "Una campaña va a cerrar con pocas respuestas",
  satisfaction_drop: "La satisfacción bajó respecto de la medición anterior",
  customer_signal_raised: "Hay una señal nueva de los clientes",
  voice_review_due: "Toca cerrar el periodo de satisfacción",
  audit_upcoming: "Una auditoría empieza pronto",
  audit_overdue: "Una auditoría se pasó de su fecha",
  audit_report_pending: "Una auditoría ejecutada sigue sin informe",
  audit_finding_unevaluated: "Un hallazgo lleva días sin evaluar",
  audit_independence_conflict: "Hay un conflicto de independencia sin decidir",
  audit_program_coverage_gap: "El programa va corto de cobertura",
  management_review_due: "Se acerca una revisión por la dirección",
  management_review_overdue: "Una revisión por la dirección se pasó de fecha",
  management_review_input_pending: "Quedan entradas sin mirar en una revisión",
  management_review_source_updated: "Una fuente cambió después de preparar la entrada",
  management_review_action_overdue: "Una acción decidida por la dirección venció",
  management_review_followup_pending: "Hay seguimiento pendiente de una revisión",
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
