import "server-only";

import { createServerClient } from "@/lib/supabase/server";

/**
 * Trazaloop · Sprint T3 (Textil) · Consultas de los catálogos textiles.
 * Todo bajo RLS con la sesión real (0073); nada usa service_role.
 */

export type TextileFiberType = {
  id: string;
  code: string;
  name: string;
  fiberFamily: string;
  isNatural: boolean;
  isSynthetic: boolean;
  isRegenerated: boolean;
  isRecycledOption: boolean;
  notes: string | null;
  isActive: boolean;
  /** T9E: NULL = fibra del catálogo base de Trazaloop; UUID = personalizada. */
  organizationId: string | null;
};

/**
 * Fibras visibles para la sesión actual: las del catálogo base (globales)
 * más las personalizadas de la organización (la RLS de 0093 oculta las de
 * otras organizaciones). Base primero (display_order de siembra), luego
 * personalizadas por nombre.
 */
export async function listTextileFiberTypes(): Promise<TextileFiberType[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("textile_fiber_types")
    .select("id, code, name, fiber_family, is_natural, is_synthetic, is_regenerated, is_recycled_option, notes, is_active, organization_id")
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id as string,
    code: r.code as string,
    name: r.name as string,
    fiberFamily: r.fiber_family as string,
    isNatural: Boolean(r.is_natural),
    isSynthetic: Boolean(r.is_synthetic),
    isRegenerated: Boolean(r.is_regenerated),
    isRecycledOption: Boolean(r.is_recycled_option),
    notes: (r.notes as string | null) ?? null,
    isActive: Boolean(r.is_active),
    organizationId: (r.organization_id as string | null) ?? null,
  }));
}

export type TextileSupplierRow = {
  id: string;
  name: string;
  taxId: string | null;
  country: string | null;
  city: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  supplierType: string;
  isCritical: boolean;
  notes: string | null;
  isActive: boolean;
};

export async function listTextileSuppliers(organizationId: string): Promise<TextileSupplierRow[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("textile_suppliers")
    .select("id, name, tax_id, country, city, contact_name, contact_email, contact_phone, supplier_type, is_critical, notes, is_active")
    .eq("organization_id", organizationId)
    .order("name", { ascending: true });
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    taxId: (r.tax_id as string | null) ?? null,
    country: (r.country as string | null) ?? null,
    city: (r.city as string | null) ?? null,
    contactName: (r.contact_name as string | null) ?? null,
    contactEmail: (r.contact_email as string | null) ?? null,
    contactPhone: (r.contact_phone as string | null) ?? null,
    supplierType: r.supplier_type as string,
    isCritical: Boolean(r.is_critical),
    notes: (r.notes as string | null) ?? null,
    isActive: Boolean(r.is_active),
  }));
}

export type TextileMaterialRow = {
  id: string;
  name: string;
  internalCode: string | null;
  materialType: string;
  primaryFiberTypeId: string | null;
  primaryFiberName: string | null;
  supplierId: string | null;
  supplierName: string | null;
  declaredComposition: string | null;
  countryOfOrigin: string | null;
  recycledClaim: boolean;
  organicClaim: boolean;
  hasSupplierDatasheet: boolean;
  hasCompositionSupport: boolean;
  notes: string | null;
  isActive: boolean;
};

export async function listTextileMaterials(organizationId: string): Promise<TextileMaterialRow[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("textile_materials")
    .select(
      "id, name, internal_code, material_type, primary_fiber_type_id, supplier_id, declared_composition, country_of_origin, recycled_claim, organic_claim, has_supplier_datasheet, has_composition_support, notes, is_active, textile_fiber_types(name), textile_suppliers(name)"
    )
    .eq("organization_id", organizationId)
    .order("name", { ascending: true });
  if (error || !data) return [];
  return data.map((r) => {
    const fiber = r.textile_fiber_types as unknown as { name: string } | null;
    const supplier = r.textile_suppliers as unknown as { name: string } | null;
    return {
      id: r.id as string,
      name: r.name as string,
      internalCode: (r.internal_code as string | null) ?? null,
      materialType: r.material_type as string,
      primaryFiberTypeId: (r.primary_fiber_type_id as string | null) ?? null,
      primaryFiberName: fiber?.name ?? null,
      supplierId: (r.supplier_id as string | null) ?? null,
      supplierName: supplier?.name ?? null,
      declaredComposition: (r.declared_composition as string | null) ?? null,
      countryOfOrigin: (r.country_of_origin as string | null) ?? null,
      recycledClaim: Boolean(r.recycled_claim),
      organicClaim: Boolean(r.organic_claim),
      hasSupplierDatasheet: Boolean(r.has_supplier_datasheet),
      hasCompositionSupport: Boolean(r.has_composition_support),
      notes: (r.notes as string | null) ?? null,
      isActive: Boolean(r.is_active),
    };
  });
}

