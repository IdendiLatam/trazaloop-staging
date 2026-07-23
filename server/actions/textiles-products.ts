"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { requireTextilesForAction } from "@/lib/auth/require-textiles-module";
import { checkTextilesCanMutate, checkTextilesResourceLimit } from "@/server/actions/module-plans";
import {
  textileCollectionBelongsToOrg,
  textileProductBelongsToOrg,
  textileReferenceBelongsToOrg,
  textileMaterialBelongsToOrg,
  textileComponentBelongsToOrg,
} from "@/lib/db/textiles-products";
import { textileFiberTypeIsActive } from "@/lib/db/textiles-catalogs";
import {
  TEXTILE_COLLECTION_STATUSES,
  TEXTILE_PRODUCT_CATEGORIES,
  TEXTILE_PRODUCT_STATUSES,
  TEXTILE_FIBER_SCOPES,
  TEXTILE_REFERENCE_MATERIAL_ROLES,
  TEXTILE_REFERENCE_COMPONENT_ROLES,
  computeReferenceComposition,
  parsePercentage,
} from "@/lib/domain/textiles-products";
import {
  TEXTILE_SEPARABILITY_VALUES,
  validateCatalogName,
  cleanText,
  isOneOf,
} from "@/lib/domain/textiles-catalogs";

/**
 * Trazaloop · Sprint T4 (Textil) · Server actions de productos,
 * referencias y composición estructurada.
 *
 * Mismo contrato de seguridad que los catálogos T3: triple guarda del
 * módulo + modo solo lectura de plataforma + validación de dominio antes
 * de la BD + organization_id SIEMPRE del servidor + relaciones verificadas
 * dentro de la MISMA empresa (y re-verificadas por FK compuesta y RLS de
 * 0074) + mensajes de error seguros. Nada usa service_role.
 *
 * El estado de composición de la referencia se RECALCULA en servidor tras
 * cada mutación de fibras (función pura de dominio); es un campo
 * informativo de completitud — nunca de cumplimiento — y la página de
 * detalle además recalcula en vivo desde las filas.
 */

export type TextileProductsActionState = { error: string | null };

const UNIQUE_VIOLATION = "23505";
const PRODUCTS_PATH = "/textiles/products";
const REFERENCES_PATH = "/textiles/references";

function isUniqueViolation(error: { code?: string } | null): boolean {
  return Boolean(error && error.code === UNIQUE_VIOLATION);
}

type GateOk = { organizationId: string };

async function gate(): Promise<{ ok: GateOk | null; error: string | null }> {
  const access = await requireTextilesForAction();
  if (access.org === null) return { ok: null, error: access.error };
  const mutateCheck = await checkTextilesCanMutate();
  if (!mutateCheck.allowed) return { ok: null, error: mutateCheck.error };
  return { ok: { organizationId: access.org.organizationId }, error: null };
}

async function currentUserId(): Promise<string | null> {
  const supabase = await createServerClient();
  return (await supabase.auth.getUser()).data.user?.id ?? null;
}

function revalidateProductPaths(referenceId?: string) {
  revalidatePath(PRODUCTS_PATH);
  revalidatePath("/textiles");
  if (referenceId) revalidatePath(`${REFERENCES_PATH}/${referenceId}`);
}

// ---------------------------------------------------------------------------
// Colecciones / líneas
// ---------------------------------------------------------------------------

export type TextileCollectionInput = {
  name: string;
  code?: string;
  season?: string;
  year?: string;
  customerOrProgram?: string;
  status?: string;
  description?: string;
  notes?: string;
};

function validateCollectionInput(input: TextileCollectionInput):
  | { row: Record<string, unknown>; error: null }
  | { row: null; error: string } {
  const name = validateCatalogName(input.name);
  if (name.error) return { row: null, error: name.error };
  const status = cleanText(input.status) ?? "active";
  if (!isOneOf(TEXTILE_COLLECTION_STATUSES, status)) {
    return { row: null, error: "Estado de colección no válido." };
  }
  let year: number | null = null;
  const yearText = cleanText(input.year);
  if (yearText) {
    year = Number(yearText);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return { row: null, error: "El año debe ser un entero entre 2000 y 2100." };
    }
  }
  return {
    row: {
      name: name.name,
      code: cleanText(input.code),
      season: cleanText(input.season),
      year,
      customer_or_program: cleanText(input.customerOrProgram),
      status,
      description: cleanText(input.description),
      notes: cleanText(input.notes),
    },
    error: null,
  };
}

