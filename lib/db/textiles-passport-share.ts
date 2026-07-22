import "server-only";

import { randomBytes, createHash } from "node:crypto";
import { createServerClient } from "@/lib/supabase/server";
import type { TextileShareLinkStatus } from "@/lib/domain/textiles-passport";

/**
 * Trazaloop · Sprint T9D (Textil) · Capa de datos de los enlaces privados
 * compartibles del pasaporte técnico textil. El token en claro se genera aquí
 * (32 bytes, base64url), se devuelve UNA sola vez al crear, y en la BD se
 * guarda solo su hash sha256 (hex) y un prefijo corto. La resolución pública
 * (por hash) la hace la RPC controlada resolve_textile_passport_share; esta
 * capa cubre la gestión interna (crear/listar/revocar/expirar).
 */

export type ShareLinkRow = {
  id: string;
  passportId: string;
  tokenPrefix: string | null;
  label: string | null;
  status: TextileShareLinkStatus;
  expiresAt: string | null;
  revokedAt: string | null;
  lastAccessedAt: string | null;
  accessCount: number;
  maxAccessCount: number | null;
  createdAt: string;
};

function mapLink(r: Record<string, unknown>): ShareLinkRow {
  return {
    id: r.id as string,
    passportId: r.passport_id as string,
    tokenPrefix: (r.token_prefix as string | null) ?? null,
    label: (r.label as string | null) ?? null,
    status: r.status as TextileShareLinkStatus,
    expiresAt: (r.expires_at as string | null) ?? null,
    revokedAt: (r.revoked_at as string | null) ?? null,
    lastAccessedAt: (r.last_accessed_at as string | null) ?? null,
    accessCount: (r.access_count as number) ?? 0,
    maxAccessCount: (r.max_access_count as number | null) ?? null,
    createdAt: r.created_at as string,
  };
}

/** Token de alta entropía (32 bytes → base64url) y su hash sha256 (hex). */
function newToken(): { token: string; tokenHash: string; tokenPrefix: string } {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const tokenPrefix = token.slice(0, 8);
  return { token, tokenHash, tokenPrefix };
}

export async function listPassportShareLinks(
  orgId: string,
  passportId: string
): Promise<ShareLinkRow[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("textile_technical_passport_share_links")
    .select(
      "id, passport_id, token_prefix, label, status, expires_at, revoked_at, last_accessed_at, access_count, max_access_count, created_at"
    )
    .eq("organization_id", orgId)
    .eq("passport_id", passportId)
    .order("created_at", { ascending: false });
  return ((data ?? []) as Record<string, unknown>[]).map(mapLink);
}

/**
 * Crea un enlace: inserta el hash (nunca el token) y devuelve el token en claro
 * UNA sola vez. La BD garantiza (RLS + trigger) que el pasaporte sea de la
 * organización y que la identidad/token sean inmutables luego.
 */
export async function createPassportShareLink(input: {
  organizationId: string;
  passportId: string;
  label: string | null;
  expiresAt: string | null;
}): Promise<{ token: string | null; error: string | null }> {
  const supabase = await createServerClient();
  const { token, tokenHash, tokenPrefix } = newToken();
  const { error } = await supabase.from("textile_technical_passport_share_links").insert({
    organization_id: input.organizationId,
    passport_id: input.passportId,
    token_hash: tokenHash,
    token_prefix: tokenPrefix,
    label: input.label,
    expires_at: input.expiresAt,
  });
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      // Colisión de hash (astronómicamente improbable): reintentar una vez.
      return createPassportShareLink(input);
    }
    return { token: null, error: error.message };
  }
  return { token, error: null };
}

/** Revoca un enlace (irreversible). El trigger impide reactivarlo luego. */
export async function revokePassportShareLink(
  orgId: string,
  linkId: string
): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { error } = await supabase
    .from("textile_technical_passport_share_links")
    .update({ status: "revoked", revoked_at: new Date().toISOString() })
    .eq("organization_id", orgId)
    .eq("id", linkId);
  return { error: error ? error.message : null };
}

/** Deshabilita/rehabilita un enlace (reversible, distinto de revocar). */
export async function setPassportShareLinkDisabled(
  orgId: string,
  linkId: string,
  disabled: boolean
): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { error } = await supabase
    .from("textile_technical_passport_share_links")
    .update({ status: disabled ? "disabled" : "active" })
    .eq("organization_id", orgId)
    .eq("id", linkId)
    .neq("status", "revoked");
  return { error: error ? error.message : null };
}

/** Actualiza la expiración de un enlace. */
export async function updatePassportShareLinkExpiry(
  orgId: string,
  linkId: string,
  expiresAt: string | null
): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { error } = await supabase
    .from("textile_technical_passport_share_links")
    .update({ expires_at: expiresAt })
    .eq("organization_id", orgId)
    .eq("id", linkId)
    .neq("status", "revoked");
  return { error: error ? error.message : null };
}

/** Resuelve un token (vista pública) vía la RPC controlada. */
export async function resolveSharedPassport(token: string): Promise<Record<string, unknown> | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("resolve_textile_passport_share", { p_token: token });
  if (error || !data) return null;
  return data as Record<string, unknown>;
}
