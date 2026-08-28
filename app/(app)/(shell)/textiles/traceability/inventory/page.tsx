// Ruta protegida (guard del módulo en el layout del namespace /textiles).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireTextilesModule } from "@/lib/auth/require-textiles-module";
import {
  searchTextileMaterialInventory,
  listTextileLotBalances,
} from "@/lib/db/textiles-traceability";
import {
  MEASUREMENT_UNIT_LABEL,
  UNIT_NOT_NORMALIZED_MESSAGE,
  formatQuantity,
  isMeasurementUnit,
} from "@/lib/domain/measurement-units";
import { ListSearchForm, ListPagination } from "@/components/ui/list-controls";
import { ExportPdfButton } from "@/components/ui/export-pdf-button";

/**
 * PT-02A · Saldo trazado de materia prima textil.
 *
 * LO QUE ESTA PANTALLA AFIRMA, Y LO QUE NO
 *
 * Afirma: cuánto entró y cuánto se consumió en producción, por material y
 * POR UNIDAD. No afirma que eso sea el inventario físico, porque no lo es:
 * no hay mermas, ni devoluciones, ni ajustes por recuento — esos movimientos
 * no existen como hecho registrable, y llamarlo «inventario» sin decirlo
 * sería la clase de precisión que engaña.
 *
 * Y no suma unidades distintas. Un material que llegó en metros y en kilos
 * aparece en dos filas, porque son dos cosas.
 */