export async function createTextileCollectionAction(
  input: TextileCollectionInput
): Promise<TextileProductsActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const validated = validateCollectionInput(input);
  if (validated.row === null) return { error: validated.error };

  const supabase = await createServerClient();
  const { error } = await supabase.from("textile_collections").insert({
    organization_id: g.ok.organizationId,
    ...validated.row,
  });
  if (isUniqueViolation(error)) return { error: "Ya existe una colección con ese nombre o código." };
  if (error) return { error: "No fue posible crear la colección." };
  revalidateProductPaths();
  return { error: null };
}

export async function updateTextileCollectionAction(
  id: string,
  input: TextileCollectionInput
): Promise<TextileProductsActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const validated = validateCollectionInput(input);
  if (validated.row === null) return { error: validated.error };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("textile_collections")
    .update({ ...validated.row, updated_by: await currentUserId() })
    .eq("id", id)
    .eq("organization_id", g.ok.organizationId);
  if (isUniqueViolation(error)) return { error: "Ya existe una colección con ese nombre o código." };
  if (error) return { error: "No fue posible actualizar la colección." };
  revalidateProductPaths();
  return { error: null };
}

export async function setTextileCollectionActiveAction(
  id: string,
  isActive: boolean
): Promise<TextileProductsActionState> {
  return setActive("textile_collections", id, isActive, "la colección");
}

// ---------------------------------------------------------------------------
// Productos
// ---------------------------------------------------------------------------

export type TextileProductInput = {
  name: string;
  productCode?: string;
  category: string;
  collectionId?: string;
  intendedUse?: string;
  targetMarket?: string;
  status?: string;
  description?: string;
  notes?: string;
};

async function validateProductInput(
  organizationId: string,
  input: TextileProductInput
): Promise<{ row: Record<string, unknown>; error: null } | { row: null; error: string }> {
  const name = validateCatalogName(input.name);
  if (name.error) return { row: null, error: name.error };
  if (!isOneOf(TEXTILE_PRODUCT_CATEGORIES, input.category)) {
    return { row: null, error: "Categoría de producto no válida." };
  }
  const status = input.status ?? "draft";
  if (!isOneOf(TEXTILE_PRODUCT_STATUSES, status)) {
    return { row: null, error: "Estado de producto no válido." };
  }
  const collectionId = cleanText(input.collectionId);
  if (collectionId && !(await textileCollectionBelongsToOrg(organizationId, collectionId))) {
    return { row: null, error: "La colección seleccionada no es válida." };
  }
  return {
    row: {
      name: name.name,
      product_code: cleanText(input.productCode),
      category: input.category,
      collection_id: collectionId,
      intended_use: cleanText(input.intendedUse),
      target_market: cleanText(input.targetMarket),
      status,
      description: cleanText(input.description),
      notes: cleanText(input.notes),
    },
    error: null,
  };
}

export async function createTextileProductAction(
  input: TextileProductInput
): Promise<TextileProductsActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  // T9F.2 · Bloqueador 1: límite del plan del MÓDULO Textiles ANTES del
  // INSERT (conteo real en BD vía check_module_resource_allowance; Demo
  // limitado, Full/Extra ilimitados; fail-closed si no puede verificarse).
  const limitCheck = await checkTextilesResourceLimit("products");
  if (!limitCheck.allowed) return { error: limitCheck.error };
  const validated = await validateProductInput(g.ok.organizationId, input);
  if (validated.row === null) return { error: validated.error };

  const supabase = await createServerClient();
  const { error } = await supabase.from("textile_products").insert({
    organization_id: g.ok.organizationId,
    ...validated.row,
  });
  if (isUniqueViolation(error)) return { error: "Ya existe un producto con ese código." };
  if (error) return { error: "No fue posible crear el producto." };
  revalidateProductPaths();
  return { error: null };
}

