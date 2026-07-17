"use server";

import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { writeActiveOrgCookie } from "@/lib/auth/active-organization";
import {
  getUserOrganizations,
  getRoleInOrganization,
} from "@/lib/db/organizations";
import { toSafeOrgCreationError } from "@/lib/domain/platform";
import { assertMyLegalAcceptance } from "@/server/actions/legal";
import { LEGAL_ACCEPTANCE_REQUIRED_MESSAGE } from "@/lib/domain/legal";

export type OrgActionState = { error: string | null };

/**
 * Crea la organización mediante la RPC create_organization (SECURITY DEFINER):
 * organización + primera membership admin + módulos base, atómico y auditado.
 * Va con la SESIÓN DEL USUARIO: jamás con service_role.
 *
 * BLOQUEANTE 3 (corrección post Sprint 8.4): create_organization (0042)
 * ahora puede rechazar con reglas de NEGOCIO reales — ya tiene empresa, ya
 * creó una antes, o tiene invitación pendiente — y esos mensajes SÍ deben
 * llegar al usuario tal cual. toSafeOrgCreationError (lib/domain/platform.ts)
 * es una lista BLANCA: solo dos mensajes de negocio ya controlados pasan
 * tal cual: todo lo demás (errores técnicos, de conexión, o cualquier
 * mensaje no reconocido) cae al mensaje genérico.
 */
export async function createOrganizationAction(
  _prev: OrgActionState,
  formData: FormData
): Promise<OrgActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const taxId = String(formData.get("tax_id") ?? "").trim();
  const country = String(formData.get("country") ?? "").trim();

  if (!name) {
    return { error: "El nombre de la empresa no puede estar vacío." };
  }

  // Sprint 10D (Bloqueante 2): nunca confiar solo en que la UI haya
  // redirigido a tiempo a /legal/accept — la acción misma lo revisa.
  const { hasAccepted } = await assertMyLegalAcceptance();
  if (!hasAccepted) {
    return { error: LEGAL_ACCEPTANCE_REQUIRED_MESSAGE };
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("create_organization", {
    p_name: name,
    p_tax_id: taxId || null,
    p_country: country || null,
  });

  if (error || !data) {
    return { error: toSafeOrgCreationError(error?.message) };
  }

  await writeActiveOrgCookie(data as string);
  // Sprint 10D (Parte 4/7): una empresa RECIÉN CREADA va a onboarding,
  // nunca directo al dashboard — nadie empieza confundido sin saber qué
  // hacer primero. Seleccionar una empresa YA EXISTENTE (abajo) sigue
  // yendo directo a /dashboard.
  redirect("/onboarding");
}

/**
 * Selecciona la empresa activa. Valida EN SERVIDOR que el usuario tiene
 * membership activa en esa organización antes de escribir la cookie.
 */
export async function selectActiveOrganizationAction(formData: FormData) {
  const organizationId = String(formData.get("organization_id") ?? "");

  const organizations = await getUserOrganizations();
  const match = organizations.find((o) => o.organizationId === organizationId);

  if (!match) {
    redirect("/select-org?error=not-member");
  }

  await writeActiveOrgCookie(organizationId);
  redirect("/dashboard");
}

/** Organizaciones del usuario (para UI de selección). */
export async function getUserOrganizationsAction() {
  return getUserOrganizations();
}

/** Rol del usuario en la empresa activa indicada. */
export async function getRoleInActiveOrganizationAction(organizationId: string) {
  return getRoleInOrganization(organizationId);
}
