import "server-only";

import { createServerClient } from "@/lib/supabase/server";
import type { DefensibilityLevel } from "@/lib/db/recycled";

export type DossierRow = {
  calculation_id: string;
  output_batch_id: string;
  output_batch_code: string;
  produced_date: string | null;
  produced_quantity_kg: number | null;
  production_order_id: string | null;
  production_order_code: string | null;
  product_id: string | null;
  product_code: string | null;
  product_name: string | null;
  family_id: string | null;
  family_name: string | null;
  methodology_id: string;
  methodology_code: string;
  methodology_version: number;
  methodology_name: string;
  methodology_rules_snapshot: Record<string, unknown>;
  total_mass_kg: number;
  recycled_mass_kg: number;
  recycled_percent: number;
  declared_percent: number | null;
  risk_flag: boolean;
  defensibility_level: DefensibilityLevel;
  warnings: string[];
  calculated_by: string;
  calculated_by_name: string | null;
  calculated_at: string;
  traceability_status: string | null;
  mass_balance_warning: boolean;
  consumed_mass_kg: number | null;
  composition_mass_kg: number | null;
};

export type ComponentRow = {
  calculation_id: string;
  component_index: number;
  material_id: string | null;
  material_name: string | null;
  mass_kg: number | null;
  classification_code: string | null;
  effective_classification: string | null;
  is_same_process: boolean;
  origin_support_evidence_id: string | null;
  origin_support_status: string | null;
  reclassification_evidence_id: string | null;
  reclassification_support_status: string | null;
  counted: boolean;
  exclusion_reason: string | null;
  warning_codes: string[];
};

export type EvidenceMatrixRow = {
  output_batch_id: string;
  output_batch_code: string;
  calculation_id: string | null;
  evidence_id: string;
  evidence_code: string | null;
  evidence_title: string;
  evidence_type: string | null;
  evidence_status: string;
  linked_entity_type: string;
  linked_entity_id: string | null;
  linked_entity_label: string | null;
  support_role: string;
  is_required_for_defensibility: boolean;
  is_valid_for_defensibility: boolean;
  created_at: string;
  validated_at: string | null;
};

export type SupportGapRow = {
  output_batch_id: string;
  output_batch_code: string;
  calculation_id: string | null;
  gap_code: string;
  gap_severity: "critical" | "warning" | "info";
  gap_label: string;
  gap_description: string;
  related_entity_type: string;
  related_entity_id: string | null;
  related_entity_label: string | null;
  suggested_action: string;
};

export const SUPPORT_ROLE_LABEL: Record<string, string> = {
  output_batch_support: "Soporte del lote de salida",
  production_order_support: "Soporte de la orden de producción",
  input_batch_support: "Soporte de lote de entrada",
  material_origin_support: "Soporte de origen del material",
  material_reclassification_support: "Soporte de reclasificación",
  product_support: "Soporte del producto",
  family_support: "Soporte de la familia",
  supplier_support: "Soporte del proveedor",
  other_linked_support: "Otro soporte asociado",
};

export const GAP_SEVERITY_LABEL: Record<string, string> = {
  critical: "Crítica",
  warning: "Advertencia",
  info: "Informativa",
};

const num = (v: unknown): number => Number(v);
const numOrNull = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v);

export async function getDossier(
  orgId: string,
  calculationId: string
): Promise<DossierRow | null> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("v_calculation_dossier")
    .select("*")
    .eq("organization_id", orgId)
    .eq("calculation_id", calculationId)
    .maybeSingle();
  if (!data) return null;
  return {
    ...data,
    produced_quantity_kg: numOrNull(data.produced_quantity_kg),
    total_mass_kg: num(data.total_mass_kg),
    recycled_mass_kg: num(data.recycled_mass_kg),
    recycled_percent: num(data.recycled_percent),
    declared_percent: numOrNull(data.declared_percent),
    consumed_mass_kg: numOrNull(data.consumed_mass_kg),
    composition_mass_kg: numOrNull(data.composition_mass_kg),
    warnings: (data.warnings as string[]) ?? [],
  } as DossierRow;
}

export async function listComponentRows(
  orgId: string,
  calculationId: string
): Promise<ComponentRow[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("v_calculation_component_rows")
    .select("*")
    .eq("organization_id", orgId)
    .eq("calculation_id", calculationId)
    .order("component_index");
  return (data ?? []).map((r) => ({
    ...r,
    mass_kg: numOrNull(r.mass_kg),
    warning_codes: (r.warning_codes as string[]) ?? [],
  })) as ComponentRow[];
}

export async function listEvidenceMatrix(
  orgId: string,
  outputBatchId: string
): Promise<EvidenceMatrixRow[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("v_output_batch_evidence_matrix")
    .select("*")
    .eq("organization_id", orgId)
    .eq("output_batch_id", outputBatchId)
    .order("support_role")
    .order("evidence_title");
  return (data ?? []) as EvidenceMatrixRow[];
}

export async function listSupportGaps(
  orgId: string,
  outputBatchId?: string
): Promise<SupportGapRow[]> {
  const supabase = await createServerClient();
  let query = supabase
    .from("v_output_batch_support_gaps")
    .select("*")
    .eq("organization_id", orgId);
  if (outputBatchId) query = query.eq("output_batch_id", outputBatchId);
  const { data } = await query;
  const order = { critical: 0, warning: 1, info: 2 } as const;
  return ((data ?? []) as SupportGapRow[]).sort(
    (a, b) => order[a.gap_severity] - order[b.gap_severity]
  );
}

export type ChainRow = {
  input_batch_code: string;
  supplier_name: string | null;
  material_name: string | null;
  classification_code: string | null;
  mass_kg: number;
  received_date: string | null;
};

/** Cadena hacia atrás para el dossier: lotes de entrada consumidos con
 *  proveedor, material, clasificación y fecha de recepción. */
export async function listTraceabilityChain(
  orgId: string,
  productionOrderId: string
): Promise<ChainRow[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("batch_consumption")
    .select(
      "mass_kg, input_batches(batch_code, received_date, suppliers(name), materials(name, classification_code))"
    )
    .eq("organization_id", orgId)
    .eq("production_order_id", productionOrderId)
    .order("created_at");
  return (data ?? []).map((c) => {
    const ib = c.input_batches as unknown as {
      batch_code: string;
      received_date: string | null;
      suppliers: { name: string } | null;
      materials: { name: string; classification_code: string } | null;
    } | null;
    return {
      input_batch_code: ib?.batch_code ?? "—",
      supplier_name: ib?.suppliers?.name ?? null,
      material_name: ib?.materials?.name ?? null,
      classification_code: ib?.materials?.classification_code ?? null,
      mass_kg: Number(c.mass_kg),
      received_date: ib?.received_date ?? null,
    };
  });
}
