"use server";

import { revalidatePath } from "next/cache";
import { requireQualityForAction } from "@/lib/auth/require-quality-module";
import { checkQualityCanMutate } from "@/server/actions/module-plans";
import {
  attachRequirementToProcess, attachStrategyRequirement, convertToRequirement,
  createAssessment, createCategory, createExternalParty, createGroup,
  createRequirement, createStrategy,
  detachRequirementFromProcess, detachStrategyRequirement, linkPeripheral,
  recordReview, retireRequirement, seedCategories, setCategoryActive,
  setGroupActive, setRequirementRelevance, setStrategyStatus, supersedeAssessment,
  unlinkPeripheral, updateStrategy,
  type StakeholderOwnerKind,
} from "@/lib/db/quality-interested-parties";
import {
  canManageInterestedParties, DOMAIN_ERRORS, ENTRY_KINDS, LINK_KINDS,
  MONITORING_METHODS, RELEVANCE_STATES, REQUIREMENT_KINDS, REVIEW_VERDICTS,
  SUBJECT_KINDS, type DomainResult,
} from "@/lib/domain/quality-interested-parties";

/**
 * Trazaloop · QUALITY-12.3B2 · Acciones de servidor de partes interesadas.
 *
 * NO ES UNA ARQUITECTURA NUEVA
 *
 * Mismo reparto que QUALITY-10 y QUALITY-11: la acción comprueba la puerta,
 * lee el formulario, valida lo que se puede validar sin la base, y delega. Lo
 * que decide de verdad sigue siendo la RLS. Si esta capa se equivocara y
 * dejara pasar algo, la base lo pararía igual; lo que se perdería es el
 * mensaje entendible, no el aislamiento.
 *
 * EL REPARTO
 *
 * · Lo que solo REGISTRA —una categoría, un colectivo, un análisis nuevo, un
 *   requisito, una estrategia, un vínculo— es escritura normal bajo RLS.
 * · Lo que crea HISTORIA —suceder un análisis, registrar una revisión— pasa
 *   por una RPC de 0150, que cierra la vigencia anterior, abre la nueva y
 *   emite el hecho en el mismo acto.
 *
 * LO QUE NINGUNA DE ESTAS FUNCIONES HACE
 *
 * Ninguna borra historia: retirar y desvincular CIERRAN una vigencia. Ninguna
 * deduce la pertinencia de la prioridad —son dos preguntas distintas, y el
 * dominio tiene una función que lanza si alguien lo intenta—. Ninguna duplica
 * un cliente ni un proveedor: apuntan a la identidad que ya existe. Ninguna
 * invoca ningún modelo.
 */

export type IpActionState = {
  error: string | null;
  success?: boolean;
  message?: string | null;
  id?: string;
  /** El código del dominio, para que la pantalla pueda reaccionar sin leer el texto. */
  code?: string;
};

const OK: IpActionState = { error: null, success: true, message: null };

type Gate = { organizationId: string; roleCode: string };

