"use server";

import { revalidatePath } from "next/cache";
import { requireQualityForAction } from "@/lib/auth/require-quality-module";
import { requireSession } from "@/lib/auth/require-session";
import { checkQualityCanMutate } from "@/server/actions/module-plans";
import {
  addCriterion, adoptSupplier, assessCriticality, assignCategory, assignRequirement,
  closeEvaluation, createEvaluation, createPartyContact, createPartySite, createScope,
  createSupplier, createSupplierCategory, createSupplierDocument, createSupplierRequirement,
  createTemplate, createTemplateVersionDraft, decideApproval, deleteSupplier,
  dismissSupplierSignal, endRequirementAssignment, openCaseFromIncident, publishTemplateVersion,
  recordIncident, recordResult, retireSupplier, scanSupplierReviews, updateSupplierProfile,
} from "@/lib/db/quality-suppliers";
import {
  APPROVAL_DECISIONS, canDecideSupplierApproval, canManageSuppliers, CRITERION_METHODS,
  EVALUATION_KINDS, INCIDENT_KINDS, INCIDENT_SEVERITIES, RELATIONSHIP_STATUSES,
  REQUIREMENT_ENFORCEMENTS, REQUIREMENT_KINDS, RESULT_OUTCOMES, SCORING_RULES,
  SUPPLIER_SOURCE_MODULES,
} from "@/lib/domain/quality-suppliers";

/**
 * Trazaloop · QUALITY-07 · Acciones de servidor del dominio de proveedores.
 *
 * EL REPARTO
 *
 * · Lo que solo REGISTRA —dar de alta, describir una sede, apuntar un
 *   documento, anotar un incidente— es escritura normal bajo RLS.
 * · Lo que DECIDE —incorporar desde otro módulo, clasificar criticidad,
 *   publicar una plantilla, cerrar una evaluación, aprobar o suspender, abrir
 *   un caso— pasa por una RPC de 0125.
 *
 * LO QUE NINGUNA DE ESTAS FUNCIONES HACE
 *
 * Ninguna aprueba a un proveedor por su puntuación. Ninguna suspende a nadie
 * porque un papel haya vencido. Ninguna convierte un incidente en una no
 * conformidad. Y ninguna crea un proveedor nuevo cuando ya existe la misma
 * empresa en otro módulo. Si alguna vez aparece aquí una función que haga
 * cualquiera de esas cuatro cosas, el dominio se rompió.
 */

export type SupplierActionState = {
  error: string | null;
  success?: boolean;
  message?: string | null;
  id?: string;
};

const OK: SupplierActionState = { error: null, success: true, message: null };

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
  if ((allowed as readonly string[]).includes(v)) return v as T[number];
  return fallback ?? null;
}
function many(form: FormData, name: string): string[] {
  return form.getAll(name).flatMap((v) => (typeof v === "string" && v.length > 0 ? [v] : []));
}
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function revalidateSuppliers(profileId?: string) {
  revalidatePath("/quality");
  revalidatePath("/quality/suppliers");
  revalidatePath("/quality/tasks");
  if (profileId) revalidatePath(`/quality/suppliers/${profileId}`);
}

async function run(
  fn: () => Promise<void | string>,
  after: () => void,
  message: string
): Promise<SupplierActionState> {
  try {
    const id = await fn();
    after();
    return { ...OK, message, id: typeof id === "string" ? id : undefined };
  } catch (e) {
    // El mensaje viene de la base y ya está escrito para una persona: si dice
    // «una aprobación condicionada tiene que decir cuáles son las condiciones»,
    // eso es lo útil.
    return { error: e instanceof Error ? e.message : "No se pudo completar la operación." };
  }
}

// ---------------------------------------------------------------------------
// Alta e incorporación (§57, §58)
// ---------------------------------------------------------------------------

export async function createSupplierAction(
  _prev: SupplierActionState, formData: FormData
): Promise<SupplierActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageSuppliers(g.ok.roleCode)) {
    return { error: "Tu rol no permite registrar proveedores." };
  }
  const legalName = text(formData, "legal_name");
  if (legalName.length < 2) return { error: "Escribe el nombre del proveedor." };

  return run(
    () => createSupplier(g.ok!.organizationId, {
      legalName,
      taxId: optional(formData, "tax_id"),
      country: optional(formData, "country"),
      city: optional(formData, "city"),
      ownerPositionId: optional(formData, "owner_position_id"),
    }),
    () => revalidateSuppliers(),
    "Proveedor registrado con su alcance general. La criticidad, los requisitos y la "
      + "evaluación se añaden cuando hagan falta."
  );
}

