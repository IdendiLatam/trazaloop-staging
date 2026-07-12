import "server-only";

import { createServerClient } from "@/lib/supabase/server";

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
};

export async function listSuppliers(orgId: string): Promise<Supplier[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("suppliers")
    .select("id, name, tax_id, contact")
    .eq("organization_id", orgId)
    .order("name");
  return (data as Supplier[]) ?? [];
}

export async function listFamilies(orgId: string): Promise<ProductFamily[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("product_families")
    .select("id, name, description")
    .eq("organization_id", orgId)
    .order("name");
  return (data as ProductFamily[]) ?? [];
}

export async function listProducts(orgId: string): Promise<Product[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("products")
    .select("id, code, name, family_id, declared_recycled_percent, product_families(name)")
    .eq("organization_id", orgId)
    .order("code");
  return (data ?? []).map((p) => {
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
  const { data } = await supabase
    .from("materials")
    .select(
      "id, name, classification_code, reclassified_to_code, reclassification_justification, origin_support_evidence_id, reclassification_evidence_id, material_classifications!materials_classification_code_fkey(label)"
    )
    .eq("organization_id", orgId)
    .order("name");

  // Estado de las evidencias de soporte referenciadas (origen/reclasificación).
  const evidenceIds = Array.from(
    new Set(
      (data ?? [])
        .flatMap((m) => [m.origin_support_evidence_id, m.reclassification_evidence_id])
        .filter((id): id is string => Boolean(id))
    )
  );
  const evidenceById = new Map<string, { name: string; status: string }>();
  if (evidenceIds.length > 0) {
    const { data: evs } = await supabase
      .from("evidences")
      .select("id, name, status")
      .eq("organization_id", orgId)
      .in("id", evidenceIds);
    for (const e of evs ?? []) evidenceById.set(e.id, { name: e.name, status: e.status });
  }

  return (data ?? []).map((m) => {
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
    };
  });
}
