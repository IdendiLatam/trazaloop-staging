"use server";

import { revalidatePath } from "next/cache";
import { requireQualityForAction } from "@/lib/auth/require-quality-module";
import { requireSession } from "@/lib/auth/require-session";
import { checkQualityCanMutate } from "@/server/actions/module-plans";
import {
  addCompetenceEvidence, addCycleMember, addEvaluationItem, addKnowledgeHolder,
  addLessonProposal, addParticipant, addPlanItem, addPositionFunction, addTransferItem,
  assignPersonToPosition, closeEvaluation, completeTransferItem, createCompetency,
  createDevelopmentNeed, createDevelopmentPlan, createEvaluation, createKnowledgeItem,
  createLearningActivity, createLesson, createOrgUnit, createPerformanceCycle,
  createPerson, createPositionVersionDraft, createTransferPlan, decideLessonProposal,
  dismissSignal, endAssignment, endKnowledgeHolder, planEffectivenessReview,
  promoteSignalToRisk, publishLesson, publishPositionVersion, recordAttendance,
  recordLearningResult, recordPersonCompetence, removePositionFunction,
  removePositionRequirement, retirePerson, reviewEffectiveness, scanPeopleSignals,
  seedCompetencyLevels, setActivityStatus, setCycleStatus, setPositionRequirement,
  updateOrgUnit, updatePerson, updatePositionStructure, upsertCompetencyLevel,
  verifyTransfer,
} from "@/lib/db/quality-people";
import {
  ACTIVITY_KINDS, ASSIGNMENT_TYPES, ATTENDANCE_STATUSES, canManagePeople,
  canManageStructure, COMPETENCE_METHODS, CRITICALITIES, DEVELOPMENT_KINDS,
  DOCUMENTATION_STATUSES, EFFECTIVENESS_METHODS, HOLDER_LEVELS, KNOWLEDGE_KINDS,
  LEARNING_RESULTS, LESSON_ORIGINS, NEED_ORIGINS, PERFORMANCE_RESULTS,
  PERSON_RELATIONSHIPS, POSITION_FUNCTION_KINDS, PROPOSAL_KINDS, TRANSFER_METHODS,
} from "@/lib/domain/quality-people";

/**
 * Trazaloop · QUALITY-06 · Acciones de servidor del dominio Personas.
 *
 * EL REPARTO
 *
 * · Lo que solo REGISTRA —crear una persona, describir un conocimiento,
 *   inscribir a alguien en una actividad— es escritura normal bajo RLS.
 * · Lo que DECIDE —publicar un perfil, declarar competencia, evaluar eficacia,
 *   cerrar una evaluación, verificar una transferencia, promover una señal a
 *   riesgo— pasa por una RPC de 0123.
 *
 * LO QUE NINGUNA DE ESTAS FUNCIONES HACE
 *
 * Ninguna calcula un puntaje de una persona, ninguna ordena personas, ninguna
 * marca eficaz una acción por haberse ejecutado y ninguna convierte una señal
 * de continuidad en un riesgo por su cuenta. Si alguna vez aparece aquí una
 * función que haga cualquiera de esas cuatro cosas, el dominio se rompió.
 */

export type PeopleActionState = {
  error: string | null;
  success?: boolean;
  message?: string | null;
  id?: string;
};

const OK: PeopleActionState = { error: null, success: true, message: null };

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
function pick<T extends readonly string[]>(
  form: FormData, name: string, allowed: T, fallback?: T[number]
): T[number] | null {
  const v = text(form, name);
  if (allowed.includes(v as T[number])) return v as T[number];
  return fallback ?? null;
}
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function revalidatePeople(personId?: string) {
  revalidatePath("/quality");
  revalidatePath("/quality/people");
  revalidatePath("/quality/tasks");
  if (personId) revalidatePath(`/quality/people/${personId}`);
}

async function run(
  fn: () => Promise<void | string>,
  after: () => void,
  message: string
): Promise<PeopleActionState> {
  try {
    const id = await fn();
    after();
    return { ...OK, message, id: typeof id === "string" ? id : undefined };
  } catch (e) {
    // El mensaje viene de la base y ya está escrito para una persona. No se
    // adorna: si dice «todavía hay actividades sin cerrar», eso es lo útil.
    return { error: e instanceof Error ? e.message : "No se pudo completar la operación." };
  }
}

// ---------------------------------------------------------------------------
// Estructura de la empresa (§9, §10)
// ---------------------------------------------------------------------------

export async function createOrgUnitAction(
  _prev: PeopleActionState, formData: FormData
): Promise<PeopleActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageStructure(g.ok.roleCode)) {
    return { error: "Tu rol no permite definir la estructura de la empresa." };
  }
  const name = text(formData, "name");
  if (name.length < 2) return { error: "Ponle un nombre a la unidad." };

  return run(
    () => createOrgUnit(g.ok!.organizationId, {
      name, code: optional(formData, "code"),
      description: optional(formData, "description"),
      parentId: optional(formData, "parent_id"),
    }),
    () => revalidatePath("/quality/people/structure"),
    "Unidad creada."
  );
}

export async function updateOrgUnitAction(
  _prev: PeopleActionState, formData: FormData
): Promise<PeopleActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageStructure(g.ok.roleCode)) {
    return { error: "Tu rol no permite definir la estructura de la empresa." };
  }
  const id = text(formData, "unit_id");
  const name = text(formData, "name");
  if (!id) return { error: "Falta la unidad." };
  if (name.length < 2) return { error: "Ponle un nombre a la unidad." };

  return run(
    () => updateOrgUnit(g.ok!.organizationId, id, {
      name, code: optional(formData, "code"),
      description: optional(formData, "description"),
      parentId: optional(formData, "parent_id"),
      isActive: bool(formData, "is_active"),
    }),
    () => revalidatePath("/quality/people/structure"),
    "Unidad actualizada."
  );
}

