// Ruta protegida (guard del módulo en el layout del namespace /textiles).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireTextilesModule } from "@/lib/auth/require-textiles-module";
import {
  listTextileMaterials,
  listTextileFiberTypes,
  listTextileSuppliers,
} from "@/lib/db/textiles-catalogs";
import {
  TEXTILE_MATERIAL_TYPES,
  TEXTILE_MATERIAL_TYPE_LABEL,
  canAdministerTextileCatalogs,
} from "@/lib/domain/textiles-catalogs";
import {
  createTextileMaterialAction,
  updateTextileMaterialAction,
  setTextileMaterialActiveAction,
  type TextileMaterialInput,
} from "@/server/actions/textiles-catalogs";
import { deleteTextileMaterialAction } from "@/server/actions/textiles-catalogs-admin";
import {
  TextileCatalogManager,
  type CatalogFieldDef,
  type CatalogRowView,
} from "@/components/domain/textiles/catalog-manager";

export default async function TextileMaterialsPage() {
  const org = await requireTextilesModule();
  const [materials, fibers, suppliers] = await Promise.all([
    listTextileMaterials(org.organizationId),
    listTextileFiberTypes(),
    listTextileSuppliers(org.organizationId),
  ]);

  const fields: CatalogFieldDef[] = [
    { key: "name", label: "Nombre", type: "text", required: true },
    { key: "internalCode", label: "Código interno", type: "text", help: "Opcional; único por empresa" },
    {
      key: "materialType",
      label: "Tipo de material",
      type: "select",
      options: TEXTILE_MATERIAL_TYPES.map((v) => ({ value: v, label: TEXTILE_MATERIAL_TYPE_LABEL[v] })),
    },
    {
      key: "primaryFiberTypeId",
      label: "Fibra principal",
      type: "select",
      options: [
        { value: "", label: "— Sin asignar —" },
        ...fibers
          .filter((f) => f.isActive)
          .map((f) => ({
            value: f.id,
            label: f.organizationId ? `${f.name} (personalizada)` : f.name,
          })),
      ],
    },
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
      key: "declaredComposition",
      label: "Composición declarada (texto preliminar)",
      type: "text",
      placeholder: "p. ej. 95 % algodón / 5 % elastano",
      help: "La composición estructurada llega en una etapa posterior",
    },
    { key: "countryOfOrigin", label: "País de origen", type: "text" },
    { key: "recycledClaim", label: "Declarado con contenido reciclado", type: "checkbox", help: "Declaración preliminar sin evidencia todavía" },
    { key: "organicClaim", label: "Declarado orgánico", type: "checkbox", help: "Declaración preliminar sin evidencia todavía" },
    { key: "hasSupplierDatasheet", label: "Con ficha técnica del proveedor", type: "checkbox", help: "Marcar si ya existe (se cargará como evidencia después)" },
    { key: "hasCompositionSupport", label: "Con soporte de composición", type: "checkbox", help: "Marcar si ya existe (se cargará como evidencia después)" },
    { key: "notes", label: "Notas", type: "text" },
  ];

  const rows: CatalogRowView[] = materials.map((m) => ({
    id: m.id,
    name: m.name,
    isActive: m.isActive,
    display: [
      TEXTILE_MATERIAL_TYPE_LABEL[m.materialType as keyof typeof TEXTILE_MATERIAL_TYPE_LABEL] ?? m.materialType,
      m.internalCode ? `Código ${m.internalCode}` : "",
      m.primaryFiberName ?? "",
      m.supplierName ? `Prov.: ${m.supplierName}` : "",
      m.declaredComposition ?? "",
      m.recycledClaim ? "Reciclado (declarado)" : "",
      m.organicClaim ? "Orgánico (declarado)" : "",
    ].filter(Boolean),
    formValues: {
      name: m.name,
      internalCode: m.internalCode ?? "",
      materialType: m.materialType,
      primaryFiberTypeId: m.primaryFiberTypeId ?? "",
      supplierId: m.supplierId ?? "",
      declaredComposition: m.declaredComposition ?? "",
      countryOfOrigin: m.countryOfOrigin ?? "",
      recycledClaim: m.recycledClaim,
      organicClaim: m.organicClaim,
      hasSupplierDatasheet: m.hasSupplierDatasheet,
      hasCompositionSupport: m.hasCompositionSupport,
      notes: m.notes ?? "",
    },
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <p className="eyebrow">Trazaloop Textiles · Catálogos</p>
        <h1 className="text-2xl font-semibold tracking-tight">Materiales e insumos</h1>
        <p className="max-w-2xl text-sm text-ink-soft">
          Telas, forros, hilos, entretelas, etiquetas y empaques. Los campos de
          declaración (reciclado, orgánico, soportes) son preliminares: registran lo que
          la empresa declara hoy; las evidencias se gestionan en una etapa posterior.
        </p>
        <Link href="/textiles/catalogs" className="text-sm font-medium text-loop hover:underline">
          ← Todos los catálogos
        </Link>
      </header>
      <TextileCatalogManager<TextileMaterialInput>
        entityLabel="material"
        entityLabelPlural="Materiales"
        fields={fields}
        rows={rows}
        createAction={createTextileMaterialAction}
        updateAction={updateTextileMaterialAction}
        setActiveAction={setTextileMaterialActiveAction}
        deleteAction={deleteTextileMaterialAction}
        canDelete={canAdministerTextileCatalogs(org.roleCode)}
      />
    </div>
  );
}