async function gate(): Promise<{ ok: Gate | null; error: string | null }> {
  const access = await requireQualityForAction();
  if (access.org === null) return { ok: null, error: access.error };
  const mutate = await checkQualityCanMutate();
  if (!mutate.allowed) return { ok: null, error: mutate.error };
  if (!canManageInterestedParties(access.org.roleCode)) {
    return { ok: null, error: DOMAIN_ERRORS.permission_denied };
  }
  return {
    ok: { organizationId: access.org.organizationId, roleCode: access.org.roleCode },
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
function number(form: FormData, name: string): number | null {
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

function revalidate() {
  revalidatePath("/quality");
  revalidatePath("/quality/context");
  revalidatePath("/quality/interested-parties");
}

/**
 * Traduce el resultado del dominio a lo que espera `useActionState`.
 *
 * El código viaja junto al texto. Sin él, la pantalla que quisiera reaccionar
 * a un fallo concreto tendría que comparar cadenas, y ese es el acoplamiento
 * que rompe el día que se mejora un mensaje.
 */
function state<T>(res: DomainResult<T>, message: string): IpActionState {
  if (!res.ok) return { error: res.message, code: res.code };
  revalidate();
  return { ...OK, message, id: typeof res.data === "string" ? res.data : undefined };
}

// ---------------------------------------------------------------------------
// Catálogos
// ---------------------------------------------------------------------------

export async function seedCategoriesAction(
  _prev: IpActionState, _form: FormData
): Promise<IpActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const res = await seedCategories(g.ok.organizationId);
  if (!res.ok) return { error: res.message, code: res.code };
  revalidate();
  return {
    ...OK,
    message: res.data === 0
      ? "Las categorías iniciales ya estaban."
      : `Se añadieron ${res.data} categorías iniciales.`,
  };
}

export async function createCategoryAction(
  _prev: IpActionState, formData: FormData
): Promise<IpActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const name = text(formData, "name");
  if (name.length < 2) return { error: "Escribe el nombre de la categoría." };
  return state(
    await createCategory(g.ok.organizationId, {
      name,
      code: optional(formData, "code"),
      description: optional(formData, "description"),
      sortOrder: number(formData, "sort_order") ?? undefined,
    }),
    "Categoría creada."
  );
}

export async function setCategoryActiveAction(
  _prev: IpActionState, formData: FormData
): Promise<IpActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const id = text(formData, "category_id");
  if (!id) return { error: "Falta la categoría." };
  const activa = text(formData, "is_active") === "true";
  return state(
    await setCategoryActive(g.ok.organizationId, id, activa),
    activa ? "Categoría activada." : "Categoría desactivada."
  );
}

export async function createGroupAction(
  _prev: IpActionState, formData: FormData
): Promise<IpActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const name = text(formData, "name");
  if (name.length < 2) return { error: "Escribe el nombre del colectivo." };
  return state(
    await createGroup(g.ok.organizationId, {
      name,
      code: optional(formData, "code"),
      description: optional(formData, "description"),
    }),
    "Colectivo creado."
  );
}

export async function setGroupActiveAction(
  _prev: IpActionState, formData: FormData
): Promise<IpActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const id = text(formData, "group_id");
  if (!id) return { error: "Falta el colectivo." };
  const activa = text(formData, "is_active") === "true";
  return state(
    await setGroupActive(g.ok.organizationId, id, activa),
    activa ? "Colectivo activado." : "Colectivo desactivado."
  );
}

// ---------------------------------------------------------------------------
// La identidad externa
// ---------------------------------------------------------------------------

/**
 * Registrar una entidad externa que todavía no existe.
 *
 * Escribe en la MISMA tabla de identidad que usan Proveedores y Voz del
 * cliente: no hay ficha local ni copia. Lo que no hace es asignarle un papel
 * comercial, porque una alcaldía o una comunidad no son ni lo uno ni lo otro.
 *
 * Cuando sí es un cliente o un proveedor, la pantalla lo dice antes: allí nace
 * con la ficha que le corresponde, y aquí se elige la que ya existe.
 */
export async function createExternalPartyAction(
  _prev: IpActionState, formData: FormData
): Promise<IpActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const legalName = text(formData, "legal_name");
  if (legalName.length < 2) return { error: "Escribe el nombre de la entidad." };
  return state(
    await createExternalParty(g.ok.organizationId, {
      legalName,
      tradeName: optional(formData, "trade_name"),
      taxId: optional(formData, "tax_id"),
      country: optional(formData, "country"),
      city: optional(formData, "city"),
    }),
    "Entidad registrada. Ahora puedes analizarla."
  );
}

// ---------------------------------------------------------------------------
// El análisis
// ---------------------------------------------------------------------------

