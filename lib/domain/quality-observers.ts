/**
 * Trazaloop · QUALITY-13B3 · El inventario de TODO lo que observa.
 *
 * POR QUÉ EXISTE
 *
 * QUALITY-13A dijo que había «cinco mecanismos de atención y diez barridos».
 * Leer el código dice otra cosa, y este archivo es esa otra cosa escrita de
 * forma que una prueba pueda comprobarla contra las migraciones.
 *
 * LO QUE APARECIÓ AL MIRAR EL CÓDIGO Y NO ESTABA EN LA DOCUMENTACIÓN
 *
 *   · **Un barrido no es un observador: es un montón.** `quality_scan_audits`
 *     observa CINCO condiciones distintas; `quality_scan_people_signals`,
 *     SIETE. Tratar un barrido como una unidad es lo que rompió `action_overdue`
 *     (ver más abajo).
 *   · **`quality_risk_signals` no la escribe nadie.** Ni una migración, ni una
 *     línea de aplicación. Es una tabla creada en 0122 y nunca conectada.
 *     Relevarla —que es lo que 13A proponía— habría sido relevar el vacío.
 *   · **Las otras tres tablas de señal no son observadores**: son el ALMACÉN
 *     donde su barrido deja lo que vio. El observador es el barrido.
 *   · **Hay observadores por evento que 13A no contó**: la medición que falla
 *     su meta, el riesgo que se materializa, el control ineficaz, la decisión
 *     de tratamiento y los cinco pasos del flujo documental.
 *
 * NO es `server-only`: lo usan la capa de datos, la futura portada y las
 * pruebas.
 */

import type { IntegrationSubject } from "@/lib/domain/quality-integration";

// ===========================================================================
// 1 · LOS CINCO MECANISMOS DE 13A, CLASIFICADOS (§3)
// ===========================================================================

/**
 * Qué ES cada cosa. La distinción no es académica: solo (A) puede decir si un
 * problema sigue vivo, y solo (A) puede cerrarlo. Todo lo demás **observa**.
 */
export type MechanismClass =
  /** A · la verdad del negocio. El estado del propio dominio. */
  | "business_truth"
  /** B · el resultado de observar esa verdad. */
  | "observer_result"
  /** C · la señal del motor de reglas. */
  | "automation_signal"
  /** D · capa de compatibilidad histórica. */
  | "legacy_compat"
  /** E · un estado que solo existe al pintar la pantalla. */
  | "ui_derived";

export type MechanismRecord = {
  name: string;
  what: string;
  klass: MechanismClass;
  writer: string;
  /** Quién lo lee hoy. Vacío significa que nadie, y eso importa. */
  consumers: readonly string[];
  authoritativeFor: string;
};

export const ATTENTION_MECHANISMS: readonly MechanismRecord[] = [
  {
    name: "quality_signals",
    what: "La señal del motor de reglas de QUALITY-11, con su regla, su versión y su explicación.",
    klass: "automation_signal",
    writer: "quality_automation_emit",
    consumers: ["lib/db/quality-automation.ts", "app/(app)/(shell)/quality/automation"],
    authoritativeFor:
      "Nada por sí sola. Es la OBSERVACIÓN de una verdad que vive en su dominio; " +
      "resolver la señal no cambia el estado del sujeto, y el propio motor la resuelve " +
      "sola cuando la condición deja de cumplirse.",
  },
  {
    name: "quality_risk_signals",
    what: "Tabla de señales del dominio de riesgos.",
    klass: "legacy_compat",
    writer: "NADIE · ninguna migración ni línea de aplicación inserta en ella",
    consumers: [],
    authoritativeFor: "Nada. Está vacía por construcción: no tiene emisor ni lector.",
  },
  {
    name: "quality_supplier_signals",
    what: "Almacén de lo que vio el barrido de proveedores.",
    klass: "observer_result",
    writer: "quality_scan_supplier_reviews",
    consumers: ["lib/db/quality-suppliers.ts"],
    authoritativeFor:
      "Nada. La verdad es la reevaluación, la aprobación y el documento del proveedor.",
  },
  {
    name: "quality_customer_signals",
    what: "Almacén de lo que vio el barrido de voz del cliente.",
    klass: "observer_result",
    writer: "quality_scan_customer_voice",
    consumers: ["lib/db/quality-customer-voice.ts"],
    authoritativeFor:
      "Nada. La verdad es la queja, la campaña y la medición de satisfacción.",
  },
  {
    name: "quality_knowledge_signals",
    what: "Almacén de lo que vio el barrido de personas sobre el conocimiento crítico.",
    klass: "observer_result",
    writer: "quality_scan_people_signals",
    consumers: ["lib/db/quality-people.ts"],
    authoritativeFor: "Nada. La verdad es el conocimiento y quién lo posee.",
  },
  {
    name: "work_alerts / work_tasks",
    what: "Las SALIDAS: el aviso a una persona y el pendiente asignado a alguien.",
    klass: "observer_result",
    writer: "todos los barridos, los emisores por evento y el motor de reglas",
    consumers: ["/quality/tasks", "app/(app)/(shell)/quality/page.tsx"],
    authoritativeFor:
      "Nada sobre el negocio. Son notificaciones: una condición produce tantas como " +
      "destinatarios tenga, y por eso NO se pueden contar como problemas.",
  },
] as const;

// ===========================================================================
// 2 · EL INVENTARIO, CONDICIÓN POR CONDICIÓN (§2)
// ===========================================================================

/** Cómo se entera de que algo pasa. */
export type ObserverTrigger =
  /** Un hecho lo dispara en el momento en que ocurre. */
  | "event"
  /** Corre por el reloj y mira el estado. Imprescindible cuando lo que cambia
   *  el estado es que pase el tiempo (§15). */
  | "sweep"
  /** No emite nada: se calcula al preguntar. */
  | "derived";

