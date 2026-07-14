/**
 * Trazaloop · Sprint 7 · Tipos compartidos de la carga masiva por CSV.
 * Sin imports de Supabase ni de servidor: todo lo de lib/imports/ es lógica
 * PURA, testeable sin BD con `npm run test:imports`.
 */

/** Las 10 entidades importables (Parte 2 del Sprint 7). El código interno
 *  (columna entity_type de import_job_rows) usa singular; import_jobs.entity
 *  (0021/0027) usa el nombre de tabla en plural — ENTITY_TABLE mapea entre
 *  ambos sin cambiar ninguno de los dos esquemas existentes. */
export const IMPORT_ENTITY_TYPES = [
  "supplier",
  "material",
  "evidence",
  "product_family",
  "product",
  "input_batch",
  "production_order",
  "batch_consumption",
  "output_batch",
  "batch_composition",
] as const;
export type ImportEntityType = (typeof IMPORT_ENTITY_TYPES)[number];

/** Nombre de tabla real (plural, tal cual existe en el esquema — nunca se
 *  renombra). Usado para el campo import_jobs.entity y para las consultas. */
export const ENTITY_TABLE: Record<ImportEntityType, string> = {
  supplier: "suppliers",
  material: "materials",
  evidence: "evidences",
  product_family: "product_families",
  product: "products",
  input_batch: "input_batches",
  production_order: "production_orders",
  batch_consumption: "batch_consumption",
  output_batch: "output_batches",
  batch_composition: "batch_composition",
};

export const ENTITY_LABEL: Record<ImportEntityType, string> = {
  supplier: "Proveedores",
  material: "Materiales",
  evidence: "Evidencias (solo metadatos)",
  product_family: "Familias de producto",
  product: "Productos",
  input_batch: "Lotes de entrada",
  production_order: "Órdenes / corridas de producción",
  batch_consumption: "Consumos de lotes de entrada",
  output_batch: "Lotes producidos / lotes finales",
  batch_composition: "Composición de lotes producidos",
};

/** Orden recomendado de importación (Parte 2, priorización del sprint):
 *  cada entidad depende de que las anteriores ya existan. */
export const IMPORT_ORDER: ImportEntityType[] = [
  "supplier",
  "material",
  "evidence",
  "product_family",
  "product",
  "input_batch",
  "production_order",
  "batch_consumption",
  "output_batch",
  "batch_composition",
];

/** Mismos valores que el enum residue_type (0002_enums_core.sql) — no se
 *  redefine el enum, solo se replica la lista para validar en TS puro. */
export const RESIDUE_TYPES = [
  "preconsumer",
  "postconsumer",
  "postindustrial",
  "virgin",
  "other",
] as const;

export type RowIssue = { field: string | null; message: string };

export type RowStatus = "pending" | "valid" | "warning" | "error" | "imported" | "skipped";

/** Resultado PURO de validar una fila (antes de tocar BD): datos
 *  normalizados listos para insertar + errores (bloquean el commit) +
 *  advertencias (no bloquean, la fila se importa o se omite según la
 *  advertencia). */
export type RowValidationResult = {
  rowNumber: number;
  status: Extract<RowStatus, "valid" | "warning" | "error">;
  raw: Record<string, string>;
  normalized: Record<string, unknown>;
  errors: RowIssue[];
  warnings: RowIssue[];
  /** true si la fila coincide con un registro ya existente (mismo natural
   *  key) y debe OMITIRSE al confirmar en vez de crearse (Parte 6, modo
   *  "crear solamente"). */
  skipExisting: boolean;
};

/** Datos de referencia de la empresa activa que los validadores puros
 *  necesitan para resolver relaciones (nombres → existencia). Se arman en
 *  el server action (lib/db) y se pasan como argumento simple: los
 *  validadores en sí NO llaman a Supabase. */
export type ReferenceData = {
  existingKeys: Set<string>; // natural keys ya existentes de la MISMA entidad (minúsculas)
  supplierNames?: Set<string>;
  materialNames?: Set<string>;
  materialClassifications?: Set<string>;
  productFamilyNames?: Set<string>;
  productCodes?: Set<string>;
  evidenceNames?: Set<string>;
  inputBatchCodes?: Set<string>;
  productionOrderCodes?: Set<string>;
  outputBatchCodes?: Set<string>;
};

export type HeaderValidation = {
  ok: boolean;
  error: string | null;
  normalizedHeader: string[];
};

export type TemplateColumn = {
  key: string;
  required: boolean;
  description: string;
};
