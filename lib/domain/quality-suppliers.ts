/**
 * Trazaloop · QUALITY-07 · Proveedores, criticidad, evaluación y reevaluación —
 * el vocabulario del dominio.
 *
 * LAS SEPARACIONES QUE SOSTIENEN TODO
 *
 *   IDENTIDAD ≠ ROL            ACME es una empresa; «proveedor» es un papel
 *   PROVEEDOR ≠ SEDE           Medellín y Bogotá no rinden igual
 *   PROVEEDOR ≠ CATEGORÍA      el mismo provee materia prima y transporte
 *   CRITICIDAD ≠ DESEMPEÑO     crítico y excelente es una combinación normal
 *   RELACIÓN ≠ APROBACIÓN      activo no es aprobado
 *   PUNTUACIÓN ≠ DECISIÓN      un 72 no aprueba a nadie
 *   SEÑAL ≠ EVALUACIÓN ≠ NC    un retraso no es una no conformidad
 *   REQUISITO DE HOY ≠ DE ENTONCES  exigir más en 2027 no incumple 2026
 *
 * Este archivo es PURO: no sabe de base de datos ni de sesión.
 *
 * LO QUE ESTE DOMINIO NO ES
 *
 * No es un ERP de compras (GP-01). Aquí no hay órdenes, ni precios, ni pagos,
 * ni contratos, ni artículos. Si algún día aparece una función que calcule un
 * importe, algo se rompió.
 */

// ---------------------------------------------------------------------------
// Identidad externa (GP-02, MDR-11)
// ---------------------------------------------------------------------------

export const EXTERNAL_PARTY_ROLES = [
  "supplier", "customer", "laboratory", "contractor",
  "consultant", "certification_body", "other",
] as const;
export type ExternalPartyRole = (typeof EXTERNAL_PARTY_ROLES)[number];

export const EXTERNAL_PARTY_ROLE_LABEL: Record<ExternalPartyRole, string> = {
  supplier: "Proveedor",
  customer: "Cliente",
  laboratory: "Laboratorio",
  contractor: "Contratista",
  consultant: "Consultor",
  certification_body: "Organismo de certificación",
  other: "Otro",
};

export const PARTY_STATUSES = ["active", "inactive", "retired"] as const;
export type PartyStatus = (typeof PARTY_STATUSES)[number];

export const PARTY_STATUS_LABEL: Record<PartyStatus, string> = {
  active: "Activa",
  inactive: "Inactiva",
  retired: "Retirada",
};

/**
 * Los módulos operativos que pueden compartir una identidad externa.
 *
 * Está aquí como dato porque es la lista que impide la duplicación: si mañana
 * un módulo nuevo tuviera su propia tabla de proveedores, esta constante
 * debería crecer, y no crecer es exactamente el defecto.
 */
export const SUPPLIER_SOURCE_MODULES = ["cpr", "textiles"] as const;
export type SupplierSourceModule = (typeof SUPPLIER_SOURCE_MODULES)[number];

export const SUPPLIER_SOURCE_LABEL: Record<SupplierSourceModule, string> = {
  cpr: "Trazaloop 6632 / PCR",
  textiles: "Trazaloop Textiles",
};

// ---------------------------------------------------------------------------
// Relación con Quality (GP-04)
// ---------------------------------------------------------------------------

export const RELATIONSHIP_STATUSES = ["prospect", "active", "inactive", "retired"] as const;
export type RelationshipStatus = (typeof RELATIONSHIP_STATUSES)[number];

export const RELATIONSHIP_STATUS_LABEL: Record<RelationshipStatus, string> = {
  prospect: "En evaluación previa",
  active: "Activo",
  inactive: "Inactivo",
  retired: "Retirado",
};

/**
 * GP-04 · Estado de la RELACIÓN y estado de APROBACIÓN son ejes distintos.
 *
 * Esta función existe para que la frase tenga un sitio en el código: recibe los
 * dos y devuelve la combinación en palabras. Un proveedor activo y sin aprobar
 * es normal —todavía no se ha evaluado—; uno inactivo con aprobación vigente
 * también —está homologado y no se le está comprando—.
 */