export async function updateTextileProductAction(
  id: string,
  input: TextileProductInput
): Promise<TextileProductsActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const validated = await validateProductInput(g.ok.organizationId, input);
  if (validated.row === null) return { error: validated.error };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("textile_products")
    .update({ ...validated.row, updated_by: await currentUserId() })
    .eq("id", id)
    .eq("organization_id", g.ok.organizationId);
  if (isUniqueViolation(error)) return { error: "Ya existe un producto con ese código." };
  if (error) return { error: "No fue posible actualizar el producto." };
  revalidateProductPaths();
  revalidatePath(`${PRODUCTS_PATH}/${id}`);
  return { error: null };
}

export async function setTextileProductActiveAction(
  id: string,
  isActive: boolean
): Promise<TextileProductsActionState> {
  return setActive("textile_products", id, isActive, "el producto");
}

// ---------------------------------------------------------------------------
// Referencias / SKU
// ---------------------------------------------------------------------------

export type TextileReferenceInput = {
  sku: string;
  name?: string;
  productId: string;
  versionLabel?: string;
  color?: string;
  sizeRange?: string;
  genderOrFit?: string;
  status?: string;
  description?: string;
  notes?: string;
};

async function validateReferenceInput(
  organizationId: string,
  input: TextileReferenceInput
): Promise<{ row: Record<string, unknown>; error: null } | { row: null; error: string }> {
  const sku = cleanText(input.sku);
  if (!sku) return { row: null, error: "El SKU es obligatorio." };
  if (sku.length > 120) return { row: null, error: "El SKU es demasiado largo (máx. 120)." };
  const status = input.status ?? "draft";
  if (!isOneOf(TEXTILE_PRODUCT_STATUSES, status)) {
    return { row: null, error: "Estado de referencia no válido." };
  }
  const productId = cleanText(input.productId);
  if (!productId || !(await textileProductBelongsToOrg(organizationId, productId))) {
    return { row: null, error: "El producto seleccionado no es válido." };
  }
  return {
    row: {
      sku,
      name: cleanText(input.name),
      product_id: productId,
      version_label: cleanText(input.versionLabel),
      color: cleanText(input.color),
      size_range: cleanText(input.sizeRange),
      gender_or_fit: cleanText(input.genderOrFit),
      status,
      description: cleanText(input.description),
      notes: cleanText(input.notes),
    },
    error: null,
  };
}

export async function createTextileReferenceAction(
  input: TextileReferenceInput
): Promise<TextileProductsActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const validated = await validateReferenceInput(g.ok.organizationId, input);
  if (validated.row === null) return { error: validated.error };

  const supabase = await createServerClient();
  const { error } = await supabase.from("textile_references").insert({
    organization_id: g.ok.organizationId,
    ...validated.row,
  });
  if (isUniqueViolation(error)) return { error: "Ya existe una referencia con ese SKU." };
  if (error) return { error: "No fue posible crear la referencia." };
  revalidateProductPaths();
  revalidatePath(`${PRODUCTS_PATH}/${validated.row.product_id as string}`);
  return { error: null };
}

export async function updateTextileReferenceAction(
  id: string,
  input: TextileReferenceInput
): Promise<TextileProductsActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const validated = await validateReferenceInput(g.ok.organizationId, input);
  if (validated.row === null) return { error: validated.error };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("textile_references")
    .update({ ...validated.row, updated_by: await currentUserId() })
    .eq("id", id)
    .eq("organization_id", g.ok.organizationId);
  if (isUniqueViolation(error)) return { error: "Ya existe una referencia con ese SKU." };
  if (error) return { error: "No fue posible actualizar la referencia." };
  revalidateProductPaths(id);
  return { error: null };
}

export async function setTextileReferenceActiveAction(
  id: string,
  isActive: boolean
): Promise<TextileProductsActionState> {
  return setActive("textile_references", id, isActive, "la referencia");
}

// ---------------------------------------------------------------------------
// Composición de fibras
// ---------------------------------------------------------------------------

