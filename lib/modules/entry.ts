/**
 * Trazaloop · PE-01B · Cómo se lee la puerta de Trazaloop.
 *
 * QUÉ DECIDE ESTE ARCHIVO
 *
 * Qué módulo es el protagonista, en qué orden van los demás, y qué se dice de
 * cada estado. Nada de esto consulta: recibe el catálogo canónico y el acceso ya
 * resuelto.
 *
 * LA JERARQUÍA ES DEL PRODUCTO, NO DEL CONTRATO
 *
 * Quality es el protagonista **siempre**, tenga la empresa acceso o no. Es el
 * sistema de gestión transversal, y PCR y Textiles son trazabilidades
 * especializadas: presentarlos al mismo nivel cuenta mal lo que es Trazaloop.
 * Que se pueda entrar o no es otra cosa, y la dice el estado.
 *
 * NO es `server-only`: lo usan la página, la vista y las pruebas.
 */

import {
  COMMERCIAL_MODULES, type CommercialModule, type CommercialModuleKey,
} from "@/lib/modules/catalog";
import { isEnterableState } from "@/lib/modules/messages";
import type { DerivedModuleState } from "@/lib/modules/access";

// ===========================================================================
// 1 · EL PROTAGONISTA Y LOS ESPECIALIZADOS
// ===========================================================================

export const HERO_MODULE_KEY: CommercialModuleKey = "quality";

/** El orden de los especializados: los dos que existen, y el futuro al final. */
export const SPECIALIZED_ORDER: readonly CommercialModuleKey[] =
  ["cpr", "textiles", "construccion"];

export function heroModule(): CommercialModule {
  const m = COMMERCIAL_MODULES.find((x) => x.key === HERO_MODULE_KEY);
  if (!m) throw new Error("El catálogo perdió el módulo protagonista.");
  return m;
}

/**
 * Los especializados, en orden.
 *
 * NO se reordena por estado. La puerta vieja subía los entrables porque las
 * cuatro tarjetas eran iguales y la única entrable podía quedar debajo del
 * pliegue; con el protagonista arriba y tres tarjetas debajo, el orden estable
 * vale más que el orden útil: una pantalla que se recoloca según lo contratado
 * se aprende mal.
 */
export function specializedModules(): CommercialModule[] {
  return SPECIALIZED_ORDER
    .map((k) => COMMERCIAL_MODULES.find((m) => m.key === k))
    .filter((m): m is CommercialModule => Boolean(m));
}

// ===========================================================================
// 2 · EL COPY DE CADA MÓDULO EN LA PUERTA
// ===========================================================================

/**
 * La descripción del catálogo sirve al superadministrador: es exhaustiva y
 * lleva normas dentro. En la puerta hace falta otra cosa —una frase que se lea
 * de un vistazo— y por eso vive aquí.
 *
 * La de Quality se quedó en QUALITY-01 —«cargos, procesos… mapa publicable»— y
 * describía el primer sprint de trece. La de PCR metía dos normas y siete
 * funciones en una frase.
 *
 * Ninguna promete certificación, conformidad ni cumplimiento de una norma.
 */
export const ENTRY_COPY: Record<CommercialModuleKey, string> = {
  quality:
    "Gestiona procesos, riesgos, objetivos, personas, proveedores, auditorías y mejora "
    + "continua desde un entorno conectado y trazable.",
  // PE-02B3 · Las dos normas vuelven a la frase. PE-01B las había quitado por
  // brevedad, y al pasar la portada pública a leer de aquí (PEH-19) desaparecieron
  // también de ahí — donde llevaban desde el primer sprint y donde sí dicen algo:
  // quien busca trazabilidad de contenido reciclado busca por el número de la
  // norma. Nombrarlas es una REFERENCIA, no una afirmación de conformidad.
  cpr:
    "Trazabilidad de contenido reciclado en plásticos (NTC 6632 / UNE-EN 15343): "
    + "de la materia prima al lote producido, con las evidencias que respaldan "
    + "cada declaración.",
  textiles:
    "Trazabilidad de prendas y composición de fibras, con evidencias, circularidad y "
    + "pasaporte técnico.",
  construccion:
    "Trazabilidad para el sector construcción. Todavía no está disponible.",
};

