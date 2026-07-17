// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getActiveOrganization,
  getOrganizationModules,
} from "@/lib/db/organizations";
import { getTraceabilityMetrics } from "@/lib/db/traceability";
import { getOrganizationUsage, getPlanLimits } from "@/lib/db/plans";
import { getOrganizationOnboardingStatus } from "@/lib/db/onboarding";
import { listSupportTickets } from "@/lib/db/support";
import { RoleBadge, ModuleBadge } from "@/components/ui/badge";
import { PlanUsageCard } from "@/components/domain/plans/plan-usage-card";
import { OnboardingProgressCard } from "@/components/domain/onboarding/onboarding-progress-card";
import { DemoPlanBanner, AccountStatusBanner } from "@/components/domain/onboarding/demo-plan-banner";

export default async function DashboardPage() {
  const activeOrg = await getActiveOrganization();
  if (!activeOrg) redirect("/select-org");

  const [modules, metrics, usage, onboarding, tickets] = await Promise.all([
    getOrganizationModules(activeOrg.organizationId),
    getTraceabilityMetrics(activeOrg.organizationId),
    getOrganizationUsage(activeOrg.organizationId),
    getOrganizationOnboardingStatus(activeOrg.organizationId),
    listSupportTickets(activeOrg.organizationId),
  ]);
  const limits = usage ? await getPlanLimits(usage.planCode) : [];
  const openTicketsCount = tickets.filter((t) =>
    ["open", "assigned", "waiting_customer", "in_progress"].includes(t.status)
  ).length;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-1">
        <p className="eyebrow">Panel general</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Trazaloop CPR
        </h1>
        <p className="text-sm text-ink-soft">
          Gestiona diagnóstico, catálogos, evidencias, trazabilidad, cálculo de contenido
          reciclado, TrazaDocs, maestro documental y soporte.
        </p>
      </header>

      {usage ? <AccountStatusBanner planStatus={usage.planStatus} /> : null}
      {usage ? <DemoPlanBanner planCode={usage.planCode} /> : null}

      <dl className="grid gap-4 sm:grid-cols-2">
        {usage ? (
          <div id="plan-usage" className="sm:col-span-2">
            <PlanUsageCard usage={usage} limits={limits} />
          </div>
        ) : null}

        {onboarding && onboarding.completedSteps < onboarding.totalSteps ? (
          <div className="sm:col-span-2">
            <OnboardingProgressCard
              completedSteps={onboarding.completedSteps}
              totalSteps={onboarding.totalSteps}
              progressPercent={onboarding.progressPercent}
            />
            <Link href="/onboarding" className="mt-1 inline-block text-xs text-loop hover:underline">
              Ver pasos de onboarding →
            </Link>
          </div>
        ) : null}

        <div className="rounded-lg border border-hairline bg-surface p-5">
          <dt className="eyebrow mb-2">Empresa activa</dt>
          <dd className="text-lg font-semibold">{activeOrg.organizationName}</dd>
          <dd className="code mt-1 text-xs text-ink-soft">
            {activeOrg.organizationId}
          </dd>
        </div>

        <div className="rounded-lg border border-hairline bg-surface p-5">
          <dt className="eyebrow mb-2">Tu rol en esta empresa</dt>
          <dd>
            <RoleBadge role={activeOrg.roleCode} />
          </dd>
        </div>

        <div className="rounded-lg border border-hairline bg-surface p-5">
          <dt className="eyebrow mb-2">
            <Link href="/support" className="hover:underline">
              Tickets de soporte
            </Link>
          </dt>
          <dd className="code text-lg font-semibold">{openTicketsCount}</dd>
          <dd className="text-xs text-ink-soft">abiertos ahora mismo</dd>
        </div>

        <div className="rounded-lg border border-hairline bg-surface p-5">
          <dt className="eyebrow mb-2">
            <Link href="/trazadocs/master" className="hover:underline">
              Maestro de documentos
            </Link>
          </dt>
          <dd className="code text-lg font-semibold">{usage?.documentsTrazadocsCount ?? 0}</dd>
          <dd className="text-xs text-ink-soft">documentos registrados</dd>
        </div>

        <div className="rounded-lg border border-hairline bg-surface p-5 sm:col-span-2">
          <dt className="eyebrow mb-3">Módulos activos</dt>
          <dd className="flex flex-wrap gap-2">
            {modules.length === 0 ? (
              <span className="text-sm text-ink-soft">
                Sin módulos activos. Un administrador puede activarlos.
              </span>
            ) : (
              modules.map((m) => (
                <ModuleBadge key={m.code} name={m.name} enabled={m.enabled} />
              ))
            )}
          </dd>
        </div>

        <div className="rounded-lg border border-hairline bg-surface p-5 sm:col-span-2">
          <dt className="eyebrow mb-3">
            <Link href="/traceability" className="hover:underline">
              Trazabilidad
            </Link>
          </dt>
          <dd className="grid grid-cols-3 gap-3 text-center sm:grid-cols-6">
            {[
              { label: "Lotes de entrada", value: metrics.inputBatches, tone: "text-ink" },
              { label: "Órdenes", value: metrics.productionOrders, tone: "text-ink" },
              { label: "Lotes producidos / lotes finales", value: metrics.outputBatches, tone: "text-ink" },
              { label: "Completos", value: metrics.completeBatches, tone: "text-loop-deep" },
              { label: "Incompletos", value: metrics.incompleteBatches, tone: "text-danger" },
              { label: "Con advertencia", value: metrics.warningBatches, tone: "text-amber" },
            ].map((item) => (
              <div key={item.label}>
                <span className={`code block text-xl font-semibold ${item.tone}`}>
                  {item.value}
                </span>
                <span className="text-xs text-ink-soft">{item.label}</span>
              </div>
            ))}
          </dd>
        </div>
      </dl>
    </div>
  );
}
