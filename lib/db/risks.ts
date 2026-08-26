import "server-only";

import { createServerClient } from "@/lib/supabase/server";
import type {
  Aggregation, AssessmentKind, CauseSource, ControlNature, ControlStatus,
  Derivation, DesignVerdict, EffectivenessVerdict, ImpactArea, ImplementationVerdict,
  MaterializationSeverity, MethodologyApproach, MethodologyScope, OperationMode,
  OpportunityAssessmentKind, OpportunityDecision, OpportunityKind, OpportunityStatus,
  PlanStatus, RiskOrigin, RiskStatus, RiskStrategy, VersionStatus,
} from "@/lib/domain/risks";

/**
 * Trazaloop · QUALITY-05 · Lectura y escritura de riesgos y oportunidades.
 *
 * La frontera es la misma que en QUALITY-04, y por el mismo motivo: todo lo
 * que crea HISTORIA pasa por una RPC —evaluar, decidir el tratamiento,
 * aprobar, materializar, revisar, cerrar—, porque una decisión formal tiene
 * que comprobar rol, estado e invariantes EN EL MISMO ACTO en que se registra,
 * y eso no se puede hacer con un INSERT desde el navegador.
 *
 * Lo demás —crear un borrador, añadir una causa, asociar un proceso— es
 * escritura normal bajo RLS.
 */

function rpcError(error: { message?: string; code?: string } | null, fallback: string): string {
  const raw = error?.message ?? "";
  if (error?.code === "P0001" && raw.length > 0) return raw;
  const m = raw.match(/^(?:.*?:\s*)?([A-ZÁÉÍÓÚÑ¿][^]*)$/);
  return m ? m[1].trim() : fallback;
}

function asDerivation(value: unknown): Derivation | null {
  if (!value || typeof value !== "object") return null;
  const d = value as Record<string, unknown>;
  if (typeof d.level_label !== "string") return null;
  return {
    score: Number(d.score ?? 0),
    level_id: String(d.level_id ?? ""),
    level_label: d.level_label,
    is_acceptable: Boolean(d.is_acceptable),
    review_months: d.review_months == null ? null : Number(d.review_months),
    color_token: (d.color_token as string | null) ?? null,
    aggregation: (d.aggregation as Aggregation) ?? "product",
    version_id: String(d.version_id ?? ""),
    factors: Array.isArray(d.factors) ? (d.factors as Derivation["factors"]) : [],
  };
}

// ---------------------------------------------------------------------------
// Metodología
// ---------------------------------------------------------------------------

export type MethodologyVersionRow = {
  versionId: string; versionNumber: number; status: VersionStatus;
  aggregation: Aggregation; effectiveFrom: string | null; effectiveTo: string | null;
  changeNote: string | null; publishedAt: string | null;
  scales: ScaleRow[];
};

export type ScaleRow = {
  scaleId: string; code: string; label: string; description: string | null;
  scaleKind: "dimension" | "result"; position: number; weight: number;
  levels: ScaleLevelRow[];
};

export type ScaleLevelRow = {
  levelId: string; value: number; label: string; description: string | null;
  position: number; minScore: number | null; maxScore: number | null;
  isAcceptable: boolean; reviewMonths: number | null; colorToken: string | null;
};

export type MethodologyRow = {
  methodologyId: string; code: string; name: string; description: string | null;
  appliesTo: MethodologyScope; approach: MethodologyApproach; isActive: boolean;
  versions: MethodologyVersionRow[];
};

export async function listMethodologies(
  organizationId: string,
  appliesTo?: MethodologyScope
): Promise<MethodologyRow[]> {
  const supabase = await createServerClient();
  let q = supabase
    .from("quality_risk_methodologies")
    .select(
      `id, code, name, description, applies_to, approach, is_active,
       quality_risk_methodology_versions (
         id, version_number, status, aggregation, effective_from, effective_to,
         change_note, published_at,
         quality_risk_scales (
           id, code, label, description, scale_kind, position, weight,
           quality_risk_scale_levels (
             id, value, label, description, position, min_score, max_score,
             is_acceptable, review_months, color_token
           )
         )
       )`
    )
    .eq("organization_id", organizationId)
    .order("code");
  if (appliesTo) q = q.eq("applies_to", appliesTo);

  const { data, error } = await q;
  if (error || !data) return [];

  return data.map((m) => {
    const versions = ((m.quality_risk_methodology_versions ?? []) as Record<string, unknown>[])
      .map((v) => ({
        versionId: String(v.id),
        versionNumber: Number(v.version_number),
        status: v.status as VersionStatus,
        aggregation: v.aggregation as Aggregation,
        effectiveFrom: (v.effective_from as string | null) ?? null,
        effectiveTo: (v.effective_to as string | null) ?? null,
        changeNote: (v.change_note as string | null) ?? null,
        publishedAt: (v.published_at as string | null) ?? null,
        scales: ((v.quality_risk_scales ?? []) as Record<string, unknown>[])
          .map((s) => ({
            scaleId: String(s.id),
            code: String(s.code),
            label: String(s.label),
            description: (s.description as string | null) ?? null,
            scaleKind: s.scale_kind as "dimension" | "result",
            position: Number(s.position),
            weight: Number(s.weight),
            levels: ((s.quality_risk_scale_levels ?? []) as Record<string, unknown>[])
              .map((l) => ({
                levelId: String(l.id),
                value: Number(l.value),
                label: String(l.label),
                description: (l.description as string | null) ?? null,
                position: Number(l.position),
                minScore: l.min_score == null ? null : Number(l.min_score),
                maxScore: l.max_score == null ? null : Number(l.max_score),
                isAcceptable: Boolean(l.is_acceptable),
                reviewMonths: l.review_months == null ? null : Number(l.review_months),
                colorToken: (l.color_token as string | null) ?? null,
              }))
              .sort((a, b) => a.position - b.position),
          }))
          .sort((a, b) => a.position - b.position),
      }))
      .sort((a, b) => b.versionNumber - a.versionNumber);

    return {
      methodologyId: String(m.id),
      code: String(m.code),
      name: String(m.name),
      description: (m.description as string | null) ?? null,
      appliesTo: m.applies_to as MethodologyScope,
      approach: m.approach as MethodologyApproach,
      isActive: Boolean(m.is_active),
      versions,
    };
  });
}

/** La versión con la que hay que evaluar hoy: publicada y vigente. */
export function activeVersion(m: MethodologyRow): MethodologyVersionRow | null {
  return m.versions.find((v) => v.status === "published") ?? null;
}

export async function createMethodologyDraft(input: {
  organizationId: string; code: string; name: string; description: string | null;
  appliesTo: MethodologyScope; approach: MethodologyApproach; aggregation: Aggregation;
}): Promise<{ versionId: string | null; error: string | null }> {
  const supabase = await createServerClient();
  const { data: m, error: e1 } = await supabase
    .from("quality_risk_methodologies")
    .insert({
      organization_id: input.organizationId, code: input.code, name: input.name,
      description: input.description, applies_to: input.appliesTo, approach: input.approach,
    })
    .select("id")
    .single();
  if (e1 || !m) return { versionId: null, error: rpcError(e1, "No fue posible crear la metodología.") };

  const { data: v, error: e2 } = await supabase
    .from("quality_risk_methodology_versions")
    .insert({
      organization_id: input.organizationId, methodology_id: m.id,
      version_number: 1, aggregation: input.aggregation,
    })
    .select("id")
    .single();
  if (e2 || !v) return { versionId: null, error: rpcError(e2, "No fue posible crear la primera versión.") };
  return { versionId: String(v.id), error: null };
}

/** Una versión NUEVA de una metodología que ya existe (RO-04: no se reescribe
 *  la anterior, se publica otra). Copia las escalas de la vigente como punto
 *  de partida, porque empezar de cero invita a inventar. */
