/**
 * Trazaloop Quality · QUALITY-09 · El dominio de Auditorías.
 *
 * Puro: sin base de datos, sin red, sin React. Aquí viven las distinciones que
 * el módulo existe para sostener, y las frases que las explican donde se
 * producen.
 *
 * LAS SIETE SEPARACIONES
 *
 *   PROGRAMA ≠ AUDITORÍA
 *   CRITERIO ≠ PREGUNTA DE CHECKLIST
 *   EVIDENCIA ≠ HALLAZGO
 *   HALLAZGO ≠ NO CONFORMIDAD
 *   OBSERVACIÓN ≠ NO CONFORMIDAD
 *   RESULTADO DE AUDITORÍA ≠ ACCIÓN CORRECTIVA
 *   AUDITOR ≠ RESPONSABLE DE LA AUDITORÍA
 */

// ---------------------------------------------------------------------------
// Programa (AR-03, §5, §6, §7, §45)
// ---------------------------------------------------------------------------

export const PROGRAM_STATUSES = ["draft", "active", "closed", "cancelled"] as const;
export type ProgramStatus = (typeof PROGRAM_STATUSES)[number];

export const PROGRAM_STATUS_LABEL: Record<ProgramStatus, string> = {
  draft: "Borrador",
  active: "Vigente",
  closed: "Cerrado",
  cancelled: "Cancelado",
};

/** AR-03 · El programa planifica varias auditorías; no es una auditoría
 *  grande. Decirlo donde se crea evita el registro que no sirve para nada. */
export const PROGRAM_IS_NOT_AN_AUDIT =
  "Un programa planifica VARIAS auditorías de un periodo. No es una auditoría: "
  + "guardarlo todo como «la auditoría de 2027» convierte cuatro trabajos "
  + "distintos en un registro que no sirve para ninguno.";

/** §7 · Y no queda congelado el 1 de enero. */
export const PROGRAM_IS_DYNAMIC =
  "Un programa anual no se congela al aprobarlo. Se le añaden auditorías, se "
  + "reprograman y se cancelan — y cada movimiento deja constancia de lo que "
  + "había antes.";

export const PROGRAM_REVISION_KINDS = [
  "created", "audit_added", "audit_rescheduled", "audit_cancelled",
  "priority_changed", "approved", "closed", "other",
] as const;
export type ProgramRevisionKind = (typeof PROGRAM_REVISION_KINDS)[number];

export const PROGRAM_REVISION_KIND_LABEL: Record<ProgramRevisionKind, string> = {
  created: "Programa creado",
  audit_added: "Se añadió una auditoría",
  audit_rescheduled: "Se reprogramó una auditoría",
  audit_cancelled: "Se canceló una auditoría",
  priority_changed: "Cambió la prioridad",
  approved: "Programa aprobado",
  closed: "Programa cerrado",
  other: "Otro cambio",
};

// ---------------------------------------------------------------------------
// Auditoría (§10, §11, AR-16)
// ---------------------------------------------------------------------------

export const AUDIT_TYPES = ["internal", "second_party", "external_received", "other"] as const;
export type AuditType = (typeof AUDIT_TYPES)[number];

export const AUDIT_TYPE_LABEL: Record<AuditType, string> = {
  internal: "Interna",
  second_party: "A un proveedor (segunda parte)",
  external_received: "Externa recibida",
  other: "Otra",
};

/** §11/§39 · Trazaloop NO certifica. No hay tipo «certificación» y ningún
 *  papel dice «certificado» ni «conforme con ISO». */
export const TRAZALOOP_DOES_NOT_CERTIFY =
  "Trazaloop administra auditorías; no concede certificaciones. Una auditoría "
  + "interna dice qué se encontró, no que la empresa esté certificada.";

export const AUDIT_NATURES = ["planned", "extraordinary"] as const;
export type AuditNature = (typeof AUDIT_NATURES)[number];

export const AUDIT_NATURE_LABEL: Record<AuditNature, string> = {
  planned: "Planificada",
  extraordinary: "Extraordinaria",
};

export const AUDIT_STATUSES = [
  "draft", "planned", "in_progress", "executed", "reported", "closed", "cancelled",
] as const;
export type AuditStatus = (typeof AUDIT_STATUSES)[number];

