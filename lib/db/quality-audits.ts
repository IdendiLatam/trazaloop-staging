import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";
import type {
  AuditNature, AuditStatus, AuditType, CheckOutcome, ChecklistVersionStatus,
  ConflictKind, ConflictStatus, CriterionKind, EvidenceKind, FindingClassification,
  FindingEvaluationStatus, FindingSeverity, NoteKind, ProgramRevisionKind,
  ProgramStatus, ScopeItemKind, TeamRole,
} from "@/lib/domain/quality-audits";

/**
 * Trazaloop · QUALITY-09 · Lectura y escritura de Auditorías.
 *
 * CUATRO DECISIONES QUE EXPLICAN CÓMO ESTÁ ESCRITO ESTE ARCHIVO
 *
 * 1 · Lo que crea HISTORIA pasa por una RPC de 0127: reprogramar, cancelar,
 *     publicar un checklist, comprobar la independencia, escalar un hallazgo a
 *     un caso, emitir el informe y cerrar la auditoría. Todos comprueban rol,
 *     estado e invariante en el MISMO acto en que registran.
 *
 * 2 · Las REPROGRAMACIONES, las revisiones del programa y los INFORMES no se
 *     escriben desde aquí; la RLS tampoco lo permitiría. Son actos formales que
 *     solo produce su RPC, porque son los que congelan el retrato.
 *
 * 3 · Las relaciones se resuelven con consultas separadas y se cruzan en
 *     memoria: las FK son compuestas `(organization_id, id)` y los embeds de
 *     PostgREST no las resuelven —fallan en silencio devolviendo lista vacía—.
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
// PROGRAMA
// ===========================================================================

export type ProgramRow = {
  id: string; code: string | null; name: string;
  periodLabel: string; periodStart: string; periodEnd: string;
  purpose: string | null; prioritizationNote: string | null;
  ownerPositionId: string | null; ownerPositionName: string | null;
  status: ProgramStatus; approvedOn: string | null;
  closedAt: string | null; closureNote: string | null;
  plannedAudits: number; executedAudits: number; closedAudits: number;
  cancelledAudits: number; rescheduledAudits: number; pendingAudits: number;
  /** §45 · Nulo sin auditorías: un programa vacío no tiene cobertura. */
  coveragePct: number | null;
  processesInScope: number; processesAudited: number;
};

export async function listPrograms(
  organizationId: string, client?: Db
): Promise<ProgramRow[]> {
  const supabase = await db(client);
  const [coverage, programs] = await Promise.all([
    supabase.from("v_quality_audit_program_coverage").select("*")
      .eq("organization_id", organizationId)
      .order("period_start", { ascending: false }),
    supabase.from("quality_audit_programs")
      .select("id, purpose, prioritization_note, approved_on, closure_note")
      .eq("organization_id", organizationId),
  ]);
  if (coverage.error) throw new Error(fail(coverage.error, "No se pudieron leer los programas."));

  const extra = new Map((programs.data ?? []).map((p) => [p.id as string, p]));
  return (coverage.data ?? []).map((c) => {
    const e = extra.get(c.program_id as string);
    return {
      id: c.program_id, code: c.code, name: c.name,
      periodLabel: c.period_label, periodStart: c.period_start, periodEnd: c.period_end,
      purpose: (e?.purpose as string | null) ?? null,
      prioritizationNote: (e?.prioritization_note as string | null) ?? null,
      ownerPositionId: c.owner_position_id, ownerPositionName: null,
      status: c.status as ProgramStatus,
      approvedOn: (e?.approved_on as string | null) ?? null,
      closedAt: null, closureNote: (e?.closure_note as string | null) ?? null,
      plannedAudits: Number(c.planned_audits ?? 0),
      executedAudits: Number(c.executed_audits ?? 0),
      closedAudits: Number(c.closed_audits ?? 0),
      cancelledAudits: Number(c.cancelled_audits ?? 0),
      rescheduledAudits: Number(c.rescheduled_audits ?? 0),
      pendingAudits: Number(c.pending_audits ?? 0),
      coveragePct: c.coverage_pct === null || c.coverage_pct === undefined
        ? null : Number(c.coverage_pct),
      processesInScope: Number(c.processes_in_scope ?? 0),
      processesAudited: Number(c.processes_audited ?? 0),
    };
  });
}

export type ProgramRevisionRow = {
  id: string; revisionNumber: number; changeKind: ProgramRevisionKind;
  changeNote: string | null; snapshot: Record<string, unknown>;
  effectiveFrom: string;
};

/** §66 · Qué estaba programado en una fecha. */
export async function listProgramRevisions(
  organizationId: string, programId: string, client?: Db
): Promise<ProgramRevisionRow[]> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("quality_audit_program_revisions")
    .select("id, revision_number, change_kind, change_note, snapshot, effective_from")
    .eq("organization_id", organizationId).eq("program_id", programId)
    .order("revision_number", { ascending: false });
  if (error) throw new Error(fail(error, "No se pudo leer el historial del programa."));
  return (data ?? []).map((r) => ({
    id: r.id, revisionNumber: Number(r.revision_number),
    changeKind: r.change_kind as ProgramRevisionKind,
    changeNote: r.change_note,
    snapshot: (r.snapshot as Record<string, unknown>) ?? {},
    effectiveFrom: r.effective_from,
  }));
}

// ===========================================================================
// AUDITORÍA
// ===========================================================================

export type AuditRow = {
  id: string; code: string; title: string;
  auditType: AuditType; nature: AuditNature; status: AuditStatus;
  programId: string | null; programName: string | null;
  plannedFrom: string | null; plannedTo: string | null;
  scheduledFrom: string | null; scheduledTo: string | null;
  executedFrom: string | null; executedTo: string | null;
  ownerPositionId: string | null; ownerPositionName: string | null;
  reportIssuedAt: string | null; closedAt: string | null;
  rescheduleCount: number; teamSize: number; leadAuditor: string | null;
  scopeItems: number; criteriaCount: number; evidenceCount: number;
  findingCount: number; findingsPending: number; findingsEscalated: number;
  findingsNcSuspected: number; openConflicts: number;
  /** §36 · Derivado del motor transversal, no copiado. */
  openCases: number; openActions: number;
};

function mapAudit(r: Record<string, unknown>): AuditRow {
  return {
    id: r.audit_id as string,
    code: r.code as string,
    title: r.title as string,
    auditType: r.audit_type as AuditType,
    nature: r.nature as AuditNature,
    status: r.status as AuditStatus,
    programId: (r.program_id as string | null) ?? null,
    programName: (r.program_name as string | null) ?? null,
    plannedFrom: (r.planned_from as string | null) ?? null,
    plannedTo: (r.planned_to as string | null) ?? null,
    scheduledFrom: (r.scheduled_from as string | null) ?? null,
    scheduledTo: (r.scheduled_to as string | null) ?? null,
    executedFrom: (r.executed_from as string | null) ?? null,
    executedTo: (r.executed_to as string | null) ?? null,
    ownerPositionId: (r.owner_position_id as string | null) ?? null,
    ownerPositionName: (r.owner_position_name as string | null) ?? null,
    reportIssuedAt: (r.report_issued_at as string | null) ?? null,
    closedAt: (r.closed_at as string | null) ?? null,
    rescheduleCount: Number(r.reschedule_count ?? 0),
    teamSize: Number(r.team_size ?? 0),
    leadAuditor: (r.lead_auditor as string | null) ?? null,
    scopeItems: Number(r.scope_items ?? 0),
    criteriaCount: Number(r.criteria_count ?? 0),
    evidenceCount: Number(r.evidence_count ?? 0),
    findingCount: Number(r.finding_count ?? 0),
    findingsPending: Number(r.findings_pending ?? 0),
    findingsEscalated: Number(r.findings_escalated ?? 0),
    findingsNcSuspected: Number(r.findings_nc_suspected ?? 0),
    openConflicts: Number(r.open_conflicts ?? 0),
    openCases: Number(r.open_cases ?? 0),
    openActions: Number(r.open_actions ?? 0),
  };
}

export async function listAudits(
  organizationId: string,
  filters: { status?: string; programId?: string; auditType?: string } = {},
  client?: Db
): Promise<AuditRow[]> {
  const supabase = await db(client);
  let q = supabase.from("v_quality_audit_overview").select("*")
    .eq("organization_id", organizationId)
    .order("scheduled_from", { ascending: false, nullsFirst: false });
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.programId) q = q.eq("program_id", filters.programId);
  if (filters.auditType) q = q.eq("audit_type", filters.auditType);
  const { data, error } = await q;
  if (error) throw new Error(fail(error, "No se pudieron leer las auditorías."));
  return (data ?? []).map(mapAudit);
}

