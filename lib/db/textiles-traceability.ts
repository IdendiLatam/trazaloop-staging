import "server-only";

import { createServerClient } from "@/lib/supabase/server";
import { readAllStrict, readPage, sanitizeSearchTerm, type Page } from "@/lib/db/paged-read";

/**
 * Trazaloop · Sprint T6 (Textil) · Consultas de trazabilidad. Todo bajo RLS
 * con la sesión real (las vistas son security_invoker); nada usa
 * service_role.
 */

export type TextileOrderRow = {
  id: string;
  orderCode: string;
  referenceId: string;
  sku: string | null;
  productName: string | null;
  plannedQuantity: number | null;
  producedQuantity: number | null;
  unit: string;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  actualStartDate: string | null;
  actualEndDate: string | null;
  status: string;
  responsibleArea: string | null;
  notes: string | null;
  isActive: boolean;
};

function mapOrder(r: Record<string, unknown>): TextileOrderRow {
  const ref = r.textile_references as unknown as { sku: string; textile_products: { name: string } | null } | null;
  return {
    id: r.id as string,
    orderCode: r.order_code as string,
    referenceId: r.reference_id as string,
    sku: ref?.sku ?? null,
    productName: ref?.textile_products?.name ?? null,
    plannedQuantity: r.planned_quantity === null ? null : Number(r.planned_quantity),
    producedQuantity: r.produced_quantity === null ? null : Number(r.produced_quantity),
    unit: r.unit as string,
    plannedStartDate: (r.planned_start_date as string | null) ?? null,
    plannedEndDate: (r.planned_end_date as string | null) ?? null,
    actualStartDate: (r.actual_start_date as string | null) ?? null,
    actualEndDate: (r.actual_end_date as string | null) ?? null,
    status: r.status as string,
    responsibleArea: (r.responsible_area as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    isActive: Boolean(r.is_active),
  };
}

const ORDER_COLUMNS =
  "id, order_code, reference_id, planned_quantity, produced_quantity, unit, planned_start_date, planned_end_date, actual_start_date, actual_end_date, status, responsible_area, notes, is_active, textile_references(sku, textile_products(name))";

export type TraceQuery = {
  q?: string | null; page?: string | number | null; pageSize?: number | null;
  status?: string; referenceId?: string;
};

/** TODAS las órdenes. Para exportadores y selectores. */
export async function listTextileProductionOrders(
  organizationId: string,
  filters?: { status?: string; referenceId?: string }
): Promise<TextileOrderRow[]> {
  const supabase = await createServerClient();
  const rows = await readAllStrict<Record<string, unknown>>(() => {
    let req = supabase.from("textile_production_orders").select(ORDER_COLUMNS)
      .eq("organization_id", organizationId);
    if (filters?.status) req = req.eq("status", filters.status);
    if (filters?.referenceId) req = req.eq("reference_id", filters.referenceId);
    // Orden ESTABLE: `created_at` puede repetirse entre dos filas creadas en
    // el mismo instante, y con orden ambiguo dos páginas consecutivas pueden
    // repetir una fila y saltarse otra. El id desempata.
    return req.order("created_at", { ascending: false }).order("id", { ascending: false });
  }, "órdenes de producción textiles");
  return rows.map((r) => mapOrder(r));
}

/** UNA página de órdenes, con el total del conjunto filtrado. */
export async function searchTextileProductionOrders(
  organizationId: string, query: TraceQuery = {}
): Promise<Page<TextileOrderRow>> {
  const supabase = await createServerClient();
  const term = sanitizeSearchTerm(query.q ?? "");
  const page = await readPage<Record<string, unknown>>(({ from, to }) => {
    let req = supabase.from("textile_production_orders").select(ORDER_COLUMNS, { count: "exact" })
      .eq("organization_id", organizationId);
    if (query.status) req = req.eq("status", query.status);
    if (query.referenceId) req = req.eq("reference_id", query.referenceId);
    if (term) req = req.ilike("order_code", `%${term}%`);
    return req.order("created_at", { ascending: false }).order("id", { ascending: false })
      .range(from, to);
  }, query);
  return { ...page, rows: page.rows.map((r) => mapOrder(r)) };
}

export async function getTextileProductionOrder(
  organizationId: string,
  orderId: string
): Promise<TextileOrderRow | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("textile_production_orders")
    .select(ORDER_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("id", orderId)
    .maybeSingle();
  if (error || !data) return null;
  return mapOrder(data as Record<string, unknown>);
}

export type TextileInputLotRow = {
  id: string;
  lotCode: string;
  lotType: string;
  materialId: string | null;
  materialName: string | null;
  componentId: string | null;
  componentName: string | null;
  supplierId: string | null;
  supplierName: string | null;
  receivedDate: string | null;
  quantityReceived: number | null;
  unit: string | null;
  documentReference: string | null;
  status: string;
  notes: string | null;
  isActive: boolean;
  // Balance (vista v_textile_input_lot_balance)
  quantityConsumed: number;
  quantityRemaining: number | null;
  otherUnitConsumptions: number;
};

const INPUT_LOT_COLUMNS =
  "id, lot_code, lot_type, material_id, component_id, supplier_id, received_date, quantity_received, unit, document_reference, status, notes, is_active, textile_materials(name), textile_components(name), textile_suppliers(name)";

type Balance = { consumed: number; remaining: number | null; other: number };

/**
 * Saldos de los lotes indicados. PT-01 · Antes se leían los de TODA la empresa
 * para cruzarlos en memoria; con más de mil lotes la vista devolvía mil y los
 * demás aparecían con saldo cero, que no es «no consumido»: es «no se leyó».
 */
async function saldosDeLotes(
  organizationId: string, lotIds: string[]
): Promise<Map<string, Balance>> {
  const mapa = new Map<string, Balance>();
  if (lotIds.length === 0) return mapa;
  const supabase = await createServerClient();
  const rows = await readAllStrict<Record<string, unknown>>(() =>
    supabase.from("v_textile_input_lot_balance")
      .select("input_lot_id, quantity_consumed, quantity_remaining, other_unit_consumptions_count")
      .eq("organization_id", organizationId)
      .in("input_lot_id", lotIds)
      .order("input_lot_id", { ascending: true })
  , "saldos de lotes textiles");
  for (const b of rows) {
    mapa.set(b.input_lot_id as string, {
      consumed: Number(b.quantity_consumed ?? 0),
      remaining: b.quantity_remaining === null ? null : Number(b.quantity_remaining),
      other: Number(b.other_unit_consumptions_count ?? 0),
    });
  }
  return mapa;
}

const mapInputLot = (
  r: Record<string, unknown>, b: Balance | undefined
): TextileInputLotRow => ({
  id: r.id as string,
  lotCode: r.lot_code as string,
  lotType: r.lot_type as string,
  materialId: (r.material_id as string | null) ?? null,
  materialName: ((r.textile_materials as { name: string } | null) ?? null)?.name ?? null,
  componentId: (r.component_id as string | null) ?? null,
  componentName: ((r.textile_components as { name: string } | null) ?? null)?.name ?? null,
  supplierId: (r.supplier_id as string | null) ?? null,
  supplierName: ((r.textile_suppliers as { name: string } | null) ?? null)?.name ?? null,
  receivedDate: (r.received_date as string | null) ?? null,
  quantityReceived: r.quantity_received === null ? null : Number(r.quantity_received),
  unit: (r.unit as string | null) ?? null,
  documentReference: (r.document_reference as string | null) ?? null,
  status: r.status as string,
  notes: (r.notes as string | null) ?? null,
  isActive: Boolean(r.is_active),
  quantityConsumed: b?.consumed ?? 0,
  quantityRemaining: b?.remaining ?? (r.quantity_received === null ? null : Number(r.quantity_received)),
  otherUnitConsumptions: b?.other ?? 0,
});

/** TODOS los lotes de entrada. Para exportadores y selectores. */
export async function listTextileInputLots(organizationId: string): Promise<TextileInputLotRow[]> {
  const supabase = await createServerClient();
  const rows = await readAllStrict<Record<string, unknown>>(() =>
    supabase.from("textile_input_lots").select(INPUT_LOT_COLUMNS)
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false }).order("id", { ascending: false })
  , "lotes de entrada textiles");
  const saldos = await saldosDeLotes(organizationId, rows.map((r) => r.id as string));
  return rows.map((r) => mapInputLot(r, saldos.get(r.id as string)));
}

