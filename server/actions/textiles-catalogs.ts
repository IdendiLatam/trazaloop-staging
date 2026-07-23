"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { requireTextilesForAction } from "@/lib/auth/require-textiles-module";
import { checkTextilesCanMutate, checkTextilesResourceLimit } from "@/server/actions/module-plans";
import {
  textileSupplierBelongsToOrg,
  textileFiberTypeIsActive,
} from "@/lib/db/textiles-catalogs";
import {
  TEXTILE_SUPPLIER_TYPES,
  TEXTILE_MATERIAL_TYPES,
  TEXTILE_COMPONENT_TYPES,
  TEXTILE_SEPARABILITY_VALUES,
  TEXTILE_PROCESS_TYPES,
  TEXTILE_OUTSOURCED_PROCESS_TYPES,
  TEXTILE_TRACEABILITY_RISK_VALUES,
  validateCatalogName,
  cleanText,
  isOneOf,
  isValidEmail,
} from "@/lib/domain/textiles-catalogs";

/**
 * Trazaloop · Sprint T3 (Textil) · Server actions de los catálogos textiles.
 *
 * Todas las mutaciones: (1) triple guarda del módulo (flag + empresa activa
 * + habilitación); (2) modo solo lectura de plataforma
 * (checkTextilesCanMutate); (3) validación de dominio (nombre, enums,
 * correo) ANTES de tocar la BD; (4) organization_id SIEMPRE de la empresa
 * activa (jamás del cliente) y edición filtrada por organization_id — la
 * RLS de 0073 y las FKs compuestas re-verifican todo en BD. Errores:
 * mensajes seguros sin detalles internos. Nada usa service_role.
 *
 * "Eliminar" no existe: los catálogos se DESACTIVAN (is_active) para no
 * romper referencias futuras (T4–T9); el delete físico queda reservado a
 * admin/quality vía RLS y no se expone en la UI de T3.
 */

export type TextileCatalogActionState = { error: string | null };

const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: { code?: string } | null): boolean {
  return Boolean(error && error.code === UNIQUE_VIOLATION);
}

const CATALOGS_PATH = "/textiles/catalogs";

type GateOk = { organizationId: string };

async function gate(): Promise<{ ok: GateOk | null; error: string | null }> {
  const access = await requireTextilesForAction();
  if (access.org === null) return { ok: null, error: access.error };
  const mutateCheck = await checkTextilesCanMutate();
  if (!mutateCheck.allowed) return { ok: null, error: mutateCheck.error };
  return { ok: { organizationId: access.org.organizationId }, error: null };
}

// ---------------------------------------------------------------------------
// Proveedores
// ---------------------------------------------------------------------------

export type TextileSupplierInput = {
  name: string;
  taxId?: string;
  country?: string;
  city?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  supplierType: string;
  isCritical?: boolean;
  notes?: string;
};

function validateSupplierInput(input: TextileSupplierInput):
  | { row: Record<string, unknown>; error: null }
  | { row: null; error: string } {
  const name = validateCatalogName(input.name);
  if (name.error) return { row: null, error: name.error };
  if (!isOneOf(TEXTILE_SUPPLIER_TYPES, input.supplierType)) {
    return { row: null, error: "Tipo de proveedor no válido." };
  }
  const email = cleanText(input.contactEmail);
  if (email && !isValidEmail(email)) {
    return { row: null, error: "El correo de contacto no tiene un formato válido." };
  }
  return {
    row: {
      name: name.name,
      tax_id: cleanText(input.taxId),
      country: cleanText(input.country),
      city: cleanText(input.city),
      contact_name: cleanText(input.contactName),
      contact_email: email,
      contact_phone: cleanText(input.contactPhone),
      supplier_type: input.supplierType,
      is_critical: Boolean(input.isCritical),
      notes: cleanText(input.notes),
    },
    error: null,
  };
}

