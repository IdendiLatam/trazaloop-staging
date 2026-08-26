import "server-only";

import { createServerClient } from "@/lib/supabase/server";
import {
  parseClosure,
  type ActionKind, type ActionStatus, type CaseOrigin, type CaseStatus,
  type CaseType, type Classification, type ClosureEligibility, type DecisionKind,
  type Effectiveness, type Priority, type ReferenceKind,
} from "@/lib/domain/work-cases";

/**
 * Trazaloop · QUALITY-04 · Lectura y escritura de casos y acciones.
 *
 * Todo lo que crea HISTORIA pasa por una RPC: clasificar, aprobar una causa,
 * completar una acción, verificar la eficacia, cerrar y reabrir. Lo demás
 * —crear un borrador, añadir un hallazgo, planificar una acción— es escritura
 * normal bajo RLS.
 *
 * Esa frontera no es capricho: una decisión formal necesita comprobar rol,
 * estado e invariantes EN EL MISMO ACTO en que se registra, y eso no se puede
 * hacer con un INSERT desde el navegador.
 */

/** Traduce el error de una RPC a algo que una persona pueda leer. Los mensajes
 *  de 0121 ya están escritos para eso, así que se dejan pasar tal cual. */
function rpcError(error: { message?: string; code?: string } | null, fallback: string): string {
  const raw = error?.message ?? "";
  if (error?.code === "P0001" && raw.length > 0) return raw;
  const m = raw.match(/^(?:.*?:\s*)?([A-ZÁÉÍÓÚÑ¿][^]*)$/);
  return m ? m[1].trim() : fallback;
}

export type CaseRow = {
  caseId: string; code: string; title: string; description: string | null;
  caseType: CaseType; originKind: CaseOrigin; originNote: string | null;
  detectedOn: string; classification: Classification; priority: Priority; status: CaseStatus;
  requirementText: string | null; evidenceText: string | null; nonconformityText: string | null;
  ownerPositionId: string | null; ownerPositionName: string | null; ownerHolderName: string | null;
  reportedByName: string | null;
  closedAt: string | null; closureNote: string | null; reopenedAt: string | null; reopenCount: number;
  createdAt: string;
  findingCount: number; processNames: string; requirementCount: number;
  actionCount: number; openActionCount: number; overdueActionCount: number;
  pendingEffectivenessCount: number; causeApproved: boolean | null;
};

function mapCase(r: Record<string, unknown>): CaseRow {
  return {
    caseId: r.case_id as string, code: r.code as string, title: r.title as string,
    description: (r.description as string | null) ?? null,
    caseType: r.case_type as CaseType, originKind: r.origin_kind as CaseOrigin,
    originNote: (r.origin_note as string | null) ?? null,
    detectedOn: r.detected_on as string, classification: r.classification as Classification,
    priority: r.priority as Priority, status: r.status as CaseStatus,
    requirementText: (r.requirement_text as string | null) ?? null,
    evidenceText: (r.evidence_text as string | null) ?? null,
    nonconformityText: (r.nonconformity_text as string | null) ?? null,
    ownerPositionId: (r.owner_position_id as string | null) ?? null,
    ownerPositionName: (r.owner_position_name as string | null) ?? null,
    ownerHolderName: (r.owner_holder_name as string | null) ?? null,
    reportedByName: (r.reported_by_name as string | null) ?? null,
    closedAt: (r.closed_at as string | null) ?? null,
    closureNote: (r.closure_note as string | null) ?? null,
    reopenedAt: (r.reopened_at as string | null) ?? null,
    reopenCount: (r.reopen_count as number) ?? 0,
    createdAt: r.created_at as string,
    findingCount: (r.finding_count as number) ?? 0,
    processNames: (r.process_names as string) ?? "",
    requirementCount: (r.requirement_count as number) ?? 0,
    actionCount: (r.action_count as number) ?? 0,
    openActionCount: (r.open_action_count as number) ?? 0,
    overdueActionCount: (r.overdue_action_count as number) ?? 0,
    pendingEffectivenessCount: (r.pending_effectiveness_count as number) ?? 0,
    causeApproved: (r.cause_approved as boolean | null) ?? null,
  };
}

