"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { requireTextilesForAction } from "@/lib/auth/require-textiles-module";
import { checkTextilesCanMutate } from "@/server/actions/module-plans";
import {
  getTextileSupplierUsage,
  getTextileMaterialUsage,
  getTextileComponentUsage,
  getTextileProcessUsage,
  getTextileOutsourcedProcessUsage,
  getTextileFiberTypeUsage,
  type TextileCatalogUsage,
} from "@/lib/db/textiles-catalogs";
import {
  TEXTILE_FIBER_FAMILIES,
  canAdministerTextileCatalogs,
  validateCatalogName,
  cleanText,
  isOneOf,
} from "@/lib/domain/textiles-catalogs";

/**
 * Trazaloop · Sprint T9E (Textil) · Acciones ADMINISTRATIVAS de catálogos:
 * eliminación física segura y fibras personalizadas por organización.
 *
 * Política de eliminación (defecto 4.6): Trazaloop es una plataforma de
 * trazabilidad — el hard delete SOLO procede cuando el registro:
 *   · pertenece a la organización activa (organization_id del SERVIDOR);
 *   · el usuario tiene rol admin/quality (validado aquí Y por la RLS);
 *   · NO tiene ninguna relación (materiales, componentes, composiciones,
 *     lotes, órdenes/corridas, pasos, evidencias vinculadas…), verificado
 *     en servidor ANTES de borrar; y las FKs de BD lo re-verifican (23503).
 * Con cualquier relación → se explica el motivo y se ofrece desactivar.
 * Los registros históricos de trazabilidad (lotes, órdenes, evaluaciones,
 * pasaportes, evidencias con historia) NO tienen acción de borrado aquí.
 *
 * Fibras (defecto 4.4): el catálogo base (organization_id NULL) es global e
 * intocable (RLS + trigger 0093). Las personalizadas pertenecen a la
 * organización, exigen admin/quality y nombre único; solo se eliminan sin
 * uso — con uso se desactivan.
 *
 * Contrato de seguridad idéntico a T3: triple guarda del módulo, modo solo
 * lectura de plataforma, organization_id jamás del cliente, mensajes sin
 * detalles internos, nada usa service_role.
 */

export type TextileCatalogAdminActionState = { error: string | null };

const CATALOGS_PATH = "/textiles/catalogs";
const UNIQUE_VIOLATION = "23505";
const FK_VIOLATION = "23503";

const ROLE_REQUIRED_ERROR =
  "Eliminar registros de catálogo requiere rol administrador o calidad.";

type GateOk = { organizationId: string; roleCode: string };

async function gate(): Promise<{ ok: GateOk | null; error: string | null }> {
  const access = await requireTextilesForAction();
  if (access.org === null) return { ok: null, error: access.error };
  const mutateCheck = await checkTextilesCanMutate();
  if (!mutateCheck.allowed) return { ok: null, error: mutateCheck.error };
  return {
    ok: { organizationId: access.org.organizationId, roleCode: access.org.roleCode },
    error: null,
  };
}

async function currentUserId(): Promise<string | null> {
  const supabase = await createServerClient();
  return (await supabase.auth.getUser()).data.user?.id ?? null;
}

function usageMessage(label: string, usage: TextileCatalogUsage[]): string {
  const detail = usage.map((u) => `${u.count} ${u.label}`).join(", ");
  return (
    `No es posible eliminar ${label}: está en uso por ${detail}. ` +
    "Para conservar la trazabilidad histórica, desactívalo en su lugar."
  );
}

// ---------------------------------------------------------------------------
// Eliminación física segura (5 catálogos por empresa)
// ---------------------------------------------------------------------------

type DeletableCatalogTable =
  | "textile_suppliers"
  | "textile_materials"
  | "textile_components"
  | "textile_processes"
  | "textile_outsourced_processes";

