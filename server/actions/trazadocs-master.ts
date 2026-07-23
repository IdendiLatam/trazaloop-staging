"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { requireSession } from "@/lib/auth/require-session";
import {
  checkCprCanMutate,
  checkCprResourceLimit,
  checkCprStorageAvailable,
  getCprAccessModeForAction,
} from "@/server/actions/module-plans";
import { accessModeToPlanCode } from "@/lib/modules/access";
import { requireCprForAction } from "@/lib/auth/require-cpr-module";
import { removeQueuedStorageObjects } from "@/lib/db/storage-deletion";
import { beginCprStorageUpload, getOwnCprUploadIntent } from "@/lib/db/storage-intents";
// T9F.5B.1 · verificación FÍSICA y compensación compartidas (server-only).
import {
  verifyCprUploadedObject,
  compensateFailedCprUpload,
} from "@/server/actions/cpr-upload-verification";
import {
  listDocumentMaster,
  findMasterDocumentByNormalizedTitle,
  getFileDocument,
  insertFileDocument,
  getFileDocumentDownloadUrl,
  updateFileDocumentMetadata,
  queueAndDeleteFileDocumentDraft,
  deleteFileDocumentRow,
  changeFileDocumentStatus,
  finalizeFileDocumentInitialVersionServer,
  replaceFileDocumentFileServer,
  listFileDocumentVersions,
  updateLiveDocumentCategory,
  type FileDocumentDetail,
  type FileDocumentVersionRow,
} from "@/lib/db/trazadocs-master";
import {
  validateFileDocumentDraft,
  validateFileDocumentUpload,
  buildFileDocumentInsertPayload,
  fileDocumentExtensionForType,
  normalizeDocumentTitle,
  groupMasterByCategory,
  buildMasterCsvRow,
  MASTER_CSV_HEADERS,
  DUPLICATE_MASTER_TITLE_MESSAGE,
  isCategoryCode,
  canReplaceFileDocumentFile,
  type MasterRow,
  type MasterCategoryGroup,
} from "@/lib/domain/trazadocs-master";
import {
  canApproveDocument,
  canMarkObsolete,
  canReactivateDocument,
  canCreateDraftVersionFromApproved,
  canDeleteDraftDocument,
  canEditDocument,
} from "@/lib/domain/trazadocs";
import { toCsv } from "@/lib/csv";

/**
 * Trazaloop · Sprint 10B · Server actions del Maestro de documentos.
 *
 * Reutiliza los MISMOS permisos de rol/estado que ya rigen TrazaDocs vivo
 * (canApproveDocument, canMarkObsolete, canReactivateDocument,
 * canCreateDraftVersionFromApproved, canDeleteDraftDocument,
 * canEditDocument) — un documento descargable se aprueba/marca obsoleto/
 * reactiva con exactamente las mismas reglas que uno vivo, nunca una
 * segunda especificación paralela. organization_id nunca sale del
 * cliente: siempre viene de requireActiveOrg().
 */

export type MasterActionState = { error: string | null; success?: boolean; documentId?: string };
const okState: MasterActionState = { error: null, success: true };

function revalidateMaster(id?: string) {
  revalidatePath("/trazadocs/master");
  revalidatePath("/trazadocs");
  if (id) revalidatePath(`/trazadocs/files/${id}`);
}

// ---------------------------------------------------------------------------
// Lecturas.
// ---------------------------------------------------------------------------
export type MasterFilters = {
  search?: string;
  categoryCode?: string;
  status?: string;
  sourceType?: string;
};

function applyFilters(rows: MasterRow[], filters?: MasterFilters): MasterRow[] {
  if (!filters) return rows;
  let result = rows;
  if (filters.search) {
    const q = filters.search.trim().toLowerCase();
    result = result.filter((r) => r.title.toLowerCase().includes(q) || (r.code ?? "").toLowerCase().includes(q));
  }
  if (filters.categoryCode) result = result.filter((r) => r.categoryCode === filters.categoryCode);
  if (filters.status) result = result.filter((r) => r.status === filters.status);
  if (filters.sourceType) result = result.filter((r) => r.sourceType === filters.sourceType);
  return result;
}