export async function listCases(organizationId: string): Promise<CaseRow[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("v_work_case_overview")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  return (data ?? []).map((r) => mapCase(r as Record<string, unknown>));
}

export async function getCase(organizationId: string, caseId: string): Promise<CaseRow | null> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("v_work_case_overview").select("*")
    .eq("organization_id", organizationId).eq("case_id", caseId).maybeSingle();
  return data ? mapCase(data as Record<string, unknown>) : null;
}

export type FindingRow = {
  id: string; statement: string; locationText: string | null;
  observedOn: string; observedByName: string | null; evidenceNote: string | null;
};

export async function listFindings(organizationId: string, caseId: string): Promise<FindingRow[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("work_case_findings")
    .select("id, statement, location_text, observed_on, evidence_note, observed_by, profiles:observed_by(full_name, email)")
    .eq("organization_id", organizationId).eq("case_id", caseId)
    .order("observed_on", { ascending: true });
  return (data ?? []).map((r) => {
    const p = (r as Record<string, unknown>).profiles as { full_name?: string; email?: string } | null;
    return {
      id: r.id as string, statement: r.statement as string,
      locationText: (r.location_text as string | null) ?? null,
      observedOn: r.observed_on as string,
      observedByName: p ? (p.full_name?.trim() || p.email || null) : null,
      evidenceNote: (r.evidence_note as string | null) ?? null,
    };
  });
}

export type CauseRow = {
  id: string; methodology: string; analysis: string;
  hypothesis: string | null; validatedCause: string | null;
  approvedAt: string | null; approvedByName: string | null; createdAt: string;
};

export async function listCauses(organizationId: string, caseId: string): Promise<CauseRow[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("work_case_causes")
    .select("id, methodology, analysis, hypothesis, validated_cause, approved_at, created_at, profiles:approved_by(full_name, email)")
    .eq("organization_id", organizationId).eq("case_id", caseId)
    .order("created_at", { ascending: true });
  return (data ?? []).map((r) => {
    const p = (r as Record<string, unknown>).profiles as { full_name?: string; email?: string } | null;
    return {
      id: r.id as string, methodology: r.methodology as string, analysis: r.analysis as string,
      hypothesis: (r.hypothesis as string | null) ?? null,
      validatedCause: (r.validated_cause as string | null) ?? null,
      approvedAt: (r.approved_at as string | null) ?? null,
      approvedByName: p ? (p.full_name?.trim() || p.email || null) : null,
      createdAt: r.created_at as string,
    };
  });
}

export type ActionRow = {
  id: string; code: string; actionKind: ActionKind; title: string;
  description: string | null; expectedResult: string | null;
  ownerPositionId: string | null; ownerPositionName: string | null;
  dueOn: string | null; originalDueOn: string | null; priority: Priority;
  status: ActionStatus; completedOn: string | null; completionNote: string | null;
  requiresEffectiveness: boolean; effectivenessCriteria: string | null;
  effectiveness: Effectiveness; closedAt: string | null;
};

export async function listCaseActions(organizationId: string, caseId: string): Promise<ActionRow[]> {
  const supabase = await createServerClient();
  const { data: refs } = await supabase
    .from("work_references").select("owner_id")
    .eq("organization_id", organizationId).eq("owner_kind", "action")
    .eq("ref_kind", "work_case").eq("ref_id", caseId);
  const ids = (refs ?? []).map((r) => r.owner_id as string);
  if (ids.length === 0) return [];
  const { data } = await supabase
    .from("work_actions")
    .select("*, quality_positions!work_actions_owner_position_fk(name)")
    .eq("organization_id", organizationId).in("id", ids)
    .order("created_at", { ascending: true });
  return (data ?? []).map((r) => mapActionRow(r as Record<string, unknown>));
}

/** Mapea una fila cruda de `work_actions` al modelo de la aplicación. Existe
 *  para que la lectura por caso y la lectura por identificador no puedan
 *  divergir: una acción tiene que decir lo mismo mire por donde se mire. */
