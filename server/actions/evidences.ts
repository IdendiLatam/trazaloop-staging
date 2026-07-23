"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { requireSession } from "@/lib/auth/require-session";
import { removeQueuedStorageObject } from "@/lib/db/storage-deletion";
import { checkCprResourceLimit, checkCprStorageAvailable, checkCprCanMutate } from "@/server/actions/module-plans";
import {
  beginCprStorageUpload,
  finalizeEvidenceAttachmentServer,
  getOwnCprUploadIntent,
} from "@/lib/db/storage-intents";
import {
  verifyCprUploadedObject,
  compensateFailedCprUpload,
} from "@/server/actions/cpr-upload-verification";

export type EvidenceActionState = { error: string | null; warning?: string | null };

/**
 * Crea una evidencia y, si viene archivo, lo sube al bucket privado con la
 * ruta {organization_id}/{evidence_id}/{filename}. La subida usa la SESIÓN
 * DEL USUARIO (RLS de Storage aplica); nunca service_role.
 */
/**
 * T9F.5B.1 · CARGA DIRECTA (bloqueador 2) · Tipos del contrato begin/finalize.
 *
 * El archivo YA NO viaja dentro de FormData hacia ninguna Server Action: el
 * navegador sube los bytes DIRECTAMENTE a Supabase Storage con su sesión
 * autenticada, contra la ruta EXACTA que reservó el intent (y que la política
 * de Storage ligada a intent, 0101 §12, es la única que autoriza).
 *
 * Esto era además imprescindible para A14: con el límite por defecto de
 * Server Actions (1 MB), un TrazaDocs Full de 22 MB jamás llegaba a `begin`.
 * `next.config.ts` NO eleva `serverActions.bodySizeLimit`.
 */
export type BeginEvidenceUploadInput = {
  name: string;
  evidenceType: string | null;
  evidenceDate: string | null;
  responsible: string | null;
  observations: string | null;
  validUntil: string | null;
  /** Metadata del archivo — NUNCA sus bytes. */
  file: { name: string; sizeBytes: number; mimeType: string } | null;
  idempotencyKey?: string | null;
};

export type BeginEvidenceUploadResult =
  | {
      error: null;
      evidenceId: string;
      upload: { intentId: string; bucketId: string; objectPath: string } | null;
    }
  | { error: string; evidenceId: null; upload: null };

/**
 * (A) BEGIN · Solo metadata. Autentica, valida acceso comercial, crea la fila
 * de dominio y —si hay archivo— la reserva durable, devolviendo la ruta EXACTA
 * a la que el cliente debe subir.
 */
export async function beginEvidenceUploadAction(
  input: BeginEvidenceUploadInput
): Promise<BeginEvidenceUploadResult> {
  const org = await requireActiveOrg();
  await requireSession();
  const supabase = await createServerClient();

  const name = input.name.trim();
  if (!name) return { error: "El nombre de la evidencia es obligatorio.", evidenceId: null, upload: null };

  const mutateCheck = await checkCprCanMutate();
  if (!mutateCheck.allowed) {
    return { error: mutateCheck.error ?? "El módulo no permite crear evidencias.", evidenceId: null, upload: null };
  }
  const limitCheck = await checkCprResourceLimit("evidences");
  if (!limitCheck.allowed) {
    return { error: limitCheck.error ?? "Tu plan alcanzó el límite de evidencias.", evidenceId: null, upload: null };
  }
  if (input.file) {
    const storageCheck = await checkCprStorageAvailable(input.file.sizeBytes);
    if (!storageCheck.allowed) {
      return { error: storageCheck.error ?? "No hay capacidad de almacenamiento disponible.", evidenceId: null, upload: null };
    }
  }

  const { data: inserted, error } = await supabase
    .from("evidences")
    .insert({
      organization_id: org.organizationId,
      name,
      evidence_type: input.evidenceType,
      evidence_date: input.evidenceDate,
      responsible: input.responsible,
      observations: input.observations,
      valid_until: input.validUntil,
    })
    .select("id")
    .single();
  if (error || !inserted) return { error: "No fue posible crear la evidencia.", evidenceId: null, upload: null };

  if (!input.file) {
    revalidatePath("/evidences");
    return { error: null, evidenceId: inserted.id as string, upload: null };
  }

  // T9F.4 · §11-§13: RESERVA DURABLE antes de subir un solo byte. La RUTA la
  // decide la BASE desde la fila de dominio; el navegador jamás la propone.
  const begin = await beginCprStorageUpload({
    resourceType: "evidence",
    resourceId: inserted.id as string,
    fileName: input.file.name,
    fileSizeBytes: input.file.sizeBytes,
    fileMimeType: input.file.mimeType || "application/octet-stream",
    idempotencyKey: input.idempotencyKey ?? null,
  });
  if (!begin.intent) {
    revalidatePath("/evidences");
    return {
      error: `La evidencia se creó, pero el archivo no pudo reservarse: ${begin.error ?? "intenta adjuntarlo de nuevo."}`,
      evidenceId: null,
      upload: null,
    };
  }

  revalidatePath("/evidences");
  return {
    error: null,
    evidenceId: inserted.id as string,
    upload: {
      intentId: begin.intent.intentId,
      bucketId: begin.intent.bucketId,
      objectPath: begin.intent.objectPath,
    },
  };
}

