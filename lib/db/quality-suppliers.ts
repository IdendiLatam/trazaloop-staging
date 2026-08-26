import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";
import type {
  ApprovalDecision, CriterionMethod, ExternalPartyRole, IncidentKind, IncidentSeverity,
  PartyStatus, RelationshipStatus, RequirementEnforcement, RequirementKind, ResultOutcome,
  ScoringRule, SupplierEvaluationKind, SupplierEvaluationStatus, SupplierSignalKind,
  SupplierSourceModule,
} from "@/lib/domain/quality-suppliers";

/**
 * Trazaloop · QUALITY-07 · Lectura y escritura de proveedores.
 *
 * TRES DECISIONES QUE EXPLICAN CÓMO ESTÁ ESCRITO ESTE ARCHIVO
 *
 * 1 · Lo que crea HISTORIA pasa por una RPC de 0125: incorporar un proveedor de
 *     otro módulo, clasificar criticidad, publicar una plantilla, cerrar una
 *     evaluación, decidir una aprobación y abrir un caso desde un incidente.
 *     Todos comprueban rol, estado e invariante en el MISMO acto en que
 *     registran. Lo demás es escritura normal bajo RLS.
 *
 * 2 · Las relaciones se resuelven con consultas separadas y se cruzan en
 *     memoria. Las FK de este esquema son COMPUESTAS `(organization_id, id)`
 *     (MDR-42), y un `tabla:columna_id(...)` de PostgREST no las resuelve:
 *     devuelve el error dentro de `error`, no de `data`, así que un
 *     `(data ?? [])` lo convierte en una lista vacía silenciosa. Ya ocurrió en
 *     QUALITY-04 y dejó tablas enteras en blanco sin que nadie lo notara.
 *
 * 3 · Nunca `service_role`. Se opera con la sesión del usuario y decide RLS. El
 *     cliente inyectable de las firmas es para que la suite contra base real
 *     ejercite ESTE código, no una copia.
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

// ===========================================================================
// Identidad externa
// ===========================================================================

export type ExternalPartyRow = {
  id: string; legalName: string; tradeName: string | null; taxId: string | null;
  country: string | null; city: string | null; website: string | null;
  status: PartyStatus; notes: string | null;
  roles: ExternalPartyRole[];
};

export async function listExternalParties(
  organizationId: string, client?: Db
): Promise<ExternalPartyRow[]> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("quality_external_parties")
    .select("id, legal_name, trade_name, tax_id, country, city, website, status, notes")
    .eq("organization_id", organizationId)
    .order("legal_name");
  if (error) throw new Error(fail(error, "No se pudieron leer las empresas externas."));
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const { data: roles } = await supabase
    .from("quality_external_party_roles")
    .select("party_id, role_code")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .in("party_id", rows.map((r) => r.id as string));

  return rows.map((r) => ({
    id: r.id, legalName: r.legal_name, tradeName: r.trade_name, taxId: r.tax_id,
    country: r.country, city: r.city, website: r.website,
    status: r.status as PartyStatus, notes: r.notes,
    roles: (roles ?? [])
      .filter((x) => x.party_id === r.id)
      .map((x) => x.role_code as ExternalPartyRole),
  }));
}

export type PartySiteRow = {
  id: string; name: string; code: string | null; country: string | null;
  city: string | null; address: string | null; isPrimary: boolean;
  status: "active" | "inactive"; notes: string | null;
};

export async function listPartySites(
  organizationId: string, partyId: string, client?: Db
): Promise<PartySiteRow[]> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("quality_external_party_sites")
    .select("id, name, code, country, city, address, is_primary, status, notes")
    .eq("organization_id", organizationId)
    .eq("party_id", partyId)
    .order("is_primary", { ascending: false })
    .order("name");
  if (error) throw new Error(fail(error, "No se pudieron leer las sedes."));
  return (data ?? []).map((s) => ({
    id: s.id, name: s.name, code: s.code, country: s.country, city: s.city,
    address: s.address, isPrimary: Boolean(s.is_primary),
    status: s.status as "active" | "inactive", notes: s.notes,
  }));
}

export type PartyContactRow = {
  id: string; fullName: string; roleTitle: string | null; email: string | null;
  phone: string | null; siteId: string | null; isPrimary: boolean;
};

export async function listPartyContacts(
  organizationId: string, partyId: string, client?: Db
): Promise<PartyContactRow[]> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("quality_external_party_contacts")
    .select("id, full_name, role_title, email, phone, site_id, is_primary")
    .eq("organization_id", organizationId)
    .eq("party_id", partyId)
    .order("is_primary", { ascending: false })
    .order("full_name");
  if (error) throw new Error(fail(error, "No se pudieron leer los contactos."));
  return (data ?? []).map((c) => ({
    id: c.id, fullName: c.full_name, roleTitle: c.role_title, email: c.email,
    phone: c.phone, siteId: c.site_id, isPrimary: Boolean(c.is_primary),
  }));
}

// ===========================================================================
// Proveedores · listado y ficha
// ===========================================================================

export type SupplierOverviewRow = {
  profileId: string; partyId: string;
  legalName: string; tradeName: string | null; taxId: string | null;
  country: string | null; city: string | null;
  partyStatus: PartyStatus; relationshipStatus: RelationshipStatus;
  ownerPositionId: string | null; ownerPositionName: string | null;
  reevaluationMonths: number;
  nextReviewOn: string | null; lastEvaluatedOn: string | null;
  reevaluationOverdue: boolean;
  scopeCount: number; approvedScopeCount: number; expiredApprovalCount: number;
  maxCriticalityScore: number | null; topCriticalityLabel: string | null;
  expiringDocumentCount: number; openIncidentCount: number;
  cprSupplierId: string | null; textileSupplierId: string | null;
};

export async function listSupplierOverview(
  organizationId: string,
  filters: {
    status?: string; categoryId?: string; criticality?: string;
    approval?: "approved" | "not_approved"; review?: "overdue" | "soon"; search?: string;
  } = {},
  client?: Db
): Promise<SupplierOverviewRow[]> {
  const supabase = await db(client);
  let q = supabase
    .from("v_quality_supplier_overview")
    .select(`profile_id, party_id, legal_name, trade_name, tax_id, country, city,
             party_status, relationship_status, owner_position_id, owner_position_name,
             reevaluation_months, next_review_on, last_evaluated_on, reevaluation_overdue,
             scope_count, approved_scope_count, expired_approval_count,
             max_criticality_score, top_criticality_label,
             expiring_document_count, open_incident_count,
             cpr_supplier_id, textile_supplier_id`)
    .eq("organization_id", organizationId);
  if (filters.status) q = q.eq("relationship_status", filters.status);
  if (filters.search) q = q.ilike("legal_name", `%${filters.search}%`);
  if (filters.review === "overdue") q = q.eq("reevaluation_overdue", true);
  const { data, error } = await q.order("legal_name");
  if (error) throw new Error(fail(error, "No se pudieron leer los proveedores."));

  let rows = (data ?? []).map(mapOverview);

  // §43 · Los filtros que dependen de los alcances se resuelven en memoria: la
  // vista ya trae los agregados y filtrarlos en SQL habría exigido repetir los
  // laterales en la consulta.
  if (filters.approval === "approved") rows = rows.filter((r) => r.approvedScopeCount > 0);
  if (filters.approval === "not_approved") rows = rows.filter((r) => r.approvedScopeCount === 0);
  if (filters.criticality) {
    rows = rows.filter((r) => (r.topCriticalityLabel ?? "") === filters.criticality);
  }
  if (filters.categoryId) {
    const { data: asg } = await supabase
      .from("quality_supplier_category_assignments")
      .select("profile_id")
      .eq("organization_id", organizationId)
      .eq("category_id", filters.categoryId);
    const ids = new Set((asg ?? []).map((a) => a.profile_id as string));
    rows = rows.filter((r) => ids.has(r.profileId));
  }
  return rows;
}

function mapOverview(r: Record<string, unknown>): SupplierOverviewRow {
  const v = r as Record<string, never> as Record<string, string | number | boolean | null>;
  return {
    profileId: v.profile_id as string, partyId: v.party_id as string,
    legalName: v.legal_name as string, tradeName: v.trade_name as string | null,
    taxId: v.tax_id as string | null, country: v.country as string | null,
    city: v.city as string | null,
    partyStatus: v.party_status as PartyStatus,
    relationshipStatus: v.relationship_status as RelationshipStatus,
    ownerPositionId: v.owner_position_id as string | null,
    ownerPositionName: v.owner_position_name as string | null,
    reevaluationMonths: Number(v.reevaluation_months ?? 12),
    nextReviewOn: v.next_review_on as string | null,
    lastEvaluatedOn: v.last_evaluated_on as string | null,
    reevaluationOverdue: Boolean(v.reevaluation_overdue),
    scopeCount: Number(v.scope_count ?? 0),
    approvedScopeCount: Number(v.approved_scope_count ?? 0),
    expiredApprovalCount: Number(v.expired_approval_count ?? 0),
    maxCriticalityScore: v.max_criticality_score === null ? null : Number(v.max_criticality_score),
    topCriticalityLabel: v.top_criticality_label as string | null,
    expiringDocumentCount: Number(v.expiring_document_count ?? 0),
    openIncidentCount: Number(v.open_incident_count ?? 0),
    cprSupplierId: v.cpr_supplier_id as string | null,
    textileSupplierId: v.textile_supplier_id as string | null,
  };
}

export type ScopeStatusRow = {
  scopeId: string; profileId: string;
  siteId: string | null; siteName: string | null;
  categoryId: string | null; categoryName: string | null;
  decisionId: string | null; decision: ApprovalDecision | null;
  decisionFrom: string | null; decisionValidUntil: string | null;
  conditions: string | null;
  isApprovedNow: boolean; approvalExpired: boolean;
  criticalityLabel: string | null; criticalityScore: number | null;
  criticalityReviewMonths: number | null; criticalityAssessedOn: string | null;
  lastEvaluationId: string | null; lastEvaluatedOn: string | null;
  lastScore: number | null; lastResultBand: string | null;
};

export async function listScopeStatus(
  organizationId: string, profileId: string, client?: Db
): Promise<ScopeStatusRow[]> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("v_quality_supplier_scope_status")
    .select(`scope_id, profile_id, site_id, site_name, category_id, category_name,
             decision_id, decision, decision_from, decision_valid_until, conditions,
             is_approved_now, approval_expired, criticality_label, criticality_score,
             criticality_review_months, criticality_assessed_on,
             last_evaluation_id, last_evaluated_on, last_score, last_result_band`)
    .eq("organization_id", organizationId)
    .eq("profile_id", profileId);
  if (error) throw new Error(fail(error, "No se pudieron leer los alcances."));
  return (data ?? []).map((s) => ({
    scopeId: s.scope_id, profileId: s.profile_id,
    siteId: s.site_id, siteName: s.site_name,
    categoryId: s.category_id, categoryName: s.category_name,
    decisionId: s.decision_id, decision: s.decision as ApprovalDecision | null,
    decisionFrom: s.decision_from, decisionValidUntil: s.decision_valid_until,
    conditions: s.conditions,
    isApprovedNow: Boolean(s.is_approved_now), approvalExpired: Boolean(s.approval_expired),
    criticalityLabel: s.criticality_label,
    criticalityScore: s.criticality_score === null ? null : Number(s.criticality_score),
    criticalityReviewMonths: s.criticality_review_months === null
      ? null : Number(s.criticality_review_months),
    criticalityAssessedOn: s.criticality_assessed_on,
    lastEvaluationId: s.last_evaluation_id, lastEvaluatedOn: s.last_evaluated_on,
    lastScore: s.last_score === null ? null : Number(s.last_score),
    lastResultBand: s.last_result_band,
  }));
}

export type SupplierEvaluationRow = {
  id: string; scopeId: string; versionId: string;
  templateName: string | null; versionNumber: number | null;
  kind: SupplierEvaluationKind; triggerReason: string | null;
  periodLabel: string | null; periodStart: string | null; periodEnd: string | null;
  evaluatedOn: string | null; status: SupplierEvaluationStatus;
  score: number | null; resultBand: string | null;
  criteriaTotal: number; criteriaScored: number;
  criteriaNotApplicable: number; criteriaUnavailable: number; criteriaNotEvaluated: number;
  summary: string | null;
};

export async function listSupplierEvaluations(
  organizationId: string,
  scope: { profileId?: string; scopeId?: string; status?: string } = {},
  client?: Db
): Promise<SupplierEvaluationRow[]> {
  const supabase = await db(client);
  let scopeIds: string[] | null = null;
  if (scope.profileId) {
    const { data: scopes } = await supabase
      .from("quality_supplier_scopes").select("id")
      .eq("organization_id", organizationId).eq("profile_id", scope.profileId);
    scopeIds = (scopes ?? []).map((s) => s.id as string);
    if (scopeIds.length === 0) return [];
  }

  let q = supabase
    .from("quality_supplier_evaluations")
    .select(`id, scope_id, version_id, evaluation_kind, trigger_reason, period_label,
             period_start, period_end, evaluated_on, status, score, result_band,
             criteria_total, criteria_scored, criteria_not_applicable,
             criteria_unavailable, criteria_not_evaluated, summary`)
    .eq("organization_id", organizationId);
  if (scope.scopeId) q = q.eq("scope_id", scope.scopeId);
  else if (scopeIds) q = q.in("scope_id", scopeIds);
  if (scope.status) q = q.eq("status", scope.status);
  const { data, error } = await q.order("evaluated_on", { ascending: false, nullsFirst: false });
  if (error) throw new Error(fail(error, "No se pudieron leer las evaluaciones."));
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const { data: versions } = await supabase
    .from("quality_supplier_template_versions")
    .select("id, template_id, version_number")
    .eq("organization_id", organizationId)
    .in("id", [...new Set(rows.map((r) => r.version_id as string))]);
  const { data: templates } = await supabase
    .from("quality_supplier_evaluation_templates")
    .select("id, name")
    .eq("organization_id", organizationId);

  return rows.map((r) => {
    const v = (versions ?? []).find((x) => x.id === r.version_id);
    const t = (templates ?? []).find((x) => x.id === v?.template_id);
    return {
      id: r.id, scopeId: r.scope_id, versionId: r.version_id,
      templateName: (t?.name as string | null) ?? null,
      versionNumber: v ? Number(v.version_number) : null,
      kind: r.evaluation_kind as SupplierEvaluationKind,
      triggerReason: r.trigger_reason,
      periodLabel: r.period_label, periodStart: r.period_start, periodEnd: r.period_end,
      evaluatedOn: r.evaluated_on, status: r.status as SupplierEvaluationStatus,
      score: r.score === null ? null : Number(r.score),
      resultBand: r.result_band,
      criteriaTotal: Number(r.criteria_total ?? 0),
      criteriaScored: Number(r.criteria_scored ?? 0),
      criteriaNotApplicable: Number(r.criteria_not_applicable ?? 0),
      criteriaUnavailable: Number(r.criteria_unavailable ?? 0),
      criteriaNotEvaluated: Number(r.criteria_not_evaluated ?? 0),
      summary: r.summary,
    };
  });
}

export type EvaluationResultRow = {
  id: string; criterionId: string; code: string; label: string;
  weight: number; maxPoints: number; method: CriterionMethod;
  evidenceExpectation: string | null;
  outcome: ResultOutcome; points: number | null; observation: string | null;
  supplierDocumentId: string | null; trazadocDocumentId: string | null;
};

/**
 * El detalle de una evaluación, con SUS criterios: los de la versión con la que
 * se hizo, no los de la plantilla de hoy (GP-15, §66).
 */
