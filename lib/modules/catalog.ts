/**
 * Trazaloop · Sprint T9F · FUENTE CANÓNICA de módulos comerciales.
 *
 * Un solo lugar define, para toda la plataforma, qué módulos son
 * COMERCIALES (se asignan por empresa con un access_mode demo/full/extra,
 * aparecen como tarjeta en /modules y son gestionables por el
 * superadministrador) y cuáles están "próximamente".
 *
 * Antes de T9F la información estaba dispersa: tarjetas hardcodeadas en
 * /modules, filtros por module_code en las RPC de registro y el flag de
 * Textiles en lib/modules/textiles.ts. Este catálogo unifica esa verdad.
 *
 * Lógica PURA (sin BD, sin sesión). La disponibilidad EFECTIVA (asignación,
 * vigencia, kill switch, membresía) se resuelve en lib/modules/access.ts +
 * la función SQL resolve_organization_module_access (0100). La columna
 * `modules.is_functional` (0100) es el ESPEJO en BD de este catálogo y una
 * prueba unitaria verifica que ambos coincidan.
 */

/** Clave estable de un módulo comercial (identidad de UI, nunca del cliente). */
export type CommercialModuleKey = "cpr" | "textiles" | "quality" | "construccion";

/** Estado de madurez del módulo (independiente de la asignación por empresa). */
export type CommercialModuleStatus = "functional" | "coming_soon";

export type CommercialModule = {
  key: CommercialModuleKey;
  /** module_code REAL en la tabla `modules` / `organization_modules`. */
  moduleCode: string;
  /** Nombre comercial visible. */
  name: string;
  /** Descripción breve para el superadministrador y el selector. */
  description: string;
  status: CommercialModuleStatus;
  /**
   * Variable de entorno de kill switch GLOBAL (server-only), si la tiene.
   * Un kill switch apagado bloquea el módulo aunque la empresa lo tenga
   * asignado — jamás lo contrario.
   */
  killSwitchEnv: string | null;
};

/**
 * "CPR" como producto son las filas `core` + `traceability_6632` en BD. El
 * módulo COMERCIAL gestionable (el que recibe access_mode y aparece como
 * tarjeta) es `traceability_6632`; `core` es infraestructura (siempre
 * disponible, nunca vence, no es una tarjeta comercial).
 */
export const CPR_MODULE_CODE = "traceability_6632";
export const TEXTILES_MODULE_CODE = "textiles";
/** Infraestructura: no comercial, no gettable, no aparece en el selector. */
export const CORE_MODULE_CODE = "core";

export const COMMERCIAL_MODULES: readonly CommercialModule[] = [
  {
    key: "cpr",
    moduleCode: CPR_MODULE_CODE,
    name: "Trazaloop CPR",
    description:
      "Trazabilidad y contenido reciclado para plásticos (NTC 6632 / UNE-EN 15343): diagnóstico, catálogos, evidencias, trazabilidad y TrazaDocs.",
    status: "functional",
    killSwitchEnv: null,
  },
  {
    key: "textiles",
    moduleCode: TEXTILES_MODULE_CODE,
    name: "Trazaloop Textiles",
    description:
      "Trazabilidad de productos de confección, composición de fibras, evidencias, circularidad y pasaporte técnico textil.",
    status: "functional",
    killSwitchEnv: "TEXTILES_MODULE_ENABLED",
  },
  {
    key: "quality",
    moduleCode: "quality",
    name: "Trazaloop Quality",
    description: "Gestión de calidad. En desarrollo.",
    status: "coming_soon",
    killSwitchEnv: null,
  },
  {
    key: "construccion",
    moduleCode: "construccion",
    name: "Trazaloop Construcción",
    description: "Trazabilidad para el sector construcción. En desarrollo.",
    status: "coming_soon",
    killSwitchEnv: null,
  },
];

/** Módulos comerciales FUNCIONALES y publicados (los que reciben Demo 48h al
 *  registrarse y son gestionables por el superadministrador). */
export const FUNCTIONAL_MODULE_CODES: readonly string[] = COMMERCIAL_MODULES.filter(
  (m) => m.status === "functional"
).map((m) => m.moduleCode);

export function getCommercialModuleByCode(moduleCode: string): CommercialModule | null {
  return COMMERCIAL_MODULES.find((m) => m.moduleCode === moduleCode) ?? null;
}

export function getCommercialModuleByKey(key: string): CommercialModule | null {
  return COMMERCIAL_MODULES.find((m) => m.key === key) ?? null;
}

/** ¿El module_code es un módulo comercial FUNCIONAL? (server-authoritative:
 *  jamás se debe habilitar un módulo "próximamente" desde la UI). */
export function isFunctionalModuleCode(moduleCode: string | null | undefined): boolean {
  return !!moduleCode && FUNCTIONAL_MODULE_CODES.includes(moduleCode);
}
