import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";
import type {
  ActivityKind, AssignmentType, AttendanceStatus, CompetenceMethod, Criticality,
  DevelopmentKind, DocumentationStatus, EffectivenessMethod, EffectivenessResult,
  EvaluationStatus, EvidenceStatus, HolderLevel, KnowledgeKind, KnowledgeSignalKind,
  LearningResult, LessonOrigin, LessonStatus, NeedOrigin, NeedStatus,
  PerformanceCycleStatus, PerformanceResult, PersonCompetenceStatus, PersonRelationship,
  PersonStatus, PlanItemStatus, PositionFunctionKind, PositionVersionStatus,
  ProposalKind, ProposalStatus, TransferMethod, TransferStatus,
} from "@/lib/domain/quality-people";

/**
 * Trazaloop · QUALITY-06 · Lectura y escritura de personas, competencia,
 * desarrollo y conocimiento.
 *
 * DOS DECISIONES QUE EXPLICAN CÓMO ESTÁ ESCRITO ESTE ARCHIVO
 *
 * 1 · Los actos que crean HISTORIA pasan por una RPC de 0123 —publicar un
 *     perfil de cargo, declarar competencia, cerrar una evaluación, verificar
 *     una transferencia—, por lo mismo que en QUALITY-04 y 05: comprobar rol,
 *     estado e invariante en el MISMO acto en que se registra. Lo demás es
 *     escritura normal bajo RLS.
 *
 * 2 · Las relaciones se resuelven con consultas separadas y se cruzan en
 *     memoria, en vez de con `embed` de PostREST. No es un capricho: las FK de
 *     este esquema son COMPUESTAS `(organization_id, id)` (MDR-42), y un
 *     `tabla:columna_id(...)` no las resuelve — devuelve el error dentro de
 *     `error`, no de `data`, así que un `(data ?? [])` lo convierte en una
 *     lista vacía silenciosa. Ya ocurrió en QUALITY-04 y dejó tablas enteras
 *     en blanco en producción sin que nadie lo notara.
 *
 * Este módulo NUNCA usa `service_role`: opera con la sesión del usuario y deja
 * que RLS decida. Si una fila no aparece, es porque no debía aparecer.
 */

function fail(error: { message?: string; code?: string } | null, fallback: string): string {
  const raw = error?.message ?? "";
  if (error?.code === "P0001" && raw.length > 0) return raw;
  return raw.length > 0 ? raw : fallback;
}

// ===========================================================================
// Unidades de la empresa y organigrama (PC-02, §9, §10)
// ===========================================================================

export type OrgUnitRow = {
  id: string; code: string | null; name: string; description: string | null;
  parentId: string | null; isActive: boolean;
};

export async function listOrgUnits(organizationId: string): Promise<OrgUnitRow[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("quality_org_units")
    .select("id, code, name, description, parent_id, is_active")
    .eq("organization_id", organizationId)
    .order("name");
  if (error) throw new Error(fail(error, "No se pudieron leer las unidades."));
  return (data ?? []).map((u) => ({
    id: u.id, code: u.code, name: u.name, description: u.description,
    parentId: u.parent_id, isActive: u.is_active,
  }));
}

export type OrgChartRow = {
  positionId: string; positionCode: string | null; positionName: string;
  isActive: boolean; isCritical: boolean; parentPositionId: string | null;
  orgUnitId: string | null; orgUnitName: string | null; orgUnitParentId: string | null;
  orgUnitLabel: string | null;
  holderCount: number; primaryHolderName: string | null;
};

/**
 * PC-02 · El organigrama sale de la vista, que a su vez sale de unidades,
 * cargos, jerarquía y asignaciones vigentes. No hay ninguna imagen guardada:
 * lo que se dibuja es una proyección de estos datos.
 */
export async function getOrgChart(organizationId: string): Promise<OrgChartRow[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("v_quality_org_chart")
    .select(`position_id, position_code, position_name, is_active, is_critical,
             parent_position_id, org_unit_id, org_unit_name, org_unit_parent_id,
             org_unit_label, holder_count, primary_holder_name`)
    .eq("organization_id", organizationId)
    .order("org_unit_label", { ascending: true, nullsFirst: false })
    .order("position_name");
  if (error) throw new Error(fail(error, "No se pudo construir el organigrama."));
  return (data ?? []).map((r) => ({
    positionId: r.position_id, positionCode: r.position_code, positionName: r.position_name,
    isActive: r.is_active, isCritical: r.is_critical, parentPositionId: r.parent_position_id,
    orgUnitId: r.org_unit_id, orgUnitName: r.org_unit_name, orgUnitParentId: r.org_unit_parent_id,
    orgUnitLabel: r.org_unit_label,
    holderCount: Number(r.holder_count ?? 0), primaryHolderName: r.primary_holder_name,
  }));
}

// ===========================================================================
// Personas (PC-01, PC-05)
// ===========================================================================

export type PersonRow = {
  id: string; fullName: string; employeeCode: string | null; workEmail: string | null;
  profileId: string | null; relationship: PersonRelationship; status: PersonStatus;
  joinedOn: string | null; leftOn: string | null; notes: string | null;
};

export async function listPeople(
  organizationId: string,
  filters: { status?: string; search?: string } = {}
): Promise<PersonRow[]> {
  const supabase = await createServerClient();
  let q = supabase
    .from("quality_people")
    .select(`id, full_name, employee_code, work_email, profile_id,
             relationship, status, joined_on, left_on, notes`)
    .eq("organization_id", organizationId);
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.search) q = q.ilike("full_name", `%${filters.search}%`);
  const { data, error } = await q.order("full_name");
  if (error) throw new Error(fail(error, "No se pudieron leer las personas."));
  return (data ?? []).map(mapPerson);
}

function mapPerson(p: Record<string, never> | Record<string, unknown>): PersonRow {
  const r = p as Record<string, string | null>;
  return {
    id: r.id as string, fullName: r.full_name as string, employeeCode: r.employee_code,
    workEmail: r.work_email, profileId: r.profile_id,
    relationship: r.relationship as PersonRelationship, status: r.status as PersonStatus,
    joinedOn: r.joined_on, leftOn: r.left_on, notes: r.notes,
  };
}

export type AssignmentRow = {
  id: string; positionId: string; positionName: string; positionCode: string | null;
  personId: string | null; personName: string | null; profileId: string | null;
  assignmentType: AssignmentType; effectiveFrom: string; effectiveTo: string | null;
  notes: string | null;
};

export async function listAssignments(
  organizationId: string,
  scope: { personId?: string; positionId?: string } = {}
): Promise<AssignmentRow[]> {
  const supabase = await createServerClient();
  let q = supabase
    .from("quality_position_assignments")
    .select(`id, position_id, person_id, profile_id, assignment_type,
             effective_from, effective_to, notes`)
    .eq("organization_id", organizationId);
  if (scope.personId) q = q.eq("person_id", scope.personId);
  if (scope.positionId) q = q.eq("position_id", scope.positionId);
  const { data, error } = await q.order("effective_from", { ascending: false });
  if (error) throw new Error(fail(error, "No se pudieron leer las asignaciones."));
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const positions = await positionNames(organizationId, rows.map((r) => r.position_id));
  const people = await personNames(
    organizationId,
    rows.map((r) => r.person_id).filter((v): v is string => Boolean(v))
  );

  return rows.map((r) => ({
    id: r.id, positionId: r.position_id,
    positionName: positions.get(r.position_id)?.name ?? "—",
    positionCode: positions.get(r.position_id)?.code ?? null,
    personId: r.person_id, personName: r.person_id ? people.get(r.person_id) ?? null : null,
    profileId: r.profile_id, assignmentType: r.assignment_type as AssignmentType,
    effectiveFrom: r.effective_from, effectiveTo: r.effective_to, notes: r.notes,
  }));
}

async function positionNames(
  organizationId: string, ids: readonly string[]
): Promise<Map<string, { name: string; code: string | null }>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("quality_positions").select("id, name, code")
    .eq("organization_id", organizationId).in("id", unique);
  return new Map((data ?? []).map((p) => [p.id as string, { name: p.name as string, code: p.code as string | null }]));
}

async function personNames(
  organizationId: string, ids: readonly string[]
): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("quality_people").select("id, full_name")
    .eq("organization_id", organizationId).in("id", unique);
  return new Map((data ?? []).map((p) => [p.id as string, p.full_name as string]));
}

// ---------------------------------------------------------------------------
// Verdad histórica (PC-11, PC-23, §54)
// ---------------------------------------------------------------------------

export type HistoricalHolder = {
  assignmentId: string; assignmentType: AssignmentType;
  personId: string | null; personName: string | null; profileId: string | null;
};

/**
 * §54 · Quién ocupaba el cargo EN esa fecha.
 *
 * Va contra la función de la base y no contra una lista en memoria a propósito:
 * es la única respuesta que no depende de qué hayamos cargado en pantalla.
 */
export async function positionHoldersOn(
  organizationId: string, positionId: string, on: string
): Promise<HistoricalHolder[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("quality_position_holders_on", {
    p_organization_id: organizationId, p_position_id: positionId, p_on: on,
  });
  if (error) throw new Error(fail(error, "No se pudo reconstruir quién ocupaba el cargo."));
  return (data ?? []).map((r: Record<string, string | null>) => ({
    assignmentId: r.assignment_id as string,
    assignmentType: r.assignment_type as AssignmentType,
    personId: r.person_id, personName: r.person_name, profileId: r.profile_id,
  }));
}

export async function requiredLevelOn(
  organizationId: string, positionId: string, competencyId: string, on: string
): Promise<number | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("quality_required_level_on", {
    p_organization_id: organizationId, p_position_id: positionId,
    p_competency_id: competencyId, p_on: on,
  });
  if (error) throw new Error(fail(error, "No se pudo leer el requisito de esa fecha."));
  return data === null || data === undefined ? null : Number(data);
}

export async function demonstratedLevelOn(
  organizationId: string, personId: string, competencyId: string, on: string
): Promise<number | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("quality_demonstrated_level_on", {
    p_organization_id: organizationId, p_person_id: personId,
    p_competency_id: competencyId, p_on: on,
  });
  if (error) throw new Error(fail(error, "No se pudo leer la competencia de esa fecha."));
  return data === null || data === undefined ? null : Number(data);
}

// ===========================================================================
// Perfiles de cargo (§12, §13)
// ===========================================================================

