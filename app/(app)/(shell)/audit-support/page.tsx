// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { getAuditSupportDashboardAction } from "@/server/actions/audit-support";
import { GAP_SEVERITY_LABEL } from "@/lib/db/audit-support";
import { DefensibilityBadge } from "@/components/domain/recycled/defensibility-badge";

export default async function AuditSupportPage() {
  const d = await getAuditSupportDashboardAction();

  const cards = [
    { label: "Cálculos defendibles", value: d.defensible, tone: "text-loop-deep" },
    { label: "Con advertencias", value: d.withWarnings, tone: "text-amber" },
    { label: "Preliminares", value: d.preliminary, tone: "text-danger" },
    { label: "Lotes con brechas críticas", value: d.batchesWithCriticalGaps, tone: "text-danger" },
    { label: "Lotes con evidencias pendientes", value: d.batchesWithPendingEvidence, tone: "text-amber" },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="space-y-1">
        <p className="eyebrow">Soporte técnico</p>
        <h1 className="text-2xl font-semibold tracking-tight">Soporte técnico del cálculo</h1>
        <p className="max-w-2xl text-sm text-ink-soft">
          Dossiers imprimibles, matriz de evidencias y brechas de soporte
          documental por cálculo, como preparación frente a auditorías y
          revisión de cumplimiento normativo. Todo se lee de los snapshots
          existentes: nada se recalcula ni se modifica.
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          <Link
            href="/guided-flow"
            className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm font-medium hover:border-loop"
          >
            Volver al flujo guiado
          </Link>
          <Link
            href="/evidences"
            className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm font-medium hover:border-loop"
          >
            Completar evidencias
          </Link>
          <Link
            href="/recycled-content/output-batches"
            className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm font-medium hover:border-loop"
          >
            Recalcular
          </Link>
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="rounded-lg border border-hairline bg-surface p-4 text-center">
            <dd className={`code text-2xl font-semibold ${c.tone}`}>{c.value}</dd>
            <dt className="mt-1 text-xs text-ink-soft">{c.label}</dt>
          </div>
        ))}
      </dl>

      <section className="rounded-lg border border-hairline bg-surface">
        <h2 className="eyebrow border-b border-hairline px-4 py-3">Últimos cálculos</h2>
        {d.latest.length === 0 ? (
          <p className="px-4 py-6 text-sm text-ink-soft">
            Aún no hay cálculos. Empieza en{" "}
            <Link href="/recycled-content/output-batches" className="text-loop underline">
              Contenido reciclado
            </Link>.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs text-ink-soft">
                  <th className="px-4 py-2 font-medium">Lote de salida</th>
                  <th className="px-4 py-2 font-medium">Producto</th>
                  <th className="px-4 py-2 font-medium">Calculado</th>
                  <th className="px-4 py-2 font-medium">Defendibilidad</th>
                  <th className="px-4 py-2 font-medium">Riesgo</th>
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
                    <td className="px-4 py-2"><DefensibilityBadge level={l.defensibility_level} /></td>
                    <td className={`px-4 py-2 text-xs font-semibold ${l.risk_flag ? "text-danger" : "text-ink-soft"}`}>
                      {l.risk_flag ? "Sí" : "No"}
                    </td>
                    <td className="px-4 py-2 text-xs text-ink-soft">
                      {new Date(l.calculated_at).toLocaleDateString("es-CO")}
                    </td>
                    <td className="px-4 py-2 text-right text-xs">
                      <Link href={`/audit-support/calculations/${l.calculation_id}`} className="text-loop hover:underline">
                        Ver dossier
                      </Link>
                      {" · "}
                      <Link href={`/audit-support/calculations/${l.calculation_id}/print`} className="text-loop hover:underline">
                        Imprimir
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-hairline bg-surface">
        <h2 className="eyebrow border-b border-hairline px-4 py-3">Brechas recientes</h2>
        {d.recentGaps.length === 0 ? (
          <p className="px-4 py-6 text-sm text-ink-soft">
            No se identifican brechas en los lotes actuales.
          </p>
        ) : (
          <ul className="divide-y divide-hairline">
            {d.recentGaps.map((g, i) => (
              <li key={i} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/audit-support/output-batches/${g.output_batch_id}/evidence-matrix`}
                      className="code text-xs text-loop-deep hover:underline"
                    >
                      {g.output_batch_code}
                    </Link>
                    <span className="font-medium">{g.gap_label}</span>
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                        g.gap_severity === "critical"
                          ? "border-danger/30 bg-danger/5 text-danger"
                          : g.gap_severity === "warning"
                            ? "border-amber/40 bg-amber/10 text-amber"
                            : "border-hairline text-ink-soft"
                      }`}
                    >
                      {GAP_SEVERITY_LABEL[g.gap_severity]}
                    </span>
                  </p>
                  <p className="text-xs text-ink-soft">{g.suggested_action}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