export async function createNextVersion(
  organizationId: string,
  methodologyId: string,
  changeNote: string | null
): Promise<{ versionId: string | null; error: string | null }> {
  const supabase = await createServerClient();
  const { data: prev } = await supabase
    .from("quality_risk_methodology_versions")
    .select("id, version_number, aggregation")
    .eq("organization_id", organizationId)
    .eq("methodology_id", methodologyId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const next = (prev?.version_number ?? 0) + 1;
  const { data: v, error } = await supabase
    .from("quality_risk_methodology_versions")
    .insert({
      organization_id: organizationId, methodology_id: methodologyId,
      version_number: next, aggregation: prev?.aggregation ?? "product",
      change_note: changeNote,
    })
    .select("id")
    .single();
  if (error || !v) return { versionId: null, error: rpcError(error, "No fue posible crear la versión.") };

  if (prev?.id) {
    const { data: scales } = await supabase
      .from("quality_risk_scales")
      .select("id, code, label, description, scale_kind, position, weight, quality_risk_scale_levels (value, label, description, position, min_score, max_score, is_acceptable, review_months, color_token)")
      .eq("version_id", prev.id);
    for (const s of scales ?? []) {
      const { data: ns } = await supabase
        .from("quality_risk_scales")
        .insert({
          organization_id: organizationId, version_id: v.id, code: s.code, label: s.label,
          description: s.description, scale_kind: s.scale_kind, position: s.position, weight: s.weight,
        })
        .select("id")
        .single();
      const levels = (s.quality_risk_scale_levels ?? []) as Record<string, unknown>[];
      if (ns && levels.length > 0) {
        await supabase.from("quality_risk_scale_levels").insert(
          levels.map((l) => ({ ...l, organization_id: organizationId, scale_id: ns.id }))
        );
      }
    }
  }
  return { versionId: String(v.id), error: null };
}

export async function publishMethodologyVersion(
  versionId: string,
  effectiveFrom: string | null,
  changeNote: string | null
): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("quality_publish_methodology_version", {
    p_version_id: versionId,
    p_effective_from: effectiveFrom,
    p_change_note: changeNote,
  });
  return { error: error ? rpcError(error, "No fue posible publicar la metodología.") : null };
}

/** La derivación, preguntada a la MISMA función que usará la base al guardar.
 *  Sirve para que la pantalla pueda enseñar el resultado antes de confirmar
 *  sin arriesgarse a decir algo distinto de lo que se guardará. */
export async function previewLevel(
  versionId: string,
  levelIds: string[]
): Promise<{ derivation: Derivation | null; error: string | null }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("quality_derive_level", {
    p_version_id: versionId,
    p_level_ids: levelIds,
  });
  if (error) return { derivation: null, error: rpcError(error, "No fue posible calcular el nivel.") };
  return { derivation: asDerivation(data), error: null };
}

// ---------------------------------------------------------------------------
// Riesgos
// ---------------------------------------------------------------------------

export type RiskListRow = {
  riskId: string; organizationId: string;
  code: string; title: string; eventDescription: string;
  status: RiskStatus; identifiedOn: string;
  nextReviewOn: string | null; lastReviewedOn: string | null;
  ownerPositionId: string | null; ownerPositionName: string | null;
  currentLevel: string | null; currentScore: number | null;
  currentIsAcceptable: boolean | null; currentAssessedOn: string | null;
  inherentLevel: string | null; residualLevel: string | null;
  treatmentStrategy: RiskStrategy | null; treatmentStatus: PlanStatus | null;
  treatmentRequiresApproval: boolean;
  assessmentCount: number; controlCount: number; materializationCount: number;
  processCount: number; actionCount: number; overdueActionCount: number;
  reviewOverdue: boolean;
};

export async function listRisks(organizationId: string): Promise<RiskListRow[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("v_quality_risk_overview")
    .select("*")
    .eq("organization_id", organizationId)
    .order("code");
  if (error || !data) return [];
  return data.map(mapRiskRow);
}

function mapRiskRow(r: Record<string, unknown>): RiskListRow {
  return {
    riskId: String(r.id),
    organizationId: String(r.organization_id),
    code: String(r.code),
    title: String(r.title),
    eventDescription: String(r.event_description ?? ""),
    status: r.status as RiskStatus,
    identifiedOn: String(r.identified_on),
    nextReviewOn: (r.next_review_on as string | null) ?? null,
    lastReviewedOn: (r.last_reviewed_on as string | null) ?? null,
    ownerPositionId: (r.owner_position_id as string | null) ?? null,
    ownerPositionName: (r.owner_position_name as string | null) ?? null,
    currentLevel: (r.current_level as string | null) ?? null,
    currentScore: r.current_score == null ? null : Number(r.current_score),
    currentIsAcceptable: r.current_is_acceptable == null ? null : Boolean(r.current_is_acceptable),
    currentAssessedOn: (r.current_assessed_on as string | null) ?? null,
    inherentLevel: (r.inherent_level as string | null) ?? null,
    residualLevel: (r.residual_level as string | null) ?? null,
    treatmentStrategy: (r.treatment_strategy as RiskStrategy | null) ?? null,
    treatmentStatus: (r.treatment_status as PlanStatus | null) ?? null,
    treatmentRequiresApproval: Boolean(r.treatment_requires_approval),
    assessmentCount: Number(r.assessment_count ?? 0),
    controlCount: Number(r.control_count ?? 0),
    materializationCount: Number(r.materialization_count ?? 0),
    processCount: Number(r.process_count ?? 0),
    actionCount: Number(r.action_count ?? 0),
    overdueActionCount: Number(r.overdue_action_count ?? 0),
    reviewOverdue: Boolean(r.review_overdue),
  };
}

export type AssessmentRow = {
  assessmentId: string; kind: AssessmentKind; assessedOn: string;
  assessedByName: string | null; score: number;
  derivation: Derivation | null; rationale: string | null;
  methodologyName: string; versionNumber: number;
  controlsConsidered: { controlCode: string; controlTitle: string; effectiveness: string }[];
};

export type ControlRow = {
  controlId: string; code: string; title: string; description: string | null;
  controlNature: ControlNature; operationMode: OperationMode; frequency: string | null;
  status: ControlStatus; ownerPositionId: string | null; ownerPositionName: string | null;
  lastReview: {
    reviewId: string; reviewedOn: string; design: DesignVerdict;
    implementation: ImplementationVerdict; effectiveness: EffectivenessVerdict;
    criterion: string | null; note: string | null; reviewedByName: string | null;
  } | null;
  reviewCount: number;
  documentRefs: { refId: string; title: string; code: string | null }[];
  indicatorRefs: { refId: string; name: string; code: string | null }[];
};

export type MaterializationRow = {
  materializationId: string; occurredOn: string; detectedOn: string;
  description: string; observedConsequence: string | null;
  severity: MaterializationSeverity; reportedByName: string | null;
  caseId: string | null; caseCode: string | null;
};

export type TreatmentPlanRow = {
  planId: string; strategy: RiskStrategy; rationale: string; status: PlanStatus;
  decidedOn: string; decidedByName: string | null; decidedById: string | null;
  requiresApproval: boolean; approvedByName: string | null; approvedAt: string | null;
  approvalNote: string | null; reviewOn: string | null;
  basedOnAssessmentId: string | null;
};

export type RiskDecisionRow = {
  decisionId: string; decisionKind: string; outcome: string | null;
  rationale: string | null; decidedAt: string; decidedByName: string | null;
  context: Record<string, unknown> | null;
};

