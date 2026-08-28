import "server-only";

import { createServerClient } from "@/lib/supabase/server";
import { readAllStrict } from "@/lib/db/paged-read";

/** Fila cruda de PostgREST. Los joins anidados llegan como objeto o array
 *  según la cardinalidad, así que el valor es `unknown` y el mapeo de cada
 *  función es quien le da forma — igual que antes de PT-01. */
type CatalogRow = Record<string, unknown>;

export type Supplier = {
  id: string;
  name: string;
  tax_id: string | null;
  contact: string | null;
};

export type ProductFamily = {
  id: string;
  name: string;
  description: string | null;
};

export type Product = {
  id: string;
  code: string;
  name: string;
  family_id: string | null;
  family_name: string | null;
  declared_recycled_percent: number | null;
};

export type MaterialClassification = {
  code: string;
  label: string;
  eligible_as_recycled: boolean;
  never_counts: boolean;
  can_reclassify_to: string | null;
  description: string | null;
};

export type Material = {
  id: string;
  name: string;
  classification_code: string;
  classification_label: string;
  reclassified_to_code: string | null;
  reclassification_justification: string | null;
  origin_support_evidence_id: string | null;
  reclassification_evidence_id: string | null;
  origin_evidence_name: string | null;
  origin_evidence_status: string | null;
  reclassification_evidence_name: string | null;
  reclassification_evidence_status: string | null;
  /** (rev. 03.1–03.3.4) Vigencia canónica 03.1: una evidencia archivada
   * sigue 'valid' pero NO es soporte vigente. */
  origin_evidence_archived_at: string | null;
  reclassification_evidence_archived_at: string | null;
};

/**
 * PT-01 · Estas listas devuelven el conjunto ENTERO: alimentan selectores y
 * exportadores. Se leían sin cota y con `max_rows = 1000` eso significaba una
 * opción que no aparece en un desplegable —y por tanto no se puede elegir— o
 * una exportación corta sin decirlo. Ahora recorren por lotes.
 */
export async function listSuppliers(orgId: string): Promise<Supplier[]> {
  const supabase = await createServerClient();
  const rows = await readAllStrict<Supplier>(() =>
    supabase.from("suppliers").select("id, name, tax_id, contact")
      .eq("organization_id", orgId).order("name").order("id")
  , "proveedores");
  return rows;
}

export async function listFamilies(orgId: string): Promise<ProductFamily[]> {
  const supabase = await createServerClient();
  const rows = await readAllStrict<ProductFamily>(() =>
    supabase.from("product_families").select("id, name, description")
      .eq("organization_id", orgId).order("name").order("id")
  , "familias de producto");
  return rows;
}

export async function listProducts(orgId: string): Promise<Product[]> {
  const supabase = await createServerClient();
  // La fila de PostgREST con join anidado no tiene un tipo estable aquí; el
  // mapeo de abajo es quien fija la forma, igual que antes de PT-01.
  const data = await readAllStrict<CatalogRow>(() =>
    supabase.from("products")
      .select("id, code, name, family_id, declared_recycled_percent, product_families(name)")
      .eq("organization_id", orgId).order("code").order("id")
  , "productos");
  return (data ?? []).map((p) => {
    const fam = p.product_families as unknown as { name: string } | null;
    return {
      id: p.id as string,
      code: p.code as string,
      name: p.name as string,
      family_id: (p.family_id as string | null) ?? null,
      family_name: fam?.name ?? null,
      declared_recycled_percent:
        p.declared_recycled_percent === null ? null : Number(p.declared_recycled_percent),
    };
  });
}

export async function listClassifications(): Promise<MaterialClassification[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("material_classifications")
    .select("code, label, eligible_as_recycled, never_counts, can_reclassify_to, description")
    .order("code");
  return (data as MaterialClassification[]) ?? [];
}

export async function listMaterials(orgId: string): Promise<Material[]> {
  const supabase = await createServerClient();
  // La fila de PostgREST con join anidado no tiene un tipo estable aquí; el
  // mapeo de abajo es quien fija la forma, igual que antes de PT-01.
  const data = await readAllStrict<CatalogRow>(() =>
    supabase.from("materials").select(
      "id, name, classification_code, reclassified_to_code, reclassification_justification, origin_support_evidence_id, reclassification_evidence_id, material_classifications!materials_classification_code_fkey(label)"
    ).eq("organization_id", orgId).order("name").order("id")
  , "materiales");

  // Estado de las evidencias de soporte referenciadas (origen/reclasificación).
  const evidenceIds = Array.from(
    new Set(
      (data ?? [])
        .flatMap((m) => [m.origin_support_evidence_id, m.reclassification_evidence_id])
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    )
  );
  const evidenceById = new Map<string, { name: string; status: string; archived_at: string | null }>();
  if (evidenceIds.length > 0) {
    const { data: evs } = await supabase
      .from("evidences")
      .select("id, name, status, archived_at")
      .eq("organization_id", orgId)
      .in("id", evidenceIds);
    for (const e of evs ?? [])
      evidenceById.set(e.id, { name: e.name, status: e.status, archived_at: e.archived_at });
  }

  return (data ?? []).map((m) => {
    const cls = m.material_classifications as unknown as { label: string } | null;
    const originId = (m.origin_support_evidence_id as string | null) ?? null;
    const reclassId = (m.reclassification_evidence_id as string | null) ?? null;
    const originEv = originId ? evidenceById.get(originId) ?? null : null;
    const reclassEv = reclassId ? evidenceById.get(reclassId) ?? null : null;
    return {
      id: m.id as string,
      name: m.name as string,
      classification_code: m.classification_code as string,
      classification_label: cls?.label ?? (m.classification_code as string),
      reclassified_to_code: (m.reclassified_to_code as string | null) ?? null,
      reclassification_justification: (m.reclassification_justification as string | null) ?? null,
      origin_support_evidence_id: originId,
      reclassification_evidence_id: reclassId,
      origin_evidence_name: originEv?.name ?? null,
      origin_evidence_status: originEv?.status ?? null,
      reclassification_evidence_name: reclassEv?.name ?? null,
      reclassification_evidence_status: reclassEv?.status ?? null,
      origin_evidence_archived_at: originEv?.archived_at ?? null,
      reclassification_evidence_archived_at: reclassEv?.archived_at ?? null,
    };
  });
}

