"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { requireTextilesForAction } from "@/lib/auth/require-textiles-module";
import { checkTextilesCanMutate, checkTextilesResourceLimit } from "@/server/actions/module-plans";
import {
  textileOrderBelongsToOrg,
  textileInputLotBelongsToOrg,
  textileOutputLotBelongsToOrg,
} from "@/lib/db/textiles-traceability";
import {
  textileReferenceBelongsToOrg,
  textileMaterialBelongsToOrg,
  textileComponentBelongsToOrg,
} from "@/lib/db/textiles-products";
import { textileSupplierBelongsToOrg } from "@/lib/db/textiles-catalogs";
import {
  TEXTILE_ORDER_STATUSES,
  TEXTILE_LOT_TYPES,
  TEXTILE_INPUT_LOT_STATUSES,
  TEXTILE_CONSUMPTION_ROLES,
  TEXTILE_STEP_TYPES,
  TEXTILE_STEP_STATUSES,
  TEXTILE_OUTPUT_LOT_STATUSES,
  parseQuantity,
  computeInputLotBalance,
} from "@/lib/domain/textiles-traceability";
import { cleanText, isOneOf, validateCatalogName } from "@/lib/domain/textiles-catalogs";
import { canUploadTextileEvidence } from "@/lib/domain/textiles-evidences";

/**
 * Trazaloop · Sprint T6 (Textil) · Server actions de trazabilidad: órdenes/
 * corridas, lotes de entrada, consumos, procesos por orden y lotes
 * producidos/finales.
 *
 * Contrato de seguridad (T3–T5.2): triple guarda del módulo + modo solo
 * lectura de plataforma + pre-check de rol de escritura
 * (admin/quality/consultant — RLS de 0078 y CPR 0025) + validación de
 * dominio antes de la BD + organization_id SIEMPRE del servidor +
 * relaciones verificadas dentro de la MISMA empresa (y re-verificadas por
 * FK compuesta, RLS y el guard de sobreconsumo). Nada usa service_role.
 *
 * El estado de trazabilidad de los lotes finales se RECALCULA en servidor
 * tras cada mutación relevante (dominio puro vía
 * getOrderTraceabilityEvaluation); es informativo — nunca cumplimiento —
 * y el detalle recalcula en vivo.
 */

export type TextileTraceabilityActionState = { error: string | null };

const UNIQUE_VIOLATION = "23505";
const TRACE_PATH = "/textiles/traceability";

function isUniqueViolation(error: { code?: string } | null): boolean {
  return Boolean(error && error.code === UNIQUE_VIOLATION);
}

type GateOk = { organizationId: string; roleCode: string };

async function gate(): Promise<{ ok: GateOk | null; error: string | null }> {
  const access = await requireTextilesForAction();
  if (access.org === null) return { ok: null, error: access.error };
  const mutateCheck = await checkTextilesCanMutate();
  if (!mutateCheck.allowed) return { ok: null, error: mutateCheck.error };
  // Mismos roles de escritura que evidencias (T5.1) y que la RLS de 0078.
  if (!canUploadTextileEvidence(access.org.roleCode)) {
    return {
      ok: null,
      error: "Tu rol no permite editar trazabilidad (requiere administrador, calidad o consultor).",
    };
  }
  return {
    ok: { organizationId: access.org.organizationId, roleCode: access.org.roleCode },
    error: null,
  };
}

async function currentUserId(): Promise<string | null> {
  const supabase = await createServerClient();
  return (await supabase.auth.getUser()).data.user?.id ?? null;
}

function revalidateTracePaths(orderId?: string, outputLotId?: string) {
  revalidatePath(TRACE_PATH);
  revalidatePath(`${TRACE_PATH}/orders`);
  revalidatePath(`${TRACE_PATH}/input-lots`);
  revalidatePath(`${TRACE_PATH}/output-lots`);
  if (orderId) revalidatePath(`${TRACE_PATH}/orders/${orderId}`);
  if (outputLotId) revalidatePath(`${TRACE_PATH}/output-lots/${outputLotId}`);
}

