/**
 * Trazaloop · T9F.2 · Parte PURA de la capa de uso por módulo: tipos y el
 * intérprete de filas de v_organization_module_usage. SIN "server-only" para
 * que las pruebas unitarias la ejerciten directamente; la lectura real (con
 * sesión) vive en lib/db/module-usage.ts, que reexporta todo esto.
 */

export type OrganizationModuleUsage = {
  organizationId: string;
  moduleCode: string;
  documentsTrazadocsCount: number;
  suppliersCount: number;
  materialsCount: number;
  productsCount: number;
  evidencesCount: number;
  productionOrdersCount: number;
  inputBatchesCount: number;
  outputBatchesCount: number;
  storageUsedBytes: number;
  /** T9F.3: bytes RESERVADOS por cargas en curso (intents pending no
   *  vencidos). Comprometen capacidad aunque el archivo aún no exista. */
  storageReservedBytes: number;
  /** T9F.3: objetos con ruta física y tamaño DESCONOCIDO (NULL). Jamás se
   *  interpretan como cero: > 0 bloquea nuevas cargas hasta reconciliar. */
  storageUnknownSizeCount: number;
  /** Objetos físicos con tamaños contradictorios entre referencias (0 = sano). */
  storageObjectConflicts: number;
};

export type ModuleUsageFailureReason =
  | "query_failed"
  | "source_unavailable"
  | "inconsistent_data";

export type ModuleUsageResult =
  | { ok: true; usage: OrganizationModuleUsage }
  | { ok: false; reason: ModuleUsageFailureReason };

/** Interpreta una fila cruda de la vista. PURA y exportada para pruebas:
 *  null/ausente/negativo/no finito ⇒ inconsistent_data (jamás se convierte
 *  en cero). Un cero solo es cero cuando la columna llegó como 0 real. */
export function interpretModuleUsageRow(
  raw: Record<string, unknown> | null | undefined
): ModuleUsageResult {
  if (raw === null || raw === undefined) return { ok: false, reason: "source_unavailable" };

  const num = (key: string): number | null => {
    const v = raw[key];
    if (v === null || v === undefined) return null;
    const n = typeof v === "bigint" ? Number(v) : Number(v);
    if (!Number.isFinite(n) || n < 0) return null;
    return n;
  };

  const fields: [keyof OrganizationModuleUsage, string][] = [
    ["documentsTrazadocsCount", "documents_trazadocs_count"],
    ["suppliersCount", "suppliers_count"],
    ["materialsCount", "materials_count"],
    ["productsCount", "products_count"],
    ["evidencesCount", "evidences_count"],
    ["productionOrdersCount", "production_orders_count"],
    ["inputBatchesCount", "input_batches_count"],
    ["outputBatchesCount", "output_batches_count"],
    ["storageUsedBytes", "storage_used_bytes"],
    ["storageReservedBytes", "storage_reserved_bytes"],
    ["storageUnknownSizeCount", "storage_unknown_size_count"],
    ["storageObjectConflicts", "storage_object_conflicts"],
  ];

  const usage: Partial<OrganizationModuleUsage> = {
    organizationId: String(raw.organization_id ?? ""),
    moduleCode: String(raw.module_code ?? ""),
  };
  for (const [prop, col] of fields) {
    const n = num(col);
    if (n === null) return { ok: false, reason: "inconsistent_data" };
    (usage as Record<string, unknown>)[prop] = n;
  }
  if (!usage.organizationId || !usage.moduleCode) {
    return { ok: false, reason: "inconsistent_data" };
  }
  return { ok: true, usage: usage as OrganizationModuleUsage };
}