export type RiskDetail = RiskListRow & {
  contextNote: string | null; originKind: RiskOrigin; originNote: string | null;
  closureReason: string | null; supersededByRiskId: string | null;
  reviewIntervalMonths: number | null;
  causes: { causeId: string; description: string; sourceKind: CauseSource }[];
  consequences: { consequenceId: string; description: string; impactArea: ImpactArea }[];
  processes: { processId: string; name: string; code: string | null }[];
  objectives: { objectiveId: string; name: string; code: string | null }[];
  assessments: AssessmentRow[];
  controls: ControlRow[];
  materializations: MaterializationRow[];
  plans: TreatmentPlanRow[];
  decisions: RiskDecisionRow[];
  actions: {
    actionId: string; code: string; title: string; status: string;
    dueOn: string | null; ownerPositionName: string | null;
  }[];
};

export async function getRisk(riskId: string): Promise<RiskDetail | null> {
  const supabase = await createServerClient();
  const { data: head } = await supabase
    .from("v_quality_risk_overview").select("*").eq("id", riskId).maybeSingle();
  if (!head) return null;

  const { data: base } = await supabase
    .from("quality_risks")
    .select("context_note, origin_kind, origin_note, closure_reason, superseded_by_risk_id, review_interval_months")
    .eq("id", riskId)
    .maybeSingle();

  const [causes, consequences, processes, objectives, assessments, controls, mats, plans, decisions, actions] =
    await Promise.all([
      supabase.from("quality_risk_causes")
        .select("id, description, source_kind, position").eq("risk_id", riskId).order("position"),
      supabase.from("quality_risk_consequences")
        .select("id, description, impact_area, position").eq("risk_id", riskId).order("position"),
      supabase.from("quality_risk_processes")
        .select("process_id, quality_processes (id, name, code)").eq("risk_id", riskId),
      supabase.from("quality_risk_objectives")
        .select("objective_id, quality_objectives (id, name, code)").eq("risk_id", riskId),
      supabase.from("quality_risk_assessments")
        .select(`id, assessment_kind, assessed_on, score, derivation, rationale,
                 profiles!quality_risk_assessments_assessed_by_fkey (full_name),
                 quality_risk_methodology_versions (version_number, quality_risk_methodologies (name))`)
        .eq("risk_id", riskId)
        .order("assessed_on", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase.from("quality_risk_control_links")
        .select(`control_id,
                 quality_controls!quality_risk_control_links_control_fk
                   (id, code, title, description, control_nature, operation_mode,
                    frequency, status, owner_position_id)`)
        .eq("risk_id", riskId),
      supabase.from("quality_risk_materializations")
        .select(`id, occurred_on, detected_on, description, observed_consequence, severity, case_id,
                 profiles!quality_risk_materializations_reported_by_fkey (full_name)`)
        .eq("risk_id", riskId)
        .order("occurred_on", { ascending: false }),
      supabase.from("quality_risk_treatment_plans")
        .select(`id, strategy, rationale, status, decided_on, requires_approval, approved_at,
                 approval_note, review_on, based_on_assessment_id, decided_by,
                 decided:profiles!quality_risk_treatment_plans_decided_by_fkey (full_name),
                 approver:profiles!quality_risk_treatment_plans_approved_by_fkey (full_name)`)
        .eq("risk_id", riskId)
        .order("decided_on", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase.from("work_decisions")
        .select(`id, decision_kind, outcome, rationale, decided_at, context,
                 profiles (full_name)`)
        .eq("subject_kind", "risk").eq("subject_id", riskId)
        .order("decided_at", { ascending: false }),
      supabase.from("work_references")
        .select("owner_id")
        .eq("ref_kind", "quality_risk").eq("ref_id", riskId).eq("owner_kind", "action"),
    ]);

  // `work_references.owner_id` es deliberadamente generico y NO tiene clave
  // foranea: el catalogo cerrado y el disparador de 0122 son los que
  // garantizan que apunta a algo real. Por eso las acciones se piden aparte en
  // vez de embeberlas.
  const actionIds = [...new Set((actions.data ?? []).map((r) => String(r.owner_id)))];
  const { data: actionRows } = actionIds.length
    ? await supabase.from("work_actions")
        .select("id, code, title, status, due_on, owner_position_id")
        .in("id", actionIds)
        .order("code")
    : { data: [] as Record<string, unknown>[] };

  const assessmentIds = (assessments.data ?? []).map((a) => String(a.id));
  const { data: considered } = assessmentIds.length
    ? await supabase.from("work_references")
        .select("owner_id, ref_id, snapshot")
        .eq("owner_kind", "risk_assessment").eq("ref_kind", "quality_control")
        .in("owner_id", assessmentIds)
    : { data: [] as Record<string, unknown>[] };

  const controlIds = (controls.data ?? []).map((c) => String(c.control_id));
  const { data: ctrlRefs } = controlIds.length
    ? await supabase.from("work_references")
        .select("owner_id, ref_kind, ref_id")
        .eq("owner_kind", "control").in("owner_id", controlIds)
    : { data: [] as Record<string, unknown>[] };

  // Mismo motivo que arriba: `ref_id` no tiene clave foranea porque apunta a
  // varias tablas segun `ref_kind`. Se resuelve por tipo.
  const docIds = (ctrlRefs ?? []).filter((r) => r.ref_kind === "trazadoc_document").map((r) => String(r.ref_id));
  const { data: docRows } = docIds.length
    ? await supabase.from("trazadoc_documents").select("id, title, code").in("id", docIds)
    : { data: [] as Record<string, unknown>[] };
  const indIds = (ctrlRefs ?? []).filter((r) => r.ref_kind === "quality_indicator").map((r) => String(r.ref_id));
  const { data: indRows } = indIds.length
    ? await supabase.from("quality_indicators").select("id, name, code").in("id", indIds)
    : { data: [] as Record<string, unknown>[] };

  const posIds = [...new Set((controls.data ?? [])
    .flatMap((l) => {
      const c = Array.isArray(l.quality_controls) ? l.quality_controls[0] : l.quality_controls;
      const id = (c as { owner_position_id?: string | null } | null)?.owner_position_id;
      return id ? [id] : [];
    }))];
  const { data: posRows } = posIds.length
    ? await supabase.from("quality_positions").select("id, name").in("id", posIds)
    : { data: [] as Record<string, unknown>[] };

  const caseIds = [...new Set((mats.data ?? []).flatMap((m) => (m.case_id ? [String(m.case_id)] : [])))];
  const { data: caseRows } = caseIds.length
    ? await supabase.from("work_cases").select("id, code").in("id", caseIds)
    : { data: [] as Record<string, unknown>[] };

  const { data: reviews } = controlIds.length
    ? await supabase.from("quality_control_effectiveness_reviews")
        .select(`id, control_id, reviewed_on, design_verdict, implementation_verdict,
                 effectiveness_verdict, criterion, note, profiles (full_name)`)
        .in("control_id", controlIds)
        .order("reviewed_on", { ascending: false })
    : { data: [] as Record<string, unknown>[] };

  const name = (v: unknown): string | null => {
    const p = v as { full_name?: string } | { full_name?: string }[] | null;
    if (!p) return null;
    if (Array.isArray(p)) return p[0]?.full_name ?? null;
    return p.full_name ?? null;
  };
  const one = <T,>(v: unknown): T | null => (Array.isArray(v) ? ((v[0] as T) ?? null) : ((v as T) ?? null));

  return {
    ...mapRiskRow(head),
    contextNote: (base?.context_note as string | null) ?? null,
    originKind: (base?.origin_kind as RiskOrigin) ?? "manual",
    originNote: (base?.origin_note as string | null) ?? null,
    closureReason: (base?.closure_reason as string | null) ?? null,
    supersededByRiskId: (base?.superseded_by_risk_id as string | null) ?? null,
    reviewIntervalMonths: base?.review_interval_months == null ? null : Number(base.review_interval_months),

    causes: (causes.data ?? []).map((c) => ({
      causeId: String(c.id), description: String(c.description), sourceKind: c.source_kind as CauseSource,
    })),
    consequences: (consequences.data ?? []).map((c) => ({
      consequenceId: String(c.id), description: String(c.description), impactArea: c.impact_area as ImpactArea,
    })),
    processes: (processes.data ?? []).flatMap((p) => {
      const proc = one<{ id: string; name: string; code: string | null }>(p.quality_processes);
      return proc ? [{ processId: proc.id, name: proc.name, code: proc.code }] : [];
    }),
    objectives: (objectives.data ?? []).flatMap((o) => {
      const obj = one<{ id: string; name: string; code: string | null }>(o.quality_objectives);
      return obj ? [{ objectiveId: obj.id, name: obj.name, code: obj.code }] : [];
    }),

    assessments: (assessments.data ?? []).map((a) => {
      const ver = one<{ version_number: number; quality_risk_methodologies: unknown }>(
        a.quality_risk_methodology_versions
      );
      const meth = one<{ name: string }>(ver?.quality_risk_methodologies);
      return {
        assessmentId: String(a.id),
        kind: a.assessment_kind as AssessmentKind,
        assessedOn: String(a.assessed_on),
        assessedByName: name(a.profiles),
        score: Number(a.score),
        derivation: asDerivation(a.derivation),
        rationale: (a.rationale as string | null) ?? null,
        methodologyName: meth?.name ?? "—",
        versionNumber: Number(ver?.version_number ?? 0),
        controlsConsidered: (considered ?? [])
          .filter((c) => String(c.owner_id) === String(a.id))
          .map((c) => {
            const s = (c.snapshot ?? {}) as Record<string, unknown>;
            return {
              controlCode: String(s.control_code ?? "—"),
              controlTitle: String(s.control_title ?? "—"),
              effectiveness: String(s.effectiveness_verdict ?? "not_assessed"),
            };
          }),
      };
    }),

    controls: (controls.data ?? []).flatMap((link) => {
      const c = one<Record<string, unknown>>(link.quality_controls);
      if (!c) return [];
      const mine = (reviews ?? []).filter((r) => String(r.control_id) === String(c.id));
      const last = mine[0];
      const pos = (posRows ?? []).find((p) => String(p.id) === String(c.owner_position_id));
      const refs = (ctrlRefs ?? []).filter((r) => String(r.owner_id) === String(c.id));
      return [{
        controlId: String(c.id),
        code: String(c.code),
        title: String(c.title),
        description: (c.description as string | null) ?? null,
        controlNature: c.control_nature as ControlNature,
        operationMode: c.operation_mode as OperationMode,
        frequency: (c.frequency as string | null) ?? null,
        status: c.status as ControlStatus,
        ownerPositionId: (c.owner_position_id as string | null) ?? null,
        ownerPositionName: (pos?.name as string | undefined) ?? null,
        lastReview: last
          ? {
              reviewId: String(last.id),
              reviewedOn: String(last.reviewed_on),
              design: last.design_verdict as DesignVerdict,
              implementation: last.implementation_verdict as ImplementationVerdict,
              effectiveness: last.effectiveness_verdict as EffectivenessVerdict,
              criterion: (last.criterion as string | null) ?? null,
              note: (last.note as string | null) ?? null,
              reviewedByName: name(last.profiles),
            }
          : null,
        reviewCount: mine.length,
        documentRefs: refs
          .filter((r) => r.ref_kind === "trazadoc_document")
          .flatMap((r) => {
            const d = (docRows ?? []).find((x) => String(x.id) === String(r.ref_id));
            return d ? [{ refId: String(d.id), title: String(d.title), code: (d.code as string | null) ?? null }] : [];
          }),
        indicatorRefs: refs
          .filter((r) => r.ref_kind === "quality_indicator")
          .flatMap((r) => {
            const i = (indRows ?? []).find((x) => String(x.id) === String(r.ref_id));
            return i ? [{ refId: String(i.id), name: String(i.name), code: (i.code as string | null) ?? null }] : [];
          }),
      }];
    }),

    materializations: (mats.data ?? []).map((m) => ({
      materializationId: String(m.id),
      occurredOn: String(m.occurred_on),
      detectedOn: String(m.detected_on),
      description: String(m.description),
      observedConsequence: (m.observed_consequence as string | null) ?? null,
      severity: m.severity as MaterializationSeverity,
      reportedByName: name(m.profiles),
      caseId: (m.case_id as string | null) ?? null,
      caseCode: (caseRows ?? []).find((c) => String(c.id) === String(m.case_id))?.code as string ?? null,
    })),

    plans: (plans.data ?? []).map((p) => ({
      planId: String(p.id),
      strategy: p.strategy as RiskStrategy,
      rationale: String(p.rationale),
      status: p.status as PlanStatus,
      decidedOn: String(p.decided_on),
      decidedByName: name(p.decided),
      decidedById: (p.decided_by as string | null) ?? null,
      requiresApproval: Boolean(p.requires_approval),
      approvedByName: name(p.approver),
      approvedAt: (p.approved_at as string | null) ?? null,
      approvalNote: (p.approval_note as string | null) ?? null,
      reviewOn: (p.review_on as string | null) ?? null,
      basedOnAssessmentId: (p.based_on_assessment_id as string | null) ?? null,
    })),

    decisions: (decisions.data ?? []).map((d) => ({
      decisionId: String(d.id),
      decisionKind: String(d.decision_kind),
      outcome: (d.outcome as string | null) ?? null,
      rationale: (d.rationale as string | null) ?? null,
      decidedAt: String(d.decided_at),
      decidedByName: name(d.profiles),
      context: (d.context as Record<string, unknown> | null) ?? null,
    })),

    actions: (actionRows ?? []).map((a) => ({
      actionId: String(a.id),
      code: String(a.code),
      title: String(a.title),
      status: String(a.status),
      dueOn: (a.due_on as string | null) ?? null,
      ownerPositionName: null,
    })),
  };
}

// ---------------------------------------------------------------------------
// Escrituras de riesgo. Las que crean HISTORIA van por RPC; las demás, no.
// ---------------------------------------------------------------------------

export type AssessmentDetail = AssessmentRow & {
  riskId: string; riskTitle: string; riskCode: string | null;
  levelLabel: string | null;
  methodologyVersionId: string;
  /** Qué se eligió en cada escala. Es el «cómo se llegó a ese número». */
  factors: { scaleLabel: string; levelLabel: string; levelValue: number; weight: number }[];
};

/**
 * EXPORT-01.1 · Una evaluación de riesgo POR SÍ MISMA.
 *
 * Una evaluación es un HECHO FECHADO: se hizo un día, con una versión concreta
 * de metodología y unos niveles concretos. Que solo se pudiera imprimir dentro
 * de la ficha del riesgo —que cambia— dejaba sin papel propio justo al objeto
 * que sí es histórico de verdad.
 */
export async function getRiskAssessment(
  organizationId: string, assessmentId: string
): Promise<AssessmentDetail | null> {
  const supabase = await createServerClient();
  const { data: a } = await supabase
    .from("quality_risk_assessments")
    .select(`id, risk_id, assessment_kind, assessed_on, score, derivation, rationale,
             methodology_version_id, result_level_id,
             profiles!quality_risk_assessments_assessed_by_fkey (full_name),
             quality_risk_methodology_versions (version_number, quality_risk_methodologies (name))`)
    .eq("organization_id", organizationId).eq("id", assessmentId)
    .maybeSingle();
  if (!a) return null;

  const one = <T,>(v: unknown): T | null => (Array.isArray(v) ? ((v[0] as T) ?? null) : ((v as T) ?? null));
  const ver = one<{ version_number: number; quality_risk_methodologies: unknown }>(
    a.quality_risk_methodology_versions
  );
  const meth = one<{ name: string }>(ver?.quality_risk_methodologies);

  const [risk, code, factors, level, considered] = await Promise.all([
    supabase.from("quality_risks").select("id, title").eq("id", a.risk_id).maybeSingle(),
    supabase.from("quality_risk_codes").select("code").eq("risk_id", a.risk_id).maybeSingle(),
    supabase.from("quality_risk_assessment_factors")
      .select(`scale_id, level_id,
               quality_risk_scales!quality_risk_assessment_factors_scale_fk (label, weight, position),
               quality_risk_scale_levels!quality_risk_assessment_factors_level_fk (label, value)`)
      .eq("organization_id", organizationId).eq("assessment_id", assessmentId),
    a.result_level_id
      ? supabase.from("quality_risk_scale_levels").select("label").eq("id", a.result_level_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("work_references")
      .select("ref_id, snapshot")
      .eq("organization_id", organizationId)
      .eq("owner_kind", "risk_assessment").eq("ref_kind", "quality_control")
      .eq("owner_id", assessmentId),
  ]);

  const controlIds = (considered.data ?? []).map((r) => String(r.ref_id));
  const { data: ctrlRows } = controlIds.length
    ? await supabase.from("quality_controls").select("id, code, title").in("id", controlIds)
    : { data: [] as Record<string, unknown>[] };

  return {
    assessmentId: String(a.id),
    kind: a.assessment_kind as AssessmentKind,
    assessedOn: String(a.assessed_on),
    assessedByName: one<{ full_name?: string }>(a.profiles)?.full_name ?? null,
    score: Number(a.score),
    derivation: (a.derivation as Derivation | null) ?? null,
    rationale: (a.rationale as string | null) ?? null,
    methodologyName: meth?.name ?? "Metodología",
    versionNumber: Number(ver?.version_number ?? 0),
    methodologyVersionId: String(a.methodology_version_id),
    riskId: String(a.risk_id),
    riskTitle: String((risk.data as { title?: string } | null)?.title ?? "Riesgo"),
    riskCode: (code.data as { code?: string } | null)?.code ?? null,
    levelLabel: (level?.data as { label?: string } | null)?.label ?? null,
    factors: (factors.data ?? []).flatMap((f) => {
      const sc = one<{ label: string; weight: number; position: number }>(f.quality_risk_scales);
      const lv = one<{ label: string; value: number }>(f.quality_risk_scale_levels);
      return sc && lv
        ? [{ scaleLabel: sc.label, levelLabel: lv.label, levelValue: Number(lv.value), weight: Number(sc.weight) }]
        : [];
    }),
    // El snapshot conserva LO QUE DECÍA el control aquel día (RO-27): si hoy
    // dice otra cosa, el papel de la evaluación sigue diciendo lo de entonces.
    controlsConsidered: (considered.data ?? []).map((r) => {
      const snap = (r.snapshot as Record<string, unknown> | null) ?? {};
      const row = (ctrlRows ?? []).find((c) => String(c.id) === String(r.ref_id));
      return {
        controlCode: String(snap.code ?? row?.code ?? "—"),
        controlTitle: String(snap.title ?? row?.title ?? "—"),
        effectiveness: String(snap.effectiveness ?? snap.effectiveness_verdict ?? "no registrada"),
      };
    }),
  };
}

/** Una versión concreta de metodología, buscada por su propio identificador.
 *  v1 sigue siendo v1 aunque hoy rija la v2 (RO-14). */
export async function getMethodologyVersion(
  organizationId: string, versionId: string
): Promise<{ methodology: MethodologyRow; version: MethodologyVersionRow } | null> {
  const all = await listMethodologies(organizationId);
  for (const m of all) {
    const v = m.versions.find((x) => x.versionId === versionId);
    if (v) return { methodology: m, version: v };
  }
  return null;
}

export async function createRisk(input: {
  organizationId: string; title: string; eventDescription: string;
  contextNote: string | null; originKind: RiskOrigin; ownerPositionId: string | null;
  identifiedOn: string; processIds: string[]; objectiveIds: string[];
  causes: { description: string; sourceKind: CauseSource }[];
  consequences: { description: string; impactArea: ImpactArea }[];
}): Promise<{ riskId: string | null; error: string | null }> {
  const supabase = await createServerClient();

  const { data: code, error: eCode } = await supabase.rpc("quality_next_ro_code", {
    p_organization_id: input.organizationId, p_kind: "risk",
  });
  if (eCode || !code) return { riskId: null, error: rpcError(eCode, "No fue posible reservar el código.") };

  const { data, error } = await supabase
    .from("quality_risks")
    .insert({
      organization_id: input.organizationId, code, title: input.title,
      event_description: input.eventDescription, context_note: input.contextNote,
      origin_kind: input.originKind, owner_position_id: input.ownerPositionId,
      identified_on: input.identifiedOn,
    })
    .select("id")
    .single();
  if (error || !data) return { riskId: null, error: rpcError(error, "No fue posible registrar el riesgo.") };

  const riskId = String(data.id);
  if (input.causes.length > 0) {
    await supabase.from("quality_risk_causes").insert(
      input.causes.map((c, i) => ({
        organization_id: input.organizationId, risk_id: riskId,
        description: c.description, source_kind: c.sourceKind, position: i + 1,
      }))
    );
  }
  if (input.consequences.length > 0) {
    await supabase.from("quality_risk_consequences").insert(
      input.consequences.map((c, i) => ({
        organization_id: input.organizationId, risk_id: riskId,
        description: c.description, impact_area: c.impactArea, position: i + 1,
      }))
    );
  }
  if (input.processIds.length > 0) {
    await supabase.from("quality_risk_processes").insert(
      input.processIds.map((p) => ({
        organization_id: input.organizationId, risk_id: riskId, process_id: p,
      }))
    );
  }
  if (input.objectiveIds.length > 0) {
    await supabase.from("quality_risk_objectives").insert(
      input.objectiveIds.map((o) => ({
        organization_id: input.organizationId, risk_id: riskId, objective_id: o,
      }))
    );
  }
  return { riskId, error: null };
}

export async function assessRisk(input: {
  riskId: string; kind: AssessmentKind; versionId: string; levelIds: string[];
  rationale: string | null; controlIds: string[] | null;
}): Promise<{ assessmentId: string | null; error: string | null }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("quality_assess_risk", {
    p_risk_id: input.riskId, p_kind: input.kind, p_version_id: input.versionId,
    p_level_ids: input.levelIds, p_rationale: input.rationale,
    p_control_ids: input.controlIds, p_assessed_on: null,
  });
  if (error) return { assessmentId: null, error: rpcError(error, "No fue posible registrar la evaluación.") };
  return { assessmentId: data ? String(data) : null, error: null };
}

export async function decideTreatment(input: {
  riskId: string; strategy: RiskStrategy; rationale: string; reviewOn: string | null;
}): Promise<{ planId: string | null; error: string | null }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("quality_decide_risk_treatment", {
    p_risk_id: input.riskId, p_strategy: input.strategy,
    p_rationale: input.rationale, p_review_on: input.reviewOn,
  });
  if (error) return { planId: null, error: rpcError(error, "No fue posible registrar la decisión.") };
  return { planId: data ? String(data) : null, error: null };
}

export async function approveTreatment(planId: string, note: string | null): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("quality_approve_risk_treatment", {
    p_plan_id: planId, p_note: note,
  });
  return { error: error ? rpcError(error, "No fue posible aprobar la aceptación.") : null };
}