export async function getAudit(
  organizationId: string, auditId: string, client?: Db
): Promise<AuditRow | null> {
  const supabase = await db(client);
  const { data, error } = await supabase.from("v_quality_audit_overview").select("*")
    .eq("organization_id", organizationId).eq("audit_id", auditId).maybeSingle();
  if (error) throw new Error(fail(error, "No se pudo leer la auditoría."));
  return data ? mapAudit(data) : null;
}

export type AuditDetailRow = {
  objective: string | null; scopeNote: string | null;
  priorityNote: string | null; conclusions: string | null;
  closureNote: string | null; followupNote: string | null;
  cancelReason: string | null;
};

export async function getAuditDetail(
  organizationId: string, auditId: string, client?: Db
): Promise<AuditDetailRow | null> {
  const supabase = await db(client);
  const { data } = await supabase.from("quality_audits")
    .select("objective, scope_note, priority_note, conclusions, closure_note, followup_note, cancel_reason")
    .eq("organization_id", organizationId).eq("id", auditId).maybeSingle();
  if (!data) return null;
  return {
    objective: data.objective, scopeNote: data.scope_note,
    priorityNote: data.priority_note, conclusions: data.conclusions,
    closureNote: data.closure_note, followupNote: data.followup_note,
    cancelReason: data.cancel_reason,
  };
}

export type RescheduleRow = {
  id: string; fromStart: string | null; fromEnd: string | null;
  toStart: string | null; toEnd: string | null; reason: string; decidedAt: string;
};

export async function listReschedules(
  organizationId: string, auditId: string, client?: Db
): Promise<RescheduleRow[]> {
  const supabase = await db(client);
  const { data, error } = await supabase.from("quality_audit_reschedules")
    .select("id, from_start, from_end, to_start, to_end, reason, decided_at")
    .eq("organization_id", organizationId).eq("audit_id", auditId)
    .order("decided_at", { ascending: true });
  if (error) throw new Error(fail(error, "No se pudo leer el historial de reprogramaciones."));
  return (data ?? []).map((r) => ({
    id: r.id, fromStart: r.from_start, fromEnd: r.from_end,
    toStart: r.to_start, toEnd: r.to_end, reason: r.reason, decidedAt: r.decided_at,
  }));
}

// ===========================================================================
// ALCANCE, CRITERIOS Y EQUIPO
// ===========================================================================

export type ScopeItemRow = {
  id: string; itemKind: ScopeItemKind;
  processId: string | null; processName: string | null;
  processRevisionId: string | null; processRevisionNumber: number | null;
  partyId: string | null; partyName: string | null;
  supplierScopeId: string | null;
  documentId: string | null; documentTitle: string | null;
  requirementId: string | null; requirementCode: string | null;
  requirementTitle: string | null;
  note: string | null; order: number;
};

export async function listScopeItems(
  organizationId: string, auditId: string, client?: Db
): Promise<ScopeItemRow[]> {
  const supabase = await db(client);
  const { data, error } = await supabase.from("quality_audit_scope_items")
    .select("id, item_kind, process_id, process_revision_id, party_id, supplier_scope_id, document_id, requirement_id, note, position_order")
    .eq("organization_id", organizationId).eq("audit_id", auditId)
    .order("position_order");
  if (error) throw new Error(fail(error, "No se pudo leer el alcance."));
  const rows = data ?? [];
  if (rows.length === 0) return [];

  // Los embeds compuestos no resuelven: se piden los nombres por separado.
  const [procs, revs, parties, docs, reqs] = await Promise.all([
    idsIn(rows, "process_id")
      ? supabase.from("quality_processes").select("id, name, code")
          .eq("organization_id", organizationId).in("id", idsIn(rows, "process_id")!)
      : empty(),
    idsIn(rows, "process_revision_id")
      ? supabase.from("quality_process_revisions").select("id, revision_number")
          .eq("organization_id", organizationId).in("id", idsIn(rows, "process_revision_id")!)
      : empty(),
    idsIn(rows, "party_id")
      ? supabase.from("quality_external_parties").select("id, legal_name")
          .eq("organization_id", organizationId).in("id", idsIn(rows, "party_id")!)
      : empty(),
    idsIn(rows, "document_id")
      ? supabase.from("trazadoc_documents").select("id, title, code")
          .eq("organization_id", organizationId).in("id", idsIn(rows, "document_id")!)
      : empty(),
    idsIn(rows, "requirement_id")
      ? supabase.from("requirements").select("id, code, title")
          .in("id", idsIn(rows, "requirement_id")!)
      : empty(),
  ]);

  const byId = (r: { data: Record<string, unknown>[] | null }) =>
    new Map((r.data ?? []).map((x) => [x.id as string, x]));
  const P = byId(procs), R = byId(revs), PA = byId(parties), D = byId(docs), Q = byId(reqs);

  return rows.map((r) => {
    const req = Q.get(r.requirement_id as string) as { code?: string; title?: string } | undefined;
    return {
      id: r.id as string,
      itemKind: r.item_kind as ScopeItemKind,
      processId: (r.process_id as string | null) ?? null,
      processName: (P.get(r.process_id as string) as { name?: string } | undefined)?.name ?? null,
      processRevisionId: (r.process_revision_id as string | null) ?? null,
      processRevisionNumber: (R.get(r.process_revision_id as string) as { revision_number?: number } | undefined)
        ?.revision_number ?? null,
      partyId: (r.party_id as string | null) ?? null,
      partyName: (PA.get(r.party_id as string) as { legal_name?: string } | undefined)?.legal_name ?? null,
      supplierScopeId: (r.supplier_scope_id as string | null) ?? null,
      documentId: (r.document_id as string | null) ?? null,
      documentTitle: (D.get(r.document_id as string) as { title?: string } | undefined)?.title ?? null,
      requirementId: (r.requirement_id as string | null) ?? null,
      requirementCode: req?.code ?? null,
      requirementTitle: req?.title ?? null,
      note: (r.note as string | null) ?? null,
      order: Number(r.position_order ?? 1),
    };
  });
}

function idsIn(rows: Record<string, unknown>[], key: string): string[] | null {
  const ids = [...new Set(rows.map((r) => r[key]).filter(Boolean))] as string[];
  return ids.length > 0 ? ids : null;
}
/**
 * El resultado vacío que sustituye a una consulta que no hace falta: si ninguna
 * fila referencia procesos, no se pregunta por procesos.
 *
 * Devuelve `Record<string, unknown>[]` y no una forma concreta a propósito: el
 * lado que sí consulta trae columnas distintas en cada llamada, y un tipo
 * estrecho aquí obligaría a que TODAS coincidieran con él.
 */
async function empty(): Promise<{ data: Record<string, unknown>[] | null }> {
  return { data: [] };
}

export type CriterionRow = {
  id: string; criterionKind: CriterionKind;
  requirementId: string | null; requirementCode: string | null; requirementTitle: string | null;
  documentId: string | null; documentTitle: string | null; documentCode: string | null;
  documentRevisionId: string | null; documentRevisionLabel: string | null;
  documentRevisionNumber: number | null;
  customText: string | null; note: string | null; order: number;
};

export async function listCriteria(
  organizationId: string, auditId: string, client?: Db
): Promise<CriterionRow[]> {
  const supabase = await db(client);
  const { data, error } = await supabase.from("quality_audit_criteria")
    .select("id, criterion_kind, requirement_id, document_id, document_revision_id, custom_text, note, position_order")
    .eq("organization_id", organizationId).eq("audit_id", auditId)
    .order("position_order");
  if (error) throw new Error(fail(error, "No se pudieron leer los criterios."));
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const [reqs, docs, revs] = await Promise.all([
    idsIn(rows, "requirement_id")
      ? supabase.from("requirements").select("id, code, title").in("id", idsIn(rows, "requirement_id")!)
      : empty(),
    idsIn(rows, "document_id")
      ? supabase.from("trazadoc_documents").select("id, title, code")
          .eq("organization_id", organizationId).in("id", idsIn(rows, "document_id")!)
      : empty(),
    idsIn(rows, "document_revision_id")
      ? supabase.from("trazadoc_document_revisions").select("id, revision_label, revision_number")
          .eq("organization_id", organizationId).in("id", idsIn(rows, "document_revision_id")!)
      : empty(),
  ]);
  const Q = new Map((reqs.data ?? []).map((x) => [x.id as string, x]));
  const D = new Map((docs.data ?? []).map((x) => [x.id as string, x]));
  const R = new Map((revs.data ?? []).map((x) => [x.id as string, x]));

  return rows.map((r) => {
    const req = Q.get(r.requirement_id as string) as { code?: string; title?: string } | undefined;
    const doc = D.get(r.document_id as string) as { title?: string; code?: string } | undefined;
    const rev = R.get(r.document_revision_id as string) as
      { revision_label?: string; revision_number?: number } | undefined;
    return {
      id: r.id as string,
      criterionKind: r.criterion_kind as CriterionKind,
      requirementId: (r.requirement_id as string | null) ?? null,
      requirementCode: req?.code ?? null,
      requirementTitle: req?.title ?? null,
      documentId: (r.document_id as string | null) ?? null,
      documentTitle: doc?.title ?? null,
      documentCode: doc?.code ?? null,
      documentRevisionId: (r.document_revision_id as string | null) ?? null,
      documentRevisionLabel: rev?.revision_label ?? null,
      documentRevisionNumber: rev?.revision_number ?? null,
      customText: (r.custom_text as string | null) ?? null,
      note: (r.note as string | null) ?? null,
      order: Number(r.position_order ?? 1),
    };
  });
}

