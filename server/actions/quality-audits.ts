"use server";

import { revalidatePath } from "next/cache";
import { requireQualityForAction } from "@/lib/auth/require-quality-module";
import { requireSession } from "@/lib/auth/require-session";
import { checkQualityCanMutate } from "@/server/actions/module-plans";
import {
  addAgendaItem, addAuditee, addChecklistItem, addCriterion, addEvidence, addNote,
  addSample, addScopeItem, addTeamMember, cancelAudit, checkIndependence, closeAudit,
  createAudit, createChecklist, createChecklistVersion, createProgram, decideConflict,
  deleteAudit, evaluateFinding, finishAuditExecution, issueReport, linkFindingEvidence,
  openCaseFromFinding, publishChecklistVersion, recordCheckResult, recordFinding,
  recordMeeting, removeAgendaItem, removeAuditee, removeChecklistItem, removeCriterion,
  removeEvidence, removeScopeItem, removeTeamMember, rescheduleAudit, scanAudits,
  startAuditExecution, startChecklistRun, unlinkFindingEvidence, updateAudit,
  updateFinding, updateProgramStatus,
} from "@/lib/db/quality-audits";
import {
  AGENDA_ACTIVITY_KINDS, AUDIT_NATURES, AUDIT_TYPES, canCloseAudits, canManageAudits,
  CHECK_OUTCOMES, CONFLICT_STATUSES, CRITERION_KINDS, EVIDENCE_KINDS,
  FINDING_CLASSIFICATIONS, FINDING_EVALUATION_STATUSES, FINDING_SEVERITIES,
  MEETING_KINDS, NOTE_KINDS, PROGRAM_STATUSES, SCOPE_ITEM_KINDS, TEAM_ROLES,
} from "@/lib/domain/quality-audits";

/**
 * Trazaloop · QUALITY-09 · Acciones de servidor de Auditorías.
 *
 * EL REPARTO
 *
 * · Lo que solo REGISTRA —un programa, una auditoría, un elemento de alcance,
 *   un criterio, una nota, una muestra, una evidencia, un hallazgo— es
 *   escritura normal bajo RLS.
 * · Lo que crea HISTORIA —reprogramar, cancelar, publicar un checklist,
 *   comprobar independencia, escalar un hallazgo, emitir el informe, cerrar—
 *   pasa por una RPC de 0127, que comprueba rol, estado e invariante en el
 *   mismo acto en que registra.
 *
 * LO QUE NINGUNA DE ESTAS FUNCIONES HACE
 *
 * Ninguna convierte un hallazgo en No Conformidad. Ninguna abre un caso al
 * registrar un hallazgo, ni siquiera cuando el auditor escribe «posible no
 * conformidad»: hace falta el acto explícito de escalar. Ninguna programa una
 * auditoría sola porque un riesgo suba. Ninguna cierra acciones correctivas al
 * cerrar la auditoría. Y ninguna emite certificados: Trazaloop administra
 * auditorías, no concede certificación.
 */

export type AuditActionState = {
  error: string | null;
  success?: boolean;
  message?: string | null;
  id?: string;
  /** Lo que la comprobación de independencia encontró, para pintarlo. */
  independence?: Record<string, unknown>;
};

const OK: AuditActionState = { error: null, success: true, message: null };

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

function revalidateAudits(extra?: string) {
  revalidatePath("/quality");
  revalidatePath("/quality/audits");
  revalidatePath("/quality/audits/programs");
  revalidatePath("/quality/audits/findings");
  revalidatePath("/quality/audits/checklists");
  revalidatePath("/quality/tasks");
  if (extra) revalidatePath(extra);
}

async function run(
  fn: () => Promise<void | string>,
  after: () => void,
  message: string
): Promise<AuditActionState> {
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
// Programa (AR-01, AR-02, §12…§17)
// ---------------------------------------------------------------------------

export async function createProgramAction(
  _prev: AuditActionState, formData: FormData
): Promise<AuditActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageAudits(g.ok.roleCode)) {
    return { error: "Tu rol no permite crear programas de auditoría." };
  }
  const name = text(formData, "name");
  if (name.length < 3) return { error: "Escribe el nombre del programa." };
  const periodStart = text(formData, "period_start");
  const periodEnd = text(formData, "period_end");
  if (!periodStart || !periodEnd) return { error: "Indica el periodo del programa." };
  if (periodEnd < periodStart) return { error: "El periodo termina antes de empezar." };

  return run(
    () => createProgram(g.ok!.organizationId, {
      name,
      code: optional(formData, "code"),
      periodLabel: text(formData, "period_label") || periodStart.slice(0, 4),
      periodStart, periodEnd,
      purpose: optional(formData, "purpose"),
      prioritizationNote: optional(formData, "prioritization_note"),
      ownerPositionId: optional(formData, "owner_position_id"),
    }),
    () => revalidateAudits(),
    "Programa creado. Un programa NO es una auditoría: es el plan de qué se "
      + "auditará, cuándo y por qué."
  );
}

