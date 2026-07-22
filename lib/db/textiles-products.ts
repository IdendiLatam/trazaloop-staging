import "server-only";

import { createServerClient } from "@/lib/supabase/server";

/**
 * Trazaloop · Sprint T4 (Textil) · Consultas de productos, referencias y
 * composición. Todo bajo RLS con la sesión real; nada usa service_role.
 */

export type TextileCollectionRow = {
  id: string;
  name: string;
  code: string | null;
  season: string | null;
  year: number | null;
  customerOrProgram: string | null;
  status: string;
  description: string | null;
  notes: string | null;
  isActive: boolean;
};

export async function listTextileCollections(organizationId: string): Promise<TextileCollectionRow[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("textile_collections")
    .select("id, name, code, season, year, customer_or_program, status, description, notes, is_active")
    .eq("organization_id", organizationId)
    .order("name", { ascending: true });
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    code: (r.code as string | null) ?? null,
    season: (r.season as string | null) ?? null,
    year: (r.year as number | null) ?? null,
    customerOrProgram: (r.customer_or_program as string | null) ?? null,
    status: r.status as string,
    description: (r.description as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    isActive: Boolean(r.is_active),
  }));
}

export type TextileProductRow = {
  id: string;
  name: string;
  productCode: string | null;
  category: string;
  status: string;
  collectionId: string | null;
  collectionName: string | null;
  intendedUse: string | null;
  targetMarket: string | null;
  description: string | null;
  notes: string | null;
  isActive: boolean;
  referenceCount: number;
};

export async function listTextileProducts(organizationId: string): Promise<TextileProductRow[]> {
  const supabase = await createServerClient();
  const [{ data, error }, { data: refs }] = await Promise.all([
    supabase
      .from("textile_products")
      .select("id, name, product_code, category, status, collection_id, intended_use, target_market, description, notes, is_active, textile_collections(name)")
      .eq("organization_id", organizationId)
      .order("name", { ascending: true }),
    supabase
      .from("textile_references")
      .select("product_id")
      .eq("organization_id", organizationId),
  ]);
  if (error || !data) return [];
  const counts = new Map<string, number>();
  for (const r of refs ?? []) {
    const pid = r.product_id as string;
    counts.set(pid, (counts.get(pid) ?? 0) + 1);
  }
  return data.map((r) => {
    const col = r.textile_collections as unknown as { name: string } | null;
    return {
      id: r.id as string,
      name: r.name as string,
      productCode: (r.product_code as string | null) ?? null,
      category: r.category as string,
      status: r.status as string,
      collectionId: (r.collection_id as string | null) ?? null,
      collectionName: col?.name ?? null,
      intendedUse: (r.intended_use as string | null) ?? null,
      targetMarket: (r.target_market as string | null) ?? null,
      description: (r.description as string | null) ?? null,
      notes: (r.notes as string | null) ?? null,
      isActive: Boolean(r.is_active),
      referenceCount: counts.get(r.id as string) ?? 0,
    };
  });
}

export async function getTextileProductDetail(
  organizationId: string,
  productId: string
): Promise<{ product: TextileProductRow; references: TextileReferenceRow[] } | null> {
  const products = await listTextileProducts(organizationId);
  const product = products.find((p) => p.id === productId);
  if (!product) return null;
  const references = await listTextileReferences(organizationId, productId);
  return { product, references };
}

export type TextileReferenceRow = {
  id: string;
  sku: string;
  name: string | null;
  productId: string;
  productName: string | null;
  versionLabel: string | null;
  color: string | null;
  sizeRange: string | null;
  genderOrFit: string | null;
  description: string | null;
  status: string;
  compositionStatus: string;
  notes: string | null;
  isActive: boolean;
};

export async function listTextileReferences(
  organizationId: string,
  productId?: string
): Promise<TextileReferenceRow[]> {
  const supabase = await createServerClient();
  let query = supabase
    .from("textile_references")
    .select("id, sku, name, product_id, version_label, color, size_range, gender_or_fit, description, status, composition_status, notes, is_active, textile_products(name)")
    .eq("organization_id", organizationId)
    .order("sku", { ascending: true });
  if (productId) query = query.eq("product_id", productId);
  const { data, error } = await query;
  if (error || !data) return [];
  return data.map((r) => {
    const prod = r.textile_products as unknown as { name: string } | null;
    return {
      id: r.id as string,
      sku: r.sku as string,
      name: (r.name as string | null) ?? null,
      productId: r.product_id as string,
      productName: prod?.name ?? null,
      versionLabel: (r.version_label as string | null) ?? null,
      color: (r.color as string | null) ?? null,
      sizeRange: (r.size_range as string | null) ?? null,
      genderOrFit: (r.gender_or_fit as string | null) ?? null,
      description: (r.description as string | null) ?? null,
      status: r.status as string,
      compositionStatus: r.composition_status as string,
      notes: (r.notes as string | null) ?? null,
      isActive: Boolean(r.is_active),
    };
  });
}

