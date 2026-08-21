import "server-only";

import { createServerClient } from "@/lib/supabase/server";
import {
  deriveLifecycleState,
  isWorkflowState,
  type LifecycleState,
  type ParticipantDecision,
  type ParticipantRole,
  type RevisionModel,
  type RouteMode,
  type WorkflowState,
} from "@/lib/domain/document-control";
import type { MasterListRow } from "@/lib/domain/document-master-list";
import type { AlertStatus, AlertType, TaskStatus, TaskType } from "@/lib/domain/work-inbox";

/**
 * Trazaloop Quality · QUALITY-02 · Capa de datos del control documental.
 *
 * Todo corre con la sesión REAL bajo RLS; nada usa service_role. Las
 * escrituras del workflow pasan SIEMPRE por las RPC de 0116 §7 — aquí no hay
 * ni un solo UPDATE que mueva un estado, porque la base tampoco lo permitiría.
 */

function reportQueryFailure(where: string, error: { code?: string; message?: string } | null) {
  console.error(
    `[quality/documents] consulta fallida en ${where}: ${error?.code ?? "sin código"} · ${error?.message ?? "sin mensaje"}`
  );
}

// ---------------------------------------------------------------------------
// Detalle de un documento controlado
// ---------------------------------------------------------------------------
export type RevisionRow = {
  id: string;
  revisionNumber: number;
  revisionLabel: string;
  workflowState: WorkflowState;
  routeMode: RouteMode;
  round: number;
  changeNote: string | null;
  hasSnapshot: boolean;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  reviewDueAt: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  approvedByName: string | null;
  retiredAt: string | null;
  createdAt: string;
  createdBy: string | null;
};

export type ParticipantRow = {
  id: string;
  revisionId: string;
  participantRole: ParticipantRole;
  stepOrder: number;
  round: number;
  profileId: string;
  profileName: string;
  positionId: string | null;
  positionName: string | null;
  decision: ParticipantDecision;
  decidedAt: string | null;
  decisionComment: string | null;
};

export type DecisionRow = {
  id: string;
  revisionId: string;
  revisionNumber: number | null;
  round: number;
  decisionType: string;
  reason: string | null;
  decidedByName: string | null;
  decidedAt: string;
};

export type DocumentControlDetail = {
  documentId: string;
  organizationId: string;
  moduleKey: string;
  code: string | null;
  title: string;
  description: string | null;
  categoryCode: string;
  engineStatus: string;
  revisionModel: RevisionModel;
  disposition: string;
  currentVersion: number;
  ownerId: string | null;
  ownerName: string | null;
  ownerPositionId: string | null;
  ownerPositionName: string | null;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
  retiredAt: string | null;
  retirementReason: string | null;
  sections: {
    id: string;
    sectionKey: string;
    title: string;
    content: string;
    sortOrder: number;
    isRequired: boolean;
  }[];
  revisions: RevisionRow[];
  participants: ParticipantRow[];
  decisions: DecisionRow[];
  /** La revisión de número más alto: la que se está trabajando o la última emitida. */
  currentRevision: RevisionRow | null;
  /** La que rige HOY, que no siempre es la misma. */
  effectiveRevision: RevisionRow | null;
  lifecycle: LifecycleState;
};

function mapRevision(r: Record<string, unknown>): RevisionRow {
  const approver = (r.approver ?? null) as { full_name?: string | null; email?: string | null } | null;
  const state = r.workflow_state as string;
  return {
    id: r.id as string,
    revisionNumber: Number(r.revision_number),
    revisionLabel: r.revision_label as string,
    workflowState: isWorkflowState(state) ? state : "draft",
    routeMode: (r.route_mode as RouteMode) ?? "sequential",
    round: Number(r.round ?? 1),
    changeNote: (r.change_note as string | null) ?? null,
    hasSnapshot: r.content_snapshot !== null && r.content_snapshot !== undefined,
    effectiveFrom: (r.effective_from as string | null) ?? null,
    effectiveTo: (r.effective_to as string | null) ?? null,
    reviewDueAt: (r.review_due_at as string | null) ?? null,
    submittedAt: (r.submitted_at as string | null) ?? null,
    approvedAt: (r.approved_at as string | null) ?? null,
    approvedByName: approver?.full_name ?? approver?.email ?? null,
    retiredAt: (r.retired_at as string | null) ?? null,
    createdAt: r.created_at as string,
    createdBy: (r.created_by as string | null) ?? null,
  };
}