export const AUDIT_STATUS_LABEL: Record<AuditStatus, string> = {
  draft: "Borrador",
  planned: "Programada",
  in_progress: "En ejecución",
  executed: "Ejecutada",
  reported: "Con informe",
  closed: "Cerrada",
  cancelled: "Cancelada",
};

/** §43 · La fecha original no se pierde. */
export const RESCHEDULE_KEEPS_HISTORY =
  "Reprogramar no borra la fecha original: se guardan las dos, con el motivo y "
  + "quién lo decidió. Una auditoría que se movió tres veces lo dice.";

/** §44 · Cancelar tampoco. */
export const CANCEL_IS_NOT_DELETE =
  "Cancelar una auditoría no la borra del programa: sigue ahí, con su motivo, y "
  + "la cobertura NO la cuenta como ejecutada.";

export function wasRescheduled(a: {
  plannedFrom: string | null; scheduledFrom: string | null;
  plannedTo: string | null; scheduledTo: string | null;
}): boolean {
  if (a.plannedFrom === null && a.scheduledFrom === null) return false;
  return a.plannedFrom !== a.scheduledFrom || a.plannedTo !== a.scheduledTo;
}

// ---------------------------------------------------------------------------
// Alcance (§12, §53, §56)
// ---------------------------------------------------------------------------

export const SCOPE_ITEM_KINDS = [
  "process", "org_unit", "site", "supplier", "supplier_scope",
  "document", "requirement", "product_service", "other",
] as const;
export type ScopeItemKind = (typeof SCOPE_ITEM_KINDS)[number];

export const SCOPE_ITEM_KIND_LABEL: Record<ScopeItemKind, string> = {
  process: "Proceso",
  org_unit: "Unidad de la empresa",
  site: "Sede",
  supplier: "Proveedor",
  supplier_scope: "Alcance de proveedor",
  document: "Documento",
  requirement: "Requisito",
  product_service: "Producto o servicio",
  other: "Otro",
};

/** §12 · El alcance apunta a entidades reales; el texto complementa. */
export const SCOPE_IS_STRUCTURED =
  "El alcance apunta a lo que existe en el sistema: procesos, sedes, "
  + "proveedores, documentos. El texto libre matiza; no sostiene el alcance.";

export function scopeItemNeedsReference(kind: ScopeItemKind): boolean {
  return kind === "process" || kind === "supplier" || kind === "supplier_scope"
    || kind === "document" || kind === "requirement";
}

// ---------------------------------------------------------------------------
// Criterios y checklists (§13, §14, §15, §16, AR-05, AR-14)
// ---------------------------------------------------------------------------

export const CRITERION_KINDS = [
  "requirement", "document", "internal", "contractual", "legal", "other",
] as const;
export type CriterionKind = (typeof CRITERION_KINDS)[number];

export const CRITERION_KIND_LABEL: Record<CriterionKind, string> = {
  requirement: "Requisito de un marco",
  document: "Documento interno",
  internal: "Requisito propio",
  contractual: "Requisito contractual",
  legal: "Requisito legal",
  other: "Otro",
};

/**
 * §14 · CRITERIO ≠ PREGUNTA.
 *
 * «ISO 9001 8.4» es el criterio. «¿Cómo se evalúan los proveedores críticos?»
 * es la pregunta que ayuda a auditarlo. Un hallazgo formal conserva el
 * criterio, no la pregunta: si conservara la pregunta, nadie podría defender
 * después contra qué se levantó.
 */
export const CRITERION_IS_NOT_A_QUESTION =
  "El criterio es el requisito. La pregunta del checklist ayuda a auditarlo, "
  + "pero no lo sustituye: un hallazgo se levanta contra el criterio.";

/** AR-05 · Y el criterio documental resuelve la revisión del periodo auditado. */
export const CRITERION_RESOLVES_HISTORY =
  "Un criterio documental apunta a la REVISIÓN que regía en el periodo "
  + "auditado. Si el procedimiento va por la v4 y se auditó la v2, el informe "
  + "dice v2.";