export type TeamMemberRow = {
  id: string; personId: string; personName: string;
  hasAccount: boolean; teamRole: TeamRole; note: string | null;
};

export async function listTeam(
  organizationId: string, auditId: string, client?: Db
): Promise<TeamMemberRow[]> {
  const supabase = await db(client);
  const { data, error } = await supabase.from("quality_audit_team_members")
    .select("id, person_id, team_role, note")
    .eq("organization_id", organizationId).eq("audit_id", auditId);
  if (error) throw new Error(fail(error, "No se pudo leer el equipo auditor."));
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const { data: people } = await supabase.from("quality_people")
    .select("id, full_name, profile_id")
    .eq("organization_id", organizationId)
    .in("id", rows.map((r) => r.person_id as string));
  const P = new Map((people ?? []).map((p) => [p.id as string, p]));

  return rows.map((r) => {
    const p = P.get(r.person_id as string) as
      { full_name?: string; profile_id?: string | null } | undefined;
    return {
      id: r.id as string,
      personId: r.person_id as string,
      personName: p?.full_name ?? "Persona",
      // §59 · Sin cuenta también cuenta.
      hasAccount: Boolean(p?.profile_id),
      teamRole: r.team_role as TeamRole,
      note: (r.note as string | null) ?? null,
    };
  }).sort((a, b) =>
    (a.teamRole === "lead" ? 0 : 1) - (b.teamRole === "lead" ? 0 : 1)
    || a.personName.localeCompare(b.personName, "es"));
}

export type ConflictRow = {
  id: string; personId: string; personName: string;
  conflictKind: ConflictKind; detail: string; evaluatedOn: string;
  status: ConflictStatus; mitigation: string | null; decidedAt: string | null;
};

export async function listConflicts(
  organizationId: string, auditId: string, client?: Db
): Promise<ConflictRow[]> {
  const supabase = await db(client);
  const { data, error } = await supabase.from("quality_audit_conflict_checks")
    .select("id, person_id, conflict_kind, detail, evaluated_on, status, mitigation, decided_at")
    .eq("organization_id", organizationId).eq("audit_id", auditId)
    .order("detected_at");
  if (error) throw new Error(fail(error, "No se pudieron leer los conflictos."));
  const rows = data ?? [];
  if (rows.length === 0) return [];
  const { data: people } = await supabase.from("quality_people")
    .select("id, full_name").eq("organization_id", organizationId)
    .in("id", rows.map((r) => r.person_id as string));
  const P = new Map((people ?? []).map((p) => [p.id as string, p.full_name as string]));
  return rows.map((r) => ({
    id: r.id as string, personId: r.person_id as string,
    personName: P.get(r.person_id as string) ?? "Persona",
    conflictKind: r.conflict_kind as ConflictKind,
    detail: r.detail as string,
    evaluatedOn: r.evaluated_on as string,
    status: r.status as ConflictStatus,
    mitigation: (r.mitigation as string | null) ?? null,
    decidedAt: (r.decided_at as string | null) ?? null,
  }));
}

// ===========================================================================
// PLAN, EJECUCIÓN Y HALLAZGOS
// ===========================================================================

export type AgendaItemRow = {
  id: string; order: number; activityKind: string; title: string;
  scheduledOn: string | null; startsAtLabel: string | null; endsAtLabel: string | null;
  location: string | null; processId: string | null; processName: string | null;
  responsiblePersonId: string | null; responsibleName: string | null; note: string | null;
};

export async function listAgenda(
  organizationId: string, auditId: string, client?: Db
): Promise<AgendaItemRow[]> {
  const supabase = await db(client);
  const { data, error } = await supabase.from("quality_audit_agenda_items")
    .select("id, position_order, activity_kind, title, scheduled_on, starts_at_label, ends_at_label, location, process_id, responsible_person_id, note")
    .eq("organization_id", organizationId).eq("audit_id", auditId)
    .order("scheduled_on", { nullsFirst: true }).order("position_order");
  if (error) throw new Error(fail(error, "No se pudo leer la agenda."));
  const rows = data ?? [];
  if (rows.length === 0) return [];
  const [procs, people] = await Promise.all([
    idsIn(rows, "process_id")
      ? supabase.from("quality_processes").select("id, name")
          .eq("organization_id", organizationId).in("id", idsIn(rows, "process_id")!)
      : empty(),
    idsIn(rows, "responsible_person_id")
      ? supabase.from("quality_people").select("id, full_name")
          .eq("organization_id", organizationId).in("id", idsIn(rows, "responsible_person_id")!)
      : empty(),
  ]);
  const P = new Map((procs.data ?? []).map((x) => [x.id as string, x]));
  const PE = new Map((people.data ?? []).map((x) => [x.id as string, x]));
  return rows.map((r) => ({
    id: r.id as string, order: Number(r.position_order ?? 1),
    activityKind: r.activity_kind as string, title: r.title as string,
    scheduledOn: (r.scheduled_on as string | null) ?? null,
    startsAtLabel: (r.starts_at_label as string | null) ?? null,
    endsAtLabel: (r.ends_at_label as string | null) ?? null,
    location: (r.location as string | null) ?? null,
    processId: (r.process_id as string | null) ?? null,
    processName: (P.get(r.process_id as string) as { name?: string } | undefined)?.name ?? null,
    responsiblePersonId: (r.responsible_person_id as string | null) ?? null,
    responsibleName: (PE.get(r.responsible_person_id as string) as { full_name?: string } | undefined)
      ?.full_name ?? null,
    note: (r.note as string | null) ?? null,
  }));
}

export type AuditeeRow = {
  id: string; personId: string | null; personName: string | null;
  externalName: string | null; roleNote: string | null;
  processId: string | null; processName: string | null;
};

export async function listAuditees(
  organizationId: string, auditId: string, client?: Db
): Promise<AuditeeRow[]> {
  const supabase = await db(client);
  const { data, error } = await supabase.from("quality_audit_auditees")
    .select("id, person_id, external_name, role_note, process_id")
    .eq("organization_id", organizationId).eq("audit_id", auditId);
  if (error) throw new Error(fail(error, "No se pudieron leer los auditados."));
  const rows = data ?? [];
  if (rows.length === 0) return [];
  const [people, procs] = await Promise.all([
    idsIn(rows, "person_id")
      ? supabase.from("quality_people").select("id, full_name")
          .eq("organization_id", organizationId).in("id", idsIn(rows, "person_id")!)
      : empty(),
    idsIn(rows, "process_id")
      ? supabase.from("quality_processes").select("id, name")
          .eq("organization_id", organizationId).in("id", idsIn(rows, "process_id")!)
      : empty(),
  ]);
  const PE = new Map((people.data ?? []).map((x) => [x.id as string, x]));
  const P = new Map((procs.data ?? []).map((x) => [x.id as string, x]));
  return rows.map((r) => ({
    id: r.id as string,
    personId: (r.person_id as string | null) ?? null,
    personName: (PE.get(r.person_id as string) as { full_name?: string } | undefined)?.full_name ?? null,
    externalName: (r.external_name as string | null) ?? null,
    roleNote: (r.role_note as string | null) ?? null,
    processId: (r.process_id as string | null) ?? null,
    processName: (P.get(r.process_id as string) as { name?: string } | undefined)?.name ?? null,
  }));
}

export type NoteRow = {
  id: string; noteKind: NoteKind; body: string;
  processId: string | null; recordedOn: string; isRestricted: boolean;
};

/** §58 · La RLS decide qué notas devuelve: una restringida solo la ve quien
 *  conduce el dominio o quien está en el equipo de esta auditoría. */
export async function listNotes(
  organizationId: string, auditId: string, client?: Db
): Promise<NoteRow[]> {
  const supabase = await db(client);
  const { data, error } = await supabase.from("quality_audit_notes")
    .select("id, note_kind, body, process_id, recorded_on, is_restricted")
    .eq("organization_id", organizationId).eq("audit_id", auditId)
    .order("recorded_on", { ascending: false });
  if (error) throw new Error(fail(error, "No se pudieron leer las notas."));
  return (data ?? []).map((r) => ({
    id: r.id, noteKind: r.note_kind as NoteKind, body: r.body,
    processId: r.process_id, recordedOn: r.recorded_on,
    isRestricted: Boolean(r.is_restricted),
  }));
}