/** La revisión que RIGE hoy. Misma regla que la vista (0116 §8). */
export function pickEffectiveRevision(revisions: RevisionRow[], today: string): RevisionRow | null {
  const candidates = revisions.filter(
    (r) =>
      (r.workflowState === "approved" || r.workflowState === "superseded") &&
      r.retiredAt === null &&
      r.effectiveFrom !== null &&
      r.effectiveFrom <= today &&
      (r.effectiveTo === null || r.effectiveTo >= today)
  );
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) =>
    a.effectiveFrom === b.effectiveFrom
      ? b.revisionNumber - a.revisionNumber
      : (b.effectiveFrom ?? "").localeCompare(a.effectiveFrom ?? "")
  )[0];
}

export async function getDocumentControlDetail(
  organizationId: string,
  documentId: string,
  moduleKey: string,
  today: string = new Date().toISOString().slice(0, 10)
): Promise<DocumentControlDetail | null> {
  const supabase = await createServerClient();

  const { data: docRaw, error } = await supabase
    .from("trazadoc_documents")
    .select(
      "id, organization_id, module_key, code, title, description, category_code, status, " +
        "revision_model, disposition, current_version, owner_id, owner_position_id, created_by, " +
        "created_at, retired_at, retirement_reason, " +
        "owner:profiles!trazadoc_documents_owner_id_fkey(full_name, email), " +
        "creator:profiles!trazadoc_documents_created_by_fkey(full_name, email), " +
        "position:quality_positions!trazadoc_documents_owner_position_fk(name)"
    )
    .eq("organization_id", organizationId)
    .eq("id", documentId)
    .eq("module_key", moduleKey)
    .maybeSingle();

  if (error) reportQueryFailure("getDocumentControlDetail", error);
  if (!docRaw) return null;
  // PostgREST infiere para un select con embeds una unión que incluye su forma
  // de error; se normaliza a registro plano y cada campo se mapea explícito.
  const doc = docRaw as unknown as Record<string, unknown>;

  const [sections, revisions, participants, decisions] = await Promise.all([
    supabase
      .from("trazadoc_document_sections")
      .select("id, section_key, title, content, sort_order, is_required")
      .eq("organization_id", organizationId)
      .eq("document_id", documentId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("trazadoc_document_revisions")
      .select(
        "id, revision_number, revision_label, workflow_state, route_mode, round, change_note, " +
          "content_snapshot, effective_from, effective_to, review_due_at, submitted_at, approved_at, " +
          "retired_at, created_at, created_by, " +
          "approver:profiles!trazadoc_document_revisions_approved_by_fkey(full_name, email)"
      )
      .eq("organization_id", organizationId)
      .eq("document_id", documentId)
      .order("revision_number", { ascending: false }),
    supabase
      .from("trazadoc_document_workflow_participants")
      .select(
        "id, revision_id, participant_role, step_order, round, profile_id, position_id, " +
          "decision, decided_at, decision_comment, " +
          "profile:profiles!trazadoc_document_workflow_participants_profile_id_fkey(full_name, email), " +
          "position:quality_positions!trazadoc_wf_participants_position_fk(name)"
      )
      .eq("organization_id", organizationId)
      .eq("document_id", documentId)
      .order("round", { ascending: true })
      .order("step_order", { ascending: true }),
    supabase
      .from("trazadoc_document_decisions")
      .select(
        "id, revision_id, round, decision_type, reason, decided_at, " +
          "decider:profiles!trazadoc_document_decisions_decided_by_fkey(full_name, email)"
      )
      .eq("organization_id", organizationId)
      .eq("document_id", documentId)
      .order("decided_at", { ascending: true }),
  ]);

  const revisionRows = ((revisions.data ?? []) as unknown as Record<string, unknown>[]).map(mapRevision);
  const currentRevision = revisionRows.length > 0 ? revisionRows[0] : null;
  const effectiveRevision = pickEffectiveRevision(revisionRows, today);

  const ownerProfile = (doc.owner ?? null) as unknown as { full_name?: string | null; email?: string | null } | null;
  const creatorProfile = (doc.creator ?? null) as unknown as { full_name?: string | null; email?: string | null } | null;
  const ownerPosition = (doc.position ?? null) as unknown as { name?: string | null } | null;

  return {
    documentId: doc.id as string,
    organizationId: doc.organization_id as string,
    moduleKey: doc.module_key as string,
    code: (doc.code as string | null) ?? null,
    title: doc.title as string,
    description: (doc.description as string | null) ?? null,
    categoryCode: (doc.category_code as string) ?? "other",
    engineStatus: doc.status as string,
    revisionModel: (doc.revision_model as RevisionModel) ?? "legacy",
    disposition: (doc.disposition as string) ?? "active",
    currentVersion: Number(doc.current_version ?? 1),
    ownerId: (doc.owner_id as string | null) ?? null,
    ownerName: ownerProfile?.full_name ?? ownerProfile?.email ?? null,
    ownerPositionId: (doc.owner_position_id as string | null) ?? null,
    ownerPositionName: ownerPosition?.name ?? null,
    createdBy: (doc.created_by as string | null) ?? null,
    createdByName: creatorProfile?.full_name ?? creatorProfile?.email ?? null,
    createdAt: doc.created_at as string,
    retiredAt: (doc.retired_at as string | null) ?? null,
    retirementReason: (doc.retirement_reason as string | null) ?? null,
    sections: ((sections.data ?? []) as unknown as Record<string, unknown>[]).map((s) => ({
      id: s.id as string,
      sectionKey: s.section_key as string,
      title: s.title as string,
      content: (s.content as string) ?? "",
      sortOrder: Number(s.sort_order ?? 0),
      isRequired: Boolean(s.is_required),
    })),
    revisions: revisionRows,
    participants: ((participants.data ?? []) as unknown as Record<string, unknown>[]).map((p) => {
      const profile = (p.profile ?? null) as { full_name?: string | null; email?: string | null } | null;
      const position = (p.position ?? null) as { name?: string | null } | null;
      return {
        id: p.id as string,
        revisionId: p.revision_id as string,
        participantRole: p.participant_role as ParticipantRole,
        stepOrder: Number(p.step_order ?? 1),
        round: Number(p.round ?? 1),
        profileId: p.profile_id as string,
        profileName: profile?.full_name ?? profile?.email ?? "Sin nombre",
        positionId: (p.position_id as string | null) ?? null,
        positionName: position?.name ?? null,
        decision: p.decision as ParticipantDecision,
        decidedAt: (p.decided_at as string | null) ?? null,
        decisionComment: (p.decision_comment as string | null) ?? null,
      };
    }),
    decisions: ((decisions.data ?? []) as unknown as Record<string, unknown>[]).map((d) => {
      const decider = (d.decider ?? null) as { full_name?: string | null; email?: string | null } | null;
      return {
        id: d.id as string,
        revisionId: d.revision_id as string,
        revisionNumber:
          revisionRows.find((r) => r.id === (d.revision_id as string))?.revisionNumber ?? null,
        round: Number(d.round ?? 1),
        decisionType: d.decision_type as string,
        reason: (d.reason as string | null) ?? null,
        decidedByName: decider?.full_name ?? decider?.email ?? null,
        decidedAt: d.decided_at as string,
      };
    }),
    currentRevision,
    effectiveRevision,
    lifecycle: deriveLifecycleState({
      disposition: (doc.disposition as string) ?? "active",
      workflowState: currentRevision?.workflowState ?? null,
      effectiveFrom: currentRevision?.effectiveFrom ?? null,
      engineStatus: doc.status as string,
      today,
    }),
  };
}

// ---------------------------------------------------------------------------
// Lista maestra — proyección dinámica (D-13 · MDR-16)
// ---------------------------------------------------------------------------

/**
 * Documentos que un responsable de calidad debe ver en SU lista maestra: los
 * propios de Quality y los que, habiendo nacido en otro módulo, algún proceso
 * del sistema de gestión referencia. Un documento de PCR que gobierna un
 * proceso de calidad ES parte del sistema documental, y ocultarlo daría una
 * lista maestra incompleta — que es peor que no tenerla.
 */
export async function listQualityMasterList(
  organizationId: string,
  linkedDocumentIds: string[] = []
): Promise<MasterListRow[]> {
  const supabase = await createServerClient();
  const filter =
    linkedDocumentIds.length > 0
      ? `module_key.eq.quality,document_id.in.(${linkedDocumentIds.join(",")})`
      : "module_key.eq.quality";

  const { data, error } = await supabase
    .from("v_trazadoc_document_control")
    .select("*")
    .eq("organization_id", organizationId)
    .or(filter)
    .order("code", { ascending: true, nullsFirst: false })
    .order("title", { ascending: true });

  if (error || !data) {
    reportQueryFailure("listQualityMasterList", error);
    return [];
  }
  return (data as unknown as Record<string, unknown>[]).map(mapMasterRow);
}

function mapMasterRow(r: Record<string, unknown>): MasterListRow {
  return {
    documentId: r.document_id as string,
    moduleKey: (r.module_key as string) ?? "cpr",
    code: (r.code as string | null) ?? null,
    title: r.title as string,
    categoryCode: (r.category_code as string) ?? "other",
    categoryLabel: (r.category_label as string) ?? "Otros",
    lifecycle: (r.lifecycle_state as LifecycleState) ?? "draft",
    revisionModel: (r.revision_model as RevisionModel) ?? "legacy",
    currentVersion: Number(r.current_version ?? 1),
    currentRevisionNumber:
      r.current_revision_number === null || r.current_revision_number === undefined
        ? null
        : Number(r.current_revision_number),
    effectiveRevisionNumber:
      r.effective_revision_number === null || r.effective_revision_number === undefined
        ? null
        : Number(r.effective_revision_number),
    legacyRevisionUncertain: Boolean(r.legacy_revision_uncertain),
    ownerName: (r.owner_name as string | null) ?? null,
    ownerPositionName: (r.owner_position_name as string | null) ?? null,
    reviewers: (r.reviewers as string | null) ?? null,
    approvers: (r.approvers as string | null) ?? null,
    createdAt: r.created_at as string,
    submittedAt: (r.submitted_at as string | null) ?? null,
    approvedAt: (r.approved_at as string | null) ?? null,
    effectiveFrom: (r.effective_from as string | null) ?? null,
    effectiveTo: (r.effective_to as string | null) ?? null,
    reviewDueAt: (r.review_due_at as string | null) ?? null,
    reviewOverdue: Boolean(r.review_overdue),
    processNames: (r.process_names as string | null) ?? "",
    processCount: Number(r.process_count ?? 0),
    lastDecisionType: (r.last_decision_type as string | null) ?? null,
    lastDecisionAt: (r.last_decision_at as string | null) ?? null,
    disposition: (r.disposition as string) ?? "active",
    sectionsCount: Number(r.sections_count ?? 0),
    filledSectionsCount: Number(r.filled_sections_count ?? 0),
  };
}

/** `current_version` no está en la vista: se lee aparte para la etiqueta legacy. */
export async function getDocumentVersionsByIds(
  organizationId: string,
  ids: string[]
): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("trazadoc_documents")
    .select("id, current_version")
    .eq("organization_id", organizationId)
    .in("id", ids);
  return new Map(
    ((data ?? []) as Record<string, unknown>[]).map((r) => [r.id as string, Number(r.current_version ?? 1)])
  );
}

