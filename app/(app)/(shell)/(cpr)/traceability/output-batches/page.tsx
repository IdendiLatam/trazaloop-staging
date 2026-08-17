// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { orderMutationBlockedMessage } from "@/lib/domain/production-alerts";
// RH-01.3: missing_items lo genera la vista de completitud con la
// denominación histórica; se normaliza aquí, en presentación.
import { normalizeVisibleTexts } from "@/lib/domain/nomenclature";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { createServerClient } from "@/lib/supabase/server";
import {
  searchOutputBatches,
  getOutputBatch,
  listProductionOrders,
  listComposition,
  getCompleteness,
  listForwardUsesForOutputs,
} from "@/lib/db/traceability";
import { listEvidencesForTargets } from "@/lib/db/evidences";
import { listProducts, listMaterials } from "@/lib/db/catalog";
import {
  deleteOutputBatchAction,
  deleteBatchCompositionAction,
} from "@/server/actions/traceability";
import {
  OutputBatchForm,
  CompositionForm,
} from "@/components/domain/traceability/forms";
import {
  ActionButton,
  LinkEvidenceInline,
} from "@/components/domain/traceability/action-button";
import { TraceabilityStatusBadge } from "@/components/domain/traceability/status-badge";
import { getOutputBatchInventoryByIds } from "@/lib/db/inventory";
import { formatKg, inventoryState, INVENTORY_STATE_LABEL } from "@/lib/domain/inventory";
import { LinkedEvidenceList } from "@/components/domain/evidences/view-link";
import { ListSearchForm, ListPagination } from "@/components/ui/list-controls";
import { SuccessAlert } from "@/components/ui/alert";