// T6.1: el recálculo de traceability_status vive AHORA en la base de datos
// (triggers AFTER de 0079 sobre consumos, procesos, lotes finales, órdenes,
// lotes de entrada y vínculos de evidencias, vía
// refresh_textile_order_output_lots_traceability). El campo está protegido
// contra UPDATE directo, así que las actions ya no lo escriben nunca: ni
// desde input del cliente (jamás se aceptó) ni desde el servidor.

/** Recalcula el estado derivado del lote de entrada (nunca pisa blocked/archived). */
async function recalcInputLotStatus(organizationId: string, inputLotId: string): Promise<void> {
  const supabase = await createServerClient();
  const [{ data: lot }, { data: consumptions }] = await Promise.all([
    supabase
      .from("textile_input_lots")
      .select("quantity_received, unit, status")
      .eq("organization_id", organizationId)
      .eq("id", inputLotId)
      .maybeSingle(),
    supabase
      .from("textile_order_consumptions")
      .select("quantity_consumed, unit")
      .eq("organization_id", organizationId)
      .eq("input_lot_id", inputLotId),
  ]);
  if (!lot || lot.status === "blocked" || lot.status === "archived") return;
  const balance = computeInputLotBalance({
    quantityReceived: lot.quantity_received === null ? null : Number(lot.quantity_received),
    unit: (lot.unit as string | null) ?? null,
    consumptions: (consumptions ?? []).map((c) => ({
      quantity: Number(c.quantity_consumed),
      unit: c.unit as string,
    })),
  });
  if (balance.derivedStatus !== lot.status) {
    await supabase
      .from("textile_input_lots")
      .update({ status: balance.derivedStatus, updated_by: await currentUserId() })
      .eq("id", inputLotId)
      .eq("organization_id", organizationId);
  }
}

// ---------------------------------------------------------------------------
// Órdenes / corridas de confección
// ---------------------------------------------------------------------------

export type TextileOrderInput = {
  orderCode: string;
  referenceId: string;
  plannedQuantity?: string;
  producedQuantity?: string;
  unit?: string;
  plannedStartDate?: string;
  plannedEndDate?: string;
  actualStartDate?: string;
  actualEndDate?: string;
  status?: string;
  responsibleArea?: string;
  notes?: string;
};

async function validateOrderInput(
  organizationId: string,
  input: TextileOrderInput
): Promise<{ row: Record<string, unknown>; error: null } | { row: null; error: string }> {
  const orderCode = cleanText(input.orderCode);
  if (!orderCode) return { row: null, error: "El código de la orden es obligatorio." };
  const status = input.status ?? "draft";
  if (!isOneOf(TEXTILE_ORDER_STATUSES, status)) return { row: null, error: "Estado de orden no válido." };
  const referenceId = cleanText(input.referenceId);
  if (!referenceId || !(await textileReferenceBelongsToOrg(organizationId, referenceId))) {
    return { row: null, error: "La referencia seleccionada no es válida." };
  }
  let planned: number | null = null;
  if (cleanText(input.plannedQuantity)) {
    const parsed = parseQuantity(input.plannedQuantity);
    if (parsed.value === null) return { row: null, error: `Cantidad planeada: ${parsed.error}` };
    planned = parsed.value;
  }
  let produced: number | null = null;
  const producedText = cleanText(input.producedQuantity);
  if (producedText) {
    const num = Number(producedText.replace(",", "."));
    if (!Number.isFinite(num) || num < 0) {
      return { row: null, error: "La cantidad producida debe ser un número mayor o igual a 0." };
    }
    produced = Math.round(num * 100) / 100;
  }
  return {
    row: {
      order_code: orderCode,
      reference_id: referenceId,
      planned_quantity: planned,
      produced_quantity: produced,
      unit: cleanText(input.unit) ?? "units",
      planned_start_date: cleanText(input.plannedStartDate),
      planned_end_date: cleanText(input.plannedEndDate),
      actual_start_date: cleanText(input.actualStartDate),
      actual_end_date: cleanText(input.actualEndDate),
      status,
      responsible_area: cleanText(input.responsibleArea),
      notes: cleanText(input.notes),
    },
    error: null,
  };
}

