/**
 * PCR-02.5 · Acceso a datos del inventario OPERATIVO derivado.
 *
 * Todo sale de las vistas de la 0105 (v_input_batch_inventory,
 * v_output_batch_inventory, v_material_inventory), que agregan EN LA BASE
 * sobre los movimientos reales — nunca «miles de filas al cliente para
 * sumar en JavaScript» (regla de escalabilidad PCR-01.1) — y heredan la
 * RLS de las tablas base vía security_invoker (tenant isolation intacto).
 */
import { createServerClient } from "@/lib/supabase/server";
import {
  INVENTORY_PAGE_SIZE,
  normalizeInventoryPage,
  type InventoryPage,
} from "@/lib/domain/inventory";

export { INVENTORY_PAGE_SIZE, normalizeInventoryPage };
export type { InventoryPage };

export type MaterialInventoryRow = {
  material_id: string;
  material_name: string;
  received_kg: number;
  consumed_kg: number;
  available_kg: number;
  batches_with_balance: number;
  batches_total: number;
};

export type InputBatchInventoryRow = {
  input_batch_id: string;
  batch_code: string;
  material_id: string;
  material_name: string;
  supplier_name: string | null;
  received_date: string | null;
  received_kg: number;
  consumed_kg: number;
  available_kg: number;
};

export type OutputBatchBalance = {
  produced_kg: number;
  consumed_internally_kg: number;
  available_kg: number;
};

const num = (v: unknown): number => Number(v ?? 0);



/** Inventario AGREGADO por material (§7) con BÚSQUEDA y PAGINACIÓN
 *  server-side (PCR-02.5.1, hallazgo 2): `count: "exact"` para mostrar el
 *  total real y navegar; nunca se muestra información truncada como si
 *  fuese completa. Búsqueda por nombre de material (ilike saneado). */
export async function searchMaterialInventory(
  orgId: string,
  opts: { q?: string; page?: string } = {}
): Promise<InventoryPage<MaterialInventoryRow>> {
  const page = normalizeInventoryPage(opts.page);
  const supabase = await createServerClient();
  let request = supabase
    .from("v_material_inventory")
    .select(
      "material_id, material_name, received_kg, consumed_kg, available_kg, batches_with_balance, batches_total",
      { count: "exact" }
    )
    .eq("organization_id", orgId);
  const term = (opts.q ?? "").trim().replace(/[%_]/g, "");
  if (term) request = request.ilike("material_name", `%${term}%`);
  const from = (page - 1) * INVENTORY_PAGE_SIZE;
  const { data, count } = await request
    .order("material_name", { ascending: true })
    .range(from, from + INVENTORY_PAGE_SIZE - 1);
  const rows = (data ?? []).map((r) => ({
    material_id: r.material_id as string,
    material_name: r.material_name as string,
    received_kg: num(r.received_kg),
    consumed_kg: num(r.consumed_kg),
    available_kg: num(r.available_kg),
    batches_with_balance: num(r.batches_with_balance),
    batches_total: num(r.batches_total),
  }));
  return { rows, total: count ?? rows.length, page, pageSize: INVENTORY_PAGE_SIZE };
}

/** Resolución PUNTUAL de un material del inventario por id (PCR-02.5.1):
 *  la selección por URL debe abrir el detalle aunque el material no esté
 *  en la página actual de la tabla agregada. Una fila, acotada al tenant. */
export async function getMaterialInventoryById(
  orgId: string,
  materialId: string
): Promise<MaterialInventoryRow | null> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("v_material_inventory")
    .select(
      "material_id, material_name, received_kg, consumed_kg, available_kg, batches_with_balance, batches_total"
    )
    .eq("organization_id", orgId)
    .eq("material_id", materialId)
    .maybeSingle();
  if (!data) return null;
  return {
    material_id: data.material_id as string,
    material_name: data.material_name as string,
    received_kg: num(data.received_kg),
    consumed_kg: num(data.consumed_kg),
    available_kg: num(data.available_kg),
    batches_with_balance: num(data.batches_with_balance),
    batches_total: num(data.batches_total),
  };
}

/** Saldo POR LOTE de un material (§8) con paginación server-side
 *  (PCR-02.5.1): un material con más de 20 lotes se navega con
 *  anterior/siguiente y total exacto — el lote 101 siempre es alcanzable. */