export async function updateProgramStatusAction(
  _prev: AuditActionState, formData: FormData
): Promise<AuditActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const programId = text(formData, "program_id");
  if (!programId) return { error: "Falta el programa." };
  const status = pick(formData, "status", PROGRAM_STATUSES);
  if (!status) return { error: "Estado no válido." };
  if (status === "closed" && !canCloseAudits(g.ok.roleCode)) {
    return { error: "Tu rol no permite cerrar el programa." };
  }
  if (status !== "closed" && !canManageAudits(g.ok.roleCode)) {
    return { error: "Tu rol no permite cambiar el estado del programa." };
  }
  const closureNote = optional(formData, "closure_note");
  if (status === "closed" && (closureNote === null || closureNote.length < 10)) {
    return { error: "Escribe por qué se cierra el programa." };
  }

  return run(
    () => updateProgramStatus(g.ok!.organizationId, programId, { status, closureNote }),
    () => revalidateAudits(`/quality/audits/programs/${programId}`),
    status === "closed"
      ? "Programa cerrado. Las auditorías que contuvo conservan su historia."
      : "Programa actualizado. El cambio quedó registrado como revisión."
  );
}

// ---------------------------------------------------------------------------
// Auditoría individual (AR-03, AR-08, §18…§23, §43…§46)
// ---------------------------------------------------------------------------

export async function createAuditAction(
  _prev: AuditActionState, formData: FormData
): Promise<AuditActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageAudits(g.ok.roleCode)) {
    return { error: "Tu rol no permite crear auditorías." };
  }
  const code = text(formData, "code");
  const title = text(formData, "title");
  if (code.length < 1) return { error: "Escribe el código de la auditoría." };
  if (title.length < 3) return { error: "Escribe el título de la auditoría." };
  const auditType = pick(formData, "audit_type", AUDIT_TYPES, "internal")!;
  const nature = pick(formData, "nature", AUDIT_NATURES, "planned")!;
  const from = optional(formData, "scheduled_from");
  const to = optional(formData, "scheduled_to");
  if (from && to && to < from) return { error: "La auditoría termina antes de empezar." };

  return run(
    () => createAudit(g.ok!.organizationId, {
      programId: optional(formData, "program_id"),
      code, title, auditType, nature,
      objective: optional(formData, "objective"),
      scopeNote: optional(formData, "scope_note"),
      scheduledFrom: from, scheduledTo: to,
      ownerPositionId: optional(formData, "owner_position_id"),
      priorityNote: optional(formData, "priority_note"),
    }),
    () => revalidateAudits(),
    nature === "extraordinary"
      ? "Auditoría extraordinaria creada. Queda marcada como tal: no nació del "
        + "programa y el informe lo dirá."
      : "Auditoría creada."
  );
}

export async function updateAuditAction(
  _prev: AuditActionState, formData: FormData
): Promise<AuditActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageAudits(g.ok.roleCode)) {
    return { error: "Tu rol no permite editar auditorías." };
  }
  const auditId = text(formData, "audit_id");
  if (!auditId) return { error: "Falta la auditoría." };
  const title = text(formData, "title");
  if (title.length < 3) return { error: "Escribe el título de la auditoría." };

  return run(
    () => updateAudit(g.ok!.organizationId, auditId, {
      title,
      objective: optional(formData, "objective"),
      scopeNote: optional(formData, "scope_note"),
      ownerPositionId: optional(formData, "owner_position_id"),
      priorityNote: optional(formData, "priority_note"),
    }),
    () => revalidateAudits(`/quality/audits/${auditId}`),
    "Auditoría actualizada."
  );
}

/** §44 · Reprogramar conserva la fecha original. No la reescribe. */
export async function rescheduleAuditAction(
  _prev: AuditActionState, formData: FormData
): Promise<AuditActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageAudits(g.ok.roleCode)) {
    return { error: "Tu rol no permite reprogramar auditorías." };
  }
  const auditId = text(formData, "audit_id");
  if (!auditId) return { error: "Falta la auditoría." };
  const reason = text(formData, "reason");
  if (reason.length < 10) return { error: "Escribe por qué se reprograma." };

  return run(
    () => rescheduleAudit(
      auditId, optional(formData, "scheduled_from"),
      optional(formData, "scheduled_to"), reason
    ),
    () => revalidateAudits(`/quality/audits/${auditId}`),
    "Auditoría reprogramada. La fecha original se conserva y la ficha dirá que "
      + "hubo reprogramación."
  );
}

/** §45 · Cancelar no es borrar. La auditoría cancelada sigue contando. */
export async function cancelAuditAction(
  _prev: AuditActionState, formData: FormData
): Promise<AuditActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageAudits(g.ok.roleCode)) {
    return { error: "Tu rol no permite cancelar auditorías." };
  }
  const auditId = text(formData, "audit_id");
  if (!auditId) return { error: "Falta la auditoría." };
  const reason = text(formData, "reason");
  if (reason.length < 10) return { error: "Escribe por qué se cancela." };

  return run(
    () => cancelAudit(auditId, reason),
    () => revalidateAudits(`/quality/audits/${auditId}`),
    "Auditoría cancelada. Sigue existiendo y sigue contando como planificada "
      + "no ejecutada en la cobertura del programa."
  );
}

export async function startExecutionAction(
  _prev: AuditActionState, formData: FormData
): Promise<AuditActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageAudits(g.ok.roleCode)) {
    return { error: "Tu rol no permite ejecutar auditorías." };
  }
  const auditId = text(formData, "audit_id");
  if (!auditId) return { error: "Falta la auditoría." };

  return run(
    () => startAuditExecution(
      g.ok!.organizationId, auditId, text(formData, "executed_from") || todayIso()
    ),
    () => revalidateAudits(`/quality/audits/${auditId}`),
    "Ejecución iniciada."
  );
}