// ===========================================================================
// PCR-01 (punto 9) · Búsqueda + paginación de listados de catálogo.
// Funciones ADITIVAS: las list* de arriba siguen intactas para selects,
// flujo guiado, dossier e importaciones. Todo respeta organization_id + RLS.
// ===========================================================================
import {
  normalizePageQuery,
  pageRange,
  sanitizeSearchTerm,
  type PageResult,
} from "@/lib/domain/pagination";

export type CatalogPageInput = { q?: string | null; page?: string | number | null };

export async function searchSuppliers(
  orgId: string,
  query: CatalogPageInput
): Promise<PageResult<Supplier>> {
  const { q, page, pageSize } = normalizePageQuery(query);
  const supabase = await createServerClient();
  let request = supabase
    .from("suppliers")
    .select("id, name, tax_id, contact", { count: "exact" })
    .eq("organization_id", orgId);
  const term = sanitizeSearchTerm(q);
  if (term) {
    request = request.or(`name.ilike.%${term}%,tax_id.ilike.%${term}%,contact.ilike.%${term}%`);
  }
  const { from, to } = pageRange(page, pageSize);
  const { data, count } = await request.order("name").range(from, to);
  return { rows: (data as Supplier[]) ?? [], total: count ?? 0, page, pageSize };
}

export async function searchFamilies(
  orgId: string,
  query: CatalogPageInput
): Promise<PageResult<ProductFamily>> {
  const { q, page, pageSize } = normalizePageQuery(query);
  const supabase = await createServerClient();
  let request = supabase
    .from("product_families")
    .select("id, name, description", { count: "exact" })
    .eq("organization_id", orgId);
  const term = sanitizeSearchTerm(q);
  if (term) {
    request = request.or(`name.ilike.%${term}%,description.ilike.%${term}%`);
  }
  const { from, to } = pageRange(page, pageSize);
  const { data, count } = await request.order("name").range(from, to);
  return { rows: (data as ProductFamily[]) ?? [], total: count ?? 0, page, pageSize };
}

export async function searchProducts(
  orgId: string,
  query: CatalogPageInput
): Promise<PageResult<Product>> {
  const { q, page, pageSize } = normalizePageQuery(query);
  const supabase = await createServerClient();
  let request = supabase
    .from("products")
    .select("id, code, name, family_id, declared_recycled_percent, product_families(name)", {
      count: "exact",
    })
    .eq("organization_id", orgId);
  const term = sanitizeSearchTerm(q);
  if (term) {
    request = request.or(`code.ilike.%${term}%,name.ilike.%${term}%`);
  }
  const { from, to } = pageRange(page, pageSize);
  const { data, count } = await request.order("code").range(from, to);
  return {
    rows: (data ?? []).map((p) => {
      const fam = p.product_families as unknown as { name: string } | null;
      return {
        id: p.id,
        code: p.code,
        name: p.name,
        family_id: p.family_id,
        family_name: fam?.name ?? null,
        declared_recycled_percent:
          p.declared_recycled_percent === null ? null : Number(p.declared_recycled_percent),
      };
    }),
    total: count ?? 0,
    page,
    pageSize,
  };
}

