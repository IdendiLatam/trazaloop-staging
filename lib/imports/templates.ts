/**
 * Trazaloop · Sprint 7 · Columnas de plantilla por entidad.
 *
 * Adaptadas al esquema REAL (inspeccionado en supabase/migrations/0020,
 * 0019, 0025) y a los formularios existentes — no a columnas inventadas.
 * Donde la columna sugerida en el brief no existe en el esquema, se adaptó
 * y se documenta la razón en docs/IMPORTS_GUIDE.md:
 *  - suppliers: sin contact_name/email/phone/notes por separado (el
 *    esquema solo tiene un campo "contact" libre).
 *  - materials: sin material_type ni observations (no existen); se
 *    mantiene origin_evidence_name (Parte 4: busca evidencia existente de
 *    la misma empresa; si no existe, ADVERTENCIA, no error — se documenta
 *    la decisión en la Parte 6/13 de la guía).
 *  - products: sin description (no existe); se agrega
 *    declared_recycled_percent (si existe en el esquema y es información
 *    real usada por el motor de riesgo del cálculo).
 *  - input_batches: MISMAS columnas que el importador de catálogos ya
 *    existente (Sprint 3), para no crear dos formatos distintos del mismo
 *    archivo.
 *  - production_orders: sin product_name (no es columna de la orden: el
 *    producto se asocia en el LOTE PRODUCIDO, no en la orden) ni
 *    line_or_machine (no existe); se usa "pretreatment", columna real.
 *  - output_batches: se referencia el producto por product_code (clave
 *    real única de products), no por product_name; declared_recycled_percent
 *    NO es columna de output_batches (es de products, Parte 4 ya la cubre
 *    ahí) así que no se repite aquí.
 *  - batch_composition: se agrega is_same_process (columna real que
 *    alimenta directamente el motor de cálculo: "mismo proceso no cuenta").
 */
import type { ImportEntityType, TemplateColumn } from "./types";