export function describeRelationshipAndApproval(
  relationship: RelationshipStatus,
  approvedScopes: number,
  totalScopes: number
): string {
  const rel = RELATIONSHIP_STATUS_LABEL[relationship];
  if (totalScopes === 0) return `${rel} · sin alcances declarados`;
  if (approvedScopes === 0) return `${rel} · ningún alcance aprobado`;
  if (approvedScopes === totalScopes) return `${rel} · todos sus alcances aprobados`;
  return `${rel} · ${approvedScopes} de ${totalScopes} alcances aprobados`;
}

// ---------------------------------------------------------------------------
// Alcance (GP-03)
// ---------------------------------------------------------------------------

/**
 * Cómo se lee un alcance en pantalla y en papel.
 *
 * Sin sede ni categoría es «el proveedor en su conjunto», que es lo que usa una
 * empresa con un solo sitio. La misma estructura sirve a esa y a la que tiene
 * tres plantas y ocho categorías, y por eso no hay dos modelos.
 */
export function describeScope(scope: {
  siteName?: string | null;
  categoryName?: string | null;
  label?: string | null;
}): string {
  if (scope.label) return scope.label;
  const partes = [scope.categoryName, scope.siteName].filter(Boolean);
  return partes.length > 0 ? partes.join(" · ") : "Alcance general";
}

// ---------------------------------------------------------------------------
// Aprobación (GP-07, GP-12, GP-19)
// ---------------------------------------------------------------------------

export const APPROVAL_DECISIONS = [
  "approved", "conditionally_approved", "rejected",
  "suspended", "reinstated", "withdrawn",
] as const;
export type ApprovalDecision = (typeof APPROVAL_DECISIONS)[number];

export const APPROVAL_DECISION_LABEL: Record<ApprovalDecision, string> = {
  approved: "Aprobado",
  conditionally_approved: "Aprobado con condiciones",
  rejected: "No aprobado",
  suspended: "Suspendido",
  reinstated: "Reactivado",
  withdrawn: "Retirado",
};

/** Qué decisiones dejan al alcance en condiciones de usarse. */
export const APPROVING_DECISIONS: readonly ApprovalDecision[] = [
  "approved", "conditionally_approved", "reinstated",
];

/**
 * GP-07 · La comprobación que da nombre al dominio.
 *
 * Devuelve SIEMPRE `false`. Existe para que quede escrito —y comprobado por una
 * prueba— que ninguna puntuación aprueba a nadie: no hay umbral, no hay regla,
 * no hay «≥ 80 → aprobado». La decisión la toma una persona, con fundamento.
 */
export function scoreApproves(_score: number | null): false {
  return false;
}

/**
 * §15 · Aprobado ¿para qué?
 *
 * Un booleano global destruye la pregunta. Esta función responde por alcance y
 * se niega a responder «sí» a secas.
 */
export function isApprovedForScope(
  status: { decision: ApprovalDecision | null; validUntil: string | null },
  today: string
): boolean {
  if (!status.decision) return false;
  if (!APPROVING_DECISIONS.includes(status.decision)) return false;
  return status.validUntil === null || status.validUntil >= today;
}

/** Una aprobación con fecha pasada no es una aprobación vigente, aunque nadie
 *  la haya tocado. Decir lo contrario sería dar por bueno algo que la propia
 *  empresa puso fecha de revisar. */
export function approvalExpired(
  status: { validUntil: string | null },
  today: string
): boolean {
  return status.validUntil !== null && status.validUntil < today;
}

// ---------------------------------------------------------------------------
// Requisitos (GP-06)
// ---------------------------------------------------------------------------

export const REQUIREMENT_KINDS = [
  "legal", "contractual", "technical", "documentary", "certification", "process", "other",
] as const;
export type RequirementKind = (typeof REQUIREMENT_KINDS)[number];

export const REQUIREMENT_KIND_LABEL: Record<RequirementKind, string> = {
  legal: "Legal",
  contractual: "Contractual",
  technical: "Técnico",
  documentary: "Documental",
  certification: "Certificación",
  process: "De proceso",
  other: "Otro",
};

export const REQUIREMENT_ENFORCEMENTS = ["informational", "required", "blocking"] as const;
export type RequirementEnforcement = (typeof REQUIREMENT_ENFORCEMENTS)[number];

