/**
 * Trazaloop · QUALITY-04 · Casos y acciones — el vocabulario del dominio.
 *
 * LAS SEPARACIONES QUE SOSTIENEN TODO
 *
 *   CASO ≠ HALLAZGO ≠ NO CONFORMIDAD ≠ CORRECCIÓN ≠ ACCIÓN CORRECTIVA
 *        ≠ ACCIÓN DE MEJORA ≠ TAREA
 *
 * Y la que más se incumple en los sistemas de calidad reales:
 *
 *   COMPLETADA ≠ CERRADA ≠ EFICAZ   (AC-13)
 *
 * Este archivo es PURO: no sabe de base de datos ni de sesión. Traduce el
 * dominio al español y responde preguntas que no dependen de nadie. Quien
 * DECIDE es la base, en las RPC de 0121; aquí solo se nombra y se explica.
 */

// ---------------------------------------------------------------------------
// El caso
// ---------------------------------------------------------------------------

/** Especialización semántica del contenedor común (AC-02). */
export const CASE_TYPES = [
  "issue", "audit_finding", "complaint", "supplier_incident",
  "nonconforming_output", "deviation", "improvement",
] as const;
export type CaseType = (typeof CASE_TYPES)[number];

export const CASE_TYPE_LABEL: Record<CaseType, string> = {
  issue: "Situación detectada",
  audit_finding: "Hallazgo de auditoría",
  complaint: "Queja o reclamo",
  supplier_incident: "Incidente con proveedor",
  nonconforming_output: "Salida no conforme",
  deviation: "Desviación",
  improvement: "Mejora",
};

/** Los que esta entrega deja elegir. El resto vive en el catálogo para que los
 *  dominios futuros no tengan que migrar la columna. */
export const SELECTABLE_CASE_TYPES: CaseType[] = ["issue", "nonconforming_output", "deviation", "improvement"];

export const CASE_ORIGINS = [
  "manual", "indicator", "document", "process",
  "audit", "customer", "supplier", "risk", "management_review", "other",
] as const;
export type CaseOrigin = (typeof CASE_ORIGINS)[number];

export const CASE_ORIGIN_LABEL: Record<CaseOrigin, string> = {
  manual: "Registrado a mano",
  indicator: "Un indicador",
  document: "Un documento",
  process: "Un proceso",
  audit: "Una auditoría",
  customer: "Un cliente",
  supplier: "Un proveedor",
  risk: "Un riesgo",
  management_review: "La revisión por la dirección",
  other: "Otro",
};

/**
 * CLASIFICACIÓN FORMAL. `pending` no es un limbo administrativo: es la
 * afirmación de que **todavía nadie ha decidido**, y es importante que se vea.
 * Un sistema que clasifica solo convierte cada señal en no conformidad y acaba
 * devaluando las que sí lo son (AC-04).
 */
export const CLASSIFICATIONS = [
  "pending", "nonconformity", "observation", "improvement_opportunity", "not_applicable",
] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];

export const CLASSIFICATION_LABEL: Record<Classification, string> = {
  pending: "Sin evaluar",
  nonconformity: "No conformidad",
  observation: "Observación",
  improvement_opportunity: "Oportunidad de mejora",
  not_applicable: "No aplica",
};

export const CLASSIFICATION_HELP: Record<Classification, string> = {
  pending: "Todavía nadie ha decidido si esto es una no conformidad.",
  nonconformity: "Se incumple un requisito. Exige corrección y análisis de causa.",
  observation: "No incumple un requisito, pero conviene dejarlo registrado.",
  improvement_opportunity: "Nada está mal; algo puede estar mejor.",
  not_applicable: "Se evaluó y no procede tratarlo como caso.",
};

/** Las que un evaluador puede elegir: «sin evaluar» no se elige, se deja de ser. */
export const DECIDABLE_CLASSIFICATIONS: Classification[] =
  ["nonconformity", "observation", "improvement_opportunity", "not_applicable"];

/** Estado de FLUJO. Es administrativo y no dice si hay no conformidad —la misma
 *  separación que QUALITY-03 impuso entre estado y desempeño. */
export const CASE_STATUSES = [
  "draft", "open", "in_analysis", "in_action", "pending_effectiveness", "closed",
] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const CASE_STATUS_LABEL: Record<CaseStatus, string> = {
  draft: "Borrador",
  open: "Abierto",
  in_analysis: "En análisis",
  in_action: "Con acciones en curso",
  pending_effectiveness: "Esperando verificación de eficacia",
  closed: "Cerrado",
};

