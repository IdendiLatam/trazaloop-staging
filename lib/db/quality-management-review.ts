import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";
import type {
  DecisionKind, InputCode, InputMode, InputState, ManualEntryKind,
  ParticipationRole, ResourceKind, ReviewKind, ReviewStatus,
} from "@/lib/domain/quality-management-review";

/**
 * Trazaloop · QUALITY-10 · Lectura y escritura de la Revisión por la Dirección.
 *
 * CUATRO DECISIONES QUE EXPLICAN CÓMO ESTÁ ESCRITO ESTE ARCHIVO
 *
 * 1 · Lo que crea HISTORIA pasa por una RPC de 0128: preparar y refrescar
 *     entradas, registrar una decisión, crear la acción que sale de ella,
 *     emitir el acta, cerrar y reabrir. Todas comprueban rol, estado e
 *     invariante en el MISMO acto en que registran.
 *
 * 2 · Este archivo NUNCA lee un dominio ajeno por su cuenta. Los datos de
 *     objetivos, indicadores, casos, riesgos, proveedores, clientes y
 *     auditorías llegan por los ADAPTADORES de la base, que respetan el
 *     periodo y devuelven su linaje. Reimplementarlos aquí produciría dos
 *     verdades sobre el mismo número.
 *
 * 3 · Las relaciones se resuelven con consultas separadas: las FK son
 *     compuestas `(organization_id, id)` y los embeds de PostgREST no las
 *     resuelven —fallan en silencio devolviendo lista vacía—.
 *
 * 4 · Nunca `service_role`. Se opera con la sesión del usuario y decide RLS.
 */

type Db = SupabaseClient;

function fail(error: { message?: string; code?: string } | null, fallback: string): string {
  const raw = error?.message ?? "";
  if (error?.code === "P0001" && raw.length > 0) return raw;
  return raw.length > 0 ? raw : fallback;
}

async function db(client?: Db): Promise<Db> {
  return client ?? (await createServerClient());
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// ===========================================================================
// EL CATÁLOGO
// ===========================================================================

export type CatalogRow = {
  code: InputCode; label: string; description: string;
  sourceDomain: string | null; isRequired: boolean; order: number;
};

export async function listInputCatalog(client?: Db): Promise<CatalogRow[]> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("quality_management_review_input_catalog")
    .select("code, label, description, source_domain, is_required, position_order")
    .order("position_order");
  if (error) throw new Error(fail(error, "No se pudo leer el catálogo de entradas."));
  return (data ?? []).map((r) => ({
    code: r.code as InputCode, label: r.label, description: r.description,
    sourceDomain: (r.source_domain as string | null) ?? null,
    isRequired: r.is_required as boolean,
    order: Number(r.position_order ?? 1),
  }));
}

// ===========================================================================
// LA REVISIÓN
// ===========================================================================

export type ReviewRow = {
  id: string; code: string; title: string;
  reviewKind: ReviewKind; status: ReviewStatus;
  periodLabel: string; periodStart: string; periodEnd: string;
  sessionHeldOn: string | null;
  ownerPositionId: string | null; ownerPositionName: string | null;
  closedAt: string | null; nextReviewPlannedOn: string | null;
  reopenCount: number; createdAt: string;
  inputCount: number; inputsPrepared: number; inputsReviewed: number;
  inputsMissing: number; inputsNotApplicable: number; inputsPending: number;
  inputsWithAnalysis: number; inputsRequiringDecision: number;
  participantCount: number; participantsAttended: number;
  decisionCount: number; minutesCount: number;
  /** §45 · Derivado del motor transversal, nunca copiado. */
  actionCount: number; openActionCount: number;
  overdueActionCount: number; effectiveActionCount: number;
};

function mapReview(r: Record<string, unknown>): ReviewRow {
  const n = (k: string) => Number(r[k] ?? 0);
  return {
    id: r.review_id as string, code: r.code as string, title: r.title as string,
    reviewKind: r.review_kind as ReviewKind, status: r.status as ReviewStatus,
    periodLabel: r.period_label as string,
    periodStart: r.period_start as string, periodEnd: r.period_end as string,
    sessionHeldOn: (r.session_held_on as string | null) ?? null,
    ownerPositionId: (r.owner_position_id as string | null) ?? null,
    ownerPositionName: (r.owner_position_name as string | null) ?? null,
    closedAt: (r.closed_at as string | null) ?? null,
    nextReviewPlannedOn: (r.next_review_planned_on as string | null) ?? null,
    reopenCount: n("reopen_count"), createdAt: r.created_at as string,
    inputCount: n("input_count"), inputsPrepared: n("inputs_prepared"),
    inputsReviewed: n("inputs_reviewed"), inputsMissing: n("inputs_missing"),
    inputsNotApplicable: n("inputs_not_applicable"), inputsPending: n("inputs_pending"),
    inputsWithAnalysis: n("inputs_with_analysis"),
    inputsRequiringDecision: n("inputs_requiring_decision"),
    participantCount: n("participant_count"), participantsAttended: n("participants_attended"),
    decisionCount: n("decision_count"), minutesCount: n("minutes_count"),
    actionCount: n("action_count"), openActionCount: n("open_action_count"),
    overdueActionCount: n("overdue_action_count"),
    effectiveActionCount: n("effective_action_count"),
  };
}

