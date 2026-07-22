// Ruta protegida (guard del módulo en el layout del namespace /textiles).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireTextilesModule } from "@/lib/auth/require-textiles-module";
import { listTextileProcesses } from "@/lib/db/textiles-catalogs";
import {
  TEXTILE_PROCESS_TYPES,
  TEXTILE_PROCESS_TYPE_LABEL,
  TEXTILE_TRACEABILITY_RISK_UI_ORDER,
  TEXTILE_TRACEABILITY_RISK_LABEL,
  canAdministerTextileCatalogs,
} from "@/lib/domain/textiles-catalogs";
import {
  createTextileProcessAction,
  updateTextileProcessAction,
  setTextileProcessActiveAction,
  type TextileProcessInput,
} from "@/server/actions/textiles-catalogs";
import { deleteTextileProcessAction } from "@/server/actions/textiles-catalogs-admin";
import {
  TextileCatalogManager,
  type CatalogFieldDef,
  type CatalogRowView,
} from "@/components/domain/textiles/catalog-manager";

const FIELDS: CatalogFieldDef[] = [
  { key: "name", label: "Nombre", type: "text", required: true },
  {
    key: "processType",
    label: "Tipo de proceso",
    type: "select",
    options: TEXTILE_PROCESS_TYPES.map((v) => ({ value: v, label: TEXTILE_PROCESS_TYPE_LABEL[v] })),
  },
  { key: "description", label: "Descripción", type: "text" },
  { key: "responsibleArea", label: "Área responsable", type: "text" },
  {
    key: "traceabilityRisk",
    label: "Riesgo de trazabilidad",
    type: "select",
    options: TEXTILE_TRACEABILITY_RISK_UI_ORDER.map((v) => ({ value: v, label: TEXTILE_TRACEABILITY_RISK_LABEL[v] })),
  },
  { key: "recordsExpected", label: "Registros esperados", type: "text", placeholder: "p. ej. orden de corte, planilla de producción" },
];

export default async function TextileProcessesPage() {
  const org = await requireTextilesModule();
  const processes = await listTextileProcesses(org.organizationId);

  const rows: CatalogRowView[] = processes.map((p) => ({
    id: p.id,
    name: p.name,
    isActive: p.isActive,
    display: [
      TEXTILE_PROCESS_TYPE_LABEL[p.processType as keyof typeof TEXTILE_PROCESS_TYPE_LABEL] ?? p.processType,
      p.responsibleArea ? `Área: ${p.responsibleArea}` : "",
      `Riesgo: ${TEXTILE_TRACEABILITY_RISK_LABEL[p.traceabilityRisk as keyof typeof TEXTILE_TRACEABILITY_RISK_LABEL] ?? p.traceabilityRisk}`,
    ].filter(Boolean),
    formValues: {
      name: p.name,
      processType: p.processType,
      description: p.description ?? "",
      responsibleArea: p.responsibleArea ?? "",
      traceabilityRisk: p.traceabilityRisk,
      recordsExpected: p.recordsExpected ?? "",
    },
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <p className="eyebrow">Trazaloop Textiles · Catálogos</p>
        <h1 className="text-2xl font-semibold tracking-tight">Procesos internos</h1>
        <p className="max-w-2xl text-sm text-ink-soft">
          Corte, confección, acabado, inspección, empaque y despacho, con su riesgo de
          trazabilidad y los registros que se esperan de cada uno.
        </p>
        <Link href="/textiles/catalogs" className="text-sm font-medium text-loop hover:underline">
          ← Todos los catálogos
        </Link>
      </header>
      <TextileCatalogManager<TextileProcessInput>
        entityLabel="proceso"
        entityLabelPlural="Procesos"
        fields={FIELDS}
        rows={rows}
        createAction={createTextileProcessAction}
        updateAction={updateTextileProcessAction}
        setActiveAction={setTextileProcessActiveAction}
        deleteAction={deleteTextileProcessAction}
        canDelete={canAdministerTextileCatalogs(org.roleCode)}
      />
    </div>
  );
}