export async function createTextileProductionOrderAction(
  input: TextileOrderInput
): Promise<TextileTraceabilityActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  // T9F.2 · Bloqueador 1: límite del plan del MÓDULO Textiles ANTES del
  // INSERT (conteo real en BD vía check_module_resource_allowance; Demo
  // limitado, Full/Extra ilimitados; fail-closed si no puede verificarse).
  const limitCheck = await checkTextilesResourceLimit("production_orders");
  if (!limitCheck.allowed) return { error: limitCheck.error };
  const validated = await validateOrderInput(g.ok.organizationId, input);
  if (validated.row === null) return { error: validated.error };

  const supabase = await createServerClient();
  const { error } = await supabase.from("textile_production_orders").insert({
    organization_id: g.ok.organizationId,
    ...validated.row,
  });
  if (isUniqueViolation(error)) return { error: "Ya existe una orden con ese código." };
  if (error) return { error: "No fue posible crear la orden." };
  revalidateTracePaths();
  return { error: null };
}

export async function updateTextileProductionOrderAction(
  id: string,
  input: TextileOrderInput
): Promise<TextileTraceabilityActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const validated = await validateOrderInput(g.ok.organizationId, input);
  if (validated.row === null) return { error: validated.error };

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("textile_production_orders")
    .update({ ...validated.row, updated_by: await currentUserId() })
    .eq("id", id)
    .eq("organization_id", g.ok.organizationId)
    .select("id");
  if (isUniqueViolation(error)) return { error: "Ya existe una orden con ese código." };
  if (error || !data || data.length === 0) return { error: "No fue posible actualizar la orden." };
  revalidateTracePaths(id);
  return { error: null };
}

export async function updateTextileProductionOrderStatusAction(
  id: string,
  status: string
): Promise<TextileTraceabilityActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!isOneOf(TEXTILE_ORDER_STATUSES, status)) return { error: "Estado de orden no válido." };

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("textile_production_orders")
    .update({ status, updated_by: await currentUserId() })
    .eq("id", id)
    .eq("organization_id", g.ok.organizationId)
    .select("id");
  if (error || !data || data.length === 0) return { error: "No fue posible cambiar el estado de la orden." };
  revalidateTracePaths(id);
  return { error: null };
}

export async function archiveTextileProductionOrderAction(
  id: string
): Promise<TextileTraceabilityActionState> {
  return updateTextileProductionOrderStatusAction(id, "archived");
}

// ---------------------------------------------------------------------------
// Lotes de entrada
// ---------------------------------------------------------------------------

export type TextileInputLotInput = {
  lotCode: string;
  lotType: string;
  materialId?: string;
  componentId?: string;
  supplierId?: string;
  receivedDate?: string;
  quantityReceived?: string;
  unit?: string;
  documentReference?: string;
  status?: string;
  notes?: string;
};

async function validateInputLot(
  organizationId: string,
  input: TextileInputLotInput
): Promise<{ row: Record<string, unknown>; error: null } | { row: null; error: string }> {
  const lotCode = cleanText(input.lotCode);
  if (!lotCode) return { row: null, error: "El código del lote es obligatorio." };
  if (!isOneOf(TEXTILE_LOT_TYPES, input.lotType)) return { row: null, error: "Tipo de lote no válido." };
  const status = input.status ?? "available";
  if (!isOneOf(TEXTILE_INPUT_LOT_STATUSES, status)) return { row: null, error: "Estado de lote no válido." };

  const materialId = cleanText(input.materialId);
  const componentId = cleanText(input.componentId);
  if (input.lotType === "material") {
    if (!materialId || !(await textileMaterialBelongsToOrg(organizationId, materialId))) {
      return { row: null, error: "Selecciona un material válido para el lote de material." };
    }
  } else {
    if (!componentId || !(await textileComponentBelongsToOrg(organizationId, componentId))) {
      return { row: null, error: "Selecciona un componente válido para el lote de componente." };
    }
  }
  const supplierId = cleanText(input.supplierId);
  if (supplierId && !(await textileSupplierBelongsToOrg(organizationId, supplierId))) {
    return { row: null, error: "El proveedor seleccionado no es válido." };
  }
  let quantity: number | null = null;
  if (cleanText(input.quantityReceived)) {
    const parsed = parseQuantity(input.quantityReceived);
    if (parsed.value === null) return { row: null, error: `Cantidad recibida: ${parsed.error}` };
    quantity = parsed.value;
  }
  return {
    row: {
      lot_code: lotCode,
      lot_type: input.lotType,
      material_id: input.lotType === "material" ? materialId : null,
      component_id: input.lotType === "component" ? componentId : null,
      supplier_id: supplierId,
      received_date: cleanText(input.receivedDate),
      quantity_received: quantity,
      unit: cleanText(input.unit),
      document_reference: cleanText(input.documentReference),
      status,
      notes: cleanText(input.notes),
    },
    error: null,
  };
}

