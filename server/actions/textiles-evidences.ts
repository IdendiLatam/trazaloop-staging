"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { requireTextilesForAction } from "@/lib/auth/require-textiles-module";
import { checkOrganizationCanMutate, checkStorageAvailable } from "@/server/actions/plans";
import {
  textileEvidenceBelongsToOrg,
  textileEntityBelongsToOrg,
  getTextileEvidence,
  getTextileEvidenceSignedUrl,
  beginTextileEvidenceUploadRpc,
  finalizeTextileEvidenceUploadRpc,
  markTextileEvidenceUploadFailedRpc,
  recordTextileUploadIntentCleanupRpc,
  getTextileEvidenceUploadIntent,
  listExpiredPendingTextileUploadIntents,
  listRecentlyExpiredTextileUploadIntents,
  textileEvidenceExistsForPath,
  getTextileEvidenceObjectInfo,
  downloadTextileEvidenceObjectBytes,
  removeTextileEvidenceObject,
  createTextileEvidenceSignedUploadUrl,
} from "@/lib/db/textiles-evidences";
import {
  TEXTILE_EVIDENCE_TYPES,
  TEXTILE_EVIDENCE_STATUSES,
  TEXTILE_EVIDENCE_ENTITY_TYPES,
  TEXTILE_EVIDENCE_LINK_TYPES,
  TEXTILE_EVIDENCE_MAX_FILE_BYTES,
  TEXTILE_EVIDENCE_MAX_FILE_MB,
  TEXTILE_EVIDENCE_UPLOAD_INTENT_TTL_MINUTES,
  TEXTILE_EVIDENCE_UPLOAD_TOKEN_GRACE_HOURS,
  isAllowedTextileEvidenceMime,
  isAllowedTextileEvidenceExtension,
  validateTextileEvidenceUploadedObject,
  isTextileUploadIntentExpired,
  canSetTextileEvidenceStatus,
  canUploadTextileEvidence,
  isTextileEvidencePathForOrg,
} from "@/lib/domain/textiles-evidences";
import { validateTextileEvidenceBinarySignature } from "@/lib/domain/textiles-evidence-signatures";
import { cleanText, isOneOf, validateCatalogName } from "@/lib/domain/textiles-catalogs";

/**
 * Trazaloop · Sprint T5 (Textil) · Server actions de evidencias textiles.
 *
 * Contrato de seguridad (idéntico a T3/T4 + storage):
 *  · triple guarda del módulo + modo solo lectura de plataforma;
 *  · la SUBIDA usa la SESIÓN DEL USUARIO contra el bucket privado
 *    `evidences` (RLS de storage 0015 aplica; jamás service_role) con ruta
 *    {organization_id}/textiles/{evidence_id}/{filename} — el primer
 *    segmento sigue siendo la organización, como en CPR (D-T5-01);
 *  · cuota global de almacenamiento verificada antes de subir
 *    (checkStorageAvailable); NO se aplica checkResourceLimit("evidences")
 *    porque ese límite cuenta la tabla CPR y los planes por módulo están
 *    fuera de alcance (documentado en el reporte T5);
 *  · cambiar estado exige admin/quality (validado aquí Y por el trigger
 *    guard_textile_evidence_review — nunca solo UI); consultant carga y
 *    edita pendientes;
 *  · vínculos validados contra la MISMA organización aquí, por FK compuesta
 *    y por el trigger polimórfico validate_textile_evidence_link_org;
 *  · apertura de archivos SOLO por signed URL de corta vida.
 */

export type TextileEvidenceActionState = { error: string | null };

const UNIQUE_VIOLATION = "23505";
const EVIDENCES_PATH = "/textiles/evidences";

function isUniqueViolation(error: { code?: string } | null): boolean {
  return Boolean(error && error.code === UNIQUE_VIOLATION);
}

type GateOk = { organizationId: string; roleCode: string };

async function gate(): Promise<{ ok: GateOk | null; error: string | null }> {
  const access = await requireTextilesForAction();
  if (access.org === null) return { ok: null, error: access.error };
  const mutateCheck = await checkOrganizationCanMutate();
  if (!mutateCheck.allowed) return { ok: null, error: mutateCheck.error };
  return {
    ok: { organizationId: access.org.organizationId, roleCode: access.org.roleCode },
    error: null,
  };
}