export async function createTextileSupplierAction(
  input: TextileSupplierInput
): Promise<TextileCatalogActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  // T9F.2 · Bloqueador 1: límite del plan del MÓDULO Textiles ANTES del
  // INSERT (conteo real en BD vía check_module_resource_allowance; Demo
  // limitado, Full/Extra ilimitados; fail-closed si no puede verificarse).
  const limitCheck = await checkTextilesResourceLimit("suppliers");
  if (!limitCheck.allowed) return { error: limitCheck.error };
  const validated = validateSupplierInput(input);
  if (validated.row === null) return { error: validated.error };

  const supabase = await createServerClient();
  const { error } = await supabase.from("textile_suppliers").insert({
    organization_id: g.ok.organizationId,
    ...validated.row,
  });
  if (isUniqueViolation(error)) return { error: "Ya existe un proveedor con ese nombre." };
  if (error) return { error: "No fue posible crear el proveedor." };
  revalidatePath(CATALOGS_PATH);
  return { error: null };
}

export async function updateTextileSupplierAction(
  id: string,
  input: TextileSupplierInput
): Promise<TextileCatalogActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const validated = validateSupplierInput(input);
  if (validated.row === null) return { error: validated.error };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("textile_suppliers")
    .update({ ...validated.row, updated_by: (await supabase.auth.getUser()).data.user?.id ?? null })
    .eq("id", id)
    .eq("organization_id", g.ok.organizationId);
  if (isUniqueViolation(error)) return { error: "Ya existe un proveedor con ese nombre." };
  if (error) return { error: "No fue posible actualizar el proveedor." };
  revalidatePath(CATALOGS_PATH);
  return { error: null };
}

export async function setTextileSupplierActiveAction(
  id: string,
  isActive: boolean
): Promise<TextileCatalogActionState> {
  return setActive("textile_suppliers", id, isActive, "el proveedor");
}

// ---------------------------------------------------------------------------
// Materiales e insumos
// ---------------------------------------------------------------------------

export type TextileMaterialInput = {
  name: string;
  internalCode?: string;
  materialType: string;
  primaryFiberTypeId?: string;
  supplierId?: string;
  declaredComposition?: string;
  countryOfOrigin?: string;
  recycledClaim?: boolean;
  organicClaim?: boolean;
  hasSupplierDatasheet?: boolean;
  hasCompositionSupport?: boolean;
  notes?: string;
};

async function validateMaterialInput(
  organizationId: string,
  input: TextileMaterialInput
): Promise<{ row: Record<string, unknown>; error: null } | { row: null; error: string }> {
  const name = validateCatalogName(input.name);
  if (name.error) return { row: null, error: name.error };
  if (!isOneOf(TEXTILE_MATERIAL_TYPES, input.materialType)) {
    return { row: null, error: "Tipo de material no válido." };
  }
  const supplierId = cleanText(input.supplierId);
  if (supplierId && !(await textileSupplierBelongsToOrg(organizationId, supplierId))) {
    return { row: null, error: "El proveedor seleccionado no es válido." };
  }
  const fiberTypeId = cleanText(input.primaryFiberTypeId);
  if (fiberTypeId && !(await textileFiberTypeIsActive(organizationId, fiberTypeId))) {
    return { row: null, error: "El tipo de fibra seleccionado no es válido o está inactivo." };
  }
  return {
    row: {
      name: name.name,
      internal_code: cleanText(input.internalCode),
      material_type: input.materialType,
      primary_fiber_type_id: fiberTypeId,
      supplier_id: supplierId,
      declared_composition: cleanText(input.declaredComposition),
      country_of_origin: cleanText(input.countryOfOrigin),
      recycled_claim: Boolean(input.recycledClaim),
      organic_claim: Boolean(input.organicClaim),
      has_supplier_datasheet: Boolean(input.hasSupplierDatasheet),
      has_composition_support: Boolean(input.hasCompositionSupport),
      notes: cleanText(input.notes),
    },
    error: null,
  };
}