export async function updatePositionStructureAction(
  _prev: PeopleActionState, formData: FormData
): Promise<PeopleActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageStructure(g.ok.roleCode)) {
    return { error: "Tu rol no permite cambiar la estructura de cargos." };
  }
  const positionId = text(formData, "position_id");
  if (!positionId) return { error: "Falta el cargo." };

  return run(
    () => updatePositionStructure(g.ok!.organizationId, positionId, {
      orgUnitId: optional(formData, "org_unit_id"),
      parentPositionId: optional(formData, "parent_position_id"),
      isCritical: bool(formData, "is_critical"),
    }),
    () => { revalidatePath("/quality/people/structure"); revalidatePath("/quality/positions"); },
    "Cargo actualizado."
  );
}

// ---------------------------------------------------------------------------
// Personas y asignaciones (§14–§17)
// ---------------------------------------------------------------------------

export async function createPersonAction(
  _prev: PeopleActionState, formData: FormData
): Promise<PeopleActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManagePeople(g.ok.roleCode)) {
    return { error: "Tu rol no permite crear fichas de personas." };
  }
  const fullName = text(formData, "full_name");
  if (fullName.length < 3) return { error: "Escribe el nombre completo de la persona." };

  return run(
    () => createPerson(g.ok!.organizationId, {
      fullName,
      employeeCode: optional(formData, "employee_code"),
      workEmail: optional(formData, "work_email"),
      // PC-05 · Vincular una cuenta es OPCIONAL. Una persona sin login es una
      // persona igual, y la mayoría de una planta no entra nunca al sistema.
      profileId: optional(formData, "profile_id"),
      relationship: pick(formData, "relationship", PERSON_RELATIONSHIPS, "employee")!,
      joinedOn: optional(formData, "joined_on"),
      notes: optional(formData, "notes"),
    }),
    () => revalidatePeople(),
    "Persona registrada."
  );
}

export async function updatePersonAction(
  _prev: PeopleActionState, formData: FormData
): Promise<PeopleActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManagePeople(g.ok.roleCode)) {
    return { error: "Tu rol no permite editar fichas de personas." };
  }
  const personId = text(formData, "person_id");
  const fullName = text(formData, "full_name");
  if (!personId) return { error: "Falta la persona." };
  if (fullName.length < 3) return { error: "Escribe el nombre completo de la persona." };

  return run(
    () => updatePerson(g.ok!.organizationId, personId, {
      fullName,
      employeeCode: optional(formData, "employee_code"),
      workEmail: optional(formData, "work_email"),
      profileId: optional(formData, "profile_id"),
      relationship: pick(formData, "relationship", PERSON_RELATIONSHIPS, "employee")!,
      notes: optional(formData, "notes"),
    }),
    () => revalidatePeople(personId),
    "Ficha actualizada."
  );
}

/** §50/§77 · Desvincular conserva TODO. No hay ninguna acción que borre a una
 *  persona con historia: el veredicto de 0123 lo impide y esta pantalla ni lo
 *  ofrece. */
export async function retirePersonAction(
  _prev: PeopleActionState, formData: FormData
): Promise<PeopleActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManagePeople(g.ok.roleCode)) {
    return { error: "Tu rol no permite desvincular personas." };
  }
  const personId = text(formData, "person_id");
  if (!personId) return { error: "Falta la persona." };
  const leftOn = optional(formData, "left_on") ?? todayIso();

  return run(
    () => retirePerson(g.ok!.organizationId, personId, leftOn),
    () => revalidatePeople(personId),
    "Persona desvinculada. Su historia se conserva íntegra."
  );
}

export async function assignPositionAction(
  _prev: PeopleActionState, formData: FormData
): Promise<PeopleActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManagePeople(g.ok.roleCode)) {
    return { error: "Tu rol no permite asignar cargos." };
  }
  const personId = text(formData, "person_id");
  const positionId = text(formData, "position_id");
  if (!personId || !positionId) return { error: "Falta la persona o el cargo." };

  return run(
    () => assignPersonToPosition(g.ok!.organizationId, {
      personId, positionId,
      assignmentType: pick(formData, "assignment_type", ASSIGNMENT_TYPES, "holder")!,
      effectiveFrom: optional(formData, "effective_from") ?? todayIso(),
      notes: optional(formData, "notes"),
    }),
    () => revalidatePeople(personId),
    "Asignación registrada."
  );
}

export async function endAssignmentAction(
  _prev: PeopleActionState, formData: FormData
): Promise<PeopleActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManagePeople(g.ok.roleCode)) {
    return { error: "Tu rol no permite cerrar asignaciones." };
  }
  const assignmentId = text(formData, "assignment_id");
  if (!assignmentId) return { error: "Falta la asignación." };

  return run(
    () => endAssignment(
      g.ok!.organizationId, assignmentId, optional(formData, "effective_to") ?? todayIso()
    ),
    () => revalidatePeople(optional(formData, "person_id") ?? undefined),
    "Asignación cerrada. La anterior sigue diciendo quién ocupaba el cargo y hasta cuándo."
  );
}

// ---------------------------------------------------------------------------
// Perfiles de cargo (§12, §13)
// ---------------------------------------------------------------------------

