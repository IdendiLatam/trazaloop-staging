import "server-only";
import { createServerClient } from "@/lib/supabase/server";

/**
 * Trazaloop · PE-05B6E · Qué le pasa a lo que ya tienes guardado.
 *
 * Bajar de plan NUNCA borra nada. Pero puede dejar a la empresa por encima del
 * espacio incluido en el plan nuevo, y eso hay que decírselo ANTES de
 * confirmar, con las dos cifras delante: lo que ocupa hoy y lo que incluye el
 * plan de destino. Descubrirlo después sería una emboscada.
 */

export type StorageImpact = {
  usedBytes: number;
  currentQuotaBytes: number | null;
  targetQuotaBytes: number | null;
  /** Con el plan de destino, la empresa quedaría por encima de su espacio. */
  wouldBeOverLimit: boolean;
};

export async function storageImpactOf(
  organizationId: string, targetPlanRevisionId: string | null
): Promise<StorageImpact | null> {
  const supabase = await createServerClient();
  const { data: estado, error } = await supabase.rpc("organization_storage_status",
    { p_organization_id: organizationId });
  if (error || !estado) return null;
  const e = estado as Record<string, unknown>;
  // Sin capacidad comprobable no se afirma nada: ni «cabe» ni «no cabe».
  if (e.state === "QUOTA_UNAVAILABLE") return null;

  const usado = Number(e.used_bytes ?? 0);
  const actual = e.quota_bytes === null || e.quota_bytes === undefined
    ? null : Number(e.quota_bytes);

  let destino: number | null = null;
  if (targetPlanRevisionId) {
    const { data: lim } = await supabase.rpc("plan_limit_for_revision", {
      p_plan_revision_id: targetPlanRevisionId, p_resource_code: "storage_bytes" });
    const l = (lim ?? {}) as Record<string, unknown>;
    if (l.status === "finite") destino = Number(l.value);
    else if (l.status === "unlimited") destino = null;
    else return { usedBytes: usado, currentQuotaBytes: actual,
                  targetQuotaBytes: null, wouldBeOverLimit: false };
  }

  return {
    usedBytes: usado,
    currentQuotaBytes: actual,
    targetQuotaBytes: destino,
    wouldBeOverLimit: destino !== null && usado > destino,
  };
}