export type SampleRow = {
  id: string; description: string; populationNote: string | null;
  populationSize: number | null; sampleSize: number;
  selectionMethod: string | null; processId: string | null; note: string | null;
};

export async function listSamples(
  organizationId: string, auditId: string, client?: Db
): Promise<SampleRow[]> {
  const supabase = await db(client);
  const { data, error } = await supabase.from("quality_audit_samples")
    .select("id, description, population_note, population_size, sample_size, selection_method, process_id, note")
    .eq("organization_id", organizationId).eq("audit_id", auditId);
  if (error) throw new Error(fail(error, "No se pudieron leer las muestras."));
  return (data ?? []).map((r) => ({
    id: r.id, description: r.description, populationNote: r.population_note,
    populationSize: r.population_size === null ? null : Number(r.population_size),
    sampleSize: Number(r.sample_size), selectionMethod: r.selection_method,
    processId: r.process_id, note: r.note,
  }));
}

export type EvidenceRow = {
  id: string; evidenceKind: EvidenceKind; description: string;
  documentId: string | null; documentTitle: string | null;
  documentRevisionId: string | null; documentRevisionLabel: string | null;
  indicatorId: string | null; caseId: string | null;
  externalEvidenceId: string | null;
  collectedOn: string; note: string | null;
};

export async function listEvidence(
  organizationId: string, auditId: string, client?: Db
): Promise<EvidenceRow[]> {
  const supabase = await db(client);
  const { data, error } = await supabase.from("quality_audit_evidence")
    .select("id, evidence_kind, description, document_id, document_revision_id, indicator_id, case_id, external_evidence_id, collected_on, note")
    .eq("organization_id", organizationId).eq("audit_id", auditId)
    .order("collected_on", { ascending: false });
  if (error) throw new Error(fail(error, "No se pudo leer la evidencia."));
  const rows = data ?? [];
  if (rows.length === 0) return [];
  const [docs, revs] = await Promise.all([
    idsIn(rows, "document_id")
      ? supabase.from("trazadoc_documents").select("id, title")
          .eq("organization_id", organizationId).in("id", idsIn(rows, "document_id")!)
      : empty(),
    idsIn(rows, "document_revision_id")
      ? supabase.from("trazadoc_document_revisions").select("id, revision_label")
          .eq("organization_id", organizationId).in("id", idsIn(rows, "document_revision_id")!)
      : empty(),
  ]);
  const D = new Map((docs.data ?? []).map((x) => [x.id as string, x]));
  const R = new Map((revs.data ?? []).map((x) => [x.id as string, x]));
  return rows.map((r) => ({
    id: r.id as string,
    evidenceKind: r.evidence_kind as EvidenceKind,
    description: r.description as string,
    documentId: (r.document_id as string | null) ?? null,
    documentTitle: (D.get(r.document_id as string) as { title?: string } | undefined)?.title ?? null,
    documentRevisionId: (r.document_revision_id as string | null) ?? null,
    documentRevisionLabel: (R.get(r.document_revision_id as string) as { revision_label?: string } | undefined)
      ?.revision_label ?? null,
    indicatorId: (r.indicator_id as string | null) ?? null,
    caseId: (r.case_id as string | null) ?? null,
    externalEvidenceId: (r.external_evidence_id as string | null) ?? null,
    collectedOn: r.collected_on as string,
    note: (r.note as string | null) ?? null,
  }));
}

export type FindingRow = {
  id: string; auditId: string; code: string; statement: string; detail: string | null;
  locationText: string | null;
  criterionId: string | null;
  processId: string | null; processName: string | null;
  proposedClassification: FindingClassification;
  proposedSeverity: FindingSeverity | null;
  evaluationStatus: FindingEvaluationStatus;
  evaluationNote: string | null; evaluatedAt: string | null;
  caseId: string | null; caseCode: string | null; caseClassification: string | null;
  raisedOn: string;
  evidenceIds: string[];
};

export async function listFindings(
  organizationId: string,
  filters: { auditId?: string; status?: string } = {},
  client?: Db
): Promise<FindingRow[]> {
  const supabase = await db(client);
  let q = supabase.from("quality_audit_findings")
    .select("id, audit_id, code, statement, detail, location_text, criterion_id, process_id, proposed_classification, proposed_severity, evaluation_status, evaluation_note, evaluated_at, case_id, raised_on")
    .eq("organization_id", organizationId)
    .order("code");
  if (filters.auditId) q = q.eq("audit_id", filters.auditId);
  if (filters.status) q = q.eq("evaluation_status", filters.status);
  const { data, error } = await q;
  if (error) throw new Error(fail(error, "No se pudieron leer los hallazgos."));
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const [procs, cases, links] = await Promise.all([
    idsIn(rows, "process_id")
      ? supabase.from("quality_processes").select("id, name")
          .eq("organization_id", organizationId).in("id", idsIn(rows, "process_id")!)
      : empty(),
    idsIn(rows, "case_id")
      ? supabase.from("work_cases").select("id, code, classification")
          .eq("organization_id", organizationId).in("id", idsIn(rows, "case_id")!)
      : empty(),
    supabase.from("quality_audit_finding_evidence").select("finding_id, evidence_id")
      .eq("organization_id", organizationId)
      .in("finding_id", rows.map((r) => r.id as string)),
  ]);
  const P = new Map((procs.data ?? []).map((x) => [x.id as string, x]));
  const C = new Map((cases.data ?? []).map((x) => [x.id as string, x]));

  return rows.map((r) => {
    const c = C.get(r.case_id as string) as { code?: string; classification?: string } | undefined;
    return {
      id: r.id as string, auditId: r.audit_id as string, code: r.code as string,
      statement: r.statement as string,
      detail: (r.detail as string | null) ?? null,
      locationText: (r.location_text as string | null) ?? null,
      criterionId: (r.criterion_id as string | null) ?? null,
      processId: (r.process_id as string | null) ?? null,
      processName: (P.get(r.process_id as string) as { name?: string } | undefined)?.name ?? null,
      proposedClassification: r.proposed_classification as FindingClassification,
      proposedSeverity: (r.proposed_severity as FindingSeverity | null) ?? null,
      evaluationStatus: r.evaluation_status as FindingEvaluationStatus,
      evaluationNote: (r.evaluation_note as string | null) ?? null,
      evaluatedAt: (r.evaluated_at as string | null) ?? null,
      caseId: (r.case_id as string | null) ?? null,
      caseCode: c?.code ?? null,
      // §30 · La clasificación FORMAL vive en el caso. Se lee de ahí, no se
      // deriva de lo que propuso el auditor.
      caseClassification: c?.classification ?? null,
      raisedOn: r.raised_on as string,
      evidenceIds: ((links as { data?: Record<string, unknown>[] }).data ?? [])
        .filter((l) => l.finding_id === r.id)
        .map((l) => l.evidence_id as string),
    };
  });
}

export type ReportRow = {
  id: string; versionNumber: number; issuedOn: string;
  summary: string | null; snapshot: Record<string, unknown>;
  supersedesId: string | null;
};

export async function listReports(
  organizationId: string, auditId: string, client?: Db
): Promise<ReportRow[]> {
  const supabase = await db(client);
  const { data, error } = await supabase.from("quality_audit_reports")
    .select("id, version_number, issued_on, summary, snapshot, supersedes_id")
    .eq("organization_id", organizationId).eq("audit_id", auditId)
    .order("version_number", { ascending: false });
  if (error) throw new Error(fail(error, "No se pudieron leer los informes."));
  return (data ?? []).map((r) => ({
    id: r.id, versionNumber: Number(r.version_number), issuedOn: r.issued_on,
    summary: r.summary, snapshot: (r.snapshot as Record<string, unknown>) ?? {},
    supersedesId: r.supersedes_id,
  }));
}

// ===========================================================================
// CHECKLISTS
// ===========================================================================

export type ChecklistItemRow = {
  id: string; stableKey: string; prompt: string; guidance: string | null;
  requirementId: string | null; documentId: string | null;
  criterionText: string | null; order: number;
};

export type ChecklistVersionRow = {
  id: string; versionNumber: number; status: ChecklistVersionStatus;
  effectiveFrom: string | null; effectiveTo: string | null; changeNote: string | null;
  items: ChecklistItemRow[];
};

export type ChecklistRow = {
  id: string; code: string | null; name: string; description: string | null;
  isActive: boolean; versions: ChecklistVersionRow[];
};

