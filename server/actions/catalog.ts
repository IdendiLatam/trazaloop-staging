"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { requireActiveOrg } from "@/lib/auth/require-active-org";

export type CatalogActionState = { error: string | null };

const GENERIC_ERROR = "No fue posible guardar. Verifica los datos e intenta de nuevo.";
const DUPLICATE_HINT = "Ya existe un registro con ese nombre o código en tu empresa.";

function errMessage(error: { code?: string } | null): string {
  return error?.code === "23505" ? DUPLICATE_HINT : GENERIC_ERROR;
}

// ---------------------------------------------------------------------------
// Proveedores
// ---------------------------------------------------------------------------
export async function upsertSupplierAction(
  _prev: CatalogActionState,
  formData: FormData
): Promise<CatalogActionState> {
  const org = await requireActiveOrg();
  const supabase = await createServerClient();

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const taxId = String(formData.get("tax_id") ?? "").trim() || null;
  const contact = String(formData.get("contact") ?? "").trim() || null;

  if (!name) return { error: "El nombre del proveedor es obligatorio." };

  const payload = { name, tax_id: taxId, contact };
  const { error } = id
    ? await supabase
        .from("suppliers")
        .update(payload)
        .eq("id", id)
        .eq("organization_id", org.organizationId)
    : await supabase
        .from("suppliers")
        .insert({ ...payload, organization_id: org.organizationId });

  if (error) return { error: errMessage(error) };
  revalidatePath("/catalog/suppliers");
  return { error: null };
}

export async function deleteSupplierAction(formData: FormData) {
  const org = await requireActiveOrg();
  const supabase = await createServerClient();
  await supabase
    .from("suppliers")
    .delete()
    .eq("id", String(formData.get("id") ?? ""))
    .eq("organization_id", org.organizationId);
  revalidatePath("/catalog/suppliers");
}

// ---------------------------------------------------------------------------
// Familias
// ---------------------------------------------------------------------------
export async function upsertFamilyAction(
  _prev: CatalogActionState,
  formData: FormData
): Promise<CatalogActionState> {
  const org = await requireActiveOrg();
  const supabase = await createServerClient();

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;

  if (!name) return { error: "El nombre de la familia es obligatorio." };

  const payload = { name, description };
  const { error } = id
    ? await supabase
        .from("product_families")
        .update(payload)
        .eq("id", id)
        .eq("organization_id", org.organizationId)
    : await supabase
        .from("product_families")
        .insert({ ...payload, organization_id: org.organizationId });

  if (error) return { error: errMessage(error) };
  revalidatePath("/catalog/families");
  return { error: null };
}

export async function deleteFamilyAction(formData: FormData) {
  const org = await requireActiveOrg();
  const supabase = await createServerClient();
  await supabase
    .from("product_families")
    .delete()
    .eq("id", String(formData.get("id") ?? ""))
    .eq("organization_id", org.organizationId);
  revalidatePath("/catalog/families");
}

// ---------------------------------------------------------------------------
// Productos
// ---------------------------------------------------------------------------
export async function upsertProductAction(
  _prev: CatalogActionState,
  formData: FormData
): Promise<CatalogActionState> {
  const org = await requireActiveOrg();
  const supabase = await createServerClient();

  const id = String(formData.get("id") ?? "");
  const code = String(formData.get("code") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const familyId = String(formData.get("family_id") ?? "") || null;
  const declaredRaw = String(formData.get("declared_recycled_percent") ?? "").trim();

  if (!code || !name) return { error: "Código y nombre son obligatorios." };

  let declared: number | null = null;
  if (declaredRaw !== "") {
    declared = Number(declaredRaw);
    if (Number.isNaN(declared) || declared < 0 || declared > 100) {
      return { error: "El contenido reciclado declarado debe estar entre 0 y 100." };
    }
  }

  const payload = {
    code,
    name,
    family_id: familyId,
    declared_recycled_percent: declared,
  };
  const { error } = id
    ? await supabase
        .from("products")
        .update(payload)
        .eq("id", id)
        .eq("organization_id", org.organizationId)
    : await supabase
        .from("products")
        .insert({ ...payload, organization_id: org.organizationId });

  if (error) return { error: errMessage(error) };
  revalidatePath("/catalog/products");
  return { error: null };
}

export async function deleteProductAction(formData: FormData) {
  const org = await requireActiveOrg();
  const supabase = await createServerClient();
  await supabase
    .from("products")
    .delete()
    .eq("id", String(formData.get("id") ?? ""))
    .eq("organization_id", org.organizationId);
  revalidatePath("/catalog/products");
}

// ---------------------------------------------------------------------------
// Materiales
// ---------------------------------------------------------------------------
export async function upsertMaterialAction(
  _prev: CatalogActionState,
  formData: FormData
): Promise<CatalogActionState> {
  const org = await requireActiveOrg();
  const supabase = await createServerClient();

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const classification = String(formData.get("classification_code") ?? "").trim();

  if (!name || !classification) {
    return { error: "Nombre y clasificación son obligatorios." };
  }

  const payload = { name, classification_code: classification };
  const { error } = id
    ? await supabase
        .from("materials")
        .update(payload)
        .eq("id", id)
        .eq("organization_id", org.organizationId)
    : await supabase
        .from("materials")
        .insert({ ...payload, organization_id: org.organizationId });

  if (error) return { error: errMessage(error) };
  revalidatePath("/catalog/materials");
  return { error: null };
}

export async function deleteMaterialAction(formData: FormData) {
  const org = await requireActiveOrg();
  const supabase = await createServerClient();
  await supabase
    .from("materials")
    .delete()
    .eq("id", String(formData.get("id") ?? ""))
    .eq("organization_id", org.organizationId);
  revalidatePath("/catalog/materials");
}

/**
 * Reclasifica un material postindustrial a preconsumo válido.
 * Exige justificación + evidencia; el TRIGGER de base de datos verifica el
 * rol (solo admin/quality), el destino permitido y registra el evento.
 * Un consultant recibirá el error del trigger aunque manipule la UI.
 */
export async function reclassifyMaterialAction(
  _prev: CatalogActionState,
  formData: FormData
): Promise<CatalogActionState> {
  const org = await requireActiveOrg();
  const supabase = await createServerClient();

  const id = String(formData.get("id") ?? "");
  const toCode = String(formData.get("reclassified_to_code") ?? "").trim();
  const justification = String(formData.get("justification") ?? "").trim();
  const evidenceId = String(formData.get("evidence_id") ?? "").trim();

  if (!id || !toCode) return { error: "Datos de reclasificación incompletos." };
  if (!justification) {
    return { error: "La reclasificación exige una justificación normativa." };
  }
  if (!evidenceId) {
    return { error: "La reclasificación exige una evidencia de soporte." };
  }

  const { error } = await supabase
    .from("materials")
    .update({
      reclassified_to_code: toCode,
      reclassification_justification: justification,
      reclassification_evidence_id: evidenceId,
    })
    .eq("id", id)
    .eq("organization_id", org.organizationId);

  if (error) {
    return {
      error:
        "No fue posible reclasificar. Solo administrador o calidad pueden hacerlo, con justificación y evidencia de la misma empresa.",
    };
  }

  revalidatePath("/catalog/materials");
  return { error: null };
}
