"use server";

import { revalidatePath } from "next/cache";
import { requireTextilesForAction } from "@/lib/auth/require-textiles-module";
import { checkTextilesCanMutate } from "@/server/actions/module-plans";
import { getTechnicalPassport } from "@/lib/db/textiles-passport";
import {
  createPassportShareLink,
  revokePassportShareLink,
  setPassportShareLinkDisabled,
  updatePassportShareLinkExpiry,
} from "@/lib/db/textiles-passport-share";
import { cleanText } from "@/lib/domain/textiles-catalogs";
import { TEXTILE_SHARE_LINK_DEFAULT_EXPIRY_DAYS } from "@/lib/domain/textiles-passport";

/**
 * Trazaloop · Sprint T9D (Textil) · Server actions de los enlaces privados
 * compartibles. Todas verifican módulo Textil + organización + rol y que el
 * pasaporte pertenezca a la organización. No aceptan organization_id desde el
 * cliente, no devuelven token_hash, y solo devuelven el token en claro
 * inmediatamente al crear. Crear/revocar exige admin/quality (lo refuerza la
 * RLS). La resolución pública NO pasa por aquí: la hace la RPC controlada.
 */
export type ShareActionState = { error: string | null; success?: boolean; token?: string };

async function gate(): Promise<{ organizationId: string; roleCode: string; error: string | null }> {
  const access = await requireTextilesForAction();
  if (access.org === null) return { organizationId: "", roleCode: "", error: access.error };
  return { organizationId: access.org.organizationId, roleCode: access.org.roleCode, error: null };
}

function expiryFromChoice(choice: string): string | null {
  if (choice === "none") return null;
  const days = Number(choice);
  const n = Number.isFinite(days) && days > 0 ? days : TEXTILE_SHARE_LINK_DEFAULT_EXPIRY_DAYS;
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString();
}

/** Crea un enlace privado. Devuelve el token en claro UNA sola vez. */
export async function createPassportShareLinkAction(input: {
  passportId: string;
  label?: string | null;
  expiryChoice?: string;
}): Promise<ShareActionState> {
  const g = await gate();
  if (g.error) return { error: g.error };
  const mutate = await checkTextilesCanMutate();
  if (!mutate.allowed) return { error: mutate.error };

  const passport = await getTechnicalPassport(g.organizationId, input.passportId);
  if (!passport) return { error: "El pasaporte no existe o no pertenece a tu organización." };

  const { token, error } = await createPassportShareLink({
    organizationId: g.organizationId,
    passportId: input.passportId,
    label: cleanText(input.label ?? null),
    expiresAt: expiryFromChoice(input.expiryChoice ?? String(TEXTILE_SHARE_LINK_DEFAULT_EXPIRY_DAYS)),
  });
  if (error || !token) return { error: error ?? "No se pudo crear el enlace." };

  revalidatePath(`/textiles/passports/${input.passportId}`);
  return { error: null, success: true, token };
}

/** Revoca un enlace (irreversible). */
export async function revokePassportShareLinkAction(
  passportId: string,
  linkId: string
): Promise<ShareActionState> {
  const g = await gate();
  if (g.error) return { error: g.error };
  const mutate = await checkTextilesCanMutate();
  if (!mutate.allowed) return { error: mutate.error };

  const { error } = await revokePassportShareLink(g.organizationId, linkId);
  if (error) return { error };
  revalidatePath(`/textiles/passports/${passportId}`);
  return { error: null, success: true };
}

/** Deshabilita o rehabilita un enlace (reversible). */
export async function setPassportShareLinkDisabledAction(
  passportId: string,
  linkId: string,
  disabled: boolean
): Promise<ShareActionState> {
  const g = await gate();
  if (g.error) return { error: g.error };
  const mutate = await checkTextilesCanMutate();
  if (!mutate.allowed) return { error: mutate.error };

  const { error } = await setPassportShareLinkDisabled(g.organizationId, linkId, disabled);
  if (error) return { error };
  revalidatePath(`/textiles/passports/${passportId}`);
  return { error: null, success: true };
}

/** Actualiza la expiración de un enlace. */
export async function updatePassportShareLinkExpiryAction(
  passportId: string,
  linkId: string,
  expiryChoice: string
): Promise<ShareActionState> {
  const g = await gate();
  if (g.error) return { error: g.error };
  const mutate = await checkTextilesCanMutate();
  if (!mutate.allowed) return { error: mutate.error };

  const { error } = await updatePassportShareLinkExpiry(g.organizationId, linkId, expiryFromChoice(expiryChoice));
  if (error) return { error };
  revalidatePath(`/textiles/passports/${passportId}`);
  return { error: null, success: true };
}