async function currentUserId(): Promise<string | null> {
  const supabase = await createServerClient();
  return (await supabase.auth.getUser()).data.user?.id ?? null;
}

type MetadataFields = {
  title: string;
  evidence_type: string;
  description: string | null;
  document_date: string | null;
  issuer: string | null;
  reference_code: string | null;
  valid_from: string | null;
  valid_until: string | null;
};

function parseMetadata(formData: FormData):
  | { fields: MetadataFields; error: null }
  | { fields: null; error: string } {
  const title = validateCatalogName(formData.get("title"));
  if (title.name === null) return { fields: null, error: title.error };
  const evidenceType = String(formData.get("evidenceType") ?? "");
  if (!isOneOf(TEXTILE_EVIDENCE_TYPES, evidenceType)) {
    return { fields: null, error: "Tipo de evidencia no válido." };
  }
  const validFrom = cleanText(formData.get("validFrom") as string | null);
  const validUntil = cleanText(formData.get("validUntil") as string | null);
  if (validFrom && validUntil && validFrom > validUntil) {
    return { fields: null, error: "La vigencia inicial no puede ser posterior a la final." };
  }
  return {
    fields: {
      title: title.name,
      evidence_type: evidenceType,
      description: cleanText(formData.get("description") as string | null),
      document_date: cleanText(formData.get("documentDate") as string | null),
      issuer: cleanText(formData.get("issuer") as string | null),
      reference_code: cleanText(formData.get("referenceCode") as string | null),
      valid_from: validFrom,
      valid_until: validUntil,
    },
    error: null,
  };
}

// ---------------------------------------------------------------------------
// T9E.1/T9E.2 · Carga DIRECTA a Storage en tres fases. Los BYTES del
// archivo JAMÁS atraviesan una Server Action, Route Handler ni función
// serverless:
//   A) beginTextileEvidenceUploadAction — valida TODA la metadata funcional
//      (parseMetadata, mismo dominio) Y el archivo declarado ANTES de que
//      exista autorización de subida; la RPC begin (0097) re-valida, guarda
//      la metadata CANÓNICA en el intento y construye la ruta EXACTA en
//      servidor; después se emite la signed upload URL (sesión del usuario).
//   B) el NAVEGADOR sube directo al bucket privado con esa URL firmada.
//   C) finalizeTextileEvidenceUploadAction(intentId) — SIN metadata del
//      cliente: verifica el objeto REAL (tamaño + Content-Type + FIRMA
//      BINARIA descargando los bytes desde Storage) y llama la RPC ATÓMICA
//      finalize (0097): insert de la evidencia + consumo del intento en UNA
//      transacción, idempotente, con el resultado SIEMPRE comprobado.
// ---------------------------------------------------------------------------

const UPLOAD_ROLE_ERROR =
  "Tu rol no permite cargar evidencias (requiere administrador, calidad o consultor).";

/** Limpieza OPORTUNISTA, acotada (máx. `limit`) y RECUPERABLE (T9E.2):
 * solo intentos vencidos DEL PROPIO USUARIO (la RLS limita el SELECT al
 * creador); un intento pasa a 'expired' ÚNICAMENTE cuando Storage confirma
 * el retiro del objeto — si el retiro falla, la RPC registra el fallo
 * (contador + fecha) y el intento SIGUE siendo candidato en la próxima
 * pasada. Jamás se toca un objeto cuya ruta pertenezca a una evidencia
 * real, ni intentos consumidos. Nunca degrada la petición principal; el
 * barrido org-completo corresponde al script administrativo. */
