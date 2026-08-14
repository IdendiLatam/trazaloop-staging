/**
 * PCR-02.5 (Bloque B) · Inventario OPERATIVO de materiales.
 *
 * Vive en Trazabilidad → Lotes de entrada, DESPUÉS de la lista de lotes y
 * ANTES de la importación (§6). Sin módulo de navegación nuevo. Todo se
 * deriva en la base (vistas 0105). Estados §18: solo «Disponible» y
 * «Agotado»; los agotados siguen visibles históricamente.
 *
 * PCR-02.5.1 (hallazgo 2): BÚSQUEDA y PAGINACIÓN server-side propias del
 * inventario — parámetros `inv_q`, `inv_page` (tabla agregada) e
 * `inv_lot_page` (detalle por lote), sin colisionar con `q`/`page` de la
 * lista principal. Total exacto y navegación anterior/siguiente: jamás se
 * muestra información truncada como si fuese completa. El material
 * seleccionado por URL (`inventario=<id>`) se resuelve por consulta
 * puntual, así el detalle abre aunque el material no esté en la página
 * actual de la tabla.
 */
import Link from "next/link";
import {
  searchMaterialInventory,
  getMaterialInventoryById,
  listInputBatchInventoryByMaterial,
} from "@/lib/db/inventory";
import { formatKg, inventoryState, INVENTORY_STATE_LABEL } from "@/lib/domain/inventory";