export async function finishExecutionAction(
  _prev: AuditActionState, formData: FormData
): Promise<AuditActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageAudits(g.ok.roleCode)) {
    return { error: "Tu rol no permite cerrar la ejecución." };
  }
  const auditId = text(formData, "audit_id");
  if (!auditId) return { error: "Falta la auditoría." };

  return run(
    () => finishAuditExecution(
      g.ok!.organizationId, auditId,
      text(formData, "executed_to") || todayIso(),
      optional(formData, "conclusions")
    ),
    () => revalidateAudits(`/quality/audits/${auditId}`),
    "Ejecución terminada. Las conclusiones las escribe una persona: el sistema "
      + "no las deduce de los hallazgos."
  );
}

export async function deleteAuditAction(
  _prev: AuditActionState, formData: FormData
): Promise<AuditActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageAudits(g.ok.roleCode)) {
    return { error: "Tu rol no permite eliminar auditorías." };
  }
  const auditId = text(formData, "audit_id");
  if (!auditId) return { error: "Falta la auditoría." };

  return run(
    () => deleteAudit(g.ok!.organizationId, auditId),
    () => revalidateAudits(),
    "Auditoría eliminada."
  );
}

// ---------------------------------------------------------------------------
// Alcance y criterios (AR-04, AR-05, §21, §22)
// ---------------------------------------------------------------------------

export async function addScopeItemAction(
  _prev: AuditActionState, formData: FormData
): Promise<AuditActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageAudits(g.ok.roleCode)) {
    return { error: "Tu rol no permite definir el alcance." };
  }
  const auditId = text(formData, "audit_id");
  if (!auditId) return { error: "Falta la auditoría." };
  const itemKind = pick(formData, "item_kind", SCOPE_ITEM_KINDS);
  if (!itemKind) return { error: "Elige qué entra en el alcance." };

  return run(
    () => addScopeItem(g.ok!.organizationId, auditId, {
      itemKind,
      processId: optional(formData, "process_id"),
      processRevisionId: optional(formData, "process_revision_id"),
      orgUnit: optional(formData, "org_unit"),
      partyId: optional(formData, "party_id"),
      supplierScopeId: optional(formData, "supplier_scope_id"),
      documentId: optional(formData, "document_id"),
      requirementId: optional(formData, "requirement_id"),
      note: optional(formData, "note"),
      positionOrder: num(formData, "position_order") ?? 1,
    }),
    () => revalidateAudits(`/quality/audits/${auditId}`),
    "Elemento añadido al alcance."
  );
}

export async function removeScopeItemAction(
  _prev: AuditActionState, formData: FormData
): Promise<AuditActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageAudits(g.ok.roleCode)) {
    return { error: "Tu rol no permite editar el alcance." };
  }
  const itemId = text(formData, "item_id");
  if (!itemId) return { error: "Falta el elemento." };

  return run(
    () => removeScopeItem(g.ok!.organizationId, itemId),
    () => revalidateAudits(optional(formData, "audit_id")
      ? `/quality/audits/${text(formData, "audit_id")}` : undefined),
    "Elemento retirado del alcance."
  );
}

export async function addCriterionAction(
  _prev: AuditActionState, formData: FormData
): Promise<AuditActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageAudits(g.ok.roleCode)) {
    return { error: "Tu rol no permite definir criterios." };
  }
  const auditId = text(formData, "audit_id");
  if (!auditId) return { error: "Falta la auditoría." };
  const criterionKind = pick(formData, "criterion_kind", CRITERION_KINDS);
  if (!criterionKind) return { error: "Elige el tipo de criterio." };

  return run(
    () => addCriterion(g.ok!.organizationId, auditId, {
      criterionKind,
      requirementId: optional(formData, "requirement_id"),
      documentId: optional(formData, "document_id"),
      documentRevisionId: optional(formData, "document_revision_id"),
      customText: optional(formData, "custom_text"),
      note: optional(formData, "note"),
      positionOrder: num(formData, "position_order") ?? 1,
    }),
    () => revalidateAudits(`/quality/audits/${auditId}`),
    "Criterio añadido. Un criterio es contra qué se audita; no es una pregunta "
      + "de checklist."
  );
}

export async function removeCriterionAction(
  _prev: AuditActionState, formData: FormData
): Promise<AuditActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageAudits(g.ok.roleCode)) {
    return { error: "Tu rol no permite editar criterios." };
  }
  const criterionId = text(formData, "criterion_id");
  if (!criterionId) return { error: "Falta el criterio." };

  return run(
    () => removeCriterion(g.ok!.organizationId, criterionId),
    () => revalidateAudits(optional(formData, "audit_id")
      ? `/quality/audits/${text(formData, "audit_id")}` : undefined),
    "Criterio retirado."
  );
}

// ---------------------------------------------------------------------------
// Equipo, independencia y auditados (AR-10, AR-11, §31…§34)
// ---------------------------------------------------------------------------

