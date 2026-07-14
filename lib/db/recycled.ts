import "server-only";

import { createServerClient } from "@/lib/supabase/server";

export type DefensibilityLevel = "preliminary" | "with_warnings" | "defensible";

export const LEVEL_LABEL: Record<DefensibilityLevel, string> = {
  preliminary: "Preliminar",
  with_warnings: "Con advertencias",
  defensible: "Defendible",
};

export const EXCLUSION_LABEL: Record<string, string> = {
  same_process_or_never_counts:
    "Recuperado en el mismo proceso: suma a la masa total pero nunca cuenta como reciclado",
  postindustrial_not_reclassified:
    "Postindustrial sin reclasificación soportada",
  other_not_supported_in_methodology_v1:
    "Clasificación \u201cOtro\u201d no soportada en la metodología v1",
  non_recycled_material: "Material no reciclado (virgen, aditivo, pigmento, carga o masterbatch)",
  not_eligible_classification: "Clasificación no elegible según la metodología",
  invalid_reclassification_support: "Reclasificación sin soporte completo y validado",
  missing_origin_support: "Sin evidencia de soporte de origen",
  origin_support_not_valid: "El soporte de origen no está validado",
};

export const WARNING_LABEL: Record<string, string> = {
  mass_balance_out_of_tolerance:
    "Balance de masa fuera de tolerancia (consumo vs composición)",
  produced_vs_composition_out_of_tolerance:
    "Cantidad producida difiere de la composición más del 5%",
  declared_above_calculated: "El porcentaje declarado supera al calculado",
  components_excluded_for_missing_support:
    "Hay masa elegible excluida por falta de soporte",
  postindustrial_not_reclassified_present:
    "Hay material postindustrial sin reclasificar",
  related_evidence_not_valid:
    "Hay evidencia pendiente o rechazada asociada a materiales reciclados",
};

export type CalculationComponent = {
  material_id: string;
  material_name: string;
  mass_kg: number;
  classification_code: string;
  effective_classification: string;
  is_same_process: boolean;
  counts_override: boolean | null;
  origin_support_evidence_id: string | null;
  origin_support_status: string | null;
  reclassification_evidence_id: string | null;
  reclassification_support_status: string | null;
  counted: boolean;
  exclusion_reason: string | null;
  warning_codes: string[];
};

export type Calculation = {
  id: string;
  output_batch_id: string;
  methodology_id: string;
  total_mass_kg: number;
  recycled_mass_kg: number;
  recycled_percent: number;
  declared_percent: number | null;
  risk_flag: boolean;
  defensibility_level: DefensibilityLevel;
  warnings: string[];
  components: CalculationComponent[];
  calculated_at: string;
};

export type LatestBatchRecycled = {
  calculation_id: string;
  output_batch_id: string;
  output_batch_code: string;
  production_order_id: string | null;
  production_order_code: string | null;
  product_id: string | null;
  product_code: string | null;
  product_name: string | null;
  family_id: string | null;
  produced_date: string | null;
  recycled_mass_kg: number;
  total_mass_kg: number;
  recycled_percent: number;
  declared_percent: number | null;
  risk_flag: boolean;
  defensibility_level: DefensibilityLevel;
  calculated_at: string;
};

const num = (v: unknown): number => Number(v);
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

function mapCalculation(r: Record<string, unknown>): Calculation {
  return {
    id: r.id as string,
    output_batch_id: r.output_batch_id as string,
    methodology_id: r.methodology_id as string,
    total_mass_kg: num(r.total_mass_kg),
    recycled_mass_kg: num(r.recycled_mass_kg),
    recycled_percent: num(r.recycled_percent),
    declared_percent: numOrNull(r.declared_percent),
    risk_flag: Boolean(r.risk_flag),
    defensibility_level: r.defensibility_level as DefensibilityLevel,
    warnings: (r.warnings as string[]) ?? [],
    components: ((r.components as CalculationComponent[]) ?? []).map((c) => ({
      ...c,
      mass_kg: num(c.mass_kg),
    })),
    calculated_at: r.calculated_at as string,
  };
}