export async function getSupplierEvaluation(
  organizationId: string, evaluationId: string, client?: Db
): Promise<{ evaluation: SupplierEvaluationRow; results: EvaluationResultRow[];
             scoringRule: ScoringRule; bands: unknown } | null> {
  const supabase = await db(client);
  const evals = await listSupplierEvaluations(organizationId, {}, supabase);
  const evaluation = evals.find((e) => e.id === evaluationId);
  if (!evaluation) return null;

  const { data: version } = await supabase
    .from("quality_supplier_template_versions")
    .select("scoring_rule, bands")
    .eq("organization_id", organizationId).eq("id", evaluation.versionId).maybeSingle();

  const { data: criteria } = await supabase
    .from("quality_supplier_evaluation_criteria")
    .select("id, code, label, weight, max_points, evaluation_method, evidence_expectation, position_order")
    .eq("organization_id", organizationId)
    .eq("version_id", evaluation.versionId)
    .order("position_order");

  const { data: results } = await supabase
    .from("quality_supplier_evaluation_results")
    .select("id, criterion_id, outcome, points, observation, supplier_document_id, trazadoc_document_id")
    .eq("organization_id", organizationId)
    .eq("evaluation_id", evaluationId);

  return {
    evaluation,
    scoringRule: (version?.scoring_rule as ScoringRule) ?? "weighted_average",
    bands: version?.bands ?? null,
    // Se recorren los CRITERIOS, no los resultados: un criterio sin fila es
    // «sin evaluar», y si se recorrieran los resultados desaparecería del papel.
    results: (criteria ?? []).map((c) => {
      const r = (results ?? []).find((x) => x.criterion_id === c.id);
      return {
        id: (r?.id as string) ?? "",
        criterionId: c.id as string, code: c.code as string, label: c.label as string,
        weight: Number(c.weight), maxPoints: Number(c.max_points),
        method: c.evaluation_method as CriterionMethod,
        evidenceExpectation: c.evidence_expectation as string | null,
        outcome: (r?.outcome as ResultOutcome) ?? "not_evaluated",
        points: r?.points === null || r?.points === undefined ? null : Number(r.points),
        observation: (r?.observation as string | null) ?? null,
        supplierDocumentId: (r?.supplier_document_id as string | null) ?? null,
        trazadocDocumentId: (r?.trazadoc_document_id as string | null) ?? null,
      };
    }),
  };
}

