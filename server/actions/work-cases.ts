"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireQualityForAction } from "@/lib/auth/require-quality-module";
import { requireSession } from "@/lib/auth/require-session";
import { checkQualityCanMutate } from "@/server/actions/module-plans";
import {
  callRpc, deleteCaseRow, insertCase, insertRow, nextActionCode, nextCaseCode, updateCase,
} from "@/lib/db/work-cases";
import {
  canGovernCases, canManageCases, canReopenCase,
  DECIDABLE_CLASSIFICATIONS, SELECTABLE_CASE_TYPES,
  ACTION_KINDS, PRIORITIES,
} from "@/lib/domain/work-cases";

/**
 * Trazaloop · QUALITY-04 · Acciones de servidor del flujo de casos.
 *
 * El reparto es deliberado:
 *
 * · lo que solo REGISTRA —crear un borrador, añadir un hallazgo, planificar una
 *   acción— es escritura normal bajo RLS;
 * · lo que DECIDE —clasificar, aprobar una causa, completar, verificar la
 *   eficacia, cerrar, reabrir— pasa por una RPC que comprueba rol, estado e
 *   invariantes en el mismo acto en que registra el hecho.
 *
 * Ninguna de estas funciones deduce una clasificación ni marca una eficacia por
 * su cuenta: eso es exactamente lo que AC-04 y AC-25 prohíben.
 */

export type CaseActionState = {
  error: string | null;
  success?: boolean;
  message?: string | null;
  caseId?: string;
};

const OK: CaseActionState = { error: null, success: true, message: null };

type Gate = { organizationId: string; roleCode: string; userId: string };

async function gate(): Promise<{ ok: Gate | null; error: string | null }> {
  const access = await requireQualityForAction();
  if (access.org === null) return { ok: null, error: access.error };
  const mutate = await checkQualityCanMutate();
  if (!mutate.allowed) return { ok: null, error: mutate.error };
  // Quién actúa se toma de la SESIÓN, nunca del formulario: registrar una
  // decisión a nombre de otro es exactamente lo que no puede poder hacerse.
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
function checked(form: FormData, name: string): boolean {
  return form.get(name) === "on" || form.get(name) === "true";
}

function revalidateCase(caseId?: string) {
  revalidatePath("/quality");
  revalidatePath("/quality/cases");
  revalidatePath("/quality/tasks");
  if (caseId) revalidatePath(`/quality/cases/${caseId}`);
}

// ---------------------------------------------------------------------------
// Crear y editar el caso
// ---------------------------------------------------------------------------

export async function createCaseAction(
  _prev: CaseActionState, formData: FormData
): Promise<CaseActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageCases(g.ok.roleCode)) return { error: "Tu rol no permite registrar casos." };

  const title = text(formData, "title");
  if (title.length < 3) return { error: "Escribe un título que diga qué pasó." };

  const caseType = text(formData, "case_type");
  if (!SELECTABLE_CASE_TYPES.includes(caseType as never)) return { error: "Tipo de caso no válido." };
  const priority = text(formData, "priority") || "normal";
  if (!(PRIORITIES as readonly string[]).includes(priority)) return { error: "Prioridad no válida." };

  const code = await nextCaseCode(g.ok.organizationId);
  if (!code) return { error: "No fue posible asignar el número del caso." };

  // El origen viene del formulario cuando el caso nace de una señal. Nunca se
  // infiere: que un caso venga de un indicador es un hecho, no una suposición.
  const originKind = text(formData, "origin_kind") || "manual";

  const { id, error } = await insertCase(g.ok.organizationId, {
    code, title,
    description: optional(formData, "description"),
    case_type: caseType,
    origin_kind: originKind,
    origin_note: optional(formData, "origin_note"),
    detected_on: optional(formData, "detected_on") ?? new Date().toISOString().slice(0, 10),
    owner_position_id: optional(formData, "owner_position_id"),
    priority,
    reported_by: g.ok.userId || null,
    created_by: g.ok.userId || null,
  });
  if (error || !id) return { error: error ?? "No fue posible crear el caso." };

  // Un caso que nace de una señal la REFERENCIA; no copia el dato (§58).
  const refKind = text(formData, "ref_kind");
  const refId = text(formData, "ref_id");
  if (refKind && refId) {
    const snapshotRaw = text(formData, "ref_snapshot");
    let snapshot: unknown = null;
    if (snapshotRaw) { try { snapshot = JSON.parse(snapshotRaw); } catch { snapshot = null; } }
    const ref = await insertRow("work_references", {
      organization_id: g.ok.organizationId, owner_kind: "case", owner_id: id,
      ref_kind: refKind, ref_id: refId, relation: "origin",
      snapshot, created_by: g.ok.userId || null,
    }, "No fue posible enlazar el caso con su origen.");
    if (ref.error) return { error: ref.error, caseId: id };
  }

  const processId = text(formData, "process_id");
  if (processId) {
    await insertRow("work_case_processes", {
      organization_id: g.ok.organizationId, case_id: id, process_id: processId,
    }, "No fue posible relacionar el proceso.");
  }

  revalidateCase(id);
  redirect(`/quality/cases/${id}`);
}

