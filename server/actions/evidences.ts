"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { checkResourceLimit, checkStorageAvailable, checkOrganizationCanMutate } from "@/server/actions/plans";

export type EvidenceActionState = { error: string | null; warning?: string | null };

/**
 * Crea una evidencia y, si viene archivo, lo sube al bucket privado con la
 * ruta {organization_id}/{evidence_id}/{filename}. La subida usa la SESIÓN
 * DEL USUARIO (RLS de Storage aplica); nunca service_role.
 */
export async function createEvidenceAction(
  _prev: EvidenceActionState,
  formData: FormData
): Promise<EvidenceActionState> {
  const org = await requireActiveOrg();
  const supabase = await createServerClient();

  const name = String(formData.get("name") ?? "").trim();
  const evidenceType = String(formData.get("evidence_type") ?? "").trim() || null;
  const evidenceDate = String(formData.get("evidence_date") ?? "") || null;
  const responsible = String(formData.get("responsible") ?? "").trim() || null;
  const observations = String(formData.get("observations") ?? "").trim() || null;
  const validUntil = String(formData.get("valid_until") ?? "") || null;
  const file = formData.get("file") as File | null;

  if (!name) return { error: "El nombre de la evidencia es obligatorio." };

  // Sprint 10A (corrección final): chequeo explícito de solo-lectura,
  // además de checkResourceLimit/checkStorageAvailable abajo — mismo
  // resultado (ambos ya revisan el estado del plan primero), pero
  // explícito aquí para que la regla sea uniforme y clara en las 4
  // acciones de este archivo.
  const mutateCheck = await checkOrganizationCanMutate();
  if (!mutateCheck.allowed) return { error: mutateCheck.error };

  // Sprint 10A (Parte 8): límite de plan — Demo permite 1 evidencia.
  const limitCheck = await checkResourceLimit("evidences");
  if (!limitCheck.allowed) return { error: limitCheck.error };

  // Y cuota de almacenamiento, si viene archivo adjunto.
  if (file && file.size > 0) {
    const storageCheck = await checkStorageAvailable(file.size);
    if (!storageCheck.allowed) return { error: storageCheck.error };
  }

  const { data: inserted, error } = await supabase
    .from("evidences")
    .insert({
      organization_id: org.organizationId,
      name,
      evidence_type: evidenceType,
      evidence_date: evidenceDate,
      responsible,
      observations,
      valid_until: validUntil,
    })
    .select("id")
    .single();

  if (error || !inserted) return { error: "No fue posible crear la evidencia." };

  if (file && file.size > 0) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${org.organizationId}/${inserted.id}/${safeName}`;
    const bytes = await file.arrayBuffer();

    const { error: uploadError } = await supabase.storage
      .from("evidences")
      .upload(path, bytes, { contentType: file.type || "application/octet-stream" });

    if (uploadError) {
      return {
        error:
          "La evidencia se creó, pero el archivo no pudo subirse. Intenta adjuntarlo de nuevo.",
      };
    }

    // Sprint 10A (Parte 6): tamaño real del archivo, para medir uso de
    // almacenamiento contra la cuota del plan.
    await supabase
      .from("evidences")
      .update({ storage_path: path, size_bytes: file.size })
      .eq("id", inserted.id)
      .eq("organization_id", org.organizationId);
  }

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
  const mutateCheck = await checkOrganizationCanMutate();
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
  const org = await requireActiveOrg();
  const mutateCheck = await checkOrganizationCanMutate();
  if (!mutateCheck.allowed) return { error: mutateCheck.error };
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("evidences")
    .delete()
    .eq("id", String(formData.get("id") ?? ""))
    .eq("organization_id", org.organizationId)
    .select("id");

  if (error) {
    return {
      error: evidenceErrorMessage(
        error.message,
        "No fue posible eliminar la evidencia."
      ),
    };
  }
  if ((data ?? []).length === 0) {
    return {
      error:
        "No se eliminó: la evidencia no existe, está validada o tu rol no permite eliminarla.",
    };
  }

  revalidatePath("/evidences");
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
  const mutateCheck = await checkOrganizationCanMutate();
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