export async function addTeamMemberAction(
  _prev: AuditActionState, formData: FormData
): Promise<AuditActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageAudits(g.ok.roleCode)) {
    return { error: "Tu rol no permite formar el equipo auditor." };
  }
  const auditId = text(formData, "audit_id");
  const personId = text(formData, "person_id");
  if (!auditId || !personId) return { error: "Falta la auditoría o la persona." };

  return run(
    () => addTeamMember(g.ok!.organizationId, auditId, {
      personId,
      teamRole: pick(formData, "team_role", TEAM_ROLES, "auditor")!,
      note: optional(formData, "note"),
    }),
    () => revalidateAudits(`/quality/audits/${auditId}`),
    "Miembro añadido al equipo auditor."
  );
}

export async function removeTeamMemberAction(
  _prev: AuditActionState, formData: FormData
): Promise<AuditActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageAudits(g.ok.roleCode)) {
    return { error: "Tu rol no permite editar el equipo auditor." };
  }
  const memberId = text(formData, "member_id");
  if (!memberId) return { error: "Falta el miembro." };

  return run(
    () => removeTeamMember(g.ok!.organizationId, memberId),
    () => revalidateAudits(optional(formData, "audit_id")
      ? `/quality/audits/${text(formData, "audit_id")}` : undefined),
    "Miembro retirado del equipo."
  );
}

/**
 * AR-11 · La comprobación NO declara a nadie independiente. Registra los
 * conflictos que los cargos de la fecha de la auditoría revelan, y deja la
 * decisión a una persona.
 */
export async function checkIndependenceAction(
  _prev: AuditActionState, formData: FormData
): Promise<AuditActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageAudits(g.ok.roleCode)) {
    return { error: "Tu rol no permite comprobar la independencia." };
  }
  const auditId = text(formData, "audit_id");
  if (!auditId) return { error: "Falta la auditoría." };

  try {
    const result = await checkIndependence(auditId);
    revalidateAudits(`/quality/audits/${auditId}`);
    const found = Number(result.conflicts_found ?? 0);
    return {
      ...OK,
      independence: result,
      message: found > 0
        ? `Se detectaron ${found} posibles conflictos. El sistema NO declara a `
          + "nadie independiente: alguien con autoridad debe decidir sobre cada uno."
        : "No se detectaron conflictos con los cargos vigentes en la fecha de la "
          + "auditoría. Eso no es una declaración de independencia: es lo que el "
          + "sistema pudo comprobar.",
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo comprobar la independencia." };
  }
}

export async function decideConflictAction(
  _prev: AuditActionState, formData: FormData
): Promise<AuditActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageAudits(g.ok.roleCode)) {
    return { error: "Tu rol no permite decidir sobre conflictos." };
  }
  const conflictId = text(formData, "conflict_id");
  if (!conflictId) return { error: "Falta el conflicto." };
  const status = pick(formData, "status", CONFLICT_STATUSES);
  if (!status || status === "detected") return { error: "Elige qué se decide." };
  const mitigation = optional(formData, "mitigation");
  if (status === "accepted_with_mitigation" && (mitigation === null || mitigation.length < 10)) {
    return { error: "Escribe la mitigación con la que se acepta el conflicto." };
  }

  return run(
    () => decideConflict(g.ok!.organizationId, conflictId, { status, mitigation }),
    () => revalidateAudits(optional(formData, "audit_id")
      ? `/quality/audits/${text(formData, "audit_id")}` : undefined),
    "Decisión registrada. Queda escrita quién decidió y con qué mitigación."
  );
}

export async function addAuditeeAction(
  _prev: AuditActionState, formData: FormData
): Promise<AuditActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageAudits(g.ok.roleCode)) {
    return { error: "Tu rol no permite registrar auditados." };
  }
  const auditId = text(formData, "audit_id");
  if (!auditId) return { error: "Falta la auditoría." };
  const personId = optional(formData, "person_id");
  const externalName = optional(formData, "external_name");
  if ((personId === null) === (externalName === null)) {
    return { error: "Indica una persona de la empresa O un nombre externo, no ambos." };
  }

  return run(
    () => addAuditee(g.ok!.organizationId, auditId, {
      personId, externalName,
      roleNote: optional(formData, "role_note"),
      processId: optional(formData, "process_id"),
    }),
    () => revalidateAudits(`/quality/audits/${auditId}`),
    "Auditado registrado."
  );
}

export async function removeAuditeeAction(
  _prev: AuditActionState, formData: FormData
): Promise<AuditActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageAudits(g.ok.roleCode)) {
    return { error: "Tu rol no permite editar auditados." };
  }
  const auditeeId = text(formData, "auditee_id");
  if (!auditeeId) return { error: "Falta el auditado." };

  return run(
    () => removeAuditee(g.ok!.organizationId, auditeeId),
    () => revalidateAudits(optional(formData, "audit_id")
      ? `/quality/audits/${text(formData, "audit_id")}` : undefined),
    "Auditado retirado."
  );
}

// ---------------------------------------------------------------------------
// Agenda y reuniones (AR-09, §24, §27)
// ---------------------------------------------------------------------------

export async function addAgendaItemAction(
  _prev: AuditActionState, formData: FormData
): Promise<AuditActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageAudits(g.ok.roleCode)) {
    return { error: "Tu rol no permite editar la agenda." };
  }
  const auditId = text(formData, "audit_id");
  if (!auditId) return { error: "Falta la auditoría." };
  const title = text(formData, "title");
  if (title.length < 3) return { error: "Escribe qué actividad es." };

  return run(
    () => addAgendaItem(g.ok!.organizationId, auditId, {
      activityKind: pick(formData, "activity_kind", AGENDA_ACTIVITY_KINDS, "review")!,
      title,
      scheduledOn: optional(formData, "scheduled_on"),
      startsAtLabel: optional(formData, "starts_at_label"),
      endsAtLabel: optional(formData, "ends_at_label"),
      location: optional(formData, "location"),
      processId: optional(formData, "process_id"),
      responsiblePersonId: optional(formData, "responsible_person_id"),
      note: optional(formData, "note"),
      positionOrder: num(formData, "position_order") ?? 1,
    }),
    () => revalidateAudits(`/quality/audits/${auditId}`),
    "Actividad añadida a la agenda."
  );
}

