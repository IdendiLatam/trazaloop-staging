"use server";

import { revalidatePath } from "next/cache";
import { requireQualityForAction } from "@/lib/auth/require-quality-module";
import { requireSession } from "@/lib/auth/require-session";
import { checkQualityCanMutate } from "@/server/actions/module-plans";
import {
  addAgendaItem, addManualEntry, addNote, addParticipant, cancelReview,
  closeReview, createActionFromDecision, createReview, deleteReview, issueMinutes,
  markInputNotApplicable, prepareInputs, proposeAgenda, recordDecision,
  refreshInput, removeAgendaItem, removeDecision, removeManualEntry,
  removeParticipant, reopenReview, saveConclusions, saveInputAnalysis,
  scanManagementReviews, scheduleNextReview, updateDecision, updateReview,
  updateReviewStatus,
} from "@/lib/db/quality-management-review";
import {
  canCloseManagementReview, canManageManagementReview, DECISION_KINDS,
  MANUAL_ENTRY_KINDS, PARTICIPATION_ROLES, RESOURCE_KINDS, REVIEW_KINDS,
  REVIEW_STATUSES,
} from "@/lib/domain/quality-management-review";

/**
 * Trazaloop · QUALITY-10 · Acciones de servidor de la Revisión por la Dirección.
 *
 * EL REPARTO
 *
 * · Lo que solo REGISTRA —una revisión, un participante, un punto de agenda,
 *   una entrada manual, el análisis de una entrada, unas conclusiones— es
 *   escritura normal bajo RLS.
 * · Lo que crea HISTORIA —preparar y refrescar entradas, registrar una
 *   decisión, crear la acción que sale de ella, emitir el acta, cerrar y
 *   reabrir— pasa por una RPC de 0128.
 *
 * LO QUE NINGUNA DE ESTAS FUNCIONES HACE
 *
 * Ninguna crea una acción al registrar una decisión. Ninguna concluye por su
 * cuenta: el análisis y las conclusiones los escribe una persona. Ninguna
 * borra un análisis al refrescar un dato. Ninguna modifica el dato de origen
 * —la revisión por la dirección no corrige el número que le incomoda—. Ninguna
 * lee una respuesta de encuesta, una nota de entrevista de auditoría ni una
 * evaluación individual de desempeño. Y ninguna invoca ningún modelo: lo que
 * esta pantalla resume sale de consultas deterministas.
 */

export type ReviewActionState = {
  error: string | null;
  success?: boolean;
  message?: string | null;
  id?: string;
  /** §56 · Lo que la comprobación de frescura encontró, para pintarlo. */
  freshness?: Record<string, unknown>;
};

const OK: ReviewActionState = { error: null, success: true, message: null };

type Gate = { organizationId: string; roleCode: string; userId: string };

async function gate(): Promise<{ ok: Gate | null; error: string | null }> {
  const access = await requireQualityForAction();
  if (access.org === null) return { ok: null, error: access.error };
  const mutate = await checkQualityCanMutate();
  if (!mutate.allowed) return { ok: null, error: mutate.error };
  const { user } = await requireSession();
  return {
    ok: {
      organizationId: access.org.organizationId,
      roleCode: access.org.roleCode,
      userId: user.id,
    },
    error: null,
  };
}