export async function updateCaseAction(
  _prev: CaseActionState, formData: FormData
): Promise<CaseActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageCases(g.ok.roleCode)) return { error: "Tu rol no permite editar casos." };
  const caseId = text(formData, "case_id");

  const { error } = await updateCase(g.ok.organizationId, caseId, {
    title: text(formData, "title"),
    description: optional(formData, "description"),
    priority: text(formData, "priority") || "normal",
    owner_position_id: optional(formData, "owner_position_id"),
    evidence_text: optional(formData, "evidence_text"),
  });
  if (error) return { error };
  revalidateCase(caseId);
  return { ...OK, message: "Caso actualizado." };
}

export async function addProcessAction(
  _prev: CaseActionState, formData: FormData
): Promise<CaseActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageCases(g.ok.roleCode)) return { error: "Tu rol no permite editar casos." };
  const caseId = text(formData, "case_id");
  const processId = text(formData, "process_id");
  if (!processId) return { error: "Elige un proceso." };
  const { error } = await insertRow("work_case_processes", {
    organization_id: g.ok.organizationId, case_id: caseId, process_id: processId,
  }, "No fue posible relacionar el proceso.");
  if (error) return { error };
  revalidateCase(caseId);
  return { ...OK, message: "Proceso relacionado." };
}

export async function addRequirementAction(
  _prev: CaseActionState, formData: FormData
): Promise<CaseActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageCases(g.ok.roleCode)) return { error: "Tu rol no permite editar casos." };
  const caseId = text(formData, "case_id");

  // Exactamente UNA fuente: normativa, documento interno, u otro en texto.
  // La base lo exige con un CHECK; aquí se explica antes de llegar a él.
  const requirementId = optional(formData, "requirement_id");
  const documentId = optional(formData, "document_id");
  const customText = optional(formData, "custom_text");
  const chosen = [requirementId, documentId, customText].filter((v) => v !== null).length;
  if (chosen === 0) return { error: "Elige un requisito normativo, un documento interno, o escribe cuál es." };
  if (chosen > 1) return { error: "Elige una sola fuente de requisito por línea." };

  const { error } = await insertRow("work_case_requirements", {
    organization_id: g.ok.organizationId, case_id: caseId,
    requirement_id: requirementId, document_id: documentId, custom_text: customText,
    note: optional(formData, "note"), created_by: g.ok.userId || null,
  }, "No fue posible relacionar el requisito.");
  if (error) return { error };
  revalidateCase(caseId);
  return { ...OK, message: "Requisito relacionado." };
}

export async function addFindingAction(
  _prev: CaseActionState, formData: FormData
): Promise<CaseActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageCases(g.ok.roleCode)) return { error: "Tu rol no permite registrar hallazgos." };
  const caseId = text(formData, "case_id");
  const statement = text(formData, "statement");
  if (statement.length < 5) return { error: "Describe qué se encontró." };

  const { error } = await insertRow("work_case_findings", {
    organization_id: g.ok.organizationId, case_id: caseId,
    statement, location_text: optional(formData, "location_text"),
    observed_on: optional(formData, "observed_on") ?? new Date().toISOString().slice(0, 10),
    observed_by: g.ok.userId || null,
    evidence_note: optional(formData, "evidence_note"),
    created_by: g.ok.userId || null,
  }, "No fue posible registrar el hallazgo.");
  if (error) return { error };
  revalidateCase(caseId);
  return { ...OK, message: "Hallazgo registrado." };
}

// ---------------------------------------------------------------------------
// Las decisiones formales
// ---------------------------------------------------------------------------

/** La decisión de AC-04: esto ES o NO ES una no conformidad, y por qué. */
export async function classifyCaseAction(
  _prev: CaseActionState, formData: FormData
): Promise<CaseActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canGovernCases(g.ok.roleCode)) {
    return { error: "Solo la administración o el área de calidad clasifican un caso." };
  }
  const caseId = text(formData, "case_id");
  const classification = text(formData, "classification");
  if (!DECIDABLE_CLASSIFICATIONS.includes(classification as never)) {
    return { error: "Elige una clasificación." };
  }
  const { error } = await callRpc("work_classify_case", {
    p_case_id: caseId,
    p_classification: classification,
    p_rationale: text(formData, "rationale"),
    p_requirement_text: optional(formData, "requirement_text"),
    p_evidence_text: optional(formData, "evidence_text"),
    p_nonconformity_text: optional(formData, "nonconformity_text"),
  }, "No fue posible registrar la clasificación.");
  if (error) return { error };
  revalidateCase(caseId);
  return { ...OK, message: "Clasificación registrada en el historial." };
}