export type ReferenceFiberInput = {
  fiberTypeId: string;
  percentage: string;
  scope?: string;
  sourceMaterialId?: string;
  isRecycledDeclared?: boolean;
  isOrganicDeclared?: boolean;
  notes?: string;
};

async function validateFiberInput(
  organizationId: string,
  input: ReferenceFiberInput
): Promise<{ row: Record<string, unknown>; error: null } | { row: null; error: string }> {
  const fiberTypeId = cleanText(input.fiberTypeId);
  if (!fiberTypeId || !(await textileFiberTypeIsActive(organizationId, fiberTypeId))) {
    return { row: null, error: "El tipo de fibra seleccionado no es válido o está inactivo." };
  }
  const pct = parsePercentage(input.percentage);
  if (pct.value === null) return { row: null, error: pct.error };
  const scope = cleanText(input.scope) ?? "whole_product";
  if (!isOneOf(TEXTILE_FIBER_SCOPES, scope)) {
    return { row: null, error: "Alcance de composición no válido." };
  }
  const sourceMaterialId = cleanText(input.sourceMaterialId);
  if (sourceMaterialId && !(await textileMaterialBelongsToOrg(organizationId, sourceMaterialId))) {
    return { row: null, error: "El material fuente seleccionado no es válido." };
  }
  return {
    row: {
      fiber_type_id: fiberTypeId,
      percentage: pct.value,
      component_scope: scope,
      source_material_id: sourceMaterialId,
      is_recycled_declared: Boolean(input.isRecycledDeclared),
      is_organic_declared: Boolean(input.isOrganicDeclared),
      notes: cleanText(input.notes),
    },
    error: null,
  };
}

/** Recalcula y persiste el estado de completitud de la composición. */
async function recalcCompositionStatus(
  organizationId: string,
  referenceId: string
): Promise<void> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("textile_reference_fiber_composition")
    .select("component_scope, percentage")
    .eq("organization_id", organizationId)
    .eq("reference_id", referenceId);
  const evaluation = computeReferenceComposition(
    (data ?? []).map((r) => ({
      scope: r.component_scope as string,
      percentage: Number(r.percentage),
    }))
  );
  await supabase
    .from("textile_references")
    .update({ composition_status: evaluation.status, updated_by: await currentUserId() })
    .eq("id", referenceId)
    .eq("organization_id", organizationId);
}

export async function addReferenceFiberAction(
  referenceId: string,
  input: ReferenceFiberInput
): Promise<TextileProductsActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!(await textileReferenceBelongsToOrg(g.ok.organizationId, referenceId))) {
    return { error: "La referencia no existe o no pertenece a tu organización." };
  }
  const validated = await validateFiberInput(g.ok.organizationId, input);
  if (validated.row === null) return { error: validated.error };

  const supabase = await createServerClient();
  const { error } = await supabase.from("textile_reference_fiber_composition").insert({
    organization_id: g.ok.organizationId,
    reference_id: referenceId,
    ...validated.row,
  });
  if (isUniqueViolation(error)) {
    return { error: "Esa fibra ya está registrada en ese alcance: edítala o elimínala." };
  }
  if (error) return { error: "No fue posible registrar la fibra." };
  await recalcCompositionStatus(g.ok.organizationId, referenceId);
  revalidateProductPaths(referenceId);
  return { error: null };
}

export async function updateReferenceFiberAction(
  rowId: string,
  referenceId: string,
  input: ReferenceFiberInput
): Promise<TextileProductsActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const validated = await validateFiberInput(g.ok.organizationId, input);
  if (validated.row === null) return { error: validated.error };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("textile_reference_fiber_composition")
    .update({ ...validated.row, updated_by: await currentUserId() })
    .eq("id", rowId)
    .eq("organization_id", g.ok.organizationId)
    .eq("reference_id", referenceId);
  if (isUniqueViolation(error)) {
    return { error: "Esa fibra ya está registrada en ese alcance." };
  }
  if (error) return { error: "No fue posible actualizar la fibra." };
  await recalcCompositionStatus(g.ok.organizationId, referenceId);
  revalidateProductPaths(referenceId);
  return { error: null };
}