function text(form: FormData, name: string): string {
  const v = form.get(name);
  return typeof v === "string" ? v.trim() : "";
}
function optional(form: FormData, name: string): string | null {
  const v = text(form, name);
  return v.length > 0 ? v : null;
}
function bool(form: FormData, name: string): boolean {
  return form.get(name) === "on" || form.get(name) === "true";
}
function num(form: FormData, name: string): number | null {
  const v = text(form, name);
  if (v.length === 0) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function pick<T extends readonly string[]>(
  form: FormData, name: string, allowed: T, fallback?: T[number]
): T[number] | null {
  const v = text(form, name);
  if ((allowed as readonly string[]).includes(v)) return v as T[number];
  return fallback ?? null;
}
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function revalidateReview(reviewId?: string | null) {
  revalidatePath("/quality");
  revalidatePath("/quality/management-review");
  revalidatePath("/quality/tasks");
  if (reviewId) revalidatePath(`/quality/management-review/${reviewId}`);
}

async function run(
  fn: () => Promise<void | string | number>,
  after: () => void,
  message: string
): Promise<ReviewActionState> {
  try {
    const id = await fn();
    after();
    return { ...OK, message, id: typeof id === "string" ? id : undefined };
  } catch (e) {
    // El mensaje viene de la base y ya está escrito para una persona.
    return { error: e instanceof Error ? e.message : "No se pudo completar la operación." };
  }
}

// ---------------------------------------------------------------------------
// La revisión (§6, §7, §10, §12)
// ---------------------------------------------------------------------------

export async function createReviewAction(
  _prev: ReviewActionState, formData: FormData
): Promise<ReviewActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageManagementReview(g.ok.roleCode)) {
    return { error: "Tu rol no permite crear revisiones por la dirección." };
  }
  const code = text(formData, "code");
  const title = text(formData, "title");
  if (code.length < 1) return { error: "Escribe el código de la revisión." };
  if (title.length < 3) return { error: "Escribe el título de la revisión." };
  const periodStart = text(formData, "period_start");
  const periodEnd = text(formData, "period_end");
  if (!periodStart || !periodEnd) {
    return { error: "Indica qué periodo analiza esta revisión." };
  }
  if (periodEnd < periodStart) return { error: "El periodo termina antes de empezar." };

  return run(
    () => createReview(g.ok!.organizationId, {
      code, title,
      reviewKind: pick(formData, "review_kind", REVIEW_KINDS, "full")!,
      periodLabel: text(formData, "period_label") || periodStart.slice(0, 4),
      periodStart, periodEnd,
      ownerPositionId: optional(formData, "owner_position_id"),
      scopeNote: optional(formData, "scope_note"),
    }),
    () => revalidateReview(),
    "Revisión creada. Analiza el periodo que acabas de declarar: las entradas "
      + "automáticas lo respetarán y no mostrarán el estado de hoy."
  );
}

export async function updateReviewAction(
  _prev: ReviewActionState, formData: FormData
): Promise<ReviewActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageManagementReview(g.ok.roleCode)) {
    return { error: "Tu rol no permite editar revisiones por la dirección." };
  }
  const reviewId = text(formData, "review_id");
  if (!reviewId) return { error: "Falta la revisión." };
  const title = text(formData, "title");
  if (title.length < 3) return { error: "Escribe el título de la revisión." };

  return run(
    () => updateReview(g.ok!.organizationId, reviewId, {
      title,
      scopeNote: optional(formData, "scope_note"),
      agendaNote: optional(formData, "agenda_note"),
      ownerPositionId: optional(formData, "owner_position_id"),
      sessionHeldOn: optional(formData, "session_held_on"),
      sessionLocation: optional(formData, "session_location"),
      sessionNote: optional(formData, "session_note"),
    }),
    () => revalidateReview(reviewId),
    "Revisión actualizada."
  );
}

export async function updateReviewStatusAction(
  _prev: ReviewActionState, formData: FormData
): Promise<ReviewActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageManagementReview(g.ok.roleCode)) {
    return { error: "Tu rol no permite cambiar el estado de la revisión." };
  }
  const reviewId = text(formData, "review_id");
  const status = pick(formData, "status", REVIEW_STATUSES);
  if (!reviewId || !status) return { error: "Falta la revisión o el estado." };
  if (status === "closed") {
    return { error: "Cerrar una revisión no se hace cambiando su estado: usa «Cerrar revisión», que comprueba que las entradas se miraron y que hay decisiones." };
  }
  if (status === "cancelled") {
    return { error: "Cancelar exige decir por qué: usa «Cancelar revisión»." };
  }

  return run(
    () => updateReviewStatus(g.ok!.organizationId, reviewId, status),
    () => revalidateReview(reviewId),
    "Estado actualizado."
  );
}