/** UNA página de lotes de entrada, con los saldos de esa página. */
export async function searchTextileInputLots(
  organizationId: string, query: TraceQuery = {}
): Promise<Page<TextileInputLotRow>> {
  const supabase = await createServerClient();
  const term = sanitizeSearchTerm(query.q ?? "");
  const page = await readPage<Record<string, unknown>>(({ from, to }) => {
    let req = supabase.from("textile_input_lots").select(INPUT_LOT_COLUMNS, { count: "exact" })
      .eq("organization_id", organizationId);
    if (term) req = req.ilike("lot_code", `%${term}%`);
    return req.order("created_at", { ascending: false }).order("id", { ascending: false })
      .range(from, to);
  }, query);
  const saldos = await saldosDeLotes(organizationId, page.rows.map((r) => r.id as string));
  return { ...page, rows: page.rows.map((r) => mapInputLot(r, saldos.get(r.id as string))) };
}

export type TextileConsumptionRow = {
  id: string;
  orderId: string;
  inputLotId: string;
  lotCode: string | null;
  lotType: string | null;
  lotUnit: string | null;
  materialName: string | null;
  componentName: string | null;
  supplierName: string | null;
  quantityConsumed: number;
  unit: string;
  consumptionRole: string;
  consumedAt: string | null;
  notes: string | null;
};

