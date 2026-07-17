/**
 * Trazaloop · Sprint 10B · Lógica PURA del Maestro de documentos.
 *
 * Reutiliza CATEGORY_CODES/CATEGORY_LABEL y las reglas de rol/estado ya
 * definidas en lib/domain/trazadocs.ts (canApproveDocument,
 * canEditDocument, canReactivateDocument, canDeleteDraftDocument,
 * canCreateDraftVersionFromApproved) — los documentos descargables
 * comparten EXACTAMENTE las mismas reglas de rol/estado que los
 * documentos vivos, nunca una segunda especificación paralela.
 *
 * Sin imports de Supabase, de servidor ni de Next.
 */
import {
  CATEGORY_CODES,
  CATEGORY_LABEL,
  isCategoryCode,
  normalizeDocumentTitle,
  type CategoryCode,
  type DocumentStatus,
} from "./trazadocs";

export { CATEGORY_CODES, CATEGORY_LABEL, isCategoryCode, type CategoryCode };

// ---------------------------------------------------------------------------
// Tipo de documento en el maestro (Parte 8.4).
// ---------------------------------------------------------------------------
export const MASTER_SOURCE_TYPES = ["live_document", "file_document"] as const;
export type MasterSourceType = (typeof MASTER_SOURCE_TYPES)[number];

export const MASTER_SOURCE_LABEL: Record<MasterSourceType, string> = {
  live_document: "Documento vivo",
  file_document: "Archivo descargable",
};

export const MASTER_ACTION_TYPES = ["open", "download"] as const;
export type MasterActionType = (typeof MASTER_ACTION_TYPES)[number];

/** Un documento vivo siempre abre; un descargable siempre descarga —
 *  nunca depende de nada más que el tipo de origen. */
export function resolveMasterActionType(sourceType: MasterSourceType): MasterActionType {
  return sourceType === "live_document" ? "open" : "download";
}

// ---------------------------------------------------------------------------
// Documentos descargables: validación de archivo (Parte 7/13).
// ---------------------------------------------------------------------------
export const ALLOWED_FILE_DOCUMENT_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export const MAX_FILE_DOCUMENT_SIZE_DEMO_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_FILE_DOCUMENT_SIZE_FULL_BYTES = 25 * 1024 * 1024; // 25 MB

export const FILE_TOO_LARGE_MESSAGE_DEMO = "El archivo no puede pesar más de 10 MB en el plan Demo.";
export const FILE_TOO_LARGE_MESSAGE_FULL = "El archivo no puede pesar más de 25 MB.";
export const FILE_INVALID_TYPE_MESSAGE =
  "Formato no admitido. Usa PDF, Word, Excel, CSV, PNG, JPG/JPEG o WebP (sin ejecutables, ZIP ni SVG por ahora).";

export type TrazadocsMasterValidation = { error: string | null };

/** Tamaño máximo POR ARCHIVO según el plan — independiente de la cuota
 *  total de almacenamiento (que se revisa aparte, checkStorageAvailable). */
export function maxFileDocumentSizeForPlan(planCode: "demo" | "full" | "extra"): number {
  return planCode === "demo" ? MAX_FILE_DOCUMENT_SIZE_DEMO_BYTES : MAX_FILE_DOCUMENT_SIZE_FULL_BYTES;
}

export function validateFileDocumentUpload(
  file: { size: number; type: string },
  planCode: "demo" | "full" | "extra"
): TrazadocsMasterValidation {
  if (file.size <= 0) {
    return { error: "Selecciona un archivo." };
  }
  const maxSize = maxFileDocumentSizeForPlan(planCode);
  if (file.size > maxSize) {
    return { error: planCode === "demo" ? FILE_TOO_LARGE_MESSAGE_DEMO : FILE_TOO_LARGE_MESSAGE_FULL };
  }
  if (!(ALLOWED_FILE_DOCUMENT_TYPES as readonly string[]).includes(file.type)) {
    return { error: FILE_INVALID_TYPE_MESSAGE };
  }
  return { error: null };
}

/** Extensión segura a partir del tipo MIME validado (nunca del nombre
 *  original del archivo, que el cliente controla) — mismo criterio que
 *  logoExtensionForType (lib/domain/settings.ts). */
export function fileDocumentExtensionForType(mimeType: string): string {
  switch (mimeType) {
    case "application/pdf":
      return "pdf";
    case "application/msword":
      return "doc";
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return "docx";
    case "application/vnd.ms-excel":
      return "xls";
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return "xlsx";
    case "text/csv":
      return "csv";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/jpeg":
      return "jpg";
    default:
      return "bin";
  }
}

export type FileDocumentDraftInput = {
  title: string;
  code?: string | null;
  categoryCode: string;
  description?: string | null;
};