export async function removeReferenceFiberAction(
  rowId: string,
  referenceId: string
): Promise<TextileProductsActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("textile_reference_fiber_composition")
    .delete()
    .eq("id", rowId)
    .eq("organization_id", g.ok.organizationId)
    .eq("reference_id", referenceId)
    .select("id");
  if (error || !data || data.length === 0) {
    return { error: "No fue posible eliminar la fibra (verifica tu rol en la organización)." };
  }
  await recalcCompositionStatus(g.ok.organizationId, referenceId);
  revalidateProductPaths(referenceId);
  return { error: null };
}

// ---------------------------------------------------------------------------
// Materiales asociados a la referencia
// ---------------------------------------------------------------------------

export type ReferenceMaterialInput = {
  materialId: string;
  role: string;
  estimatedPercentage?: string;
  quantityDescription?: string;
  notes?: string;
};

async function validateReferenceMaterialInput(
  organizationId: string,
  input: ReferenceMaterialInput
): Promise<{ row: Record<string, unknown>; error: null } | { row: null; error: string }> {
  const materialId = cleanText(input.materialId);
  if (!materialId || !(await textileMaterialBelongsToOrg(organizationId, materialId))) {
    return { row: null, error: "El material seleccionado no es válido." };
  }
  if (!isOneOf(TEXTILE_REFERENCE_MATERIAL_ROLES, input.role)) {
    return { row: null, error: "Rol de material no válido." };
  }
  let pct: number | null = null;
  const pctText = cleanText(input.estimatedPercentage);
  if (pctText) {
    const parsed = parsePercentage(pctText);
    if (parsed.value === null) return { row: null, error: parsed.error };
    pct = parsed.value;
  }
  return {
    row: {
      material_id: materialId,
      role: input.role,
      estimated_percentage: pct,
      quantity_description: cleanText(input.quantityDescription),
      notes: cleanText(input.notes),
    },
    error: null,
  };
}

export async function addReferenceMaterialAction(
  referenceId: string,
  input: ReferenceMaterialInput
): Promise<TextileProductsActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!(await textileReferenceBelongsToOrg(g.ok.organizationId, referenceId))) {
    return { error: "La referencia no existe o no pertenece a tu organización." };
  }
  const validated = await validateReferenceMaterialInput(g.ok.organizationId, input);
  if (validated.row === null) return { error: validated.error };

  const supabase = await createServerClient();
  const { error } = await supabase.from("textile_reference_materials").insert({
    organization_id: g.ok.organizationId,
    reference_id: referenceId,
    ...validated.row,
  });
  if (isUniqueViolation(error)) {
    return { error: "Ese material ya está asociado con ese rol." };
  }
  if (error) return { error: "No fue posible asociar el material." };
  revalidateProductPaths(referenceId);
  return { error: null };
}

export async function updateReferenceMaterialAction(
  rowId: string,
  referenceId: string,
  input: ReferenceMaterialInput
): Promise<TextileProductsActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const validated = await validateReferenceMaterialInput(g.ok.organizationId, input);
  if (validated.row === null) return { error: validated.error };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("textile_reference_materials")
    .update({ ...validated.row, updated_by: await currentUserId() })
    .eq("id", rowId)
    .eq("organization_id", g.ok.organizationId)
    .eq("reference_id", referenceId);
  if (isUniqueViolation(error)) {
    return { error: "Ese material ya está asociado con ese rol." };
  }
  if (error) return { error: "No fue posible actualizar la asociación." };
  revalidateProductPaths(referenceId);
  return { error: null };
}

export async function removeReferenceMaterialAction(
  rowId: string,
  referenceId: string
): Promise<TextileProductsActionState> {
  return removeAssociation("textile_reference_materials", rowId, referenceId, "el material asociado");
}

// ---------------------------------------------------------------------------
// Avíos/componentes asociados a la referencia
// ---------------------------------------------------------------------------

export type ReferenceComponentInput = {
  componentId: string;
  role: string;
  quantityDescription?: string;
  separabilityOverride?: string;
  replacementPossibleOverride?: boolean;
  notes?: string;
};