async function cleanupExpiredUploadIntents(
  organizationId: string,
  actorId: string,
  limit = 3
): Promise<void> {
  try {
    const expired = await listExpiredPendingTextileUploadIntents(organizationId, limit);
    for (const intent of expired) {
      // Barrera: jamás retirar el archivo de una evidencia registrada.
      if (await textileEvidenceExistsForPath(organizationId, intent.objectPath)) {
        await recordTextileUploadIntentCleanupRpc(actorId, intent.id, false);
        continue;
      }
      const removed = await removeTextileEvidenceObject(intent.id);
      await recordTextileUploadIntentCleanupRpc(actorId, intent.id, removed);
    }
    // T9E.3 · Subida TARDÍA: el token firmado (~2 h) sobrevive al TTL del
    // intento y NO es de un solo uso tras un remove — si un objeto
    // reapareció en la ruta de un intento YA expirado (y sin evidencia),
    // se retira de nuevo. El intento jamás vuelve a ser finalizable.
    const recentlyExpired = await listRecentlyExpiredTextileUploadIntents(
      organizationId,
      TEXTILE_EVIDENCE_UPLOAD_TOKEN_GRACE_HOURS,
      2
    );
    for (const intent of recentlyExpired) {
      if (intent.evidenceId) continue;
      if (await textileEvidenceExistsForPath(organizationId, intent.objectPath)) continue;
      const info = await getTextileEvidenceObjectInfo(intent.objectPath);
      if (info) {
        await removeTextileEvidenceObject(intent.id);
      }
    }
  } catch {
    // Best-effort: la limpieza nunca bloquea la operación principal.
  }
}


/** Traducción SEGURA de los códigos internos de las RPCs 0097 a mensajes
 * accionables (jamás errores SQL crudos al usuario). */
function beginErrorMessage(code: string): string {
  if (code.includes("METADATA_TITLE_INVALID")) return "El nombre es obligatorio.";
  if (code.includes("METADATA_TYPE_INVALID")) return "Tipo de evidencia no válido.";
  if (code.includes("METADATA_DATE_INVALID")) return "Alguna fecha no tiene un formato válido (AAAA-MM-DD).";
  if (code.includes("METADATA_VALIDITY_INVALID")) {
    return "La vigencia inicial no puede ser posterior a la final.";
  }
  if (code.includes("FILE_SIZE_INVALID")) {
    return `El archivo supera el tamaño máximo permitido (${TEXTILE_EVIDENCE_MAX_FILE_MB} MB).`;
  }
  if (code.includes("FILE_MIME_INVALID")) {
    return "Tipo de archivo no permitido (PDF, imagen, Word, Excel o CSV).";
  }
  if (code.includes("FILE_EXTENSION_INVALID")) {
    return "Extensión de archivo no permitida (.pdf, .png, .jpg, .jpeg, .webp, .docx, .xlsx o .csv).";
  }
  if (code.includes("ROLE_NOT_ALLOWED")) return UPLOAD_ROLE_ERROR;
  return "No fue posible iniciar la carga. Intenta de nuevo.";
}

export type BeginTextileEvidenceUploadInput = {
  fileName: string;
  fileSizeBytes: number;
  fileMimeType: string;
  /** T9E.2: TODA la metadata funcional viaja en begin (mismo dominio que
   * parseMetadata) y queda CANÓNICA e inmutable en el intento — los errores
   * funcionales se detectan ANTES de subir un solo byte. */
  metadata: FormData;
};

export type BeginTextileEvidenceUploadResult =
  | { error: string; intentId: null; objectPath: null; token: null; signedUrl: null }
  | { error: null; intentId: string; objectPath: string; token: string; signedUrl: string };

