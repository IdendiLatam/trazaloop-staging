// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { createServerClient } from "@/lib/supabase/server";
import {
  searchOutputBatches,
  getOutputBatch,
  listProductionOrders,
  listComposition,
  getCompleteness,
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

  // PCR-01 (puntos 2 y 7): confirmaciones + resaltado.
  const justCreated = params.created === "1" && openBatch;
  const highlightId = focusId;

  const completenessByBatch = new Map(completeness.map((c) => [c.output_batch_id, c]));
  const orderOptions = orders.map((o) => ({ value: o.id, label: o.order_code }));
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

      {orders.length === 0 ? (
        <p className="rounded-md border border-amber/40 bg-amber/10 px-4 py-3 text-sm text-amber">
          Necesitas al menos una{" "}
          <Link href="/traceability/production-orders" className="font-semibold underline">
            orden / corrida de producción
          </Link>{" "}
          antes de registrar lotes producidos / lotes finales.
        </p>
      ) : (
        <section className="rounded-lg border border-hairline bg-surface p-5">
          <h2 className="mb-4 text-sm font-semibold">
            {editing ? `Editar: ${editing.batch_code}` : "Nuevo lote producido / lote final"}
          </h2>
          <OutputBatchForm orders={orderOptions} products={productOptions} editing={editing} />
          {editing ? (
            <Link href="/traceability/output-batches" className="mt-3 inline-block text-xs text-ink-soft hover:underline">
              Cancelar edición
            </Link>
          ) : null}
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
                      {[
                        `orden ${b.production_order_code}`,
                        b.produced_date,
                        b.produced_quantity_kg !== null ? `${b.produced_quantity_kg} kg` : null,
                        b.intended_application,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {comp && comp.missing_items.length > 0 ? (
                      <p className="mt-1 text-xs text-danger">
                        Falta: {comp.missing_items.join(", ")}.
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
                    <Link href={`/traceability/output-batches?edit=${b.id}`} className="text-sm text-loop hover:underline">
                      Editar
                    </Link>
                    <ActionButton
                      action={deleteOutputBatchAction}
                      fields={{ id: b.id }}
                      label="Eliminar"
                      pendingLabel="Eliminando…"
                    />
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
                            <ActionButton
                              action={deleteBatchCompositionAction}
                              fields={{ id: c.id }}
                              label="Eliminar"
                              pendingLabel="Eliminando…"
                            />
                          </li>
                        ))}
                      </ul>
                    )}

                    {materialOptions.length === 0 ? (
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