/*
 * POR QUÉ EL EMBEBIDO SE NOMBRA POR LA RESTRICCIÓN Y NO POR LA COLUMNA
 *
 * `work_actions.owner_position_id` forma parte de una clave foránea COMPUESTA
 * —`(organization_id, owner_position_id)`, MDR-42— y PostgREST no sabe
 * resolverla por el nombre de la columna: responde «Could not find a
 * relationship». Y como el error viaja en `error` y no en `data`, la consulta
 * devolvía `[]` sin decir nada: la tabla de acciones del caso salía VACÍA en
 * pantalla y en el PDF, como si el caso no tuviera acciones.
 *
 * Un fallo que se manifiesta como «no hay datos» es el más caro de todos: nadie
 * lo reporta. Se nombra la restricción, que sí es unívoca.
 */
function mapActionRow(r: Record<string, unknown>): ActionRow {
  const pos = r.quality_positions as { name?: string } | null;
  return {
    id: r.id as string, code: r.code as string, actionKind: r.action_kind as ActionKind,
    title: r.title as string, description: (r.description as string | null) ?? null,
    expectedResult: (r.expected_result as string | null) ?? null,
    ownerPositionId: (r.owner_position_id as string | null) ?? null,
    ownerPositionName: pos?.name ?? null,
    dueOn: (r.due_on as string | null) ?? null,
    originalDueOn: (r.original_due_on as string | null) ?? null,
    priority: r.priority as Priority, status: r.status as ActionStatus,
    completedOn: (r.completed_on as string | null) ?? null,
    completionNote: (r.completion_note as string | null) ?? null,
    requiresEffectiveness: r.requires_effectiveness as boolean,
    effectivenessCriteria: (r.effectiveness_criteria as string | null) ?? null,
    effectiveness: r.effectiveness_result as Effectiveness,
    closedAt: (r.closed_at as string | null) ?? null,
  };
}

/**
 * EXPORT-01.1 · Una acción POR SÍ MISMA, sin pasar por su padre.
 *
 * MDR-46 dice que las acciones son transversales: nacen de un caso, de un
 * riesgo, de una oportunidad o de lo que venga después. Leerlas solo «desde el
 * caso» convertía esa transversalidad en una promesa de papel. Esta consulta
 * las lee por identidad propia, y la RLS decide igual que siempre.
 */
export async function getAction(
  organizationId: string, actionId: string
): Promise<ActionRow | null> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("work_actions")
    .select("*, quality_positions!work_actions_owner_position_fk(name)")
    .eq("organization_id", organizationId).eq("id", actionId)
    .maybeSingle();
  return data ? mapActionRow(data as Record<string, unknown>) : null;
}

/** De dónde viene una acción: su caso, su riesgo, su oportunidad. Es lo que
 *  permite que la ficha diga el contexto sin ser una copia del padre. */
export async function listActionContexts(
  organizationId: string, actionId: string
): Promise<ReferenceRow[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("work_references").select("id, ref_kind, ref_id, relation, note, snapshot")
    .eq("organization_id", organizationId).eq("owner_kind", "action").eq("owner_id", actionId)
    .order("created_at", { ascending: true });
  return (data ?? []).map((r) => ({
    id: r.id as string, refKind: r.ref_kind as ReferenceKind, refId: r.ref_id as string,
    relation: r.relation as string, note: (r.note as string | null) ?? null,
    snapshot: (r.snapshot as Record<string, unknown> | null) ?? null,
  }));
}

/** Las decisiones tomadas SOBRE esta acción: prórrogas, cierres, reaperturas. */
export async function listActionHistory(
  organizationId: string, actionId: string
): Promise<DecisionRow[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("work_decisions")
    .select("id, subject_kind, subject_id, decision_kind, outcome, rationale, decided_at, profiles:decided_by(full_name, email)")
    .eq("organization_id", organizationId).eq("subject_id", actionId)
    .order("decided_at", { ascending: true });
  return (data ?? []).map((r) => {
    const p = (r as Record<string, unknown>).profiles as { full_name?: string; email?: string } | null;
    return {
      id: r.id as string, subjectKind: r.subject_kind as "case" | "action",
      subjectId: r.subject_id as string, decisionKind: r.decision_kind as DecisionKind,
      outcome: (r.outcome as string | null) ?? null,
      rationale: (r.rationale as string | null) ?? null,
      decidedAt: r.decided_at as string,
      decidedByName: p ? (p.full_name?.trim() || p.email || null) : null,
    };
  });
}