export async function createTextileMaterialAction(
  input: TextileMaterialInput
): Promise<TextileCatalogActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  // T9F.2 · Bloqueador 1: límite del plan del MÓDULO Textiles ANTES del
  // INSERT (conteo real en BD vía check_module_resource_allowance; Demo
  // limitado, Full/Extra ilimitados; fail-closed si no puede verificarse).
  const limitCheck = await checkTextilesResourceLimit("materials");
  if (!limitCheck.allowed) return { error: limitCheck.error };
  const validated = await validateMaterialInput(g.ok.organizationId, input);
  if (validated.row === null) return { error: validated.error };

  const supabase = await createServerClient();
  const { error } = await supabase.from("textile_materials").insert({
    organization_id: g.ok.organizationId,
    ...validated.row,
  });
  if (isUniqueViolation(error)) {
    return { error: "Ya existe un material con ese nombre o código interno." };
  }
  if (error) return { error: "No fue posible crear el material." };
  revalidatePath(CATALOGS_PATH);
  return { error: null };
}

export async function updateTextileMaterialAction(
  id: string,
  input: TextileMaterialInput
): Promise<TextileCatalogActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const validated = await validateMaterialInput(g.ok.organizationId, input);
  if (validated.row === null) return { error: validated.error };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("textile_materials")
    .update({ ...validated.row, updated_by: (await supabase.auth.getUser()).data.user?.id ?? null })
    .eq("id", id)
    .eq("organization_id", g.ok.organizationId);
  if (isUniqueViolation(error)) {
    return { error: "Ya existe un material con ese nombre o código interno." };
  }
  if (error) return { error: "No fue posible actualizar el material." };
  revalidatePath(CATALOGS_PATH);
  return { error: null };
}

export async function setTextileMaterialActiveAction(
  id: string,
  isActive: boolean
): Promise<TextileCatalogActionState> {
  return setActive("textile_materials", id, isActive, "el material");
}

// ---------------------------------------------------------------------------
// Avíos / componentes
// ---------------------------------------------------------------------------

export type TextileComponentInput = {
  name: string;
  componentType: string;
  materialDescription?: string;
  supplierId?: string;
  separability?: string;
  replacementPossible?: boolean | null;
  notes?: string;
};

async function validateComponentInput(
  organizationId: string,
  input: TextileComponentInput
): Promise<{ row: Record<string, unknown>; error: null } | { row: null; error: string }> {
  const name = validateCatalogName(input.name);
  if (name.error) return { row: null, error: name.error };
  if (!isOneOf(TEXTILE_COMPONENT_TYPES, input.componentType)) {
    return { row: null, error: "Tipo de componente no válido." };
  }
  const separability = cleanText(input.separability) ?? "not_evaluated";
  if (!isOneOf(TEXTILE_SEPARABILITY_VALUES, separability)) {
    return { row: null, error: "Valor de separabilidad no válido." };
  }
  const supplierId = cleanText(input.supplierId);
  if (supplierId && !(await textileSupplierBelongsToOrg(organizationId, supplierId))) {
    return { row: null, error: "El proveedor seleccionado no es válido." };
  }
  return {
    row: {
      name: name.name,
      component_type: input.componentType,
      material_description: cleanText(input.materialDescription),
      supplier_id: supplierId,
      separability,
      replacement_possible:
        typeof input.replacementPossible === "boolean" ? input.replacementPossible : null,
      notes: cleanText(input.notes),
    },
    error: null,
  };
}

export async function createTextileComponentAction(
  input: TextileComponentInput
): Promise<TextileCatalogActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const validated = await validateComponentInput(g.ok.organizationId, input);
  if (validated.row === null) return { error: validated.error };

  const supabase = await createServerClient();
  const { error } = await supabase.from("textile_components").insert({
    organization_id: g.ok.organizationId,
    ...validated.row,
  });
  if (isUniqueViolation(error)) return { error: "Ya existe un componente con ese nombre." };
  if (error) return { error: "No fue posible crear el componente." };
  revalidatePath(CATALOGS_PATH);
  return { error: null };
}