export async function listChecklists(
  organizationId: string, client?: Db
): Promise<ChecklistRow[]> {
  const supabase = await db(client);
  const [lists, versions, items] = await Promise.all([
    supabase.from("quality_audit_checklists")
      .select("id, code, name, description, is_active")
      .eq("organization_id", organizationId).order("name"),
    supabase.from("quality_audit_checklist_versions")
      .select("id, checklist_id, version_number, status, effective_from, effective_to, change_note")
      .eq("organization_id", organizationId).order("version_number", { ascending: false }),
    supabase.from("quality_audit_checklist_items")
      .select("id, version_id, stable_key, prompt, guidance, requirement_id, document_id, criterion_text, position_order")
      .eq("organization_id", organizationId).order("position_order"),
  ]);
  if (lists.error) throw new Error(fail(lists.error, "No se pudieron leer los checklists."));

  return (lists.data ?? []).map((l) => ({
    id: l.id, code: l.code, name: l.name, description: l.description,
    isActive: Boolean(l.is_active),
    versions: (versions.data ?? [])
      .filter((v) => v.checklist_id === l.id)
      .map((v) => ({
        id: v.id as string,
        versionNumber: Number(v.version_number),
        status: v.status as ChecklistVersionStatus,
        effectiveFrom: v.effective_from as string | null,
        effectiveTo: v.effective_to as string | null,
        changeNote: v.change_note as string | null,
        items: (items.data ?? [])
          .filter((i) => i.version_id === v.id)
          .map((i) => ({
            id: i.id as string, stableKey: i.stable_key as string,
            prompt: i.prompt as string, guidance: i.guidance as string | null,
            requirementId: i.requirement_id as string | null,
            documentId: i.document_id as string | null,
            criterionText: i.criterion_text as string | null,
            order: Number(i.position_order ?? 1),
          })),
      })),
  }));
}

export type CheckResultRow = {
  id: string; itemId: string; prompt: string; stableKey: string;
  outcome: CheckOutcome; note: string | null; order: number;
};

export async function listCheckResults(
  organizationId: string, auditId: string, client?: Db
): Promise<{ runId: string; checklistName: string; versionNumber: number;
             results: CheckResultRow[] } | null> {
  const supabase = await db(client);
  const { data: run } = await supabase.from("quality_audit_checklist_runs")
    .select("id, checklist_id, version_id")
    .eq("organization_id", organizationId).eq("audit_id", auditId)
    .limit(1).maybeSingle();
  if (!run) return null;

  const [{ data: list }, { data: version }, { data: items }, { data: results }] =
    await Promise.all([
      supabase.from("quality_audit_checklists").select("name")
        .eq("organization_id", organizationId).eq("id", run.checklist_id).maybeSingle(),
      supabase.from("quality_audit_checklist_versions").select("version_number")
        .eq("organization_id", organizationId).eq("id", run.version_id).maybeSingle(),
      supabase.from("quality_audit_checklist_items")
        .select("id, stable_key, prompt, position_order")
        .eq("organization_id", organizationId).eq("version_id", run.version_id)
        .order("position_order"),
      supabase.from("quality_audit_check_results")
        .select("id, item_id, outcome, note")
        .eq("organization_id", organizationId).eq("run_id", run.id),
    ]);

  return {
    runId: run.id as string,
    checklistName: (list?.name as string) ?? "Checklist",
    versionNumber: Number(version?.version_number ?? 1),
    // Se recorren los ITEMS, no los resultados: una pregunta sin fila es «sin
    // revisar», y recorriendo los resultados desaparecería del papel.
    results: (items ?? []).map((i) => {
      const r = (results ?? []).find((x) => x.item_id === i.id);
      return {
        id: (r?.id as string) ?? "",
        itemId: i.id as string,
        prompt: i.prompt as string,
        stableKey: i.stable_key as string,
        outcome: (r?.outcome as CheckOutcome) ?? "not_reviewed",
        note: (r?.note as string | null) ?? null,
        order: Number(i.position_order ?? 1),
      };
    }),
  };
}

// ===========================================================================
// PREPARACIÓN, PRIORIZACIÓN Y SEÑALES
// ===========================================================================

/** AR-07 · El expediente, armado con lo que ya existe. */
export async function getPreparationDossier(
  auditId: string, client?: Db
): Promise<Record<string, unknown> | null> {
  const supabase = await db(client);
  const { data, error } = await supabase.rpc("quality_audit_preparation_dossier", {
    p_audit_id: auditId,
  });
  if (error) throw new Error(fail(error, "No se pudo preparar el expediente."));
  return (data as Record<string, unknown> | null) ?? null;
}

/** AR-04 · El contexto que ayuda a priorizar. Sugiere; no programa. */
export async function getPriorityContext(
  organizationId: string, processId: string, client?: Db
): Promise<Record<string, unknown> | null> {
  const supabase = await db(client);
  const { data, error } = await supabase.rpc("quality_audit_priority_context", {
    p_organization_id: organizationId, p_process_id: processId,
  });
  if (error) throw new Error(fail(error, "No se pudo leer el contexto de priorización."));
  return (data as Record<string, unknown> | null) ?? null;
}

/** §20 · Los conflictos resueltos con los cargos de esa fecha. */
export async function getConflictsOn(
  organizationId: string, auditId: string, on: string, client?: Db
): Promise<{ personId: string; personName: string; conflictKind: ConflictKind;
             positionName: string | null; processName: string | null; detail: string }[]> {
  const supabase = await db(client);
  const { data, error } = await supabase.rpc("quality_audit_conflicts_on", {
    p_organization_id: organizationId, p_audit_id: auditId, p_on: on,
  });
  if (error) throw new Error(fail(error, "No se pudo comprobar la independencia."));
  return (data ?? []).map((r: Record<string, string>) => ({
    personId: r.person_id, personName: r.person_name,
    conflictKind: r.conflict_kind as ConflictKind,
    positionName: r.position_name ?? null,
    processName: r.process_name ?? null,
    detail: r.detail,
  }));
}

export type RecurringFindingRow = {
  processId: string; processName: string;
  proposedClassification: FindingClassification;
  occurrences: number; auditsInvolved: number;
  firstRaisedOn: string; lastRaisedOn: string;
};

/** AR-18 · El mismo proceso reaparece en varias auditorías. */
export async function listRecurringFindings(
  organizationId: string, client?: Db
): Promise<RecurringFindingRow[]> {
  const supabase = await db(client);
  const { data, error } = await supabase.from("v_quality_audit_recurring_findings")
    .select("*").eq("organization_id", organizationId)
    .order("occurrences", { ascending: false });
  if (error) throw new Error(fail(error, "No se pudieron leer los hallazgos recurrentes."));
  return (data ?? []).map((r) => ({
    processId: r.process_id, processName: r.process_name,
    proposedClassification: r.proposed_classification as FindingClassification,
    occurrences: Number(r.occurrences), auditsInvolved: Number(r.audits_involved),
    firstRaisedOn: r.first_raised_on, lastRaisedOn: r.last_raised_on,
  }));
}

/** §51 · Lo que Quality Home necesita saber, y nada más. */
export type AuditHomeSignals = {
  upcomingAudits: number;
  overdueAudits: number;
  reportsPending: number;
  findingsPending: number;
  openConflicts: number;
};

export async function getAuditHomeSignals(
  organizationId: string, client?: Db
): Promise<AuditHomeSignals> {
  const supabase = await db(client);
  const today = todayIso();
  const inTwoWeeks = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
  const [audits, findings, conflicts] = await Promise.all([
    supabase.from("quality_audits")
      .select("status, scheduled_from, scheduled_to, executed_to")
      .eq("organization_id", organizationId),
    supabase.from("quality_audit_findings").select("evaluation_status")
      .eq("organization_id", organizationId).eq("evaluation_status", "pending"),
    supabase.from("quality_audit_conflict_checks").select("status")
      .eq("organization_id", organizationId).eq("status", "detected"),
  ]);
  const a = audits.data ?? [];
  return {
    upcomingAudits: a.filter((x) =>
      (x.status === "draft" || x.status === "planned")
      && x.scheduled_from !== null
      && x.scheduled_from >= today && x.scheduled_from <= inTwoWeeks).length,
    overdueAudits: a.filter((x) =>
      ["draft", "planned", "in_progress"].includes(x.status as string)
      && x.scheduled_to !== null && x.scheduled_to < today).length,
    reportsPending: a.filter((x) => x.status === "executed").length,
    findingsPending: (findings.data ?? []).length,
    openConflicts: (conflicts.data ?? []).length,
  };
}

// ===========================================================================
// ESCRITURA
// ---------------------------------------------------------------------------
// Lo que solo REGISTRA es escritura normal bajo RLS. Lo que crea HISTORIA
// —reprogramar, cancelar, publicar, comprobar independencia, escalar, emitir y
// cerrar— pasa por su RPC.
// ===========================================================================