export async function createAssessmentAction(
  _prev: IpActionState, formData: FormData
): Promise<IpActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const categoryId = text(formData, "category_id");
  const subjectKind = pick(formData, "subject_kind", SUBJECT_KINDS);
  const subjectId = text(formData, "subject_id");
  if (!categoryId) return { error: "Elige la categoría de la parte interesada." };
  if (!subjectKind) return { error: "Indica si es una entidad externa o un colectivo." };
  if (!subjectId) return { error: "Elige la parte interesada." };
  const relevance = pick(formData, "relevance_status", RELEVANCE_STATES, "under_review")!;

  return state(
    await createAssessment(g.ok.organizationId, {
      categoryId, subjectKind, subjectId,
      assessedOn: optional(formData, "assessed_on") ?? undefined,
      ownerPositionId: optional(formData, "owner_position_id"),
      relevanceStatus: relevance,
      relevanceRationale: optional(formData, "relevance_rationale"),
      priorityLabel: optional(formData, "priority_label"),
      priorityScore: number(formData, "priority_score"),
      priorityMethodNote: optional(formData, "priority_method_note"),
      summary: optional(formData, "summary"),
      effectiveFrom: optional(formData, "effective_from") ?? undefined,
    }),
    "Análisis registrado."
  );
}

/**
 * Suceder un análisis vigente.
 *
 * No es editar. El anterior se conserva entero y se cierra su vigencia; el
 * nuevo nace apuntando a él. Es lo que permite responder «qué decíamos en
 * marzo» sin tener que creerse una memoria.
 */
export async function supersedeAssessmentAction(
  _prev: IpActionState, formData: FormData
): Promise<IpActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const assessmentId = text(formData, "assessment_id");
  if (!assessmentId) return { error: "Falta el análisis que se sucede." };
  const relevance = pick(formData, "relevance_status", RELEVANCE_STATES);
  if (!relevance) return { error: "Indica la pertinencia del análisis nuevo." };

  return state(
    await supersedeAssessment(g.ok.organizationId, {
      assessmentId,
      relevanceStatus: relevance,
      relevanceRationale: optional(formData, "relevance_rationale"),
      summary: optional(formData, "summary"),
      priorityLabel: optional(formData, "priority_label"),
      priorityScore: number(formData, "priority_score"),
      priorityMethodNote: optional(formData, "priority_method_note"),
      ownerPositionId: optional(formData, "owner_position_id"),
      effectiveFrom: optional(formData, "effective_from"),
    }),
    "Análisis sucedido. El anterior queda como histórico."
  );
}

// ---------------------------------------------------------------------------
// Necesidades, expectativas y requisitos
// ---------------------------------------------------------------------------

export async function createRequirementAction(
  _prev: IpActionState, formData: FormData
): Promise<IpActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const assessmentId = text(formData, "assessment_id");
  const entryKind = pick(formData, "entry_kind", ENTRY_KINDS);
  const title = text(formData, "title");
  if (!assessmentId) return { error: "Falta el análisis al que pertenece." };
  if (!entryKind) return { error: "Indica si es una necesidad, una expectativa o un requisito." };
  if (title.length < 3) return { error: "Escribe qué necesita o exige esta parte." };

  return state(
    await createRequirement(g.ok.organizationId, {
      assessmentId, entryKind, title,
      requirementKind: entryKind === "requirement"
        ? pick(formData, "requirement_kind", REQUIREMENT_KINDS)
        : null,
      description: optional(formData, "description"),
      code: optional(formData, "code"),
      sourceNote: optional(formData, "source_note"),
      relevanceStatus: pick(formData, "relevance_status", RELEVANCE_STATES) ?? undefined,
      relevanceRationale: optional(formData, "relevance_rationale"),
    }),
    entryKind === "requirement" ? "Requisito registrado." : "Entrada registrada."
  );
}

export async function convertToRequirementAction(
  _prev: IpActionState, formData: FormData
): Promise<IpActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const originId = text(formData, "origin_id");
  const requirementKind = pick(formData, "requirement_kind", REQUIREMENT_KINDS);
  const rationale = text(formData, "rationale");
  if (!originId) return { error: "Falta la necesidad o expectativa de origen." };
  if (!requirementKind) return { error: "Indica de qué tipo es el requisito." };
  if (rationale.length < 3) return { error: DOMAIN_ERRORS.conversion_reason_required };

  return state(
    await convertToRequirement(g.ok.organizationId, {
      originId, requirementKind, rationale,
      title: optional(formData, "title") ?? undefined,
      sourceNote: optional(formData, "source_note"),
    }),
    "Convertido en requisito. La entrada original se conserva."
  );
}

