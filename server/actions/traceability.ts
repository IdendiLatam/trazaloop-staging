"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { checkCprResourceLimit, checkCprCanMutate } from "@/server/actions/module-plans";
import {
  listInputBatches,
  listProductionOrders,
  listOutputBatches,
  getBackward,
  getForward,
  getCompleteness,
  getTraceabilityMetrics,
} from "@/lib/db/traceability";
import { validateImportAction, commitImportAction } from "@/server/actions/import";

export type TraceActionState = { error: string | null };

const DUPLICATE = "Ya existe un registro con ese código en tu empresa.";
const GENERIC = "No fue posible guardar. Verifica los datos e intenta de nuevo.";

function dbError(error: { code?: string; message?: string } | null, fallback = GENERIC) {
  if (!error) return fallback;
  if (error.code === "23505") return DUPLICATE;
  if (error.code === "23503")
    return "La referencia seleccionada no pertenece a tu empresa o no existe.";
  if (error.message?.includes("organization_id de una fila no puede modificarse"))
    return "El registro no puede moverse de empresa.";
  return fallback;
}

/** Verifica que una fila referenciada exista EN LA EMPRESA ACTIVA (defensa previa a la FK compuesta). */
async function assertSameOrg(
  table: string,
  id: string | null,
  orgId: string
): Promise<boolean> {
  if (!id) return true;
  const supabase = await createServerClient();
  const { data } = await supabase
    .from(table)
    .select("id")
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();
  return Boolean(data);
}

// ===========================================================================
// Lotes de entrada
// ===========================================================================
export async function listInputBatchesAction(filters?: {
  supplierId?: string;
  materialId?: string;
}) {
  const org = await requireActiveOrg();
  return listInputBatches(org.organizationId, filters);
}