export async function listTextileOrderConsumptions(
  organizationId: string,
  orderId: string
): Promise<TextileConsumptionRow[]> {
  const supabase = await createServerClient();
  // Sublista de UNA orden: no se pagina en pantalla, pero se recorre igual.
  // Mil consumos en una sola orden es improbable y por eso mismo sería el
  // caso que nadie mira cuando el número sale mal.
  const data = await readAllStrict<Record<string, unknown>>(() =>
    supabase
      .from("textile_order_consumptions")
      .select("id, order_id, input_lot_id, quantity_consumed, unit, consumption_role, consumed_at, notes, textile_input_lots(lot_code, lot_type, unit, textile_materials(name), textile_components(name), textile_suppliers(name))")
      .eq("organization_id", organizationId)
      .eq("order_id", orderId)
      .order("created_at", { ascending: true }).order("id", { ascending: true })
  , "consumos de la orden");
  return data.map((r) => {
    const lot = r.textile_input_lots as unknown as {
      lot_code: string; lot_type: string; unit: string | null;
      textile_materials: { name: string } | null;
      textile_components: { name: string } | null;
      textile_suppliers: { name: string } | null;
    } | null;
    return {
      id: r.id as string,
      orderId: r.order_id as string,
      inputLotId: r.input_lot_id as string,
      lotCode: lot?.lot_code ?? null,
      lotType: lot?.lot_type ?? null,
      lotUnit: lot?.unit ?? null,
      materialName: lot?.textile_materials?.name ?? null,
      componentName: lot?.textile_components?.name ?? null,
      supplierName: lot?.textile_suppliers?.name ?? null,
      quantityConsumed: Number(r.quantity_consumed),
      unit: r.unit as string,
      consumptionRole: r.consumption_role as string,
      consumedAt: (r.consumed_at as string | null) ?? null,
      notes: (r.notes as string | null) ?? null,
    };
  });
}

export type TextileStepRow = {
  id: string;
  orderId: string;
  stepOrder: number | null;
  stepType: string;
  processId: string | null;
  processName: string | null;
  outsourcedProcessId: string | null;
  outsourcedProcessName: string | null;
  name: string;
  responsibleName: string | null;
  supplierId: string | null;
  supplierName: string | null;
  plannedDate: string | null;
  completedDate: string | null;
  status: string;
  notes: string | null;
};