/** Todas las acciones de la empresa, para «Mis tareas» y para los listados. */
export async function listAllActions(organizationId: string): Promise<ActionRow[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("work_actions")
    .select("*, quality_positions!work_actions_owner_position_fk(name)")
    .eq("organization_id", organizationId)
    .order("due_on", { ascending: true, nullsFirst: false });
  return (data ?? []).map((r) => mapActionRow(r as Record<string, unknown>));
}

export type VerificationRow = {
  id: string; actionId: string; criteria: string; result: "effective" | "not_effective";
  comment: string | null; verifiedOn: string; verifiedByName: string | null;
};

export async function listVerifications(organizationId: string, actionIds: string[]): Promise<VerificationRow[]> {
  if (actionIds.length === 0) return [];
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("work_action_verifications")
    .select("id, action_id, criteria, result, comment, verified_on, profiles:verified_by(full_name, email)")
    .eq("organization_id", organizationId).in("action_id", actionIds)
    .order("verified_on", { ascending: true });
  return (data ?? []).map((r) => {
    const p = (r as Record<string, unknown>).profiles as { full_name?: string; email?: string } | null;
    return {
      id: r.id as string, actionId: r.action_id as string, criteria: r.criteria as string,
      result: r.result as "effective" | "not_effective",
      comment: (r.comment as string | null) ?? null, verifiedOn: r.verified_on as string,
      verifiedByName: p ? (p.full_name?.trim() || p.email || null) : null,
    };
  });
}

export type DecisionRow = {
  id: string; subjectKind: "case" | "action"; subjectId: string;
  decisionKind: DecisionKind; outcome: string | null; rationale: string | null;
  decidedAt: string; decidedByName: string | null;
};

/** La HISTORIA DE NEGOCIO del caso: qué se decidió, quién y por qué. No es
 *  audit_log —eso sigue siendo técnico— sino el acta que alimenta el timeline. */
export async function listCaseHistory(
  organizationId: string, caseId: string, actionIds: string[]
): Promise<DecisionRow[]> {
  const supabase = await createServerClient();
  const subjects = [caseId, ...actionIds];
  const { data } = await supabase
    .from("work_decisions")
    .select("id, subject_kind, subject_id, decision_kind, outcome, rationale, decided_at, profiles:decided_by(full_name, email)")
    .eq("organization_id", organizationId).in("subject_id", subjects)
    .order("decided_at", { ascending: true });
  return (data ?? []).map((r) => {
    const p = (r as Record<string, unknown>).profiles as { full_name?: string; email?: string } | null;
    return {
      id: r.id as string, subjectKind: r.subject_kind as "case" | "action",
      subjectId: r.subject_id as string, decisionKind: r.decision_kind as DecisionKind,
      outcome: (r.outcome as string | null) ?? null,
      rationale: (r.rationale as string | null) ?? null,
      decidedAt: r.decided_at as string,
      decidedByName: p ? (p.full_name?.trim() || p.email || null) : null,
    };
  });
}

export type ReferenceRow = {
  id: string; refKind: ReferenceKind; refId: string; relation: string;
  note: string | null; snapshot: Record<string, unknown> | null;
};

export async function listCaseReferences(organizationId: string, caseId: string): Promise<ReferenceRow[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("work_references").select("id, ref_kind, ref_id, relation, note, snapshot")
    .eq("organization_id", organizationId).eq("owner_kind", "case").eq("owner_id", caseId)
    .order("created_at", { ascending: true });
  return (data ?? []).map((r) => ({
    id: r.id as string, refKind: r.ref_kind as ReferenceKind, refId: r.ref_id as string,
    relation: r.relation as string, note: (r.note as string | null) ?? null,
    snapshot: (r.snapshot as Record<string, unknown> | null) ?? null,
  }));
}

export type RequirementRow = {
  id: string; label: string; source: string; note: string | null;
};

