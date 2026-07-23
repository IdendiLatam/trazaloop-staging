import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Trazaloop · T9F.3 · Ciclo SEGURO de eliminación física (server-only).
 *
 * Modelo (0101 §1–§3): referencia activa → pending_delete (creado en la BD
 * ANTES de perder la referencia de dominio, por las RPCs de encolado) →
 * intento de eliminación en Storage → deleted (libera cuota) o delete_failed
 * (SIGUE contando). Este módulo ejecuta la parte FÍSICA con el cliente
 * ADMINISTRATIVO y confirma el resultado en la base:
 *
 * - El retiro y su resolución son server-only por diseño: un cliente jamás
 *   puede "declarar eliminado" un objeto para liberar cuota
 *   (resolve_storage_deletion está revocada a authenticated en 0101 §2).
 * - TODA respuesta de Supabase se inspecciona explícitamente (`error`):
 *   nunca se asume éxito (T9F.3 §25).
 * - Si el retiro falla, el candidato queda como delete_failed con un
 *   error_code SEGURO (sin tokens, sin URLs firmadas) y la cuota lo sigue
 *   contando hasta una limpieza posterior.
 */

export type StorageBucketId = "evidences" | "trazadocs-documents";

type QueuedObject = { bucketId: StorageBucketId; objectPath: string };

function safeErrorCode(message: string | undefined): string {
  // Código corto y SIN datos sensibles (la BD además lo recorta a 120).
  return (message ?? "unknown").replace(/[^a-zA-Z0-9_. -]/g, "_").slice(0, 80);
}

/** Intenta el retiro físico de UN objeto encolado y CONFIRMA el resultado en
 *  la cola contable. Devuelve si el objeto quedó efectivamente eliminado. */
export async function removeQueuedStorageObject(object: QueuedObject): Promise<{ removed: boolean }> {
  const admin = createAdminClient();
  const { error: removeError } = await admin.storage.from(object.bucketId).remove([object.objectPath]);

  const outcome = removeError ? "delete_failed" : "deleted";
  const { data, error: resolveError } = await admin.rpc("resolve_storage_deletion", {
    p_bucket_id: object.bucketId,
    p_object_path: object.objectPath,
    p_outcome: outcome,
    p_error_code: removeError ? safeErrorCode(removeError.message) : null,
  });

  if (resolveError || data !== true) {
    // La resolución no pudo confirmarse: el candidato permanece
    // pending_delete y SIGUE contando (dirección segura). Log sin secretos.
    console.error("[storage-deletion] resolución no confirmada", {
      op: "resolve_storage_deletion",
      bucket: object.bucketId,
      outcome,
      code: resolveError?.message ?? "resolver_returned_false",
    });
    return { removed: false };
  }
  if (removeError) {
    console.error("[storage-deletion] retiro físico fallido; el objeto sigue contabilizado", {
      op: "storage.remove",
      bucket: object.bucketId,
      code: safeErrorCode(removeError.message),
    });
    return { removed: false };
  }
  return { removed: true };
}

/** Retira una LISTA de objetos encolados; devuelve cuántos quedaron
 *  pendientes (delete_failed / sin confirmar) y por tanto siguen contando. */
export async function removeQueuedStorageObjects(
  objects: QueuedObject[]
): Promise<{ removedCount: number; pendingCount: number }> {
  let removedCount = 0;
  for (const object of objects) {
    const { removed } = await removeQueuedStorageObject(object);
    if (removed) removedCount += 1;
  }
  return { removedCount, pendingCount: objects.length - removedCount };
}

/**
 * T9F.3 §25 · Compensación tras una carga PARCIALMENTE fallida: un objeto ya
 * subido cuya finalización/actualización de base falló y que quedó SIN fila
 * de dominio. Se registra PRIMERO como pending_delete (register_storage_orphan
 * es server-only y valida bucket, prefijo de organización y combinación
 * módulo-bucket incluso para el servidor) y después se intenta el retiro
 * confirmado. Pase lo que pase, el objeto queda contabilizable o eliminado
 * de forma confirmada — jamás invisible.
 */
export async function registerAndRemoveUnreferencedObject(input: {
  organizationId: string;
  moduleCode: "traceability_6632" | "textiles";
  bucketId: StorageBucketId;
  objectPath: string;
  sizeBytes: number | null;
}): Promise<{ removed: boolean; accounted: boolean }> {
  const admin = createAdminClient();
  const { error: registerError } = await admin.rpc("register_storage_orphan", {
    p_organization_id: input.organizationId,
    p_module_code: input.moduleCode,
    p_bucket_id: input.bucketId,
    p_object_path: input.objectPath,
    p_size_bytes: input.sizeBytes,
  });
  if (registerError) {
    // Sin registro no hay resolución posible: se intenta el retiro directo y
    // se reporta. Log técnico sin secretos.
    console.error("[storage-deletion] registro de objeto sin referencia fallido", {
      op: "register_storage_orphan",
      bucket: input.bucketId,
      code: safeErrorCode(registerError.message),
    });
    const { error: removeError } = await admin.storage.from(input.bucketId).remove([input.objectPath]);
    return { removed: !removeError, accounted: false };
  }
  const { removed } = await removeQueuedStorageObject({
    bucketId: input.bucketId,
    objectPath: input.objectPath,
  });
  return { removed, accounted: true };
}

/** T9F.4 · Resolución FÍSICA server-only de un intent de subida CPR/TrazaDocs
 *  (0101 §6b) que quedó failed / vencido: intenta el retiro REAL, INSPECCIONA
 *  el resultado ("not found" cuenta como inexistente ⇒ resuelto) y registra
 *  el desenlace en la RPC service-only. Un retiro NO confirmado deja el
 *  intent como candidato contabilizado (equivalente de delete_failed) — sus
 *  bytes SIGUEN contando. Nunca se llama con intents finalizados. */
export async function resolveCprUploadIntentObject(input: {
  intentId: string;
  bucketId: StorageBucketId;
  objectPath: string;
}): Promise<{ resolved: boolean }> {
  const admin = createAdminClient();
  const { error: removeError } = await admin.storage.from(input.bucketId).remove([input.objectPath]);
  // El SDK de Storage reporta "not found" como error: el objeto NO existe,
  // exactamente el desenlace que libera la contabilidad.
  const removed = !removeError || /not.?found/i.test(removeError.message);
  const { data, error: resolveError } = await admin.rpc("resolve_cpr_upload_intent_object", {
    p_intent_id: input.intentId,
    p_removed: removed,
  });
  if (resolveError || data !== "resolved") {
    console.error("[storage-deletion] resolución de intent CPR no confirmada", {
      op: "resolve_cpr_upload_intent_object",
      bucket: input.bucketId,
      code: resolveError?.message ?? String(data ?? "sin_respuesta"),
    });
    return { resolved: false };
  }
  return { resolved: removed };
}
