"use server";

import { revalidatePath } from "next/cache";
import { getInputBatchBalance, getOutputBatchBalance } from "@/lib/db/inventory";
import { redirect } from "next/navigation";
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
import { validateInputBatchValues } from "@/lib/domain/traceability-validation";
import {
  orderMutationBlockedMessage,
  orderDeletionBlockedMessage,
  orderReopenAllowed,
  ORDER_HISTORY_MESSAGE,
} from "@/lib/domain/production-alerts";
import {
  validateProcessVariableRows,
  serializeProcessVariableRows,
  type ProcessVariableRow,
} from "@/lib/domain/process-variables";

export type TraceActionState = { error: string | null; success?: string | null };

const DUPLICATE = "Ya existe un registro con ese código en tu empresa.";
const GENERIC = "No fue posible guardar. Verifica los datos e intenta de nuevo.";

function dbError(error: { code?: string; message?: string } | null, fallback = GENERIC) {
  if (!error) return fallback;
  if (error.code === "23505") return DUPLICATE;
  if (error.code === "23503")
    return "La referencia seleccionada no pertenece a tu empresa o no existe.";
  if (error.message?.includes("organization_id de una fila no puede modificarse"))
    return "El registro no puede moverse de empresa.";
  // PCR-02.5: las guardas de saldo (0105) hablan español de dominio — su
  // mensaje llega intacto al usuario (p. ej. cuando una carrera concurrente
  // pierde el candado del lote y la BD es quien rechaza).
  if (
    error.code === "23514" &&
    (error.message?.includes("saldo disponible") ||
      error.message?.includes("no puede quedar por debajo"))
  ) {
    return error.message;
  }
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

/**
 * PCR-02 (Bloque H) · La orden debe pertenecer a la empresa activa y admitir
 * movimientos: sobre una orden cerrada o cancelada no se registran nuevos
 * consumos ni salidas (los históricos no se tocan; reabrir = cambiar estado).
 */
/** PCR-02.4 · Resuelve la orden PRODUCTORA de un lote y aplica la guarda de
 *  estado: la composición es estructura de trazabilidad y queda congelada
 *  mientras esa orden esté cerrada/cancelada (§11 del brief). */
async function assertOutputBatchOrderAcceptsMutations(
  orgId: string,
  outputBatchId: string | null
): Promise<{ ok: boolean; error: string | null }> {
  if (!outputBatchId) {
    return { ok: false, error: "El lote producido / lote final es obligatorio." };
  }
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("output_batches")
    .select("id, production_order_id")
    .eq("organization_id", orgId)
    .eq("id", outputBatchId)
    .maybeSingle();
  if (!data) {
    return { ok: false, error: "El lote producido no existe o no pertenece a tu empresa." };
  }
  return assertOrderAcceptsMutations(orgId, data.production_order_id as string);
}

async function assertOrderAcceptsMutations(
  orgId: string,
  productionOrderId: string | null
): Promise<{ ok: boolean; error: string | null }> {
  if (!productionOrderId) {
    return { ok: false, error: "La orden / corrida de producción es obligatoria." };
  }
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("production_orders")
    .select("id, status")
    .eq("organization_id", orgId)
    .eq("id", productionOrderId)
    .maybeSingle();
  if (!data) {
    return { ok: false, error: "La orden no existe o no pertenece a tu empresa." };
  }
  const blocked = orderMutationBlockedMessage(data.status as string);
  if (blocked) return { ok: false, error: blocked };
  return { ok: true, error: null };
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

// PCR-01 (punto 10): la validación pura vive en lib/domain/traceability-
// validation.ts (los archivos "use server" solo exportan funciones async).
// La cantidad es ahora OBLIGATORIA y > 0 para crear y para editar.
const validateInputBatch = validateInputBatchValues;

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
  const { data: created, error } = await supabase
    .from("input_batches")
    .insert({
      organization_id: org.organizationId,
      batch_code: v.batch_code,
      supplier_id: v.supplier_id,
      material_id: v.material_id,
      site_id: v.site_id,
      residue_type: v.residue_type,
      provenance: v.provenance,
      received_date: v.received_date,
      quantity_kg: Number(v.quantity_kg),
      storage_location: v.storage_location,
      notes: v.notes,
    })
    .select("id")
    .single();

  if (error || !created) return { error: dbError(error) };
  revalidatePath("/traceability/input-batches");
  // PCR-01 (punto 2): confirmar, mantener contexto y llevar la vista al
  // registro recién creado (ancla + resaltado en la página).
  redirect(`/traceability/input-batches?created=${created.id}#lote-${created.id}`);
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
      quantity_kg: Number(v.quantity_kg),
      storage_location: v.storage_location,
      notes: v.notes,
    })
    .eq("id", id)
    .eq("organization_id", org.organizationId);

  if (error) return { error: dbError(error) };
  revalidatePath("/traceability/input-batches");
  // PCR-01 (punto 7): cierre de edición + confirmación visible sobre el
  // registro actualizado (la página muestra "Cambios guardados correctamente.").
  redirect(`/traceability/input-batches?updated=${id}#lote-${id}`);
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
    // PCR-01 (punto 13): el editor humano envía filas serializadas + el
    // indicador de conservar un formato heredado no representable.
    process_variables_rows: String(formData.get("process_variables_rows") ?? ""),
    process_variables_keep_legacy: String(formData.get("process_variables_keep_legacy") ?? "") === "1",
    notes: String(formData.get("notes") ?? "").trim() || null,
  };
}

