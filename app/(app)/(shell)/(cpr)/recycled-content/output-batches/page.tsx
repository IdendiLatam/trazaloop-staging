// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { listOutputBatches } from "@/lib/db/traceability";
import { listLatestCalculations } from "@/lib/db/recycled";
// PT-02A · El estado que se enseña es el del CÁLCULO, no el de la completitud
// histórica: aquella exigía composición manual y pintaba en rojo lotes que
// calculan perfectamente.
import {
  calculationState,
  structuralBlockers,
  type Defensibility,
} from "@/lib/domain/recycled-readiness";
import { CalculationStateBadge } from "@/components/domain/recycled/calculation-state-badge";
import { CalculateButton } from "@/components/domain/recycled/calculate-button";

export default async function RecycledOutputBatchesPage() {
  const org = await requireActiveOrg();
  // PT-02A · Sin `getCompleteness`: medía la completitud de la metodología
  // anterior y aquí solo servía para pintar en rojo lotes calculables.
  const [batches, latest] = await Promise.all([
    listOutputBatches(org.organizationId),
    listLatestCalculations(org.organizationId),
  ]);
  const latestByBatch = new Map(latest.map((l) => [l.output_batch_id, l]));
  // Cuántos lotes finales salieron de cada orden: es el único impedimento
  // estructural que no se ve mirando el lote solo.
  const lotesPorOrden = new Map<string, number>();
  for (const b of batches) {
    if (!b.production_order_id) continue;
    lotesPorOrden.set(b.production_order_id, (lotesPorOrden.get(b.production_order_id) ?? 0) + 1);
  }

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
            const calc = latestByBatch.get(b.id) ?? null;
            const estado = calculationState(calc);
            const hermanos = b.production_order_id
              ? lotesPorOrden.get(b.production_order_id) ?? 1
              : 1;
            return (
              <li key={b.id} className="rounded-lg border border-hairline bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      <span className="code text-xs text-loop-deep">{b.batch_code}</span>
                      {b.product_label ?? "Sin producto asociado"}
                      <CalculationStateBadge
                        state={estado}
                        defensibility={(calc?.defensibility_level ?? null) as Defensibility | null}
                        percent={calc?.recycled_percent ?? null}
                      />
                    </p>
                    <p className="text-xs text-ink-soft">orden {b.production_order_code}</p>
                    {calc ? (
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                        {estado === "incomplete" ? (
                          <Link
                            href={`/recycled-content/output-batches/${b.id}`}
                            className="text-loop hover:underline"
                          >
                            Ver qué falta
                          </Link>
                        ) : calc.defensibility_level === "preliminary" ? (
                          <Link
                            href={`/audit-support/output-batches/${b.id}/evidence-matrix`}
                            className="text-loop hover:underline"
                          >
                            Ver causas en Soporte técnico
                          </Link>
                        ) : null}
                        <span>{new Date(calc.calculated_at).toLocaleDateString("es-CO")}</span>
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <CalculateButton
                      outputBatchId={b.id}
                      hasCalculation={Boolean(calc)}
                      blockers={
                        b.production_order_id && hermanos <= 1
                          ? []
                          : structuralBlockers({
                              hasOrder: Boolean(b.production_order_id),
                              // La lista no trae los consumos de cada orden y
                              // traerlos sería una consulta por fila: que lo
                              // conteste el motor, que ya lo sabe.
                              hasConsumption: true,
                              outputBatchesInOrder: hermanos,
                            })
                      }
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
