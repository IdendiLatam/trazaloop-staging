"use server";

import { headers } from "next/headers";
import { requireSession } from "@/lib/auth/require-session";
import { listActiveLegalDocuments, listMyLegalAcceptances, acceptActiveLegalDocuments } from "@/lib/db/legal";
import { hasAcceptedAllRequiredDocuments, pendingRequiredDocuments, type ActiveLegalDocumentSummary } from "@/lib/domain/legal";
import type { LegalDocumentRow } from "@/lib/db/legal";

/**
 * Trazaloop · Sprint 10D · Server actions de consentimiento legal.
 * user_id nunca sale del cliente: siempre viene de requireSession().
 */

export type LegalActionState = { error: string | null; success?: boolean };

export async function getActiveLegalDocumentsAction(): Promise<LegalDocumentRow[]> {
  return listActiveLegalDocuments();
}

export async function getMyLegalAcceptanceStatusAction(): Promise<{
  hasAcceptedAll: boolean;
  pendingDocuments: LegalDocumentRow[];
  allActiveDocuments: LegalDocumentRow[];
}> {
  const { user } = await requireSession();
  const [activeDocuments, acceptances] = await Promise.all([listActiveLegalDocuments(), listMyLegalAcceptances(user.id)]);
  const summaries: ActiveLegalDocumentSummary[] = activeDocuments.map((d) => ({ id: d.id, documentType: d.documentType, version: d.version }));
  const hasAcceptedAll = hasAcceptedAllRequiredDocuments(summaries, acceptances);
  const pendingSummaries = pendingRequiredDocuments(summaries, acceptances);
  const pendingIds = new Set(pendingSummaries.map((d) => d.id));
  return {
    hasAcceptedAll,
    pendingDocuments: activeDocuments.filter((d) => pendingIds.has(d.id)),
    allActiveDocuments: activeDocuments,
  };
}

export async function acceptLegalDocumentsAction(
  _prev: LegalActionState,
  formData: FormData
): Promise<LegalActionState> {
  await requireSession();

  const confirmed = formData.get("confirm") === "on" || formData.get("confirm") === "true";
  if (!confirmed) {
    return { error: "Debes marcar la casilla de aceptación para continuar." };
  }

  const hdrs = await headers();
  const ipAddress = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = hdrs.get("user-agent");

  // Corrección (Bloqueante 1): la RPC accept_active_legal_documents es la
  // única vía real — decide ella misma cuáles son los documentos activos
  // y sus datos reales; nunca se le pasan document_type/version/
  // legal_document_id desde aquí.
  const { error } = await acceptActiveLegalDocuments(ipAddress, userAgent);
  if (error) return { error };

  return { error: null, success: true };
}

/**
 * Corrección (Bloqueante 2): chequeo reutilizable para server actions
 * CRÍTICAS que no viven detrás de un layout protegido con
 * requireLegalAcceptance() (por ejemplo, updateMyProfileAction puede
 * llamarse desde cualquier parte, y acceptTeamInvitationAction corre
 * ANTES de que exista membership) — nunca confía solo en que la UI haya
 * redirigido a tiempo. A diferencia de requireLegalAcceptance() (que
 * SIEMPRE redirige), esta función solo INFORMA si falta aceptar — cada
 * acción decide si devuelve un error de formulario o redirige, según su
 * propio contrato de retorno.
 */
export async function assertMyLegalAcceptance(): Promise<{ hasAccepted: boolean }> {
  const { hasAcceptedAll } = await getMyLegalAcceptanceStatusAction();
  return { hasAccepted: hasAcceptedAll };
}