/** §38 · Las conclusiones generales. Nadie las deduce. */
export async function saveConclusionsAction(
  _prev: ReviewActionState, formData: FormData
): Promise<ReviewActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageManagementReview(g.ok.roleCode)) {
    return { error: "Tu rol no permite escribir las conclusiones." };
  }
  const reviewId = text(formData, "review_id");
  if (!reviewId) return { error: "Falta la revisión." };
  const conclusions = optional(formData, "conclusions");
  if (conclusions !== null && conclusions.length < 20) {
    return { error: "Escribe las conclusiones con algo más de detalle: son lo que la dirección afirma sobre su propio sistema." };
  }

  return run(
    () => saveConclusions(g.ok!.organizationId, reviewId, conclusions),
    () => revalidateReview(reviewId),
    "Conclusiones guardadas. Las escribió una persona: el sistema no las deduce "
      + "de los datos."
  );
}

/** §46 · La próxima revisión. La frecuencia la decide la empresa. */
export async function scheduleNextReviewAction(
  _prev: ReviewActionState, formData: FormData
): Promise<ReviewActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageManagementReview(g.ok.roleCode)) {
    return { error: "Tu rol no permite programar la próxima revisión." };
  }
  const reviewId = text(formData, "review_id");
  if (!reviewId) return { error: "Falta la revisión." };

  return run(
    () => scheduleNextReview(g.ok!.organizationId, reviewId,
      optional(formData, "next_review_planned_on"),
      optional(formData, "next_review_note")),
    () => revalidateReview(reviewId),
    "Próxima revisión programada. La frecuencia la decide la empresa: "
      + "Trazaloop no obliga a que sea anual."
  );
}

export async function cancelReviewAction(
  _prev: ReviewActionState, formData: FormData
): Promise<ReviewActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageManagementReview(g.ok.roleCode)) {
    return { error: "Tu rol no permite cancelar revisiones." };
  }
  const reviewId = text(formData, "review_id");
  const reason = text(formData, "reason");
  if (!reviewId) return { error: "Falta la revisión." };
  if (reason.length < 10) return { error: "Escribe por qué se cancela." };

  return run(
    () => cancelReview(g.ok!.organizationId, reviewId, reason),
    () => revalidateReview(reviewId),
    "Revisión cancelada. Sigue existiendo, con su motivo."
  );
}

export async function deleteReviewAction(
  _prev: ReviewActionState, formData: FormData
): Promise<ReviewActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageManagementReview(g.ok.roleCode)) {
    return { error: "Tu rol no permite eliminar revisiones." };
  }
  const reviewId = text(formData, "review_id");
  if (!reviewId) return { error: "Falta la revisión." };

  return run(
    () => deleteReview(g.ok!.organizationId, reviewId),
    () => revalidateReview(),
    "Revisión eliminada."
  );
}

// ---------------------------------------------------------------------------
// Participantes, agenda y notas (§9, §33, §51, §69, §70)
// ---------------------------------------------------------------------------

export async function addParticipantAction(
  _prev: ReviewActionState, formData: FormData
): Promise<ReviewActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageManagementReview(g.ok.roleCode)) {
    return { error: "Tu rol no permite registrar participantes." };
  }
  const reviewId = text(formData, "review_id");
  if (!reviewId) return { error: "Falta la revisión." };
  const personId = optional(formData, "person_id");
  const externalName = optional(formData, "external_name");
  if ((personId === null) === (externalName === null)) {
    return { error: "Indica una persona de la empresa O un nombre externo, no ambos." };
  }

  return run(
    () => addParticipant(g.ok!.organizationId, reviewId, {
      personId, externalName,
      participationRole: pick(formData, "participation_role", PARTICIPATION_ROLES, "member")!,
      positionId: optional(formData, "position_id"),
      positionNameAtReview: optional(formData, "position_name_at_review"),
      attended: bool(formData, "attended"),
      attendanceNote: optional(formData, "attendance_note"),
      contributionNote: optional(formData, "contribution_note"),
    }),
    () => revalidateReview(reviewId),
    "Participante registrado con el cargo que ocupaba en esta revisión. Si "
      + "mañana cambia de puesto, esta revisión seguirá diciendo el de hoy. Y "
      + "haber asistido no es haber aprobado."
  );
}

