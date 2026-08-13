// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import {
  getProductionOrder,
  listConsumption,
  listInternalConsumption,
  listOrderOutputs,
  listConsumableOutputs,
  listForwardUsesForOutputs,
  searchInputBatchOptions,
  searchEvidenceOptions,
  getCompleteness,
} from "@/lib/db/traceability";
import { listEvidencesForTargets } from "@/lib/db/evidences";
import { listProducts } from "@/lib/db/catalog";
import {
  deleteBatchConsumptionAction,
  deleteOutputConsumptionAction,
  deleteProductionOrderAction,
  reopenProductionOrderAction,
} from "@/server/actions/traceability";
import {
  ConsumptionForm,
  OutputConsumptionForm,
  OutputBatchForm,
} from "@/components/domain/traceability/forms";
import {
  ActionButton,
  LinkEvidenceInline,
} from "@/components/domain/traceability/action-button";
import { LinkedEvidenceList } from "@/components/domain/evidences/view-link";
import { TraceabilityStatusBadge } from "@/components/domain/traceability/status-badge";
import { SuccessAlert } from "@/components/ui/alert";
import { formatProcessVariablesSummary } from "@/lib/domain/process-variables";
import {
  isProductionOrderOpenTooLong,
  productionOrderOpenDays,
  openTooLongMessage,
  orderMutationBlockedMessage,
  orderDeletionBlockedMessage,
  isReopenedHistoricalOrder,
} from "@/lib/domain/production-alerts";

/** PCR-02.1 (hallazgo 4) · Buscador server-side de un selector acotado:
 *  formulario GET que conserva los términos de las otras secciones y ancla
 *  a la sección correspondiente. */
