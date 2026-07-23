/**
 * Trazaloop · Sprint T9E (Textil) · Regla PURA de formularios y selects.
 *
 * Defecto 4.5 (transversal): los tres motores de formulario (catálogos,
 * entidades y asociaciones) inicializaban todo select en "" SIN opción
 * placeholder — el navegador pintaba la primera opción como elegida pero el
 * estado (y el envío) llegaba vacío, y el servidor lo rechazaba
 * ("Tipo … no válido", "La referencia seleccionada no es válida").
 *
 * Regla uniforme (una sola implementación, testeable sin React):
 *   · el estado inicial de un select ES su primera opción real — lo que se
 *     ve seleccionado es exactamente lo que se envía;
 *   · los selects opcionales conservan su opción explícita value "" como
 *     primera opción ("— Sin … —"), que pasa a ser el valor inicial;
 *   · si el valor en estado no corresponde a ninguna opción (lista vacía o
 *     precarga obsoleta), la UI muestra un placeholder deshabilitado —
 *     jamás una opción real que no esté en el estado.
 */

export type CatalogFieldOption = { value: string; label: string };

export type CatalogFieldDef = {
  key: string;
  label: string;
  type: "text" | "select" | "checkbox";
  required?: boolean;
  options?: CatalogFieldOption[];
  placeholder?: string;
  help?: string;
};

export const SELECT_FALLBACK_PLACEHOLDER_LABEL = "Seleccione una opción…";

/** Valor inicial de un campo: los selects arrancan en su PRIMERA opción. */
export function initialFieldValue(f: CatalogFieldDef): string | boolean {
  if (f.type === "checkbox") return false;
  if (f.type === "select") return f.options?.[0]?.value ?? "";
  return "";
}

/** Estado inicial completo de un formulario a partir de sus campos. */
export function emptyFieldValues(
  fields: CatalogFieldDef[]
): Record<string, string | boolean> {
  const v: Record<string, string | boolean> = {};
  for (const f of fields) v[f.key] = initialFieldValue(f);
  return v;
}

/**
 * ¿El select necesita el placeholder de respaldo? Solo cuando el valor en
 * estado no coincide con NINGUNA opción — el invariante visual↔estado.
 */
export function selectNeedsFallbackPlaceholder(
  f: CatalogFieldDef,
  value: string
): boolean {
  return !(f.options ?? []).some((opt) => opt.value === value);
}
