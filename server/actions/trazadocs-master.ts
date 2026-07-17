"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { requireSession } from "@/lib/auth/require-session";
import {
  checkOrganizationCanMutate,
  checkResourceLimit,
  checkStorageAvailable,
} from "@/server/actions/plans";
import { getOrganizationUsage } from "@/lib/db/plans";
import {
  listDocumentMaster,
  findMasterDocumentByNormalizedTitle,
  getFileDocument,
  insertFileDocument,
  uploadFileDocumentFile,
  getFileDocumentDownloadUrl,
  updateFileDocumentMetadata,
  deleteFileDocument,
  deleteFileDocumentRow,
  deleteFileDocumentStorageObject,
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
  const org = await requireActiveOrg();
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
 *  miembro de la empresa con acceso a TrazaDocs. */
export async function downloadFileDocumentAction(id: string): Promise<{ url: string | null; error: string | null }> {
  const org = await requireActiveOrg();
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

  const mutateCheck = await checkOrganizationCanMutate();
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
  const limitCheck = await checkResourceLimit("documents_trazadocs");
  if (!limitCheck.allowed) return { error: limitCheck.error };

  const usage = await getOrganizationUsage(org.organizationId);
  const planCode = usage?.planCode ?? "demo";
  const fileValidation = validateFileDocumentUpload({ size: file.size, type: file.type }, planCode);
  if (fileValidation.error) return { error: fileValidation.error };

  const storageCheck = await checkStorageAvailable(file.size);
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

  // 2. Subir el archivo real con la ruta que incluye el id ya generado.
  const bytes = await file.arrayBuffer();
  const { storagePath, error: uploadError } = await uploadFileDocumentFile(
    org.organizationId,
    documentId,
    1,
    bytes,
    safeFileName,
    file.type
  );
  if (uploadError || !storagePath) {
    // Corrección (Bloqueante 4): si la subida falla, no dejar un
    // borrador con storage_path vacío visible en el maestro — se limpia
    // la fila recién creada automáticamente.
    const { error: cleanupError } = await deleteFileDocumentRow(org.organizationId, documentId);
    if (cleanupError) {
      return { error: "El documento no quedó completamente creado. Elimina el borrador antes de intentar de nuevo." };
    }
    return { error: "No fue posible subir el archivo. No se creó el documento." };
  }

  // 3. Confirmar la ruta real y dejar EXACTAMENTE una versión v1 — nunca
  //    changeFileDocumentStatus, que siempre incrementa current_version
  //    (dejaría un documento recién creado en v2).
  const { error: finalizeError } = await finalizeFileDocumentInitialVersion(
    documentId,
    { storagePath, fileName: safeFileName, mimeType: file.type, sizeBytes: file.size },
    "Borrador inicial"
  );
  if (finalizeError) {
    // El archivo ya se subió y la fila ya existe — no se puede "deshacer"
    // limpio sin arriesgar perder el archivo real; se deja el documento
    // para que quien lo creó lo revise, con un mensaje claro.
    return { error: finalizeError, documentId };
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
  const mutateCheck = await checkOrganizationCanMutate();
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
  const mutateCheck = await checkOrganizationCanMutate();
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

  const usage = await getOrganizationUsage(org.organizationId);
  const planCode = usage?.planCode ?? "demo";
  const fileValidation = validateFileDocumentUpload({ size: file.size, type: file.type }, planCode);
  if (fileValidation.error) return { error: fileValidation.error };

  const storageCheck = await checkStorageAvailable(file.size);
  if (!storageCheck.allowed) return { error: storageCheck.error };

  // Solo AHORA se sube el archivo — todas las validaciones ya pasaron.
  const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_") || doc.fileName;
  const bytes = await file.arrayBuffer();
  const { storagePath, error: uploadError } = await uploadFileDocumentFile(
    org.organizationId,
    id,
    doc.currentVersion + 1,
    bytes,
    safeFileName,
    file.type
  );
  if (uploadError || !storagePath) return { error: "No fue posible subir el nuevo archivo." };

  const note = String(formData.get("note") ?? "").trim() || null;
  const { error } = await replaceFileDocumentFile(id, storagePath, safeFileName, file.type, file.size, note);
  if (error) {
    // Corrección (Bloqueante 3): la RPC falló DESPUÉS de subir el
    // archivo nuevo — se intenta limpiar el objeto huérfano. Best-effort:
    // si la limpieza también falla, el usuario ya recibe el error real
    // de la RPC, que es lo que importa para decidir qué hacer.
    await deleteFileDocumentStorageObject(storagePath);
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
  const mutateCheck = await checkOrganizationCanMutate();
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

  const { error } = await deleteFileDocument(org.organizationId, id);
  if (error) return { error };

  revalidateMaster();
  return okState;
}

// ---------------------------------------------------------------------------
// Transiciones de estado — todas vía la RPC atómica.
// ---------------------------------------------------------------------------
async function transitionFile(id: string, toStatus: "draft" | "in_review" | "approved" | "obsolete", note: string | null): Promise<MasterActionState> {
  await requireActiveOrg();
  const mutateCheck = await checkOrganizationCanMutate();
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
  const id = String(formData.get("id") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;
  return transitionFile(id, "in_review", note);
}

export async function approveFileDocumentAction(
  _prev: MasterActionState,
  formData: FormData
): Promise<MasterActionState> {
  const org = await requireActiveOrg();
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
  const mutateCheck = await checkOrganizationCanMutate();
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