export async function listDocumentMasterAction(filters?: MasterFilters): Promise<MasterCategoryGroup[]> {
  const org = await requireActiveOrg();
  const rows = await listDocumentMaster(org.organizationId);
  return groupMasterByCategory(applyFilters(rows, filters));
}

export async function getDocumentMasterSummaryAction(): Promise<{
  total: number;
  liveCount: number;
  fileCount: number;
  approvedCount: number;
}> {
  const org = await requireActiveOrg();
  const rows = await listDocumentMaster(org.organizationId);
  return {
    total: rows.length,
    liveCount: rows.filter((r) => r.sourceType === "live_document").length,
    fileCount: rows.filter((r) => r.sourceType === "file_document").length,
    approvedCount: rows.filter((r) => r.status === "approved").length,
  };
}

/** CSV completo (Parte 15) — filtros solo si se pasan explícitamente.
 *  Mismo patrón de retorno que exportEvidenceMatrixCsvAction (Sprint 6). */
export async function exportDocumentMasterCsvAction(
  filters?: MasterFilters
): Promise<{ filename: string; csv: string; error: string | null }> {
  // T9F.1: una exportación CPR también exige acceso comercial vigente.
  const gateExport = await requireCprForAction();
  if (gateExport.error !== null) return { filename: "", csv: "", error: gateExport.error };
  const org = gateExport.org;
  const rows = await listDocumentMaster(org.organizationId);
  const filtered = applyFilters(rows, filters);
  const csvRows = [Array.from(MASTER_CSV_HEADERS), ...filtered.map(buildMasterCsvRow)];
  return { filename: "maestro-documentos-trazaloop.csv", csv: toCsv(csvRows), error: null };
}

export async function getFileDocumentAction(id: string): Promise<{
  data: FileDocumentDetail | null;
  canEdit: boolean;
  canApprove: boolean;
  canMarkObsolete: boolean;
  canReactivate: boolean;
  canCreateDraftVersion: boolean;
  canDeleteDraft: boolean;
}> {
  const org = await requireActiveOrg();
  const { user } = await requireSession();
  const data = await getFileDocument(org.organizationId, id);
  const status = data?.status ?? "draft";
  return {
    data,
    canEdit: canEditDocument(org.roleCode, status),
    canApprove: canApproveDocument(org.roleCode) && (status === "draft" || status === "in_review"),
    canMarkObsolete: canMarkObsolete(org.roleCode) && status !== "obsolete",
    canReactivate: canReactivateDocument(org.roleCode) && status === "obsolete",
    canCreateDraftVersion: canCreateDraftVersionFromApproved(org.roleCode) && status === "approved",
    canDeleteDraft: canDeleteDraftDocument(org.roleCode, status, data?.createdBy ?? null, user.id),
  };
}

export async function listFileDocumentVersionsAction(id: string): Promise<FileDocumentVersionRow[]> {
  const org = await requireActiveOrg();
  return listFileDocumentVersions(org.organizationId, id);
}

/** URL firmada de descarga (Parte 14) — de solo lectura, cualquier
 *  miembro de la empresa con acceso a TrazaDocs. T9F.1: la descarga de un
 *  archivo del módulo también exige acceso comercial CPR vigente. */
export async function downloadFileDocumentAction(id: string): Promise<{ url: string | null; error: string | null }> {
  const gateDownload = await requireCprForAction();
  if (gateDownload.error !== null) return { url: null, error: gateDownload.error };
  const org = gateDownload.org;
  const doc = await getFileDocument(org.organizationId, id);
  if (!doc) return { url: null, error: "El documento no existe o no pertenece a tu empresa." };
  const url = await getFileDocumentDownloadUrl(doc.storagePath);
  if (!url) return { url: null, error: "No fue posible generar el enlace de descarga." };
  return { url, error: null };
}