export async function removeParticipantAction(
  _prev: ReviewActionState, formData: FormData
): Promise<ReviewActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageManagementReview(g.ok.roleCode)) {
    return { error: "Tu rol no permite editar participantes." };
  }
  const participantId = text(formData, "participant_id");
  if (!participantId) return { error: "Falta el participante." };

  return run(
    () => removeParticipant(g.ok!.organizationId, participantId),
    () => revalidateReview(optional(formData, "review_id")),
    "Participante retirado."
  );
}

export async function addAgendaItemAction(
  _prev: ReviewActionState, formData: FormData
): Promise<ReviewActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageManagementReview(g.ok.roleCode)) {
    return { error: "Tu rol no permite editar la agenda." };
  }
  const reviewId = text(formData, "review_id");
  const title = text(formData, "title");
  if (!reviewId) return { error: "Falta la revisión." };
  if (title.length < 3) return { error: "Escribe el punto de agenda." };

  return run(
    () => addAgendaItem(g.ok!.organizationId, reviewId, {
      title, catalogCode: optional(formData, "catalog_code"),
      note: optional(formData, "note"),
      timeLabel: optional(formData, "time_label"),
      presenterPersonId: optional(formData, "presenter_person_id"),
      order: num(formData, "position_order") ?? 1,
    }),
    () => revalidateReview(reviewId),
    "Punto añadido a la agenda."
  );
}

export async function removeAgendaItemAction(
  _prev: ReviewActionState, formData: FormData
): Promise<ReviewActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageManagementReview(g.ok.roleCode)) {
    return { error: "Tu rol no permite editar la agenda." };
  }
  const itemId = text(formData, "item_id");
  if (!itemId) return { error: "Falta el punto de agenda." };

  return run(
    () => removeAgendaItem(g.ok!.organizationId, itemId),
    () => revalidateReview(optional(formData, "review_id")),
    "Punto retirado de la agenda."
  );
}

/** §33 · La agenda propuesta desde las entradas. Es una propuesta. */
export async function proposeAgendaAction(
  _prev: ReviewActionState, formData: FormData
): Promise<ReviewActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageManagementReview(g.ok.roleCode)) {
    return { error: "Tu rol no permite preparar la agenda." };
  }
  const reviewId = text(formData, "review_id");
  if (!reviewId) return { error: "Falta la revisión." };

  try {
    const n = await proposeAgenda(g.ok.organizationId, reviewId);
    revalidateReview(reviewId);
    return {
      ...OK,
      message: n > 0
        ? `${n} punto(s) propuestos a partir de las entradas. El orden es tuyo: `
          + "puedes reordenarlos, quitarlos o añadir los que hagan falta."
        : "La agenda ya cubre todas las entradas con algo que mirar.",
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo proponer la agenda." };
  }
}

export async function addNoteAction(
  _prev: ReviewActionState, formData: FormData
): Promise<ReviewActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageManagementReview(g.ok.roleCode)) {
    return { error: "Tu rol no permite registrar notas." };
  }
  const reviewId = text(formData, "review_id");
  const body = text(formData, "body");
  if (!reviewId) return { error: "Falta la revisión." };
  if (body.length < 3) return { error: "Escribe la nota." };

  return run(
    () => addNote(g.ok!.organizationId, reviewId, body,
      text(formData, "recorded_on") || todayIso()),
    () => revalidateReview(reviewId),
    "Nota registrada. El acta formal no sale de las notas: se deriva del modelo."
  );
}

// ---------------------------------------------------------------------------
// Entradas (§16, §17, §35, §37, §55, §56)
// ---------------------------------------------------------------------------

/** §55 · El trabajo real de la plataforma. */
export async function prepareInputsAction(
  _prev: ReviewActionState, formData: FormData
): Promise<ReviewActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageManagementReview(g.ok.roleCode)) {
    return { error: "Tu rol no permite preparar las entradas." };
  }
  const reviewId = text(formData, "review_id");
  if (!reviewId) return { error: "Falta la revisión." };

  return run(
    () => prepareInputs(reviewId),
    () => revalidateReview(reviewId),
    "Entradas preparadas leyendo lo que ya está en el sistema. Lo que ya "
      + "habías analizado sigue intacto: preparar no borra el análisis."
  );
}

