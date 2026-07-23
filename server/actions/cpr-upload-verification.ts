import "server-only";

// Trazaloop · T9F.5B.1 · Verificación FÍSICA y COMPENSACIÓN compartidas por
// los finalizadores CPR y TrazaDocs.
//
// Tras migrar a CARGA DIRECTA (bloqueador 2), la Server Action de finalize
// recibe SOLO un intentId. Todo lo demás —bucket, ruta, tamaño y MIME— se
// deriva del intent (servidor) y del objeto FÍSICO real (Storage). El cliente
// no aporta ningún valor de confianza.
import {
  getCprStorageObjectInfo,
  downloadCprStorageObjectBytes,
} from "@/lib/db/cpr-storage-objects";
import {
  validateCprUploadedObject,
  validateCprBinarySignature,
} from "@/lib/domain/cpr-file-verification";
import { cancelCprStorageUpload, type OwnCprUploadIntent } from "@/lib/db/storage-intents";
import { resolveCprUploadIntentObject } from "@/lib/db/storage-deletion";

export type CprVerificationResult =
  | { sizeBytes: number; mimeType: string; error: null }
  | { sizeBytes: null; mimeType: null; error: string };

/**
 * Verificación FÍSICA completa del objeto subido, en servidor:
 *   (1) existencia real, bucket y ruta del intent;
 *   (2) tamaño físico y Content-Type almacenado;
 *   (3) FIRMA BINARIA de los bytes reales descargados de Storage.
 *
 * Fail-closed: si algo no puede asegurarse, devuelve error y NO se finaliza.
 */
export async function verifyCprUploadedObject(input: {
  bucketId: "evidences" | "trazadocs-documents";
  objectPath: string;
  expectedSizeBytes: number;
  expectedMimeType: string;
}): Promise<CprVerificationResult> {
  const info = await getCprStorageObjectInfo(input.bucketId, input.objectPath);
  const objectError = validateCprUploadedObject({
    expectedSizeBytes: input.expectedSizeBytes,
    expectedMimeType: input.expectedMimeType,
    realSizeBytes: info?.sizeBytes ?? null,
    realMimeType: info?.mimeType ?? null,
  });
  if (objectError || !info) {
    return { sizeBytes: null, mimeType: null, error: objectError ?? "No fue posible verificar el archivo subido." };
  }

  const bytes = await downloadCprStorageObjectBytes(input.bucketId, input.objectPath);
  if (!bytes) {
    return {
      sizeBytes: null,
      mimeType: null,
      error: "No fue posible verificar el archivo subido. Intenta de nuevo.",
    };
  }
  const signatureError = validateCprBinarySignature({
    bytes,
    fileName: input.objectPath.split("/").pop() ?? "archivo",
    declaredMimeType: input.expectedMimeType,
    storedContentType: info.mimeType,
  });
  if (signatureError) {
    return { sizeBytes: null, mimeType: null, error: signatureError };
  }
  return { sizeBytes: info.sizeBytes, mimeType: info.mimeType ?? input.expectedMimeType, error: null };
}

/**
 * COMPENSACIÓN (T9F.5B.1 · §18 del encargo T9F.5B): un intent cuyo objeto no
 * superó la verificación, o cuyo finalize falló, se cancela y se intenta el
 * retiro FÍSICO CONFIRMADO. Si el retiro no se confirma, el intent permanece
 * como candidato contabilizado: los bytes SIGUEN contando hasta la limpieza.
 * Jamás se libera capacidad sin confirmación.
 */
export async function compensateFailedCprUpload(
  intent: OwnCprUploadIntent
): Promise<{ resolved: boolean }> {
  await cancelCprStorageUpload(intent.intentId);
  return resolveCprUploadIntentObject({
    intentId: intent.intentId,
    bucketId: intent.bucketId,
    objectPath: intent.objectPath,
  });
}
