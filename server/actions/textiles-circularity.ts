"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { requireTextilesForAction } from "@/lib/auth/require-textiles-module";
import { checkTextilesCanMutate } from "@/server/actions/module-plans";
import {
  textileCircularityAssessmentBelongsToOrg,
  textileReferenceIsUsableForCircularity,
} from "@/lib/db/textiles-circularity";
import { textileOutputLotBelongsToOrg } from "@/lib/db/textiles-traceability";
import { parseAnswerValue } from "@/lib/domain/textiles-circularity";
import { cleanText } from "@/lib/domain/textiles-catalogs";
import {
  canUploadTextileEvidence,
  canSetTextileEvidenceStatus,
} from "@/lib/domain/textiles-evidences";

/**
 * Trazaloop · Sprint T7 (Textil) · Server actions de evaluación de
 * circularidad.
 *
 * Contrato de seguridad (T3–T6.1): triple guarda + modo solo lectura +
 * pre-check de rol (borradores: admin/quality/consultant; FINALIZAR: solo
 * admin/quality — el consultant prepara y propone) + relaciones verificadas
 * en la MISMA organización + organization_id del servidor. Los campos
 * calculados (circularity_score, readiness_level, dimension_scores, gaps,
 * recommendations, calculated_at, completed_at, completed_by) JAMÁS llegan
 * del cliente: los escribe únicamente la función SQL controlada de 0080
 * bajo flag transaccional. Nada usa service_role.
 */

export type TextileCircularityActionState = { error: string | null };

const UNIQUE_VIOLATION = "23505";
const CIRC_PATH = "/textiles/circularity";

type GateOk = { organizationId: string; roleCode: string };

async function gate(): Promise<{ ok: GateOk | null; error: string | null }> {
  const access = await requireTextilesForAction();
  if (access.org === null) return { ok: null, error: access.error };
  const mutateCheck = await checkTextilesCanMutate();
  if (!mutateCheck.allowed) return { ok: null, error: mutateCheck.error };
  if (!canUploadTextileEvidence(access.org.roleCode)) {
    return {
      ok: null,
      error: "Tu rol no permite editar evaluaciones de circularidad (requiere administrador, calidad o consultor).",
    };
  }
  return {
    ok: { organizationId: access.org.organizationId, roleCode: access.org.roleCode },
    error: null,
  };
}

async function currentUserId(): Promise<string | null> {
  const supabase = await createServerClient();
  return (await supabase.auth.getUser()).data.user?.id ?? null;
}

function revalidateCircularityPaths(assessmentId?: string) {
  revalidatePath(CIRC_PATH);
  revalidatePath(`${CIRC_PATH}/assessments`);
  if (assessmentId) revalidatePath(`${CIRC_PATH}/assessments/${assessmentId}`);
}

// ---------------------------------------------------------------------------
// Evaluaciones
// ---------------------------------------------------------------------------

export type TextileCircularityAssessmentInput = {
  assessmentCode: string;
  referenceId: string;
  outputLotId?: string;
  assessmentDate?: string;
  notes?: string;
};