// ---------------------------------------------------------------------------
// Crear documento descargable (Parte 13).
// ---------------------------------------------------------------------------
/**
 * T9F.5B.1 · CARGA DIRECTA (bloqueador 2) · TrazaDocs descargable.
 *
 * El archivo NO viaja en FormData: begin recibe solo metadata, el navegador
 * hace el PUT directo a la ruta EXACTA del intent con su sesión, y finalize
 * recibe únicamente el intentId. Sin esto, el límite por defecto de Server
 * Actions (1 MB) hacía imposible A14 (TrazaDocs Full de 22 MB).
 */
export type BeginFileDocumentUploadInput = {
  title: string;
  code: string;
  categoryCode: string;
  description: string;
  file: { name: string; sizeBytes: number; mimeType: string };
  idempotencyKey?: string | null;
};

export type BeginFileDocumentUploadResult =
  | {
      error: null;
      documentId: string;
      upload: { intentId: string; bucketId: string; objectPath: string };
    }
  | { error: string; documentId: string | null; upload: null };

export async function beginFileDocumentUploadAction(
  input: BeginFileDocumentUploadInput
): Promise<BeginFileDocumentUploadResult> {
  const org = await requireActiveOrg();
  const { user } = await requireSession();

  const mutateCheck = await checkCprCanMutate();
  if (!mutateCheck.allowed) {
    return { error: mutateCheck.error ?? "El módulo no permite crear documentos.", documentId: null, upload: null };
  }

  const validation = validateFileDocumentDraft({
    title: input.title,
    code: input.code,
    categoryCode: input.categoryCode,
    description: input.description,
  });
  if (validation.error) return { error: validation.error, documentId: null, upload: null };

  if (!input.file || input.file.sizeBytes <= 0) {
    return { error: "Selecciona un archivo.", documentId: null, upload: null };
  }

  const limitCheck = await checkCprResourceLimit("documents_trazadocs");
  if (!limitCheck.allowed) {
    return { error: limitCheck.error ?? "Tu plan alcanzó el límite de documentos.", documentId: null, upload: null };
  }

  // El tope POR ARCHIVO se resuelve desde el plan del MÓDULO CPR (T9F.5B ·
  // A14: Demo 10 MB, Full/Extra 25 MB). Si el modo no se resuelve, se bloquea.
  const cprMode = await getCprAccessModeForAction();
  if (cprMode.accessMode === null) {
    return {
      error: cprMode.error ?? "No fue posible verificar el plan del módulo. Inténtalo nuevamente.",
      documentId: null,
      upload: null,
    };
  }
  const fileValidation = validateFileDocumentUpload(
    { size: input.file.sizeBytes, type: input.file.mimeType },
    accessModeToPlanCode(cprMode.accessMode)
  );
  if (fileValidation.error) return { error: fileValidation.error, documentId: null, upload: null };

  const storageCheck = await checkCprStorageAvailable(input.file.sizeBytes);
  if (!storageCheck.allowed) {
    return { error: storageCheck.error ?? "No hay capacidad de almacenamiento disponible.", documentId: null, upload: null };
  }

  const existing = await findMasterDocumentByNormalizedTitle(
    org.organizationId,
    normalizeDocumentTitle(input.title)
  );
  if (existing) return { error: DUPLICATE_MASTER_TITLE_MESSAGE, documentId: existing.documentId, upload: null };

  const payload = buildFileDocumentInsertPayload(
    { title: input.title, code: input.code, categoryCode: input.categoryCode, description: input.description },
    user.id
  );
  const extension = fileDocumentExtensionForType(input.file.mimeType);
  const safeFileName = input.file.name.replace(/[^a-zA-Z0-9._-]/g, "_") || `documento.${extension}`;

  const { id: documentId, error: insertError } = await insertFileDocument(
    org.organizationId,
    payload,
    { storagePath: "", fileName: safeFileName, mimeType: input.file.mimeType, sizeBytes: input.file.sizeBytes },
    user.id
  );
  if (insertError || !documentId) {
    return { error: insertError ?? "No fue posible crear el documento.", documentId: null, upload: null };
  }

  const begin = await beginCprStorageUpload({
    resourceType: "trazadoc_initial",
    resourceId: documentId,
    fileName: safeFileName,
    fileSizeBytes: input.file.sizeBytes,
    fileMimeType: input.file.mimeType,
    idempotencyKey: input.idempotencyKey ?? null,
  });
  if (!begin.intent) {
    const { error: cleanupError } = await deleteFileDocumentRow(org.organizationId, documentId);
    if (cleanupError) {
      return {
        error: "El documento no quedó completamente creado. Elimina el borrador antes de intentar de nuevo.",
        documentId,
        upload: null,
      };
    }
    return { error: begin.error ?? "No fue posible reservar la subida. No se creó el documento.", documentId: null, upload: null };
  }

  return {
    error: null,
    documentId,
    upload: {
      intentId: begin.intent.intentId,
      bucketId: begin.intent.bucketId,
      objectPath: begin.intent.objectPath,
    },
  };
}

