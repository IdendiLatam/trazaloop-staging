// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import {
  getRecycledByOrder,
  getRecycledByProduct,
  getRecycledByFamily,
  getRecycledByPeriod,
  type AggregateRow,
  type DefensibilityLevel,
} from "@/lib/db/recycled";
import { DefensibilityBadge } from "@/components/domain/recycled/defensibility-badge";
import { PrintButton } from "@/components/domain/audit-support/print-button";

function AggregateTable({
  title,
  rows,
  labelHeader,
  labelOf,
}: {
  title: string;
  rows: AggregateRow[];
  labelHeader: string;
  labelOf: (r: AggregateRow) => string;
}) {
  return (
    <section className="rounded-lg border border-hairline bg-surface">
      <h2 className="eyebrow border-b border-hairline px-4 py-3">{title}</h2>
      {rows.length === 0 ? (
        <p className="px-4 py-4 text-sm text-ink-soft">Sin datos todavía.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs text-ink-soft">
                <th className="px-4 py-2 font-medium">{labelHeader}</th>
                <th className="px-4 py-2 font-medium">Masa reciclada kg</th>
                <th className="px-4 py-2 font-medium">Masa total kg</th>
                <th className="px-4 py-2 font-medium">% ponderado</th>
                <th className="px-4 py-2 font-medium">Defendibilidad</th>
                <th className="px-4 py-2 font-medium">Lotes calculados / totales</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-hairline last:border-0">
                  <td className="px-4 py-2">{labelOf(r)}</td>
                  <td className="code px-4 py-2 text-xs">
                    {r.recycled_mass_kg !== null ? r.recycled_mass_kg.toFixed(2) : "—"}
                  </td>
                  <td className="code px-4 py-2 text-xs">
                    {r.total_mass_kg !== null ? r.total_mass_kg.toFixed(2) : "—"}
                  </td>
                  <td className="code px-4 py-2">
                    {r.recycled_percent !== null ? `${r.recycled_percent.toFixed(2)}%` : "—"}
                  </td>
                  <td className="px-4 py-2">
                    {r.defensibility_level ? (
                      <DefensibilityBadge level={r.defensibility_level as DefensibilityLevel} />
                    ) : (
                      <span className="text-xs text-ink-soft">Sin cálculos</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span className="code text-xs">
                      {r.calculated_batches_count} / {r.total_batches_count}
                    </span>
                    {r.uncalculated_batches_count > 0 ? (
                      <span className="code block text-[11px] text-amber">
                        {r.uncalculated_batches_count} pendiente{r.uncalculated_batches_count === 1 ? "" : "s"}
                      </span>
                    ) : null}
                    {r.has_uncalculated_batches ? (
                      <span className="block text-[10px] text-amber">
                        Agregado parcial: hay lotes sin cálculo.
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default async function RecycledReportsPage() {
  const org = await requireActiveOrg();
  const [byOrder, byProduct, byFamily, byPeriod] = await Promise.all([
    getRecycledByOrder(org.organizationId),
    getRecycledByProduct(org.organizationId),
    getRecycledByFamily(org.organizationId),
    getRecycledByPeriod(org.organizationId),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
        <p className="eyebrow no-print">
          <Link href="/recycled-content" className="hover:underline">Contenido reciclado</Link>{" "}
          · Agregaciones
        </p>
        <p className="eyebrow hidden print:block">
          Trazaloop — Vista ejecutiva de contenido reciclado
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Agregaciones ponderadas</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-soft">
          Los porcentajes se ponderan por masa (suma de masa reciclada sobre
          suma de masa total) y se calculan solo con los lotes que tienen
          cálculo; nunca se promedian porcentajes. Un agregado con lotes
          pendientes de cálculo se marca como preliminar, y sin cálculos no
          tiene nivel de defendibilidad.
        </p>
        </div>
        <PrintButton />
      </header>

      <AggregateTable
        title="Por orden de producción"
        rows={byOrder}
        labelHeader="Orden"
        labelOf={(r) => String(r.production_order_code ?? "—")}
      />
      <AggregateTable
        title="Por producto"
        rows={byProduct}
        labelHeader="Producto"
        labelOf={(r) => `${r.product_code ?? ""} · ${r.product_name ?? "—"}`}
      />
      <AggregateTable
        title="Por familia"
        rows={byFamily}
        labelHeader="Familia"
        labelOf={(r) => String(r.family_name ?? "—")}
      />
      <AggregateTable
        title="Por periodo (mes de producción)"
        rows={byPeriod}
        labelHeader="Mes"
        labelOf={(r) =>
          r.period_month
            ? new Date(String(r.period_month)).toLocaleDateString("es-CO", {
                year: "numeric",
                month: "long",
                timeZone: "UTC",
              })
            : "—"
        }
      />

      <footer className="hidden border-t border-hairline pt-4 text-xs text-ink-soft print:block">
        <p>Vista generada el {new Date().toLocaleString("es-CO")}.</p>
        <p className="mt-2">
          Esta vista ejecutiva consolida agregaciones ponderadas por masa a
          partir de los snapshots de cálculo disponibles en Trazaloop al
          momento de la consulta. No constituye por sí misma una
          certificación ni un documento formal controlado.
        </p>
      </footer>
    </div>
  );
}