/** §56/§85 · Refrescar es consciente y no borra nada. */
export async function refreshInputAction(
  _prev: ReviewActionState, formData: FormData
): Promise<ReviewActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageManagementReview(g.ok.roleCode)) {
    return { error: "Tu rol no permite refrescar las entradas." };
  }
  const inputId = text(formData, "input_id");
  if (!inputId) return { error: "Falta la entrada." };

  try {
    const freshness = await refreshInput(inputId);
    revalidateReview(optional(formData, "review_id"));
    return {
      ...OK, freshness,
      message: "Entrada refrescada con el dato de ahora. Tu análisis sigue donde estaba.",
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo refrescar la entrada." };
  }
}

/** §37 · El análisis humano, al lado del dato y sin tocarlo. */
export async function saveInputAnalysisAction(
  _prev: ReviewActionState, formData: FormData
): Promise<ReviewActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageManagementReview(g.ok.roleCode)) {
    return { error: "Tu rol no permite analizar las entradas." };
  }
  const inputId = text(formData, "input_id");
  if (!inputId) return { error: "Falta la entrada." };
  const analysis = optional(formData, "analysis");
  if (analysis !== null && analysis.length < 10) {
    return { error: "Escribe el análisis con algo más de detalle: el dato no es la conclusión." };
  }

  return run(
    () => saveInputAnalysis(g.ok!.organizationId, inputId, {
      analysis,
      conclusion: optional(formData, "conclusion"),
      requiresDecision: bool(formData, "requires_decision"),
    }),
    () => revalidateReview(optional(formData, "review_id")),
    bool(formData, "requires_decision")
      ? "Análisis guardado y marcado como pendiente de decisión. Decir que hay "
        + "que resolverlo NO es haberlo resuelto: la decisión es otro acto."
      : "Análisis guardado. El dato de origen no se tocó."
  );
}

/** §35 · «No aplica» exige razón escrita. */
export async function markInputNotApplicableAction(
  _prev: ReviewActionState, formData: FormData
): Promise<ReviewActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageManagementReview(g.ok.roleCode)) {
    return { error: "Tu rol no permite marcar entradas como no aplicables." };
  }
  const inputId = text(formData, "input_id");
  const reason = text(formData, "not_applicable_reason");
  if (!inputId) return { error: "Falta la entrada." };
  if (reason.length < 10) {
    return { error: "Escribe por qué esta entrada no aplica. Sin razón, «no aplica» es una forma elegante de no haber mirado." };
  }

  return run(
    () => markInputNotApplicable(g.ok!.organizationId, inputId, reason),
    () => revalidateReview(optional(formData, "review_id")),
    "Entrada marcada como no aplicable, con su razón. «No aplica» no es lo "
      + "mismo que «sin datos», y ninguno de los dos es cero."
  );
}

/** §17 · Lo que aporta la dirección, marcado como aportación humana. */
export async function addManualEntryAction(
  _prev: ReviewActionState, formData: FormData
): Promise<ReviewActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageManagementReview(g.ok.roleCode)) {
    return { error: "Tu rol no permite registrar entradas manuales." };
  }
  const reviewId = text(formData, "review_id");
  const inputId = text(formData, "input_id");
  const title = text(formData, "title");
  const body = text(formData, "body");
  if (!reviewId || !inputId) return { error: "Falta la revisión o la entrada." };
  if (title.length < 3) return { error: "Escribe de qué se trata." };
  if (body.length < 10) return { error: "Escribe el contenido de la entrada." };

  return run(
    () => addManualEntry(g.ok!.organizationId, reviewId, inputId, {
      entryKind: pick(formData, "entry_kind", MANUAL_ENTRY_KINDS, "other")!,
      resourceKind: pick(formData, "resource_kind", RESOURCE_KINDS) ?? null,
      title, body,
      recordedOn: text(formData, "recorded_on") || todayIso(),
    }),
    () => revalidateReview(reviewId),
    "Entrada manual registrada, con tu nombre y la fecha. Queda marcada como "
      + "aportación de la dirección: no se presenta como dato del sistema."
  );
}

