"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformStaff } from "@/lib/auth/require-platform-staff";
import { createServerClient } from "@/lib/supabase/server";
import {
  getCampaign, listCampaigns, listConsentDocuments, listSelectableVersions,
  type CampaignRow, type ConsentDocumentOption, type VersionOption,
} from "@/lib/db/public-diagnostics";
import {
  canTransition, evaluateCampaignReadiness, isValidCampaignSlug,
  transitionDeniedMessage, type CampaignStatus,
} from "@/lib/domain/public-diagnostics";
import {
  listSubmissionsPage, type SubmissionRow,
} from "@/lib/db/public-diagnostic-admin";
import type { Page } from "@/lib/db/paged-read";

/**
 * Trazaloop · PUBLIC-DIAGNOSTICS-01D · Administración de campañas públicas.
 *
 *
 * TODO SE VALIDA AQUÍ, NO EN EL NAVEGADOR
 *
 * La pantalla deshabilita lo que está congelado, pero un campo deshabilitado
 * es una cortesía visual: se reactiva desde las herramientas del navegador en
 * tres segundos. Cada acción vuelve a comprobar quién llama, en qué estado
 * está la campaña y qué se puede tocar.
 *
 * Y por debajo sigue la base: 0196 se niega a abrir contra un borrador y a
 * mover una campaña con participaciones. Estas comprobaciones existen para
 * EXPLICARLO antes, no para sustituirlo.
 *
 *
 * SOLO SUPERADMINISTRACIÓN
 *
 * `requirePlatformStaff` deja pasar a cualquier miembro del equipo de
 * plataforma; escribir exige además `isSuperadmin`, que es el mismo criterio
 * que ya aplica la administración de documentos legales. La RLS de 0196 lo
 * vuelve a exigir en la base.
 */

export type AdminActionState = { error: string | null; campaignId?: string };

const LECTURA_FALLIDA = "No se pudieron consultar las campañas. Vuelve a intentarlo.";
const NO_AUTORIZADO = "Esta acción es de la administración de plataforma.";

const texto = (v: FormDataEntryValue | null, max: number): string | null => {
  const s = String(v ?? "").trim();
  return s === "" ? null : s.slice(0, max);
};
const fecha = (v: FormDataEntryValue | null): string | null => {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
};

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

export async function listCampaignsAction(filtro?: {
  status?: string | null; search?: string | null;
}): Promise<{
  campaigns: CampaignRow[]; canManage: boolean; unavailable: boolean;
}> {
  const { isSuperadmin } = await requirePlatformStaff();
  const estado = (["draft", "open", "closed", "archived"] as const)
    .find((s) => s === filtro?.status) ?? null;
  const filas = await listCampaigns({ status: estado, search: filtro?.search ?? null });
  if (filas === null) return { campaigns: [], canManage: isSuperadmin, unavailable: true };
  return { campaigns: filas, canManage: isSuperadmin, unavailable: false };
}

export async function getCampaignAction(id: string): Promise<{
  campaign: CampaignRow | null;
  versions: VersionOption[];
  consentDocuments: ConsentDocumentOption[];
  canManage: boolean;
}> {
  const { isSuperadmin } = await requirePlatformStaff();
  const [campaign, versions, consentDocuments] = await Promise.all([
    getCampaign(id), listSelectableVersions("pcr"), listConsentDocuments(),
  ]);
  return { campaign, versions, consentDocuments, canManage: isSuperadmin };
}

export async function listCampaignFormOptionsAction(): Promise<{
  versions: VersionOption[];
  consentDocuments: ConsentDocumentOption[];
  canManage: boolean;
}> {
  const { isSuperadmin } = await requirePlatformStaff();
  const [versions, consentDocuments] = await Promise.all([
    listSelectableVersions("pcr"), listConsentDocuments(),
  ]);
  return { versions, consentDocuments, canManage: isSuperadmin };
}

// ---------------------------------------------------------------------------
// Escritura
// ---------------------------------------------------------------------------

/** El documento de consentimiento se copia CON su huella: la elige el servidor
 *  a partir del identificador, nunca llega del formulario. */
