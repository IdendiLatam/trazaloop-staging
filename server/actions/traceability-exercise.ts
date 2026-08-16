"use server";

/**
 * PCR-03.2 · Acciones del ejercicio de trazabilidad. La ejecución es
 * SÍNCRONA y de una pieza: inserta el borrador (started_by de verdad-
 * servidor por trigger) y lo completa vía la RPC controlada; la FOTOGRAFÍA
 * la construye la BASE DE DATOS desde las fuentes autoritativas (rev.
 * 03.1–03.3.2) — ni esta acción ni un cliente REST declaran el contenido
 * histórico. El trigger 0107 garantiza que nada lo reescribe después: los
 * cambios posteriores exigen un ejercicio NUEVO. organization_id SIEMPRE
 * del servidor. Sin service_role. El snapshot jamás guarda signed URLs.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { createServerClient } from "@/lib/supabase/server";
import { checkCprCanMutate } from "@/server/actions/module-plans";

export type ExerciseActionState = { error: string | null };

export async function runTraceabilityExerciseAction(
  _prev: ExerciseActionState,
  formData: FormData
): Promise<ExerciseActionState> {
  const org = await requireActiveOrg();
  const mutateCheck = await checkCprCanMutate();
  if (!mutateCheck.allowed) return { error: mutateCheck.error };
  const outputBatchId = String(formData.get("output_batch_id") ?? "");
  if (!outputBatchId) return { error: "Selecciona el lote producido / lote final." };
  const supabase = await createServerClient();

  const { data: draft, error: insertError } = await supabase
    .from("traceability_exercises")
    .insert({
      organization_id: org.organizationId,
      output_batch_id: outputBatchId,
    })
    .select("id")
    .single();
  if (insertError || !draft) {
    return { error: "No fue posible iniciar el ejercicio." };
  }

  // (rev. 03.1–03.3.2, hallazgo 1) El completado pasa por la RPC y el
  // llamador YA NO aporta la fotografía: la construye la BASE DE DATOS desde
  // las fuentes autoritativas (builder pcr_build_exercise_snapshot), deriva
  // resultado/conteos, sella completed_at = now() y calcula el source_hash
  // en servidor. Ni esta acción ni un cliente REST pueden declarar el
  // contenido histórico.
  const { error: completeError } = await supabase.rpc("complete_traceability_exercise", {
    p_exercise_id: draft.id,
  });
  if (completeError) {
    return { error: "No fue posible completar el ejercicio." };
  }
  revalidatePath("/audit-prep/exercises");
  redirect(`/audit-prep/exercises/${draft.id}`);
}

export async function archiveTraceabilityExerciseAction(
  _prev: ExerciseActionState,
  formData: FormData
): Promise<ExerciseActionState> {
  const org = await requireActiveOrg();
  const mutateCheck = await checkCprCanMutate();
  if (!mutateCheck.allowed) return { error: mutateCheck.error };
  // (rev. 03.1–03.3.2, hallazgo 4) Acción reservada en TRES capas: la UI ya
  // oculta el botón, aquí se comprueba el rol y la BD lo re-verifica ante un
  // UPDATE directo vía REST.
  if (org.roleCode !== "admin" && org.roleCode !== "quality") {
    return { error: "Solo administrador o calidad pueden archivar ejercicios." };
  }
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("traceability_exercises")
    .update({ status: "archived" })
    .eq("id", String(formData.get("id") ?? ""))
    .eq("organization_id", org.organizationId)
    .select("id");
  if (error) {
    return {
      error: /fotografía histórica|solo puede archivarse/.test(error.message ?? "")
        ? error.message
        : "No fue posible archivar el ejercicio.",
    };
  }
  if ((data ?? []).length === 0) return { error: "No se encontró el ejercicio." };
  revalidatePath("/audit-prep/exercises");
  return { error: null };
}