export type SupplierDocumentRow = {
  id: string; kind: string; title: string; issuer: string | null;
  referenceCode: string | null; issuedOn: string | null; expiresOn: string | null;
  status: "valid" | "expired" | "revoked" | "pending";
  scopeId: string | null; requirementId: string | null; trazadocDocumentId: string | null;
};

export async function listSupplierDocuments(
  organizationId: string, profileId: string, client?: Db
): Promise<SupplierDocumentRow[]> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("quality_supplier_documents")
    .select(`id, document_kind, title, issuer, reference_code, issued_on, expires_on,
             status, scope_id, requirement_id, trazadoc_document_id`)
    .eq("organization_id", organizationId)
    .eq("profile_id", profileId)
    .order("expires_on", { ascending: true, nullsFirst: false });
  if (error) throw new Error(fail(error, "No se pudieron leer los documentos."));
  return (data ?? []).map((d) => ({
    id: d.id, kind: d.document_kind, title: d.title, issuer: d.issuer,
    referenceCode: d.reference_code, issuedOn: d.issued_on, expiresOn: d.expires_on,
    status: d.status as SupplierDocumentRow["status"],
    scopeId: d.scope_id, requirementId: d.requirement_id,
    trazadocDocumentId: d.trazadoc_document_id,
  }));
}

export type SupplierIncidentRow = {
  id: string; kind: IncidentKind; severity: IncidentSeverity;
  occurredOn: string; title: string; description: string | null;
  isDataIssue: boolean; status: string; caseId: string | null; scopeId: string | null;
};

export async function listSupplierIncidents(
  organizationId: string, profileId: string, client?: Db
): Promise<SupplierIncidentRow[]> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("quality_supplier_incidents")
    .select(`id, incident_kind, severity, occurred_on, title, description,
             is_data_issue, status, case_id, scope_id`)
    .eq("organization_id", organizationId)
    .eq("profile_id", profileId)
    .order("occurred_on", { ascending: false });
  if (error) throw new Error(fail(error, "No se pudieron leer los incidentes."));
  return (data ?? []).map((i) => ({
    id: i.id, kind: i.incident_kind as IncidentKind,
    severity: i.severity as IncidentSeverity, occurredOn: i.occurred_on,
    title: i.title, description: i.description,
    isDataIssue: Boolean(i.is_data_issue), status: i.status,
    caseId: i.case_id, scopeId: i.scope_id,
  }));
}

export type SupplierSignalRow = {
  id: string; kind: SupplierSignalKind; detail: string | null;
  status: "open" | "resolved" | "dismissed"; scopeId: string | null;
  caseId: string | null; firstSeenAt: string; lastSeenAt: string;
};

export async function listSupplierSignals(
  organizationId: string, profileId: string, client?: Db
): Promise<SupplierSignalRow[]> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("quality_supplier_signals")
    .select("id, signal_kind, detail, status, scope_id, case_id, first_seen_at, last_seen_at")
    .eq("organization_id", organizationId)
    .eq("profile_id", profileId)
    .order("last_seen_at", { ascending: false });
  if (error) throw new Error(fail(error, "No se pudieron leer las señales."));
  return (data ?? []).map((s) => ({
    id: s.id, kind: s.signal_kind as SupplierSignalKind, detail: s.detail,
    status: s.status as SupplierSignalRow["status"], scopeId: s.scope_id,
    caseId: s.case_id, firstSeenAt: s.first_seen_at, lastSeenAt: s.last_seen_at,
  }));
}

export type SupplierFile = {
  overview: SupplierOverviewRow;
  sites: PartySiteRow[];
  contacts: PartyContactRow[];
  categories: { assignmentId: string; categoryId: string; categoryName: string;
                siteId: string | null; siteName: string | null; sinceOn: string;
                untilOn: string | null }[];
  scopes: ScopeStatusRow[];
  evaluations: SupplierEvaluationRow[];
  documents: SupplierDocumentRow[];
  incidents: SupplierIncidentRow[];
  signals: SupplierSignalRow[];
  decisions: {
    id: string; scopeId: string; decision: ApprovalDecision; rationale: string;
    conditions: string | null; effectiveFrom: string; validUntil: string | null;
    decidedAt: string; supersededBy: string | null;
  }[];
};

/** §41 · La ficha 360. Todo se lee con la sesión: lo que RLS no entregue,
 *  sencillamente no aparece. */