export async function createPositionVersionAction(
  _prev: PeopleActionState, formData: FormData
): Promise<PeopleActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageStructure(g.ok.roleCode)) {
    return { error: "Tu rol no permite editar perfiles de cargo." };
  }
  const positionId = text(formData, "position_id");
  if (!positionId) return { error: "Falta el cargo." };

  return run(
    () => createPositionVersionDraft(g.ok!.organizationId, positionId, {
      purpose: optional(formData, "purpose"),
      scope: optional(formData, "scope"),
      authority: optional(formData, "authority"),
      education: optional(formData, "education"),
      experience: optional(formData, "experience"),
      changeNote: optional(formData, "change_note"),
    }),
    () => revalidatePath(`/quality/people/positions/${positionId}`),
    "Perfil creado como borrador. Publícalo cuando esté completo."
  );
}

export async function publishPositionVersionAction(
  _prev: PeopleActionState, formData: FormData
): Promise<PeopleActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const versionId = text(formData, "version_id");
  if (!versionId) return { error: "Falta el perfil." };

  return run(
    () => publishPositionVersion(
      versionId, optional(formData, "effective_from") ?? todayIso(),
      optional(formData, "change_note")
    ),
    () => { revalidatePath("/quality/people"); revalidatePath("/quality/positions"); },
    "Perfil publicado. El anterior queda sustituido y conserva sus requisitos: "
      + "una evaluación pasada se sigue leyendo contra lo que se exigía entonces."
  );
}

export async function addPositionFunctionAction(
  _prev: PeopleActionState, formData: FormData
): Promise<PeopleActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageStructure(g.ok.roleCode)) {
    return { error: "Tu rol no permite editar perfiles de cargo." };
  }
  const versionId = text(formData, "version_id");
  const description = text(formData, "description");
  if (!versionId) return { error: "Falta el perfil." };
  if (description.length < 3) return { error: "Describe la función." };

  return run(
    () => addPositionFunction(g.ok!.organizationId, versionId, {
      description,
      kind: pick(formData, "function_kind", POSITION_FUNCTION_KINDS, "responsibility")!,
      processId: optional(formData, "process_id"),
      order: Number(text(formData, "position_order") || "1"),
    }),
    () => revalidatePath("/quality/people"),
    "Función añadida."
  );
}

export async function removePositionFunctionAction(
  _prev: PeopleActionState, formData: FormData
): Promise<PeopleActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageStructure(g.ok.roleCode)) {
    return { error: "Tu rol no permite editar perfiles de cargo." };
  }
  const id = text(formData, "function_id");
  if (!id) return { error: "Falta la función." };
  return run(
    () => removePositionFunction(g.ok!.organizationId, id),
    () => revalidatePath("/quality/people"),
    "Función eliminada."
  );
}

// ---------------------------------------------------------------------------
// Competencia (§18–§25)
// ---------------------------------------------------------------------------

export async function createCompetencyAction(
  _prev: PeopleActionState, formData: FormData
): Promise<PeopleActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageStructure(g.ok.roleCode)) {
    return { error: "Tu rol no permite definir competencias." };
  }
  const name = text(formData, "name");
  if (name.length < 3) return { error: "Ponle nombre a la competencia." };

  return run(
    () => createCompetency(g.ok!.organizationId, {
      name, code: optional(formData, "code"),
      description: optional(formData, "description"),
      category: optional(formData, "category"),
    }),
    () => revalidatePath("/quality/people/competencies"),
    "Competencia creada. Es reutilizable: se exige desde los cargos, no se copia dentro de ellos."
  );
}

export async function seedCompetencyLevelsAction(
  _prev: PeopleActionState, _formData: FormData
): Promise<PeopleActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageStructure(g.ok.roleCode)) {
    return { error: "Tu rol no permite configurar la escala." };
  }
  return run(
    async () => { await seedCompetencyLevels(g.ok!.organizationId); },
    () => revalidatePath("/quality/people/competencies"),
    "Escala de partida creada. Puedes cambiar los niveles y sus nombres: es tu escala, no la nuestra."
  );
}

export async function upsertCompetencyLevelAction(
  _prev: PeopleActionState, formData: FormData
): Promise<PeopleActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageStructure(g.ok.roleCode)) {
    return { error: "Tu rol no permite configurar la escala." };
  }
  const label = text(formData, "label");
  const value = Number(text(formData, "level_value"));
  if (label.length < 2) return { error: "Ponle nombre al nivel." };
  if (!Number.isInteger(value) || value < 0) return { error: "El nivel tiene que ser un número." };

  return run(
    () => upsertCompetencyLevel(g.ok!.organizationId, {
      id: optional(formData, "level_id") ?? undefined,
      value, label, description: optional(formData, "description"),
    }),
    () => revalidatePath("/quality/people/competencies"),
    "Escala actualizada."
  );
}

export async function setRequirementAction(
  _prev: PeopleActionState, formData: FormData
): Promise<PeopleActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageStructure(g.ok.roleCode)) {
    return { error: "Tu rol no permite fijar requisitos de competencia." };
  }
  const versionId = text(formData, "position_version_id");
  const competencyId = text(formData, "competency_id");
  const level = Number(text(formData, "required_level"));
  if (!versionId || !competencyId) return { error: "Falta el perfil o la competencia." };
  if (!Number.isInteger(level) || level < 0) return { error: "El nivel exigido tiene que ser un número." };

  return run(
    () => setPositionRequirement(g.ok!.organizationId, {
      positionVersionId: versionId, competencyId, requiredLevel: level,
      isMandatory: bool(formData, "is_mandatory"),
      note: optional(formData, "note"),
    }),
    () => revalidatePath("/quality/people"),
    "Requisito fijado sobre esta versión del perfil."
  );
}

