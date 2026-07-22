// Ruta protegida (guard del módulo en el layout del namespace /textiles).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireTextilesModule } from "@/lib/auth/require-textiles-module";
import {
  listTextileOutsourcedProcesses,
  listTextileSuppliers,
} from "@/lib/db/textiles-catalogs";
import {
  TEXTILE_OUTSOURCED_PROCESS_TYPES,
  TEXTILE_OUTSOURCED_PROCESS_TYPE_LABEL,
  TEXTILE_TRACEABILITY_RISK_UI_ORDER,
  TEXTILE_TRACEABILITY_RISK_LABEL,
  canAdministerTextileCatalogs,
} from "@/lib/domain/textiles-catalogs";
import {
  createTextileOutsourcedProcessAction,
  updateTextileOutsourcedProcessAction,
  setTextileOutsourcedProcessActiveAction,
  type TextileOutsourcedProcessInput,
} from "@/server/actions/textiles-catalogs";
import { deleteTextileOutsourcedProcessAction } from "@/server/actions/textiles-catalogs-admin";
import {
  TextileCatalogManager,
  type CatalogFieldDef,
  type CatalogRowView,
} from "@/components/domain/textiles/catalog-manager";

export default async function TextileOutsourcedProcessesPage() {
  const org = await requireTextilesModule();
  const [outsourced, suppliers] = await Promise.all([
    listTextileOutsourcedProcesses(org.organizationId),
    listTextileSuppliers(org.organizationId),
  ]);

  const fields: CatalogFieldDef[] = [
    { key: "name", label: "Nombre", type: "text", required: true },
    {
      key: "processType",
      label: "Tipo de proceso",
      type: "select",
      options: TEXTILE_OUTSOURCED_PROCESS_TYPES.map((v) => ({
        value: v,
        label: TEXTILE_OUTSOURCED_PROCESS_TYPE_LABEL[v],
      })),
    },
    {
      key: "supplierId",
      label: "Tercero (proveedor)",
      type: "select",
      options: [
        { value: "", label: "— Sin asignar —" },
        ...suppliers.map((s) => ({ value: s.id, label: s.name })),
      ],
      help: "Registra primero el tercero en el catálogo de proveedores",
    },
    { key: "description", label: "Descripción", type: "text" },
    { key: "recordsExpected", label: "Registros esperados", type: "text", placeholder: "p. ej. remisión de salida, acta de retorno" },
    {
      key: "traceabilityRisk",
      label: "Riesgo de trazabilidad",
      type: "select",
      options: TEXTILE_TRACEABILITY_RISK_UI_ORDER.map((v) => ({ value: v, label: TEXTILE_TRACEABILITY_RISK_LABEL[v] })),
    },
    { key: "notes", label: "Notas", type: "text" },
  ];

  const rows: CatalogRowView[] = outsourced.map((p) => ({
    id: p.id,
    name: p.name,
    isActive: p.isActive,
    display: [
      TEXTILE_OUTSOURCED_PROCESS_TYPE_LABEL[p.processType as keyof typeof TEXTILE_OUTSOURCED_PROCESS_TYPE_LABEL] ?? p.processType,
      p.supplierName ? `Tercero: ${p.supplierName}` : "Sin tercero asignado",
      `Riesgo: ${TEXTILE_TRACEABILITY_RISK_LABEL[p.traceabilityRisk as keyof typeof TEXTILE_TRACEABILITY_RISK_LABEL] ?? p.traceabilityRisk}`,
    ].filter(Boolean),
    formValues: {
      name: p.name,
      processType: p.processType,
      supplierId: p.supplierId ?? "",
      description: p.description ?? "",
      recordsExpected: p.recordsExpected ?? "",
      traceabilityRisk: p.traceabilityRisk,
      notes: p.notes ?? "",
    },
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <p className="eyebrow">Trazaloop Textiles · Catálogos</p>
        <h1 className="text-2xl font-semibold tracking-tight">Procesos tercerizados</h1>
        <p className="max-w-2xl text-sm text-ink-soft">
          Lavado, tintura, estampación, bordado y otros procesos ejecutados con terceros.
          Cada tercero debería existir también como proveedor para trazabilidad futura.
        </p>
        <Link href="/textiles/catalogs" className="text-sm font-medium text-loop hover:underline">
          ← Todos los catálogos
        </Link>
      </header>
      <TextileCatalogManager<TextileOutsourcedProcessInput>
        entityLabel="proceso tercerizado"
        entityLabelPlural="Procesos tercerizados"
        fields={fields}
        rows={rows}
        createAction={createTextileOutsourcedProcessAction}
        updateAction={updateTextileOutsourcedProcessAction}
        setActiveAction={setTextileOutsourcedProcessActiveAction}
        deleteAction={deleteTextileOutsourcedProcessAction}
        canDelete={canAdministerTextileCatalogs(org.roleCode)}
      />
    </div>
  );
}
