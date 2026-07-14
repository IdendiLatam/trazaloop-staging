// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { listOutputBatches, getCompleteness } from "@/lib/db/traceability";
import { listLatestCalculations } from "@/lib/db/recycled";
import { TraceabilityStatusBadge } from "@/components/domain/traceability/status-badge";
import { DefensibilityBadge } from "@/components/domain/recycled/defensibility-badge";
import { CalculateButton } from "@/components/domain/recycled/calculate-button";

export default async function RecycledOutputBatchesPage() {
  const org = await requireActiveOrg();
  const [batches, completeness, latest] = await Promise.all([
    listOutputBatches(org.organizationId),
    getCompleteness(org.organizationId),
    listLatestCalculations(org.organizationId),
  ]);
  const completenessByBatch = new Map(completeness.map((c) => [c.output_batch_id, c]));
  const latestByBatch = new Map(latest.map((l) => [l.output_batch_id, l]));

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header>
        <p className="eyebrow">
          <Link href="/recycled-content" className="hover:underline">Contenido reciclado</Link>{" "}
          · Lotes producidos / lotes finales
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Calcular por lote producido / lote final</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-soft">
          Cada cálculo queda congelado como snapshot inmutable con sus reglas,
          componentes y razones de inclusión o exclusión.
        </p>
      </header>

      {batches.length === 0 ? (
        <p className="text-sm text-ink-soft">
          No hay lotes producidos / lotes finales. Créalos en{" "}
          <Link href="/traceability/output-batches" className="text-loop underline">
            Trazabilidad
          </Link>.
        </p>
      ) : (
        <ul className="space-y-3">
          {batches.map((b) => {
            const comp = completenessByBatch.get(b.id);
            const calc = latestByBatch.get(b.id);
            const hasComposition = comp?.has_composition ?? false;
            const incomplete = comp?.traceability_status === "incomplete";
            return (
              <li key={b.id} className="rounded-lg border border-hairline bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      <span className="code text-xs text-loop-deep">{b.batch_code}</span>
                      {b.product_label ?? "Sin producto asociado"}
                      {comp ? <TraceabilityStatusBadge status={comp.traceability_status} /> : null}
                    </p>
                    <p className="text-xs text-ink-soft">orden {b.production_order_code}</p>
                    {calc ? (
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                        <span className="code">{calc.recycled_percent.toFixed(2)}%</span>
                        <DefensibilityBadge level={calc.defensibility_level} />
                        {calc.defensibility_level === "preliminary" ? (
                          <Link
                            href={`/audit-support/output-batches/${b.id}/evidence-matrix`}
                            className="text-xs text-loop hover:underline"
                          >
                            Ver causas en Soporte técnico
                          </Link>
                        ) : null}
                        <span className="text-xs text-ink-soft">
                          {new Date(calc.calculated_at).toLocaleDateString("es-CO")}
                        </span>
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-ink-soft">Sin cálculo todavía.</p>
                    )}
                    {incomplete && hasComposition ? (
                      <p className="mt-1 inline-block rounded-md border border-amber/40 bg-amber/10 px-2 py-0.5 text-xs text-amber">
                        La trazabilidad está incompleta: puedes calcular, pero el
                        resultado quedará como preliminar o con advertencias.
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <CalculateButton
                      outputBatchId={b.id}
                      hasCalculation={Boolean(calc)}
                      disabled={!hasComposition}
                      disabledReason="Sin composición registrada no se puede calcular. Regístrala en Trazabilidad."
                    />
                    <Link
                      href={`/recycled-content/output-batches/${b.id}`}
                      className="text-sm text-loop hover:underline"
                    >
                      Ver detalle
                    </Link>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