export async function listLatestCalculations(
  orgId: string,
  limit?: number
): Promise<LatestBatchRecycled[]> {
  const supabase = await createServerClient();
  let query = supabase
    .from("v_latest_batch_recycled")
    .select("*")
    .eq("organization_id", orgId)
    .order("calculated_at", { ascending: false });
  if (limit) query = query.limit(limit);
  const { data } = await query;
  return (data ?? []).map((r) => ({
    ...r,
    recycled_mass_kg: num(r.recycled_mass_kg),
    total_mass_kg: num(r.total_mass_kg),
    recycled_percent: num(r.recycled_percent),
    declared_percent: numOrNull(r.declared_percent),
  })) as LatestBatchRecycled[];
}

export async function listCalculationsForBatch(
  orgId: string,
  outputBatchId: string
): Promise<Calculation[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("recycled_content_calculations")
    .select("*")
    .eq("organization_id", orgId)
    .eq("output_batch_id", outputBatchId)
    .order("calculated_at", { ascending: false });
  return (data ?? []).map(mapCalculation);
}

export async function getCalculationDetail(
  orgId: string,
  calculationId: string
): Promise<Calculation | null> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("recycled_content_calculations")
    .select("*")
    .eq("organization_id", orgId)
    .eq("id", calculationId)
    .maybeSingle();
  return data ? mapCalculation(data) : null;
}

export type RecycledDashboard = {
  batchesWithCalculation: number;
  batchesWithoutCalculation: number;
  defensible: number;
  withWarnings: number;
  preliminary: number;
  lastCalculation: LatestBatchRecycled | null;
  latest: LatestBatchRecycled[];
};

export async function getRecycledDashboard(orgId: string): Promise<RecycledDashboard> {
  const supabase = await createServerClient();
  const [latest, batches] = await Promise.all([
    listLatestCalculations(orgId),
    supabase
      .from("output_batches")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId),
  ]);
  const totalBatches = batches.count ?? 0;
  return {
    batchesWithCalculation: latest.length,
    batchesWithoutCalculation: Math.max(totalBatches - latest.length, 0),
    defensible: latest.filter((l) => l.defensibility_level === "defensible").length,
    withWarnings: latest.filter((l) => l.defensibility_level === "with_warnings").length,
    preliminary: latest.filter((l) => l.defensibility_level === "preliminary").length,
    lastCalculation: latest[0] ?? null,
    latest: latest.slice(0, 10),
  };
}

export type AggregateRow = {
  recycled_mass_kg: number | null;
  total_mass_kg: number | null;
  recycled_percent: number | null;
  /** null = sin cálculos en el alcance (Sprint 4.1). */
  defensibility_level: DefensibilityLevel | null;
  /** Lotes producidos / lotes finales en el alcance del agregado (Sprint 4.1). */
  total_batches_count: number;
  calculated_batches_count: number;
  uncalculated_batches_count: number;
  has_uncalculated_batches: boolean;
  [key: string]: unknown;
};

async function readAggregate(view: string, orgId: string): Promise<AggregateRow[]> {
  const supabase = await createServerClient();
  const { data } = await supabase.from(view).select("*").eq("organization_id", orgId);
  return (data ?? []).map((r) => ({
    ...r,
    recycled_mass_kg: numOrNull(r.recycled_mass_kg),
    total_mass_kg: numOrNull(r.total_mass_kg),
    recycled_percent: numOrNull(r.recycled_percent),
    // v_recycled_by_order expone el total como output_batches_count;
    // las demás vistas como total_batches_count (Sprint 4.1).
    total_batches_count: Number(r.total_batches_count ?? r.output_batches_count ?? 0),
    calculated_batches_count: Number(r.calculated_batches_count ?? 0),
    uncalculated_batches_count: Number(r.uncalculated_batches_count ?? 0),
    has_uncalculated_batches: Boolean(r.has_uncalculated_batches),
  })) as AggregateRow[];
}

export const getRecycledByOrder = (orgId: string) => readAggregate("v_recycled_by_order", orgId);
export const getRecycledByProduct = (orgId: string) => readAggregate("v_recycled_by_product", orgId);
export const getRecycledByFamily = (orgId: string) => readAggregate("v_recycled_by_family", orgId);
export const getRecycledByPeriod = (orgId: string) => readAggregate("v_recycled_by_period", orgId);