/**
 * §58/GP-33 · Incorporar a Quality un proveedor que ya existe en PCR o
 * Textiles. Es la acción que evita la tercera ficha de ACME.
 */
export async function adoptSupplierAction(
  _prev: SupplierActionState, formData: FormData
): Promise<SupplierActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageSuppliers(g.ok.roleCode)) {
    return { error: "Tu rol no permite incorporar proveedores." };
  }
  const sourceModule = pick(formData, "source_module", SUPPLIER_SOURCE_MODULES);
  const sourceId = text(formData, "source_id");
  if (!sourceModule || !sourceId) return { error: "Falta el proveedor que quieres incorporar." };

  return run(
    () => adoptSupplier(sourceModule, sourceId, optional(formData, "owner_position_id")),
    () => revalidateSuppliers(),
    "Proveedor incorporado. Es la MISMA empresa que en el otro módulo: no se creó una ficha nueva."
  );
}

export async function updateSupplierAction(
  _prev: SupplierActionState, formData: FormData
): Promise<SupplierActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageSuppliers(g.ok.roleCode)) {
    return { error: "Tu rol no permite editar proveedores." };
  }
  const profileId = text(formData, "profile_id");
  if (!profileId) return { error: "Falta el proveedor." };
  const months = Number(text(formData, "reevaluation_months") || "12");
  if (!Number.isInteger(months) || months < 1 || months > 120) {
    return { error: "La cadencia de reevaluación tiene que estar entre 1 y 120 meses." };
  }

  return run(
    () => updateSupplierProfile(g.ok!.organizationId, profileId, {
      relationshipStatus: pick(formData, "relationship_status", RELATIONSHIP_STATUSES, "active")!,
      ownerPositionId: optional(formData, "owner_position_id"),
      reevaluationMonths: months,
      notes: optional(formData, "notes"),
    }),
    () => revalidateSuppliers(profileId),
    "Proveedor actualizado."
  );
}

export async function retireSupplierAction(
  _prev: SupplierActionState, formData: FormData
): Promise<SupplierActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageSuppliers(g.ok.roleCode)) {
    return { error: "Tu rol no permite retirar proveedores." };
  }
  const profileId = text(formData, "profile_id");
  if (!profileId) return { error: "Falta el proveedor." };

  return run(
    () => retireSupplier(g.ok!.organizationId, profileId),
    () => revalidateSuppliers(profileId),
    "Proveedor retirado. Sus evaluaciones, decisiones e historia se conservan íntegras."
  );
}

export async function deleteSupplierAction(
  _prev: SupplierActionState, formData: FormData
): Promise<SupplierActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageSuppliers(g.ok.roleCode)) {
    return { error: "Tu rol no permite eliminar proveedores." };
  }
  const profileId = text(formData, "profile_id");
  if (!profileId) return { error: "Falta el proveedor." };

  // §38 · No se comprueba aquí si «parece» borrable: lo decide la base, con el
  // mismo dictamen que se mostró, y en el momento del borrado. Entre el aviso y
  // la confirmación puede entrar una evaluación.
  return run(
    () => deleteSupplier(g.ok!.organizationId, profileId),
    () => revalidateSuppliers(),
    "Proveedor eliminado."
  );
}

// ---------------------------------------------------------------------------
// Sedes, contactos y categorías (§6, §7, §8)
// ---------------------------------------------------------------------------

export async function createSiteAction(
  _prev: SupplierActionState, formData: FormData
): Promise<SupplierActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageSuppliers(g.ok.roleCode)) return { error: "Tu rol no permite crear sedes." };
  const partyId = text(formData, "party_id");
  const name = text(formData, "name");
  if (!partyId) return { error: "Falta el proveedor." };
  if (name.length < 2) return { error: "Ponle nombre a la sede." };

  return run(
    () => createPartySite(g.ok!.organizationId, partyId, {
      name, code: optional(formData, "code"),
      country: optional(formData, "country"), city: optional(formData, "city"),
      address: optional(formData, "address"), isPrimary: bool(formData, "is_primary"),
    }),
    () => revalidateSuppliers(optional(formData, "profile_id") ?? undefined),
    "Sede creada. La evaluación y la criticidad pueden depender de ella."
  );
}

