// Ruta protegida (guard del módulo en el layout del namespace /textiles).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireTextilesModule } from "@/lib/auth/require-textiles-module";
import { listTextileOutputLots } from "@/lib/db/textiles-traceability";
import {
  TEXTILE_OUTPUT_LOT_STATUS_LABEL,
  TEXTILE_TRACEABILITY_STATUS_LABEL,
  TEXTILE_TRACEABILITY_DISCLAIMER,
  type TextileTraceabilityStatus,
} from "@/lib/domain/textiles-traceability";

const TRACE_TONE: Record<TextileTraceabilityStatus, string> = {
  not_started: "border-hairline bg-paper text-ink-soft",
  incomplete: "border-amber/40 bg-amber/10 text-amber",
  complete: "border-loop/30 bg-loop/5 text-loop-deep",
  needs_review: "border-danger/30 bg-danger/5 text-danger",
};

export default async function TextileOutputLotsPage() {
  const org = await requireTextilesModule();
  const lots = await listTextileOutputLots(org.organizationId);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-1">
        <p className="eyebrow">Trazaloop Textiles · Trazabilidad</p>
        <h1 className="text-2xl font-semibold tracking-tight">Lotes producidos / finales</h1>
        <p className="max-w-2xl text-sm text-ink-soft">
          Cada lote final nace desde una orden/corrida (se crean en el detalle de la
          orden) y hereda su cadena: referencia, consumos, procesos y evidencias.
        </p>
        <p className="max-w-2xl text-xs text-ink-soft">{TEXTILE_TRACEABILITY_DISCLAIMER}</p>
        <div className="flex gap-3">
          <Link href="/textiles/traceability" className="text-sm font-medium text-loop hover:underline">
            ← Trazabilidad textil
          </Link>
          <Link href="/textiles/traceability/orders" className="text-sm text-loop hover:underline">
            Ir a órdenes →
          </Link>
        </div>
      </header>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Lotes ({lots.length})</h2>
        {lots.length === 0 ? (
          <p className="rounded-lg border border-hairline bg-surface p-4 text-sm text-ink-soft">
            Aún no hay lotes finales. Crea una orden y registra su primer lote producido
            desde el detalle de la orden.
          </p>
        ) : (
          <ul className="space-y-2">
            {lots.map((l) => (
              <li key={l.id}>
                <Link
                  href={`/textiles/traceability/output-lots/${l.id}`}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-hairline bg-surface p-3 text-sm transition-colors hover:border-loop"
                >
                  <span className="min-w-0 space-y-0.5">
                    <span className="block font-medium">
                      {l.outputLotCode}
                      {l.sku ? <span className="ml-2 text-xs text-ink-soft">{l.sku}</span> : null}
                    </span>
                    <span className="block text-xs text-ink-soft">
                      {[
                        l.orderCode ? `Orden: ${l.orderCode}` : "",
                        l.productName ?? "",
                        `${l.quantityProduced} ${l.unit}`,
                        `${l.evidenceLinksCount} evidencia(s) directa(s)`,
                        TEXTILE_OUTPUT_LOT_STATUS_LABEL[l.status as keyof typeof TEXTILE_OUTPUT_LOT_STATUS_LABEL] ?? l.status,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${TRACE_TONE[l.traceabilityStatus as TextileTraceabilityStatus] ?? TRACE_TONE.not_started}`}>
                    {TEXTILE_TRACEABILITY_STATUS_LABEL[l.traceabilityStatus as TextileTraceabilityStatus] ?? l.traceabilityStatus}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