export async function createTextileCircularityAssessmentAction(
  input: TextileCircularityAssessmentInput
): Promise<{ error: string | null; assessmentId: string | null }> {
  const g = await gate();
  if (!g.ok) return { error: g.error, assessmentId: null };

  const code = cleanText(input.assessmentCode);
  if (!code) return { error: "El código de la evaluación es obligatorio.", assessmentId: null };
  const referenceId = cleanText(input.referenceId);
  if (!referenceId) {
    return { error: "Selecciona la referencia / SKU a evaluar.", assessmentId: null };
  }
  // T9E: la MISMA regla del listado (existe + organización activa + activa)
  // valida la escritura — el formulario solo ofrece referencias utilizables
  // y el servidor jamás acepta una que no ofrecería.
  if (!(await textileReferenceIsUsableForCircularity(g.ok.organizationId, referenceId))) {
    return { error: "La referencia seleccionada no es válida o está inactiva.", assessmentId: null };
  }
  const outputLotId = cleanText(input.outputLotId);
  if (outputLotId && !(await textileOutputLotBelongsToOrg(g.ok.organizationId, outputLotId))) {
    return { error: "El lote producido seleccionado no es válido.", assessmentId: null };
  }

  const supabase = await createServerClient();
  const { data: methodology } = await supabase
    .from("textile_circularity_methodologies")
    .select("id")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (!methodology) return { error: "No hay una metodología de circularidad activa.", assessmentId: null };

  // T7.1: el insert es deliberadamente mínimo (sin status ni campos
  // calculados) y la BD lo GARANTIZA: el trigger BEFORE INSERT de 0081
  // bloquea cualquier evaluación que intente nacer completada o con
  // puntaje/nivel/brechas fabricados, incluso vía API directa.
  const { data, error } = await supabase
    .from("textile_circularity_assessments")
    .insert({
      organization_id: g.ok.organizationId,
      methodology_id: methodology.id as string,
      assessment_code: code,
      reference_id: referenceId,
      output_lot_id: outputLotId,
      assessment_date: cleanText(input.assessmentDate),
      notes: cleanText(input.notes),
    })
    .select("id")
    .maybeSingle();
  if (error && error.code === UNIQUE_VIOLATION) {
    return { error: "Ya existe una evaluación con ese código.", assessmentId: null };
  }
  if (error || !data) {
    // El trigger de destino valida que el lote pertenezca a una orden de la
    // misma referencia; su mensaje llega aquí.
    if (error?.message?.includes("misma referencia")) {
      return { error: "El lote producido debe pertenecer a una orden de la referencia evaluada.", assessmentId: null };
    }
    return { error: "No fue posible crear la evaluación.", assessmentId: null };
  }
  revalidateCircularityPaths();
  return { error: null, assessmentId: data.id as string };
}

export async function updateTextileCircularityAssessmentDraftAction(
  id: string,
  input: { assessmentCode?: string; assessmentDate?: string; notes?: string }
): Promise<TextileCircularityActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };

  const updates: Record<string, unknown> = { updated_by: await currentUserId() };
  const code = cleanText(input.assessmentCode);
  if (code) updates.assessment_code = code;
  updates.assessment_date = cleanText(input.assessmentDate);
  updates.notes = cleanText(input.notes);

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("textile_circularity_assessments")
    .update(updates)
    .eq("id", id)
    .eq("organization_id", g.ok.organizationId)
    .eq("status", "draft")
    .select("id");
  if (error && error.code === UNIQUE_VIOLATION) return { error: "Ya existe una evaluación con ese código." };
  if (error || !data || data.length === 0) {
    return { error: "No fue posible actualizar el borrador (solo los borradores se editan)." };
  }
  revalidateCircularityPaths(id);
  return { error: null };
}

export async function archiveTextileCircularityAssessmentAction(
  id: string
): Promise<TextileCircularityActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("textile_circularity_assessments")
    .update({ status: "archived", updated_by: await currentUserId() })
    .eq("id", id)
    .eq("organization_id", g.ok.organizationId)
    .select("id");
  if (error || !data || data.length === 0) return { error: "No fue posible archivar la evaluación." };
  revalidateCircularityPaths(id);
  return { error: null };
}

// ---------------------------------------------------------------------------
// Respuestas (solo criterios manuales; los derivados los calcula la BD)
// ---------------------------------------------------------------------------

export type TextileCircularityAnswerInput = {
  criterionId: string;
  answerValue?: string;
  notApplicable?: boolean;
  evidenceNotes?: string;
};