/**
 * GP-06 · Los tres niveles, y por qué hacen falta los tres.
 *
 * Sin «informativo», todo lo que se quiere saber se convierte en una barrera y
 * la gente deja de registrarlo. Sin «bloqueante», no hay forma de decir «esto
 * no se negocia». Y «exigido» es el término medio real: se pide, se revisa, y
 * su ausencia se decide caso por caso.
 */
export const REQUIREMENT_ENFORCEMENT_LABEL: Record<RequirementEnforcement, string> = {
  informational: "Informativo",
  required: "Exigido",
  blocking: "Bloqueante",
};

export const REQUIREMENT_ENFORCEMENT_HINT: Record<RequirementEnforcement, string> = {
  informational: "Se quiere saber, pero no condiciona nada.",
  required: "Se exige. Su ausencia se decide caso por caso.",
  blocking: "Sin esto no se puede aprobar el alcance.",
};

// ---------------------------------------------------------------------------
// Evaluación (GP-15, GP-16, §18…§23)
// ---------------------------------------------------------------------------

export const EVALUATION_KINDS = ["selection", "periodic", "reevaluation", "extraordinary"] as const;
export type SupplierEvaluationKind = (typeof EVALUATION_KINDS)[number];

/**
 * GP-16 · Selección, evaluación y reevaluación son eventos DISTINTOS. Aquí se
 * distinguen por su clase, no por tres tablas gemelas: son el mismo hecho
 * —juzgar a un proveedor contra una metodología en una fecha— con propósitos
 * distintos.
 */
export const EVALUATION_KIND_LABEL: Record<SupplierEvaluationKind, string> = {
  selection: "Selección",
  periodic: "Evaluación periódica",
  reevaluation: "Reevaluación",
  extraordinary: "Reevaluación extraordinaria",
};

export const EVALUATION_STATUSES = ["draft", "in_progress", "closed", "cancelled"] as const;
export type SupplierEvaluationStatus = (typeof EVALUATION_STATUSES)[number];

export const EVALUATION_STATUS_LABEL: Record<SupplierEvaluationStatus, string> = {
  draft: "Borrador",
  in_progress: "En curso",
  closed: "Cerrada",
  cancelled: "Cancelada",
};

export const SCORING_RULES = ["weighted_average", "points"] as const;
export type ScoringRule = (typeof SCORING_RULES)[number];

export const SCORING_RULE_LABEL: Record<ScoringRule, string> = {
  weighted_average: "Promedio ponderado de lo puntuado",
  points: "Puntos obtenidos sobre puntos posibles",
};

export const CRITERION_METHODS = [
  "observation", "indicator", "document_review", "audit",
  "requirement_compliance", "operational_data", "other",
] as const;
export type CriterionMethod = (typeof CRITERION_METHODS)[number];

export const CRITERION_METHOD_LABEL: Record<CriterionMethod, string> = {
  observation: "Observación",
  indicator: "Indicador",
  document_review: "Revisión documental",
  audit: "Auditoría",
  requirement_compliance: "Cumplimiento de un requisito",
  operational_data: "Dato operacional",
  other: "Otro",
};

/**
 * §22/§23 · LAS CUATRO SITUACIONES DE UN CRITERIO, que no son la misma cosa.
 *
 * Convertir cualquiera de las tres últimas en un 0 castiga al proveedor por
 * algo que no hizo. Y colapsarlas en un único «sin dato» impide distinguir un
 * criterio que no venía al caso de uno que se olvidó evaluar.
 */
export const RESULT_OUTCOMES = ["scored", "not_applicable", "unavailable", "not_evaluated"] as const;
export type ResultOutcome = (typeof RESULT_OUTCOMES)[number];

export const RESULT_OUTCOME_LABEL: Record<ResultOutcome, string> = {
  scored: "Puntuado",
  not_applicable: "No aplica",
  unavailable: "Sin dato disponible",
  not_evaluated: "Sin evaluar",
};

export const RESULT_OUTCOME_HINT: Record<ResultOutcome, string> = {
  scored: "Se evaluó y tiene puntuación.",
  not_applicable: "El criterio no aplica a este alcance. No cuenta como cero.",
  unavailable: "Aplica, pero no se pudo obtener el dato. No cuenta como cero.",
  not_evaluated: "Aplica y se podía, pero nadie lo evaluó. No cuenta como cero.",
};