/** Qué se hace con cada uno (§4). */
export type ObserverClassification =
  /** Se queda tal cual. */
  | "keep"
  /** Ya está relevado por una regla equivalente. */
  | "supersede"
  /** Debería ser una regla, pero hoy no se puede escribir equivalente. */
  | "rewrite"
  /** No se toca y no se releva: no hay nada que relevar. */
  | "defer";

/** El veredicto de la comprobación de compatibilidad (§25). */
export type CompatibilityVerdict =
  | "already_superseded"
  | "safe_to_supersede"
  | "not_equivalent"
  | "no_candidate"
  | "dormant";

export type ObserverRecord = {
  /** `mecanismo.condición`. La granularidad correcta, que es la que faltaba. */
  code: string;
  mechanism: string;
  domain: string;
  trigger: ObserverTrigger;
  /** Dónde vive la verdad que esto observa (§7). */
  truthSource: string;
  /** Qué mira, en una frase. */
  condition: string;
  subjectKind: IntegrationSubject;
  alertTypes: readonly string[];
  taskTypes: readonly string[];
  /** Lo que deja en la tabla de señal de su dominio, si deja algo. */
  signalKinds: readonly string[];
  /** `domain` = conserva la del dominio · `none` = el dominio no gradúa. */
  severity: "domain" | "none";
  /** ¿Abre un caso o una acción por su cuenta? (§11) */
  createsCase: boolean;
  /** El código de plantilla que lo releva, si alguno. */
  supersededBy: string | null;
  classification: ObserverClassification;
  compatibility: CompatibilityVerdict;
  note: string;
};

const AUDITS: ObserverRecord[] = [
  {
    code: "quality_scan_audits.audit_upcoming",
    mechanism: "quality_scan_audits", domain: "audits", trigger: "sweep",
    truthSource: "quality_audits.scheduled_from",
    condition: "Auditoría prevista dentro de los próximos catorce días, todavía en plan.",
    subjectKind: "quality_audit",
    alertTypes: ["audit_upcoming"], taskTypes: ["audit_preparation"], signalKinds: [],
    severity: "domain", createsCase: false, supersededBy: null,
    classification: "keep", compatibility: "no_candidate",
    note: "Ninguna plantilla observa la fecha prevista de una auditoría.",
  },
  {
    code: "quality_scan_audits.audit_overdue",
    mechanism: "quality_scan_audits", domain: "audits", trigger: "sweep",
    truthSource: "quality_audits.scheduled_to",
    condition: "Pasó su fecha y sigue sin ejecutarse.",
    subjectKind: "quality_audit",
    alertTypes: ["audit_overdue"], taskTypes: [], signalKinds: [],
    severity: "domain", createsCase: false, supersededBy: null,
    classification: "keep", compatibility: "no_candidate",
    note: "Condición temporal pura: solo se entera un barrido (§15).",
  },
  {
    code: "quality_scan_audits.audit_report_pending",
    mechanism: "quality_scan_audits", domain: "audits", trigger: "sweep",
    truthSource: "quality_audits.executed_to",
    condition: "Ejecutada hace más de siete días y todavía sin informe.",
    subjectKind: "quality_audit",
    alertTypes: ["audit_report_pending"], taskTypes: ["audit_report_issue"], signalKinds: [],
    severity: "domain", createsCase: false, supersededBy: null,
    classification: "keep", compatibility: "no_candidate",
    note: "Ninguna plantilla mira la emisión del informe.",
  },
  {
    code: "quality_scan_audits.audit_finding_unevaluated",
    mechanism: "quality_scan_audits", domain: "audits", trigger: "sweep",
    truthSource: "quality_audit_findings.evaluation_status",
    condition: "Hallazgo sin evaluar catorce días después de levantarse.",
    subjectKind: "quality_audit_finding",
    alertTypes: ["audit_finding_unevaluated"], taskTypes: ["audit_finding_evaluation"],
    signalKinds: [],
    severity: "domain", createsCase: false, supersededBy: null,
    classification: "keep", compatibility: "not_equivalent",
    note:
      "La plantilla `audit_finding_awaiting_assessment_window` observa la MISMA condición " +
      "pero a los TREINTA días. Relevar el barrido con ella dejaría a la empresa sin aviso " +
      "durante dos semanas más que hoy. Y aunque se ajustara el umbral, relevar el barrido " +
      "entero apagaría las otras cuatro condiciones de auditorías.",
  },
  {
    code: "quality_scan_audits.audit_independence_conflict",
    mechanism: "quality_scan_audits", domain: "audits", trigger: "sweep",
    truthSource: "quality_audit_team_conflicts.status",
    condition: "Conflicto de independencia declarado y sin decidir.",
    subjectKind: "quality_audit",
    alertTypes: ["audit_independence_conflict"], taskTypes: [], signalKinds: [],
    severity: "domain", createsCase: false, supersededBy: null,
    classification: "keep", compatibility: "no_candidate",
    note: "No existe fuente de automatización para el equipo auditor.",
  },
];

