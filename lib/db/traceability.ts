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
  /** PCR-02 (Bloque I): presente en searchProductionOrders/getProductionOrder. */
  created_at?: string | null;
  /** PCR-02.3 · Candado histórico: primera entrada en closed/cancelled.
   *  No nulo ⇒ la orden pertenece al historial y jamás puede eliminarse,
   *  aunque haya sido reabierta (status in_progress). */
  history_locked_at?: string | null;
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
  /** PCR-02.4 · Estado de la orden productora: si está closed/cancelled, la
   *  estructura del lote (y su composición) está congelada en la UI. */
  production_order_status: string;
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
    .select(
      "id, order_code, order_date, status, site_id, pretreatment, process_variables, notes, history_locked_at, sites(name)"
    )
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
      history_locked_at: (o.history_locked_at as string | null) ?? null,
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
      "id, batch_code, production_order_id, product_id, produced_date, produced_quantity_kg, characteristics, intended_application, storage_location, notes, production_orders(order_code, status), products(code, name)"
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
      production_order_status: (po as unknown as { status?: string })?.status ?? "",
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

// ===========================================================================
// PCR-01 (punto 9) · Búsqueda + paginación de listados de trazabilidad.
// Funciones ADITIVAS: las list* de arriba siguen intactas para selects,
// genealogía, flujo guiado, dossier e importaciones. Todo respeta
// organization_id + RLS. Los getters por id existen porque, con paginación,
// el registro en edición (?edit=) o expandido (?order=/?batch=) puede no
// estar en la página actual.
// ===========================================================================
import {
  OPEN_PRODUCTION_ORDER_STATUSES,
  PRODUCTION_ORDER_OPEN_ALERT_HOURS,
} from "@/lib/domain/production-alerts";
import {
  normalizePageQuery,
  pageRange,
  sanitizeSearchTerm,
  type PageResult,
} from "@/lib/domain/pagination";

export type TracePageInput = { q?: string | null; page?: string | number | null };

const INPUT_BATCH_SELECT =
  "id, batch_code, supplier_id, material_id, site_id, residue_type, provenance, received_date, quantity_kg, storage_location, notes, suppliers(name), materials(name), sites(name), batch_consumption(mass_kg)";

function mapInputBatchRow(b: Record<string, unknown>): InputBatch {
  const supplier = b.suppliers as unknown as { name: string } | null;
  const material = b.materials as unknown as { name: string } | null;
  const site = b.sites as unknown as { name: string } | null;
  const consumption = (b.batch_consumption as unknown as { mass_kg: number }[]) ?? [];
  return {
    id: b.id as string,
    batch_code: b.batch_code as string,
    supplier_id: b.supplier_id as string,
    supplier_name: supplier?.name ?? "—",
    material_id: b.material_id as string,
    material_name: material?.name ?? "—",
    site_id: (b.site_id as string | null) ?? null,
    site_name: site?.name ?? null,
    residue_type: (b.residue_type as string | null) ?? null,
    provenance: (b.provenance as string | null) ?? null,
    received_date: b.received_date as string,
    quantity_kg: num(b.quantity_kg),
    storage_location: (b.storage_location as string | null) ?? null,
    notes: (b.notes as string | null) ?? null,
    consumed_kg: consumption.reduce((acc, c) => acc + Number(c.mass_kg), 0),
  };
}

export async function searchInputBatches(
  orgId: string,
  query: TracePageInput & { supplierId?: string; materialId?: string }
): Promise<PageResult<InputBatch>> {
  const { q, page, pageSize } = normalizePageQuery(query);
  const supabase = await createServerClient();
  let request = supabase
    .from("input_batches")
    .select(INPUT_BATCH_SELECT, { count: "exact" })
    .eq("organization_id", orgId);
  if (query.supplierId) request = request.eq("supplier_id", query.supplierId);
  if (query.materialId) request = request.eq("material_id", query.materialId);
  const term = sanitizeSearchTerm(q);
  if (term) {
    request = request.or(
      `batch_code.ilike.%${term}%,provenance.ilike.%${term}%,storage_location.ilike.%${term}%`
    );
  }
  const { from, to } = pageRange(page, pageSize);
  const { data, count } = await request
    .order("received_date", { ascending: false })
    .range(from, to);
  return {
    rows: ((data ?? []) as unknown as Record<string, unknown>[]).map(mapInputBatchRow),
    total: count ?? 0,
    page,
    pageSize,
  };
}

export async function getInputBatch(orgId: string, id: string): Promise<InputBatch | null> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("input_batches")
    .select(INPUT_BATCH_SELECT)
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  return data ? mapInputBatchRow(data as unknown as Record<string, unknown>) : null;
}