/** Solo lo PUNTUADO entra en el cálculo. Esta es la regla, en una función. */
export function countsTowardsScore(outcome: ResultOutcome): boolean {
  return outcome === "scored";
}

/**
 * El promedio ponderado, tal como lo calcula la base.
 *
 * Vive aquí además de en SQL porque una prueba pura tiene que poder demostrar
 * —sin levantar nada— que un «no aplica» no baja la nota. Si las dos alguna vez
 * discrepan, manda la base, y esta función es lo que hace visible la diferencia.
 */
export function weightedScore(
  results: readonly { outcome: ResultOutcome; points: number | null; weight: number; maxPoints: number }[]
): number | null {
  const scored = results.filter((r) => countsTowardsScore(r.outcome));
  if (scored.length === 0) return null;
  const pesoTotal = scored.reduce((acc, r) => acc + r.weight, 0);
  if (pesoTotal === 0) return null;
  const suma = scored.reduce(
    (acc, r) => acc + r.weight * (100 * (r.points ?? 0) / (r.maxPoints || 1)),
    0
  );
  return Math.round((suma / pesoTotal) * 1000) / 1000;
}

/** Cuántos criterios quedaron fuera del cálculo, y por qué. Sin esto, un 90
 *  sobre tres criterios de veinte parecería un 90. */
export function summarizeOutcomes(
  results: readonly { outcome: ResultOutcome }[]
): Record<ResultOutcome, number> {
  return {
    scored: results.filter((r) => r.outcome === "scored").length,
    not_applicable: results.filter((r) => r.outcome === "not_applicable").length,
    unavailable: results.filter((r) => r.outcome === "unavailable").length,
    not_evaluated: results.filter((r) => r.outcome === "not_evaluated").length,
  };
}

// ---------------------------------------------------------------------------
// Reevaluación (GP-10, GP-20, GP-25, §28, §29)
// ---------------------------------------------------------------------------

/**
 * §28 · La cadencia es CONFIGURABLE. Doce meses es el máximo por defecto de la
 * política aprobada, no una constante del producto: una empresa puede revisar
 * a sus proveedores críticos cada tres meses, y la metodología de criticidad
 * puede imponerlo.
 */
export const DEFAULT_REEVALUATION_MONTHS = 12;