/** FINALIZE · solo intentId; el servidor verifica el objeto físico. */
export async function finalizeFileDocumentUploadAction(
  intentId: string
): Promise<MasterActionState> {
  const org = await requireActiveOrg();
  const { user } = await requireSession();

  const intent = await getOwnCprUploadIntent(intentId, user.id, org.organizationId);
  if (!intent) return { error: "La reserva de subida no existe o no pertenece a tu sesión." };
  if (intent.resourceType !== "trazadoc_initial") {
    return { error: "La reserva de subida no corresponde a la creación de un documento." };
  }

  const verification = await verifyCprUploadedObject({
    bucketId: intent.bucketId,
    objectPath: intent.objectPath,
    expectedSizeBytes: intent.expectedSizeBytes,
    expectedMimeType: intent.expectedMimeType,
  });
  if (verification.error !== null) {
    const resolution = await compensateFailedCprUpload(intent);
    if (resolution.resolved) {
      await deleteFileDocumentRow(org.organizationId, intent.resourceId);
    }
    revalidateMaster();
    return { error: verification.error };
  }

  const { error: finalizeError } = await finalizeFileDocumentInitialVersionServer({
    actorId: user.id,
    intentId: intent.intentId,
    realSizeBytes: verification.sizeBytes,
    realMimeType: verification.mimeType,
    note: "Borrador inicial",
  });
  if (finalizeError) {
    const resolution = await compensateFailedCprUpload(intent);
    if (resolution.resolved) {
      const { error: cleanupError } = await deleteFileDocumentRow(org.organizationId, intent.resourceId);
      if (cleanupError) {
        return {
          error:
            "No fue posible finalizar la creación. El archivo subido fue retirado; elimina el borrador vacío antes de intentar de nuevo.",
        };
      }
      revalidateMaster();
      return { error: "No fue posible finalizar la creación del documento. Inténtalo nuevamente." };
    }
    revalidateMaster();
    return {
      error:
        finalizeError +
        " El archivo subido quedó registrado como pendiente de retiro y seguirá contando en tu almacenamiento hasta completarse la limpieza.",
      documentId: intent.resourceId,
    };
  }

  revalidateMaster();
  return { error: null, success: true, documentId: intent.resourceId };
}

/** Cancelación explícita (abandono o fallo del PUT). */
export async function cancelFileDocumentUploadAction(intentId: string): Promise<MasterActionState> {
  const org = await requireActiveOrg();
  const { user } = await requireSession();
  const intent = await getOwnCprUploadIntent(intentId, user.id, org.organizationId);
  if (!intent) return { error: null };
  const resolution = await compensateFailedCprUpload(intent);
  if (resolution.resolved && intent.resourceType === "trazadoc_initial") {
    await deleteFileDocumentRow(org.organizationId, intent.resourceId);
  }
  revalidateMaster();
  return { error: null };
}