export async function listTextileOrderProcessSteps(
  organizationId: string,
  orderId: string
): Promise<TextileStepRow[]> {
  const supabase = await createServerClient();
  const data = await readAllStrict<Record<string, unknown>>(() =>
    supabase
      .from("textile_order_process_steps")
      .select("id, order_id, step_order, step_type, process_id, outsourced_process_id, name, responsible_name, supplier_id, planned_date, completed_date, status, notes, textile_processes(name), textile_outsourced_processes(name), textile_suppliers(name)")
      .eq("organization_id", organizationId)
      .eq("order_id", orderId)
      .order("step_order", { ascending: true })
      .order("created_at", { ascending: true }).order("id", { ascending: true })
  , "pasos de proceso de la orden");
  return data.map((r) => {
    const proc = r.textile_processes as unknown as { name: string } | null;
    const out = r.textile_outsourced_processes as unknown as { name: string } | null;
    const sup = r.textile_suppliers as unknown as { name: string } | null;
    return {
      id: r.id as string,
      orderId: r.order_id as string,
      stepOrder: r.step_order === null ? null : Number(r.step_order),
      stepType: r.step_type as string,
      processId: (r.process_id as string | null) ?? null,
      processName: proc?.name ?? null,
      outsourcedProcessId: (r.outsourced_process_id as string | null) ?? null,
      outsourcedProcessName: out?.name ?? null,
      name: r.name as string,
      responsibleName: (r.responsible_name as string | null) ?? null,
      supplierId: (r.supplier_id as string | null) ?? null,
      supplierName: sup?.name ?? null,
      plannedDate: (r.planned_date as string | null) ?? null,
      completedDate: (r.completed_date as string | null) ?? null,
      status: r.status as string,
      notes: (r.notes as string | null) ?? null,
    };
  });
}

export type TextileOutputLotRow = {
  id: string;
  outputLotCode: string;
  orderId: string;
  orderCode: string | null;
  sku: string | null;
  productName: string | null;
  quantityProduced: number;
  unit: string;
  producedDate: string | null;
  status: string;
  traceabilityStatus: string;
  notes: string | null;
  isActive: boolean;
  evidenceLinksCount: number;
  updatedAt: string | null;
};

const OUTPUT_LOT_COLUMNS =
  "output_lot_id, output_lot_code, order_id, order_code, sku, product_name, quantity_produced, unit, traceability_status, status, evidence_links_count, created_at";

/**
 * La vista repite una fila por cada evidencia enlazada, así que hay que
 * deduplicar sumando conteos.
 *
 * PT-01 · Y por eso esta lista NO se pagina con `range` sobre la vista: cortar
 * a la fila veinte podría partir un lote por la mitad y dejar su conteo de
 * evidencias incompleto sin que se notara. Se recorre entera, se deduplica, y
 * la página se toma DESPUÉS. El recorrido está acotado y declara si no llegó
 * al final; eso es honesto. Paginar en SQL sobre una vista que multiplica
 * filas no lo sería.
 */
function dedupOutputLots(data: Array<Record<string, unknown>>): TextileOutputLotRow[] {
  const byId = new Map<string, TextileOutputLotRow>();
  for (const r of data) {
    const id = r.output_lot_id as string;
    const links = Number(r.evidence_links_count ?? 0);
    const existing = byId.get(id);
    if (existing) { existing.evidenceLinksCount += links; continue; }
    byId.set(id, {
      id,
      outputLotCode: r.output_lot_code as string,
      orderId: r.order_id as string,
      orderCode: (r.order_code as string | null) ?? null,
      sku: (r.sku as string | null) ?? null,
      productName: (r.product_name as string | null) ?? null,
      quantityProduced: Number(r.quantity_produced),
      unit: r.unit as string,
      producedDate: null,
      status: r.status as string,
      traceabilityStatus: r.traceability_status as string,
      notes: null,
      isActive: true,
      evidenceLinksCount: links,
      updatedAt: null,
    });
  }
  return [...byId.values()];
}