export async function createContactAction(
  _prev: SupplierActionState, formData: FormData
): Promise<SupplierActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageSuppliers(g.ok.roleCode)) return { error: "Tu rol no permite crear contactos." };
  const partyId = text(formData, "party_id");
  const fullName = text(formData, "full_name");
  if (!partyId) return { error: "Falta el proveedor." };
  if (fullName.length < 2) return { error: "Escribe el nombre del contacto." };

  return run(
    () => createPartyContact(g.ok!.organizationId, partyId, {
      fullName, roleTitle: optional(formData, "role_title"),
      email: optional(formData, "email"), phone: optional(formData, "phone"),
      siteId: optional(formData, "site_id"),
    }),
    () => revalidateSuppliers(optional(formData, "profile_id") ?? undefined),
    "Contacto registrado."
  );
}

export async function createCategoryAction(
  _prev: SupplierActionState, formData: FormData
): Promise<SupplierActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageSuppliers(g.ok.roleCode)) {
    return { error: "Tu rol no permite definir categorías." };
  }
  const name = text(formData, "name");
  if (name.length < 2) return { error: "Ponle nombre a la categoría." };

  return run(
    () => createSupplierCategory(g.ok!.organizationId, {
      name, code: optional(formData, "code"),
      description: optional(formData, "description"),
    }),
    () => revalidatePath("/quality/suppliers/categories"),
    "Categoría creada. La taxonomía la define tu empresa: aquí no hay una lista universal."
  );
}

export async function assignCategoryAction(
  _prev: SupplierActionState, formData: FormData
): Promise<SupplierActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageSuppliers(g.ok.roleCode)) {
    return { error: "Tu rol no permite asignar categorías." };
  }
  const profileId = text(formData, "profile_id");
  const categoryId = text(formData, "category_id");
  if (!profileId || !categoryId) return { error: "Falta el proveedor o la categoría." };

  return run(
    () => assignCategory(g.ok!.organizationId, {
      profileId, categoryId, siteId: optional(formData, "site_id"),
      note: optional(formData, "note"),
    }),
    () => revalidateSuppliers(profileId),
    "Categoría asignada. El mismo proveedor puede prestar varias."
  );
}

export async function createScopeAction(
  _prev: SupplierActionState, formData: FormData
): Promise<SupplierActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageSuppliers(g.ok.roleCode)) return { error: "Tu rol no permite crear alcances." };
  const profileId = text(formData, "profile_id");
  if (!profileId) return { error: "Falta el proveedor." };

  return run(
    () => createScope(g.ok!.organizationId, {
      profileId, siteId: optional(formData, "site_id"),
      categoryId: optional(formData, "category_id"), label: optional(formData, "label"),
    }),
    () => revalidateSuppliers(profileId),
    "Alcance creado. Sobre él se clasifica, se evalúa y se decide."
  );
}

// ---------------------------------------------------------------------------
// Criticidad (§9…§12)
// ---------------------------------------------------------------------------

export async function assessCriticalityAction(
  _prev: SupplierActionState, formData: FormData
): Promise<SupplierActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const scopeId = text(formData, "scope_id");
  const versionId = text(formData, "version_id");
  const levelIds = many(formData, "level_id");
  if (!scopeId || !versionId) return { error: "Falta el alcance o la metodología." };
  if (levelIds.length === 0) return { error: "Elige un valor en cada criterio de la metodología." };

  return run(
    () => assessCriticality({
      scopeId, versionId, levelIds,
      rationale: optional(formData, "rationale"),
      assessedOn: optional(formData, "assessed_on") ?? todayIso(),
    }),
    () => revalidateSuppliers(optional(formData, "profile_id") ?? undefined),
    "Criticidad clasificada. Es una medida de cuánto pesa depender de este proveedor, "
      + "no de cómo lo ha hecho."
  );
}

