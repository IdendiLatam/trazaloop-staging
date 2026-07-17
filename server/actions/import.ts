"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { checkFeatureEnabled } from "@/server/actions/plans";
import { parseCsv } from "@/lib/csv";
import {
  IMPORT_TEMPLATES,
  type ImportEntity,
  type ImportRowError,
} from "@/lib/import-templates";


export type ImportValidation = {
  entity: ImportEntity;
  totalRows: number;
  validRows: number;
  errors: ImportRowError[];
  /** Filas parseadas (encabezado excluido) para reenviar al confirmar. */
  rows: Record<string, string>[];
  error: string | null;
};

export type ImportCommitResult = {
  inserted: number;
  error: string | null;
};

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase();
}

async function validateRows(
  entity: ImportEntity,
  rows: Record<string, string>[],
  orgId: string
): Promise<ImportRowError[]> {
  const supabase = await createServerClient();
  const errors: ImportRowError[] = [];
  const seen = new Set<string>();

  // Datos existentes para validar unicidad y referencias.
  const existing = new Set<string>();
  if (entity === "suppliers" || entity === "product_families" || entity === "materials") {
    const table = entity === "product_families" ? "product_families" : entity;
    const { data } = await supabase.from(table).select("name").eq("organization_id", orgId);
    for (const r of data ?? []) existing.add(String(r.name).toLowerCase());
  }
  if (entity === "products") {
    const { data } = await supabase.from("products").select("code").eq("organization_id", orgId);
    for (const r of data ?? []) existing.add(String(r.code).toLowerCase());
  }
  if (entity === "input_batches") {
    const { data } = await supabase
      .from("input_batches")
      .select("batch_code")
      .eq("organization_id", orgId);
    for (const r of data ?? []) existing.add(String(r.batch_code).toLowerCase());
  }

  const supplierNames = new Set<string>();
  const materialNames = new Set<string>();
  if (entity === "input_batches") {
    const [{ data: sups }, { data: mats }] = await Promise.all([
      supabase.from("suppliers").select("name").eq("organization_id", orgId),
      supabase.from("materials").select("name").eq("organization_id", orgId),
    ]);
    for (const r of sups ?? []) supplierNames.add(String(r.name).toLowerCase());
    for (const r of mats ?? []) materialNames.add(String(r.name).toLowerCase());
  }

  const familyNames = new Set<string>();
  if (entity === "products") {
    const { data } = await supabase
      .from("product_families")
      .select("name")
      .eq("organization_id", orgId);
    for (const r of data ?? []) familyNames.add(String(r.name).toLowerCase());
  }

  const classifications = new Set<string>();
  if (entity === "materials") {
    const { data } = await supabase.from("material_classifications").select("code");
    for (const r of data ?? []) classifications.add(String(r.code));
  }

  rows.forEach((row, i) => {
    const line = i + 2; // 1 = encabezado

    const keyField =
      entity === "products" ? "code" : entity === "input_batches" ? "batch_code" : "name";
    const key = (row[keyField] ?? "").trim();

    if (!key) {
      errors.push({ row: line, message: `El campo "${keyField}" es obligatorio.` });
      return;
    }
    if (seen.has(key.toLowerCase())) {
      errors.push({ row: line, message: `"${key}" está duplicado dentro del archivo.` });
      return;
    }
    seen.add(key.toLowerCase());

    if (existing.has(key.toLowerCase())) {
      errors.push({ row: line, message: `"${key}" ya existe en tu empresa.` });
      return;
    }

    if (entity === "products") {
      if (!(row["name"] ?? "").trim()) {
        errors.push({ row: line, message: `El campo "name" es obligatorio.` });
        return;
      }
      const fam = (row["family_name"] ?? "").trim();
      if (fam && !familyNames.has(fam.toLowerCase())) {
        errors.push({
          row: line,
          message: `La familia "${fam}" no existe. Créala o impórtala primero.`,
        });
        return;
      }
      const declared = (row["declared_recycled_percent"] ?? "").trim();
      if (declared !== "") {
        const n = Number(declared);
        if (Number.isNaN(n) || n < 0 || n > 100) {
          errors.push({
            row: line,
            message: `"declared_recycled_percent" debe ser un número entre 0 y 100.`,
          });
          return;
        }
      }
    }

    if (entity === "materials") {
      const cls = (row["classification_code"] ?? "").trim();
      if (!cls) {
        errors.push({ row: line, message: `El campo "classification_code" es obligatorio.` });
        return;
      }
      if (!classifications.has(cls)) {
        errors.push({
          row: line,
          message: `La clasificación "${cls}" no existe. Usa un código del catálogo.`,
        });
        return;
      }
    }

    if (entity === "input_batches") {
      const supplier = (row["supplier_name"] ?? "").trim();
      const material = (row["material_name"] ?? "").trim();
      const residue = (row["residue_type"] ?? "").trim();
      const receivedDate = (row["received_date"] ?? "").trim();
      const quantity = (row["quantity_kg"] ?? "").trim();

      if (!supplier) {
        errors.push({ row: line, message: `El campo "supplier_name" es obligatorio.` });
        return;
      }
      if (!supplierNames.has(supplier.toLowerCase())) {
        errors.push({
          row: line,
          message: `El proveedor "${supplier}" no existe. Créalo o impórtalo primero.`,
        });
        return;
      }
      if (!material) {
        errors.push({ row: line, message: `El campo "material_name" es obligatorio.` });
        return;
      }
      if (!materialNames.has(material.toLowerCase())) {
        errors.push({
          row: line,
          message: `El material "${material}" no existe. Créalo o impórtalo primero.`,
        });
        return;
      }
      const RESIDUE_TYPES = ["preconsumer", "postconsumer", "postindustrial", "virgin", "other"];
      if (residue && !RESIDUE_TYPES.includes(residue)) {
        errors.push({
          row: line,
          message: `"residue_type" debe ser uno de: ${RESIDUE_TYPES.join(", ")}.`,
        });
        return;
      }
      if (!receivedDate) {
        errors.push({ row: line, message: `El campo "received_date" es obligatorio.` });
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(receivedDate) || Number.isNaN(Date.parse(receivedDate))) {
        errors.push({
          row: line,
          message: `"received_date" debe ser una fecha válida en formato AAAA-MM-DD.`,
        });
        return;
      }
      if (quantity !== "") {
        const n = Number(quantity);
        if (Number.isNaN(n) || n <= 0) {
          errors.push({
            row: line,
            message: `"quantity_kg" debe ser un número mayor que 0.`,
          });
          return;
        }
      }
    }
  });

  return errors;
}