export async function listReviews(
  organizationId: string,
  filters: { status?: string; kind?: string } = {},
  client?: Db
): Promise<ReviewRow[]> {
  const supabase = await db(client);
  let q = supabase.from("v_quality_management_review_overview")
    .select("*").eq("organization_id", organizationId)
    .order("period_start", { ascending: false });
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.kind) q = q.eq("review_kind", filters.kind);
  const { data, error } = await q;
  if (error) throw new Error(fail(error, "No se pudieron leer las revisiones."));
  return (data ?? []).map(mapReview);
}

export async function getReview(
  organizationId: string, reviewId: string, client?: Db
): Promise<ReviewRow | null> {
  const supabase = await db(client);
  const { data, error } = await supabase.from("v_quality_management_review_overview")
    .select("*").eq("organization_id", organizationId).eq("review_id", reviewId)
    .maybeSingle();
  if (error) throw new Error(fail(error, "No se pudo leer la revisión."));
  return data ? mapReview(data) : null;
}

export type ReviewDetailRow = {
  scopeNote: string | null; agendaNote: string | null;
  sessionLocation: string | null; sessionNote: string | null;
  conclusions: string | null; conclusionsAt: string | null;
  closureNote: string | null; followupNote: string | null;
  nextReviewNote: string | null;
  reopenReason: string | null; reopenedAt: string | null;
  cancelReason: string | null;
};

export async function getReviewDetail(
  organizationId: string, reviewId: string, client?: Db
): Promise<ReviewDetailRow | null> {
  const supabase = await db(client);
  const { data, error } = await supabase.from("quality_management_reviews")
    .select("scope_note, agenda_note, session_location, session_note, conclusions, conclusions_at, closure_note, followup_note, next_review_note, reopen_reason, reopened_at, cancel_reason")
    .eq("organization_id", organizationId).eq("id", reviewId).maybeSingle();
  if (error) throw new Error(fail(error, "No se pudo leer la revisión."));
  if (!data) return null;
  return {
    scopeNote: data.scope_note ?? null, agendaNote: data.agenda_note ?? null,
    sessionLocation: data.session_location ?? null, sessionNote: data.session_note ?? null,
    conclusions: data.conclusions ?? null, conclusionsAt: data.conclusions_at ?? null,
    closureNote: data.closure_note ?? null, followupNote: data.followup_note ?? null,
    nextReviewNote: data.next_review_note ?? null,
    reopenReason: data.reopen_reason ?? null, reopenedAt: data.reopened_at ?? null,
    cancelReason: data.cancel_reason ?? null,
  };
}

// ===========================================================================
// PARTICIPANTES, AGENDA Y NOTAS
// ===========================================================================

export type ParticipantRow = {
  id: string; personId: string | null; personName: string | null;
  externalName: string | null; participationRole: ParticipationRole;
  positionNameAtReview: string | null; attended: boolean;
  attendanceNote: string | null; contributionNote: string | null;
};

export async function listParticipants(
  organizationId: string, reviewId: string, client?: Db
): Promise<ParticipantRow[]> {
  const supabase = await db(client);
  const { data, error } = await supabase.from("quality_management_review_participants")
    .select("id, person_id, external_name, participation_role, position_name_at_review, attended, attendance_note, contribution_note")
    .eq("organization_id", organizationId).eq("review_id", reviewId);
  if (error) throw new Error(fail(error, "No se pudieron leer los participantes."));
  const rows = data ?? [];
  const ids = [...new Set(rows.map((r) => r.person_id).filter(Boolean))] as string[];
  const people = ids.length > 0
    ? await supabase.from("quality_people").select("id, full_name")
        .eq("organization_id", organizationId).in("id", ids)
    : { data: [] as { id: string; full_name: string }[] };
  const P = new Map((people.data ?? []).map((p) => [p.id as string, p.full_name as string]));

  return rows.map((r) => ({
    id: r.id as string,
    personId: (r.person_id as string | null) ?? null,
    personName: r.person_id ? (P.get(r.person_id as string) ?? null) : null,
    externalName: (r.external_name as string | null) ?? null,
    participationRole: r.participation_role as ParticipationRole,
    // §70 · El cargo copiado. No se resuelve hoy.
    positionNameAtReview: (r.position_name_at_review as string | null) ?? null,
    attended: r.attended as boolean,
    attendanceNote: (r.attendance_note as string | null) ?? null,
    contributionNote: (r.contribution_note as string | null) ?? null,
  }));
}

export type AgendaItemRow = {
  id: string; order: number; title: string;
  catalogCode: InputCode | null; note: string | null;
  timeLabel: string | null;
  presenterPersonId: string | null; presenterName: string | null;
};