// ---------------------------------------------------------------------------
// Requisitos (§16, §17)
// ---------------------------------------------------------------------------

export async function createRequirementAction(
  _prev: SupplierActionState, formData: FormData
): Promise<SupplierActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageSuppliers(g.ok.roleCode)) {
    return { error: "Tu rol no permite definir requisitos." };
  }
  const title = text(formData, "title");
  if (title.length < 3) return { error: "Escribe el requisito." };

  return run(
    () => createSupplierRequirement(g.ok!.organizationId, {
      title, code: optional(formData, "code"),
      description: optional(formData, "description"),
      kind: pick(formData, "requirement_kind", REQUIREMENT_KINDS, "documentary")!,
      enforcement: pick(formData, "enforcement", REQUIREMENT_ENFORCEMENTS, "required")!,
      trazadocDocumentId: optional(formData, "trazadoc_document_id"),
    }),
    () => revalidatePath("/quality/suppliers/requirements"),
    "Requisito creado."
  );
}

export async function assignRequirementAction(
  _prev: SupplierActionState, formData: FormData
): Promise<SupplierActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageSuppliers(g.ok.roleCode)) {
    return { error: "Tu rol no permite asignar requisitos." };
  }
  const requirementId = text(formData, "requirement_id");
  const categoryId = optional(formData, "category_id");
  const scopeId = optional(formData, "scope_id");
  if (!requirementId) return { error: "Falta el requisito." };
  if ((categoryId === null) === (scopeId === null)) {
    return { error: "Elige si el requisito aplica a una categoría o a un alcance concreto." };
  }

  return run(
    () => assignRequirement(g.ok!.organizationId, {
      requirementId, categoryId, scopeId,
      effectiveFrom: optional(formData, "effective_from") ?? todayIso(),
      note: optional(formData, "note"),
    }),
    () => revalidateSuppliers(optional(formData, "profile_id") ?? undefined),
    "Requisito asignado con su fecha de entrada en vigor. Lo evaluado antes se sigue "
      + "leyendo contra lo que se exigía entonces."
  );
}

export async function endRequirementAssignmentAction(
  _prev: SupplierActionState, formData: FormData
): Promise<SupplierActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageSuppliers(g.ok.roleCode)) {
    return { error: "Tu rol no permite retirar requisitos." };
  }
  const assignmentId = text(formData, "assignment_id");
  if (!assignmentId) return { error: "Falta la asignación." };

  return run(
    () => endRequirementAssignment(
      g.ok!.organizationId, assignmentId, optional(formData, "effective_to") ?? todayIso()
    ),
    () => revalidateSuppliers(optional(formData, "profile_id") ?? undefined),
    "Requisito retirado desde esa fecha. La asignación anterior se conserva."
  );
}

// ---------------------------------------------------------------------------
// Documentos y certificaciones (§25)
// ---------------------------------------------------------------------------

export async function createDocumentAction(
  _prev: SupplierActionState, formData: FormData
): Promise<SupplierActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageSuppliers(g.ok.roleCode)) {
    return { error: "Tu rol no permite registrar documentos del proveedor." };
  }
  const profileId = text(formData, "profile_id");
  const title = text(formData, "title");
  if (!profileId) return { error: "Falta el proveedor." };
  if (title.length < 3) return { error: "Ponle nombre al documento." };

  return run(
    () => createSupplierDocument(g.ok!.organizationId, {
      profileId, scopeId: optional(formData, "scope_id"),
      requirementId: optional(formData, "requirement_id"),
      kind: text(formData, "document_kind") || "certification",
      title, issuer: optional(formData, "issuer"),
      referenceCode: optional(formData, "reference_code"),
      issuedOn: optional(formData, "issued_on"),
      // Sin fecha de vencimiento = no vence. Es una respuesta legítima.
      expiresOn: optional(formData, "expires_on"),
      trazadocDocumentId: optional(formData, "trazadoc_document_id"),
    }),
    () => revalidateSuppliers(profileId),
    "Documento registrado. Si vence, avisará: vencer no suspende al proveedor por sí solo."
  );
}

// ---------------------------------------------------------------------------
// Plantillas de evaluación (§19, §20)
// ---------------------------------------------------------------------------

