/**
 * Trazaloop · Sprint T3 (Textil) · Dominio PURO de los catálogos textiles.
 *
 * Enumeraciones, etiquetas en español y validación de entradas — sin BD ni
 * sesión, testeable en tests/unit/textiles-catalogs.test.ts. Los valores
 * espejan los CHECK de la migración 0073 (fuente única en BD; aquí para
 * validar ANTES de tocar la BD y dar mensajes amigables).
 *
 * Lenguaje (N-05 / ISO 14021): recycled_claim / organic_claim registran
 * DECLARACIONES preliminares de catálogo — nunca afirmaciones soportadas ni
 * esquemas externos verificados; las evidencias llegan en T5.
 */

export const TEXTILE_SUPPLIER_TYPES = [
  "fabric_supplier",
  "trims_supplier",
  "thread_supplier",
  "packaging_supplier",
  "outsourced_process",
  "mixed",
  "other",
] as const;
export type TextileSupplierType = (typeof TEXTILE_SUPPLIER_TYPES)[number];

export const TEXTILE_SUPPLIER_TYPE_LABEL: Record<TextileSupplierType, string> = {
  fabric_supplier: "Proveedor de telas",
  trims_supplier: "Proveedor de avíos",
  thread_supplier: "Proveedor de hilos",
  packaging_supplier: "Proveedor de empaque",
  outsourced_process: "Tercero de proceso",
  mixed: "Mixto",
  other: "Otro",
};

export const TEXTILE_MATERIAL_TYPES = [
  "main_fabric",
  "secondary_fabric",
  "lining",
  "thread",
  "interlining",
  "label",
  "packaging",
  "trim",
  "other",
] as const;
export type TextileMaterialType = (typeof TEXTILE_MATERIAL_TYPES)[number];

export const TEXTILE_MATERIAL_TYPE_LABEL: Record<TextileMaterialType, string> = {
  main_fabric: "Tela principal",
  secondary_fabric: "Tela secundaria",
  lining: "Forro",
  thread: "Hilo",
  interlining: "Entretela",
  label: "Etiqueta / marquilla",
  packaging: "Empaque",
  trim: "Avío (material)",
  other: "Otro",
};

export const TEXTILE_COMPONENT_TYPES = [
  "button",
  "zipper",
  "snap",
  "elastic",
  "label",
  "patch",
  "drawcord",
  "buckle",
  "hook_loop",
  "metal_part",
  "plastic_part",
  "packaging_component",
  "other",
] as const;
export type TextileComponentType = (typeof TEXTILE_COMPONENT_TYPES)[number];

export const TEXTILE_COMPONENT_TYPE_LABEL: Record<TextileComponentType, string> = {
  button: "Botón",
  zipper: "Cierre / cremallera",
  snap: "Broche",
  elastic: "Elástico",
  label: "Etiqueta",
  patch: "Parche",
  drawcord: "Cordón",
  buckle: "Hebilla",
  hook_loop: "Velcro / gancho",
  metal_part: "Parte metálica",
  plastic_part: "Parte plástica",
  packaging_component: "Componente de empaque",
  other: "Otro",
};

export const TEXTILE_SEPARABILITY_VALUES = [
  "easy",
  "moderate",
  "difficult",
  "not_evaluated",
] as const;
export type TextileSeparability = (typeof TEXTILE_SEPARABILITY_VALUES)[number];

export const TEXTILE_SEPARABILITY_LABEL: Record<TextileSeparability, string> = {
  easy: "Fácil",
  moderate: "Moderada",
  difficult: "Difícil",
  not_evaluated: "Sin evaluar",
};

export const TEXTILE_PROCESS_TYPES = [
  "design",
  "cutting",
  "sewing",
  "finishing",
  "inspection",
  "ironing",
  "packing",
  "dispatch",
  "other",
] as const;
export type TextileProcessType = (typeof TEXTILE_PROCESS_TYPES)[number];

export const TEXTILE_PROCESS_TYPE_LABEL: Record<TextileProcessType, string> = {
  design: "Diseño",
  cutting: "Corte",
  sewing: "Confección",
  finishing: "Acabado",
  inspection: "Inspección",
  ironing: "Planchado",
  packing: "Empaque",
  dispatch: "Despacho",
  other: "Otro",
};

export const TEXTILE_OUTSOURCED_PROCESS_TYPES = [
  "washing",
  "dyeing",
  "printing",
  "embroidery",
  "finishing",
  "coating",
  "pleating",
  "external_sewing",
  "inspection",
  "other",
] as const;
export type TextileOutsourcedProcessType = (typeof TEXTILE_OUTSOURCED_PROCESS_TYPES)[number];

export const TEXTILE_OUTSOURCED_PROCESS_TYPE_LABEL: Record<TextileOutsourcedProcessType, string> = {
  washing: "Lavado",
  dyeing: "Tintura",
  printing: "Estampación",
  embroidery: "Bordado",
  finishing: "Acabado",
  coating: "Recubrimiento",
  pleating: "Plisado",
  external_sewing: "Confección externa",
  inspection: "Inspección",
  other: "Otro",
};