export const PRIORITIES = ["low", "normal", "high", "critical"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABEL: Record<Priority, string> = {
  low: "Baja", normal: "Normal", high: "Alta", critical: "Crítica",
};

// ---------------------------------------------------------------------------
// Las acciones
// ---------------------------------------------------------------------------

/**
 * Los cuatro tipos, y lo que de verdad los separa (AC-05, AC-06):
 *
 *   contención  · detener el daño AHORA
 *   corrección  · arreglar lo que se rompió
 *   correctiva  · impedir que vuelva a pasar
 *   mejora      · nada está mal, algo puede estar mejor
 *
 * Confundir corrección con acción correctiva es el error clásico: se arregla el
 * documento vencido, se cierra la no conformidad, y seis meses después vuelve a
 * vencerse porque nadie tocó el control que lo permitió.
 */
export const ACTION_KINDS = ["containment", "correction", "corrective", "improvement"] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

export const ACTION_KIND_LABEL: Record<ActionKind, string> = {
  containment: "Contención",
  correction: "Corrección",
  corrective: "Acción correctiva",
  improvement: "Acción de mejora",
};

export const ACTION_KIND_HELP: Record<ActionKind, string> = {
  containment: "Detiene el daño ahora mismo, sin resolver la causa.",
  correction: "Arregla lo que se rompió. No impide que vuelva a pasar.",
  corrective: "Actúa sobre la causa para que no se repita.",
  improvement: "Mejora algo que no estaba incumpliendo nada.",
};

export const ACTION_STATUSES = ["planned", "in_progress", "completed", "cancelled"] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];
export const ACTION_STATUS_LABEL: Record<ActionStatus, string> = {
  planned: "Planificada", in_progress: "En curso", completed: "Completada", cancelled: "Cancelada",
};

export const EFFECTIVENESS = ["not_required", "pending", "effective", "not_effective"] as const;
export type Effectiveness = (typeof EFFECTIVENESS)[number];
export const EFFECTIVENESS_LABEL: Record<Effectiveness, string> = {
  not_required: "No requiere verificación",
  pending: "Eficacia pendiente",
  effective: "Eficaz",
  not_effective: "No eficaz",
};

/**
 * El estado REAL de una acción, que no es su columna `status`.
 *
 * «Completada» a secas induce a pensar que el asunto terminó. Esta función
 * junta las dos dimensiones para que la pantalla nunca diga «hecho» cuando
 * todavía falta comprobar si sirvió.
 */
export function actionStanding(a: { status: ActionStatus; effectiveness: Effectiveness }): {
  label: string; tone: "neutral" | "good" | "warn" | "bad"; done: boolean;
} {
  if (a.status === "cancelled") return { label: "Cancelada", tone: "neutral", done: true };
  if (a.status !== "completed") {
    return { label: ACTION_STATUS_LABEL[a.status], tone: "neutral", done: false };
  }
  switch (a.effectiveness) {
    case "not_required": return { label: "Completada", tone: "good", done: true };
    case "pending":      return { label: "Completada · falta verificar si sirvió", tone: "warn", done: false };
    case "effective":    return { label: "Completada y eficaz", tone: "good", done: true };
    case "not_effective":return { label: "Completada, pero NO eficaz", tone: "bad", done: false };
  }
}

/** ¿Está vencida? Solo lo está lo que aún no se hizo. */
export function isOverdue(a: { status: ActionStatus; dueOn: string | null }, today: string): boolean {
  if (a.status === "completed" || a.status === "cancelled") return false;
  return a.dueOn !== null && a.dueOn < today;
}