export function validateFileDocumentDraft(input: FileDocumentDraftInput): TrazadocsMasterValidation {
  if (!input.title || input.title.trim().length === 0) {
    return { error: "El título del documento no puede estar vacío." };
  }
  if (!isCategoryCode(input.categoryCode)) {
    return { error: "Selecciona una categoría válida." };
  }
  return { error: null };
}

export type TrustedFileDocumentInsert = {
  category_code: CategoryCode;
  code: string | null;
  title: string;
  description: string | null;
  owner_id: string | null;
};

/** Mismo patrón que buildCustomDocumentInsertPayload (trazadocs.ts):
 *  NUNCA declara organization_id — el server action lo toma siempre de
 *  la empresa activa. */
export function buildFileDocumentInsertPayload(input: FileDocumentDraftInput, ownerId: string | null): TrustedFileDocumentInsert {
  return {
    category_code: isCategoryCode(input.categoryCode) ? input.categoryCode : "other",
    code: input.code?.trim() || null,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    owner_id: ownerId,
  };
}

// ---------------------------------------------------------------------------
// Anti-duplicados cruzado (Parte 18): título normalizado único entre
// documentos VIVOS y DESCARGABLES a la vez, dentro de la misma empresa.
// ---------------------------------------------------------------------------
export const DUPLICATE_MASTER_TITLE_MESSAGE =
  "Ya existe un documento con este nombre en el maestro documental. Abre el documento existente o usa un nombre diferente.";

export { normalizeDocumentTitle };

/**
 * Corrección (Bloqueante 3): mismo criterio EXACTO que la RPC SQL
 * replace_trazadoc_file_document (0057) — se usa aquí como chequeo
 * PREVIO en servidor, antes de gastar una subida a Storage. La RPC sigue
 * siendo la autoridad real (nunca se confía solo en este chequeo del
 * lado de la aplicación), pero validar primero evita subir un archivo
 * que de todas formas la RPC iba a rechazar.
 *   - draft/in_review: admin/quality/consultant.
 *   - approved: solo admin/quality (la nueva versión queda en borrador).
 *   - obsolete: nunca — hay que reactivar primero.
 */
export function canReplaceFileDocumentFile(
  role: "admin" | "quality" | "consultant" | null | undefined,
  status: DocumentStatus
): boolean {
  if (status === "obsolete") return false;
  if (status === "approved") return role === "admin" || role === "quality";
  return role === "admin" || role === "quality" || role === "consultant";
}

// ---------------------------------------------------------------------------
// Agrupar y exportar (Parte 12/15).
// ---------------------------------------------------------------------------
export type MasterRow = {
  sourceType: MasterSourceType;
  documentId: string;
  categoryCode: string;
  categoryLabel: string;
  code: string | null;
  title: string;
  status: DocumentStatus;
  versionLabel: string;
  responsibleName: string | null;
  updatedAt: string;
  approvedAt: string | null;
  fileName: string | null;
  sizeBytes: number | null;
  actionType: MasterActionType;
  actionHref: string | null;
};

export type MasterCategoryGroup = {
  categoryCode: string;
  categoryLabel: string;
  rows: MasterRow[];
};

/** Agrupa por categoría, en el mismo orden que CATEGORY_CODES (Parte 12:
 *  "Tabla agrupada por categoría") — nunca alfabético ni por conteo. */
export function groupMasterByCategory(rows: MasterRow[]): MasterCategoryGroup[] {
  const groups: MasterCategoryGroup[] = CATEGORY_CODES.map((code) => ({
    categoryCode: code,
    categoryLabel: CATEGORY_LABEL[code],
    rows: rows.filter((r) => r.categoryCode === code),
  }));
  return groups.filter((g) => g.rows.length > 0);
}

export const MASTER_CSV_HEADERS = [
  "Categoría",
  "Código",
  "Documento",
  "Tipo",
  "Estado",
  "Versión",
  "Responsable",
  "Fecha de actualización",
  "Fecha de aprobación",
  "Archivo",
  "Tamaño",
] as const;

function formatBytesForCsv(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Una fila de CSV por documento — el orden de columnas debe coincidir
 *  exactamente con MASTER_CSV_HEADERS. */
export function buildMasterCsvRow(row: MasterRow): string[] {
  return [
    row.categoryLabel,
    row.code ?? "",
    row.title,
    MASTER_SOURCE_LABEL[row.sourceType],
    row.status,
    row.versionLabel,
    row.responsibleName ?? "",
    row.updatedAt,
    row.approvedAt ?? "",
    row.fileName ?? "",
    formatBytesForCsv(row.sizeBytes),
  ];
}