export async function getSupplierFile(
  organizationId: string, profileId: string, client?: Db
): Promise<SupplierFile | null> {
  const supabase = await db(client);
  const all = await listSupplierOverview(organizationId, {}, supabase);
  const overview = all.find((s) => s.profileId === profileId);
  if (!overview) return null;

  const [sites, contacts, scopes, evaluations, documents, incidents, signals] = await Promise.all([
    listPartySites(organizationId, overview.partyId, supabase),
    listPartyContacts(organizationId, overview.partyId, supabase),
    listScopeStatus(organizationId, profileId, supabase),
    listSupplierEvaluations(organizationId, { profileId }, supabase),
    listSupplierDocuments(organizationId, profileId, supabase),
    listSupplierIncidents(organizationId, profileId, supabase),
    listSupplierSignals(organizationId, profileId, supabase),
  ]);

  const { data: asg } = await supabase
    .from("quality_supplier_category_assignments")
    .select("id, category_id, site_id, since_on, until_on")
    .eq("organization_id", organizationId).eq("profile_id", profileId);
  const { data: cats } = await supabase
    .from("quality_supplier_categories").select("id, name")
    .eq("organization_id", organizationId);

  const scopeIds = scopes.map((s) => s.scopeId);
  const { data: decisions } = scopeIds.length > 0
    ? await supabase.from("quality_supplier_approval_decisions")
        .select("id, scope_id, decision, rationale, conditions, effective_from, valid_until, decided_at, superseded_by")
        .eq("organization_id", organizationId).in("scope_id", scopeIds)
        .order("effective_from", { ascending: false })
    : { data: [] };

  return {
    overview, sites, contacts, scopes, evaluations, documents, incidents, signals,
    categories: (asg ?? []).map((a) => ({
      assignmentId: a.id as string, categoryId: a.category_id as string,
      categoryName: (cats ?? []).find((c) => c.id === a.category_id)?.name as string ?? "—",
      siteId: a.site_id as string | null,
      siteName: sites.find((s) => s.id === a.site_id)?.name ?? null,
      sinceOn: a.since_on as string, untilOn: a.until_on as string | null,
    })),
    decisions: (decisions ?? []).map((d) => ({
      id: d.id as string, scopeId: d.scope_id as string,
      decision: d.decision as ApprovalDecision, rationale: d.rationale as string,
      conditions: d.conditions as string | null,
      effectiveFrom: d.effective_from as string, validUntil: d.valid_until as string | null,
      decidedAt: d.decided_at as string, supersededBy: d.superseded_by as string | null,
    })),
  };
}

// ===========================================================================
// Catálogos
// ===========================================================================

export type SupplierCategoryRow = {
  id: string; code: string | null; name: string; description: string | null; isActive: boolean;
};

export async function listSupplierCategories(
  organizationId: string, client?: Db
): Promise<SupplierCategoryRow[]> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("quality_supplier_categories")
    .select("id, code, name, description, is_active")
    .eq("organization_id", organizationId).order("name");
  if (error) throw new Error(fail(error, "No se pudieron leer las categorías."));
  return (data ?? []).map((c) => ({
    id: c.id, code: c.code, name: c.name, description: c.description,
    isActive: Boolean(c.is_active),
  }));
}

export type SupplierRequirementRow = {
  id: string; code: string | null; title: string; description: string | null;
  kind: RequirementKind; enforcement: RequirementEnforcement;
  trazadocDocumentId: string | null; isActive: boolean;
};

export async function listSupplierRequirements(
  organizationId: string, client?: Db
): Promise<SupplierRequirementRow[]> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("quality_supplier_requirements")
    .select("id, code, title, description, requirement_kind, enforcement, trazadoc_document_id, is_active")
    .eq("organization_id", organizationId).order("title");
  if (error) throw new Error(fail(error, "No se pudieron leer los requisitos."));
  return (data ?? []).map((r) => ({
    id: r.id, code: r.code, title: r.title, description: r.description,
    kind: r.requirement_kind as RequirementKind,
    enforcement: r.enforcement as RequirementEnforcement,
    trazadocDocumentId: r.trazadoc_document_id, isActive: Boolean(r.is_active),
  }));
}

/** Todos los alcances de la empresa, con el nombre del proveedor delante. Es
 *  lo que hace falta para asignar un requisito a un alcance concreto sin tener
 *  que entrar antes en la ficha. */
export type ScopeOption = { scopeId: string; profileId: string; label: string };

export async function listScopeOptions(
  organizationId: string, client?: Db
): Promise<ScopeOption[]> {
  const supabase = await db(client);
  const [scopes, profiles] = await Promise.all([
    supabase.from("v_quality_supplier_scope_status")
      .select("scope_id, profile_id, site_name, category_name")
      .eq("organization_id", organizationId),
    supabase.from("v_quality_supplier_overview")
      .select("profile_id, legal_name").eq("organization_id", organizationId),
  ]);
  const name = new Map((profiles.data ?? []).map((p) => [p.profile_id as string, p.legal_name as string]));
  return (scopes.data ?? [])
    .map((sc) => ({
      scopeId: sc.scope_id as string,
      profileId: sc.profile_id as string,
      label: `${name.get(sc.profile_id as string) ?? "Proveedor"} · `
        + [sc.site_name ?? "Todas las sedes", sc.category_name ?? "Todas las categorías"].join(" · "),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "es"));
}

/**
 * Las asignaciones de requisitos, con su periodo. Se leen aparte de los
 * requisitos porque un requisito es una regla y una asignación es una decisión
 * fechada: la regla puede seguir viva mucho después de dejar de aplicarse a una
 * categoría concreta.
 */
export type RequirementAssignmentRow = {
  id: string; requirementId: string; requirementTitle: string;
  categoryId: string | null; categoryName: string | null;
  scopeId: string | null; scopeLabel: string | null;
  effectiveFrom: string; effectiveTo: string | null; note: string | null;
};

export async function listRequirementAssignments(
  organizationId: string, client?: Db
): Promise<RequirementAssignmentRow[]> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("quality_supplier_requirement_assignments")
    .select("id, requirement_id, category_id, scope_id, effective_from, effective_to, note")
    .eq("organization_id", organizationId)
    .order("effective_from", { ascending: false });
  if (error) throw new Error(fail(error, "No se pudieron leer las asignaciones de requisitos."));
  const rows = data ?? [];
  if (rows.length === 0) return [];

  // Los embeds por clave compuesta no resuelven en PostgREST y fallan en
  // silencio: se piden los nombres por separado y se unen aquí.
  const [reqs, cats, scopes] = await Promise.all([
    supabase.from("quality_supplier_requirements").select("id, title")
      .eq("organization_id", organizationId),
    supabase.from("quality_supplier_categories").select("id, name")
      .eq("organization_id", organizationId),
    supabase.from("v_quality_supplier_scope_status")
      .select("scope_id, site_name, category_name").eq("organization_id", organizationId),
  ]);
  const reqName = new Map((reqs.data ?? []).map((r) => [r.id as string, r.title as string]));
  const catName = new Map((cats.data ?? []).map((c) => [c.id as string, c.name as string]));
  const scopeName = new Map((scopes.data ?? []).map((sc) => [
    sc.scope_id as string,
    [sc.site_name ?? "Todas las sedes", sc.category_name ?? "Todas las categorías"].join(" · "),
  ]));

  return rows.map((r) => ({
    id: r.id as string,
    requirementId: r.requirement_id as string,
    requirementTitle: reqName.get(r.requirement_id as string) ?? "Requisito",
    categoryId: (r.category_id as string | null) ?? null,
    categoryName: r.category_id ? (catName.get(r.category_id as string) ?? null) : null,
    scopeId: (r.scope_id as string | null) ?? null,
    scopeLabel: r.scope_id ? (scopeName.get(r.scope_id as string) ?? null) : null,
    effectiveFrom: r.effective_from as string,
    effectiveTo: (r.effective_to as string | null) ?? null,
    note: (r.note as string | null) ?? null,
  }));
}

export type TemplateVersionRow = {
  id: string; versionNumber: number; status: "draft" | "published" | "superseded";
  scoringRule: ScoringRule; bands: unknown; changeNote: string | null;
  effectiveFrom: string | null; effectiveTo: string | null;
  criteria: { id: string; code: string; label: string; weight: number; maxPoints: number;
              method: CriterionMethod; evidenceExpectation: string | null;
              requirementId: string | null; order: number }[];
};

export type SupplierTemplateRow = {
  id: string; code: string | null; name: string; description: string | null;
  isActive: boolean; versions: TemplateVersionRow[];
};

