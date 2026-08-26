/**
 * Trazaloop · QUALITY-06 · Personas, competencia, desarrollo y conocimiento —
 * el vocabulario del dominio.
 *
 * LAS SEPARACIONES QUE SOSTIENEN TODO
 *
 *   CARGO ≠ PERSONA ≠ USUARIO         el rol estructural, el ser humano y la
 *                                     cuenta con login son tres cosas
 *   COMPETENCIA ≠ DESEMPEÑO           se puede ser competente y rendir mal
 *   ASISTENCIA ≠ APRENDIZAJE          ir al curso no es haber aprendido
 *   APRENDIZAJE ≠ COMPETENCIA         aprobar una prueba no es ser competente
 *   COMPETENCIA ≠ EFICACIA            saber hacerlo no es que el problema se
 *                                     haya resuelto
 *   HOLDER ≠ DUEÑO DEL CONOCIMIENTO   el conocimiento es de la empresa
 *   BRECHA ≠ CAPACITACIÓN             una brecha admite práctica, mentoría o
 *                                     rotación; el curso es UNA opción
 *   REQUISITO DE HOY ≠ REQUISITO DE ENTONCES  subir el listón no vuelve
 *                                     incumplida una evaluación pasada
 *
 * Este archivo es PURO: no sabe de base de datos ni de sesión. Nombra el
 * dominio en español y responde lo que no depende de nadie.
 *
 * LO QUE ESTE DOMINIO NO ES, Y ES DELIBERADO
 *
 * No es un HRIS, ni nómina, ni salud ocupacional, ni un sistema disciplinario,
 * ni vigilancia. No hay puntaje total de una persona, no hay promedio y no hay
 * orden por «peor». Si alguna vez aparece aquí una función que ordene personas
 * por un número, algo se rompió.
 */

// ---------------------------------------------------------------------------
// Personas (PC-01, PC-05)
// ---------------------------------------------------------------------------

export const PERSON_RELATIONSHIPS = [
  "employee", "contractor", "temporary", "intern", "external",
] as const;
export type PersonRelationship = (typeof PERSON_RELATIONSHIPS)[number];

export const PERSON_RELATIONSHIP_LABEL: Record<PersonRelationship, string> = {
  employee: "Empleado",
  contractor: "Contratista",
  temporary: "Temporal",
  intern: "Practicante",
  external: "Externo",
};

export const PERSON_STATUSES = ["active", "inactive", "former"] as const;
export type PersonStatus = (typeof PERSON_STATUSES)[number];

export const PERSON_STATUS_LABEL: Record<PersonStatus, string> = {
  active: "Vinculada",
  inactive: "Inactiva",
  former: "Desvinculada",
};

/**
 * PC-14 y §14 · Los campos que esta plataforma NO guarda de una persona.
 *
 * Está escrito como dato y no como comentario porque una prueba lo comprueba
 * contra el esquema real: si alguien añade una columna «salario» a
 * `quality_people`, la prueba lo dice en voz alta. Un límite que solo vive en
 * la cabeza de quien lo escribió deja de existir en tres meses.
 */
export const FORBIDDEN_PERSON_FIELDS = [
  "salary", "salario", "wage", "bank_account", "cuenta_bancaria", "iban",
  "medical", "medico", "health", "salud", "religion", "sexual_orientation",
  "orientacion_sexual", "marital_status", "estado_civil", "family",
  "disciplinary", "disciplinario", "sanction", "sancion",
] as const;

// ---------------------------------------------------------------------------
// Asignaciones (§16, §17)
// ---------------------------------------------------------------------------

export const ASSIGNMENT_TYPES = ["holder", "co_holder", "acting", "delegate"] as const;
export type AssignmentType = (typeof ASSIGNMENT_TYPES)[number];

export const ASSIGNMENT_TYPE_LABEL: Record<AssignmentType, string> = {
  holder: "Titular",
  co_holder: "Cotitular",
  acting: "Encargado",
  delegate: "Delegado",
};

/**
 * §17 · Quién es el titular principal se DECLARA, no se adivina.
 *
 * La tentación evidente es `asignaciones[0]`. Con tres operarios en el mismo
 * cargo, ese `[0]` cambia cuando cambia el orden de la consulta, y entonces el
 * responsable de una firma depende de un `ORDER BY` que nadie recuerda haber
 * escrito. Aquí solo el tipo `holder` es el titular; si no hay ninguno, la
 * respuesta es «ninguno», que es una respuesta legítima.
 */