/** Paso 1: parsear + validar. Registra un import_job con status 'validated'. */
export async function validateImportAction(
  entity: ImportEntity,
  filename: string,
  csvText: string
): Promise<ImportValidation> {
  const org = await requireActiveOrg();
  const supabase = await createServerClient();

  const empty: ImportValidation = {
    entity,
    totalRows: 0,
    validRows: 0,
    errors: [],
    rows: [],
    error: null,
  };

  // Sprint 10A (Bloqueante 2): mismo criterio que validateImportCsvAction
  // — validar ya escribe un import_job real, no es un paso "sin efecto".
  const featureCheck = await checkFeatureEnabled("imports_enabled");
  if (!featureCheck.allowed) return { ...empty, error: featureCheck.error };

  if (!IMPORT_TEMPLATES[entity]) return { ...empty, error: "Entidad no soportada." };

  const parsed = parseCsv(csvText);
  if (parsed.length < 2) {
    return { ...empty, error: "El archivo no tiene filas de datos. Descarga la plantilla y complétala." };
  }

  const expected = IMPORT_TEMPLATES[entity];
  const header = parsed[0].map(normalizeHeader);
  const missing = expected.filter((c) => !header.includes(c));
  if (missing.length > 0) {
    return { ...empty, error: `Faltan columnas en el encabezado: ${missing.join(", ")}.` };
  }

  const rows: Record<string, string>[] = parsed.slice(1).map((cells) => {
    const row: Record<string, string> = {};
    header.forEach((col, idx) => {
      row[col] = (cells[idx] ?? "").trim();
    });
    return row;
  });

  const errors = await validateRows(entity, rows, org.organizationId);

  await supabase.from("import_jobs").insert({
    organization_id: org.organizationId,
    entity,
    filename,
    total_rows: rows.length,
    inserted_rows: 0,
    skipped_rows: errors.length,
    status: "validated",
    errors,
  });

  return {
    entity,
    totalRows: rows.length,
    validRows: rows.length - errors.length,
    errors,
    rows,
    error: null,
  };
}

