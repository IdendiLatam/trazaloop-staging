import "server-only";

import { createServerClient } from "@/lib/supabase/server";
import { readAllStrict, readPage, sanitizeSearchTerm, type Page } from "@/lib/db/paged-read";

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

export type ProductsQuery = { q?: string | null; page?: string | number | null; pageSize?: number | null };

type PRow = Record<string, unknown>;
const SELECT_COLLECTION =
  "id, name, code, season, year, customer_or_program, status, description, notes, is_active";
const SELECT_PRODUCT =
  "id, name, product_code, category, status, collection_id, intended_use, target_market, description, notes, is_active, textile_collections(name)";

const mapCollection = (r: PRow): TextileCollectionRow => ({
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
});

/** TODAS. Alimenta el desplegable de colección de la ficha de producto. */
export async function listTextileCollections(organizationId: string): Promise<TextileCollectionRow[]> {
  const supabase = await createServerClient();
  const rows = await readAllStrict<PRow>(() =>
    supabase.from("textile_collections").select(SELECT_COLLECTION)
      .eq("organization_id", organizationId).order("name", { ascending: true })
  , "colecciones textiles");
  return rows.map(mapCollection);
}

/** UNA página, para la pantalla de colecciones. */
export async function searchTextileCollections(
  organizationId: string, query: ProductsQuery = {}
): Promise<Page<TextileCollectionRow>> {
  const supabase = await createServerClient();
  const term = sanitizeSearchTerm(query.q ?? "");
  const page = await readPage<PRow>(({ from, to }) => {
    let req = supabase.from("textile_collections").select(SELECT_COLLECTION, { count: "exact" })
      .eq("organization_id", organizationId);
    if (term) req = req.ilike("name", `%${term}%`);
    return req.order("name", { ascending: true }).range(from, to);
  }, query);
  return { ...page, rows: page.rows.map(mapCollection) };
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

const mapProduct = (r: PRow, referenceCount: number): TextileProductRow => ({
  id: r.id as string,
  name: r.name as string,
  productCode: (r.product_code as string | null) ?? null,
  category: r.category as string,
  status: r.status as string,
  collectionId: (r.collection_id as string | null) ?? null,
  collectionName: ((r.textile_collections as { name: string } | null) ?? null)?.name ?? null,
  intendedUse: (r.intended_use as string | null) ?? null,
  targetMarket: (r.target_market as string | null) ?? null,
  description: (r.description as string | null) ?? null,
  notes: (r.notes as string | null) ?? null,
  isActive: Boolean(r.is_active),
  referenceCount,
});

/**
 * Cuántas referencias tiene cada producto de la lista.
 *
 * PT-01 · Antes se leían TODAS las referencias de la empresa para contarlas en
 * memoria. Eso no solo se cortaba a las mil: producía un número EQUIVOCADO, que
 * es peor que una lista corta — una lista corta se nota, un contador mal no.
 *
 * Ahora se pregunta solo por los productos de la página. La consulta sigue
 * acotada al inquilino: el `in` restringe, no autoriza.
 */
async function contarReferencias(
  organizationId: string, productIds: string[]
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (productIds.length === 0) return counts;
  const supabase = await createServerClient();
  const rows = await readAllStrict<PRow>(() =>
    supabase.from("textile_references").select("product_id")
      .eq("organization_id", organizationId)
      .in("product_id", productIds)
      .order("product_id", { ascending: true })
  , "referencias textiles");
  for (const r of rows) {
    const pid = r.product_id as string;
    counts.set(pid, (counts.get(pid) ?? 0) + 1);
  }
  return counts;
}

/** TODOS los productos. Para exportadores y para la ficha de detalle. */
export async function listTextileProducts(organizationId: string): Promise<TextileProductRow[]> {
  const supabase = await createServerClient();
  const rows = await readAllStrict<PRow>(() =>
    supabase.from("textile_products").select(SELECT_PRODUCT)
      .eq("organization_id", organizationId).order("name", { ascending: true })
  , "productos textiles");
  const counts = await contarReferencias(organizationId, rows.map((r) => r.id as string));
  return rows.map((r) => mapProduct(r, counts.get(r.id as string) ?? 0));
}

/** UNA página de productos, con los contadores de esa página. */
export async function searchTextileProducts(
  organizationId: string, query: ProductsQuery = {}
): Promise<Page<TextileProductRow>> {
  const supabase = await createServerClient();
  const term = sanitizeSearchTerm(query.q ?? "");
  const page = await readPage<PRow>(({ from, to }) => {
    let req = supabase.from("textile_products").select(SELECT_PRODUCT, { count: "exact" })
      .eq("organization_id", organizationId);
    if (term) req = req.ilike("name", `%${term}%`);
    return req.order("name", { ascending: true }).range(from, to);
  }, query);
  const counts = await contarReferencias(organizationId, page.rows.map((r) => r.id as string));
  return { ...page, rows: page.rows.map((r) => mapProduct(r, counts.get(r.id as string) ?? 0)) };
}

/**
 * PT-01 · Mismo arreglo que en `getTextileReference`: se preguntaba por todos
 * los productos y se buscaba el suyo en memoria, así que a partir de mil
 * productos abrir una ficha devolvía «no existe».
 */
export async function getTextileProductDetail(
  organizationId: string,
  productId: string
): Promise<{ product: TextileProductRow; references: TextileReferenceRow[] } | null> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("textile_products").select(SELECT_PRODUCT)
    .eq("organization_id", organizationId)
    .eq("id", productId)
    .maybeSingle();
  if (!data) return null;
  const references = await listTextileReferences(organizationId, productId);
  return { product: mapProduct(data as PRow, references.length), references };
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

const SELECT_REFERENCE =
  "id, sku, name, product_id, version_label, color, size_range, gender_or_fit, description, status, composition_status, notes, is_active, textile_products(name)";

const mapReference = (r: PRow): TextileReferenceRow => ({
  id: r.id as string,
  sku: r.sku as string,
  name: (r.name as string | null) ?? null,
  productId: r.product_id as string,
  productName: ((r.textile_products as { name: string } | null) ?? null)?.name ?? null,
  versionLabel: (r.version_label as string | null) ?? null,
  color: (r.color as string | null) ?? null,
  sizeRange: (r.size_range as string | null) ?? null,
  genderOrFit: (r.gender_or_fit as string | null) ?? null,
  description: (r.description as string | null) ?? null,
  status: r.status as string,
  compositionStatus: r.composition_status as string,
  notes: (r.notes as string | null) ?? null,
  isActive: Boolean(r.is_active),
});

/** TODAS las referencias (de la empresa o de un producto). */
export async function listTextileReferences(
  organizationId: string,
  productId?: string
): Promise<TextileReferenceRow[]> {
  const supabase = await createServerClient();
  const rows = await readAllStrict<PRow>(() => {
    let req = supabase.from("textile_references").select(SELECT_REFERENCE)
      .eq("organization_id", organizationId);
    if (productId) req = req.eq("product_id", productId);
    return req.order("sku", { ascending: true });
  }, "referencias textiles");
  return rows.map(mapReference);
}

/** UNA página de referencias. La búsqueda va por SKU, que es como se buscan. */
export async function searchTextileReferences(
  organizationId: string, query: ProductsQuery & { productId?: string } = {}
): Promise<Page<TextileReferenceRow>> {
  const supabase = await createServerClient();
  const term = sanitizeSearchTerm(query.q ?? "");
  const page = await readPage<PRow>(({ from, to }) => {
    let req = supabase.from("textile_references").select(SELECT_REFERENCE, { count: "exact" })
      .eq("organization_id", organizationId);
    if (query.productId) req = req.eq("product_id", query.productId);
    if (term) req = req.ilike("sku", `%${term}%`);
    return req.order("sku", { ascending: true }).range(from, to);
  }, query);
  return { ...page, rows: page.rows.map(mapReference) };
}

/**
 * Una referencia por id.
 *
 * PT-01 · Antes traía TODAS las referencias de la empresa y buscaba la suya en
 * memoria. Además de leer de más, se cortaba a las mil: a partir de ahí, abrir
 * la ficha de una referencia devolvía «no existe». Ahora se pregunta por ella.
 */
export async function getTextileReference(
  organizationId: string,
  referenceId: string
): Promise<TextileReferenceRow | null> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("textile_references").select(SELECT_REFERENCE)
    .eq("organization_id", organizationId)
    .eq("id", referenceId)
    .maybeSingle();
  return data ? mapReference(data as PRow) : null;
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