export async function createProgram(
  organizationId: string,
  input: {
    name: string; code: string | null; periodLabel: string;
    periodStart: string; periodEnd: string; purpose: string | null;
    prioritizationNote: string | null; ownerPositionId: string | null;
  },
  client?: Db
): Promise<string> {
  const supabase = await db(client);
  const { data, error } = await supabase.from("quality_audit_programs").insert({
    organization_id: organizationId, name: input.name, code: input.code,
    period_label: input.periodLabel, period_start: input.periodStart,
    period_end: input.periodEnd, purpose: input.purpose,
    prioritization_note: input.prioritizationNote,
    owner_position_id: input.ownerPositionId,
  }).select("id").single();
  if (error) throw new Error(fail(error, "No se pudo crear el programa."));

  await supabase.rpc("quality_record_program_revision", {
    p_program_id: data!.id, p_change_kind: "created", p_change_note: null,
  });
  return data!.id as string;
}

export async function updateProgramStatus(
  organizationId: string, programId: string,
  input: { status: ProgramStatus; closureNote: string | null },
  client?: Db
): Promise<void> {
  const supabase = await db(client);
  const closing = input.status === "closed";
  const { error } = await supabase.from("quality_audit_programs")
    .update({
      status: input.status,
      approved_on: input.status === "active" ? todayIso() : undefined,
      closed_at: closing ? new Date().toISOString() : null,
      closure_note: input.closureNote,
    })
    .eq("organization_id", organizationId).eq("id", programId);
  if (error) throw new Error(fail(error, "No se pudo actualizar el programa."));

  await supabase.rpc("quality_record_program_revision", {
    p_program_id: programId,
    p_change_kind: closing ? "closed" : input.status === "active" ? "approved" : "other",
    p_change_note: input.closureNote,
  });
}

export async function createAudit(
  organizationId: string,
  input: {
    programId: string | null; code: string; title: string;
    auditType: AuditType; nature: AuditNature;
    objective: string | null; scopeNote: string | null;
    scheduledFrom: string | null; scheduledTo: string | null;
    ownerPositionId: string | null; priorityNote: string | null;
  },
  client?: Db
): Promise<string> {
  const supabase = await db(client);
  const { data, error } = await supabase.from("quality_audits").insert({
    organization_id: organizationId, program_id: input.programId,
    code: input.code, title: input.title,
    audit_type: input.auditType, nature: input.nature,
    objective: input.objective, scope_note: input.scopeNote,
    // §43 · La fecha original se fija AQUÍ, la primera vez.
    planned_from: input.scheduledFrom, planned_to: input.scheduledTo,
    scheduled_from: input.scheduledFrom, scheduled_to: input.scheduledTo,
    owner_position_id: input.ownerPositionId, priority_note: input.priorityNote,
    status: input.scheduledFrom ? "planned" : "draft",
  }).select("id").single();
  if (error) throw new Error(fail(error, "No se pudo crear la auditoría."));

  if (input.programId) {
    await supabase.rpc("quality_record_program_revision", {
      p_program_id: input.programId, p_change_kind: "audit_added",
      p_change_note: `Auditoría ${input.code}: ${input.title}`,
    });
  }
  return data!.id as string;
}

export async function updateAudit(
  organizationId: string, auditId: string,
  input: {
    title: string; objective: string | null; scopeNote: string | null;
    ownerPositionId: string | null; priorityNote: string | null;
  },
  client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase.from("quality_audits").update({
    title: input.title, objective: input.objective, scope_note: input.scopeNote,
    owner_position_id: input.ownerPositionId, priority_note: input.priorityNote,
  }).eq("organization_id", organizationId).eq("id", auditId);
  if (error) throw new Error(fail(error, "No se pudo actualizar la auditoría."));
}

export async function rescheduleAudit(
  auditId: string, from: string | null, to: string | null, reason: string, client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase.rpc("quality_reschedule_audit", {
    p_audit_id: auditId, p_from: from, p_to: to, p_reason: reason,
  });
  if (error) throw new Error(fail(error, "No se pudo reprogramar la auditoría."));
}

export async function cancelAudit(
  auditId: string, reason: string, client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase.rpc("quality_cancel_audit", {
    p_audit_id: auditId, p_reason: reason,
  });
  if (error) throw new Error(fail(error, "No se pudo cancelar la auditoría."));
}

export async function startAuditExecution(
  organizationId: string, auditId: string, from: string, client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase.from("quality_audits")
    .update({ status: "in_progress", executed_from: from })
    .eq("organization_id", organizationId).eq("id", auditId);
  if (error) throw new Error(fail(error, "No se pudo iniciar la ejecución."));
}

export async function finishAuditExecution(
  organizationId: string, auditId: string, to: string, conclusions: string | null,
  client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase.from("quality_audits")
    .update({
      status: "executed", executed_to: to,
      conclusions, conclusions_at: conclusions ? new Date().toISOString() : null,
    })
    .eq("organization_id", organizationId).eq("id", auditId);
  if (error) throw new Error(fail(error, "No se pudo cerrar la ejecución."));
}

export async function deleteAudit(
  organizationId: string, auditId: string, client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase.from("quality_audits").delete()
    .eq("organization_id", organizationId).eq("id", auditId);
  if (error) throw new Error(fail(error, "No se pudo eliminar la auditoría."));
}

// --- Alcance y criterios -------------------------------------------------

export async function addScopeItem(
  organizationId: string, auditId: string,
  input: {
    itemKind: ScopeItemKind; processId: string | null;
    processRevisionId: string | null; orgUnit: string | null;
    partyId: string | null; supplierScopeId: string | null;
    documentId: string | null; requirementId: string | null;
    note: string | null; positionOrder: number;
  },
  client?: Db
): Promise<string> {
  const supabase = await db(client);
  const { data, error } = await supabase.from("quality_audit_scope_items").insert({
    organization_id: organizationId, audit_id: auditId,
    item_kind: input.itemKind, process_id: input.processId,
    process_revision_id: input.processRevisionId, org_unit: input.orgUnit,
    party_id: input.partyId, supplier_scope_id: input.supplierScopeId,
    document_id: input.documentId, requirement_id: input.requirementId,
    note: input.note, position_order: input.positionOrder,
  }).select("id").single();
  if (error) throw new Error(fail(error, "No se pudo añadir el elemento de alcance."));
  return data!.id as string;
}

export async function removeScopeItem(
  organizationId: string, itemId: string, client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase.from("quality_audit_scope_items").delete()
    .eq("organization_id", organizationId).eq("id", itemId);
  if (error) throw new Error(fail(error, "No se pudo quitar el elemento de alcance."));
}

export async function addCriterion(
  organizationId: string, auditId: string,
  input: {
    criterionKind: CriterionKind; requirementId: string | null;
    documentId: string | null; documentRevisionId: string | null;
    customText: string | null; note: string | null; positionOrder: number;
  },
  client?: Db
): Promise<string> {
  const supabase = await db(client);
  const { data, error } = await supabase.from("quality_audit_criteria").insert({
    organization_id: organizationId, audit_id: auditId,
    criterion_kind: input.criterionKind, requirement_id: input.requirementId,
    document_id: input.documentId, document_revision_id: input.documentRevisionId,
    custom_text: input.customText, note: input.note,
    position_order: input.positionOrder,
  }).select("id").single();
  if (error) throw new Error(fail(error, "No se pudo añadir el criterio."));
  return data!.id as string;
}

export async function removeCriterion(
  organizationId: string, criterionId: string, client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase.from("quality_audit_criteria").delete()
    .eq("organization_id", organizationId).eq("id", criterionId);
  if (error) throw new Error(fail(error, "No se pudo quitar el criterio."));
}

// --- Equipo, independencia y auditados -----------------------------------

export async function addTeamMember(
  organizationId: string, auditId: string,
  input: { personId: string; teamRole: TeamRole; note: string | null },
  client?: Db
): Promise<string> {
  const supabase = await db(client);
  const { data, error } = await supabase.from("quality_audit_team_members").insert({
    organization_id: organizationId, audit_id: auditId,
    person_id: input.personId, team_role: input.teamRole, note: input.note,
  }).select("id").single();
  if (error) throw new Error(fail(error, "No se pudo añadir al equipo auditor."));
  return data!.id as string;
}

export async function removeTeamMember(
  organizationId: string, memberId: string, client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase.from("quality_audit_team_members").delete()
    .eq("organization_id", organizationId).eq("id", memberId);
  if (error) throw new Error(fail(error, "No se pudo quitar al miembro del equipo."));
}

/**
 * AR-11 · Registra los conflictos que los cargos de esa fecha revelan.
 * La función NO declara independencia: devuelve lo que encontró para que una
 * persona decida.
 */
