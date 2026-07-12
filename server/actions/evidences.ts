"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { requireActiveOrg } from "@/lib/auth/require-active-org";

export type EvidenceActionState = { error: string | null };

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

    await supabase
      .from("evidences")
      .update({ storage_path: path })
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
  const supabase = await createServerClient();

  const evidenceId = String(formData.get("evidence_id") ?? "");
  const targetType = String(formData.get("target_type") ?? "");
  const targetId = String(formData.get("target_id") ?? "");
  const linkRole = String(formData.get("link_role") ?? "").trim() || null;

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

  const { error } = await supabase.from("evidence_links").insert({
    organization_id: org.organizationId,
    evidence_id: evidenceId,
    target_type: targetType,
    target_id: targetId,
    link_role: linkRole,
  });

  if (error) {
    return { error: "No fue posible asociar. Verifica que la evidencia y el destino sean de tu empresa." };
  }

  revalidatePath("/evidences");
  return { error: null };
}
