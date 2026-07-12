// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { createServerClient } from "@/lib/supabase/server";
import {
  listProductionOrders,
  listConsumption,
  listInputBatches,
} from "@/lib/db/traceability";
import {
  deleteProductionOrderAction,
  deleteBatchConsumptionAction,
} from "@/server/actions/traceability";
import {
  ProductionOrderForm,
  ConsumptionForm,
} from "@/components/domain/traceability/forms";
import {
  ActionButton,
  LinkEvidenceInline,
} from "@/components/domain/traceability/action-button";

const STATUS_LABEL: Record<string, string> = {
  draft: "Borrador",
  in_progress: "En proceso",
  closed: "Cerrada",
  cancelled: "Cancelada",
};

export default async function ProductionOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; order?: string }>;
}) {
  const org = await requireActiveOrg();
  const supabase = await createServerClient();
  const params = await searchParams;

  const [orders, inputBatches, { data: sites }, { data: evidenceRows }] = await Promise.all([
    listProductionOrders(org.organizationId),
    listInputBatches(org.organizationId),
    supabase.from("sites").select("id, name").eq("organization_id", org.organizationId),
    supabase
      .from("evidences")
      .select("id, name")
      .eq("organization_id", org.organizationId)
      .order("name"),
  ]);

  const editing = orders.find((o) => o.id === params.edit);
  const openOrder = orders.find((o) => o.id === params.order);
  const consumption = openOrder
    ? await listConsumption(org.organizationId, openOrder.id)
    : [];
  const totalConsumed = consumption.reduce((acc, c) => acc + c.mass_kg, 0);

  const siteOptions = (sites ?? []).map((s) => ({ value: s.id, label: s.name }));
  const evidenceOptions = (evidenceRows ?? []).map((e) => ({ value: e.id, label: e.name }));
  const inputBatchOptions = inputBatches.map((b) => ({
    value: b.id,
    label: `${b.batch_code} · ${b.material_name} (${b.supplier_name})`,
  }));

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header>
        <p className="eyebrow">
          <Link href="/traceability" className="hover:underline">Trazabilidad</Link> · Órdenes de producción
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Órdenes de producción</h1>
      </header>

      <section className="rounded-lg border border-hairline bg-surface p-5">
        <h2 className="mb-4 text-sm font-semibold">
          {editing ? `Editar: ${editing.order_code}` : "Nueva orden"}
        </h2>
        <ProductionOrderForm sites={siteOptions} editing={editing} />
        {editing ? (
          <Link href="/traceability/production-orders" className="mt-3 inline-block text-xs text-ink-soft hover:underline">
            Cancelar edición
          </Link>
        ) : null}
      </section>

      {orders.length === 0 ? (
        <p className="text-sm text-ink-soft">Aún no hay órdenes registradas.</p>
      ) : (
        <ul className="space-y-3">
          {orders.map((o) => (
            <li key={o.id} className="rounded-lg border border-hairline bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">
                    <span className="code mr-2 text-xs text-loop-deep">{o.order_code}</span>
                    {STATUS_LABEL[o.status] ?? o.status}
                  </p>
                  <p className="text-xs text-ink-soft">
                    {[o.order_date, o.site_name, o.pretreatment].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Link
                    href={`/traceability/production-orders?order=${o.id}`}
                    className="text-sm font-semibold text-loop hover:underline"
                  >
                    {params.order === o.id ? "Consumos ▾" : "Consumos"}
                  </Link>
                  <Link href={`/traceability/production-orders?edit=${o.id}`} className="text-sm text-loop hover:underline">
                    Editar
                  </Link>
                  <ActionButton
                    action={deleteProductionOrderAction}
                    fields={{ id: o.id }}
                    label="Eliminar"
                    pendingLabel="Eliminando…"
                  />
                </div>
              </div>

              {openOrder?.id === o.id ? (
                <div className="mt-4 space-y-4 border-t border-hairline pt-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Consumos de lotes de entrada</h3>
                    <span className="code text-sm text-ink-soft">
                      Total: {totalConsumed.toFixed(2)} kg
                    </span>
                  </div>

                  {consumption.length === 0 ? (
                    <p className="text-xs text-ink-soft">Sin consumos registrados todavía.</p>
                  ) : (
                    <ul className="divide-y divide-hairline rounded-md border border-hairline">
                      {consumption.map((c) => {
                        const over =
                          c.input_quantity_kg !== null &&
                          c.input_total_consumed_kg > c.input_quantity_kg;
                        return (
                          <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
                            <div>
                              <p className="text-sm">
                                <span className="code mr-2 text-xs text-loop-deep">{c.input_batch_code}</span>
                                {c.material_name} · {c.supplier_name}
                              </p>
                              <p className="code text-xs text-ink-soft">{c.mass_kg} kg</p>
                              {over ? (
                                <p className="mt-0.5 text-xs text-amber">
                                  Advertencia: el lote acumula {c.input_total_consumed_kg} kg consumidos
                                  y solo registró {c.input_quantity_kg} kg recibidos.
                                </p>
                              ) : null}
                            </div>
                            <ActionButton
                              action={deleteBatchConsumptionAction}
                              fields={{ id: c.id }}
                              label="Eliminar"
                              pendingLabel="Eliminando…"
                            />
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {inputBatchOptions.length === 0 ? (
                    <p className="text-xs text-ink-soft">
                      Registra primero{" "}
                      <Link href="/traceability/input-batches" className="text-loop underline">
                        lotes de entrada
                      </Link>.
                    </p>
                  ) : (
                    <ConsumptionForm productionOrderId={o.id} inputBatches={inputBatchOptions} />
                  )}

                  <div className="border-t border-hairline pt-3">
                    <LinkEvidenceInline
                      targetType="production_order"
                      targetId={o.id}
                      evidences={evidenceOptions}
                    />
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
