/** Entidades importables por CSV en Sprint 2 y sus columnas de plantilla. */
export type ImportEntity =
  | "suppliers"
  | "product_families"
  | "products"
  | "materials"
  | "input_batches";

export type ImportRowError = { row: number; message: string };

export const IMPORT_TEMPLATES: Record<ImportEntity, string[]> = {
  suppliers: ["name", "tax_id", "contact"],
  product_families: ["name", "description"],
  products: ["code", "name", "family_name", "declared_recycled_percent"],
  materials: ["name", "classification_code"],
  input_batches: [
    "batch_code",
    "supplier_name",
    "material_name",
    "residue_type",
    "provenance",
    "received_date",
    "quantity_kg",
    "storage_location",
    "notes",
  ],
};