export async function removeRequirementAction(
  _prev: PeopleActionState, formData: FormData
): Promise<PeopleActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageStructure(g.ok.roleCode)) {
    return { error: "Tu rol no permite fijar requisitos de competencia." };
  }
  const id = text(formData, "requirement_id");
  if (!id) return { error: "Falta el requisito." };
  return run(
    () => removePositionRequirement(g.ok!.organizationId, id),
    () => revalidatePath("/quality/people"),
    "Requisito retirado de esta versión."
  );
}

/**
 * §22 · Declarar competencia demostrada. Es una DECISIÓN, con su método y su
 * fundamento, no un «sí sabe». Sustituye la anterior sin borrarla.
 */
export async function recordCompetenceAction(
  _prev: PeopleActionState, formData: FormData
): Promise<PeopleActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const personId = text(formData, "person_id");
  const competencyId = text(formData, "competency_id");
  const level = Number(text(formData, "demonstrated_level"));
  if (!personId || !competencyId) return { error: "Falta la persona o la competencia." };
  if (!Number.isInteger(level) || level < 0) return { error: "El nivel demostrado tiene que ser un número." };

  return run(
    () => recordPersonCompetence({
      personId, competencyId, level,
      method: pick(formData, "method", COMPETENCE_METHODS, "observation")!,
      rationale: optional(formData, "rationale"),
      assessedOn: optional(formData, "assessed_on") ?? todayIso(),
      validUntil: optional(formData, "valid_until"),
    }),
    () => revalidatePeople(personId),
    "Competencia registrada. La evaluación anterior se conserva como sustituida."
  );
}

export async function addEvidenceAction(
  _prev: PeopleActionState, formData: FormData
): Promise<PeopleActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManagePeople(g.ok.roleCode)) {
    return { error: "Tu rol no permite añadir evidencia de competencia." };
  }
  const personCompetencyId = text(formData, "person_competency_id");
  const title = text(formData, "title");
  if (!personCompetencyId) return { error: "Falta la competencia evaluada." };
  if (title.length < 3) return { error: "Ponle nombre a la evidencia." };

  return run(
    () => addCompetenceEvidence(g.ok!.organizationId, {
      personCompetencyId, kind: text(formData, "evidence_kind") || "certification",
      title, issuer: optional(formData, "issuer"),
      issuedOn: optional(formData, "issued_on"),
      // PC-24 · Sin fecha de vencimiento = no vence. Es una respuesta
      // legítima, no un campo que se olvidó rellenar.
      expiresOn: optional(formData, "expires_on"),
      referenceNote: optional(formData, "reference_note"),
      documentId: optional(formData, "document_id"),
    }),
    () => revalidatePeople(optional(formData, "person_id") ?? undefined),
    "Evidencia registrada."
  );
}

// ---------------------------------------------------------------------------
// Desarrollo (§26–§35)
// ---------------------------------------------------------------------------

export async function createNeedAction(
  _prev: PeopleActionState, formData: FormData
): Promise<PeopleActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManagePeople(g.ok.roleCode)) {
    return { error: "Tu rol no permite crear necesidades de desarrollo." };
  }
  const title = text(formData, "title");
  if (title.length < 3) return { error: "Describe la necesidad." };

  return run(
    () => createDevelopmentNeed(g.ok!.organizationId, {
      title, description: optional(formData, "description"),
      origin: pick(formData, "origin_kind", NEED_ORIGINS, "manual")!,
      personId: optional(formData, "person_id"),
      positionId: optional(formData, "position_id"),
      competencyId: optional(formData, "competency_id"),
      originNote: optional(formData, "origin_note"),
      priority: text(formData, "priority") || "normal",
    }),
    () => revalidatePath("/quality/people/development"),
    "Necesidad registrada. Puede resolverse con formación, pero también con práctica, "
      + "mentoría, rotación o acompañamiento."
  );
}

export async function createPlanAction(
  _prev: PeopleActionState, formData: FormData
): Promise<PeopleActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManagePeople(g.ok.roleCode)) {
    return { error: "Tu rol no permite crear planes de desarrollo." };
  }
  const year = Number(text(formData, "year"));
  const title = text(formData, "title");
  if (!Number.isInteger(year) || year < 2000) return { error: "Indica el año del plan." };
  if (title.length < 3) return { error: "Ponle un título al plan." };

  return run(
    () => createDevelopmentPlan(g.ok!.organizationId, {
      year, title, objective: optional(formData, "objective"),
    }),
    () => revalidatePath("/quality/people/development"),
    "Plan creado. Puede seguir recibiendo items durante el año."
  );
}

export async function addPlanItemAction(
  _prev: PeopleActionState, formData: FormData
): Promise<PeopleActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManagePeople(g.ok.roleCode)) {
    return { error: "Tu rol no permite editar el plan de desarrollo." };
  }
  const planId = text(formData, "plan_id");
  const title = text(formData, "title");
  if (!planId) return { error: "Falta el plan." };
  if (title.length < 3) return { error: "Describe el item." };

  return run(
    () => addPlanItem(g.ok!.organizationId, {
      planId, title,
      developmentKind: pick(formData, "development_kind", DEVELOPMENT_KINDS, "training")!,
      personId: optional(formData, "person_id"),
      positionId: optional(formData, "position_id"),
      competencyId: optional(formData, "competency_id"),
      needId: optional(formData, "need_id"),
      targetDate: optional(formData, "target_date"),
      addedReason: optional(formData, "added_reason"),
    }),
    () => revalidatePath("/quality/people/development"),
    "Item añadido al plan, con la fecha en que entró y por qué."
  );
}