const CUSTOMER: ObserverRecord[] = [
  {
    code: "quality_scan_customer_voice.complaint_unreviewed",
    mechanism: "quality_scan_customer_voice", domain: "customer", trigger: "sweep",
    truthSource: "quality_customer_feedback.status",
    condition: "Queja sin revisar siete días después de recibirse.",
    subjectKind: "quality_customer_feedback",
    alertTypes: ["complaint_unreviewed"], taskTypes: ["complaint_review"],
    signalKinds: ["complaint_unreviewed"],
    severity: "domain", createsCase: false, supersededBy: null,
    classification: "keep", compatibility: "no_candidate",
    note:
      "La fuente `customer_feedback` existe, pero ninguna plantilla observa la antigüedad " +
      "sin revisar. Y la señal se cierra sola en cuanto alguien atiende la queja.",
  },
  {
    code: "quality_scan_customer_voice.campaign_closing",
    mechanism: "quality_scan_customer_voice", domain: "customer", trigger: "sweep",
    truthSource: "quality_survey_campaigns.closes_on",
    condition: "Campaña que cierra pronto y todavía admite respuestas.",
    subjectKind: "quality_survey_campaign",
    alertTypes: ["campaign_closing_soon"], taskTypes: [], signalKinds: [],
    severity: "domain", createsCase: false, supersededBy: null,
    classification: "keep", compatibility: "no_candidate",
    note: "Aviso útil solo mientras se pueda hacer algo. Puramente temporal.",
  },
  {
    code: "quality_scan_customer_voice.campaign_low_responses",
    mechanism: "quality_scan_customer_voice", domain: "customer", trigger: "sweep",
    truthSource: "quality_survey_responses (denominador declarado)",
    condition: "Campaña por cerrar con pocas respuestas · SOLO si hay denominador real.",
    subjectKind: "quality_survey_campaign",
    alertTypes: [], taskTypes: [], signalKinds: ["campaign_closing_low_responses"],
    severity: "none", createsCase: false, supersededBy: null,
    classification: "keep", compatibility: "no_candidate",
    note: "Sin denominador no se puede decir «pocas»: por eso no siempre emite.",
  },
  {
    code: "quality_scan_customer_voice.satisfaction_drop",
    mechanism: "quality_scan_customer_voice", domain: "customer", trigger: "sweep",
    truthSource: "quality_survey_metric_results",
    condition: "Caída de satisfacción entre dos mediciones COMPARABLES.",
    subjectKind: "quality_survey_campaign",
    alertTypes: ["satisfaction_drop"], taskTypes: [], signalKinds: ["satisfaction_drop"],
    severity: "domain", createsCase: false, supersededBy: null,
    classification: "keep", compatibility: "not_equivalent",
    note:
      "La plantilla `customer_metric_deterioration` observa un delta menor que −5 sobre la " +
      "fuente `customer_metric`. El barrido usa su propio umbral y su propia definición de " +
      "comparabilidad. Umbrales distintos sobre la misma verdad NO son la misma condición.",
  },
  {
    code: "quality_scan_customer_voice.comparability_break",
    mechanism: "quality_scan_customer_voice", domain: "customer", trigger: "sweep",
    truthSource: "quality_survey_metric_definitions (clave de comparabilidad)",
    condition: "Cambió la regla de medición: no hay caída, hay otro instrumento.",
    subjectKind: "quality_survey_campaign",
    alertTypes: [], taskTypes: [], signalKinds: ["comparability_break"],
    severity: "none", createsCase: false, supersededBy: null,
    classification: "keep", compatibility: "no_candidate",
    note: "Existe para que nadie lea una bajada donde solo hay otra escala.",
  },
];

const MANAGEMENT_REVIEW: ObserverRecord[] = [
  {
    code: "quality_scan_management_reviews.review_due",
    mechanism: "quality_scan_management_reviews", domain: "management_review",
    trigger: "sweep", truthSource: "quality_management_reviews.scheduled_on",
    condition: "Revisión programada que se acerca.",
    subjectKind: "quality_management_review",
    alertTypes: ["management_review_due"], taskTypes: ["management_review_preparation"],
    signalKinds: [],
    severity: "domain", createsCase: false, supersededBy: null,
    classification: "keep", compatibility: "no_candidate",
    note: "Condición temporal pura.",
  },
  {
    code: "quality_scan_management_reviews.input_pending",
    mechanism: "quality_scan_management_reviews", domain: "management_review",
    trigger: "sweep", truthSource: "quality_management_review_inputs.state",
    condition: "Revisión en preparación con entradas todavía sin mirar.",
    subjectKind: "quality_management_review",
    alertTypes: ["management_review_input_pending"], taskTypes: [], signalKinds: [],
    severity: "domain", createsCase: false, supersededBy: null,
    classification: "keep", compatibility: "not_equivalent",
    note:
      "La plantilla `management_review_source_updated` observa otra cosa: que la FUENTE de " +
      "una entrada automática cambió después de prepararla. Ni el sujeto ni la condición " +
      "coinciden.",
  },
  {
    code: "quality_scan_management_reviews.review_overdue",
    mechanism: "quality_scan_management_reviews", domain: "management_review",
    trigger: "sweep", truthSource: "quality_management_reviews.scheduled_on",
    condition: "Pasó su fecha prevista y sigue sin cerrarse.",
    subjectKind: "quality_management_review",
    alertTypes: ["management_review_overdue"], taskTypes: [], signalKinds: [],
    severity: "domain", createsCase: false, supersededBy: null,
    classification: "keep", compatibility: "no_candidate",
    note: "Condición temporal pura.",
  },
  {
    code: "quality_scan_management_reviews.action_overdue",
    mechanism: "quality_scan_management_reviews", domain: "management_review",
    trigger: "sweep", truthSource: "work_actions.due_on",
    condition: "Acción nacida de una decisión de la dirección, vencida.",
    subjectKind: "work_action",
    alertTypes: ["management_review_action_overdue"], taskTypes: [], signalKinds: [],
    severity: "domain", createsCase: false, supersededBy: null,
    classification: "keep", compatibility: "not_equivalent",
    note:
      "Comparte SUJETO y verdad con `work_scan_pending_actions.action_overdue`, pero no " +
      "condición: esta mira solo las acciones de una decisión de la dirección y lo dice en " +
      "su mensaje. Convergen en la portada por identidad de sujeto y condición, no aquí.",
  },
];

