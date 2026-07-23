"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { checkCprFeatureEnabled, checkCprResourceLimit } from "@/server/actions/module-plans";
import { requireCprForAction } from "@/lib/auth/require-cpr-module";
import type { ResourceCode } from "@/lib/plans/types";

/** Recurso de plan_limits que consume cada entidad importable (null = la
 *  entidad no tiene límite propio en el catálogo: consumos y composiciones
 *  son relaciones, y las familias no están limitadas). */
function importEntityResourceCode(entity: ImportEntityType): ResourceCode | null {
  switch (entity) {
    case "supplier":
      return "suppliers";
    case "material":
      return "materials";
    case "evidence":
      return "evidences";
    case "product":
      return "products";
    case "input_batch":
      return "input_batches";
    case "production_order":
      return "production_orders";
    case "output_batch":
      return "output_batches";
    default:
      return null;
  }
}
import { createServerClient } from "@/lib/supabase/server";
import { toCsv } from "@/lib/csv";
import {
  IMPORT_ENTITY_TYPES,
  IMPORT_ORDER,
  ENTITY_TABLE,
  ENTITY_LABEL,
  type ImportEntityType,
} from "@/lib/imports/types";
import { templateHeader, templateFilename, TEMPLATE_COLUMNS } from "@/lib/imports/templates";
import { parseImportCsv } from "@/lib/imports/parse";
import { validateRows } from "@/lib/imports/validators";
import type { RowValidationResult } from "@/lib/imports/types";
import { getReferenceData, getLookupMaps, insertBusinessRows } from "@/lib/db/imports";

const IMPORT_ROLES = ["admin", "quality", "consultant"] as const;

