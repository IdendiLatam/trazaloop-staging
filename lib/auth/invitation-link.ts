import "server-only";

import { headers } from "next/headers";

/**
 * Trazaloop · QUALITY-01.1 · Construcción del enlace de invitación.
 *
 * El enlace se construía como `${NEXT_PUBLIC_SITE_URL}/accept-invite?token=…`.
 * Eso falla de dos maneras distintas, y ambas se vieron en la prueba humana:
 *
 *  · Si la variable no está definida, `site` queda vacío y el resultado es una
 *    ruta RELATIVA. Copiada y pegada en la barra de direcciones de otra
 *    persona, no lleva a ninguna parte.
 *
 *  · En Preview la variable apunta a la URL de UN despliegue concreto
 *    (limitación conocida G-1). Cada push genera un despliegue nuevo, así que
 *    el enlace señala a uno viejo — que puede haber caducado, o exigir una
 *    autenticación distinta.
 *
 * La corrección es preferir el ORIGEN REAL de la petición que está creando la
 * invitación: quien invita está mirando el despliegue correcto, por definición.
 * `NEXT_PUBLIC_SITE_URL` queda como respaldo, no como fuente principal.
 */
export async function resolveAppOrigin(): Promise<string> {
  const hdrs = await headers();

  // Cabeceras que pone el proxy (Vercel y la mayoría de balanceadores).
  const forwardedHost = hdrs.get("x-forwarded-host") ?? hdrs.get("host");
  const forwardedProto = hdrs.get("x-forwarded-proto");
  if (forwardedHost) {
    const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(forwardedHost);
    const proto = forwardedProto ?? (isLocal ? "http" : "https");
    return `${proto}://${forwardedHost}`;
  }

  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/+$/, "");

  // Último recurso: desarrollo local sin cabeceras ni variable.
  return "http://localhost:3000";
}

/** Enlace ABSOLUTO para aceptar una invitación. */
export async function buildInvitationLink(token: string): Promise<string> {
  const origin = await resolveAppOrigin();
  return `${origin}/accept-invite?token=${encodeURIComponent(token)}`;
}