export const CHECKLIST_VERSION_STATUSES = ["draft", "published", "superseded"] as const;
export type ChecklistVersionStatus = (typeof CHECKLIST_VERSION_STATUSES)[number];

export const CHECKLIST_VERSION_STATUS_LABEL: Record<ChecklistVersionStatus, string> = {
  draft: "Borrador",
  published: "Publicada",
  superseded: "Sustituida",
};

/** §15 · El checklist es OPCIONAL. */
export const CHECKLIST_IS_OPTIONAL =
  "Un checklist ayuda a no olvidarse de nada, pero no toda auditoría tiene que "
  + "ser un cuestionario. Obligarlo convierte una conversación con un proceso "
  + "en un formulario.";

export const CHECK_OUTCOMES = [
  "conforming", "suspected_gap", "not_applicable", "not_reviewed",
] as const;
export type CheckOutcome = (typeof CHECK_OUTCOMES)[number];

export const CHECK_OUTCOME_LABEL: Record<CheckOutcome, string> = {
  conforming: "Sin novedad",
  suspected_gap: "Hay que mirarlo",
  not_applicable: "No aplica",
  not_reviewed: "Sin revisar",
};

/** §15 · Y marcar una casilla no levanta un hallazgo. */
export const CHECK_IS_NOT_A_FINDING =
  "Marcar «hay que mirarlo» en una casilla es una anotación de trabajo. El "
  + "hallazgo formal es otro acto, con su criterio, su evidencia y su "
  + "declaración.";

export function checkResultCreatesFinding(_outcome: CheckOutcome): false {
  // Existe como función —y no como comentario— para que una prueba pueda
  // comprobar que nadie introdujo el atajo.
  return false;
}

// ---------------------------------------------------------------------------
// Equipo e independencia (§17, §18, §19, §20, §59, AR-06)
// ---------------------------------------------------------------------------

export const TEAM_ROLES = [
  "lead", "auditor", "technical_expert", "observer", "in_training",
] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

export const TEAM_ROLE_LABEL: Record<TeamRole, string> = {
  lead: "Auditor líder",
  auditor: "Auditor",
  technical_expert: "Experto técnico",
  observer: "Observador",
  in_training: "En formación",
};

/** §59 · Un auditor externo es una PERSONA, no una cuenta. */
export const EXTERNAL_AUDITOR_NEEDS_NO_ACCOUNT =
  "Un auditor externo figura como persona, sin cuenta de Trazaloop. Obligarle a "
  + "crear una para aparecer en un plan es pedirle que se registre en el sistema "
  + "de su cliente.";

/** §18 · La competencia se MUESTRA; no decide. */
export const COMPETENCE_INFORMS_DOES_NOT_DECIDE =
  "El sistema enseña qué competencia tiene el equipo y cuál está por vencer. No "
  + "declara a nadie incapaz de auditar: eso lo decide quien conduce el "
  + "programa, mirando el caso concreto.";

export const CONFLICT_KINDS = [
  "owns_audited_process", "owns_audited_document", "is_auditee",
  "reports_to_auditee", "other",
] as const;
export type ConflictKind = (typeof CONFLICT_KINDS)[number];

export const CONFLICT_KIND_LABEL: Record<ConflictKind, string> = {
  owns_audited_process: "Responde del proceso que audita",
  owns_audited_document: "Responde del documento que audita",
  is_auditee: "Es a la vez auditor y auditado",
  reports_to_auditee: "Depende de alguien a quien audita",
  other: "Otro conflicto",
};

export const CONFLICT_STATUSES = [
  "detected", "accepted_with_mitigation", "dismissed",
] as const;
export type ConflictStatus = (typeof CONFLICT_STATUSES)[number];

export const CONFLICT_STATUS_LABEL: Record<ConflictStatus, string> = {
  detected: "Sin resolver",
  accepted_with_mitigation: "Aceptado con mitigación",
  dismissed: "Descartado",
};

/**
 * §19 · EL SISTEMA NUNCA AFIRMA INDEPENDENCIA.
 *
 * No encontrar conflictos con lo que se sabe no es lo mismo que ser
 * independiente. La diferencia importa: un informe que dijera «equipo
 * independiente» porque una consulta no devolvió filas estaría afirmando algo
 * que nadie comprobó.
 */