const ORDER_STATUSES = ["draft", "in_progress", "closed", "cancelled"];

/**
 * PCR-01 (punto 13) · Convierte las filas del editor (cliente NO confiable)
 * al formato canónico JSONB. `keepLegacy` conserva intacto el valor heredado
 * que no pudo representarse como filas (jamás pérdida silenciosa).
 */
function resolveProcessVariables(
  rowsJson: string,
  keepLegacy: boolean,
  currentValue: unknown
): { value: unknown; skipUpdate: boolean; error: string | null } {
  if (keepLegacy) return { value: currentValue ?? null, skipUpdate: true, error: null };
  if (!rowsJson) return { value: null, skipUpdate: false, error: null };
  let rows: ProcessVariableRow[];
  try {
    const parsed = JSON.parse(rowsJson);
    if (!Array.isArray(parsed)) throw new Error("no-array");
    rows = parsed.map((r) => ({
      name: typeof r?.name === "string" ? r.name : "",
      value: typeof r?.value === "string" ? r.value : String(r?.value ?? ""),
      unit: typeof r?.unit === "string" ? r.unit : "",
    }));
  } catch {
    return { value: null, skipUpdate: false, error: "Las variables de proceso no son válidas. Recarga la página e intenta de nuevo." };
  }
  const invalid = validateProcessVariableRows(rows);
  if (invalid) return { value: null, skipUpdate: false, error: invalid };
  return { value: serializeProcessVariableRows(rows), skipUpdate: false, error: null };
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

  const pv = resolveProcessVariables(
    v.process_variables_rows,
    false, // una orden nueva no tiene valor heredado que conservar
    null
  );
  if (pv.error) return { error: pv.error };
  if (!(await assertSameOrg("sites", v.site_id, org.organizationId))) {
    return { error: "La sede no pertenece a tu empresa." };
  }

  const supabase = await createServerClient();
  const { data: created, error } = await supabase
    .from("production_orders")
    .insert({
      organization_id: org.organizationId,
      order_code: v.order_code,
      order_date: v.order_date,
      status: v.status,
      site_id: v.site_id,
      pretreatment: v.pretreatment,
      process_variables: pv.value,
      notes: v.notes,
    })
    .select("id")
    .single();

  if (error || !created) return { error: dbError(error) };
  revalidatePath("/traceability/production-orders");
  // PCR-01 punto 14 + PCR-02 Bloque A: tras crear la orden, la aplicación
  // lleva al usuario DIRECTAMENTE al DETALLE de la orden (el eje del proceso),
  // aterrizando en "Materiales / lotes consumidos" con confirmación y guía.
  redirect(`/traceability/production-orders/${created.id}?created=1#consumos-${created.id}`);
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

  const supabase = await createServerClient();

  // Valor actual: necesario para conservar un formato heredado intacto y,
  // desde PCR-02.3, para vetar la edición ordinaria de historial finalizado.
  const { data: current } = await supabase
    .from("production_orders")
    .select("process_variables, status")
    .eq("id", id)
    .eq("organization_id", org.organizationId)
    .maybeSingle();
  if (!current) return { error: "La orden no existe o no pertenece a tu empresa." };
  // PCR-02.3 (§14/§34): una orden cerrada/cancelada no se edita por el
  // formulario genérico — la reapertura es una acción explícita y auditada.
  if (orderReopenAllowed(current.status as string)) {
    return {
      error:
        "La orden está finalizada y se consulta en modo auditoría. Para corregirla usa «Reabrir orden»; el candado histórico se conserva.",
    };
  }

  const pv = resolveProcessVariables(
    v.process_variables_rows,
    v.process_variables_keep_legacy,
    current.process_variables
  );
  if (pv.error) return { error: pv.error };
  if (!(await assertSameOrg("sites", v.site_id, org.organizationId))) {
    return { error: "La sede no pertenece a tu empresa." };
  }

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
  revalidatePath(`/traceability/production-orders/${id}`);
  // PCR-01 punto 7 + PCR-02: la edición confirma EN el detalle de la orden.
  redirect(`/traceability/production-orders/${id}?updated=1#registro-${id}`);
}

