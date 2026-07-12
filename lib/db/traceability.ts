import "server-only";

import { createServerClient } from "@/lib/supabase/server";

export type InputBatch = {
  id: string;
  batch_code: string;
  supplier_id: string;
  supplier_name: string;
  material_id: string;
  material_name: string;
  site_id: string | null;
  site_name: string | null;
  residue_type: string | null;
  provenance: string | null;
  received_date: string;
  quantity_kg: number | null;
  storage_location: string | null;
  notes: string | null;
  consumed_kg: number;
};

export type ProductionOrder = {
  id: string;
  order_code: string;
  order_date: string;
  status: string;
  site_id: string | null;
  site_name: string | null;
  pretreatment: string | null;
  process_variables: unknown;
  notes: string | null;
};

export type ConsumptionRow = {
  id: string;
  input_batch_id: string;
  input_batch_code: string;
  material_name: string;
  supplier_name: string;
  mass_kg: number;
  notes: string | null;
  input_quantity_kg: number | null;
  input_total_consumed_kg: number;
};

export type OutputBatch = {
  id: string;
  batch_code: string;
  production_order_id: string;
  production_order_code: string;
  product_id: string | null;
  product_label: string | null;
  produced_date: string | null;
  produced_quantity_kg: number | null;
  characteristics: string | null;
  intended_application: string | null;
  storage_location: string | null;
  notes: string | null;
};

export type CompositionRow = {
  id: string;
  material_id: string;
  material_name: string;
  classification_code: string;
  mass_kg: number;
  is_same_process: boolean;
  notes: string | null;
};

export type Completeness = {
  output_batch_id: string;
  output_batch_code: string;
  production_order_code: string | null;
  product_code: string | null;
  product_name: string | null;
  has_order: boolean;
  has_consumption: boolean;
  has_composition: boolean;
  has_supplier_info: boolean;
  has_material_info: boolean;
  consumed_mass_kg: number | null;
  composition_mass_kg: number | null;
  produced_quantity_kg: number | null;
  mass_balance_warning: boolean | null;
  missing_items: string[];
  traceability_status: "incomplete" | "complete_with_warnings" | "complete";
};

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export async function listInputBatches(
  orgId: string,
  filters?: { supplierId?: string; materialId?: string }
): Promise<InputBatch[]> {
  const supabase = await createServerClient();
  let query = supabase
    .from("input_batches")
    .select(
      "id, batch_code, supplier_id, material_id, site_id, residue_type, provenance, received_date, quantity_kg, storage_location, notes, suppliers(name), materials(name), sites(name), batch_consumption(mass_kg)"
    )
    .eq("organization_id", orgId)
    .order("received_date", { ascending: false });

  if (filters?.supplierId) query = query.eq("supplier_id", filters.supplierId);
  if (filters?.materialId) query = query.eq("material_id", filters.materialId);

  const { data } = await query;
  return (data ?? []).map((b) => {
    const supplier = b.suppliers as unknown as { name: string } | null;
    const material = b.materials as unknown as { name: string } | null;
    const site = b.sites as unknown as { name: string } | null;
    const consumption = (b.batch_consumption as unknown as { mass_kg: number }[]) ?? [];
    return {
      id: b.id,
      batch_code: b.batch_code,
      supplier_id: b.supplier_id,
      supplier_name: supplier?.name ?? "—",
      material_id: b.material_id,
      material_name: material?.name ?? "—",
      site_id: b.site_id,
      site_name: site?.name ?? null,
      residue_type: b.residue_type,
      provenance: b.provenance,
      received_date: b.received_date,
      quantity_kg: num(b.quantity_kg),
      storage_location: b.storage_location,
      notes: b.notes,
      consumed_kg: consumption.reduce((acc, c) => acc + Number(c.mass_kg), 0),
    };
  });
}

export async function listProductionOrders(orgId: string): Promise<ProductionOrder[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("production_orders")
    .select("id, order_code, order_date, status, site_id, pretreatment, process_variables, notes, sites(name)")
    .eq("organization_id", orgId)
    .order("order_date", { ascending: false });
  return (data ?? []).map((o) => {
    const site = o.sites as unknown as { name: string } | null;
    return {
      id: o.id,
      order_code: o.order_code,
      order_date: o.order_date,
      status: o.status,
      site_id: o.site_id,
      site_name: site?.name ?? null,
      pretreatment: o.pretreatment,
      process_variables: o.process_variables,
      notes: o.notes,
    };
  });
}

export async function listConsumption(
  orgId: string,
  productionOrderId: string
): Promise<ConsumptionRow[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("batch_consumption")
    .select(
      "id, input_batch_id, mass_kg, notes, input_batches(batch_code, quantity_kg, suppliers(name), materials(name), batch_consumption(mass_kg))"
    )
    .eq("organization_id", orgId)
    .eq("production_order_id", productionOrderId)
    .order("created_at");
  return (data ?? []).map((c) => {
    const ib = c.input_batches as unknown as {
      batch_code: string;
      quantity_kg: number | null;
      suppliers: { name: string } | null;
      materials: { name: string } | null;
      batch_consumption: { mass_kg: number }[] | null;
    } | null;
    return {
      id: c.id,
      input_batch_id: c.input_batch_id,
      input_batch_code: ib?.batch_code ?? "—",
      supplier_name: ib?.suppliers?.name ?? "—",
      material_name: ib?.materials?.name ?? "—",
      mass_kg: Number(c.mass_kg),
      notes: c.notes,
      input_quantity_kg: num(ib?.quantity_kg),
      input_total_consumed_kg: (ib?.batch_consumption ?? []).reduce(
        (acc, r) => acc + Number(r.mass_kg),
        0
      ),
    };
  });
}