export async function setRequirementRelevanceAction(
  _prev: IpActionState, formData: FormData
): Promise<IpActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const requirementId = text(formData, "requirement_id");
  const status = pick(formData, "relevance_status", RELEVANCE_STATES);
  if (!requirementId) return { error: "Falta el requisito." };
  if (!status) return { error: "Indica la pertinencia." };
  return state(
    await setRequirementRelevance(
      g.ok.organizationId, requirementId, status, optional(formData, "relevance_rationale")),
    "Pertinencia actualizada."
  );
}

export async function retireRequirementAction(
  _prev: IpActionState, formData: FormData
): Promise<IpActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const requirementId = text(formData, "requirement_id");
  if (!requirementId) return { error: "Falta el requisito." };
  return state(
    await retireRequirement(g.ok.organizationId, requirementId, optional(formData, "effective_to")),
    "Requisito retirado. Sigue en el histórico."
  );
}

// ---------------------------------------------------------------------------
// Requisito → proceso
// ---------------------------------------------------------------------------

export async function attachRequirementProcessAction(
  _prev: IpActionState, formData: FormData
): Promise<IpActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const requirementId = text(formData, "requirement_id");
  const processId = text(formData, "process_id");
  if (!requirementId) return { error: "Falta el requisito." };
  if (!processId) return { error: "Elige el proceso." };
  return state(
    await attachRequirementToProcess(g.ok.organizationId, {
      requirementId, processId,
      linkKind: pick(formData, "link_kind", LINK_KINDS, "addressed_by")!,
      processRevisionId: optional(formData, "process_revision_id"),
      note: optional(formData, "note"),
      effectiveFrom: optional(formData, "effective_from") ?? undefined,
    }),
    "Proceso vinculado."
  );
}

export async function detachRequirementProcessAction(
  _prev: IpActionState, formData: FormData
): Promise<IpActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const linkId = text(formData, "link_id");
  if (!linkId) return { error: "Falta el vínculo." };
  return state(
    await detachRequirementFromProcess(
      g.ok.organizationId, linkId, optional(formData, "effective_to")),
    "Vínculo cerrado. Queda su historia."
  );
}

// ---------------------------------------------------------------------------
// Estrategias
// ---------------------------------------------------------------------------

export async function createStrategyAction(
  _prev: IpActionState, formData: FormData
): Promise<IpActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const assessmentId = text(formData, "assessment_id");
  const title = text(formData, "title");
  if (!assessmentId) return { error: "Falta el análisis al que responde." };
  if (title.length < 3) return { error: "Escribe el título de la estrategia." };
  const requirementIds = formData.getAll("requirement_ids")
    .filter((v): v is string => typeof v === "string" && v.length > 0);

  return state(
    await createStrategy(g.ok.organizationId, {
      assessmentId, title,
      purpose: optional(formData, "purpose"),
      approach: optional(formData, "approach"),
      ownerPositionId: optional(formData, "owner_position_id"),
      monitoringMethod: pick(formData, "monitoring_method", MONITORING_METHODS),
      monitoringNote: optional(formData, "monitoring_note"),
      reviewCadenceMonths: number(formData, "review_cadence_months"),
      nextReviewOn: optional(formData, "next_review_on"),
      status: text(formData, "status") === "active" ? "active" : "draft",
      requirementIds,
    }),
    "Estrategia creada."
  );
}

export async function updateStrategyAction(
  _prev: IpActionState, formData: FormData
): Promise<IpActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const strategyId = text(formData, "strategy_id");
  if (!strategyId) return { error: "Falta la estrategia." };
  return state(
    await updateStrategy(g.ok.organizationId, strategyId, {
      title: optional(formData, "title") ?? undefined,
      purpose: optional(formData, "purpose"),
      approach: optional(formData, "approach"),
      ownerPositionId: optional(formData, "owner_position_id"),
      monitoringMethod: pick(formData, "monitoring_method", MONITORING_METHODS),
      monitoringNote: optional(formData, "monitoring_note"),
      reviewCadenceMonths: number(formData, "review_cadence_months"),
      nextReviewOn: optional(formData, "next_review_on"),
    }),
    "Estrategia actualizada."
  );
}

