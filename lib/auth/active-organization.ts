import "server-only";

import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Empresa activa.
 *
 * La cookie es una CONVENIENCIA DE UI, no una barrera de seguridad: la
 * barrera es RLS + la revalidación en servidor contra memberships
 * (getActiveOrganization) en cada carga. Desde Sprint 1.1 la cookie además
 * se firma con HMAC-SHA256 (ACTIVE_ORG_COOKIE_SECRET) para reducir
 * manipulación accidental. Sin secret configurado, se degrada a valor sin
 * firma con una advertencia (solo aceptable en desarrollo).
 */
export const ACTIVE_ORG_COOKIE = "tz-active-org";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let warnedNoSecret = false;

function getSecret(): string | null {
  const secret = process.env.ACTIVE_ORG_COOKIE_SECRET ?? null;
  if (!secret && !warnedNoSecret) {
    warnedNoSecret = true;
    console.warn(
      "[trazaloop] ACTIVE_ORG_COOKIE_SECRET no está definido: la cookie de " +
        "empresa activa viaja SIN firma. Configúralo en producción. " +
        "(La seguridad real no depende de esto: RLS + revalidación de membership.)"
    );
  }
  return secret;
}

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function verify(value: string, signature: string, secret: string): boolean {
  const expected = Buffer.from(sign(value, secret));
  const received = Buffer.from(signature);
  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}

export async function readActiveOrgCookie(): Promise<string | null> {
  const store = await cookies();
  const raw = store.get(ACTIVE_ORG_COOKIE)?.value ?? null;
  if (!raw) return null;

  const secret = getSecret();

  if (secret) {
    // Formato firmado: "<uuid>.<hmac-base64url>"
    const dot = raw.indexOf(".");
    if (dot === -1) return null; // valor sin firma con secret activo → inválido
    const value = raw.slice(0, dot);
    const signature = raw.slice(dot + 1);
    if (!UUID_RE.test(value) || !verify(value, signature, secret)) return null;
    return value;
  }

  // Fallback sin secret (desarrollo): uuid plano.
  return UUID_RE.test(raw) ? raw : null;
}

export async function writeActiveOrgCookie(organizationId: string) {
  const secret = getSecret();
  const value = secret
    ? `${organizationId}.${sign(organizationId, secret)}`
    : organizationId;

  const store = await cookies();
  store.set(ACTIVE_ORG_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 días
  });
}

export async function clearActiveOrgCookie() {
  const store = await cookies();
  store.delete(ACTIVE_ORG_COOKIE);
}
