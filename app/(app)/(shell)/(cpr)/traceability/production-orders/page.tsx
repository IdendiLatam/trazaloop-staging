// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { createServerClient } from "@/lib/supabase/server";
import {
  searchProductionOrders,
  getProductionOrder,
  listOutputsForOrders,
} from "@/lib/db/traceability";
import { deleteProductionOrderAction, reopenProductionOrderAction } from "@/server/actions/traceability";
import { ProductionOrderForm } from "@/components/domain/traceability/forms";
import { ActionButton } from "@/components/domain/traceability/action-button";
import { ListSearchForm, ListPagination } from "@/components/ui/list-controls";
import { formatProcessVariablesSummary } from "@/lib/domain/process-variables";
import {
  isProductionOrderOpenTooLong,
  productionOrderOpenDays,
  orderDeletionBlockedMessage,
  orderReopenAllowed,
} from "@/lib/domain/production-alerts";
import { ExportPdfButton } from "@/components/ui/export-pdf-button";

const STATUS_LABEL: Record<string, string> = {
  draft: "Borrador",
  in_progress: "En proceso",
  closed: "Cerrada",
  cancelled: "Cancelada",
};

/**
 * PCR-02 (Bloques A y G) · Listado de Órdenes / corridas: la puerta de
 * entrada al DETALLE de cada orden (el eje del proceso). El registro de
 * consumos y salidas vive en el detalle; aquí quedan búsqueda, paginación,
 * creación y edición de la orden.
 */
