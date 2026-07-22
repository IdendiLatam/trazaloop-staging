// Ruta protegida (guard del módulo en el layout del namespace /textiles).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireTextilesModule } from "@/lib/auth/require-textiles-module";
import { listTextileProductionOrders } from "@/lib/db/textiles-traceability";
import { listTextileReferences } from "@/lib/db/textiles-products";
import {
  TEXTILE_ORDER_STATUSES,
  TEXTILE_ORDER_STATUS_LABEL,
} from "@/lib/domain/textiles-traceability";
import {
  createTextileProductionOrderAction,
  type TextileOrderInput,
} from "@/server/actions/textiles-traceability";
import { TextileEntityForm } from "@/components/domain/textiles/entity-form";
import { isOneOf } from "@/lib/domain/textiles-catalogs";
import type { CatalogFieldDef } from "@/components/domain/textiles/catalog-manager";

export default async function TextileOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const org = await requireTextilesModule();
  const statusFilter = isOneOf(TEXTILE_ORDER_STATUSES, params.status ?? "") ? params.status : undefined;
  const [orders, references] = await Promise.all([
    listTextileProductionOrders(org.organizationId, { status: statusFilter }),
    listTextileReferences(org.organizationId),
  ]);

  const fields: CatalogFieldDef[] = [
    { key: "orderCode", label: "Código de la orden", type: "text", required: true, placeholder: "p. ej. OC-2026-001" },
    {
      key: "referenceId",
      label: "Referencia / SKU a producir",
      type: "select",
      required: true,
      options: [
        { value: "", label: "— Selecciona una referencia —" },
        ...references.filter((r) => r.isActive).map((r) => ({ value: r.id, label: r.sku })),
      ],
    },
    { key: "plannedQuantity", label: "Cantidad planeada", type: "text", placeholder: "p. ej. 500" },
    { key: "unit", label: "Unidad", type: "text", placeholder: "units", help: "Sin conversión automática: mantén consistencia manual" },
    { key: "plannedStartDate", label: "Inicio planeado (AAAA-MM-DD)", type: "text" },
    { key: "plannedEndDate", label: "Fin planeado (AAAA-MM-DD)", type: "text" },
    {
      key: "status",
      label: "Estado",
      type: "select",
      options: TEXTILE_ORDER_STATUSES.map((v) => ({ value: v, label: TEXTILE_ORDER_STATUS_LABEL[v] })),
    },
    { key: "responsibleArea", label: "Área responsable", type: "text" },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-1">
        <p className="eyebrow">Trazaloop Textiles · Trazabilidad</p>
        <h1 className="text-2xl font-semibold tracking-tight">Órdenes / corridas de confección</h1>
        <p className="max-w-2xl text-sm text-ink-soft">
          Cada orden conecta una referencia/SKU con sus consumos de lotes, procesos y
          lotes producidos.
        </p>
        <Link href="/textiles/traceability" className="text-sm font-medium text-loop hover:underline">
          ← Trazabilidad textil
        </Link>
      </header>

      <TextileEntityForm<TextileOrderInput>
        title="Nueva orden / corrida"
        fields={fields}
        initialValues={{ status: "draft", unit: "units" }}
        submitLabel="Crear orden"
        createAction={createTextileProductionOrderAction}
        successMessage="Orden creada. Ábrela para registrar consumos, procesos y lotes finales."
      />

      <section className="space-y-2">
        <form method="get" className="flex items-end gap-3 rounded-lg border border-hairline bg-surface p-3 text-sm">
          <label className="space-y-1">
            <span className="block text-xs font-medium text-ink-soft">Estado</span>
            <select name="status" defaultValue={statusFilter ?? ""} className="rounded-md border border-hairline bg-paper px-2 py-1">
              <option value="">Todos</option>
              {TEXTILE_ORDER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {TEXTILE_ORDER_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="rounded-md border border-hairline bg-paper px-3 py-1 text-xs font-medium hover:border-loop">
            Filtrar
          </button>
        </form>

        <h2 className="text-sm font-semibold">Órdenes ({orders.length})</h2>
        {orders.length === 0 ? (
          <p className="rounded-lg border border-hairline bg-surface p-4 text-sm text-ink-soft">
            No hay órdenes con esos criterios.
          </p>
        ) : (
          <ul className="space-y-2">
            {orders.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/textiles/traceability/orders/${o.id}`}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-hairline bg-surface p-3 text-sm transition-colors hover:border-loop"
                >
                  <span className="min-w-0 space-y-0.5">
                    <span className="block font-medium">
                      {o.orderCode}
                      {o.sku ? <span className="ml-2 text-xs text-ink-soft">{o.sku}</span> : null}
                    </span>
                    <span className="block text-xs text-ink-soft">
                      {[
                        o.productName ?? "",
                        o.plannedQuantity !== null ? `Planeado: ${o.plannedQuantity} ${o.unit}` : "",
                        o.producedQuantity !== null ? `Producido: ${o.producedQuantity} ${o.unit}` : "",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full border border-hairline bg-paper px-2 py-0.5 text-[10px] text-ink-soft">
                    {TEXTILE_ORDER_STATUS_LABEL[o.status as keyof typeof TEXTILE_ORDER_STATUS_LABEL] ?? o.status}
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
