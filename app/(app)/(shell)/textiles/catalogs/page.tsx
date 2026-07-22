// Ruta protegida (guard del módulo en el layout del namespace /textiles).
export const dynamic = "force-dynamic";

// Trazaloop · Sprint T3 (Textil) · Catálogos textiles base.
// Página principal con tarjetas hacia los seis catálogos. La información
// registrada aquí alimenta los sprints T4–T9; nada afirma certificación ni
// validación externa (las evidencias llegan en T5).

import Link from "next/link";
import { requireTextilesModule } from "@/lib/auth/require-textiles-module";
import {
  listTextileSuppliers,
  listTextileFiberTypes,
  listTextileMaterials,
  listTextileComponents,
  listTextileProcesses,
  listTextileOutsourcedProcesses,
} from "@/lib/db/textiles-catalogs";
import { TEXTILE_CATALOGS_DISCLAIMER } from "@/lib/domain/textiles-catalogs";

export default async function TextileCatalogsPage() {
  const org = await requireTextilesModule();

  const [suppliers, fibers, materials, components, processes, outsourced] =
    await Promise.all([
      listTextileSuppliers(org.organizationId),
      listTextileFiberTypes(),
      listTextileMaterials(org.organizationId),
      listTextileComponents(org.organizationId),
      listTextileProcesses(org.organizationId),
      listTextileOutsourcedProcesses(org.organizationId),
    ]);

  const cards = [
    {
      href: "/textiles/catalogs/suppliers",
      title: "Proveedores",
      description: "Proveedores de telas, avíos, hilos, empaque y terceros de proceso.",
      count: suppliers.length,
    },
    {
      href: "/textiles/catalogs/fibers",
      title: "Fibras",
      description: "Catálogo global de tipos de fibra con nomenclatura genérica (solo lectura).",
      count: fibers.length,
    },
    {
      href: "/textiles/catalogs/materials",
      title: "Materiales e insumos",
      description: "Telas, forros, hilos, entretelas, etiquetas y empaques con su fibra principal.",
      count: materials.length,
    },
    {
      href: "/textiles/catalogs/components",
      title: "Avíos / componentes",
      description: "Botones, cierres, elásticos y demás componentes con su separabilidad.",
      count: components.length,
    },
    {
      href: "/textiles/catalogs/processes",
      title: "Procesos internos",
      description: "Corte, confección, acabado, empaque y su riesgo de trazabilidad.",
      count: processes.length,
    },
    {
      href: "/textiles/catalogs/outsourced-processes",
      title: "Procesos tercerizados",
      description: "Lavado, tintura, estampación, bordado y otros procesos con terceros.",
      count: outsourced.length,
    },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-1">
        <p className="eyebrow">Trazaloop Textiles · Catálogos</p>
        <h1 className="text-2xl font-semibold tracking-tight">Catálogos textiles</h1>
        <p className="max-w-2xl text-sm text-ink-soft">
          Registra la información base que luego alimentará productos, composición,
          evidencias, circularidad y pasaporte técnico textil.
        </p>
        <p className="max-w-2xl text-xs text-ink-soft">{TEXTILE_CATALOGS_DISCLAIMER}</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="flex flex-col gap-1 rounded-lg border border-hairline bg-surface p-4 transition-colors hover:border-loop"
          >
            <span className="flex items-center justify-between">
              <span className="text-sm font-semibold">{c.title}</span>
              <span className="rounded-full border border-hairline bg-paper px-2 py-0.5 text-[10px] text-ink-soft">
                {c.count} registro{c.count === 1 ? "" : "s"}
              </span>
            </span>
            <span className="text-xs text-ink-soft">{c.description}</span>
            <span className="mt-1 text-xs font-medium text-loop">Abrir →</span>
          </Link>
        ))}
      </div>

      <Link href="/textiles" className="text-sm font-medium text-loop hover:underline">
        ← Volver al módulo Textil
      </Link>
    </div>
  );
}
