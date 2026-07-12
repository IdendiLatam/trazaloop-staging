// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { listOutputBatches } from "@/lib/db/traceability";
import { listLatestCalculations } from "@/lib/db/recycled";
import { listEvidenceMatrix, listSupportGaps, GAP_SEVERITY_LABEL } from "@/lib/db/audit-support";
import { DefensibilityBadge } from "@/components/domain/recycled/defensibility-badge";
import { EvidenceMatrixTable } from "@/components/domain/audit-support/evidence-matrix-table";
import { ExportMatrixCsvButton } from "@/components/domain/audit-support/export-buttons";

export default async function EvidenceMatrixPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const org = await requireActiveOrg();
  const { id } = await params;

  const [batches, latest, evidences, gaps] = await Promise.all([
    listOutputBatches(org.organizationId),
    listLatestCalculations(org.organizationId),
    listEvidenceMatrix(org.organizationId, id),
    listSupportGaps(org.organizationId, id),
  ]);
  const batch = batches.find((b) => b.id === id);
  if (!batch) notFound();
  const calc = latest.find((l) => l.output_batch_id === id) ?? null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">
            <Link href="/audit-support" className="hover:underline">Soporte técnico</Link>{" "}
            · Matriz de evidencias
          </p>
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">
            <span className="code text-loop-deep">{batch.batch_code}</span>
            {calc ? <DefensibilityBadge level={calc.defensibility_level} /> : null}
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            {[batch.product_label ?? "Sin producto asociado", `orden ${batch.production_order_code}`]
              .filter(Boolean)
              .join(" · ")}
            {calc ? (
              <span>
                {" "}· último cálculo{" "}
                <span className="code">{calc.recycled_percent.toFixed(2)}%</span> del{" "}
                {new Date(calc.calculated_at).toLocaleDateString("es-CO")}
              </span>
            ) : (
              <span> · sin cálculo todavía</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {calc ? (
            <Link
              href={`/audit-support/calculations/${calc.calculation_id}`}
              className="rounded-md bg-loop px-4 py-2 text-sm font-semibold text-white hover:bg-loop-deep"
            >
              Ver dossier del último cálculo
            </Link>
          ) : (
            <Link
              href="/recycled-content/output-batches"
              className="rounded-md bg-loop px-4 py-2 text-sm font-semibold text-white hover:bg-loop-deep"
            >
              Ir a calcular
            </Link>
          )}
          <ExportMatrixCsvButton outputBatchId={id} />
        </div>
      </header>

      <section className="rounded-lg border border-hairline bg-surface p-5">
        <h2 className="eyebrow mb-3">Evidencias asociadas</h2>
        <p className="mb-3 text-xs text-ink-soft">
          Consolidado de las evidencias que soportan este lote por todas sus
          rutas: lote, orden, lotes de entrada, proveedores, materiales,
          producto y familia; incluye los soportes de origen y de
          reclasificación de los materiales de la composición aunque no tengan
          enlace explícito.
        </p>
        <EvidenceMatrixTable rows={evidences} />
      </section>

      <section className="rounded-lg border border-hairline bg-surface p-5">
        <h2 className="eyebrow mb-3">Brechas de este lote</h2>
        {gaps.length === 0 ? (
          <p className="text-sm text-ink-soft">No se identifican brechas críticas en este cálculo.</p>
        ) : (
          <ul className="divide-y divide-hairline text-sm">
            {gaps.map((g, i) => (
              <li key={i} className="py-2">
                <p className="flex flex-wrap items-center gap-2">
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
                  <span className="font-medium">{g.gap_label}</span>
                  {g.related_entity_label ? (
                    <span className="text-xs text-ink-soft">({g.related_entity_label})</span>
                  ) : null}
                </p>
                <p className="mt-1 text-xs text-ink-soft">{g.suggested_action}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