const PEOPLE: ObserverRecord[] = [
  {
    code: "quality_scan_people_signals.competence_evidence_expiring",
    mechanism: "quality_scan_people_signals", domain: "people", trigger: "sweep",
    truthSource: "quality_competency_evidences.valid_until",
    condition: "Evidencia de competencia caducada o a punto de caducar.",
    subjectKind: "quality_competency_evidence",
    alertTypes: ["competence_evidence_expiring", "competence_evidence_expired"],
    taskTypes: ["competence_evidence_renewal"], signalKinds: [],
    severity: "domain", createsCase: false, supersededBy: null,
    classification: "keep", compatibility: "not_equivalent",
    note:
      "La plantilla `competency_evidence_expiring_window` avisa 60 días ANTES; el barrido " +
      "avisa también cuando YA caducó. Relevarlo dejaría sin aviso lo ya vencido, que es " +
      "precisamente lo que urge.",
  },
  {
    code: "quality_scan_people_signals.knowledge_single_holder",
    mechanism: "quality_scan_people_signals", domain: "people", trigger: "sweep",
    truthSource: "quality_knowledge_items + sus poseedores",
    condition: "Conocimiento crítico en una sola persona.",
    subjectKind: "quality_knowledge_item",
    alertTypes: ["knowledge_single_holder"], taskTypes: ["knowledge_continuity_review"],
    signalKinds: ["single_holder"],
    severity: "domain", createsCase: false, supersededBy: null,
    classification: "rewrite", compatibility: "not_equivalent",
    note:
      "La plantilla `knowledge_single_holder_critical` observa lo mismo (holder_count ≤ 1 y " +
      "criticidad alta) y es la candidata más cercana de las diez. NO se releva porque " +
      "`supersedes_observer` apaga el barrido ENTERO, y con él las otras seis condiciones de " +
      "personas. Con la granularidad por condición que introduce 0153, esta supersesión pasa " +
      "a ser posible; falta comprobar la paridad del filtro de criticidad.",
  },
  {
    code: "quality_scan_people_signals.critical_position_vacant",
    mechanism: "quality_scan_people_signals", domain: "people", trigger: "sweep",
    truthSource: "quality_positions + asignaciones vigentes",
    condition: "Cargo crítico sin titular.",
    subjectKind: "quality_position",
    alertTypes: ["critical_position_vacant"], taskTypes: [], signalKinds: [],
    severity: "domain", createsCase: false, supersededBy: null,
    classification: "keep", compatibility: "no_candidate",
    note: "No hay fuente de automatización para cargos.",
  },
  {
    code: "quality_scan_people_signals.knowledge_transfer_overdue",
    mechanism: "quality_scan_people_signals", domain: "people", trigger: "sweep",
    truthSource: "quality_knowledge_transfer_plans.due_on",
    condition: "Plan de transferencia de conocimiento vencido.",
    subjectKind: "quality_knowledge_transfer_plan",
    alertTypes: ["knowledge_transfer_overdue"], taskTypes: ["knowledge_transfer_execution"],
    signalKinds: [],
    severity: "domain", createsCase: false, supersededBy: null,
    classification: "keep", compatibility: "no_candidate",
    note: "Tarea PROPIA del dominio de personas (QI-24): no se envuelve en una acción.",
  },
  {
    code: "quality_scan_people_signals.learning_effectiveness_pending",
    mechanism: "quality_scan_people_signals", domain: "people", trigger: "sweep",
    truthSource: "quality_learning_activities.effectiveness_result",
    condition: "Formación terminada cuya eficacia falta comprobar.",
    subjectKind: "quality_learning_activity",
    alertTypes: ["learning_effectiveness_pending"], taskTypes: ["learning_effectiveness_review"],
    signalKinds: [],
    severity: "domain", createsCase: false, supersededBy: null,
    classification: "keep", compatibility: "no_candidate",
    note: "Tarea PROPIA del dominio (QI-24).",
  },
  {
    code: "quality_scan_people_signals.development_item_pending",
    mechanism: "quality_scan_people_signals", domain: "people", trigger: "sweep",
    truthSource: "quality_development_plan_items.due_on",
    condition: "Actividad de un plan de desarrollo pendiente de ejecutar.",
    subjectKind: "quality_development_plan_item",
    alertTypes: [], taskTypes: ["development_item_execution"], signalKinds: [],
    severity: "none", createsCase: false, supersededBy: null,
    classification: "keep", compatibility: "no_candidate",
    note: "Tarea PROPIA del dominio (QI-24). No es una acción correctiva.",
  },
  {
    code: "quality_scan_people_signals.performance_evaluation_pending",
    mechanism: "quality_scan_people_signals", domain: "people", trigger: "sweep",
    truthSource: "quality_performance_evaluations de ciclos abiertos",
    condition: "Evaluación de desempeño de un ciclo abierto sin cerrar.",
    subjectKind: "quality_person",
    alertTypes: ["performance_evaluation_pending"], taskTypes: ["performance_evaluation_due"],
    signalKinds: [],
    severity: "domain", createsCase: false, supersededBy: null,
    classification: "keep", compatibility: "no_candidate",
    note: "Ninguna plantilla observa el cierre del ciclo.",
  },
];