export async function listOutputBatches(orgId: string): Promise<OutputBatch[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("output_batches")
    .select(
      "id, batch_code, production_order_id, product_id, produced_date, produced_quantity_kg, characteristics, intended_application, storage_location, notes, production_orders(order_code), products(code, name)"
    )
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });
  return (data ?? []).map((b) => {
    const po = b.production_orders as unknown as { order_code: string } | null;
    const p = b.products as unknown as { code: string; name: string } | null;
    return {
      id: b.id,
      batch_code: b.batch_code,
      production_order_id: b.production_order_id,
      production_order_code: po?.order_code ?? "—",
      product_id: b.product_id,
      product_label: p ? `${p.code} · ${p.name}` : null,
      produced_date: b.produced_date,
      produced_quantity_kg: num(b.produced_quantity_kg),
      characteristics: b.characteristics,
      intended_application: b.intended_application,
      storage_location: b.storage_location,
      notes: b.notes,
    };
  });
}

export async function listComposition(
  orgId: string,
  outputBatchId: string
): Promise<CompositionRow[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("batch_composition")
    .select("id, material_id, mass_kg, is_same_process, notes, materials(name, classification_code)")
    .eq("organization_id", orgId)
    .eq("output_batch_id", outputBatchId)
    .order("created_at");
  return (data ?? []).map((r) => {
    const m = r.materials as unknown as { name: string; classification_code: string } | null;
    return {
      id: r.id,
      material_id: r.material_id,
      material_name: m?.name ?? "—",
      classification_code: m?.classification_code ?? "",
      mass_kg: Number(r.mass_kg),
      is_same_process: r.is_same_process,
      notes: r.notes,
    };
  });
}

export async function getCompleteness(orgId: string): Promise<Completeness[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("v_output_batch_completeness")
    .select("*")
    .eq("organization_id", orgId);
  return (data ?? []).map((r) => ({
    output_batch_id: r.output_batch_id,
    output_batch_code: r.output_batch_code,
    production_order_code: r.production_order_code,
    product_code: r.product_code,
    product_name: r.product_name,
    has_order: r.has_order,
    has_consumption: r.has_consumption,
    has_composition: r.has_composition,
    has_supplier_info: r.has_supplier_info,
    has_material_info: r.has_material_info,
    consumed_mass_kg: num(r.consumed_mass_kg),
    composition_mass_kg: num(r.composition_mass_kg),
    produced_quantity_kg: num(r.produced_quantity_kg),
    mass_balance_warning: r.mass_balance_warning,
    missing_items: (r.missing_items as string[]) ?? [],
    traceability_status: r.traceability_status,
  }));
}

export type BackwardRow = {
  output_batch_id: string;
  output_batch_code: string;
  product_code: string | null;
  product_name: string | null;
  production_order_id: string | null;
  production_order_code: string | null;
  input_batch_id: string | null;
  input_batch_code: string | null;
  supplier_name: string | null;
  material_name: string | null;
  classification_code: string | null;
  consumed_mass_kg: number | null;
};

export async function getBackward(orgId: string, outputBatchId: string): Promise<BackwardRow[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("v_traceability_backward")
    .select("*")
    .eq("organization_id", orgId)
    .eq("output_batch_id", outputBatchId);
  return (data ?? []).map((r) => ({ ...r, consumed_mass_kg: num(r.consumed_mass_kg) })) as BackwardRow[];
}

export type ForwardRow = {
  input_batch_id: string;
  input_batch_code: string;
  supplier_name: string | null;
  material_name: string | null;
  production_order_id: string | null;
  production_order_code: string | null;
  output_batch_id: string | null;
  output_batch_code: string | null;
  product_code: string | null;
  product_name: string | null;
  consumed_mass_kg: number | null;
};

export async function getForward(orgId: string, inputBatchId: string): Promise<ForwardRow[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("v_traceability_forward")
    .select("*")
    .eq("organization_id", orgId)
    .eq("input_batch_id", inputBatchId);
  return (data ?? []).map((r) => ({ ...r, consumed_mass_kg: num(r.consumed_mass_kg) })) as ForwardRow[];
}

export type TraceabilityMetrics = {
  inputBatches: number;
  productionOrders: number;
  outputBatches: number;
  completeBatches: number;
  incompleteBatches: number;
  warningBatches: number;
};

export async function getTraceabilityMetrics(orgId: string): Promise<TraceabilityMetrics> {
  const supabase = await createServerClient();
  const [inputs, orders, completeness] = await Promise.all([
    supabase
      .from("input_batches")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId),
    supabase
      .from("production_orders")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId),
    getCompleteness(orgId),
  ]);
  return {
    inputBatches: inputs.count ?? 0,
    productionOrders: orders.count ?? 0,
    outputBatches: completeness.length,
    completeBatches: completeness.filter((c) => c.traceability_status === "complete").length,
    incompleteBatches: completeness.filter((c) => c.traceability_status === "incomplete").length,
    warningBatches: completeness.filter(
      (c) => c.traceability_status === "complete_with_warnings"
    ).length,
  };
}