export async function removeAgendaItemAction(
  _prev: AuditActionState, formData: FormData
): Promise<AuditActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageAudits(g.ok.roleCode)) {
    return { error: "Tu rol no permite editar la agenda." };
  }
  const itemId = text(formData, "item_id");
  if (!itemId) return { error: "Falta la actividad." };

  return run(
    () => removeAgendaItem(g.ok!.organizationId, itemId),
    () => revalidateAudits(optional(formData, "audit_id")
      ? `/quality/audits/${text(formData, "audit_id")}` : undefined),
    "Actividad retirada de la agenda."
  );
}

export async function recordMeetingAction(
  _prev: AuditActionState, formData: FormData
): Promise<AuditActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageAudits(g.ok.roleCode)) {
    return { error: "Tu rol no permite registrar reuniones." };
  }
  const auditId = text(formData, "audit_id");
  if (!auditId) return { error: "Falta la auditoría." };
  const meetingKind = pick(formData, "meeting_kind", MEETING_KINDS);
  if (!meetingKind) return { error: "Elige si es apertura o cierre." };
  const participants = formData.getAll("participants")
    .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    .map((p) => p.trim());

  return run(
    () => recordMeeting(g.ok!.organizationId, auditId, {
      meetingKind,
      heldOn: text(formData, "held_on") || todayIso(),
      notes: optional(formData, "notes"),
      participants,
    }),
    () => revalidateAudits(`/quality/audits/${auditId}`),
    meetingKind === "closing"
      ? "Reunión de cierre registrada. Presentar hallazgos no los convierte en "
        + "no conformidades."
      : "Reunión de apertura registrada."
  );
}

// ---------------------------------------------------------------------------
// Ejecución: notas, muestras, evidencia (AR-12, AR-15, §25…§29)
// ---------------------------------------------------------------------------

export async function addNoteAction(
  _prev: AuditActionState, formData: FormData
): Promise<AuditActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageAudits(g.ok.roleCode)) {
    return { error: "Tu rol no permite registrar notas de auditoría." };
  }
  const auditId = text(formData, "audit_id");
  if (!auditId) return { error: "Falta la auditoría." };
  const body = text(formData, "body");
  if (body.length < 3) return { error: "Escribe la nota." };

  return run(
    () => addNote(g.ok!.organizationId, auditId, {
      noteKind: pick(formData, "note_kind", NOTE_KINDS, "working_note")!,
      body,
      processId: optional(formData, "process_id"),
      agendaItemId: optional(formData, "agenda_item_id"),
      recordedOn: text(formData, "recorded_on") || todayIso(),
      isRestricted: bool(formData, "is_restricted"),
    }),
    () => revalidateAudits(`/quality/audits/${auditId}`),
    "Nota registrada. Una nota de trabajo no es evidencia formal ni hallazgo."
  );
}

export async function addSampleAction(
  _prev: AuditActionState, formData: FormData
): Promise<AuditActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageAudits(g.ok.roleCode)) {
    return { error: "Tu rol no permite registrar muestras." };
  }
  const auditId = text(formData, "audit_id");
  if (!auditId) return { error: "Falta la auditoría." };
  const description = text(formData, "description");
  if (description.length < 3) return { error: "Describe la muestra." };
  const sampleSize = num(formData, "sample_size");
  if (sampleSize === null || sampleSize < 1) {
    return { error: "Indica cuántos elementos se revisaron." };
  }
  const populationSize = num(formData, "population_size");
  if (populationSize !== null && populationSize < sampleSize) {
    return { error: "La muestra no puede ser mayor que la población." };
  }

  return run(
    () => addSample(g.ok!.organizationId, auditId, {
      description,
      populationNote: optional(formData, "population_note"),
      populationSize, sampleSize,
      selectionMethod: optional(formData, "selection_method"),
      processId: optional(formData, "process_id"),
      note: optional(formData, "note"),
    }),
    () => revalidateAudits(`/quality/audits/${auditId}`),
    "Muestra registrada. Revisar una muestra no equivale a revisarlo todo, y el "
      + "informe lo dirá así."
  );
}

