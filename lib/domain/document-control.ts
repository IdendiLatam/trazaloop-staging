/**
 * Trazaloop Quality · QUALITY-02 · Lógica PURA del control documental.
 *
 * Refleja, sin Supabase ni Next ni servidor, las mismas reglas que la
 * migración 0116 ya impone en la base. La base es la barrera real; esta capa
 * existe para que el servidor pueda decir POR QUÉ antes de intentar escribir,
 * y para que las reglas sean comprobables sin levantar una base de datos.
 *
 * Los tres conceptos que este sprint separa —y que no vuelven a mezclarse—:
 *
 *   IDENTIDAD DEL DOCUMENTO   código, título, propietario, módulo
 *   REVISIÓN DOCUMENTAL       revision_number, contenido, vigencia
 *   ESTADO DEL WORKFLOW       borrador → revisión → decisión → aprobado
 *
 * Una transición de workflow NUNCA mueve la revisión. Solo lo hace
 * `crear nueva revisión`.
 */
import type { TeamRoleCode } from "./team";

// ---------------------------------------------------------------------------
// Modelo de revisión
// ---------------------------------------------------------------------------

/**
 * `legacy`     documentos anteriores a QUALITY-02 (PCR, Textiles y los de
 *              Quality creados antes): current_version es un contador técnico
 *              de instantáneas cuyo valor histórico es genuinamente incierto.
 * `controlled` current_version ES la revisión de negocio.
 */
export const REVISION_MODELS = ["legacy", "controlled"] as const;
export type RevisionModel = (typeof REVISION_MODELS)[number];

// ---------------------------------------------------------------------------
// Estado del workflow (lo que guarda trazadoc_document_revisions)
// ---------------------------------------------------------------------------
export const WORKFLOW_STATES = [
  "draft",
  "in_review",
  "changes_requested",
  "pending_approval",
  "approved",
  "superseded",
  "retired",
] as const;
export type WorkflowState = (typeof WORKFLOW_STATES)[number];