export function declaresIndependence(_conflicts: readonly unknown[]): false {
  return false;
}

export const INDEPENDENCE_IS_NOT_DECLARED =
  "El sistema no declara independencia. Comprueba lo que sabe —qué cargo "
  + "ocupaba cada auditor en la fecha de la auditoría y qué procesos entraban "
  + "en el alcance— y dice lo que encuentra. Lo demás lo valora una persona.";

/** §20/§75 · Y la comprobación es HISTÓRICA. */
export const INDEPENDENCE_IS_HISTORICAL =
  "La pregunta correcta no es qué cargo tiene hoy quien auditó, sino cuál "
  + "ocupaba el día de la auditoría. Un conflicto de 2026 sigue siendo un "
  + "conflicto en 2029, aunque esa persona ya haya cambiado de puesto.";

/** La fecha con la que se resuelve la independencia: la de ejecución si la
 *  hubo, si no la programada, si no la original. */
export function independenceReferenceDate(a: {
  executedFrom: string | null; scheduledFrom: string | null; plannedFrom: string | null;
}, today: string): string {
  return a.executedFrom ?? a.scheduledFrom ?? a.plannedFrom ?? today;
}

// ---------------------------------------------------------------------------
// Ejecución (§25, §26, §27, §28, AR-15)
// ---------------------------------------------------------------------------

export const AGENDA_ACTIVITY_KINDS = [
  "opening", "interview", "review", "observation", "sampling",
  "team_meeting", "closing", "other",
] as const;
export type AgendaActivityKind = (typeof AGENDA_ACTIVITY_KINDS)[number];

export const AGENDA_ACTIVITY_LABEL: Record<AgendaActivityKind, string> = {
  opening: "Reunión de apertura",
  interview: "Entrevista",
  review: "Revisión",
  observation: "Observación en sitio",
  sampling: "Muestreo",
  team_meeting: "Reunión del equipo auditor",
  closing: "Reunión de cierre",
  other: "Otra actividad",
};

/** §24 · La agenda es una intención, no un compromiso contractual. Lo que
 *  ocurrió de verdad se lee en la ejecución, no aquí. */
export const AGENDA_IS_AN_INTENTION =
  "La agenda dice qué se piensa mirar y cuándo. Si el día de la auditoría se "
  + "mira otra cosa, eso no invalida la agenda: la agenda planificó, la "
  + "ejecución registró. Son dos capas distintas y ambas se conservan.";

export const MEETING_KINDS = ["opening", "closing"] as const;
export type MeetingKind = (typeof MEETING_KINDS)[number];

export const MEETING_KIND_LABEL: Record<MeetingKind, string> = {
  opening: "Apertura",
  closing: "Cierre",
};

/** §27 · La reunión de cierre presenta hallazgos. No los clasifica en firme. */
export const CLOSING_MEETING_PRESENTS =
  "En la reunión de cierre el equipo auditor PRESENTA los hallazgos. "
  + "Presentarlos no los convierte en no conformidades: la evaluación formal "
  + "es un acto posterior y de otra persona.";

export const NOTE_KINDS = [
  "working_note", "interview", "observation", "document_review",
  "follow_up_point", "other",
] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

export const NOTE_KIND_LABEL: Record<NoteKind, string> = {
  working_note: "Nota de trabajo",
  interview: "Entrevista",
  observation: "Observación",
  document_review: "Revisión documental",
  follow_up_point: "Punto a seguir",
  other: "Otra",
};

/** AR-15 · Nota ≠ evidencia ≠ hallazgo. */
export const NOTE_IS_NOT_EVIDENCE =
  "Una nota de trabajo es lo que el auditor apunta mientras audita. No es "
  + "evidencia formal ni hallazgo: formalizar en el instante de observar algo "
  + "produce hallazgos prematuros, y auditores que dejan de apuntar.";

