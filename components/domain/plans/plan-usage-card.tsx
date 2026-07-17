import type { OrganizationPlanUsage } from "@/lib/plans/usage";
import type { PlanLimit } from "@/lib/plans/types";
import { PLAN_LABEL } from "@/lib/plans/types";
import { resolveUsageSeverity, findLimit, type UsageSeverity } from "@/lib/plans/limits";
import { RESOURCE_LABEL, type CountableResourceCode } from "@/lib/plans/types";

const SEVERITY_TONE: Record<UsageSeverity, string> = {
  normal: "border-hairline bg-paper text-ink-soft",
  warning: "border-amber/40 bg-amber/10 text-amber",
  critical: "border-danger/30 bg-danger/5 text-danger",
  blocked: "border-danger bg-danger/10 text-danger",
};

const SEVERITY_BAR: Record<UsageSeverity, string> = {
  normal: "bg-loop",
  warning: "bg-amber",
  critical: "bg-danger",
  blocked: "bg-danger",
};

const COUNTABLE_RESOURCES_TO_SHOW: CountableResourceCode[] = [
  "documents_trazadocs",
  "suppliers",
  "materials",
  "products",
  "evidences",
  "production_orders",
  "input_batches",
  "output_batches",
  "team_members",
];

function resourceUsed(usage: OrganizationPlanUsage, code: CountableResourceCode): number {
  switch (code) {
    case "documents_trazadocs":
      return usage.documentsTrazadocsCount;
    case "suppliers":
      return usage.suppliersCount;
    case "materials":
      return usage.materialsCount;
    case "products":
      return usage.productsCount;
    case "evidences":
      return usage.evidencesCount;
    case "production_orders":
      return usage.productionOrdersCount;
    case "input_batches":
      return usage.inputBatchesCount;
    case "output_batches":
      return usage.outputBatchesCount;
    case "team_members":
      return usage.teamMembersCount;
  }
}

/** Indicador de plan y uso (Parte 9). Reutilizable: empresa (su propio
 *  plan) y plataforma (cualquier empresa, con más detalle alrededor). */
export function PlanUsageCard({ usage, limits }: { usage: OrganizationPlanUsage; limits: PlanLimit[] }) {
  const storageSeverity = resolveUsageSeverity(usage.storagePercentUsed);

  return (
    <div className="space-y-4 rounded-lg border border-hairline bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">Plan {PLAN_LABEL[usage.planCode]}</span>
        {usage.planStatus !== "active" ? (
          <span className="rounded-full border border-danger/30 bg-danger/5 px-2 py-0.5 text-[11px] font-medium text-danger">
            {usage.planStatus === "suspended" ? "Suspendido" : "Cancelado"}
          </span>
        ) : null}
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-ink-soft">
          <span>Almacenamiento</span>
          <span>
            {usage.storageUsedMb} MB / {usage.storageLimitMb} MB ({usage.storagePercentUsed}%)
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-paper">
          <div
            className={`h-full rounded-full ${SEVERITY_BAR[storageSeverity]}`}
            style={{ width: `${Math.min(100, usage.storagePercentUsed)}%` }}
          />
        </div>
        {storageSeverity !== "normal" ? (
          <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium ${SEVERITY_TONE[storageSeverity]}`}>
            {storageSeverity === "blocked" ? "Límite alcanzado" : storageSeverity === "critical" ? "Uso crítico" : "Cerca del límite"}
          </span>
        ) : null}
      </div>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {COUNTABLE_RESOURCES_TO_SHOW.map((code) => {
          const limit = findLimit(limits, code);
          const used = resourceUsed(usage, code);
          const isUnlimited = limit?.isUnlimited ?? true;
          const limitValue = limit?.limitValue ?? null;
          const percent = !isUnlimited && limitValue ? Math.round((used / limitValue) * 100) : 0;
          const severity = isUnlimited ? "normal" : resolveUsageSeverity(percent);
          return (
            <div key={code} className="rounded-md border border-hairline bg-paper p-2">
              <dt className="text-[11px] text-ink-soft">{RESOURCE_LABEL[code]}</dt>
              <dd className={`code text-sm font-medium ${severity !== "normal" ? "text-danger" : ""}`}>
                {used} / {isUnlimited ? "∞" : limitValue}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