/** El texto del botón de entrada. Nunca expone la clave interna del módulo. */
export function enterLabel(mod: CommercialModule): string {
  return `Entrar a ${mod.name.replace(/^Trazaloop /, "")}`;
}

// ===========================================================================
// 3 · CÓMO SE PRESENTA CADA ESTADO
// ===========================================================================

/**
 * Cuatro formas de presentar, y la distinción que importa: **un fallo operativo
 * no es un estado comercial**.
 *
 *   enterable    se puede entrar
 *   blocked      no se puede, y se sabe por qué
 *   unavailable  NO SE SABE · no se pudo comprobar
 *   future       todavía no existe
 */
export type EntryPresentation = "enterable" | "blocked" | "unavailable" | "future";

export function presentationFor(state: DerivedModuleState): EntryPresentation {
  if (state === "unavailable") return "unavailable";
  if (state === "coming_soon") return "future";
  return isEnterableState(state) ? "enterable" : "blocked";
}

/** ¿Esta tarjeta debe ser un enlace? Solo si de verdad lleva a algún sitio. */
export function isNavigable(state: DerivedModuleState, href: string | null): boolean {
  return presentationFor(state) === "enterable" && href !== null;
}

// ===========================================================================
// 4 · LO QUE SE DICE CUANDO NO HAY NADA
// ===========================================================================

export const NO_ACTIVE_MODULES_TITLE =
  "Esta empresa no tiene módulos activos en este momento.";
export const NO_ACTIVE_MODULES_BODY =
  "Tu cuenta funciona y tus datos se conservan. Abajo están los módulos de Trazaloop y el "
  + "estado de cada uno para esta empresa.";

/**
 * Cuando NO se pudo resolver el acceso de ninguno.
 *
 * Es distinto de «no hay módulos activos», y confundirlos es el defecto PE-D1
 * en su versión grande: decirle a alguien que no tiene nada cuando lo que pasa
 * es que no se pudo preguntar.
 */
export const RESOLUTION_FAILED_TITLE =
  "No fue posible verificar el acceso a los módulos.";
export const RESOLUTION_FAILED_BODY =
  "Es un problema temporal al consultar tu acceso, no un cambio en lo que tienes "
  + "contratado. Vuelve a intentarlo en unos minutos.";

/**
 * PE-02B3 · Carryover-02 de PE-01 · La nota al pie de la puerta.
 *
 * Decía: «El estado de cada módulo se resuelve con la hora del servidor y con lo
 * que tu empresa tiene hoy. Entrar a un módulo no decide qué puedes hacer
 * dentro: eso lo determina tu rol.»
 *
 * Era cierta y era vocabulario interno. «Hora del servidor» explica CÓMO se
 * calcula algo a quien solo preguntaba QUÉ tiene. La regla no cambia —el estado
 * se sigue resolviendo con la hora del servidor y el papel sigue decidiendo lo
 * de dentro—; lo que cambia es que dejamos de contárselo a quien no preguntó.
 *
 * Texto congelado por decisión humana. No reescribir.
 */
export const MODULE_ACCESS_FOOTNOTE =
  "Los módulos disponibles dependen del acceso de tu empresa. Dentro de cada "
  + "módulo, tu rol define las funciones que puedes usar.";

export const PLATFORM_TAGLINE = "Una cuenta, varios módulos. Entra al que necesites.";

// ===========================================================================
// 5 · EL ESTADO DEL CONJUNTO
// ===========================================================================

export type EntryOverview = {
  /** ¿Hay al menos uno al que se pueda entrar? */
  hasEnterable: boolean;
  /** ¿De ALGUNO no se pudo saber nada? */
  hasUnavailable: boolean;
  /** ¿No se pudo saber de NINGUNO de los que existen? */
  allUnavailable: boolean;
};

export function overviewOf(states: DerivedModuleState[]): EntryOverview {
  const reales = states.filter((s) => s !== "coming_soon");
  return {
    hasEnterable: states.some((s) => isEnterableState(s)),
    hasUnavailable: states.some((s) => s === "unavailable"),
    allUnavailable: reales.length > 0 && reales.every((s) => s === "unavailable"),
  };
}
