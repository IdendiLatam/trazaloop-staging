// Ruta protegida (guard del módulo en el layout del namespace /textiles).
export const dynamic = "force-dynamic";

// Trazaloop · Sprint T9E (Textil) · Catálogo de fibras con procedencia
// explícita (defecto 4.4): el catálogo BASE es global, sembrado por la
// migración 0073 y mantenido por Trazaloop (solo lectura para todas las
// organizaciones); las fibras PERSONALIZADAS (0093) pertenecen a la
// organización activa — admin/quality las crea, edita, desactiva o elimina
// (solo sin uso), con RLS y triggers que protegen el catálogo base.

import Link from "next/link";
import { requireTextilesModule } from "@/lib/auth/require-textiles-module";
import { listTextileFiberTypes } from "@/lib/db/textiles-catalogs";
import {
  TEXTILE_FIBER_FAMILIES,
  TEXTILE_FIBER_FAMILY_LABEL,
  TEXTILE_FIBER_BASE_CATALOG_TITLE,
  TEXTILE_FIBER_BASE_CATALOG_EXPLANATION,
  TEXTILE_FIBER_CUSTOM_SECTION_TITLE,
  TEXTILE_FIBER_CUSTOM_EXPLANATION,
  canAdministerTextileCatalogs,
} from "@/lib/domain/textiles-catalogs";
import {
  createTextileCustomFiberAction,
  updateTextileCustomFiberAction,
  setTextileCustomFiberActiveAction,
  deleteTextileCustomFiberAction,
  type TextileCustomFiberInput,
} from "@/server/actions/textiles-catalogs-admin";
import {
  TextileCatalogManager,
  type CatalogFieldDef,
  type CatalogRowView,
} from "@/components/domain/textiles/catalog-manager";

const CUSTOM_FIBER_FIELDS: CatalogFieldDef[] = [
  { key: "name", label: "Nombre", type: "text", required: true, placeholder: "p. ej. Bambú (declarado)" },
  {
    key: "fiberFamily",
    label: "Familia de fibra",
    type: "select",
    options: TEXTILE_FIBER_FAMILIES.map((v) => ({
      value: v,
      label: TEXTILE_FIBER_FAMILY_LABEL[v] ?? v,
    })),
  },
  {
    key: "isRecycledOption",
    label: "Variante reciclada declarada",
    type: "checkbox",
    help: "Solo registra la declaración; el soporte se gestiona como evidencia",
  },
  { key: "notes", label: "Notas", type: "text" },
];

export default async function TextileFibersPage() {
  const org = await requireTextilesModule();
  const fibers = await listTextileFiberTypes();
  const baseFibers = fibers.filter((f) => f.organizationId === null);
  const customFibers = fibers.filter((f) => f.organizationId !== null);
  const canManage = canAdministerTextileCatalogs(org.roleCode);

  const customRows: CatalogRowView[] = customFibers.map((f) => ({
    id: f.id,
    name: f.name,
    isActive: f.isActive,
    display: [
      TEXTILE_FIBER_FAMILY_LABEL[f.fiberFamily] ?? f.fiberFamily,
      f.isRecycledOption ? "Variante reciclada declarada" : "",
      f.notes ?? "",
    ].filter(Boolean),
    formValues: {
      name: f.name,
      fiberFamily: f.fiberFamily,
      isRecycledOption: f.isRecycledOption,
      notes: f.notes ?? "",
    },
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-1">
        <p className="eyebrow">Trazaloop Textiles · Catálogos</p>
        <h1 className="text-2xl font-semibold tracking-tight">Fibras</h1>
        <p className="max-w-2xl text-sm text-ink-soft">
          Tipos de fibra para registrar materiales y composiciones. Seleccionar una fibra
          “reciclada” u “orgánica” registra una declaración de catálogo — no afirma soporte
          documental ni esquemas externos.
        </p>
        <Link href="/textiles/catalogs" className="text-sm font-medium text-loop hover:underline">
          ← Todos los catálogos
        </Link>
      </header>

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold">{TEXTILE_FIBER_BASE_CATALOG_TITLE}</h2>
          <p className="max-w-2xl rounded-lg border border-loop/30 bg-loop/5 p-3 text-xs text-ink-soft">
            {TEXTILE_FIBER_BASE_CATALOG_EXPLANATION}
          </p>
        </div>
        <ul className="space-y-2">
          {baseFibers.map((f) => (
            <li
              key={f.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-hairline bg-surface p-3 text-sm"
            >
              <div className="min-w-0">
                <p className="font-medium">{f.name}</p>
                {f.notes ? <p className="text-xs text-ink-soft">{f.notes}</p> : null}
              </div>
              <div className="flex shrink-0 flex-wrap gap-1">
                <span className="rounded-full border border-hairline bg-paper px-2 py-0.5 text-[10px] text-ink-soft">
                  Catálogo base
                </span>
                <span className="rounded-full border border-hairline bg-paper px-2 py-0.5 text-[10px] text-ink-soft">
                  {TEXTILE_FIBER_FAMILY_LABEL[f.fiberFamily] ?? f.fiberFamily}
                </span>
                {f.isRecycledOption ? (
                  <span className="rounded-full border border-loop/30 bg-loop/5 px-2 py-0.5 text-[10px] text-loop-deep">
                    Variante reciclada declarada
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold">{TEXTILE_FIBER_CUSTOM_SECTION_TITLE}</h2>
          <p className="max-w-2xl text-xs text-ink-soft">{TEXTILE_FIBER_CUSTOM_EXPLANATION}</p>
        </div>

        {canManage ? (
          <TextileCatalogManager<TextileCustomFiberInput>
            entityLabel="fibra personalizada"
            entityLabelPlural="Fibras personalizadas"
            fields={CUSTOM_FIBER_FIELDS}
            rows={customRows}
            createAction={createTextileCustomFiberAction}
            updateAction={updateTextileCustomFiberAction}
            setActiveAction={setTextileCustomFiberActiveAction}
            deleteAction={deleteTextileCustomFiberAction}
            canDelete
          />
        ) : (
          <div className="space-y-2">
            <p className="rounded-lg border border-hairline bg-surface p-3 text-xs text-ink-soft">
              La gestión de fibras personalizadas (crear, editar, desactivar o eliminar) está
              disponible para los roles administrador y calidad de tu empresa.
            </p>
            {customRows.length === 0 ? (
              <p className="rounded-lg border border-hairline bg-paper p-3 text-xs text-ink-soft">
                Tu empresa aún no tiene fibras personalizadas.
              </p>
            ) : (
              <ul className="space-y-2">
                {customRows.map((f) => (
                  <li
                    key={f.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-hairline bg-surface p-3 text-sm"
                  >
                    <p className="font-medium">{f.name}</p>
                    <p className="text-xs text-ink-soft">{f.display.join(" · ")}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