export async function listInputBatchInventoryByMaterial(
  orgId: string,
  materialId: string,
  opts: { page?: string } = {}
): Promise<InventoryPage<InputBatchInventoryRow>> {
  const page = normalizeInventoryPage(opts.page);
  const supabase = await createServerClient();
  const from = (page - 1) * INVENTORY_PAGE_SIZE;
  const { data, count } = await supabase
    .from("v_input_batch_inventory")
    .select(
      "input_batch_id, batch_code, material_id, material_name, supplier_name, received_date, received_kg, consumed_kg, available_kg",
      { count: "exact" }
    )
    .eq("organization_id", orgId)
    .eq("material_id", materialId)
    .order("received_date", { ascending: false })
    .order("batch_code", { ascending: true })
    .range(from, from + INVENTORY_PAGE_SIZE - 1);
  const rows = (data ?? []).map((r) => ({
    input_batch_id: r.input_batch_id as string,
    batch_code: r.batch_code as string,
    material_id: r.material_id as string,
    material_name: r.material_name as string,
    supplier_name: (r.supplier_name as string | null) ?? null,
    received_date: (r.received_date as string | null) ?? null,
    received_kg: num(r.received_kg),
    consumed_kg: num(r.consumed_kg),
    available_kg: num(r.available_kg),
  }));
  return { rows, total: count ?? rows.length, page, pageSize: INVENTORY_PAGE_SIZE };
}

/** Saldo puntual de un lote de entrada (validación de capa de acción). */
export async function getInputBatchBalance(
  orgId: string,
  inputBatchId: string
): Promise<{ received_kg: number; consumed_kg: number; available_kg: number } | null> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("v_input_batch_inventory")
    .select("received_kg, consumed_kg, available_kg")
    .eq("organization_id", orgId)
    .eq("input_batch_id", inputBatchId)
    .maybeSingle();
  if (!data) return null;
  return {
    received_kg: num(data.received_kg),
    consumed_kg: num(data.consumed_kg),
    available_kg: num(data.available_kg),
  };
}

/** Saldo puntual de un lote producido (validación de capa de acción). */
export async function getOutputBatchBalance(
  orgId: string,
  outputBatchId: string
): Promise<OutputBatchBalance | null> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("v_output_batch_inventory")
    .select("produced_kg, consumed_internally_kg, available_kg")
    .eq("organization_id", orgId)
    .eq("output_batch_id", outputBatchId)
    .maybeSingle();
  if (!data) return null;
  return {
    produced_kg: num(data.produced_kg),
    consumed_internally_kg: num(data.consumed_internally_kg),
    available_kg: num(data.available_kg),
  };
}

/** Saldos internos de una página de lotes producidos (§15): una única
 *  consulta `in (…)` acotada al tamaño de página, para mostrar
 *  producido / consumido internamente / disponible en el listado. */
export async function getOutputBatchInventoryByIds(
  orgId: string,
  outputBatchIds: string[]
): Promise<Map<string, OutputBatchBalance>> {
  const map = new Map<string, OutputBatchBalance>();
  if (outputBatchIds.length === 0) return map;
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("v_output_batch_inventory")
    .select("output_batch_id, produced_kg, consumed_internally_kg, available_kg")
    .eq("organization_id", orgId)
    .in("output_batch_id", outputBatchIds);
  for (const r of data ?? []) {
    map.set(r.output_batch_id as string, {
      produced_kg: num(r.produced_kg),
      consumed_internally_kg: num(r.consumed_internally_kg),
      available_kg: num(r.available_kg),
    });
  }
  return map;
}

// ===========================================================================
// PT-02B · EL SALDO REAL DEL PRODUCTO TERMINADO
// ---------------------------------------------------------------------------
// `v_output_batch_inventory` sigue existiendo y sigue midiendo lo que siempre
// midió: producido menos reproceso interno. Lo que cambia es que deja de
// llamarse «disponible», porque nunca lo fue: el reproceso era el único
// camino de salida que el modelo conocía.
//
// `v_output_batch_stock` es la lectura nueva. Y trae `movementsCount` porque
// la diferencia entre «quedan 100 kg» y «nadie ha registrado ninguna salida»
// es toda la diferencia, y hay que poder decirla.
// ===========================================================================

export type OutputBatchStock = {
  outputBatchId: string;
  batchCode: string;
  producedKg: number;
  reprocessedKg: number;
  dispatchedKg: number;
  lostKg: number;
  internalUseKg: number;
  adjustmentKg: number;
  availableKg: number;
  movementsCount: number;
  // PT-02B.1 · El techo físico y la marca de anomalía vienen ya de la vista:
  // la pantalla los calculaba por su cuenta y eso era una segunda fórmula.
  physicalMaxKg: number;
  isInconsistent: boolean;
};

const mapStock = (r: Record<string, unknown>): OutputBatchStock => ({
  outputBatchId: r.output_batch_id as string,
  batchCode: r.batch_code as string,
  producedKg: num(r.produced_kg),
  reprocessedKg: num(r.reprocessed_kg),
  dispatchedKg: num(r.dispatched_kg),
  lostKg: num(r.lost_kg),
  internalUseKg: num(r.internal_use_kg),
  adjustmentKg: num(r.adjustment_kg),
  availableKg: num(r.available_kg),
  movementsCount: num(r.movements_count),
  physicalMaxKg: num(r.physical_max_kg),
  isInconsistent: Boolean(r.is_inconsistent),
});