export async function listAgenda(
  organizationId: string, reviewId: string, client?: Db
): Promise<AgendaItemRow[]> {
  const supabase = await db(client);
  const { data, error } = await supabase.from("quality_management_review_agenda_items")
    .select("id, position_order, title, catalog_code, note, time_label, presenter_person_id")
    .eq("organization_id", organizationId).eq("review_id", reviewId)
    .order("position_order");
  if (error) throw new Error(fail(error, "No se pudo leer la agenda."));
  const rows = data ?? [];
  const ids = [...new Set(rows.map((r) => r.presenter_person_id).filter(Boolean))] as string[];
  const people = ids.length > 0
    ? await supabase.from("quality_people").select("id, full_name")
        .eq("organization_id", organizationId).in("id", ids)
    : { data: [] as { id: string; full_name: string }[] };
  const P = new Map((people.data ?? []).map((p) => [p.id as string, p.full_name as string]));

  return rows.map((r) => ({
    id: r.id as string, order: Number(r.position_order ?? 1),
    title: r.title as string,
    catalogCode: (r.catalog_code as InputCode | null) ?? null,
    note: (r.note as string | null) ?? null,
    timeLabel: (r.time_label as string | null) ?? null,
    presenterPersonId: (r.presenter_person_id as string | null) ?? null,
    presenterName: r.presenter_person_id
      ? (P.get(r.presenter_person_id as string) ?? null) : null,
  }));
}

export type NoteRow = { id: string; body: string; recordedOn: string };

export async function listNotes(
  organizationId: string, reviewId: string, client?: Db
): Promise<NoteRow[]> {
  const supabase = await db(client);
  const { data, error } = await supabase.from("quality_management_review_notes")
    .select("id, body, recorded_on")
    .eq("organization_id", organizationId).eq("review_id", reviewId)
    .order("recorded_on");
  if (error) throw new Error(fail(error, "No se pudieron leer las notas."));
  return (data ?? []).map((r) => ({
    id: r.id as string, body: r.body as string, recordedOn: r.recorded_on as string,
  }));
}

// ===========================================================================
// ENTRADAS
// ===========================================================================

export type ManualEntryRow = {
  id: string; entryKind: ManualEntryKind; resourceKind: ResourceKind | null;
  title: string; body: string; recordedOn: string;
};

export type InputRow = {
  id: string; catalogCode: InputCode; catalogLabel: string; order: number;
  inputMode: InputMode; state: InputState;
  notApplicableReason: string | null;
  summary: string | null;
  snapshot: Record<string, unknown> | null;
  sourceDomain: string | null;
  sourcePeriodStart: string | null; sourcePeriodEnd: string | null;
  preparedAt: string | null; sourceFingerprint: string | null;
  analysis: string | null; analysisAt: string | null;
  conclusion: string | null; requiresDecision: boolean;
  manualEntries: ManualEntryRow[];
  decisionCount: number;
};

export async function listInputs(
  organizationId: string, reviewId: string, client?: Db
): Promise<InputRow[]> {
  const supabase = await db(client);
  const [{ data, error }, manual, catalog] = await Promise.all([
    supabase.from("quality_management_review_inputs")
      .select("id, catalog_code, position_order, input_mode, state, not_applicable_reason, summary, snapshot, source_domain, source_period_start, source_period_end, prepared_at, source_fingerprint, analysis, analysis_at, conclusion, requires_decision")
      .eq("organization_id", organizationId).eq("review_id", reviewId)
      .order("position_order"),
    supabase.from("quality_management_review_manual_entries")
      .select("id, input_id, entry_kind, resource_kind, title, body, recorded_on")
      .eq("organization_id", organizationId).eq("review_id", reviewId)
      .order("recorded_on"),
    supabase.from("quality_management_review_input_catalog").select("code, label"),
  ]);
  if (error) throw new Error(fail(error, "No se pudieron leer las entradas."));
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const L = new Map((catalog.data ?? []).map((c) => [c.code as string, c.label as string]));
  const M = new Map<string, ManualEntryRow[]>();
  for (const m of manual.data ?? []) {
    const list = M.get(m.input_id as string) ?? [];
    list.push({
      id: m.id as string, entryKind: m.entry_kind as ManualEntryKind,
      resourceKind: (m.resource_kind as ResourceKind | null) ?? null,
      title: m.title as string, body: m.body as string,
      recordedOn: m.recorded_on as string,
    });
    M.set(m.input_id as string, list);
  }

  const { data: decisions } = await supabase.from("quality_management_review_decisions")
    .select("input_id").eq("organization_id", organizationId).eq("review_id", reviewId);
  const D = new Map<string, number>();
  for (const d of decisions ?? []) {
    if (!d.input_id) continue;
    D.set(d.input_id as string, (D.get(d.input_id as string) ?? 0) + 1);
  }

  return rows.map((r) => ({
    id: r.id as string,
    catalogCode: r.catalog_code as InputCode,
    catalogLabel: L.get(r.catalog_code as string) ?? (r.catalog_code as string),
    order: Number(r.position_order ?? 1),
    inputMode: r.input_mode as InputMode,
    state: r.state as InputState,
    notApplicableReason: (r.not_applicable_reason as string | null) ?? null,
    summary: (r.summary as string | null) ?? null,
    snapshot: (r.snapshot as Record<string, unknown> | null) ?? null,
    sourceDomain: (r.source_domain as string | null) ?? null,
    sourcePeriodStart: (r.source_period_start as string | null) ?? null,
    sourcePeriodEnd: (r.source_period_end as string | null) ?? null,
    preparedAt: (r.prepared_at as string | null) ?? null,
    sourceFingerprint: (r.source_fingerprint as string | null) ?? null,
    analysis: (r.analysis as string | null) ?? null,
    analysisAt: (r.analysis_at as string | null) ?? null,
    conclusion: (r.conclusion as string | null) ?? null,
    requiresDecision: r.requires_decision as boolean,
    manualEntries: M.get(r.id as string) ?? [],
    decisionCount: D.get(r.id as string) ?? 0,
  }));
}