/** TODOS los lotes de salida. */
export async function listTextileOutputLots(
  organizationId: string,
  filters?: { orderId?: string }
): Promise<TextileOutputLotRow[]> {
  const supabase = await createServerClient();
  const rows = await readAllStrict<Record<string, unknown>>(() => {
    let req = supabase.from("v_textile_output_lot_traceability_summary").select(OUTPUT_LOT_COLUMNS)
      .eq("organization_id", organizationId);
    if (filters?.orderId) req = req.eq("order_id", filters.orderId);
    return req.order("created_at", { ascending: false }).order("output_lot_id", { ascending: false });
  }, "resumen de lotes de salida textiles");
  return dedupOutputLots(rows);
}

const OUTPUT_LOT_BASE_COLUMNS =
  "id, output_lot_code, order_id, quantity_produced, unit, produced_date, status, traceability_status, notes, is_active, updated_at, textile_production_orders(order_code, textile_references(sku, textile_products(name)))";

/** Cuántas evidencias tiene cada lote de la página. Una consulta, acotada. */
async function conteoEvidenciasPorLote(
  organizationId: string, lotIds: string[]
): Promise<Map<string, number>> {
  const mapa = new Map<string, number>();
  if (lotIds.length === 0) return mapa;
  const supabase = await createServerClient();
  const rows = await readAllStrict<Record<string, unknown>>(() =>
    supabase.from("textile_evidence_links").select("entity_id")
      .eq("organization_id", organizationId)
      .eq("entity_type", "output_lot")
      .in("entity_id", lotIds)
      .order("entity_id", { ascending: true })
  , "vínculos de evidencia textil");
  for (const r of rows) {
    const id = r.entity_id as string;
    mapa.set(id, (mapa.get(id) ?? 0) + 1);
  }
  return mapa;
}

/**
 * UNA página de lotes de salida.
 *
 * PT-01 · Se pagina sobre `textile_output_lots`, que tiene UNA fila por lote,
 * y no sobre `v_textile_output_lot_traceability_summary`, que repite una fila
 * por evidencia enlazada. Paginar con `range` sobre la vista habría partido un
 * lote entre dos páginas y dejado su conteo incompleto sin que se notara: la
 * página se vería bien y el número estaría mal.
 *
 * El conteo de evidencias se pide aparte, solo para los lotes de la página.
 */
export async function searchTextileOutputLots(
  organizationId: string, query: TraceQuery & { orderId?: string } = {}
): Promise<Page<TextileOutputLotRow>> {
  const supabase = await createServerClient();
  const term = sanitizeSearchTerm(query.q ?? "");
  const page = await readPage<Record<string, unknown>>(({ from, to }) => {
    let req = supabase.from("textile_output_lots").select(OUTPUT_LOT_BASE_COLUMNS, { count: "exact" })
      .eq("organization_id", organizationId);
    if (query.orderId) req = req.eq("order_id", query.orderId);
    if (term) req = req.ilike("output_lot_code", `%${term}%`);
    return req.order("created_at", { ascending: false }).order("id", { ascending: false })
      .range(from, to);
  }, query);

  const conteos = await conteoEvidenciasPorLote(organizationId, page.rows.map((r) => r.id as string));
  const rows = page.rows.map((r) => {
    const order = (r.textile_production_orders as {
      order_code: string;
      textile_references: { sku: string; textile_products: { name: string } | null } | null;
    } | null) ?? null;
    return {
      id: r.id as string,
      outputLotCode: r.output_lot_code as string,
      orderId: r.order_id as string,
      orderCode: order?.order_code ?? null,
      sku: order?.textile_references?.sku ?? null,
      productName: order?.textile_references?.textile_products?.name ?? null,
      quantityProduced: Number(r.quantity_produced),
      unit: r.unit as string,
      producedDate: (r.produced_date as string | null) ?? null,
      status: r.status as string,
      traceabilityStatus: r.traceability_status as string,
      notes: (r.notes as string | null) ?? null,
      isActive: Boolean(r.is_active),
      evidenceLinksCount: conteos.get(r.id as string) ?? 0,
      updatedAt: (r.updated_at as string | null) ?? null,
    };
  });
  return { ...page, rows };
}