export async function removeManualEntryAction(
  _prev: ReviewActionState, formData: FormData
): Promise<ReviewActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageManagementReview(g.ok.roleCode)) {
    return { error: "Tu rol no permite editar entradas manuales." };
  }
  const entryId = text(formData, "entry_id");
  if (!entryId) return { error: "Falta la entrada manual." };

  return run(
    () => removeManualEntry(g.ok!.organizationId, entryId),
    () => revalidateReview(optional(formData, "review_id")),
    "Entrada manual retirada."
  );
}

// ---------------------------------------------------------------------------
// Decisiones y acciones (§39, §41, §42, §82)
// ---------------------------------------------------------------------------

/** §41/§82 · Registrar una decisión NO crea ninguna acción. */
export async function recordDecisionAction(
  _prev: ReviewActionState, formData: FormData
): Promise<ReviewActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageManagementReview(g.ok.roleCode)) {
    return { error: "Tu rol no permite registrar decisiones de la dirección." };
  }
  const reviewId = text(formData, "review_id");
  const topic = text(formData, "topic");
  const decision = text(formData, "decision");
  if (!reviewId) return { error: "Falta la revisión." };
  if (topic.length < 3) return { error: "Escribe sobre qué se decide." };
  if (decision.length < 10) return { error: "Escribe qué se resolvió." };

  return run(
    () => recordDecision({
      reviewId, topic, decision,
      decisionKind: pick(formData, "decision_kind", DECISION_KINDS, "other")!,
      rationale: optional(formData, "rationale"),
      expectedResult: optional(formData, "expected_result"),
      inputId: optional(formData, "input_id"),
      ownerPositionId: optional(formData, "owner_position_id"),
    }),
    () => revalidateReview(reviewId),
    "Decisión registrada. NO se creó ninguna acción: una decisión puede vivir "
      + "sin acciones, y si hacen falta, se crean una a una desde aquí."
  );
}

export async function updateDecisionAction(
  _prev: ReviewActionState, formData: FormData
): Promise<ReviewActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageManagementReview(g.ok.roleCode)) {
    return { error: "Tu rol no permite editar decisiones." };
  }
  const decisionId = text(formData, "decision_id");
  const topic = text(formData, "topic");
  const decision = text(formData, "decision");
  if (!decisionId) return { error: "Falta la decisión." };
  if (topic.length < 3) return { error: "Escribe sobre qué se decide." };
  if (decision.length < 10) return { error: "Escribe qué se resolvió." };

  return run(
    () => updateDecision(g.ok!.organizationId, decisionId, {
      topic, decision,
      decisionKind: pick(formData, "decision_kind", DECISION_KINDS, "other")!,
      rationale: optional(formData, "rationale"),
      expectedResult: optional(formData, "expected_result"),
      ownerPositionId: optional(formData, "owner_position_id"),
    }),
    () => revalidateReview(optional(formData, "review_id")),
    "Decisión actualizada."
  );
}

export async function removeDecisionAction(
  _prev: ReviewActionState, formData: FormData
): Promise<ReviewActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageManagementReview(g.ok.roleCode)) {
    return { error: "Tu rol no permite eliminar decisiones." };
  }
  const decisionId = text(formData, "decision_id");
  if (!decisionId) return { error: "Falta la decisión." };

  return run(
    () => removeDecision(g.ok!.organizationId, decisionId),
    () => revalidateReview(optional(formData, "review_id")),
    "Decisión eliminada. Las acciones que hubiera creado siguen su propio curso."
  );
}

