import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";
import type { DocumentStatus } from "@/lib/domain/trazadocs";
import type { MasterRow, MasterSourceType, TrustedFileDocumentInsert } from "@/lib/domain/trazadocs-master";

/**
 * Trazaloop · Sprint 10B · Capa de datos del Maestro de documentos. Nada
 * aquí usa service_role: todo corre con la sesión real, sujeta a las RLS
 * de 0057. Las transiciones de estado y el reemplazo de archivo pasan
 * SIEMPRE por las RPC change_trazadoc_file_document_status /
 * replace_trazadoc_file_document — nunca por varias escrituras sueltas.
 */

function mapMasterRow(r: Record<string, unknown>): MasterRow {
  return {
    sourceType: r.source_type as MasterSourceType,
    documentId: r.document_id as string,
    categoryCode: r.category_code as string,
    categoryLabel: r.category_label as string,
    code: (r.code as string | null) ?? null,
    title: r.title as string,
    status: r.status as DocumentStatus,
    versionLabel: r.version_label as string,
    responsibleName: (r.responsible_name as string | null) ?? null,
    updatedAt: r.updated_at as string,
    approvedAt: (r.approved_at as string | null) ?? null,
    fileName: (r.file_name as string | null) ?? null,
    sizeBytes: r.size_bytes == null ? null : Number(r.size_bytes),
    actionType: r.action_type as "open" | "download",
    actionHref: (r.action_href as string | null) ?? null,
  };
}

export async function listDocumentMaster(orgId: string): Promise<MasterRow[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("v_trazadoc_document_master")
    .select("*")
    // T8: el maestro documental de la app sigue siendo CPR; los documentos
    // de TrazaDocs Textil viven en /textiles/trazadocs (un maestro Textil
    // queda preparado por la columna module_key, no forzado en T8).
    .eq("module_key", "cpr")
    .eq("organization_id", orgId)
    .order("title", { ascending: true });
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(mapMasterRow);
}

/** Chequeo anti-duplicados cruzado (Parte 18): mismo título normalizado,
 *  sin importar si el otro documento es vivo o descargable. */
export async function findMasterDocumentByNormalizedTitle(
  orgId: string,
  normalizedTitle: string
): Promise<{ documentId: string; sourceType: MasterSourceType } | null> {
  const rows = await listDocumentMaster(orgId);
  const match = rows.find((r) => r.title.trim().toLowerCase() === normalizedTitle);
  return match ? { documentId: match.documentId, sourceType: match.sourceType } : null;
}

/** Igual que findMasterDocumentByNormalizedTitle, pero acotado SOLO a
 *  documentos descargables — usado desde createDocumentFromBlueprintAction/
 *  createCustomDocumentAction (documentos vivos, trazadocs.ts) como
 *  chequeo adicional al ya existente contra otros documentos vivos, sin
 *  duplicar consultas contra la vista completa. */
export async function findFileDocumentByNormalizedTitle(
  orgId: string,
  normalizedTitle: string
): Promise<{ id: string } | null> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("trazadoc_file_documents")
    .select("id, title")
    .eq("organization_id", orgId);
  const match = ((data ?? []) as { id: string; title: string }[]).find(
    (d) => d.title.trim().toLowerCase() === normalizedTitle
  );
  return match ? { id: match.id } : null;
}

// ---------------------------------------------------------------------------
// Documentos descargables.
// ---------------------------------------------------------------------------
export type FileDocumentDetail = {
  id: string;
  organizationId: string;
  categoryCode: string;
  code: string | null;
  title: string;
  description: string | null;
  status: DocumentStatus;
  versionLabel: string;
  currentVersion: number;
  ownerId: string | null;
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  obsoleteAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

function mapFileDocument(d: Record<string, unknown>): FileDocumentDetail {
  return {
    id: d.id as string,
    organizationId: d.organization_id as string,
    categoryCode: d.category_code as string,
    code: (d.code as string | null) ?? null,
    title: d.title as string,
    description: (d.description as string | null) ?? null,
    status: d.status as DocumentStatus,
    versionLabel: d.version_label as string,
    currentVersion: Number(d.current_version ?? 1),
    ownerId: (d.owner_id as string | null) ?? null,
    storagePath: d.storage_path as string,
    fileName: d.file_name as string,
    mimeType: d.mime_type as string,
    sizeBytes: Number(d.size_bytes ?? 0),
    uploadedBy: (d.uploaded_by as string | null) ?? null,
    approvedBy: (d.approved_by as string | null) ?? null,
    approvedAt: (d.approved_at as string | null) ?? null,
    obsoleteAt: (d.obsolete_at as string | null) ?? null,
    createdBy: (d.created_by as string | null) ?? null,
    createdAt: d.created_at as string,
    updatedAt: d.updated_at as string,
  };
}

export async function getFileDocument(orgId: string, id: string): Promise<FileDocumentDetail | null> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("trazadoc_file_documents")
    .select("*")
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  return data ? mapFileDocument(data as unknown as Record<string, unknown>) : null;
}