export type PositionFunctionRow = {
  id: string; description: string; kind: PositionFunctionKind;
  processId: string | null; order: number;
};

export type PositionRequirementRow = {
  id: string; competencyId: string; competencyName: string;
  requiredLevel: number; isMandatory: boolean; note: string | null;
};

export type PositionVersionRow = {
  id: string; positionId: string; versionNumber: number; status: PositionVersionStatus;
  purpose: string | null; scope: string | null; authority: string | null;
  education: string | null; experience: string | null; changeNote: string | null;
  effectiveFrom: string | null; effectiveTo: string | null; publishedAt: string | null;
  functions: PositionFunctionRow[];
  requirements: PositionRequirementRow[];
};

export async function listPositionVersions(
  organizationId: string, positionId: string, client?: SupabaseClient
): Promise<PositionVersionRow[]> {
  const supabase = client ?? (await createServerClient());
  const { data, error } = await supabase
    .from("quality_position_versions")
    .select(`id, position_id, version_number, status, purpose, scope, authority,
             education, experience, change_note, effective_from, effective_to, published_at`)
    .eq("organization_id", organizationId)
    .eq("position_id", positionId)
    .order("version_number", { ascending: false });
  if (error) throw new Error(fail(error, "No se pudieron leer los perfiles del cargo."));
  const versions = data ?? [];
  if (versions.length === 0) return [];

  const ids = versions.map((v) => v.id as string);
  const [functions, requirements] = await Promise.all([
    listFunctionsFor(organizationId, ids, supabase),
    listRequirementsFor(organizationId, ids, supabase),
  ]);

  return versions.map((v) => ({
    id: v.id, positionId: v.position_id, versionNumber: v.version_number,
    status: v.status as PositionVersionStatus, purpose: v.purpose, scope: v.scope,
    authority: v.authority, education: v.education, experience: v.experience,
    changeNote: v.change_note, effectiveFrom: v.effective_from,
    effectiveTo: v.effective_to, publishedAt: v.published_at,
    functions: functions.get(v.id) ?? [],
    requirements: requirements.get(v.id) ?? [],
  }));
}

async function listFunctionsFor(
  organizationId: string, versionIds: readonly string[], client?: SupabaseClient
): Promise<Map<string, PositionFunctionRow[]>> {
  const supabase = client ?? (await createServerClient());
  const { data } = await supabase
    .from("quality_position_functions")
    .select("id, position_version_id, description, function_kind, process_id, position_order")
    .eq("organization_id", organizationId)
    .in("position_version_id", [...versionIds])
    .order("position_order");
  const out = new Map<string, PositionFunctionRow[]>();
  for (const f of data ?? []) {
    const list = out.get(f.position_version_id as string) ?? [];
    list.push({
      id: f.id as string, description: f.description as string,
      kind: f.function_kind as PositionFunctionKind,
      processId: f.process_id as string | null, order: Number(f.position_order),
    });
    out.set(f.position_version_id as string, list);
  }
  return out;
}

async function listRequirementsFor(
  organizationId: string, versionIds: readonly string[], client?: SupabaseClient
): Promise<Map<string, PositionRequirementRow[]>> {
  const supabase = client ?? (await createServerClient());
  const { data } = await supabase
    .from("quality_competency_requirements")
    .select("id, position_version_id, competency_id, required_level, is_mandatory, note")
    .eq("organization_id", organizationId)
    .in("position_version_id", [...versionIds]);
  const rows = data ?? [];
  const names = await competencyNames(
    organizationId, rows.map((r) => r.competency_id as string), supabase
  );
  const out = new Map<string, PositionRequirementRow[]>();
  for (const r of rows) {
    const key = r.position_version_id as string;
    const list = out.get(key) ?? [];
    list.push({
      id: r.id as string, competencyId: r.competency_id as string,
      competencyName: names.get(r.competency_id as string) ?? "—",
      requiredLevel: Number(r.required_level), isMandatory: Boolean(r.is_mandatory),
      note: r.note as string | null,
    });
    out.set(key, list);
  }
  for (const list of out.values()) list.sort((a, b) => a.competencyName.localeCompare(b.competencyName));
  return out;
}

// ===========================================================================
// Competencia (§18–§25)
// ===========================================================================

export type CompetencyRow = {
  id: string; code: string | null; name: string; description: string | null;
  category: string | null; isActive: boolean;
};

export async function listCompetencies(organizationId: string): Promise<CompetencyRow[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("quality_competencies")
    .select("id, code, name, description, category, is_active")
    .eq("organization_id", organizationId)
    .order("name");
  if (error) throw new Error(fail(error, "No se pudieron leer las competencias."));
  return (data ?? []).map((c) => ({
    id: c.id, code: c.code, name: c.name, description: c.description,
    category: c.category, isActive: c.is_active,
  }));
}

async function competencyNames(
  organizationId: string, ids: readonly string[], client?: SupabaseClient
): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const supabase = client ?? (await createServerClient());
  const { data } = await supabase
    .from("quality_competencies").select("id, name")
    .eq("organization_id", organizationId).in("id", unique);
  return new Map((data ?? []).map((c) => [c.id as string, c.name as string]));
}

export type CompetencyLevelRow = {
  id: string; value: number; label: string; description: string | null;
};

export async function listCompetencyLevels(organizationId: string): Promise<CompetencyLevelRow[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("quality_competency_levels")
    .select("id, level_value, label, description")
    .eq("organization_id", organizationId)
    .order("level_value");
  if (error) throw new Error(fail(error, "No se pudo leer la escala de competencia."));
  return (data ?? []).map((l) => ({
    id: l.id, value: Number(l.level_value), label: l.label, description: l.description,
  }));
}

export type EvidenceRow = {
  id: string; kind: string; title: string; issuer: string | null;
  issuedOn: string | null; expiresOn: string | null; status: EvidenceStatus;
  referenceNote: string | null; documentId: string | null;
};

export type PersonCompetenceRow = {
  id: string; competencyId: string; competencyName: string;
  demonstratedLevel: number; assessedOn: string; method: CompetenceMethod;
  rationale: string | null; status: PersonCompetenceStatus; validUntil: string | null;
  evidence: EvidenceRow[];
};

export async function listPersonCompetencies(
  organizationId: string, personId: string
): Promise<PersonCompetenceRow[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("quality_person_competencies")
    .select(`id, competency_id, demonstrated_level, assessed_on, method,
             rationale, status, valid_until`)
    .eq("organization_id", organizationId)
    .eq("person_id", personId)
    .order("assessed_on", { ascending: false });
  if (error) throw new Error(fail(error, "No se pudo leer la competencia de la persona."));
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const [names, evidence] = await Promise.all([
    competencyNames(organizationId, rows.map((r) => r.competency_id as string)),
    listEvidenceFor(organizationId, rows.map((r) => r.id as string)),
  ]);

  return rows.map((r) => ({
    id: r.id, competencyId: r.competency_id,
    competencyName: names.get(r.competency_id) ?? "—",
    demonstratedLevel: Number(r.demonstrated_level), assessedOn: r.assessed_on,
    method: r.method as CompetenceMethod, rationale: r.rationale,
    status: r.status as PersonCompetenceStatus, validUntil: r.valid_until,
    evidence: evidence.get(r.id) ?? [],
  }));
}

async function listEvidenceFor(
  organizationId: string, personCompetencyIds: readonly string[]
): Promise<Map<string, EvidenceRow[]>> {
  if (personCompetencyIds.length === 0) return new Map();
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("quality_competency_evidence")
    .select(`id, person_competency_id, evidence_kind, title, issuer, issued_on,
             expires_on, status, reference_note, trazadoc_document_id`)
    .eq("organization_id", organizationId)
    .in("person_competency_id", [...personCompetencyIds])
    .order("expires_on", { ascending: true, nullsFirst: false });
  const out = new Map<string, EvidenceRow[]>();
  for (const e of data ?? []) {
    const key = e.person_competency_id as string;
    const list = out.get(key) ?? [];
    list.push({
      id: e.id as string, kind: e.evidence_kind as string, title: e.title as string,
      issuer: e.issuer as string | null, issuedOn: e.issued_on as string | null,
      expiresOn: e.expires_on as string | null, status: e.status as EvidenceStatus,
      referenceNote: e.reference_note as string | null,
      documentId: e.trazadoc_document_id as string | null,
    });
    out.set(key, list);
  }
  return out;
}

export type CompetenceMatrixRow = {
  personId: string; personName: string;
  positionId: string; positionName: string;
  positionVersionId: string; versionNumber: number;
  competencyId: string; competencyName: string;
  requiredLevel: number; isMandatory: boolean;
  demonstratedLevel: number | null; assessedOn: string | null;
  gap: number; evidenceStatus: "none" | "valid" | "expired";
};

/**
 * §25/§65 · La matriz. Requerido, demostrado y brecha, y nada más.
 *
 * No hay un total por persona ni un orden por brecha descendente: eso
 * convertiría una herramienta de planificación en una lista de «peores», que
 * es exactamente lo que PC-28 y §39 prohíben.
 */
export async function getCompetenceMatrix(organizationId: string): Promise<CompetenceMatrixRow[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("v_quality_competence_matrix")
    .select(`person_id, person_name, position_id, position_name, position_version_id,
             version_number, competency_id, competency_name, required_level, is_mandatory,
             demonstrated_level, assessed_on, gap, evidence_status`)
    .eq("organization_id", organizationId)
    .order("person_name")
    .order("competency_name");
  if (error) throw new Error(fail(error, "No se pudo construir la matriz de competencias."));
  return (data ?? []).map((r) => ({
    personId: r.person_id, personName: r.person_name,
    positionId: r.position_id, positionName: r.position_name,
    positionVersionId: r.position_version_id, versionNumber: Number(r.version_number),
    competencyId: r.competency_id, competencyName: r.competency_name,
    requiredLevel: Number(r.required_level), isMandatory: Boolean(r.is_mandatory),
    demonstratedLevel: r.demonstrated_level === null ? null : Number(r.demonstrated_level),
    assessedOn: r.assessed_on, gap: Number(r.gap),
    evidenceStatus: r.evidence_status as "none" | "valid" | "expired",
  }));
}

// ===========================================================================
// Desarrollo (§26–§35)
// ===========================================================================

export type DevelopmentNeedRow = {
  id: string; title: string; description: string | null;
  origin: NeedOrigin; originNote: string | null;
  personId: string | null; personName: string | null;
  positionId: string | null; competencyId: string | null;
  priority: string; status: NeedStatus; createdAt: string;
};