const RISKS: ObserverRecord[] = [
  {
    code: "quality_scan_risk_reviews.risk_review_overdue",
    mechanism: "quality_scan_risk_reviews", domain: "risks", trigger: "sweep",
    truthSource: "quality_risks.next_review_on (status = 'active')",
    condition: "Riesgo activo cuya revisión prevista ya pasó.",
    subjectKind: "quality_risk",
    alertTypes: ["risk_review_overdue"], taskTypes: ["risk_review_due"], signalKinds: [],
    severity: "domain", createsCase: false, supersededBy: null,
    classification: "rewrite", compatibility: "not_equivalent",
    note:
      "Es el barrido de UNA sola condición, así que sería el candidato natural. No se puede: " +
      "la plantilla más cercana, `risk_treatment_overdue`, mira `treatment_review_on`, que es " +
      "otro campo y otra fecha. Y una plantilla nueva sobre `next_review_on` tampoco sería " +
      "equivalente: la fuente `risk` entrega TODO riesgo no cerrado y no expone `status`, así " +
      "que no se puede restringir a los activos. Falta un campo en la fuente; eso es " +
      "QUALITY-11, no convergencia de atención.",
  },
  {
    code: "quality_materialize_risk.risk_materialized",
    mechanism: "quality_materialize_risk", domain: "risks", trigger: "event",
    truthSource: "quality_risk_materializations",
    condition: "Un riesgo se materializó y alguien lo registró.",
    subjectKind: "quality_risk",
    alertTypes: ["risk_materialized"], taskTypes: ["risk_assessment_due"], signalKinds: [],
    severity: "domain", createsCase: false, supersededBy: null,
    classification: "keep", compatibility: "no_candidate",
    note:
      "Por evento, y así debe ser: el hecho es puntual. Materializarse NO es una no " +
      "conformidad, y este observador no la crea.",
  },
  {
    code: "quality_decide_risk_treatment.treatment_approval",
    mechanism: "quality_decide_risk_treatment", domain: "risks", trigger: "event",
    truthSource: "quality_risk_treatment_plans",
    condition: "Un plan de tratamiento espera aprobación.",
    subjectKind: "quality_risk",
    alertTypes: [], taskTypes: ["risk_treatment_approval"], signalKinds: [],
    severity: "none", createsCase: false, supersededBy: null,
    classification: "keep", compatibility: "no_candidate",
    note: "Paso de un flujo, no una condición que el tiempo cambie.",
  },
  {
    code: "quality_review_control.control_ineffective",
    mechanism: "quality_review_control", domain: "risks", trigger: "event",
    truthSource: "quality_control_reviews.outcome",
    condition: "Una verificación declaró ineficaz el control.",
    subjectKind: "quality_control",
    alertTypes: ["control_ineffective"], taskTypes: [], signalKinds: [],
    severity: "domain", createsCase: false, supersededBy: null,
    classification: "keep", compatibility: "no_candidate",
    note: "Nace de una decisión humana registrada: no hay nada que barrer.",
  },
];

const SUPPLIERS: ObserverRecord[] = [
  {
    code: "quality_scan_supplier_reviews.reevaluation_overdue",
    mechanism: "quality_scan_supplier_reviews", domain: "suppliers", trigger: "sweep",
    truthSource: "quality_supplier_profiles.next_review_on",
    condition: "Reevaluación del proveedor vencida o próxima.",
    subjectKind: "quality_supplier_profile",
    alertTypes: ["supplier_reevaluation_overdue"], taskTypes: ["supplier_reevaluation_due"],
    signalKinds: ["reevaluation_overdue"],
    severity: "domain", createsCase: false, supersededBy: null,
    classification: "keep", compatibility: "not_equivalent",
    note:
      "La plantilla `supplier_critical_reevaluation_overdue` observa ALCANCES de criticidad " +
      "alta; el barrido observa PERFILES, sin filtrar por criticidad. Relevarlo dejaría sin " +
      "aviso a todos los proveedores no críticos: el observador nuevo es más estrecho, no " +
      "equivalente. Además el sujeto cambia de perfil a alcance, y con él el enlace.",
  },
  {
    code: "quality_scan_supplier_reviews.document_expiring",
    mechanism: "quality_scan_supplier_reviews", domain: "suppliers", trigger: "sweep",
    truthSource: "quality_supplier_documents.valid_until",
    condition: "Documento del proveedor caducado o a punto de caducar.",
    subjectKind: "quality_supplier_document",
    alertTypes: ["supplier_document_expiring", "supplier_document_expired"],
    taskTypes: ["supplier_document_renewal"], signalKinds: ["document_expired"],
    severity: "domain", createsCase: false, supersededBy: null,
    classification: "keep", compatibility: "no_candidate",
    note: "No hay fuente de automatización para documentos de proveedor.",
  },
  {
    code: "quality_scan_supplier_reviews.approval_expired",
    mechanism: "quality_scan_supplier_reviews", domain: "suppliers", trigger: "sweep",
    truthSource: "quality_supplier_scopes.approved_until",
    condition: "Aprobación del alcance caducada.",
    subjectKind: "quality_supplier_scope",
    alertTypes: ["supplier_approval_expired"], taskTypes: [], signalKinds: ["approval_expired"],
    severity: "domain", createsCase: false, supersededBy: null,
    classification: "keep", compatibility: "no_candidate",
    note: "Condición temporal pura sobre el alcance.",
  },
  {
    code: "quality_scan_supplier_reviews.critical_without_approval",
    mechanism: "quality_scan_supplier_reviews", domain: "suppliers", trigger: "sweep",
    truthSource: "quality_supplier_scopes (criticidad y aprobación)",
    condition: "Alcance crítico operando sin aprobación vigente.",
    subjectKind: "quality_supplier_scope",
    alertTypes: [], taskTypes: [], signalKinds: ["critical_without_approval"],
    severity: "none", createsCase: false, supersededBy: null,
    classification: "keep", compatibility: "no_candidate",
    note: "Solo deja señal en su dominio; no emite aviso ni tarea.",
  },
];