export async function deleteProductionOrderAction(
  _prev: TraceActionState,
  formData: FormData
): Promise<TraceActionState> {
  const org = await requireActiveOrg();
  const mutateCheck = await checkCprCanMutate();
  if (!mutateCheck.allowed) return { error: mutateCheck.error };
  const supabase = await createServerClient();
  // PCR-02.2 (hallazgo A): una orden cerrada/cancelada es historial de
  // trazabilidad y NO puede eliminarse (además, batch_consumption y
  // output_batch_consumption cascadearían y borrarían consumos históricos).
  // La guarda corre ANTES del delete; el trigger §2c de 0104 es la barrera
  // final ante acceso directo a la API.
  const orderId = String(formData.get("id") ?? "");
  const { data: order } = await supabase
    .from("production_orders")
    .select("id, status, history_locked_at")
    .eq("id", orderId)
    .eq("organization_id", org.organizationId)
    .maybeSingle();
  if (!order) return { error: "La orden no existe o no pertenece a tu empresa." };
  // PCR-02.3: el bloqueo considera también el candado histórico — una orden
  // reabierta (in_progress + candado) sigue siendo historial no eliminable.
  const deletionBlocked = orderDeletionBlockedMessage(
    order.status as string,
    order.history_locked_at as string | null
  );
  if (deletionBlocked) return { error: deletionBlocked };
  const { data, error } = await supabase
    .from("production_orders")
    .delete()
    .eq("id", orderId)
    .eq("organization_id", org.organizationId)
    .select("id");

  if (error) {
    if (error.code === "23514" || /historial de trazabilidad/.test(error.message ?? "")) {
      // Barrera §2d en BD: mismo mensaje semántico, nunca SQL crudo.
      return { error: ORDER_HISTORY_MESSAGE };
    }
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

/** PCR-02.3 · Reapertura EXPLÍCITA de una orden finalizada (closed o
 *  cancelled → in_progress). No toca el candado histórico (además, la BD lo
 *  vuelve inmutable): la orden reabierta se corrige pero jamás se elimina.
 *  Auditada por t_audit_production_orders como cualquier update. */
export async function reopenProductionOrderAction(
  _prev: TraceActionState,
  formData: FormData
): Promise<TraceActionState> {
  const org = await requireActiveOrg();
  const mutateCheck = await checkCprCanMutate();
  if (!mutateCheck.allowed) return { error: mutateCheck.error };
  const supabase = await createServerClient();
  const orderId = String(formData.get("id") ?? "");
  const { data: order } = await supabase
    .from("production_orders")
    .select("id, status, history_locked_at")
    .eq("id", orderId)
    .eq("organization_id", org.organizationId)
    .maybeSingle();
  if (!order) return { error: "La orden no existe o no pertenece a tu empresa." };
  if (!orderReopenAllowed(order.status as string)) {
    return { error: "Solo las órdenes cerradas o canceladas pueden reabrirse." };
  }
  const { error } = await supabase
    .from("production_orders")
    .update({ status: "in_progress" })
    .eq("id", orderId)
    .eq("organization_id", org.organizationId);
  if (error) return { error: dbError(error, "No fue posible reabrir la orden.") };
  revalidatePath("/traceability/production-orders");
  revalidatePath(`/traceability/production-orders/${orderId}`);
  return {
    error: null,
    success:
      "Orden reabierta: quedó «En proceso» para corrección. Sigue formando parte del historial de trazabilidad y no puede eliminarse.",
  };
}

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
  // PCR-02 (Bloque H): la orden debe ser de la empresa y estar abierta.
  const orderCheck = await assertOrderAcceptsMutations(org.organizationId, productionOrderId);
  if (!orderCheck.ok) return { error: orderCheck.error };
  if (!(await assertSameOrg("input_batches", inputBatchId, org.organizationId))) {
    return { error: "El lote no pertenece a tu empresa." };
  }
  // PCR-02.5 (Bloque C, capa 2 de 3): validación de saldo en la acción.
  // La última palabra la tiene SIEMPRE la guarda transaccional de la BD
  // (0105, candado FOR UPDATE): si dos solicitudes cruzan esta lectura a la
  // vez, la perdedora recibe el mismo mensaje desde el trigger vía dbError.
  {
    const saldo = await getInputBatchBalance(org.organizationId, inputBatchId);
    if (saldo && mass > saldo.available_kg) {
      return {
        error: `La cantidad a consumir supera el saldo disponible del lote. Disponible: ${saldo.available_kg} kg.`,
      };
    }
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
  // PCR-01 (punto 14): confirmación inmediata; el formulario permanece en la
  // sección de consumos para seguir registrando lotes.
  return { error: null, success: "Consumo registrado correctamente." };
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
  // PCR-02.4 (hallazgo 1): editar la masa de un consumo ES una mutación
  // estructural — exige que la orden del consumo siga aceptando mutaciones.
  const { data: row } = await supabase
    .from("batch_consumption")
    .select("id, production_order_id, input_batch_id, mass_kg")
    .eq("id", id)
    .eq("organization_id", org.organizationId)
    .maybeSingle();
  if (!row) return { error: "El consumo no existe o no pertenece a tu empresa." };
  const orderCheck = await assertOrderAcceptsMutations(
    org.organizationId,
    row.production_order_id as string
  );
  if (!orderCheck.ok) return { error: orderCheck.error };
  // PCR-02.5 (§12, capa 2 de 3): al EDITAR, la masa de la propia fila se
  // reutiliza — tope = disponible + masa actual del consumo (recibido −
  // otros), nunca recibido − otros − propia. La BD (0105) recalcula lo
  // mismo bajo candado y decide en última instancia.
  {
    const saldo = await getInputBatchBalance(org.organizationId, row.input_batch_id as string);
    if (saldo) {
      const tope = Number((saldo.available_kg + Number(row.mass_kg)).toFixed(4));
      if (mass > tope) {
        return {
          error: `La cantidad a consumir supera el saldo disponible del lote. Disponible: ${tope} kg.`,
        };
      }
    }
  }
  const { error } = await supabase
    .from("batch_consumption")
    .update({ mass_kg: mass, notes })
    .eq("id", id)
    .eq("organization_id", org.organizationId);

  if (error) return { error: dbError(error) };
  revalidatePath("/traceability/production-orders");
  return { error: null };
}

/**
 * PCR-02 (Bloques D y E) · Consumo INTERNO: una Orden/corrida consume un
 * LOTE PRODUCIDO por otra orden (producto intermedio reutilizable). El lote
 * conserva su identidad: no se duplica. Multiempresa: assertSameOrg sobre
 * ambos + FK compuestas + RLS; el autoconsumo lo bloquea también el trigger
 * 0104 en BD. PCR-02.5: sobre-consumir lo producido ya NO es una simple
 * advertencia — se BLOQUEA en las tres capas (UI, acción y guarda 0105 con
 * candado del lote), igual que el inventario externo.
 */
export async function addOutputConsumptionAction(
  _prev: TraceActionState,
  formData: FormData
): Promise<TraceActionState> {
  const org = await requireActiveOrg();
  const productionOrderId = String(formData.get("production_order_id") ?? "");
  const outputBatchId = String(formData.get("output_batch_id") ?? "");
  const mass = Number(String(formData.get("mass_kg") ?? ""));
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!productionOrderId || !outputBatchId) {
    return { error: "Selecciona la orden y el lote producido a consumir." };
  }
  if (Number.isNaN(mass) || mass <= 0) {
    return { error: "La masa consumida debe ser mayor que 0." };
  }
  const mutateCheck = await checkCprCanMutate();
  if (!mutateCheck.allowed) return { error: mutateCheck.error };
  const orderCheck = await assertOrderAcceptsMutations(org.organizationId, productionOrderId);
  if (!orderCheck.ok) return { error: orderCheck.error };
  if (!(await assertSameOrg("output_batches", outputBatchId, org.organizationId))) {
    return { error: "El lote producido no pertenece a tu empresa." };
  }

  const supabase = await createServerClient();

  // Anti-autoconsumo también en servidor (el trigger 0104 es la barrera final).
  const { data: producer } = await supabase
    .from("output_batches")
    .select("production_order_id")
    .eq("organization_id", org.organizationId)
    .eq("id", outputBatchId)
    .maybeSingle();
  if (producer?.production_order_id === productionOrderId) {
    return { error: "Una orden no puede consumir un lote producido por ella misma." };
  }

  // PCR-02.5 (Bloque D, capa 2 de 3): saldo interno = producido − consumido
  // internamente. La guarda 0105 (FOR UPDATE del lote producido) decide en
  // última instancia ante concurrencia.
  {
    const saldo = await getOutputBatchBalance(org.organizationId, outputBatchId);
    if (saldo && mass > saldo.available_kg) {
      return {
        error: `La cantidad a consumir supera el saldo disponible del lote producido. Disponible: ${saldo.available_kg} kg.`,
      };
    }
  }

  const { error } = await supabase.from("output_batch_consumption").insert({
    organization_id: org.organizationId,
    production_order_id: productionOrderId,
    output_batch_id: outputBatchId,
    mass_kg: mass,
    notes,
  });

  if (error) {
    return {
      error:
        error.code === "23505"
          ? "Ese lote producido ya está registrado en esta orden. Elimina el consumo existente para corregirlo."
          : dbError(error),
    };
  }
  revalidatePath("/traceability/production-orders");
  revalidatePath("/traceability/output-batches");
  return { error: null, success: "Consumo registrado correctamente." };
}

export async function deleteOutputConsumptionAction(
  _prev: TraceActionState,
  formData: FormData
): Promise<TraceActionState> {
  const org = await requireActiveOrg();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Falta el identificador del consumo." };
  const mutateCheck = await checkCprCanMutate();
  if (!mutateCheck.allowed) return { error: mutateCheck.error };
  const supabase = await createServerClient();
  // PCR-02.1 (hallazgo 1.B): quitar un consumo interno es una mutación
  // estructural — la orden consumidora debe seguir aceptando mutaciones.
  const { data: row } = await supabase
    .from("output_batch_consumption")
    .select("id, production_order_id")
    .eq("id", id)
    .eq("organization_id", org.organizationId)
    .maybeSingle();
  if (!row) return { error: "El consumo no existe o no pertenece a tu empresa." };
  const orderCheck = await assertOrderAcceptsMutations(org.organizationId, row.production_order_id);
  if (!orderCheck.ok) return { error: orderCheck.error };
  const { data, error } = await supabase
    .from("output_batch_consumption")
    .delete()
    .eq("id", id)
    .eq("organization_id", org.organizationId)
    .select("id");
  if (error) return { error: dbError(error, "No fue posible eliminar el consumo interno.") };
  if ((data ?? []).length === 0) {
    return { error: "No se eliminó: solo administrador o calidad pueden eliminar consumos." };
  }
  revalidatePath("/traceability/production-orders");
  revalidatePath("/traceability/output-batches");
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
  // PCR-02.1 (hallazgo 1.A): quitar un consumo externo es una mutación
  // estructural — validar el estado de la orden ANTES de borrar.
  const consumptionId = String(formData.get("id") ?? "");
  const { data: row } = await supabase
    .from("batch_consumption")
    .select("id, production_order_id")
    .eq("id", consumptionId)
    .eq("organization_id", org.organizationId)
    .maybeSingle();
  if (!row) return { error: "El consumo no existe o no pertenece a tu empresa." };
  const orderCheck = await assertOrderAcceptsMutations(org.organizationId, row.production_order_id);
  if (!orderCheck.ok) return { error: orderCheck.error };
  const { data, error } = await supabase
    .from("batch_consumption")
    .delete()
    .eq("id", consumptionId)
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

  // PCR-02 (Bloques B y H): la salida se registra sobre una orden abierta
  // de la empresa; desde el detalle de la orden la asociación es automática.
  const returnToOrder = String(formData.get("return_to") ?? "") === "order";
  const orderCheck = await assertOrderAcceptsMutations(org.organizationId, v.production_order_id);
  if (!orderCheck.ok) return { error: orderCheck.error };
  const mutateCheck = await checkCprCanMutate();
  if (!mutateCheck.allowed) return { error: mutateCheck.error };

  // Sprint 10A (Parte 8): límite de plan — Demo permite 1 lote producido.
  const limitCheck = await checkCprResourceLimit("output_batches");
  if (!limitCheck.allowed) return { error: limitCheck.error };

  // PCR-02.5 (Bloque A): la cantidad producida es OBLIGATORIA — se rechazan
  // vacío/NULL/NaN/0/negativos aquí, en el required del formulario y en la
  // BD (NOT NULL 0105 + CHECK 0025): defensa en profundidad.
  if (v.produced_quantity_kg === "") {
    return { error: "La cantidad producida es obligatoria." };
  }
  {
    const n = Number(v.produced_quantity_kg);
    if (Number.isNaN(n) || n <= 0) {
      return { error: "La cantidad producida debe ser mayor que 0 kg." };
    }
  }
  if (
    !(await assertSameOrg("production_orders", v.production_order_id, org.organizationId)) ||
    !(await assertSameOrg("products", v.product_id, org.organizationId))
  ) {
    return { error: "La orden o el producto no pertenecen a tu empresa." };
  }

  const supabase = await createServerClient();
  const { data: created, error } = await supabase
    .from("output_batches")
    .insert({
      organization_id: org.organizationId,
      batch_code: v.batch_code,
      production_order_id: v.production_order_id,
      product_id: v.product_id,
      produced_date: v.produced_date,
      produced_quantity_kg: Number(v.produced_quantity_kg),  // PCR-02.5: ya validada > 0
      characteristics: v.characteristics,
      intended_application: v.intended_application,
      storage_location: v.storage_location,
      notes: v.notes,
    })
    .select("id")
    .single();

  if (error || !created) return { error: dbError(error) };
  revalidatePath("/traceability/output-batches");
  revalidatePath(`/traceability/production-orders/${v.production_order_id}`);
  if (returnToOrder) {
    // PCR-02 (Bloque B): el usuario permanece en el contexto de la orden,
    // viendo de inmediato el lote creado en "Lotes producidos / salidas".
    redirect(
      `/traceability/production-orders/${v.production_order_id}?output_created=${created.id}#salida-${created.id}`
    );
  }
  // PCR-01 (punto 2): confirmar y abrir la composición del lote recién creado.
  redirect(`/traceability/output-batches?batch=${created.id}&created=1#lote-${created.id}`);
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
  // PCR-02.5 (Bloque A): la cantidad producida es OBLIGATORIA — se rechazan
  // vacío/NULL/NaN/0/negativos aquí, en el required del formulario y en la
  // BD (NOT NULL 0105 + CHECK 0025): defensa en profundidad.
  if (v.produced_quantity_kg === "") {
    return { error: "La cantidad producida es obligatoria." };
  }
  {
    const n = Number(v.produced_quantity_kg);
    if (Number.isNaN(n) || n <= 0) {
      return { error: "La cantidad producida debe ser mayor que 0 kg." };
    }
  }
  if (
    !(await assertSameOrg("production_orders", v.production_order_id, org.organizationId)) ||
    !(await assertSameOrg("products", v.product_id, org.organizationId))
  ) {
    return { error: "La orden o el producto no pertenecen a tu empresa." };
  }

  const supabase = await createServerClient();
  // PCR-02.4 (§10/§47, refina la política PCR-02.1): campos del lote.
  //   · ESTRUCTURALES — orden productora (genealogía), producto, cantidad
  //     producida (masa/balance) y código (identidad con la que el lote
  //     aparece en genealogía y dossier): congelados mientras la orden
  //     productora esté cerrada/cancelada; para corregirlos hay que
  //     reabrirla.
  //   · DESCRIPTIVOS — fecha de producción, características, aplicación,
  //     almacenamiento y notas: corregibles siempre, auditados por
  //     t_audit_output_batches (0025).
  //   · CAMBIAR LA ORDEN PRODUCTORA además sigue bloqueado si el lote ya
  //     fue consumido, y exige AMBAS órdenes mutables (PCR-02.1 §2b).
  const { data: current } = await supabase
    .from("output_batches")
    .select("id, production_order_id, product_id, produced_quantity_kg, batch_code")
    .eq("id", id)
    .eq("organization_id", org.organizationId)
    .maybeSingle();
  if (!current) {
    return { error: "El lote producido no existe o no pertenece a tu empresa." };
  }
  const nextQuantity = Number(v.produced_quantity_kg);  // PCR-02.5: siempre presente y > 0
  const currentQuantity =
    current.produced_quantity_kg == null ? null : Number(current.produced_quantity_kg);
  const quantityChanged =
    (currentQuantity == null) !== (nextQuantity == null) ||
    (currentQuantity != null && nextQuantity != null && currentQuantity !== nextQuantity);
  const structuralChange =
    current.production_order_id !== v.production_order_id ||
    current.product_id !== v.product_id ||
    quantityChanged ||
    current.batch_code !== v.batch_code;
  if (structuralChange) {
    const structCheck = await assertOrderAcceptsMutations(
      org.organizationId,
      current.production_order_id
    );
    if (!structCheck.ok) return { error: structCheck.error };
  }
  if (current.production_order_id !== v.production_order_id) {
    const { count: consumers } = await supabase
      .from("output_batch_consumption")
      .select("id", { count: "exact", head: true })
      .eq("output_batch_id", id)
      .eq("organization_id", org.organizationId);
    if ((consumers ?? 0) > 0) {
      return {
        error:
          "El lote producido ya fue consumido por otra orden: su orden productora no puede cambiarse.",
      };
    }
    const fromCheck = await assertOrderAcceptsMutations(
      org.organizationId,
      current.production_order_id
    );
    if (!fromCheck.ok) return { error: fromCheck.error };
    const toCheck = await assertOrderAcceptsMutations(org.organizationId, v.production_order_id);
    if (!toCheck.ok) return { error: toCheck.error };
  }
  const { error } = await supabase
    .from("output_batches")
    .update({
      batch_code: v.batch_code,
      production_order_id: v.production_order_id,
      product_id: v.product_id,
      produced_date: v.produced_date,
      produced_quantity_kg: Number(v.produced_quantity_kg),  // PCR-02.5: ya validada > 0
      characteristics: v.characteristics,
      intended_application: v.intended_application,
      storage_location: v.storage_location,
      notes: v.notes,
    })
    .eq("id", id)
    .eq("organization_id", org.organizationId);

  if (error) {
    // Barrera final en BD (§2b de 0104): mensaje claro, nunca SQL crudo.
    // PCR-02.5.1 (hallazgo 1): NO capturar 23514 genéricamente — tras la
    // 0105 este UPDATE también puede recibir el 23514 del PISO de cantidad
    // («La cantidad producida no puede quedar por debajo de lo ya consumido
    // internamente…»), que debe llegar ÍNTEGRO al usuario vía dbError (su
    // allowlist semántica lo deja pasar y sigue ocultando cualquier otro
    // SQL). La reasignación se discrimina por su mensaje de dominio.
    if (/consumido por otra orden/.test(error.message ?? "")) {
      return {
        error:
          "El lote producido ya fue consumido por otra orden: su orden productora no puede cambiarse.",
      };
    }
    return { error: dbError(error) };
  }
  revalidatePath("/traceability/output-batches");
  // PCR-01 (punto 7): confirmación inequívoca de la edición.
  redirect(`/traceability/output-batches?updated=${id}#lote-${id}`);
}

export async function deleteOutputBatchAction(
  _prev: TraceActionState,
  formData: FormData
): Promise<TraceActionState> {
  const org = await requireActiveOrg();
  const mutateCheck = await checkCprCanMutate();
  if (!mutateCheck.allowed) return { error: mutateCheck.error };
  const supabase = await createServerClient();
  // PCR-02.1 (§50): eliminar una salida es una mutación estructural.
  //   · Si el lote ya fue consumido por otra orden, no puede eliminarse
  //     (mensaje claro; ON DELETE RESTRICT es la barrera final en BD).
  //   · La orden productora debe seguir aceptando mutaciones.
  const outputId = String(formData.get("id") ?? "");
  const { data: batch } = await supabase
    .from("output_batches")
    .select("id, production_order_id")
    .eq("id", outputId)
    .eq("organization_id", org.organizationId)
    .maybeSingle();
  if (!batch) {
    return { error: "El lote producido no existe o no pertenece a tu empresa." };
  }
  const { count: consumers } = await supabase
    .from("output_batch_consumption")
    .select("id", { count: "exact", head: true })
    .eq("output_batch_id", outputId)
    .eq("organization_id", org.organizationId);
  if ((consumers ?? 0) > 0) {
    return {
      error:
        "El lote producido ya fue consumido por otras órdenes: no puede eliminarse mientras exista ese consumo.",
    };
  }
  if (batch.production_order_id) {
    const orderCheck = await assertOrderAcceptsMutations(
      org.organizationId,
      batch.production_order_id
    );
    if (!orderCheck.ok) return { error: orderCheck.error };
  }
  const { data, error } = await supabase
    .from("output_batches")
    .delete()
    .eq("id", outputId)
    .eq("organization_id", org.organizationId)
    .select("id");

  if (error) {
    if (error.code === "23503") {
      return {
        error:
          "El lote producido ya fue consumido por otras órdenes: no puede eliminarse mientras exista ese consumo.",
      };
    }
    return { error: dbError(error, "No fue posible eliminar el lote producido / lote final.") };
  }
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
  // PCR-02.4 (hallazgo crítico §11): la composición de un lote producido por
  // una orden cerrada/cancelada está congelada — afecta balance, contenido
  // reciclado, completitud y dossier.
  const orderCheck = await assertOutputBatchOrderAcceptsMutations(org.organizationId, outputBatchId);
  if (!orderCheck.ok) return { error: orderCheck.error };

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
  return { error: null, success: "Material agregado a la composición correctamente." };
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
  // PCR-02.4 (hallazgo crítico §11): resolver el lote de la fila y exigir
  // que su orden productora siga aceptando mutaciones.
  const { data: row } = await supabase
    .from("batch_composition")
    .select("id, output_batch_id")
    .eq("id", id)
    .eq("organization_id", org.organizationId)
    .maybeSingle();
  if (!row) return { error: "La fila de composición no existe o no pertenece a tu empresa." };
  const orderCheck = await assertOutputBatchOrderAcceptsMutations(
    org.organizationId,
    row.output_batch_id as string
  );
  if (!orderCheck.ok) return { error: orderCheck.error };
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
  // PCR-02.4 (hallazgo crítico §11): eliminar composición también es
  // estructural — la orden productora debe seguir aceptando mutaciones.
  const compId = String(formData.get("id") ?? "");
  const { data: row } = await supabase
    .from("batch_composition")
    .select("id, output_batch_id")
    .eq("id", compId)
    .eq("organization_id", org.organizationId)
    .maybeSingle();
  if (row) {
    const orderCheck = await assertOutputBatchOrderAcceptsMutations(
      org.organizationId,
      row.output_batch_id as string
    );
    if (!orderCheck.ok) return { error: orderCheck.error };
  }
  const { data, error } = await supabase
    .from("batch_composition")
    .delete()
    .eq("id", compId)
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