export const TEMPLATE_COLUMNS: Record<ImportEntityType, TemplateColumn[]> = {
  supplier: [
    { key: "supplier_name", required: true, description: "Nombre del proveedor (único por empresa)." },
    { key: "tax_id", required: false, description: "NIT / identificación fiscal (opcional)." },
    { key: "contact", required: false, description: "Datos de contacto en texto libre (opcional)." },
  ],
  material: [
    { key: "material_name", required: true, description: "Nombre del material (único por empresa)." },
    {
      key: "classification_code",
      required: true,
      description: "Código de clasificación normativa (debe existir en el catálogo).",
    },
    {
      key: "origin_evidence_name",
      required: false,
      description:
        "Nombre EXACTO de una evidencia ya existente en tu empresa para usar como soporte de origen (opcional). Si no se encuentra, el material se crea igual con advertencia.",
    },
  ],
  evidence: [
    { key: "evidence_name", required: true, description: "Nombre de la evidencia." },
    { key: "evidence_type", required: false, description: "Tipo de evidencia, texto libre (opcional)." },
    { key: "evidence_date", required: false, description: "Fecha de la evidencia, formato AAAA-MM-DD (opcional)." },
    { key: "responsible", required: false, description: "Responsable de la evidencia (opcional)." },
    { key: "valid_until", required: false, description: "Vigente hasta, formato AAAA-MM-DD (opcional)." },
    { key: "observations", required: false, description: "Observaciones (opcional)." },
  ],
  product_family: [
    { key: "family_name", required: true, description: "Nombre de la familia (único por empresa)." },
    { key: "description", required: false, description: "Descripción (opcional)." },
  ],
  product: [
    { key: "product_name", required: true, description: "Nombre del producto." },
    { key: "product_code", required: true, description: "Código del producto (único por empresa)." },
    {
      key: "product_family_name",
      required: false,
      description: "Nombre EXACTO de una familia ya existente (opcional).",
    },
    {
      key: "declared_recycled_percent",
      required: false,
      description: "Porcentaje de contenido reciclado declarado, 0–100 (opcional).",
    },
  ],
  input_batch: [
    { key: "batch_code", required: true, description: "Código del lote de entrada (único por empresa)." },
    { key: "supplier_name", required: true, description: "Nombre EXACTO de un proveedor ya existente." },
    { key: "material_name", required: true, description: "Nombre EXACTO de un material ya existente." },
    {
      key: "residue_type",
      required: false,
      description: "preconsumer, postconsumer, postindustrial, virgin u other (opcional).",
    },
    { key: "provenance", required: false, description: "Procedencia del material (opcional)." },
    { key: "received_date", required: true, description: "Fecha de recepción, formato AAAA-MM-DD." },
    { key: "quantity_kg", required: false, description: "Cantidad recibida en kg, mayor que 0 (opcional)." },
    { key: "storage_location", required: false, description: "Ubicación de almacenamiento (opcional)." },
    { key: "notes", required: false, description: "Notas (opcional)." },
  ],
  production_order: [
    { key: "production_order_code", required: true, description: "Código de la orden / corrida (único por empresa)." },
    { key: "production_date", required: true, description: "Fecha de la orden / corrida, formato AAAA-MM-DD." },
    { key: "pretreatment", required: false, description: "Pretratamiento aplicado, texto libre (opcional)." },
    { key: "notes", required: false, description: "Notas (opcional)." },
  ],
  batch_consumption: [
    {
      key: "production_order_code",
      required: true,
      description: "Código EXACTO de una orden / corrida ya existente.",
    },
    { key: "input_batch_code", required: true, description: "Código EXACTO de un lote de entrada ya existente." },
    { key: "mass_kg", required: true, description: "Masa consumida en kg, mayor que 0." },
    { key: "notes", required: false, description: "Notas (opcional)." },
  ],
  output_batch: [
    { key: "output_batch_code", required: true, description: "Código del lote producido / lote final (único por empresa)." },
    {
      key: "production_order_code",
      required: true,
      description: "Código EXACTO de una orden / corrida ya existente (obligatoria en el esquema).",
    },
    {
      key: "product_code",
      required: false,
      description: "Código EXACTO de un producto ya existente (opcional; si no se encuentra, se crea el lote sin producto asociado).",
    },
    { key: "production_date", required: false, description: "Fecha de producción, formato AAAA-MM-DD (opcional)." },
    { key: "produced_quantity_kg", required: false, description: "Cantidad producida en kg, mayor que 0 (opcional)." },
    { key: "notes", required: false, description: "Notas (opcional)." },
  ],
  batch_composition: [
    {
      key: "output_batch_code",
      required: true,
      description: "Código EXACTO de un lote producido / lote final ya existente.",
    },
    { key: "material_name", required: true, description: "Nombre EXACTO de un material ya existente." },
    { key: "mass_kg", required: true, description: "Masa del componente en kg, mayor que 0." },
    {
      key: "is_same_process",
      required: false,
      description: "true/false (o sí/no, 1/0). Material recuperado en el mismo proceso: no cuenta como reciclado (opcional, por defecto false).",
    },
    { key: "notes", required: false, description: "Notas (opcional)." },
  ],
};

/** Cabecera de la plantilla (solo encabezados, SIN filas demo ni ficticias —
 *  Parte 3: "no incluir filas demo", "puede incluir únicamente encabezados").
 *  Incluye TODAS las columnas (obligatorias y opcionales): es lo que se
 *  descarga como plantilla oficial. */
export function templateHeader(entity: ImportEntityType): string[] {
  return TEMPLATE_COLUMNS[entity].map((c) => c.key);
}

/** Columnas que el encabezado del CSV DEBE traer para que el archivo se
 *  acepte (Sprint 7.1): solo las marcadas required: true. Las opcionales
 *  pueden faltar del todo — se tratan como valor vacío/null en cada fila. */
export function requiredHeader(entity: ImportEntityType): string[] {
  return TEMPLATE_COLUMNS[entity].filter((c) => c.required).map((c) => c.key);
}

/** Nombre de archivo de plantilla descargable (Parte 3). */
export function templateFilename(entity: ImportEntityType): string {
  const TABLE_NAME: Record<ImportEntityType, string> = {
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
  return `${TABLE_NAME[entity]}_template.csv`;
}