export async function updateTextileComponentAction(
  id: string,
  input: TextileComponentInput
): Promise<TextileCatalogActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const validated = await validateComponentInput(g.ok.organizationId, input);
  if (validated.row === null) return { error: validated.error };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("textile_components")
    .update({ ...validated.row, updated_by: (await supabase.auth.getUser()).data.user?.id ?? null })
    .eq("id", id)
    .eq("organization_id", g.ok.organizationId);
  if (isUniqueViolation(error)) return { error: "Ya existe un componente con ese nombre." };
  if (error) return { error: "No fue posible actualizar el componente." };
  revalidatePath(CATALOGS_PATH);
  return { error: null };
}

export async function setTextileComponentActiveAction(
  id: string,
  isActive: boolean
): Promise<TextileCatalogActionState> {
  return setActive("textile_components", id, isActive, "el componente");
}

// ---------------------------------------------------------------------------
// Procesos internos
// ---------------------------------------------------------------------------

export type TextileProcessInput = {
  name: string;
  processType: string;
  description?: string;
  responsibleArea?: string;
  traceabilityRisk?: string;
  recordsExpected?: string;
};

function validateProcessInput(input: TextileProcessInput):
  | { row: Record<string, unknown>; error: null }
  | { row: null; error: string } {
  const name = validateCatalogName(input.name);
  if (name.error) return { row: null, error: name.error };
  if (!isOneOf(TEXTILE_PROCESS_TYPES, input.processType)) {
    return { row: null, error: "Tipo de proceso no válido." };
  }
  const risk = cleanText(input.traceabilityRisk) ?? "not_evaluated";
  if (!isOneOf(TEXTILE_TRACEABILITY_RISK_VALUES, risk)) {
    return { row: null, error: "Nivel de riesgo no válido." };
  }
  return {
    row: {
      name: name.name,
      process_type: input.processType,
      description: cleanText(input.description),
      responsible_area: cleanText(input.responsibleArea),
      traceability_risk: risk,
      records_expected: cleanText(input.recordsExpected),
    },
    error: null,
  };
}

export async function createTextileProcessAction(
  input: TextileProcessInput
): Promise<TextileCatalogActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const validated = validateProcessInput(input);
  if (validated.row === null) return { error: validated.error };

  const supabase = await createServerClient();
  const { error } = await supabase.from("textile_processes").insert({
    organization_id: g.ok.organizationId,
    ...validated.row,
  });
  if (isUniqueViolation(error)) return { error: "Ya existe un proceso con ese nombre." };
  if (error) return { error: "No fue posible crear el proceso." };
  revalidatePath(CATALOGS_PATH);
  return { error: null };
}

export async function updateTextileProcessAction(
  id: string,
  input: TextileProcessInput
): Promise<TextileCatalogActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const validated = validateProcessInput(input);
  if (validated.row === null) return { error: validated.error };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("textile_processes")
    .update({ ...validated.row, updated_by: (await supabase.auth.getUser()).data.user?.id ?? null })
    .eq("id", id)
    .eq("organization_id", g.ok.organizationId);
  if (isUniqueViolation(error)) return { error: "Ya existe un proceso con ese nombre." };
  if (error) return { error: "No fue posible actualizar el proceso." };
  revalidatePath(CATALOGS_PATH);
  return { error: null };
}

export async function setTextileProcessActiveAction(
  id: string,
  isActive: boolean
): Promise<TextileCatalogActionState> {
  return setActive("textile_processes", id, isActive, "el proceso");
}

// ---------------------------------------------------------------------------
// Procesos tercerizados
// ---------------------------------------------------------------------------