async function validateReferenceComponentInput(
  organizationId: string,
  input: ReferenceComponentInput
): Promise<{ row: Record<string, unknown>; error: null } | { row: null; error: string }> {
  const componentId = cleanText(input.componentId);
  if (!componentId || !(await textileComponentBelongsToOrg(organizationId, componentId))) {
    return { row: null, error: "El componente seleccionado no es válido." };
  }
  if (!isOneOf(TEXTILE_REFERENCE_COMPONENT_ROLES, input.role)) {
    return { row: null, error: "Rol de componente no válido." };
  }
  const separability = cleanText(input.separabilityOverride);
  if (separability && !isOneOf(TEXTILE_SEPARABILITY_VALUES, separability)) {
    return { row: null, error: "Valor de separabilidad no válido." };
  }
  return {
    row: {
      component_id: componentId,
      role: input.role,
      quantity_description: cleanText(input.quantityDescription),
      separability_override: separability,
      replacement_possible_override:
        typeof input.replacementPossibleOverride === "boolean"
          ? input.replacementPossibleOverride
          : null,
      notes: cleanText(input.notes),
    },
    error: null,
  };
}

export async function addReferenceComponentAction(
  referenceId: string,
  input: ReferenceComponentInput
): Promise<TextileProductsActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!(await textileReferenceBelongsToOrg(g.ok.organizationId, referenceId))) {
    return { error: "La referencia no existe o no pertenece a tu organización." };
  }
  const validated = await validateReferenceComponentInput(g.ok.organizationId, input);
  if (validated.row === null) return { error: validated.error };

  const supabase = await createServerClient();
  const { error } = await supabase.from("textile_reference_components").insert({
    organization_id: g.ok.organizationId,
    reference_id: referenceId,
    ...validated.row,
  });
  if (isUniqueViolation(error)) {
    return { error: "Ese componente ya está asociado con ese rol." };
  }
  if (error) return { error: "No fue posible asociar el componente." };
  revalidateProductPaths(referenceId);
  return { error: null };
}

export async function updateReferenceComponentAction(
  rowId: string,
  referenceId: string,
  input: ReferenceComponentInput
): Promise<TextileProductsActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const validated = await validateReferenceComponentInput(g.ok.organizationId, input);
  if (validated.row === null) return { error: validated.error };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("textile_reference_components")
    .update({ ...validated.row, updated_by: await currentUserId() })
    .eq("id", rowId)
    .eq("organization_id", g.ok.organizationId)
    .eq("reference_id", referenceId);
  if (isUniqueViolation(error)) {
    return { error: "Ese componente ya está asociado con ese rol." };
  }
  if (error) return { error: "No fue posible actualizar la asociación." };
  revalidateProductPaths(referenceId);
  return { error: null };
}

export async function removeReferenceComponentAction(
  rowId: string,
  referenceId: string
): Promise<TextileProductsActionState> {
  return removeAssociation("textile_reference_components", rowId, referenceId, "el componente asociado");
}

// ---------------------------------------------------------------------------
// Helpers comunes
// ---------------------------------------------------------------------------

async function setActive(
  table: "textile_collections" | "textile_products" | "textile_references",
  id: string,
  isActive: boolean,
  label: string
): Promise<TextileProductsActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from(table)
    .update({ is_active: isActive, updated_by: await currentUserId() })
    .eq("id", id)
    .eq("organization_id", g.ok.organizationId);
  if (error) {
    return { error: `No fue posible ${isActive ? "activar" : "desactivar"} ${label}.` };
  }
  revalidateProductPaths();
  return { error: null };
}

async function removeAssociation(
  table: "textile_reference_materials" | "textile_reference_components",
  rowId: string,
  referenceId: string,
  label: string
): Promise<TextileProductsActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from(table)
    .delete()
    .eq("id", rowId)
    .eq("organization_id", g.ok.organizationId)
    .eq("reference_id", referenceId)
    .select("id");
  if (error || !data || data.length === 0) {
    return { error: `No fue posible eliminar ${label} (verifica tu rol en la organización).` };
  }
  revalidateProductPaths(referenceId);
  return { error: null };
}
