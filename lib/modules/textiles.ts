/**
 * Trazaloop · Sprint T1 (Textil) · Clave, feature flag y regla de acceso
 * del módulo Trazaloop Textiles.
 *
 * Lógica PURA + lectura de entorno, sin BD ni sesión, para que sea
 * testeable en tests/unit (patrón del proyecto). La validación real de
 * acceso ocurre en servidor en lib/auth/require-textiles-module.ts.
 *
 * DL-01: la clave oficial del módulo es "textiles" (nunca "textil",
 * "textile" ni variantes) en catálogo, rutas y documentación.
 */

/** Clave oficial del módulo (modules.code / organization_modules.module_code). */
export const TEXTILES_MODULE_KEY = "textiles";

/** Nombre de la variable de entorno del feature flag (evaluada en servidor). */
export const TEXTILES_FLAG_ENV = "TEXTILES_MODULE_ENABLED";

/** Ruta raíz del shell privado del módulo. */
export const TEXTILES_HOME_PATH = "/textiles";

/**
 * Interpretación PURA del flag: solo "true" o "1" encienden el módulo.
 * Cualquier otro valor (undefined, "", "false", "yes"…) lo deja apagado —
 * apagado por defecto, nunca al revés.
 */
export function isTextilesFlagEnabled(raw: string | null | undefined): boolean {
  return raw === "true" || raw === "1";
}

/**
 * Flag efectivo del proceso actual. Se evalúa SIEMPRE del lado servidor
 * (la variable no tiene prefijo NEXT_PUBLIC_ a propósito: el navegador
 * nunca la conoce y ocultar botones jamás es la barrera).
 */
export function isTextilesModuleEnabled(): boolean {
  return isTextilesFlagEnabled(process.env[TEXTILES_FLAG_ENV]);
}

/** Forma mínima de un módulo activado de la organización (ActiveModule). */
export type OrgModuleLike = { code: string; enabled: boolean };

/**
 * Regla PURA de habilitación por organización: existe la fila del módulo
 * "textiles" en organization_modules y está enabled. (El flag de entorno
 * se comprueba aparte: ambos deben cumplirse.)
 */
export function organizationHasTextiles(modules: readonly OrgModuleLike[]): boolean {
  return modules.some((m) => m.code === TEXTILES_MODULE_KEY && m.enabled);
}

/** Regla combinada (flag + habilitación) para reutilizar en guard y portal. */
export function canAccessTextilesModule(
  flagRaw: string | null | undefined,
  modules: readonly OrgModuleLike[]
): boolean {
  return isTextilesFlagEnabled(flagRaw) && organizationHasTextiles(modules);
}

/** Secciones futuras del módulo (texto informativo del shell). El
 * Diagnóstico salió en T2, los Catálogos en T3, Productos en T4, las
 * Evidencias en T5, la Trazabilidad en T6, la Circularidad en T7 y
 * TrazaDocs Textil en T8 al volverse funcionales; lo restante espera a
 * sprints posteriores. */
export const TEXTILES_PLANNED_SECTIONS: readonly string[] = [];

/**
 * Sprint T9E · Estado de la tarjeta de Trazaloop Textiles en el selector
 * principal de módulos. Regla PURA (testeable sin BD):
 *
 *  · flag global apagado            → "flag_disabled"  (Próximamente)
 *  · flag encendido, sin org activa → "no_active_org"  (elegir empresa)
 *  · flag encendido, org sin fila   → "org_not_enabled" (bloqueado + explicación)
 *  · flag encendido, org habilitada → "available"       (tarjeta activa)
 *
 * Nunca depende de CPR ni de booleanos hardcodeados: la única fuente es el
 * flag de entorno + organization_modules (module_code 'textiles').
 */
export type TextilesAvailability =
  | "available"
  | "org_not_enabled"
  | "no_active_org"
  | "flag_disabled";

export function resolveTextilesAvailability(input: {
  flagRaw: string | null | undefined;
  hasActiveOrg: boolean;
  modules: readonly OrgModuleLike[];
}): TextilesAvailability {
  if (!isTextilesFlagEnabled(input.flagRaw)) return "flag_disabled";
  if (!input.hasActiveOrg) return "no_active_org";
  return organizationHasTextiles(input.modules) ? "available" : "org_not_enabled";
}
