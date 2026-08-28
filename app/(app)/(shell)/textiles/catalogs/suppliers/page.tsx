// Ruta protegida (guard del módulo en el layout del namespace /textiles).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireTextilesModule } from "@/lib/auth/require-textiles-module";
import { searchTextileSuppliers } from "@/lib/db/textiles-catalogs";
import {
  TEXTILE_SUPPLIER_TYPES,
  TEXTILE_SUPPLIER_TYPE_LABEL,
  canAdministerTextileCatalogs,
} from "@/lib/domain/textiles-catalogs";
import {
  createTextileSupplierAction,
  updateTextileSupplierAction,
  setTextileSupplierActiveAction,
  type TextileSupplierInput,
} from "@/server/actions/textiles-catalogs";
import { deleteTextileSupplierAction } from "@/server/actions/textiles-catalogs-admin";
import {
  TextileCatalogManager,
  type CatalogFieldDef,
  type CatalogRowView,
} from "@/components/domain/textiles/catalog-manager";
import { ExportPdfButton } from "@/components/ui/export-pdf-button";
import { ListSearchForm, ListPagination } from "@/components/ui/list-controls";

const FIELDS: CatalogFieldDef[] = [
  { key: "name", label: "Nombre", type: "text", required: true },
  {
    key: "supplierType",
    label: "Tipo de proveedor",
    type: "select",
    options: TEXTILE_SUPPLIER_TYPES.map((v) => ({ value: v, label: TEXTILE_SUPPLIER_TYPE_LABEL[v] })),
  },
  { key: "taxId", label: "Identificación tributaria", type: "text" },
  { key: "country", label: "País", type: "text" },
  { key: "city", label: "Ciudad", type: "text" },
  { key: "contactName", label: "Contacto", type: "text" },
  { key: "contactEmail", label: "Correo de contacto", type: "text" },
  { key: "contactPhone", label: "Teléfono", type: "text" },
  { key: "isCritical", label: "Proveedor crítico", type: "checkbox", help: "Relevante para trazabilidad" },
  { key: "notes", label: "Notas", type: "text" },
];

export default async function TextileSuppliersPage({
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
  const { rows: suppliers, total, page, pageSize } = await searchTextileSuppliers(org.organizationId, {
    q,
    page: one(params.page),
  });

  const rows: CatalogRowView[] = suppliers.map((s) => ({
    id: s.id,
    name: s.name,
    isActive: s.isActive,
    display: [
      TEXTILE_SUPPLIER_TYPE_LABEL[s.supplierType as keyof typeof TEXTILE_SUPPLIER_TYPE_LABEL] ?? s.supplierType,
      [s.city, s.country].filter(Boolean).join(", "),
      s.contactEmail ?? "",
      s.isCritical ? "Crítico" : "",
    ].filter(Boolean),
    formValues: {
      name: s.name,
      supplierType: s.supplierType,
      taxId: s.taxId ?? "",
      country: s.country ?? "",
      city: s.city ?? "",
      contactName: s.contactName ?? "",
      contactEmail: s.contactEmail ?? "",
      contactPhone: s.contactPhone ?? "",
      isCritical: s.isCritical,
      notes: s.notes ?? "",
    },
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <p className="eyebrow">Trazaloop Textiles · Catálogos</p>
        <h1 className="text-2xl font-semibold tracking-tight">Proveedores</h1>
        <div>
          <ExportPdfButton exportKey="textiles.supplier.list" disabled={total === 0} disabledReason="no hay proveedores" />
        </div>
        <p className="max-w-2xl text-sm text-ink-soft">
          Proveedores de telas, avíos, hilos, empaque y terceros de proceso. La información
          es declarativa: el soporte documental se gestiona como evidencias en una etapa
          posterior.
        </p>
        <Link href="/textiles/catalogs" className="text-sm font-medium text-loop hover:underline">
          ← Todos los catálogos
        </Link>
      </header>
      <ListSearchForm
        basePath="/textiles/catalogs/suppliers"
        q={q}
        placeholder="Buscar proveedores por nombre…"
      />
      <TextileCatalogManager<TextileSupplierInput>
        entityLabel="proveedor"
        entityLabelPlural="Proveedores"
        fields={FIELDS}
        rows={rows}
        createAction={createTextileSupplierAction}
        updateAction={updateTextileSupplierAction}
        setActiveAction={setTextileSupplierActiveAction}
        deleteAction={deleteTextileSupplierAction}
        canDelete={canAdministerTextileCatalogs(org.roleCode)}
      />
      <ListPagination
        basePath="/textiles/catalogs/suppliers"
        page={page}
        pageSize={pageSize}
        total={total}
        extraParams={{ q: q || undefined }}
      />
    </div>
  );
}