function SelectorSearch({
  actionHref,
  name,
  value,
  keep,
  placeholder,
  total,
  limit,
}: {
  actionHref: string;
  name: string;
  value: string;
  keep: Record<string, string>;
  placeholder: string;
  total: number;
  limit: number;
}) {
  return (
    <div className="space-y-1">
      <form action={actionHref} className="flex items-center gap-2">
        {Object.entries(keep)
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
        <input
          type="search"
          name={name}
          defaultValue={value}
          placeholder={placeholder}
          className="input h-8 max-w-xs text-xs"
          aria-label={placeholder}
        />
        <button type="submit" className="btn-secondary h-8 px-3 text-xs">
          Buscar
        </button>
      </form>
      {total > limit ? (
        <p className="text-xs text-ink-soft">
          Mostrando {limit} de {total} resultados: afina la búsqueda por código.
        </p>
      ) : null}
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Borrador",
  in_progress: "En proceso",
  closed: "Cerrada",
  cancelled: "Cancelada",
};

/**
 * PCR-02 (Bloque A) · Detalle de la Orden / corrida de producción: el eje del
 * proceso productivo. Desde aquí se ve y gestiona la identificación, las
 * ENTRADAS (dos orígenes: lotes de entrada externos y lotes producidos
 * internos), el proceso, las SALIDAS (lotes producidos de la orden, con
 * registro contextualizado) y las evidencias.
 */
export default async function ProductionOrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    created?: string;
    updated?: string;
    output_created?: string;
    in_q?: string;
    int_q?: string;
    ev_q?: string;
  }>;
}) {
  const org = await requireActiveOrg();
  const { id } = await params;
  const query = await searchParams;

  const order = await getProductionOrder(org.organizationId, id);
  if (!order) notFound();

  // PCR-02.1 (hallazgo 4): los selectores NO cargan universos completos.
  // Cada sección busca server-side por término (?in_q, ?int_q, ?ev_q) y
  // recibe como máximo SELECTOR_OPTIONS_LIMIT opciones de la empresa activa.
  const inQ = (query.in_q ?? "").trim();
  const intQ = (query.int_q ?? "").trim();
  const evQ = (query.ev_q ?? "").trim();
  const [
    consumption,
    internalConsumption,
    outputs,
    consumableSearch,
    inputBatchSearch,
    products,
    completeness,
    evidencesByOrder,
    evidenceSearch,
  ] = await Promise.all([
    listConsumption(org.organizationId, order.id),
    listInternalConsumption(org.organizationId, order.id),
    listOrderOutputs(org.organizationId, order.id),
    listConsumableOutputs(org.organizationId, order.id, intQ),
    searchInputBatchOptions(org.organizationId, inQ),
    listProducts(org.organizationId),
    getCompleteness(org.organizationId),
    listEvidencesForTargets(org.organizationId, "production_order", [id]),
    searchEvidenceOptions(org.organizationId, evQ),
  ]);
  const consumableOutputs = consumableSearch.options;

  const forwardUses = await listForwardUsesForOutputs(
    org.organizationId,
    outputs.map((o) => o.id)
  );
  const completenessByOutput = new Map(completeness.map((c) => [c.output_batch_id, c]));

  const totalExternal = consumption.reduce((acc, c) => acc + c.mass_kg, 0);
  const totalInternal = internalConsumption.reduce((acc, c) => acc + c.mass_kg, 0);
  const totalConsumed = totalExternal + totalInternal;
  const totalProduced = outputs.reduce((acc, o) => acc + (o.produced_quantity_kg ?? 0), 0);

  const variablesSummary = formatProcessVariablesSummary(order.process_variables);
  const mutationBlocked = orderMutationBlockedMessage(order.status);
  const stale = isProductionOrderOpenTooLong(order.status, order.created_at ?? null);
  const staleDays = order.created_at ? productionOrderOpenDays(order.created_at) : 0;
  const closedWithoutOutputs = order.status === "closed" && outputs.length === 0;

  const inputBatchOptions = inputBatchSearch.options;
  const evidenceOptions = evidenceSearch.options;
  const createdBanner = query.created === "1";
  const updatedBanner = query.updated === "1";
  const outputCreatedId = query.output_created ?? null;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header id={`registro-${order.id}`} className="space-y-2">
        <p className="eyebrow">
          <Link href="/traceability" className="hover:underline">Trazabilidad</Link>
          {" · "}
          <Link href="/traceability/production-orders" className="hover:underline">
            Órdenes / corridas de producción
          </Link>
          {" · "}
          {order.order_code}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            <span className="code mr-2 text-lg text-loop-deep">{order.order_code}</span>
            Orden / corrida de producción
          </h1>
          <div className="flex items-center gap-3">
            <span className="rounded-full border border-hairline bg-paper px-2.5 py-0.5 text-xs font-medium">
              {STATUS_LABEL[order.status] ?? order.status}
            </span>
            {/* PCR-02.3 (§14/§34): la orden finalizada NO ofrece edición
                genérica — la reapertura es una acción explícita y auditada
                que conserva el candado histórico. */}
            {!mutationBlocked ? (
              <Link
                href={`/traceability/production-orders?edit=${order.id}`}
                className="text-sm text-loop hover:underline"
              >
                Editar
              </Link>
            ) : (
              <ActionButton
                action={reopenProductionOrderAction}
                fields={{ id: order.id }}
                label="Reabrir orden"
                pendingLabel="Reabriendo…"
              />
            )}
            {/* PCR-02.2/PCR-02.3 (hallazgo A + bypass): sin Eliminar sobre
                historial — incluye órdenes reabiertas (candado activo). */}
            {!orderDeletionBlockedMessage(order.status, order.history_locked_at) ? (
              <ActionButton
                action={deleteProductionOrderAction}
                fields={{ id: order.id }}
                label="Eliminar"
                pendingLabel="Eliminando…"
              />
            ) : null}
          </div>
        </div>

        <SuccessAlert message={updatedBanner ? "Cambios guardados correctamente." : null} />

        {/* PCR-02.3 (§32): indicación discreta — operativamente abierta,
            históricamente irreversible (por eso no puede eliminarse). */}
        {isReopenedHistoricalOrder(order.status, order.history_locked_at) ? (
          <p className="rounded-md border border-hairline bg-paper px-3 py-2 text-xs text-ink-soft">
            Orden histórica reabierta: puede corregirse, pero forma parte del historial de
            trazabilidad y no puede eliminarse.
          </p>
        ) : null}

        {/* PCR-02 (Bloque I): alerta de orden abierta demasiado tiempo. */}
        {stale ? (
          <p
            role="status"
            className="rounded-md border border-amber/40 bg-amber/10 px-3 py-2 text-sm text-amber"
          >
            {openTooLongMessage(staleDays)}
          </p>
        ) : null}
        {closedWithoutOutputs ? (
          <p className="rounded-md border border-amber/40 bg-amber/10 px-3 py-2 text-sm text-amber">
            Orden cerrada sin lotes producidos registrados: verifica si faltó
            registrar la producción de esta corrida.
          </p>
        ) : null}
      </header>

      {/* Identificación y proceso (Bloque A / J: datos reales existentes). */}
      <section className="rounded-lg border border-hairline bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold">Identificación y proceso</h2>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-ink-soft">Fecha de la orden</dt>
            <dd>{order.order_date}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-soft">Sede</dt>
            <dd>{order.site_name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-soft">Pretratamiento</dt>
            <dd>{order.pretreatment ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-soft">Creada en el sistema</dt>
            <dd>{order.created_at ? order.created_at.slice(0, 10) : "—"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-ink-soft">Variables de proceso</dt>
            <dd>{variablesSummary ?? "Sin variables registradas."}</dd>
          </div>
          {order.notes ? (
            <div className="sm:col-span-2">
              <dt className="text-xs text-ink-soft">Observaciones</dt>
              <dd>{order.notes}</dd>
            </div>
          ) : null}
        </dl>
        <div className="mt-4 space-y-3 border-t border-hairline pt-3">
          <LinkedEvidenceList evidences={evidencesByOrder[order.id] ?? []} />
          <SelectorSearch
            actionHref={`/traceability/production-orders/${order.id}#registro-${order.id}`}
            name="ev_q"
            value={evQ}
            keep={{ in_q: inQ, int_q: intQ }}
            placeholder="Buscar evidencia por nombre…"
            total={evidenceSearch.total}
            limit={evidenceSearch.limit}
          />
          <LinkEvidenceInline
            targetType="production_order"
            targetId={order.id}
            evidences={evidenceOptions}
          />
        </div>
      </section>

      {/* ENTRADAS · dos orígenes (Bloques D/E) */}
      <section
        id={`consumos-${order.id}`}
        className="space-y-5 rounded-lg border border-hairline bg-surface p-5"
      >
        {createdBanner ? (
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
          <h2 className="text-sm font-semibold">Materiales / lotes consumidos</h2>
          <span className="code text-sm text-ink-soft">Total: {totalConsumed.toFixed(2)} kg</span>
        </div>
        <p className="text-xs text-ink-soft">
          Una orden puede consumir lotes de entrada externos (materia prima,
          material recibido) y lotes producidos internos (producto intermedio
          de otra orden). Ambos orígenes alimentan la misma trazabilidad.
        </p>

        {mutationBlocked ? (
          <p className="rounded-md border border-amber/40 bg-amber/10 px-3 py-2 text-xs text-amber">
            {mutationBlocked} La orden queda en modo consulta / auditoría: puedes
            revisar consumos, salidas, evidencias y genealogía, pero no
            modificar su estructura.
          </p>
        ) : null}

        {/* Origen A: lotes de entrada externos */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Lotes de entrada (externos)
          </h3>
          {consumption.length === 0 ? (
            <p className="text-xs text-ink-soft">Sin consumos de lotes de entrada.</p>
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
                        <span className="ml-2 rounded-full border border-hairline bg-paper px-2 py-0.5 text-xs text-ink-soft">
                          Lote de entrada
                        </span>
                      </p>
                      <p className="code text-xs text-ink-soft">{c.mass_kg} kg</p>
                      {over ? (
                        <p className="mt-0.5 text-xs text-amber">
                          Advertencia: el lote acumula {c.input_total_consumed_kg} kg consumidos
                          y solo registró {c.input_quantity_kg} kg recibidos.
                        </p>
                      ) : null}
                    </div>
                    {!mutationBlocked ? (
                      <ActionButton
                        action={deleteBatchConsumptionAction}
                        fields={{ id: c.id }}
                        label="Eliminar"
                        pendingLabel="Eliminando…"
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          {!mutationBlocked ? (
            <SelectorSearch
              actionHref={`/traceability/production-orders/${order.id}#consumos-${order.id}`}
              name="in_q"
              value={inQ}
              keep={{ int_q: intQ, ev_q: evQ }}
              placeholder="Buscar lote de entrada por código…"
              total={inputBatchSearch.total}
              limit={inputBatchSearch.limit}
            />
          ) : null}
          {!mutationBlocked ? (
            inputBatchOptions.length === 0 && !inQ ? (
              <p className="text-xs text-ink-soft">
                Registra primero{" "}
                <Link href="/traceability/input-batches" className="text-loop underline">
                  lotes de entrada
                </Link>
                .
              </p>
            ) : (
              <ConsumptionForm productionOrderId={order.id} inputBatches={inputBatchOptions} />
            )
          ) : null}
        </div>

        {/* Origen B: lotes producidos internos (Bloques D/E) */}
        <div className="space-y-3 border-t border-hairline pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Lotes producidos internos (producto intermedio)
          </h3>
          {internalConsumption.length === 0 ? (
            <p className="text-xs text-ink-soft">
              Sin consumos de lotes producidos internos.
            </p>
          ) : (
            <ul className="divide-y divide-hairline rounded-md border border-hairline">
              {internalConsumption.map((c) => {
                const over =
                  c.produced_quantity_kg !== null &&
                  c.output_total_consumed_kg > c.produced_quantity_kg;
                return (
                  <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div>
                      <p className="text-sm">
                        <span className="code mr-2 text-xs text-loop-deep">{c.output_batch_code}</span>
                        {c.product_label ?? "Lote producido"}
                        <span className="ml-2 rounded-full border border-loop/30 bg-loop/5 px-2 py-0.5 text-xs text-loop-deep">
                          Lote producido interno
                        </span>
                      </p>
                      <p className="code text-xs text-ink-soft">
                        {c.mass_kg} kg · producido por{" "}
                        {c.producer_order_id ? (
                          <Link
                            href={`/traceability/production-orders/${c.producer_order_id}`}
                            className="text-loop hover:underline"
                          >
                            {c.producer_order_code}
                          </Link>
                        ) : (
                          c.producer_order_code
                        )}
                      </p>
                      {over ? (
                        <p className="mt-0.5 text-xs text-amber">
                          Advertencia: el lote acumula {c.output_total_consumed_kg} kg consumidos
                          y su producción registrada fue {c.produced_quantity_kg} kg.
                        </p>
                      ) : null}
                    </div>
                    {!mutationBlocked ? (
                      <ActionButton
                        action={deleteOutputConsumptionAction}
                        fields={{ id: c.id }}
                        label="Eliminar"
                        pendingLabel="Eliminando…"
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          {!mutationBlocked ? (
            <SelectorSearch
              actionHref={`/traceability/production-orders/${order.id}#consumos-${order.id}`}
              name="int_q"
              value={intQ}
              keep={{ in_q: inQ, ev_q: evQ }}
              placeholder="Buscar lote producido por código…"
              total={consumableSearch.total}
              limit={consumableSearch.limit}
            />
          ) : null}
          {!mutationBlocked ? (
            consumableOutputs.length === 0 && !intQ ? (
              <p className="text-xs text-ink-soft">
                Aún no hay lotes producidos por otras órdenes que puedan consumirse aquí.
              </p>
            ) : consumableOutputs.length === 0 ? (
              <p className="text-xs text-ink-soft">
                Sin resultados para «{intQ}». Ajusta la búsqueda.
              </p>
            ) : (
              <OutputConsumptionForm
                productionOrderId={order.id}
                outputBatches={consumableOutputs}
              />
            )
          ) : null}
        </div>
      </section>

      {/* SALIDAS de la orden (Bloques B/C/G) */}
      <section
        id="salidas"
        className="space-y-4 rounded-lg border border-hairline bg-surface p-5"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Lotes producidos / salidas de la orden</h2>
          <span className="code text-sm text-ink-soft">
            {outputs.length} {outputs.length === 1 ? "salida" : "salidas"}
            {totalProduced > 0 ? ` · ${totalProduced.toFixed(2)} kg` : ""}
          </span>
        </div>
        <p className="text-xs text-ink-soft">
          El lote producido es una salida de esta orden. Una orden puede
          producir uno o varios lotes (final o intermedio); un lote intermedio
          puede consumirse después en otra orden.
        </p>

        {outputs.length === 0 ? (
          <p className="text-xs text-ink-soft">Esta orden aún no registra lotes producidos.</p>
        ) : (
          <ul className="space-y-2">
            {outputs.map((o) => {
              const comp = completenessByOutput.get(o.id);
              const uses = forwardUses[o.id] ?? [];
              const isNew = outputCreatedId === o.id;
              return (
                <li
                  key={o.id}
                  id={`salida-${o.id}`}
                  className={`rounded-md border px-3 py-2.5 ${
                    isNew ? "border-loop ring-2 ring-loop/30" : "border-hairline"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">
                      <span className="code mr-2 text-xs text-loop-deep">{o.batch_code}</span>
                      {o.product_label ?? "Sin producto asociado"}
                      {comp ? <span className="ml-2 inline-flex"><TraceabilityStatusBadge status={comp.traceability_status} /></span> : null}
                      {isNew ? (
                        <span className="ml-2 rounded-full border border-loop/30 bg-loop/5 px-2 py-0.5 text-xs font-medium text-loop-deep">
                          Creado correctamente
                        </span>
                      ) : null}
                    </p>
                    <div className="flex items-center gap-3 text-sm">
                      <Link
                        href={`/traceability/output-batches?batch=${o.id}#lote-${o.id}`}
                        className="text-loop hover:underline"
                      >
                        Composición y detalle
                      </Link>
                      <Link
                        href={`/traceability/genealogy?output=${o.id}`}
                        className="text-loop hover:underline"
                      >
                        Genealogía
                      </Link>
                    </div>
                  </div>
                  <p className="text-xs text-ink-soft">
                    {[
                      o.produced_date ? `producido ${o.produced_date}` : null,
                      o.produced_quantity_kg !== null ? `${o.produced_quantity_kg} kg` : "sin cantidad registrada",
                      o.storage_location,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {uses.length > 0 ? (
                    <p className="mt-1 text-xs text-ink-soft">
                      Consumido después en:{" "}
                      {uses.map((u, i) => (
                        <span key={u.order_id}>
                          {i > 0 ? " · " : ""}
                          <Link
                            href={`/traceability/production-orders/${u.order_id}`}
                            className="text-loop hover:underline"
                          >
                            {u.order_code}
                          </Link>{" "}
                          ({u.mass_kg} kg)
                        </span>
                      ))}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {outputCreatedId ? (
          <div className="space-y-1 rounded-md border border-loop/30 bg-loop/5 px-3 py-2.5">
            <p role="status" className="text-sm font-semibold text-loop-deep">
              Lote producido registrado correctamente.
            </p>
            <p className="text-sm text-loop-deep">
              Registra ahora su composición de materiales (base del contenido
              reciclado) desde «Composición y detalle», o continúa con más
              salidas de esta orden.
            </p>
          </div>
        ) : null}

        {!mutationBlocked ? (
          <div className="border-t border-hairline pt-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-soft">
              Registrar lote producido
            </h3>
            <OutputBatchForm
              orders={[]}
              products={products.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))}
              fixedOrder={{ id: order.id, label: order.order_code }}
            />
          </div>
        ) : null}
      </section>

      <p className="text-sm">
        <Link href="/traceability/production-orders" className="text-loop hover:underline">
          ← Volver al listado de órdenes / corridas
        </Link>
      </p>
    </div>
  );
}
