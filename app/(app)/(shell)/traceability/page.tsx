// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { getTraceabilityMetrics } from "@/lib/db/traceability";

export default async function TraceabilityIndexPage() {
  const org = await requireActiveOrg();
  const m = await getTraceabilityMetrics(org.organizationId);

  const cards = [
    { href: "/traceability/input-batches", title: "Lotes de entrada", count: m.inputBatches, hint: "Material que ingresa, con proveedor y clasificación." },
    { href: "/traceability/production-orders", title: "Órdenes / corridas de producción", count: m.productionOrders, hint: "Dónde se consumen los lotes de entrada." },
    { href: "/traceability/output-batches", title: "Lotes producidos / lotes finales", count: m.outputBatches, hint: "Producto terminado con su composición." },
    { href: "/traceability/genealogy", title: "Genealogía", count: null, hint: "Reconstruye la cadena hacia atrás y hacia adelante." },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
        <p className="eyebrow">Trazabilidad</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Trazabilidad de {org.organizationName}
        </h1>
        <p className="max-w-2xl text-sm text-ink-soft">
          Registra la cadena lote a lote: entrada → orden → salida →
          composición. Sobre estos datos se calcula el contenido reciclado y
          se construye el dossier técnico.
        </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/guided-flow"
            className="rounded-md bg-loop px-4 py-2 text-sm font-semibold text-white hover:bg-loop-deep"
          >
            Continuar en flujo guiado
          </Link>
          <Link
            href="/recycled-content/output-batches"
            className="rounded-md border border-hairline bg-surface px-3 py-2 text-sm font-medium hover:border-loop"
          >
            Calcular contenido reciclado
          </Link>
          <Link
            href="/audit-support"
            className="rounded-md border border-hairline bg-surface px-3 py-2 text-sm font-medium hover:border-loop"
          >
            Ver matriz de evidencias
          </Link>
          <Link
            href="/support/new?module=traceability"
            className="rounded-md border border-hairline bg-surface px-3 py-2 text-sm font-medium text-ink-soft hover:border-loop"
          >
            Crear ticket de soporte sobre trazabilidad
          </Link>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="rounded-lg border border-hairline bg-surface p-5 transition-colors hover:border-loop"
          >
            <div className="flex items-baseline justify-between">
              <h2 className="font-semibold">{c.title}</h2>
              {c.count !== null ? (
                <span className="code text-2xl font-semibold text-loop">{c.count}</span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-ink-soft">{c.hint}</p>
          </Link>
        ))}
      </div>

      <section className="rounded-lg border border-hairline bg-surface p-5">
        <h2 className="eyebrow mb-4">Estado general de trazabilidad</h2>
        <dl className="grid grid-cols-3 gap-4 text-center">
          <div>
            <dt className="text-xs text-ink-soft">Lotes completos</dt>
            <dd className="code text-2xl font-semibold text-loop-deep">{m.completeBatches}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-soft">Con advertencias</dt>
            <dd className="code text-2xl font-semibold text-amber">{m.warningBatches}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-soft">Incompletos</dt>
            <dd className="code text-2xl font-semibold text-danger">{m.incompleteBatches}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-ink-soft">
          Un lote producido / lote final está completo cuando tiene orden, consumos,
          composición y la información de proveedor y material de sus entradas.
          Las advertencias señalan diferencias de balance de masa mayores al 5%.
        </p>
      </section>
    </div>
  );
}