const INDICATORS_ACTIONS: ObserverRecord[] = [
  {
    code: "quality_scan_pending_measurements.measurement_due",
    mechanism: "quality_scan_pending_measurements", domain: "indicators", trigger: "sweep",
    truthSource: "quality_measurements del periodo elegible",
    condition: "Terminó el periodo y el indicador sigue sin medición.",
    subjectKind: "quality_indicator",
    alertTypes: ["indicator_measurement_due"], taskTypes: ["indicator_measurement_due"],
    signalKinds: [],
    severity: "domain", createsCase: false, supersededBy: "indicator_measurement_due",
    classification: "supersede", compatibility: "already_superseded",
    note:
      "RELEVO SEGURO Y YA HECHO, y lo es por una razón concreta: este barrido observa UNA " +
      "sola condición, así que apagarlo entero no apaga nada más. Es el único de los ocho " +
      "del que eso se podía decir.",
  },
  {
    code: "work_scan_pending_actions.action_overdue",
    mechanism: "work_scan_pending_actions", domain: "actions", trigger: "sweep",
    truthSource: "work_actions.due_on",
    condition: "Acción vencida y sin completar.",
    subjectKind: "work_action",
    alertTypes: ["action_overdue"], taskTypes: [], signalKinds: [],
    severity: "domain", createsCase: false, supersededBy: "action_overdue",
    classification: "supersede", compatibility: "safe_to_supersede",
    note:
      "La plantilla `action_overdue` observa exactamente esto. El relevo es correcto para " +
      "ESTA condición y solo para ella: ver el hermano `effectiveness_due`.",
  },
  {
    code: "work_scan_pending_actions.effectiveness_due",
    mechanism: "work_scan_pending_actions", domain: "actions", trigger: "sweep",
    truthSource: "work_actions.effectiveness_result",
    condition: "Acción completada cuya eficacia falta verificar.",
    subjectKind: "work_action",
    alertTypes: ["effectiveness_due"], taskTypes: [], signalKinds: [],
    severity: "domain", createsCase: false, supersededBy: null,
    classification: "keep", compatibility: "not_equivalent",
    note:
      "EL DEFECTO QUE ESTE TRAMO ENCONTRÓ. Ninguna plantilla la releva, y sin embargo dejaba " +
      "de emitirse: `supersedes_observer` apaga la FUNCIÓN entera, y la plantilla " +
      "`action_overdue` declaraba relevar el barrido completo. Una empresa que adoptaba " +
      "«acción vencida» perdía, sin decírselo nadie, el aviso de verificar la eficacia. " +
      "0153 lo corrige llevando el relevo a la granularidad de la condición.",
  },
  {
    code: "quality_emit_performance_signals.indicator_target_missed",
    mechanism: "quality_emit_performance_signals", domain: "indicators", trigger: "event",
    truthSource: "quality_measurements.evaluation",
    condition: "Una medición registrada quedó fuera de meta.",
    subjectKind: "quality_indicator",
    alertTypes: ["indicator_target_missed"], taskTypes: [], signalKinds: [],
    severity: "domain", createsCase: false, supersededBy: null,
    classification: "keep", compatibility: "no_candidate",
    note:
      "Por evento, y así debe ser: el hecho ocurre al medir. Estar fuera de meta NO es una " +
      "no conformidad y este observador no crea ninguna.",
  },
  {
    code: "quality_emit_performance_signals.indicator_source_failed",
    mechanism: "quality_emit_performance_signals", domain: "indicators", trigger: "event",
    truthSource: "quality_measurements.data_quality",
    condition: "La fuente automática del indicador no pudo consultarse.",
    subjectKind: "quality_indicator",
    alertTypes: [], taskTypes: [], signalKinds: [],
    severity: "domain", createsCase: false, supersededBy: null,
    classification: "keep", compatibility: "no_candidate",
    note: "Un problema TÉCNICO no es un mal desempeño (OI-31). Solo deja hecho, no aviso.",
  },
  {
    code: "quality_emit_performance_signals.indicator_attention",
    mechanism: "quality_emit_performance_signals", domain: "indicators", trigger: "event",
    truthSource: "quality_measurements.evaluation",
    condition: "Una medición quedó en zona de atención.",
    subjectKind: "quality_indicator",
    alertTypes: [], taskTypes: [], signalKinds: [],
    severity: "domain", createsCase: false, supersededBy: null,
    classification: "keep", compatibility: "no_candidate",
    note: "Solo deja hecho. No avisa a nadie: no todo lo observable merece interrumpir.",
  },
];

