/**
 * Trazaloop · QUALITY-12.3B2 · Dominio PURO de partes interesadas.
 *
 * Sin base de datos y sin servidor: vocabulario, reglas y cálculos que la capa
 * de lectura, la de escritura y las pruebas comparten. Si una regla vive aquí,
 * hay UNA regla; si vive en tres pantallas, hay tres.
 */

// ===========================================================================
// VOCABULARIO · el mismo que congela 0149
// ===========================================================================

export const SUBJECT_KINDS = ["external_party", "group"] as const;
export type SubjectKind = (typeof SUBJECT_KINDS)[number];

export const RELEVANCE_STATES = ["relevant", "not_relevant", "under_review"] as const;
export type RelevanceState = (typeof RELEVANCE_STATES)[number];

export const RELEVANCE_LABEL: Record<RelevanceState, string> = {
  relevant: "Pertinente",
  not_relevant: "No pertinente",
  under_review: "En evaluación",
};

export const ENTRY_KINDS = ["need", "expectation", "requirement"] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

/**
 * Tres cosas, no tres palabras para lo mismo. La etiqueta lo dice para que
 * nadie tenga que acordarse de la diferencia leyendo una lista.
 */
export const ENTRY_KIND_LABEL: Record<EntryKind, string> = {
  need: "Necesidad",
  expectation: "Expectativa",
  requirement: "Requisito",
};

export const REQUIREMENT_KINDS = [
  "legal", "regulatory", "contractual", "standard", "internal_commitment", "other",
] as const;
export type RequirementKind = (typeof REQUIREMENT_KINDS)[number];

export const REQUIREMENT_KIND_LABEL: Record<RequirementKind, string> = {
  legal: "Legal",
  regulatory: "Reglamentario",
  contractual: "Contractual",
  standard: "Norma aplicable",
  internal_commitment: "Compromiso interno",
  other: "Otro",
};

/** Los cuatro que, sin una fuente citable, son una afirmación y no un requisito. */
export const REQUIREMENT_KINDS_NEEDING_EVIDENCE: readonly RequirementKind[] =
  ["legal", "regulatory", "contractual", "standard"];

export const LINK_KINDS = ["addressed_by", "affects", "monitored_by"] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

export const LINK_KIND_LABEL: Record<LinkKind, string> = {
  addressed_by: "Lo gestiona",
  affects: "Le afecta",
  monitored_by: "Lo vigila",
};

export const MONITORING_METHODS = [
  "survey", "indicator", "periodic_evaluation", "meeting", "complaint",
  "sla", "audit", "feedback", "regulatory_compliance", "document", "other",
] as const;
export type MonitoringMethod = (typeof MONITORING_METHODS)[number];

export const MONITORING_METHOD_LABEL: Record<MonitoringMethod, string> = {
  survey: "Encuesta",
  indicator: "Indicador",
  periodic_evaluation: "Evaluación periódica",
  meeting: "Reunión",
  complaint: "Quejas y reclamos",
  sla: "Acuerdo de nivel de servicio",
  audit: "Auditoría",
  feedback: "Retroalimentación",
  regulatory_compliance: "Cumplimiento regulatorio",
  document: "Evidencia documental",
  other: "Otro",
};

export const STRATEGY_STATUSES = ["draft", "active", "superseded", "cancelled"] as const;
export type StrategyStatus = (typeof STRATEGY_STATUSES)[number];

export const REVIEW_VERDICTS = ["no_changes", "changes_applied", "escalated"] as const;
export type ReviewVerdict = (typeof REVIEW_VERDICTS)[number];

export const REVIEW_VERDICT_LABEL: Record<ReviewVerdict, string> = {
  no_changes: "Revisado sin cambios",
  changes_applied: "Revisado con cambios",
  escalated: "Escalado",
};

// ===========================================================================
// ERRORES DE DOMINIO
// ===========================================================================

/**
 * Un vocabulario cerrado de fallos, para que la capa de arriba no tenga que
 * leer mensajes de PostgreSQL. Los códigos son estables; el texto puede
 * cambiar sin romper a nadie.
 */
export const DOMAIN_ERRORS = {
  stakeholder_not_found: "Esa parte interesada no existe o no es de tu empresa.",
  assessment_not_found: "Ese análisis no existe o no es de tu empresa.",
  assessment_superseded: "Ese análisis ya fue sucedido. Trabaja sobre el vigente.",
  historical_record_immutable:
    "Un registro histórico no se reescribe: su contenido es la respuesta a «qué decía entonces».",
  cross_tenant_reference: "Ese registro pertenece a otra empresa.",
  relevance_reason_required:
    "Para declarar una parte o un requisito como no pertinente hay que decir por qué.",
  requirement_subtype_required: "Un requisito tiene que decir de qué tipo es.",
  requirement_subtype_not_allowed:
    "Una necesidad o una expectativa no llevan tipo de requisito: todavía no obligan a nada.",
  conversion_origin_invalid:
    "Un requisito solo se deriva de una necesidad o de una expectativa, nunca de otro requisito.",
  conversion_reason_required: "Convertir sin decir por qué no es convertir: es reetiquetar.",
  requirement_process_mismatch: "Ese proceso no pertenece a tu empresa.",
  strategy_requirement_mismatch:
    "Una estrategia solo puede atender requisitos de la misma parte interesada.",
  strategy_owner_invalid: "El cargo responsable no pertenece a tu empresa.",
  duplicate_current: "Ya existe un registro vigente equivalente.",
  score_needs_method:
    "Una puntuación sin metodología ni justificación no se puede defender: añade en qué se apoya.",
  permission_denied: "Tu rol no permite administrar partes interesadas.",
  review_target_required:
    "Una revisión tiene que revisar algo: el análisis, la estrategia o los dos.",
} as const;