export async function getTextileOutputLot(
  organizationId: string,
  outputLotId: string
): Promise<TextileOutputLotRow | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("textile_output_lots")
    .select("id, output_lot_code, order_id, quantity_produced, unit, produced_date, status, traceability_status, notes, is_active, updated_at, textile_production_orders(order_code, textile_references(sku, textile_products(name)))")
    .eq("organization_id", organizationId)
    .eq("id", outputLotId)
    .maybeSingle();
  if (error || !data) return null;
  const order = data.textile_production_orders as unknown as {
    order_code: string;
    textile_references: { sku: string; textile_products: { name: string } | null } | null;
  } | null;
  return {
    id: data.id as string,
    outputLotCode: data.output_lot_code as string,
    orderId: data.order_id as string,
    orderCode: order?.order_code ?? null,
    sku: order?.textile_references?.sku ?? null,
    productName: order?.textile_references?.textile_products?.name ?? null,
    quantityProduced: Number(data.quantity_produced),
    unit: data.unit as string,
    producedDate: (data.produced_date as string | null) ?? null,
    status: data.status as string,
    traceabilityStatus: data.traceability_status as string,
    notes: (data.notes as string | null) ?? null,
    isActive: Boolean(data.is_active),
    evidenceLinksCount: 0,
    updatedAt: (data.updated_at as string | null) ?? null,
  };
}

/** Verificadores de pertenencia (la FK compuesta y RLS re-verifican). */
export async function textileOrderBelongsToOrg(organizationId: string, orderId: string): Promise<boolean> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("textile_production_orders")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("id", orderId)
    .maybeSingle();
  return Boolean(data);
}

export async function textileInputLotBelongsToOrg(organizationId: string, lotId: string): Promise<boolean> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("textile_input_lots")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("id", lotId)
    .maybeSingle();
  return Boolean(data);
}

export async function textileOutputLotBelongsToOrg(organizationId: string, lotId: string): Promise<boolean> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("textile_output_lots")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("id", lotId)
    .maybeSingle();
  return Boolean(data);
}

// ---------------------------------------------------------------------------
// Evaluación de trazabilidad de una orden (usada por el recálculo persistido
// y por las páginas para el estado en vivo).
// ---------------------------------------------------------------------------

import {
  computeTraceabilityStatus,
  type TraceabilityEvaluation,
} from "@/lib/domain/textiles-traceability";
import { computeReferenceEvidenceGaps } from "@/lib/domain/textiles-evidences";
import { listEntityTextileEvidences, type EntityEvidenceRow } from "@/lib/db/textiles-evidences";
import { listReferenceFiberComposition } from "@/lib/db/textiles-products";

export type OrderTraceability = {
  evaluation: TraceabilityEvaluation;
  consumptions: TextileConsumptionRow[];
  steps: TextileStepRow[];
  outputLots: TextileOutputLotRow[];
  evidenceRows: EntityEvidenceRow[];
};