export async function checkIndependence(
  auditId: string, client?: Db
): Promise<Record<string, unknown>> {
  const supabase = await db(client);
  const { data, error } = await supabase.rpc("quality_check_audit_independence", {
    p_audit_id: auditId,
  });
  if (error) throw new Error(fail(error, "No se pudo comprobar la independencia."));
  return (data as Record<string, unknown>) ?? {};
}

export async function decideConflict(
  organizationId: string, conflictId: string,
  input: { status: ConflictStatus; mitigation: string | null },
  client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase.from("quality_audit_conflict_checks").update({
    status: input.status, mitigation: input.mitigation,
    decided_at: new Date().toISOString(),
  }).eq("organization_id", organizationId).eq("id", conflictId);
  if (error) throw new Error(fail(error, "No se pudo registrar la decisión sobre el conflicto."));
}

export async function addAuditee(
  organizationId: string, auditId: string,
  input: {
    personId: string | null; externalName: string | null;
    roleNote: string | null; processId: string | null;
  },
  client?: Db
): Promise<string> {
  const supabase = await db(client);
  const { data, error } = await supabase.from("quality_audit_auditees").insert({
    organization_id: organizationId, audit_id: auditId,
    person_id: input.personId, external_name: input.externalName,
    role_note: input.roleNote, process_id: input.processId,
  }).select("id").single();
  if (error) throw new Error(fail(error, "No se pudo añadir al auditado."));
  return data!.id as string;
}

export async function removeAuditee(
  organizationId: string, auditeeId: string, client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase.from("quality_audit_auditees").delete()
    .eq("organization_id", organizationId).eq("id", auditeeId);
  if (error) throw new Error(fail(error, "No se pudo quitar al auditado."));
}

// --- Agenda y reuniones ---------------------------------------------------

export async function addAgendaItem(
  organizationId: string, auditId: string,
  input: {
    activityKind: string; title: string; scheduledOn: string | null;
    startsAtLabel: string | null; endsAtLabel: string | null;
    location: string | null; processId: string | null;
    responsiblePersonId: string | null; note: string | null;
    positionOrder: number;
  },
  client?: Db
): Promise<string> {
  const supabase = await db(client);
  const { data, error } = await supabase.from("quality_audit_agenda_items").insert({
    organization_id: organizationId, audit_id: auditId,
    activity_kind: input.activityKind, title: input.title,
    scheduled_on: input.scheduledOn, starts_at_label: input.startsAtLabel,
    ends_at_label: input.endsAtLabel, location: input.location,
    process_id: input.processId, responsible_person_id: input.responsiblePersonId,
    note: input.note, position_order: input.positionOrder,
  }).select("id").single();
  if (error) throw new Error(fail(error, "No se pudo añadir la actividad."));
  return data!.id as string;
}

export async function removeAgendaItem(
  organizationId: string, itemId: string, client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase.from("quality_audit_agenda_items").delete()
    .eq("organization_id", organizationId).eq("id", itemId);
  if (error) throw new Error(fail(error, "No se pudo quitar la actividad."));
}

export async function recordMeeting(
  organizationId: string, auditId: string,
  input: {
    meetingKind: "opening" | "closing"; heldOn: string;
    notes: string | null; participants: string[];
  },
  client?: Db
): Promise<string> {
  const supabase = await db(client);
  const { data, error } = await supabase.from("quality_audit_meetings").insert({
    organization_id: organizationId, audit_id: auditId,
    meeting_kind: input.meetingKind, held_on: input.heldOn,
    notes: input.notes, participants: input.participants,
  }).select("id").single();
  if (error) throw new Error(fail(error, "No se pudo registrar la reunión."));
  return data!.id as string;
}

export type MeetingRow = {
  id: string; meetingKind: "opening" | "closing"; heldOn: string;
  notes: string | null; participants: string[];
};

export async function listMeetings(
  organizationId: string, auditId: string, client?: Db
): Promise<MeetingRow[]> {
  const supabase = await db(client);
  const { data, error } = await supabase.from("quality_audit_meetings")
    .select("id, meeting_kind, held_on, notes, participants")
    .eq("organization_id", organizationId).eq("audit_id", auditId)
    .order("held_on", { ascending: true });
  if (error) throw new Error(fail(error, "No se pudieron leer las reuniones."));
  return (data ?? []).map((r) => ({
    id: r.id, meetingKind: r.meeting_kind as "opening" | "closing",
    heldOn: r.held_on, notes: r.notes ?? null,
    participants: Array.isArray(r.participants) ? (r.participants as string[]) : [],
  }));
}

// --- Ejecución: notas, muestras, evidencia --------------------------------

export async function addNote(
  organizationId: string, auditId: string,
  input: {
    noteKind: NoteKind; body: string; processId: string | null;
    agendaItemId: string | null; recordedOn: string; isRestricted: boolean;
  },
  client?: Db
): Promise<string> {
  const supabase = await db(client);
  const { data, error } = await supabase.from("quality_audit_notes").insert({
    organization_id: organizationId, audit_id: auditId,
    note_kind: input.noteKind, body: input.body, process_id: input.processId,
    agenda_item_id: input.agendaItemId, recorded_on: input.recordedOn,
    is_restricted: input.isRestricted,
  }).select("id").single();
  if (error) throw new Error(fail(error, "No se pudo registrar la nota."));
  return data!.id as string;
}

export async function addSample(
  organizationId: string, auditId: string,
  input: {
    description: string; populationNote: string | null;
    populationSize: number | null; sampleSize: number;
    selectionMethod: string | null; processId: string | null; note: string | null;
  },
  client?: Db
): Promise<string> {
  const supabase = await db(client);
  const { data, error } = await supabase.from("quality_audit_samples").insert({
    organization_id: organizationId, audit_id: auditId,
    description: input.description, population_note: input.populationNote,
    population_size: input.populationSize, sample_size: input.sampleSize,
    selection_method: input.selectionMethod, process_id: input.processId,
    note: input.note,
  }).select("id").single();
  if (error) throw new Error(fail(error, "No se pudo registrar la muestra."));
  return data!.id as string;
}

export async function addEvidence(
  organizationId: string, auditId: string,
  input: {
    evidenceKind: EvidenceKind; description: string;
    documentId: string | null; documentRevisionId: string | null;
    processId: string | null; indicatorId: string | null;
    measurementId: string | null; supplierEvaluationId: string | null;
    riskId: string | null; caseId: string | null;
    externalEvidenceId: string | null; sampleId: string | null;
    collectedOn: string; note: string | null;
  },
  client?: Db
): Promise<string> {
  const supabase = await db(client);
  const { data, error } = await supabase.from("quality_audit_evidence").insert({
    organization_id: organizationId, audit_id: auditId,
    evidence_kind: input.evidenceKind, description: input.description,
    document_id: input.documentId, document_revision_id: input.documentRevisionId,
    process_id: input.processId, indicator_id: input.indicatorId,
    measurement_id: input.measurementId,
    supplier_evaluation_id: input.supplierEvaluationId,
    risk_id: input.riskId, case_id: input.caseId,
    external_evidence_id: input.externalEvidenceId, sample_id: input.sampleId,
    collected_on: input.collectedOn, note: input.note,
  }).select("id").single();
  if (error) throw new Error(fail(error, "No se pudo registrar la evidencia."));
  return data!.id as string;
}

export async function removeEvidence(
  organizationId: string, evidenceId: string, client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase.from("quality_audit_evidence").delete()
    .eq("organization_id", organizationId).eq("id", evidenceId);
  if (error) throw new Error(fail(error, "No se pudo quitar la evidencia."));
}

// --- Checklists ------------------------------------------------------------

export async function createChecklist(
  organizationId: string,
  input: { code: string | null; name: string; description: string | null },
  client?: Db
): Promise<{ checklistId: string; versionId: string }> {
  const supabase = await db(client);
  const { data, error } = await supabase.from("quality_audit_checklists").insert({
    organization_id: organizationId, code: input.code,
    name: input.name, description: input.description,
  }).select("id").single();
  if (error) throw new Error(fail(error, "No se pudo crear el checklist."));

  const version = await supabase.from("quality_audit_checklist_versions").insert({
    organization_id: organizationId, checklist_id: data!.id, version_number: 1,
  }).select("id").single();
  if (version.error) {
    throw new Error(fail(version.error, "No se pudo crear la primera versión."));
  }
  return { checklistId: data!.id as string, versionId: version.data!.id as string };
}

