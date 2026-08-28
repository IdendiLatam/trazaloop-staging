// Ruta protegida (guard del módulo en el layout del namespace /textiles).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireTextilesModule } from "@/lib/auth/require-textiles-module";
import { searchTextileComponents, listTextileSuppliers } from "@/lib/db/textiles-catalogs";
import {
  TEXTILE_COMPONENT_TYPES,
  TEXTILE_COMPONENT_TYPE_LABEL,
  TEXTILE_SEPARABILITY_UI_ORDER,
  TEXTILE_SEPARABILITY_LABEL,
  canAdministerTextileCatalogs,
} from "@/lib/domain/textiles-catalogs";
import {
  createTextileComponentAction,
  updateTextileComponentAction,
  setTextileComponentActiveAction,
  type TextileComponentInput,
} from "@/server/actions/textiles-catalogs";
import { deleteTextileComponentAction } from "@/server/actions/textiles-catalogs-admin";
import {
  TextileCatalogManager,
  type CatalogFieldDef,
  type CatalogRowView,
} from "@/components/domain/textiles/catalog-manager";
import { ExportPdfButton } from "@/components/ui/export-pdf-button";
import { ListSearchForm, ListPagination } from "@/components/ui/list-controls";

export default async function TextileComponentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const org = await requireTextilesModule();
  // PT-01 · La lista principal se leía entera y sin cota. Con `max_rows = 1000`
  // eso significa que a partir de mil filas la pantalla enseñaba mil y callaba.
  // Ahora es una página con su total al lado, y la búsqueda va en el servidor
  // sobre TODO el conjunto autorizado, no sobre la página visible.
  //
  // Los catálogos AUXILIARES (proveedores, fibras) siguen leyéndose enteros:
  // alimentan un desplegable y una opción que falta ahí es una opción que no
  // se puede elegir. Su lectura ya recorre por lotes, así que tampoco se corta.
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const q = one(params.q) ?? "";
  const [{ rows: components, total, page, pageSize }, suppliers] = await Promise.all([
    searchTextileComponents(org.organizationId, { q, page: one(params.page) }),
    listTextileSuppliers(org.organizationId),
  ]);

  const fields: CatalogFieldDef[] = [
    { key: "name", label: "Nombre", type: "text", required: true },
    {
      key: "componentType",
      label: "Tipo de componente",
      type: "select",
      options: TEXTILE_COMPONENT_TYPES.map((v) => ({ value: v, label: TEXTILE_COMPONENT_TYPE_LABEL[v] })),
    },
    { key: "materialDescription", label: "Material (descripción)", type: "text", placeholder: "p. ej. metal, poliéster, resina" },
    {
      key: "supplierId",
      label: "Proveedor",
      type: "select",
      options: [
        { value: "", label: "— Sin asignar —" },
        ...suppliers.map((s) => ({ value: s.id, label: s.name })),
      ],
    },
    {
      key: "separability",
      label: "Separabilidad manual",
      type: "select",
      options: TEXTILE_SEPARABILITY_UI_ORDER.map((v) => ({ value: v, label: TEXTILE_SEPARABILITY_LABEL[v] })),
      help: "Estimación preliminar para circularidad futura",
    },
    { key: "replacementPossible", label: "Reemplazable como repuesto", type: "checkbox" },
    { key: "notes", label: "Notas", type: "text" },
  ];

  const rows: CatalogRowView[] = components.map((c) => ({
    id: c.id,
    name: c.name,
    isActive: c.isActive,
    display: [
      TEXTILE_COMPONENT_TYPE_LABEL[c.componentType as keyof typeof TEXTILE_COMPONENT_TYPE_LABEL] ?? c.componentType,
      c.materialDescription ?? "",
      c.supplierName ? `Prov.: ${c.supplierName}` : "",
      `Separabilidad: ${TEXTILE_SEPARABILITY_LABEL[c.separability as keyof typeof TEXTILE_SEPARABILITY_LABEL] ?? c.separability}`,
      c.replacementPossible ? "Reemplazable" : "",
    ].filter(Boolean),
    formValues: {
      name: c.name,
      componentType: c.componentType,
      materialDescription: c.materialDescription ?? "",
      supplierId: c.supplierId ?? "",
      separability: c.separability,
      replacementPossible: Boolean(c.replacementPossible),
      notes: c.notes ?? "",
    },
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <p className="eyebrow">Trazaloop Textiles · Catálogos</p>
        <h1 className="text-2xl font-semibold tracking-tight">Avíos / componentes</h1>
        <div className="pt-1">
          <ExportPdfButton exportKey="textiles.component.list" />
        </div>
        <p className="max-w-2xl text-sm text-ink-soft">
          Botones, cierres, elásticos, etiquetas y demás componentes. La separabilidad es
          una estimación preliminar que alimentará la evaluación de circularidad.
        </p>
        <Link href="/textiles/catalogs" className="text-sm font-medium text-loop hover:underline">
          ← Todos los catálogos
        </Link>
      </header>
      <ListSearchForm
        basePath="/textiles/catalogs/components"
        q={q}
        placeholder="Buscar componentes por nombre…"
      />
      <TextileCatalogManager<TextileComponentInput>
        entityLabel="componente"
        entityLabelPlural="Componentes"
        fields={fields}
        rows={rows}
        createAction={createTextileComponentAction}
        updateAction={updateTextileComponentAction}
        setActiveAction={setTextileComponentActiveAction}
        deleteAction={deleteTextileComponentAction}
        canDelete={canAdministerTextileCatalogs(org.roleCode)}
      />
      <ListPagination
        basePath="/textiles/catalogs/components"
        page={page}
        pageSize={pageSize}
        total={total}
        extraParams={{ q: q || undefined }}
      />
    </div>
  );
}