function readInputBatchForm(formData: FormData) {
  return {
    batch_code: String(formData.get("batch_code") ?? "").trim(),
    supplier_id: String(formData.get("supplier_id") ?? "") || null,
    material_id: String(formData.get("material_id") ?? "") || null,
    site_id: String(formData.get("site_id") ?? "") || null,
    residue_type: String(formData.get("residue_type") ?? "") || null,
    provenance: String(formData.get("provenance") ?? "").trim() || null,
    received_date: String(formData.get("received_date") ?? "") || null,
    quantity_kg: String(formData.get("quantity_kg") ?? "").trim(),
    storage_location: String(formData.get("storage_location") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
  };
}

function validateInputBatch(v: ReturnType<typeof readInputBatchForm>) {
  if (!v.batch_code) return "El código del lote es obligatorio.";
  if (!v.supplier_id) return "El proveedor es obligatorio.";
  if (!v.material_id) return "El material es obligatorio.";
  if (!v.received_date) return "La fecha de recepción es obligatoria.";
  if (v.quantity_kg !== "") {
    const n = Number(v.quantity_kg);
    if (Number.isNaN(n) || n <= 0) return "La cantidad debe ser un número mayor que 0.";
  }
  return null;
}

export async function createInputBatchAction(
  _prev: TraceActionState,
  formData: FormData
): Promise<TraceActionState> {
  const org = await requireActiveOrg();
  const v = readInputBatchForm(formData);
  const invalid = validateInputBatch(v);
  if (invalid) return { error: invalid };

  // Sprint 10A (corrección final): empresa suspended/cancelled queda en
  // modo solo lectura.
  const mutateCheck = await checkCprCanMutate();
  if (!mutateCheck.allowed) return { error: mutateCheck.error };

  // Sprint 10A (Parte 8): límite de plan — Demo permite 1 lote de entrada.
  const limitCheck = await checkCprResourceLimit("input_batches");
  if (!limitCheck.allowed) return { error: limitCheck.error };

  if (
    !(await assertSameOrg("suppliers", v.supplier_id, org.organizationId)) ||
    !(await assertSameOrg("materials", v.material_id, org.organizationId)) ||
    !(await assertSameOrg("sites", v.site_id, org.organizationId))
  ) {
    return { error: "Proveedor, material o sede no pertenecen a tu empresa." };
  }

  const supabase = await createServerClient();
  const { error } = await supabase.from("input_batches").insert({
    organization_id: org.organizationId,
    batch_code: v.batch_code,
    supplier_id: v.supplier_id,
    material_id: v.material_id,
    site_id: v.site_id,
    residue_type: v.residue_type,
    provenance: v.provenance,
    received_date: v.received_date,
    quantity_kg: v.quantity_kg === "" ? null : Number(v.quantity_kg),
    storage_location: v.storage_location,
    notes: v.notes,
  });

  if (error) return { error: dbError(error) };
  revalidatePath("/traceability/input-batches");
  return { error: null };
}

export async function updateInputBatchAction(
  _prev: TraceActionState,
  formData: FormData
): Promise<TraceActionState> {
  const org = await requireActiveOrg();
  const id = String(formData.get("id") ?? "");
  const v = readInputBatchForm(formData);
  const invalid = validateInputBatch(v);
  if (!id) return { error: "Falta el identificador del lote." };
  if (invalid) return { error: invalid };

  const mutateCheck = await checkCprCanMutate();
  if (!mutateCheck.allowed) return { error: mutateCheck.error };

  if (
    !(await assertSameOrg("suppliers", v.supplier_id, org.organizationId)) ||
    !(await assertSameOrg("materials", v.material_id, org.organizationId)) ||
    !(await assertSameOrg("sites", v.site_id, org.organizationId))
  ) {
    return { error: "Proveedor, material o sede no pertenecen a tu empresa." };
  }

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("input_batches")
    .update({
      batch_code: v.batch_code,
      supplier_id: v.supplier_id,
      material_id: v.material_id,
      site_id: v.site_id,
      residue_type: v.residue_type,
      provenance: v.provenance,
      received_date: v.received_date,
      quantity_kg: v.quantity_kg === "" ? null : Number(v.quantity_kg),
      storage_location: v.storage_location,
      notes: v.notes,
    })
    .eq("id", id)
    .eq("organization_id", org.organizationId);

  if (error) return { error: dbError(error) };
  revalidatePath("/traceability/input-batches");
  return { error: null };
}

export async function deleteInputBatchAction(
  _prev: TraceActionState,
  formData: FormData
): Promise<TraceActionState> {
  const org = await requireActiveOrg();
  const mutateCheck = await checkCprCanMutate();
  if (!mutateCheck.allowed) return { error: mutateCheck.error };
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("input_batches")
    .delete()
    .eq("id", String(formData.get("id") ?? ""))
    .eq("organization_id", org.organizationId)
    .select("id");

  if (error) {
    return {
      error:
        error.code === "23503"
          ? "El lote no puede eliminarse: ya fue consumido en alguna orden."
          : dbError(error, "No fue posible eliminar el lote."),
    };
  }
  if ((data ?? []).length === 0) {
    return { error: "No se eliminó: el lote no existe o tu rol no permite eliminarlo." };
  }
  revalidatePath("/traceability/input-batches");
  return { error: null };
}

/** Importación CSV de lotes de entrada (delegada al motor genérico). */
export async function validateInputBatchCsvAction(filename: string, csvText: string) {
  return validateImportAction("input_batches", filename, csvText);
}
export async function commitInputBatchCsvAction(
  filename: string,
  rows: Record<string, string>[]
) {
  return commitImportAction("input_batches", filename, rows);
}

// ===========================================================================
// Órdenes / corridas de producción
// ===========================================================================
export async function listProductionOrdersAction() {
  const org = await requireActiveOrg();
  return listProductionOrders(org.organizationId);
}

function readOrderForm(formData: FormData) {
  return {
    order_code: String(formData.get("order_code") ?? "").trim(),
    order_date: String(formData.get("order_date") ?? "") || null,
    status: String(formData.get("status") ?? "draft"),
    site_id: String(formData.get("site_id") ?? "") || null,
    pretreatment: String(formData.get("pretreatment") ?? "").trim() || null,
    process_variables: String(formData.get("process_variables") ?? "").trim(),
    notes: String(formData.get("notes") ?? "").trim() || null,
  };
}

const ORDER_STATUSES = ["draft", "in_progress", "closed", "cancelled"];

function parseProcessVariables(raw: string): { value: unknown; error: string | null } {
  if (!raw) return { value: null, error: null };
  try {
    return { value: JSON.parse(raw), error: null };
  } catch {
    return {
      value: null,
      error: 'Las variables de proceso deben ser JSON válido (por ejemplo: {"temperatura_c": 210}).',
    };
  }
}

export async function createProductionOrderAction(
  _prev: TraceActionState,
  formData: FormData
): Promise<TraceActionState> {
  const org = await requireActiveOrg();
  const v = readOrderForm(formData);
  if (!v.order_code) return { error: "El código de la orden es obligatorio." };
  if (!v.order_date) return { error: "La fecha de la orden es obligatoria." };
  if (!ORDER_STATUSES.includes(v.status)) return { error: "Estado no válido." };

  const mutateCheck = await checkCprCanMutate();
  if (!mutateCheck.allowed) return { error: mutateCheck.error };

  // Sprint 10A (Parte 8): límite de plan — Demo permite 1 orden/corrida.
  const limitCheck = await checkCprResourceLimit("production_orders");
  if (!limitCheck.allowed) return { error: limitCheck.error };

  const pv = parseProcessVariables(v.process_variables);
  if (pv.error) return { error: pv.error };
  if (!(await assertSameOrg("sites", v.site_id, org.organizationId))) {
    return { error: "La sede no pertenece a tu empresa." };
  }

  const supabase = await createServerClient();
  const { error } = await supabase.from("production_orders").insert({
    organization_id: org.organizationId,
    order_code: v.order_code,
    order_date: v.order_date,
    status: v.status,
    site_id: v.site_id,
    pretreatment: v.pretreatment,
    process_variables: pv.value,
    notes: v.notes,
  });

  if (error) return { error: dbError(error) };
  revalidatePath("/traceability/production-orders");
  return { error: null };
}

export async function updateProductionOrderAction(
  _prev: TraceActionState,
  formData: FormData
): Promise<TraceActionState> {
  const org = await requireActiveOrg();
  const id = String(formData.get("id") ?? "");
  const v = readOrderForm(formData);
  if (!id) return { error: "Falta el identificador de la orden." };
  if (!v.order_code) return { error: "El código de la orden es obligatorio." };
  if (!v.order_date) return { error: "La fecha de la orden es obligatoria." };
  if (!ORDER_STATUSES.includes(v.status)) return { error: "Estado no válido." };
  const mutateCheck = await checkCprCanMutate();
  if (!mutateCheck.allowed) return { error: mutateCheck.error };
  const pv = parseProcessVariables(v.process_variables);
  if (pv.error) return { error: pv.error };
  if (!(await assertSameOrg("sites", v.site_id, org.organizationId))) {
    return { error: "La sede no pertenece a tu empresa." };
  }

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("production_orders")
    .update({
      order_code: v.order_code,
      order_date: v.order_date,
      status: v.status,
      site_id: v.site_id,
      pretreatment: v.pretreatment,
      process_variables: pv.value,
      notes: v.notes,
    })
    .eq("id", id)
    .eq("organization_id", org.organizationId);

  if (error) return { error: dbError(error) };
  revalidatePath("/traceability/production-orders");
  return { error: null };
}

export async function deleteProductionOrderAction(
  _prev: TraceActionState,
  formData: FormData
): Promise<TraceActionState> {
  const org = await requireActiveOrg();
  const mutateCheck = await checkCprCanMutate();
  if (!mutateCheck.allowed) return { error: mutateCheck.error };
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("production_orders")
    .delete()
    .eq("id", String(formData.get("id") ?? ""))
    .eq("organization_id", org.organizationId)
    .select("id");

  if (error) {
    return {
      error:
        error.code === "23503"
          ? "La orden no puede eliminarse: tiene lotes producidos / lotes finales asociados."
          : dbError(error, "No fue posible eliminar la orden."),
    };
  }
  if ((data ?? []).length === 0) {
    return { error: "No se eliminó: la orden no existe o tu rol no permite eliminarla." };
  }
  revalidatePath("/traceability/production-orders");
  return { error: null };
}

// ---------------------------------------------------------------------------
// Consumos por orden
// ---------------------------------------------------------------------------
export async function addBatchConsumptionAction(
  _prev: TraceActionState,
  formData: FormData
): Promise<TraceActionState> {
  const org = await requireActiveOrg();
  const productionOrderId = String(formData.get("production_order_id") ?? "");
  const inputBatchId = String(formData.get("input_batch_id") ?? "");
  const mass = Number(String(formData.get("mass_kg") ?? ""));
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!productionOrderId || !inputBatchId) {
    return { error: "Selecciona la orden y el lote de entrada." };
  }
  if (Number.isNaN(mass) || mass <= 0) {
    return { error: "La masa consumida debe ser mayor que 0." };
  }
  const mutateCheck = await checkCprCanMutate();
  if (!mutateCheck.allowed) return { error: mutateCheck.error };
  if (
    !(await assertSameOrg("production_orders", productionOrderId, org.organizationId)) ||
    !(await assertSameOrg("input_batches", inputBatchId, org.organizationId))
  ) {
    return { error: "La orden o el lote no pertenecen a tu empresa." };
  }

  const supabase = await createServerClient();
  const { error } = await supabase.from("batch_consumption").insert({
    organization_id: org.organizationId,
    production_order_id: productionOrderId,
    input_batch_id: inputBatchId,
    mass_kg: mass,
    notes,
  });

  if (error) {
    return {
      error:
        error.code === "23505"
          ? "Ese lote ya está registrado en esta orden. Edita el consumo existente."
          : dbError(error),
    };
  }
  revalidatePath("/traceability/production-orders");
  return { error: null };
}

