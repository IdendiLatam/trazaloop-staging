// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { createServerClient } from "@/lib/supabase/server";
import {
  searchProductionOrders,
  getProductionOrder,
  listConsumption,
  listInputBatches,
} from "@/lib/db/traceability";
import { listEvidencesForTargets } from "@/lib/db/evidences";
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
import { LinkedEvidenceList } from "@/components/domain/evidences/view-link";
import { ListSearchForm, ListPagination } from "@/components/ui/list-controls";
import { SuccessAlert } from "@/components/ui/alert";
import { formatProcessVariablesSummary } from "@/lib/domain/process-variables";

const STATUS_LABEL: Record<string, string> = {
  draft: "Borrador",
  in_progress: "En proceso",
  closed: "Cerrada",
  cancelled: "Cancelada",
};

export default async function ProductionOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    edit?: string;
    order?: string;
    q?: string;
    page?: string;
    created?: string;
    updated?: string;
    focus?: string;
  }>;
}) {
  const org = await requireActiveOrg();
  const supabase = await createServerClient();
  const params = await searchParams;

  // PCR-01 (punto 9): paginación real + búsqueda por número de orden.
  const [result, inputBatches, { data: sites }, { data: evidenceRows }] = await Promise.all([
    searchProductionOrders(org.organizationId, { q: params.q, page: params.page }),
    listInputBatches(org.organizationId),
    supabase.from("sites").select("id, name").eq("organization_id", org.organizationId),
    supabase
      .from("evidences")
      .select("id, name")
      .eq("organization_id", org.organizationId)
      .order("name"),
  ]);
  const orders = result.rows;

  // Con paginación, la orden editada o expandida puede no estar en la página.
  const editing =
    orders.find((o) => o.id === params.edit) ??
    (params.edit ? await getProductionOrder(org.organizationId, params.edit) : undefined) ??
    undefined;
  const openOrder =
    orders.find((o) => o.id === params.order) ??
    (params.order ? await getProductionOrder(org.organizationId, params.order) : undefined) ??
    undefined;
  const consumption = openOrder
    ? await listConsumption(org.organizationId, openOrder.id)
    : [];
  const totalConsumed = consumption.reduce((acc, c) => acc + c.mass_kg, 0);

  // PCR-01.1 (blockers 3/4): la orden expandida (?order=), actualizada
  // (?updated=) o enfocada (?focus=) se muestra aunque quede fuera de la
  // página actual — resuelta por id y fijada al inicio sin duplicarla.
  const focusId = params.updated ?? params.focus ?? null;
  const focusedOrder =
    orders.find((o) => o.id === focusId) ??
    (focusId ? await getProductionOrder(org.organizationId, focusId) : undefined) ??
    undefined;
  const pinnedOrder = openOrder ?? focusedOrder;
  const visibleOrders =
    pinnedOrder && !orders.some((o) => o.id === pinnedOrder.id)
      ? [pinnedOrder, ...orders]
      : orders;

  // PCR-01 (punto 11): evidencias vinculadas de las órdenes visibles.
  const evidencesByOrder = await listEvidencesForTargets(
    org.organizationId,
    "production_order",
    visibleOrders.map((o) => o.id)
  );

  const siteOptions = (sites ?? []).map((s) => ({ value: s.id, label: s.name }));
  const evidenceOptions = (evidenceRows ?? []).map((e) => ({ value: e.id, label: e.name }));
  const inputBatchOptions = inputBatches.map((b) => ({
    value: b.id,
    label: `${b.batch_code} · ${b.material_name} (${b.supplier_name})`,
  }));

  // PCR-01 (puntos 2, 7 y 14): confirmaciones.
  const justCreated = params.created === "1" && openOrder;
  const highlightId = focusId;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header>
        <p className="eyebrow">
          <Link href="/traceability" className="hover:underline">Trazabilidad</Link> · Órdenes / corridas de producción
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Órdenes / corridas de producción</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-soft">
          Registra el proceso o corrida donde se consumen lotes de entrada y
          se generan uno o varios lotes producidos.
        </p>
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

      <div className="rounded-lg border border-hairline bg-surface p-4">
        <ListSearchForm
          basePath="/traceability/production-orders"
          q={params.q ?? ""}
          placeholder="Buscar por número de orden o pretratamiento…"
        />
      </div>

      <SuccessAlert message={highlightId ? "Cambios guardados correctamente." : null} />

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
                La orden/corrida conecta los lotes de entrada consumidos con los
                lotes producidos; el formulario está arriba en esta misma página.
              </p>
            </>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {visibleOrders.map((o) => {
            const variablesSummary = formatProcessVariablesSummary(o.process_variables);
            const isHighlighted = highlightId === o.id;
            return (
              <li
                key={o.id}
                id={`orden-${o.id}`}
                className={`rounded-lg border bg-surface p-4 ${
                  isHighlighted || (justCreated && openOrder?.id === o.id)
                    ? "border-loop ring-2 ring-loop/30"
                    : "border-hairline"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">
                      <span className="code mr-2 text-xs text-loop-deep">{o.order_code}</span>
                      {STATUS_LABEL[o.status] ?? o.status}
                      {isHighlighted ? (
                        <span className="ml-2 rounded-full border border-loop/30 bg-loop/5 px-2 py-0.5 text-xs font-medium text-loop-deep">
                          Guardado correctamente
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-ink-soft">
                      {[o.order_date, o.site_name, o.pretreatment].filter(Boolean).join(" · ")}
                    </p>
                    {variablesSummary ? (
                      <p className="mt-0.5 text-xs text-ink-soft">
                        Variables de proceso: {variablesSummary}
                      </p>
                    ) : null}
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
                  <div
                    id={`consumos-${o.id}`}
                    className="mt-4 space-y-4 border-t border-hairline pt-4"
                  >
                    {justCreated ? (
                      // PCR-01 (punto 14): confirmación + guía del siguiente
                      // paso, exactamente donde debe ocurrir la acción.
                      <div className="space-y-1 rounded-md border border-loop/30 bg-loop/5 px-3 py-2.5">
                        <p role="status" className="text-sm font-semibold text-loop-deep">
                          Orden / corrida de producción creada correctamente.
                        </p>
                        <p className="text-sm text-loop-deep">
                          Ahora registre los lotes y cantidades realmente consumidos en esta producción.
                        </p>
                      </div>
                    ) : null}

                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold">Materiales / lotes consumidos</h3>
                      <span className="code text-sm text-ink-soft">
                        Total: {totalConsumed.toFixed(2)} kg
                      </span>
                    </div>
                    <p className="text-xs text-ink-soft">
                      El consumo conecta los lotes de entrada con la
                      orden/corrida de producción.
                    </p>

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

                    <div className="space-y-3 border-t border-hairline pt-3">
                      <LinkedEvidenceList evidences={evidencesByOrder[o.id] ?? []} />
                      <LinkEvidenceInline
                        targetType="production_order"
                        targetId={o.id}
                        evidences={evidenceOptions}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 border-t border-hairline pt-3">
                    <LinkedEvidenceList evidences={evidencesByOrder[o.id] ?? []} />
                  </div>
                )}
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
        extraParams={{ q: params.q, order: params.order }}
      />
    </div>
  );
}