// ===========================================================================
// DECISIONES, ACTAS Y SEGUIMIENTO
// ===========================================================================

export type DecisionActionRow = {
  id: string; code: string; title: string; status: string;
  dueOn: string | null; completedOn: string | null; effectiveness: string;
};

export type DecisionRow = {
  id: string; code: string; decisionKind: DecisionKind;
  topic: string; decision: string; rationale: string | null;
  expectedResult: string | null; decidedOn: string;
  inputId: string | null; ownerPositionName: string | null;
  actionCount: number; openActionCount: number; completedActionCount: number;
  overdueActionCount: number; effectiveActionCount: number;
  notEffectiveActionCount: number;
  actions: DecisionActionRow[];
};

export async function listDecisions(
  organizationId: string, reviewId: string, client?: Db
): Promise<DecisionRow[]> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("v_quality_management_review_decision_actions")
    .select("*").eq("organization_id", organizationId).eq("review_id", reviewId)
    .order("code");
  if (error) throw new Error(fail(error, "No se pudieron leer las decisiones."));
  const rows = data ?? [];
  if (rows.length === 0) return [];

  // Las acciones, por el motor de referencias. Consulta separada: los embeds
  // de clave compuesta no resuelven.
  const ids = rows.map((r) => r.decision_id as string);
  const { data: refs } = await supabase.from("work_references")
    .select("owner_id, ref_id").eq("organization_id", organizationId)
    .eq("owner_kind", "management_review_decision").eq("ref_kind", "work_action")
    .in("owner_id", ids);
  const actionIds = [...new Set((refs ?? []).map((r) => r.ref_id as string))];
  const { data: actions } = actionIds.length > 0
    ? await supabase.from("work_actions")
        .select("id, code, title, status, due_on, completed_on, effectiveness_result")
        .eq("organization_id", organizationId).in("id", actionIds)
    : { data: [] as Record<string, unknown>[] };
  const A = new Map((actions ?? []).map((a) => [a.id as string, a]));

  const byDecision = new Map<string, DecisionActionRow[]>();
  for (const r of refs ?? []) {
    const a = A.get(r.ref_id as string);
    if (!a) continue;
    const list = byDecision.get(r.owner_id as string) ?? [];
    list.push({
      id: a.id as string, code: a.code as string, title: a.title as string,
      status: a.status as string,
      dueOn: (a.due_on as string | null) ?? null,
      completedOn: (a.completed_on as string | null) ?? null,
      effectiveness: a.effectiveness_result as string,
    });
    byDecision.set(r.owner_id as string, list);
  }

  return rows.map((r) => ({
    id: r.decision_id as string, code: r.code as string,
    decisionKind: r.decision_kind as DecisionKind,
    topic: r.topic as string, decision: r.decision as string,
    rationale: (r.rationale as string | null) ?? null,
    expectedResult: (r.expected_result as string | null) ?? null,
    decidedOn: r.decided_on as string,
    inputId: (r.input_id as string | null) ?? null,
    ownerPositionName: (r.owner_position_name as string | null) ?? null,
    actionCount: Number(r.action_count ?? 0),
    openActionCount: Number(r.open_action_count ?? 0),
    completedActionCount: Number(r.completed_action_count ?? 0),
    overdueActionCount: Number(r.overdue_action_count ?? 0),
    effectiveActionCount: Number(r.effective_action_count ?? 0),
    notEffectiveActionCount: Number(r.not_effective_action_count ?? 0),
    actions: (byDecision.get(r.decision_id as string) ?? [])
      .sort((a, b) => a.code.localeCompare(b.code)),
  }));
}

export type MinutesRow = {
  id: string; versionNumber: number; issuedOn: string;
  summary: string | null; snapshot: Record<string, unknown>;
  supersedesId: string | null;
  documentId: string | null; documentRevisionId: string | null;
};

