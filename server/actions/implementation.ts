"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { createServerClient } from "@/lib/supabase/server";
import {
  getImplementationDashboard,
  listImplementationNextActions,
  listImplementationFeedback,
  getImplementationFeedback,
  isFeedbackStatusGuard,
  isFeedbackRelatedEntityTypeGuard,
  validateFeedbackDraft,
  buildFeedbackInsertPayload,
  VALIDATABLE_RELATED_ENTITY_TABLE,
  type ImplementationDashboard,
  type NextAction,
  type FeedbackRow,
  type FeedbackFilters,
  type FeedbackRelatedEntityType,
} from "@/lib/db/implementation";
import {
  resolveChecklist,
  type ChecklistItem,
  type ChecklistFacts,
} from "@/lib/domain/implementation";

// ---------------------------------------------------------------------------
// Lecturas (llamadas directas desde Server Components; sin FormData).
// La empresa activa SIEMPRE se resuelve en servidor (requireActiveOrg): el
// cliente nunca envía organization_id.
// ---------------------------------------------------------------------------

export async function getImplementationDashboardAction(): Promise<ImplementationDashboard> {
  const org = await requireActiveOrg();
  return getImplementationDashboard(org.organizationId);
}

export async function getImplementationNextActionsAction(): Promise<NextAction[]> {
  const org = await requireActiveOrg();
  return listImplementationNextActions(org.organizationId);
}

/** Arma el checklist de 17 pasos combinando el dashboard de implementación
 *  con un par de señales adicionales que ya existen en el flujo guiado
 *  (0032): órdenes sin consumo y lotes listos para calcular. No repite la
 *  lógica de cálculo ni de trazabilidad: solo la lee. */
export async function getImplementationChecklistAction(): Promise<ChecklistItem[]> {
  const org = await requireActiveOrg();
  const supabase = await createServerClient();
  const [dashboard, guided, feedbackCountRes] = await Promise.all([
    getImplementationDashboard(org.organizationId),
    supabase
      .from("v_guided_flow_dashboard")
      .select(
        "output_batches_without_consumption, output_batches_ready_to_calculate"
      )
      .eq("organization_id", org.organizationId)
      .maybeSingle(),
    supabase
      .from("implementation_feedback")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.organizationId),
  ]);

  const facts: ChecklistFacts = {
    hasOrganization: true,
    suppliersCount: dashboard.suppliersCount,
    materialsCount: dashboard.materialsCount,
    recycledMaterialsCount: dashboard.recycledMaterialsCount,
    materialsWithoutOriginSupportCount: dashboard.materialsWithoutOriginSupportCount,
    evidencesCount: dashboard.evidencesCount,
    validEvidencesCount: dashboard.validEvidencesCount,
    pendingEvidencesCount: dashboard.pendingEvidencesCount,
    inputBatchesCount: dashboard.inputBatchesCount,
    productionOrdersCount: dashboard.productionOrdersCount,
    hasOrderWithoutConsumption: Number(guided.data?.output_batches_without_consumption ?? 0) > 0,
    outputBatchesCount: dashboard.outputBatchesCount,
    outputBatchesWithCompositionCount: dashboard.outputBatchesWithCompositionCount,
    hasReadyToCalculate: Number(guided.data?.output_batches_ready_to_calculate ?? 0) > 0,
    calculatedOutputBatchesCount: dashboard.calculatedOutputBatchesCount,
    criticalGapsCount: dashboard.criticalGapsCount,
    defensibleCalculationsCount: dashboard.defensibleCalculationsCount,
    guidedFlowTouched: dashboard.outputBatchesCount > 0,
    feedbackCount: feedbackCountRes.count ?? 0,
  };

  return resolveChecklist(facts);
}

export async function listImplementationFeedbackAction(
  filters?: FeedbackFilters
): Promise<FeedbackRow[]> {
  const org = await requireActiveOrg();
  return listImplementationFeedback(org.organizationId, filters);
}

export async function getImplementationFeedbackAction(
  id: string
): Promise<FeedbackRow | null> {
  const org = await requireActiveOrg();
  return getImplementationFeedback(org.organizationId, id);
}

