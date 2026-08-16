"use server";

/**
 * PCR-03.1 · Acuerdos / requisitos de cliente (5.4) — modelo mínimo, sin
 * CRM. organization_id SIEMPRE del servidor (organización activa), nunca
 * del cliente. Los vínculos a producto/lote producido/orden se resuelven
 * POR CÓDIGO en servidor (consultas puntuales acotadas al tenant), y la BD
 * revalida el destino con su propio trigger (0106): anti cross-tenant en
 * dos capas. RLS: miembros gestionan; eliminar queda para admin/quality.
 */
import { revalidatePath } from "next/cache";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { createServerClient } from "@/lib/supabase/server";
import { checkCprCanMutate } from "@/server/actions/module-plans";

export type RequirementActionState = { error: string | null };

const PATH = "/catalog/customer-requirements";

export async function createCustomerRequirementAction(
  _prev: RequirementActionState,
  formData: FormData
): Promise<RequirementActionState> {
  const org = await requireActiveOrg();
  const mutateCheck = await checkCprCanMutate();
  if (!mutateCheck.allowed) return { error: mutateCheck.error };
  const customer = String(formData.get("customer_name") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  if (!customer || !code || !title) {
    return { error: "Cliente, código y título del acuerdo/requisito son obligatorios." };
  }
  const supabase = await createServerClient();
  const { error } = await supabase.from("customer_requirements").insert({
    organization_id: org.organizationId,
    customer_name: customer,
    code,
    title,
    description: String(formData.get("description") ?? "").trim() || null,
    starts_on: String(formData.get("starts_on") ?? "") || null,
    ends_on: String(formData.get("ends_on") ?? "") || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
  });
  if (error) {
    return {
      error:
        error.code === "23505"
          ? "Ya existe un acuerdo/requisito con ese código en tu empresa."
          : "No fue posible registrar el acuerdo/requisito.",
    };
  }
  revalidatePath(PATH);
  return { error: null };
}

export async function toggleCustomerRequirementAction(
  _prev: RequirementActionState,
  formData: FormData
): Promise<RequirementActionState> {
  const org = await requireActiveOrg();
  const mutateCheck = await checkCprCanMutate();
  if (!mutateCheck.allowed) return { error: mutateCheck.error };
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("customer_requirements")
    .update({ active: String(formData.get("active") ?? "true") === "true" })
    .eq("id", String(formData.get("id") ?? ""))
    .eq("organization_id", org.organizationId)
    .select("id");
  if (error) return { error: "No fue posible actualizar el acuerdo/requisito." };
  if ((data ?? []).length === 0) return { error: "No se encontró el acuerdo/requisito." };
  revalidatePath(PATH);
  return { error: null };
}

/** Vincula el requisito a producto / lote producido / orden RESOLVIENDO por
 *  código en servidor (bounded: una consulta puntual por vínculo). */
export async function linkCustomerRequirementAction(
  _prev: RequirementActionState,
  formData: FormData
): Promise<RequirementActionState> {
  const org = await requireActiveOrg();
  const mutateCheck = await checkCprCanMutate();
  if (!mutateCheck.allowed) return { error: mutateCheck.error };
  const requirementId = String(formData.get("requirement_id") ?? "");
  const targetType = String(formData.get("target_type") ?? "");
  const codeRaw = String(formData.get("target_code") ?? "").trim();
  if (!codeRaw) return { error: "Indica el código del registro a vincular." };
  const code = codeRaw.replace(/[%_]/g, "");
  const supabase = await createServerClient();
  let targetId: string | null = null;
  let notFound = "";
  if (targetType === "product") {
    const { data } = await supabase
      .from("products")
      .select("id")
      .eq("organization_id", org.organizationId)
      .eq("code", code)
      .maybeSingle();
    targetId = (data?.id as string | undefined) ?? null;
    notFound = "No existe un producto con ese código en tu empresa.";
  } else if (targetType === "output_batch") {
    const { data } = await supabase
      .from("output_batches")
      .select("id")
      .eq("organization_id", org.organizationId)
      .eq("batch_code", code)
      .maybeSingle();
    targetId = (data?.id as string | undefined) ?? null;
    notFound = "No existe un lote producido / lote final con ese código en tu empresa.";
  } else if (targetType === "production_order") {
    const { data } = await supabase
      .from("production_orders")
      .select("id")
      .eq("organization_id", org.organizationId)
      .eq("order_code", code)
      .maybeSingle();
    targetId = (data?.id as string | undefined) ?? null;
    notFound = "No existe una orden / corrida con ese código en tu empresa.";
  } else {
    return { error: "Tipo de destino no reconocido." };
  }
  if (!targetId) return { error: notFound };
  const { error } = await supabase.from("customer_requirement_links").insert({
    organization_id: org.organizationId,
    requirement_id: requirementId,
    target_type: targetType,
    target_id: targetId,
  });
  if (error) {
    return {
      error:
        error.code === "23505"
          ? "Ese vínculo ya existe."
          : "No fue posible crear el vínculo (verifica que el acuerdo/requisito pertenezca a tu empresa).",
    };
  }
  revalidatePath(PATH);
  return { error: null };
}

export async function unlinkCustomerRequirementAction(
  _prev: RequirementActionState,
  formData: FormData
): Promise<RequirementActionState> {
  const org = await requireActiveOrg();
  const mutateCheck = await checkCprCanMutate();
  if (!mutateCheck.allowed) return { error: mutateCheck.error };
  const supabase = await createServerClient();
  const { error } = await supabase
    .from("customer_requirement_links")
    .delete()
    .eq("id", String(formData.get("id") ?? ""))
    .eq("organization_id", org.organizationId);
  if (error) return { error: "No fue posible quitar el vínculo." };
  revalidatePath(PATH);
  return { error: null };
}
