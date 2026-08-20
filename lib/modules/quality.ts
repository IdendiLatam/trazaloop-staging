/**
 * Trazaloop Quality · QUALITY-01 · Clave, kill switch y regla de acceso
 * del módulo Trazaloop Quality.
 *
 * Lógica PURA + lectura de entorno, sin BD ni sesión, para que sea testeable
 * en tests/unit (patrón del proyecto, idéntico a lib/modules/textiles.ts).
 * La validación real de acceso ocurre en servidor en
 * lib/auth/require-quality-module.ts.
 *
 * La clave oficial del módulo es "quality" en catálogo, rutas y documentación.
 */

/** Clave oficial del módulo (modules.code / organization_modules.module_code). */
export const QUALITY_MODULE_KEY = "quality";

/** Nombre de la variable de entorno del kill switch (evaluada en servidor). */
export const QUALITY_FLAG_ENV = "QUALITY_MODULE_ENABLED";

/** Ruta raíz del shell privado del módulo. */
export const QUALITY_HOME_PATH = "/quality";

/**
 * Interpretación PURA del flag: solo "true" o "1" encienden el módulo.
 * Cualquier otro valor (undefined, "", "false", "yes"…) lo deja apagado —
 * apagado por defecto, nunca al revés. Es lo que mantiene Quality invisible
 * en Production mientras QUALITY-01 se prueba en Staging.
 */
export function isQualityFlagEnabled(raw: string | null | undefined): boolean {
  return raw === "true" || raw === "1";
}

/**
 * Flag efectivo del proceso actual. Se evalúa SIEMPRE del lado servidor: la
 * variable no lleva prefijo NEXT_PUBLIC_ a propósito, el navegador nunca la
 * conoce y ocultar botones jamás es la barrera.
 */
export function isQualityModuleEnabled(): boolean {
  return isQualityFlagEnabled(process.env[QUALITY_FLAG_ENV]);
}

/** Forma mínima de un módulo activado de la organización (ActiveModule). */
export type OrgModuleLike = { code: string; enabled: boolean };

/**
 * Regla PURA de habilitación por organización: existe la fila del módulo
 * "quality" en organization_modules y está enabled. (El kill switch se
 * comprueba aparte: ambos deben cumplirse.)
 */
export function organizationHasQuality(modules: readonly OrgModuleLike[]): boolean {
  return modules.some((m) => m.code === QUALITY_MODULE_KEY && m.enabled);
}

/** Regla combinada (flag + habilitación) para reutilizar en guard y portal. */
export function canAccessQualityModule(
  flagRaw: string | null | undefined,
  modules: readonly OrgModuleLike[]
): boolean {
  return isQualityFlagEnabled(flagRaw) && organizationHasQuality(modules);
}

/**
 * Estado de la tarjeta de Trazaloop Quality en el selector de módulos.
 * Regla PURA (testeable sin BD), misma semántica que Textiles:
 *
 *  · kill switch apagado            → "flag_disabled"   (Próximamente)
 *  · encendido, sin empresa activa  → "no_active_org"   (elegir empresa)
 *  · encendido, empresa sin fila    → "org_not_enabled" (bloqueado + motivo)
 *  · encendido, empresa habilitada  → "available"
 */
export type QualityAvailability =
  | "available"
  | "org_not_enabled"
  | "no_active_org"
  | "flag_disabled";

export function resolveQualityAvailability(input: {
  flagRaw: string | null | undefined;
  hasActiveOrg: boolean;
  modules: readonly OrgModuleLike[];
}): QualityAvailability {
  if (!isQualityFlagEnabled(input.flagRaw)) return "flag_disabled";
  if (!input.hasActiveOrg) return "no_active_org";
  return organizationHasQuality(input.modules) ? "available" : "org_not_enabled";
}
