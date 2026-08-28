import "server-only";

import { createServerClient } from "@/lib/supabase/server";
import { readAllStrict } from "@/lib/db/paged-read";
import type { MovementRow } from "@/components/domain/traceability/output-movements";

/**
 * PT-02B · Los movimientos de unos lotes concretos.
 *
 * Se leen TODOS los de esos lotes, vigentes y corregidos: los corregidos no
 * son ruido, son la prueba de que la corrección conservó el original. La
 * pantalla los enseña plegados, pero tiene que tenerlos.
 */
export async function listOutputBatchMovements(
  organizationId: string,
  outputBatchIds: string[]
): Promise<Map<string, MovementRow[]>> {
  const mapa = new Map<string, MovementRow[]>();
  if (outputBatchIds.length === 0) return mapa;
  const supabase = await createServerClient();
  const rows = await readAllStrict<Record<string, unknown>>(() =>
    supabase
      .from("output_batch_movements")
      .select("id, output_batch_id, movement_kind, direction, quantity, occurred_at, reason, reference, is_current, corrects_movement_id, correction_reason")
      .eq("organization_id", organizationId)
      .in("output_batch_id", outputBatchIds)
      .order("occurred_at", { ascending: false })
      .order("id", { ascending: false })
  , "movimientos de lotes producidos");

  for (const r of rows) {
    const id = r.output_batch_id as string;
    const fila: MovementRow = {
      id: r.id as string,
      kind: r.movement_kind as string,
      direction: r.direction as string,
      quantity: Number(r.quantity ?? 0),
      occurredAt: r.occurred_at as string,
      reason: (r.reason as string | null) ?? null,
      reference: (r.reference as string | null) ?? null,
      isCurrent: Boolean(r.is_current),
      correctsMovementId: (r.corrects_movement_id as string | null) ?? null,
      correctionReason: (r.correction_reason as string | null) ?? null,
    };
    mapa.set(id, [...(mapa.get(id) ?? []), fila]);
  }
  return mapa;
}