/** «Vence en 3 días», «venció hace 12 días». El signo importa más que el número. */
export function describeDue(dueOn: string | null, today: string): string | null {
  if (dueOn === null) return null;
  const days = Math.round(
    (Date.parse(`${dueOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000
  );
  if (days === 0) return "Vence hoy";
  if (days > 0) return `Vence en ${days} ${days === 1 ? "día" : "días"}`;
  const late = Math.abs(days);
  return `Venció hace ${late} ${late === 1 ? "día" : "días"}`;
}

// ---------------------------------------------------------------------------
// El cierre
// ---------------------------------------------------------------------------

export type ClosureEligibility = { canClose: boolean; missing: string[]; reason: string };

/** Traduce el dictamen de la base. Ante cualquier forma inesperada: no se cierra. */
export function parseClosure(raw: unknown): ClosureEligibility {
  const safe: ClosureEligibility = {
    canClose: false, missing: [],
    reason: "No fue posible comprobar si este caso puede cerrarse.",
  };
  if (raw === null || typeof raw !== "object") return safe;
  const o = raw as Record<string, unknown>;
  return {
    canClose: o.can_close === true,
    missing: Array.isArray(o.missing) ? o.missing.filter((m): m is string => typeof m === "string") : [],
    reason: typeof o.reason === "string" ? o.reason : safe.reason,
  };
}

// ---------------------------------------------------------------------------
// Los avisos previos a cruzar una frontera histórica
// ---------------------------------------------------------------------------

/**
 * Se avisa solo cuando es verdad — la misma regla de QUALITY-03.1. Un modal
 * que anuncia «esto no podrá borrarse» al crear un borrador enseña a cerrar los
 * avisos sin leerlos, y entonces el que sí importaba tampoco se lee.
 */
export const CASE_THRESHOLD = {
  classify:
    "Esta decisión queda en el historial del caso y no podrá modificarse. Si más adelante la conclusión cambia, se registrará una decisión nueva.",
  approve_cause:
    "Al aprobar la causa, queda fija: es la que fundamenta el plan de acciones. Si después se concluye otra cosa, se registra un análisis nuevo.",
  complete_action:
    "Completar la acción no significa que haya funcionado. Si la acción exige verificación, quedará pendiente de comprobar su eficacia.",
  verify_effectiveness:
    "El resultado de la verificación queda en el historial y no se sobrescribe. Si la conclusión cambia, se registra otra verificación.",
  close_case:
    "Cerrar deja el caso consultable pero ya no editable. Para retomarlo habría que reabrirlo formalmente, con motivo.",
} as const;

// ---------------------------------------------------------------------------
// Permisos
// ---------------------------------------------------------------------------

const MANAGE = ["admin", "quality", "consultant"];
const GOVERN = ["admin", "quality"];

/** Registrar casos, hallazgos y acciones: trabajo operativo. */
export function canManageCases(role: string | null | undefined): boolean {
  return !!role && MANAGE.includes(role);
}
/** Clasificar, aprobar causas, verificar eficacia y cerrar: gobierno. */
export function canGovernCases(role: string | null | undefined): boolean {
  return !!role && GOVERN.includes(role);
}
/** Reabrir un caso cerrado: solo la administración. */
export function canReopenCase(role: string | null | undefined): boolean {
  return role === "admin";
}

// ---------------------------------------------------------------------------
// El histórico legible
// ---------------------------------------------------------------------------

export const DECISION_KINDS = [
  "case_opened", "classification", "correction_needed", "cause_approved",
  "action_planned", "action_completed", "effectiveness", "closure", "reopen", "concession",
] as const;
export type DecisionKind = (typeof DECISION_KINDS)[number];

/** Cómo se cuenta cada hecho en la línea de tiempo, en español y en pasado. */
export function describeDecision(kind: DecisionKind, outcome: string | null): string {
  switch (kind) {
    case "case_opened": return "Caso abierto";
    case "classification":
      return outcome && isClassification(outcome)
        ? `Evaluado como ${CLASSIFICATION_LABEL[outcome].toLowerCase()}`
        : "Caso evaluado";
    case "correction_needed": return "Se decidió sobre la necesidad de corrección";
    case "cause_approved": return "Causa raíz aprobada";
    case "action_planned": return "Acción planificada";
    case "action_completed": return "Acción completada";
    case "effectiveness":
      return outcome === "effective" ? "Eficacia verificada: eficaz"
           : outcome === "not_effective" ? "Eficacia verificada: NO eficaz"
           : "Eficacia verificada";
    case "closure": return "Caso cerrado";
    case "reopen": return "Caso reabierto";
    case "concession": return "Concesión registrada";
  }
}

function isClassification(v: string): v is Classification {
  return (CLASSIFICATIONS as readonly string[]).includes(v);
}

/** Los tipos de referencia que un caso puede tener, y cómo se llaman. */
export const REFERENCE_KINDS = [
  "quality_indicator", "quality_measurement", "quality_process", "quality_process_revision",
  "quality_process_io", "trazadoc_document", "trazadoc_document_revision", "work_case", "work_action",
  // QUALITY-05 · Un caso puede nacer de un riesgo, y entonces referencia al
  // riesgo, al hecho que lo materializó y a la evaluación que regía entonces.
  // Si el dominio no conoce el tipo, la ficha pinta la fila EN BLANCO: no es
  // una hipótesis, es lo que se vio en pantalla antes de añadirlos aquí.
  "quality_objective", "quality_risk", "quality_opportunity", "quality_control",
  "quality_risk_assessment", "quality_risk_materialization",
] as const;
export type ReferenceKind = (typeof REFERENCE_KINDS)[number];

export const REFERENCE_KIND_LABEL: Record<ReferenceKind, string> = {
  quality_indicator: "Indicador",
  quality_measurement: "Medición",
  quality_process: "Proceso",
  quality_process_revision: "Revisión de proceso",
  quality_process_io: "Entrada o salida",
  trazadoc_document: "Documento",
  trazadoc_document_revision: "Revisión documental",
  work_case: "Caso",
  work_action: "Acción",
  quality_objective: "Objetivo",
  quality_risk: "Riesgo",
  quality_opportunity: "Oportunidad",
  quality_control: "Control",
  quality_risk_assessment: "Evaluación del riesgo",
  quality_risk_materialization: "El riesgo se materializó",
};

/** A dónde lleva una referencia. Que un enlace apunte al sitio correcto suena
 *  trivial hasta que la bandeja manda a todo el mundo a Documentos. */
export function referenceHref(kind: ReferenceKind, id: string): string | null {
  switch (kind) {
    case "quality_indicator": return `/quality/indicators/${id}`;
    case "quality_process": return `/quality/processes/${id}`;
    case "trazadoc_document": return `/quality/documents/${id}`;
    case "work_case": return `/quality/cases/${id}`;
    case "quality_objective": return `/quality/objectives/${id}`;
    case "quality_risk": return `/quality/risks/${id}`;
    case "quality_opportunity": return `/quality/risks/opportunities/${id}`;
    // Medición, revisiones, entradas/salidas, controles, evaluaciones y
    // materializaciones no tienen página propia: se ven dentro de su padre, y
    // enlazar a una ruta inventada sería peor que no enlazar.
    default: return null;
  }
}