const ORDER_SELECT =
  "id, order_code, order_date, status, site_id, pretreatment, process_variables, notes, created_at, history_locked_at, sites(name)";

function mapOrderRow(o: Record<string, unknown>): ProductionOrder {
  const site = o.sites as unknown as { name: string } | null;
  return {
    id: o.id as string,
    order_code: o.order_code as string,
    order_date: o.order_date as string,
    status: o.status as string,
    site_id: (o.site_id as string | null) ?? null,
    site_name: site?.name ?? null,
    pretreatment: (o.pretreatment as string | null) ?? null,
    process_variables: o.process_variables,
    notes: (o.notes as string | null) ?? null,
    created_at: (o.created_at as string | null) ?? null,
    history_locked_at: (o.history_locked_at as string | null) ?? null,
  };
}

export async function searchProductionOrders(
  orgId: string,
  query: TracePageInput
): Promise<PageResult<ProductionOrder>> {
  const { q, page, pageSize } = normalizePageQuery(query);
  const supabase = await createServerClient();
  let request = supabase
    .from("production_orders")
    .select(ORDER_SELECT, { count: "exact" })
    .eq("organization_id", orgId);
  const term = sanitizeSearchTerm(q);
  if (term) {
    request = request.or(`order_code.ilike.%${term}%,pretreatment.ilike.%${term}%`);
  }
  const { from, to } = pageRange(page, pageSize);
  const { data, count } = await request
    .order("order_date", { ascending: false })
    .range(from, to);
  return {
    rows: ((data ?? []) as unknown as Record<string, unknown>[]).map(mapOrderRow),
    total: count ?? 0,
    page,
    pageSize,
  };
}

export async function getProductionOrder(
  orgId: string,
  id: string
): Promise<ProductionOrder | null> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("production_orders")
    .select(ORDER_SELECT)
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  return data ? mapOrderRow(data as unknown as Record<string, unknown>) : null;
}

const OUTPUT_BATCH_SELECT =
  "id, batch_code, production_order_id, product_id, produced_date, produced_quantity_kg, characteristics, intended_application, storage_location, notes, production_orders(order_code, status), products(code, name)";

function mapOutputBatchRow(b: Record<string, unknown>): OutputBatch {
  const po = b.production_orders as unknown as { order_code: string; status?: string } | null;
  const p = b.products as unknown as { code: string; name: string } | null;
  return {
    id: b.id as string,
    batch_code: b.batch_code as string,
    production_order_id: b.production_order_id as string,
    production_order_code: po?.order_code ?? "—",
    production_order_status: po?.status ?? "",
    product_id: (b.product_id as string | null) ?? null,
    product_label: p ? `${p.code} · ${p.name}` : null,
    produced_date: (b.produced_date as string | null) ?? null,
    produced_quantity_kg: num(b.produced_quantity_kg),
    characteristics: (b.characteristics as string | null) ?? null,
    intended_application: (b.intended_application as string | null) ?? null,
    storage_location: (b.storage_location as string | null) ?? null,
    notes: (b.notes as string | null) ?? null,
  };
}

export async function searchOutputBatches(
  orgId: string,
  query: TracePageInput
): Promise<PageResult<OutputBatch>> {
  const { q, page, pageSize } = normalizePageQuery(query);
  const supabase = await createServerClient();
  let request = supabase
    .from("output_batches")
    .select(OUTPUT_BATCH_SELECT, { count: "exact" })
    .eq("organization_id", orgId);
  const term = sanitizeSearchTerm(q);
  if (term) {
    request = request.or(
      `batch_code.ilike.%${term}%,characteristics.ilike.%${term}%,intended_application.ilike.%${term}%`
    );
  }
  const { from, to } = pageRange(page, pageSize);
  const { data, count } = await request
    .order("created_at", { ascending: false })
    .range(from, to);
  return {
    rows: ((data ?? []) as unknown as Record<string, unknown>[]).map(mapOutputBatchRow),
    total: count ?? 0,
    page,
    pageSize,
  };
}

export async function getOutputBatch(orgId: string, id: string): Promise<OutputBatch | null> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("output_batches")
    .select(OUTPUT_BATCH_SELECT)
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  return data ? mapOutputBatchRow(data as unknown as Record<string, unknown>) : null;
}

// ===========================================================================
// PCR-02 · La Orden / corrida como eje: salidas de la orden, consumo interno
// de lotes producidos (output_batch_consumption, 0104) y uso posterior.
// Funciones ADITIVAS acotadas a organization_id + RLS.
// ===========================================================================