// ---------------------------------------------------------------------------
// Bandeja: tareas y alertas
// ---------------------------------------------------------------------------
export type TaskRow = {
  id: string;
  taskType: TaskType;
  status: TaskStatus;
  title: string;
  description: string | null;
  subjectId: string;
  subjectRevisionId: string | null;
  subjectModuleKey: string | null;
  documentCode: string | null;
  createdAt: string;
  dueAt: string | null;
  completedAt: string | null;
  resolution: string | null;
  assigneeProfileId: string;
  assigneeName: string | null;
};

export async function listMyTasks(
  organizationId: string,
  profileId: string,
  opts: { includeClosed?: boolean } = {}
): Promise<TaskRow[]> {
  const supabase = await createServerClient();
  let query = supabase
    .from("work_tasks")
    .select(
      "id, task_type, status, title, description, subject_id, subject_revision_id, created_at, " +
        "due_at, completed_at, resolution, assignee_profile_id, " +
        "assignee:profiles!work_tasks_assignee_profile_id_fkey(full_name, email)"
    )
    .eq("organization_id", organizationId)
    .eq("assignee_profile_id", profileId)
    .order("created_at", { ascending: false });
  if (!opts.includeClosed) query = query.in("status", ["open", "in_progress"]);

  const { data, error } = await query;
  if (error || !data) {
    reportQueryFailure("listMyTasks", error);
    return [];
  }
  const rows = data as unknown as Record<string, unknown>[];
  const documentIds = [...new Set(rows.map((r) => r.subject_id as string))];
  const documents = await getDocumentIdentityByIds(organizationId, documentIds);

  return rows.map((r) => {
    const assignee = (r.assignee ?? null) as { full_name?: string | null; email?: string | null } | null;
    const doc = documents.get(r.subject_id as string);
    return {
      id: r.id as string,
      taskType: r.task_type as TaskType,
      status: r.status as TaskStatus,
      title: r.title as string,
      description: (r.description as string | null) ?? null,
      subjectId: r.subject_id as string,
      subjectRevisionId: (r.subject_revision_id as string | null) ?? null,
      subjectModuleKey: doc?.moduleKey ?? null,
      documentCode: doc?.code ?? null,
      createdAt: r.created_at as string,
      dueAt: (r.due_at as string | null) ?? null,
      completedAt: (r.completed_at as string | null) ?? null,
      resolution: (r.resolution as string | null) ?? null,
      assigneeProfileId: r.assignee_profile_id as string,
      assigneeName: assignee?.full_name ?? assignee?.email ?? null,
    };
  });
}