export async function createTemplateAction(
  _prev: SupplierActionState, formData: FormData
): Promise<SupplierActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageSuppliers(g.ok.roleCode)) {
    return { error: "Tu rol no permite crear plantillas de evaluación." };
  }
  const name = text(formData, "name");
  if (name.length < 3) return { error: "Ponle nombre a la plantilla." };

  return run(
    async () => {
      const templateId = await createTemplate(g.ok!.organizationId, {
        name, code: optional(formData, "code"),
        description: optional(formData, "description"),
      });
      // La plantilla nace con su primera versión en borrador: una plantilla sin
      // versión no sirve para nada y obligar a crearla aparte es un paso vacío.
      await createTemplateVersionDraft(g.ok!.organizationId, templateId, {
        scoringRule: pick(formData, "scoring_rule", SCORING_RULES, "weighted_average")!,
        bands: defaultBands(),
        changeNote: "Versión inicial",
      });
      return templateId;
    },
    () => revalidatePath("/quality/suppliers/templates"),
    "Plantilla creada con su primera versión en borrador. Añade criterios y publícala."
  );
}

/** Bandas de partida, editables. Se ofrecen porque un número sin banda no
 *  significa nada, y empezar con una hoja en blanco tampoco ayuda. */
function defaultBands(): unknown {
  return [
    { min: 90, max: 100, label: "Excelente" },
    { min: 75, max: 89.999, label: "Aceptable" },
    { min: 60, max: 74.999, label: "Aceptable con condiciones" },
    { min: 0, max: 59.999, label: "Deficiente" },
  ];
}

export async function createTemplateVersionAction(
  _prev: SupplierActionState, formData: FormData
): Promise<SupplierActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageSuppliers(g.ok.roleCode)) {
    return { error: "Tu rol no permite versionar plantillas." };
  }
  const templateId = text(formData, "template_id");
  if (!templateId) return { error: "Falta la plantilla." };

  return run(
    () => createTemplateVersionDraft(g.ok!.organizationId, templateId, {
      scoringRule: pick(formData, "scoring_rule", SCORING_RULES, "weighted_average")!,
      bands: defaultBands(),
      changeNote: optional(formData, "change_note"),
    }),
    () => revalidatePath("/quality/suppliers/templates"),
    "Versión nueva en borrador. Las evaluaciones ya hechas siguen con su versión."
  );
}

export async function addCriterionAction(
  _prev: SupplierActionState, formData: FormData
): Promise<SupplierActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageSuppliers(g.ok.roleCode)) {
    return { error: "Tu rol no permite editar plantillas." };
  }
  const versionId = text(formData, "version_id");
  const code = text(formData, "code");
  const label = text(formData, "label");
  if (!versionId) return { error: "Falta la versión de la plantilla." };
  if (code.length === 0 || label.length < 2) return { error: "El criterio necesita código y nombre." };
  const weight = Number(text(formData, "weight") || "1");
  const maxPoints = Number(text(formData, "max_points") || "100");
  if (!(weight >= 0) || !(maxPoints > 0)) return { error: "El peso y los puntos no son válidos." };

  return run(
    () => addCriterion(g.ok!.organizationId, versionId, {
      code, label, weight, maxPoints,
      method: pick(formData, "evaluation_method", CRITERION_METHODS, "observation")!,
      evidenceExpectation: optional(formData, "evidence_expectation"),
      requirementId: optional(formData, "requirement_id"),
      order: Number(text(formData, "position_order") || "1"),
    }),
    () => revalidatePath("/quality/suppliers/templates"),
    "Criterio añadido."
  );
}

export async function publishTemplateVersionAction(
  _prev: SupplierActionState, formData: FormData
): Promise<SupplierActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const versionId = text(formData, "version_id");
  if (!versionId) return { error: "Falta la versión." };

  return run(
    () => publishTemplateVersion(
      versionId, optional(formData, "effective_from") ?? todayIso(),
      optional(formData, "change_note")
    ),
    () => revalidatePath("/quality/suppliers/templates"),
    "Versión publicada. La anterior queda sustituida y las evaluaciones hechas con ella "
      + "se siguen leyendo con sus criterios y sus pesos."
  );
}

// ---------------------------------------------------------------------------
// Evaluaciones (§18…§23, §30)
// ---------------------------------------------------------------------------