// ---------------------------------------------------------------------------
// Editar / reemplazar / eliminar.
// ---------------------------------------------------------------------------
export async function updateFileDocumentMetadataAction(
  _prev: MasterActionState,
  formData: FormData
): Promise<MasterActionState> {
  const org = await requireActiveOrg();
  const mutateCheck = await checkCprCanMutate();
  if (!mutateCheck.allowed) return { error: mutateCheck.error };

  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "El título del documento no puede estar vacío." };
  const categoryCode = String(formData.get("category_code") ?? "other");
  if (!isCategoryCode(categoryCode)) return { error: "Selecciona una categoría válida." };

  const { error } = await updateFileDocumentMetadata(org.organizationId, id, {
    title,
    code: String(formData.get("code") ?? "").trim() || null,
    description: String(formData.get("description") ?? "").trim() || null,
    categoryCode,
    ownerId: String(formData.get("owner_id") ?? "").trim() || null,
  });
  if (error) return { error };

  revalidateMaster(id);
  return { ...okState, documentId: id };
}

/**
 * T9F.5B.1 · CARGA DIRECTA · Reemplazo de archivo TrazaDocs.
 * begin (metadata) → PUT directo del navegador → finalize (solo intentId).
 */
export type BeginFileDocumentReplaceInput = {
  documentId: string;
  file: { name: string; sizeBytes: number; mimeType: string };
  idempotencyKey?: string | null;
};

export async function beginFileDocumentReplaceAction(
  input: BeginFileDocumentReplaceInput
): Promise<BeginFileDocumentUploadResult> {
  const org = await requireActiveOrg();
  await requireSession();
  const mutateCheck = await checkCprCanMutate();
  if (!mutateCheck.allowed) {
    return { error: mutateCheck.error ?? "El módulo no permite reemplazar archivos.", documentId: null, upload: null };
  }

  const doc = await getFileDocument(org.organizationId, input.documentId);
  if (!doc) return { error: "El documento no existe o no pertenece a tu empresa.", documentId: null, upload: null };
  if (!canReplaceFileDocumentFile(org.roleCode as "admin" | "quality" | "consultant" | null, doc.status)) {
    return {
      error:
        doc.status === "obsolete"
          ? "Un documento obsoleto no se puede reemplazar directamente; reactívalo primero."
          : "Tu rol no permite reemplazar el archivo de este documento en su estado actual.",
      documentId: null,
      upload: null,
    };
  }
  if (!input.file || input.file.sizeBytes <= 0) {
    return { error: "Selecciona un archivo.", documentId: null, upload: null };
  }

  const cprMode = await getCprAccessModeForAction();
  if (cprMode.accessMode === null) {
    return {
      error: cprMode.error ?? "No fue posible verificar el plan del módulo. Inténtalo nuevamente.",
      documentId: null,
      upload: null,
    };
  }
  const fileValidation = validateFileDocumentUpload(
    { size: input.file.sizeBytes, type: input.file.mimeType },
    accessModeToPlanCode(cprMode.accessMode)
  );
  if (fileValidation.error) return { error: fileValidation.error, documentId: null, upload: null };

  const storageCheck = await checkCprStorageAvailable(input.file.sizeBytes);
  if (!storageCheck.allowed) {
    return { error: storageCheck.error ?? "No hay capacidad de almacenamiento disponible.", documentId: null, upload: null };
  }

  // El reemplazo RESERVA el objeto NUEVO (ruta v(n+1), decidida por la base)
  // y NO libera el anterior: la versión histórica sigue contando.
  const safeFileName = input.file.name.replace(/[^a-zA-Z0-9._-]/g, "_") || doc.fileName;
  const begin = await beginCprStorageUpload({
    resourceType: "trazadoc_replace",
    resourceId: input.documentId,
    fileName: safeFileName,
    fileSizeBytes: input.file.sizeBytes,
    fileMimeType: input.file.mimeType,
    idempotencyKey: input.idempotencyKey ?? null,
  });
  if (!begin.intent) {
    return { error: begin.error ?? "No fue posible reservar la subida del nuevo archivo.", documentId: null, upload: null };
  }
  return {
    error: null,
    documentId: input.documentId,
    upload: {
      intentId: begin.intent.intentId,
      bucketId: begin.intent.bucketId,
      objectPath: begin.intent.objectPath,
    },
  };
}