export async function getOrderTraceabilityEvaluation(
  organizationId: string,
  orderId: string
): Promise<OrderTraceability | null> {
  const order = await getTextileProductionOrder(organizationId, orderId);
  if (!order) return null;

  const supabase = await createServerClient();
  const [consumptions, steps, outputLots, fiberRows, { data: balances }] = await Promise.all([
    listTextileOrderConsumptions(organizationId, orderId),
    listTextileOrderProcessSteps(organizationId, orderId),
    listTextileOutputLots(organizationId, { orderId }),
    listReferenceFiberComposition(organizationId, order.referenceId),
    supabase
      .from("v_textile_input_lot_balance")
      .select("input_lot_id, quantity_remaining")
      .eq("organization_id", organizationId),
  ]);

  // Evidencias que tocan la cadena: orden, consumos, pasos, lotes de
  // entrada consumidos, lotes finales, la referencia y sus fibras.
  const targets = [
    { entityType: "production_order", entityId: orderId },
    { entityType: "reference", entityId: order.referenceId },
    ...consumptions.map((c) => ({ entityType: "order_consumption", entityId: c.id })),
    ...consumptions.map((c) => ({ entityType: "input_lot", entityId: c.inputLotId })),
    ...steps.map((s) => ({ entityType: "order_process_step", entityId: s.id })),
    ...outputLots.map((l) => ({ entityType: "output_lot", entityId: l.id })),
    ...fiberRows.map((f) => ({ entityType: "fiber_composition", entityId: f.id })),
  ];
  const evidenceRows = await listEntityTextileEvidences(organizationId, targets);

  const remainingByLot = new Map<string, number | null>();
  for (const b of balances ?? []) {
    remainingByLot.set(
      b.input_lot_id as string,
      b.quantity_remaining === null ? null : Number(b.quantity_remaining)
    );
  }

  const consumedLotIds = [...new Set(consumptions.map((c) => c.inputLotId))];
  const lotCodeById = new Map(consumptions.map((c) => [c.inputLotId, c.lotCode ?? c.inputLotId]));
  const overconsumedLotCodes = consumedLotIds
    .filter((id) => {
      const remaining = remainingByLot.get(id);
      return remaining !== null && remaining !== undefined && remaining < 0;
    })
    .map((id) => lotCodeById.get(id) ?? id);
  const lotsWithoutSupplier = [
    ...new Set(consumptions.filter((c) => !c.supplierName).map((c) => c.lotCode ?? c.inputLotId)),
  ];
  const unitMismatchedConsumptions = consumptions.filter(
    (c) => c.lotUnit !== null && c.unit.trim().toLowerCase() !== c.lotUnit.trim().toLowerCase()
  ).length;

  // T6.1: SOLO los vínculos a la referencia y a sus fibras cuentan para las
  // brechas de referencia — espejo exacto de la función SQL de 0079 (un
  // composition_support colgado de la orden no "cubre" la composición).
  const referenceGaps = computeReferenceEvidenceGaps({
    fibers: fiberRows.map((f) => ({
      id: f.id,
      fiberName: f.fiberName,
      isRecycledDeclared: f.isRecycledDeclared,
      isOrganicDeclared: f.isOrganicDeclared,
    })),
    links: evidenceRows
      .filter((e) => e.entityType === "reference" || e.entityType === "fiber_composition")
      .map((e) => ({
        entityType: e.entityType,
        entityId: e.entityId,
        linkType: e.linkType,
      })),
  });

  const supportedStepIds = new Set(
    evidenceRows.filter((e) => e.entityType === "order_process_step").map((e) => e.entityId)
  );
  const outsourcedStepsWithoutSupport = steps
    .filter((s) => s.stepType === "outsourced" && !supportedStepIds.has(s.id))
    .map((s) => s.name);

  const evaluation = computeTraceabilityStatus({
    hasOrder: true,
    hasReference: Boolean(order.referenceId),
    consumptionCount: consumptions.length,
    processStepCount: steps.length,
    hasOutputLot: outputLots.length > 0,
    overconsumedLotCodes,
    lotsWithoutSupplier,
    unitMismatchedConsumptions,
    referenceEvidenceGapCount: referenceGaps.length,
    outsourcedStepsWithoutSupport,
  });

  return { evaluation, consumptions, steps, outputLots, evidenceRows };
}

// ===========================================================================
// PT-02A · SALDO TRAZADO DE MATERIA PRIMA
// ---------------------------------------------------------------------------
// Espejo de `lib/db/inventory.ts` (PCR), con la diferencia que impone el
// modelo textil: la unidad forma parte de la identidad de la fila. Un mismo
// material puede haber llegado en metros y en kilos, y esas dos filas no se
// suman ni se pueden sumar.
// ===========================================================================

