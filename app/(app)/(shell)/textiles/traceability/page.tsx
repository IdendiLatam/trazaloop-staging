// Ruta protegida (guard del módulo en el layout del namespace /textiles).
export const dynamic = "force-dynamic";

// Trazaloop · Sprint T6 (Textil) · Centro de trazabilidad técnica.

import Link from "next/link";
import { requireTextilesModule } from "@/lib/auth/require-textiles-module";
import {
  listTextileProductionOrders,
  listTextileInputLots,
  listTextileOutputLots,
} from "@/lib/db/textiles-traceability";
import { TEXTILE_TRACEABILITY_DISCLAIMER } from "@/lib/domain/textiles-traceability";

export default async function TextileTraceabilityHubPage() {
  const org = await requireTextilesModule();
  const [orders, inputLots, outputLots] = await Promise.all([
    listTextileProductionOrders(org.organizationId),
    listTextileInputLots(org.organizationId),
    listTextileOutputLots(org.organizationId),
  ]);
  const needsReview = outputLots.filter((l) => l.traceabilityStatus === "needs_review").length;

  const cards = [
    {
      href: "/textiles/traceability/orders",
      title: "Órdenes / corridas de confección",
      description: `Qué referencia se produce, en qué cantidades y con qué procesos. ${orders.length} registrada${orders.length === 1 ? "" : "s"}.`,
      cta: "Ir a órdenes →",
    },
    {
      href: "/textiles/traceability/input-lots",
      title: "Lotes de entrada",
      description: `Telas, hilos y avíos recibidos, con proveedor, cantidad y saldo. ${inputLots.length} registrado${inputLots.length === 1 ? "" : "s"}.`,
      cta: "Ir a lotes de entrada →",
    },
    {
      href: "/textiles/traceability/output-lots",
      title: "Lotes producidos / finales",
      description: `Lo que salió de cada orden, con su estado de trazabilidad técnica. ${outputLots.length} registrado${outputLots.length === 1 ? "" : "s"}.`,
      cta: "Ir a lotes finales →",
    },
    {
      href: "/textiles/traceability/output-lots",
      title: "Brechas de trazabilidad",
      description:
        needsReview > 0
          ? `${needsReview} lote${needsReview === 1 ? "" : "s"} final${needsReview === 1 ? "" : "es"} con brechas que requieren revisión interna.`
          : "Sin lotes finales marcados con brechas por ahora.",
      cta: "Revisar brechas →",
    },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-1">
        <p className="eyebrow">Trazaloop Textiles · Trazabilidad</p>
        <h1 className="text-2xl font-semibold tracking-tight">Trazabilidad textil</h1>
        <p className="max-w-2xl text-sm text-ink-soft">
          Registra órdenes/corridas, lotes de entrada, consumos y lotes producidos para
          construir trazabilidad técnica textil.
        </p>
        <p className="max-w-2xl text-xs text-ink-soft">{TEXTILE_TRACEABILITY_DISCLAIMER}</p>
        <Link href="/textiles" className="text-sm font-medium text-loop hover:underline">
          ← Módulo Textil
        </Link>
        <p className="text-xs text-ink-soft">
          Procedimiento documental relacionado:{" "}
          <Link href="/textiles/trazadocs" className="text-loop hover:underline">
            Trazabilidad de órdenes y lotes (TXT-PRO-005) en TrazaDocs Textil →
          </Link>
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2">
        {cards.map((c) => (
          <Link
            key={c.title}
            href={c.href}
            className="flex flex-col gap-1 rounded-lg border border-hairline bg-surface p-4 transition-colors hover:border-loop"
          >
            <span className="text-sm font-semibold">{c.title}</span>
            <span className="text-xs text-ink-soft">{c.description}</span>
            <span className="text-sm font-medium text-loop">{c.cta}</span>
          </Link>
        ))}
      </section>
    </div>
  );
}
