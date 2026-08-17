/**
 * Trazaloop · RH-01.3 · Capa de PRESENTACIÓN de nomenclatura visible.
 *
 * La base de datos genera textos históricos (suggested_action,
 * gap_description, missing_items, next_step_label de las vistas 0026/0031/
 * 0032/0104/0106) con la denominación anterior. Corregirlos en SQL exigiría
 * tocar migraciones ya aplicadas en producción, así que la normalización
 * ocurre AQUÍ, justo antes de mostrarlos.
 *
 * Reglas oficiales:
 *   «orden de producción»  → «orden / corrida de producción»
 *   «lote de salida»       → «lote producido / lote final»
 *
 * ⚠️ Solo TEXTO VISIBLE. Ningún identificador técnico cambia: las columnas
 * (production_orders, output_batches), las RPC, los códigos de brecha
 * (gap_code, next_step_code) y las rutas siguen intactos — esta capa nunca
 * se aplica a códigos, slugs ni claves.
 *
 * Lógica PURA (sin BD, sin sesión, sin Next): usable desde Server
 * Components, Client Components y tests/unit. Idempotente: aplicarla dos
 * veces produce el mismo resultado (los textos ya normalizados no vuelven a
 * coincidir con ningún patrón).
 */

export type VisibleNomenclatureRule = {
  /** Denominación histórica tal como la genera la BD. */
  legacy: string;
  /** Denominación oficial visible. */
  preferred: string;
  pattern: RegExp;
};

/**
 * Orden significativo: las formas plurales van primero para que nunca las
 * "muerda" una regla singular. Sin `\b` al inicio porque las palabras
 * acentuadas ("órdenes") no producen frontera de palabra ASCII en JS.
 */
export const VISIBLE_NOMENCLATURE_RULES: readonly VisibleNomenclatureRule[] = [
  {
    legacy: "lotes de salida",
    preferred: "lotes producidos / lotes finales",
    pattern: /lotes de salida/gi,
  },
  {
    legacy: "lote de salida",
    preferred: "lote producido / lote final",
    pattern: /lote de salida/gi,
  },
  {
    legacy: "órdenes de producción",
    preferred: "órdenes / corridas de producción",
    pattern: /[óo]rdenes de producci[óo]n/gi,
  },
  {
    legacy: "orden de producción",
    preferred: "orden / corrida de producción",
    pattern: /orden de producci[óo]n/gi,
  },
];

/** Conserva la mayúscula inicial del texto original ("Orden…" → "Orden / …"). */
function applyInitialCase(match: string, replacement: string): string {
  const first = match.charAt(0);
  if (first === first.toLocaleLowerCase("es")) return replacement;
  return replacement.charAt(0).toLocaleUpperCase("es") + replacement.slice(1);
}

/**
 * Normaliza UN texto generado por la BD antes de mostrarlo. Es la única
 * función que deben usar los componentes: nunca se repiten `.replace()`
 * sueltos por pantalla.
 */
export function normalizeVisibleText(text: string): string {
  let out = text;
  for (const rule of VISIBLE_NOMENCLATURE_RULES) {
    // Se crea un RegExp nuevo por llamada: el patrón exportado lleva el flag
    // /g y su lastIndex es estado mutable compartido.
    out = out.replace(new RegExp(rule.pattern.source, rule.pattern.flags), (m) =>
      applyInitialCase(m, rule.preferred)
    );
  }
  return out;
}

/** Versión para arreglos de texto de la BD (p. ej. missing_items). */
export function normalizeVisibleTexts(texts: readonly string[]): string[] {
  return texts.map(normalizeVisibleText);
}

/** ¿Este texto conserva alguna denominación histórica? (usado por las pruebas). */
export function containsLegacyNomenclature(text: string): boolean {
  return VISIBLE_NOMENCLATURE_RULES.some((rule) =>
    new RegExp(rule.pattern.source, rule.pattern.flags).test(text)
  );
}
