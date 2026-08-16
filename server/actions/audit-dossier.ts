"use server";

/**
 * PCR-03.3 · Acciones del expediente. Generar crea SIEMPRE una versión
 * nueva (jamás sobrescribe: unicidad (org, lote, versión) + trigger de
 * inmutabilidad 0108). El código EXP-PCR-AAAA-NNNN se resuelve en servidor
 * con reintento ante colisión de secuencia. organization_id del servidor;
 * sin service_role; el snapshot no contiene signed URLs.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { createServerClient } from "@/lib/supabase/server";
import { checkCprCanMutate } from "@/server/actions/module-plans";

export type DossierActionState = { error: string | null };

export async function generateAuditDossierAction(
  _prev: DossierActionState,
  formData: FormData
): Promise<DossierActionState> {
  const org = await requireActiveOrg();
  const mutateCheck = await checkCprCanMutate();
  if (!mutateCheck.allowed) return { error: mutateCheck.error };
  // (rev. 03.1–03.3.1, hallazgo 6) Generar está RESERVADO (7.7) y se
  // comprueba en TRES capas: aquí, en la UI (el botón no se ofrece al
  // consultor) y en la BD (la RPC re-verifica el rol y el insert directo
  // está vetado por trigger).
  if (org.roleCode !== "admin" && org.roleCode !== "quality") {
    return { error: "Solo administrador o calidad pueden generar expedientes." };
  }
  const outputBatchId = String(formData.get("output_batch_id") ?? "");
  if (!outputBatchId) return { error: "Selecciona el lote producido / lote final." };
  const supabase = await createServerClient();

  // (rev. 03.1–03.3.2, hallazgo 2) La acción ya NO ensambla ni envía el
  // contenido: la RPC construye las secciones A–K desde el ejercicio
  // completado (autoritativo) y los datos reales del lote/empresa, además de
  // asignar identidad y sellos de verdad-servidor. Requiere un ejercicio de
  // trazabilidad completado del lote.
  const { data, error } = await supabase.rpc("generate_audit_dossier", {
    p_output_batch_id: outputBatchId,
  });
  if (error || !data || data.length === 0) {
    const msg = error?.message ?? "";
    if (/Ejecuta primero un ejercicio de trazabilidad/.test(msg)) {
      return { error: "Ejecuta primero un ejercicio de trazabilidad para generar el expediente." };
    }
    if (/Solo administrador o calidad/.test(msg)) {
      return { error: "Solo administrador o calidad pueden generar expedientes." };
    }
    return { error: "No fue posible generar el expediente." };
  }
  const dossierId = (data[0] as { dossier_id: string }).dossier_id;
  revalidatePath("/audit-prep/dossiers");
  redirect(`/audit-prep/dossiers/${dossierId}`);
}

export async function archiveAuditDossierAction(
  _prev: DossierActionState,
  formData: FormData
): Promise<DossierActionState> {
  const org = await requireActiveOrg();
  const mutateCheck = await checkCprCanMutate();
  if (!mutateCheck.allowed) return { error: mutateCheck.error };
  // Acción reservada (7.7): administrador o calidad/supervisión.
  if (org.roleCode !== "admin" && org.roleCode !== "quality") {
    return { error: "Solo administrador o calidad pueden archivar expedientes." };
  }
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("audit_dossiers")
    .update({ status: "archived" })
    .eq("id", String(formData.get("id") ?? ""))
    .eq("organization_id", org.organizationId)
    .select("id");
  if (error) {
    return {
      error: /versión histórica|solo puede archivarse/.test(error.message ?? "")
        ? error.message
        : "No fue posible archivar el expediente.",
    };
  }
  if ((data ?? []).length === 0) return { error: "No se encontró el expediente." };
  revalidatePath("/audit-prep/dossiers");
  return { error: null };
}