export async function createTextileInputLotAction(
  input: TextileInputLotInput
): Promise<TextileTraceabilityActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  // T9F.2 · Bloqueador 1: límite del plan del MÓDULO Textiles ANTES del
  // INSERT (conteo real en BD vía check_module_resource_allowance; Demo
  // limitado, Full/Extra ilimitados; fail-closed si no puede verificarse).
  const limitCheck = await checkTextilesResourceLimit("input_batches");
  if (!limitCheck.allowed) return { error: limitCheck.error };
  const validated = await validateInputLot(g.ok.organizationId, input);
  if (validated.row === null) return { error: validated.error };

  const supabase = await createServerClient();
  const { error } = await supabase.from("textile_input_lots").insert({
    organization_id: g.ok.organizationId,
    ...validated.row,
  });
  if (isUniqueViolation(error)) return { error: "Ya existe un lote con ese código." };
  if (error) return { error: "No fue posible crear el lote de entrada." };
  revalidateTracePaths();
  return { error: null };
}

export async function updateTextileInputLotAction(
  id: string,
  input: TextileInputLotInput
): Promise<TextileTraceabilityActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const validated = await validateInputLot(g.ok.organizationId, input);
  if (validated.row === null) return { error: validated.error };

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("textile_input_lots")
    .update({ ...validated.row, updated_by: await currentUserId() })
    .eq("id", id)
    .eq("organization_id", g.ok.organizationId)
    .select("id");
  if (isUniqueViolation(error)) return { error: "Ya existe un lote con ese código." };
  if (error || !data || data.length === 0) return { error: "No fue posible actualizar el lote." };
  revalidateTracePaths();
  return { error: null };
}

export async function setTextileInputLotActiveAction(
  id: string,
  isActive: boolean
): Promise<TextileTraceabilityActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("textile_input_lots")
    .update({ is_active: isActive, updated_by: await currentUserId() })
    .eq("id", id)
    .eq("organization_id", g.ok.organizationId)
    .select("id");
  if (error || !data || data.length === 0) {
    return { error: `No fue posible ${isActive ? "activar" : "desactivar"} el lote.` };
  }
  revalidateTracePaths();
  return { error: null };
}

// ---------------------------------------------------------------------------
// Consumos de lotes en una orden
// ---------------------------------------------------------------------------

export type TextileConsumptionInput = {
  inputLotId: string;
  quantityConsumed: string;
  unit: string;
  consumptionRole?: string;
  consumedAt?: string;
  notes?: string;
};

async function validateConsumption(
  organizationId: string,
  input: TextileConsumptionInput
): Promise<{ row: Record<string, unknown>; error: null } | { row: null; error: string }> {
  const inputLotId = cleanText(input.inputLotId);
  if (!inputLotId || !(await textileInputLotBelongsToOrg(organizationId, inputLotId))) {
    return { row: null, error: "El lote de entrada seleccionado no es válido." };
  }
  const parsed = parseQuantity(input.quantityConsumed);
  if (parsed.value === null) return { row: null, error: `Cantidad consumida: ${parsed.error}` };
  const unit = cleanText(input.unit);
  if (!unit) return { row: null, error: "La unidad del consumo es obligatoria." };
  const role = cleanText(input.consumptionRole) ?? "other";
  if (!isOneOf(TEXTILE_CONSUMPTION_ROLES, role)) return { row: null, error: "Rol de consumo no válido." };
  return {
    row: {
      input_lot_id: inputLotId,
      quantity_consumed: parsed.value,
      unit,
      consumption_role: role,
      consumed_at: cleanText(input.consumedAt),
      notes: cleanText(input.notes),
    },
    error: null,
  };
}

const OVERCONSUMPTION_DB_MESSAGE = "Sobreconsumo bloqueado";