export const EVIDENCE_KINDS = [
  "document", "record", "file", "indicator", "measurement", "supplier_evaluation",
  "risk", "case", "interview", "observation", "system_entity", "other",
] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export const EVIDENCE_KIND_LABEL: Record<EvidenceKind, string> = {
  document: "Documento",
  record: "Registro",
  file: "Archivo del repositorio",
  indicator: "Indicador",
  measurement: "Medición",
  supplier_evaluation: "Evaluación de proveedor",
  risk: "Riesgo",
  case: "Caso",
  interview: "Entrevista",
  observation: "Observación directa",
  system_entity: "Entidad del sistema",
  other: "Otra",
};

/** §26/AR-08 · La evidencia se REFERENCIA. */
export const EVIDENCE_IS_REFERENCED =
  "La evidencia apunta a lo que ya existe: un documento con su revisión, un "
  + "indicador, un archivo del repositorio. No se vuelve a subir nada: dos "
  + "copias del mismo archivo acaban diciendo cosas distintas.";

/** §27 · EVIDENCIA ≠ HALLAZGO. */
export const EVIDENCE_IS_NOT_A_FINDING =
  "Una evidencia por sí sola no es conforme, ni no conforme, ni observación. El "
  + "auditor la evalúa CONTRA un criterio, y de ahí sale el hallazgo.";

/** §28 · La muestra se declara. */
export const SAMPLE_IS_NOT_COVERAGE =
  "Revisar tres órdenes de cien no es revisar cien. Decir qué se miró es lo que "
  + "permite leer un hallazgo —y la ausencia de hallazgos— con la cabeza fría.";

export function describeSample(s: {
  sampleSize: number; populationSize: number | null; description: string;
}): string {
  if (s.populationSize === null) {
    return `${s.sampleSize} de una población que no se declaró.`;
  }
  const pct = Math.round((s.sampleSize * 100) / s.populationSize);
  return `${s.sampleSize} de ${s.populationSize} (${pct} %).`;
}

// ---------------------------------------------------------------------------
// Hallazgos (§29…§34, AR-09) — la frontera crítica
// ---------------------------------------------------------------------------

export const FINDING_CLASSIFICATIONS = [
  "conforming", "observation", "improvement_opportunity",
  "nonconformity_suspected", "not_conclusive",
] as const;
export type FindingClassification = (typeof FINDING_CLASSIFICATIONS)[number];

export const FINDING_CLASSIFICATION_LABEL: Record<FindingClassification, string> = {
  conforming: "Conforme",
  observation: "Observación",
  improvement_opportunity: "Oportunidad de mejora",
  nonconformity_suspected: "Posible no conformidad",
  not_conclusive: "Sin conclusión todavía",
};

export const FINDING_CLASSIFICATION_HINT: Record<FindingClassification, string> = {
  conforming: "Se miró y cumple. Registrarlo tiene sentido cuando la evidencia lo merece.",
  observation: "Algo que conviene mirar. NO es una no conformidad y no abre una acción correctiva.",
  improvement_opportunity: "Se puede hacer mejor. Tampoco es un incumplimiento.",
  nonconformity_suspected: "El auditor SOSPECHA un incumplimiento. Confirmarlo es una decisión aparte, en un caso.",
  not_conclusive: "Se apuntó, pero todavía no se puede decir qué es.",
};

/**
 * §30 · LA FRASE OBLIGATORIA DEL DOMINIO.
 *
 * Ningún valor de `FindingClassification` declara una no conformidad. El peor
 * dice que la sospecha. La clasificación formal vive en el caso, con las reglas
 * de QUALITY-04, y la decide una persona.
 */
export const FINDING_IS_NOT_NC =
  "Un hallazgo de auditoría NO es una no conformidad. Es lo que el auditor "
  + "observó y cómo lo lee frente a un criterio. Incluso cuando propone «posible "
  + "no conformidad», confirmarlo es una decisión aparte que se toma en un caso.";

/** §32 · Y observación no es lo mismo que no conformidad. */
export const OBSERVATION_IS_NOT_NC =
  "Una observación no es una no conformidad, y convertirla en acción correctiva "
  + "es la forma más rápida de que nadie vuelva a registrar observaciones.";

/** §31 · Una conformidad puntual no certifica nada. */
export const CONFORMITY_IS_LOCAL =
  "Registrar que algo cumple es útil. Concluir de ahí que «la empresa cumple "
  + "con la norma» no lo es: una auditoría mira una muestra de un alcance en un "
  + "periodo.";