export async function listMinutes(
  organizationId: string, reviewId: string, client?: Db
): Promise<MinutesRow[]> {
  const supabase = await db(client);
  const { data, error } = await supabase.from("quality_management_review_minutes")
    .select("id, version_number, issued_on, summary, snapshot, supersedes_id, document_id, document_revision_id")
    .eq("organization_id", organizationId).eq("review_id", reviewId)
    .order("version_number", { ascending: false });
  if (error) throw new Error(fail(error, "No se pudieron leer las actas."));
  return (data ?? []).map((r) => ({
    id: r.id as string, versionNumber: Number(r.version_number ?? 1),
    issuedOn: r.issued_on as string,
    summary: (r.summary as string | null) ?? null,
    snapshot: (r.snapshot as Record<string, unknown>) ?? {},
    supersedesId: (r.supersedes_id as string | null) ?? null,
    documentId: (r.document_id as string | null) ?? null,
    documentRevisionId: (r.document_revision_id as string | null) ?? null,
  }));
}

/** §45/§84 · El estado VIVO. Se lee ahora; el acta no cambia. */
export async function getFollowUp(
  reviewId: string, client?: Db
): Promise<Record<string, unknown> | null> {
  const supabase = await db(client);
  const { data, error } = await supabase.rpc("quality_mr_followup", {
    p_review_id: reviewId,
  });
  if (error) throw new Error(fail(error, "No se pudo leer el seguimiento."));
  return (data as Record<string, unknown> | null) ?? null;
}

/** §34 · Cuánto falta para poder revisar. */
export async function getReadiness(
  reviewId: string, client?: Db
): Promise<Record<string, unknown> | null> {
  const supabase = await db(client);
  const { data, error } = await supabase.rpc("quality_mr_readiness", {
    p_review_id: reviewId,
  });
  if (error) throw new Error(fail(error, "No se pudo leer el estado de preparación."));
  return (data as Record<string, unknown> | null) ?? null;
}

/** §56/§85 · ¿Cambió la fuente desde que se preparó? */
export async function getInputFreshness(
  inputId: string, client?: Db
): Promise<Record<string, unknown> | null> {
  const supabase = await db(client);
  const { data, error } = await supabase.rpc("quality_mr_input_freshness", {
    p_input_id: inputId,
  });
  if (error) throw new Error(fail(error, "No se pudo comprobar la frescura de la entrada."));
  return (data as Record<string, unknown> | null) ?? null;
}

/** §89 · Lo que la portada de Quality necesita saber, y nada más. */
export type ManagementReviewHomeSignals = {
  inPreparation: number;
  upcoming: number;
  pendingInputs: number;
  overdueActions: number;
};

export async function getManagementReviewHomeSignals(
  organizationId: string, client?: Db
): Promise<ManagementReviewHomeSignals> {
  const supabase = await db(client);
  const today = todayIso();
  const inThirty = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  const { data } = await supabase.from("v_quality_management_review_overview")
    .select("status, inputs_pending, overdue_action_count, next_review_planned_on")
    .eq("organization_id", organizationId);
  const rows = data ?? [];
  return {
    inPreparation: rows.filter((r) =>
      ["draft", "preparing", "ready_for_review", "in_review"].includes(r.status as string)).length,
    upcoming: rows.filter((r) =>
      r.next_review_planned_on !== null
      && (r.next_review_planned_on as string) >= today
      && (r.next_review_planned_on as string) <= inThirty).length,
    pendingInputs: rows.reduce((s, r) => s + Number(r.inputs_pending ?? 0), 0),
    overdueActions: rows.reduce((s, r) => s + Number(r.overdue_action_count ?? 0), 0),
  };
}

// ===========================================================================
// ESCRITURA
// ---------------------------------------------------------------------------
// Lo que solo REGISTRA —una revisión, un participante, un punto de agenda, una
// entrada manual, el análisis de una entrada— es escritura normal bajo RLS. Lo
// que crea HISTORIA —preparar, refrescar, decidir, crear la acción, emitir el
// acta, cerrar y reabrir— pasa por su RPC.
// ===========================================================================

export async function createReview(
  organizationId: string,
  input: {
    code: string; title: string; reviewKind: ReviewKind;
    periodLabel: string; periodStart: string; periodEnd: string;
    ownerPositionId: string | null; scopeNote: string | null;
  },
  client?: Db
): Promise<string> {
  const supabase = await db(client);
  const { data, error } = await supabase.from("quality_management_reviews").insert({
    organization_id: organizationId, code: input.code, title: input.title,
    review_kind: input.reviewKind, period_label: input.periodLabel,
    period_start: input.periodStart, period_end: input.periodEnd,
    owner_position_id: input.ownerPositionId, scope_note: input.scopeNote,
  }).select("id").single();
  if (error) throw new Error(fail(error, "No se pudo crear la revisión."));
  return data!.id as string;
}

export async function updateReview(
  organizationId: string, reviewId: string,
  input: {
    title: string; scopeNote: string | null; agendaNote: string | null;
    ownerPositionId: string | null;
    sessionHeldOn: string | null; sessionLocation: string | null;
    sessionNote: string | null;
  },
  client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase.from("quality_management_reviews").update({
    title: input.title, scope_note: input.scopeNote, agenda_note: input.agendaNote,
    owner_position_id: input.ownerPositionId,
    session_held_on: input.sessionHeldOn, session_location: input.sessionLocation,
    session_note: input.sessionNote,
  }).eq("organization_id", organizationId).eq("id", reviewId);
  if (error) throw new Error(fail(error, "No se pudo actualizar la revisión."));
}

