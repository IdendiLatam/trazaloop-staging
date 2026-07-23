// Trazaloop · T9F.4 · Reserva GENERAL de almacenamiento CPR/TrazaDocs.
//
// Wrappers finos (sesión del usuario) sobre las RPCs de 0101 §6b: TODO
// upload CPR — adjunto de evidencia, documento descargable inicial y
// reemplazo — nace de un intent DURABLE creado ANTES de subir un solo byte
// (referencia + reserva atómica bajo el lock de cuota del módulo). La ruta
// y el bucket los decide la BASE a partir de la fila de dominio: el
// navegador jamás aporta rutas ni tamaños de confianza.
//
// La resolución FÍSICA de intents fallidos/vencidos es server-only y vive
// en lib/db/storage-deletion.ts (resolveCprUploadIntentObject).
import { createServerClient } from "@/lib/supabase/server";

export type CprUploadResourceType = "evidence" | "trazadoc_initial" | "trazadoc_replace";

export type CprUploadIntent = {
  intentId: string;
  bucketId: "evidences" | "trazadocs-documents";
  objectPath: string;
  reused: boolean;
};

const BEGIN_ERROR_MESSAGES: Record<string, string> = {
  STORAGE_QUOTA_EXCEEDED:
    "No hay capacidad de almacenamiento disponible para este archivo en el plan del módulo.",
  STORAGE_UNVERIFIABLE:
    "El uso de almacenamiento no pudo verificarse por completo (tamaños desconocidos o inconsistentes); resuélvelo antes de subir nuevos archivos.",
  STORAGE_USAGE_UNVERIFIABLE:
    "El uso de almacenamiento no pudo verificarse. Intenta de nuevo.",
  STORAGE_QUOTA_UNVERIFIABLE:
    "La cuota del plan no pudo verificarse. Intenta de nuevo.",
  MODULE_ACCESS_BLOCKED: "El módulo no está disponible para tu organización en este momento.",
  ROLE_NOT_ALLOWED: "Tu rol no permite esta operación.",
  ALREADY_HAS_FILE: "Este registro ya tiene un archivo asociado.",
  PATH_ALREADY_FINALIZED: "Ya existe un archivo finalizado en esa ruta.",
  FILE_SIZE_INVALID: "El tamaño del archivo no es válido (máximo 20 MB).",
  FILE_MIME_INVALID: "El tipo del archivo no es válido.",
  FILE_REQUIRED: "El archivo es obligatorio.",
  EVIDENCE_NOT_FOUND: "La evidencia no existe.",
  DOCUMENT_NOT_FOUND: "El documento no existe.",
  INTENT_NOT_FOUND: "La reserva de subida no existe.",
  INTENT_NOT_OWNED: "La reserva de subida no pertenece a tu sesión.",
  INTENT_NOT_PENDING: "La reserva de subida ya no está activa. Intenta de nuevo.",
  INTENT_EXPIRED: "La reserva de subida venció. Intenta de nuevo.",
  OBJECT_SIZE_MISMATCH:
    "El tamaño del archivo subido no coincide con el declarado. Intenta de nuevo.",
};

export function cprUploadErrorMessage(raw: string | null | undefined, fallback: string): string {
  if (!raw) return fallback;
  for (const code of Object.keys(BEGIN_ERROR_MESSAGES)) {
    if (raw.includes(code)) return BEGIN_ERROR_MESSAGES[code];
  }
  return fallback;
}

/** Crea la referencia durable + reserva (RPC autoritativa; sesión). */
export async function beginCprStorageUpload(input: {
  resourceType: CprUploadResourceType;
  resourceId: string;
  fileName: string;
  fileSizeBytes: number;
  fileMimeType: string;
  idempotencyKey?: string | null;
}): Promise<{ intent: CprUploadIntent | null; error: string | null }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("begin_cpr_storage_upload", {
    p_resource_type: input.resourceType,
    p_resource_id: input.resourceId,
    p_file_name: input.fileName,
    p_file_size_bytes: input.fileSizeBytes,
    p_file_mime_type: input.fileMimeType || "application/octet-stream",
    p_ttl_minutes: 30,
    p_idempotency_key: input.idempotencyKey ?? null,
  });
  if (error || !data) {
    return {
      intent: null,
      error: cprUploadErrorMessage(error?.message, "No fue posible reservar la subida. Intenta de nuevo."),
    };
  }
  const row = data as { intent_id: string; bucket_id: string; object_path: string; reused: boolean };
  return {
    intent: {
      intentId: row.intent_id,
      bucketId: row.bucket_id as CprUploadIntent["bucketId"],
      objectPath: row.object_path,
      reused: Boolean(row.reused),
    },
    error: null,
  };
}

/** Finaliza el ADJUNTO de una evidencia CPR (fija ruta/tamaño vía DEFINER). */
export async function finalizeEvidenceAttachment(
  intentId: string,
  fileSizeBytes: number
): Promise<{ ok: boolean; error: string | null }> {
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("finalize_evidence_attachment", {
    p_intent_id: intentId,
    p_file_size_bytes: fileSizeBytes,
  });
  if (error) {
    return {
      ok: false,
      error: cprUploadErrorMessage(error.message, "No fue posible registrar el archivo subido."),
    };
  }
  return { ok: true, error: null };
}

/** Cancela un intent propio no finalizado; la resolución física del objeto
 * (si existe) es server-only y NO ocurre aquí. */
export async function cancelCprStorageUpload(
  intentId: string
): Promise<{ bucketId: string; objectPath: string } | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("cancel_cpr_storage_upload", {
    p_intent_id: intentId,
  });
  if (error || !data) return null;
  const row = data as { bucket_id: string; object_path: string };
  return { bucketId: row.bucket_id, objectPath: row.object_path };
}