async function deleteCatalogRecord(
  table: DeletableCatalogTable,
  id: string,
  label: string,
  usageFor: (organizationId: string, id: string) => Promise<TextileCatalogUsage[]>
): Promise<TextileCatalogAdminActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canAdministerTextileCatalogs(g.ok.roleCode)) {
    return { error: ROLE_REQUIRED_ERROR };
  }
  const recordId = cleanText(id);
  if (!recordId) return { error: "Selecciona el registro a eliminar." };

  // Verificación de relaciones EN SERVIDOR antes de tocar la BD: con
  // cualquier uso, la eliminación se rechaza con el motivo exacto.
  const usage = await usageFor(g.ok.organizationId, recordId);
  if (usage.length > 0) {
    return { error: usageMessage(label, usage) };
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from(table)
    .delete()
    .eq("id", recordId)
    .eq("organization_id", g.ok.organizationId)
    .select("id");
  if (error) {
    // Respaldo de integridad: si una relación apareció entre el conteo y el
    // delete (carrera), la FK lo detiene — jamás se rompe la trazabilidad.
    if (error.code === FK_VIOLATION) {
      return {
        error: `No es posible eliminar ${label}: otros registros lo utilizan. Desactívalo en su lugar.`,
      };
    }
    return { error: `No fue posible eliminar ${label} (verifica tu rol en la organización).` };
  }
  if (!data || data.length === 0) {
    return { error: `${capitalize(label)} no existe o no pertenece a tu organización.` };
  }
  revalidatePath(CATALOGS_PATH);
  return { error: null };
}

function capitalize(label: string): string {
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export async function deleteTextileSupplierAction(
  id: string
): Promise<TextileCatalogAdminActionState> {
  return deleteCatalogRecord("textile_suppliers", id, "el proveedor", getTextileSupplierUsage);
}

export async function deleteTextileMaterialAction(
  id: string
): Promise<TextileCatalogAdminActionState> {
  return deleteCatalogRecord("textile_materials", id, "el material", getTextileMaterialUsage);
}

export async function deleteTextileComponentAction(
  id: string
): Promise<TextileCatalogAdminActionState> {
  return deleteCatalogRecord("textile_components", id, "el componente", getTextileComponentUsage);
}

export async function deleteTextileProcessAction(
  id: string
): Promise<TextileCatalogAdminActionState> {
  return deleteCatalogRecord("textile_processes", id, "el proceso", getTextileProcessUsage);
}

export async function deleteTextileOutsourcedProcessAction(
  id: string
): Promise<TextileCatalogAdminActionState> {
  return deleteCatalogRecord(
    "textile_outsourced_processes",
    id,
    "el proceso tercerizado",
    getTextileOutsourcedProcessUsage
  );
}

// ---------------------------------------------------------------------------
// Fibras personalizadas por organización (0093)
// ---------------------------------------------------------------------------

export type TextileCustomFiberInput = {
  name: string;
  fiberFamily: string;
  isRecycledOption?: boolean;
  notes?: string;
};

const FIBER_ROLE_REQUIRED_ERROR =
  "Gestionar fibras personalizadas requiere rol administrador o calidad.";

function validateCustomFiberInput(input: TextileCustomFiberInput):
  | { row: { name: string; fiber_family: string; is_recycled_option: boolean; notes: string | null }; error: null }
  | { row: null; error: string } {
  const name = validateCatalogName(input.name);
  if (name.name === null) return { row: null, error: name.error };
  if (!isOneOf(TEXTILE_FIBER_FAMILIES, input.fiberFamily)) {
    return { row: null, error: "Familia de fibra no válida." };
  }
  return {
    row: {
      name: name.name,
      fiber_family: input.fiberFamily,
      is_recycled_option: Boolean(input.isRecycledOption),
      notes: cleanText(input.notes),
    },
    error: null,
  };
}

/** ¿Ya existe una fibra visible (base o propia) con ese nombre? */
async function fiberNameTaken(
  organizationId: string,
  name: string,
  excludeId?: string
): Promise<boolean> {
  const supabase = await createServerClient();
  let query = supabase
    .from("textile_fiber_types")
    .select("id")
    .ilike("name", name)
    .or(`organization_id.is.null,organization_id.eq.${organizationId}`)
    .limit(1);
  if (excludeId) query = query.neq("id", excludeId);
  const { data } = await query;
  return Boolean(data && data.length > 0);
}

export async function createTextileCustomFiberAction(
  input: TextileCustomFiberInput
): Promise<TextileCatalogAdminActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canAdministerTextileCatalogs(g.ok.roleCode)) {
    return { error: FIBER_ROLE_REQUIRED_ERROR };
  }
  const validated = validateCustomFiberInput(input);
  if (validated.row === null) return { error: validated.error };
  if (await fiberNameTaken(g.ok.organizationId, validated.row.name)) {
    return { error: "Ya existe una fibra con ese nombre (base o personalizada)." };
  }

  const supabase = await createServerClient();
  const { error } = await supabase.from("textile_fiber_types").insert({
    organization_id: g.ok.organizationId,
    // Código técnico único global; el prefijo evita colisiones con el
    // catálogo base y no filtra información entre organizaciones.
    code: `custom_${randomUUID()}`,
    ...validated.row,
    // Las personalizadas se listan después del catálogo base sembrado.
    display_order: 1000,
    created_by: await currentUserId(),
  });
  if (error && error.code === UNIQUE_VIOLATION) {
    return { error: "Ya existe una fibra con ese nombre (base o personalizada)." };
  }
  if (error) return { error: "No fue posible crear la fibra personalizada." };
  revalidatePath(`${CATALOGS_PATH}/fibers`);
  revalidatePath(CATALOGS_PATH);
  return { error: null };
}