export async function finalizeFileDocumentReplaceAction(
  intentId: string,
  note: string | null
): Promise<MasterActionState> {
  const org = await requireActiveOrg();
  const { user } = await requireSession();

  const intent = await getOwnCprUploadIntent(intentId, user.id, org.organizationId);
  if (!intent) return { error: "La reserva de subida no existe o no pertenece a tu sesión." };
  if (intent.resourceType !== "trazadoc_replace") {
    return { error: "La reserva de subida no corresponde a un reemplazo." };
  }

  const verification = await verifyCprUploadedObject({
    bucketId: intent.bucketId,
    objectPath: intent.objectPath,
    expectedSizeBytes: intent.expectedSizeBytes,
    expectedMimeType: intent.expectedMimeType,
  });
  if (verification.error !== null) {
    await compensateFailedCprUpload(intent);
    return { error: verification.error };
  }

  const { error } = await replaceFileDocumentFileServer({
    actorId: user.id,
    intentId: intent.intentId,
    realSizeBytes: verification.sizeBytes,
    realMimeType: verification.mimeType,
    note: note?.trim() || null,
  });
  if (error) {
    await compensateFailedCprUpload(intent);
    return { error };
  }

  revalidateMaster(intent.resourceId);
  return { ...okState, documentId: intent.resourceId };
}

export async function deleteDraftFileDocumentAction(
  _prev: MasterActionState,
  formData: FormData
): Promise<MasterActionState> {
  const org = await requireActiveOrg();
  const { user } = await requireSession();
  const mutateCheck = await checkCprCanMutate();
  if (!mutateCheck.allowed) return { error: mutateCheck.error };

  const id = String(formData.get("id") ?? "");
  const doc = await getFileDocument(org.organizationId, id);
  if (!doc) return { error: "El documento no existe o no pertenece a tu empresa." };

  if (!canDeleteDraftDocument(org.roleCode, doc.status, doc.createdBy, user.id)) {
    return {
      error:
        doc.status !== "draft"
          ? "Solo se pueden eliminar documentos en borrador."
          : "Solo puedes eliminar un borrador que tú mismo creaste, o ser administrador/supervisor.",
    };
  }

  // T9F.3 · §18: la RPC atómica encola el archivo actual y TODAS las
  // versiones (cada objeto con SU propio tamaño) como pending_delete y
  // elimina las filas en UNA transacción — la marca nace ANTES de perder la
  // referencia. Después, el retiro físico se ejecuta server-only y se
  // CONFIRMA en la cola: deleted libera cuota; delete_failed sigue contando.
  const { objects, error } = await queueAndDeleteFileDocumentDraft(id);
  if (error) return { error };

  const { pendingCount: pending } = await removeQueuedStorageObjects(
    objects.map((o) => ({ bucketId: o.bucketId, objectPath: o.objectPath }))
  );

  revalidateMaster();
  if (pending > 0) {
    return {
      error:
        "El documento se eliminó, pero algunos archivos quedaron pendientes de retiro físico y seguirán contando en tu almacenamiento hasta completarse la limpieza.",
    };
  }
  return okState;
}