export async function materializeRisk(input: {
  riskId: string; occurredOn: string; description: string;
  severity: MaterializationSeverity; consequence: string | null;
}): Promise<{ materializationId: string | null; error: string | null }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("quality_materialize_risk", {
    p_risk_id: input.riskId, p_occurred_on: input.occurredOn,
    p_description: input.description, p_severity: input.severity,
    p_consequence: input.consequence,
  });
  if (error) return { materializationId: null, error: rpcError(error, "No fue posible registrar la materialización.") };
  return { materializationId: data ? String(data) : null, error: null };
}

export async function openCaseFromMaterialization(
  materializationId: string, title: string | null, priority: string
): Promise<{ caseId: string | null; error: string | null }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("quality_open_case_from_materialization", {
    p_materialization_id: materializationId, p_title: title, p_priority: priority,
  });
  if (error) return { caseId: null, error: rpcError(error, "No fue posible abrir el caso.") };
  return { caseId: data ? String(data) : null, error: null };
}

export async function reviewRisk(
  riskId: string, note: string, nextReviewOn: string | null
): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("quality_review_risk", {
    p_risk_id: riskId, p_note: note, p_next_review_on: nextReviewOn,
  });
  return { error: error ? rpcError(error, "No fue posible registrar la revisión.") : null };
}