export async function beginTextileEvidenceUploadAction(
  input: BeginTextileEvidenceUploadInput
): Promise<BeginTextileEvidenceUploadResult> {
  const fail = (error: string): BeginTextileEvidenceUploadResult => ({
    error,
    intentId: null,
    objectPath: null,
    token: null,
    signedUrl: null,
  });

  const g = await gate();
  if (!g.ok) return fail(g.error ?? "Sin acceso.");
  if (!canUploadTextileEvidence(g.ok.roleCode)) return fail(UPLOAD_ROLE_ERROR);

  // T9E.2 · La METADATA FUNCIONAL se valida PRIMERO (mismo esquema de
  // dominio que usaba la finalización): título, tipo, fechas y vigencias
  // inválidas se rechazan antes de emitir cualquier autorización de subida.
  const metadata = parseMetadata(input.metadata);
  if (metadata.fields === null) return fail(metadata.error);

  // Validación DECLARADA del archivo (la finalización re-verifica contra
  // Storage y contra la FIRMA BINARIA) con la misma regla pura que
  // pre-valida el cliente (validateTextileEvidenceFile).
  const fileName = cleanText(input.fileName);
  if (!fileName) return fail("El archivo es obligatorio.");
  const declaredMime = String(input.fileMimeType ?? "");
  const declaredSize = Number(input.fileSizeBytes ?? 0);
  if (!Number.isFinite(declaredSize) || declaredSize <= 0) {
    return fail("El archivo es obligatorio.");
  }
  if (!isAllowedTextileEvidenceMime(declaredMime)) {
    return fail("Tipo de archivo no permitido (PDF, imagen, Word, Excel o CSV).");
  }
  if (!isAllowedTextileEvidenceExtension(fileName)) {
    return fail(
      "Extensión de archivo no permitida (.pdf, .png, .jpg, .jpeg, .webp, .docx, .xlsx o .csv)."
    );
  }
  if (declaredSize > TEXTILE_EVIDENCE_MAX_FILE_BYTES) {
    return fail(`El archivo supera el tamaño máximo permitido (${TEXTILE_EVIDENCE_MAX_FILE_MB} MB).`);
  }
  const declared = { name: fileName, type: declaredMime, size: declaredSize };

  const storageCheck = await checkStorageAvailable(declared.size);
  if (!storageCheck.allowed) return fail(storageCheck.error ?? "Sin almacenamiento disponible.");

  const actorId = await currentUserId();
  if (!actorId) return fail("Sesión no válida.");

  // Limpieza oportunista acotada de intentos vencidos de ESTA organización
  // (solo los del propio usuario: la RLS de 0097 limita el SELECT al creador).
  await cleanupExpiredUploadIntents(g.ok.organizationId, actorId);

  // T9E.2 · El intento nace por la RPC de 0097: re-valida rol, archivo y
  // metadata en BD, guarda la metadata CANÓNICA (inmutable, guard) y
  // construye la RUTA EXACTA {org}/textiles/{intent}/{safe} en servidor —
  // el cliente jamás envía rutas (id criptográficamente aleatorio en BD;
  // ese id se convierte en el id de la evidencia y la ruta cumple 0077).
  const begun = await beginTextileEvidenceUploadRpc({
    organizationId: g.ok.organizationId,
    fileName,
    fileSizeBytes: declared.size,
    fileMimeType: declared.type,
    metadata: metadata.fields,
    ttlMinutes: TEXTILE_EVIDENCE_UPLOAD_INTENT_TTL_MINUTES,
  });
  if (begun.errorCode !== null) {
    return fail(beginErrorMessage(begun.errorCode));
  }
  const intentId = begun.intentId;
  const objectPath = begun.objectPath;

  // Signed upload URL para la ruta EXACTA, emitida con la sesión del
  // usuario (la política insert de storage 0015/0016 decide). El token
  // viaja una sola vez y NO se almacena.
  const signed = await createTextileEvidenceSignedUploadUrl(objectPath);
  if (!signed) {
    await markTextileEvidenceUploadFailedRpc(intentId);
    return fail("No fue posible autorizar la carga. Intenta de nuevo.");
  }

  return {
    error: null,
    intentId,
    objectPath,
    token: signed.token,
    signedUrl: signed.signedUrl,
  };
}