function StateBadge({ availableKg }: { availableKg: number }) {
  const state = inventoryState(availableKg);
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${
        state === "available" ? "bg-loop-soft text-loop-deep" : "bg-hairline text-ink-soft"
      }`}
    >
      {INVENTORY_STATE_LABEL[state]}
    </span>
  );
}

export type InventoryParams = {
  inventario?: string;
  inv_q?: string;
  inv_page?: string;
  inv_lot_page?: string;
};

export async function MaterialInventorySection({
  orgId,
  params,
  extraParams,
}: {
  orgId: string;
  params: InventoryParams;
  extraParams: Record<string, string | undefined>;
}) {
  const selectedMaterialId = params.inventario || null;
  const [pageResult, selected] = await Promise.all([
    searchMaterialInventory(orgId, { q: params.inv_q, page: params.inv_page }),
    selectedMaterialId ? getMaterialInventoryById(orgId, selectedMaterialId) : null,
  ]);
  const detail = selected
    ? await listInputBatchInventoryByMaterial(orgId, selected.material_id, {
        page: params.inv_lot_page,
      })
    : null;

  // Enlaces que conservan la búsqueda/página de la LISTA principal de lotes
  // (extraParams) y el estado propio del inventario.
  const linkFor = (next: Partial<InventoryParams>) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(extraParams)) if (v) sp.set(k, v);
    const merged: InventoryParams = {
      inventario: selectedMaterialId ?? undefined,
      inv_q: params.inv_q,
      inv_page: params.inv_page,
      inv_lot_page: params.inv_lot_page,
      ...next,
    };
    for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, String(v));
    const qs = sp.toString();
    return `/traceability/input-batches${qs ? `?${qs}` : ""}#inventario`;
  };

  const lastPage = Math.max(1, Math.ceil(pageResult.total / pageResult.pageSize));
  const detailLastPage = detail ? Math.max(1, Math.ceil(detail.total / detail.pageSize)) : 1;

  return (
    <section id="inventario" className="rounded-lg border border-hairline bg-surface p-5">
      <h2 className="mb-1 text-sm font-semibold">Inventario de materiales</h2>
      <p className="mb-4 text-xs text-ink-soft">
        Saldo derivado de los movimientos reales: cantidad recibida de los
        lotes de entrada menos lo consumido por las órdenes / corridas de
        producción. Selecciona un material para ver su saldo por lote.
      </p>

      {/* Búsqueda server-side del inventario (independiente de la lista) */}
      <form method="get" action="/traceability/input-batches#inventario" className="mb-3 flex flex-wrap items-center gap-2">
        {Object.entries(extraParams).map(([k, v]) =>
          v ? <input key={k} type="hidden" name={k} value={v} /> : null
        )}
        {selectedMaterialId ? (
          <input type="hidden" name="inventario" value={selectedMaterialId} />
        ) : null}
        <input
          type="search"
          name="inv_q"
          defaultValue={params.inv_q ?? ""}
          placeholder="Buscar material…"
          className="w-56 rounded-md border border-hairline bg-canvas px-3 py-1.5 text-sm"
        />
        <button type="submit" className="rounded-md border border-hairline px-3 py-1.5 text-sm hover:bg-canvas">
          Buscar
        </button>
        {params.inv_q ? (
          <Link href={linkFor({ inv_q: undefined, inv_page: undefined })} className="text-xs text-ink-soft underline-offset-2 hover:underline">
            Limpiar
          </Link>
        ) : null}
      </form>

      {pageResult.total === 0 ? (
        <p className="text-sm text-ink-soft">
          {params.inv_q
            ? "Ningún material coincide con la búsqueda."
            : "Aún no hay lotes de entrada: el inventario aparecerá con el primer lote registrado."}
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-hairline text-xs text-ink-soft">
                  <th className="py-2 pr-3 font-medium">Material</th>
                  <th className="py-2 pr-3 text-right font-medium">Cantidad recibida</th>
                  <th className="py-2 pr-3 text-right font-medium">Cantidad consumida</th>
                  <th className="py-2 pr-3 text-right font-medium">Cantidad disponible</th>
                  <th className="py-2 text-right font-medium">Lotes con saldo</th>
                </tr>
              </thead>
              <tbody>
                {pageResult.rows.map((r) => {
                  const isSelected = selected?.material_id === r.material_id;
                  return (
                    <tr
                      key={r.material_id}
                      className={`border-b border-hairline last:border-0 ${isSelected ? "bg-loop-soft/40" : ""}`}
                    >
                      <td className="py-2 pr-3">
                        <Link
                          href={linkFor({
                            inventario: isSelected ? undefined : r.material_id,
                            inv_lot_page: undefined,
                          })}
                          className="font-medium text-loop-deep underline-offset-2 hover:underline"
                        >
                          {r.material_name}
                        </Link>{" "}
                        <StateBadge availableKg={r.available_kg} />
                      </td>
                      <td className="code py-2 pr-3 text-right text-xs">{formatKg(r.received_kg)}</td>
                      <td className="code py-2 pr-3 text-right text-xs">{formatKg(r.consumed_kg)}</td>
                      <td className="code py-2 pr-3 text-right text-xs font-semibold">
                        {formatKg(r.available_kg)}
                      </td>
                      <td className="code py-2 text-right text-xs">
                        {r.batches_with_balance} de {r.batches_total}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-ink-soft">
            <span>
              {pageResult.total} material{pageResult.total === 1 ? "" : "es"} · página{" "}
              {pageResult.page} de {lastPage}
            </span>
            <span className="flex gap-3">
              {pageResult.page > 1 ? (
                <Link href={linkFor({ inv_page: String(pageResult.page - 1) })} className="text-loop hover:underline">
                  ← Anterior
                </Link>
              ) : null}
              {pageResult.page < lastPage ? (
                <Link href={linkFor({ inv_page: String(pageResult.page + 1) })} className="text-loop hover:underline">
                  Siguiente →
                </Link>
              ) : null}
            </span>
          </div>
        </>
      )}

      {selectedMaterialId && !selected ? (
        <p className="mt-4 text-xs text-danger">
          El material seleccionado no existe o no pertenece a tu empresa.
        </p>
      ) : null}

      {selected && detail ? (
        <div className="mt-4 rounded-md border border-hairline p-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="text-xs font-semibold">
              Saldo por lote — {selected.material_name}
            </h3>
            <Link
              href={linkFor({ inventario: undefined, inv_lot_page: undefined })}
              className="text-xs text-ink-soft underline-offset-2 hover:underline"
            >
              Cerrar detalle
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-hairline text-xs text-ink-soft">
                  <th className="py-2 pr-3 font-medium">Lote</th>
                  <th className="py-2 pr-3 text-right font-medium">Recibido</th>
                  <th className="py-2 pr-3 text-right font-medium">Consumido</th>
                  <th className="py-2 pr-3 text-right font-medium">Disponible</th>
                  <th className="py-2 pr-3 font-medium">Recepción</th>
                  <th className="py-2 font-medium">Proveedor</th>
                </tr>
              </thead>
              <tbody>
                {detail.rows.map((b) => (
                  <tr key={b.input_batch_id} className="border-b border-hairline last:border-0">
                    <td className="code py-2 pr-3 text-xs">
                      {b.batch_code} <StateBadge availableKg={b.available_kg} />
                    </td>
                    <td className="code py-2 pr-3 text-right text-xs">{formatKg(b.received_kg)}</td>
                    <td className="code py-2 pr-3 text-right text-xs">{formatKg(b.consumed_kg)}</td>
                    <td className="code py-2 pr-3 text-right text-xs font-semibold">
                      {formatKg(b.available_kg)}
                    </td>
                    <td className="py-2 pr-3 text-xs">{b.received_date ?? "—"}</td>
                    <td className="py-2 text-xs">{b.supplier_name ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-ink-soft">
            <span>
              {detail.total} lote{detail.total === 1 ? "" : "s"} · página {detail.page} de{" "}
              {detailLastPage}
            </span>
            <span className="flex gap-3">
              {detail.page > 1 ? (
                <Link href={linkFor({ inv_lot_page: String(detail.page - 1) })} className="text-loop hover:underline">
                  ← Anterior
                </Link>
              ) : null}
              {detail.page < detailLastPage ? (
                <Link href={linkFor({ inv_lot_page: String(detail.page + 1) })} className="text-loop hover:underline">
                  Siguiente →
                </Link>
              ) : null}
            </span>
          </div>
          <p className="mt-2 text-[11px] text-ink-soft">
            Los lotes agotados permanecen en la trazabilidad y en este
            histórico; simplemente dejan de ofrecerse al registrar nuevos
            consumos.
          </p>
        </div>
      ) : null}
    </section>
  );
}