export async function getTextileReference(
  organizationId: string,
  referenceId: string
): Promise<TextileReferenceRow | null> {
  const rows = await listTextileReferences(organizationId);
  return rows.find((r) => r.id === referenceId) ?? null;
}

export type ReferenceFiberRow = {
  id: string;
  fiberTypeId: string;
  fiberName: string | null;
  percentage: number;
  scope: string;
  sourceMaterialId: string | null;
  sourceMaterialName: string | null;
  isRecycledDeclared: boolean;
  isOrganicDeclared: boolean;
  notes: string | null;
};

export async function listReferenceFiberComposition(
  organizationId: string,
  referenceId: string
): Promise<ReferenceFiberRow[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("textile_reference_fiber_composition")
    .select("id, fiber_type_id, percentage, component_scope, source_material_id, is_recycled_declared, is_organic_declared, notes, textile_fiber_types(name), textile_materials(name)")
    .eq("organization_id", organizationId)
    .eq("reference_id", referenceId)
    .order("component_scope", { ascending: true })
    .order("percentage", { ascending: false });
  if (error || !data) return [];
  return data.map((r) => {
    const fiber = r.textile_fiber_types as unknown as { name: string } | null;
    const mat = r.textile_materials as unknown as { name: string } | null;
    return {
      id: r.id as string,
      fiberTypeId: r.fiber_type_id as string,
      fiberName: fiber?.name ?? null,
      percentage: Number(r.percentage),
      scope: r.component_scope as string,
      sourceMaterialId: (r.source_material_id as string | null) ?? null,
      sourceMaterialName: mat?.name ?? null,
      isRecycledDeclared: Boolean(r.is_recycled_declared),
      isOrganicDeclared: Boolean(r.is_organic_declared),
      notes: (r.notes as string | null) ?? null,
    };
  });
}

export type ReferenceMaterialRow = {
  id: string;
  materialId: string;
  materialName: string | null;
  role: string;
  estimatedPercentage: number | null;
  quantityDescription: string | null;
  notes: string | null;
};

export async function listReferenceMaterials(
  organizationId: string,
  referenceId: string
): Promise<ReferenceMaterialRow[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("textile_reference_materials")
    .select("id, material_id, role, estimated_percentage, quantity_description, notes, textile_materials(name)")
    .eq("organization_id", organizationId)
    .eq("reference_id", referenceId)
    .order("role", { ascending: true });
  if (error || !data) return [];
  return data.map((r) => {
    const mat = r.textile_materials as unknown as { name: string } | null;
    return {
      id: r.id as string,
      materialId: r.material_id as string,
      materialName: mat?.name ?? null,
      role: r.role as string,
      estimatedPercentage: r.estimated_percentage === null ? null : Number(r.estimated_percentage),
      quantityDescription: (r.quantity_description as string | null) ?? null,
      notes: (r.notes as string | null) ?? null,
    };
  });
}

export type ReferenceComponentRow = {
  id: string;
  componentId: string;
  componentName: string | null;
  role: string;
  quantityDescription: string | null;
  separabilityOverride: string | null;
  replacementPossibleOverride: boolean | null;
  notes: string | null;
};

export async function listReferenceComponents(
  organizationId: string,
  referenceId: string
): Promise<ReferenceComponentRow[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("textile_reference_components")
    .select("id, component_id, role, quantity_description, separability_override, replacement_possible_override, notes, textile_components(name)")
    .eq("organization_id", organizationId)
    .eq("reference_id", referenceId)
    .order("role", { ascending: true });
  if (error || !data) return [];
  return data.map((r) => {
    const comp = r.textile_components as unknown as { name: string } | null;
    return {
      id: r.id as string,
      componentId: r.component_id as string,
      componentName: comp?.name ?? null,
      role: r.role as string,
      quantityDescription: (r.quantity_description as string | null) ?? null,
      separabilityOverride: (r.separability_override as string | null) ?? null,
      replacementPossibleOverride: (r.replacement_possible_override as boolean | null) ?? null,
      notes: (r.notes as string | null) ?? null,
    };
  });
}

/** Verificadores de pertenencia (validación amigable; la FK compuesta re-verifica). */
export async function textileCollectionBelongsToOrg(
  organizationId: string,
  collectionId: string
): Promise<boolean> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("textile_collections")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("id", collectionId)
    .maybeSingle();
  return Boolean(data);
}

export async function textileProductBelongsToOrg(
  organizationId: string,
  productId: string
): Promise<boolean> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("textile_products")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("id", productId)
    .maybeSingle();
  return Boolean(data);
}

export async function textileReferenceBelongsToOrg(
  organizationId: string,
  referenceId: string
): Promise<boolean> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("textile_references")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("id", referenceId)
    .maybeSingle();
  return Boolean(data);
}

export async function textileMaterialBelongsToOrg(
  organizationId: string,
  materialId: string
): Promise<boolean> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("textile_materials")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("id", materialId)
    .maybeSingle();
  return Boolean(data);
}

export async function textileComponentBelongsToOrg(
  organizationId: string,
  componentId: string
): Promise<boolean> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("textile_components")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("id", componentId)
    .maybeSingle();
  return Boolean(data);
}
