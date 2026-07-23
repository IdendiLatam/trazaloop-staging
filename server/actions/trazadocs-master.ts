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
import {
  resolveCprUploadIntentObject,
  removeQueuedStorageObjects,
} from "@/lib/db/storage-deletion";
import { beginCprStorageUpload, cancelCprStorageUpload } from "@/lib/db/storage-intents";
import {
  listDocumentMaster,
  findMasterDocumentByNormalizedTitle,
  getFileDocument,
  insertFileDocument,
  uploadFileDocumentFile,
  getFileDocumentDownloadUrl,
  updateFileDocumentMetadata,
  queueAndDeleteFileDocumentDraft,
  deleteFileDocumentRow,
  changeFileDocumentStatus,
  finalizeFileDocumentInitialVersion,
  replaceFileDocumentFile,
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
export async function uploadFileDocumentAction(
  _prev: MasterActionState,
  formData: FormData
): Promise<MasterActionState> {
  const org = await requireActiveOrg();
  const { user } = await requireSession();

  const mutateCheck = await checkCprCanMutate();
  if (!mutateCheck.allowed) return { error: mutateCheck.error };

  const input = {
    title: String(formData.get("title") ?? ""),
    code: String(formData.get("code") ?? ""),
    categoryCode: String(formData.get("category_code") ?? "other"),
    description: String(formData.get("description") ?? ""),
  };
  const validation = validateFileDocumentDraft(input);
  if (validation.error) return { error: validation.error };

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "Selecciona un archivo." };

  // Parte 11: documents_trazadocs cuenta documentos vivos Y descargables
  // juntos — un solo límite, checkResourceLimit ya lee el conteo
  // combinado de la vista de uso (ver server/actions/plans.ts).
  const limitCheck = await checkCprResourceLimit("documents_trazadocs");
  if (!limitCheck.allowed) return { error: limitCheck.error };

  // T9F.2 · Bloqueador 2: el tamaño máximo POR ARCHIVO se resuelve desde el
  // plan del MÓDULO CPR (organization_modules.access_mode → demo 10 MB;
  // full/extra 25 MB — Extra solo difiere en la CUOTA total). El plan legacy
  // (organization_subscriptions) ya no participa. Si el modo no puede
  // resolverse, se bloquea: nunca se cae a un plan por defecto.
  const cprMode = await getCprAccessModeForAction();
  if (cprMode.accessMode === null) {
    return { error: cprMode.error ?? "No fue posible verificar el plan del módulo. Inténtalo nuevamente." };
  }
  const fileValidation = validateFileDocumentUpload(
    { size: file.size, type: file.type },
    accessModeToPlanCode(cprMode.accessMode)
  );
  if (fileValidation.error) return { error: fileValidation.error };

  const storageCheck = await checkCprStorageAvailable(file.size);
  if (!storageCheck.allowed) return { error: storageCheck.error };

  // Parte 18: anti-duplicado cruzado (vivo + descargable) por título normalizado.
  const existing = await findMasterDocumentByNormalizedTitle(org.organizationId, normalizeDocumentTitle(input.title));
  if (existing) return { error: DUPLICATE_MASTER_TITLE_MESSAGE, documentId: existing.documentId };

  const payload = buildFileDocumentInsertPayload(input, user.id);
  const extension = fileDocumentExtensionForType(file.type);
  const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_") || `documento.${extension}`;

  // 1. Crear la fila (con datos de archivo provisionales) para obtener un id.
  const { id: documentId, error: insertError } = await insertFileDocument(
    org.organizationId,
    payload,
    { storagePath: "", fileName: safeFileName, mimeType: file.type, sizeBytes: file.size },
    user.id
  );
  if (insertError || !documentId) return { error: insertError ?? "No fue posible crear el documento." };

  // 2. T9F.4 · §11-§13: RESERVA DURABLE antes de subir un solo byte — el
  //    intent fija bucket, ruta (v1) y bytes bajo el lock de cuota; el
  //    pre-chequeo de arriba solo mejora el mensaje.
  const begin = await beginCprStorageUpload({
    resourceType: "trazadoc_initial",
    resourceId: documentId,
    fileName: safeFileName,
    fileSizeBytes: file.size,
    fileMimeType: file.type,
  });
  if (!begin.intent) {
    const { error: cleanupError } = await deleteFileDocumentRow(org.organizationId, documentId);
    if (cleanupError) {
      return { error: "El documento no quedó completamente creado. Elimina el borrador antes de intentar de nuevo." };
    }
    return { error: begin.error ?? "No fue posible reservar la subida. No se creó el documento." };
  }

  const bytes = await file.arrayBuffer();
  const { storagePath, error: uploadError } = await uploadFileDocumentFile(
    begin.intent.objectPath,
    bytes,
    file.type
  );
  if (uploadError || !storagePath) {
    // Sin objeto subido: cancelar la reserva, resolverla server-only
    // (confirma la inexistencia) y limpiar el borrador vacío.
    await cancelCprStorageUpload(begin.intent.intentId);
    await resolveCprUploadIntentObject({
      intentId: begin.intent.intentId,
      bucketId: begin.intent.bucketId,
      objectPath: begin.intent.objectPath,
    });
    const { error: cleanupError } = await deleteFileDocumentRow(org.organizationId, documentId);
    if (cleanupError) {
      return { error: "El documento no quedó completamente creado. Elimina el borrador antes de intentar de nuevo." };
    }
    return { error: "No fue posible subir el archivo. No se creó el documento." };
  }

  // 3. T9F.4 · §15: la RPC v2 fija ruta/nombre/MIME DEL INTENT y deja
  //    EXACTAMENTE una versión v1, consumiendo la reserva en la misma
  //    transacción.
  const { error: finalizeError } = await finalizeFileDocumentInitialVersion(
    begin.intent.intentId,
    file.size,
    "Borrador inicial"
  );
  if (finalizeError) {
    // El objeto YA subido conserva su referencia durable (el intent) y
    // sigue contabilizado; la resolución server-only intenta el retiro
    // CONFIRMADO — jamás se libera sin confirmación.
    await cancelCprStorageUpload(begin.intent.intentId);
    const resolution = await resolveCprUploadIntentObject({
      intentId: begin.intent.intentId,
      bucketId: begin.intent.bucketId,
      objectPath: begin.intent.objectPath,
    });
    if (resolution.resolved) {
      const { error: cleanupError } = await deleteFileDocumentRow(org.organizationId, documentId);
      if (cleanupError) {
        return {
          error:
            "No fue posible finalizar la creación. El archivo subido fue retirado; elimina el borrador vacío antes de intentar de nuevo.",
        };
      }
      return { error: "No fue posible finalizar la creación del documento. Inténtalo nuevamente." };
    }
    return {
      error:
        finalizeError +
        " El archivo subido quedó registrado como pendiente de retiro y seguirá contando en tu almacenamiento hasta completarse la limpieza.",
      documentId,
    };
  }

  revalidateMaster();
  return { error: null, success: true, documentId };
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

export async function replaceFileDocumentFileAction(
  _prev: MasterActionState,
  formData: FormData
): Promise<MasterActionState> {
  const org = await requireActiveOrg();
  const mutateCheck = await checkCprCanMutate();
  if (!mutateCheck.allowed) return { error: mutateCheck.error };

  const id = String(formData.get("id") ?? "");

  // Corrección (Bloqueante 3): TODO se valida ANTES de subir nada —
  // documento existe, rol y estado permiten reemplazar. La RPC
  // replace_trazadoc_file_document sigue siendo la autoridad real (mismo
  // chequeo exacto en SQL), esto solo evita gastar una subida a Storage
  // cuando ya se sabe que se va a rechazar.
  const doc = await getFileDocument(org.organizationId, id);
  if (!doc) return { error: "El documento no existe o no pertenece a tu empresa." };
  if (!canReplaceFileDocumentFile(org.roleCode as "admin" | "quality" | "consultant" | null, doc.status)) {
    return {
      error:
        doc.status === "obsolete"
          ? "Un documento obsoleto no se puede reemplazar directamente; reactívalo primero."
          : "Tu rol no permite reemplazar el archivo de este documento en su estado actual.",
    };
  }

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "Selecciona un archivo." };

  // T9F.2 · Bloqueador 2: el tamaño máximo POR ARCHIVO se resuelve desde el
  // plan del MÓDULO CPR (organization_modules.access_mode → demo 10 MB;
  // full/extra 25 MB — Extra solo difiere en la CUOTA total). El plan legacy
  // (organization_subscriptions) ya no participa. Si el modo no puede
  // resolverse, se bloquea: nunca se cae a un plan por defecto.
  const cprMode = await getCprAccessModeForAction();
  if (cprMode.accessMode === null) {
    return { error: cprMode.error ?? "No fue posible verificar el plan del módulo. Inténtalo nuevamente." };
  }
  const fileValidation = validateFileDocumentUpload(
    { size: file.size, type: file.type },
    accessModeToPlanCode(cprMode.accessMode)
  );
  if (fileValidation.error) return { error: fileValidation.error };

  const storageCheck = await checkCprStorageAvailable(file.size);
  if (!storageCheck.allowed) return { error: storageCheck.error };

  // T9F.4 · §14: el reemplazo RESERVA el objeto NUEVO antes de subirlo (la
  // ruta v(n+1) la decide la base) y NO libera el anterior — la versión
  // histórica sigue contando hasta un retiro confirmado.
  const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_") || doc.fileName;
  const begin = await beginCprStorageUpload({
    resourceType: "trazadoc_replace",
    resourceId: id,
    fileName: safeFileName,
    fileSizeBytes: file.size,
    fileMimeType: file.type,
  });
  if (!begin.intent) {
    return { error: begin.error ?? "No fue posible reservar la subida del nuevo archivo." };
  }
  const bytes = await file.arrayBuffer();
  const { storagePath, error: uploadError } = await uploadFileDocumentFile(
    begin.intent.objectPath,
    bytes,
    file.type
  );
  if (uploadError || !storagePath) {
    await cancelCprStorageUpload(begin.intent.intentId);
    await resolveCprUploadIntentObject({
      intentId: begin.intent.intentId,
      bucketId: begin.intent.bucketId,
      objectPath: begin.intent.objectPath,
    });
    return { error: "No fue posible subir el nuevo archivo." };
  }

  const note = String(formData.get("note") ?? "").trim() || null;
  const { error } = await replaceFileDocumentFile(begin.intent.intentId, file.size, note);
  if (error) {
    // T9F.4: la RPC falló DESPUÉS de subir el nuevo objeto. El intent es su
    // referencia durable y sigue contabilizado; la resolución server-only
    // intenta el retiro CONFIRMADO — sin confirmación, la cuota lo sigue
    // contando hasta la limpieza. El usuario recibe el error real.
    await cancelCprStorageUpload(begin.intent.intentId);
    await resolveCprUploadIntentObject({
      intentId: begin.intent.intentId,
      bucketId: begin.intent.bucketId,
      objectPath: begin.intent.objectPath,
    });
    return { error };
  }

  revalidateMaster(id);
  return { ...okState, documentId: id };
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