/**
 * (C) FINALIZE · Recibe SOLO el intentId. No acepta tamaño, MIME, bucket ni
 * ruta del cliente: todo se deriva del intent y del objeto FÍSICO real.
 */
export async function finalizeEvidenceUploadAction(
  intentId: string
): Promise<EvidenceActionState> {
  const org = await requireActiveOrg();
  const { user } = await requireSession();

  const intent = await getOwnCprUploadIntent(intentId, user.id, org.organizationId);
  if (!intent) return { error: "La reserva de subida no existe o no pertenece a tu sesión." };
  if (intent.resourceType !== "evidence") return { error: "La reserva de subida no corresponde a una evidencia." };

  const verification = await verifyCprUploadedObject({
    bucketId: intent.bucketId,
    objectPath: intent.objectPath,
    expectedSizeBytes: intent.expectedSizeBytes,
    expectedMimeType: intent.expectedMimeType,
  });
  if (verification.error !== null) {
    await compensateFailedCprUpload(intent);
    revalidatePath("/evidences");
    return { error: verification.error };
  }

  const finalized = await finalizeEvidenceAttachmentServer({
    actorId: user.id,
    intentId: intent.intentId,
    realSizeBytes: verification.sizeBytes,
    realMimeType: verification.mimeType,
  });
  if (!finalized.ok) {
    const resolution = await compensateFailedCprUpload(intent);
    revalidatePath("/evidences");
    return {
      error: resolution.resolved
        ? `El archivo no pudo registrarse (${finalized.error ?? "error desconocido"}) y fue retirado. Intenta adjuntarlo de nuevo.`
        : "El archivo no pudo registrarse: quedó pendiente de retiro físico y seguirá contando en tu almacenamiento hasta completarse la limpieza.",
    };
  }

  revalidatePath("/evidences");
  return { error: null };
}

/** Cancelación explícita (abandono o fallo del PUT) — compensación completa. */
export async function cancelEvidenceUploadAction(intentId: string): Promise<EvidenceActionState> {
  const org = await requireActiveOrg();
  const { user } = await requireSession();
  const intent = await getOwnCprUploadIntent(intentId, user.id, org.organizationId);
  if (!intent) return { error: null }; // nada que cancelar: idempotente
  await compensateFailedCprUpload(intent);
  revalidatePath("/evidences");
  return { error: null };
}

/** Mensajes de trigger conocidos que sí se muestran tal cual al usuario. */
const KNOWN_DB_MESSAGES = [
  "Solo administrador o calidad pueden marcar una evidencia como válida",
  "Solo administrador o calidad pueden cambiar el estado de una evidencia validada",
  "Solo administrador o calidad pueden cambiar el archivo de una evidencia validada",
  "Una evidencia validada no puede ser modificada por este rol",
  "Una evidencia validada no puede eliminarse",
];

function evidenceErrorMessage(raw: string | undefined, fallback: string): string {
  if (raw) {
    const known = KNOWN_DB_MESSAGES.find((m) => raw.includes(m));
    if (known) return `${known}.`;
  }
  return fallback;
}

