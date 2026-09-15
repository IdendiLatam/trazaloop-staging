import "server-only";

import { createServerClient } from "@/lib/supabase/server";
import type { CampaignStatus } from "@/lib/domain/public-diagnostics";

/**
 * Trazaloop · PUBLIC-DIAGNOSTICS-01D · Lectura de campañas para administración.
 *
 * Todo pasa por la RLS de 0196, que solo deja ver estas tablas a la
 * administración de plataforma. No hay cliente de servicio aquí: si algún día
 * alguien llama a esto desde otro sitio, no verá nada en vez de verlo todo.
 *
 * Y NO se leen datos personales de participantes. En este tramo la
 * administración necesita CUÁNTOS, no QUIÉNES; los nombres y correos llegan en
 * su propio tramo, cuando haya una pantalla que los justifique.
 */

export type CampaignRow = {
  id: string;
  slug: string;
  name: string;
  diagnosticType: string;
  diagnosticVersionId: string;
  diagnosticVersionNumber: number | null;
  diagnosticVersionStatus: "draft" | "published" | "retired" | null;
  status: CampaignStatus;
  opensAt: string | null;
  closesAt: string | null;
  partnerName: string | null;
  publicTitle: string | null;
  publicSubtitle: string | null;
  consentDocumentId: string | null;
  consentVersion: string | null;
  consentContentHash: string | null;
  allowResume: boolean;
  allowRepeat: boolean;
  createdAt: string;
  startedCount: number;
  completedCount: number;
};

type Fila = Record<string, unknown>;

const SELECT =
  "id, slug, name, diagnostic_type, diagnostic_version_id, status, opens_at, closes_at,"
  + " partner_name, public_title, public_subtitle, consent_document_id, consent_version,"
  + " consent_content_hash, allow_resume, allow_repeat, created_at,"
  + " diagnostic_versions(version_number, status)";

function mapear(r: Fila, conteos: Map<string, { started: number; completed: number }>): CampaignRow {
  const v = r.diagnostic_versions as { version_number: number; status: string } | null;
  const c = conteos.get(String(r.id)) ?? { started: 0, completed: 0 };
  return {
    id: String(r.id),
    slug: String(r.slug),
    name: String(r.name),
    diagnosticType: String(r.diagnostic_type),
    diagnosticVersionId: String(r.diagnostic_version_id),
    diagnosticVersionNumber: v?.version_number ?? null,
    diagnosticVersionStatus: (v?.status as CampaignRow["diagnosticVersionStatus"]) ?? null,
    status: r.status as CampaignStatus,
    opensAt: (r.opens_at as string) ?? null,
    closesAt: (r.closes_at as string) ?? null,
    partnerName: (r.partner_name as string) ?? null,
    publicTitle: (r.public_title as string) ?? null,
    publicSubtitle: (r.public_subtitle as string) ?? null,
    consentDocumentId: (r.consent_document_id as string) ?? null,
    consentVersion: (r.consent_version as string) ?? null,
    consentContentHash: (r.consent_content_hash as string) ?? null,
    allowResume: Boolean(r.allow_resume),
    allowRepeat: Boolean(r.allow_repeat),
    createdAt: String(r.created_at),
    startedCount: c.started,
    completedCount: c.completed,
  };
}

/**
 * Los conteos, en UNA consulta y no una por campaña.
 *
 * Sin esto, un listado de treinta campañas serían sesenta consultas. Y se
 * traen solo `campaign_id` y `status`: contar no necesita ver a nadie.
 */
async function contarParticipaciones(
  ids: string[]
): Promise<Map<string, { started: number; completed: number }>> {
  const mapa = new Map<string, { started: number; completed: number }>();
  if (ids.length === 0) return mapa;
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("public_diagnostic_submissions")
    .select("campaign_id, status")
    .in("campaign_id", ids);
  for (const fila of (data ?? []) as Fila[]) {
    const id = String(fila.campaign_id);
    const c = mapa.get(id) ?? { started: 0, completed: 0 };
    c.started += 1;
    if (fila.status === "completed") c.completed += 1;
    mapa.set(id, c);
  }
  return mapa;
}

export async function listCampaigns(filtro?: {
  status?: CampaignStatus | null;
  search?: string | null;
}): Promise<CampaignRow[] | null> {
  const supabase = await createServerClient();
  let consulta = supabase
    .from("public_diagnostic_campaigns")
    .select(SELECT)
    .order("created_at", { ascending: false })
    .limit(200);
  if (filtro?.status) consulta = consulta.eq("status", filtro.status);
  const término = (filtro?.search ?? "").trim();
  if (término) {
    // Se escapan comas y paréntesis: viajan dentro de la expresión `or` de
    // PostgREST y sin escaparlas un nombre con coma partiría el filtro.
    const t = término.replace(/[,()]/g, " ");
    consulta = consulta.or(`name.ilike.%${t}%,partner_name.ilike.%${t}%`);
  }
  const { data, error } = await consulta;
  if (error) return null;
  const filas = (data ?? []) as unknown as Fila[];
  const conteos = await contarParticipaciones(filas.map((f) => String(f.id)));
  return filas.map((f) => mapear(f, conteos));
}

export async function getCampaign(id: string): Promise<CampaignRow | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("public_diagnostic_campaigns")
    .select(SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  const conteos = await contarParticipaciones([id]);
  return mapear(data as unknown as Fila, conteos);
}

export type VersionOption = {
  id: string; versionNumber: number; status: string; publishedAt: string | null;
};

/**
 * Las versiones que se pueden elegir.
 *
 * SOLO publicadas. Ofrecer un borrador sería ofrecer un instrumento que aún
 * puede cambiar debajo, y una retirada sería medir con una regla que ya se
 * sustituyó; la base rechaza abrir con ellas, así que enseñarlas solo llevaría
 * a un error evitable.
 */
export async function listSelectableVersions(
  diagnosticType = "pcr"
): Promise<VersionOption[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("diagnostic_versions")
    .select("id, version_number, status, published_at")
    .eq("diagnostic_type", diagnosticType)
    .eq("status", "published")
    .order("version_number", { ascending: false });
  return ((data ?? []) as Fila[]).map((r) => ({
    id: String(r.id),
    versionNumber: Number(r.version_number),
    status: String(r.status),
    publishedAt: (r.published_at as string) ?? null,
  }));
}

export type ConsentDocumentOption = {
  id: string; documentType: string; title: string; version: string;
  status: string; publishedAt: string | null; contentHash: string | null;
};

/**
 * Los documentos que pueden servir de consentimiento.
 *
 * Solo los VIGENTES: pedir que se acepte un texto archivado sería pedir un
 * consentimiento sobre algo que ya no rige.
 */
export async function listConsentDocuments(): Promise<ConsentDocumentOption[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("legal_documents")
    .select("id, document_type, title, version, status, published_at, content_hash")
    .eq("status", "active")
    .order("document_type");
  return ((data ?? []) as Fila[]).map((r) => ({
    id: String(r.id),
    documentType: String(r.document_type),
    title: String(r.title),
    version: String(r.version),
    status: String(r.status),
    publishedAt: (r.published_at as string) ?? null,
    contentHash: (r.content_hash as string) ?? null,
  }));
}