async function evidenciaDeConsentimiento(id: string | null) {
  if (!id) return { consent_document_id: null, consent_version: null, consent_content_hash: null };
  const docs = await listConsentDocuments();
  const doc = docs.find((d) => d.id === id);
  if (!doc) return null;
  return {
    consent_document_id: doc.id,
    consent_version: doc.version,
    consent_content_hash: doc.contentHash,
  };
}

export async function createCampaignAction(
  _prev: AdminActionState, formData: FormData
): Promise<AdminActionState> {
  const { isSuperadmin } = await requirePlatformStaff();
  if (!isSuperadmin) return { error: NO_AUTORIZADO };

  const name = texto(formData.get("name"), 160);
  const slug = (texto(formData.get("slug"), 80) ?? "").toLowerCase();
  const versionId = texto(formData.get("diagnostic_version_id"), 64);
  if (!name) return { error: "Ponle nombre a la campaña." };
  if (!isValidCampaignSlug(slug)) {
    return { error: "La dirección pública solo admite minúsculas, números y guiones (3–80)." };
  }
  if (!versionId) return { error: "Elige la versión del instrumento." };

  // La versión llega del formulario, así que se comprueba contra las que de
  // verdad se pueden elegir: si no, bastaría con cambiar el valor del desplegable.
  const versiones = await listSelectableVersions("pcr");
  if (!versiones.some((v) => v.id === versionId)) {
    return { error: "Esa versión del instrumento no está disponible." };
  }

  const consentimiento = await evidenciaDeConsentimiento(texto(formData.get("consent_document_id"), 64));
  if (consentimiento === null) return { error: "Ese documento de consentimiento no está vigente." };

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("public_diagnostic_campaigns")
    .insert({
      name, slug,
      diagnostic_type: "pcr",
      diagnostic_version_id: versionId,
      status: "draft",           // SIEMPRE nace en borrador: abrir es un acto aparte.
      partner_name: texto(formData.get("partner_name"), 160),
      public_title: texto(formData.get("public_title"), 200),
      public_subtitle: texto(formData.get("public_subtitle"), 300),
      opens_at: fecha(formData.get("opens_at")),
      closes_at: fecha(formData.get("closes_at")),
      allow_resume: formData.get("allow_resume") === "on",
      allow_repeat: formData.get("allow_repeat") === "on",
      ...consentimiento,
    })
    .select("id")
    .maybeSingle();

  if (error || !data) {
    if (error?.code === "23505") return { error: "Ya existe una campaña con esa dirección pública." };
    return { error: "No fue posible crear la campaña." };
  }
  revalidatePath("/platform/public-diagnostics");
  return { error: null, campaignId: String((data as { id: string }).id) };
}

export async function updateCampaignAction(
  _prev: AdminActionState, formData: FormData
): Promise<AdminActionState> {
  const { isSuperadmin } = await requirePlatformStaff();
  if (!isSuperadmin) return { error: NO_AUTORIZADO };

  const id = texto(formData.get("campaign_id"), 64);
  if (!id) return { error: "Falta la campaña." };
  const campaña = await getCampaign(id);
  if (!campaña) return { error: LECTURA_FALLIDA };
  if (campaña.status === "archived") return { error: "Una campaña archivada ya no se edita." };

  const congelada = campaña.startedCount > 0 || campaña.status !== "draft";

  const cambios: Record<string, unknown> = {
    // Presentación y ventana: legítimamente editables incluso con la campaña
    // abierta. No tocan el instrumento ni la evidencia jurídica.
    partner_name: texto(formData.get("partner_name"), 160),
    public_title: texto(formData.get("public_title"), 200),
    public_subtitle: texto(formData.get("public_subtitle"), 300),
    opens_at: fecha(formData.get("opens_at")),
    closes_at: fecha(formData.get("closes_at")),
    allow_resume: formData.get("allow_resume") === "on",
    allow_repeat: formData.get("allow_repeat") === "on",
  };

  if (!congelada) {
    const name = texto(formData.get("name"), 160);
    const slug = (texto(formData.get("slug"), 80) ?? "").toLowerCase();
    if (!name) return { error: "Ponle nombre a la campaña." };
    if (!isValidCampaignSlug(slug)) {
      return { error: "La dirección pública solo admite minúsculas, números y guiones (3–80)." };
    }
    const versionId = texto(formData.get("diagnostic_version_id"), 64);
    const versiones = await listSelectableVersions("pcr");
    if (!versionId || !versiones.some((v) => v.id === versionId)) {
      return { error: "Esa versión del instrumento no está disponible." };
    }
    const consentimiento = await evidenciaDeConsentimiento(
      texto(formData.get("consent_document_id"), 64));
    if (consentimiento === null) return { error: "Ese documento de consentimiento no está vigente." };
    Object.assign(cambios, { name, slug, diagnostic_version_id: versionId, ...consentimiento });
  }

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("public_diagnostic_campaigns").update(cambios).eq("id", id);
  if (error) {
    if (error.code === "23505") return { error: "Ya existe una campaña con esa dirección pública." };
    // La base tiene la última palabra: si se negó, se dice, no se rodea.
    if (/CAMPAIGN_/.test(error.message)) {
      return { error: "La campaña ya no admite ese cambio. Recarga para ver su estado actual." };
    }
    return { error: "No fue posible guardar los cambios." };
  }
  revalidatePath("/platform/public-diagnostics");
  revalidatePath(`/platform/public-diagnostics/${id}`);
  return { error: null, campaignId: id };
}