export async function listSupplierTemplates(
  organizationId: string, client?: Db
): Promise<SupplierTemplateRow[]> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("quality_supplier_evaluation_templates")
    .select("id, code, name, description, is_active")
    .eq("organization_id", organizationId).order("name");
  if (error) throw new Error(fail(error, "No se pudieron leer las plantillas."));
  const templates = data ?? [];
  if (templates.length === 0) return [];

  const { data: versions } = await supabase
    .from("quality_supplier_template_versions")
    .select("id, template_id, version_number, status, scoring_rule, bands, change_note, effective_from, effective_to")
    .eq("organization_id", organizationId)
    .in("template_id", templates.map((t) => t.id as string))
    .order("version_number", { ascending: false });

  const versionIds = (versions ?? []).map((v) => v.id as string);
  const { data: criteria } = versionIds.length > 0
    ? await supabase.from("quality_supplier_evaluation_criteria")
        .select("id, version_id, code, label, weight, max_points, evaluation_method, evidence_expectation, requirement_id, position_order")
        .eq("organization_id", organizationId).in("version_id", versionIds).order("position_order")
    : { data: [] };

  return templates.map((t) => ({
    id: t.id, code: t.code, name: t.name, description: t.description,
    isActive: Boolean(t.is_active),
    versions: (versions ?? []).filter((v) => v.template_id === t.id).map((v) => ({
      id: v.id as string, versionNumber: Number(v.version_number),
      status: v.status as TemplateVersionRow["status"],
      scoringRule: v.scoring_rule as ScoringRule, bands: v.bands,
      changeNote: v.change_note as string | null,
      effectiveFrom: v.effective_from as string | null,
      effectiveTo: v.effective_to as string | null,
      criteria: (criteria ?? []).filter((c) => c.version_id === v.id).map((c) => ({
        id: c.id as string, code: c.code as string, label: c.label as string,
        weight: Number(c.weight), maxPoints: Number(c.max_points),
        method: c.evaluation_method as CriterionMethod,
        evidenceExpectation: c.evidence_expectation as string | null,
        requirementId: c.requirement_id as string | null,
        order: Number(c.position_order),
      })),
    })),
  }));
}

/**
 * La clasificación de criticidad VIGENTE de un alcance, con los valores que se
 * eligieron en cada dimensión. Sin los factores el número es indefendible: «3»
 * no explica nada, «impacto alto · sustituibilidad baja» sí.
 */
export type CriticalityDetail = {
  assessmentId: string; scopeId: string; levelLabel: string; score: number;
  reviewMonths: number | null; assessedOn: string; rationale: string | null;
  methodologyName: string | null; versionNumber: number | null;
  factors: { scaleLabel: string; levelLabel: string; value: number }[];
};