export async function listDevelopmentNeeds(
  organizationId: string, filters: { status?: string; personId?: string } = {}
): Promise<DevelopmentNeedRow[]> {
  const supabase = await createServerClient();
  let q = supabase
    .from("quality_development_needs")
    .select(`id, title, description, origin_kind, origin_note, person_id, position_id,
             competency_id, priority, status, created_at`)
    .eq("organization_id", organizationId);
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.personId) q = q.eq("person_id", filters.personId);
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) throw new Error(fail(error, "No se pudieron leer las necesidades de desarrollo."));
  const rows = data ?? [];
  const people = await personNames(
    organizationId, rows.map((r) => r.person_id).filter((v): v is string => Boolean(v))
  );
  return rows.map((r) => ({
    id: r.id, title: r.title, description: r.description,
    origin: r.origin_kind as NeedOrigin, originNote: r.origin_note,
    personId: r.person_id, personName: r.person_id ? people.get(r.person_id) ?? null : null,
    positionId: r.position_id, competencyId: r.competency_id,
    priority: r.priority, status: r.status as NeedStatus, createdAt: r.created_at,
  }));
}

export type PlanItemRow = {
  id: string; title: string; developmentKind: DevelopmentKind;
  personId: string | null; personName: string | null;
  positionId: string | null; competencyId: string | null; needId: string | null;
  targetDate: string | null; status: PlanItemStatus;
  addedOn: string; addedReason: string | null;
};

export type DevelopmentPlanRow = {
  id: string; year: number; title: string; objective: string | null;
  status: "draft" | "active" | "closed"; approvedAt: string | null;
  items: PlanItemRow[];
};

export async function listDevelopmentPlans(organizationId: string): Promise<DevelopmentPlanRow[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("quality_development_plans")
    .select("id, year, title, objective, status, approved_at")
    .eq("organization_id", organizationId)
    .order("year", { ascending: false });
  if (error) throw new Error(fail(error, "No se pudieron leer los planes de desarrollo."));
  const plans = data ?? [];
  if (plans.length === 0) return [];
  const items = await listPlanItemsFor(organizationId, plans.map((p) => p.id as string));
  return plans.map((p) => ({
    id: p.id, year: Number(p.year), title: p.title, objective: p.objective,
    status: p.status as "draft" | "active" | "closed", approvedAt: p.approved_at,
    items: items.get(p.id) ?? [],
  }));
}

async function listPlanItemsFor(
  organizationId: string, planIds: readonly string[]
): Promise<Map<string, PlanItemRow[]>> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("quality_development_plan_items")
    .select(`id, plan_id, title, development_kind, person_id, position_id, competency_id,
             need_id, target_date, status, added_on, added_reason`)
    .eq("organization_id", organizationId)
    .in("plan_id", [...planIds])
    .order("added_on");
  const rows = data ?? [];
  const people = await personNames(
    organizationId, rows.map((r) => r.person_id).filter((v): v is string => Boolean(v))
  );
  const out = new Map<string, PlanItemRow[]>();
  for (const r of rows) {
    const key = r.plan_id as string;
    const list = out.get(key) ?? [];
    list.push({
      id: r.id as string, title: r.title as string,
      developmentKind: r.development_kind as DevelopmentKind,
      personId: r.person_id as string | null,
      personName: r.person_id ? people.get(r.person_id as string) ?? null : null,
      positionId: r.position_id as string | null,
      competencyId: r.competency_id as string | null,
      needId: r.need_id as string | null,
      targetDate: r.target_date as string | null,
      status: r.status as PlanItemStatus,
      addedOn: r.added_on as string, addedReason: r.added_reason as string | null,
    });
    out.set(key, list);
  }
  return out;
}

export type ParticipantRow = {
  id: string; personId: string; personName: string;
  attendance: AttendanceStatus; attendanceNote: string | null;
  learningResult: LearningResult; learningMethod: string | null;
  learningNote: string | null; evaluatedOn: string | null;
};

export type EffectivenessRow = {
  id: string; criterion: string; method: EffectivenessMethod;
  result: EffectivenessResult; observation: string | null;
  reviewedOn: string | null; personId: string | null; indicatorId: string | null;
};

export type LearningActivityRow = {
  id: string; title: string; activityKind: ActivityKind; provider: string | null;
  description: string | null; startsOn: string | null; endsOn: string | null;
  durationHours: number | null; status: "planned" | "in_progress" | "completed" | "cancelled";
  planItemId: string | null;
  participants: ParticipantRow[];
  effectiveness: EffectivenessRow[];
};

export async function listLearningActivities(
  organizationId: string, filters: { status?: string } = {}
): Promise<LearningActivityRow[]> {
  const supabase = await createServerClient();
  let q = supabase
    .from("quality_learning_activities")
    .select(`id, title, activity_kind, provider, description, starts_on, ends_on,
             duration_hours, status, plan_item_id`)
    .eq("organization_id", organizationId);
  if (filters.status) q = q.eq("status", filters.status);
  const { data, error } = await q.order("starts_on", { ascending: false, nullsFirst: false });
  if (error) throw new Error(fail(error, "No se pudieron leer las actividades."));
  const rows = data ?? [];
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id as string);
  const [participants, effectiveness] = await Promise.all([
    listParticipantsFor(organizationId, ids),
    listEffectivenessFor(organizationId, ids),
  ]);
  return rows.map((r) => ({
    id: r.id, title: r.title, activityKind: r.activity_kind as ActivityKind,
    provider: r.provider, description: r.description,
    startsOn: r.starts_on, endsOn: r.ends_on,
    durationHours: r.duration_hours === null ? null : Number(r.duration_hours),
    status: r.status as LearningActivityRow["status"],
    planItemId: r.plan_item_id,
    participants: participants.get(r.id) ?? [],
    effectiveness: effectiveness.get(r.id) ?? [],
  }));
}

async function listParticipantsFor(
  organizationId: string, activityIds: readonly string[]
): Promise<Map<string, ParticipantRow[]>> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("quality_learning_participants")
    .select(`id, activity_id, person_id, attendance_status, attendance_note,
             learning_result, learning_method, learning_note, evaluated_on`)
    .eq("organization_id", organizationId)
    .in("activity_id", [...activityIds]);
  const rows = data ?? [];
  const people = await personNames(organizationId, rows.map((r) => r.person_id as string));
  const out = new Map<string, ParticipantRow[]>();
  for (const r of rows) {
    const key = r.activity_id as string;
    const list = out.get(key) ?? [];
    list.push({
      id: r.id as string, personId: r.person_id as string,
      personName: people.get(r.person_id as string) ?? "—",
      attendance: r.attendance_status as AttendanceStatus,
      attendanceNote: r.attendance_note as string | null,
      learningResult: r.learning_result as LearningResult,
      learningMethod: r.learning_method as string | null,
      learningNote: r.learning_note as string | null,
      evaluatedOn: r.evaluated_on as string | null,
    });
    out.set(key, list);
  }
  for (const list of out.values()) list.sort((a, b) => a.personName.localeCompare(b.personName));
  return out;
}

async function listEffectivenessFor(
  organizationId: string, activityIds: readonly string[]
): Promise<Map<string, EffectivenessRow[]>> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("quality_learning_effectiveness_reviews")
    .select(`id, activity_id, criterion, method, result, observation,
             reviewed_on, person_id, indicator_id`)
    .eq("organization_id", organizationId)
    .in("activity_id", [...activityIds]);
  const out = new Map<string, EffectivenessRow[]>();
  for (const r of data ?? []) {
    const key = r.activity_id as string;
    const list = out.get(key) ?? [];
    list.push({
      id: r.id as string, criterion: r.criterion as string,
      method: r.method as EffectivenessMethod, result: r.result as EffectivenessResult,
      observation: r.observation as string | null,
      reviewedOn: r.reviewed_on as string | null,
      personId: r.person_id as string | null,
      indicatorId: r.indicator_id as string | null,
    });
    out.set(key, list);
  }
  return out;
}

// ===========================================================================
// Desempeño (§36–§39)
// ===========================================================================

export type PerformanceItemRow = {
  id: string; subjectKind: "criterion" | "competency" | "position_function";
  criterion: string; competencyId: string | null;
  result: PerformanceResult; observation: string | null;
};

export type PerformanceEvaluationRow = {
  id: string; cycleId: string; cycleName: string;
  personId: string; personName: string;
  positionId: string | null; evaluatorPersonId: string | null; evaluatorName: string | null;
  evaluatedOn: string | null; summary: string | null; contextNote: string | null;
  status: EvaluationStatus; items: PerformanceItemRow[];
};

export type PerformanceCycleRow = {
  id: string; name: string; periodStart: string; periodEnd: string;
  purpose: string | null; status: PerformanceCycleStatus;
  population: { personId: string; personName: string; reason: string | null }[];
};

export async function listPerformanceCycles(organizationId: string): Promise<PerformanceCycleRow[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("quality_performance_cycles")
    .select("id, name, period_start, period_end, purpose, status")
    .eq("organization_id", organizationId)
    .order("period_start", { ascending: false });
  if (error) throw new Error(fail(error, "No se pudieron leer los ciclos de evaluación."));
  const cycles = data ?? [];
  if (cycles.length === 0) return [];

  // La población es dato de personas: si quien mira no puede verla, RLS la
  // devuelve vacía y el ciclo se muestra sin ella. No se inventa.
  const { data: members } = await supabase
    .from("quality_performance_cycle_members")
    .select("cycle_id, person_id, inclusion_reason")
    .eq("organization_id", organizationId)
    .in("cycle_id", cycles.map((c) => c.id as string));
  const rows = members ?? [];
  const people = await personNames(organizationId, rows.map((r) => r.person_id as string));

  return cycles.map((c) => ({
    id: c.id, name: c.name, periodStart: c.period_start, periodEnd: c.period_end,
    purpose: c.purpose, status: c.status as PerformanceCycleStatus,
    population: rows
      .filter((m) => m.cycle_id === c.id)
      .map((m) => ({
        personId: m.person_id as string,
        personName: people.get(m.person_id as string) ?? "—",
        reason: m.inclusion_reason as string | null,
      }))
      .sort((a, b) => a.personName.localeCompare(b.personName)),
  }));
}