export async function createEvaluationAction(
  _prev: SupplierActionState, formData: FormData
): Promise<SupplierActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageSuppliers(g.ok.roleCode)) {
    return { error: "Tu rol no permite evaluar proveedores." };
  }
  const scopeId = text(formData, "scope_id");
  const versionId = text(formData, "version_id");
  if (!scopeId || !versionId) return { error: "Falta el alcance o la plantilla." };

  return run(
    () => createEvaluation(g.ok!.organizationId, {
      scopeId, versionId,
      kind: pick(formData, "evaluation_kind", EVALUATION_KINDS, "periodic")!,
      triggerReason: optional(formData, "trigger_reason"),
      periodLabel: optional(formData, "period_label"),
      periodStart: optional(formData, "period_start"),
      periodEnd: optional(formData, "period_end"),
    }),
    () => revalidateSuppliers(optional(formData, "profile_id") ?? undefined),
    "Evaluación abierta."
  );
}

export async function recordResultAction(
  _prev: SupplierActionState, formData: FormData
): Promise<SupplierActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageSuppliers(g.ok.roleCode)) {
    return { error: "Tu rol no permite evaluar proveedores." };
  }
  const evaluationId = text(formData, "evaluation_id");
  const criterionId = text(formData, "criterion_id");
  const outcome = pick(formData, "outcome", RESULT_OUTCOMES);
  if (!evaluationId || !criterionId || !outcome) {
    return { error: "Falta la evaluación, el criterio o el resultado." };
  }
  const raw = text(formData, "points");
  if (outcome === "scored" && raw.length === 0) {
    return { error: "Un criterio puntuado necesita su puntuación." };
  }

  return run(
    () => recordResult(g.ok!.organizationId, {
      evaluationId, criterionId, outcome,
      // §22 · «No aplica» NO lleva puntos, y la base lo rechaza si llegan.
      points: outcome === "scored" ? Number(raw) : null,
      observation: optional(formData, "observation"),
      supplierDocumentId: optional(formData, "supplier_document_id"),
      trazadocDocumentId: optional(formData, "trazadoc_document_id"),
    }),
    () => revalidateSuppliers(optional(formData, "profile_id") ?? undefined),
    outcome === "not_applicable"
      ? "Registrado como «no aplica». No cuenta como cero ni baja el resultado."
      : "Resultado registrado."
  );
}

export async function closeEvaluationAction(
  _prev: SupplierActionState, formData: FormData
): Promise<SupplierActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const evaluationId = text(formData, "evaluation_id");
  if (!evaluationId) return { error: "Falta la evaluación." };

  const g2 = g.ok!;
  try {
    const outcome = await closeEvaluation(
      evaluationId, optional(formData, "summary"),
      optional(formData, "evaluated_on") ?? todayIso()
    );
    revalidateSuppliers(optional(formData, "profile_id") ?? undefined);
    void g2;
    // §21 · Se dice el resultado Y se dice que no decide nada. Es la frase que
    // impide que alguien lea el número como una homologación.
    const ausencias = [
      outcome.notApplicable > 0 ? `${outcome.notApplicable} no aplican` : null,
      outcome.unavailable > 0 ? `${outcome.unavailable} sin dato` : null,
      outcome.notEvaluated > 0 ? `${outcome.notEvaluated} sin evaluar` : null,
    ].filter(Boolean).join(", ");
    return {
      ...OK,
      message:
        `Resultado: ${outcome.score ?? "—"}${outcome.band ? ` · ${outcome.band}` : ""}`
        + ` (${outcome.scored} de ${outcome.criteriaTotal} criterios puntuados`
        + (ausencias ? `; ${ausencias}` : "") + "). "
        + "Esto NO aprueba al proveedor: la decisión de aprobación es un acto aparte.",
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo cerrar la evaluación." };
  }
}

// ---------------------------------------------------------------------------
// Decisiones (§13, §14, §15, §36)
// ---------------------------------------------------------------------------