export async function updateReviewStatus(
  organizationId: string, reviewId: string, status: ReviewStatus, client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase.from("quality_management_reviews")
    .update({ status })
    .eq("organization_id", organizationId).eq("id", reviewId);
  if (error) throw new Error(fail(error, "No se pudo cambiar el estado de la revisión."));
}

/** §38 · Las conclusiones generales, escritas por una persona. */
export async function saveConclusions(
  organizationId: string, reviewId: string, conclusions: string | null, client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase.from("quality_management_reviews").update({
    conclusions,
    conclusions_at: conclusions ? new Date().toISOString() : null,
  }).eq("organization_id", organizationId).eq("id", reviewId);
  if (error) throw new Error(fail(error, "No se pudieron guardar las conclusiones."));
}

/** §46 · La próxima revisión. La frecuencia la decide la empresa. */
export async function scheduleNextReview(
  organizationId: string, reviewId: string,
  plannedOn: string | null, note: string | null, client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase.from("quality_management_reviews").update({
    next_review_planned_on: plannedOn, next_review_note: note,
  }).eq("organization_id", organizationId).eq("id", reviewId);
  if (error) throw new Error(fail(error, "No se pudo programar la próxima revisión."));
}

export async function cancelReview(
  organizationId: string, reviewId: string, reason: string, client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase.from("quality_management_reviews").update({
    status: "cancelled", cancelled_at: new Date().toISOString(), cancel_reason: reason,
  }).eq("organization_id", organizationId).eq("id", reviewId);
  if (error) throw new Error(fail(error, "No se pudo cancelar la revisión."));
}

export async function deleteReview(
  organizationId: string, reviewId: string, client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase.from("quality_management_reviews").delete()
    .eq("organization_id", organizationId).eq("id", reviewId);
  if (error) throw new Error(fail(error, "No se pudo eliminar la revisión."));
}

// --- Participantes, agenda y notas ---------------------------------------

/**
 * §70 · El cargo se COPIA aquí, no se resuelve al leer. Se toma el que la
 * persona ocupaba en la fecha de referencia de la revisión.
 */
export async function addParticipant(
  organizationId: string, reviewId: string,
  input: {
    personId: string | null; externalName: string | null;
    participationRole: ParticipationRole; positionId: string | null;
    positionNameAtReview: string | null;
    attended: boolean; attendanceNote: string | null; contributionNote: string | null;
  },
  client?: Db
): Promise<string> {
  const supabase = await db(client);

  // Si viene una persona y no se dijo el cargo, se resuelve AHORA con las
  // asignaciones vigentes en la fecha de la sesión —o del fin del periodo— y
  // se guarda como texto. A partir de aquí ya no cambia.
  let positionId = input.positionId;
  let positionName = input.positionNameAtReview;
  if (input.personId && !positionName) {
    const { data: review } = await supabase.from("quality_management_reviews")
      .select("session_held_on, period_end")
      .eq("organization_id", organizationId).eq("id", reviewId).maybeSingle();
    const on = (review?.session_held_on as string | null)
      ?? (review?.period_end as string | null) ?? todayIso();
    const { data: asg } = await supabase.from("quality_position_assignments")
      .select("position_id, effective_from, effective_to")
      .eq("organization_id", organizationId).eq("person_id", input.personId)
      .eq("assignment_type", "holder").lte("effective_from", on)
      .order("effective_from", { ascending: false });
    const vigente = (asg ?? []).find(
      (a) => a.effective_to === null || (a.effective_to as string) >= on
    );
    if (vigente) {
      positionId = vigente.position_id as string;
      const { data: pos } = await supabase.from("quality_positions")
        .select("name").eq("organization_id", organizationId)
        .eq("id", positionId).maybeSingle();
      positionName = (pos?.name as string | null) ?? null;
    }
  }

  const { data, error } = await supabase
    .from("quality_management_review_participants").insert({
      organization_id: organizationId, review_id: reviewId,
      person_id: input.personId, external_name: input.externalName,
      participation_role: input.participationRole,
      position_id: positionId, position_name_at_review: positionName,
      attended: input.attended, attendance_note: input.attendanceNote,
      contribution_note: input.contributionNote,
    }).select("id").single();
  if (error) throw new Error(fail(error, "No se pudo añadir al participante."));
  return data!.id as string;
}

export async function removeParticipant(
  organizationId: string, participantId: string, client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase.from("quality_management_review_participants")
    .delete().eq("organization_id", organizationId).eq("id", participantId);
  if (error) throw new Error(fail(error, "No se pudo quitar al participante."));
}

export async function addAgendaItem(
  organizationId: string, reviewId: string,
  input: {
    title: string; catalogCode: string | null; note: string | null;
    timeLabel: string | null; presenterPersonId: string | null; order: number;
  },
  client?: Db
): Promise<string> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("quality_management_review_agenda_items").insert({
      organization_id: organizationId, review_id: reviewId,
      title: input.title, catalog_code: input.catalogCode, note: input.note,
      time_label: input.timeLabel, presenter_person_id: input.presenterPersonId,
      position_order: input.order,
    }).select("id").single();
  if (error) throw new Error(fail(error, "No se pudo añadir el punto de agenda."));
  return data!.id as string;
}