export type AlertRow = {
  id: string;
  alertType: AlertType;
  severity: string;
  status: AlertStatus;
  title: string;
  message: string | null;
  subjectId: string;
  subjectModuleKey: string | null;
  createdAt: string;
};

export async function listMyAlerts(
  organizationId: string,
  profileId: string,
  opts: { includeClosed?: boolean } = {}
): Promise<AlertRow[]> {
  const supabase = await createServerClient();
  let query = supabase
    .from("work_alerts")
    .select("id, alert_type, severity, status, title, message, subject_id, created_at")
    .eq("organization_id", organizationId)
    .eq("recipient_profile_id", profileId)
    .order("created_at", { ascending: false });
  if (!opts.includeClosed) query = query.in("status", ["new", "seen", "acknowledged"]);

  const { data, error } = await query;
  if (error || !data) {
    reportQueryFailure("listMyAlerts", error);
    return [];
  }
  const rows = data as unknown as Record<string, unknown>[];
  const documents = await getDocumentIdentityByIds(
    organizationId,
    [...new Set(rows.map((r) => r.subject_id as string))]
  );
  return rows.map((r) => ({
    id: r.id as string,
    alertType: r.alert_type as AlertType,
    severity: r.severity as string,
    status: r.status as AlertStatus,
    title: r.title as string,
    message: (r.message as string | null) ?? null,
    subjectId: r.subject_id as string,
    subjectModuleKey: documents.get(r.subject_id as string)?.moduleKey ?? null,
    createdAt: r.created_at as string,
  }));
}

