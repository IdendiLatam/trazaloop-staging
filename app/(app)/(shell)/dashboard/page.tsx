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
import { RoleBadge, ModuleBadge } from "@/components/ui/badge";

export default async function DashboardPage() {
  const activeOrg = await getActiveOrganization();
  if (!activeOrg) redirect("/select-org");

  const [modules, metrics] = await Promise.all([
    getOrganizationModules(activeOrg.organizationId),
    getTraceabilityMetrics(activeOrg.organizationId),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-1">
        <p className="eyebrow">Panel general</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Trazaloop — núcleo activo
        </h1>
        <p className="text-sm text-ink-soft">
          Multiempresa, diagnóstico, catálogos, evidencias y trazabilidad
          operativa están funcionando. El cálculo de contenido reciclado llega
          en el siguiente sprint.
        </p>
      </header>

      <dl className="grid gap-4 sm:grid-cols-2">
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
              { label: "Lotes de salida", value: metrics.outputBatches, tone: "text-ink" },
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
