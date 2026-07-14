import "server-only";

import { createServerClient } from "@/lib/supabase/server";
import type { TrustedCompanySettingsUpdate, TrustedProfileUpdate } from "@/lib/domain/settings";

/**
 * Trazaloop · Sprint 8.3 · Capa de datos de configuración de empresa y
 * perfil. Reutiliza organizations y profiles tal como existen (Sprint 1);
 * ningún UPDATE aquí usa service_role: siempre corre con la sesión real
 * del usuario, sujeta a las políticas organizations_update / profiles_update
 * ya existentes.
 */

export type CompanySettings = {
  organizationId: string;
  name: string;
  legalName: string | null;
  taxId: string | null;
  contactEmail: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  website: string | null;
};

const COMPANY_SELECT =
  "id, name, legal_name, tax_id, contact_email, phone, address, city, country, website";

export async function getCompanySettings(orgId: string): Promise<CompanySettings | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("organizations")
    .select(COMPANY_SELECT)
    .eq("id", orgId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    organizationId: data.id as string,
    name: data.name as string,
    legalName: (data.legal_name as string | null) ?? null,
    taxId: (data.tax_id as string | null) ?? null,
    contactEmail: (data.contact_email as string | null) ?? null,
    phone: (data.phone as string | null) ?? null,
    address: (data.address as string | null) ?? null,
    city: (data.city as string | null) ?? null,
    country: (data.country as string | null) ?? null,
    website: (data.website as string | null) ?? null,
  };
}

/** UPDATE acotado SIEMPRE por `.eq("id", orgId)`, donde orgId viene de la
 *  empresa activa validada en servidor — nunca del cliente. La política
 *  organizations_update (is_org_admin) es la barrera real; esto además
 *  confirma que sí se tocó una fila (0 filas = no era admin o la empresa
 *  no existe, mensaje claro en vez de un "éxito" silencioso y falso). */
export async function updateCompanySettings(
  orgId: string,
  payload: TrustedCompanySettingsUpdate
): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("organizations")
    .update(payload)
    .eq("id", orgId)
    .select("id");
  if (error) return { error: "No fue posible guardar los datos de la empresa." };
  if ((data ?? []).length === 0) {
    return { error: "Tu rol no permite editar los datos de esta empresa." };
  }
  return { error: null };
}

export type MyProfile = {
  userId: string;
  fullName: string | null;
  email: string;
  phone: string | null;
  position: string | null;
};

export async function getMyProfile(userId: string): Promise<MyProfile | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, phone, position")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    userId: data.id as string,
    fullName: (data.full_name as string | null) ?? null,
    email: data.email as string,
    phone: (data.phone as string | null) ?? null,
    position: (data.position as string | null) ?? null,
  };
}

/** UPDATE acotado SIEMPRE por `.eq("id", userId)`, donde userId viene de
 *  la SESIÓN validada en servidor — nunca de un campo del formulario. La
 *  política profiles_update (id = auth.uid()) es la barrera real. */
export async function updateMyProfile(
  userId: string,
  payload: TrustedProfileUpdate
): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .update(payload)
    .eq("id", userId)
    .select("id");
  if (error) return { error: "No fue posible guardar tu perfil." };
  if ((data ?? []).length === 0) {
    return { error: "No fue posible actualizar tu perfil." };
  }
  return { error: null };
}