/**
 * Identidad mínima del documento al que apunta una tarea o alerta. El vínculo
 * es por contrato, no por FK (AT-04), así que la resolución del enlace vive
 * aquí y no en la base — que es justo lo que permite que mañana una tarea
 * apunte a una acción correctiva sin tocar work_tasks.
 */
async function getDocumentIdentityByIds(
  organizationId: string,
  ids: string[]
): Promise<Map<string, { moduleKey: string; code: string | null }>> {
  if (ids.length === 0) return new Map();
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("trazadoc_documents")
    .select("id, module_key, code")
    .eq("organization_id", organizationId)
    .in("id", ids);
  return new Map(
    ((data ?? []) as Record<string, unknown>[]).map((r) => [
      r.id as string,
      { moduleKey: (r.module_key as string) ?? "cpr", code: (r.code as string | null) ?? null },
    ])
  );
}

// ---------------------------------------------------------------------------
// RPC del workflow — la única vía de escritura
// ---------------------------------------------------------------------------

/** Traduce el mensaje de PostgreSQL a algo que se pueda mostrar sin miedo. */
function rpcError(error: { message?: string } | null, fallback: string): string {
  const raw = (error?.message ?? "").trim();
  if (raw.length === 0) return fallback;
  // Los mensajes de las RPC de 0116 están escritos EN ESPAÑOL y para el
  // usuario final; un error inesperado de PostgreSQL, no. Se distingue por si
  // trae rastros técnicos.
  if (/^[A-Z_]+:|relation |column |permission denied|violates /i.test(raw)) return fallback;
  return raw;
}