export async function updateTextileCustomFiberAction(
  id: string,
  input: TextileCustomFiberInput
): Promise<TextileCatalogAdminActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canAdministerTextileCatalogs(g.ok.roleCode)) {
    return { error: FIBER_ROLE_REQUIRED_ERROR };
  }
  const validated = validateCustomFiberInput(input);
  if (validated.row === null) return { error: validated.error };
  if (await fiberNameTaken(g.ok.organizationId, validated.row.name, id)) {
    return { error: "Ya existe una fibra con ese nombre (base o personalizada)." };
  }

  const supabase = await createServerClient();
  // El filtro por organization_id excluye por sí solo a las fibras base
  // (organization_id NULL): una fibra global jamás coincide con este update.
  const { data, error } = await supabase
    .from("textile_fiber_types")
    .update({ ...validated.row, updated_by: await currentUserId() })
    .eq("id", id)
    .eq("organization_id", g.ok.organizationId)
    .select("id");
  if (error && error.code === UNIQUE_VIOLATION) {
    return { error: "Ya existe una fibra con ese nombre (base o personalizada)." };
  }
  if (error || !data || data.length === 0) {
    return { error: "La fibra no existe, es del catálogo base o no pertenece a tu organización." };
  }
  revalidatePath(`${CATALOGS_PATH}/fibers`);
  revalidatePath(CATALOGS_PATH);
  return { error: null };
}

export async function setTextileCustomFiberActiveAction(
  id: string,
  isActive: boolean
): Promise<TextileCatalogAdminActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canAdministerTextileCatalogs(g.ok.roleCode)) {
    return { error: FIBER_ROLE_REQUIRED_ERROR };
  }
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("textile_fiber_types")
    .update({ is_active: isActive, updated_by: await currentUserId() })
    .eq("id", id)
    .eq("organization_id", g.ok.organizationId)
    .select("id");
  if (error || !data || data.length === 0) {
    return {
      error: `No fue posible ${isActive ? "activar" : "desactivar"} la fibra (las fibras del catálogo base no se modifican).`,
    };
  }
  revalidatePath(`${CATALOGS_PATH}/fibers`);
  revalidatePath(CATALOGS_PATH);
  return { error: null };
}

export async function deleteTextileCustomFiberAction(
  id: string
): Promise<TextileCatalogAdminActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canAdministerTextileCatalogs(g.ok.roleCode)) {
    return { error: FIBER_ROLE_REQUIRED_ERROR };
  }
  const fiberId = cleanText(id);
  if (!fiberId) return { error: "Selecciona la fibra a eliminar." };

  const usage = await getTextileFiberTypeUsage(g.ok.organizationId, fiberId);
  if (usage.length > 0) {
    return { error: usageMessage("la fibra personalizada", usage) };
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("textile_fiber_types")
    .delete()
    .eq("id", fiberId)
    .eq("organization_id", g.ok.organizationId)
    .select("id");
  if (error) {
    if (error.code === FK_VIOLATION) {
      return {
        error: "No es posible eliminar la fibra personalizada: otros registros la utilizan. Desactívala en su lugar.",
      };
    }
    return { error: "No fue posible eliminar la fibra personalizada." };
  }
  if (!data || data.length === 0) {
    return {
      error: "La fibra no existe, es del catálogo base o no pertenece a tu organización.",
    };
  }
  revalidatePath(`${CATALOGS_PATH}/fibers`);
  revalidatePath(CATALOGS_PATH);
  return { error: null };
}