const DOCUMENTS: ObserverRecord[] = [
  {
    code: "trazadoc_activate_workflow_stage.document_review_requested",
    mechanism: "trazadoc_activate_workflow_stage", domain: "documents", trigger: "event",
    truthSource: "trazadoc_document_revisions (etapa del flujo)",
    condition: "Una revisión de documento entró en etapa de revisión.",
    subjectKind: "trazadoc_document",
    alertTypes: ["document_review_requested"], taskTypes: ["document_review"], signalKinds: [],
    severity: "domain", createsCase: false, supersededBy: null,
    classification: "keep", compatibility: "no_candidate",
    note: "Paso de flujo: por evento y sin alternativa por barrido.",
  },
  {
    code: "trazadoc_activate_workflow_stage.document_approval_requested",
    mechanism: "trazadoc_activate_workflow_stage", domain: "documents", trigger: "event",
    truthSource: "trazadoc_document_revisions (etapa del flujo)",
    condition: "Una revisión entró en etapa de aprobación.",
    subjectKind: "trazadoc_document",
    alertTypes: ["document_approval_requested"], taskTypes: ["document_approval"],
    signalKinds: [],
    severity: "domain", createsCase: false, supersededBy: null,
    classification: "keep", compatibility: "no_candidate",
    note: "Paso de flujo.",
  },
  {
    code: "trazadoc_record_document_decision.document_changes_requested",
    mechanism: "trazadoc_record_document_decision", domain: "documents", trigger: "event",
    truthSource: "trazadoc_document_decisions",
    condition: "Alguien devolvió la revisión con observaciones.",
    subjectKind: "trazadoc_document",
    alertTypes: ["document_changes_requested"], taskTypes: ["document_changes_requested"],
    signalKinds: [],
    severity: "domain", createsCase: false, supersededBy: null,
    classification: "keep", compatibility: "no_candidate",
    note: "Decisión humana registrada.",
  },
  {
    code: "trazadoc_record_document_decision.document_approved",
    mechanism: "trazadoc_record_document_decision", domain: "documents", trigger: "event",
    truthSource: "trazadoc_document_decisions",
    condition: "La revisión quedó aprobada.",
    subjectKind: "trazadoc_document",
    alertTypes: ["document_approved"], taskTypes: [], signalKinds: [],
    severity: "domain", createsCase: false, supersededBy: null,
    classification: "keep", compatibility: "no_candidate",
    note:
      "Es una BUENA noticia con forma de aviso. La portada no debería contarla como algo " +
      "que requiere atención, y por eso el cargador la marca como informativa.",
  },
  {
    code: "trazadoc_retire_document.document_retired",
    mechanism: "trazadoc_retire_document", domain: "documents", trigger: "event",
    truthSource: "trazadoc_documents.retired_at",
    condition: "Un documento se retiró.",
    subjectKind: "trazadoc_document",
    alertTypes: ["document_retired"], taskTypes: [], signalKinds: [],
    severity: "domain", createsCase: false, supersededBy: null,
    classification: "keep", compatibility: "no_candidate",
    note: "Hecho consumado: se comunica, no pide trabajo.",
  },
];

const ENGINE: ObserverRecord[] = [
  {
    code: "quality_automation_emit.rule_signal",
    mechanism: "quality_automation_emit", domain: "automation", trigger: "sweep",
    truthSource: "la fuente que declare cada regla · 22 catálogos",
    condition: "Lo que cada empresa haya escrito en su regla. Paramétrico por definición.",
    subjectKind: "quality_signal",
    alertTypes: ["automation_signal"], taskTypes: ["automation_follow_up"], signalKinds: [],
    severity: "domain", createsCase: false, supersededBy: null,
    classification: "keep", compatibility: "no_candidate",
    note:
      "El destino de todo lo demás, no un barrido más. Corre por reloj y también por evento " +
      "(0131). Su señal NO es la verdad: es la observación de la verdad de otro dominio.",
  },
];

export const OBSERVERS: readonly ObserverRecord[] = [
  ...AUDITS, ...CUSTOMER, ...MANAGEMENT_REVIEW, ...PEOPLE, ...RISKS, ...SUPPLIERS,
  ...INDICATORS_ACTIONS, ...DOCUMENTS, ...ENGINE,
];

// ===========================================================================
// 3 · LOS DIEZ DE 13A (§4)
// ===========================================================================

/**
 * Lo que 13A llamó «los diez que aún no tienen relevo»: seis barridos y cuatro
 * tablas de señal. Se clasifican aquí uno por uno, con su motivo.
 */
export type LegacyVerdict = {
  name: string;
  kind: "sweep" | "signal_table";
  conditions: number;
  classification: ObserverClassification;
  reason: string;
};

export const LEGACY_TEN: readonly LegacyVerdict[] = [
  {
    name: "quality_scan_audits", kind: "sweep", conditions: 5, classification: "keep",
    reason:
      "Cinco condiciones. La única con plantilla parecida usa treinta días donde el barrido " +
      "usa catorce, y relevar el barrido apagaría las otras cuatro.",
  },
  {
    name: "quality_scan_customer_voice", kind: "sweep", conditions: 5, classification: "keep",
    reason:
      "Cinco condiciones. La plantilla de deterioro usa otro umbral y otra definición de " +
      "comparabilidad.",
  },
  {
    name: "quality_scan_management_reviews", kind: "sweep", conditions: 4, classification: "keep",
    reason:
      "Cuatro condiciones, tres puramente temporales. La única plantilla del dominio observa " +
      "algo distinto: que la fuente de una entrada cambió.",
  },
  {
    name: "quality_scan_people_signals", kind: "sweep", conditions: 7, classification: "keep",
    reason:
      "Siete condiciones. Una tiene plantilla equivalente —conocimiento en una sola persona— " +
      "y con la granularidad de 0153 podrá relevarse; las otras seis no tienen candidata, y " +
      "cuatro son tareas propias del dominio (QI-24).",
  },
  {
    name: "quality_scan_risk_reviews", kind: "sweep", conditions: 1, classification: "rewrite",
    reason:
      "Una sola condición, así que sería el candidato ideal. No se puede hoy: la fuente " +
      "`risk` no expone `status`, así que una regla no puede limitarse a los riesgos activos " +
      "como hace el barrido. Falta un campo de fuente, y eso es QUALITY-11.",
  },
  {
    name: "quality_scan_supplier_reviews", kind: "sweep", conditions: 4, classification: "keep",
    reason:
      "Cuatro condiciones. La plantilla candidata observa alcances críticos; el barrido, " +
      "todos los perfiles. Más estrecha no es equivalente.",
  },
  {
    name: "quality_risk_signals", kind: "signal_table", conditions: 0, classification: "defer",
    reason:
      "NO LA ESCRIBE NADIE. Ni una migración, ni una línea de aplicación. Relevarla sería " +
      "relevar el vacío; borrarla es una decisión de limpieza que no toca a este tramo.",
  },
  {
    name: "quality_supplier_signals", kind: "signal_table", conditions: 0, classification: "keep",
    reason:
      "No es un observador: es el almacén de lo que vio su barrido, y su pantalla de " +
      "proveedores lo lee. Relevar el almacén no tiene sentido; se releva el barrido.",
  },
  {
    name: "quality_customer_signals", kind: "signal_table", conditions: 0, classification: "keep",
    reason: "Almacén del barrido de voz del cliente, con consumidor propio.",
  },
  {
    name: "quality_knowledge_signals", kind: "signal_table", conditions: 0, classification: "keep",
    reason: "Almacén del barrido de personas, con consumidor propio.",
  },
];