export async function createDocumentRevision(
  documentId: string,
  changeNote: string | null
): Promise<{ revisionId: string | null; error: string | null }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("trazadoc_create_document_revision", {
    p_document_id: documentId,
    p_change_note: changeNote,
  });
  if (error || !data) {
    return { revisionId: null, error: rpcError(error, "No fue posible abrir la revisión.") };
  }
  return { revisionId: data as string, error: null };
}

export async function submitDocumentRevision(input: {
  revisionId: string;
  reviewers: { position_id: string | null; profile_id: string | null; step_order: number }[];
  approvers: { position_id: string | null; profile_id: string | null; step_order: number }[];
  routeMode: RouteMode;
  effectiveFrom: string | null;
  reviewDueAt: string | null;
  note: string | null;
}): Promise<{ state: string | null; error: string | null }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("trazadoc_submit_document_revision", {
    p_revision_id: input.revisionId,
    p_reviewers: input.reviewers,
    p_approvers: input.approvers,
    p_route_mode: input.routeMode,
    p_effective_from: input.effectiveFrom,
    p_review_due_at: input.reviewDueAt,
    p_note: input.note,
  });
  if (error) return { state: null, error: rpcError(error, "No fue posible enviar el documento.") };
  return { state: (data as string) ?? null, error: null };
}

export async function recordDocumentDecision(input: {
  revisionId: string;
  decision: "approved" | "changes_requested";
  reason: string | null;
}): Promise<{ state: string | null; error: string | null }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("trazadoc_record_document_decision", {
    p_revision_id: input.revisionId,
    p_decision: input.decision,
    p_reason: input.reason,
  });
  if (error) return { state: null, error: rpcError(error, "No fue posible registrar tu decisión.") };
  return { state: (data as string) ?? null, error: null };
}

export async function retireDocument(
  documentId: string,
  reason: string
): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("trazadoc_retire_document", {
    p_document_id: documentId,
    p_reason: reason,
  });
  if (error) return { error: rpcError(error, "No fue posible retirar el documento.") };
  return { error: null };
}

export async function deleteDocumentSafely(documentId: string): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("trazadoc_delete_document_safely", {
    p_document_id: documentId,
  });
  if (error) return { error: rpcError(error, "No fue posible eliminar el documento.") };
  return { error: null };
}

/**
 * Ficha de vigencia de una revisión ABIERTA. Es la única escritura directa que
 * la base permite sobre una revisión (0116 §9.2): ni el estado, ni las firmas,
 * ni el contenido congelado se tocan por esta vía.
 */
export async function updateRevisionSchedule(input: {
  organizationId: string;
  revisionId: string;
  effectiveFrom: string | null;
  reviewDueAt: string | null;
  changeNote: string | null;
}): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("trazadoc_document_revisions")
    .update({
      effective_from: input.effectiveFrom,
      review_due_at: input.reviewDueAt,
      change_note: input.changeNote,
    })
    .eq("organization_id", input.organizationId)
    .eq("id", input.revisionId)
    .select("id");
  if (error) return { error: rpcError(error, "No fue posible guardar la programación.") };
  if ((data ?? []).length === 0) {
    return { error: "Esta revisión ya no admite cambios de programación." };
  }
  return { error: null };
}

/** Marcar una alerta propia. Solo el estado; lo demás lo impide la base. */
export async function markAlert(
  organizationId: string,
  alertId: string,
  status: AlertStatus
): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const patch: Record<string, unknown> = { status };
  if (status === "seen") patch.read_at = new Date().toISOString();
  if (status === "resolved" || status === "dismissed") patch.resolved_at = new Date().toISOString();
  const { data, error } = await supabase
    .from("work_alerts")
    .update(patch)
    .eq("organization_id", organizationId)
    .eq("id", alertId)
    .select("id");
  if (error) return { error: "No fue posible actualizar la alerta." };
  if ((data ?? []).length === 0) return { error: "Esta alerta no es tuya." };
  return { error: null };
}