// ---------------------------------------------------------------------------
// Mutaciones (formularios con useActionState, mismo patrón que
// server/actions/evidences.ts y server/actions/traceability.ts).
// ---------------------------------------------------------------------------
export type FeedbackActionState = { error: string | null; warning?: string | null };
const okState: FeedbackActionState = { error: null };

/** Si la entidad relacionada es de un tipo validable (Parte 4), confirma
 *  que pertenece a la EMPRESA ACTIVA antes de guardar el feedback. Para
 *  tipos genéricos ('dossier', 'other') sin tabla propia, no rompe: guarda
 *  el dato tal cual, sin aceptar ningún organization_id externo (nunca se
 *  lee organization_id del formulario en ningún caso). */
async function validateRelatedEntity(
  orgId: string,
  type: FeedbackRelatedEntityType | null,
  id: string | null
): Promise<string | null> {
  if (!type || !id) return null;
  const table = VALIDATABLE_RELATED_ENTITY_TABLE[type];
  if (!table) return null; // 'dossier' / 'other': no validable, no bloquea.
  const supabase = await createServerClient();
  const { data } = await supabase
    .from(table)
    .select("id")
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!data) {
    return "La entidad relacionada no pertenece a tu empresa activa.";
  }
  return null;
}

function readRelatedEntity(formData: FormData): {
  type: FeedbackRelatedEntityType | null;
  id: string | null;
  error: string | null;
} {
  const rawType = String(formData.get("related_entity_type") ?? "").trim();
  const rawId = String(formData.get("related_entity_id") ?? "").trim();
  if (!rawType && !rawId) return { type: null, id: null, error: null };
  if (!rawType || !rawId) {
    return {
      type: null,
      id: null,
      error: "Si asocias una entidad relacionada, indica su tipo y su identificador.",
    };
  }
  if (!isFeedbackRelatedEntityTypeGuard(rawType)) {
    return { type: null, id: null, error: "Tipo de entidad relacionada no reconocido." };
  }
  return { type: rawType, id: rawId, error: null };
}

/** Crea un hallazgo de feedback de la prueba real (Parte 6). El rol lo
 *  impone la RLS de implementation_feedback (admin, quality, consultant);
 *  aquí se valida además en servidor para dar un mensaje claro. */