export async function getCriticalityDetail(
  organizationId: string, scopeId: string, client?: Db
): Promise<CriticalityDetail | null> {
  const supabase = await db(client);
  const { data: a } = await supabase
    .from("quality_supplier_criticality_assessments")
    .select("id, scope_id, version_id, score, level_label, review_months, assessed_on, rationale")
    .eq("organization_id", organizationId).eq("scope_id", scopeId)
    .order("assessed_on", { ascending: false }).order("created_at", { ascending: false })
    .limit(1).maybeSingle();
  if (!a) return null;

  const [{ data: factors }, { data: version }] = await Promise.all([
    supabase.from("quality_supplier_criticality_factors")
      .select("scale_id, level_id").eq("organization_id", organizationId)
      .eq("assessment_id", a.id),
    supabase.from("quality_risk_methodology_versions")
      .select("version_number, methodology_id").eq("organization_id", organizationId)
      .eq("id", a.version_id).maybeSingle(),
  ]);

  const scaleIds = (factors ?? []).map((f) => f.scale_id as string);
  const levelIds = (factors ?? []).map((f) => f.level_id as string);
  const [{ data: scales }, { data: levels }, { data: methodology }] = await Promise.all([
    scaleIds.length > 0
      ? supabase.from("quality_risk_scales").select("id, label")
          .eq("organization_id", organizationId).in("id", scaleIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    levelIds.length > 0
      ? supabase.from("quality_risk_scale_levels").select("id, label, value")
          .eq("organization_id", organizationId).in("id", levelIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    version?.methodology_id
      ? supabase.from("quality_risk_methodologies").select("name")
          .eq("organization_id", organizationId).eq("id", version.methodology_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return {
    assessmentId: a.id as string, scopeId: a.scope_id as string,
    levelLabel: a.level_label as string, score: Number(a.score),
    reviewMonths: a.review_months === null ? null : Number(a.review_months),
    assessedOn: a.assessed_on as string, rationale: (a.rationale as string | null) ?? null,
    methodologyName: (methodology as { name?: string } | null)?.name ?? null,
    versionNumber: version?.version_number == null ? null : Number(version.version_number),
    factors: (factors ?? []).map((f) => {
      const sc = (scales ?? []).find((x) => x.id === f.scale_id);
      const lv = (levels ?? []).find((x) => x.id === f.level_id);
      return {
        scaleLabel: (sc?.label as string) ?? "Dimensión",
        levelLabel: (lv?.label as string) ?? "—",
        value: lv?.value === undefined ? 0 : Number(lv.value),
      };
    }),
  };
}

/** Una decisión de aprobación concreta. Se lee por su identificador porque el
 *  PDF de la decisión es un acto formal con vida propia: no es «cómo está hoy
 *  el proveedor», es «qué se decidió aquel día y por qué». */
export type ApprovalDecisionDetail = {
  id: string; scopeId: string; profileId: string; supplierName: string; scopeLabel: string;
  decision: ApprovalDecision; rationale: string; conditions: string | null;
  effectiveFrom: string; validUntil: string | null; decidedAt: string;
  decidedByName: string | null; supersededBy: string | null;
  evaluationId: string | null; evaluationScore: number | null; evaluationBand: string | null;
};

export async function getApprovalDecision(
  organizationId: string, decisionId: string, client?: Db
): Promise<ApprovalDecisionDetail | null> {
  const supabase = await db(client);
  const { data: d } = await supabase
    .from("quality_supplier_approval_decisions")
    .select("id, scope_id, decision, rationale, conditions, effective_from, valid_until, decided_at, decided_by, superseded_by, evaluation_id")
    .eq("organization_id", organizationId).eq("id", decisionId).maybeSingle();
  if (!d) return null;

  const scopes = await listScopeOptions(organizationId, supabase);
  const scope = scopes.find((sc) => sc.scopeId === d.scope_id);

  const [{ data: profile }, { data: evaluation }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", d.decided_by ?? "").maybeSingle(),
    d.evaluation_id
      ? supabase.from("quality_supplier_evaluations").select("score, result_band")
          .eq("organization_id", organizationId).eq("id", d.evaluation_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const partes = (scope?.label ?? "").split(" · ");
  return {
    id: d.id as string, scopeId: d.scope_id as string,
    profileId: scope?.profileId ?? "",
    supplierName: partes[0] ?? "Proveedor",
    scopeLabel: partes.slice(1).join(" · ") || "Todo el suministro",
    decision: d.decision as ApprovalDecision, rationale: d.rationale as string,
    conditions: (d.conditions as string | null) ?? null,
    effectiveFrom: d.effective_from as string,
    validUntil: (d.valid_until as string | null) ?? null,
    decidedAt: d.decided_at as string,
    decidedByName: (profile as { full_name?: string } | null)?.full_name ?? null,
    supersededBy: (d.superseded_by as string | null) ?? null,
    evaluationId: (d.evaluation_id as string | null) ?? null,
    evaluationScore: (evaluation as { score?: number } | null)?.score == null
      ? null : Number((evaluation as { score: number }).score),
    evaluationBand: (evaluation as { result_band?: string } | null)?.result_band ?? null,
  };
}

// ===========================================================================
// Verdad histórica (GP-14, §60, §77)
// ===========================================================================

export async function supplierApprovalOn(
  organizationId: string, scopeId: string, on: string, client?: Db
): Promise<{ decisionId: string; decision: ApprovalDecision; effectiveFrom: string;
             validUntil: string | null; conditions: string | null; rationale: string;
             wasValid: boolean } | null> {
  const supabase = await db(client);
  const { data, error } = await supabase.rpc("quality_supplier_approval_on", {
    p_organization_id: organizationId, p_scope_id: scopeId, p_on: on,
  });
  if (error) throw new Error(fail(error, "No se pudo leer la aprobación de esa fecha."));
  const row = (data ?? [])[0];
  if (!row) return null;
  return {
    decisionId: row.decision_id, decision: row.decision as ApprovalDecision,
    effectiveFrom: row.effective_from, validUntil: row.valid_until,
    conditions: row.conditions, rationale: row.rationale, wasValid: Boolean(row.was_valid),
  };
}

export async function supplierCriticalityOn(
  organizationId: string, scopeId: string, on: string, client?: Db
): Promise<{ levelLabel: string; score: number; versionId: string; assessedOn: string } | null> {
  const supabase = await db(client);
  const { data, error } = await supabase.rpc("quality_supplier_criticality_on", {
    p_organization_id: organizationId, p_scope_id: scopeId, p_on: on,
  });
  if (error) throw new Error(fail(error, "No se pudo leer la criticidad de esa fecha."));
  const row = (data ?? [])[0];
  if (!row) return null;
  return {
    levelLabel: row.level_label, score: Number(row.score),
    versionId: row.version_id, assessedOn: row.assessed_on,
  };
}

export async function supplierRequirementsOn(
  organizationId: string, scopeId: string, on: string, client?: Db
): Promise<{ requirementId: string; code: string | null; title: string;
             kind: RequirementKind; enforcement: RequirementEnforcement;
             source: "scope" | "category" }[]> {
  const supabase = await db(client);
  const { data, error } = await supabase.rpc("quality_supplier_requirements_on", {
    p_organization_id: organizationId, p_scope_id: scopeId, p_on: on,
  });
  if (error) throw new Error(fail(error, "No se pudieron leer los requisitos de esa fecha."));
  return (data ?? []).map((r: Record<string, string>) => ({
    requirementId: r.requirement_id, code: r.code, title: r.title,
    kind: r.requirement_kind as RequirementKind,
    enforcement: r.enforcement as RequirementEnforcement,
    source: r.source as "scope" | "category",
  }));
}

// ===========================================================================
// Señales para Quality Home (§44)
// ===========================================================================

export type SupplierSignals = {
  reevaluationOverdue: number;
  approvalsExpired: number;
  criticalWithoutApproval: number;
  documentsExpiring: number;
  openIncidents: number;
};

export async function getSupplierHomeSignals(
  organizationId: string, client?: Db
): Promise<SupplierSignals> {
  const supabase = await db(client);
  const { data } = await supabase
    .from("v_quality_supplier_overview")
    .select("reevaluation_overdue, expired_approval_count, expiring_document_count, open_incident_count")
    .eq("organization_id", organizationId);
  const rows = data ?? [];

  const { data: signals } = await supabase
    .from("quality_supplier_signals")
    .select("signal_kind")
    .eq("organization_id", organizationId)
    .eq("status", "open")
    .eq("signal_kind", "critical_without_approval");

  return {
    reevaluationOverdue: rows.filter((r) => r.reevaluation_overdue).length,
    approvalsExpired: rows.reduce((a, r) => a + Number(r.expired_approval_count ?? 0), 0),
    criticalWithoutApproval: (signals ?? []).length,
    documentsExpiring: rows.reduce((a, r) => a + Number(r.expiring_document_count ?? 0), 0),
    openIncidents: rows.reduce((a, r) => a + Number(r.open_incident_count ?? 0), 0),
  };
}

/** §58 · Proveedores de PCR y Textiles que TODAVÍA no se han incorporado a
 *  Quality. Es la lista que hace posible reutilizar en vez de volver a crear. */
export type AdoptableSupplier = {
  sourceModule: SupplierSourceModule; sourceId: string;
  name: string; taxId: string | null;
};

export async function listAdoptableSuppliers(
  organizationId: string, client?: Db
): Promise<AdoptableSupplier[]> {
  const supabase = await db(client);
  const [{ data: cpr }, { data: tex }] = await Promise.all([
    supabase.from("suppliers").select("id, name, tax_id")
      .eq("organization_id", organizationId).is("external_party_id", null).order("name"),
    supabase.from("textile_suppliers").select("id, name, tax_id")
      .eq("organization_id", organizationId).is("external_party_id", null)
      .eq("is_active", true).order("name"),
  ]);
  return [
    ...(cpr ?? []).map((s) => ({
      sourceModule: "cpr" as const, sourceId: s.id as string,
      name: s.name as string, taxId: s.tax_id as string | null,
    })),
    ...(tex ?? []).map((s) => ({
      sourceModule: "textiles" as const, sourceId: s.id as string,
      name: s.name as string, taxId: s.tax_id as string | null,
    })),
  ];
}

/**
 * §59 · Posibles duplicados: mismo identificador fiscal o mismo nombre. Es una
 * SUGERENCIA y nada más. No hay fusión automática: unir dos empresas es una
 * decisión con consecuencias en tres módulos, y adivinarla sería peor que
 * dejar el duplicado.
 */
export async function suggestDuplicateParties(
  organizationId: string, input: { legalName: string; taxId?: string | null }, client?: Db
): Promise<ExternalPartyRow[]> {
  const supabase = await db(client);
  const candidatos = await listExternalParties(organizationId, supabase);
  const nombre = input.legalName.trim().toLowerCase();
  const nit = (input.taxId ?? "").trim().toLowerCase();
  return candidatos.filter((p) =>
    (nit.length > 0 && (p.taxId ?? "").trim().toLowerCase() === nit)
    || p.legalName.trim().toLowerCase() === nombre);
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// ===========================================================================
// ESCRITURA
// ---------------------------------------------------------------------------
// Lo que solo REGISTRA es escritura normal bajo RLS. Lo que DECIDE —incorporar,
// clasificar, publicar, cerrar, aprobar, escalar— pasa por la RPC de 0125.
// ===========================================================================

export async function createExternalParty(
  organizationId: string,
  input: {
    legalName: string; tradeName: string | null; taxId: string | null;
    country: string | null; city: string | null; website: string | null; notes: string | null;
  },
  client?: Db
): Promise<string> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("quality_external_parties")
    .insert({
      organization_id: organizationId, legal_name: input.legalName,
      trade_name: input.tradeName, tax_id: input.taxId, country: input.country,
      city: input.city, website: input.website, notes: input.notes,
    })
    .select("id").single();
  if (error) throw new Error(fail(error, "No se pudo crear la empresa externa."));
  return data.id as string;
}

/**
 * §57 · Crear un proveedor pide lo MÍNIMO: un nombre. La criticidad, los
 * requisitos, las certificaciones y la evaluación llegan después, cuando hagan
 * falta. Un primer formulario de veinte campos es como se consigue que nadie
 * registre proveedores.
 *
 * Nace con su rol y con su alcance general, que es lo que permite clasificarlo
 * y aprobarlo sin obligar antes a inventar sedes y categorías.
 */
export async function createSupplier(
  organizationId: string,
  input: {
    legalName: string; taxId: string | null; country: string | null; city: string | null;
    ownerPositionId: string | null;
  },
  client?: Db
): Promise<string> {
  const supabase = await db(client);
  const partyId = await createExternalParty(organizationId, {
    legalName: input.legalName, tradeName: null, taxId: input.taxId,
    country: input.country, city: input.city, website: null, notes: null,
  }, supabase);

  const { error: eRole } = await supabase
    .from("quality_external_party_roles")
    .insert({ organization_id: organizationId, party_id: partyId, role_code: "supplier" });
  if (eRole) throw new Error(fail(eRole, "No se pudo registrar el rol de proveedor."));

  const { data, error } = await supabase
    .from("quality_supplier_profiles")
    .insert({
      organization_id: organizationId, party_id: partyId,
      relationship_status: "active", owner_position_id: input.ownerPositionId,
    })
    .select("id").single();
  if (error) throw new Error(fail(error, "No se pudo crear el proveedor."));

  const { error: eScope } = await supabase
    .from("quality_supplier_scopes")
    .insert({ organization_id: organizationId, profile_id: data.id, label: "Alcance general" });
  if (eScope) throw new Error(fail(eScope, "No se pudo crear el alcance general."));

  return data.id as string;
}

/** §58/GP-33 · Incorporar uno que ya existe en PCR o Textiles, sin copiarlo. */
export async function adoptSupplier(
  sourceModule: SupplierSourceModule, sourceId: string,
  ownerPositionId: string | null, client?: Db
): Promise<string> {
  const supabase = await db(client);
  const { data, error } = await supabase.rpc("quality_adopt_supplier", {
    p_source_module: sourceModule, p_source_id: sourceId,
    p_owner_position_id: ownerPositionId,
  });
  if (error) throw new Error(fail(error, "No se pudo incorporar el proveedor."));
  return data as string;
}

export async function updateSupplierProfile(
  organizationId: string, profileId: string,
  input: { relationshipStatus: RelationshipStatus; ownerPositionId: string | null;
           reevaluationMonths: number; notes: string | null },
  client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase
    .from("quality_supplier_profiles")
    .update({
      relationship_status: input.relationshipStatus,
      owner_position_id: input.ownerPositionId,
      reevaluation_months: input.reevaluationMonths,
      notes: input.notes,
    })
    .eq("organization_id", organizationId).eq("id", profileId);
  if (error) throw new Error(fail(error, "No se pudo actualizar el proveedor."));
}

/** §37/§78 · Retirar conserva TODO. No hay ninguna vía que borre un proveedor
 *  con historia: el veredicto de 0125 y su disparador lo impiden. */
export async function retireSupplier(
  organizationId: string, profileId: string, client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase
    .from("quality_supplier_profiles")
    .update({ relationship_status: "retired" })
    .eq("organization_id", organizationId).eq("id", profileId);
  if (error) throw new Error(fail(error, "No se pudo retirar el proveedor."));
}

export async function deleteSupplier(
  organizationId: string, profileId: string, client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase
    .from("quality_supplier_profiles").delete()
    .eq("organization_id", organizationId).eq("id", profileId);
  if (error) throw new Error(fail(error, "No se pudo eliminar el proveedor."));
}

export async function createPartySite(
  organizationId: string, partyId: string,
  input: { name: string; code: string | null; country: string | null; city: string | null;
           address: string | null; isPrimary: boolean },
  client?: Db
): Promise<string> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("quality_external_party_sites")
    .insert({
      organization_id: organizationId, party_id: partyId, name: input.name,
      code: input.code, country: input.country, city: input.city,
      address: input.address, is_primary: input.isPrimary,
    })
    .select("id").single();
  if (error) throw new Error(fail(error, "No se pudo crear la sede."));
  return data.id as string;
}

export async function createPartyContact(
  organizationId: string, partyId: string,
  input: { fullName: string; roleTitle: string | null; email: string | null;
           phone: string | null; siteId: string | null },
  client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase
    .from("quality_external_party_contacts")
    .insert({
      organization_id: organizationId, party_id: partyId, full_name: input.fullName,
      role_title: input.roleTitle, email: input.email, phone: input.phone,
      site_id: input.siteId,
    });
  if (error) throw new Error(fail(error, "No se pudo crear el contacto."));
}

export async function createSupplierCategory(
  organizationId: string,
  input: { name: string; code: string | null; description: string | null },
  client?: Db
): Promise<string> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("quality_supplier_categories")
    .insert({
      organization_id: organizationId, name: input.name,
      code: input.code, description: input.description,
    })
    .select("id").single();
  if (error) throw new Error(fail(error, "No se pudo crear la categoría."));
  return data.id as string;
}

export async function assignCategory(
  organizationId: string,
  input: { profileId: string; categoryId: string; siteId: string | null; note: string | null },
  client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase
    .from("quality_supplier_category_assignments")
    .insert({
      organization_id: organizationId, profile_id: input.profileId,
      category_id: input.categoryId, site_id: input.siteId, note: input.note,
    });
  if (error) throw new Error(fail(error, "No se pudo asignar la categoría."));
}

/** GP-03 · Crear el alcance sobre el que se evalúa, se clasifica y se decide. */
export async function createScope(
  organizationId: string,
  input: { profileId: string; siteId: string | null; categoryId: string | null; label: string | null },
  client?: Db
): Promise<string> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("quality_supplier_scopes")
    .insert({
      organization_id: organizationId, profile_id: input.profileId,
      site_id: input.siteId, category_id: input.categoryId, label: input.label,
    })
    .select("id").single();
  if (error) throw new Error(fail(error, "No se pudo crear el alcance."));
  return data.id as string;
}

export async function assessCriticality(
  input: { scopeId: string; versionId: string; levelIds: string[];
           rationale: string | null; assessedOn: string },
  client?: Db
): Promise<string> {
  const supabase = await db(client);
  const { data, error } = await supabase.rpc("quality_assess_supplier_criticality", {
    p_scope_id: input.scopeId, p_version_id: input.versionId,
    p_level_ids: input.levelIds, p_rationale: input.rationale,
    p_assessed_on: input.assessedOn,
  });
  if (error) throw new Error(fail(error, "No se pudo clasificar la criticidad."));
  return data as string;
}

export async function createSupplierRequirement(
  organizationId: string,
  input: { title: string; code: string | null; description: string | null;
           kind: RequirementKind; enforcement: RequirementEnforcement;
           trazadocDocumentId: string | null },
  client?: Db
): Promise<string> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("quality_supplier_requirements")
    .insert({
      organization_id: organizationId, title: input.title, code: input.code,
      description: input.description, requirement_kind: input.kind,
      enforcement: input.enforcement, trazadoc_document_id: input.trazadocDocumentId,
    })
    .select("id").single();
  if (error) throw new Error(fail(error, "No se pudo crear el requisito."));
  return data.id as string;
}

/** §17 · La asignación lleva vigencia: es lo que impide que exigir algo nuevo
 *  vuelva incumplido el pasado. */
export async function assignRequirement(
  organizationId: string,
  input: { requirementId: string; categoryId: string | null; scopeId: string | null;
           effectiveFrom: string; note: string | null },
  client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase
    .from("quality_supplier_requirement_assignments")
    .insert({
      organization_id: organizationId, requirement_id: input.requirementId,
      category_id: input.categoryId, scope_id: input.scopeId,
      effective_from: input.effectiveFrom, note: input.note,
    });
  if (error) throw new Error(fail(error, "No se pudo asignar el requisito."));
}

/** Retirar un requisito no borra la asignación: le pone fecha final, y así la
 *  evaluación del año pasado sigue sabiendo qué se exigía. */
export async function endRequirementAssignment(
  organizationId: string, assignmentId: string, effectiveTo: string, client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase
    .from("quality_supplier_requirement_assignments")
    .update({ effective_to: effectiveTo })
    .eq("organization_id", organizationId).eq("id", assignmentId);
  if (error) throw new Error(fail(error, "No se pudo cerrar la asignación del requisito."));
}

export async function createSupplierDocument(
  organizationId: string,
  input: { profileId: string; scopeId: string | null; requirementId: string | null;
           kind: string; title: string; issuer: string | null; referenceCode: string | null;
           issuedOn: string | null; expiresOn: string | null; trazadocDocumentId: string | null },
  client?: Db
): Promise<string> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("quality_supplier_documents")
    .insert({
      organization_id: organizationId, profile_id: input.profileId, scope_id: input.scopeId,
      requirement_id: input.requirementId, document_kind: input.kind, title: input.title,
      issuer: input.issuer, reference_code: input.referenceCode,
      issued_on: input.issuedOn, expires_on: input.expiresOn,
      trazadoc_document_id: input.trazadocDocumentId,
    })
    .select("id").single();
  if (error) throw new Error(fail(error, "No se pudo registrar el documento."));
  return data.id as string;
}

// --- Plantillas de evaluación ----------------------------------------------

export async function createTemplate(
  organizationId: string,
  input: { name: string; code: string | null; description: string | null },
  client?: Db
): Promise<string> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("quality_supplier_evaluation_templates")
    .insert({
      organization_id: organizationId, name: input.name,
      code: input.code, description: input.description,
    })
    .select("id").single();
  if (error) throw new Error(fail(error, "No se pudo crear la plantilla."));
  return data.id as string;
}

export async function createTemplateVersionDraft(
  organizationId: string, templateId: string,
  input: { scoringRule: ScoringRule; bands: unknown; changeNote: string | null },
  client?: Db
): Promise<string> {
  const supabase = await db(client);
  const { data: existing } = await supabase
    .from("quality_supplier_template_versions").select("version_number")
    .eq("organization_id", organizationId).eq("template_id", templateId)
    .order("version_number", { ascending: false }).limit(1);
  const next = Number(existing?.[0]?.version_number ?? 0) + 1;

  const { data, error } = await supabase
    .from("quality_supplier_template_versions")
    .insert({
      organization_id: organizationId, template_id: templateId, version_number: next,
      scoring_rule: input.scoringRule, bands: input.bands, change_note: input.changeNote,
    })
    .select("id").single();
  if (error) throw new Error(fail(error, "No se pudo crear la versión."));
  return data.id as string;
}

export async function addCriterion(
  organizationId: string, versionId: string,
  input: { code: string; label: string; weight: number; maxPoints: number;
           method: CriterionMethod; evidenceExpectation: string | null;
           requirementId: string | null; order: number },
  client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase
    .from("quality_supplier_evaluation_criteria")
    .insert({
      organization_id: organizationId, version_id: versionId, code: input.code,
      label: input.label, weight: input.weight, max_points: input.maxPoints,
      evaluation_method: input.method, evidence_expectation: input.evidenceExpectation,
      requirement_id: input.requirementId, position_order: input.order,
    });
  if (error) throw new Error(fail(error, "No se pudo añadir el criterio."));
}

export async function publishTemplateVersion(
  versionId: string, effectiveFrom: string, changeNote: string | null, client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase.rpc("quality_publish_supplier_template_version", {
    p_version_id: versionId, p_effective_from: effectiveFrom, p_change_note: changeNote,
  });
  if (error) throw new Error(fail(error, "No se pudo publicar la versión."));
}

// --- Evaluaciones -----------------------------------------------------------

export async function createEvaluation(
  organizationId: string,
  input: { scopeId: string; versionId: string; kind: SupplierEvaluationKind;
           triggerReason: string | null; periodLabel: string | null;
           periodStart: string | null; periodEnd: string | null },
  client?: Db
): Promise<string> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("quality_supplier_evaluations")
    .insert({
      organization_id: organizationId, scope_id: input.scopeId, version_id: input.versionId,
      evaluation_kind: input.kind, trigger_reason: input.triggerReason,
      period_label: input.periodLabel, period_start: input.periodStart,
      period_end: input.periodEnd, status: "in_progress",
    })
    .select("id").single();
  if (error) throw new Error(fail(error, "No se pudo crear la evaluación."));
  return data.id as string;
}

