/**
 * Trazaloop Quality · QUALITY-01.2 · Dominio PURO del espacio documental.
 *
 * Por qué existe este archivo, y no una constante más en las server actions:
 *
 * `QUALITY_DOCUMENT_CATEGORIES` vivía exportada desde
 * `server/actions/quality-documents.ts`, que empieza con `"use server"`. Un
 * módulo de servidor no exporta VALORES al cliente: exporta REFERENCIAS a
 * funciones remotas. Cuando un componente de cliente importaba de ahí una
 * constante, lo que recibía en el navegador no era el array — era un objeto
 * opaco. El formulario hacía `QUALITY_DOCUMENT_CATEGORIES.map(...)` y el
 * navegador lanzaba `TypeError: x.map is not a function`, que React convertía
 * en la pantalla «This page couldn't load».
 *
 * Es exactamente el defecto que la prueba humana encontró al pulsar
 * «Crear documento», y no se veía en el servidor porque el fallo ocurría en el
 * cliente. Las constantes compartidas entre cliente y servidor pertenecen al
 * dominio (lógica pura, sin BD, sin sesión), que es lo que este archivo es.
 * Una prueba estática impide ahora que vuelva a ocurrir en cualquier módulo.
 */

/** Categorías ofrecidas al crear un documento de Quality. Subconjunto
 *  deliberado del catálogo transversal de TrazaDocs (`CATEGORY_CODES`):
 *  «Soportes técnicos» es de PCR y no tiene sentido en un sistema de gestión. */
export const QUALITY_DOCUMENT_CATEGORIES = [
  "manual",
  "procedure",
  "instruction",
  "record",
  "policy",
  "format",
  "other",
] as const;

export type QualityDocumentCategory = (typeof QUALITY_DOCUMENT_CATEGORIES)[number];

/** Etiquetas en singular: aquí se elige el tipo de UN documento, mientras que
 *  el catálogo transversal las usa en plural para agrupar listas. */
export const QUALITY_DOCUMENT_CATEGORY_LABEL: Record<QualityDocumentCategory, string> = {
  manual: "Manual",
  procedure: "Procedimiento",
  instruction: "Instructivo",
  record: "Registro",
  policy: "Política",
  format: "Formato",
  other: "Otro",
};

export function isQualityDocumentCategory(
  value: string | null | undefined
): value is QualityDocumentCategory {
  return !!value && (QUALITY_DOCUMENT_CATEGORIES as readonly string[]).includes(value);
}

export function qualityDocumentCategoryLabel(code: string | null | undefined): string {
  return isQualityDocumentCategory(code) ? QUALITY_DOCUMENT_CATEGORY_LABEL[code] : (code ?? "—");
}