export async function createActivityAction(
  _prev: PeopleActionState, formData: FormData
): Promise<PeopleActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManagePeople(g.ok.roleCode)) {
    return { error: "Tu rol no permite registrar actividades." };
  }
  const title = text(formData, "title");
  if (title.length < 3) return { error: "Ponle título a la actividad." };
  const hours = text(formData, "duration_hours");

  return run(
    () => createLearningActivity(g.ok!.organizationId, {
      title, activityKind: pick(formData, "activity_kind", ACTIVITY_KINDS, "course")!,
      provider: optional(formData, "provider"),
      description: optional(formData, "description"),
      startsOn: optional(formData, "starts_on"),
      endsOn: optional(formData, "ends_on"),
      durationHours: hours ? Number(hours) : null,
      planItemId: optional(formData, "plan_item_id"),
    }),
    () => revalidatePath("/quality/people/development"),
    "Actividad registrada."
  );
}

export async function setActivityStatusAction(
  _prev: PeopleActionState, formData: FormData
): Promise<PeopleActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManagePeople(g.ok.roleCode)) {
    return { error: "Tu rol no permite cambiar el estado de una actividad." };
  }
  const activityId = text(formData, "activity_id");
  const status = pick(formData, "status", ["planned", "in_progress", "completed", "cancelled"] as const);
  if (!activityId || !status) return { error: "Falta la actividad o el estado." };

  return run(
    () => setActivityStatus(g.ok!.organizationId, activityId, status),
    () => revalidatePath("/quality/people/development"),
    status === "completed"
      // §72 · Se dice explícitamente, porque es la confusión más común del
      // dominio: haber terminado la actividad no la vuelve eficaz.
      ? "Actividad terminada. La eficacia sigue pendiente: terminarla no demuestra que sirviera."
      : "Actividad actualizada."
  );
}

export async function addParticipantAction(
  _prev: PeopleActionState, formData: FormData
): Promise<PeopleActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManagePeople(g.ok.roleCode)) {
    return { error: "Tu rol no permite inscribir personas." };
  }
  const activityId = text(formData, "activity_id");
  const personId = text(formData, "person_id");
  if (!activityId || !personId) return { error: "Falta la actividad o la persona." };

  return run(
    () => addParticipant(g.ok!.organizationId, activityId, personId),
    () => revalidatePath("/quality/people/development"),
    "Persona inscrita."
  );
}

export async function recordAttendanceAction(
  _prev: PeopleActionState, formData: FormData
): Promise<PeopleActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManagePeople(g.ok.roleCode)) {
    return { error: "Tu rol no permite registrar asistencia." };
  }
  const participantId = text(formData, "participant_id");
  const attendance = pick(formData, "attendance_status", ATTENDANCE_STATUSES);
  if (!participantId || !attendance) return { error: "Falta el participante o la asistencia." };

  return run(
    () => recordAttendance(g.ok!.organizationId, participantId, {
      attendance, note: optional(formData, "attendance_note"),
    }),
    () => revalidatePath("/quality/people/development"),
    "Asistencia registrada. El aprendizaje se evalúa aparte."
  );
}

export async function recordLearningAction(
  _prev: PeopleActionState, formData: FormData
): Promise<PeopleActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManagePeople(g.ok.roleCode)) {
    return { error: "Tu rol no permite evaluar el aprendizaje." };
  }
  const participantId = text(formData, "participant_id");
  const result = pick(formData, "learning_result", LEARNING_RESULTS);
  if (!participantId || !result) return { error: "Falta el participante o el resultado." };

  return run(
    () => recordLearningResult(g.ok!.organizationId, participantId, {
      result, method: optional(formData, "learning_method"),
      note: optional(formData, "learning_note"),
      evaluatedOn: optional(formData, "evaluated_on") ?? todayIso(),
    }),
    () => revalidatePath("/quality/people/development"),
    "Aprendizaje registrado. Ser competente es otra decisión, y va en la ficha de la persona."
  );
}

export async function planEffectivenessAction(
  _prev: PeopleActionState, formData: FormData
): Promise<PeopleActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManagePeople(g.ok.roleCode)) {
    return { error: "Tu rol no permite declarar criterios de eficacia." };
  }
  const criterion = text(formData, "criterion");
  const activityId = optional(formData, "activity_id");
  const planItemId = optional(formData, "plan_item_id");
  if (criterion.length < 5) return { error: "Escribe el criterio con el que se juzgará la eficacia." };
  if (!activityId && !planItemId) return { error: "Falta la actividad o el item del plan." };

  return run(
    () => planEffectivenessReview(g.ok!.organizationId, {
      activityId, planItemId, personId: optional(formData, "person_id"),
      criterion, method: pick(formData, "method", EFFECTIVENESS_METHODS, "observation")!,
      indicatorId: optional(formData, "indicator_id"),
    }),
    () => revalidatePath("/quality/people/development"),
    "Criterio declarado. Se evaluará contra esto, no contra lo que salga."
  );
}

export async function reviewEffectivenessAction(
  _prev: PeopleActionState, formData: FormData
): Promise<PeopleActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const reviewId = text(formData, "review_id");
  const result = pick(formData, "result", ["effective", "partially_effective", "not_effective"] as const);
  const observation = text(formData, "observation");
  if (!reviewId || !result) return { error: "Falta la evaluación o el resultado." };
  if (observation.length < 5) return { error: "Explica en qué se comprobó." };

  return run(
    () => reviewEffectiveness(
      reviewId, result, observation, optional(formData, "reviewed_on") ?? todayIso()
    ),
    () => revalidatePath("/quality/people/development"),
    result === "not_effective"
      ? "Resultado registrado. Se conserva: si hace falta otra acción, será OTRA acción con su propia eficacia."
      : "Eficacia registrada."
  );
}