// ---------------------------------------------------------------------------
// Transiciones de estado — todas vía la RPC atómica.
// ---------------------------------------------------------------------------
async function transitionFile(id: string, toStatus: "draft" | "in_review" | "approved" | "obsolete", note: string | null): Promise<MasterActionState> {
  await requireActiveOrg();
  const mutateCheck = await checkCprCanMutate();
  if (!mutateCheck.allowed) return { error: mutateCheck.error };

  const { newVersion, error } = await changeFileDocumentStatus(id, toStatus, note);
  if (error || newVersion == null) return { error: error ?? "No fue posible cambiar el estado del documento." };
  revalidateMaster(id);
  return { error: null, success: true, documentId: id };
}

export async function submitFileDocumentForReviewAction(
  _prev: MasterActionState,
  formData: FormData
): Promise<MasterActionState> {
  const cprCheck = await checkCprCanMutate();
  if (!cprCheck.allowed) return { error: cprCheck.error };
  const id = String(formData.get("id") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;
  return transitionFile(id, "in_review", note);
}

export async function approveFileDocumentAction(
  _prev: MasterActionState,
  formData: FormData
): Promise<MasterActionState> {
  const org = await requireActiveOrg();
  const cprCheck = await checkCprCanMutate();
  if (!cprCheck.allowed) return { error: cprCheck.error };
  if (!canApproveDocument(org.roleCode)) return { error: "Tu rol no permite aprobar documentos." };
  const id = String(formData.get("id") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;
  return transitionFile(id, "approved", note);
}

export async function markFileDocumentObsoleteAction(
  _prev: MasterActionState,
  formData: FormData
): Promise<MasterActionState> {
  const org = await requireActiveOrg();
  const cprCheck = await checkCprCanMutate();
  if (!cprCheck.allowed) return { error: cprCheck.error };
  if (!canMarkObsolete(org.roleCode)) return { error: "Tu rol no permite marcar este documento como obsoleto." };
  const id = String(formData.get("id") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;
  return transitionFile(id, "obsolete", note);
}

export async function reactivateFileDocumentAction(
  _prev: MasterActionState,
  formData: FormData
): Promise<MasterActionState> {
  const org = await requireActiveOrg();
  const cprCheck = await checkCprCanMutate();
  if (!cprCheck.allowed) return { error: cprCheck.error };
  if (!canReactivateDocument(org.roleCode)) return { error: "Solo un administrador puede reactivar un documento obsoleto." };
  const id = String(formData.get("id") ?? "");
  const note = String(formData.get("note") ?? "").trim() || "Reactivado desde obsoleto.";
  return transitionFile(id, "draft", note);
}

export async function createFileDocumentDraftVersionAction(
  _prev: MasterActionState,
  formData: FormData
): Promise<MasterActionState> {
  const org = await requireActiveOrg();
  const cprCheck = await checkCprCanMutate();
  if (!cprCheck.allowed) return { error: cprCheck.error };
  if (!canCreateDraftVersionFromApproved(org.roleCode)) {
    return { error: "Solo un administrador o supervisor puede crear una nueva versión en borrador de un documento aprobado." };
  }
  const id = String(formData.get("id") ?? "");
  const note =
    String(formData.get("note") ?? "").trim() || "Nueva versión en borrador creada a partir de documento aprobado.";
  return transitionFile(id, "draft", note);
}

// ---------------------------------------------------------------------------
// Categoría en documentos vivos (Parte 17).
// ---------------------------------------------------------------------------
export async function updateLiveDocumentCategoryAction(
  _prev: MasterActionState,
  formData: FormData
): Promise<MasterActionState> {
  const org = await requireActiveOrg();
  const mutateCheck = await checkCprCanMutate();
  if (!mutateCheck.allowed) return { error: mutateCheck.error };

  const documentId = String(formData.get("document_id") ?? "");
  const categoryCode = String(formData.get("category_code") ?? "other");
  if (!isCategoryCode(categoryCode)) return { error: "Selecciona una categoría válida." };

  const { error } = await updateLiveDocumentCategory(org.organizationId, documentId, categoryCode);
  if (error) return { error };

  revalidateMaster();
  revalidatePath(`/trazadocs/${documentId}`);
  return { ...okState, documentId };
}