function consumptionErrorMessage(raw: string | undefined, fallback: string): string {
  if (raw && raw.includes(OVERCONSUMPTION_DB_MESSAGE)) {
    return "Sobreconsumo bloqueado: el lote no tiene saldo suficiente en esa unidad.";
  }
  return fallback;
}

export async function addTextileOrderConsumptionAction(
  orderId: string,
  input: TextileConsumptionInput
): Promise<TextileTraceabilityActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!(await textileOrderBelongsToOrg(g.ok.organizationId, orderId))) {
    return { error: "La orden no existe o no pertenece a tu organización." };
  }
  const validated = await validateConsumption(g.ok.organizationId, input);
  if (validated.row === null) return { error: validated.error };

  const supabase = await createServerClient();
  const { error } = await supabase.from("textile_order_consumptions").insert({
    organization_id: g.ok.organizationId,
    order_id: orderId,
    ...validated.row,
  });
  if (error) {
    return { error: consumptionErrorMessage(error.message, "No fue posible registrar el consumo.") };
  }
  await recalcInputLotStatus(g.ok.organizationId, validated.row.input_lot_id as string);
  revalidateTracePaths(orderId);
  return { error: null };
}

export async function updateTextileOrderConsumptionAction(
  rowId: string,
  orderId: string,
  input: TextileConsumptionInput
): Promise<TextileTraceabilityActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const validated = await validateConsumption(g.ok.organizationId, input);
  if (validated.row === null) return { error: validated.error };

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("textile_order_consumptions")
    .update({ ...validated.row, updated_by: await currentUserId() })
    .eq("id", rowId)
    .eq("organization_id", g.ok.organizationId)
    .eq("order_id", orderId)
    .select("id");
  if (error) {
    return { error: consumptionErrorMessage(error.message, "No fue posible actualizar el consumo.") };
  }
  if (!data || data.length === 0) return { error: "No fue posible actualizar el consumo." };
  await recalcInputLotStatus(g.ok.organizationId, validated.row.input_lot_id as string);
  revalidateTracePaths(orderId);
  return { error: null };
}

export async function removeTextileOrderConsumptionAction(
  rowId: string,
  orderId: string
): Promise<TextileTraceabilityActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("textile_order_consumptions")
    .delete()
    .eq("id", rowId)
    .eq("organization_id", g.ok.organizationId)
    .eq("order_id", orderId)
    .select("id, input_lot_id");
  if (error || !data || data.length === 0) {
    return { error: "No fue posible eliminar el consumo (verifica tu rol en la organización)." };
  }
  await recalcInputLotStatus(g.ok.organizationId, data[0].input_lot_id as string);
  revalidateTracePaths(orderId);
  return { error: null };
}

// ---------------------------------------------------------------------------
// Procesos internos/tercerizados de la orden
// ---------------------------------------------------------------------------

export type TextileStepInput = {
  stepType: string;
  processId?: string;
  outsourcedProcessId?: string;
  name: string;
  stepOrder?: string;
  responsibleName?: string;
  supplierId?: string;
  plannedDate?: string;
  completedDate?: string;
  status?: string;
  notes?: string;
};

async function validateStep(
  organizationId: string,
  input: TextileStepInput
): Promise<{ row: Record<string, unknown>; error: null } | { row: null; error: string }> {
  const name = validateCatalogName(input.name);
  if (name.name === null) return { row: null, error: "El nombre del proceso es obligatorio." };
  if (!isOneOf(TEXTILE_STEP_TYPES, input.stepType)) return { row: null, error: "Tipo de paso no válido." };
  const status = input.status ?? "pending";
  if (!isOneOf(TEXTILE_STEP_STATUSES, status)) return { row: null, error: "Estado de paso no válido." };

  const processId = cleanText(input.processId);
  const outsourcedId = cleanText(input.outsourcedProcessId);
  const supabase = await createServerClient();
  if (input.stepType === "internal") {
    if (!processId) return { row: null, error: "Selecciona el proceso interno del catálogo." };
    const { data } = await supabase
      .from("textile_processes")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("id", processId)
      .maybeSingle();
    if (!data) return { row: null, error: "El proceso interno seleccionado no es válido." };
  } else {
    if (!outsourcedId) return { row: null, error: "Selecciona el proceso tercerizado del catálogo." };
    const { data } = await supabase
      .from("textile_outsourced_processes")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("id", outsourcedId)
      .maybeSingle();
    if (!data) return { row: null, error: "El proceso tercerizado seleccionado no es válido." };
  }
  const supplierId = cleanText(input.supplierId);
  if (supplierId && !(await textileSupplierBelongsToOrg(organizationId, supplierId))) {
    return { row: null, error: "El proveedor seleccionado no es válido." };
  }
  let stepOrder: number | null = null;
  const orderText = cleanText(input.stepOrder);
  if (orderText) {
    stepOrder = Number(orderText);
    if (!Number.isInteger(stepOrder) || stepOrder < 0) {
      return { row: null, error: "El orden del paso debe ser un entero positivo." };
    }
  }
  return {
    row: {
      step_type: input.stepType,
      process_id: input.stepType === "internal" ? processId : null,
      outsourced_process_id: input.stepType === "outsourced" ? outsourcedId : null,
      name: name.name,
      step_order: stepOrder,
      responsible_name: cleanText(input.responsibleName),
      supplier_id: supplierId,
      planned_date: cleanText(input.plannedDate),
      completed_date: cleanText(input.completedDate),
      status,
      notes: cleanText(input.notes),
    },
    error: null,
  };
}