export async function finalizeTextileEvidenceUploadAction(
  intentId: string
): Promise<TextileEvidenceActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canUploadTextileEvidence(g.ok.roleCode)) return { error: UPLOAD_ROLE_ERROR };

  const cleanIntentId = cleanText(intentId);
  if (!cleanIntentId) return { error: "El intento de carga no es válido." };

  // El intento se lee bajo RLS (0097: solo el CREADOR lo ve) y por la
  // organización ACTIVA del servidor. La metadata funcional YA vive en el
  // intento (validada en begin): esta acción no acepta otra versión.
  const intent = await getTextileEvidenceUploadIntent(g.ok.organizationId, cleanIntentId);
  if (!intent) return { error: "El intento de carga no existe o no pertenece a tu organización." };

  const userId = await currentUserId();
  if (!userId || intent.createdBy !== userId) {
    return { error: "El intento de carga pertenece a otro usuario." };
  }

  if (intent.status === "failed" || intent.status === "expired") {
    return { error: "El intento de carga ya no es válido. Sube el archivo de nuevo." };
  }
  if (intent.status === "pending" && isTextileUploadIntentExpired(intent.expiresAt)) {
    // Limpieza RECUPERABLE: solo se cierra si Storage confirma el retiro;
    // si falla, la RPC registra el fallo y el intento sigue como candidato.
    const removed = await removeTextileEvidenceObject(intent.id);
    await recordTextileUploadIntentCleanupRpc(userId, intent.id, removed);
    return { error: "El intento de carga expiró. Sube el archivo de nuevo." };
  }

  // Defensa en profundidad idéntica a la firma de descargas: la ruta del
  // intento siempre vive bajo el prefijo de la organización activa (el
  // CHECK de ruta EXACTA de 0097 lo garantiza además en BD).
  if (!isTextileEvidencePathForOrg(intent.objectPath, g.ok.organizationId)) {
    return { error: "La ruta del archivo no es válida." };
  }

  // (1) Metadata REAL del objeto en Storage: tamaño y Content-Type
  // almacenado. OJO: ese Content-Type proviene del header del PUT del
  // navegador — por eso NO basta y sigue la verificación de firma.
  const objectInfo = await getTextileEvidenceObjectInfo(intent.objectPath);
  const objectError = validateTextileEvidenceUploadedObject({
    expectedSizeBytes: intent.expectedSizeBytes,
    expectedMimeType: intent.expectedMimeType,
    realSizeBytes: objectInfo?.sizeBytes ?? null,
    realMimeType: objectInfo?.mimeType ?? null,
  });
  if (objectError) {
    if (intent.status === "pending") {
      if (objectInfo) {
        await removeTextileEvidenceObject(intent.id);
      }
      await markTextileEvidenceUploadFailedRpc(intent.id);
    }
    return { error: objectError };
  }

  // (2) T9E.2 · FIRMA BINARIA: el servidor descarga los bytes REALES desde
  // Storage (≤ 20 MB, ya verificado) y exige que extensión, MIME declarado,
  // Content-Type almacenado y firma detectada correspondan al MISMO tipo.
  // El archivo JAMÁS viaja por la Server Action: viene de Storage.
  if (intent.status === "pending") {
    const bytes = await downloadTextileEvidenceObjectBytes(intent.objectPath);
    if (!bytes) {
      return { error: "No fue posible verificar el archivo subido. Intenta de nuevo." };
    }
    const signatureError = validateTextileEvidenceBinarySignature({
      bytes,
      fileName: intent.safeFilename,
      declaredMimeType: intent.expectedMimeType,
      storedContentType: objectInfo?.mimeType ?? null,
    });
    if (signatureError) {
      // Contenido que no corresponde al tipo declarado: se retira el objeto
      // (si el retiro falla, el intento failed conserva la ruta como
      // candidato recuperable de limpieza) y el intento queda failed.
      await removeTextileEvidenceObject(intent.id);
      await markTextileEvidenceUploadFailedRpc(intent.id);
      return { error: signatureError };
    }
  }

  // (3) T9E.2 · FINALIZACIÓN ATÓMICA (RPC 0097): insert de la evidencia +
  // consumo del intento en UNA transacción con FOR UPDATE. Idempotente:
  // un doble clic devuelve el MISMO evidence_id sin duplicados. El
  // resultado se comprueba SIEMPRE — jamás se ignora el consumo.
  const finalized = await finalizeTextileEvidenceUploadRpc(
    userId,
    intent.id,
    objectInfo?.sizeBytes ?? intent.expectedSizeBytes,
    objectInfo?.mimeType ?? intent.expectedMimeType
  );
  if (finalized.errorCode !== null) {
    return { error: finalizeErrorMessage(finalized.errorCode) };
  }

  revalidatePath(EVIDENCES_PATH);
  return { error: null };
}