/**
 * Marca una evidencia como válida. El TRIGGER de base de datos garantiza que
 * solo admin/quality pueden hacerlo, aunque se manipule la petición.
 * Devuelve estado con mensaje claro; no oculta errores de base de datos.
 */
export async function validateEvidenceAction(
  _prev: EvidenceActionState,
  formData: FormData
): Promise<EvidenceActionState> {
  const org = await requireActiveOrg();
  const mutateCheck = await checkCprCanMutate();
  if (!mutateCheck.allowed) return { error: mutateCheck.error };
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("evidences")
    .update({ status: "valid" })
    .eq("id", String(formData.get("id") ?? ""))
    .eq("organization_id", org.organizationId)
    .select("id");

  if (error) {
    return {
      error: evidenceErrorMessage(
        error.message,
        "No fue posible validar la evidencia. Solo administrador o calidad pueden validarla."
      ),
    };
  }
  if ((data ?? []).length === 0) {
    return { error: "No se encontró la evidencia o no tienes permiso para validarla." };
  }

  revalidatePath("/evidences");
  return { error: null };
}

/**
 * Elimina una evidencia. RLS (solo admin/quality y nunca validadas) + trigger
 * de integridad. Devuelve estado con mensaje claro.
 */
export async function deleteEvidenceAction(
  _prev: EvidenceActionState,
  formData: FormData
): Promise<EvidenceActionState> {
  // La sesión y la organización activa siguen siendo requisito de entrada;
  // la autorización REAL del borrado la aplica la RPC (espejo de la RLS).
  await requireActiveOrg();
  const mutateCheck = await checkCprCanMutate();
  if (!mutateCheck.allowed) return { error: mutateCheck.error };
  const supabase = await createServerClient();

  // T9F.3 · §18: la RPC atómica queue_and_delete_evidence (0101 §3) encola
  // el objeto físico como pending_delete (con su tamaño REAL, o NULL si es
  // desconocido) Y elimina la fila en UNA transacción — la marca nace ANTES
  // de perder la referencia. La autorización es el ESPEJO exacto de la
  // política RLS de DELETE y el guard de integridad sigue vigente.
  const { data, error } = await supabase.rpc("queue_and_delete_evidence", {
    p_evidence_id: String(formData.get("id") ?? ""),
  });

  if (error) {
    const denied =
      error.message.includes("DELETE_NOT_ALLOWED") || error.message.includes("EVIDENCE_NOT_FOUND");
    return {
      error: denied
        ? "No se eliminó: la evidencia no existe, está validada o tu rol no permite eliminarla."
        : evidenceErrorMessage(error.message, "No fue posible eliminar la evidencia."),
    };
  }
  const payload = data as { deleted?: unknown; object?: { bucket_id?: unknown; object_path?: unknown } | null } | null;
  if (!payload || payload.deleted !== true) {
    return { error: "No fue posible eliminar la evidencia." };
  }

  // Fila fuera y objeto encolado. El retiro físico es server-only y se
  // CONFIRMA en la cola: deleted libera cuota; delete_failed sigue contando.
  let pendingRemoval = false;
  const queued = payload.object;
  if (queued && queued.bucket_id === "evidences" && typeof queued.object_path === "string") {
    const { removed } = await removeQueuedStorageObject({
      bucketId: "evidences",
      objectPath: queued.object_path,
    });
    if (!removed) pendingRemoval = true;
  }

  revalidatePath("/evidences");
  if (pendingRemoval) {
    return {
      error:
        "La evidencia se eliminó, pero su archivo quedó pendiente de retiro físico y seguirá contando en tu almacenamiento hasta completarse la limpieza.",
    };
  }
  return { error: null };
}

/**
 * Asocia una evidencia a un destino de la MISMA empresa.
 * Sprint 2: supplier, material, product, product_family (y site).
 * El trigger de base de datos bloquea cruces entre empresas.
 */