export async function setStrategyStatusAction(
  _prev: IpActionState, formData: FormData
): Promise<IpActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const strategyId = text(formData, "strategy_id");
  const status = pick(formData, "status", ["draft", "active", "cancelled"] as const);
  if (!strategyId) return { error: "Falta la estrategia." };
  if (!status) return { error: "Indica el estado." };
  return state(
    await setStrategyStatus(g.ok.organizationId, strategyId, status),
    status === "active" ? "Estrategia activada." : "Estado actualizado."
  );
}

export async function attachStrategyRequirementAction(
  _prev: IpActionState, formData: FormData
): Promise<IpActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const strategyId = text(formData, "strategy_id");
  const requirementId = text(formData, "requirement_id");
  if (!strategyId || !requirementId) return { error: "Falta la estrategia o el requisito." };
  return state(
    await attachStrategyRequirement(g.ok.organizationId, {
      strategyId, requirementId,
      coverageNote: optional(formData, "coverage_note"),
      effectiveFrom: optional(formData, "effective_from") ?? undefined,
    }),
    "Requisito vinculado a la estrategia."
  );
}

export async function detachStrategyRequirementAction(
  _prev: IpActionState, formData: FormData
): Promise<IpActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const linkId = text(formData, "link_id");
  if (!linkId) return { error: "Falta el vínculo." };
  return state(
    await detachStrategyRequirement(
      g.ok.organizationId, linkId, optional(formData, "effective_to")),
    "Vínculo cerrado."
  );
}

// ---------------------------------------------------------------------------
// Revisiones
// ---------------------------------------------------------------------------

/**
 * Registrar una revisión, INCLUIDA la que concluye que no hay cambios.
 *
 * PI-29. Sin esta, un análisis de hace dos años y uno revisado el mes pasado
 * sin cambios se ven idénticos en pantalla, y no lo son: uno está desatendido
 * y el otro comprobado.
 */
export async function recordReviewAction(
  _prev: IpActionState, formData: FormData
): Promise<IpActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const assessmentId = optional(formData, "assessment_id");
  const strategyId = optional(formData, "strategy_id");
  if (!assessmentId && !strategyId) return { error: DOMAIN_ERRORS.review_target_required };
  const verdict = pick(formData, "verdict", REVIEW_VERDICTS, "no_changes")!;
  const note = optional(formData, "note");
  if (verdict === "escalated" && !note) {
    return { error: "Una revisión que escala tiene que decir qué escala y por qué." };
  }
  return state(
    await recordReview(g.ok.organizationId, {
      assessmentId, strategyId, verdict, note,
      nextReviewOn: optional(formData, "next_review_on"),
      ownerPositionId: optional(formData, "owner_position_id"),
      reviewedOn: optional(formData, "reviewed_on"),
    }),
    "Revisión registrada."
  );
}

// ---------------------------------------------------------------------------
// Lo periférico
// ---------------------------------------------------------------------------

const OWNER_KINDS = [
  "stakeholder_assessment", "stakeholder_requirement",
  "stakeholder_strategy", "stakeholder_review",
] as const;

export async function linkPeripheralAction(
  _prev: IpActionState, formData: FormData
): Promise<IpActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const ownerKind = pick(formData, "owner_kind", OWNER_KINDS);
  const ownerId = text(formData, "owner_id");
  const refKind = text(formData, "ref_kind");
  const refId = text(formData, "ref_id");
  if (!ownerKind || !ownerId) return { error: "Falta a qué se enlaza." };
  if (!refKind || !refId) return { error: "Elige qué se enlaza." };
  const relation = pick(formData, "relation", ["origin", "evidence", "related"] as const, "related")!;

  return state(
    await linkPeripheral(g.ok.organizationId, {
      ownerKind: ownerKind as StakeholderOwnerKind,
      ownerId, refKind, refId, relation,
      note: optional(formData, "note"),
    }),
    "Enlace añadido."
  );
}

export async function unlinkPeripheralAction(
  _prev: IpActionState, formData: FormData
): Promise<IpActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const referenceId = text(formData, "reference_id");
  if (!referenceId) return { error: "Falta el enlace." };
  return state(
    await unlinkPeripheral(g.ok.organizationId, referenceId),
    "Enlace retirado."
  );
}
