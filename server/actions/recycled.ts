"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import {
  listLatestCalculations,
  listCalculationsForBatch,
  getCalculationDetail,
  getRecycledDashboard,
  getRecycledByOrder,
  getRecycledByProduct,
  getRecycledByFamily,
  getRecycledByPeriod,
} from "@/lib/db/recycled";
import { listOutputBatches, getCompleteness } from "@/lib/db/traceability";

/**
 * Mensajes que la RPC lanza a propósito (validaciones de negocio): se
 * muestran tal cual. Cualquier otro error de BD se traduce a algo entendible.
 */
const KNOWN_RPC_MESSAGES = [
  "Se requiere una sesión activa",
  "El lote de salida no existe",
  "No eres miembro activo",
  "Tu rol no permite calcular",
  "La metodología indicada no existe",
  "No hay una metodología activa",
  "El lote no tiene composición registrada",
];

export async function calculateRecycledContentAction(
  outputBatchId: string
): Promise<{ error: string | null }> {
  const org = await requireActiveOrg();
  const supabase = await createServerClient();

  // Defensa previa: el lote debe pertenecer a la empresa activa (la RPC
  // valida membresía de nuevo; organization_id jamás viaja desde el cliente).
  const { data: batch } = await supabase
    .from("output_batches")
    .select("id")
    .eq("id", outputBatchId)
    .eq("organization_id", org.organizationId)
    .maybeSingle();
  if (!batch) {
    return { error: "El lote de salida no pertenece a tu empresa activa." };
  }

  const { error } = await supabase.rpc("calculate_recycled_content", {
    p_output_batch_id: outputBatchId,
  });

  if (error) {
    const known = KNOWN_RPC_MESSAGES.find((m) => error.message?.includes(m));
    return {
      error: known
        ? error.message
        : "No fue posible calcular. Revisa la composición, los consumos y las evidencias del lote.",
    };
  }

  revalidatePath("/recycled-content");
  revalidatePath("/recycled-content/output-batches");
  revalidatePath(`/recycled-content/output-batches/${outputBatchId}`);
  return { error: null };
}

export async function getLatestCalculationForOutputBatchAction(outputBatchId: string) {
  const org = await requireActiveOrg();
  const all = await listCalculationsForBatch(org.organizationId, outputBatchId);
  return all[0] ?? null;
}

export async function listCalculationsForOutputBatchAction(outputBatchId: string) {
  const org = await requireActiveOrg();
  return listCalculationsForBatch(org.organizationId, outputBatchId);
}

export async function getCalculationDetailAction(calculationId: string) {
  const org = await requireActiveOrg();
  return getCalculationDetail(org.organizationId, calculationId);
}

/** Lotes de salida con su estado de trazabilidad y su último cálculo. */
export async function listOutputBatchesForCalculationAction() {
  const org = await requireActiveOrg();
  const [batches, completeness, latest] = await Promise.all([
    listOutputBatches(org.organizationId),
    getCompleteness(org.organizationId),
    listLatestCalculations(org.organizationId),
  ]);
  const completenessByBatch = new Map(completeness.map((c) => [c.output_batch_id, c]));
  const latestByBatch = new Map(latest.map((l) => [l.output_batch_id, l]));
  return batches.map((b) => ({
    batch: b,
    completeness: completenessByBatch.get(b.id) ?? null,
    latestCalculation: latestByBatch.get(b.id) ?? null,
  }));
}

export async function getRecycledContentDashboardAction() {
  const org = await requireActiveOrg();
  return getRecycledDashboard(org.organizationId);
}

export async function getRecycledByOrderAction() {
  const org = await requireActiveOrg();
  return getRecycledByOrder(org.organizationId);
}

export async function getRecycledByProductAction() {
  const org = await requireActiveOrg();
  return getRecycledByProduct(org.organizationId);
}

export async function getRecycledByFamilyAction() {
  const org = await requireActiveOrg();
  return getRecycledByFamily(org.organizationId);
}

export async function getRecycledByPeriodAction() {
  const org = await requireActiveOrg();
  return getRecycledByPeriod(org.organizationId);
}