export type TextileInventoryRow = {
  itemId: string;
  itemType: "material" | "component";
  itemName: string;
  unitCode: string | null;
  /** El texto original, solo cuando no se pudo normalizar. */
  unitRaw: string | null;
  received: number;
  consumed: number;
  available: number;
  lotsWithBalance: number;
  lotsTotal: number;
  /** Consumos que no se pudieron restar por no ser comparables. */
  unmatchedConsumptions: number;
  /** Lotes con saldo negativo. Se muestran; jamás se recortan a cero. */
  lotsNegative: number;
};

const mapInventory = (r: Record<string, unknown>): TextileInventoryRow => ({
  itemId: r.item_id as string,
  itemType: r.item_type as "material" | "component",
  itemName: (r.item_name as string | null) ?? "—",
  unitCode: (r.unit_code as string | null) ?? null,
  unitRaw: (r.unit_raw as string | null) ?? null,
  received: Number(r.received ?? 0),
  consumed: Number(r.consumed ?? 0),
  available: Number(r.available ?? 0),
  lotsWithBalance: Number(r.lots_with_balance ?? 0),
  lotsTotal: Number(r.lots_total ?? 0),
  unmatchedConsumptions: Number(r.unmatched_consumptions ?? 0),
  lotsNegative: Number(r.lots_negative ?? 0),
});

/** UNA página del saldo por (material, unidad), con búsqueda en servidor. */
export async function searchTextileMaterialInventory(
  organizationId: string, query: TraceQuery = {}
): Promise<Page<TextileInventoryRow>> {
  const supabase = await createServerClient();
  const term = sanitizeSearchTerm(query.q ?? "");
  const page = await readPage<Record<string, unknown>>(({ from, to }) => {
    let req = supabase.from("v_textile_material_inventory")
      .select("item_id, item_type, item_name, unit_code, unit_raw, received, consumed, available, lots_with_balance, lots_total, unmatched_consumptions, lots_negative",
        { count: "exact" })
      .eq("organization_id", organizationId);
    if (term) req = req.ilike("item_name", `%${term}%`);
    return req.order("item_name", { ascending: true })
      .order("unit_code", { ascending: true, nullsFirst: false })
      .range(from, to);
  }, query);
  return { ...page, rows: page.rows.map(mapInventory) };
}

/** El detalle por lote de un material EN UNA UNIDAD concreta. */
export async function listTextileLotBalances(
  organizationId: string, itemId: string, unitCode: string | null
): Promise<Array<{ lotCode: string; received: number | null; consumed: number; remaining: number | null; unit: string | null }>> {
  const supabase = await createServerClient();
  const rows = await readAllStrict<Record<string, unknown>>(() => {
    let req = supabase.from("v_textile_input_lot_balance")
      .select("input_lot_id, lot_code, quantity_received, quantity_consumed, quantity_remaining, unit, unit_code")
      .eq("organization_id", organizationId);
    // El filtro por unidad es parte de la identidad de la fila del inventario:
    // sin él, el detalle mezclaría metros con kilos bajo un mismo total.
    req = unitCode === null ? req.is("unit_code", null) : req.eq("unit_code", unitCode);
    return req.order("lot_code", { ascending: true }).order("input_lot_id", { ascending: true });
  }, "saldos por lote");
  const ids = rows.map((r) => r.input_lot_id as string);
  if (ids.length === 0) return [];
  const lotes = await readAllStrict<Record<string, unknown>>(() =>
    supabase.from("textile_input_lots").select("id, material_id, component_id")
      .eq("organization_id", organizationId).in("id", ids).order("id")
  , "lotes de entrada textiles");
  const delItem = new Set(
    lotes.filter((l) => (l.material_id ?? l.component_id) === itemId).map((l) => l.id as string)
  );
  return rows
    .filter((r) => delItem.has(r.input_lot_id as string))
    .map((r) => ({
      lotCode: r.lot_code as string,
      received: r.quantity_received === null ? null : Number(r.quantity_received),
      consumed: Number(r.quantity_consumed ?? 0),
      remaining: r.quantity_remaining === null ? null : Number(r.quantity_remaining),
      unit: (r.unit as string | null) ?? null,
    }));
}