export function isWorkflowState(v: string | null | undefined): v is WorkflowState {
  return !!v && (WORKFLOW_STATES as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// Estado de ciclo de vida (lo que LEE una persona)
//
// Es el estado del workflow más la única distinción que no puede almacenarse:
// aprobado ≠ vigente (D-06). Un documento aprobado hoy con vigencia desde el
// mes que viene está aprobado y todavía no rige.
// ---------------------------------------------------------------------------
export const LIFECYCLE_STATES = [
  "draft",
  "in_review",
  "changes_requested",
  "pending_approval",
  "approved_pending_effective",
  "effective",
  "superseded",
  "retired",
] as const;
export type LifecycleState = (typeof LIFECYCLE_STATES)[number];

export function isLifecycleState(v: string | null | undefined): v is LifecycleState {
  return !!v && (LIFECYCLE_STATES as readonly string[]).includes(v);
}

/** Lenguaje de un responsable de calidad, no de una máquina de estados. */
export const LIFECYCLE_LABEL: Record<LifecycleState, string> = {
  draft: "Borrador",
  in_review: "En revisión",
  changes_requested: "Devuelto con observaciones",
  pending_approval: "Pendiente de aprobación",
  approved_pending_effective: "Aprobado · pendiente de vigencia",
  effective: "Vigente",
  superseded: "Sustituido",
  retired: "Retirado",
};

/** Qué significa cada estado, en una frase. Se muestra junto al distintivo. */
export const LIFECYCLE_HELP: Record<LifecycleState, string> = {
  draft: "Se está preparando. Todavía no lo ha visto nadie más.",
  in_review: "Alguien lo está revisando. Su contenido queda quieto mientras tanto.",
  changes_requested: "Te lo devolvieron con un motivo. Corrígelo y vuelve a enviarlo.",
  pending_approval: "La revisión terminó bien. Falta la aprobación formal.",
  approved_pending_effective: "Ya está aprobado, pero empieza a regir en una fecha posterior.",
  effective: "Es el documento que rige hoy.",
  superseded: "Una revisión posterior ocupó su lugar. Se conserva como histórico.",
  retired: "Se retiró del uso. Se conserva completo para consulta histórica.",
};

export type LifecycleTone = "neutral" | "progress" | "attention" | "ok" | "muted";

export function lifecycleTone(state: LifecycleState): LifecycleTone {
  switch (state) {
    case "draft":
      return "neutral";
    case "in_review":
    case "pending_approval":
      return "progress";
    case "changes_requested":
      return "attention";
    case "approved_pending_effective":
    case "effective":
      return "ok";
    default:
      return "muted";
  }
}

/**
 * Deriva el estado de ciclo de vida EXACTAMENTE como lo hace
 * v_trazadoc_document_control (§8 de 0116). Tenerlo también aquí permite
 * comprobar la regla —sobre todo la frontera aprobado/vigente— sin base de
 * datos, y una prueba verifica que ambas digan lo mismo.
 */
export function deriveLifecycleState(input: {
  disposition: string;
  workflowState: WorkflowState | null;
  effectiveFrom: string | null;
  /** Estado del motor para documentos legacy, que no tienen revisión. */
  engineStatus: string;
  today?: string;
}): LifecycleState {
  if (input.disposition === "retired" || input.disposition === "archived") return "retired";
  if (input.workflowState === null) {
    if (input.engineStatus === "obsolete") return "retired";
    return isLifecycleState(input.engineStatus) ? input.engineStatus : "draft";
  }
  if (input.workflowState === "approved") {
    const today = input.today ?? new Date().toISOString().slice(0, 10);
    const from = input.effectiveFrom ?? today;
    return from <= today ? "effective" : "approved_pending_effective";
  }
  return input.workflowState as LifecycleState;
}

// ---------------------------------------------------------------------------
// Rutas del workflow (D-19)
// ---------------------------------------------------------------------------
export const ROUTE_MODES = ["sequential", "parallel"] as const;
export type RouteMode = (typeof ROUTE_MODES)[number];

export const ROUTE_MODE_LABEL: Record<RouteMode, string> = {
  sequential: "Uno después de otro",
  parallel: "Todos a la vez",
};

export function isRouteMode(v: string | null | undefined): v is RouteMode {
  return !!v && (ROUTE_MODES as readonly string[]).includes(v);
}

export const PARTICIPANT_ROLES = ["reviewer", "approver"] as const;
export type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];

export const PARTICIPANT_ROLE_LABEL: Record<ParticipantRole, string> = {
  reviewer: "Revisor",
  approver: "Aprobador",
};

export const PARTICIPANT_DECISIONS = ["pending", "approved", "changes_requested"] as const;
export type ParticipantDecision = (typeof PARTICIPANT_DECISIONS)[number];

export const PARTICIPANT_DECISION_LABEL: Record<ParticipantDecision, string> = {
  pending: "Pendiente",
  approved: "Aceptado",
  changes_requested: "Devuelto",
};

// ---------------------------------------------------------------------------
// Decisiones formales (D-20)
// ---------------------------------------------------------------------------
export const DECISION_TYPES = [
  "revision_created",
  "submitted",
  "review_approved",
  "changes_requested",
  "resubmitted",
  "approved",
  "superseded",
  "retired",
  "effectivity_set",
] as const;
export type DecisionType = (typeof DECISION_TYPES)[number];

export const DECISION_TYPE_LABEL: Record<DecisionType, string> = {
  revision_created: "Revisión abierta",
  submitted: "Enviado a revisión",
  review_approved: "Revisión aceptada",
  changes_requested: "Devuelto con observaciones",
  resubmitted: "Corregido y reenviado",
  approved: "Aprobado",
  superseded: "Sustituido",
  retired: "Retirado",
  effectivity_set: "Vigencia definida",
};

// ---------------------------------------------------------------------------
// Permisos
//
// Mismos tres roles de empresa de siempre (admin / quality / consultant): este
// sprint no inventa roles. Lo que sí introduce es que ciertas acciones no
// dependen del rol sino de la ASIGNACIÓN: solo revisa quien fue designado
// revisor. Ni un administrador decide en nombre de otro — eso destruiría el
// valor de la firma, y la base lo impide igual que esta capa.
// ---------------------------------------------------------------------------

/** Contenido editable: solo con la revisión abierta en manos de su autor. */
export function canEditRevisionContent(
  role: TeamRoleCode | null | undefined,
  lifecycle: LifecycleState
): boolean {
  if (lifecycle !== "draft" && lifecycle !== "changes_requested") return false;
  return role === "admin" || role === "quality" || role === "consultant";
}

/** Enviar a revisión / reenviar tras una devolución. */
export function canSubmitRevision(
  role: TeamRoleCode | null | undefined,
  lifecycle: LifecycleState
): boolean {
  return canEditRevisionContent(role, lifecycle);
}

/**
 * Decidir NO es cuestión de rol: es cuestión de tener la decisión asignada en
 * la ronda y —en ruta secuencial— en el paso que toca. Es la misma condición
 * que evalúa trazadoc_record_document_decision.
 */
export function canDecideNow(input: {
  userId: string;
  lifecycle: LifecycleState;
  routeMode: RouteMode;
  round: number;
  participants: {
    profileId: string;
    participantRole: ParticipantRole;
    stepOrder: number;
    round: number;
    decision: ParticipantDecision;
  }[];
}): boolean {
  const stage: ParticipantRole | null =
    input.lifecycle === "in_review" ? "reviewer"
    : input.lifecycle === "pending_approval" ? "approver"
    : null;
  if (stage === null) return false;

  const pending = input.participants.filter(
    (p) => p.round === input.round && p.participantRole === stage && p.decision === "pending"
  );
  if (pending.length === 0) return false;
  if (input.routeMode === "parallel") return pending.some((p) => p.profileId === input.userId);
  const step = Math.min(...pending.map((p) => p.stepOrder));
  return pending.some((p) => p.profileId === input.userId && p.stepOrder === step);
}

/** Abrir la revisión SIGUIENTE de un documento ya aprobado. */
export function canCreateNextRevision(
  role: TeamRoleCode | null | undefined,
  lifecycle: LifecycleState
): boolean {
  if (lifecycle !== "effective" && lifecycle !== "approved_pending_effective") return false;
  return role === "admin" || role === "quality";
}

/** Retirar: misma autoridad que hasta hoy marcaba obsoleto. */
export function canRetireDocument(role: TeamRoleCode | null | undefined): boolean {
  return role === "admin" || role === "quality";
}

/** Destruir físicamente: solo un administrador, y solo en el caso A. */
export function canAttemptHardDelete(role: TeamRoleCode | null | undefined): boolean {
  return role === "admin";
}

// ---------------------------------------------------------------------------
// Eliminar o retirar (Parte 12)
//
// La interfaz debe poder EXPLICAR por qué un documento no se destruye, no solo
// ocultar el botón. Estas dos funciones son el espejo exacto de las
// comprobaciones de trazadoc_delete_document_safely.
// ---------------------------------------------------------------------------
export type DeletionFacts = {
  lifecycle: LifecycleState;
  disposition: string;
  everApproved: boolean;
  /** Alguna decisión formal distinta de «revisión abierta». */
  hasFormalHistory: boolean;
  revisionCount: number;
  linkedProcessCount: number;
};

/**
 * `null` → puede eliminarse físicamente. Un texto → la razón por la que debe
 * conservarse, redactada para quien la va a leer en pantalla.
 */
export function hardDeleteBlockReason(facts: DeletionFacts): string | null {
  if (facts.disposition !== "active") {
    return "Este documento ya está retirado: se conserva como histórico.";
  }
  if (facts.lifecycle !== "draft") {
    return "Solo se elimina un documento que sigue en borrador. Los demás se retiran, conservando su historial.";
  }
  if (facts.everApproved || facts.revisionCount > 1) {
    return "Este documento tuvo revisiones aprobadas. Su historial debe conservarse, así que se retira en lugar de eliminarse.";
  }
  if (facts.hasFormalHistory) {
    return "Este documento ya pasó por revisión o aprobación. Esas decisiones son parte del historial del sistema de calidad y no se destruyen: el documento se retira.";
  }
  if (facts.linkedProcessCount > 0) {
    return "Este documento está asociado a un proceso. Quita la asociación primero, o retíralo.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Etiqueta de revisión (D-03: la secuencia interna es independiente de la
// etiqueta visible; hoy coinciden, y el modelo permite que mañana no).
// ---------------------------------------------------------------------------
export function revisionLabel(revisionNumber: number): string {
  return `Revisión ${revisionNumber}`;
}

/**
 * Cómo se muestra la revisión de un documento LEGACY. Nunca se afirma que un
 * `current_version = 4` heredado sea «la revisión 4»: ese número contaba
 * transiciones de estado, no revisiones, y reinterpretarlo sería inventar un
 * histórico que nunca existió.
 */
export function legacyRevisionLabel(currentVersion: number): string {
  return currentVersion > 1 ? `v${currentVersion} (histórico)` : `v${currentVersion}`;
}

export function displayRevision(input: {
  revisionModel: RevisionModel;
  currentVersion: number;
  currentRevisionNumber: number | null;
}): string {
  if (input.revisionModel === "controlled") {
    return revisionLabel(input.currentRevisionNumber ?? input.currentVersion);
  }
  return legacyRevisionLabel(input.currentVersion);
}

// ---------------------------------------------------------------------------
// Selección de responsables (Parte 5)
// ---------------------------------------------------------------------------
export type ParticipantInput = {
  /** Cargo elegido (preferido, D-17). Se resuelve al titular vigente. */
  positionId?: string | null;
  /** Persona elegida directamente, cuando no se trabaja por cargos. */
  profileId?: string | null;
  stepOrder?: number;
};

export type ParticipantPayload = {
  position_id: string | null;
  profile_id: string | null;
  step_order: number;
};

export function buildParticipantsPayload(items: ParticipantInput[]): ParticipantPayload[] {
  return items
    .filter((i) => (i.positionId ?? null) !== null || (i.profileId ?? null) !== null)
    .map((i, index) => ({
      position_id: i.positionId ?? null,
      profile_id: i.profileId ?? null,
      step_order: i.stepOrder ?? index + 1,
    }));
}

export type SubmitValidation = { error: string | null };

/** Un documento sin aprobador no es un documento controlado. */
export function validateSubmitInput(input: {
  reviewers: ParticipantPayload[];
  approvers: ParticipantPayload[];
  effectiveFrom?: string | null;
  reviewDueAt?: string | null;
}): SubmitValidation {
  if (input.approvers.length === 0) {
    return { error: "Indica al menos una persona o cargo que apruebe el documento." };
  }
  if (
    input.effectiveFrom &&
    input.reviewDueAt &&
    input.reviewDueAt < input.effectiveFrom
  ) {
    return { error: "La próxima revisión no puede programarse antes de que el documento entre en vigencia." };
  }
  return { error: null };
}

// ---------------------------------------------------------------------------
// Vigencia y revisión programada (Partes 13 y 14)
// ---------------------------------------------------------------------------

/** «Aprobado el 21/08 · vigente desde el 01/09», sin confundir las dos cosas. */
export function effectivityCaption(input: {
  lifecycle: LifecycleState;
  approvedAt: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
}): string {
  const d = (iso: string | null) => (iso ? formatDate(iso) : "—");
  switch (input.lifecycle) {
    case "approved_pending_effective":
      return `Aprobado el ${d(input.approvedAt)} · empieza a regir el ${d(input.effectiveFrom)}`;
    case "effective":
      return input.effectiveTo
        ? `Vigente desde el ${d(input.effectiveFrom)} hasta el ${d(input.effectiveTo)}`
        : `Vigente desde el ${d(input.effectiveFrom)}`;
    case "superseded":
      return `Rigió hasta el ${d(input.effectiveTo)}`;
    case "retired":
      return "Retirado del uso";
    default:
      return "Todavía no rige";
  }
}

/**
 * D-09 · Una revisión vencida NO obsoleta el documento por sí sola: genera
 * atención. Esta función devuelve exactamente eso, atención, nunca un cambio
 * de estado.
 */
export function reviewAttention(input: {
  reviewDueAt: string | null;
  lifecycle: LifecycleState;
  today?: string;
}): { level: "none" | "due_soon" | "overdue"; message: string | null } {
  if (!input.reviewDueAt) return { level: "none", message: null };
  if (input.lifecycle !== "effective" && input.lifecycle !== "approved_pending_effective") {
    return { level: "none", message: null };
  }
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  if (input.reviewDueAt < today) {
    return {
      level: "overdue",
      message: `Su revisión periódica venció el ${formatDate(input.reviewDueAt)}. El documento sigue vigente; conviene revisarlo.`,
    };
  }
  const soon = addDays(today, 30);
  if (input.reviewDueAt <= soon) {
    return {
      level: "due_soon",
      message: `Su revisión periódica está prevista para el ${formatDate(input.reviewDueAt)}.`,
    };
  }
  return { level: "none", message: null };
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Fechas siempre en el formato que lee el usuario, nunca ISO en pantalla. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = iso.length > 10 ? new Date(iso) : new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC",
  }).format(date);
}

/**
 * Vacío NO es cero (Parte 9 del encargo). Un campo que todavía no aplica se
 * dice; no se rellena con un guion mudo que parezca un dato.
 */
export function orPending(value: string | null | undefined, pendingLabel = "Pendiente"): string {
  const v = (value ?? "").trim();
  return v.length > 0 ? v : pendingLabel;
}

export function orDash(value: string | null | undefined): string {
  const v = (value ?? "").trim();
  return v.length > 0 ? v : "—";
}
