/**
 * Trazaloop · PE-02B4 · EL VOCABULARIO DE PANTALLAS.
 *
 * POR QUÉ EXISTE
 *
 * PE-02A encontró tres vocabularios estables en el repositorio —el de módulos,
 * el de secciones de TrazaDocs y el de entidades de Intelligence— y ninguno de
 * PANTALLAS. La ayuda contextual necesita uno: hay que poder decir «la ayuda de
 * este campo, en esta pantalla» sin depender de nada que cambie.
 *
 *
 * POR QUÉ NO LA URL
 *
 * Porque la URL cambia y la pantalla sigue siendo la misma. PE-01B movió una
 * superficie entera sin cambiar ninguna promesa; una ayuda atada a la ruta
 * habría desaparecido ese día sin que nadie tocara su contenido. Y al revés:
 * dos rutas pueden llevar a la misma pantalla.
 *
 *
 * UNA SOLA FAMILIA, TAMBIÉN PARA PE-03
 *
 * PE-02A (PEH-08) y §5 del encargo de este tramo piden lo mismo con distintas
 * palabras: que los tutoriales de PE-03 usen ESTAS claves y no inventen
 * `tutorial_page_key`. Por eso el registro vive aquí, en `lib/modules/`, junto
 * al catálogo de módulos y al registro del shell —y no dentro de la ayuda—: no
 * es «las claves de la ayuda», es «cómo se llaman las pantallas de Trazaloop».
 *
 *
 * LA FORMA
 *
 *   modulo.zona.pantalla        quality.context.interested_parties
 *   modulo.pantalla             quality.processes
 *   platform.pantalla           platform.modules
 *
 * Minúsculas, puntos, sin acentos. El primer segmento es SIEMPRE una clave del
 * catálogo comercial o `platform`, para que no nazca un cuarto vocabulario de
 * módulos por la puerta de atrás.
 */

import { COMMERCIAL_MODULES } from "@/lib/modules/catalog";
import { PLATFORM_SURFACE_KEY } from "@/lib/modules/registry";

/** Una pantalla del producto, con nombre para las personas que la administran. */
export type PageKeyEntry = {
  /** La identidad. No cambia nunca, aunque cambien la ruta y el título. */
  key: string;
  /** Cómo se llama en la consola. Puede cambiar. */
  label: string;
  /** A qué módulo pertenece. `platform` para lo transversal. */
  module: string;
  /**
   * Dónde vive HOY. Es informativo —para que quien administra sepa de qué
   * pantalla habla— y no forma parte de la identidad: si mañana cambia la ruta,
   * se corrige aquí y ninguna ayuda se mueve.
   */
  route: string;
};

/**
 * El registro. Empieza por lo que la ayuda administrable necesita hoy y crece
 * cuando alguien la necesite: una clave sin contenido no sirve a nadie, y un
 * registro lleno de pantallas sin ayuda haría más difícil encontrar las que sí.
 */
export const PAGE_KEYS: readonly PageKeyEntry[] = [
  // --- Trazaloop Quality ---------------------------------------------------
  {
    key: "quality.context.interested_parties",
    label: "Quality · Partes interesadas",
    module: "quality",
    route: "/quality/context/interested-parties",
  },
  {
    key: "quality.processes",
    label: "Quality · Procesos",
    module: "quality",
    route: "/quality/processes",
  },
  {
    key: "quality.processes.detail",
    label: "Quality · Ficha de proceso",
    module: "quality",
    route: "/quality/processes/[id]",
  },
  {
    key: "quality.risks",
    label: "Quality · Riesgos",
    module: "quality",
    route: "/quality/risks",
  },
  {
    key: "quality.indicators",
    label: "Quality · Indicadores y objetivos",
    module: "quality",
    route: "/quality/indicators",
  },
  {
    key: "quality.documents",
    label: "Quality · Documentos",
    module: "quality",
    route: "/quality/documents",
  },
  {
    key: "quality.cases",
    label: "Quality · Casos y acciones",
    module: "quality",
    route: "/quality/cases",
  },

  // --- Trazaloop PCR -------------------------------------------------------
  {
    key: "cpr.recycled_content",
    label: "PCR · Contenido reciclado",
    module: "cpr",
    route: "/recycled-content",
  },
  {
    key: "cpr.traceability.inventory",
    label: "PCR · Inventario",
    module: "cpr",
    route: "/traceability/inventory",
  },

  // --- Trazaloop Textiles --------------------------------------------------
  {
    key: "textiles.passports",
    label: "Textiles · Pasaportes",
    module: "textiles",
    route: "/textiles/passports",
  },

  // --- Transversal ---------------------------------------------------------
  {
    key: "platform.modules",
    label: "Plataforma · Puerta de módulos",
    module: PLATFORM_SURFACE_KEY,
    route: "/modules",
  },
] as const;