/** Ninguna clasificación del auditor crea una no conformidad. Existe como
 *  función para que una prueba pueda comprobar que nadie metió el atajo. */
export function classificationCreatesNonconformity(_c: FindingClassification): false {
  return false;
}

export const FINDING_EVALUATION_STATUSES = [
  "pending", "evaluated", "dismissed", "escalated",
] as const;
export type FindingEvaluationStatus = (typeof FINDING_EVALUATION_STATUSES)[number];

export const FINDING_EVALUATION_STATUS_LABEL: Record<FindingEvaluationStatus, string> = {
  pending: "Sin evaluar",
  evaluated: "Evaluado, sin caso",
  dismissed: "Descartado",
  escalated: "Escalado a un caso",
};

export const FINDING_SEVERITIES = ["minor", "major", "critical"] as const;
export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];

export const FINDING_SEVERITY_LABEL: Record<FindingSeverity, string> = {
  minor: "Menor",
  major: "Mayor",
  critical: "Crítica",
};

/** §34 · Escalar es una decisión, no un efecto de registrar. */
export const ESCALATION_IS_A_DECISION =
  "Registrar un hallazgo no abre ningún caso. Abrirlo es una decisión, y a "
  + "veces la decisión correcta es evaluarlo y dejarlo dicho sin abrir nada.";

// ---------------------------------------------------------------------------
// Cierre y seguimiento (§36, §37, §38, §81, AR-12)
// ---------------------------------------------------------------------------

/** AR-12 · Cerrar la auditoría no cierra su trabajo derivado. */
export const CLOSING_AUDIT_IS_NOT_CLOSING_ACTIONS =
  "Cerrar una auditoría significa que el trabajo de auditar terminó. Las "
  + "acciones que salieron de ella siguen su propio ciclo: exigir que estén "
  + "todas cerradas produce auditorías abiertas durante años por una acción de "
  + "nadie.";

export function describeFollowUp(o: { openCases: number; openActions: number }): string {
  if (o.openCases === 0 && o.openActions === 0) {
    return "Sin trabajo derivado pendiente.";
  }
  const partes: string[] = [];
  if (o.openCases > 0) {
    partes.push(`${o.openCases} caso${o.openCases === 1 ? "" : "s"} abierto${o.openCases === 1 ? "" : "s"}`);
  }
  if (o.openActions > 0) {
    partes.push(`${o.openActions} acción${o.openActions === 1 ? "" : "es"} en curso`);
  }
  return `Seguimiento pendiente: ${partes.join(" y ")}.`;
}

/** §38 · La conclusión es humana. */
export const CONCLUSIONS_ARE_HUMAN =
  "El sistema resume los datos: cuántos hallazgos, de qué tipo, sobre qué "
  + "procesos. La conclusión la escribe quien auditó.";

// ---------------------------------------------------------------------------
// Cobertura del programa (§45)
// ---------------------------------------------------------------------------

/**
 * §45 · Cancelar NO es cubrir.
 *
 * Un programa con tres auditorías canceladas tiene una cobertura del 0 %, no
 * del 100 % «porque se decidió no hacerlas». Devuelve `null` sin auditorías:
 * un programa vacío no tiene cobertura, ni del 0 % ni de nada.
 */
export function coveragePercent(
  planned: number, executed: number
): number | null {
  if (planned <= 0) return null;
  return Math.round((executed * 100 / planned) * 100) / 100;
}

export function describeCoverage(c: {
  planned: number; executed: number; cancelled: number; pending: number;
}): string {
  if (c.planned === 0) return "El programa todavía no tiene auditorías.";
  const partes = [`${c.executed} de ${c.planned} ejecutadas`];
  if (c.pending > 0) partes.push(`${c.pending} pendiente${c.pending === 1 ? "" : "s"}`);
  if (c.cancelled > 0) partes.push(`${c.cancelled} cancelada${c.cancelled === 1 ? "" : "s"}`);
  return partes.join(" · ") + ".";
}