export async function removeAgendaItem(
  organizationId: string, itemId: string, client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase.from("quality_management_review_agenda_items")
    .delete().eq("organization_id", organizationId).eq("id", itemId);
  if (error) throw new Error(fail(error, "No se pudo quitar el punto de agenda."));
}

/**
 * §33 · La agenda propuesta a partir de las entradas: un punto por entrada
 * que tenga algo que mirar. Es una propuesta; el orden es configurable y la
 * organización puede añadir, quitar y reordenar.
 */
export async function proposeAgenda(
  organizationId: string, reviewId: string, client?: Db
): Promise<number> {
  const supabase = await db(client);
  const [inputs, catalog, existing] = await Promise.all([
    listInputs(organizationId, reviewId, supabase),
    listInputCatalog(supabase),
    listAgenda(organizationId, reviewId, supabase),
  ]);
  const yaHay = new Set(existing.map((a) => a.catalogCode).filter(Boolean));
  const L = new Map(catalog.map((c) => [c.code, c.label]));

  const nuevos = inputs
    .filter((i) => i.state !== "not_applicable" && !yaHay.has(i.catalogCode))
    .map((i, idx) => ({
      organization_id: organizationId, review_id: reviewId,
      title: L.get(i.catalogCode) ?? i.catalogCode,
      catalog_code: i.catalogCode,
      position_order: existing.length + idx + 1,
      note: null, time_label: null, presenter_person_id: null,
    }));
  if (nuevos.length === 0) return 0;

  const { error } = await supabase
    .from("quality_management_review_agenda_items").insert(nuevos);
  if (error) throw new Error(fail(error, "No se pudo proponer la agenda."));
  return nuevos.length;
}

export async function addNote(
  organizationId: string, reviewId: string, body: string, recordedOn: string,
  client?: Db
): Promise<string> {
  const supabase = await db(client);
  const { data, error } = await supabase.from("quality_management_review_notes")
    .insert({
      organization_id: organizationId, review_id: reviewId,
      body, recorded_on: recordedOn,
    }).select("id").single();
  if (error) throw new Error(fail(error, "No se pudo registrar la nota."));
  return data!.id as string;
}

// --- Entradas -------------------------------------------------------------

/** §55/RD-03 · El motor de preparación. Determinista y sin borrar análisis. */
export async function prepareInputs(
  reviewId: string, client?: Db
): Promise<number> {
  const supabase = await db(client);
  const { data, error } = await supabase.rpc("quality_mr_prepare_inputs", {
    p_review_id: reviewId,
  });
  if (error) throw new Error(fail(error, "No se pudieron preparar las entradas."));
  return Number(data ?? 0);
}

/** §56 · Refrescar UNA entrada, a propósito. */
export async function refreshInput(
  inputId: string, client?: Db
): Promise<Record<string, unknown>> {
  const supabase = await db(client);
  const { data, error } = await supabase.rpc("quality_mr_refresh_input", {
    p_input_id: inputId,
  });
  if (error) throw new Error(fail(error, "No se pudo refrescar la entrada."));
  return (data as Record<string, unknown>) ?? {};
}

/** §37 · El análisis humano. No toca el dato fuente: vive al lado. */
export async function saveInputAnalysis(
  organizationId: string, inputId: string,
  input: { analysis: string | null; conclusion: string | null; requiresDecision: boolean },
  client?: Db
): Promise<void> {
  const supabase = await db(client);
  const tieneAnalisis = (input.analysis ?? "").trim().length > 0;
  const { error } = await supabase.from("quality_management_review_inputs").update({
    analysis: tieneAnalisis ? input.analysis : null,
    analysis_at: tieneAnalisis ? new Date().toISOString() : null,
    conclusion: input.conclusion,
    requires_decision: input.requiresDecision,
    // Al analizarla, la entrada pasa a REVISADA.
    state: tieneAnalisis ? "reviewed" : undefined,
  }).eq("organization_id", organizationId).eq("id", inputId);
  if (error) throw new Error(fail(error, "No se pudo guardar el análisis."));
}

/** §35 · «No aplica» exige razón. Sin ella no es una decisión, es un descuido. */
export async function markInputNotApplicable(
  organizationId: string, inputId: string, reason: string, client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase.from("quality_management_review_inputs").update({
    state: "not_applicable", not_applicable_reason: reason,
  }).eq("organization_id", organizationId).eq("id", inputId);
  if (error) throw new Error(fail(error, "No se pudo marcar la entrada como no aplicable."));
}