export async function closeRisk(
  riskId: string, mode: "closed" | "retired" | "superseded", reason: string, supersededBy: string | null
): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("quality_close_risk", {
    p_risk_id: riskId, p_mode: mode, p_reason: reason, p_superseded_by: supersededBy,
  });
  return { error: error ? rpcError(error, "No fue posible cerrar el riesgo.") : null };
}

export async function reopenRisk(riskId: string, reason: string): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("quality_reopen_risk", { p_risk_id: riskId, p_reason: reason });
  return { error: error ? rpcError(error, "No fue posible reabrir el riesgo.") : null };
}

export async function deleteRisk(riskId: string): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { error } = await supabase.from("quality_risks").delete().eq("id", riskId);
  return { error: error ? rpcError(error, "No fue posible eliminar el riesgo.") : null };
}

// ---------------------------------------------------------------------------
// Controles
// ---------------------------------------------------------------------------

export async function listControls(organizationId: string): Promise<ControlRow[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("quality_controls")
    .select("id, code, title, description, control_nature, operation_mode, frequency, status, owner_position_id")
    .eq("organization_id", organizationId)
    .order("code");
  if (error || !data) return [];

  const posIds = [...new Set(data.flatMap((c) => (c.owner_position_id ? [c.owner_position_id] : [])))];
  const { data: pos } = posIds.length
    ? await supabase.from("quality_positions").select("id, name").in("id", posIds)
    : { data: [] as Record<string, unknown>[] };

  return data.map((c) => ({
    controlId: String(c.id), code: String(c.code), title: String(c.title),
    description: c.description ?? null,
    controlNature: c.control_nature as ControlNature,
    operationMode: c.operation_mode as OperationMode,
    frequency: c.frequency ?? null,
    status: c.status as ControlStatus,
    ownerPositionId: c.owner_position_id ?? null,
    ownerPositionName: ((pos ?? []).find((p) => String(p.id) === String(c.owner_position_id))?.name as string) ?? null,
    lastReview: null, reviewCount: 0, documentRefs: [], indicatorRefs: [],
  }));
}