export async function addEvidenceAction(
  _prev: AuditActionState, formData: FormData
): Promise<AuditActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageAudits(g.ok.roleCode)) {
    return { error: "Tu rol no permite registrar evidencia." };
  }
  const auditId = text(formData, "audit_id");
  if (!auditId) return { error: "Falta la auditoría." };
  const description = text(formData, "description");
  if (description.length < 3) return { error: "Describe la evidencia." };
  const evidenceKind = pick(formData, "evidence_kind", EVIDENCE_KINDS);
  if (!evidenceKind) return { error: "Elige el tipo de evidencia." };

  return run(
    () => addEvidence(g.ok!.organizationId, auditId, {
      evidenceKind, description,
      documentId: optional(formData, "document_id"),
      documentRevisionId: optional(formData, "document_revision_id"),
      processId: optional(formData, "process_id"),
      indicatorId: optional(formData, "indicator_id"),
      measurementId: optional(formData, "measurement_id"),
      supplierEvaluationId: optional(formData, "supplier_evaluation_id"),
      riskId: optional(formData, "risk_id"),
      caseId: optional(formData, "case_id"),
      externalEvidenceId: optional(formData, "external_evidence_id"),
      sampleId: optional(formData, "sample_id"),
      collectedOn: text(formData, "collected_on") || todayIso(),
      note: optional(formData, "note"),
    }),
    () => revalidateAudits(`/quality/audits/${auditId}`),
    "Evidencia registrada. Queda REFERENCIADA a lo que ya existe: no se creó "
      + "ninguna copia."
  );
}

export async function removeEvidenceAction(
  _prev: AuditActionState, formData: FormData
): Promise<AuditActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageAudits(g.ok.roleCode)) {
    return { error: "Tu rol no permite editar la evidencia." };
  }
  const evidenceId = text(formData, "evidence_id");
  if (!evidenceId) return { error: "Falta la evidencia." };

  return run(
    () => removeEvidence(g.ok!.organizationId, evidenceId),
    () => revalidateAudits(optional(formData, "audit_id")
      ? `/quality/audits/${text(formData, "audit_id")}` : undefined),
    "Evidencia retirada de la auditoría. Lo referenciado sigue intacto."
  );
}

// ---------------------------------------------------------------------------
// Checklists (AR-06, §35…§38)
// ---------------------------------------------------------------------------

export async function createChecklistAction(
  _prev: AuditActionState, formData: FormData
): Promise<AuditActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageAudits(g.ok.roleCode)) {
    return { error: "Tu rol no permite crear checklists." };
  }
  const name = text(formData, "name");
  if (name.length < 3) return { error: "Escribe el nombre del checklist." };

  return run(
    async () => {
      const r = await createChecklist(g.ok!.organizationId, {
        code: optional(formData, "code"), name,
        description: optional(formData, "description"),
      });
      return r.checklistId;
    },
    () => revalidateAudits("/quality/audits/checklists"),
    "Checklist creado con su primera versión en borrador. El checklist es una "
      + "AYUDA: la auditoría no depende de él."
  );
}

export async function createChecklistVersionAction(
  _prev: AuditActionState, formData: FormData
): Promise<AuditActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageAudits(g.ok.roleCode)) {
    return { error: "Tu rol no permite crear versiones de checklist." };
  }
  const checklistId = text(formData, "checklist_id");
  if (!checklistId) return { error: "Falta el checklist." };

  return run(
    () => createChecklistVersion(
      g.ok!.organizationId, checklistId, optional(formData, "change_note")
    ),
    () => revalidateAudits(`/quality/audits/checklists/${checklistId}`),
    "Versión nueva creada a partir de la anterior. La versión publicada NO se "
      + "tocó: las auditorías que la usaron siguen leyendo lo que contestaron."
  );
}

export async function addChecklistItemAction(
  _prev: AuditActionState, formData: FormData
): Promise<AuditActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageAudits(g.ok.roleCode)) {
    return { error: "Tu rol no permite editar checklists." };
  }
  const versionId = text(formData, "version_id");
  if (!versionId) return { error: "Falta la versión." };
  const prompt = text(formData, "prompt");
  if (prompt.length < 3) return { error: "Escribe la pregunta." };
  const stableKey = text(formData, "stable_key")
    || prompt.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

  return run(
    () => addChecklistItem(g.ok!.organizationId, versionId, {
      stableKey, positionOrder: num(formData, "position_order") ?? 1, prompt,
      guidance: optional(formData, "guidance"),
      requirementId: optional(formData, "requirement_id"),
      documentId: optional(formData, "document_id"),
      criterionText: optional(formData, "criterion_text"),
    }),
    () => revalidateAudits(optional(formData, "checklist_id")
      ? `/quality/audits/checklists/${text(formData, "checklist_id")}` : undefined),
    "Pregunta añadida. Una pregunta de checklist NO es un criterio de auditoría."
  );
}

export async function removeChecklistItemAction(
  _prev: AuditActionState, formData: FormData
): Promise<AuditActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageAudits(g.ok.roleCode)) {
    return { error: "Tu rol no permite editar checklists." };
  }
  const itemId = text(formData, "item_id");
  if (!itemId) return { error: "Falta la pregunta." };

  return run(
    () => removeChecklistItem(g.ok!.organizationId, itemId),
    () => revalidateAudits(optional(formData, "checklist_id")
      ? `/quality/audits/checklists/${text(formData, "checklist_id")}` : undefined),
    "Pregunta retirada de la versión en borrador."
  );
}

export async function publishChecklistVersionAction(
  _prev: AuditActionState, formData: FormData
): Promise<AuditActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageAudits(g.ok.roleCode)) {
    return { error: "Tu rol no permite publicar versiones de checklist." };
  }
  const versionId = text(formData, "version_id");
  if (!versionId) return { error: "Falta la versión." };

  return run(
    () => publishChecklistVersion(
      versionId, text(formData, "effective_from") || todayIso(),
      optional(formData, "change_note")
    ),
    () => revalidateAudits(optional(formData, "checklist_id")
      ? `/quality/audits/checklists/${text(formData, "checklist_id")}` : undefined),
    "Versión publicada. A partir de ahora es la que se puede usar, y ya no se edita."
  );
}