/** §42/§82 · La acción, una a una. 0..N por decisión. */
export async function createActionFromDecisionAction(
  _prev: ReviewActionState, formData: FormData
): Promise<ReviewActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageManagementReview(g.ok.roleCode)) {
    return { error: "Tu rol no permite crear acciones desde una decisión." };
  }
  const decisionId = text(formData, "decision_id");
  const title = text(formData, "title");
  if (!decisionId) return { error: "Falta la decisión." };
  if (title.length < 5) return { error: "Escribe qué hay que hacer." };
  const requiresEffectiveness = bool(formData, "requires_effectiveness");
  const criteria = optional(formData, "effectiveness_criteria");
  if (requiresEffectiveness && (criteria === null || criteria.length < 10)) {
    return { error: "Si la acción exige verificar eficacia, escribe con qué criterio se verificará." };
  }

  return run(
    () => createActionFromDecision({
      decisionId, title,
      actionKind: text(formData, "action_kind") || "improvement",
      description: optional(formData, "description"),
      ownerPositionId: optional(formData, "owner_position_id"),
      dueOn: optional(formData, "due_on"),
      requiresEffectiveness, effectivenessCriteria: criteria,
    }),
    () => revalidateReview(optional(formData, "review_id")),
    "Acción creada en el motor de acciones, atada a la decisión. La decisión "
      + "sigue siendo una: lo que cambió es cuántas acciones tiene."
  );
}

// ---------------------------------------------------------------------------
// Acta, cierre y reapertura (§47, §48, §50)
// ---------------------------------------------------------------------------

export async function issueMinutesAction(
  _prev: ReviewActionState, formData: FormData
): Promise<ReviewActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canCloseManagementReview(g.ok.roleCode)) {
    return { error: "Tu rol no permite emitir el acta de una revisión por la dirección." };
  }
  const reviewId = text(formData, "review_id");
  if (!reviewId) return { error: "Falta la revisión." };

  return run(
    () => issueMinutes(reviewId, optional(formData, "summary")),
    () => revalidateReview(reviewId),
    "Acta emitida. Es una FOTO de lo que la dirección revisó y decidió hoy: si "
      + "algo cambia después, hará falta un acta nueva que corrija a esta, y las "
      + "dos se conservarán."
  );
}

/** §48/§83 · Cerrar NO exige acciones terminadas. */
export async function closeReviewAction(
  _prev: ReviewActionState, formData: FormData
): Promise<ReviewActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canCloseManagementReview(g.ok.roleCode)) {
    return { error: "Tu rol no permite cerrar una revisión por la dirección." };
  }
  const reviewId = text(formData, "review_id");
  const closureNote = text(formData, "closure_note");
  if (!reviewId) return { error: "Falta la revisión." };
  if (closureNote.length < 10) return { error: "Escribe por qué se cierra la revisión." };

  return run(
    () => closeReview(reviewId, closureNote, optional(formData, "followup_note")),
    () => revalidateReview(reviewId),
    "Revisión cerrada. Las acciones que decidió siguen su propio curso: cerrar "
      + "la revisión no las cierra, y el seguimiento las mostrará vivas."
  );
}

/** §47 · Reabrir es excepcional. */
export async function reopenReviewAction(
  _prev: ReviewActionState, formData: FormData
): Promise<ReviewActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canCloseManagementReview(g.ok.roleCode)) {
    return { error: "Tu rol no permite reabrir una revisión por la dirección." };
  }
  const reviewId = text(formData, "review_id");
  const reason = text(formData, "reason");
  if (!reviewId) return { error: "Falta la revisión." };
  if (reason.length < 20) {
    return { error: "Reabrir una revisión cerrada es excepcional. Escribe con detalle por qué, y considera antes emitir un acta que corrija a la anterior." };
  }

  return run(
    () => reopenReview(reviewId, reason),
    () => revalidateReview(reviewId),
    "Revisión reabierta. El cierre anterior NO se borró: queda registrado, con "
      + "su fecha, y las actas emitidas siguen ahí."
  );
}

export async function scanManagementReviewsAction(
  _prev: ReviewActionState, _formData: FormData
): Promise<ReviewActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageManagementReview(g.ok.roleCode)) {
    return { error: "Tu rol no permite ejecutar el barrido." };
  }

  try {
    const created = await scanManagementReviews(g.ok.organizationId);
    revalidateReview();
    return {
      ...OK,
      message: created > 0
        ? `Barrido ejecutado: ${created} avisos nuevos.`
        : "Barrido ejecutado: no había nada nuevo que avisar.",
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo ejecutar el barrido." };
  }
}