export async function listCaseRequirements(organizationId: string, caseId: string): Promise<RequirementRow[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("work_case_requirements")
    .select("id, custom_text, note, requirements:requirement_id(code, title, frameworks:framework_id(code, name)), trazadoc_documents!work_case_requirements_doc_fk(code, title)")
    .eq("organization_id", organizationId).eq("case_id", caseId);
  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    const req = row.requirements as { code?: string; title?: string; frameworks?: { code?: string; name?: string } } | null;
    const doc = row.trazadoc_documents as { code?: string; title?: string } | null;
    if (req) {
      return {
        id: r.id as string,
        label: `${req.code ?? ""} · ${req.title ?? ""}`.trim(),
        source: req.frameworks?.name ?? "Requisito normativo",
        note: (r.note as string | null) ?? null,
      };
    }
    if (doc) {
      return {
        id: r.id as string,
        label: `${doc.code ? `${doc.code} · ` : ""}${doc.title ?? ""}`,
        source: "Documento interno",
        note: (r.note as string | null) ?? null,
      };
    }
    return {
      id: r.id as string, label: (r.custom_text as string) ?? "",
      source: "Otro requisito", note: (r.note as string | null) ?? null,
    };
  });
}

export async function getClosureEligibility(caseId: string): Promise<ClosureEligibility> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("work_case_closure_eligibility", { p_case_id: caseId });
  if (error) return parseClosure(null);
  return parseClosure(data);
}

// ---------------------------------------------------------------------------
// Escrituras
// ---------------------------------------------------------------------------

export async function nextCaseCode(organizationId: string): Promise<string | null> {
  const supabase = await createServerClient();
  const { data } = await supabase.rpc("work_next_case_code", { p_organization_id: organizationId });
  return (data as string | null) ?? null;
}

export async function nextActionCode(organizationId: string): Promise<string | null> {
  const supabase = await createServerClient();
  const { data } = await supabase.rpc("work_next_action_code", { p_organization_id: organizationId });
  return (data as string | null) ?? null;
}

export async function insertCase(
  organizationId: string, payload: Record<string, unknown>
): Promise<{ id: string | null; error: string | null }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("work_cases").insert({ organization_id: organizationId, ...payload })
    .select("id").single();
  if (error || !data) return { id: null, error: rpcError(error, "No fue posible crear el caso.") };
  return { id: data.id as string, error: null };
}

export async function updateCase(
  organizationId: string, caseId: string, patch: Record<string, unknown>
): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("work_cases").update(patch)
    .eq("organization_id", organizationId).eq("id", caseId).select("id");
  if (error) return { error: rpcError(error, "No fue posible guardar el caso.") };
  if ((data ?? []).length === 0) return { error: "Tu rol no permite editar este caso." };
  return { error: null };
}

export async function insertRow(
  table: string, payload: Record<string, unknown>, fallback: string
): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { error } = await supabase.from(table).insert(payload);
  return { error: error ? rpcError(error, fallback) : null };
}

export async function callRpc(
  fn: string, args: Record<string, unknown>, fallback: string
): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { error } = await supabase.rpc(fn, args);
  return { error: error ? rpcError(error, fallback) : null };
}

export async function deleteCaseRow(
  organizationId: string, caseId: string
): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("work_cases").delete()
    .eq("organization_id", organizationId).eq("id", caseId).select("id");
  if (error) return { error: rpcError(error, "No fue posible eliminar el caso.") };
  if ((data ?? []).length === 0) {
    return { error: "No fue posible eliminar el caso: puede que ya no exista o que tu rol no lo permita." };
  }
  return { error: null };
}

/** Resumen para la portada de Quality. Números reales, sin ceros decorativos. */
export async function getCaseSummary(organizationId: string): Promise<{
  openCases: number; openNonconformities: number; overdueActions: number; pendingEffectiveness: number;
}> {
  const supabase = await createServerClient();
  const [cases, actions] = await Promise.all([
    supabase.from("work_cases").select("status, classification").eq("organization_id", organizationId),
    supabase.from("work_actions")
      .select("status, due_on, requires_effectiveness, effectiveness_result")
      .eq("organization_id", organizationId),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const cs = cases.data ?? [];
  const as = actions.data ?? [];
  return {
    openCases: cs.filter((c) => c.status !== "closed").length,
    openNonconformities: cs.filter((c) => c.status !== "closed" && c.classification === "nonconformity").length,
    overdueActions: as.filter((a) =>
      ["planned", "in_progress"].includes(a.status as string) &&
      a.due_on !== null && (a.due_on as string) < today).length,
    pendingEffectiveness: as.filter((a) => a.effectiveness_result === "pending").length,
  };
}
