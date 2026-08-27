import "server-only";

import { createServerClient } from "@/lib/supabase/server";
import type { OrganizationAuthoringContext } from "@/lib/domain/organization-profile";

/**
 * Trazaloop · QUALITY-12.2B · La lectura del perfil de autoría.
 *
 * Una sola puerta, como la guía. Lo que sale de aquí es lo que verá quien
 * redacte —hoy una persona, mañana Trazaloop Intelligence— y por eso no
 * contiene un solo campo que no sirva para redactar: ni identificadores, ni
 * fechas técnicas, ni facturación, ni almacenamiento, ni miembros, ni planes.
 */

export type SectorOption = { code: string; name: string; description: string | null };

/** El catálogo de sectores, para pintar la lista. */
export async function listSectors(): Promise<SectorOption[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("organization_sectors")
    .select("code, name, description")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    code: String(r.code),
    name: String(r.name),
    description: (r.description as string | null) ?? null,
  }));
}

/**
 * El perfil compacto de una empresa.
 *
 * Devuelve `null` solo si la empresa no existe o no se puede leer. Un perfil
 * vacío NO es null: es un contexto con el nombre y nada más, que es lo que
 * tiene una empresa que acaba de nacer y es una respuesta perfectamente
 * utilizable.
 */
export async function getOrganizationAuthoringContext(
  organizationId: string
): Promise<OrganizationAuthoringContext | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("organization_authoring_context", {
    p_organization_id: organizationId,
  });
  if (error || !data) return null;

  const d = data as Record<string, unknown>;
  return {
    organizationName: String(d.organization_name ?? ""),
    sector: (d.sector as string | null) ?? null,
    primaryActivity: (d.primary_activity as string | null) ?? null,
    productsServices: Array.isArray(d.products_services)
      ? (d.products_services as string[]) : [],
    description: (d.description as string | null) ?? null,
  };
}

/** El perfil tal como lo edita quien administra: los valores en crudo. */
export type ProfileRow = {
  sectorCode: string | null;
  primaryActivity: string | null;
  productsServices: string[];
  description: string | null;
};

export async function getOrganizationProfile(
  organizationId: string
): Promise<ProfileRow | null> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("organizations")
    .select("sector_code, primary_activity, products_services, organization_description")
    .eq("id", organizationId)
    .maybeSingle();
  if (!data) return null;
  const d = data as Record<string, unknown>;
  return {
    sectorCode: (d.sector_code as string | null) ?? null,
    primaryActivity: (d.primary_activity as string | null) ?? null,
    productsServices: (d.products_services as string[] | null) ?? [],
    description: (d.organization_description as string | null) ?? null,
  };
}

export async function updateOrganizationProfile(
  organizationId: string,
  payload: Record<string, unknown>
): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("organizations")
    .update(payload)
    .eq("id", organizationId)
    .select("id");
  if (error) return { error: "No fue posible guardar el perfil de la empresa." };
  if ((data ?? []).length === 0) {
    return { error: "Tu rol permite consultar estos datos, pero no modificarlos." };
  }
  return { error: null };
}
