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

// ===========================================================================
// QUALITY-12.3B3A · EL VOCABULARIO QUE VE UNA PERSONA
// ---------------------------------------------------------------------------
// Vive aquí y no en los componentes por la misma razón que el resto de este
// archivo: si cada pantalla escribe sus propias etiquetas, dentro de tres
// sprints la misma cosa se llama de dos maneras según por dónde se entre.
// React consume; no decide.
// ===========================================================================

export const SUBJECT_KIND_LABEL: Record<SubjectKind, string> = {
  external_party: "Entidad externa",
  group: "Colectivo",
};

export const STRATEGY_STATUS_LABEL: Record<StrategyStatus, string> = {
  draft: "Borrador",
  active: "Vigente",
  superseded: "Sucedida",
  cancelled: "Cerrada",
};

/**
 * El alcance de una estrategia, deducido de CUÁNTOS requisitos atiende.
 *
 * No hay un campo «tipo de estrategia» y no debe haberlo: sería un dato que
 * puede contradecir a los vínculos reales. Cero enlaces es una estrategia
 * general para la parte; uno es específica; varios, multi-requisito. La
 * pregunta se responde contando, no consultando una etiqueta que alguien pudo
 * olvidar cambiar.
 */
export type StrategyScope = "general" | "specific" | "multi";

export function strategyScope(requirementCount: number): StrategyScope {
  if (requirementCount <= 0) return "general";
  return requirementCount === 1 ? "specific" : "multi";
}

export const STRATEGY_SCOPE_LABEL: Record<StrategyScope, string> = {
  general: "General para esta parte",
  specific: "Atiende un requisito",
  multi: "Atiende varios requisitos",
};

/**
 * Lo que se puede relacionar como contexto periférico, dicho en lenguaje de
 * producto.
 *
 * A la izquierda lo que guarda `work_references`; a la derecha lo que lee una
 * persona. En pantalla nunca aparece `ref_kind` ni `owner_kind`: son nombres
 * de columna, no palabras de nadie.
 *
 * Las dos relaciones centrales —requisito→proceso y estrategia→requisito— NO
 * están en esta lista y no pueden estarlo: tienen tabla propia porque tienen
 * vigencia, y la base rechaza el intento desde 0150.
 */
export const PERIPHERAL_REF_KINDS = [
  "quality_indicator", "quality_objective", "quality_risk", "quality_opportunity",
  "work_case", "work_action", "trazadoc_document", "quality_survey_campaign",
  "quality_supplier_evaluation", "quality_customer_feedback",
] as const;
export type PeripheralRefKind = (typeof PERIPHERAL_REF_KINDS)[number];

export const PERIPHERAL_REF_LABEL: Record<PeripheralRefKind, string> = {
  quality_indicator: "Indicador",
  quality_objective: "Objetivo",
  quality_risk: "Riesgo",
  quality_opportunity: "Oportunidad",
  work_case: "Caso",
  work_action: "Acción",
  trazadoc_document: "Documento",
  quality_survey_campaign: "Campaña de escucha",
  quality_supplier_evaluation: "Evaluación de proveedor",
  quality_customer_feedback: "Retroalimentación de cliente",
};

export const RELATION_LABEL: Record<"origin" | "evidence" | "related", string> = {
  origin: "De aquí nació",
  evidence: "Lo respalda",
  related: "Relacionado",
};

/** Las dos parejas que la base rechaza. Existe para que una prueba compruebe
 *  que la interfaz tampoco las ofrece. */
export const CORE_RELATION_PAIRS = [
  { ownerKind: "stakeholder_strategy", refKind: "quality_stakeholder_requirement" },
  { ownerKind: "stakeholder_requirement", refKind: "quality_process" },
  { ownerKind: "stakeholder_requirement", refKind: "quality_process_revision" },
] as const;

