// Ruta protegida (guard del módulo en el layout del namespace /textiles).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireTextilesModule } from "@/lib/auth/require-textiles-module";
import { searchTextileCollections } from "@/lib/db/textiles-products";
import {
  TEXTILE_COLLECTION_STATUSES,
  TEXTILE_COLLECTION_STATUS_LABEL,
} from "@/lib/domain/textiles-products";
import {
  createTextileCollectionAction,
  updateTextileCollectionAction,
  setTextileCollectionActiveAction,
  type TextileCollectionInput,
} from "@/server/actions/textiles-products";
import {
  TextileCatalogManager,
  type CatalogFieldDef,
  type CatalogRowView,
} from "@/components/domain/textiles/catalog-manager";
import { ExportPdfButton } from "@/components/ui/export-pdf-button";
import { ListSearchForm, ListPagination } from "@/components/ui/list-controls";

const FIELDS: CatalogFieldDef[] = [
  { key: "name", label: "Nombre", type: "text", required: true, placeholder: "p. ej. Línea institucional 2026" },
  { key: "code", label: "Código", type: "text", help: "Opcional; único por empresa" },
  { key: "season", label: "Temporada", type: "text", placeholder: "p. ej. 2026-1" },
  { key: "year", label: "Año", type: "text", placeholder: "p. ej. 2026" },
  { key: "customerOrProgram", label: "Cliente o programa", type: "text" },
  {
    key: "status",
    label: "Estado",
    type: "select",
    options: TEXTILE_COLLECTION_STATUSES.map((v) => ({ value: v, label: TEXTILE_COLLECTION_STATUS_LABEL[v] })),
  },
  { key: "description", label: "Descripción", type: "text" },
  { key: "notes", label: "Notas", type: "text" },
];

export default async function TextileCollectionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const org = await requireTextilesModule();
  // PT-01 · La lista se leía entera y sin cota. Con `max_rows = 1000` eso
  // significa que a partir de mil filas la pantalla enseñaba mil y callaba.
  // Ahora es una página con su total al lado, y la búsqueda va en el servidor
  // sobre TODO el conjunto autorizado, no sobre la página visible.
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const q = one(params.q) ?? "";
  const { rows: collections, total, page, pageSize } = await searchTextileCollections(org.organizationId, {
    q,
    page: one(params.page),
  });

  const rows: CatalogRowView[] = collections.map((c) => ({
    id: c.id,
    name: c.name,
    isActive: c.isActive,
    display: [
      c.code ? `Código ${c.code}` : "",
      c.season ?? "",
      c.year ? String(c.year) : "",
      c.customerOrProgram ?? "",
      TEXTILE_COLLECTION_STATUS_LABEL[c.status as keyof typeof TEXTILE_COLLECTION_STATUS_LABEL] ?? c.status,
    ].filter(Boolean),
    formValues: {
      name: c.name,
      code: c.code ?? "",
      season: c.season ?? "",
      year: c.year ? String(c.year) : "",
      customerOrProgram: c.customerOrProgram ?? "",
      status: c.status,
      description: c.description ?? "",
      notes: c.notes ?? "",
    },
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <p className="eyebrow">Trazaloop Textiles · Productos</p>
        <h1 className="text-2xl font-semibold tracking-tight">Colecciones / líneas</h1>
        <div className="pt-1">
          <ExportPdfButton exportKey="textiles.collection.list" />
        </div>
        <p className="max-w-2xl text-sm text-ink-soft">
          Colecciones, líneas, temporadas o programas comerciales que agrupan productos
          textiles.
        </p>
        <Link href="/textiles/products" className="text-sm font-medium text-loop hover:underline">
          ← Productos textiles
        </Link>
      </header>
      <ListSearchForm
        basePath="/textiles/products/collections"
        q={q}
        placeholder="Buscar colecciones por nombre…"
      />
      <TextileCatalogManager<TextileCollectionInput>
        entityLabel="colección"
        entityLabelPlural="Colecciones"
        fields={FIELDS}
        rows={rows}
        createAction={createTextileCollectionAction}
        updateAction={updateTextileCollectionAction}
        setActiveAction={setTextileCollectionActiveAction}
      />
      <ListPagination
        basePath="/textiles/products/collections"
        page={page}
        pageSize={pageSize}
        total={total}
        extraParams={{ q: q || undefined }}
      />
    </div>
  );
}