// ---------------------------------------------------------------------------
// Desempeño (§36–§39)
// ---------------------------------------------------------------------------

export async function createCycleAction(
  _prev: PeopleActionState, formData: FormData
): Promise<PeopleActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManagePeople(g.ok.roleCode)) {
    return { error: "Tu rol no permite crear ciclos de evaluación." };
  }
  const name = text(formData, "name");
  const start = text(formData, "period_start");
  const end = text(formData, "period_end");
  if (name.length < 3) return { error: "Ponle nombre al ciclo." };
  if (!start || !end) return { error: "Indica el periodo del ciclo." };

  return run(
    () => createPerformanceCycle(g.ok!.organizationId, {
      name, periodStart: start, periodEnd: end, purpose: optional(formData, "purpose"),
    }),
    () => revalidatePath("/quality/people/performance"),
    "Ciclo creado. Declara qué personas son aplicables antes de abrirlo."
  );
}

export async function setCycleStatusAction(
  _prev: PeopleActionState, formData: FormData
): Promise<PeopleActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManagePeople(g.ok.roleCode)) {
    return { error: "Tu rol no permite cambiar el estado del ciclo." };
  }
  const cycleId = text(formData, "cycle_id");
  const status = pick(formData, "status", ["draft", "open", "closed"] as const);
  if (!cycleId || !status) return { error: "Falta el ciclo o el estado." };

  return run(
    () => setCycleStatus(g.ok!.organizationId, cycleId, status),
    () => revalidatePath("/quality/people/performance"),
    "Ciclo actualizado."
  );
}

export async function addCycleMemberAction(
  _prev: PeopleActionState, formData: FormData
): Promise<PeopleActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManagePeople(g.ok.roleCode)) {
    return { error: "Tu rol no permite definir la población del ciclo." };
  }
  const cycleId = text(formData, "cycle_id");
  const personId = text(formData, "person_id");
  if (!cycleId || !personId) return { error: "Falta el ciclo o la persona." };

  return run(
    () => addCycleMember(
      g.ok!.organizationId, cycleId, personId, optional(formData, "inclusion_reason")
    ),
    () => revalidatePath("/quality/people/performance"),
    "Persona añadida a la población aplicable."
  );
}

export async function createEvaluationAction(
  _prev: PeopleActionState, formData: FormData
): Promise<PeopleActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManagePeople(g.ok.roleCode)) {
    return { error: "Tu rol no permite crear evaluaciones de desempeño." };
  }
  const cycleId = text(formData, "cycle_id");
  const personId = text(formData, "person_id");
  const evaluatorPersonId = text(formData, "evaluator_person_id");
  if (!cycleId || !personId) return { error: "Falta el ciclo o la persona." };
  // §38 · El evaluador es una PERSONA real y se declara desde el principio.
  // Sin evaluador no hay evaluación formal: es lo que distingue un juicio de
  // un cálculo.
  if (!evaluatorPersonId) return { error: "Indica quién evalúa." };
  if (evaluatorPersonId === personId) {
    return { error: "Una persona no se evalúa a sí misma." };
  }

  return run(
    () => createEvaluation(g.ok!.organizationId, {
      cycleId, personId, positionId: optional(formData, "position_id"),
      evaluatorPersonId, contextNote: optional(formData, "context_note"),
    }),
    () => revalidatePath("/quality/people/performance"),
    "Evaluación creada como borrador."
  );
}

export async function addEvaluationItemAction(
  _prev: PeopleActionState, formData: FormData
): Promise<PeopleActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManagePeople(g.ok.roleCode)) {
    return { error: "Tu rol no permite editar evaluaciones." };
  }
  const evaluationId = text(formData, "evaluation_id");
  const criterion = text(formData, "criterion");
  const result = pick(formData, "result", PERFORMANCE_RESULTS, "meets")!;
  if (!evaluationId) return { error: "Falta la evaluación." };
  if (criterion.length < 3) return { error: "Escribe contra qué se evalúa." };

  return run(
    () => addEvaluationItem(g.ok!.organizationId, {
      evaluationId,
      subjectKind: pick(
        formData, "subject_kind", ["criterion", "competency", "position_function"] as const, "criterion"
      )!,
      criterion,
      competencyId: optional(formData, "competency_id"),
      positionFunctionId: optional(formData, "position_function_id"),
      result, observation: optional(formData, "observation"),
    }),
    () => revalidatePath("/quality/people/performance"),
    // PC-06 · Se dice, porque es la confusión que este dominio existe para
    // evitar: evaluar el desempeño no toca la competencia declarada.
    "Línea añadida. Evaluar el desempeño no cambia la competencia registrada de la persona."
  );
}

export async function closeEvaluationAction(
  _prev: PeopleActionState, formData: FormData
): Promise<PeopleActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const evaluationId = text(formData, "evaluation_id");
  const summary = text(formData, "summary");
  if (!evaluationId) return { error: "Falta la evaluación." };
  if (summary.length < 5) return { error: "Escribe la conclusión de la evaluación." };

  return run(
    () => closeEvaluation(evaluationId, summary),
    () => revalidatePath("/quality/people/performance"),
    "Evaluación cerrada. El resultado queda como se firmó."
  );
}

