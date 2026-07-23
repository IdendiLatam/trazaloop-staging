// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { getOnboardingStatusAction } from "@/server/actions/onboarding";
import { getModulePlanUsageSummary } from "@/lib/db/module-access";
import { CPR_MODULE_CODE } from "@/lib/modules/catalog";
import { OnboardingChecklist } from "@/components/domain/onboarding/onboarding-checklist";
import { OnboardingProgressCard } from "@/components/domain/onboarding/onboarding-progress-card";
import { DemoPlanBanner, AccountStatusBanner } from "@/components/domain/onboarding/demo-plan-banner";

export default async function OnboardingPage() {
  const org = await requireActiveOrg();
  // T9F.1: el estado de plan mostrado es el del MÓDULO CPR (esta página
  // vive bajo el guard estructural (cpr)); el plan legacy no participa.
  const [status, planSummary] = await Promise.all([
    getOnboardingStatusAction(),
    getModulePlanUsageSummary(org.organizationId, CPR_MODULE_CODE),
  ]);
  const usage = planSummary?.usage ?? null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <p className="eyebrow">{org.organizationName}</p>
        <h1 className="text-2xl font-semibold tracking-tight">Bienvenido a Trazaloop CPR</h1>
        <p className="max-w-2xl text-sm text-ink-soft">
          Sigue estos primeros pasos para empezar a usar la plataforma con tus datos reales — no se
          carga ningún dato de ejemplo automáticamente.
        </p>
      </header>

      {usage ? <AccountStatusBanner planStatus={usage.planStatus} /> : null}
      {usage ? <DemoPlanBanner planCode={usage.planCode} /> : null}

      {status ? (
        <>
          <OnboardingProgressCard
            completedSteps={status.completedSteps}
            totalSteps={status.totalSteps}
            progressPercent={status.progressPercent}
          />
          <OnboardingChecklist steps={status.checklist} />
        </>
      ) : null}

      <div className="pt-2">
        <Link href="/dashboard" className="text-sm text-loop hover:underline">
          Ir al panel principal →
        </Link>
      </div>
    </div>
  );
}
