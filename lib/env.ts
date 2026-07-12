/**
 * Trazaloop · Sprint 5C · Validación de entorno.
 *
 * Regla de oro (Sprint 3.1): NADA de esto se ejecuta en top-level de módulos.
 * Solo se invoca dentro de funciones que corren en runtime de servidor
 * (acciones, páginas dinámicas, scripts). Así el build estático termina
 * aunque no exista .env.local, y cuando falta una variable en runtime el
 * error es inmediato y explica exactamente dónde configurarla.
 */

const HINTS: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL: "URL pública del proyecto Supabase.",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon key pública (siempre sujeta a RLS).",
  SUPABASE_SERVICE_ROLE_KEY:
    "clave de servicio: SOLO scripts/tests administrativos, jamás código de app ni navegador.",
  ACTIVE_ORG_COOKIE_SECRET:
    "secreto para firmar la cookie de empresa activa (openssl rand -base64 32).",
  NEXT_PUBLIC_SITE_URL: "URL de la app en local o staging.",
};

/** Devuelve la variable o lanza un error claro (nunca en top-level). */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Falta ${name}. Configúrala en .env.local o en Vercel → Settings → ` +
        `Environment Variables.${HINTS[name] ? ` (${HINTS[name]})` : ""}`
    );
  }
  return value;
}

/** Variante sin excepción para chequeos/diagnóstico. */
export function readEnv(name: string): string | null {
  return process.env[name] ?? null;
}

/** true cuando la app apunta a un despliegue de staging (banner en UI). */
export function isStagingEnvironment(): boolean {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  return site.includes("vercel.app") || site.includes("staging");
}