// ===========================================================================
// 4 · EL VOCABULARIO DECLARADO QUE NADIE EMITE
// ===========================================================================

/**
 * Tipos que el CHECK admite y que hoy **no escribe ninguna función**.
 *
 * No es basura: es sitio reservado. Pero mientras nadie los emita, una portada
 * que los cuente contará ceros, y por eso están aquí y no en el inventario de
 * observadores.
 */
export const DECLARED_WITHOUT_EMITTER = {
  alerts: [
    "action_assigned", "audit_program_coverage_gap", "automation_engine_failure",
    "campaign_low_response", "case_assigned", "customer_signal_raised",
    "development_plan_overdue", "management_review_followup_pending",
    "management_review_source_updated", "objective_at_risk", "opportunity_assigned",
    "risk_above_appetite", "supplier_approval_expiring", "supplier_critical_unapproved",
    "supplier_incident_streak", "voice_review_due",
  ],
  tasks: [
    "action_effectiveness", "action_execution", "audit_execution", "audit_followup",
    "audit_plan_review", "campaign_closing_review", "case_closure", "case_evaluation",
    "competence_assessment_due", "control_verification", "customer_signal_review",
    "customer_voice_review_due", "indicator_off_target", "lesson_proposal_decision",
    "management_review_action_followup", "management_review_analysis",
    "management_review_closure", "management_review_input", "opportunity_review",
    "supplier_approval_review", "supplier_criticality_review", "supplier_evaluation_completion",
  ],
} as const;

// ===========================================================================
// 5 · BÚSQUEDA
// ===========================================================================

const POR_ALERTA = new Map<string, ObserverRecord>();
const POR_TAREA = new Map<string, ObserverRecord>();
for (const o of OBSERVERS) {
  for (const a of o.alertTypes) if (!POR_ALERTA.has(a)) POR_ALERTA.set(a, o);
  for (const t of o.taskTypes) if (!POR_TAREA.has(t)) POR_TAREA.set(t, o);
}

/** Qué observador escribió este aviso. `null` si el tipo no está inventariado,
 *  y eso NO se calla: se enseña como observador desconocido. */
export function observerForAlert(alertType: string): ObserverRecord | null {
  return POR_ALERTA.get(alertType) ?? null;
}
export function observerForTask(taskType: string): ObserverRecord | null {
  return POR_TAREA.get(taskType) ?? null;
}
export function observerByCode(code: string): ObserverRecord | null {
  return OBSERVERS.find((o) => o.code === code) ?? null;
}

/** Las condiciones que apagaría relevar este mecanismo entero. La cuenta que
 *  no se hizo en QUALITY-11.1 y que costó el aviso de eficacia. */
export function conditionsSilencedBySweepSupersession(mechanism: string): ObserverRecord[] {
  return OBSERVERS.filter((o) => o.mechanism === mechanism && o.supersededBy === null);
}

/** El código con el que 0153 identifica una condición dentro de un barrido. */
export function qualifiedObserverCode(mechanism: string, condition: string): string {
  return `${mechanism}.${condition}`;
}

/** Los avisos que informan de algo cerrado y NO piden trabajo. Una portada que
 *  los cuente como pendientes convierte una buena noticia en deuda. */
export const INFORMATIONAL_ALERTS: readonly string[] = [
  "document_approved", "document_retired",
];

// ===========================================================================
// 6 · EL TIEMPO, SOLO DONDE SIGNIFICA ALGO (§21)
// ===========================================================================

/**
 * «Vencido» y «por vencer» son resúmenes que B4 va a querer. Solo valen si la
 * condición de verdad habla de una fecha pasada o próxima.
 *
 * Se declaran a mano, uno por uno, en vez de adivinarlos por el nombre. Un
 * resumen que cuenta «vencidos» porque el código termina en `_overdue` es un
 * resumen que se equivoca el día que alguien nombre distinto una condición.
 */
export const OVERDUE_OBSERVERS: readonly string[] = [
  "quality_scan_audits.audit_overdue",
  "quality_scan_audits.audit_report_pending",
  "quality_scan_audits.audit_finding_unevaluated",
  "quality_scan_customer_voice.complaint_unreviewed",
  "quality_scan_management_reviews.review_overdue",
  "quality_scan_management_reviews.action_overdue",
  "quality_scan_people_signals.knowledge_transfer_overdue",
  "quality_scan_risk_reviews.risk_review_overdue",
  "quality_scan_supplier_reviews.reevaluation_overdue",
  "quality_scan_supplier_reviews.approval_expired",
  "quality_scan_pending_measurements.measurement_due",
  "work_scan_pending_actions.action_overdue",
];

export const DUE_SOON_OBSERVERS: readonly string[] = [
  "quality_scan_audits.audit_upcoming",
  "quality_scan_customer_voice.campaign_closing",
  "quality_scan_management_reviews.review_due",
];

/**
 * `competence_evidence_expiring` NO está en ninguna de las dos listas, y no es
 * un olvido: ese observador emite DOS tipos de aviso —caducada y por caducar—
 * bajo una sola condición. Sin mirar el tipo de aviso no se puede decir en cuál
 * de las dos cae, y adivinarlo contaría como vencido lo que todavía no lo está.
 *
 * Es, en pequeño, el mismo problema de granularidad que arregla 0153.
 */
export const TIMING_UNDECIDABLE: readonly string[] = [
  "quality_scan_people_signals.competence_evidence_expiring",
];
