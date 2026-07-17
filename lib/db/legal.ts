import "server-only";

import { createServerClient } from "@/lib/supabase/server";
import type { LegalDocumentType } from "@/lib/domain/legal";

/**
 * Trazaloop · Sprint 10D · Capa de datos de consentimiento legal. Nada
 * aquí usa service_role: el SELECT de documentos activos funciona igual
 * con o sin sesión (RLS de 0066 ya lo permite para `anon`), y las
 * aceptaciones siempre se leen/escriben con la sesión real del usuario.
 */

export type LegalDocumentRow = {
  id: string;
  documentType: LegalDocumentType;
  version: string;
  title: string;
  content: string;
  publishedAt: string | null;
};

function mapLegalDocument(r: Record<string, unknown>): LegalDocumentRow {
  return {
    id: r.id as string,
    documentType: r.document_type as LegalDocumentType,
    version: r.version as string,
    title: r.title as string,
    content: r.content as string,
    publishedAt: (r.published_at as string | null) ?? null,
  };
}

export async function listActiveLegalDocuments(): Promise<LegalDocumentRow[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("legal_documents")
    .select("id, document_type, version, title, content, published_at")
    .eq("status", "active")
    .order("document_type", { ascending: true });
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(mapLegalDocument);
}

export async function getActiveLegalDocumentByType(type: LegalDocumentType): Promise<LegalDocumentRow | null> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("legal_documents")
    .select("id, document_type, version, title, content, published_at")
    .eq("status", "active")
    .eq("document_type", type)
    .maybeSingle();
  return data ? mapLegalDocument(data as unknown as Record<string, unknown>) : null;
}

export async function listMyLegalAcceptances(userId: string): Promise<{ legalDocumentId: string }[]> {
  const supabase = await createServerClient();
  const { data } = await supabase.from("user_legal_acceptances").select("legal_document_id").eq("user_id", userId);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({ legalDocumentId: r.legal_document_id as string }));
}

/**
 * Corrección (Bloqueante 1): única vía real para registrar una
 * aceptación — llama a la RPC SECURITY DEFINER accept_active_legal_documents
 * (0068), que decide ella misma cuáles son los documentos activos
 * requeridos y sus datos reales (id/tipo/versión). Nunca se le pasan
 * esos datos desde aquí: la RPC no los acepta como parámetro.
 */
export async function acceptActiveLegalDocuments(
  ipAddress: string | null,
  userAgent: string | null
): Promise<{ acceptedCount: number; error: string | null }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("accept_active_legal_documents", {
    p_ip_address: ipAddress,
    p_user_agent: userAgent,
  });
  if (error) return { acceptedCount: 0, error: "No fue posible registrar la aceptación." };
  return { acceptedCount: Number(data ?? 0), error: null };
}

export type UserLegalAcceptanceSummary = {
  userId: string;
  userName: string | null;
  userEmail: string;
  documentType: LegalDocumentType;
  version: string;
  acceptedAt: string;
};

/** Para el detalle de empresa en la consola de plataforma (Parte 10):
 *  quién de los miembros aceptó qué, y cuándo. */
export async function listOrganizationMembersLegalAcceptances(memberUserIds: string[]): Promise<UserLegalAcceptanceSummary[]> {
  if (memberUserIds.length === 0) return [];
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("user_legal_acceptances")
    .select("user_id, document_type, version, accepted_at, profile:profiles!user_legal_acceptances_user_id_fkey(full_name, email)")
    .in("user_id", memberUserIds)
    .order("accepted_at", { ascending: false });
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => {
    const profile = (r.profile ?? null) as { full_name: string | null; email: string } | null;
    return {
      userId: r.user_id as string,
      userName: profile?.full_name ?? null,
      userEmail: profile?.email ?? "",
      documentType: r.document_type as LegalDocumentType,
      version: r.version as string,
      acceptedAt: r.accepted_at as string,
    };
  });
}