export type DomainErrorCode = keyof typeof DOMAIN_ERRORS;

export type DomainResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: DomainErrorCode; message: string };

export function fail<T>(code: DomainErrorCode): DomainResult<T> {
  return { ok: false, code, message: DOMAIN_ERRORS[code] };
}
export function done<T>(data: T): DomainResult<T> {
  return { ok: true, data };
}

/**
 * Traduce un fallo de PostgreSQL a un código de dominio.
 *
 * Existe para que un mensaje de SQL crudo no llegue nunca a una pantalla. Lo
 * que no se reconoce NO se disfraza: se devuelve como desconocido y quien
 * llame decide, en vez de inventar una causa.
 */
export function mapDbError(error: { message?: string; code?: string } | null): DomainErrorCode | null {
  const m = (error?.message ?? "").toLowerCase();
  if (!m) return null;
  if (m.includes("relevance_rationale")) return "relevance_reason_required";
  if (m.includes("subtype_check")) return "requirement_subtype_required";
  if (m.includes("conversion_check")) return "conversion_reason_required";
  if (m.includes("necesidad o de una expectativa")) return "conversion_origin_invalid";
  if (m.includes("mismo analisis") || m.includes("mismo análisis")) return "strategy_requirement_mismatch";
  if (m.includes("ya fue sucedido") || m.includes("ya sucedido no se reescribe")) return "assessment_superseded";
  if (m.includes("score_needs_method")) return "score_needs_method";
  if (m.includes("current_party_uniq") || m.includes("current_group_uniq")
      || m.includes("current_uniq")) return "duplicate_current";
  if (m.includes("no permite")) return "permission_denied";
  if (m.includes("foreign key") || m.includes("violates foreign key")) return "cross_tenant_reference";
  return null;
}

// ===========================================================================
// TIEMPO · la primitiva `as_of`
// ===========================================================================

/**
 * ¿Estaba vigente esta fila en esta fecha?
 *
 * `effective_from` es INCLUSIVO y `effective_to` EXCLUSIVO: una fila que se
 * cierra el 30 de junio deja de estar vigente ese mismo día, y su sucesora
 * empieza el 30. Con las dos inclusivas habría un día con dos vigentes, y las
 * preguntas históricas devolverían dos respuestas para la misma fecha.
 *
 * `created_at <= fecha` NO sirve como sustituto: diría que una fila creada hoy
 * con vigencia desde mañana ya estaba vigente ayer.
 */
export function isEffectiveOn(
  row: { effective_from: string; effective_to: string | null },
  onDate: string
): boolean {
  if (row.effective_from > onDate) return false;
  return row.effective_to === null || row.effective_to > onDate;
}