export const TEXTILE_TRACEABILITY_RISK_VALUES = [
  "low",
  "medium",
  "high",
  "not_evaluated",
] as const;
export type TextileTraceabilityRisk = (typeof TEXTILE_TRACEABILITY_RISK_VALUES)[number];

export const TEXTILE_TRACEABILITY_RISK_LABEL: Record<TextileTraceabilityRisk, string> = {
  low: "Bajo",
  medium: "Medio",
  high: "Alto",
  not_evaluated: "Sin evaluar",
};

/**
 * Sprint T9E · Orden de UI para selects de valoración opcional: el valor
 * NEUTRO ("Sin evaluar") va primero, porque el primer valor visible es
 * también el valor inicial real del formulario — un registro nuevo nunca
 * debe nacer con una valoración accidental. Solo afecta el orden en
 * pantalla; los valores permitidos (CHECK de 0073) no cambian.
 */
export const TEXTILE_SEPARABILITY_UI_ORDER: readonly TextileSeparability[] = [
  "not_evaluated",
  "easy",
  "moderate",
  "difficult",
];

export const TEXTILE_TRACEABILITY_RISK_UI_ORDER: readonly TextileTraceabilityRisk[] = [
  "not_evaluated",
  "low",
  "medium",
  "high",
];

export const TEXTILE_FIBER_FAMILIES = [
  "natural_cellulosic",
  "natural_protein",
  "synthetic",
  "regenerated_cellulosic",
  "inorganic",
  "other",
] as const;
export type TextileFiberFamily = (typeof TEXTILE_FIBER_FAMILIES)[number];

export const TEXTILE_FIBER_FAMILY_LABEL: Record<string, string> = {
  natural_cellulosic: "Natural celulósica",
  natural_protein: "Natural proteica",
  synthetic: "Sintética",
  regenerated_cellulosic: "Celulósica regenerada",
  inorganic: "Inorgánica",
  other: "Otra",
};

/**
 * Sprint T9E · Procedencia del catálogo de fibras (defecto 4.4): las fibras
 * base son un catálogo GLOBAL sembrado por la migración 0073 y mantenido
 * por Trazaloop; las organizaciones no pueden modificarlas ni eliminarlas.
 * Desde 0093 cada organización puede además registrar fibras personalizadas
 * propias (aisladas por tenant vía RLS).
 */
export const TEXTILE_FIBER_BASE_CATALOG_TITLE = "Catálogo base de Trazaloop";

export const TEXTILE_FIBER_BASE_CATALOG_EXPLANATION =
  "Estas fibras provienen del catálogo base mantenido por Trazaloop y están disponibles " +
  "para todas las organizaciones. No pueden modificarse ni eliminarse. Si necesitas una " +
  "fibra que no aparece aquí, registra una fibra personalizada de tu organización.";

export const TEXTILE_FIBER_CUSTOM_SECTION_TITLE = "Fibras personalizadas de tu organización";

export const TEXTILE_FIBER_CUSTOM_EXPLANATION =
  "Las fibras personalizadas solo son visibles y utilizables por tu organización. Pueden " +
  "usarse en materiales y composiciones igual que las del catálogo base; su nombre no puede " +
  "repetir el de una fibra existente.";

/**
 * Sprint T9E · Roles autorizados para operaciones administrativas de
 * catálogo: eliminación física de registros sin relaciones y gestión de
 * fibras personalizadas. Espejo EXACTO de las políticas RLS (0073 delete y
 * 0093 insert/update/delete: array['admin','quality']) — la UI oculta, la
 * action valida y la RLS decide.
 */
export function canAdministerTextileCatalogs(roleCode: string): boolean {
  return roleCode === "admin" || roleCode === "quality";
}

export const TEXTILE_CATALOGS_DISCLAIMER =
  "Estos catálogos registran información preliminar declarada por la empresa. No equivalen " +
  "a certificación ni validación externa; el soporte documental (evidencias) se gestiona " +
  "en una etapa posterior.";

/** Correo válido (mismo criterio del CHECK en 0073). */
export function isValidEmail(value: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
}

/** Normaliza texto de formulario: recorta y devuelve null si queda vacío. */
export function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function isOneOf<T extends readonly string[]>(
  values: T,
  value: unknown
): value is T[number] {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

/**
 * Valida los campos comunes de cualquier registro de catálogo.
 * Devuelve el nombre limpio o un error amigable.
 */
export function validateCatalogName(raw: unknown):
  | { name: string; error: null }
  | { name: null; error: string } {
  const name = cleanText(raw);
  if (!name) return { name: null, error: "El nombre es obligatorio." };
  if (name.length > 200) return { name: null, error: "El nombre es demasiado largo (máx. 200)." };
  return { name, error: null };
}