export async function insertFileDocument(
  orgId: string,
  payload: TrustedFileDocumentInsert,
  file: { storagePath: string; fileName: string; mimeType: string; sizeBytes: number },
  uploadedBy: string
): Promise<{ id: string | null; error: string | null }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("trazadoc_file_documents")
    .insert({
      organization_id: orgId,
      ...payload,
      storage_path: file.storagePath,
      file_name: file.fileName,
      mime_type: file.mimeType,
      size_bytes: file.sizeBytes,
      uploaded_by: uploadedBy,
    })
    .select("id")
    .single();
  if (error || !data) {
    const duplicate = (error as { code?: string } | null)?.code === "23505";
    return { id: null, error: duplicate ? "Ya existe un documento con ese código." : "No fue posible registrar el documento." };
  }
  return { id: data.id as string, error: null };
}

/** Sube el archivo al bucket privado trazadocs-documents. Ruta fija por
 *  versión: {organization_id}/document_files/{document_id}/{version}/{file_name}. */
/** T9F.4 · §12: la RUTA ya no se construye aquí — la decide la BASE al crear
 *  el intent (begin_cpr_storage_upload) a partir de la fila del documento, y
 *  esta función solo sube los bytes a ESA ruta reservada. */
export async function uploadFileDocumentFile(
  objectPath: string,
  bytes: ArrayBuffer,
  contentType: string
): Promise<{ storagePath: string | null; error: string | null }> {
  const supabase = await createServerClient();
  const { error } = await supabase.storage
    .from("trazadocs-documents")
    .upload(objectPath, bytes, { contentType });
  if (error) return { storagePath: null, error: "No fue posible subir el archivo. Intenta de nuevo." };
  return { storagePath: objectPath, error: null };
}

export async function getFileDocumentDownloadUrl(storagePath: string): Promise<string | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.storage.from("trazadocs-documents").createSignedUrl(storagePath, 60 * 10);
  if (error || !data) return null;
  return data.signedUrl;
}

export async function updateFileDocumentMetadata(
  orgId: string,
  id: string,
  input: { title: string; code: string | null; description: string | null; categoryCode: string; ownerId: string | null }
): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("trazadoc_file_documents")
    .update({
      title: input.title,
      code: input.code,
      description: input.description,
      category_code: input.categoryCode,
      owner_id: input.ownerId,
    })
    .eq("organization_id", orgId)
    .eq("id", id)
    .select("id");
  if (error) return { error: "No fue posible guardar los datos del documento." };
  if ((data ?? []).length === 0) return { error: "Tu rol no permite editar este documento en su estado actual." };
  return { error: null };
}

/** T9F.3 · Objeto físico encolado por la RPC de borrado (cada uno con SU
 *  propio tamaño; null = tamaño desconocido, que también cuenta). */
export type QueuedStorageObject = {
  bucketId: "evidences" | "trazadocs-documents";
  objectPath: string;
  sizeBytes: number | null;
};

/** T9F.3 · §18: borra un BORRADOR mediante la RPC atómica
 *  queue_and_delete_trazadoc_draft (0101 §3): en UNA transacción encola el
 *  archivo actual y TODAS las versiones (cada objeto con SU tamaño) como
 *  pending_delete y elimina las filas. La autorización es el ESPEJO exacto
 *  de la política RLS de DELETE; el error de Supabase SIEMPRE se inspecciona. */