const POR_CLAVE = new Map(PAGE_KEYS.map((p) => [p.key, p]));

/** ¿Esta clave está en el registro? Lo usan la consola y las pruebas. */
export function isKnownPageKey(key: string): boolean {
  return POR_CLAVE.has(key);
}

export function getPageKey(key: string): PageKeyEntry | null {
  return POR_CLAVE.get(key) ?? null;
}

/** Las pantallas de un módulo, para los filtros de la consola. */
export function pageKeysForModule(moduleKey: string): PageKeyEntry[] {
  return PAGE_KEYS.filter((p) => p.module === moduleKey);
}

/** Las claves de módulo admitidas: las del catálogo, más la superficie neutra. */
export const PAGE_KEY_MODULES: readonly string[] = [
  ...COMMERCIAL_MODULES.map((m) => m.key),
  PLATFORM_SURFACE_KEY,
];

/**
 * La forma de una clave, comprobable sin consultar el registro.
 *
 * Se usa en la base —la restricción de la tabla la repite— y aquí, para que la
 * consola pueda rechazar una clave mal escrita antes de enviarla.
 */
export const PAGE_KEY_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

export function isWellFormedPageKey(key: string): boolean {
  if (!PAGE_KEY_PATTERN.test(key)) return false;
  return PAGE_KEY_MODULES.includes(key.split(".")[0]);
}

// ===========================================================================
// PE-03B3 · DE UNA RUTA A SU CLAVE
// ===========================================================================

/**
 * Qué clave de pantalla corresponde a una dirección.
 *
 * LA RUTA NO ES LA IDENTIDAD, Y ESTO NO LA CONVIERTE EN UNA
 *
 * La distinción que PE-02 congeló sigue en pie: la identidad de un tutorial es
 * su clave. Lo que hace esta función es lo contrario de identificar por ruta —
 * mira dónde está la persona AHORA y consulta el registro para saber qué clave
 * aplica ahí.
 *
 * Si mañana una pantalla se muda de dirección, se actualiza su `route` en el
 * registro y nada más: la clave no cambia, y con ella no cambian ni el tutorial,
 * ni su historia, ni la ayuda contextual que cuelga de la misma clave.
 *
 *
 * POR QUÉ SE ELIGE LA COINCIDENCIA MÁS LARGA
 *
 * `/quality/processes` y `/quality/processes/[id]` son dos entradas distintas.
 * Con una comparación por prefijo a secas, la ficha de un proceso recibiría el
 * tutorial del listado — un vídeo de otra pantalla, que es peor que ninguno.
 *
 * Se compara segmento a segmento y gana la ruta MÁS ESPECÍFICA que encaja. Y si
 * ninguna encaja del todo, no se devuelve nada: una pantalla sin clave no
 * admite tutorial, y eso es una respuesta, no un fallo.
 */
export function resolvePageKeyForPath(pathname: string): string | null {
  const partes = pathname.split("?")[0].split("#")[0]
    .split("/").filter((s) => s.length > 0);

  let mejor: { key: string; segmentos: number } | null = null;

  for (const entrada of PAGE_KEYS) {
    const patron = entrada.route.split("/").filter((s) => s.length > 0);
    if (patron.length !== partes.length) continue;

    let encaja = true;
    for (let i = 0; i < patron.length; i += 1) {
      const p = patron[i];
      // `[id]` casa con cualquier segmento; el resto tiene que ser literal.
      if (p.startsWith("[") && p.endsWith("]")) continue;
      if (p !== partes[i]) { encaja = false; break; }
    }
    if (!encaja) continue;

    // A igualdad de longitud gana la que tiene menos comodines: una ruta
    // literal describe la pantalla mejor que una con parámetros.
    const comodines = patron.filter((p) => p.startsWith("[")).length;
    const especificidad = patron.length * 10 - comodines;
    if (!mejor || especificidad > mejor.segmentos) {
      mejor = { key: entrada.key, segmentos: especificidad };
    }
  }

  return mejor?.key ?? null;
}