/** §22/§23 · «No aplica» y «sin dato» NO llevan puntos: la base lo exige, y
 *  aquí se refleja para que la pantalla no pueda enviarlos. */
export async function recordResult(
  organizationId: string,
  input: { evaluationId: string; criterionId: string; outcome: ResultOutcome;
           points: number | null; observation: string | null;
           supplierDocumentId: string | null; trazadocDocumentId: string | null },
  client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase
    .from("quality_supplier_evaluation_results")
    .upsert({
      organization_id: organizationId, evaluation_id: input.evaluationId,
      criterion_id: input.criterionId, outcome: input.outcome,
      points: input.outcome === "scored" ? input.points : null,
      observation: input.observation,
      supplier_document_id: input.supplierDocumentId,
      trazadoc_document_id: input.trazadocDocumentId,
    }, { onConflict: "evaluation_id,criterion_id" });
  if (error) throw new Error(fail(error, "No se pudo registrar el resultado."));
}

export type EvaluationOutcome = {
  score: number | null; band: string | null;
  criteriaTotal: number; scored: number;
  notApplicable: number; unavailable: number; notEvaluated: number;
  decidesNothing: true;
};

export async function closeEvaluation(
  evaluationId: string, summary: string | null, evaluatedOn: string, client?: Db
): Promise<EvaluationOutcome> {
  const supabase = await db(client);
  const { data, error } = await supabase.rpc("quality_close_supplier_evaluation", {
    p_evaluation_id: evaluationId, p_summary: summary, p_evaluated_on: evaluatedOn,
  });
  if (error) throw new Error(fail(error, "No se pudo cerrar la evaluación."));
  const r = (data ?? {}) as Record<string, unknown>;
  return {
    score: r.score === null ? null : Number(r.score),
    band: (r.band as string | null) ?? null,
    criteriaTotal: Number(r.criteria_total ?? 0),
    scored: Number(r.scored ?? 0),
    notApplicable: Number(r.not_applicable ?? 0),
    unavailable: Number(r.unavailable ?? 0),
    notEvaluated: Number(r.not_evaluated ?? 0),
    decidesNothing: true,
  };
}