export async function getPerformanceEvaluation(
  organizationId: string, evaluationId: string
): Promise<PerformanceEvaluationRow | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("quality_performance_evaluations")
    .select(`id, cycle_id, person_id, position_id, evaluator_person_id,
             evaluated_on, summary, context_note, status`)
    .eq("organization_id", organizationId)
    .eq("id", evaluationId)
    .maybeSingle();
  if (error) throw new Error(fail(error, "No se pudo leer la evaluación."));
  if (!data) return null;

  const [{ data: cycle }, people, { data: items }] = await Promise.all([
    supabase.from("quality_performance_cycles").select("name")
      .eq("organization_id", organizationId).eq("id", data.cycle_id).maybeSingle(),
    personNames(
      organizationId,
      [data.person_id, data.evaluator_person_id].filter((v): v is string => Boolean(v))
    ),
    supabase.from("quality_performance_items")
      .select("id, subject_kind, criterion, competency_id, result, observation")
      .eq("organization_id", organizationId).eq("evaluation_id", evaluationId),
  ]);

  return {
    id: data.id, cycleId: data.cycle_id, cycleName: cycle?.name ?? "—",
    personId: data.person_id, personName: people.get(data.person_id) ?? "—",
    positionId: data.position_id, evaluatorPersonId: data.evaluator_person_id,
    evaluatorName: data.evaluator_person_id ? people.get(data.evaluator_person_id) ?? null : null,
    evaluatedOn: data.evaluated_on, summary: data.summary, contextNote: data.context_note,
    status: data.status as EvaluationStatus,
    items: (items ?? []).map((i) => ({
      id: i.id as string,
      subjectKind: i.subject_kind as PerformanceItemRow["subjectKind"],
      criterion: i.criterion as string,
      competencyId: i.competency_id as string | null,
      result: i.result as PerformanceResult,
      observation: i.observation as string | null,
    })),
  };
}

export async function listPerformanceEvaluations(
  organizationId: string, filters: { cycleId?: string; personId?: string } = {}
): Promise<Omit<PerformanceEvaluationRow, "items">[]> {
  const supabase = await createServerClient();
  let q = supabase
    .from("quality_performance_evaluations")
    .select(`id, cycle_id, person_id, position_id, evaluator_person_id,
             evaluated_on, summary, context_note, status`)
    .eq("organization_id", organizationId);
  if (filters.cycleId) q = q.eq("cycle_id", filters.cycleId);
  if (filters.personId) q = q.eq("person_id", filters.personId);
  const { data, error } = await q.order("evaluated_on", { ascending: false, nullsFirst: false });
  if (error) throw new Error(fail(error, "No se pudieron leer las evaluaciones."));
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const people = await personNames(
    organizationId,
    rows.flatMap((r) => [r.person_id, r.evaluator_person_id]).filter((v): v is string => Boolean(v))
  );
  const { data: cycles } = await supabase
    .from("quality_performance_cycles").select("id, name")
    .eq("organization_id", organizationId)
    .in("id", [...new Set(rows.map((r) => r.cycle_id as string))]);
  const cycleNames = new Map((cycles ?? []).map((c) => [c.id as string, c.name as string]));

  return rows.map((r) => ({
    id: r.id, cycleId: r.cycle_id, cycleName: cycleNames.get(r.cycle_id) ?? "—",
    personId: r.person_id, personName: people.get(r.person_id) ?? "—",
    positionId: r.position_id, evaluatorPersonId: r.evaluator_person_id,
    evaluatorName: r.evaluator_person_id ? people.get(r.evaluator_person_id) ?? null : null,
    evaluatedOn: r.evaluated_on, summary: r.summary, contextNote: r.context_note,
    status: r.status as EvaluationStatus,
  }));
}

// ===========================================================================
// Conocimiento (§42–§46)
// ===========================================================================

export type KnowledgeHolderRow = {
  id: string; personId: string; personName: string; holderLevel: HolderLevel;
  isPrimaryHolder: boolean; sinceOn: string | null; untilOn: string | null;
  note: string | null;
};

export type KnowledgeSignalRow = {
  id: string; signalKind: KnowledgeSignalKind; detail: string | null;
  status: "open" | "resolved" | "dismissed"; riskId: string | null;
  firstSeenAt: string; lastSeenAt: string;
};

export type TransferItemRow = {
  id: string; activity: string; targetPersonId: string | null; targetPersonName: string | null;
  dueOn: string | null; status: "pending" | "in_progress" | "done" | "cancelled";
  evidenceNote: string | null; completedOn: string | null;
};

export type TransferPlanRow = {
  id: string; title: string; method: TransferMethod; objective: string | null;
  sourcePersonId: string | null; sourcePersonName: string | null;
  targetDate: string | null; status: TransferStatus;
  verifiedOn: string | null; verificationNote: string | null;
  items: TransferItemRow[];
};

export type KnowledgeItemRow = {
  id: string; title: string; description: string | null; knowledgeKind: KnowledgeKind;
  criticality: Criticality; criticalityNote: string | null;
  documentationStatus: DocumentationStatus; processId: string | null;
  status: "active" | "retired";
  holders: KnowledgeHolderRow[];
  signals: KnowledgeSignalRow[];
  transfers: TransferPlanRow[];
};

export async function listKnowledgeItems(
  organizationId: string, filters: { criticality?: string; status?: string } = {}
): Promise<KnowledgeItemRow[]> {
  const supabase = await createServerClient();
  let q = supabase
    .from("quality_knowledge_items")
    .select(`id, title, description, knowledge_kind, criticality, criticality_note,
             documentation_status, process_id, status`)
    .eq("organization_id", organizationId);
  if (filters.criticality) q = q.eq("criticality", filters.criticality);
  if (filters.status) q = q.eq("status", filters.status);
  const { data, error } = await q.order("title");
  if (error) throw new Error(fail(error, "No se pudo leer el conocimiento."));
  const rows = data ?? [];
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id as string);
  const [holders, signals, transfers] = await Promise.all([
    listHoldersFor(organizationId, ids),
    listSignalsFor(organizationId, ids),
    listTransfersFor(organizationId, ids),
  ]);
  return rows.map((r) => ({
    id: r.id, title: r.title, description: r.description,
    knowledgeKind: r.knowledge_kind as KnowledgeKind,
    criticality: r.criticality as Criticality, criticalityNote: r.criticality_note,
    documentationStatus: r.documentation_status as DocumentationStatus,
    processId: r.process_id, status: r.status as "active" | "retired",
    holders: holders.get(r.id) ?? [],
    signals: signals.get(r.id) ?? [],
    transfers: transfers.get(r.id) ?? [],
  }));
}

async function listHoldersFor(
  organizationId: string, itemIds: readonly string[]
): Promise<Map<string, KnowledgeHolderRow[]>> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("quality_knowledge_holders")
    .select(`id, knowledge_item_id, person_id, holder_level, is_primary_holder,
             since_on, until_on, note`)
    .eq("organization_id", organizationId)
    .in("knowledge_item_id", [...itemIds]);
  const rows = data ?? [];
  const people = await personNames(organizationId, rows.map((r) => r.person_id as string));
  const out = new Map<string, KnowledgeHolderRow[]>();
  for (const r of rows) {
    const key = r.knowledge_item_id as string;
    const list = out.get(key) ?? [];
    list.push({
      id: r.id as string, personId: r.person_id as string,
      personName: people.get(r.person_id as string) ?? "—",
      holderLevel: r.holder_level as HolderLevel,
      isPrimaryHolder: Boolean(r.is_primary_holder),
      sinceOn: r.since_on as string | null, untilOn: r.until_on as string | null,
      note: r.note as string | null,
    });
    out.set(key, list);
  }
  return out;
}

async function listSignalsFor(
  organizationId: string, itemIds: readonly string[]
): Promise<Map<string, KnowledgeSignalRow[]>> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("quality_knowledge_signals")
    .select("id, knowledge_item_id, signal_kind, detail, status, risk_id, first_seen_at, last_seen_at")
    .eq("organization_id", organizationId)
    .in("knowledge_item_id", [...itemIds]);
  const out = new Map<string, KnowledgeSignalRow[]>();
  for (const r of data ?? []) {
    const key = r.knowledge_item_id as string;
    const list = out.get(key) ?? [];
    list.push({
      id: r.id as string, signalKind: r.signal_kind as KnowledgeSignalKind,
      detail: r.detail as string | null,
      status: r.status as "open" | "resolved" | "dismissed",
      riskId: r.risk_id as string | null,
      firstSeenAt: r.first_seen_at as string, lastSeenAt: r.last_seen_at as string,
    });
    out.set(key, list);
  }
  return out;
}

async function listTransfersFor(
  organizationId: string, itemIds: readonly string[]
): Promise<Map<string, TransferPlanRow[]>> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("quality_knowledge_transfer_plans")
    .select(`id, knowledge_item_id, title, method, objective, source_person_id,
             target_date, status, verified_on, verification_note`)
    .eq("organization_id", organizationId)
    .in("knowledge_item_id", [...itemIds]);
  const plans = data ?? [];
  if (plans.length === 0) return new Map();

  const { data: itemRows } = await supabase
    .from("quality_knowledge_transfer_items")
    .select(`id, transfer_plan_id, activity, target_person_id, due_on, status,
             evidence_note, completed_on`)
    .eq("organization_id", organizationId)
    .in("transfer_plan_id", plans.map((p) => p.id as string));

  const people = await personNames(organizationId, [
    ...plans.map((p) => p.source_person_id).filter((v): v is string => Boolean(v)),
    ...(itemRows ?? []).map((i) => i.target_person_id).filter((v): v is string => Boolean(v)),
  ]);

  const out = new Map<string, TransferPlanRow[]>();
  for (const p of plans) {
    const key = p.knowledge_item_id as string;
    const list = out.get(key) ?? [];
    list.push({
      id: p.id as string, title: p.title as string, method: p.method as TransferMethod,
      objective: p.objective as string | null,
      sourcePersonId: p.source_person_id as string | null,
      sourcePersonName: p.source_person_id
        ? people.get(p.source_person_id as string) ?? null : null,
      targetDate: p.target_date as string | null,
      status: p.status as TransferStatus,
      verifiedOn: p.verified_on as string | null,
      verificationNote: p.verification_note as string | null,
      items: (itemRows ?? [])
        .filter((i) => i.transfer_plan_id === p.id)
        .map((i) => ({
          id: i.id as string, activity: i.activity as string,
          targetPersonId: i.target_person_id as string | null,
          targetPersonName: i.target_person_id
            ? people.get(i.target_person_id as string) ?? null : null,
          dueOn: i.due_on as string | null,
          status: i.status as TransferItemRow["status"],
          evidenceNote: i.evidence_note as string | null,
          completedOn: i.completed_on as string | null,
        })),
    });
    out.set(key, list);
  }
  return out;
}