export async function addTextileOrderProcessStepAction(
  orderId: string,
  input: TextileStepInput
): Promise<TextileTraceabilityActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!(await textileOrderBelongsToOrg(g.ok.organizationId, orderId))) {
    return { error: "La orden no existe o no pertenece a tu organización." };
  }
  const validated = await validateStep(g.ok.organizationId, input);
  if (validated.row === null) return { error: validated.error };

  const supabase = await createServerClient();
  const { error } = await supabase.from("textile_order_process_steps").insert({
    organization_id: g.ok.organizationId,
    order_id: orderId,
    ...validated.row,
  });
  if (error) return { error: "No fue posible registrar el proceso." };
  revalidateTracePaths(orderId);
  return { error: null };
}

export async function updateTextileOrderProcessStepAction(
  rowId: string,
  orderId: string,
  input: TextileStepInput
): Promise<TextileTraceabilityActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const validated = await validateStep(g.ok.organizationId, input);
  if (validated.row === null) return { error: validated.error };

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("textile_order_process_steps")
    .update({ ...validated.row, updated_by: await currentUserId() })
    .eq("id", rowId)
    .eq("organization_id", g.ok.organizationId)
    .eq("order_id", orderId)
    .select("id");
  if (error || !data || data.length === 0) return { error: "No fue posible actualizar el proceso." };
  revalidateTracePaths(orderId);
  return { error: null };
}

export async function removeTextileOrderProcessStepAction(
  rowId: string,
  orderId: string
): Promise<TextileTraceabilityActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("textile_order_process_steps")
    .delete()
    .eq("id", rowId)
    .eq("organization_id", g.ok.organizationId)
    .eq("order_id", orderId)
    .select("id");
  if (error || !data || data.length === 0) {
    return { error: "No fue posible eliminar el proceso (verifica tu rol en la organización)." };
  }
  revalidateTracePaths(orderId);
  return { error: null };
}

// ---------------------------------------------------------------------------
// Lotes producidos / finales
// ---------------------------------------------------------------------------

export type TextileOutputLotInput = {
  outputLotCode: string;
  quantityProduced: string;
  unit?: string;
  producedDate?: string;
  status?: string;
  notes?: string;
};

function validateOutputLot(input: TextileOutputLotInput):
  | { row: Record<string, unknown>; error: null }
  | { row: null; error: string } {
  const code = cleanText(input.outputLotCode);
  if (!code) return { row: null, error: "El código del lote final es obligatorio." };
  const parsed = parseQuantity(input.quantityProduced);
  if (parsed.value === null) return { row: null, error: `Cantidad producida: ${parsed.error}` };
  const status = input.status ?? "produced";
  if (!isOneOf(TEXTILE_OUTPUT_LOT_STATUSES, status)) return { row: null, error: "Estado de lote no válido." };
  return {
    row: {
      output_lot_code: code,
      quantity_produced: parsed.value,
      unit: cleanText(input.unit) ?? "units",
      produced_date: cleanText(input.producedDate),
      status,
      notes: cleanText(input.notes),
    },
    error: null,
  };
}