export async function addCauseAction(
  _prev: CaseActionState, formData: FormData
): Promise<CaseActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageCases(g.ok.roleCode)) return { error: "Tu rol no permite registrar análisis." };
  const caseId = text(formData, "case_id");
  const analysis = text(formData, "analysis");
  if (analysis.length < 10) return { error: "Escribe el análisis: sin desarrollo no hay causa que validar." };

  const { error } = await insertRow("work_case_causes", {
    organization_id: g.ok.organizationId, case_id: caseId,
    methodology: text(formData, "methodology") || "structured",
    analysis, hypothesis: optional(formData, "hypothesis"),
    created_by: g.ok.userId || null,
  }, "No fue posible registrar el análisis.");
  if (error) return { error };
  revalidateCase(caseId);
  return { ...OK, message: "Análisis registrado. La causa todavía es una hipótesis." };
}

/** De hipótesis a causa validada (AC-10). A partir de aquí es historia. */
export async function approveCauseAction(
  _prev: CaseActionState, formData: FormData
): Promise<CaseActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canGovernCases(g.ok.roleCode)) {
    return { error: "Solo la administración o el área de calidad aprueban una causa." };
  }
  const caseId = text(formData, "case_id");
  const { error } = await callRpc("work_approve_cause", {
    p_cause_id: text(formData, "cause_id"),
    p_validated_cause: text(formData, "validated_cause"),
    p_rationale: optional(formData, "rationale"),
  }, "No fue posible aprobar la causa.");
  if (error) return { error };
  revalidateCase(caseId);
  return { ...OK, message: "Causa aprobada. Queda fija en el historial." };
}

// ---------------------------------------------------------------------------
// Las acciones
// ---------------------------------------------------------------------------

export async function createActionAction(
  _prev: CaseActionState, formData: FormData
): Promise<CaseActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageCases(g.ok.roleCode)) return { error: "Tu rol no permite planificar acciones." };
  const caseId = text(formData, "case_id");

  const kind = text(formData, "action_kind");
  if (!(ACTION_KINDS as readonly string[]).includes(kind)) return { error: "Tipo de acción no válido." };
  const title = text(formData, "title");
  if (title.length < 3) return { error: "Escribe qué se va a hacer." };

  const requires = checked(formData, "requires_effectiveness");
  const criteria = optional(formData, "effectiveness_criteria");
  // AC-16: el criterio se define ANTES. Definirlo después es elegir el examen
  // sabiendo la nota.
  if (requires && !criteria) {
    return { error: "Si la acción exige verificar su eficacia, escribe ahora contra qué se va a comprobar." };
  }

  const code = await nextActionCode(g.ok.organizationId);
  if (!code) return { error: "No fue posible asignar el número de la acción." };
  const dueOn = optional(formData, "due_on");

  const supabase = await import("@/lib/supabase/server").then((m) => m.createServerClient());
  const { data, error } = await supabase.from("work_actions").insert({
    organization_id: g.ok.organizationId, code, action_kind: kind, title,
    description: optional(formData, "description"),
    expected_result: optional(formData, "expected_result"),
    owner_position_id: optional(formData, "owner_position_id"),
    due_on: dueOn,
    original_due_on: dueOn,
    priority: text(formData, "priority") || "normal",
    requires_effectiveness: requires,
    effectiveness_criteria: criteria,
    effectiveness_result: requires ? "pending" : "not_required",
    created_by: g.ok.userId || null,
  }).select("id").single();
  if (error || !data) return { error: "No fue posible crear la acción." };
  const actionId = data.id as string;

  // La acción se ata al caso por REFERENCIA, no por una FK directa: AC-12 dice
  // que una acción puede tener varios objetos de origen, y mañana los tendrá.
  const ref = await insertRow("work_references", {
    organization_id: g.ok.organizationId, owner_kind: "action", owner_id: actionId,
    ref_kind: "work_case", ref_id: caseId, relation: "origin", created_by: g.ok.userId || null,
  }, "No fue posible enlazar la acción con el caso.");
  if (ref.error) return { error: ref.error };

  await insertRow("work_decisions", {
    organization_id: g.ok.organizationId, subject_kind: "action", subject_id: actionId,
    decision_kind: "action_planned", outcome: kind, rationale: title, decided_by: g.ok.userId || null,
  }, "No fue posible registrar la planificación.");

  // La acción produce una TAREA para quien la ejecuta (§21: acción ≠ tarea).
  const ownerPosition = optional(formData, "owner_position_id");
  if (ownerPosition) {
    const { data: holder } = await supabase
      .from("quality_position_assignments").select("profile_id")
      .eq("organization_id", g.ok.organizationId).eq("position_id", ownerPosition)
      .eq("assignment_type", "holder").maybeSingle();
    if (holder?.profile_id) {
      await insertRow("work_tasks", {
        organization_id: g.ok.organizationId, source_domain: "action",
        task_type: "action_execution", subject_type: "work_action", subject_id: actionId,
        title: `Ejecutar: ${title}`,
        description: optional(formData, "expected_result"),
        assignee_profile_id: holder.profile_id, status: "open", due_at: dueOn,
        dedupe_key: `task:action:${actionId}`, created_by: g.ok.userId || null,
      }, "No fue posible crear la tarea de la acción.");
    }
  }

  await updateCase(g.ok.organizationId, caseId, { status: "in_action" });
  revalidateCase(caseId);
  return { ...OK, message: "Acción planificada." };
}

