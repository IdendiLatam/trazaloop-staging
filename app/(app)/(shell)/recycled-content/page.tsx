// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { getRecycledDashboard } from "@/lib/db/recycled";
import { DefensibilityBadge } from "@/components/domain/recycled/defensibility-badge";

export default async function RecycledContentPage() {
  const org = await requireActiveOrg();
  const d = await getRecycledDashboard(org.organizationId);

  const cards = [
    { label: "Lotes con cálculo", value: d.batchesWithCalculation, tone: "text-ink" },
    { label: "Lotes sin cálculo", value: d.batchesWithoutCalculation, tone: "text-ink-soft" },
    { label: "Defendibles", value: d.defensible, tone: "text-loop-deep" },
    { label: "Con advertencias", value: d.withWarnings, tone: "text-amber" },
    { label: "Preliminares", value: d.preliminary, tone: "text-danger" },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="space-y-1">
        <p className="eyebrow">Contenido reciclado</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Contenido reciclado de {org.organizationName}
        </h1>
        <p className="max-w-2xl text-sm text-ink-soft">
          Cálculo por lote producido / lote final según NTC 6632:2022 y UNE-EN 15343:2008,
          con snapshots inmutables, soporte documental y nivel de
          defendibilidad como preparación frente a auditorías y revisión de
          cumplimiento normativo.
        </p>
      </header>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/recycled-content/output-batches"
          className="rounded-md bg-loop px-4 py-2 text-sm font-semibold text-white hover:bg-loop-deep"
        >
          Calcular por lote producido / lote final
        </Link>
        <Link
          href="/recycled-content/reports"
          className="rounded-md border border-hairline bg-surface px-4 py-2 text-sm font-semibold hover:border-loop"
        >
          Agregaciones
        </Link>
        <Link
          href="/guided-flow"
          className="rounded-md border border-hairline bg-surface px-4 py-2 text-sm font-semibold hover:border-loop"
        >
          Ver en flujo guiado
        </Link>
        <Link
          href="/audit-support"
          className="rounded-md border border-hairline bg-surface px-4 py-2 text-sm font-semibold hover:border-loop"
        >
          Revisar brechas
        </Link>
      </div>

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="rounded-lg border border-hairline bg-surface p-4 text-center">
            <dd className={`code text-2xl font-semibold ${c.tone}`}>{c.value}</dd>
            <dt className="mt-1 text-xs text-ink-soft">{c.label}</dt>
          </div>
        ))}
      </dl>

      {d.lastCalculation ? (
        <p className="text-sm text-ink-soft">
          Último cálculo:{" "}
          <span className="code text-loop-deep">{d.lastCalculation.output_batch_code}</span>{" "}
          · {d.lastCalculation.recycled_percent.toFixed(2)}% ·{" "}
          {new Date(d.lastCalculation.calculated_at).toLocaleString("es-CO")}
          {" · "}
          <Link
            href={`/audit-support/calculations/${d.lastCalculation.calculation_id}`}
            className="text-loop hover:underline"
          >
            Ver dossier
          </Link>
          {" · "}
          <Link
            href={`/audit-support/output-batches/${d.lastCalculation.output_batch_id}/evidence-matrix`}
            className="text-loop hover:underline"
          >
            Matriz de evidencias
          </Link>
          {" · "}
          <Link
            href={`/audit-support/calculations/${d.lastCalculation.calculation_id}/print`}
            className="text-loop hover:underline"
          >
            Imprimir
          </Link>
        </p>
      ) : null}

      <section className="rounded-lg border border-hairline bg-surface">
        <h2 className="eyebrow border-b border-hairline px-4 py-3">Últimos cálculos</h2>
        {d.latest.length === 0 ? (
          <p className="px-4 py-6 text-sm text-ink-soft">
            Aún no hay cálculos. Empieza en{" "}
            <Link href="/recycled-content/output-batches" className="text-loop underline">
              Calcular por lote producido / lote final
            </Link>.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs text-ink-soft">
                  <th className="px-4 py-2 font-medium">Lote producido / lote final</th>
                  <th className="px-4 py-2 font-medium">Producto</th>
                  <th className="px-4 py-2 font-medium">Calculado</th>
                  <th className="px-4 py-2 font-medium">Declarado</th>
                  <th className="px-4 py-2 font-medium">Defendibilidad</th>
                  <th className="px-4 py-2 font-medium">Fecha</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {d.latest.map((l) => (
                  <tr key={l.calculation_id} className="border-b border-hairline last:border-0">
                    <td className="code px-4 py-2 text-xs text-loop-deep">{l.output_batch_code}</td>
                    <td className="px-4 py-2">{l.product_name ?? "—"}</td>
                    <td className="code px-4 py-2">{l.recycled_percent.toFixed(2)}%</td>
                    <td className="code px-4 py-2">
                      {l.declared_percent !== null ? `${l.declared_percent.toFixed(2)}%` : "—"}
                    </td>
                    <td className="px-4 py-2">
                      <DefensibilityBadge level={l.defensibility_level} />
                    </td>
                    <td className="px-4 py-2 text-xs text-ink-soft">
                      {new Date(l.calculated_at).toLocaleDateString("es-CO")}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Link
                        href={`/recycled-content/output-batches/${l.output_batch_id}`}
                        className="text-loop hover:underline"
                      >
                        Ver detalle
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