export async function updateBatchConsumptionAction(
  _prev: TraceActionState,
  formData: FormData
): Promise<TraceActionState> {
  const org = await requireActiveOrg();
  const id = String(formData.get("id") ?? "");
  const mass = Number(String(formData.get("mass_kg") ?? ""));
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!id) return { error: "Falta el identificador del consumo." };
  if (Number.isNaN(mass) || mass <= 0) {
    return { error: "La masa consumida debe ser mayor que 0." };
  }
  const mutateCheck = await checkCprCanMutate();
  if (!mutateCheck.allowed) return { error: mutateCheck.error };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("batch_consumption")
    .update({ mass_kg: mass, notes })
    .eq("id", id)
    .eq("organization_id", org.organizationId);

  if (error) return { error: dbError(error) };
  revalidatePath("/traceability/production-orders");
  return { error: null };
}

export async function deleteBatchConsumptionAction(
  _prev: TraceActionState,
  formData: FormData
): Promise<TraceActionState> {
  const org = await requireActiveOrg();
  const mutateCheck = await checkCprCanMutate();
  if (!mutateCheck.allowed) return { error: mutateCheck.error };
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("batch_consumption")
    .delete()
    .eq("id", String(formData.get("id") ?? ""))
    .eq("organization_id", org.organizationId)
    .select("id");

  if (error) return { error: dbError(error, "No fue posible eliminar el consumo.") };
  if ((data ?? []).length === 0) {
    return { error: "No se eliminó: solo administrador o calidad pueden eliminar consumos." };
  }
  revalidatePath("/traceability/production-orders");
  return { error: null };
}