export default async function TextileInventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const org = await requireTextilesModule();
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const q = one(params.q) ?? "";
  const selId = one(params.item) ?? null;
  const selUnit = one(params.unidad);

  const { rows, total, page, pageSize } = await searchTextileMaterialInventory(
    org.organizationId, { q, page: one(params.page) }
  );

  const seleccionada = selId
    ? rows.find((r) => r.itemId === selId && (r.unitCode ?? "") === (selUnit ?? ""))
    : null;
  const detalle = seleccionada
    ? await listTextileLotBalances(org.organizationId, seleccionada.itemId, seleccionada.unitCode)
    : [];

  const etiquetaUnidad = (u: string | null, raw: string | null) =>
    isMeasurementUnit(u) ? MEASUREMENT_UNIT_LABEL[u] : `«${raw ?? "sin unidad"}» · sin normalizar`;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <p className="eyebrow">Trazaloop Textiles · Trazabilidad</p>
        <h1 className="text-2xl font-semibold tracking-tight">Saldo trazado de materia prima</h1>
        <div className="pt-1">
          <ExportPdfButton
            exportKey="textiles.input-lot.list"
            disabled={total === 0}
            disabledReason="no hay lotes de entrada"
          />
        </div>
        <p className="max-w-2xl text-sm text-ink-soft">
          Saldo trazado = cantidad recibida en los lotes de entrada − consumido
          por las órdenes / corridas de producción, <strong>por material y por
          unidad</strong>.
        </p>
        <p className="max-w-2xl text-xs text-ink-soft">
          No contempla mermas, devoluciones a proveedor ni ajustes por recuento
          físico: esos movimientos no existen como hecho registrable en
          Trazaloop. Y no se suman unidades distintas — Trazaloop no convierte:
          un material recibido en metros y en kilos aparece en dos filas.
        </p>
        <Link href="/textiles/traceability" className="text-sm font-medium text-loop hover:underline">
          ← Trazabilidad textil
        </Link>
      </header>

      <ListSearchForm
        basePath="/textiles/traceability/inventory"
        q={q}
        placeholder="Buscar material o componente…"
      />

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Materiales y componentes ({total})</h2>
        {rows.length === 0 ? (
          <p className="rounded-lg border border-hairline bg-surface p-4 text-sm text-ink-soft">
            {q
              ? `Ningún material coincide con «${q}».`
              : "Todavía no hay lotes de entrada registrados."}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-hairline bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs text-ink-soft">
                  <th className="px-3 py-2 font-medium">Material / componente</th>
                  <th className="px-3 py-2 font-medium">Unidad</th>
                  <th className="px-3 py-2 text-right font-medium">Recibido</th>
                  <th className="px-3 py-2 text-right font-medium">Consumido</th>
                  <th className="px-3 py-2 text-right font-medium">Disponible</th>
                  <th className="px-3 py-2 text-right font-medium">Lotes con saldo</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.itemId}-${r.unitCode ?? "sin"}`} className="border-b border-hairline last:border-0 align-top">
                    <td className="px-3 py-2 font-medium">
                      {r.itemName}
                      <span className="ml-2 text-xs text-ink-soft">
                        {r.itemType === "material" ? "material" : "componente"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {etiquetaUnidad(r.unitCode, r.unitRaw)}
                      {r.unitCode === null ? (
                        <span className="mt-0.5 block text-[11px] text-amber">
                          {UNIT_NOT_NORMALIZED_MESSAGE}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right">{formatQuantity(r.received, r.unitCode)}</td>
                    <td className="px-3 py-2 text-right">{formatQuantity(r.consumed, r.unitCode)}</td>
                    <td className={`px-3 py-2 text-right font-medium ${r.available < 0 ? "text-danger" : ""}`}>
                      {formatQuantity(r.available, r.unitCode)}
                      {/* Un saldo negativo NO se recorta a cero: es una
                          anomalía y esconderla sería perderla. */}
                      {r.available < 0 ? (
                        <span className="block text-[11px]">Saldo negativo: revisar los consumos</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {r.lotsWithBalance} de {r.lotsTotal}
                    </td>
                    <td className="px-3 py-2 text-right text-xs">
                      <Link
                        href={`/textiles/traceability/inventory?item=${r.itemId}&unidad=${r.unitCode ?? ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                        className="text-loop hover:underline"
                      >
                        Ver lotes
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {rows.some((r) => r.unmatchedConsumptions > 0) ? (
          <p className="rounded-md border border-amber/40 bg-amber/10 px-3 py-2 text-xs text-amber">
            Hay consumos registrados en una unidad distinta a la de su lote. No
            se han restado de ningún saldo porque no son comparables: normaliza
            la unidad del lote y la del consumo para que entren.
          </p>
        ) : null}

        <ListPagination
          basePath="/textiles/traceability/inventory"
          page={page}
          pageSize={pageSize}
          total={total}
          extraParams={{ q: q || undefined }}
        />
      </section>

      {seleccionada ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">
            Saldo por lote — {seleccionada.itemName} ·{" "}
            {etiquetaUnidad(seleccionada.unitCode, seleccionada.unitRaw)}
          </h2>
          {detalle.length === 0 ? (
            <p className="rounded-lg border border-hairline bg-surface p-4 text-sm text-ink-soft">
              Este material no tiene lotes en esa unidad.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-hairline bg-surface">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-hairline text-left text-xs text-ink-soft">
                    <th className="px-3 py-2 font-medium">Lote</th>
                    <th className="px-3 py-2 text-right font-medium">Recibido</th>
                    <th className="px-3 py-2 text-right font-medium">Consumido</th>
                    <th className="px-3 py-2 text-right font-medium">Disponible</th>
                  </tr>
                </thead>
                <tbody>
                  {detalle.map((l) => (
                    <tr key={l.lotCode} className="border-b border-hairline last:border-0">
                      <td className="px-3 py-2 font-medium">{l.lotCode}</td>
                      <td className="px-3 py-2 text-right">
                        {l.received === null ? "sin declarar" : formatQuantity(l.received, seleccionada.unitCode)}
                      </td>
                      <td className="px-3 py-2 text-right">{formatQuantity(l.consumed, seleccionada.unitCode)}</td>
                      <td className="px-3 py-2 text-right font-medium">
                        {l.remaining === null ? "—" : formatQuantity(l.remaining, seleccionada.unitCode)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