export type ContinuityRow = {
  knowledgeItemId: string; title: string; knowledgeKind: KnowledgeKind;
  criticality: Criticality; documentationStatus: DocumentationStatus;
  holderCount: number; primaryHolderName: string | null;
  continuityAttention: boolean; openTransferCount: number;
};

export async function getKnowledgeContinuity(organizationId: string): Promise<ContinuityRow[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("v_quality_knowledge_continuity")
    .select(`knowledge_item_id, title, knowledge_kind, criticality, documentation_status,
             holder_count, primary_holder_name, continuity_attention, open_transfer_count`)
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .order("title");
  if (error) throw new Error(fail(error, "No se pudo leer la continuidad del conocimiento."));
  return (data ?? []).map((r) => ({
    knowledgeItemId: r.knowledge_item_id, title: r.title,
    knowledgeKind: r.knowledge_kind as KnowledgeKind,
    criticality: r.criticality as Criticality,
    documentationStatus: r.documentation_status as DocumentationStatus,
    holderCount: Number(r.holder_count ?? 0),
    primaryHolderName: r.primary_holder_name,
    continuityAttention: Boolean(r.continuity_attention),
    openTransferCount: Number(r.open_transfer_count ?? 0),
  }));
}

// ===========================================================================
// Lecciones aprendidas (§47, §48)
// ===========================================================================

export type LessonProposalRow = {
  id: string; proposalKind: ProposalKind; summary: string; status: ProposalStatus;
  decisionNote: string | null; decidedAt: string | null;
  outcomeKind: string | null; outcomeId: string | null;
  targetDocumentId: string | null; targetProcessId: string | null;
  targetCompetencyId: string | null; targetPositionId: string | null;
};

export type LessonRow = {
  id: string; code: string | null; title: string;
  whatHappened: string; whatWasLearned: string;
  applicableContext: string | null; recommendation: string | null;
  origin: LessonOrigin; caseId: string | null; actionId: string | null;
  riskId: string | null; processId: string | null;
  occurredOn: string | null; status: LessonStatus;
  proposals: LessonProposalRow[];
};

export async function listLessons(
  organizationId: string, filters: { status?: string } = {}
): Promise<LessonRow[]> {
  const supabase = await createServerClient();
  let q = supabase
    .from("quality_lessons_learned")
    .select(`id, code, title, what_happened, what_was_learned, applicable_context,
             recommendation, origin_kind, case_id, action_id, risk_id, process_id,
             occurred_on, status`)
    .eq("organization_id", organizationId);
  if (filters.status) q = q.eq("status", filters.status);
  const { data, error } = await q.order("occurred_on", { ascending: false, nullsFirst: false });
  if (error) throw new Error(fail(error, "No se pudieron leer las lecciones."));
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const { data: proposals } = await supabase
    .from("quality_lesson_proposals")
    .select(`id, lesson_id, proposal_kind, summary, status, decision_note, decided_at,
             outcome_kind, outcome_id, target_document_id, target_process_id,
             target_competency_id, target_position_id`)
    .eq("organization_id", organizationId)
    .in("lesson_id", rows.map((r) => r.id as string));

  return rows.map((r) => ({
    id: r.id, code: r.code, title: r.title,
    whatHappened: r.what_happened, whatWasLearned: r.what_was_learned,
    applicableContext: r.applicable_context, recommendation: r.recommendation,
    origin: r.origin_kind as LessonOrigin, caseId: r.case_id, actionId: r.action_id,
    riskId: r.risk_id, processId: r.process_id,
    occurredOn: r.occurred_on, status: r.status as LessonStatus,
    proposals: (proposals ?? [])
      .filter((p) => p.lesson_id === r.id)
      .map((p) => ({
        id: p.id as string, proposalKind: p.proposal_kind as ProposalKind,
        summary: p.summary as string, status: p.status as ProposalStatus,
        decisionNote: p.decision_note as string | null,
        decidedAt: p.decided_at as string | null,
        outcomeKind: p.outcome_kind as string | null,
        outcomeId: p.outcome_id as string | null,
        targetDocumentId: p.target_document_id as string | null,
        targetProcessId: p.target_process_id as string | null,
        targetCompetencyId: p.target_competency_id as string | null,
        targetPositionId: p.target_position_id as string | null,
      })),
  }));
}

// ===========================================================================
// Ficha completa de una persona (§14)
// ===========================================================================

export type PersonFile = {
  person: PersonRow;
  assignments: AssignmentRow[];
  competencies: PersonCompetenceRow[];
  needs: DevelopmentNeedRow[];
  participations: { activityTitle: string; activityId: string; participant: ParticipantRow }[];
  knowledge: { knowledgeItemId: string; title: string; criticality: Criticality;
               holderLevel: HolderLevel; isPrimaryHolder: boolean }[];
  evaluations: Omit<PerformanceEvaluationRow, "items">[];
};

/**
 * La ficha se compone de consultas independientes y CADA UNA pasa por RLS.
 *
 * Eso significa que quien no puede ver las evaluaciones recibe la ficha sin
 * ellas, no un error: la pantalla enseña lo que corresponde y no filtra por
 * omisión lo que no. §63 · el PDF hereda exactamente lo mismo, porque se
 * construye desde aquí.
 */
export async function getPersonFile(
  organizationId: string, personId: string
): Promise<PersonFile | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("quality_people")
    .select(`id, full_name, employee_code, work_email, profile_id,
             relationship, status, joined_on, left_on, notes`)
    .eq("organization_id", organizationId)
    .eq("id", personId)
    .maybeSingle();
  if (error) throw new Error(fail(error, "No se pudo leer la ficha."));
  if (!data) return null;

  const [assignments, competencies, needs, evaluations] = await Promise.all([
    listAssignments(organizationId, { personId }),
    listPersonCompetencies(organizationId, personId),
    listDevelopmentNeeds(organizationId, { personId }),
    listPerformanceEvaluations(organizationId, { personId }),
  ]);

  const { data: participantRows } = await supabase
    .from("quality_learning_participants")
    .select(`id, activity_id, person_id, attendance_status, attendance_note,
             learning_result, learning_method, learning_note, evaluated_on`)
    .eq("organization_id", organizationId)
    .eq("person_id", personId);

  const activityIds = [...new Set((participantRows ?? []).map((p) => p.activity_id as string))];
  const { data: activityRows } = activityIds.length > 0
    ? await supabase.from("quality_learning_activities").select("id, title")
        .eq("organization_id", organizationId).in("id", activityIds)
    : { data: [] };
  const activityTitles = new Map(
    (activityRows ?? []).map((a) => [a.id as string, a.title as string])
  );

  const { data: holderRows } = await supabase
    .from("quality_knowledge_holders")
    .select("knowledge_item_id, holder_level, is_primary_holder")
    .eq("organization_id", organizationId)
    .eq("person_id", personId)
    .is("until_on", null);
  const knowledgeIds = [...new Set((holderRows ?? []).map((h) => h.knowledge_item_id as string))];
  const { data: knowledgeRows } = knowledgeIds.length > 0
    ? await supabase.from("quality_knowledge_items").select("id, title, criticality")
        .eq("organization_id", organizationId).in("id", knowledgeIds)
    : { data: [] };
  const knowledgeById = new Map(
    (knowledgeRows ?? []).map((k) => [k.id as string, k as Record<string, string>])
  );

  return {
    person: mapPerson(data),
    assignments,
    competencies,
    needs,
    participations: (participantRows ?? []).map((p) => ({
      activityId: p.activity_id as string,
      activityTitle: activityTitles.get(p.activity_id as string) ?? "—",
      participant: {
        id: p.id as string, personId: p.person_id as string,
        personName: data.full_name as string,
        attendance: p.attendance_status as AttendanceStatus,
        attendanceNote: p.attendance_note as string | null,
        learningResult: p.learning_result as LearningResult,
        learningMethod: p.learning_method as string | null,
        learningNote: p.learning_note as string | null,
        evaluatedOn: p.evaluated_on as string | null,
      },
    })),
    knowledge: (holderRows ?? []).map((h) => ({
      knowledgeItemId: h.knowledge_item_id as string,
      title: knowledgeById.get(h.knowledge_item_id as string)?.title ?? "—",
      criticality: (knowledgeById.get(h.knowledge_item_id as string)?.criticality
        ?? "medium") as Criticality,
      holderLevel: h.holder_level as HolderLevel,
      isPrimaryHolder: Boolean(h.is_primary_holder),
    })),
    evaluations,
  };
}

// ===========================================================================
// Señales para Quality Home (§67)
// ===========================================================================

export type PeopleSignals = {
  pendingEvaluations: number;
  expiringEvidence: number;
  concentratedKnowledge: number;
  criticalPositionsVacant: number;
  openTransfers: number;
};

/**
 * §67 · Solo cinco números, y ninguno es un dato personal.
 *
 * «2 evaluaciones pendientes» es útil en una portada; «Ana no ha sido
 * evaluada» no lo es: quien tenga permiso para saberlo entra a la pantalla.
 */
export async function getPeopleSignals(organizationId: string): Promise<PeopleSignals> {
  const supabase = await createServerClient();
  const in30 = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

  const [cycles, evidence, continuity, chart, transfers] = await Promise.all([
    supabase.from("quality_performance_cycles").select("id")
      .eq("organization_id", organizationId).eq("status", "open"),
    supabase.from("quality_competency_evidence").select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId).lte("expires_on", in30).not("expires_on", "is", null),
    supabase.from("v_quality_knowledge_continuity").select("continuity_attention")
      .eq("organization_id", organizationId).eq("continuity_attention", true),
    supabase.from("v_quality_org_chart").select("position_id, is_critical, is_active, holder_count")
      .eq("organization_id", organizationId).eq("is_critical", true).eq("is_active", true),
    supabase.from("quality_knowledge_transfer_plans").select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId).in("status", ["draft", "active"]),
  ]);

  let pendingEvaluations = 0;
  const openCycleIds = (cycles.data ?? []).map((c) => c.id as string);
  if (openCycleIds.length > 0) {
    const { data: members } = await supabase
      .from("quality_performance_cycle_members").select("cycle_id, person_id")
      .eq("organization_id", organizationId).in("cycle_id", openCycleIds);
    const { data: closed } = await supabase
      .from("quality_performance_evaluations").select("cycle_id, person_id")
      .eq("organization_id", organizationId).in("cycle_id", openCycleIds).eq("status", "closed");
    const done = new Set((closed ?? []).map((e) => `${e.cycle_id}:${e.person_id}`));
    pendingEvaluations = (members ?? [])
      .filter((m) => !done.has(`${m.cycle_id}:${m.person_id}`)).length;
  }

  return {
    pendingEvaluations,
    expiringEvidence: evidence.count ?? 0,
    concentratedKnowledge: (continuity.data ?? []).length,
    criticalPositionsVacant: (chart.data ?? [])
      .filter((p) => Number(p.holder_count ?? 0) === 0).length,
    openTransfers: transfers.count ?? 0,
  };
}