/** Traducción SEGURA de los códigos de la RPC atómica a mensajes útiles. */
function finalizeErrorMessage(code: string): string {
  if (code.includes("INTENT_EXPIRED")) return "El intento de carga expiró. Sube el archivo de nuevo.";
  if (code.includes("INTENT_NOT_PENDING") || code.includes("INTENT_CONSUMED_INCONSISTENT")) {
    return "El intento de carga ya no es válido. Sube el archivo de nuevo.";
  }
  if (code.includes("INTENT_NOT_OWNED")) return "El intento de carga pertenece a otro usuario.";
  if (code.includes("INTENT_NOT_FOUND")) {
    return "El intento de carga no existe o no pertenece a tu organización.";
  }
  if (code.includes("OBJECT_SIZE_MISMATCH")) {
    return "El archivo subido no coincide con el declarado (tamaño). Sube el archivo de nuevo.";
  }
  if (code.includes("OBJECT_MIME_MISMATCH")) {
    return "El archivo subido no coincide con el declarado (tipo). Sube el archivo de nuevo.";
  }
  if (code.includes("INTENT_WITHOUT_METADATA")) {
    return "El intento de carga no tiene metadata válida. Sube el archivo de nuevo.";
  }
  if (code.includes("ROLE_NOT_ALLOWED")) return UPLOAD_ROLE_ERROR;
  return "No fue posible registrar la evidencia.";
}

// ---------------------------------------------------------------------------
// Editar metadatos (consultant solo pendientes: lo exige el trigger).
// T5.2: esta action solo envía los campos de parseMetadata — jamás
// file_path/file_name/file_mime_type/file_size_bytes, que además son
// INMUTABLES en BD tras la creación (trigger
// protect_textile_evidence_file_metadata, 0077). La única escritura de esos
// campos ocurre en finalizeTextileEvidenceUploadAction (T9E.1).
// ---------------------------------------------------------------------------

export async function updateTextileEvidenceAction(
  evidenceId: string,
  formData: FormData
): Promise<TextileEvidenceActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };

  const metadata = parseMetadata(formData);
  if (metadata.fields === null) return { error: metadata.error };

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("textile_evidences")
    .update({ ...metadata.fields, updated_by: await currentUserId() })
    .eq("id", evidenceId)
    .eq("organization_id", g.ok.organizationId)
    .select("id");
  if (error || !data || data.length === 0) {
    return { error: "No fue posible actualizar la evidencia (verifica tu rol o su estado)." };
  }
  revalidatePath(EVIDENCES_PATH);
  revalidatePath(`${EVIDENCES_PATH}/${evidenceId}`);
  return { error: null };
}

// ---------------------------------------------------------------------------
// Revisión interna de estado (solo admin/quality; el trigger re-verifica)
// ---------------------------------------------------------------------------

export async function updateTextileEvidenceStatusAction(
  evidenceId: string,
  status: string,
  reviewNotes?: string
): Promise<TextileEvidenceActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };

  if (!isOneOf(TEXTILE_EVIDENCE_STATUSES, status)) {
    return { error: "Estado de evidencia no válido." };
  }
  // Regla de roles en servidor (el trigger SQL la re-aplica): la revisión
  // interna es de admin/quality; consultant nunca acepta ni rechaza.
  if (!canSetTextileEvidenceStatus(g.ok.roleCode)) {
    return { error: "Solo administrador o calidad pueden cambiar el estado de una evidencia." };
  }

  const supabase = await createServerClient();
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from("textile_evidences")
    .update({
      status,
      review_notes: cleanText(reviewNotes),
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
      updated_by: userId,
    })
    .eq("id", evidenceId)
    .eq("organization_id", g.ok.organizationId)
    .select("id");
  if (error || !data || data.length === 0) {
    return { error: "No fue posible cambiar el estado de la evidencia." };
  }
  revalidatePath(EVIDENCES_PATH);
  revalidatePath(`${EVIDENCES_PATH}/${evidenceId}`);
  return { error: null };
}

/** Archivar = estado interno 'archived' (misma regla de roles). */
export async function archiveTextileEvidenceAction(
  evidenceId: string
): Promise<TextileEvidenceActionState> {
  return updateTextileEvidenceStatusAction(evidenceId, "archived");
}