export async function queueAndDeleteFileDocumentDraft(
  id: string
): Promise<{ objects: QueuedStorageObject[]; error: string | null }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("queue_and_delete_trazadoc_draft", {
    p_file_document_id: id,
  });
  if (error) {
    const message = error.message.includes("DELETE_NOT_ALLOWED")
      ? "Solo se pueden eliminar documentos en borrador que tú creaste o que administras."
      : error.message.includes("DOCUMENT_NOT_FOUND")
        ? "El documento no existe o no pertenece a tu empresa."
        : "No fue posible eliminar el documento.";
    return { objects: [], error: message };
  }
  const payload = data as { deleted?: unknown; objects?: unknown } | null;
  if (!payload || payload.deleted !== true || !Array.isArray(payload.objects)) {
    return { objects: [], error: "No fue posible eliminar el documento." };
  }
  const objects: QueuedStorageObject[] = [];
  for (const raw of payload.objects as Array<Record<string, unknown>>) {
    const bucketId = raw.bucket_id;
    const objectPath = raw.object_path;
    if (
      (bucketId !== "evidences" && bucketId !== "trazadocs-documents") ||
      typeof objectPath !== "string" ||
      objectPath === ""
    ) {
      continue;
    }
    const size = raw.size_bytes;
    objects.push({
      bucketId,
      objectPath,
      sizeBytes: size === null || size === undefined ? null : Number(size),
    });
  }
  return { objects, error: null };
}

export async function changeFileDocumentStatus(
  id: string,
  toStatus: DocumentStatus,
  note: string | null
): Promise<{ newVersion: number | null; error: string | null }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("change_trazadoc_file_document_status", {
    p_file_document_id: id,
    p_to_status: toStatus,
    p_change_note: note,
  });
  if (error || data == null) return { newVersion: null, error: error?.message ?? "No fue posible cambiar el estado del documento." };
  return { newVersion: Number(data), error: null };
}

/**
 * Corrección (Bloqueante 1): única vía para cerrar la CREACIÓN inicial de
 * un documento descargable — deja storage_path/file_name/mime_type/
 * size_bytes reales en la fila principal y exactamente una versión v1.
 * NUNCA usar changeFileDocumentStatus para esto: esa función siempre
 * incrementa current_version, dejando un documento recién creado en v2.
 */
/** T9F.4 · §15: la finalización recibe el INTENT — la ruta, el nombre y el
 *  MIME salen de la reserva durable (jamás del navegador) y la RPC v2 de
 *  0101 consume la reserva en la MISMA transacción que fija los campos. */
/** T9F.5B · A05-A08 · SERVER-ONLY: el tamaño y el MIME provienen del objeto
 *  FÍSICO verificado por el servidor; el actor viaja explícito (bajo
 *  service_role `auth.uid()` es NULL) y la RPC revalida rol, propiedad,
 *  acceso, tope por archivo del plan vigente y CUOTA ACTUAL. */
export async function finalizeFileDocumentInitialVersionServer(input: {
  actorId: string;
  intentId: string;
  realSizeBytes: number;
  realMimeType: string;
  note: string | null;
}): Promise<{ error: string | null }> {
  const supabase = createAdminClient();
  const { error } = await supabase.rpc("finalize_trazadoc_file_document_initial_version_server", {
    p_actor_id: input.actorId,
    p_intent_id: input.intentId,
    p_real_size_bytes: input.realSizeBytes,
    p_real_mime_type: input.realMimeType,
    p_change_note: input.note,
  });
  if (error) return { error: error.message ?? "No fue posible finalizar la creación del documento." };
  return { error: null };
}

/** Corrección (Bloqueante 4): limpia la fila temporal si algo falla
 *  después de crearla pero antes de terminar la subida — nunca deja un
 *  borrador con storage_path vacío visible en el maestro. */
export async function deleteFileDocumentRow(_orgId: string, id: string): Promise<{ error: string | null }> {
  // T9F.4 · §9: el DELETE directo fue retirado de la RLS — el descarte del
  // borrador VACÍO (sin objeto ni versiones) pasa por la RPC controlada,
  // que valida creador/rol, estado draft y storage_path vacío.
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("discard_empty_trazadoc_file_document", {
    p_file_document_id: id,
  });
  return { error: error ? "No fue posible limpiar el borrador incompleto." : null };
}

/** T9F.3 · §21: objetos físicos COMPLETOS de un documento del maestro —
 *  archivo actual + todas las versiones, CADA UNO con SU PROPIO tamaño
 *  (jamás el tamaño del archivo actual copiado a las rutas históricas y
 *  jamás un simple string[]). Deduplicado por ruta conservando el mayor
 *  tamaño CONOCIDO; sizeBytes null = desconocido (también cuenta). */
export type FileDocumentStorageObject = {
  bucketId: "trazadocs-documents";
  storagePath: string;
  sizeBytes: number | null;
  sourceType: "trazadoc_current" | "trazadoc_version";
  sourceId: string;
};