// ---------------------------------------------------------------------------
// Conocimiento (§42–§46)
// ---------------------------------------------------------------------------

export async function createKnowledgeAction(
  _prev: PeopleActionState, formData: FormData
): Promise<PeopleActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageStructure(g.ok.roleCode)) {
    return { error: "Tu rol no permite registrar conocimiento." };
  }
  const title = text(formData, "title");
  if (title.length < 3) return { error: "Ponle nombre al conocimiento." };

  return run(
    () => createKnowledgeItem(g.ok!.organizationId, {
      title, description: optional(formData, "description"),
      knowledgeKind: pick(formData, "knowledge_kind", KNOWLEDGE_KINDS, "explicit")!,
      criticality: pick(formData, "criticality", CRITICALITIES, "medium")!,
      criticalityNote: optional(formData, "criticality_note"),
      documentationStatus: pick(
        formData, "documentation_status", DOCUMENTATION_STATUSES, "undocumented"
      )!,
      processId: optional(formData, "process_id"),
    }),
    () => revalidatePath("/quality/people/knowledge"),
    "Conocimiento registrado."
  );
}

export async function addHolderAction(
  _prev: PeopleActionState, formData: FormData
): Promise<PeopleActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageStructure(g.ok.roleCode)) {
    return { error: "Tu rol no permite registrar quién sostiene el conocimiento." };
  }
  const knowledgeItemId = text(formData, "knowledge_item_id");
  const personId = text(formData, "person_id");
  if (!knowledgeItemId || !personId) return { error: "Falta el conocimiento o la persona." };

  return run(
    () => addKnowledgeHolder(g.ok!.organizationId, {
      knowledgeItemId, personId,
      holderLevel: pick(formData, "holder_level", HOLDER_LEVELS, "holder")!,
      isPrimaryHolder: bool(formData, "is_primary_holder"),
      sinceOn: optional(formData, "since_on"),
      note: optional(formData, "note"),
    }),
    () => revalidatePath("/quality/people/knowledge"),
    // PC-19 · La frase entera, cada vez.
    "Registrado. La persona SOSTIENE el conocimiento; el conocimiento es de la empresa."
  );
}

export async function endHolderAction(
  _prev: PeopleActionState, formData: FormData
): Promise<PeopleActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageStructure(g.ok.roleCode)) {
    return { error: "Tu rol no permite cambiar los holders." };
  }
  const holderId = text(formData, "holder_id");
  if (!holderId) return { error: "Falta el registro." };

  return run(
    () => endKnowledgeHolder(
      g.ok!.organizationId, holderId, optional(formData, "until_on") ?? todayIso()
    ),
    () => revalidatePath("/quality/people/knowledge"),
    "Registro cerrado."
  );
}

export async function createTransferAction(
  _prev: PeopleActionState, formData: FormData
): Promise<PeopleActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageStructure(g.ok.roleCode)) {
    return { error: "Tu rol no permite crear planes de transferencia." };
  }
  const knowledgeItemId = text(formData, "knowledge_item_id");
  const title = text(formData, "title");
  if (!knowledgeItemId) return { error: "Falta el conocimiento." };
  if (title.length < 3) return { error: "Ponle título al plan." };

  return run(
    () => createTransferPlan(g.ok!.organizationId, {
      knowledgeItemId, title,
      method: pick(formData, "method", TRANSFER_METHODS, "accompaniment")!,
      sourcePersonId: optional(formData, "source_person_id"),
      objective: optional(formData, "objective"),
      targetDate: optional(formData, "target_date"),
    }),
    () => revalidatePath("/quality/people/knowledge"),
    "Plan de transferencia creado."
  );
}

export async function addTransferItemAction(
  _prev: PeopleActionState, formData: FormData
): Promise<PeopleActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageStructure(g.ok.roleCode)) {
    return { error: "Tu rol no permite editar planes de transferencia." };
  }
  const transferPlanId = text(formData, "transfer_plan_id");
  const activity = text(formData, "activity");
  if (!transferPlanId) return { error: "Falta el plan." };
  if (activity.length < 3) return { error: "Describe la actividad." };

  return run(
    () => addTransferItem(g.ok!.organizationId, {
      transferPlanId, activity,
      targetPersonId: optional(formData, "target_person_id"),
      dueOn: optional(formData, "due_on"),
    }),
    () => revalidatePath("/quality/people/knowledge"),
    "Actividad añadida."
  );
}

export async function completeTransferItemAction(
  _prev: PeopleActionState, formData: FormData
): Promise<PeopleActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageStructure(g.ok.roleCode)) {
    return { error: "Tu rol no permite cerrar actividades de transferencia." };
  }
  const itemId = text(formData, "item_id");
  const note = text(formData, "evidence_note");
  if (!itemId) return { error: "Falta la actividad." };
  if (note.length < 3) return { error: "Di qué evidencia queda de esta actividad." };

  return run(
    () => completeTransferItem(
      g.ok!.organizationId, itemId, note, optional(formData, "completed_on") ?? todayIso()
    ),
    () => revalidatePath("/quality/people/knowledge"),
    "Actividad cerrada. Verificar que el conocimiento pasó es un paso aparte."
  );
}

export async function verifyTransferAction(
  _prev: PeopleActionState, formData: FormData
): Promise<PeopleActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const planId = text(formData, "plan_id");
  const note = text(formData, "verification_note");
  if (!planId) return { error: "Falta el plan." };
  if (note.length < 5) return { error: "Explica en qué comprobaste que el conocimiento pasó." };

  return run(
    () => verifyTransfer(planId, note, optional(formData, "verified_on") ?? todayIso()),
    () => revalidatePath("/quality/people/knowledge"),
    "Transferencia verificada."
  );
}