export default async function OutputBatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; batch?: string; q?: string; page?: string; created?: string; updated?: string; focus?: string }>;
}) {
  const org = await requireActiveOrg();
  const supabase = await createServerClient();
  const params = await searchParams;

  // PCR-01 (punto 9): paginación real + búsqueda por código de lote.
  const [result, orders, products, materials, completeness, { data: evidenceRows }] =
    await Promise.all([
      searchOutputBatches(org.organizationId, { q: params.q, page: params.page }),
      listProductionOrders(org.organizationId),
      listProducts(org.organizationId),
      listMaterials(org.organizationId),
      getCompleteness(org.organizationId),
      supabase
        .from("evidences")
        .select("id, name")
        .eq("organization_id", org.organizationId)
        .order("name"),
    ]);
  const pageBatches = result.rows;
  // PCR-02.5 (§15): saldo interno de los lotes de la página, en UNA consulta
  // acotada a la vista de inventario. El listado sigue siendo consulta /
  // auditoría / inventario: la Orden / corrida permanece como eje (PCR-02).
  const inventoryByBatch = await getOutputBatchInventoryByIds(
    org.organizationId,
    pageBatches.map((b) => b.id)
  );

  // Con paginación, el lote editado/expandido puede no estar en la página.
  const editing =
    pageBatches.find((b) => b.id === params.edit) ??
    (params.edit ? await getOutputBatch(org.organizationId, params.edit) : undefined) ??
    undefined;
  const openBatch =
    pageBatches.find((b) => b.id === params.batch) ??
    (params.batch ? await getOutputBatch(org.organizationId, params.batch) : undefined) ??
    undefined;
  // PCR-01.1 (blockers 3/4): el lote expandido (?batch=), actualizado
  // (?updated=) o enfocado (?focus=) se muestra aunque quede fuera de la
  // página actual — resuelto por id y fijado al inicio sin duplicarlo.
  const focusId = params.updated ?? params.focus ?? null;
  const focusedBatch =
    pageBatches.find((b) => b.id === focusId) ??
    (focusId ? await getOutputBatch(org.organizationId, focusId) : undefined) ??
    undefined;
  const pinnedBatch = openBatch ?? focusedBatch;
  const batches =
    pinnedBatch && !pageBatches.some((b) => b.id === pinnedBatch.id)
      ? [pinnedBatch, ...pageBatches]
      : pageBatches;
  const composition = openBatch
    ? await listComposition(org.organizationId, openBatch.id)
    : [];
  const totalComposition = composition.reduce((acc, c) => acc + c.mass_kg, 0);

  // PCR-01 (punto 11): evidencias vinculadas de la página, en lote.
  const evidencesByBatch = await listEvidencesForTargets(
    org.organizationId,
    "output_batch",
    batches.map((b) => b.id)
  );

  // PCR-02 (Bloque F): dónde fue consumido después cada lote de la página.
  // PCR-02.1 (§49): incluir también el lote en edición (puede no estar en la
  // página actual) para poder fijar su orden productora si ya fue consumido.
  const forwardUses = await listForwardUsesForOutputs(
    org.organizationId,
    Array.from(new Set([...batches.map((b) => b.id), ...(editing ? [editing.id] : [])]))
  );

  // PCR-01 (puntos 2 y 7): confirmaciones + resaltado.
  const justCreated = params.created === "1" && openBatch;
  const highlightId = focusId;

  const completenessByBatch = new Map(completeness.map((c) => [c.output_batch_id, c]));
  const orderOptions = orders.map((o) => ({ value: o.id, label: o.order_code }));

  // PCR-02.1 (§49): si el lote en edición ya fue consumido, su orden se fija.
  const editingUses = editing ? (forwardUses[editing.id] ?? []) : [];
  const editingLockOrder =
    editing && editingUses.length > 0
      ? {
          label:
            orderOptions.find((o) => o.value === editing.production_order_id)?.label ??
            "Orden productora",
          consumers: editingUses.map((u) => u.order_code).join(", "),
        }
      : undefined;
  const productOptions = products.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }));
  const materialOptions = materials.map((m) => ({ value: m.id, label: m.name }));
  const evidenceOptions = (evidenceRows ?? []).map((e) => ({ value: e.id, label: e.name }));

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header>
        <p className="eyebrow">
          <Link href="/traceability" className="hover:underline">Trazabilidad</Link> · Lotes producidos / lotes finales
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Lotes producidos / lotes finales</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-soft">
          Registra el lote obtenido de una orden/corrida. Sobre este lote se
          calcula el contenido reciclado.
        </p>
      </header>

      {editing ? (
        <section className="rounded-lg border border-hairline bg-surface p-5">
          <h2 className="mb-4 text-sm font-semibold">Editar: {editing.batch_code}</h2>
          <OutputBatchForm
            orders={orderOptions}
            products={productOptions}
            editing={editing}
            lockOrder={editingLockOrder}
          />
          <Link href="/traceability/output-batches" className="mt-3 inline-block text-xs text-ink-soft hover:underline">
            Cancelar edición
          </Link>
        </section>
      ) : (
        // PCR-02 (Bloque G): el lote producido es una SALIDA de su orden, así
        // que se registra desde el detalle de la orden (asociación automática,
        // sin volver a preguntar la orden). Este listado queda como consulta,
        // edición y composición.
        <section className="rounded-lg border border-hairline bg-surface p-5">
          <h2 className="mb-1 text-sm font-semibold">¿Registrar un lote producido?</h2>
          <p className="text-sm text-ink-soft">
            Los lotes producidos se registran desde su{" "}
            <Link href="/traceability/production-orders" className="font-medium text-loop hover:underline">
              Orden / corrida de producción
            </Link>
            : abre la orden y usa «Registrar lote producido» en la sección
            «Lotes producidos / salidas de la orden». Así el lote queda asociado
            automáticamente a su orden y conserva su identidad si luego se
            consume como producto intermedio en otra orden.
          </p>
        </section>
      )}

      <div className="rounded-lg border border-hairline bg-surface p-4">
        <ListSearchForm
          basePath="/traceability/output-batches"
          q={params.q ?? ""}
          placeholder="Buscar por código de lote, características o aplicación…"
        />
      </div>

      <SuccessAlert message={highlightId ? "Cambios guardados correctamente." : null} />

      {batches.length === 0 ? (
        params.q ? (
          <p className="text-sm text-ink-soft">
            Sin resultados para esta búsqueda.{" "}
            <Link href="/traceability/output-batches" className="text-loop underline">
              Limpiar búsqueda
            </Link>
            .
          </p>
        ) : (
          <p className="text-sm text-ink-soft">Aún no hay lotes producidos / lotes finales.</p>
        )
      ) : (
        <ul className="space-y-3">
          {batches.map((b) => {
            const comp = completenessByBatch.get(b.id);
            const isHighlighted = highlightId === b.id || (justCreated && openBatch?.id === b.id);
            return (
              <li
                key={b.id}
                id={`lote-${b.id}`}
                className={`rounded-lg border bg-surface p-4 ${
                  isHighlighted ? "border-loop ring-2 ring-loop/30" : "border-hairline"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      <span className="code text-xs text-loop-deep">{b.batch_code}</span>
                      {b.product_label ?? "Sin producto asociado"}
                      {comp ? <TraceabilityStatusBadge status={comp.traceability_status} /> : null}
                      {highlightId === b.id ? (
                        <span className="rounded-full border border-loop/30 bg-loop/5 px-2 py-0.5 text-xs font-medium text-loop-deep">
                          Guardado correctamente
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-ink-soft">
                      orden{" "}
                      <Link
                        href={`/traceability/production-orders/${b.production_order_id}`}
                        className="text-loop hover:underline"
                      >
                        {b.production_order_code}
                      </Link>
                      {[
                        b.produced_date,
                        b.produced_quantity_kg !== null ? `${b.produced_quantity_kg} kg` : null,
                        b.intended_application,
                      ]
                        .filter(Boolean)
                        .map((part) => ` · ${part}`)
                        .join("")}
                    </p>
                    {(() => {
                      const inv = inventoryByBatch.get(b.id);
                      if (!inv) return null;
                      const state = inventoryState(inv.available_kg);
                      return (
                        <p className="mt-0.5 text-xs text-ink-soft">
                          Producido: {formatKg(inv.produced_kg)} · Consumido
                          internamente: {formatKg(inv.consumed_internally_kg)} ·
                          Disponible: {formatKg(inv.available_kg)}{" "}
                          <span
                            className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                              state === "available"
                                ? "bg-loop-soft text-loop-deep"
                                : "bg-hairline text-ink-soft"
                            }`}
                          >
                            {INVENTORY_STATE_LABEL[state]}
                          </span>
                        </p>
                      );
                    })()}
                    {(forwardUses[b.id] ?? []).length > 0 ? (
                      <p className="mt-0.5 text-xs text-ink-soft">
                        Consumido después en:{" "}
                        {(forwardUses[b.id] ?? []).map((u, i) => (
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
                    {comp && comp.missing_items.length > 0 ? (
                      <p className="mt-1 text-xs text-danger">
                        Falta: {normalizeVisibleTexts(comp.missing_items).join(", ")}.
                      </p>
                    ) : null}
                    {comp?.mass_balance_warning ? (
                      <p className="mt-1 inline-block rounded-md border border-amber/40 bg-amber/10 px-2 py-0.5 text-xs text-amber">
                        Advertencia de balance: consumido{" "}
                        {comp.consumed_mass_kg?.toFixed(2) ?? "—"} kg · composición{" "}
                        {comp.composition_mass_kg?.toFixed(2) ?? "—"} kg
                        {comp.produced_quantity_kg !== null
                          ? ` · producido ${comp.produced_quantity_kg.toFixed(2)} kg`
                          : ""}{" "}
                        (tolerancia 5%)
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <Link
                      href={`/traceability/output-batches?batch=${b.id}`}
                      className="text-sm font-semibold text-loop hover:underline"
                    >
                      {params.batch === b.id ? "Composición ▾" : "Composición"}
                    </Link>
                    <Link
                      href={`/traceability/genealogy?output=${b.id}`}
                      className="text-sm text-loop hover:underline"
                    >
                      Genealogía
                    </Link>
                    <Link href={`/traceability/output-batches?edit=${b.id}`} className="text-sm text-loop hover:underline">
                      Editar
                    </Link>
                    {/* PCR-02.4 (§49/§50): con la orden productora cerrada o
                        cancelada, el lote no puede eliminarse ni mutar su
                        estructura — se corrige reabriendo la orden. Editar
                        permanece: los campos DESCRIPTIVOS siguen siendo
                        corregibles (los estructurales los vetan la server
                        action y el trigger §2e). */}
                    {!orderMutationBlockedMessage(b.production_order_status) ? (
                      <ActionButton
                        action={deleteOutputBatchAction}
                        fields={{ id: b.id }}
                        label="Eliminar"
                        pendingLabel="Eliminando…"
                      />
                    ) : null}
                  </div>
                </div>

                {openBatch?.id === b.id ? (
                  <div id={`composicion-${b.id}`} className="mt-4 space-y-4 border-t border-hairline pt-4">
                    {justCreated ? (
                      <div className="space-y-1 rounded-md border border-loop/30 bg-loop/5 px-3 py-2.5">
                        <p role="status" className="text-sm font-semibold text-loop-deep">
                          Lote producido / lote final creado correctamente.
                        </p>
                        <p className="text-sm text-loop-deep">
                          Ahora registre la composición de materiales del lote:
                          es la base del cálculo de contenido reciclado.
                        </p>
                      </div>
                    ) : null}
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold">Composición del lote</h3>
                      <p className="mb-2 text-xs text-ink-soft">
                        La composición del lote producido define las masas
                        consideradas en el cálculo.
                      </p>
                      <span className="code text-sm text-ink-soft">
                        Total: {totalComposition.toFixed(2)} kg
                      </span>
                    </div>

                    {composition.length === 0 ? (
                      <p className="text-xs text-ink-soft">Sin composición registrada todavía.</p>
                    ) : (
                      <ul className="divide-y divide-hairline rounded-md border border-hairline">
                        {composition.map((c) => (
                          <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
                            <div>
                              <p className="text-sm">
                                {c.material_name}
                                {c.is_same_process ? (
                                  <span className="ml-2 rounded-full border border-hairline bg-paper px-2 py-0.5 text-[10px] uppercase tracking-wider text-ink-soft">
                                    mismo proceso
                                  </span>
                                ) : null}
                              </p>
                              <p className="code text-xs text-ink-soft">
                                {c.mass_kg} kg · {c.classification_code}
                              </p>
                            </div>
                            {!orderMutationBlockedMessage(b.production_order_status) ? (
                              <ActionButton
                                action={deleteBatchCompositionAction}
                                fields={{ id: c.id }}
                                label="Eliminar"
                                pendingLabel="Eliminando…"
                              />
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}

                    {/* PCR-02.4 (§12): composición congelada con la orden
                        productora cerrada — consulta y genealogía intactas. */}
                    {orderMutationBlockedMessage(b.production_order_status) ? (
                      <p className="rounded-md border border-hairline bg-paper px-3 py-2 text-xs text-ink-soft">
                        La orden productora está cerrada o cancelada: la composición se consulta en
                        modo auditoría. Reabre la orden para corregirla.
                      </p>
                    ) : materialOptions.length === 0 ? (
                      <p className="text-xs text-ink-soft">
                        Registra materiales en{" "}
                        <Link href="/catalog/materials" className="text-loop underline">Catálogos</Link>.
                      </p>
                    ) : (
                      <CompositionForm outputBatchId={b.id} materials={materialOptions} />
                    )}

                    <div className="space-y-3 border-t border-hairline pt-3">
                      <LinkedEvidenceList evidences={evidencesByBatch[b.id] ?? []} />
                      <LinkEvidenceInline
                        targetType="output_batch"
                        targetId={b.id}
                        evidences={evidenceOptions}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 border-t border-hairline pt-3">
                    <LinkedEvidenceList evidences={evidencesByBatch[b.id] ?? []} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <ListPagination
        basePath="/traceability/output-batches"
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        extraParams={{ q: params.q, batch: params.batch }}
      />
    </div>
  );
}