export function primaryHolder<T extends { assignmentType: AssignmentType }>(
  assignments: readonly T[]
): T | null {
  const holders = assignments.filter((a) => a.assignmentType === "holder");
  return holders.length === 1 ? holders[0] : null;
}

/** Vigente EN una fecha. Ni la de hoy ni la última: la que regía entonces. */
export function isEffectiveOn(
  assignment: { effectiveFrom: string; effectiveTo: string | null },
  on: string
): boolean {
  if (assignment.effectiveFrom > on) return false;
  return assignment.effectiveTo === null || assignment.effectiveTo >= on;
}

// ---------------------------------------------------------------------------
// Cargos: versiones y funciones (§12, §13)
// ---------------------------------------------------------------------------

export const POSITION_VERSION_STATUSES = ["draft", "published", "superseded"] as const;
export type PositionVersionStatus = (typeof POSITION_VERSION_STATUSES)[number];

export const POSITION_VERSION_STATUS_LABEL: Record<PositionVersionStatus, string> = {
  draft: "Borrador",
  published: "Vigente",
  superseded: "Sustituido",
};

export const POSITION_FUNCTION_KINDS = ["responsibility", "authority", "activity"] as const;
export type PositionFunctionKind = (typeof POSITION_FUNCTION_KINDS)[number];

export const POSITION_FUNCTION_KIND_LABEL: Record<PositionFunctionKind, string> = {
  responsibility: "Responsabilidad",
  authority: "Autoridad",
  activity: "Actividad",
};

// ---------------------------------------------------------------------------
// Competencia (PC-16, PC-22, PC-23, PC-24)
// ---------------------------------------------------------------------------

export const COMPETENCE_METHODS = [
  "education", "experience", "certification", "observation",
  "practical_assessment", "training", "demonstrated_performance", "other",
] as const;
export type CompetenceMethod = (typeof COMPETENCE_METHODS)[number];

export const COMPETENCE_METHOD_LABEL: Record<CompetenceMethod, string> = {
  education: "Educación",
  experience: "Experiencia",
  certification: "Certificación",
  observation: "Observación",
  practical_assessment: "Evaluación práctica",
  training: "Formación",
  demonstrated_performance: "Desempeño demostrado",
  other: "Otra evidencia autorizada",
};

export const EVIDENCE_STATUSES = ["valid", "expired", "revoked"] as const;
export type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number];

export const EVIDENCE_STATUS_LABEL: Record<EvidenceStatus, string> = {
  valid: "Vigente",
  expired: "Vencida",
  revoked: "Anulada",
};

export const PERSON_COMPETENCE_STATUSES = ["valid", "superseded", "revoked"] as const;
export type PersonCompetenceStatus = (typeof PERSON_COMPETENCE_STATUSES)[number];

export const PERSON_COMPETENCE_STATUS_LABEL: Record<PersonCompetenceStatus, string> = {
  valid: "Vigente",
  superseded: "Sustituida",
  revoked: "Revocada",
};

/**
 * La brecha, y solo la brecha.
 *
 * Se calcula, se explica y NO se guarda. Guardarla sería tentador —una columna
 * `gap` es cómoda de listar— pero el requisito cambia con la versión del cargo
 * y la demostración cambia con cada evaluación: una brecha almacenada empieza
 * a mentir el día siguiente y nadie se entera.
 */
export function competenceGap(
  requiredLevel: number,
  demonstratedLevel: number | null
): number {
  return Math.max(requiredLevel - (demonstratedLevel ?? 0), 0);
}

/**
 * PC-24 · Vencer NO es ser incompetente.
 *
 * Esta función existe para que esa frase tenga un lugar en el código. El
 * estado de la evidencia y la decisión de competencia son dos ejes: una
 * certificación vencida pide REVISAR, y quien decide si la persona sigue
 * siendo competente es una persona, no un `CURRENT_DATE`.
 */
