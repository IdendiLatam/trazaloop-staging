// Ruta protegida (guard del módulo en el layout del namespace /textiles).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireTextilesModule } from "@/lib/auth/require-textiles-module";
import { listTextileCollections } from "@/lib/db/textiles-products";
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

export default async function TextileCollectionsPage() {
  const org = await requireTextilesModule();
  const collections = await listTextileCollections(org.organizationId);

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
        <p className="max-w-2xl text-sm text-ink-soft">
          Colecciones, líneas, temporadas o programas comerciales que agrupan productos
          textiles.
        </p>
        <Link href="/textiles/products" className="text-sm font-medium text-loop hover:underline">
          ← Productos textiles
        </Link>
      </header>
      <TextileCatalogManager<TextileCollectionInput>
        entityLabel="colección"
        entityLabelPlural="Colecciones"
        fields={FIELDS}
        rows={rows}
        createAction={createTextileCollectionAction}
        updateAction={updateTextileCollectionAction}
        setActiveAction={setTextileCollectionActiveAction}
      />
    </div>
  );
}