export async function upsertTextileCircularityAnswerAction(
  assessmentId: string,
  input: TextileCircularityAnswerInput
): Promise<TextileCircularityActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!(await textileCircularityAssessmentBelongsToOrg(g.ok.organizationId, assessmentId))) {
    return { error: "La evaluación no existe o no pertenece a tu empresa." };
  }
  const criterionId = cleanText(input.criterionId);
  if (!criterionId) return { error: "Selecciona el criterio." };

  let answerValue: number | null = null;
  const notApplicable = Boolean(input.notApplicable);
  if (!notApplicable) {
    const parsed = parseAnswerValue(input.answerValue ?? "");
    if (parsed.value === null) return { error: parsed.error };
    answerValue = parsed.value;
  }

  const supabase = await createServerClient();
  const { error } = await supabase.from("textile_circularity_answers").upsert(
    {
      organization_id: g.ok.organizationId,
      assessment_id: assessmentId,
      criterion_id: criterionId,
      answer_value: answerValue,
      not_applicable: notApplicable,
      evidence_notes: cleanText(input.evidenceNotes),
      updated_by: await currentUserId(),
    },
    { onConflict: "organization_id,assessment_id,criterion_id" }
  );
  if (error) {
    if (error.message?.includes("no aplica")) return { error: 'Este criterio no admite "no aplica".' };
    if (error.message?.includes("completada")) {
      return { error: "Las respuestas de una evaluación completada no pueden modificarse." };
    }
    return { error: "No fue posible guardar la respuesta." };
  }
  revalidateCircularityPaths(assessmentId);
  return { error: null };
}

export async function removeTextileCircularityAnswerAction(
  assessmentId: string,
  criterionId: string
): Promise<TextileCircularityActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("textile_circularity_answers")
    .delete()
    .eq("organization_id", g.ok.organizationId)
    .eq("assessment_id", assessmentId)
    .eq("criterion_id", criterionId)
    .select("id");
  if (error || !data || data.length === 0) return { error: "No fue posible eliminar la respuesta." };
  revalidateCircularityPaths(assessmentId);
  return { error: null };
}

// ---------------------------------------------------------------------------
// Cálculo y finalización (RPCs controladas de 0080; el cliente jamás envía
// puntaje, nivel, dimensiones, brechas ni recomendaciones)
// ---------------------------------------------------------------------------

export async function recalculateTextileCircularityAssessmentAction(
  assessmentId: string
): Promise<{ error: string | null; score: number | null }> {
  const g = await gate();
  if (!g.ok) return { error: g.error, score: null };
  if (!(await textileCircularityAssessmentBelongsToOrg(g.ok.organizationId, assessmentId))) {
    return { error: "La evaluación no existe o no pertenece a tu empresa.", score: null };
  }
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("recalculate_textile_circularity_assessment", {
    p_assessment_id: assessmentId,
  });
  if (error) return { error: "No fue posible calcular la evaluación.", score: null };
  revalidateCircularityPaths(assessmentId);
  return { error: null, score: data === null ? null : Number(data) };
}

export async function finalizeTextileCircularityAssessmentAction(
  assessmentId: string
): Promise<{ error: string | null; score: number | null }> {
  const g = await gate();
  if (!g.ok) return { error: g.error, score: null };
  // Pre-check amable (la RPC re-valida): finalizan admin/quality.
  if (!canSetTextileEvidenceStatus(g.ok.roleCode)) {
    return {
      error: "Finalizar la evaluación requiere rol administrador o calidad (el consultor prepara y propone).",
      score: null,
    };
  }
  if (!(await textileCircularityAssessmentBelongsToOrg(g.ok.organizationId, assessmentId))) {
    return { error: "La evaluación no existe o no pertenece a tu empresa.", score: null };
  }
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("finalize_textile_circularity_assessment", {
    p_assessment_id: assessmentId,
  });
  if (error) return { error: "No fue posible finalizar la evaluación.", score: null };
  revalidateCircularityPaths(assessmentId);
  return { error: null, score: data === null ? null : Number(data) };
}