/**
 * §45 · La señal se convierte en riesgo SOLO si alguien lo decide.
 *
 * El barrido no crea riesgos y esta acción no crea el riesgo: enlaza uno que
 * ya existe. Quien quiera el riesgo tiene que haberlo escrito, con su
 * metodología y su evaluación, como cualquier otro.
 */
export async function promoteSignalAction(
  _prev: PeopleActionState, formData: FormData
): Promise<PeopleActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const signalId = text(formData, "signal_id");
  const riskId = text(formData, "risk_id");
  if (!signalId || !riskId) return { error: "Falta la señal o el riesgo." };

  return run(
    () => promoteSignalToRisk(signalId, riskId),
    () => { revalidatePath("/quality/people/knowledge"); revalidatePath("/quality/risks"); },
    "Señal enlazada al riesgo."
  );
}

export async function dismissSignalAction(
  _prev: PeopleActionState, formData: FormData
): Promise<PeopleActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageStructure(g.ok.roleCode)) {
    return { error: "Tu rol no permite descartar señales." };
  }
  const signalId = text(formData, "signal_id");
  if (!signalId) return { error: "Falta la señal." };

  return run(
    () => dismissSignal(g.ok!.organizationId, signalId),
    () => revalidatePath("/quality/people/knowledge"),
    "Señal descartada."
  );
}

// ---------------------------------------------------------------------------
// Lecciones aprendidas (§47, §48)
// ---------------------------------------------------------------------------

export async function createLessonAction(
  _prev: PeopleActionState, formData: FormData
): Promise<PeopleActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageStructure(g.ok.roleCode)) {
    return { error: "Tu rol no permite registrar lecciones." };
  }
  const title = text(formData, "title");
  const whatHappened = text(formData, "what_happened");
  const whatWasLearned = text(formData, "what_was_learned");
  if (title.length < 3) return { error: "Ponle título a la lección." };
  if (whatHappened.length < 5) return { error: "Cuenta qué ocurrió." };
  if (whatWasLearned.length < 5) return { error: "Escribe qué se aprendió." };

  return run(
    () => createLesson(g.ok!.organizationId, {
      title, whatHappened, whatWasLearned,
      applicableContext: optional(formData, "applicable_context"),
      recommendation: optional(formData, "recommendation"),
      origin: pick(formData, "origin_kind", LESSON_ORIGINS, "manual")!,
      caseId: optional(formData, "case_id"),
      actionId: optional(formData, "action_id"),
      riskId: optional(formData, "risk_id"),
      processId: optional(formData, "process_id"),
      occurredOn: optional(formData, "occurred_on"),
      code: optional(formData, "code"),
    }),
    () => revalidatePath("/quality/people/lessons"),
    "Lección registrada como borrador."
  );
}

export async function publishLessonAction(
  _prev: PeopleActionState, formData: FormData
): Promise<PeopleActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageStructure(g.ok.roleCode)) {
    return { error: "Tu rol no permite publicar lecciones." };
  }
  const lessonId = text(formData, "lesson_id");
  if (!lessonId) return { error: "Falta la lección." };

  return run(
    () => publishLesson(g.ok!.organizationId, lessonId),
    () => revalidatePath("/quality/people/lessons"),
    "Lección publicada."
  );
}

export async function addProposalAction(
  _prev: PeopleActionState, formData: FormData
): Promise<PeopleActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageStructure(g.ok.roleCode)) {
    return { error: "Tu rol no permite añadir propuestas." };
  }
  const lessonId = text(formData, "lesson_id");
  const summary = text(formData, "summary");
  if (!lessonId) return { error: "Falta la lección." };
  if (summary.length < 5) return { error: "Describe la propuesta." };

  return run(
    () => addLessonProposal(g.ok!.organizationId, {
      lessonId, proposalKind: pick(formData, "proposal_kind", PROPOSAL_KINDS, "process_change")!,
      summary,
      targetDocumentId: optional(formData, "target_document_id"),
      targetProcessId: optional(formData, "target_process_id"),
      targetCompetencyId: optional(formData, "target_competency_id"),
      targetPositionId: optional(formData, "target_position_id"),
    }),
    () => revalidatePath("/quality/people/lessons"),
    "Propuesta añadida. Aceptarla no cambia nada por su cuenta: deja escrito que se aceptó."
  );
}

export async function decideProposalAction(
  _prev: PeopleActionState, formData: FormData
): Promise<PeopleActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const proposalId = text(formData, "proposal_id");
  const decision = pick(formData, "decision", ["accepted", "rejected"] as const);
  if (!proposalId || !decision) return { error: "Falta la propuesta o la decisión." };

  return run(
    () => decideLessonProposal(proposalId, decision, optional(formData, "decision_note")),
    () => revalidatePath("/quality/people/lessons"),
    decision === "accepted"
      ? "Propuesta aceptada. El cambio hay que hacerlo: el sistema no lo aplica solo."
      : "Propuesta descartada."
  );
}

// ---------------------------------------------------------------------------
// Barrido (§51)
// ---------------------------------------------------------------------------

export async function scanPeopleSignalsAction(
  _prev: PeopleActionState, _formData: FormData
): Promise<PeopleActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };

  return run(
    async () => { await scanPeopleSignals(g.ok!.organizationId); },
    () => { revalidatePeople(); revalidatePath("/quality/people/knowledge"); },
    "Revisión hecha. Los avisos que ya existían no se duplican."
  );
}
