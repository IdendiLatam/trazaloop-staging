"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { requireSession } from "@/lib/auth/require-session";
import {
  getCompanySettings,
  updateCompanySettings,
  uploadCompanyLogo,
  removeCompanyLogo,
  getMyProfile,
  updateMyProfile,
  type CompanySettings,
  type MyProfile,
} from "@/lib/db/settings";
import {
  canEditCompany,
  validateCompanySettings,
  buildCompanySettingsUpdatePayload,
  validateProfileSettings,
  buildProfileUpdatePayload,
  validateLogoFile,
  logoExtensionForType,
} from "@/lib/domain/settings";

/**
 * Trazaloop · Sprint 8.3 · Server actions de configuración.
 *
 * organization_id SIEMPRE sale de requireActiveOrg() (nunca del cliente);
 * el id de perfil SIEMPRE sale de requireSession() (nunca de un campo del
 * formulario). Sin service_role: todo corre con la sesión real, sujeto a
 * las políticas organizations_update / profiles_update ya existentes
 * desde el Sprint 1 — este archivo las refuerza con validación clara en
 * servidor, no las reemplaza.
 */

export type SettingsActionState = { error: string | null; success?: boolean };
const okState: SettingsActionState = { error: null, success: true };

// ---------------------------------------------------------------------------
// Datos de empresa.
// ---------------------------------------------------------------------------
export async function getCompanySettingsAction(): Promise<{
  data: CompanySettings | null;
  canManage: boolean;
}> {
  const org = await requireActiveOrg();
  const data = await getCompanySettings(org.organizationId);
  return { data, canManage: canEditCompany(org.roleCode) };
}

export async function updateCompanySettingsAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  const org = await requireActiveOrg();

  if (!canEditCompany(org.roleCode)) {
    return { error: "Tu rol permite consultar estos datos, pero no modificarlos." };
  }

  const input = {
    name: String(formData.get("name") ?? ""),
    legalName: String(formData.get("legal_name") ?? ""),
    taxId: String(formData.get("tax_id") ?? ""),
    contactEmail: String(formData.get("contact_email") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    address: String(formData.get("address") ?? ""),
    city: String(formData.get("city") ?? ""),
    country: String(formData.get("country") ?? ""),
    website: String(formData.get("website") ?? ""),
  };

  const validation = validateCompanySettings(input);
  if (validation.error) return { error: validation.error };

  // organizationId SIEMPRE de la empresa activa validada en servidor: el
  // payload que construye buildCompanySettingsUpdatePayload ni siquiera
  // declara un campo organization_id/id (ver lib/domain/settings.ts).
  const payload = buildCompanySettingsUpdatePayload(input);
  const { error } = await updateCompanySettings(org.organizationId, payload);
  if (error) return { error };

  revalidatePath("/settings/company");
  revalidatePath("/implementation");
  revalidatePath("/team");
  return okState;
}

// ---------------------------------------------------------------------------
// Logo de empresa (Sprint 9.2, Parte 6). Solo admin — mismo guarda que el
// resto de "Datos de empresa" (canEditCompany, organizations_update).
// ---------------------------------------------------------------------------
export async function uploadCompanyLogoAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  const org = await requireActiveOrg();
  if (!canEditCompany(org.roleCode)) {
    return { error: "Tu rol permite consultar estos datos, pero no modificarlos." };
  }

  const file = formData.get("logo") as File | null;
  if (!file || file.size === 0) {
    return { error: "Selecciona un archivo de imagen." };
  }

  const validation = validateLogoFile({ size: file.size, type: file.type });
  if (validation.error) return { error: validation.error };

  const bytes = await file.arrayBuffer();
  const extension = logoExtensionForType(file.type);
  const { error } = await uploadCompanyLogo(org.organizationId, bytes, file.type, extension);
  if (error) return { error };

  revalidatePath("/settings/company");
  return okState;
}

export async function removeCompanyLogoAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  const org = await requireActiveOrg();
  if (!canEditCompany(org.roleCode)) {
    return { error: "Tu rol permite consultar estos datos, pero no modificarlos." };
  }

  const storagePath = String(formData.get("storage_path") ?? "");
  if (!storagePath) return { error: "No hay logo para quitar." };

  const { error } = await removeCompanyLogo(org.organizationId, storagePath);
  if (error) return { error };

  revalidatePath("/settings/company");
  return okState;
}

// ---------------------------------------------------------------------------
// Mi perfil.
// ---------------------------------------------------------------------------
export async function getMyProfileAction(): Promise<MyProfile | null> {
  const { user } = await requireSession();
  return getMyProfile(user.id);
}

export async function updateMyProfileAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  const { user } = await requireSession();

  const input = {
    fullName: String(formData.get("full_name") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    position: String(formData.get("position") ?? ""),
  };

  const validation = validateProfileSettings(input);
  if (validation.error) return { error: validation.error };

  // El id que se actualiza SIEMPRE es user.id de la sesión — el
  // formulario nunca envía (ni el payload construido declara) un id ni un
  // email: el correo de autenticación no se toca desde aquí.
  const payload = buildProfileUpdatePayload(input);
  const { error } = await updateMyProfile(user.id, payload);
  if (error) return { error };

  revalidatePath("/settings/profile");
  revalidatePath("/team");
  return okState;
}