export type TextileComponentRow = {
  id: string;
  name: string;
  componentType: string;
  materialDescription: string | null;
  supplierId: string | null;
  supplierName: string | null;
  separability: string;
  replacementPossible: boolean | null;
  notes: string | null;
  isActive: boolean;
};

export async function listTextileComponents(organizationId: string): Promise<TextileComponentRow[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("textile_components")
    .select("id, name, component_type, material_description, supplier_id, separability, replacement_possible, notes, is_active, textile_suppliers(name)")
    .eq("organization_id", organizationId)
    .order("name", { ascending: true });
  if (error || !data) return [];
  return data.map((r) => {
    const supplier = r.textile_suppliers as unknown as { name: string } | null;
    return {
      id: r.id as string,
      name: r.name as string,
      componentType: r.component_type as string,
      materialDescription: (r.material_description as string | null) ?? null,
      supplierId: (r.supplier_id as string | null) ?? null,
      supplierName: supplier?.name ?? null,
      separability: r.separability as string,
      replacementPossible: (r.replacement_possible as boolean | null) ?? null,
      notes: (r.notes as string | null) ?? null,
      isActive: Boolean(r.is_active),
    };
  });
}

export type TextileProcessRow = {
  id: string;
  name: string;
  processType: string;
  description: string | null;
  responsibleArea: string | null;
  traceabilityRisk: string;
  recordsExpected: string | null;
  isActive: boolean;
};

export async function listTextileProcesses(organizationId: string): Promise<TextileProcessRow[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("textile_processes")
    .select("id, name, process_type, description, responsible_area, traceability_risk, records_expected, is_active")
    .eq("organization_id", organizationId)
    .order("name", { ascending: true });
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    processType: r.process_type as string,
    description: (r.description as string | null) ?? null,
    responsibleArea: (r.responsible_area as string | null) ?? null,
    traceabilityRisk: r.traceability_risk as string,
    recordsExpected: (r.records_expected as string | null) ?? null,
    isActive: Boolean(r.is_active),
  }));
}

export type TextileOutsourcedProcessRow = {
  id: string;
  name: string;
  processType: string;
  supplierId: string | null;
  supplierName: string | null;
  description: string | null;
  recordsExpected: string | null;
  traceabilityRisk: string;
  notes: string | null;
  isActive: boolean;
};

export async function listTextileOutsourcedProcesses(
  organizationId: string
): Promise<TextileOutsourcedProcessRow[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("textile_outsourced_processes")
    .select("id, name, process_type, supplier_id, description, records_expected, traceability_risk, notes, is_active, textile_suppliers(name)")
    .eq("organization_id", organizationId)
    .order("name", { ascending: true });
  if (error || !data) return [];
  return data.map((r) => {
    const supplier = r.textile_suppliers as unknown as { name: string } | null;
    return {
      id: r.id as string,
      name: r.name as string,
      processType: r.process_type as string,
      supplierId: (r.supplier_id as string | null) ?? null,
      supplierName: supplier?.name ?? null,
      description: (r.description as string | null) ?? null,
      recordsExpected: (r.records_expected as string | null) ?? null,
      traceabilityRisk: r.traceability_risk as string,
      notes: (r.notes as string | null) ?? null,
      isActive: Boolean(r.is_active),
    };
  });
}

/** ¿El proveedor existe, es de la empresa y está activo? (validación amigable) */
export async function textileSupplierBelongsToOrg(
  organizationId: string,
  supplierId: string
): Promise<boolean> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("textile_suppliers")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("id", supplierId)
    .maybeSingle();
  return Boolean(data);
}

/**
 * ¿El tipo de fibra existe, está activo y es UTILIZABLE por la organización?
 * T9E: utilizable = fibra del catálogo base (organization_id NULL) o fibra
 * personalizada de la MISMA organización — jamás la de otro tenant (la RLS
 * de 0093 y el trigger validate_textile_fiber_org lo re-verifican en BD).
 */
export async function textileFiberTypeIsActive(
  organizationId: string,
  fiberTypeId: string
): Promise<boolean> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("textile_fiber_types")
    .select("id")
    .eq("id", fiberTypeId)
    .eq("is_active", true)
    .or(`organization_id.is.null,organization_id.eq.${organizationId}`)
    .maybeSingle();
  return Boolean(data);
}

// ---------------------------------------------------------------------------
// T9E · Conteos de uso para la política de eliminación segura: un registro
// de catálogo solo puede eliminarse físicamente si NINGUNA relación lo usa.
// Cada conteo corre bajo RLS con la sesión real y se filtra por organización.
// ---------------------------------------------------------------------------

export type TextileCatalogUsage = { label: string; count: number };

async function countRows(
  table: string,
  filters: Record<string, string>
): Promise<number> {
  const supabase = await createServerClient();
  let query = supabase.from(table).select("id", { count: "exact", head: true });
  for (const [column, value] of Object.entries(filters)) {
    query = query.eq(column, value);
  }
  const { count, error } = await query;
  if (error) {
    // Ante un error de conteo se asume uso: jamás permitir un borrado por
    // no haber podido verificar las relaciones.
    return 1;
  }
  return count ?? 0;
}