// ===========================================================================
// Offboarding (§50, §77)
// ===========================================================================

export type OffboardingReport = {
  positionsLeftWithoutHolder: { position_id: string; name: string; is_critical: boolean }[];
  knowledgeLeftConcentrated: {
    knowledge_item_id: string; title: string; criticality: string; holder_count: number;
  }[];
  pendingTransfers: {
    transfer_plan_id: string; title: string; status: string; target_date: string | null;
  }[];
  openTasks: { task_id: string; title: string; due_at: string | null }[];
};

export async function getOffboardingReport(
  organizationId: string, personId: string
): Promise<OffboardingReport> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("quality_offboarding_report", {
    p_organization_id: organizationId, p_person_id: personId,
  });
  if (error) throw new Error(fail(error, "No se pudo revisar qué queda descubierto."));
  const r = (data ?? {}) as Record<string, unknown>;
  return {
    positionsLeftWithoutHolder: (r.positions_left_without_holder ?? []) as OffboardingReport["positionsLeftWithoutHolder"],
    knowledgeLeftConcentrated: (r.knowledge_left_concentrated ?? []) as OffboardingReport["knowledgeLeftConcentrated"],
    pendingTransfers: (r.pending_transfers ?? []) as OffboardingReport["pendingTransfers"],
    openTasks: (r.open_tasks ?? []) as OffboardingReport["openTasks"],
  };
}

// ---------------------------------------------------------------------------
// Utilidad usada por `today` en pantallas y adaptadores.
// ---------------------------------------------------------------------------
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// ===========================================================================
// ESCRITURA
// ---------------------------------------------------------------------------
// Lo que solo REGISTRA es escritura normal bajo RLS. Lo que DECIDE —publicar
// un perfil, declarar competencia, cerrar una evaluación, verificar una
// transferencia, promover una señal— pasa por la RPC de 0123, que comprueba
// rol, estado e invariante en el mismo acto.
// ===========================================================================

export async function createOrgUnit(
  organizationId: string,
  input: { name: string; code: string | null; description: string | null; parentId: string | null }
): Promise<string> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("quality_org_units")
    .insert({
      organization_id: organizationId, name: input.name, code: input.code,
      description: input.description, parent_id: input.parentId,
    })
    .select("id").single();
  if (error) throw new Error(fail(error, "No se pudo crear la unidad."));
  return data.id as string;
}

export async function updateOrgUnit(
  organizationId: string, id: string,
  input: { name: string; code: string | null; description: string | null;
           parentId: string | null; isActive: boolean }
): Promise<void> {
  const supabase = await createServerClient();
  const { error } = await supabase
    .from("quality_org_units")
    .update({
      name: input.name, code: input.code, description: input.description,
      parent_id: input.parentId, is_active: input.isActive,
    })
    .eq("organization_id", organizationId).eq("id", id);
  if (error) throw new Error(fail(error, "No se pudo actualizar la unidad."));
}

/** §9 · Un cargo puede colgar de una unidad y de otro cargo, y puede ser
 *  crítico. Los tres campos son de QUALITY-06 sobre la tabla de QUALITY-01. */
export async function updatePositionStructure(
  organizationId: string, positionId: string,
  input: { orgUnitId: string | null; parentPositionId: string | null; isCritical: boolean }
): Promise<void> {
  const supabase = await createServerClient();
  const { error } = await supabase
    .from("quality_positions")
    .update({
      org_unit_id: input.orgUnitId,
      parent_position_id: input.parentPositionId,
      is_critical: input.isCritical,
    })
    .eq("organization_id", organizationId).eq("id", positionId);
  if (error) throw new Error(fail(error, "No se pudo actualizar el cargo."));
}

// --- Personas ---------------------------------------------------------------

export async function createPerson(
  organizationId: string,
  input: {
    fullName: string; employeeCode: string | null; workEmail: string | null;
    profileId: string | null; relationship: PersonRelationship;
    joinedOn: string | null; notes: string | null;
  }
): Promise<string> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("quality_people")
    .insert({
      organization_id: organizationId, full_name: input.fullName,
      employee_code: input.employeeCode, work_email: input.workEmail,
      profile_id: input.profileId, relationship: input.relationship,
      joined_on: input.joinedOn, notes: input.notes, status: "active",
    })
    .select("id").single();
  if (error) throw new Error(fail(error, "No se pudo crear la persona."));
  return data.id as string;
}

export async function updatePerson(
  organizationId: string, personId: string,
  input: {
    fullName: string; employeeCode: string | null; workEmail: string | null;
    profileId: string | null; relationship: PersonRelationship; notes: string | null;
  }
): Promise<void> {
  const supabase = await createServerClient();
  const { error } = await supabase
    .from("quality_people")
    .update({
      full_name: input.fullName, employee_code: input.employeeCode,
      work_email: input.workEmail, profile_id: input.profileId,
      relationship: input.relationship, notes: input.notes,
    })
    .eq("organization_id", organizationId).eq("id", personId);
  if (error) throw new Error(fail(error, "No se pudo actualizar la persona."));
}

/**
 * §50 · Desvincular NO es borrar.
 *
 * La persona pasa a `former` con su fecha, y todo lo que hizo sigue en pie.
 * Borrarla dejaría huérfanos actos que ella ejecutó, y el sistema perdería la
 * capacidad de responder quién hizo qué.
 */
export async function retirePerson(
  organizationId: string, personId: string, leftOn: string
): Promise<void> {
  const supabase = await createServerClient();
  const { error } = await supabase
    .from("quality_people")
    .update({ status: "former", left_on: leftOn })
    .eq("organization_id", organizationId).eq("id", personId);
  if (error) throw new Error(fail(error, "No se pudo desvincular a la persona."));
}

export async function assignPersonToPosition(
  organizationId: string,
  input: {
    personId: string; positionId: string; assignmentType: AssignmentType;
    effectiveFrom: string; notes: string | null;
  }
): Promise<string> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("quality_position_assignments")
    .insert({
      organization_id: organizationId, person_id: input.personId,
      position_id: input.positionId, assignment_type: input.assignmentType,
      effective_from: input.effectiveFrom, notes: input.notes,
    })
    .select("id").single();
  if (error) throw new Error(fail(error, "No se pudo asignar el cargo."));
  return data.id as string;
}

/**
 * §16 · Terminar una asignación pone su fecha final; NO la sobrescribe.
 *
 * Es la diferencia entre «Ana ocupó el cargo hasta junio» y «el cargo siempre
 * lo ocupó Carlos», que es lo que ocurriría si se editara la fila.
 */
export async function endAssignment(
  organizationId: string, assignmentId: string, effectiveTo: string
): Promise<void> {
  const supabase = await createServerClient();
  const { error } = await supabase
    .from("quality_position_assignments")
    .update({ effective_to: effectiveTo })
    .eq("organization_id", organizationId).eq("id", assignmentId);
  if (error) throw new Error(fail(error, "No se pudo cerrar la asignación."));
}

// --- Perfiles de cargo ------------------------------------------------------

export async function createPositionVersionDraft(
  organizationId: string, positionId: string,
  input: {
    purpose: string | null; scope: string | null; authority: string | null;
    education: string | null; experience: string | null; changeNote: string | null;
  }
): Promise<string> {
  const supabase = await createServerClient();
  const { data: existing } = await supabase
    .from("quality_position_versions").select("version_number")
    .eq("organization_id", organizationId).eq("position_id", positionId)
    .order("version_number", { ascending: false }).limit(1);
  const next = Number(existing?.[0]?.version_number ?? 0) + 1;

  const { data, error } = await supabase
    .from("quality_position_versions")
    .insert({
      organization_id: organizationId, position_id: positionId,
      version_number: next, status: "draft",
      purpose: input.purpose, scope: input.scope, authority: input.authority,
      education: input.education, experience: input.experience,
      change_note: input.changeNote,
    })
    .select("id").single();
  if (error) throw new Error(fail(error, "No se pudo crear el borrador del perfil."));
  return data.id as string;
}

export async function publishPositionVersion(
  versionId: string, effectiveFrom: string, changeNote: string | null
): Promise<void> {
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("quality_publish_position_version", {
    p_version_id: versionId, p_effective_from: effectiveFrom, p_change_note: changeNote,
  });
  if (error) throw new Error(fail(error, "No se pudo publicar el perfil."));
}

export async function addPositionFunction(
  organizationId: string, versionId: string,
  input: { description: string; kind: PositionFunctionKind; processId: string | null; order: number }
): Promise<void> {
  const supabase = await createServerClient();
  const { error } = await supabase
    .from("quality_position_functions")
    .insert({
      organization_id: organizationId, position_version_id: versionId,
      description: input.description, function_kind: input.kind,
      process_id: input.processId, position_order: input.order,
    });
  if (error) throw new Error(fail(error, "No se pudo añadir la función."));
}

export async function removePositionFunction(
  organizationId: string, functionId: string
): Promise<void> {
  const supabase = await createServerClient();
  const { error } = await supabase
    .from("quality_position_functions").delete()
    .eq("organization_id", organizationId).eq("id", functionId);
  if (error) throw new Error(fail(error, "No se pudo quitar la función."));
}

// --- Competencia ------------------------------------------------------------

export async function createCompetency(
  organizationId: string,
  input: { name: string; code: string | null; description: string | null; category: string | null }
): Promise<string> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("quality_competencies")
    .insert({
      organization_id: organizationId, name: input.name, code: input.code,
      description: input.description, category: input.category,
    })
    .select("id").single();
  if (error) throw new Error(fail(error, "No se pudo crear la competencia."));
  return data.id as string;
}