export async function searchMaterials(
  orgId: string,
  query: CatalogPageInput
): Promise<PageResult<Material>> {
  const { q, page, pageSize } = normalizePageQuery(query);
  const supabase = await createServerClient();
  let request = supabase
    .from("materials")
    .select(
      "id, name, classification_code, reclassified_to_code, reclassification_justification, origin_support_evidence_id, reclassification_evidence_id, material_classifications!materials_classification_code_fkey(label)",
      { count: "exact" }
    )
    .eq("organization_id", orgId);
  const term = sanitizeSearchTerm(q);
  if (term) {
    request = request.or(`name.ilike.%${term}%,classification_code.ilike.%${term}%`);
  }
  const { from, to } = pageRange(page, pageSize);
  const { data, count } = await request.order("name").range(from, to);

  // Misma hidratación de evidencias de soporte que listMaterials, acotada a
  // la página actual.
  const evidenceIds = Array.from(
    new Set(
      (data ?? [])
        .flatMap((m) => [m.origin_support_evidence_id, m.reclassification_evidence_id])
        .filter((id): id is string => Boolean(id))
    )
  );
  const evidenceById = new Map<string, { name: string; status: string; archived_at: string | null }>();
  if (evidenceIds.length > 0) {
    const { data: evs } = await supabase
      .from("evidences")
      .select("id, name, status, archived_at")
      .eq("organization_id", orgId)
      .in("id", evidenceIds);
    for (const e of evs ?? [])
      evidenceById.set(e.id, { name: e.name, status: e.status, archived_at: e.archived_at });
  }

  return {
    rows: (data ?? []).map((m) => {
      const cls = m.material_classifications as unknown as { label: string } | null;
      const originEv = m.origin_support_evidence_id
        ? evidenceById.get(m.origin_support_evidence_id) ?? null
        : null;
      const reclassEv = m.reclassification_evidence_id
        ? evidenceById.get(m.reclassification_evidence_id) ?? null
        : null;
      return {
        id: m.id,
        name: m.name,
        classification_code: m.classification_code,
        classification_label: cls?.label ?? m.classification_code,
        reclassified_to_code: m.reclassified_to_code,
        reclassification_justification: m.reclassification_justification,
        origin_support_evidence_id: m.origin_support_evidence_id,
        reclassification_evidence_id: m.reclassification_evidence_id,
        origin_evidence_name: originEv?.name ?? null,
        origin_evidence_status: originEv?.status ?? null,
        reclassification_evidence_name: reclassEv?.name ?? null,
        reclassification_evidence_status: reclassEv?.status ?? null,
        origin_evidence_archived_at: originEv?.archived_at ?? null,
        reclassification_evidence_archived_at: reclassEv?.archived_at ?? null,
      };
    }),
    total: count ?? 0,
    page,
    pageSize,
  };
}

// Getters por id (PCR-01): con paginación, el registro en edición puede no
// estar en la página actual. Mismas formas de datos que los listados.
export async function getSupplier(orgId: string, id: string): Promise<Supplier | null> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("suppliers")
    .select("id, name, tax_id, contact")
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  return (data as Supplier | null) ?? null;
}

export async function getFamily(orgId: string, id: string): Promise<ProductFamily | null> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("product_families")
    .select("id, name, description")
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  return (data as ProductFamily | null) ?? null;
}

export async function getProduct(orgId: string, id: string): Promise<Product | null> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("products")
    .select("id, code, name, family_id, declared_recycled_percent, product_families(name)")
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const fam = data.product_families as unknown as { name: string } | null;
  return {
    id: data.id,
    code: data.code,
    name: data.name,
    family_id: data.family_id,
    family_name: fam?.name ?? null,
    declared_recycled_percent:
      data.declared_recycled_percent === null ? null : Number(data.declared_recycled_percent),
  };
}

export async function getMaterial(orgId: string, id: string): Promise<Material | null> {
  const supabase = await createServerClient();
  const { data: m } = await supabase
    .from("materials")
    .select(
      "id, name, classification_code, reclassified_to_code, reclassification_justification, origin_support_evidence_id, reclassification_evidence_id, material_classifications!materials_classification_code_fkey(label)"
    )
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (!m) return null;

  const evidenceIds = [m.origin_support_evidence_id, m.reclassification_evidence_id].filter(
    (v): v is string => Boolean(v)
  );
  const evidenceById = new Map<string, { name: string; status: string; archived_at: string | null }>();
  if (evidenceIds.length > 0) {
    const { data: evs } = await supabase
      .from("evidences")
      .select("id, name, status, archived_at")
      .eq("organization_id", orgId)
      .in("id", evidenceIds);
    for (const e of evs ?? [])
      evidenceById.set(e.id, { name: e.name, status: e.status, archived_at: e.archived_at });
  }
  const cls = m.material_classifications as unknown as { label: string } | null;
  const originEv = m.origin_support_evidence_id
    ? evidenceById.get(m.origin_support_evidence_id) ?? null
    : null;
  const reclassEv = m.reclassification_evidence_id
    ? evidenceById.get(m.reclassification_evidence_id) ?? null
    : null;
  return {
    id: m.id,
    name: m.name,
    classification_code: m.classification_code,
    classification_label: cls?.label ?? m.classification_code,
    reclassified_to_code: m.reclassified_to_code,
    reclassification_justification: m.reclassification_justification,
    origin_support_evidence_id: m.origin_support_evidence_id,
    reclassification_evidence_id: m.reclassification_evidence_id,
    origin_evidence_name: originEv?.name ?? null,
    origin_evidence_status: originEv?.status ?? null,
    reclassification_evidence_name: reclassEv?.name ?? null,
    reclassification_evidence_status: reclassEv?.status ?? null,
    origin_evidence_archived_at: originEv?.archived_at ?? null,
    reclassification_evidence_archived_at: reclassEv?.archived_at ?? null,
  };
}
