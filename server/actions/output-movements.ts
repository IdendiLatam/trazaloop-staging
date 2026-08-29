"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { checkCprCanMutate } from "@/server/actions/module-plans";
import { getOutputBatchStock } from "@/lib/db/inventory";
import {
  isMovementKind,
  directionFor,
  reasonIsRequired,
  resolveCount,
  MOVEMENT_REASON_REQUIRED,
} from "@/lib/domain/output-movements";

/**
 * PT-02B / PT-02B.1 · Registrar, corregir y anular movimientos de un lote.
 *
 * Las comprobaciones de aquí NO son la barrera: la barrera es
 * `output_batch_movement_guard`, que bloquea la fila del lote y compara con el
 * saldo consolidado. Esto da mensajes en el idioma de la pantalla antes de
 * llegar a la base, que es otra cosa.
 *
 * El SENTIDO no llega del formulario. Despachar, usar internamente y perder
 * restan siempre —lo dice un CHECK desde 0146—, así que pedirlo era pedir un
 * dato que el dominio ya conoce. En el ajuste sale de la resta entre lo
 * contado y lo que decía el sistema.
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
  const reason = String(formData.get("reason") ?? "").trim() || null;
  const reference = String(formData.get("reference") ?? "").trim() || null;
  const occurredAt = String(formData.get("occurred_at") ?? "").trim() || null;

  if (!outputBatchId) return { error: "Falta el lote producido." };
  if (!isMovementKind(kind)) return { error: "Selecciona el tipo de movimiento." };
  if (reasonIsRequired(kind) && !reason) return { error: MOVEMENT_REASON_REQUIRED };

  const saldo = await getOutputBatchStock(org.organizationId, outputBatchId);
  if (!saldo) return { error: "El lote producido no pertenece a tu empresa activa." };

  // Lo que se va a escribir. En un recuento, TODO esto se deriva del número
  // que la persona tecleó; en los demás, la cantidad es la cantidad.
  let direction: "in" | "out";
  let quantity: number;
  let counted: number | null = null;
  let theoretical: number | null = null;

  if (kind === "adjustment") {
    const contado = Number(String(formData.get("counted_quantity") ?? "").replace(",", "."));
    const r = resolveCount({
      counted: contado,
      theoretical: saldo.availableKg,
      physicalMax: saldo.physicalMaxKg,
    });
    if (!r.ok) return { error: r.error };
    direction = r.direction;
    quantity = r.quantity;
    counted = Number(contado.toFixed(4));
    // Se congela el teórico DEL MOMENTO del recuento. Si mañana se corrige un
    // despacho anterior, el saldo cambia; lo que el sistema decía cuando
    // alguien fue a contar, no.
    theoretical = saldo.availableKg;
  } else {
    quantity = Number(String(formData.get("quantity") ?? "").replace(",", "."));
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { error: "La cantidad debe ser un número mayor que cero." };
    }
    direction = directionFor(kind);
    if (quantity > saldo.availableKg) {
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
    quantity,
    unit_code: "kg",
    reason,
    reference,
    ...(counted !== null
      ? { counted_quantity: counted, theoretical_quantity_at_count: theoretical }
      : {}),
    ...(occurredAt ? { occurred_at: new Date(occurredAt).toISOString() } : {}),
  });
  if (error) return { error: error.message };

  revalidatePath("/traceability/output-batches");
  revalidatePath("/traceability/inventory");
  return { error: null, success: "Movimiento registrado." };
}

export async function correctOutputMovementAction(
  _prev: MovementActionState,
  formData: FormData
): Promise<MovementActionState> {
  return corregir(formData, false);
}

/**
 * Anular es corregir a cero.
 *
 * No hay sistema paralelo de anulaciones ni borrado: la misma RPC, la misma
 * fila correctiva, el mismo linaje. Lo único distinto es que la cantidad
 * resultante es cero, que es la manera de decir «esto no ocurrió» sin borrar
 * la constancia de que se dijo que sí.
 */
export async function annulOutputMovementAction(
  _prev: MovementActionState,
  formData: FormData
): Promise<MovementActionState> {
  return corregir(formData, true);
}

async function corregir(formData: FormData, anular: boolean): Promise<MovementActionState> {
  await requireActiveOrg();
  const mutate = await checkCprCanMutate();
  if (!mutate.allowed) return { error: mutate.error };

  const movementId = String(formData.get("movement_id") ?? "");
  const motivo = String(formData.get("correction_reason") ?? "").trim();
  if (!movementId) return { error: "Falta el movimiento a corregir." };
  if (!motivo) {
    return {
      error: anular
        ? "Una anulación sin motivo no explica nada."
        : "Una corrección sin motivo no explica nada.",
    };
  }

  let cantidad = 0;
  if (!anular) {
    cantidad = Number(String(formData.get("quantity") ?? "").replace(",", "."));
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      return { error: "La cantidad corregida debe ser un número mayor que cero." };
    }
  }

  const supabase = await createServerClient();
  // Insertar la corrección y retirar el original tienen que pasar juntos: por
  // eso es una RPC y no dos escrituras desde aquí.
  const { error } = await supabase.rpc("correct_output_batch_movement", {
    p_movement_id: movementId,
    p_quantity: cantidad,
    p_reason: motivo,
  });
  if (error) return { error: error.message };

  revalidatePath("/traceability/output-batches");
  revalidatePath("/traceability/inventory");
  return {
    error: null,
    success: anular
      ? "Movimiento anulado. El original se conserva en el historial."
      : "Corrección registrada. El movimiento original se conserva.",
  };
}