const STOCK_COLUMNS =
  "output_batch_id, batch_code, produced_kg, reprocessed_kg, dispatched_kg, lost_kg, internal_use_kg, adjustment_kg, available_kg, movements_count, physical_max_kg, is_inconsistent";

/** El saldo de los lotes indicados. Acotado a la página que se está pintando. */
export async function getOutputBatchStockByIds(
  orgId: string,
  ids: string[]
): Promise<Map<string, OutputBatchStock>> {
  const mapa = new Map<string, OutputBatchStock>();
  if (ids.length === 0) return mapa;
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("v_output_batch_stock")
    .select(STOCK_COLUMNS)
    .eq("organization_id", orgId)
    .in("output_batch_id", ids);
  for (const r of data ?? []) {
    const fila = mapStock(r as Record<string, unknown>);
    mapa.set(fila.outputBatchId, fila);
  }
  return mapa;
}

/** El saldo de UN lote, para la guarda previa de la acción de servidor. */
export async function getOutputBatchStock(
  orgId: string,
  outputBatchId: string
): Promise<OutputBatchStock | null> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("v_output_batch_stock")
    .select(STOCK_COLUMNS)
    .eq("organization_id", orgId)
    .eq("output_batch_id", outputBatchId)
    .maybeSingle();
  return data ? mapStock(data as Record<string, unknown>) : null;
}


// ===========================================================================
// PT-02B.1 · INVENTARIO DE PRODUCTO TERMINADO, AGREGADO POR PRODUCTO
// ---------------------------------------------------------------------------
// Era el requisito original que seguía sin cubrirse: se sabía cuánto quedaba
// de un LOTE, no cuánto producto hay en planta. La agregación la hace la base
// (`v_product_stock`, 0148); aquí solo se pagina y se busca, en servidor, con
// los mismos parámetros propios que el inventario de materiales para no
// colisionar con la paginación de ninguna lista.
// ===========================================================================

export type ProductStockRow = {
  productId: string | null;
  productCode: string | null;
  productName: string | null;
  unitCode: string;
  batchesTotal: number;
  batchesWithBalance: number;
  batchesInconsistent: number;
  producedKg: number;
  reprocessedKg: number;
  exitsKg: number;
  adjustmentKg: number;
  availableKg: number;
};

const mapProductStock = (r: Record<string, unknown>): ProductStockRow => ({
  productId: (r.product_id as string | null) ?? null,
  productCode: (r.product_code as string | null) ?? null,
  productName: (r.product_name as string | null) ?? null,
  unitCode: (r.unit_code as string) ?? "kg",
  batchesTotal: num(r.batches_total),
  batchesWithBalance: num(r.batches_with_balance),
  batchesInconsistent: num(r.batches_inconsistent),
  producedKg: num(r.produced_kg),
  reprocessedKg: num(r.reprocessed_kg),
  exitsKg: num(r.exits_kg),
  adjustmentKg: num(r.adjustment_kg),
  availableKg: num(r.available_kg),
});

/** Una PÁGINA del inventario de producto terminado. Nunca la tabla entera. */
export async function searchProductStock(
  orgId: string,
  params: { q?: string; page?: string } = {}
): Promise<InventoryPage<ProductStockRow>> {
  const supabase = await createServerClient();
  const page = normalizeInventoryPage(params.page);
  const from = (page - 1) * INVENTORY_PAGE_SIZE;
  let request = supabase
    .from("v_product_stock")
    .select("*", { count: "exact" })
    .eq("organization_id", orgId);
  const cleaned = (params.q ?? "").trim().replace(/[%_]/g, "");
  if (cleaned) {
    request = request.or(`product_name.ilike.%${cleaned}%,product_code.ilike.%${cleaned}%`);
  }
  const { data, count } = await request
    .order("product_name", { ascending: true, nullsFirst: false })
    .range(from, from + INVENTORY_PAGE_SIZE - 1);
  return {
    rows: (data ?? []).map((r) => mapProductStock(r as Record<string, unknown>)),
    total: count ?? 0,
    page,
    pageSize: INVENTORY_PAGE_SIZE,
  };
}

/** Los lotes de UN producto, para el «Ver lotes» de la fila agregada. */
export async function listStockByProduct(
  orgId: string,
  productId: string | null,
  page = 1
): Promise<InventoryPage<OutputBatchStock>> {
  const supabase = await createServerClient();
  const from = (page - 1) * INVENTORY_PAGE_SIZE;
  let request = supabase
    .from("v_output_batch_stock")
    .select(STOCK_COLUMNS, { count: "exact" })
    .eq("organization_id", orgId);
  request = productId === null ? request.is("product_id", null) : request.eq("product_id", productId);
  const { data, count } = await request
    .order("batch_code", { ascending: true })
    .range(from, from + INVENTORY_PAGE_SIZE - 1);
  return {
    rows: (data ?? []).map((r) => mapStock(r as Record<string, unknown>)),
    total: count ?? 0,
    page,
    pageSize: INVENTORY_PAGE_SIZE,
  };
}