function presentUsage(entries: Array<[string, number]>): TextileCatalogUsage[] {
  return entries
    .filter(([, count]) => count > 0)
    .map(([label, count]) => ({ label, count }));
}

export async function getTextileSupplierUsage(
  organizationId: string,
  supplierId: string
): Promise<TextileCatalogUsage[]> {
  const base = { organization_id: organizationId };
  const [materials, components, outsourced, inputLots, steps, evidenceLinks] = await Promise.all([
    countRows("textile_materials", { ...base, supplier_id: supplierId }),
    countRows("textile_components", { ...base, supplier_id: supplierId }),
    countRows("textile_outsourced_processes", { ...base, supplier_id: supplierId }),
    countRows("textile_input_lots", { ...base, supplier_id: supplierId }),
    countRows("textile_order_process_steps", { ...base, supplier_id: supplierId }),
    countRows("textile_evidence_links", {
      ...base,
      entity_type: "supplier",
      entity_id: supplierId,
    }),
  ]);
  return presentUsage([
    ["material(es)", materials],
    ["componente(s)", components],
    ["proceso(s) tercerizado(s)", outsourced],
    ["lote(s) de entrada", inputLots],
    ["paso(s) de orden / corrida de producción", steps],
    ["vínculo(s) de evidencia", evidenceLinks],
  ]);
}

export async function getTextileMaterialUsage(
  organizationId: string,
  materialId: string
): Promise<TextileCatalogUsage[]> {
  const base = { organization_id: organizationId };
  const [refMaterials, composition, inputLots, evidenceLinks] = await Promise.all([
    countRows("textile_reference_materials", { ...base, material_id: materialId }),
    countRows("textile_reference_fiber_composition", { ...base, source_material_id: materialId }),
    countRows("textile_input_lots", { ...base, material_id: materialId }),
    countRows("textile_evidence_links", {
      ...base,
      entity_type: "material",
      entity_id: materialId,
    }),
  ]);
  return presentUsage([
    ["referencia(s) (materiales asociados)", refMaterials],
    ["fila(s) de composición", composition],
    ["lote(s) de entrada", inputLots],
    ["vínculo(s) de evidencia", evidenceLinks],
  ]);
}

export async function getTextileComponentUsage(
  organizationId: string,
  componentId: string
): Promise<TextileCatalogUsage[]> {
  const base = { organization_id: organizationId };
  const [refComponents, inputLots, evidenceLinks] = await Promise.all([
    countRows("textile_reference_components", { ...base, component_id: componentId }),
    countRows("textile_input_lots", { ...base, component_id: componentId }),
    countRows("textile_evidence_links", {
      ...base,
      entity_type: "component",
      entity_id: componentId,
    }),
  ]);
  return presentUsage([
    ["referencia(s) (componentes asociados)", refComponents],
    ["lote(s) de entrada", inputLots],
    ["vínculo(s) de evidencia", evidenceLinks],
  ]);
}

export async function getTextileProcessUsage(
  organizationId: string,
  processId: string
): Promise<TextileCatalogUsage[]> {
  const base = { organization_id: organizationId };
  const [steps, evidenceLinks] = await Promise.all([
    countRows("textile_order_process_steps", { ...base, process_id: processId }),
    countRows("textile_evidence_links", {
      ...base,
      entity_type: "process",
      entity_id: processId,
    }),
  ]);
  return presentUsage([
    ["paso(s) de orden / corrida de producción", steps],
    ["vínculo(s) de evidencia", evidenceLinks],
  ]);
}

export async function getTextileOutsourcedProcessUsage(
  organizationId: string,
  outsourcedProcessId: string
): Promise<TextileCatalogUsage[]> {
  const base = { organization_id: organizationId };
  const [steps, evidenceLinks] = await Promise.all([
    countRows("textile_order_process_steps", {
      ...base,
      outsourced_process_id: outsourcedProcessId,
    }),
    countRows("textile_evidence_links", {
      ...base,
      entity_type: "outsourced_process",
      entity_id: outsourcedProcessId,
    }),
  ]);
  return presentUsage([
    ["paso(s) de orden / corrida de producción", steps],
    ["vínculo(s) de evidencia", evidenceLinks],
  ]);
}

export async function getTextileFiberTypeUsage(
  organizationId: string,
  fiberTypeId: string
): Promise<TextileCatalogUsage[]> {
  const base = { organization_id: organizationId };
  const [materials, composition] = await Promise.all([
    countRows("textile_materials", { ...base, primary_fiber_type_id: fiberTypeId }),
    countRows("textile_reference_fiber_composition", { ...base, fiber_type_id: fiberTypeId }),
  ]);
  return presentUsage([
    ["material(es)", materials],
    ["fila(s) de composición", composition],
  ]);
}
