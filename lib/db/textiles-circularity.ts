import "server-only";

import { createServerClient } from "@/lib/supabase/server";

/**
 * Trazaloop · Sprint T7 (Textil) · Consultas de circularidad. Todo bajo RLS
 * con la sesión real; nada usa service_role.
 */

export type CircularityMethodology = {
  id: string;
  methodCode: string;
  version: string;
  name: string;
  description: string | null;
};

export async function getActiveTextileCircularityMethodology(): Promise<CircularityMethodology | null> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("textile_circularity_methodologies")
    .select("id, method_code, version, name, description")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id as string,
    methodCode: data.method_code as string,
    version: data.version as string,
    name: data.name as string,
    description: (data.description as string | null) ?? null,
  };
}

export type CircularityCriterion = {
  id: string;
  code: string;
  dimensionKey: string;
  question: string;
  helpText: string | null;
  weight: number;
  responseType: string;
  allowsNa: boolean;
  evidenceExpected: boolean;
  displayOrder: number | null;
};

export async function listTextileCircularityCriteria(
  methodologyId: string
): Promise<CircularityCriterion[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("textile_circularity_criteria")
    .select("id, code, dimension_key, question, help_text, weight, response_type, allows_na, evidence_expected, display_order")
    .eq("methodology_id", methodologyId)
    .eq("is_active", true)
    .order("display_order", { ascending: true });
  return (data ?? []).map((r) => ({
    id: r.id as string,
    code: r.code as string,
    dimensionKey: r.dimension_key as string,
    question: r.question as string,
    helpText: (r.help_text as string | null) ?? null,
    weight: Number(r.weight),
    responseType: r.response_type as string,
    allowsNa: Boolean(r.allows_na),
    evidenceExpected: Boolean(r.evidence_expected),
    displayOrder: r.display_order === null ? null : Number(r.display_order),
  }));
}

export type CircularityAssessmentRow = {
  id: string;
  assessmentCode: string;
  referenceId: string;
  sku: string | null;
  productName: string | null;
  outputLotId: string | null;
  outputLotCode: string | null;
  assessmentDate: string | null;
  status: string;
  circularityScore: number | null;
  readinessLevel: string | null;
  dimensionScores: Record<string, { score: number | null; weight: number; applicable_weight: number }>;
  gaps: Array<{ code: string; dimension: string; message: string }>;
  recommendations: Array<{ code: string; text: string }>;
  calculatedAt: string | null;
  completedAt: string | null;
  notes: string | null;
  isActive: boolean;
  methodologyId: string;
};

const ASSESSMENT_COLUMNS =
  "id, assessment_code, reference_id, output_lot_id, assessment_date, status, circularity_score, readiness_level, dimension_scores, gaps, recommendations, calculated_at, completed_at, notes, is_active, methodology_id, textile_references(sku, textile_products(name)), textile_output_lots(output_lot_code)";

function mapAssessment(r: Record<string, unknown>): CircularityAssessmentRow {
  const ref = r.textile_references as unknown as { sku: string; textile_products: { name: string } | null } | null;
  const lot = r.textile_output_lots as unknown as { output_lot_code: string } | null;
  return {
    id: r.id as string,
    assessmentCode: r.assessment_code as string,
    referenceId: r.reference_id as string,
    sku: ref?.sku ?? null,
    productName: ref?.textile_products?.name ?? null,
    outputLotId: (r.output_lot_id as string | null) ?? null,
    outputLotCode: lot?.output_lot_code ?? null,
    assessmentDate: (r.assessment_date as string | null) ?? null,
    status: r.status as string,
    circularityScore: r.circularity_score === null ? null : Number(r.circularity_score),
    readinessLevel: (r.readiness_level as string | null) ?? null,
    dimensionScores: (r.dimension_scores as CircularityAssessmentRow["dimensionScores"]) ?? {},
    gaps: (r.gaps as CircularityAssessmentRow["gaps"]) ?? [],
    recommendations: (r.recommendations as CircularityAssessmentRow["recommendations"]) ?? [],
    calculatedAt: (r.calculated_at as string | null) ?? null,
    completedAt: (r.completed_at as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    isActive: Boolean(r.is_active),
    methodologyId: r.methodology_id as string,
  };
}

export async function listTextileCircularityAssessments(
  organizationId: string,
  filters?: { referenceId?: string; outputLotId?: string }
): Promise<CircularityAssessmentRow[]> {
  const supabase = await createServerClient();
  let query = supabase
    .from("textile_circularity_assessments")
    .select(ASSESSMENT_COLUMNS)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  if (filters?.referenceId) query = query.eq("reference_id", filters.referenceId);
  if (filters?.outputLotId) query = query.eq("output_lot_id", filters.outputLotId);
  const { data, error } = await query;
  if (error || !data) return [];
  return data.map((r) => mapAssessment(r as Record<string, unknown>));
}

export async function getTextileCircularityAssessment(
  organizationId: string,
  assessmentId: string
): Promise<CircularityAssessmentRow | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("textile_circularity_assessments")
    .select(ASSESSMENT_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("id", assessmentId)
    .maybeSingle();
  if (error || !data) return null;
  return mapAssessment(data as Record<string, unknown>);
}

export type CircularityAnswerRow = {
  id: string;
  criterionId: string;
  answerValue: number | null;
  answerText: string | null;
  notApplicable: boolean;
  evidenceNotes: string | null;
};

export async function listTextileCircularityAnswers(
  organizationId: string,
  assessmentId: string
): Promise<CircularityAnswerRow[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("textile_circularity_answers")
    .select("id, criterion_id, answer_value, answer_text, not_applicable, evidence_notes")
    .eq("organization_id", organizationId)
    .eq("assessment_id", assessmentId);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    criterionId: r.criterion_id as string,
    answerValue: r.answer_value === null ? null : Number(r.answer_value),
    answerText: (r.answer_text as string | null) ?? null,
    notApplicable: Boolean(r.not_applicable),
    evidenceNotes: (r.evidence_notes as string | null) ?? null,
  }));
}

