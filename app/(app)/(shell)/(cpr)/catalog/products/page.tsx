// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { searchProducts, getProduct, listFamilies } from "@/lib/db/catalog";
import { listEvidencesForTargets } from "@/lib/db/evidences";
import { deleteProductAction } from "@/server/actions/catalog";
import { ProductForm } from "@/components/domain/catalog/forms";
import { LinkedEvidenceList } from "@/components/domain/evidences/view-link";
import { ListSearchForm, ListPagination } from "@/components/ui/list-controls";
import { SuccessAlert } from "@/components/ui/alert";
import { ExportPdfButton } from "@/components/ui/export-pdf-button";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; q?: string; page?: string; created?: string; updated?: string; focus?: string }>;
}) {
  const org = await requireActiveOrg();
  const params = await searchParams;

  // PCR-01 (punto 9): búsqueda + paginación reales en servidor.
  const [result, families] = await Promise.all([
    searchProducts(org.organizationId, { q: params.q, page: params.page }),
    listFamilies(org.organizationId),
  ]);
  const products = result.rows;
  const editing =
    products.find((p) => p.id === params.edit) ??
    (params.edit ? await getProduct(org.organizationId, params.edit) : undefined) ??
    undefined;

  // PCR-01.1 (blockers 3/4): el registro creado/actualizado/enfocado se
  // muestra aunque quede fuera de la página actual — se resuelve por id
  // (getter, jamás el listado completo) y se fija al inicio sin duplicarlo.
  const focusId = params.created ?? params.updated ?? params.focus ?? null;
  const focusedRecord = focusId
    ? products.find((r) => r.id === focusId) ??
      (await getProduct(org.organizationId, focusId)) ??
      null
    : null;
  const visibleRows =
    focusedRecord && !products.some((r) => r.id === focusedRecord.id)
      ? [focusedRecord, ...products]
      : products;

  // PCR-01 (punto 11): evidencias vinculadas de la página, en lote.
  const evidencesByProduct = await listEvidencesForTargets(
    org.organizationId,
    "product",
    visibleRows.map((r) => r.id)
  );

  // PCR-01 (puntos 2 y 7): confirmaciones + resaltado.
  const highlightId = focusId;
  const highlightChip = params.created
    ? "Creado correctamente"
    : params.updated
      ? "Guardado correctamente"
      : null;
  const confirmation = params.created
    ? "Producto creado correctamente."
    : params.updated
      ? "Cambios guardados correctamente."
      : null;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <p className="eyebrow">
          <Link href="/catalog" className="hover:underline">Catálogos</Link> · Productos
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Productos</h1>
        <div className="mt-2">
          <ExportPdfButton exportKey="cpr.product.list" disabled={result.total === 0} disabledReason="no hay productos" />
        </div>
      </header>

      <section className="rounded-lg border border-hairline bg-surface p-5">
        <h2 className="mb-4 text-sm font-semibold">
          {editing ? `Editar: ${editing.name}` : "Nuevo producto"}
        </h2>
        <ProductForm
          families={families.map((f) => ({ value: f.id, label: f.name }))}
          editing={editing}
        />
        {editing ? (
          <Link href="/catalog/products" className="mt-3 inline-block text-xs text-ink-soft hover:underline">
            Cancelar edición
          </Link>
        ) : null}
      </section>

      <div className="rounded-lg border border-hairline bg-surface p-4">
        <ListSearchForm
          basePath="/catalog/products"
          q={params.q ?? ""}
          placeholder="Buscar por código o nombre de producto…"
        />
      </div>

      <SuccessAlert message={confirmation} />

      {visibleRows.length === 0 ? (
        params.q ? (
          <p className="text-sm text-ink-soft">
            Sin resultados para esta búsqueda.{" "}
            <Link href="/catalog/products" className="text-loop underline">Limpiar búsqueda</Link>.
          </p>
        ) : (
          <p className="text-sm text-ink-soft">Aún no hay productos registrados.</p>
        )
      ) : (
        <ul className="divide-y divide-hairline rounded-lg border border-hairline bg-surface">
          {visibleRows.map((p) => {
            const isHighlighted = highlightId === p.id;
            const linked = evidencesByProduct[p.id] ?? [];
            return (
              <li
                key={p.id}
                id={`registro-${p.id}`}
                className={`px-4 py-3 ${isHighlighted ? "bg-loop/5 ring-2 ring-inset ring-loop/30" : ""}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">
                      <span className="code mr-2 text-xs text-ink-soft">{p.code}</span>
                      {p.name}
                      {isHighlighted && highlightChip ? (
                        <span className="ml-2 rounded-full border border-loop/30 bg-loop/5 px-2 py-0.5 text-xs font-medium text-loop-deep">
                          {highlightChip}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-ink-soft">
                      {p.family_name ?? "Sin familia"}
                      {p.declared_recycled_percent !== null
                        ? ` · declara ${p.declared_recycled_percent}% reciclado`
                        : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <ExportPdfButton exportKey="cpr.product.detail" id={p.id} />
                    <Link href={`/catalog/products?edit=${p.id}`} className="text-sm text-loop hover:underline">
                      Editar
                    </Link>
                    <form action={deleteProductAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <button type="submit" className="text-sm text-danger hover:underline">
                        Eliminar
                      </button>
                    </form>
                  </div>
                </div>
                {linked.length > 0 ? (
                  <div className="mt-2">
                    <LinkedEvidenceList evidences={linked} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <ListPagination
        basePath="/catalog/products"
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        extraParams={{ q: params.q }}
      />
    </div>
  );
}