export type ControlDetail = ControlRow & {
  /** Dónde opera: los procesos declarados en `quality_control_activity_links`. */
  processes: { processId: string; name: string; code: string | null; note: string | null }[];
  /** Todas las revisiones de eficacia, de la más reciente a la más antigua. */
  reviews: {
    reviewId: string; reviewedOn: string; design: DesignVerdict;
    implementation: ImplementationVerdict; effectiveness: EffectivenessVerdict;
    criterion: string | null; note: string | null; reviewedByName: string | null;
  }[];
  /** Los riesgos donde este control fue considerado. */
  risks: { riskId: string; code: string | null; title: string; status: string }[];
};

/**
 * EXPORT-01.1 · Un control POR SÍ MISMO.
 *
 * Hasta ahora el control solo se leía como una fila de la tabla del riesgo, y
 * eso arrastraba una confusión que RO-23 separa expresamente: un CONTROL no es
 * una ACCIÓN DE TRATAMIENTO. El control existe y opera de forma permanente; la
 * acción se hace una vez y se cierra. Un control con ficha propia es lo que
 * hace visible esa diferencia.
 */
export async function getControl(
  organizationId: string, controlId: string
): Promise<ControlDetail | null> {
  const supabase = await createServerClient();
  const { data: c } = await supabase
    .from("quality_controls")
    .select("id, code, title, description, control_nature, operation_mode, frequency, status, owner_position_id")
    .eq("organization_id", organizationId).eq("id", controlId)
    .maybeSingle();
  if (!c) return null;

  const [pos, links, reviews, refs, riskLinks] = await Promise.all([
    c.owner_position_id
      ? supabase.from("quality_positions").select("name").eq("id", c.owner_position_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("quality_control_activity_links")
      .select("process_id, note, quality_processes!quality_control_activity_links_process_fk (id, name, code)")
      .eq("organization_id", organizationId).eq("control_id", controlId),
    supabase.from("quality_control_effectiveness_reviews")
      .select("id, reviewed_on, design_verdict, implementation_verdict, effectiveness_verdict, criterion, note, profiles (full_name)")
      .eq("organization_id", organizationId).eq("control_id", controlId)
      .order("reviewed_on", { ascending: false }),
    supabase.from("work_references")
      .select("ref_kind, ref_id")
      .eq("organization_id", organizationId).eq("owner_kind", "control").eq("owner_id", controlId),
    supabase.from("quality_risk_control_links")
      .select("risk_id, quality_risks!quality_risk_control_links_risk_fk (id, title, status)")
      .eq("organization_id", organizationId).eq("control_id", controlId),
  ]);

  const one = <T,>(v: unknown): T | null => (Array.isArray(v) ? ((v[0] as T) ?? null) : ((v as T) ?? null));
  const nameOf = (v: unknown): string | null => {
    const p = one<{ full_name?: string }>(v);
    return p?.full_name ?? null;
  };

  const docIds = (refs.data ?? []).filter((r) => r.ref_kind === "trazadoc_document").map((r) => String(r.ref_id));
  const indIds = (refs.data ?? []).filter((r) => r.ref_kind === "quality_indicator").map((r) => String(r.ref_id));
  const [docRows, indRows] = await Promise.all([
    docIds.length
      ? supabase.from("trazadoc_documents").select("id, title, code").in("id", docIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    indIds.length
      ? supabase.from("quality_indicators").select("id, name, code").in("id", indIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);

  const riskIds = (riskLinks.data ?? []).map((l) => String(l.risk_id));
  const { data: riskCodes } = riskIds.length
    ? await supabase.from("quality_risk_codes").select("risk_id, code").in("risk_id", riskIds)
    : { data: [] as Record<string, unknown>[] };

  const all = (reviews.data ?? []).map((r) => ({
    reviewId: String(r.id), reviewedOn: String(r.reviewed_on),
    design: r.design_verdict as DesignVerdict,
    implementation: r.implementation_verdict as ImplementationVerdict,
    effectiveness: r.effectiveness_verdict as EffectivenessVerdict,
    criterion: (r.criterion as string | null) ?? null,
    note: (r.note as string | null) ?? null,
    reviewedByName: nameOf(r.profiles),
  }));

  return {
    controlId: String(c.id), code: String(c.code), title: String(c.title),
    description: (c.description as string | null) ?? null,
    controlNature: c.control_nature as ControlNature,
    operationMode: c.operation_mode as OperationMode,
    frequency: (c.frequency as string | null) ?? null,
    status: c.status as ControlStatus,
    ownerPositionId: (c.owner_position_id as string | null) ?? null,
    ownerPositionName: ((pos?.data as { name?: string } | null)?.name) ?? null,
    lastReview: all[0] ?? null,
    reviewCount: all.length,
    documentRefs: (docRows.data ?? []).map((d) => ({
      refId: String(d.id), title: String(d.title), code: (d.code as string | null) ?? null,
    })),
    indicatorRefs: (indRows.data ?? []).map((i) => ({
      refId: String(i.id), name: String(i.name), code: (i.code as string | null) ?? null,
    })),
    processes: (links.data ?? []).flatMap((l) => {
      const proc = one<{ id: string; name: string; code: string | null }>(l.quality_processes);
      return proc
        ? [{ processId: proc.id, name: proc.name, code: proc.code, note: (l.note as string | null) ?? null }]
        : [];
    }),
    reviews: all,
    risks: (riskLinks.data ?? []).flatMap((l) => {
      const r = one<{ id: string; title: string; status: string }>(l.quality_risks);
      if (!r) return [];
      const code = (riskCodes ?? []).find((rc) => String(rc.risk_id) === r.id);
      return [{
        riskId: r.id, code: code ? String(code.code) : null, title: r.title, status: r.status,
      }];
    }),
  };
}

export async function createControl(input: {
  organizationId: string; title: string; description: string | null;
  controlNature: ControlNature; operationMode: OperationMode; frequency: string | null;
  ownerPositionId: string | null; riskId: string | null;
  documentId: string | null; indicatorId: string | null; processIds: string[];
}): Promise<{ controlId: string | null; error: string | null }> {
  const supabase = await createServerClient();
  const { data: code, error: eCode } = await supabase.rpc("quality_next_ro_code", {
    p_organization_id: input.organizationId, p_kind: "control",
  });
  if (eCode || !code) return { controlId: null, error: rpcError(eCode, "No fue posible reservar el código.") };

  const { data, error } = await supabase
    .from("quality_controls")
    .insert({
      organization_id: input.organizationId, code, title: input.title,
      description: input.description, control_nature: input.controlNature,
      operation_mode: input.operationMode, frequency: input.frequency,
      owner_position_id: input.ownerPositionId, status: "active",
    })
    .select("id")
    .single();
  if (error || !data) return { controlId: null, error: rpcError(error, "No fue posible registrar el control.") };

  const controlId = String(data.id);
  if (input.riskId) {
    await supabase.from("quality_risk_control_links").insert({
      organization_id: input.organizationId, risk_id: input.riskId, control_id: controlId,
    });
  }
  // §24 · El control REFERENCIA el procedimiento; no se copia el PDF ni se
  // crea un documento paralelo de riesgos (T-03).
  if (input.documentId) {
    await supabase.from("work_references").insert({
      organization_id: input.organizationId, owner_kind: "control", owner_id: controlId,
      ref_kind: "trazadoc_document", ref_id: input.documentId, relation: "evidence",
      note: "El documento que lo describe.",
    });
  }
  // §25 · Un indicador puede servir de monitoreo. Referenciarlo NO convierte
  // una medición fuera de meta en materialización del riesgo.
  if (input.indicatorId) {
    await supabase.from("work_references").insert({
      organization_id: input.organizationId, owner_kind: "control", owner_id: controlId,
      ref_kind: "quality_indicator", ref_id: input.indicatorId, relation: "related",
      note: "Indicador con el que se vigila.",
    });
  }
  if (input.processIds.length > 0) {
    await supabase.from("quality_control_activity_links").insert(
      input.processIds.map((p) => ({
        organization_id: input.organizationId, control_id: controlId, process_id: p,
      }))
    );
  }
  return { controlId, error: null };
}

export async function linkControlToRisk(
  organizationId: string, riskId: string, controlId: string
): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { error } = await supabase.from("quality_risk_control_links").insert({
    organization_id: organizationId, risk_id: riskId, control_id: controlId,
  });
  return { error: error ? rpcError(error, "No fue posible asociar el control.") : null };
}

export async function reviewControl(input: {
  controlId: string; design: DesignVerdict; implementation: ImplementationVerdict;
  effectiveness: EffectivenessVerdict; criterion: string | null; note: string | null;
}): Promise<{ reviewId: string | null; error: string | null }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("quality_review_control", {
    p_control_id: input.controlId, p_design: input.design,
    p_implementation: input.implementation, p_effectiveness: input.effectiveness,
    p_criterion: input.criterion, p_note: input.note, p_reviewed_on: null,
  });
  if (error) return { reviewId: null, error: rpcError(error, "No fue posible registrar la evaluación del control.") };
  return { reviewId: data ? String(data) : null, error: null };
}

// ---------------------------------------------------------------------------
// Oportunidades
// ---------------------------------------------------------------------------

export type OpportunityListRow = {
  opportunityId: string; organizationId: string;
  code: string; title: string; situation: string;
  expectedBenefit: string | null; opportunityKind: OpportunityKind;
  status: OpportunityStatus; identifiedOn: string;
  ownerPositionId: string | null; ownerPositionName: string | null;
  treatmentDecision: OpportunityDecision | null; decidedOn: string | null;
  priorityLevel: string | null; priorityScore: number | null; priorityAssessedOn: string | null;
  realizedBenefitLevel: string | null;
  assessmentCount: number; actionCount: number; objectiveCount: number;
};

function mapOpportunityRow(o: Record<string, unknown>): OpportunityListRow {
  return {
    opportunityId: String(o.id), organizationId: String(o.organization_id),
    code: String(o.code), title: String(o.title),
    situation: String(o.situation ?? ""),
    expectedBenefit: (o.expected_benefit as string | null) ?? null,
    opportunityKind: o.opportunity_kind as OpportunityKind,
    status: o.status as OpportunityStatus,
    identifiedOn: String(o.identified_on),
    ownerPositionId: (o.owner_position_id as string | null) ?? null,
    ownerPositionName: (o.owner_position_name as string | null) ?? null,
    treatmentDecision: (o.treatment_decision as OpportunityDecision | null) ?? null,
    decidedOn: (o.decided_on as string | null) ?? null,
    priorityLevel: (o.priority_level as string | null) ?? null,
    priorityScore: o.priority_score == null ? null : Number(o.priority_score),
    priorityAssessedOn: (o.priority_assessed_on as string | null) ?? null,
    realizedBenefitLevel: (o.realized_benefit_level as string | null) ?? null,
    assessmentCount: Number(o.assessment_count ?? 0),
    actionCount: Number(o.action_count ?? 0),
    objectiveCount: Number(o.objective_count ?? 0),
  };
}

export async function listOpportunities(organizationId: string): Promise<OpportunityListRow[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("v_quality_opportunity_overview")
    .select("*")
    .eq("organization_id", organizationId)
    .order("code");
  if (error || !data) return [];
  return data.map(mapOpportunityRow);
}

export type OpportunityDetail = OpportunityListRow & {
  contextNote: string | null; treatmentRationale: string | null;
  closureReason: string | null;
  processes: { processId: string; name: string }[];
  objectives: { objectiveId: string; name: string }[];
  assessments: {
    assessmentId: string; kind: OpportunityAssessmentKind; assessedOn: string;
    assessedByName: string | null; score: number; derivation: Derivation | null;
    rationale: string | null; versionNumber: number; methodologyName: string;
  }[];
  decisions: RiskDecisionRow[];
  actions: { actionId: string; code: string; title: string; status: string; dueOn: string | null }[];
};

export async function getOpportunity(opportunityId: string): Promise<OpportunityDetail | null> {
  const supabase = await createServerClient();
  const { data: head } = await supabase
    .from("v_quality_opportunity_overview").select("*").eq("id", opportunityId).maybeSingle();
  if (!head) return null;

  const { data: base } = await supabase
    .from("quality_opportunities")
    .select("context_note, treatment_rationale, closure_reason")
    .eq("id", opportunityId).maybeSingle();

  const [processes, objectives, assessments, decisions, refs] = await Promise.all([
    supabase.from("quality_opportunity_processes")
      .select("process_id, quality_processes!quality_opportunity_processes_process_fk (id, name)")
      .eq("opportunity_id", opportunityId),
    supabase.from("quality_opportunity_objectives")
      .select("objective_id, quality_objectives!quality_opportunity_objectives_objective_fk (id, name)")
      .eq("opportunity_id", opportunityId),
    supabase.from("quality_opportunity_assessments")
      .select(`id, assessment_kind, assessed_on, score, derivation, rationale,
               profiles!quality_opportunity_assessments_assessed_by_fkey (full_name),
               quality_risk_methodology_versions!quality_opportunity_assessments_version_fk
                 (version_number, quality_risk_methodologies (name))`)
      .eq("opportunity_id", opportunityId)
      .order("assessed_on", { ascending: false }),
    supabase.from("work_decisions")
      .select("id, decision_kind, outcome, rationale, decided_at, context, profiles (full_name)")
      .eq("subject_kind", "opportunity").eq("subject_id", opportunityId)
      .order("decided_at", { ascending: false }),
    supabase.from("work_references").select("owner_id")
      .eq("ref_kind", "quality_opportunity").eq("ref_id", opportunityId).eq("owner_kind", "action"),
  ]);

  const actionIds = [...new Set((refs.data ?? []).map((r) => String(r.owner_id)))];
  const { data: actionRows } = actionIds.length
    ? await supabase.from("work_actions").select("id, code, title, status, due_on").in("id", actionIds).order("code")
    : { data: [] as Record<string, unknown>[] };

  const name = (v: unknown): string | null => {
    const p = v as { full_name?: string } | { full_name?: string }[] | null;
    if (!p) return null;
    return Array.isArray(p) ? (p[0]?.full_name ?? null) : (p.full_name ?? null);
  };
  const one = <T,>(v: unknown): T | null => (Array.isArray(v) ? ((v[0] as T) ?? null) : ((v as T) ?? null));

  return {
    ...mapOpportunityRow(head),
    contextNote: (base?.context_note as string | null) ?? null,
    treatmentRationale: (base?.treatment_rationale as string | null) ?? null,
    closureReason: (base?.closure_reason as string | null) ?? null,
    processes: (processes.data ?? []).flatMap((p) => {
      const x = one<{ id: string; name: string }>(p.quality_processes);
      return x ? [{ processId: x.id, name: x.name }] : [];
    }),
    objectives: (objectives.data ?? []).flatMap((o) => {
      const x = one<{ id: string; name: string }>(o.quality_objectives);
      return x ? [{ objectiveId: x.id, name: x.name }] : [];
    }),
    assessments: (assessments.data ?? []).map((a) => {
      const ver = one<{ version_number: number; quality_risk_methodologies: unknown }>(
        a.quality_risk_methodology_versions
      );
      const meth = one<{ name: string }>(ver?.quality_risk_methodologies);
      return {
        assessmentId: String(a.id),
        kind: a.assessment_kind as OpportunityAssessmentKind,
        assessedOn: String(a.assessed_on),
        assessedByName: name(a.profiles),
        score: Number(a.score),
        derivation: asDerivation(a.derivation),
        rationale: (a.rationale as string | null) ?? null,
        versionNumber: Number(ver?.version_number ?? 0),
        methodologyName: meth?.name ?? "—",
      };
    }),
    decisions: (decisions.data ?? []).map((d) => ({
      decisionId: String(d.id), decisionKind: String(d.decision_kind),
      outcome: (d.outcome as string | null) ?? null,
      rationale: (d.rationale as string | null) ?? null,
      decidedAt: String(d.decided_at), decidedByName: name(d.profiles),
      context: (d.context as Record<string, unknown> | null) ?? null,
    })),
    actions: (actionRows ?? []).map((a) => ({
      actionId: String(a.id), code: String(a.code), title: String(a.title),
      status: String(a.status), dueOn: (a.due_on as string | null) ?? null,
    })),
  };
}

export async function createOpportunity(input: {
  organizationId: string; title: string; situation: string; expectedBenefit: string | null;
  opportunityKind: OpportunityKind; ownerPositionId: string | null;
  processIds: string[]; objectiveIds: string[];
}): Promise<{ opportunityId: string | null; error: string | null }> {
  const supabase = await createServerClient();
  const { data: code, error: eCode } = await supabase.rpc("quality_next_ro_code", {
    p_organization_id: input.organizationId, p_kind: "opportunity",
  });
  if (eCode || !code) return { opportunityId: null, error: rpcError(eCode, "No fue posible reservar el código.") };

  const { data, error } = await supabase
    .from("quality_opportunities")
    .insert({
      organization_id: input.organizationId, code, title: input.title,
      situation: input.situation, expected_benefit: input.expectedBenefit,
      opportunity_kind: input.opportunityKind, owner_position_id: input.ownerPositionId,
    })
    .select("id").single();
  if (error || !data) return { opportunityId: null, error: rpcError(error, "No fue posible registrar la oportunidad.") };

  const opportunityId = String(data.id);
  if (input.processIds.length > 0) {
    await supabase.from("quality_opportunity_processes").insert(
      input.processIds.map((p) => ({
        organization_id: input.organizationId, opportunity_id: opportunityId, process_id: p,
      }))
    );
  }
  if (input.objectiveIds.length > 0) {
    await supabase.from("quality_opportunity_objectives").insert(
      input.objectiveIds.map((o) => ({
        organization_id: input.organizationId, opportunity_id: opportunityId, objective_id: o,
      }))
    );
  }
  return { opportunityId, error: null };
}

export async function assessOpportunity(input: {
  opportunityId: string; kind: OpportunityAssessmentKind; versionId: string;
  levelIds: string[]; rationale: string | null;
}): Promise<{ assessmentId: string | null; error: string | null }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("quality_assess_opportunity", {
    p_opportunity_id: input.opportunityId, p_kind: input.kind,
    p_version_id: input.versionId, p_level_ids: input.levelIds, p_rationale: input.rationale,
  });
  if (error) return { assessmentId: null, error: rpcError(error, "No fue posible registrar la evaluación.") };
  return { assessmentId: data ? String(data) : null, error: null };
}

export async function decideOpportunity(
  opportunityId: string, decision: OpportunityDecision, rationale: string
): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("quality_decide_opportunity_treatment", {
    p_opportunity_id: opportunityId, p_decision: decision, p_rationale: rationale,
  });
  return { error: error ? rpcError(error, "No fue posible registrar la decisión.") : null };
}