export async function seedCompetencyLevels(organizationId: string): Promise<number> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("quality_seed_competency_levels", {
    p_organization_id: organizationId,
  });
  if (error) throw new Error(fail(error, "No se pudo crear la escala."));
  return Number(data ?? 0);
}

export async function upsertCompetencyLevel(
  organizationId: string,
  input: { id?: string; value: number; label: string; description: string | null }
): Promise<void> {
  const supabase = await createServerClient();
  if (input.id) {
    const { error } = await supabase
      .from("quality_competency_levels")
      .update({ level_value: input.value, label: input.label, description: input.description })
      .eq("organization_id", organizationId).eq("id", input.id);
    if (error) throw new Error(fail(error, "No se pudo actualizar el nivel."));
    return;
  }
  const { error } = await supabase
    .from("quality_competency_levels")
    .insert({
      organization_id: organizationId, level_value: input.value,
      label: input.label, description: input.description,
    });
  if (error) throw new Error(fail(error, "No se pudo crear el nivel."));
}

/**
 * §20 · El requisito cuelga de la VERSIÓN del cargo, no del cargo.
 *
 * Es lo que hace que PC-23 se cumpla por construcción: cuando el perfil cambia
 * y se publica una versión nueva, la anterior conserva sus requisitos y una
 * evaluación de 2025 se sigue leyendo contra los de 2025.
 */
export async function setPositionRequirement(
  organizationId: string,
  input: {
    positionVersionId: string; competencyId: string; requiredLevel: number;
    isMandatory: boolean; note: string | null;
  }
): Promise<void> {
  const supabase = await createServerClient();
  const { error } = await supabase
    .from("quality_competency_requirements")
    .upsert({
      organization_id: organizationId,
      position_version_id: input.positionVersionId,
      competency_id: input.competencyId,
      required_level: input.requiredLevel,
      is_mandatory: input.isMandatory,
      note: input.note,
    }, { onConflict: "position_version_id,competency_id" });
  if (error) throw new Error(fail(error, "No se pudo fijar el requisito."));
}

export async function removePositionRequirement(
  organizationId: string, requirementId: string
): Promise<void> {
  const supabase = await createServerClient();
  const { error } = await supabase
    .from("quality_competency_requirements").delete()
    .eq("organization_id", organizationId).eq("id", requirementId);
  if (error) throw new Error(fail(error, "No se pudo quitar el requisito."));
}

export async function recordPersonCompetence(input: {
  personId: string; competencyId: string; level: number; method: CompetenceMethod;
  rationale: string | null; assessedOn: string; validUntil: string | null;
}): Promise<string> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("quality_record_person_competence", {
    p_person_id: input.personId, p_competency_id: input.competencyId,
    p_level: input.level, p_method: input.method, p_rationale: input.rationale,
    p_assessed_on: input.assessedOn, p_valid_until: input.validUntil,
  });
  if (error) throw new Error(fail(error, "No se pudo registrar la competencia."));
  return data as string;
}

export async function addCompetenceEvidence(
  organizationId: string,
  input: {
    personCompetencyId: string; kind: string; title: string; issuer: string | null;
    issuedOn: string | null; expiresOn: string | null; referenceNote: string | null;
    documentId: string | null;
  }
): Promise<void> {
  const supabase = await createServerClient();
  const { error } = await supabase
    .from("quality_competency_evidence")
    .insert({
      organization_id: organizationId,
      person_competency_id: input.personCompetencyId,
      evidence_kind: input.kind, title: input.title, issuer: input.issuer,
      issued_on: input.issuedOn, expires_on: input.expiresOn,
      reference_note: input.referenceNote, trazadoc_document_id: input.documentId,
    });
  if (error) throw new Error(fail(error, "No se pudo añadir la evidencia."));
}

// --- Desarrollo -------------------------------------------------------------

export async function createDevelopmentNeed(
  organizationId: string,
  input: {
    title: string; description: string | null; origin: NeedOrigin;
    personId: string | null; positionId: string | null; competencyId: string | null;
    originNote: string | null; priority: string;
  }
): Promise<string> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("quality_development_needs")
    .insert({
      organization_id: organizationId, title: input.title, description: input.description,
      origin_kind: input.origin, person_id: input.personId, position_id: input.positionId,
      competency_id: input.competencyId, origin_note: input.originNote,
      priority: input.priority,
    })
    .select("id").single();
  if (error) throw new Error(fail(error, "No se pudo crear la necesidad."));
  return data.id as string;
}

export async function createDevelopmentPlan(
  organizationId: string,
  input: { year: number; title: string; objective: string | null }
): Promise<string> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("quality_development_plans")
    .insert({
      organization_id: organizationId, year: input.year,
      title: input.title, objective: input.objective,
    })
    .select("id").single();
  if (error) throw new Error(fail(error, "No se pudo crear el plan."));
  return data.id as string;
}

/**
 * §29 · Un item se puede añadir en septiembre sin que el plan deje de ser el
 * plan del año. `added_on` y `added_reason` conservan cuándo entró y por qué,
 * que es lo que distingue un plan vivo de uno congelado en enero.
 */
export async function addPlanItem(
  organizationId: string,
  input: {
    planId: string; title: string; developmentKind: DevelopmentKind;
    personId: string | null; positionId: string | null; competencyId: string | null;
    needId: string | null; targetDate: string | null; addedReason: string | null;
  }
): Promise<string> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("quality_development_plan_items")
    .insert({
      organization_id: organizationId, plan_id: input.planId, title: input.title,
      development_kind: input.developmentKind, person_id: input.personId,
      position_id: input.positionId, competency_id: input.competencyId,
      need_id: input.needId, target_date: input.targetDate,
      added_reason: input.addedReason,
    })
    .select("id").single();
  if (error) throw new Error(fail(error, "No se pudo añadir el item al plan."));
  return data.id as string;
}

export async function createLearningActivity(
  organizationId: string,
  input: {
    title: string; activityKind: ActivityKind; provider: string | null;
    description: string | null; startsOn: string | null; endsOn: string | null;
    durationHours: number | null; planItemId: string | null;
  }
): Promise<string> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("quality_learning_activities")
    .insert({
      organization_id: organizationId, title: input.title,
      activity_kind: input.activityKind, provider: input.provider,
      description: input.description, starts_on: input.startsOn,
      ends_on: input.endsOn, duration_hours: input.durationHours,
      plan_item_id: input.planItemId,
    })
    .select("id").single();
  if (error) throw new Error(fail(error, "No se pudo crear la actividad."));
  return data.id as string;
}

export async function setActivityStatus(
  organizationId: string, activityId: string,
  status: "planned" | "in_progress" | "completed" | "cancelled"
): Promise<void> {
  const supabase = await createServerClient();
  const { error } = await supabase
    .from("quality_learning_activities").update({ status })
    .eq("organization_id", organizationId).eq("id", activityId);
  if (error) throw new Error(fail(error, "No se pudo cambiar el estado de la actividad."));
}

export async function addParticipant(
  organizationId: string, activityId: string, personId: string
): Promise<void> {
  const supabase = await createServerClient();
  const { error } = await supabase
    .from("quality_learning_participants")
    .insert({ organization_id: organizationId, activity_id: activityId, person_id: personId });
  if (error) throw new Error(fail(error, "No se pudo inscribir a la persona."));
}

/**
 * §32/§33 · Asistencia y aprendizaje se registran POR SEPARADO.
 *
 * La firma lo obliga: quien marque «asistió» tiene que decir aparte qué pasó
 * con el aprendizaje, y `not_evaluated` es una respuesta legítima. No hay
 * ninguna ruta por la que marcar asistencia rellene el aprendizaje.
 */
export async function recordAttendance(
  organizationId: string, participantId: string,
  input: { attendance: AttendanceStatus; note: string | null }
): Promise<void> {
  const supabase = await createServerClient();
  const { error } = await supabase
    .from("quality_learning_participants")
    .update({ attendance_status: input.attendance, attendance_note: input.note })
    .eq("organization_id", organizationId).eq("id", participantId);
  if (error) throw new Error(fail(error, "No se pudo registrar la asistencia."));
}

export async function recordLearningResult(
  organizationId: string, participantId: string,
  input: { result: LearningResult; method: string | null; note: string | null; evaluatedOn: string }
): Promise<void> {
  const supabase = await createServerClient();
  const { error } = await supabase
    .from("quality_learning_participants")
    .update({
      learning_result: input.result, learning_method: input.method,
      learning_note: input.note, evaluated_on: input.evaluatedOn,
    })
    .eq("organization_id", organizationId).eq("id", participantId);
  if (error) throw new Error(fail(error, "No se pudo registrar el aprendizaje."));
}

/** §35 · El criterio se declara ANTES de juzgar. Por eso crear la evaluación
 *  de eficacia y resolverla son dos actos distintos. */
export async function planEffectivenessReview(
  organizationId: string,
  input: {
    activityId: string | null; planItemId: string | null; personId: string | null;
    criterion: string; method: EffectivenessMethod; indicatorId: string | null;
  }
): Promise<string> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("quality_learning_effectiveness_reviews")
    .insert({
      organization_id: organizationId, activity_id: input.activityId,
      plan_item_id: input.planItemId, person_id: input.personId,
      criterion: input.criterion, method: input.method, indicator_id: input.indicatorId,
    })
    .select("id").single();
  if (error) throw new Error(fail(error, "No se pudo declarar el criterio de eficacia."));
  return data.id as string;
}

export async function reviewEffectiveness(
  reviewId: string, result: EffectivenessResult, observation: string, reviewedOn: string
): Promise<void> {
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("quality_review_learning_effectiveness", {
    p_review_id: reviewId, p_result: result,
    p_observation: observation, p_reviewed_on: reviewedOn,
  });
  if (error) throw new Error(fail(error, "No se pudo evaluar la eficacia."));
}

// --- Desempeño --------------------------------------------------------------

export async function createPerformanceCycle(
  organizationId: string,
  input: { name: string; periodStart: string; periodEnd: string; purpose: string | null }
): Promise<string> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("quality_performance_cycles")
    .insert({
      organization_id: organizationId, name: input.name,
      period_start: input.periodStart, period_end: input.periodEnd,
      purpose: input.purpose,
    })
    .select("id").single();
  if (error) throw new Error(fail(error, "No se pudo crear el ciclo."));
  return data.id as string;
}

export async function setCycleStatus(
  organizationId: string, cycleId: string, status: PerformanceCycleStatus
): Promise<void> {
  const supabase = await createServerClient();
  const { error } = await supabase
    .from("quality_performance_cycles").update({ status })
    .eq("organization_id", organizationId).eq("id", cycleId);
  if (error) throw new Error(fail(error, "No se pudo cambiar el estado del ciclo."));
}

