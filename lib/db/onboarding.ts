import "server-only";

import { createServerClient } from "@/lib/supabase/server";
import type { OnboardingStatusFacts } from "@/lib/domain/onboarding";

/**
 * Trazaloop · Sprint 10D · Capa de datos del onboarding. Lee directo de
 * v_organization_onboarding_status (0067) — nada se calcula aquí, la
 * vista ya hace todo el trabajo.
 */

export type OnboardingStatusRow = OnboardingStatusFacts & {
  organizationId: string;
  hasDocumentMasterItem: boolean;
  openTicketsCount: number;
  completedSteps: number;
  totalSteps: number;
  progressPercent: number;
};

function mapOnboardingRow(r: Record<string, unknown>): OnboardingStatusRow {
  return {
    organizationId: r.organization_id as string,
    companyProfileStarted: Boolean(r.company_profile_started),
    companyProfileCompleted: Boolean(r.company_profile_completed),
    diagnosticStarted: Boolean(r.diagnostic_started),
    diagnosticCompleted: Boolean(r.diagnostic_completed),
    hasProduct: Boolean(r.has_product),
    hasSupplier: Boolean(r.has_supplier),
    hasMaterial: Boolean(r.has_material),
    hasEvidence: Boolean(r.has_evidence),
    hasTrazadoc: Boolean(r.has_trazadoc),
    hasDocumentMasterItem: Boolean(r.has_document_master_item),
    openTicketsCount: Number(r.open_tickets_count ?? 0),
    completedSteps: Number(r.completed_steps ?? 0),
    totalSteps: Number(r.total_steps ?? 7),
    progressPercent: Number(r.progress_percent ?? 0),
  };
}

export async function getOrganizationOnboardingStatus(orgId: string): Promise<OnboardingStatusRow | null> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("v_organization_onboarding_status")
    .select("*")
    .eq("organization_id", orgId)
    .maybeSingle();
  return data ? mapOnboardingRow(data as unknown as Record<string, unknown>) : null;
}
