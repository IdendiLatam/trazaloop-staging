import type { SubscriptionPlanHistoryEntry } from "@/lib/plans/types";
import { PLAN_LABEL } from "@/lib/plans/types";
import { EmptyState } from "@/components/ui/empty-state";

/** Historial de cambios de plan (Parte 13). Append-only — nunca se edita
 *  ni se borra una entrada. */
export function PlanHistoryList({ history }: { history: SubscriptionPlanHistoryEntry[] }) {
  if (history.length === 0) {
    return <EmptyState title="Sin cambios de plan registrados todavía." description="" />;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-hairline bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-hairline text-left text-xs text-ink-soft">
            <th className="px-3 py-2 font-medium">Cambio</th>
            <th className="px-3 py-2 font-medium">Motivo</th>
            <th className="px-3 py-2 font-medium">Por</th>
            <th className="px-3 py-2 font-medium">Fecha</th>
          </tr>
        </thead>
        <tbody>
          {history.map((h) => (
            <tr key={h.id} className="border-b border-hairline last:border-0">
              <td className="px-3 py-2 text-xs">
                {h.fromPlanCode ? `${PLAN_LABEL[h.fromPlanCode]} → ` : ""}
                {PLAN_LABEL[h.toPlanCode]}
              </td>
              <td className="px-3 py-2 text-xs text-ink-soft">{h.changeReason ?? "—"}</td>
              <td className="px-3 py-2 text-xs text-ink-soft">{h.changedByName ?? "—"}</td>
              <td className="px-3 py-2 text-xs text-ink-soft">
                {new Date(h.createdAt).toLocaleString("es-CO")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
