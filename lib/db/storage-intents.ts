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
import { createAdminClient } from "@/lib/supabase/admin";
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
  MODULE_ACCESS_BLOCKED: "El módulo no está disponible para tu empresa en este momento.",
  ROLE_NOT_ALLOWED: "Tu rol no permite esta operación.",
  ALREADY_HAS_FILE: "Este registro ya tiene un archivo asociado.",
  PATH_ALREADY_FINALIZED: "Ya existe un archivo finalizado en esa ruta.",
  FILE_SIZE_INVALID:
    "El tamaño del archivo no es válido para el plan del módulo (evidencia CPR 20 MB; TrazaDocs 10 MB en Demo y 25 MB en Full/Extra).",
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
  // T9F.5B · A05-A08/A14
  OBJECT_NOT_VERIFIED:
    "El archivo subido no pudo verificarse en el almacenamiento. Intenta subirlo de nuevo.",
  OBJECT_MIME_UNVERIFIED:
    "El tipo del archivo subido no pudo verificarse. Intenta subirlo de nuevo.",
  OBJECT_MIME_MISMATCH:
    "El tipo del archivo subido no corresponde al declarado. Intenta subirlo de nuevo.",
  SERVER_ONLY_FINALIZER:
    "La finalización de archivos solo puede completarla el servidor tras verificar el archivo.",
  SERVER_ONLY: "Esta operación solo puede ejecutarla el servidor.",
  ACTOR_REQUIRED: "No fue posible identificar al usuario de la operación.",
  ACTOR_NOT_FOUND: "No fue posible identificar al usuario de la operación.",
  ROLE_NOT_ALLOWED_FINALIZE: "Tu rol no permite completar esta operación.",
  INTENT_ALREADY_FINALIZED: "Esta subida ya fue finalizada.",
  FILE_SIZE_LIMIT_UNVERIFIABLE:
    "No fue posible verificar el tamaño máximo permitido por tu plan. Intenta de nuevo.",
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

/**
 * T9F.5B · A05/A06/A07/A08 · Finaliza el ADJUNTO de una evidencia CPR
 * SERVER-ONLY.
 *
 * La RPC ya no es ejecutable por `authenticated` (la firma histórica falla
 * con SERVER_ONLY_FINALIZER): solo el cliente administrativo la invoca,
 * DESPUÉS de que la Server Action verificó el objeto REAL y su firma
 * binaria. El actor viaja explícito porque bajo service_role `auth.uid()` es
 * NULL, y la RPC revalida membresía, rol, propiedad del intent, estado,
 * vigencia, acceso comercial, tope por archivo del plan VIGENTE y CUOTA
 * ACTUAL. El tamaño y el MIME provienen del objeto físico, jamás del cliente.
 */
export async function finalizeEvidenceAttachmentServer(input: {
  actorId: string;
  intentId: string;
  realSizeBytes: number;
  realMimeType: string;
}): Promise<{ ok: boolean; error: string | null }> {
  const supabase = createAdminClient();
  const { error } = await supabase.rpc("finalize_evidence_attachment_server", {
    p_actor_id: input.actorId,
    p_intent_id: input.intentId,
    p_real_size_bytes: input.realSizeBytes,
    p_real_mime_type: input.realMimeType,
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

/**
 * T9F.5B.1 · Lectura SERVER-ONLY del intent PROPIO por id.
 *
 * `storage_upload_intents` tiene RLS habilitada, sin políticas y revocada a
 * `authenticated`: ningún cliente puede leerla. Esta función usa el cliente
 * administrativo y **exige** que el intent pertenezca al usuario autenticado
 * de la sesión (que la Server Action ya validó), de modo que un intentId
 * ajeno nunca devuelve datos. Es la vía por la que finalize obtiene bucket,
 * ruta, tamaño y MIME sin recibirlos del navegador.
 */
export type OwnCprUploadIntent = {
  intentId: string;
  organizationId: string;
  resourceType: CprUploadResourceType;
  resourceId: string;
  bucketId: "evidences" | "trazadocs-documents";
  objectPath: string;
  expectedSizeBytes: number;
  expectedMimeType: string;
  status: string;
};

export async function getOwnCprUploadIntent(
  intentId: string,
  actorId: string,
  organizationId: string
): Promise<OwnCprUploadIntent | null> {
  if (!intentId || !actorId || !organizationId) return null;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("storage_upload_intents")
    .select(
      "id, organization_id, resource_type, resource_id, bucket_id, object_path, expected_size_bytes, expected_mime_type, status, created_by"
    )
    .eq("id", intentId)
    .eq("created_by", actorId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    intentId: String(data.id),
    organizationId: String(data.organization_id),
    resourceType: data.resource_type as CprUploadResourceType,
    resourceId: String(data.resource_id),
    bucketId: data.bucket_id as OwnCprUploadIntent["bucketId"],
    objectPath: String(data.object_path),
    expectedSizeBytes: Number(data.expected_size_bytes),
    expectedMimeType: String(data.expected_mime_type),
    status: String(data.status),
  };
}