// ===========================================================================
// Lotes producidos / lotes finales
// ===========================================================================
export async function listOutputBatchesAction() {
  const org = await requireActiveOrg();
  return listOutputBatches(org.organizationId);
}

function readOutputBatchForm(formData: FormData) {
  return {
    batch_code: String(formData.get("batch_code") ?? "").trim(),
    production_order_id: String(formData.get("production_order_id") ?? "") || null,
    product_id: String(formData.get("product_id") ?? "") || null,
    produced_date: String(formData.get("produced_date") ?? "") || null,
    produced_quantity_kg: String(formData.get("produced_quantity_kg") ?? "").trim(),
    characteristics: String(formData.get("characteristics") ?? "").trim() || null,
    intended_application: String(formData.get("intended_application") ?? "").trim() || null,
    storage_location: String(formData.get("storage_location") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
  };
}

export async function createOutputBatchAction(
  _prev: TraceActionState,
  formData: FormData
): Promise<TraceActionState> {
  const org = await requireActiveOrg();
  const v = readOutputBatchForm(formData);
  if (!v.batch_code) return { error: "El código del lote producido / lote final es obligatorio." };
  if (!v.production_order_id) return { error: "La orden / corrida de producción es obligatoria." };

  const mutateCheck = await checkCprCanMutate();
  if (!mutateCheck.allowed) return { error: mutateCheck.error };

  // Sprint 10A (Parte 8): límite de plan — Demo permite 1 lote producido.
  const limitCheck = await checkCprResourceLimit("output_batches");
  if (!limitCheck.allowed) return { error: limitCheck.error };

  if (v.produced_quantity_kg !== "") {
    const n = Number(v.produced_quantity_kg);
    if (Number.isNaN(n) || n <= 0) return { error: "La cantidad producida debe ser mayor que 0." };
  }
  if (
    !(await assertSameOrg("production_orders", v.production_order_id, org.organizationId)) ||
    !(await assertSameOrg("products", v.product_id, org.organizationId))
  ) {
    return { error: "La orden o el producto no pertenecen a tu empresa." };
  }

  const supabase = await createServerClient();
  const { error } = await supabase.from("output_batches").insert({
    organization_id: org.organizationId,
    batch_code: v.batch_code,
    production_order_id: v.production_order_id,
    product_id: v.product_id,
    produced_date: v.produced_date,
    produced_quantity_kg: v.produced_quantity_kg === "" ? null : Number(v.produced_quantity_kg),
    characteristics: v.characteristics,
    intended_application: v.intended_application,
    storage_location: v.storage_location,
    notes: v.notes,
  });

  if (error) return { error: dbError(error) };
  revalidatePath("/traceability/output-batches");
  return { error: null };
}

export async function updateOutputBatchAction(
  _prev: TraceActionState,
  formData: FormData
): Promise<TraceActionState> {
  const org = await requireActiveOrg();
  const id = String(formData.get("id") ?? "");
  const v = readOutputBatchForm(formData);
  if (!id) return { error: "Falta el identificador del lote producido / lote final." };
  if (!v.batch_code) return { error: "El código del lote producido / lote final es obligatorio." };
  if (!v.production_order_id) return { error: "La orden / corrida de producción es obligatoria." };
  const mutateCheck = await checkCprCanMutate();
  if (!mutateCheck.allowed) return { error: mutateCheck.error };
  if (v.produced_quantity_kg !== "") {
    const n = Number(v.produced_quantity_kg);
    if (Number.isNaN(n) || n <= 0) return { error: "La cantidad producida debe ser mayor que 0." };
  }
  if (
    !(await assertSameOrg("production_orders", v.production_order_id, org.organizationId)) ||
    !(await assertSameOrg("products", v.product_id, org.organizationId))
  ) {
    return { error: "La orden o el producto no pertenecen a tu empresa." };
  }

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("output_batches")
    .update({
      batch_code: v.batch_code,
      production_order_id: v.production_order_id,
      product_id: v.product_id,
      produced_date: v.produced_date,
      produced_quantity_kg: v.produced_quantity_kg === "" ? null : Number(v.produced_quantity_kg),
      characteristics: v.characteristics,
      intended_application: v.intended_application,
      storage_location: v.storage_location,
      notes: v.notes,
    })
    .eq("id", id)
    .eq("organization_id", org.organizationId);

  if (error) return { error: dbError(error) };
  revalidatePath("/traceability/output-batches");
  return { error: null };
}

export async function deleteOutputBatchAction(
  _prev: TraceActionState,
  formData: FormData
): Promise<TraceActionState> {
  const org = await requireActiveOrg();
  const mutateCheck = await checkCprCanMutate();
  if (!mutateCheck.allowed) return { error: mutateCheck.error };
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("output_batches")
    .delete()
    .eq("id", String(formData.get("id") ?? ""))
    .eq("organization_id", org.organizationId)
    .select("id");

  if (error) return { error: dbError(error, "No fue posible eliminar el lote producido / lote final.") };
  if ((data ?? []).length === 0) {
    return { error: "No se eliminó: el lote no existe o tu rol no permite eliminarlo." };
  }
  revalidatePath("/traceability/output-batches");
  return { error: null };
}

// ---------------------------------------------------------------------------
// Composición por lote producido / lote final
// ---------------------------------------------------------------------------
export async function addBatchCompositionAction(
  _prev: TraceActionState,
  formData: FormData
): Promise<TraceActionState> {
  const org = await requireActiveOrg();
  const outputBatchId = String(formData.get("output_batch_id") ?? "");
  const materialId = String(formData.get("material_id") ?? "");
  const mass = Number(String(formData.get("mass_kg") ?? ""));
  const isSameProcess = formData.get("is_same_process") === "on";
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!outputBatchId || !materialId) {
    return { error: "Selecciona el lote producido / lote final y el material." };
  }
  if (Number.isNaN(mass) || mass <= 0) {
    return { error: "La masa debe ser mayor que 0." };
  }
  const mutateCheck = await checkCprCanMutate();
  if (!mutateCheck.allowed) return { error: mutateCheck.error };
  if (
    !(await assertSameOrg("output_batches", outputBatchId, org.organizationId)) ||
    !(await assertSameOrg("materials", materialId, org.organizationId))
  ) {
    return { error: "El lote o el material no pertenecen a tu empresa." };
  }

  const supabase = await createServerClient();
  const { error } = await supabase.from("batch_composition").insert({
    organization_id: org.organizationId,
    output_batch_id: outputBatchId,
    material_id: materialId,
    mass_kg: mass,
    is_same_process: isSameProcess,
    notes,
  });

  if (error) {
    return {
      error:
        error.code === "23505"
          ? "Ese material ya está en la composición de este lote. Edita la fila existente."
          : dbError(error),
    };
  }
  revalidatePath("/traceability/output-batches");
  return { error: null };
}