export type TextileOutsourcedProcessInput = {
  name: string;
  processType: string;
  supplierId?: string;
  description?: string;
  recordsExpected?: string;
  traceabilityRisk?: string;
  notes?: string;
};

async function validateOutsourcedInput(
  organizationId: string,
  input: TextileOutsourcedProcessInput
): Promise<{ row: Record<string, unknown>; error: null } | { row: null; error: string }> {
  const name = validateCatalogName(input.name);
  if (name.error) return { row: null, error: name.error };
  if (!isOneOf(TEXTILE_OUTSOURCED_PROCESS_TYPES, input.processType)) {
    return { row: null, error: "Tipo de proceso tercerizado no válido." };
  }
  const risk = cleanText(input.traceabilityRisk) ?? "not_evaluated";
  if (!isOneOf(TEXTILE_TRACEABILITY_RISK_VALUES, risk)) {
    return { row: null, error: "Nivel de riesgo no válido." };
  }
  const supplierId = cleanText(input.supplierId);
  if (supplierId && !(await textileSupplierBelongsToOrg(organizationId, supplierId))) {
    return { row: null, error: "El tercero seleccionado no es válido." };
  }
  return {
    row: {
      name: name.name,
      process_type: input.processType,
      supplier_id: supplierId,
      description: cleanText(input.description),
      records_expected: cleanText(input.recordsExpected),
      traceability_risk: risk,
      notes: cleanText(input.notes),
    },
    error: null,
  };
}

export async function createTextileOutsourcedProcessAction(
  input: TextileOutsourcedProcessInput
): Promise<TextileCatalogActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const validated = await validateOutsourcedInput(g.ok.organizationId, input);
  if (validated.row === null) return { error: validated.error };

  const supabase = await createServerClient();
  const { error } = await supabase.from("textile_outsourced_processes").insert({
    organization_id: g.ok.organizationId,
    ...validated.row,
  });
  if (isUniqueViolation(error)) return { error: "Ya existe un proceso tercerizado con ese nombre." };
  if (error) return { error: "No fue posible crear el proceso tercerizado." };
  revalidatePath(CATALOGS_PATH);
  return { error: null };
}

export async function updateTextileOutsourcedProcessAction(
  id: string,
  input: TextileOutsourcedProcessInput
): Promise<TextileCatalogActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const validated = await validateOutsourcedInput(g.ok.organizationId, input);
  if (validated.row === null) return { error: validated.error };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("textile_outsourced_processes")
    .update({ ...validated.row, updated_by: (await supabase.auth.getUser()).data.user?.id ?? null })
    .eq("id", id)
    .eq("organization_id", g.ok.organizationId);
  if (isUniqueViolation(error)) return { error: "Ya existe un proceso tercerizado con ese nombre." };
  if (error) return { error: "No fue posible actualizar el proceso tercerizado." };
  revalidatePath(CATALOGS_PATH);
  return { error: null };
}

export async function setTextileOutsourcedProcessActiveAction(
  id: string,
  isActive: boolean
): Promise<TextileCatalogActionState> {
  return setActive("textile_outsourced_processes", id, isActive, "el proceso tercerizado");
}

// ---------------------------------------------------------------------------
// Activar / desactivar (común)
// ---------------------------------------------------------------------------

async function setActive(
  table:
    | "textile_suppliers"
    | "textile_materials"
    | "textile_components"
    | "textile_processes"
    | "textile_outsourced_processes",
  id: string,
  isActive: boolean,
  label: string
): Promise<TextileCatalogActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from(table)
    .update({
      is_active: isActive,
      updated_by: (await supabase.auth.getUser()).data.user?.id ?? null,
    })
    .eq("id", id)
    .eq("organization_id", g.ok.organizationId);
  if (error) {
    return { error: `No fue posible ${isActive ? "activar" : "desactivar"} ${label}.` };
  }
  revalidatePath(CATALOGS_PATH);
  return { error: null };
}