export async function startChecklistRunAction(
  _prev: AuditActionState, formData: FormData
): Promise<AuditActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageAudits(g.ok.roleCode)) {
    return { error: "Tu rol no permite usar checklists en una auditoría." };
  }
  const auditId = text(formData, "audit_id");
  const checklistId = text(formData, "checklist_id");
  const versionId = text(formData, "version_id");
  if (!auditId || !checklistId || !versionId) {
    return { error: "Falta la auditoría, el checklist o la versión." };
  }

  return run(
    () => startChecklistRun(g.ok!.organizationId, auditId, checklistId, versionId),
    () => revalidateAudits(`/quality/audits/${auditId}`),
    "Checklist en uso. Queda anotada la VERSIÓN exacta que se usó."
  );
}

/** AR-15 · Contestar una pregunta no crea hallazgo. Nunca, en ningún caso. */
export async function recordCheckResultAction(
  _prev: AuditActionState, formData: FormData
): Promise<AuditActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageAudits(g.ok.roleCode)) {
    return { error: "Tu rol no permite contestar checklists." };
  }
  const runId = text(formData, "run_id");
  const itemId = text(formData, "item_id");
  if (!runId || !itemId) return { error: "Falta el recorrido o la pregunta." };
  const outcome = pick(formData, "outcome", CHECK_OUTCOMES);
  if (!outcome) return { error: "Elige la respuesta." };

  return run(
    () => recordCheckResult(
      g.ok!.organizationId, runId, itemId, outcome, optional(formData, "note")
    ),
    () => revalidateAudits(optional(formData, "audit_id")
      ? `/quality/audits/${text(formData, "audit_id")}` : undefined),
    outcome === "suspected_gap"
      ? "Respuesta registrada. Marcar una posible brecha NO crea un hallazgo: "
        + "el hallazgo lo redacta el auditor si decide levantarlo."
      : "Respuesta registrada."
  );
}

// ---------------------------------------------------------------------------
// Hallazgos (AR-13, AR-14, §30, §47…§50)
// ---------------------------------------------------------------------------

export async function recordFindingAction(
  _prev: AuditActionState, formData: FormData
): Promise<AuditActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageAudits(g.ok.roleCode)) {
    return { error: "Tu rol no permite levantar hallazgos." };
  }
  const auditId = text(formData, "audit_id");
  if (!auditId) return { error: "Falta la auditoría." };
  const code = text(formData, "code");
  if (code.length < 1) return { error: "Escribe el código del hallazgo." };
  const statement = text(formData, "statement");
  if (statement.length < 10) return { error: "Escribe el enunciado del hallazgo." };
  const proposedClassification = pick(
    formData, "proposed_classification", FINDING_CLASSIFICATIONS, "not_conclusive"
  )!;

  return run(
    () => recordFinding(g.ok!.organizationId, auditId, {
      code,
      criterionId: optional(formData, "criterion_id"),
      checkResultId: optional(formData, "check_result_id"),
      processId: optional(formData, "process_id"),
      statement,
      detail: optional(formData, "detail"),
      locationText: optional(formData, "location_text"),
      proposedClassification,
      proposedSeverity: pick(formData, "proposed_severity", FINDING_SEVERITIES) ?? null,
      raisedOn: text(formData, "raised_on") || todayIso(),
    }),
    () => revalidateAudits(`/quality/audits/${auditId}`),
    proposedClassification === "nonconformity_suspected"
      ? "Hallazgo registrado como POSIBLE no conformidad. Es una propuesta del "
        + "auditor: no se creó ninguna no conformidad y el conteo de NC no cambió."
      : "Hallazgo registrado. Un hallazgo no es una no conformidad."
  );
}

export async function updateFindingAction(
  _prev: AuditActionState, formData: FormData
): Promise<AuditActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageAudits(g.ok.roleCode)) {
    return { error: "Tu rol no permite editar hallazgos." };
  }
  const findingId = text(formData, "finding_id");
  if (!findingId) return { error: "Falta el hallazgo." };
  const statement = text(formData, "statement");
  if (statement.length < 10) return { error: "Escribe el enunciado del hallazgo." };

  return run(
    () => updateFinding(g.ok!.organizationId, findingId, {
      statement,
      detail: optional(formData, "detail"),
      locationText: optional(formData, "location_text"),
      proposedClassification: pick(
        formData, "proposed_classification", FINDING_CLASSIFICATIONS, "not_conclusive"
      )!,
      proposedSeverity: pick(formData, "proposed_severity", FINDING_SEVERITIES) ?? null,
      criterionId: optional(formData, "criterion_id"),
      processId: optional(formData, "process_id"),
    }),
    () => revalidateAudits(optional(formData, "audit_id")
      ? `/quality/audits/${text(formData, "audit_id")}` : undefined),
    "Hallazgo actualizado."
  );
}