export function nextReviewOn(lastEvaluatedOn: string, months: number): string {
  const d = new Date(`${lastEvaluatedOn}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

export function reevaluationOverdue(nextReview: string | null, today: string): boolean {
  return nextReview !== null && nextReview < today;
}

/** GP-25 · Motivos por los que una reevaluación puede adelantarse. */
export const EXTRAORDINARY_TRIGGERS = [
  "severe_incident", "deterioration", "certification_loss",
  "critical_document_expiry", "audit", "repeated_complaints", "material_change",
] as const;
export type ExtraordinaryTrigger = (typeof EXTRAORDINARY_TRIGGERS)[number];

export const EXTRAORDINARY_TRIGGER_LABEL: Record<ExtraordinaryTrigger, string> = {
  severe_incident: "Incidente grave",
  deterioration: "Deterioro del desempeño",
  certification_loss: "Pérdida de una certificación",
  critical_document_expiry: "Vencimiento de un documento crítico",
  audit: "Auditoría",
  repeated_complaints: "Quejas repetidas",
  material_change: "Cambio material en el suministro",
};

// ---------------------------------------------------------------------------
// Incidentes y señales (GP-21, GP-22, GP-26, §32)
// ---------------------------------------------------------------------------

export const INCIDENT_KINDS = [
  "delivery", "quality", "documentation", "service",
  "safety", "environment", "communication", "other",
] as const;
export type IncidentKind = (typeof INCIDENT_KINDS)[number];

export const INCIDENT_KIND_LABEL: Record<IncidentKind, string> = {
  delivery: "Entrega",
  quality: "Calidad",
  documentation: "Documentación",
  service: "Servicio",
  safety: "Seguridad",
  environment: "Ambiente",
  communication: "Comunicación",
  other: "Otro",
};

export const INCIDENT_SEVERITIES = ["minor", "moderate", "major", "critical"] as const;
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];

export const INCIDENT_SEVERITY_LABEL: Record<IncidentSeverity, string> = {
  minor: "Leve",
  moderate: "Moderado",
  major: "Grave",
  critical: "Crítico",
};

/**
 * GP-22/§32 · La frase, escrita una sola vez.
 *
 * Un incidente con un proveedor NO es una no conformidad. Puede llegar a serlo
 * si alguien abre un caso y lo clasifica así, que es el acto de QUALITY-04. El
 * sistema no da ese paso solo, y este texto acompaña al botón que lo ofrece.
 */
export const INCIDENT_IS_NOT_NC =
  "Registrar un incidente no abre una no conformidad. Si hace falta, se abre un caso del "
  + "sistema de gestión y es allí donde se clasifica.";

export const SUPPLIER_SIGNAL_KINDS = [
  "reevaluation_overdue", "approval_expired", "document_expired", "document_expiring",
  "evaluation_declined", "incident_streak", "critical_without_approval", "no_evaluation_yet",
] as const;
export type SupplierSignalKind = (typeof SUPPLIER_SIGNAL_KINDS)[number];

/**
 * §27 · La señal habla del VÍNCULO, no de una persona ni de una culpa. Y no
 * suspende, ni rechaza, ni abre nada: dice «mira esto».
 */
export const SUPPLIER_SIGNAL_LABEL: Record<SupplierSignalKind, string> = {
  reevaluation_overdue: "La reevaluación está vencida",
  approval_expired: "La aprobación de este alcance venció",
  document_expired: "Un documento del proveedor venció",
  document_expiring: "Un documento del proveedor está por vencer",
  evaluation_declined: "El resultado de la evaluación bajó respecto de la anterior",
  incident_streak: "Se acumulan incidentes en poco tiempo",
  critical_without_approval: "Alcance crítico sin aprobación vigente",
  no_evaluation_yet: "Todavía no se ha evaluado",
};

/** GP-18/§74 · Vencer NO es quedar rechazado ni suspendido. */
export const EXPIRY_IS_NOT_SUSPENSION =
  "Un documento vencido requiere revisión. No suspende ni rechaza al proveedor por sí solo: "
  + "cambiar su aprobación es una decisión aparte.";

// ---------------------------------------------------------------------------
// Deterioro (§31)
// ---------------------------------------------------------------------------

/**
 * §31 · La tendencia se MUESTRA; la evaluación anterior no se toca.
 *
 * Devuelve la comparación entre dos evaluaciones cerradas, o `null` cuando no
 * hay con qué comparar. Nunca modifica nada y nunca concluye nada sobre lo que
 * hay que hacer: eso lo decide una persona.
 */
export function describeTrend(
  current: { score: number | null; on: string } | null,
  previous: { score: number | null; on: string } | null
): { direction: "up" | "down" | "flat" | "unknown"; text: string } {
  if (!current || current.score === null) {
    return { direction: "unknown", text: "Sin evaluación cerrada." };
  }
  if (!previous || previous.score === null) {
    return { direction: "unknown", text: "Primera evaluación: todavía no hay con qué comparar." };
  }
  const delta = Math.round((current.score - previous.score) * 100) / 100;
  if (delta > 0) {
    return { direction: "up", text: `Subió ${delta} puntos respecto de la evaluación anterior.` };
  }
  if (delta < 0) {
    return {
      direction: "down",
      text: `Bajó ${Math.abs(delta)} puntos respecto de la evaluación anterior. `
        + "La evaluación anterior se conserva tal como se cerró.",
    };
  }
  return { direction: "flat", text: "Mismo resultado que la evaluación anterior." };
}

// ---------------------------------------------------------------------------
// Permisos (§48, GP-07)
// ---------------------------------------------------------------------------

/** Las mismas puertas que impone 0125, dichas en TypeScript para no ofrecer un
 *  botón que la base iba a rechazar. La autorización es RLS; esto es cortesía. */
export function canManageSuppliers(roleCode: string): boolean {
  return roleCode === "admin" || roleCode === "quality" || roleCode === "consultant";
}

/** GP-07 · Homologar es responsabilidad de la empresa: el consultor queda fuera. */
export function canDecideSupplierApproval(roleCode: string): boolean {
  return roleCode === "admin" || roleCode === "quality";
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}