// ---------------------------------------------------------------------------
// Priorización (AR-04, §8, §9, §46, §77)
// ---------------------------------------------------------------------------

/** AR-04 · El contexto SUGIERE; la decisión de programar es humana. */
export const PRIORITY_SUGGESTS_ONLY =
  "El contexto de priorización reúne lo que ya se sabe —riesgos, desempeño, "
  + "casos abiertos, hallazgos anteriores, cuándo se auditó por última vez— y "
  + "se detiene ahí. Un riesgo alto no programa una auditoría.";

export type PriorityContext = {
  risks: { total: number; aboveAppetite: number; materialized: number };
  indicators: { total: number; offTarget: number };
  cases: { open: number; nonconformities: number };
  priorAudits: { count: number; lastExecutedOn: string | null; priorFindings: number };
};

/**
 * Un peso EXPLICABLE, no una fórmula universal. Cada punto se puede señalar en
 * la pantalla y decir de dónde salió; por eso la función devuelve también los
 * motivos.
 */
export function explainPriority(c: PriorityContext, today: string): {
  score: number; reasons: string[];
} {
  const reasons: string[] = [];
  let score = 0;

  if (c.risks.aboveAppetite > 0) {
    score += c.risks.aboveAppetite * 3;
    reasons.push(`${c.risks.aboveAppetite} riesgo(s) por encima del criterio aceptable`);
  }
  if (c.risks.materialized > 0) {
    score += c.risks.materialized * 2;
    reasons.push(`${c.risks.materialized} materialización(es) registradas`);
  }
  if (c.indicators.offTarget > 0) {
    score += c.indicators.offTarget * 2;
    reasons.push(`${c.indicators.offTarget} indicador(es) fuera de meta`);
  }
  if (c.cases.nonconformities > 0) {
    score += c.cases.nonconformities * 2;
    reasons.push(`${c.cases.nonconformities} no conformidad(es) del proceso`);
  }
  if (c.cases.open > 0) {
    score += c.cases.open;
    reasons.push(`${c.cases.open} caso(s) abierto(s)`);
  }
  if (c.priorAudits.priorFindings > 0) {
    score += 1;
    reasons.push(`${c.priorAudits.priorFindings} hallazgo(s) en auditorías anteriores`);
  }
  if (c.priorAudits.count === 0) {
    score += 3;
    reasons.push("nunca se ha auditado");
  } else if (c.priorAudits.lastExecutedOn !== null) {
    const meses = monthsBetween(c.priorAudits.lastExecutedOn, today);
    if (meses >= 24) {
      score += 3;
      reasons.push(`hace ${meses} meses de la última auditoría`);
    } else if (meses >= 12) {
      score += 1;
      reasons.push(`hace ${meses} meses de la última auditoría`);
    }
  }

  if (reasons.length === 0) reasons.push("nada destacable en el contexto disponible");
  return { score, reasons };
}

function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.slice(0, 7).split("-").map(Number);
  const [ty, tm] = to.slice(0, 7).split("-").map(Number);
  return Math.max(0, (ty - fy) * 12 + (tm - fm));
}

// ---------------------------------------------------------------------------
// Permisos (§58, §60)
// ---------------------------------------------------------------------------

export function canManageAudits(roleCode: string): boolean {
  return roleCode === "admin" || roleCode === "quality" || roleCode === "consultant";
}

export function canReadAudits(roleCode: string): boolean {
  return roleCode.length > 0;
}

/** El informe y el cierre son actos de la EMPRESA sobre sí misma. */
export function canCloseAudits(roleCode: string): boolean {
  return roleCode === "admin" || roleCode === "quality";
}

/** §58 · Las notas de entrevista no las lee cualquiera. */
export const RESTRICTED_NOTES_NOTICE =
  "Una nota de entrevista puede contener lo que alguien dijo de su propio "
  + "trabajo. Marcarla como restringida la reserva a quien conduce el dominio y "
  + "al equipo auditor de esta auditoría.";

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

export function formatRange(from: string | null, to: string | null): string {
  if (!from && !to) return "Sin fechas";
  if (from && to && from === to) return formatDate(from);
  return `${formatDate(from)} → ${formatDate(to)}`;
}