// --- Decisiones -------------------------------------------------------------

export async function decideApproval(
  input: { scopeId: string; decision: ApprovalDecision; rationale: string;
           conditions: string | null; validUntil: string | null;
           evaluationId: string | null; effectiveFrom: string },
  client?: Db
): Promise<string> {
  const supabase = await db(client);
  const { data, error } = await supabase.rpc("quality_decide_supplier_approval", {
    p_scope_id: input.scopeId, p_decision: input.decision, p_rationale: input.rationale,
    p_conditions: input.conditions, p_valid_until: input.validUntil,
    p_evaluation_id: input.evaluationId, p_effective_from: input.effectiveFrom,
  });
  if (error) throw new Error(fail(error, "No se pudo registrar la decisión."));
  return data as string;
}

// --- Incidentes y señales ---------------------------------------------------

export async function recordIncident(
  organizationId: string,
  input: { profileId: string; scopeId: string | null; kind: IncidentKind;
           severity: IncidentSeverity; occurredOn: string; title: string;
           description: string | null; isDataIssue: boolean },
  client?: Db
): Promise<string> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("quality_supplier_incidents")
    .insert({
      organization_id: organizationId, profile_id: input.profileId, scope_id: input.scopeId,
      incident_kind: input.kind, severity: input.severity, occurred_on: input.occurredOn,
      title: input.title, description: input.description, is_data_issue: input.isDataIssue,
    })
    .select("id").single();
  if (error) throw new Error(fail(error, "No se pudo registrar el incidente."));
  return data.id as string;
}

/** §33/GP-22 · Abrir el caso es una decisión explícita. El incidente por sí
 *  solo no abre nada. */
export async function openCaseFromIncident(
  incidentId: string, title: string | null, description: string | null, client?: Db
): Promise<string> {
  const supabase = await db(client);
  const { data, error } = await supabase.rpc("quality_open_case_from_supplier_incident", {
    p_incident_id: incidentId, p_title: title, p_description: description,
  });
  if (error) throw new Error(fail(error, "No se pudo abrir el caso."));
  return data as string;
}

export async function dismissSupplierSignal(
  organizationId: string, signalId: string, client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase
    .from("quality_supplier_signals")
    .update({ status: "dismissed", resolved_at: new Date().toISOString() })
    .eq("organization_id", organizationId).eq("id", signalId);
  if (error) throw new Error(fail(error, "No se pudo descartar la señal."));
}

/** §29/§73 · Idempotente: el segundo barrido del día no duplica nada. */
export async function scanSupplierReviews(
  organizationId: string, client?: Db
): Promise<number> {
  const supabase = await db(client);
  const { data, error } = await supabase.rpc("quality_scan_supplier_reviews", {
    p_organization_id: organizationId,
  });
  if (error) throw new Error(fail(error, "No se pudo revisar los proveedores."));
  return Number(data ?? 0);
}