/** Salidas (lotes producidos) de UNA orden — Bloques A/B/C. */
export async function listOrderOutputs(
  orgId: string,
  productionOrderId: string
): Promise<OutputBatch[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("output_batches")
    .select(OUTPUT_BATCH_SELECT)
    .eq("organization_id", orgId)
    .eq("production_order_id", productionOrderId)
    .order("created_at", { ascending: false });
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(mapOutputBatchRow);
}

/** Salidas mínimas para chips del listado de órdenes (ids de la página). */
export async function listOutputsForOrders(
  orgId: string,
  orderIds: string[]
): Promise<Record<string, { id: string; batch_code: string }[]>> {
  const byOrder: Record<string, { id: string; batch_code: string }[]> = {};
  if (orderIds.length === 0) return byOrder;
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("output_batches")
    .select("id, batch_code, production_order_id")
    .eq("organization_id", orgId)
    .in("production_order_id", orderIds);
  for (const row of data ?? []) {
    (byOrder[row.production_order_id as string] ??= []).push({
      id: row.id as string,
      batch_code: row.batch_code as string,
    });
  }
  return byOrder;
}

export type InternalConsumptionRow = {
  id: string;
  output_batch_id: string;
  output_batch_code: string;
  producer_order_id: string | null;
  producer_order_code: string;
  product_label: string | null;
  mass_kg: number;
  notes: string | null;
  produced_quantity_kg: number | null;
  output_total_consumed_kg: number;
};

/** Consumos INTERNOS de una orden (lotes producidos por otras órdenes) —
 *  Bloques D/E. Incluye lo ya consumido del lote para la advertencia de
 *  sobre-consumo (misma filosofía que listConsumption: advertir, no bloquear). */
export async function listInternalConsumption(
  orgId: string,
  productionOrderId: string
): Promise<InternalConsumptionRow[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("output_batch_consumption")
    .select(
      "id, output_batch_id, mass_kg, notes, output_batches(batch_code, produced_quantity_kg, production_order_id, production_orders(order_code), products(code, name), output_batch_consumption(mass_kg))"
    )
    .eq("organization_id", orgId)
    .eq("production_order_id", productionOrderId)
    .order("created_at");
  return (data ?? []).map((c) => {
    const ob = c.output_batches as unknown as {
      batch_code: string;
      produced_quantity_kg: number | null;
      production_order_id: string | null;
      production_orders: { order_code: string } | null;
      products: { code: string; name: string } | null;
      output_batch_consumption: { mass_kg: number }[] | null;
    } | null;
    return {
      id: c.id as string,
      output_batch_id: c.output_batch_id as string,
      output_batch_code: ob?.batch_code ?? "—",
      producer_order_id: ob?.production_order_id ?? null,
      producer_order_code: ob?.production_orders?.order_code ?? "—",
      product_label: ob?.products ? `${ob.products.code} · ${ob.products.name}` : null,
      mass_kg: Number(c.mass_kg),
      notes: (c.notes as string | null) ?? null,
      produced_quantity_kg: num(ob?.produced_quantity_kg),
      output_total_consumed_kg: (ob?.output_batch_consumption ?? []).reduce(
        (acc, r) => acc + Number(r.mass_kg),
        0
      ),
    };
  });
}

/** Opciones de lotes producidos consumibles por una orden: todos los de la
 *  empresa EXCEPTO los producidos por esa misma orden (el trigger 0104 lo
 *  bloquea igualmente en BD). */
export const SELECTOR_OPTIONS_LIMIT = 20;

export type BoundedOptions = {
  options: { value: string; label: string }[];
  total: number;
  limit: number;
};

/** PCR-02.1 (hallazgo 4) · Opciones ACOTADAS de lotes producidos consumibles
 *  por una orden: búsqueda server-side por código (ilike), excluye las
 *  salidas de la PROPIA orden (regla de dominio: sin autoconsumo), siempre
 *  filtrado por empresa y limitado a SELECTOR_OPTIONS_LIMIT resultados. */