export async function decideApprovalAction(
  _prev: SupplierActionState, formData: FormData
): Promise<SupplierActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  // GP-07 · Homologar es responsabilidad de la empresa. El consultor externo
  // acompaña la implantación, pero no decide de quién se compra.
  if (!canDecideSupplierApproval(g.ok.roleCode)) {
    return { error: "Tu rol no permite decidir la aprobación de un proveedor." };
  }
  const scopeId = text(formData, "scope_id");
  const decision = pick(formData, "decision", APPROVAL_DECISIONS);
  const rationale = text(formData, "rationale");
  if (!scopeId || !decision) return { error: "Falta el alcance o la decisión." };
  if (rationale.length < 5) return { error: "Escribe en qué se basa la decisión." };
  if (decision === "conditionally_approved" && text(formData, "conditions").length < 5) {
    return { error: "Una aprobación condicionada tiene que decir cuáles son las condiciones." };
  }

  return run(
    () => decideApproval({
      scopeId, decision, rationale,
      conditions: optional(formData, "conditions"),
      validUntil: optional(formData, "valid_until"),
      evaluationId: optional(formData, "evaluation_id"),
      effectiveFrom: optional(formData, "effective_from") ?? todayIso(),
    }),
    () => revalidateSuppliers(optional(formData, "profile_id") ?? undefined),
    decision === "suspended"
      ? "Suspensión registrada para ESTE alcance. Los demás alcances del proveedor no cambian."
      : "Decisión registrada. La anterior se conserva como sustituida."
  );
}

// ---------------------------------------------------------------------------
// Incidentes y señales (§27, §32, §33)
// ---------------------------------------------------------------------------

export async function recordIncidentAction(
  _prev: SupplierActionState, formData: FormData
): Promise<SupplierActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageSuppliers(g.ok.roleCode)) {
    return { error: "Tu rol no permite registrar incidentes." };
  }
  const profileId = text(formData, "profile_id");
  const title = text(formData, "title");
  if (!profileId) return { error: "Falta el proveedor." };
  if (title.length < 3) return { error: "Describe el incidente." };

  return run(
    () => recordIncident(g.ok!.organizationId, {
      profileId, scopeId: optional(formData, "scope_id"),
      kind: pick(formData, "incident_kind", INCIDENT_KINDS, "delivery")!,
      severity: pick(formData, "severity", INCIDENT_SEVERITIES, "minor")!,
      occurredOn: optional(formData, "occurred_on") ?? todayIso(),
      title, description: optional(formData, "description"),
      isDataIssue: bool(formData, "is_data_issue"),
    }),
    () => revalidateSuppliers(profileId),
    "Incidente registrado. No abre una no conformidad: si hace falta, se abre un caso "
      + "del sistema de gestión y es allí donde se clasifica."
  );
}

export async function openCaseFromIncidentAction(
  _prev: SupplierActionState, formData: FormData
): Promise<SupplierActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageSuppliers(g.ok.roleCode)) {
    return { error: "Tu rol no permite abrir casos." };
  }
  const incidentId = text(formData, "incident_id");
  if (!incidentId) return { error: "Falta el incidente." };

  return run(
    () => openCaseFromIncident(
      incidentId, optional(formData, "title"), optional(formData, "description")
    ),
    () => { revalidateSuppliers(optional(formData, "profile_id") ?? undefined);
            revalidatePath("/quality/cases"); },
    "Caso abierto SIN clasificar, con las referencias al proveedor. Clasificarlo como no "
      + "conformidad —o no— es la decisión de siempre, en la ficha del caso."
  );
}

export async function dismissSignalAction(
  _prev: SupplierActionState, formData: FormData
): Promise<SupplierActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageSuppliers(g.ok.roleCode)) {
    return { error: "Tu rol no permite descartar señales." };
  }
  const signalId = text(formData, "signal_id");
  if (!signalId) return { error: "Falta la señal." };

  return run(
    () => dismissSupplierSignal(g.ok!.organizationId, signalId),
    () => revalidateSuppliers(optional(formData, "profile_id") ?? undefined),
    "Señal descartada."
  );
}

export async function scanSupplierReviewsAction(
  _prev: SupplierActionState, _formData: FormData
): Promise<SupplierActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };

  return run(
    async () => { await scanSupplierReviews(g.ok!.organizationId); },
    () => revalidateSuppliers(),
    "Revisión hecha. Los avisos que ya existían no se duplican, y ninguno cambia por su "
      + "cuenta la aprobación de nadie."
  );
}