function isImportEntity(v: string | null): v is ImportEntityType {
  return !!v && (IMPORT_ENTITY_TYPES as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// Plantillas (Parte 3)
// ---------------------------------------------------------------------------
export type ImportTemplateInfo = {
  entity: ImportEntityType;
  label: string;
  filename: string;
  columns: { key: string; required: boolean; description: string }[];
};

export async function getImportTemplatesAction(): Promise<ImportTemplateInfo[]> {
  await requireActiveOrg();
  return IMPORT_ORDER.map((entity) => ({
    entity,
    label: ENTITY_LABEL[entity],
    filename: templateFilename(entity),
    columns: TEMPLATE_COLUMNS[entity],
  }));
}

/** Devuelve SOLO encabezados (Parte 3: sin filas demo ni ficticias). */
export async function downloadImportTemplateAction(
  entityType: string
): Promise<{ filename: string; csv: string; error: string | null }> {
  // T9F.1: las plantillas de importación son parte del módulo CPR.
  const gate = await requireCprForAction();
  if (gate.error !== null) return { filename: "", csv: "", error: gate.error };
  if (!isImportEntity(entityType)) {
    return { filename: "", csv: "", error: "Entidad no soportada." };
  }
  const csv = toCsv([templateHeader(entityType)]);
  return { filename: templateFilename(entityType), csv, error: null };
}

// ---------------------------------------------------------------------------
// Paso 1: validar / vista previa (Parte 5)
// ---------------------------------------------------------------------------
export type ImportPreviewState = {
  error: string | null;
  jobId: string | null;
  entity: ImportEntityType | null;
  filename: string | null;
  totalRows: number;
  validCount: number;
  warningCount: number;
  errorCount: number;
  skipCount: number;
  rows: RowValidationResult[];
};

const emptyPreview: ImportPreviewState = {
  error: null,
  jobId: null,
  entity: null,
  filename: null,
  totalRows: 0,
  validCount: 0,
  warningCount: 0,
  errorCount: 0,
  skipCount: 0,
  rows: [],
};

function summarize(rows: RowValidationResult[]) {
  return {
    validCount: rows.filter((r) => r.status === "valid").length,
    warningCount: rows.filter((r) => r.status === "warning" && !r.skipExisting).length,
    errorCount: rows.filter((r) => r.status === "error").length,
    skipCount: rows.filter((r) => r.skipExisting).length,
  };
}

/** Entity singular (import_job_rows.entity_type / lib/imports) → tabla
 *  plural (import_jobs.entity, tal como ya existe desde 0021/0027). */
function jobEntityColumn(entity: ImportEntityType): string {
  return ENTITY_TABLE[entity];
}

export async function validateImportCsvAction(
  _prev: ImportPreviewState,
  formData: FormData
): Promise<ImportPreviewState> {
  const org = await requireActiveOrg();
  const supabase = await createServerClient();

  if (!IMPORT_ROLES.includes(org.roleCode as (typeof IMPORT_ROLES)[number])) {
    return { ...emptyPreview, error: "Tu rol no permite importar datos en esta empresa." };
  }

  // Sprint 10A (Bloqueante 2): Demo bloquea importaciones desde el PRIMER
  // paso — validar ya crea import_jobs/import_job_rows reales, no es un
  // paso "sin efecto" que se pueda dejar pasar.
  const featureCheck = await checkCprFeatureEnabled("imports_enabled");
  if (!featureCheck.allowed) return { ...emptyPreview, error: featureCheck.error };

  const entityRaw = String(formData.get("entity_type") ?? "");
  if (!isImportEntity(entityRaw)) {
    return { ...emptyPreview, error: "Selecciona un tipo de entidad válido." };
  }
  const entity = entityRaw;

  const file = formData.get("file") as File | null;
  const pastedText = String(formData.get("csv_text") ?? "");
  let filename = String(formData.get("filename") ?? "").trim() || "archivo.csv";
  let csvText = pastedText;
  if (file && file.size > 0) {
    csvText = await file.text();
    filename = file.name;
  }

  if (!csvText || !csvText.trim()) {
    return { ...emptyPreview, entity, filename, error: "Sube un archivo CSV o pega el contenido para validar." };
  }

  const parsed = parseImportCsv(entity, csvText);
  if (parsed.error) {
    return { ...emptyPreview, entity, filename, error: parsed.error };
  }

  const ref = await getReferenceData(org.organizationId, entity);
  const results = validateRows(entity, parsed.rows, ref);
  const { validCount, warningCount, errorCount, skipCount } = summarize(results);

  // Registro histórico INMUTABLE del evento de validación (mismo patrón que
  // el importador de catálogos existente, server/actions/import.ts).
  const { data: job, error: jobError } = await supabase
    .from("import_jobs")
    .insert({
      organization_id: org.organizationId,
      entity: jobEntityColumn(entity),
      filename,
      total_rows: results.length,
      inserted_rows: 0,
      skipped_rows: errorCount + skipCount,
      status: "validated",
      errors: results.flatMap((r) => r.errors.map((e) => ({ row: r.rowNumber, ...e }))),
    })
    .select("id")
    .single();

  if (jobError || !job) {
    return { ...emptyPreview, entity, filename, error: "No fue posible registrar la validación. Intenta de nuevo." };
  }

  const rowPayload = results.map((r) => ({
    organization_id: org.organizationId,
    import_job_id: job.id,
    row_number: r.rowNumber,
    status: r.status,
    entity_type: entity,
    raw_data: r.raw,
    normalized_data: r.normalized,
    errors: r.errors,
    warnings: r.warnings,
  }));
  // Insertar en lotes para archivos grandes (Supabase/PostgREST tiene límite
  // práctico por request); 500 filas por lote es holgado bajo MAX_ROWS (5000).
  for (let i = 0; i < rowPayload.length; i += 500) {
    await supabase.from("import_job_rows").insert(rowPayload.slice(i, i + 500));
  }

  return {
    error: null,
    jobId: job.id as string,
    entity,
    filename,
    totalRows: results.length,
    validCount,
    warningCount,
    errorCount,
    skipCount,
    rows: results,
  };
}

// ---------------------------------------------------------------------------
// Paso 2: confirmar (Parte 5 y Parte 9). Solo recibe el jobId: TODO lo demás
// se relee de la base (import_job_rows, ya org-scoped por RLS) y se
// REVALIDA por completo antes de escribir, sin confiar en nada que venga
// del cliente entre el paso 1 y el paso 2.
// ---------------------------------------------------------------------------
export type ImportCommitState = {
  error: string | null;
  committed: boolean;
  jobId: string | null;
  entity: ImportEntityType | null;
  imported: number;
  skipped: number;
  failed: number;
};

const emptyCommit: ImportCommitState = {
  error: null,
  committed: false,
  jobId: null,
  entity: null,
  imported: 0,
  skipped: 0,
  failed: 0,
};

export async function commitImportAction(
  _prev: ImportCommitState,
  formData: FormData
): Promise<ImportCommitState> {
  const org = await requireActiveOrg();
  const supabase = await createServerClient();

  if (!IMPORT_ROLES.includes(org.roleCode as (typeof IMPORT_ROLES)[number])) {
    return { ...emptyCommit, error: "Tu rol no permite confirmar importaciones en esta empresa." };
  }

  // Sprint 10A (Parte 8): Demo no incluye importaciones.
  const featureCheck = await checkCprFeatureEnabled("imports_enabled");
  if (!featureCheck.allowed) return { ...emptyCommit, error: featureCheck.error };

  const jobId = String(formData.get("import_job_id") ?? "");
  if (!jobId) return { ...emptyCommit, error: "Falta el identificador de la importación a confirmar." };

  const { data: job } = await supabase
    .from("import_jobs")
    .select("id, entity, filename, status")
    .eq("id", jobId)
    .eq("organization_id", org.organizationId)
    .maybeSingle();
  if (!job || job.status !== "validated") {
    return {
      ...emptyCommit,
      error: "Esta importación no existe, no pertenece a tu empresa activa o ya fue confirmada.",
    };
  }

  const entity = (Object.keys(ENTITY_TABLE) as ImportEntityType[]).find(
    (e) => ENTITY_TABLE[e] === job.entity
  );
  if (!entity) return { ...emptyCommit, error: "Tipo de entidad no reconocido para esta importación." };

  const { data: existingRows } = await supabase
    .from("import_job_rows")
    .select("id, row_number, status, raw_data")
    .eq("import_job_id", jobId)
    .eq("organization_id", org.organizationId)
    .order("row_number", { ascending: true });

  if (!existingRows || existingRows.length === 0) {
    return { ...emptyCommit, jobId, entity, error: "La importación no tiene filas para confirmar." };
  }
  // Idempotencia: si ya se procesaron (imported/skipped), no se repite.
  const alreadyProcessed = existingRows.every((r) => r.status === "imported" || r.status === "skipped");
  if (alreadyProcessed) {
    return { ...emptyCommit, jobId, entity, error: "Esta importación ya fue confirmada." };
  }

  // Revalidación COMPLETA y fresca (Parte 9): se ignoran normalized_data y
  // status guardados en el paso 1; solo se confía en raw_data + el estado
  // ACTUAL de la base.
  const rawRows = existingRows.map((r) => r.raw_data as Record<string, string>);
  const ref = await getReferenceData(org.organizationId, entity);
  const fresh = validateRows(entity, rawRows, ref);

  const hasHardErrors = fresh.some((r) => r.status === "error");
  if (hasHardErrors) {
    for (let i = 0; i < fresh.length; i++) {
      const row = existingRows[i];
      const r = fresh[i];
      await supabase
        .from("import_job_rows")
        .update({ status: r.status, normalized_data: r.normalized, errors: r.errors, warnings: r.warnings })
        .eq("id", row.id)
        .eq("organization_id", org.organizationId);
    }
    await supabase.from("import_jobs").insert({
      organization_id: org.organizationId,
      entity: job.entity,
      filename: job.filename,
      total_rows: fresh.length,
      inserted_rows: 0,
      skipped_rows: fresh.filter((r) => r.status === "error").length,
      status: "failed",
      errors: fresh.flatMap((r) => r.errors.map((e) => ({ row: r.rowNumber, ...e }))),
    });
    return {
      ...emptyCommit,
      jobId,
      entity,
      error:
        "Los datos cambiaron desde que validaste el archivo y ahora hay errores. Vuelve a la vista previa y corrige antes de confirmar.",
    };
  }

  // T9F.2 · §9: validación de INCREMENTO MASIVO — conteo_actual +
  // filas_a_insertar (las que NO se saltarán por existir) debe caber en el
  // límite del plan del MÓDULO CPR ANTES del primer INSERT. Si excede, la
  // operación completa se rechaza: jamás una inserción parcial que supere el
  // límite. (Hoy Demo no alcanza este punto — imports_enabled=0 —, pero el
  // cierre no depende de esa coincidencia de catálogo.)
  const limitedResource = importEntityResourceCode(entity);
  const toInsertCount = fresh.filter((r) => !r.skipExisting).length;
  if (limitedResource && toInsertCount > 0) {
    const limitCheck = await checkCprResourceLimit(limitedResource, toInsertCount);
    if (!limitCheck.allowed) {
      return { ...emptyCommit, error: limitCheck.error };
    }
  }

  const maps = await getLookupMaps(org.organizationId, entity);
  let imported = 0;
  let skipped = 0;
  let failed = 0;

  // T9F.3 · §11: la escritura de negocio es UN ÚNICO INSERT multi-fila (una
  // sola transacción). El trigger de límites de 0101 ve el acumulado de la
  // propia transacción: si el plan no admite TODAS las filas — incluso por
  // consumo CONCURRENTE posterior al pre-check de arriba — PostgreSQL
  // revierte la operación completa. Jamás quedan filas parciales.
  const pending: Array<{ jobRowId: string; normalized: Record<string, unknown> }> = [];
  for (let i = 0; i < fresh.length; i++) {
    const row = existingRows[i];
    const r = fresh[i];
    if (r.skipExisting) {
      skipped += 1;
      await supabase
        .from("import_job_rows")
        .update({ status: "skipped", normalized_data: r.normalized, warnings: r.warnings })
        .eq("id", row.id)
        .eq("organization_id", org.organizationId);
      continue;
    }
    pending.push({ jobRowId: row.id, normalized: r.normalized });
  }

  const bulk = await insertBusinessRows(
    org.organizationId,
    entity,
    pending.map((p) => p.normalized),
    maps
  );
  if (bulk.error || !bulk.ids) {
    failed = pending.length;
    const message = bulk.limitExceeded
      ? "Tu plan alcanzó el límite de este recurso: la importación completa fue rechazada sin insertar ninguna fila. Mejora el plan del módulo para continuar."
      : "No fue posible crear los registros: la importación completa fue revertida sin insertar ninguna fila. Inténtalo nuevamente.";
    console.error("[imports] commit masivo revertido", {
      op: "commitImportAction",
      entity,
      rows: pending.length,
      code: bulk.limitExceeded ? "RESOURCE_LIMIT_EXCEEDED" : "bulk_insert_failed",
    });
    for (const p of pending) {
      await supabase
        .from("import_job_rows")
        .update({
          status: "error",
          normalized_data: p.normalized,
          errors: [{ field: null, message }],
        })
        .eq("id", p.jobRowId)
        .eq("organization_id", org.organizationId);
    }
  } else {
    imported = bulk.ids.length;
    for (let i = 0; i < pending.length; i++) {
      await supabase
        .from("import_job_rows")
        .update({ status: "imported", normalized_data: pending[i].normalized, created_entity_id: bulk.ids[i] })
        .eq("id", pending[i].jobRowId)
        .eq("organization_id", org.organizationId);
    }
  }

  await supabase.from("import_jobs").insert({
    organization_id: org.organizationId,
    entity: job.entity,
    filename: job.filename,
    total_rows: fresh.length,
    inserted_rows: imported,
    skipped_rows: skipped + failed,
    status: failed > 0 && imported === 0 ? "failed" : "committed",
    errors: failed > 0 ? [{ row: 0, message: `${failed} fila(s) fallaron al escribir en base de datos.` }] : [],
  });

  revalidatePath("/imports");
  revalidatePath("/implementation");
  revalidatePath("/catalog");
  revalidatePath("/catalog/suppliers");
  revalidatePath("/catalog/materials");
  revalidatePath("/catalog/products");
  revalidatePath("/catalog/families");
  revalidatePath("/evidences");
  revalidatePath("/traceability");
  revalidatePath("/traceability/input-batches");
  revalidatePath("/traceability/production-orders");
  revalidatePath("/traceability/output-batches");

  return {
    error: null,
    committed: true,
    jobId,
    entity,
    imported,
    skipped,
    failed,
  };
}

// ---------------------------------------------------------------------------
// Historial (Parte 1, sección 5)
// ---------------------------------------------------------------------------
export type ImportJobSummary = {
  id: string;
  entity: string;
  filename: string | null;
  totalRows: number;
  insertedRows: number;
  skippedRows: number;
  status: "validated" | "committed" | "failed";
  createdAt: string;
};

export async function listImportJobsAction(filters?: {
  entity?: ImportEntityType;
}): Promise<ImportJobSummary[]> {
  const org = await requireActiveOrg();
  const supabase = await createServerClient();
  let query = supabase
    .from("import_jobs")
    .select("id, entity, filename, total_rows, inserted_rows, skipped_rows, status, created_at")
    .eq("organization_id", org.organizationId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (filters?.entity) query = query.eq("entity", ENTITY_TABLE[filters.entity]);
  const { data } = await query;
  return (data ?? []).map((j) => ({
    id: j.id as string,
    entity: j.entity as string,
    filename: j.filename as string | null,
    totalRows: Number(j.total_rows),
    insertedRows: Number(j.inserted_rows),
    skippedRows: Number(j.skipped_rows),
    status: j.status as "validated" | "committed" | "failed",
    createdAt: j.created_at as string,
  }));
}

export type ImportJobDetail = {
  job: ImportJobSummary;
  rows: {
    id: string;
    rowNumber: number;
    status: string;
    rawData: Record<string, unknown>;
    errors: { field: string | null; message: string }[];
    warnings: { field: string | null; message: string }[];
    createdEntityId: string | null;
  }[];
};

export async function getImportJobDetailAction(importJobId: string): Promise<{
  data: ImportJobDetail | null;
  error: string | null;
}> {
  const org = await requireActiveOrg();
  const supabase = await createServerClient();

  const { data: job } = await supabase
    .from("import_jobs")
    .select("id, entity, filename, total_rows, inserted_rows, skipped_rows, status, created_at")
    .eq("id", importJobId)
    .eq("organization_id", org.organizationId)
    .maybeSingle();
  if (!job) return { data: null, error: "La importación no existe o no pertenece a tu empresa activa." };

  const { data: rows } = await supabase
    .from("import_job_rows")
    .select("id, row_number, status, raw_data, errors, warnings, created_entity_id")
    .eq("import_job_id", importJobId)
    .eq("organization_id", org.organizationId)
    .order("row_number", { ascending: true });

  return {
    error: null,
    data: {
      job: {
        id: job.id as string,
        entity: job.entity as string,
        filename: job.filename as string | null,
        totalRows: Number(job.total_rows),
        insertedRows: Number(job.inserted_rows),
        skippedRows: Number(job.skipped_rows),
        status: job.status as "validated" | "committed" | "failed",
        createdAt: job.created_at as string,
      },
      rows: (rows ?? []).map((r) => ({
        id: r.id as string,
        rowNumber: Number(r.row_number),
        status: r.status as string,
        rawData: r.raw_data as Record<string, unknown>,
        errors: (r.errors as { field: string | null; message: string }[]) ?? [],
        warnings: (r.warnings as { field: string | null; message: string }[]) ?? [],
        createdEntityId: (r.created_entity_id as string | null) ?? null,
      })),
    },
  };
}