/**
 * ¿Se puede tocar lo que se está mirando?
 *
 * Una sola función para las dos condiciones que apagan los botones: no tener
 * permiso, y estar mirando el pasado. Repartirlas por los componentes acabaría
 * con una pantalla que respeta el modo histórico y otra que no.
 */
export function canMutate(input: { canManage: boolean; asOf?: string | null }): boolean {
  return input.canManage && !input.asOf;
}

/** El aviso del modo histórico, escrito una vez. */
export function historicalNotice(asOf: string): string {
  return `Estás viendo el estado del ${asOf}. Es una vista de solo lectura: `
    + "nada de lo que aparece aquí se puede modificar.";
}

// ===========================================================================
// AYUDA CONTEXTUAL · el botón «i», con contenido mínimo
// ---------------------------------------------------------------------------
// Reutiliza el componente de ayuda que ya existe, y NO la infraestructura de
// guías administradas de TrazaDocs: aquel contenido lo escribe la plataforma,
// se guarda en la base y está sujeto a la regla comercial de Demo. Esto son
// textos de producto, escritos aquí, iguales para todo el mundo.
//
// La distinción importa porque decide quién los ve: una guía administrada es
// parte de lo que se paga; explicar qué es una expectativa, no.
//
// El endurecimiento global de la ayuda —ejemplos, respaldo normativo y
// tutoriales en todos los botones «i»— es un sprint transversal posterior.
// Esto es el mínimo para que la pantalla se entienda sola.
// ===========================================================================

export const INTERESTED_PARTIES_HELP = {
  overview:
    "Una parte interesada es quien puede afectar al sistema de gestión o verse afectado por "
    + "él: clientes, personal, entes reguladores, proveedores, la comunidad del entorno.\n\n"
    + "Aquí se registran tres cosas y conviene no mezclarlas:\n"
    + "· si es PERTINENTE para el sistema de gestión, y por qué;\n"
    + "· qué NECESITA, qué ESPERA y qué OBLIGA;\n"
    + "· qué hace la empresa al respecto, y cada cuánto lo vuelve a mirar.\n\n"
    + "Priorizar es opcional. Y la prioridad no decide la pertinencia: una parte de prioridad "
    + "baja puede ser perfectamente pertinente.",
  entries:
    "NECESIDAD es lo que la parte requiere para funcionar. EXPECTATIVA es lo que espera aunque "
    + "nadie se lo haya prometido. REQUISITO es lo único que obliga: por ley, por contrato, por "
    + "una norma o porque la empresa se comprometió.\n\n"
    + "Convertir una necesidad en requisito no la borra ni la reetiqueta: crea un requisito que "
    + "apunta a ella y guarda por qué pasó a obligar. Dentro de un año esa es la diferencia "
    + "entre saber de dónde salió una obligación y suponerlo.",
  strategies:
    "Una estrategia dice qué hace la empresa con esta parte interesada. Puede ser general, o "
    + "atender requisitos concretos: lo que se guarda son los vínculos, así que el alcance se "
    + "cuenta y nunca contradice a la realidad.\n\n"
    + "El responsable es un CARGO, no una persona. Y la cadencia de revisión la decide la "
    + "empresa: sin cadencia y sin fecha prevista, nada se declara vencido.",
  history:
    "Un análisis no se edita: se sustituye. El anterior se conserva entero con su fecha y su "
    + "justificación, y el nuevo pasa a regir.\n\n"
    + "«Ver estado en fecha» reconstruye qué regía ese día —el análisis, sus requisitos y sus "
    + "estrategias— en modo de solo lectura. Es la pregunta que hace una auditoría.",
} as const;

export type InterestedPartiesHelpKey = keyof typeof INTERESTED_PARTIES_HELP;

/** El hint ya resuelto, con la forma que espera el componente compartido. Sin
 *  puerta comercial: esto no es contenido administrado. */
export function interestedPartiesHint(
  key: InterestedPartiesHelpKey
): { restricted: false; title: null; text: string } {
  return { restricted: false, title: null, text: INTERESTED_PARTIES_HELP[key] };
}