export async function addCycleMember(
  organizationId: string, cycleId: string, personId: string, reason: string | null
): Promise<void> {
  const supabase = await createServerClient();
  const { error } = await supabase
    .from("quality_performance_cycle_members")
    .insert({
      organization_id: organizationId, cycle_id: cycleId,
      person_id: personId, inclusion_reason: reason,
    });
  if (error) throw new Error(fail(error, "No se pudo añadir a la población del ciclo."));
}

export async function createEvaluation(
  organizationId: string,
  input: {
    cycleId: string; personId: string; positionId: string | null;
    evaluatorPersonId: string; contextNote: string | null;
  }
): Promise<string> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("quality_performance_evaluations")
    .insert({
      organization_id: organizationId, cycle_id: input.cycleId,
      person_id: input.personId, position_id: input.positionId,
      evaluator_person_id: input.evaluatorPersonId, context_note: input.contextNote,
    })
    .select("id").single();
  if (error) throw new Error(fail(error, "No se pudo crear la evaluación."));
  return data.id as string;
}

export async function addEvaluationItem(
  organizationId: string,
  input: {
    evaluationId: string; subjectKind: "criterion" | "competency" | "position_function";
    criterion: string; competencyId: string | null; positionFunctionId: string | null;
    result: PerformanceResult; observation: string | null;
  }
): Promise<void> {
  const supabase = await createServerClient();
  const { error } = await supabase
    .from("quality_performance_items")
    .insert({
      organization_id: organizationId, evaluation_id: input.evaluationId,
      subject_kind: input.subjectKind, criterion: input.criterion,
      competency_id: input.competencyId, position_function_id: input.positionFunctionId,
      result: input.result, observation: input.observation,
    });
  if (error) throw new Error(fail(error, "No se pudo añadir la línea de evaluación."));
}

export async function closeEvaluation(evaluationId: string, summary: string): Promise<void> {
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("quality_close_performance_evaluation", {
    p_evaluation_id: evaluationId, p_summary: summary,
  });
  if (error) throw new Error(fail(error, "No se pudo cerrar la evaluación."));
}

// --- Conocimiento -----------------------------------------------------------

export async function createKnowledgeItem(
  organizationId: string,
  input: {
    title: string; description: string | null; knowledgeKind: KnowledgeKind;
    criticality: Criticality; criticalityNote: string | null;
    documentationStatus: DocumentationStatus; processId: string | null;
  }
): Promise<string> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("quality_knowledge_items")
    .insert({
      organization_id: organizationId, title: input.title, description: input.description,
      knowledge_kind: input.knowledgeKind, criticality: input.criticality,
      criticality_note: input.criticalityNote,
      documentation_status: input.documentationStatus, process_id: input.processId,
    })
    .select("id").single();
  if (error) throw new Error(fail(error, "No se pudo crear el conocimiento."));
  return data.id as string;
}

export async function addKnowledgeHolder(
  organizationId: string,
  input: {
    knowledgeItemId: string; personId: string; holderLevel: HolderLevel;
    isPrimaryHolder: boolean; sinceOn: string | null; note: string | null;
  }
): Promise<void> {
  const supabase = await createServerClient();
  const { error } = await supabase
    .from("quality_knowledge_holders")
    .insert({
      organization_id: organizationId, knowledge_item_id: input.knowledgeItemId,
      person_id: input.personId, holder_level: input.holderLevel,
      is_primary_holder: input.isPrimaryHolder, since_on: input.sinceOn, note: input.note,
    });
  if (error) throw new Error(fail(error, "No se pudo registrar a quien lo sostiene."));
}

export async function endKnowledgeHolder(
  organizationId: string, holderId: string, untilOn: string
): Promise<void> {
  const supabase = await createServerClient();
  const { error } = await supabase
    .from("quality_knowledge_holders").update({ until_on: untilOn })
    .eq("organization_id", organizationId).eq("id", holderId);
  if (error) throw new Error(fail(error, "No se pudo cerrar el registro."));
}

export async function createTransferPlan(
  organizationId: string,
  input: {
    knowledgeItemId: string; title: string; method: TransferMethod;
    sourcePersonId: string | null; objective: string | null; targetDate: string | null;
  }
): Promise<string> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("quality_knowledge_transfer_plans")
    .insert({
      organization_id: organizationId, knowledge_item_id: input.knowledgeItemId,
      title: input.title, method: input.method, source_person_id: input.sourcePersonId,
      objective: input.objective, target_date: input.targetDate, status: "active",
    })
    .select("id").single();
  if (error) throw new Error(fail(error, "No se pudo crear el plan de transferencia."));
  return data.id as string;
}

export async function addTransferItem(
  organizationId: string,
  input: {
    transferPlanId: string; activity: string; targetPersonId: string | null;
    dueOn: string | null;
  }
): Promise<void> {
  const supabase = await createServerClient();
  const { error } = await supabase
    .from("quality_knowledge_transfer_items")
    .insert({
      organization_id: organizationId, transfer_plan_id: input.transferPlanId,
      activity: input.activity, target_person_id: input.targetPersonId, due_on: input.dueOn,
    });
  if (error) throw new Error(fail(error, "No se pudo añadir la actividad."));
}

export async function completeTransferItem(
  organizationId: string, itemId: string, evidenceNote: string, completedOn: string
): Promise<void> {
  const supabase = await createServerClient();
  const { error } = await supabase
    .from("quality_knowledge_transfer_items")
    .update({ status: "done", evidence_note: evidenceNote, completed_on: completedOn })
    .eq("organization_id", organizationId).eq("id", itemId);
  if (error) throw new Error(fail(error, "No se pudo cerrar la actividad."));
}

export async function verifyTransfer(
  planId: string, note: string, on: string
): Promise<void> {
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("quality_verify_knowledge_transfer", {
    p_plan_id: planId, p_note: note, p_on: on,
  });
  if (error) throw new Error(fail(error, "No se pudo verificar la transferencia."));
}

/** §45 · Convertir una señal en riesgo formal es una decisión humana. */
export async function promoteSignalToRisk(signalId: string, riskId: string): Promise<void> {
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("quality_promote_knowledge_signal", {
    p_signal_id: signalId, p_risk_id: riskId,
  });
  if (error) throw new Error(fail(error, "No se pudo promover la señal."));
}

export async function dismissSignal(organizationId: string, signalId: string): Promise<void> {
  const supabase = await createServerClient();
  const { error } = await supabase
    .from("quality_knowledge_signals")
    .update({ status: "dismissed", resolved_at: new Date().toISOString() })
    .eq("organization_id", organizationId).eq("id", signalId);
  if (error) throw new Error(fail(error, "No se pudo descartar la señal."));
}

// --- Lecciones --------------------------------------------------------------

export async function createLesson(
  organizationId: string,
  input: {
    title: string; whatHappened: string; whatWasLearned: string;
    applicableContext: string | null; recommendation: string | null;
    origin: LessonOrigin; caseId: string | null; actionId: string | null;
    riskId: string | null; processId: string | null; occurredOn: string | null;
    code: string | null;
  }
): Promise<string> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("quality_lessons_learned")
    .insert({
      organization_id: organizationId, title: input.title, code: input.code,
      what_happened: input.whatHappened, what_was_learned: input.whatWasLearned,
      applicable_context: input.applicableContext, recommendation: input.recommendation,
      origin_kind: input.origin, case_id: input.caseId, action_id: input.actionId,
      risk_id: input.riskId, process_id: input.processId, occurred_on: input.occurredOn,
    })
    .select("id").single();
  if (error) throw new Error(fail(error, "No se pudo registrar la lección."));
  return data.id as string;
}

export async function publishLesson(organizationId: string, lessonId: string): Promise<void> {
  const supabase = await createServerClient();
  const { error } = await supabase
    .from("quality_lessons_learned").update({ status: "published" })
    .eq("organization_id", organizationId).eq("id", lessonId);
  if (error) throw new Error(fail(error, "No se pudo publicar la lección."));
}

export async function addLessonProposal(
  organizationId: string,
  input: {
    lessonId: string; proposalKind: ProposalKind; summary: string;
    targetDocumentId: string | null; targetProcessId: string | null;
    targetCompetencyId: string | null; targetPositionId: string | null;
  }
): Promise<void> {
  const supabase = await createServerClient();
  const { error } = await supabase
    .from("quality_lesson_proposals")
    .insert({
      organization_id: organizationId, lesson_id: input.lessonId,
      proposal_kind: input.proposalKind, summary: input.summary,
      target_document_id: input.targetDocumentId, target_process_id: input.targetProcessId,
      target_competency_id: input.targetCompetencyId, target_position_id: input.targetPositionId,
    });
  if (error) throw new Error(fail(error, "No se pudo añadir la propuesta."));
}

export async function decideLessonProposal(
  proposalId: string, decision: "accepted" | "rejected", note: string | null
): Promise<void> {
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("quality_decide_lesson_proposal", {
    p_proposal_id: proposalId, p_decision: decision, p_note: note,
  });
  if (error) throw new Error(fail(error, "No se pudo decidir sobre la propuesta."));
}

/**
 * §48 · Aceptar una propuesta no aplica nada. Cuando alguien crea de verdad la
 * acción, el documento o la necesidad, se anota AQUÍ qué se creó —para que
 * «la lección cambió el procedimiento» sea comprobable y no una creencia.
 */
export async function recordProposalOutcome(
  organizationId: string, proposalId: string,
  outcome: { kind: "work_action" | "work_task" | "quality_development_need" | "trazadoc_document_revision"; id: string }
): Promise<void> {
  const supabase = await createServerClient();
  const { error } = await supabase
    .from("quality_lesson_proposals")
    .update({ outcome_kind: outcome.kind, outcome_id: outcome.id, status: "implemented" })
    .eq("organization_id", organizationId).eq("id", proposalId);
  if (error) throw new Error(fail(error, "No se pudo registrar el resultado."));
}

// --- Barrido ----------------------------------------------------------------

/** §51 · Idempotente: el segundo barrido del mismo día no duplica nada. */
export async function scanPeopleSignals(organizationId: string): Promise<number> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("quality_scan_people_signals", {
    p_organization_id: organizationId,
  });
  if (error) throw new Error(fail(error, "No se pudo revisar las señales de personas."));
  return Number(data ?? 0);
}