export async function textileCircularityAssessmentBelongsToOrg(
  organizationId: string,
  assessmentId: string
): Promise<boolean> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("textile_circularity_assessments")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("id", assessmentId)
    .maybeSingle();
  return Boolean(data);
}

/**
 * Sprint T9E · ¿La referencia es UTILIZABLE para evaluar circularidad?
 * Misma regla que el listado del formulario (listReferenceCircularityContexts):
 * existe, pertenece a la organización activa y está ACTIVA. La lectura y la
 * validación de escritura jamás deben divergir — una referencia desactivada
 * ni se ofrece ni se acepta.
 */
export async function textileReferenceIsUsableForCircularity(
  organizationId: string,
  referenceId: string
): Promise<boolean> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("textile_references")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("id", referenceId)
    .eq("is_active", true)
    .maybeSingle();
  return Boolean(data);
}

/** Contexto ligero de una referencia para la página de nueva evaluación. */
export type ReferenceCircularityContext = {
  referenceId: string;
  sku: string;
  productName: string | null;
  fiberRows: number;
  materialsCount: number;
  componentsCount: number;
  evidenceLinks: number;
  outputLots: Array<{ id: string; code: string }>;
};

export async function listReferenceCircularityContexts(
  organizationId: string
): Promise<ReferenceCircularityContext[]> {
  const supabase = await createServerClient();
  const [{ data: refs }, { data: fibers }, { data: mats }, { data: comps }, { data: links }, { data: lots }] =
    await Promise.all([
      supabase
        .from("textile_references")
        .select("id, sku, is_active, textile_products(name)")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("sku"),
      supabase
        .from("textile_reference_fiber_composition")
        .select("reference_id")
        .eq("organization_id", organizationId),
      supabase
        .from("textile_reference_materials")
        .select("reference_id")
        .eq("organization_id", organizationId),
      supabase
        .from("textile_reference_components")
        .select("reference_id")
        .eq("organization_id", organizationId),
      supabase
        .from("textile_evidence_links")
        .select("entity_id")
        .eq("organization_id", organizationId)
        .eq("entity_type", "reference"),
      supabase
        .from("textile_output_lots")
        .select("id, output_lot_code, textile_production_orders(reference_id)")
        .eq("organization_id", organizationId),
    ]);

  const countBy = (rows: Array<Record<string, unknown>> | null, key: string) => {
    const map = new Map<string, number>();
    for (const r of rows ?? []) {
      const id = r[key] as string;
      map.set(id, (map.get(id) ?? 0) + 1);
    }
    return map;
  };
  const fiberMap = countBy(fibers, "reference_id");
  const matMap = countBy(mats, "reference_id");
  const compMap = countBy(comps, "reference_id");
  const linkMap = countBy(links, "entity_id");
  const lotsByRef = new Map<string, Array<{ id: string; code: string }>>();
  for (const l of lots ?? []) {
    const order = l.textile_production_orders as unknown as { reference_id: string } | null;
    if (!order) continue;
    const list = lotsByRef.get(order.reference_id) ?? [];
    list.push({ id: l.id as string, code: l.output_lot_code as string });
    lotsByRef.set(order.reference_id, list);
  }

  return (refs ?? []).map((r) => {
    const product = r.textile_products as unknown as { name: string } | null;
    return {
      referenceId: r.id as string,
      sku: r.sku as string,
      productName: product?.name ?? null,
      fiberRows: fiberMap.get(r.id as string) ?? 0,
      materialsCount: matMap.get(r.id as string) ?? 0,
      componentsCount: compMap.get(r.id as string) ?? 0,
      evidenceLinks: linkMap.get(r.id as string) ?? 0,
      outputLots: lotsByRef.get(r.id as string) ?? [],
    };
  });
}

/** Evidencias vinculadas a una evaluación (soportes de circularidad). */
export type CircularityEvidenceLinkRow = {
  id: string;
  linkType: string;
  evidence: { id: string; title: string; status: string };
};

export async function listCircularityAssessmentEvidenceLinks(
  organizationId: string,
  assessmentId: string
): Promise<CircularityEvidenceLinkRow[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("textile_evidence_links")
    .select("id, link_type, textile_evidences(id, title, status)")
    .eq("organization_id", organizationId)
    .eq("entity_type", "circularity_assessment")
    .eq("entity_id", assessmentId)
    .order("created_at", { ascending: true });
  return (data ?? []).flatMap((r) => {
    const ev = r.textile_evidences as unknown as { id: string; title: string; status: string } | null;
    if (!ev) return [];
    return [{ id: r.id as string, linkType: r.link_type as string, evidence: ev }];
  });
}