/** AR-06 · Una versión publicada no se edita: se crea la siguiente. */
export async function createChecklistVersion(
  organizationId: string, checklistId: string, changeNote: string | null, client?: Db
): Promise<string> {
  const supabase = await db(client);
  const { data: versions, error: readError } = await supabase
    .from("quality_audit_checklist_versions")
    .select("id, version_number")
    .eq("organization_id", organizationId).eq("checklist_id", checklistId)
    .order("version_number", { ascending: false }).limit(1);
  if (readError) throw new Error(fail(readError, "No se pudieron leer las versiones."));
  const next = (versions?.[0]?.version_number ?? 0) + 1;

  const { data, error } = await supabase.from("quality_audit_checklist_versions").insert({
    organization_id: organizationId, checklist_id: checklistId,
    version_number: next, change_note: changeNote,
  }).select("id").single();
  if (error) throw new Error(fail(error, "No se pudo crear la versión."));

  // La versión nueva arranca con las preguntas de la anterior. Las claves
  // estables se conservan: es lo que permite comparar entre versiones.
  const previous = versions?.[0]?.id as string | undefined;
  if (previous) {
    const { data: items } = await supabase.from("quality_audit_checklist_items")
      .select("stable_key, position_order, prompt, guidance, requirement_id, document_id, criterion_text")
      .eq("organization_id", organizationId).eq("version_id", previous);
    if (items && items.length > 0) {
      await supabase.from("quality_audit_checklist_items").insert(
        items.map((i) => ({
          organization_id: organizationId, version_id: data!.id,
          stable_key: i.stable_key, position_order: i.position_order,
          prompt: i.prompt, guidance: i.guidance ?? null,
          requirement_id: i.requirement_id ?? null,
          document_id: i.document_id ?? null,
          criterion_text: i.criterion_text ?? null,
        }))
      );
    }
  }
  return data!.id as string;
}

export async function addChecklistItem(
  organizationId: string, versionId: string,
  input: {
    stableKey: string; positionOrder: number; prompt: string;
    guidance: string | null; requirementId: string | null;
    documentId: string | null; criterionText: string | null;
  },
  client?: Db
): Promise<string> {
  const supabase = await db(client);
  const { data, error } = await supabase.from("quality_audit_checklist_items").insert({
    organization_id: organizationId, version_id: versionId,
    stable_key: input.stableKey, position_order: input.positionOrder,
    prompt: input.prompt, guidance: input.guidance,
    requirement_id: input.requirementId, document_id: input.documentId,
    criterion_text: input.criterionText,
  }).select("id").single();
  if (error) throw new Error(fail(error, "No se pudo añadir la pregunta."));
  return data!.id as string;
}

export async function removeChecklistItem(
  organizationId: string, itemId: string, client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase.from("quality_audit_checklist_items").delete()
    .eq("organization_id", organizationId).eq("id", itemId);
  if (error) throw new Error(fail(error, "No se pudo quitar la pregunta."));
}

export async function publishChecklistVersion(
  versionId: string, effectiveFrom: string, changeNote: string | null, client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase.rpc("quality_publish_checklist_version", {
    p_version_id: versionId, p_effective_from: effectiveFrom,
    p_change_note: changeNote,
  });
  if (error) throw new Error(fail(error, "No se pudo publicar la versión."));
}

/** AR-06 · Una auditoría corre una versión PUBLICADA, no «el checklist». */
export async function startChecklistRun(
  organizationId: string, auditId: string, checklistId: string, versionId: string,
  client?: Db
): Promise<string> {
  const supabase = await db(client);
  const { data, error } = await supabase.from("quality_audit_checklist_runs").insert({
    organization_id: organizationId, audit_id: auditId,
    checklist_id: checklistId, version_id: versionId,
  }).select("id").single();
  if (error) throw new Error(fail(error, "No se pudo iniciar el recorrido del checklist."));
  return data!.id as string;
}

/** AR-15 · Marcar una respuesta NO crea hallazgo. Nunca. */
export async function recordCheckResult(
  organizationId: string, runId: string, itemId: string,
  outcome: CheckOutcome, note: string | null, client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { data: existing } = await supabase.from("quality_audit_check_results")
    .select("id").eq("organization_id", organizationId)
    .eq("run_id", runId).eq("item_id", itemId).maybeSingle();

  const { error } = existing
    ? await supabase.from("quality_audit_check_results")
        .update({ outcome, note }).eq("organization_id", organizationId)
        .eq("id", existing.id)
    : await supabase.from("quality_audit_check_results").insert({
        organization_id: organizationId, run_id: runId, item_id: itemId,
        outcome, note,
      });
  if (error) throw new Error(fail(error, "No se pudo registrar la respuesta."));
}

// --- Hallazgos -------------------------------------------------------------

/**
 * AR-13 · Registrar un hallazgo NO crea una No Conformidad, ni siquiera cuando
 * el auditor propone «posible no conformidad». Es una PROPUESTA.
 */
export async function recordFinding(
  organizationId: string, auditId: string,
  input: {
    code: string; criterionId: string | null; checkResultId: string | null;
    processId: string | null; statement: string; detail: string | null;
    locationText: string | null;
    proposedClassification: FindingClassification;
    proposedSeverity: FindingSeverity | null; raisedOn: string;
  },
  client?: Db
): Promise<string> {
  const supabase = await db(client);
  const { data, error } = await supabase.from("quality_audit_findings").insert({
    organization_id: organizationId, audit_id: auditId, code: input.code,
    criterion_id: input.criterionId, check_result_id: input.checkResultId,
    process_id: input.processId, statement: input.statement,
    detail: input.detail, location_text: input.locationText,
    proposed_classification: input.proposedClassification,
    proposed_severity: input.proposedSeverity, raised_on: input.raisedOn,
  }).select("id").single();
  if (error) throw new Error(fail(error, "No se pudo registrar el hallazgo."));
  return data!.id as string;
}

export async function updateFinding(
  organizationId: string, findingId: string,
  input: {
    statement: string; detail: string | null; locationText: string | null;
    proposedClassification: FindingClassification;
    proposedSeverity: FindingSeverity | null;
    criterionId: string | null; processId: string | null;
  },
  client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase.from("quality_audit_findings").update({
    statement: input.statement, detail: input.detail,
    location_text: input.locationText,
    proposed_classification: input.proposedClassification,
    proposed_severity: input.proposedSeverity,
    criterion_id: input.criterionId, process_id: input.processId,
  }).eq("organization_id", organizationId).eq("id", findingId);
  if (error) throw new Error(fail(error, "No se pudo actualizar el hallazgo."));
}

export async function linkFindingEvidence(
  organizationId: string, findingId: string, evidenceId: string,
  note: string | null, client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase.from("quality_audit_finding_evidence").insert({
    organization_id: organizationId, finding_id: findingId,
    evidence_id: evidenceId, note,
  });
  if (error) throw new Error(fail(error, "No se pudo vincular la evidencia al hallazgo."));
}

export async function unlinkFindingEvidence(
  organizationId: string, linkId: string, client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase.from("quality_audit_finding_evidence").delete()
    .eq("organization_id", organizationId).eq("id", linkId);
  if (error) throw new Error(fail(error, "No se pudo desvincular la evidencia."));
}

/** AR-14 · Evaluar es un ACTO de quien tiene autoridad, no un cálculo. */
export async function evaluateFinding(
  findingId: string, status: FindingEvaluationStatus, note: string, client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase.rpc("quality_evaluate_audit_finding", {
    p_finding_id: findingId, p_status: status, p_note: note,
  });
  if (error) throw new Error(fail(error, "No se pudo evaluar el hallazgo."));
}

/** AR-14 · La escalada explícita: aquí —y solo aquí— nace el caso. */
export async function openCaseFromFinding(
  findingId: string, title: string | null, description: string | null, client?: Db
): Promise<string> {
  const supabase = await db(client);
  const { data, error } = await supabase.rpc("quality_open_case_from_audit_finding", {
    p_finding_id: findingId, p_title: title, p_description: description,
  });
  if (error) throw new Error(fail(error, "No se pudo abrir el caso desde el hallazgo."));
  return data as string;
}

// --- Informe y cierre ------------------------------------------------------

export async function issueReport(
  auditId: string, summary: string | null, client?: Db
): Promise<string> {
  const supabase = await db(client);
  const { data, error } = await supabase.rpc("quality_issue_audit_report", {
    p_audit_id: auditId, p_summary: summary,
  });
  if (error) throw new Error(fail(error, "No se pudo emitir el informe."));
  return data as string;
}

/** AR-19 · Cerrar la auditoría NO cierra las acciones que abrió. */
export async function closeAudit(
  auditId: string, closureNote: string, followUpNote: string | null, client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase.rpc("quality_close_audit", {
    p_audit_id: auditId, p_closure_note: closureNote,
    p_followup_note: followUpNote,
  });
  if (error) throw new Error(fail(error, "No se pudo cerrar la auditoría."));
}

export async function scanAudits(
  organizationId: string, client?: Db
): Promise<number> {
  const supabase = await db(client);
  const { data, error } = await supabase.rpc("quality_scan_audits", {
    p_organization_id: organizationId,
  });
  if (error) throw new Error(fail(error, "No se pudo ejecutar el barrido de auditorías."));
  return Number(data ?? 0);
}