export default async function ProductionOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    edit?: string;
    order?: string;
    q?: string;
    page?: string;
    focus?: string;
  }>;
}) {
  const org = await requireActiveOrg();
  const supabase = await createServerClient();
  const params = await searchParams;

  // Compatibilidad PCR-01.1: los enlaces históricos ?order=<id> (expansión
  // inline retirada) llevan ahora al detalle de la orden.
  if (params.order) {
    redirect(`/traceability/production-orders/${params.order}#registro-${params.order}`);
  }

  // PCR-01 (punto 9): paginación real + búsqueda por número de orden.
  const [result, { data: sites }] = await Promise.all([
    searchProductionOrders(org.organizationId, { q: params.q, page: params.page }),
    supabase.from("sites").select("id, name").eq("organization_id", org.organizationId),
  ]);
  const orders = result.rows;

  // Con paginación, la orden editada/enfocada puede no estar en la página
  // (PCR-01.1, blocker 3): se resuelve por id y se fija sin duplicar.
  const editing =
    orders.find((o) => o.id === params.edit) ??
    (params.edit ? await getProductionOrder(org.organizationId, params.edit) : undefined) ??
    undefined;
  const focusId = params.focus ?? null;
  const focusedOrder =
    orders.find((o) => o.id === focusId) ??
    (focusId ? await getProductionOrder(org.organizationId, focusId) : undefined) ??
    undefined;
  const visibleOrders =
    focusedOrder && !orders.some((o) => o.id === focusedOrder.id)
      ? [focusedOrder, ...orders]
      : orders;

  // PCR-02: salidas por orden (chips) — una consulta por página.
  const outputsByOrder = await listOutputsForOrders(
    org.organizationId,
    visibleOrders.map((o) => o.id)
  );

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header>
        <p className="eyebrow">
          <Link href="/traceability" className="hover:underline">Trazabilidad</Link> · Órdenes / corridas de producción
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Órdenes / corridas de producción</h1>
        <div className="mt-2">
          <ExportPdfButton exportKey="cpr.production-order.list" disabled={result.total === 0} disabledReason="no hay órdenes" />
        </div>
        <p className="mt-1 max-w-2xl text-sm text-ink-soft">
          La orden / corrida es el eje del proceso: consume lotes (externos o
          producidos internos) y genera lotes producidos como salidas. Abre una
          orden para gestionar sus consumos y salidas.
        </p>
      </header>

      <section className="rounded-lg border border-hairline bg-surface p-5">
        <h2 className="mb-4 text-sm font-semibold">
          {editing ? `Editar: ${editing.order_code}` : "Nueva orden"}
        </h2>
        <ProductionOrderForm
          sites={(sites ?? []).map((s) => ({ value: s.id, label: s.name }))}
          editing={editing}
        />
        {editing ? (
          <Link href="/traceability/production-orders" className="mt-3 inline-block text-xs text-ink-soft hover:underline">
            Cancelar edición
          </Link>
        ) : null}
      </section>

      <div className="rounded-lg border border-hairline bg-surface p-4">
        <ListSearchForm
          basePath="/traceability/production-orders"
          q={params.q ?? ""}
          placeholder="Buscar por número de orden o pretratamiento…"
        />
      </div>

      {visibleOrders.length === 0 ? (
        <div className="rounded-lg border border-dashed border-hairline bg-surface px-6 py-8 text-center">
          {params.q ? (
            <>
              <p className="text-sm font-medium">Sin resultados para esta búsqueda.</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-ink-soft">
                Ajusta el término o{" "}
                <Link href="/traceability/production-orders" className="text-loop underline">
                  limpia la búsqueda
                </Link>
                .
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium">Aún no tienes órdenes / corridas de producción.</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-ink-soft">
                La orden/corrida conecta los lotes consumidos con los lotes
                producidos; el formulario está arriba en esta misma página.
              </p>
            </>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {visibleOrders.map((o) => {
            const variablesSummary = formatProcessVariablesSummary(o.process_variables);
            const isFocused = focusId === o.id;
            const stale = isProductionOrderOpenTooLong(o.status, o.created_at ?? null);
            const outputs = outputsByOrder[o.id] ?? [];
            return (
              <li
                key={o.id}
                id={`orden-${o.id}`}
                className={`rounded-lg border bg-surface p-4 ${
                  isFocused ? "border-loop ring-2 ring-loop/30" : "border-hairline"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">
                      <Link
                        href={`/traceability/production-orders/${o.id}`}
                        className="hover:underline"
                      >
                        <span className="code mr-2 text-xs text-loop-deep">{o.order_code}</span>
                        {STATUS_LABEL[o.status] ?? o.status}
                      </Link>
                      {stale && o.created_at ? (
                        <span className="ml-2 rounded-full border border-amber/40 bg-amber/10 px-2 py-0.5 text-xs font-medium text-amber">
                          Abierta hace {productionOrderOpenDays(o.created_at)} días
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-ink-soft">
                      {[
                        o.order_date,
                        o.site_name,
                        o.pretreatment,
                        outputs.length > 0
                          ? `${outputs.length} ${outputs.length === 1 ? "lote producido" : "lotes producidos"}`
                          : "sin lotes producidos",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {variablesSummary ? (
                      <p className="mt-0.5 text-xs text-ink-soft">
                        Variables de proceso: {variablesSummary}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <Link
                      href={`/traceability/production-orders/${o.id}`}
                      className="text-sm font-semibold text-loop hover:underline"
                    >
                      Abrir orden
                    </Link>
                    {/* PCR-02.3 (§34): la reapertura es explícita; la
                        edición genérica queda solo para órdenes abiertas. */}
                    {!orderReopenAllowed(o.status) ? (
                      <Link href={`/traceability/production-orders?edit=${o.id}`} className="text-sm text-loop hover:underline">
                        Editar
                      </Link>
                    ) : (
                      <ActionButton
                        action={reopenProductionOrderAction}
                        fields={{ id: o.id }}
                        label="Reabrir"
                        pendingLabel="Reabriendo…"
                      />
                    )}
                    {/* PCR-02.2/PCR-02.3: sin Eliminar sobre historial —
                        incluye reabiertas (candado histórico activo). */}
                    {!orderDeletionBlockedMessage(o.status, o.history_locked_at) ? (
                      <ActionButton
                        action={deleteProductionOrderAction}
                        fields={{ id: o.id }}
                        label="Eliminar"
                        pendingLabel="Eliminando…"
                      />
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ListPagination
        basePath="/traceability/production-orders"
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        extraParams={{ q: params.q }}
      />
    </div>
  );
}