export async function createTextileOutputLotAction(
  orderId: string,
  input: TextileOutputLotInput
): Promise<TextileTraceabilityActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  // T9F.2 · Bloqueador 1: límite del plan del MÓDULO Textiles ANTES del
  // INSERT (conteo real en BD vía check_module_resource_allowance; Demo
  // limitado, Full/Extra ilimitados; fail-closed si no puede verificarse).
  const limitCheck = await checkTextilesResourceLimit("output_batches");
  if (!limitCheck.allowed) return { error: limitCheck.error };
  if (!(await textileOrderBelongsToOrg(g.ok.organizationId, orderId))) {
    return { error: "La orden no existe o no pertenece a tu organización." };
  }
  const validated = validateOutputLot(input);
  if (validated.row === null) return { error: validated.error };

  const supabase = await createServerClient();
  const { error } = await supabase.from("textile_output_lots").insert({
    organization_id: g.ok.organizationId,
    order_id: orderId,
    ...validated.row,
  });
  if (isUniqueViolation(error)) return { error: "Ya existe un lote final con ese código." };
  if (error) return { error: "No fue posible crear el lote final." };
  revalidateTracePaths(orderId);
  return { error: null };
}

export async function updateTextileOutputLotAction(
  id: string,
  orderId: string,
  input: TextileOutputLotInput
): Promise<TextileTraceabilityActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const validated = validateOutputLot(input);
  if (validated.row === null) return { error: validated.error };

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("textile_output_lots")
    .update({ ...validated.row, updated_by: await currentUserId() })
    .eq("id", id)
    .eq("organization_id", g.ok.organizationId)
    .eq("order_id", orderId)
    .select("id");
  if (isUniqueViolation(error)) return { error: "Ya existe un lote final con ese código." };
  if (error || !data || data.length === 0) return { error: "No fue posible actualizar el lote final." };
  revalidateTracePaths(orderId, id);
  return { error: null };
}

/** Variante (id, input) para formularios genéricos: resuelve la orden del
 * propio lote (misma organización) y delega en la action principal. */
export async function updateTextileOutputLotDetailsAction(
  id: string,
  input: TextileOutputLotInput
): Promise<TextileTraceabilityActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("textile_output_lots")
    .select("order_id")
    .eq("organization_id", g.ok.organizationId)
    .eq("id", id)
    .maybeSingle();
  if (!data) return { error: "El lote final no existe o no pertenece a tu organización." };
  return updateTextileOutputLotAction(id, data.order_id as string, input);
}

export async function updateTextileOutputLotStatusAction(
  id: string,
  status: string
): Promise<TextileTraceabilityActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!isOneOf(TEXTILE_OUTPUT_LOT_STATUSES, status)) return { error: "Estado de lote no válido." };

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("textile_output_lots")
    .update({ status, updated_by: await currentUserId() })
    .eq("id", id)
    .eq("organization_id", g.ok.organizationId)
    .select("id");
  if (error || !data || data.length === 0) return { error: "No fue posible cambiar el estado del lote." };
  revalidateTracePaths(undefined, id);
  return { error: null };
}

export async function archiveTextileOutputLotAction(
  id: string
): Promise<TextileTraceabilityActionState> {
  return updateTextileOutputLotStatusAction(id, "archived");
}

// ---------------------------------------------------------------------------
// Recálculo manual (T6.1): llama la RPC controlada de 0079. El cliente
// NUNCA envía el estado — la BD lo deriva de los datos operativos.
// ---------------------------------------------------------------------------

export async function recalculateTextileOutputLotTraceabilityAction(
  outputLotId: string
): Promise<{ error: string | null; status: string | null }> {
  const g = await gate();
  if (!g.ok) return { error: g.error, status: null };
  if (!(await textileOutputLotBelongsToOrg(g.ok.organizationId, outputLotId))) {
    return { error: "El lote final no existe o no pertenece a tu organización.", status: null };
  }
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("recalculate_textile_output_lot_traceability", {
    p_output_lot_id: outputLotId,
  });
  if (error) return { error: "No fue posible recalcular el estado.", status: null };
  revalidateTracePaths(undefined, outputLotId);
  return { error: null, status: (data as string | null) ?? null };
}