export async function listFileDocumentStorageObjects(
  orgId: string,
  id: string
): Promise<{ objects: FileDocumentStorageObject[]; error: string | null }> {
  const supabase = await createServerClient();
  const [{ data: doc, error: docError }, { data: versions, error: verError }] = await Promise.all([
    supabase
      .from("trazadoc_file_documents")
      .select("id, storage_path, size_bytes")
      .eq("organization_id", orgId)
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("trazadoc_file_document_versions")
      .select("id, storage_path, size_bytes")
      .eq("organization_id", orgId)
      .eq("file_document_id", id),
  ]);
  if (docError || verError) return { objects: [], error: "No fue posible leer las versiones del documento." };

  const byPath = new Map<string, FileDocumentStorageObject>();
  const add = (
    storagePath: string | null,
    sizeBytes: unknown,
    sourceType: FileDocumentStorageObject["sourceType"],
    sourceId: string
  ) => {
    if (!storagePath || storagePath === "") return;
    const size = sizeBytes === null || sizeBytes === undefined ? null : Number(sizeBytes);
    const existing = byPath.get(storagePath);
    if (!existing) {
      byPath.set(storagePath, { bucketId: "trazadocs-documents", storagePath, sizeBytes: size, sourceType, sourceId });
      return;
    }
    // Misma ruta referenciada por varias versiones: conserva el MAYOR
    // tamaño conocido (conservador; coherente con la vista de uso).
    if (size !== null && (existing.sizeBytes === null || size > existing.sizeBytes)) {
      existing.sizeBytes = size;
    }
  };
  if (doc) add(doc.storage_path as string | null, doc.size_bytes, "trazadoc_current", doc.id as string);
  for (const v of versions ?? []) {
    add(v.storage_path as string | null, v.size_bytes, "trazadoc_version", v.id as string);
  }
  return { objects: [...byPath.values()], error: null };
}

/** T9F.4 · §14-§15: el reemplazo también consume su RESERVA — la RPC v2 de
 *  0101 toma ruta/nombre/MIME del intent y reserva el objeto NUEVO sin
 *  liberar el anterior (que pasa a versión histórica y sigue contando). */
export async function replaceFileDocumentFileServer(input: {
  actorId: string;
  intentId: string;
  realSizeBytes: number;
  realMimeType: string;
  note: string | null;
}): Promise<{ newVersion: number | null; error: string | null }> {
  // T9F.5B · A05-A08 · SERVER-ONLY con valores físicos verificados.
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("replace_trazadoc_file_document_server", {
    p_actor_id: input.actorId,
    p_intent_id: input.intentId,
    p_real_size_bytes: input.realSizeBytes,
    p_real_mime_type: input.realMimeType,
    p_change_note: input.note,
  });
  if (error || data == null) {
    return { newVersion: null, error: error?.message ?? "No fue posible reemplazar el archivo." };
  }
  return { newVersion: Number(data), error: null };
}

export type FileDocumentVersionRow = {
  id: string;
  versionNumber: number;
  versionLabel: string;
  status: DocumentStatus;
  fileName: string;
  sizeBytes: number;
  changeNote: string | null;
  createdByName: string | null;
  createdAt: string;
};

export async function listFileDocumentVersions(orgId: string, fileDocumentId: string): Promise<FileDocumentVersionRow[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("trazadoc_file_document_versions")
    .select(
      "id, version_number, version_label, status, file_name, size_bytes, change_note, created_at, author:profiles!trazadoc_file_document_versions_created_by_fkey(full_name)"
    )
    .eq("organization_id", orgId)
    .eq("file_document_id", fileDocumentId)
    .order("version_number", { ascending: false });
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => {
    const author = (r.author ?? null) as { full_name: string | null } | null;
    return {
      id: r.id as string,
      versionNumber: Number(r.version_number),
      versionLabel: r.version_label as string,
      status: r.status as DocumentStatus,
      fileName: r.file_name as string,
      sizeBytes: Number(r.size_bytes ?? 0),
      changeNote: (r.change_note as string | null) ?? null,
      createdByName: author?.full_name ?? null,
      createdAt: r.created_at as string,
    };
  });
}

// ---------------------------------------------------------------------------
// Categoría en documentos vivos (Parte 17: "permitir editar categoría en
// metadatos").
// ---------------------------------------------------------------------------
export async function updateLiveDocumentCategory(
  orgId: string,
  documentId: string,
  categoryCode: string
): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("trazadoc_documents")
    .update({ category_code: categoryCode })
    .eq("organization_id", orgId)
    .eq("id", documentId)
    .select("id");
  if (error) return { error: "No fue posible guardar la categoría." };
  if ((data ?? []).length === 0) return { error: "Tu rol no permite editar este documento en su estado actual." };
  return { error: null };
}
