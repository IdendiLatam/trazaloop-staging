// Ruta protegida (guard del módulo en el layout del namespace /textiles).
export const dynamic = "force-dynamic";

// Trazaloop · Sprint T4 (Textil) · Productos textiles: listado + creación.

import Link from "next/link";
import { requireTextilesModule } from "@/lib/auth/require-textiles-module";
import { listTextileProducts, listTextileCollections } from "@/lib/db/textiles-products";
import {
  TEXTILE_PRODUCT_CATEGORIES,
  TEXTILE_PRODUCT_CATEGORY_LABEL,
  TEXTILE_PRODUCT_STATUSES,
  TEXTILE_PRODUCT_STATUS_LABEL,
  TEXTILE_PRODUCTS_DISCLAIMER,
} from "@/lib/domain/textiles-products";
import {
  createTextileProductAction,
  type TextileProductInput,
} from "@/server/actions/textiles-products";
import { TextileEntityForm } from "@/components/domain/textiles/entity-form";
import type { CatalogFieldDef } from "@/components/domain/textiles/catalog-manager";

export default async function TextileProductsPage() {
  const org = await requireTextilesModule();
  const [products, collections] = await Promise.all([
    listTextileProducts(org.organizationId),
    listTextileCollections(org.organizationId),
  ]);

  const fields: CatalogFieldDef[] = [
    { key: "name", label: "Nombre del producto", type: "text", required: true, placeholder: "p. ej. Camisa Oxford manga larga" },
    { key: "productCode", label: "Código de producto", type: "text", help: "Opcional; único por empresa" },
    {
      key: "category",
      label: "Categoría",
      type: "select",
      options: TEXTILE_PRODUCT_CATEGORIES.map((v) => ({ value: v, label: TEXTILE_PRODUCT_CATEGORY_LABEL[v] })),
    },
    {
      key: "collectionId",
      label: "Colección / línea",
      type: "select",
      options: [
        { value: "", label: "— Sin colección —" },
        ...collections.filter((c) => c.isActive).map((c) => ({ value: c.id, label: c.name })),
      ],
    },
    {
      key: "status",
      label: "Estado",
      type: "select",
      options: TEXTILE_PRODUCT_STATUSES.map((v) => ({ value: v, label: TEXTILE_PRODUCT_STATUS_LABEL[v] })),
    },
    { key: "intendedUse", label: "Uso previsto", type: "text" },
    { key: "targetMarket", label: "Mercado objetivo", type: "text" },
    { key: "description", label: "Descripción", type: "text" },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-1">
        <p className="eyebrow">Trazaloop Textiles · Productos</p>
        <h1 className="text-2xl font-semibold tracking-tight">Productos textiles</h1>
        <p className="max-w-2xl text-sm text-ink-soft">
          Registra productos, referencias y composición estructurada para preparar
          trazabilidad, evidencias y pasaporte técnico textil.
        </p>
        <p className="max-w-2xl text-xs text-ink-soft">{TEXTILE_PRODUCTS_DISCLAIMER}</p>
        <div className="flex flex-wrap gap-4 pt-1 text-sm font-medium">
          <Link href="/textiles/products/collections" className="text-loop hover:underline">
            Colecciones / líneas →
          </Link>
          <Link href="/textiles/catalogs" className="text-loop hover:underline">
            Catálogos (materiales, fibras, componentes) →
          </Link>
          <Link href="/textiles" className="text-loop hover:underline">
            ← Módulo Textil
          </Link>
        </div>
      </header>

      <TextileEntityForm<TextileProductInput>
        title="Nuevo producto"
        fields={fields}
        initialValues={{ status: "draft", category: "other" }}
        submitLabel="Crear producto"
        createAction={createTextileProductAction}
        successMessage="Producto creado. Ábrelo para agregar referencias."
      />

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Productos registrados ({products.length})</h2>
        {products.length === 0 ? (
          <p className="rounded-lg border border-hairline bg-surface p-4 text-sm text-ink-soft">
            Aún no hay productos. Crea el primero con el formulario de arriba.
          </p>
        ) : (
          <ul className="space-y-2">
            {products.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/textiles/products/${p.id}`}
                  className={`flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3 text-sm transition-colors hover:border-loop ${
                    p.isActive ? "border-hairline bg-surface" : "border-hairline bg-paper opacity-70"
                  }`}
                >
                  <span className="min-w-0 space-y-0.5">
                    <span className="block font-medium">
                      {p.name}
                      {p.productCode ? (
                        <span className="ml-2 text-xs text-ink-soft">({p.productCode})</span>
                      ) : null}
                    </span>
                    <span className="block text-xs text-ink-soft">
                      {[
                        TEXTILE_PRODUCT_CATEGORY_LABEL[p.category as keyof typeof TEXTILE_PRODUCT_CATEGORY_LABEL] ?? p.category,
                        p.collectionName ? `Colección: ${p.collectionName}` : "Sin colección",
                        `${p.referenceCount} referencia${p.referenceCount === 1 ? "" : "s"}`,
                      ].join(" · ")}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full border border-hairline bg-paper px-2 py-0.5 text-[10px] text-ink-soft">
                    {TEXTILE_PRODUCT_STATUS_LABEL[p.status as keyof typeof TEXTILE_PRODUCT_STATUS_LABEL] ?? p.status}
                    {p.isActive ? "" : " · Inactivo"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