/** Completar NO es haber servido (AC-13). */
export async function completeActionAction(
  _prev: CaseActionState, formData: FormData
): Promise<CaseActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const caseId = text(formData, "case_id");
  const { error } = await callRpc("work_complete_action", {
    p_action_id: text(formData, "action_id"),
    p_completed_on: optional(formData, "completed_on"),
    p_note: text(formData, "note"),
  }, "No fue posible completar la acción.");
  if (error) return { error };
  revalidateCase(caseId);
  return { ...OK, message: "Acción completada. Si exige verificación, queda pendiente comprobar si sirvió." };
}

export async function verifyEffectivenessAction(
  _prev: CaseActionState, formData: FormData
): Promise<CaseActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canGovernCases(g.ok.roleCode)) {
    return { error: "Solo la administración o el área de calidad verifican la eficacia." };
  }
  const caseId = text(formData, "case_id");
  const { error } = await callRpc("work_verify_effectiveness", {
    p_action_id: text(formData, "action_id"),
    p_result: text(formData, "result"),
    p_criteria: optional(formData, "criteria"),
    p_comment: optional(formData, "comment"),
  }, "No fue posible registrar la verificación.");
  if (error) return { error };
  revalidateCase(caseId);
  return { ...OK, message: "Verificación registrada en el historial." };
}

// ---------------------------------------------------------------------------
// Cierre y reapertura
// ---------------------------------------------------------------------------

export async function closeCaseAction(
  _prev: CaseActionState, formData: FormData
): Promise<CaseActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canGovernCases(g.ok.roleCode)) {
    return { error: "Solo la administración o el área de calidad cierran un caso." };
  }
  const caseId = text(formData, "case_id");
  const { error } = await callRpc("work_close_case", {
    p_case_id: caseId, p_note: text(formData, "note"),
  }, "No fue posible cerrar el caso.");
  if (error) return { error };
  revalidateCase(caseId);
  return { ...OK, message: "Caso cerrado." };
}

export async function reopenCaseAction(
  _prev: CaseActionState, formData: FormData
): Promise<CaseActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canReopenCase(g.ok.roleCode)) {
    return { error: "Solo la administración reabre un caso cerrado." };
  }
  const caseId = text(formData, "case_id");
  const { error } = await callRpc("work_reopen_case", {
    p_case_id: caseId, p_reason: text(formData, "reason"),
  }, "No fue posible reabrir el caso.");
  if (error) return { error };
  revalidateCase(caseId);
  return { ...OK, message: "Caso reabierto. El cierre anterior se conserva en el historial." };
}

export async function scanPendingActionsAction(
  _prev: CaseActionState, _formData: FormData
): Promise<CaseActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const { error } = await callRpc("work_scan_pending_actions",
    { p_organization_id: g.ok.organizationId }, "No fue posible revisar los pendientes.");
  if (error) return { error };
  revalidateCase();
  return { ...OK, message: "Pendientes revisados." };
}

export async function deleteCaseAction(
  _prev: CaseActionState, formData: FormData
): Promise<CaseActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canGovernCases(g.ok.roleCode)) return { error: "Tu rol no permite eliminar casos." };
  const { error } = await deleteCaseRow(g.ok.organizationId, text(formData, "case_id"));
  if (error) return { error };
  revalidateCase();
  redirect("/quality/cases");
}
