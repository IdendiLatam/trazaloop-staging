// Ruta protegida (guard del módulo en el layout del namespace /textiles).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTextilesModule } from "@/lib/auth/require-textiles-module";
import { getTextileProductDetail, listTextileCollections } from "@/lib/db/textiles-products";
import {
  TEXTILE_PRODUCT_CATEGORIES,
  TEXTILE_PRODUCT_CATEGORY_LABEL,
  TEXTILE_PRODUCT_STATUSES,
  TEXTILE_PRODUCT_STATUS_LABEL,
  TEXTILE_COMPOSITION_STATUS_LABEL,
} from "@/lib/domain/textiles-products";
import {
  updateTextileProductAction,
  setTextileProductActiveAction,
  createTextileReferenceAction,
  type TextileProductInput,
  type TextileReferenceInput,
} from "@/server/actions/textiles-products";
import { listEntityTextileEvidences } from "@/lib/db/textiles-evidences";
import { TextileEntityForm } from "@/components/domain/textiles/entity-form";
import { ToggleActiveButton } from "@/components/domain/textiles/toggle-active-button";
import type { CatalogFieldDef } from "@/components/domain/textiles/catalog-manager";

export default async function TextileProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const org = await requireTextilesModule();
  const [detail, collections] = await Promise.all([
    getTextileProductDetail(org.organizationId, id),
    listTextileCollections(org.organizationId),
  ]);
  if (!detail) notFound();
  const { product, references } = detail;
  // T5: evidencias vinculadas DIRECTAMENTE al producto (las de referencias
  // viven en cada referencia; sin matriz completa todavía).
  const productEvidences = await listEntityTextileEvidences(org.organizationId, [
    { entityType: "product", entityId: product.id },
  ]);

  const productFields: CatalogFieldDef[] = [
    { key: "name", label: "Nombre del producto", type: "text", required: true },
    { key: "productCode", label: "Código de producto", type: "text" },
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
        ...collections.filter((c) => c.isActive || c.id === product.collectionId).map((c) => ({ value: c.id, label: c.name })),
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
    { key: "notes", label: "Notas", type: "text" },
  ];

  const referenceFields: CatalogFieldDef[] = [
    { key: "sku", label: "SKU", type: "text", required: true, placeholder: "p. ej. CAM-OXF-ML-BLANCO" },
    { key: "name", label: "Nombre comercial", type: "text" },
    { key: "color", label: "Color", type: "text" },
    { key: "sizeRange", label: "Rango de tallas", type: "text", placeholder: "p. ej. S–XXL" },
    { key: "genderOrFit", label: "Género / fit", type: "text" },
    { key: "versionLabel", label: "Versión", type: "text" },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-1">
        <p className="eyebrow">Trazaloop Textiles · Productos</p>
        <h1 className="text-2xl font-semibold tracking-tight">{product.name}</h1>
        <p className="text-sm text-ink-soft">
          {[
            TEXTILE_PRODUCT_CATEGORY_LABEL[product.category as keyof typeof TEXTILE_PRODUCT_CATEGORY_LABEL] ?? product.category,
            product.productCode ? `Código ${product.productCode}` : "",
            product.collectionName ? `Colección: ${product.collectionName}` : "Sin colección",
            TEXTILE_PRODUCT_STATUS_LABEL[product.status as keyof typeof TEXTILE_PRODUCT_STATUS_LABEL] ?? product.status,
            product.isActive ? "Activo" : "Inactivo",
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <div className="flex flex-wrap items-center gap-4 pt-1">
          <Link href="/textiles/products" className="text-sm font-medium text-loop hover:underline">
            ← Productos textiles
          </Link>
          <ToggleActiveButton
            entityId={product.id}
            isActive={product.isActive}
            action={setTextileProductActiveAction}
          />
          <Link href="/textiles/evidences" className="text-sm text-ink-soft hover:text-ink">
            {productEvidences.length} evidencia{productEvidences.length === 1 ? "" : "s"} vinculada{productEvidences.length === 1 ? "" : "s"} →
          </Link>
        </div>
      </header>

      <TextileEntityForm<TextileProductInput>
        title="Editar producto"
        fields={productFields}
        initialValues={{
          name: product.name,
          productCode: product.productCode ?? "",
          category: product.category,
          collectionId: product.collectionId ?? "",
          status: product.status,
          intendedUse: product.intendedUse ?? "",
          targetMarket: product.targetMarket ?? "",
          description: product.description ?? "",
          notes: product.notes ?? "",
        }}
        submitLabel="Guardar cambios"
        entityId={product.id}
        updateAction={updateTextileProductAction}
        successMessage="Producto actualizado."
      />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">
          Referencias / SKU ({references.length})
        </h2>
        {references.length === 0 ? (
          <p className="rounded-lg border border-hairline bg-surface p-4 text-sm text-ink-soft">
            Aún no hay referencias para este producto. Crea la primera abajo.
          </p>
        ) : (
          <ul className="space-y-2">
            {references.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/textiles/references/${r.id}`}
                  className={`flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3 text-sm transition-colors hover:border-loop ${
                    r.isActive ? "border-hairline bg-surface" : "border-hairline bg-paper opacity-70"
                  }`}
                >
                  <span className="min-w-0 space-y-0.5">
                    <span className="block font-medium">
                      {r.sku}
                      {r.name ? <span className="ml-2 text-xs text-ink-soft">{r.name}</span> : null}
                    </span>
                    <span className="block text-xs text-ink-soft">
                      {[r.color, r.sizeRange, r.versionLabel].filter(Boolean).join(" · ") || "Sin atributos"}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full border border-hairline bg-paper px-2 py-0.5 text-[10px] text-ink-soft">
                    Composición:{" "}
                    {TEXTILE_COMPOSITION_STATUS_LABEL[r.compositionStatus as keyof typeof TEXTILE_COMPOSITION_STATUS_LABEL] ?? r.compositionStatus}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <TextileEntityForm<TextileReferenceInput>
          title="Nueva referencia / SKU"
          fields={referenceFields}
          fixedValues={{ productId: product.id }}
          submitLabel="Crear referencia"
          createAction={createTextileReferenceAction}
          successMessage="Referencia creada. Ábrela para registrar su composición."
        />
      </section>
    </div>
  );
}
