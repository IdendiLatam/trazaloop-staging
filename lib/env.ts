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
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    "clave pública publishable (siempre sujeta a RLS). Sustituye a NEXT_PUBLIC_SUPABASE_ANON_KEY, que sigue aceptándose como respaldo heredado.",
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    "anon key pública (siempre sujeta a RLS). Nombre HEREDADO: usa NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
  SUPABASE_SECRET_KEY:
    "clave secreta del proyecto: SOLO servidor y scripts administrativos, jamás código cliente ni navegador.",
  SUPABASE_SERVICE_ROLE_KEY:
    "clave de servicio: SOLO scripts/tests administrativos, jamás código de app ni navegador. Nombre HEREDADO: usa SUPABASE_SECRET_KEY.",
  ACTIVE_ORG_COOKIE_SECRET:
    "secreto para firmar la cookie de empresa activa (openssl rand -base64 32).",
  NEXT_PUBLIC_SITE_URL:
    "URL pública de la app en este ambiente. Se usa para construir enlaces absolutos (restablecer contraseña, invitaciones, compartir pasaportes). NO decide el ambiente de despliegue.",
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

// ---------------------------------------------------------------------------
// Detección de AMBIENTE DE DESPLIEGUE (v1.0.0)
// ---------------------------------------------------------------------------
//
// Hasta v1.0.0 el ambiente se deducía del NOMBRE DEL DOMINIO
// (`NEXT_PUBLIC_SITE_URL` contiene "vercel.app" o "staging"). Eso es
// incorrecto: un despliegue **Production** de Vercel puede usar
// legítimamente un dominio `*.vercel.app` y quedaría marcado como staging.
//
// La fuente de verdad pasa a ser la variable de sistema que inyecta Vercel,
// que describe el TARGET del despliegue y no su URL:
//
//   · VERCEL_TARGET_ENV → "production" | "preview" | "development" | <nombre
//     de entorno personalizado>. Es la señal más específica y tiene
//     prioridad.
//   · VERCEL_ENV        → "production" | "preview" | "development".
//     Respaldo cuando no hay target env.
//
// Ninguna de las dos lleva prefijo NEXT_PUBLIC_, así que **nunca llegan al
// navegador**: se leen solo en servidor. Tampoco son secretos — describen
// el tipo de despliegue, no credenciales.
//
// `NEXT_PUBLIC_SITE_URL` YA NO PARTICIPA en esta decisión. Es un dato de
// presentación (construir enlaces), jamás una fuente de autoridad sobre el
// ambiente: es pública, manipulable en build y no describe el target.
//
// COMPORTAMIENTO EN LOCAL (documentado, explícito):
//   Sin ninguna variable de Vercel (desarrollo local, `next dev`,
//   `next start`, tests) el ambiente es "development" y por tanto NO
//   productivo: el distintivo de ambiente SÍ se muestra. Es deliberado y
//   falla del lado seguro — el error de mostrar un distintivo en producción
//   es cosmético, mientras que ocultarlo en un entorno no productivo puede
//   llevar a alguien a cargar datos reales creyendo que está en producción.
//
//   Consecuencia para un despliegue productivo FUERA de Vercel: debe
//   declarar `VERCEL_ENV=production` explícitamente, o mostrará el
//   distintivo. Está documentado en docs/releases/V1.0.0_PRODUCTION_READINESS.md.
// ---------------------------------------------------------------------------

export type DeploymentEnvironment = "production" | "preview" | "development";

/**
 * Resuelve el ambiente de despliegue. Función PURA: recibe el mapa de
 * variables, de modo que es testeable sin tocar `process.env` global.
 *
 * Precedencia: VERCEL_TARGET_ENV → VERCEL_ENV → "development".
 *
 * Un valor de target desconocido (entorno personalizado de Vercel, p. ej.
 * "qa") NO se considera producción: se trata como "preview". Falla cerrado.
 */
export function resolveDeploymentEnvironment(
  env: Record<string, string | undefined> = process.env
): DeploymentEnvironment {
  const raw = (env.VERCEL_TARGET_ENV ?? env.VERCEL_ENV ?? "").trim().toLowerCase();

  if (raw === "production") return "production";
  if (raw === "preview") return "preview";
  if (raw === "development") return "development";

  // Entorno personalizado de Vercel (cualquier otro nombre): no es
  // producción, así que se trata como preview.
  if (raw.length > 0) return "preview";

  // Sin señal alguna de Vercel: desarrollo local.
  return "development";
}

/** true solo en un despliegue de PRODUCCIÓN declarado como tal. */
export function isProductionEnvironment(
  env: Record<string, string | undefined> = process.env
): boolean {
  return resolveDeploymentEnvironment(env) === "production";
}

/**
 * true en cualquier ambiente NO productivo (preview/staging y local).
 * Es lo que decide si se muestra el distintivo de ambiente en la UI.
 */
export function isStagingEnvironment(
  env: Record<string, string | undefined> = process.env
): boolean {
  return !isProductionEnvironment(env);
}

/**
 * Texto del distintivo de ambiente, o null en producción (sin distintivo).
 * Preview apunta al proyecto Supabase de staging; local, a `.env.local`.
 */
export function environmentBadgeLabel(
  env: Record<string, string | undefined> = process.env
): string | null {
  switch (resolveDeploymentEnvironment(env)) {
    case "production":
      return null;
    case "preview":
      return "Ambiente staging";
    case "development":
      return "Entorno local";
  }
}