export async function listConsumableOutputs(
  orgId: string,
  consumingOrderId: string,
  term = "",
  limit: number = SELECTOR_OPTIONS_LIMIT
): Promise<BoundedOptions> {
  const supabase = await createServerClient();
  let request = supabase
    .from("output_batches")
    .select(
      "id, batch_code, production_order_id, produced_quantity_kg, production_orders(order_code), products(code, name)",
      { count: "exact" }
    )
    .eq("organization_id", orgId)
    .neq("production_order_id", consumingOrderId);
  const cleaned = term.trim().replace(/[%_]/g, "");
  if (cleaned) request = request.ilike("batch_code", `%${cleaned}%`);
  const { data, count } = await request
    .order("created_at", { ascending: false })
    .limit(limit);
  const options = (data ?? []).map((b) => {
    const po = b.production_orders as unknown as { order_code: string } | null;
    const p = b.products as unknown as { code: string; name: string } | null;
    const qty = b.produced_quantity_kg === null ? null : Number(b.produced_quantity_kg);
    return {
      value: b.id as string,
      label: `${b.batch_code}${p ? ` · ${p.code}` : ""} (de ${po?.order_code ?? "—"}${qty !== null ? `, ${qty} kg` : ""})`,
    };
  });
  return { options, total: count ?? options.length, limit };
}

/** PCR-02.1 (hallazgo 4) · Opciones ACOTADAS de lotes de entrada para el
 *  selector de consumo externo (mismo contrato que listConsumableOutputs). */
export async function searchInputBatchOptions(
  orgId: string,
  term = "",
  limit: number = SELECTOR_OPTIONS_LIMIT
): Promise<BoundedOptions> {
  const supabase = await createServerClient();
  let request = supabase
    .from("input_batches")
    .select("id, batch_code, quantity_kg, materials(name), suppliers(name)", { count: "exact" })
    .eq("organization_id", orgId);
  const cleaned = term.trim().replace(/[%_]/g, "");
  if (cleaned) request = request.ilike("batch_code", `%${cleaned}%`);
  const { data, count } = await request
    .order("created_at", { ascending: false })
    .limit(limit);
  const options = (data ?? []).map((b) => {
    const m = b.materials as unknown as { name: string } | null;
    const sp = b.suppliers as unknown as { name: string } | null;
    return {
      value: b.id as string,
      label: `${b.batch_code} · ${m?.name ?? "—"} (${sp?.name ?? "—"})`,
    };
  });
  return { options, total: count ?? options.length, limit };
}

/** PCR-02.1 (hallazgo 4) · Opciones ACOTADAS de evidencias para vincular
 *  (sin cargar el universo completo; PCR-01.1 intacto: la vinculación sigue
 *  usando las mismas acciones y visores). */
export async function searchEvidenceOptions(
  orgId: string,
  term = "",
  limit: number = SELECTOR_OPTIONS_LIMIT
): Promise<BoundedOptions> {
  const supabase = await createServerClient();
  let request = supabase
    .from("evidences")
    .select("id, name", { count: "exact" })
    .eq("organization_id", orgId);
  const cleaned = term.trim().replace(/[%_]/g, "");
  if (cleaned) request = request.ilike("name", `%${cleaned}%`);
  const { data, count } = await request.order("name").limit(limit);
  const options = (data ?? []).map((e) => ({ value: e.id as string, label: e.name as string }));
  return { options, total: count ?? options.length, limit };
}

export type OutputForwardUse = { order_id: string; order_code: string; mass_kg: number };

/** Dónde fue consumido después cada lote producido (Bloque F: lote
 *  intermedio → orden posterior). Una consulta por página de lotes. */
export async function listForwardUsesForOutputs(
  orgId: string,
  outputIds: string[]
): Promise<Record<string, OutputForwardUse[]>> {
  const byOutput: Record<string, OutputForwardUse[]> = {};
  if (outputIds.length === 0) return byOutput;
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("output_batch_consumption")
    .select("output_batch_id, mass_kg, production_order_id, production_orders(order_code)")
    .eq("organization_id", orgId)
    .in("output_batch_id", outputIds);
  for (const row of data ?? []) {
    const po = row.production_orders as unknown as { order_code: string } | null;
    (byOutput[row.output_batch_id as string] ??= []).push({
      order_id: row.production_order_id as string,
      order_code: po?.order_code ?? "—",
      mass_kg: Number(row.mass_kg),
    });
  }
  return byOutput;
}

/** PCR-02 (Bloque I) · Conteo de órdenes abiertas hace más del umbral (72 h),
 *  para el aviso mínimo del dashboard. Una sola consulta head/count. */
export async function countStaleOpenOrders(orgId: string): Promise<number> {
  const supabase = await createServerClient();
  const cutoff = new Date(
    Date.now() - PRODUCTION_ORDER_OPEN_ALERT_HOURS * 60 * 60 * 1000
  ).toISOString();
  const { count } = await supabase
    .from("production_orders")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .in("status", [...OPEN_PRODUCTION_ORDER_STATUSES])
    .lt("created_at", cutoff);
  return count ?? 0;
}
