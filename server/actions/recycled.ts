"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { checkCprCanMutate } from "@/server/actions/module-plans";
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
import { normalizeVisibleText } from "@/lib/domain/nomenclature";


/**
 * Mensajes que la RPC lanza a propósito (validaciones de negocio): se
 * muestran tal cual. Cualquier otro error de BD se traduce a algo entendible.
 *
 * ⚠️ RH-01.3: estas cadenas son el TEXTO TÉCNICO que emite la RPC y sirven
 * para reconocerla — NO son texto visible y no deben renombrarse. La
 * denominación oficial se aplica al mostrar el mensaje (normalizeVisibleText).
 */
const KNOWN_RPC_MESSAGES = [
  "Se requiere una sesión activa",
  "El lote de salida no existe",
  "No eres miembro activo",
  "Tu rol no permite calcular",
  "Solo se puede calcular con la metodología canónica",
  "No existe la metodología canónica",
];

// ===========================================================================
// 0147 · Aquí vivía `calculateRecycledContentAction`, la puerta al segundo
// motor. PT-02A la había cerrado con una bandera; 0147 borra la función de la
// base que llamaba, así que la acción no tendría ya a quién llamar. Se retira
// entera en vez de dejarla como muñón: una acción de servidor exportada que no
// hace nada es una invitación a que alguien la vuelva a cablear.
//
// Los cálculos que aquella metodología emitió eran fixtures de desarrollo y
// QA. Ninguna empresa real la usó, y Production nunca recibió la convivencia.
// ===========================================================================

/**
 * Calcular el contenido reciclado de un lote producido.
 *
 * El ÚNICO camino de cálculo. El nombre conserva el sufijo `V2` porque nombra
 * la versión de la metodología que ejecuta, y renombrarlo obligaría a tocar la
 * RPC de la base para no ganar nada. Lo que ya no existe es la otra.
 *
 * Un `incomplete` NO es un error: la RPC devuelve una fila con su estado y sus
 * motivos, y la pantalla los explica. Por eso aquí solo se traduce el fallo de
 * verdad —el que impide siquiera intentarlo—, y todo lo demás vuelve sin error.
 */
export async function calculateRecycledContentV2Action(
  outputBatchId: string
): Promise<{ error: string | null }> {
  const org = await requireActiveOrg();
  const mutateCheck = await checkCprCanMutate();
  if (!mutateCheck.allowed) return { error: mutateCheck.error };

  const supabase = await createServerClient();
  const { data: batch } = await supabase
    .from("output_batches")
    .select("id")
    .eq("id", outputBatchId)
    .eq("organization_id", org.organizationId)
    .maybeSingle();
  if (!batch) {
    return { error: "El lote producido / lote final no pertenece a tu empresa activa." };
  }

  const { error } = await supabase.rpc("calculate_recycled_content_v2", {
    p_output_batch_id: outputBatchId,
  });
  if (error) {
    const known = KNOWN_RPC_MESSAGES.find((m) => error.message?.includes(m));
    return {
      error: known
        ? normalizeVisibleText(error.message)
        : "No fue posible ejecutar el cálculo. Revisa los consumos de la orden.",
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

/** Lotes producidos / lotes finales con su estado de trazabilidad y su último cálculo. */
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