export async function updateBatchCompositionAction(
  _prev: TraceActionState,
  formData: FormData
): Promise<TraceActionState> {
  const org = await requireActiveOrg();
  const id = String(formData.get("id") ?? "");
  const mass = Number(String(formData.get("mass_kg") ?? ""));
  const isSameProcess = formData.get("is_same_process") === "on";
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!id) return { error: "Falta el identificador de la fila de composición." };
  if (Number.isNaN(mass) || mass <= 0) return { error: "La masa debe ser mayor que 0." };
  const mutateCheck = await checkCprCanMutate();
  if (!mutateCheck.allowed) return { error: mutateCheck.error };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("batch_composition")
    .update({ mass_kg: mass, is_same_process: isSameProcess, notes })
    .eq("id", id)
    .eq("organization_id", org.organizationId);

  if (error) return { error: dbError(error) };
  revalidatePath("/traceability/output-batches");
  return { error: null };
}

export async function deleteBatchCompositionAction(
  _prev: TraceActionState,
  formData: FormData
): Promise<TraceActionState> {
  const org = await requireActiveOrg();
  const mutateCheck = await checkCprCanMutate();
  if (!mutateCheck.allowed) return { error: mutateCheck.error };
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("batch_composition")
    .delete()
    .eq("id", String(formData.get("id") ?? ""))
    .eq("organization_id", org.organizationId)
    .select("id");

  if (error) return { error: dbError(error, "No fue posible eliminar la fila.") };
  if ((data ?? []).length === 0) {
    return { error: "No se eliminó: solo administrador o calidad pueden eliminar composición." };
  }
  revalidatePath("/traceability/output-batches");
  return { error: null };
}

// ===========================================================================
// Genealogía y estado
// ===========================================================================
export async function getBackwardTraceabilityAction(outputBatchId: string) {
  const org = await requireActiveOrg();
  return getBackward(org.organizationId, outputBatchId);
}

export async function getForwardTraceabilityAction(inputBatchId: string) {
  const org = await requireActiveOrg();
  return getForward(org.organizationId, inputBatchId);
}

export async function getOutputBatchCompletenessAction() {
  const org = await requireActiveOrg();
  return getCompleteness(org.organizationId);
}

export async function getTraceabilityDashboardAction() {
  const org = await requireActiveOrg();
  return getTraceabilityMetrics(org.organizationId);
}
