"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { checkCprCanMutate } from "@/server/actions/module-plans";
import { getOutputBatchStock } from "@/lib/db/inventory";
import {
  isMovementKind,
  kindAllowsIncoming,
  reasonIsRequired,
  MOVEMENT_REASON_REQUIRED,
} from "@/lib/domain/output-movements";

/**
 * PT-02B · Registrar y corregir movimientos de un lote producido.
 *
 * Las comprobaciones de aquí NO son la barrera: la barrera es
 * `output_batch_movement_guard`, que bloquea la fila del lote y compara con
 * el saldo real. Esto da mensajes en el idioma de la pantalla antes de llegar
 * a la base, que es otra cosa.
 */

export type MovementActionState = { error: string | null; success?: string | null };

export async function registerOutputMovementAction(
  _prev: MovementActionState,
  formData: FormData
): Promise<MovementActionState> {
  const org = await requireActiveOrg();
  const mutate = await checkCprCanMutate();
  if (!mutate.allowed) return { error: mutate.error };

  const outputBatchId = String(formData.get("output_batch_id") ?? "");
  const kind = String(formData.get("movement_kind") ?? "");
  const direction = String(formData.get("direction") ?? "out");
  const cantidad = Number(String(formData.get("quantity") ?? "").replace(",", "."));
  const reason = String(formData.get("reason") ?? "").trim() || null;
  const reference = String(formData.get("reference") ?? "").trim() || null;
  const occurredAt = String(formData.get("occurred_at") ?? "").trim() || null;

  if (!outputBatchId) return { error: "Falta el lote producido." };
  if (!isMovementKind(kind)) return { error: "Selecciona el tipo de movimiento." };
  if (!Number.isFinite(cantidad) || cantidad <= 0) {
    // La cantidad es SIEMPRE positiva: el sentido lo lleva `direction`. Un
    // número negativo se teclea mal sin que nada chirríe.
    return { error: "La cantidad debe ser un número mayor que cero." };
  }
  if (direction === "in" && !kindAllowsIncoming(kind)) {
    return { error: "Solo un ajuste por recuento puede sumar al saldo." };
  }
  if (reasonIsRequired(kind) && !reason) return { error: MOVEMENT_REASON_REQUIRED };

  // Aviso temprano con el saldo real, para no mandar a la persona contra el
  // disparador sin decirle cuánto hay.
  if (direction === "out") {
    const saldo = await getOutputBatchStock(org.organizationId, outputBatchId);
    if (saldo && cantidad > saldo.availableKg) {
      return {
        error: `El movimiento supera lo disponible del lote. Disponible: ${saldo.availableKg} kg.`,
      };
    }
  }

  const supabase = await createServerClient();
  const { error } = await supabase.from("output_batch_movements").insert({
    organization_id: org.organizationId,
    output_batch_id: outputBatchId,
    movement_kind: kind,
    direction,
    quantity: cantidad,
    unit_code: "kg",
    reason,
    reference,
    ...(occurredAt ? { occurred_at: new Date(occurredAt).toISOString() } : {}),
  });
  if (error) return { error: error.message };

  revalidatePath("/traceability/output-batches");
  return { error: null, success: "Movimiento registrado." };
}

export async function correctOutputMovementAction(
  _prev: MovementActionState,
  formData: FormData
): Promise<MovementActionState> {
  const org = await requireActiveOrg();
  const mutate = await checkCprCanMutate();
  if (!mutate.allowed) return { error: mutate.error };

  const movementId = String(formData.get("movement_id") ?? "");
  const cantidad = Number(String(formData.get("quantity") ?? "").replace(",", "."));
  const motivo = String(formData.get("correction_reason") ?? "").trim();

  if (!movementId) return { error: "Falta el movimiento a corregir." };
  if (!Number.isFinite(cantidad) || cantidad <= 0) {
    return { error: "La cantidad corregida debe ser un número mayor que cero." };
  }
  if (!motivo) return { error: "Una corrección sin motivo no explica nada." };

  const supabase = await createServerClient();
  // Insertar la corrección y retirar el original tienen que pasar juntos: por
  // eso es una RPC y no dos escrituras desde aquí.
  const { error } = await supabase.rpc("correct_output_batch_movement", {
    p_movement_id: movementId,
    p_quantity: cantidad,
    p_reason: motivo,
  });
  if (error) return { error: error.message };

  void org;
  revalidatePath("/traceability/output-batches");
  return { error: null, success: "Corrección registrada. El movimiento original se conserva." };
}