export async function addManualEntry(
  organizationId: string, reviewId: string, inputId: string,
  input: {
    entryKind: ManualEntryKind; resourceKind: ResourceKind | null;
    title: string; body: string; recordedOn: string;
  },
  client?: Db
): Promise<string> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("quality_management_review_manual_entries").insert({
      organization_id: organizationId, review_id: reviewId, input_id: inputId,
      entry_kind: input.entryKind, resource_kind: input.resourceKind,
      title: input.title, body: input.body, recorded_on: input.recordedOn,
    }).select("id").single();
  if (error) throw new Error(fail(error, "No se pudo registrar la entrada manual."));

  // Una entrada manual con contenido deja de estar pendiente.
  await supabase.from("quality_management_review_inputs")
    .update({ state: "prepared", prepared_at: new Date().toISOString() })
    .eq("organization_id", organizationId).eq("id", inputId).eq("state", "pending");

  return data!.id as string;
}

export async function removeManualEntry(
  organizationId: string, entryId: string, client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase.from("quality_management_review_manual_entries")
    .delete().eq("organization_id", organizationId).eq("id", entryId);
  if (error) throw new Error(fail(error, "No se pudo quitar la entrada manual."));
}

// --- Decisiones, acciones, acta y cierre ----------------------------------

/** §41/§82 · Registrar una decisión NO crea ninguna acción. */
export async function recordDecision(
  input: {
    reviewId: string; topic: string; decision: string;
    decisionKind: DecisionKind; rationale: string | null;
    expectedResult: string | null; inputId: string | null;
    ownerPositionId: string | null;
  },
  client?: Db
): Promise<string> {
  const supabase = await db(client);
  const { data, error } = await supabase.rpc("quality_mr_record_decision", {
    p_review_id: input.reviewId, p_topic: input.topic, p_decision: input.decision,
    p_decision_kind: input.decisionKind, p_rationale: input.rationale,
    p_expected_result: input.expectedResult, p_input_id: input.inputId,
    p_owner_position_id: input.ownerPositionId,
  });
  if (error) throw new Error(fail(error, "No se pudo registrar la decisión."));
  return data as string;
}

export async function updateDecision(
  organizationId: string, decisionId: string,
  input: {
    topic: string; decision: string; decisionKind: DecisionKind;
    rationale: string | null; expectedResult: string | null;
    ownerPositionId: string | null;
  },
  client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase.from("quality_management_review_decisions").update({
    topic: input.topic, decision: input.decision, decision_kind: input.decisionKind,
    rationale: input.rationale, expected_result: input.expectedResult,
    owner_position_id: input.ownerPositionId,
  }).eq("organization_id", organizationId).eq("id", decisionId);
  if (error) throw new Error(fail(error, "No se pudo actualizar la decisión."));
}

export async function removeDecision(
  organizationId: string, decisionId: string, client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase.from("quality_management_review_decisions")
    .delete().eq("organization_id", organizationId).eq("id", decisionId);
  if (error) throw new Error(fail(error, "No se pudo eliminar la decisión."));
}

/** §42 · La acción, cuando alguien decide crearla. 0..N por decisión. */
export async function createActionFromDecision(
  input: {
    decisionId: string; title: string; actionKind: string;
    description: string | null; ownerPositionId: string | null;
    dueOn: string | null; requiresEffectiveness: boolean;
    effectivenessCriteria: string | null;
  },
  client?: Db
): Promise<string> {
  const supabase = await db(client);
  const { data, error } = await supabase.rpc("quality_mr_create_action_from_decision", {
    p_decision_id: input.decisionId, p_title: input.title,
    p_action_kind: input.actionKind, p_description: input.description,
    p_owner_position_id: input.ownerPositionId, p_due_on: input.dueOn,
    p_requires_effectiveness: input.requiresEffectiveness,
    p_effectiveness_criteria: input.effectivenessCriteria,
  });
  if (error) throw new Error(fail(error, "No se pudo crear la acción."));
  return data as string;
}

export async function issueMinutes(
  reviewId: string, summary: string | null, client?: Db
): Promise<string> {
  const supabase = await db(client);
  const { data, error } = await supabase.rpc("quality_mr_issue_minutes", {
    p_review_id: reviewId, p_summary: summary,
  });
  if (error) throw new Error(fail(error, "No se pudo emitir el acta."));
  return data as string;
}

/** §48 · Cerrar NO exige acciones terminadas: exige decir qué queda. */
export async function closeReview(
  reviewId: string, closureNote: string, followupNote: string | null, client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase.rpc("quality_mr_close_review", {
    p_review_id: reviewId, p_closure_note: closureNote,
    p_followup_note: followupNote,
  });
  if (error) throw new Error(fail(error, "No se pudo cerrar la revisión."));
}

/** §47 · Reabrir es excepcional, y no borra el cierre anterior. */
export async function reopenReview(
  reviewId: string, reason: string, client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase.rpc("quality_mr_reopen_review", {
    p_review_id: reviewId, p_reason: reason,
  });
  if (error) throw new Error(fail(error, "No se pudo reabrir la revisión."));
}

export async function scanManagementReviews(
  organizationId: string, client?: Db
): Promise<number> {
  const supabase = await db(client);
  const { data, error } = await supabase.rpc("quality_scan_management_reviews", {
    p_organization_id: organizationId,
  });
  if (error) throw new Error(fail(error, "No se pudo ejecutar el barrido."));
  return Number(data ?? 0);
}