export async function linkFindingEvidenceAction(
  _prev: AuditActionState, formData: FormData
): Promise<AuditActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageAudits(g.ok.roleCode)) {
    return { error: "Tu rol no permite vincular evidencia." };
  }
  const findingId = text(formData, "finding_id");
  const evidenceId = text(formData, "evidence_id");
  if (!findingId || !evidenceId) return { error: "Falta el hallazgo o la evidencia." };

  return run(
    () => linkFindingEvidence(
      g.ok!.organizationId, findingId, evidenceId, optional(formData, "note")
    ),
    () => revalidateAudits(optional(formData, "audit_id")
      ? `/quality/audits/${text(formData, "audit_id")}` : undefined),
    "Evidencia vinculada al hallazgo."
  );
}

export async function unlinkFindingEvidenceAction(
  _prev: AuditActionState, formData: FormData
): Promise<AuditActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageAudits(g.ok.roleCode)) {
    return { error: "Tu rol no permite editar la evidencia del hallazgo." };
  }
  const linkId = text(formData, "link_id");
  if (!linkId) return { error: "Falta el vínculo." };

  return run(
    () => unlinkFindingEvidence(g.ok!.organizationId, linkId),
    () => revalidateAudits(optional(formData, "audit_id")
      ? `/quality/audits/${text(formData, "audit_id")}` : undefined),
    "Evidencia desvinculada del hallazgo."
  );
}

/** AR-14 · Evaluar es un acto de autoridad. No lo hace el auditor. */
export async function evaluateFindingAction(
  _prev: AuditActionState, formData: FormData
): Promise<AuditActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const findingId = text(formData, "finding_id");
  if (!findingId) return { error: "Falta el hallazgo." };
  const status = pick(formData, "status", FINDING_EVALUATION_STATUSES);
  if (!status || status === "pending") return { error: "Elige el resultado de la evaluación." };
  if (status === "escalated") {
    return {
      error: "Escalar a caso no se hace desde aquí: usa «Abrir caso desde el "
        + "hallazgo», que es el acto explícito que crea el caso.",
    };
  }
  const note = text(formData, "note");
  if (note.length < 10) return { error: "Escribe la razón de la evaluación." };

  return run(
    () => evaluateFinding(findingId, status, note),
    () => revalidateAudits(optional(formData, "audit_id")
      ? `/quality/audits/${text(formData, "audit_id")}` : undefined),
    status === "dismissed"
      ? "Hallazgo desestimado. Sigue en el registro: desestimar no es borrar."
      : "Hallazgo evaluado. Evaluarlo no lo convierte en no conformidad: eso "
        + "ocurre, si ocurre, en el caso que se abra."
  );
}

/**
 * AR-14 · El único camino de un hallazgo a un caso. Explícito, con autor y con
 * fecha. Y el caso que nace tampoco es todavía una No Conformidad: lo será si
 * el motor de casos lo clasifica así.
 */
export async function openCaseFromFindingAction(
  _prev: AuditActionState, formData: FormData
): Promise<AuditActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageAudits(g.ok.roleCode)) {
    return { error: "Tu rol no permite escalar hallazgos a casos." };
  }
  const findingId = text(formData, "finding_id");
  if (!findingId) return { error: "Falta el hallazgo." };

  return run(
    () => openCaseFromFinding(
      findingId, optional(formData, "title"), optional(formData, "description")
    ),
    () => revalidateAudits(optional(formData, "audit_id")
      ? `/quality/audits/${text(formData, "audit_id")}` : undefined),
    "Caso abierto desde el hallazgo. El caso vive en el motor de casos: es ahí "
      + "donde se decide si llega a ser no conformidad."
  );
}

// ---------------------------------------------------------------------------
// Informe y cierre (AR-16, AR-17, AR-19, §39…§42, §52…§55)
// ---------------------------------------------------------------------------

export async function issueReportAction(
  _prev: AuditActionState, formData: FormData
): Promise<AuditActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageAudits(g.ok.roleCode)) {
    return { error: "Tu rol no permite emitir informes de auditoría." };
  }
  const auditId = text(formData, "audit_id");
  if (!auditId) return { error: "Falta la auditoría." };

  return run(
    () => issueReport(auditId, optional(formData, "summary")),
    () => revalidateAudits(`/quality/audits/${auditId}`),
    "Informe emitido. Es una FOTO congelada de la auditoría en este momento: si "
      + "algo cambia después, hará falta un informe nuevo que corrija a este. "
      + "Trazaloop administra auditorías; no concede certificación."
  );
}

/** AR-19 · Cerrar la auditoría NO cierra las acciones que abrió. */
export async function closeAuditAction(
  _prev: AuditActionState, formData: FormData
): Promise<AuditActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canCloseAudits(g.ok.roleCode)) {
    return { error: "Tu rol no permite cerrar auditorías." };
  }
  const auditId = text(formData, "audit_id");
  if (!auditId) return { error: "Falta la auditoría." };
  const closureNote = text(formData, "closure_note");
  if (closureNote.length < 10) return { error: "Escribe la razón del cierre." };

  return run(
    () => closeAudit(auditId, closureNote, optional(formData, "followup_note")),
    () => revalidateAudits(`/quality/audits/${auditId}`),
    "Auditoría cerrada. Las acciones correctivas que abrió siguen su propio "
      + "curso: auditoría cerrada NO significa acciones eficaces."
  );
}

export async function scanAuditsAction(
  _prev: AuditActionState, _formData: FormData
): Promise<AuditActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageAudits(g.ok.roleCode)) {
    return { error: "Tu rol no permite ejecutar el barrido de auditorías." };
  }

  try {
    const created = await scanAudits(g.ok.organizationId);
    revalidateAudits();
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
