import Link from "next/link";
import { searchProductStock, listStockByProduct } from "@/lib/db/inventory";
import { formatKg } from "@/lib/domain/inventory";
import { stockStatement } from "@/lib/domain/output-movements";

/**
 * PT-02B.1 · Cuánto producto terminado hay en planta.
 *
 * Era el requisito original que seguía sin cubrirse: se sabía cuánto quedaba
 * de un LOTE, nunca cuánto producto había. La agregación la hace la base
 * (`v_product_stock`); aquí solo se pagina, se busca y se enseña.
 *
 * LA UNIDAD SE ENSEÑA AUNQUE HOY SOLO HAYA UNA. Los lotes producidos de PCR se
 * miden en kilogramos y el guardián rechaza cualquier otra, así que la columna
 * es constante. Ponerla igualmente es lo que impide que el día que entre otra
 * unidad alguien sume 300 kg con 40 m y obtenga 340 de nada.
 */
export type ProductStockParams = {
  prod?: string;
  prod_q?: string;
  prod_page?: string;
  prod_lot_page?: string;
};

const SIN_PRODUCTO = "__sin_producto__";

export async function ProductStockSection({
  orgId,
  params,
  basePath,
  extraParams = {},
}: {
  orgId: string;
  params: ProductStockParams;
  basePath: string;
  /** Lo que hay que conservar en cada enlace (la pestaña activa, por ejemplo). */
  extraParams?: Record<string, string | undefined>;
}) {
  const seleccionado = params.prod ?? null;
  const productoId = seleccionado === SIN_PRODUCTO ? null : seleccionado;
  const pagina = await searchProductStock(orgId, { q: params.prod_q, page: params.prod_page });
  const detalle = seleccionado
    ? await listStockByProduct(orgId, productoId, Number(params.prod_lot_page ?? "1") || 1)
    : null;

  const linkFor = (next: Partial<ProductStockParams>) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(extraParams)) if (v) sp.set(k, v);
    const merged: ProductStockParams = {
      prod: seleccionado ?? undefined,
      prod_q: params.prod_q,
      prod_page: params.prod_page,
      prod_lot_page: params.prod_lot_page,
      ...next,
    };
    for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, String(v));
    const qs = sp.toString();
    return `${basePath}${qs ? `?${qs}` : ""}#productos`;
  };

  const ultima = Math.max(1, Math.ceil(pagina.total / pagina.pageSize));
  const ultimaDetalle = detalle ? Math.max(1, Math.ceil(detalle.total / detalle.pageSize)) : 1;

  return (
    <section id="productos" className="rounded-lg border border-hairline bg-surface p-5">
      <h2 className="mb-1 text-sm font-semibold">Producto terminado en planta</h2>
      {/* El alcance se declara, igual que en el saldo de materiales: decir
          «inventario» sin decir de qué está hecho es la clase de precisión que
          engaña. */}
      <p className="mb-1 text-xs text-ink-soft">
        Todas las cantidades en <strong>kilogramos</strong>. Disponible ={" "}
        producido − reproceso interno − despachos − uso interno − merma ± ajustes
        por recuento. Selecciona un producto para ver sus lotes.
      </p>
      <p className="mb-4 text-xs text-ink-soft">
        Los lotes sin producto asociado se agrupan aparte para que el total de
        la planta no se quede corto.
      </p>

      <form method="get" action={`${basePath}#productos`} className="mb-3 flex flex-wrap items-center gap-2">
        {Object.entries(extraParams).map(([k, v]) =>
          v ? <input key={k} type="hidden" name={k} value={v} /> : null
        )}
        {seleccionado ? <input type="hidden" name="prod" value={seleccionado} /> : null}
        <input
          type="search"
          name="prod_q"
          defaultValue={params.prod_q ?? ""}
          placeholder="Buscar producto…"
          className="w-56 rounded-md border border-hairline bg-canvas px-3 py-1.5 text-sm"
        />
        <button type="submit" className="rounded-md border border-hairline px-3 py-1.5 text-sm hover:bg-canvas">
          Buscar
        </button>
        {params.prod_q ? (
          <Link href={linkFor({ prod_q: undefined, prod_page: undefined })} className="text-sm text-loop hover:underline">
            Limpiar
          </Link>
        ) : null}
      </form>

      {pagina.rows.length === 0 ? (
        <p className="text-sm text-ink-soft">
          No hay lotes producidos registrados todavía.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-hairline">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs text-ink-soft">
                <th className="px-3 py-2 font-medium">Producto</th>
                <th className="px-3 py-2 font-medium">Unidad</th>
                <th className="px-3 py-2 text-right font-medium">Lotes</th>
                <th className="px-3 py-2 text-right font-medium">Producido</th>
                <th className="px-3 py-2 text-right font-medium">Salidas</th>
                <th className="px-3 py-2 text-right font-medium">Disponible</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {pagina.rows.map((r) => {
                const clave = r.productId ?? SIN_PRODUCTO;
                return (
                  <tr key={clave} className="border-b border-hairline last:border-0">
                    <td className="px-3 py-2">
                      {r.productName ?? <span className="text-ink-soft">Sin producto asociado</span>}
                      {r.productCode ? (
                        <span className="code ml-2 text-xs text-ink-soft">{r.productCode}</span>
                      ) : null}
                      {r.batchesInconsistent > 0 ? (
                        <span className="ml-2 rounded border border-danger/40 px-1 text-[10px] text-danger">
                          {r.batchesInconsistent} con saldo inconsistente
                        </span>
                      ) : null}
                    </td>
                    <td className="code px-3 py-2 text-xs">{r.unitCode}</td>
                    <td className="code px-3 py-2 text-right text-xs">
                      {r.batchesWithBalance} / {r.batchesTotal}
                    </td>
                    <td className="code px-3 py-2 text-right text-xs">{formatKg(r.producedKg)}</td>
                    <td className="code px-3 py-2 text-right text-xs">{formatKg(r.exitsKg)}</td>
                    <td className={`code px-3 py-2 text-right text-xs font-semibold ${r.availableKg < 0 ? "text-danger" : ""}`}>
                      {formatKg(r.availableKg)}
                    </td>
                    <td className="px-3 py-2 text-right text-xs">
                      <Link href={linkFor({ prod: clave, prod_lot_page: undefined })} className="text-loop hover:underline">
                        Ver lotes
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pagina.total > pagina.pageSize ? (
        <div className="mt-3 flex items-center gap-3 text-xs text-ink-soft">
          <span>Página {pagina.page} de {ultima} · {pagina.total} productos</span>
          {pagina.page > 1 ? (
            <Link href={linkFor({ prod_page: String(pagina.page - 1) })} className="text-loop hover:underline">Anterior</Link>
          ) : null}
          {pagina.page < ultima ? (
            <Link href={linkFor({ prod_page: String(pagina.page + 1) })} className="text-loop hover:underline">Siguiente</Link>
          ) : null}
        </div>
      ) : null}

      {detalle ? (
        <div className="mt-4 rounded-md border border-hairline bg-canvas p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold">
              Lotes de{" "}
              {pagina.rows.find((r) => (r.productId ?? SIN_PRODUCTO) === seleccionado)?.productName
                ?? "los lotes sin producto asociado"}
            </h3>
            <Link href={linkFor({ prod: undefined, prod_lot_page: undefined })} className="text-xs text-loop hover:underline">
              Cerrar
            </Link>
          </div>
          {detalle.rows.length === 0 ? (
            <p className="text-xs text-ink-soft">Sin lotes.</p>
          ) : (
            <ul className="divide-y divide-hairline text-xs">
              {detalle.rows.map((l) => (
                <li key={l.outputBatchId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link
                    href={`/traceability/output-batches?batch=${l.outputBatchId}`}
                    className="code text-loop hover:underline"
                  >
                    {l.batchCode}
                  </Link>
                  <span className="text-ink-soft">
                    producido {formatKg(l.producedKg)} · salidas{" "}
                    {formatKg(l.dispatchedKg + l.lostKg + l.internalUseKg)}
                  </span>
                  <span className={l.isInconsistent ? "font-semibold text-danger" : ""}>
                    {stockStatement(l.availableKg, l.movementsCount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {detalle.total > detalle.pageSize ? (
            <div className="mt-2 flex items-center gap-3 text-xs text-ink-soft">
              <span>Página {detalle.page} de {ultimaDetalle}</span>
              {detalle.page > 1 ? (
                <Link href={linkFor({ prod_lot_page: String(detalle.page - 1) })} className="text-loop hover:underline">Anterior</Link>
              ) : null}
              {detalle.page < ultimaDetalle ? (
                <Link href={linkFor({ prod_lot_page: String(detalle.page + 1) })} className="text-loop hover:underline">Siguiente</Link>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