// ---------------------------------------------------------------------------
// Signed URL (apertura segura; nunca URLs públicas permanentes)
// ---------------------------------------------------------------------------

export async function getTextileEvidenceSignedUrlAction(
  evidenceId: string
): Promise<{ url: string | null; error: string | null }> {
  const g = await gate();
  if (!g.ok) return { url: null, error: g.error };

  const evidence = await getTextileEvidence(g.ok.organizationId, evidenceId);
  if (!evidence) return { url: null, error: "La evidencia no existe o no pertenece a tu organización." };

  // T5.1 (defensa en profundidad): jamás firmar una ruta fuera del prefijo
  // {organización}/textiles/ — aunque file_path siempre lo escribe el
  // servidor, un dato corrupto nunca debe convertirse en un enlace válido
  // hacia archivos de otra organización o de CPR.
  if (!isTextileEvidencePathForOrg(evidence.filePath, g.ok.organizationId)) {
    return { url: null, error: "La ruta del archivo no es válida." };
  }

  const url = await getTextileEvidenceSignedUrl(evidence.filePath);
  if (!url) return { url: null, error: "No fue posible generar el enlace del archivo." };
  return { url, error: null };
}

// ---------------------------------------------------------------------------
// Vínculos evidencia ↔ entidad textil
// ---------------------------------------------------------------------------

export type TextileEvidenceLinkInput = {
  entityType: string;
  entityId: string;
  linkType: string;
  notes?: string;
};

export async function addTextileEvidenceLinkAction(
  evidenceId: string,
  input: TextileEvidenceLinkInput
): Promise<TextileEvidenceActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };

  if (!isOneOf(TEXTILE_EVIDENCE_ENTITY_TYPES, input.entityType)) {
    return { error: "Tipo de entidad no válido." };
  }
  if (!isOneOf(TEXTILE_EVIDENCE_LINK_TYPES, input.linkType)) {
    return { error: "Tipo de vínculo no válido." };
  }
  // T5.1: los vínculos siguen los mismos roles de escritura (RLS 0076).
  if (!canUploadTextileEvidence(g.ok.roleCode)) {
    return { error: "Tu rol no permite vincular evidencias (requiere administrador, calidad o consultor)." };
  }
  const entityId = cleanText(input.entityId);
  if (!entityId) return { error: "Selecciona la entidad a vincular." };
  if (!(await textileEvidenceBelongsToOrg(g.ok.organizationId, evidenceId))) {
    return { error: "La evidencia no existe o no pertenece a tu organización." };
  }
  if (!(await textileEntityBelongsToOrg(g.ok.organizationId, input.entityType, entityId))) {
    return { error: "La entidad seleccionada no es válida para tu organización." };
  }

  const supabase = await createServerClient();
  const { error } = await supabase.from("textile_evidence_links").insert({
    organization_id: g.ok.organizationId,
    evidence_id: evidenceId,
    entity_type: input.entityType,
    entity_id: entityId,
    link_type: input.linkType,
    notes: cleanText(input.notes),
  });
  if (isUniqueViolation(error)) {
    return { error: "Esa entidad ya está vinculada con ese tipo de vínculo." };
  }
  if (error) return { error: "No fue posible crear el vínculo." };
  revalidatePath(`${EVIDENCES_PATH}/${evidenceId}`);
  revalidatePath(EVIDENCES_PATH);
  return { error: null };
}

export async function removeTextileEvidenceLinkAction(
  linkId: string,
  evidenceId: string
): Promise<TextileEvidenceActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("textile_evidence_links")
    .delete()
    .eq("id", linkId)
    .eq("organization_id", g.ok.organizationId)
    .eq("evidence_id", evidenceId)
    .select("id");
  if (error || !data || data.length === 0) {
    return { error: "No fue posible quitar el vínculo (verifica tu rol en la organización)." };
  }
  revalidatePath(`${EVIDENCES_PATH}/${evidenceId}`);
  revalidatePath(EVIDENCES_PATH);
  return { error: null };
}