async function transicionar(id: string, destino: CampaignStatus): Promise<AdminActionState> {
  const { isSuperadmin } = await requirePlatformStaff();
  if (!isSuperadmin) return { error: NO_AUTORIZADO };

  const campaña = await getCampaign(id);
  if (!campaña) return { error: LECTURA_FALLIDA };
  if (!canTransition(campaña.status, destino)) {
    return { error: transitionDeniedMessage(campaña.status, destino) };
  }

  if (destino === "open") {
    // No se abre a medias: se dice QUÉ falta, no «no se pudo».
    const r = evaluateCampaignReadiness({
      name: campaña.name, slug: campaña.slug,
      diagnosticVersionId: campaña.diagnosticVersionId,
      diagnosticVersionStatus: campaña.diagnosticVersionStatus,
      consentDocumentId: campaña.consentDocumentId,
      consentContentHash: campaña.consentContentHash,
      opensAt: campaña.opensAt, closesAt: campaña.closesAt,
    });
    if (!r.ready) return { error: `No se puede abrir: ${r.blockers.join(" ")}` };
  }

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("public_diagnostic_campaigns").update({ status: destino }).eq("id", id);
  if (error) return { error: "No fue posible cambiar el estado de la campaña." };
  revalidatePath("/platform/public-diagnostics");
  revalidatePath(`/platform/public-diagnostics/${id}`);
  return { error: null, campaignId: id };
}

export async function openCampaignAction(id: string): Promise<AdminActionState> {
  return transicionar(id, "open");
}
export async function closeCampaignAction(id: string): Promise<AdminActionState> {
  return transicionar(id, "closed");
}
export async function archiveCampaignAction(id: string): Promise<AdminActionState> {
  return transicionar(id, "archived");
}

// ---------------------------------------------------------------------------
// PUBLIC-DIAGNOSTICS-01H · Las participaciones
// ---------------------------------------------------------------------------

/**
 * Quién puede ver a las personas que participaron.
 *
 * Solo superadministración, y se comprueba AQUÍ además de en la RLS. Hasta
 * 01H la administración necesitaba cuántos; desde aquí necesita quiénes, y eso
 * son nombres, correos y teléfonos de empresas que confiaron sus datos para un
 * diagnóstico. Un miembro del equipo de plataforma que no sea superadmin ve la
 * campaña y sus cifras, no a sus participantes.
 */
export async function listSubmissionsAction(
  campaignId: string, query: { q?: string | null; page?: string | null }
): Promise<{ page: Page<SubmissionRow> | null; canRead: boolean }> {
  const { isSuperadmin } = await requirePlatformStaff();
  if (!isSuperadmin) return { page: null, canRead: false };
  try {
    return { page: await listSubmissionsPage(campaignId, query), canRead: true };
  } catch {
    return { page: null, canRead: true };
  }
}