export function evidenceNeedsReview(
  evidence: { status: EvidenceStatus; expiresOn: string | null },
  today: string
): boolean {
  if (evidence.status === "revoked") return true;
  if (evidence.expiresOn === null) return false;
  return evidence.expiresOn <= today;
}

/** Nunca «incompetente»: lo que corresponde decir es que hay que revisar. */
export function describeEvidenceExpiry(
  evidence: { status: EvidenceStatus; expiresOn: string | null },
  today: string
): string {
  if (evidence.status === "revoked") return "Anulada. Requiere revisar la competencia declarada.";
  if (evidence.expiresOn === null) return "No vence.";
  if (evidence.expiresOn < today) {
    return "Vencida. Requiere revisión; no implica por sí sola que la persona haya dejado de ser competente.";
  }
  return `Vigente hasta el ${formatDate(evidence.expiresOn)}.`;
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

// ---------------------------------------------------------------------------
// Desarrollo (PC-08, PC-14, PC-17)
// ---------------------------------------------------------------------------

export const DEVELOPMENT_KINDS = [
  "training", "mentoring", "supervised_practice", "coaching",
  "rotation", "self_study", "experience", "induction", "other",
] as const;
export type DevelopmentKind = (typeof DEVELOPMENT_KINDS)[number];

export const DEVELOPMENT_KIND_LABEL: Record<DevelopmentKind, string> = {
  training: "Formación",
  mentoring: "Mentoría",
  supervised_practice: "Práctica supervisada",
  coaching: "Acompañamiento",
  rotation: "Rotación",
  self_study: "Autoestudio",
  experience: "Experiencia dirigida",
  induction: "Inducción",
  other: "Otra acción de desarrollo",
};

/**
 * PC-17 · Una brecha admite nueve respuestas y solo una es un curso.
 *
 * La lista está aquí, y no en un `<select>`, porque es una decisión del
 * dominio: si mañana la pantalla ofrece solo «Formación», esta constante lo
 * delata.
 */
export const DEVELOPMENT_KINDS_THAT_ARE_NOT_TRAINING = DEVELOPMENT_KINDS
  .filter((k) => k !== "training");

export const NEED_ORIGINS = [
  "competency_gap", "new_position", "process_change", "document_change",
  "audit", "risk", "evaluation", "technology_change", "lesson_learned", "manual",
] as const;
export type NeedOrigin = (typeof NEED_ORIGINS)[number];

export const NEED_ORIGIN_LABEL: Record<NeedOrigin, string> = {
  competency_gap: "Brecha de competencia",
  new_position: "Nuevo cargo",
  process_change: "Cambio de proceso",
  document_change: "Cambio documental",
  audit: "Auditoría",
  risk: "Riesgo",
  evaluation: "Evaluación",
  technology_change: "Cambio tecnológico",
  lesson_learned: "Lección aprendida",
  manual: "Decisión humana",
};

export const NEED_STATUSES = ["open", "planned", "in_progress", "closed", "discarded"] as const;
export type NeedStatus = (typeof NEED_STATUSES)[number];

export const NEED_STATUS_LABEL: Record<NeedStatus, string> = {
  open: "Abierta",
  planned: "Planificada",
  in_progress: "En curso",
  closed: "Cerrada",
  discarded: "Descartada",
};

export const PLAN_ITEM_STATUSES = ["planned", "in_progress", "done", "cancelled"] as const;
export type PlanItemStatus = (typeof PLAN_ITEM_STATUSES)[number];

export const PLAN_ITEM_STATUS_LABEL: Record<PlanItemStatus, string> = {
  planned: "Planificado",
  in_progress: "En curso",
  done: "Realizado",
  cancelled: "Cancelado",
};

// ---------------------------------------------------------------------------
// Aprendizaje y eficacia (PC-09, PC-15)
// ---------------------------------------------------------------------------

export const ACTIVITY_KINDS = [
  "course", "workshop", "mentoring", "supervised_practice", "coaching",
  "self_study", "rotation", "induction", "other",
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export const ACTIVITY_KIND_LABEL: Record<ActivityKind, string> = {
  course: "Curso",
  workshop: "Taller",
  mentoring: "Mentoría",
  supervised_practice: "Práctica supervisada",
  coaching: "Acompañamiento",
  self_study: "Autoestudio",
  rotation: "Rotación",
  induction: "Inducción",
  other: "Otra",
};

export const ATTENDANCE_STATUSES = [
  "registered", "attended", "partial", "absent", "cancelled",
] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ATTENDANCE_STATUS_LABEL: Record<AttendanceStatus, string> = {
  registered: "Inscrita",
  attended: "Asistió",
  partial: "Asistió parcialmente",
  absent: "No asistió",
  cancelled: "Cancelada",
};

export const LEARNING_RESULTS = ["not_evaluated", "pending", "passed", "not_passed"] as const;
export type LearningResult = (typeof LEARNING_RESULTS)[number];

export const LEARNING_RESULT_LABEL: Record<LearningResult, string> = {
  not_evaluated: "No se evalúa",
  pending: "Pendiente de evaluar",
  passed: "Demostró aprendizaje",
  not_passed: "No demostró aprendizaje",
};

export const EFFECTIVENESS_RESULTS = [
  "pending", "effective", "partially_effective", "not_effective",
] as const;
export type EffectivenessResult = (typeof EFFECTIVENESS_RESULTS)[number];

export const EFFECTIVENESS_RESULT_LABEL: Record<EffectivenessResult, string> = {
  pending: "Pendiente",
  effective: "Eficaz",
  partially_effective: "Parcialmente eficaz",
  not_effective: "No eficaz",
};

export const EFFECTIVENESS_METHODS = [
  "observation", "practical_assessment", "indicator", "audit",
  "process_performance", "evidence", "other",
] as const;
export type EffectivenessMethod = (typeof EFFECTIVENESS_METHODS)[number];

export const EFFECTIVENESS_METHOD_LABEL: Record<EffectivenessMethod, string> = {
  observation: "Observación",
  practical_assessment: "Evaluación práctica",
  indicator: "Indicador",
  audit: "Auditoría",
  process_performance: "Desempeño del proceso",
  evidence: "Evidencia",
  other: "Otro",
};

/**
 * §72 · Las CUATRO capas, y por qué no se colapsan.
 *
 * Devuelve el estado de cada una por separado. Que alguien asistiera al 100 %
 * no rellena las otras tres: la respuesta correcta a «¿fue eficaz?» cuando
 * nadie lo ha evaluado es «pendiente», no «sí».
 */
export type LearningLayers = {
  attendance: AttendanceStatus;
  learning: LearningResult;
  competence: "not_assessed" | "assessed";
  effectiveness: EffectivenessResult;
};

export function describeLayers(layers: LearningLayers): string[] {
  return [
    `Asistencia: ${ATTENDANCE_STATUS_LABEL[layers.attendance]}`,
    `Aprendizaje: ${LEARNING_RESULT_LABEL[layers.learning]}`,
    `Competencia: ${layers.competence === "assessed" ? "Evaluada aparte" : "Sin evaluar"}`,
    `Eficacia: ${EFFECTIVENESS_RESULT_LABEL[layers.effectiveness]}`,
  ];
}

// ---------------------------------------------------------------------------
// Desempeño (PC-06, PC-13, PC-28)
// ---------------------------------------------------------------------------

export const PERFORMANCE_CYCLE_STATUSES = ["draft", "open", "closed"] as const;
export type PerformanceCycleStatus = (typeof PERFORMANCE_CYCLE_STATUSES)[number];

export const PERFORMANCE_CYCLE_STATUS_LABEL: Record<PerformanceCycleStatus, string> = {
  draft: "Borrador",
  open: "Abierto",
  closed: "Cerrado",
};

export const EVALUATION_STATUSES = ["draft", "submitted", "acknowledged", "closed"] as const;
export type EvaluationStatus = (typeof EVALUATION_STATUSES)[number];

export const EVALUATION_STATUS_LABEL: Record<EvaluationStatus, string> = {
  draft: "Borrador",
  submitted: "Emitida",
  acknowledged: "Comunicada",
  closed: "Cerrada",
};

export const PERFORMANCE_RESULTS = [
  "exceeds", "meets", "partially_meets", "does_not_meet", "not_applicable",
] as const;
export type PerformanceResult = (typeof PERFORMANCE_RESULTS)[number];

export const PERFORMANCE_RESULT_LABEL: Record<PerformanceResult, string> = {
  exceeds: "Supera lo esperado",
  meets: "Cumple",
  partially_meets: "Cumple parcialmente",
  does_not_meet: "No cumple",
  not_applicable: "No aplica",
};

/**
 * PC-28 · Los datos operacionales ACOMPAÑAN; no califican.
 *
 * Esta función devuelve contexto para que lo lea un evaluador humano y se
 * niega, por construcción, a devolver un número. No hay «-20 puntos por
 * indicador incumplido» que valga: el resultado de la evaluación lo escribe
 * una persona en `quality_performance_items`.
 */
export type OperationalContext = {
  label: string;
  value: string;
  /** De dónde sale, para que el evaluador pueda ir a mirarlo. */
  source: string;
};

export function contextIsAdvisoryOnly(_context: readonly OperationalContext[]): true {
  return true;
}

// ---------------------------------------------------------------------------
// Conocimiento (PC-18, PC-19, PC-20)
// ---------------------------------------------------------------------------

export const KNOWLEDGE_KINDS = ["explicit", "tacit", "mixed"] as const;
export type KnowledgeKind = (typeof KNOWLEDGE_KINDS)[number];

export const KNOWLEDGE_KIND_LABEL: Record<KnowledgeKind, string> = {
  explicit: "Explícito",
  tacit: "Tácito",
  mixed: "Mixto",
};

export const CRITICALITIES = ["low", "medium", "high", "critical"] as const;
export type Criticality = (typeof CRITICALITIES)[number];

export const CRITICALITY_LABEL: Record<Criticality, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
  critical: "Crítica",
};

export const DOCUMENTATION_STATUSES = [
  "undocumented", "partially_documented", "documented",
] as const;
export type DocumentationStatus = (typeof DOCUMENTATION_STATUSES)[number];

export const DOCUMENTATION_STATUS_LABEL: Record<DocumentationStatus, string> = {
  undocumented: "Sin documentar",
  partially_documented: "Parcialmente documentado",
  documented: "Documentado",
};

export const HOLDER_LEVELS = ["holder", "reference", "learning"] as const;
export type HolderLevel = (typeof HOLDER_LEVELS)[number];

export const HOLDER_LEVEL_LABEL: Record<HolderLevel, string> = {
  holder: "Lo sostiene",
  reference: "Referencia",
  learning: "En aprendizaje",
};

export const KNOWLEDGE_SIGNAL_KINDS = [
  "single_holder", "no_holder", "holder_leaving", "undocumented_critical", "transfer_overdue",
] as const;
export type KnowledgeSignalKind = (typeof KNOWLEDGE_SIGNAL_KINDS)[number];

/**
 * §44 · La frase, escrita una sola vez.
 *
 * La señal habla del CONOCIMIENTO. «Juan es un riesgo» no aparece en ninguna
 * parte del producto porque no es lo que ocurre: lo que ocurre es que algo que
 * la organización necesita depende de una sola persona, y eso es un problema
 * de la empresa.
 */
export const KNOWLEDGE_SIGNAL_LABEL: Record<KnowledgeSignalKind, string> = {
  single_holder: "Conocimiento crítico concentrado en una sola persona",
  no_holder: "Conocimiento crítico sin ninguna persona registrada",
  holder_leaving: "Quien lo sostiene termina su vinculación",
  undocumented_critical: "Conocimiento crítico sin documentar",
  transfer_overdue: "Transferencia vencida",
};

export const TRANSFER_METHODS = [
  "accompaniment", "mentoring", "documentation", "training",
  "supervised_practice", "rotation", "other",
] as const;
export type TransferMethod = (typeof TRANSFER_METHODS)[number];

export const TRANSFER_METHOD_LABEL: Record<TransferMethod, string> = {
  accompaniment: "Acompañamiento",
  mentoring: "Mentoría",
  documentation: "Documentación",
  training: "Formación",
  supervised_practice: "Práctica supervisada",
  rotation: "Rotación",
  other: "Otro",
};

export const TRANSFER_STATUSES = ["draft", "active", "completed", "cancelled"] as const;
export type TransferStatus = (typeof TRANSFER_STATUSES)[number];

export const TRANSFER_STATUS_LABEL: Record<TransferStatus, string> = {
  draft: "Borrador",
  active: "En curso",
  completed: "Verificada",
  cancelled: "Cancelada",
};

/**
 * PC-20 + §45 · Cuándo hay señal, y qué NO se hace con ella.
 *
 * Devuelve `true` cuando el conocimiento es crítico y depende de una persona
 * o de ninguna. No crea un riesgo, no abre una no conformidad y no escribe
 * nada: promoverla a riesgo formal es una decisión humana explícita.
 */
export function hasContinuityAttention(item: {
  status: "active" | "retired";
  criticality: Criticality;
  holderCount: number;
}): boolean {
  return item.status === "active"
    && (item.criticality === "high" || item.criticality === "critical")
    && item.holderCount <= 1;
}

// ---------------------------------------------------------------------------
// Lecciones aprendidas (PC-21, §48)
// ---------------------------------------------------------------------------

export const LESSON_ORIGINS = [
  "case", "action", "risk_materialized", "audit", "project",
  "process", "incident", "improvement", "manual",
] as const;
export type LessonOrigin = (typeof LESSON_ORIGINS)[number];

export const LESSON_ORIGIN_LABEL: Record<LessonOrigin, string> = {
  case: "Caso",
  action: "Acción",
  risk_materialized: "Riesgo materializado",
  audit: "Auditoría",
  project: "Proyecto",
  process: "Proceso",
  incident: "Incidente",
  improvement: "Mejora",
  manual: "Registro directo",
};

export const LESSON_STATUSES = ["draft", "published", "archived"] as const;
export type LessonStatus = (typeof LESSON_STATUSES)[number];

export const LESSON_STATUS_LABEL: Record<LessonStatus, string> = {
  draft: "Borrador",
  published: "Publicada",
  archived: "Archivada",
};

export const PROPOSAL_KINDS = [
  "process_change", "document_change", "competency_change", "development_action",
  "control_change", "risk_review", "improvement_action",
] as const;
export type ProposalKind = (typeof PROPOSAL_KINDS)[number];

export const PROPOSAL_KIND_LABEL: Record<ProposalKind, string> = {
  process_change: "Cambiar un proceso",
  document_change: "Cambiar un documento",
  competency_change: "Cambiar una competencia",
  development_action: "Acción de desarrollo",
  control_change: "Cambiar un control",
  risk_review: "Revisar un riesgo",
  improvement_action: "Acción de mejora",
};

export const PROPOSAL_STATUSES = ["proposed", "accepted", "rejected", "implemented"] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const PROPOSAL_STATUS_LABEL: Record<ProposalStatus, string> = {
  proposed: "Propuesta",
  accepted: "Aceptada",
  rejected: "Descartada",
  implemented: "Aplicada",
};

/**
 * §48 · Una propuesta NO cambia nada por su cuenta.
 *
 * La lección puede decir «hay que actualizar el procedimiento». Aplicarlo es
 * un acto aparte, de una persona autorizada, que deja constancia de qué se
 * creó. Esta función es la puerta: mientras la propuesta esté `proposed`, no
 * hay nada que aplicar.
 */
export function proposalCanBeApplied(proposal: { status: ProposalStatus }): boolean {
  return proposal.status === "accepted";
}

// ---------------------------------------------------------------------------
// Permisos (PC-25, §56, §57)
// ---------------------------------------------------------------------------

/**
 * Las mismas tres puertas que impone 0123, dichas en TypeScript para que la
 * pantalla pueda esconder un botón que la base ya iba a rechazar.
 *
 * Esto NO es la autorización: la autorización es RLS. Es la cortesía de no
 * ofrecer algo que va a fallar. Si alguna vez las dos listas dejan de
 * coincidir, manda la base.
 */
export function canManageStructure(roleCode: string): boolean {
  return roleCode === "admin" || roleCode === "quality" || roleCode === "consultant";
}

/** PC-25 · El círculo de la ficha de persona. Aquí se cae el consultor. */
export function canManagePeople(roleCode: string): boolean {
  return roleCode === "admin" || roleCode === "quality";
}

/** §59 · Y el desempeño es el círculo más cerrado de los tres. */
export function canReadEvaluations(roleCode: string, isSelf: boolean): boolean {
  return canManagePeople(roleCode) || isSelf;
}