/** Filtra una colección a lo que estaba vigente en una fecha. */
export function effectiveOn<T extends { effective_from: string; effective_to: string | null }>(
  rows: readonly T[],
  onDate: string
): T[] {
  return rows.filter((r) => isEffectiveOn(r, onDate));
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// ===========================================================================
// ESTADO DE REVISIÓN
// ===========================================================================

export const REVIEW_STATES = ["never_reviewed", "up_to_date", "due_soon", "overdue"] as const;
export type ReviewState = (typeof REVIEW_STATES)[number];

export const REVIEW_STATE_LABEL: Record<ReviewState, string> = {
  never_reviewed: "Sin revisar",
  up_to_date: "Al día",
  due_soon: "Próxima a revisión",
  overdue: "Revisión vencida",
};

/** Cuántos días antes del vencimiento se avisa. Ni una cadencia ni un umbral
 *  inventados: solo la ventana de aviso, que es presentación. */
export const REVIEW_DUE_SOON_DAYS = 30;

/**
 * El estado de revisión, calculado en UN solo sitio.
 *
 * DOS REGLAS QUE NO SE NEGOCIAN
 *
 * 1 · Sin cadencia y sin fecha prevista NO se declara vencido. La 4.2 no dice
 *     «anualmente», y la plataforma tampoco: una organización que revisa
 *     cuando algo cambia no está incumpliendo nada, y pintarla en rojo sería
 *     inventarse un requisito.
 *
 * 2 · «Nunca revisado» no es «vencido». Son cosas distintas y se dicen
 *     distinto: lo primero describe, lo segundo acusa.
 */
export function reviewState(input: {
  lastReviewedOn: string | null;
  nextReviewOn: string | null;
  cadenceMonths: number | null;
  onDate?: string;
}): ReviewState {
  const hoy = input.onDate ?? today();
  if (input.nextReviewOn === null) {
    if (input.lastReviewedOn === null) return "never_reviewed";
    // Se revisó, y nadie fijó cuándo toca la próxima. Eso no es un
    // incumplimiento: es que no hay cadencia, y sin cadencia no hay nada que
    // vencer. La cadencia no se usa para inventar una fecha aquí: quien quiera
    // una la calcula con `nextReviewFrom` y la guarda.
    return "up_to_date";
  }
  if (input.nextReviewOn <= hoy) return "overdue";
  const aviso = new Date(hoy);
  aviso.setDate(aviso.getDate() + REVIEW_DUE_SOON_DAYS);
  return input.nextReviewOn <= aviso.toISOString().slice(0, 10) ? "due_soon" : "up_to_date";
}

/** La próxima fecha de revisión que se deriva de una cadencia. Sin cadencia,
 *  no se inventa ninguna. */
export function nextReviewFrom(reviewedOn: string, cadenceMonths: number | null): string | null {
  if (cadenceMonths === null) return null;
  const d = new Date(`${reviewedOn}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + cadenceMonths);
  return d.toISOString().slice(0, 10);
}

// ===========================================================================
// PRIORIZACIÓN
// ===========================================================================

export const PRIORITY_LABELS = ["high", "medium", "low"] as const;
export type PriorityLabel = (typeof PRIORITY_LABELS)[number];

export const PRIORITY_LABEL_TEXT: Record<PriorityLabel, string> = {
  high: "Alta",
  medium: "Media",
  low: "Baja",
};

/**
 * La plantilla SUGERIDA. No es obligatoria y no es la única: la organización
 * puede cambiarla o no usar ninguna.
 */
export const SUGGESTED_METHOD = {
  code: "influence_x_impact",
  label: "Influencia × impacto",
  axes: {
    influence:
      "Capacidad de la parte para afectar a la empresa, a su sistema de gestión " +
      "o al logro de los resultados previstos.",
    impact:
      "Consecuencia potencial para la empresa de no atender sus requisitos pertinentes.",
  },
} as const;

export type PriorityView =
  | { kind: "none" }
  | { kind: "qualitative"; label: PriorityLabel; text: string; rationale: string | null }
  | { kind: "scored"; score: number; method: string; text: string };

/**
 * Cómo se presenta una prioridad.
 *
 * NUNCA devuelve un número solo. Si hay puntuación, va con la metodología en
 * la que se apoya; si no la hubiera —la base lo impide, pero esto es la
 * segunda barrera— se degrada a «sin prioridad» en vez de enseñar un 7,4 que
 * nadie puede defender.
 */
export function priorityView(input: {
  priorityLabel: string | null;
  priorityScore: number | null;
  priorityMethodNote: string | null;
}): PriorityView {
  if (input.priorityScore !== null) {
    const metodo = (input.priorityMethodNote ?? "").trim();
    if (metodo.length === 0) return { kind: "none" };
    return {
      kind: "scored",
      score: input.priorityScore,
      method: metodo,
      text: `${input.priorityScore} · ${metodo}`,
    };
  }
  if (input.priorityLabel !== null && (PRIORITY_LABELS as readonly string[]).includes(input.priorityLabel)) {
    const l = input.priorityLabel as PriorityLabel;
    return { kind: "qualitative", label: l, text: PRIORITY_LABEL_TEXT[l], rationale: null };
  }
  return { kind: "none" };
}

/**
 * La prioridad NO decide la pertinencia.
 *
 * Existe como función para poder probarlo: una parte de prioridad baja puede
 * ser perfectamente pertinente, y una de prioridad alta puede haber dejado de
 * serlo. Confundirlas convertiría la 4.2 en una hoja de cálculo.
 */
export function relevanceFromPriority(): never {
  throw new Error(
    "La pertinencia no se deriva de la prioridad: es una decisión con justificación."
  );
}

// ===========================================================================
// QUIÉN PUEDE
// ---------------------------------------------------------------------------
// Espejo EXACTO de `quality_manages_interested_parties(uuid)` de 0149. No es
// la autoridad —la autoridad es la RLS, y sigue estándolo si esto se
// equivoca—, es lo que permite que la acción diga «tu rol no permite» en vez
// de dejar que la base devuelva un 42501 sin explicación.
//
// Si los dos se separan, el que manda es el de la base. Por eso hay una
// prueba que compara las dos listas.
// ===========================================================================

export const INTERESTED_PARTIES_MANAGER_ROLES = ["admin", "quality", "consultant"] as const;

export function canManageInterestedParties(roleCode: string | null | undefined): boolean {
  return (INTERESTED_PARTIES_MANAGER_ROLES as readonly string[]).includes(roleCode ?? "");
}