export async function linkEvidenceAction(
  _prev: EvidenceActionState,
  formData: FormData
): Promise<EvidenceActionState> {
  const org = await requireActiveOrg();
  const mutateCheck = await checkCprCanMutate();
  if (!mutateCheck.allowed) return { error: mutateCheck.error };
  const supabase = await createServerClient();

  const evidenceId = String(formData.get("evidence_id") ?? "");
  const targetType = String(formData.get("target_type") ?? "");
  const targetId = String(formData.get("target_id") ?? "");
  // Tipo de vínculo (Sprint 5C fix): 'general' solo crea evidence_links;
  // 'material_origin' / 'material_reclassification' ADEMÁS actualizan el
  // campo del material que el motor de cálculo exige. El enlace genérico
  // jamás sustituye silenciosamente al campo (regla del motor intacta).
  const linkKind = String(formData.get("link_kind") ?? "general");
  const linkRoleInput = String(formData.get("link_role") ?? "").trim() || null;

  const allowed = [
    "supplier",
    "material",
    "product",
    "product_family",
    "site",
    "input_batch",
    "production_order",
    "output_batch",
  ];
  if (!evidenceId || !targetId || !allowed.includes(targetType)) {
    return { error: "Selecciona la evidencia y el destino a asociar." };
  }
  const isSupportKind =
    linkKind === "material_origin" || linkKind === "material_reclassification";
  if (isSupportKind && targetType !== "material") {
    return {
      error:
        "El soporte de origen o de reclasificación solo aplica cuando el destino es un material.",
    };
  }

  // Multiempresa EXPLÍCITO: la evidencia debe ser de la empresa activa.
  const { data: evidence } = await supabase
    .from("evidences")
    .select("id, status")
    .eq("id", evidenceId)
    .eq("organization_id", org.organizationId)
    .maybeSingle();
  if (!evidence) {
    return { error: "La evidencia no pertenece a tu empresa activa." };
  }

  // Y el material también, cuando el vínculo es de soporte.
  let material: { id: string; reclassified_to_code: string | null } | null = null;
  if (isSupportKind) {
    const { data } = await supabase
      .from("materials")
      .select("id, reclassified_to_code")
      .eq("id", targetId)
      .eq("organization_id", org.organizationId)
      .maybeSingle();
    material = data;
    if (!material) {
      return { error: "El material no pertenece a tu empresa activa." };
    }
    if (linkKind === "material_reclassification" && material.reclassified_to_code === null) {
      return {
        error:
          "El material no está reclasificado. Reclasifícalo primero en Catálogos → Materiales y luego asocia aquí su soporte de reclasificación.",
      };
    }
  }

  const linkRole =
    linkRoleInput ??
    (linkKind === "material_origin"
      ? "soporte de origen del material"
      : linkKind === "material_reclassification"
        ? "soporte de reclasificación del material"
        : null);

  // Crear/mantener el enlace para trazabilidad y dossier. Un duplicado no
  // debe bloquear la asignación del soporte (crear/MANTENER).
  const { error: linkError } = await supabase.from("evidence_links").insert({
    organization_id: org.organizationId,
    evidence_id: evidenceId,
    target_type: targetType,
    target_id: targetId,
    link_role: linkRole,
  });
  const duplicateLink = linkError?.code === "23505";
  if (linkError && !duplicateLink) {
    return { error: "No fue posible asociar. Verifica que la evidencia y el destino sean de tu empresa." };
  }
  if (linkError && duplicateLink && linkKind === "general") {
    return { error: null, warning: "La evidencia ya estaba asociada a ese destino." };
  }

  // Actualizar el campo del material que el motor de cálculo exige.
  if (linkKind === "material_origin") {
    const { error: updError } = await supabase
      .from("materials")
      .update({ origin_support_evidence_id: evidenceId })
      .eq("id", targetId)
      .eq("organization_id", org.organizationId);
    if (updError) {
      return { error: `No fue posible marcar el soporte de origen: ${updError.message}` };
    }
  } else if (linkKind === "material_reclassification") {
    const { error: updError } = await supabase
      .from("materials")
      .update({ reclassification_evidence_id: evidenceId })
      .eq("id", targetId)
      .eq("organization_id", org.organizationId);
    if (updError) {
      return { error: `No fue posible marcar el soporte de reclasificación: ${updError.message}` };
    }
  }

  revalidatePath("/evidences");
  revalidatePath("/catalog/materials");
  revalidatePath("/guided-flow");

  if (isSupportKind && evidence.status !== "valid") {
    return {
      error: null,
      warning:
        "La evidencia quedó asociada, pero no contará para el cálculo hasta que esté validada.",
    };
  }
  return { error: null };
}