export async function createImplementationFeedbackAction(
  _prev: FeedbackActionState,
  formData: FormData
): Promise<FeedbackActionState> {
  const org = await requireActiveOrg();
  const supabase = await createServerClient();

  if (!["admin", "quality", "consultant"].includes(org.roleCode)) {
    return { error: "Tu rol no permite registrar feedback en esta empresa." };
  }

  const moduleValue = String(formData.get("module") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const severity = String(formData.get("severity") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const stepsToReproduce = String(formData.get("steps_to_reproduce") ?? "").trim() || null;
  const expectedResult = String(formData.get("expected_result") ?? "").trim() || null;
  const actualResult = String(formData.get("actual_result") ?? "").trim() || null;

  const draftError = validateFeedbackDraft({ module: moduleValue, category, severity, title, description });
  if (draftError.error) return { error: draftError.error };

  const related = readRelatedEntity(formData);
  if (related.error) return { error: related.error };
  const relatedError = await validateRelatedEntity(org.organizationId, related.type, related.id);
  if (relatedError) return { error: relatedError };

  // organizationId viene SIEMPRE de la empresa activa validada en servidor
  // (requireActiveOrg), nunca del FormData del cliente (ver buildFeedbackInsertPayload).
  const payload = buildFeedbackInsertPayload(org.organizationId, {
    module: moduleValue,
    category,
    severity,
    title,
    description,
    stepsToReproduce,
    expectedResult,
    actualResult,
    relatedEntityType: related.type,
    relatedEntityId: related.id,
  });

  const { error } = await supabase.from("implementation_feedback").insert(payload);

  if (error) {
    return { error: "No fue posible registrar el feedback. Verifica los datos e intenta de nuevo." };
  }

  revalidatePath("/implementation");
  revalidatePath("/implementation/feedback");
  return okState;
}

/** Edita un feedback existente. RLS permite admin/quality (cualquiera) o al
 *  creador (el suyo); el servidor valida enums antes de escribir. */
export async function updateImplementationFeedbackAction(
  _prev: FeedbackActionState,
  formData: FormData
): Promise<FeedbackActionState> {
  const org = await requireActiveOrg();
  const supabase = await createServerClient();

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Falta el identificador del feedback a editar." };

  const moduleValue = String(formData.get("module") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const severity = String(formData.get("severity") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const stepsToReproduce = String(formData.get("steps_to_reproduce") ?? "").trim() || null;
  const expectedResult = String(formData.get("expected_result") ?? "").trim() || null;
  const actualResult = String(formData.get("actual_result") ?? "").trim() || null;

  const draftError = validateFeedbackDraft({ module: moduleValue, category, severity, title, description });
  if (draftError.error) return { error: draftError.error };

  const related = readRelatedEntity(formData);
  if (related.error) return { error: related.error };
  const relatedError = await validateRelatedEntity(org.organizationId, related.type, related.id);
  if (relatedError) return { error: relatedError };

  // organizationId viene SIEMPRE de la empresa activa validada en servidor;
  // el UPDATE además está acotado con .eq("organization_id", ...) más abajo.
  // organization_id es inmutable (trigger 0033) y nunca viaja en el UPDATE.
  const payload = buildFeedbackInsertPayload(org.organizationId, {
    module: moduleValue,
    category,
    severity,
    title,
    description,
    stepsToReproduce,
    expectedResult,
    actualResult,
    relatedEntityType: related.type,
    relatedEntityId: related.id,
  });

  const { data, error } = await supabase
    .from("implementation_feedback")
    .update({
      module: payload.module,
      category: payload.category,
      severity: payload.severity,
      title: payload.title,
      description: payload.description,
      steps_to_reproduce: payload.steps_to_reproduce,
      expected_result: payload.expected_result,
      actual_result: payload.actual_result,
      related_entity_type: payload.related_entity_type,
      related_entity_id: payload.related_entity_id,
    })
    .eq("id", id)
    .eq("organization_id", org.organizationId)
    .select("id");

  if (error) {
    return { error: "No fue posible guardar los cambios del feedback." };
  }
  if ((data ?? []).length === 0) {
    return {
      error:
        "No se guardó: el feedback no existe o tu rol no permite editarlo (solo admin, calidad o quien lo creó).",
    };
  }

  revalidatePath("/implementation");
  revalidatePath("/implementation/feedback");
  return okState;
}

/** Cambia solo el estado (open → in_review → resolved → closed). */
export async function updateImplementationFeedbackStatusAction(
  _prev: FeedbackActionState,
  formData: FormData
): Promise<FeedbackActionState> {
  const org = await requireActiveOrg();
  const supabase = await createServerClient();

  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "").trim();
  if (!id) return { error: "Falta el identificador del feedback." };
  if (!isFeedbackStatusGuard(status)) return { error: "Estado no válido." };

  const { data, error } = await supabase
    .from("implementation_feedback")
    .update({ status })
    .eq("id", id)
    .eq("organization_id", org.organizationId)
    .select("id");

  if (error) {
    return { error: "No fue posible cambiar el estado del feedback." };
  }
  if ((data ?? []).length === 0) {
    return {
      error:
        "No se actualizó: el feedback no existe o tu rol no permite cambiar su estado.",
    };
  }

  revalidatePath("/implementation");
  revalidatePath("/implementation/feedback");
  return okState;
}

/** Elimina un feedback. RLS restringe a admin/quality. */
export async function deleteImplementationFeedbackAction(
  _prev: FeedbackActionState,
  formData: FormData
): Promise<FeedbackActionState> {
  const org = await requireActiveOrg();
  const supabase = await createServerClient();

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Falta el identificador del feedback a eliminar." };

  const { data, error } = await supabase
    .from("implementation_feedback")
    .delete()
    .eq("id", id)
    .eq("organization_id", org.organizationId)
    .select("id");

  if (error) {
    return { error: "No fue posible eliminar el feedback." };
  }
  if ((data ?? []).length === 0) {
    return {
      error: "No se eliminó: el feedback no existe o tu rol no permite eliminarlo (solo admin o calidad).",
    };
  }

  revalidatePath("/implementation");
  revalidatePath("/implementation/feedback");
  return okState;
}