/**
 * Paso 2 (tras confirmación del usuario): re-validar y hacer commit.
 * Catálogos maestros: solo se importa si hay CERO errores.
 * Registra un import_job 'committed' o 'failed'.
 */
export async function commitImportAction(
  entity: ImportEntity,
  filename: string,
  rows: Record<string, string>[]
): Promise<ImportCommitResult> {
  const org = await requireActiveOrg();
  const supabase = await createServerClient();

  // Sprint 10A (Parte 8): Demo no incluye importaciones.
  const featureCheck = await checkFeatureEnabled("imports_enabled");
  if (!featureCheck.allowed) return { inserted: 0, error: featureCheck.error };

  const errors = await validateRows(entity, rows, org.organizationId);
  if (errors.length > 0) {
    await supabase.from("import_jobs").insert({
      organization_id: org.organizationId,
      entity,
      filename,
      total_rows: rows.length,
      inserted_rows: 0,
      skipped_rows: errors.length,
      status: "failed",
      errors,
    });
    return {
      inserted: 0,
      error: `La importación tiene ${errors.length} error(es). Corrige el archivo y vuelve a validar.`,
    };
  }

  let familyByName = new Map<string, string>();
  if (entity === "products") {
    const { data } = await supabase
      .from("product_families")
      .select("id, name")
      .eq("organization_id", org.organizationId);
    familyByName = new Map((data ?? []).map((f) => [String(f.name).toLowerCase(), f.id]));
  }

  let supplierByName = new Map<string, string>();
  let materialByName = new Map<string, string>();
  if (entity === "input_batches") {
    const [{ data: sups }, { data: mats }] = await Promise.all([
      supabase.from("suppliers").select("id, name").eq("organization_id", org.organizationId),
      supabase.from("materials").select("id, name").eq("organization_id", org.organizationId),
    ]);
    supplierByName = new Map((sups ?? []).map((s) => [String(s.name).toLowerCase(), s.id]));
    materialByName = new Map((mats ?? []).map((m) => [String(m.name).toLowerCase(), m.id]));
  }

  const payload = rows.map((row) => {
    switch (entity) {
      case "suppliers":
        return {
          organization_id: org.organizationId,
          name: row.name,
          tax_id: row.tax_id || null,
          contact: row.contact || null,
        };
      case "product_families":
        return {
          organization_id: org.organizationId,
          name: row.name,
          description: row.description || null,
        };
      case "products":
        return {
          organization_id: org.organizationId,
          code: row.code,
          name: row.name,
          family_id: row.family_name
            ? familyByName.get(row.family_name.toLowerCase()) ?? null
            : null,
          declared_recycled_percent:
            row.declared_recycled_percent === "" ? null : Number(row.declared_recycled_percent),
        };
      case "materials":
        return {
          organization_id: org.organizationId,
          name: row.name,
          classification_code: row.classification_code,
        };
      case "input_batches":
        return {
          organization_id: org.organizationId,
          batch_code: row.batch_code,
          supplier_id: supplierByName.get(row.supplier_name.toLowerCase()) ?? null,
          material_id: materialByName.get(row.material_name.toLowerCase()) ?? null,
          residue_type: row.residue_type || null,
          provenance: row.provenance || null,
          received_date: row.received_date,
          quantity_kg: row.quantity_kg === "" ? null : Number(row.quantity_kg),
          storage_location: row.storage_location || null,
          notes: row.notes || null,
        };
    }
  });

  const table = entity;
  const { error } = await supabase.from(table).insert(payload);

  const status = error ? "failed" : "committed";
  await supabase.from("import_jobs").insert({
    organization_id: org.organizationId,
    entity,
    filename,
    total_rows: rows.length,
    inserted_rows: error ? 0 : rows.length,
    skipped_rows: 0,
    status,
    errors: error ? [{ row: 0, message: "Error al insertar en base de datos." }] : [],
  });

  if (error) return { inserted: 0, error: "No fue posible importar. Intenta de nuevo." };

  revalidatePath("/catalog");
  revalidatePath("/traceability/input-batches");
  return { inserted: rows.length, error: null };
}
