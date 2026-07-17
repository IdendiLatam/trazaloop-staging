"use server";

import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { getOrganizationOnboardingStatus } from "@/lib/db/onboarding";
import { resolveOnboardingChecklist, REVIEW_PLAN_LIMITS_STEP, type ResolvedOnboardingStep } from "@/lib/domain/onboarding";
import { getOrganizationUsage } from "@/lib/db/plans";
import type { OrganizationPlanUsage } from "@/lib/plans/usage";

/**
 * Trazaloop · Sprint 10D · Server actions de onboarding. organization_id
 * siempre viene de requireActiveOrg() — nunca del cliente.
 */

export async function getOnboardingStatusAction(): Promise<{
  checklist: ResolvedOnboardingStep[];
  reviewPlanLimitsStep: typeof REVIEW_PLAN_LIMITS_STEP;
  completedSteps: number;
  totalSteps: number;
  progressPercent: number;
  openTicketsCount: number;
} | null> {
  const org = await requireActiveOrg();
  const status = await getOrganizationOnboardingStatus(org.organizationId);
  if (!status) return null;
  return {
    checklist: resolveOnboardingChecklist(status),
    reviewPlanLimitsStep: REVIEW_PLAN_LIMITS_STEP,
    completedSteps: status.completedSteps,
    totalSteps: status.totalSteps,
    progressPercent: status.progressPercent,
    openTicketsCount: status.openTicketsCount,
  };
}

/** Resumen para el dashboard de lanzamiento (Parte 9): plan + progreso
 *  de onboarding en una sola llamada, reutilizando vistas ya existentes
 *  — sin duplicar ninguna lógica pesada. */
export async function getDemoLaunchSummaryAction(): Promise<{
  usage: OrganizationPlanUsage | null;
  onboarding: Awaited<ReturnType<typeof getOnboardingStatusAction>>;
}> {
  const org = await requireActiveOrg();
  const [usage, onboarding] = await Promise.all([getOrganizationUsage(org.organizationId), getOnboardingStatusAction()]);
  return { usage, onboarding };
}