export async function deleteOpportunity(opportunityId: string): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { error } = await supabase.from("quality_opportunities").delete().eq("id", opportunityId);
  return { error: error ? rpcError(error, "No fue posible eliminar la oportunidad.") : null };
}

/** Resumen para la portada de Quality (§64). Solo lo accionable. */
export async function getRiskSummary(organizationId: string): Promise<{
  aboveAppetite: number; reviewsOverdue: number; overdueActions: number;
  pendingApproval: number; activeOpportunities: number;
}> {
  const supabase = await createServerClient();
  const [risks, ops] = await Promise.all([
    supabase.from("v_quality_risk_overview")
      .select("status, current_is_acceptable, review_overdue, overdue_action_count, treatment_status")
      .eq("organization_id", organizationId),
    supabase.from("v_quality_opportunity_overview")
      .select("status").eq("organization_id", organizationId),
  ]);
  const rows = (risks.data ?? []).filter((r) => r.status === "active");
  return {
    aboveAppetite: rows.filter((r) => r.current_is_acceptable === false).length,
    reviewsOverdue: rows.filter((r) => r.review_overdue).length,
    overdueActions: rows.reduce((n, r) => n + Number(r.overdue_action_count ?? 0), 0),
    pendingApproval: rows.filter((r) => r.treatment_status === "pending_approval").length,
    activeOpportunities: (ops.data ?? []).filter(
      (o) => o.status === "active" || o.status === "in_progress"
    ).length,
  };
}
