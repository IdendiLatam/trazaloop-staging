// Ruta protegida (guard del módulo en el layout del namespace /textiles).
export const dynamic = "force-dynamic";

// Trazaloop · Sprint T6 (Textil) · Lotes de entrada (materiales y avíos/
// componentes) con saldo desde la vista de balance. Sin conversión de
// unidades: el saldo compara solo consumos en la unidad del lote.

import Link from "next/link";
import { MEASUREMENT_UNIT_OPTIONS } from "@/lib/domain/measurement-units";
import { requireTextilesModule } from "@/lib/auth/require-textiles-module";
import { searchTextileInputLots } from "@/lib/db/textiles-traceability";
import {
  listTextileMaterials,
  listTextileComponents,
  listTextileSuppliers,
} from "@/lib/db/textiles-catalogs";
import {
  TEXTILE_LOT_TYPES,
  TEXTILE_LOT_TYPE_LABEL,
  TEXTILE_INPUT_LOT_STATUSES,
  TEXTILE_INPUT_LOT_STATUS_LABEL,
} from "@/lib/domain/textiles-traceability";
import {
  createTextileInputLotAction,
  updateTextileInputLotAction,
  setTextileInputLotActiveAction,
  type TextileInputLotInput,
} from "@/server/actions/textiles-traceability";
import {
  TextileCatalogManager,
  type CatalogFieldDef,
  type CatalogRowView,
} from "@/components/domain/textiles/catalog-manager";
import { ExportPdfButton } from "@/components/ui/export-pdf-button";
import { ListSearchForm, ListPagination } from "@/components/ui/list-controls";

export default async function TextileInputLotsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const org = await requireTextilesModule();
  // PT-01 · La lista principal es una página con su total al lado, y la
  // búsqueda va en el servidor sobre TODO el conjunto autorizado. Los
  // catálogos auxiliares se siguen leyendo enteros: alimentan desplegables, y
  // una opción que falta ahí es una opción que no se puede elegir.
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const q = one(params.q) ?? "";
  const [{ rows: lots, total, page, pageSize }, materials, components, suppliers] = await Promise.all([
    searchTextileInputLots(org.organizationId, { q, page: one(params.page) }),
    listTextileMaterials(org.organizationId),
    listTextileComponents(org.organizationId),
    listTextileSuppliers(org.organizationId),
  ]);

  const fields: CatalogFieldDef[] = [
    { key: "lotCode", label: "Código del lote", type: "text", required: true, placeholder: "p. ej. LE-2026-014" },
    {
      key: "lotType",
      label: "Tipo de lote",
      type: "select",
      options: TEXTILE_LOT_TYPES.map((v) => ({ value: v, label: TEXTILE_LOT_TYPE_LABEL[v] })),
    },
    {
      key: "materialId",
      label: "Material (para lotes de material)",
      type: "select",
      options: [
        { value: "", label: "—" },
        ...materials.filter((m) => m.isActive).map((m) => ({ value: m.id, label: m.name })),
      ],
    },
    {
      key: "componentId",
      label: "Componente (para lotes de avíos)",
      type: "select",
      options: [
        { value: "", label: "—" },
        ...components.filter((c) => c.isActive).map((c) => ({ value: c.id, label: c.name })),
      ],
    },
    {
      key: "supplierId",
      label: "Proveedor",
      type: "select",
      options: [
        { value: "", label: "— Sin proveedor (queda como brecha) —" },
        ...suppliers.filter((s) => s.isActive).map((s) => ({ value: s.id, label: s.name })),
      ],
    },
    { key: "quantityReceived", label: "Cantidad recibida", type: "text", placeholder: "p. ej. 120" },
    // PT-03B · Catálogo cerrado: la unidad dejó de ser texto libre.
    { key: "unit", label: "Unidad", type: "select", options: MEASUREMENT_UNIT_OPTIONS.map((u) => ({ value: u.value, label: u.label })) },
    { key: "receivedDate", label: "Fecha de recepción (AAAA-MM-DD)", type: "text" },
    { key: "documentReference", label: "Documento de referencia", type: "text", placeholder: "remisión, factura…" },
    {
      key: "status",
      label: "Estado",
      type: "select",
      options: TEXTILE_INPUT_LOT_STATUSES.map((v) => ({ value: v, label: TEXTILE_INPUT_LOT_STATUS_LABEL[v] })),
    },
    { key: "notes", label: "Notas", type: "text" },
  ];

  const rows: CatalogRowView[] = lots.map((l) => ({
    id: l.id,
    name: l.lotCode,
    isActive: l.isActive,
    display: [
      `${TEXTILE_LOT_TYPE_LABEL[l.lotType as keyof typeof TEXTILE_LOT_TYPE_LABEL] ?? l.lotType}: ${l.materialName ?? l.componentName ?? ""}`,
      l.supplierName ? `Proveedor: ${l.supplierName}` : "Sin proveedor (brecha)",
      l.quantityReceived !== null
        ? `Recibido ${l.quantityReceived} ${l.unit ?? ""} · consumido ${l.quantityConsumed} · saldo ${l.quantityRemaining ?? "—"}`
        : "Sin cantidad declarada (saldo no comparable)",
      l.otherUnitConsumptions > 0
        ? `${l.otherUnitConsumptions} consumo(s) en otra unidad (no comparables)`
        : "",
      TEXTILE_INPUT_LOT_STATUS_LABEL[l.status as keyof typeof TEXTILE_INPUT_LOT_STATUS_LABEL] ?? l.status,
    ].filter(Boolean),
    formValues: {
      lotCode: l.lotCode,
      lotType: l.lotType,
      materialId: l.materialId ?? "",
      componentId: l.componentId ?? "",
      supplierId: l.supplierId ?? "",
      quantityReceived: l.quantityReceived !== null ? String(l.quantityReceived) : "",
      unit: l.unit ?? "",
      receivedDate: l.receivedDate ?? "",
      documentReference: l.documentReference ?? "",
      status: l.status,
      notes: l.notes ?? "",
    },
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-1">
        <p className="eyebrow">Trazaloop Textiles · Trazabilidad</p>
        <h1 className="text-2xl font-semibold tracking-tight">Lotes de entrada</h1>
        <div className="pt-1">
          <ExportPdfButton exportKey="textiles.input-lot.list" />
        </div>
        <p className="max-w-2xl text-sm text-ink-soft">
          Telas, hilos, forros, etiquetas, botones, cierres y empaques recibidos, con
          proveedor, cantidad y saldo. El saldo solo compara consumos registrados en la
          misma unidad del lote (sin conversión automática).
        </p>
        <Link href="/textiles/traceability" className="text-sm font-medium text-loop hover:underline">
          ← Trazabilidad textil
        </Link>
      </header>

      <ListSearchForm basePath="/textiles/traceability/input-lots" q={q} placeholder="Buscar lotes por código…" />

      <TextileCatalogManager<TextileInputLotInput>
        entityLabel="lote de entrada"
        entityLabelPlural="lotes de entrada"
        fields={fields}
        rows={rows}
        createAction={createTextileInputLotAction}
        updateAction={updateTextileInputLotAction}
        setActiveAction={setTextileInputLotActiveAction}
        rowExportKey="textiles.input-lot.detail"
      />
      <ListPagination
        basePath="/textiles/traceability/input-lots"
        page={page}
        pageSize={pageSize}
        total={total}
        extraParams={{ q: q || undefined }}
      />
    </div>
  );
}
