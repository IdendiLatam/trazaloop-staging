// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireCprModule } from "@/lib/auth/require-cpr-module";
import {
  listSuppliers,
  listFamilies,
  listProducts,
  listMaterials,
} from "@/lib/db/catalog";

export default async function CatalogIndexPage() {
  const org = await requireCprModule();
  const [suppliers, families, products, materials] = await Promise.all([
    listSuppliers(org.organizationId),
    listFamilies(org.organizationId),
    listProducts(org.organizationId),
    listMaterials(org.organizationId),
  ]);

  const cards = [
    {
      href: "/catalog/suppliers",
      title: "Proveedores",
      count: suppliers.length,
      hint: "Quién entrega el material que ingresa.",
    },
    {
      href: "/catalog/families",
      title: "Familias de producto",
      count: families.length,
      hint: "Agrupaciones de referencias similares.",
    },
    {
      href: "/catalog/products",
      title: "Productos",
      count: products.length,
      hint: "Referencias con contenido reciclado declarado.",
    },
    {
      href: "/catalog/materials",
      title: "Materiales",
      count: materials.length,
      hint: "Con clasificación normativa de origen.",
    },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-1">
        <p className="eyebrow">Catálogos</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Catálogos de {org.organizationName}
        </h1>
        <p className="text-sm text-ink-soft">
          Los catálogos alimentan la trazabilidad (Sprint 3) y el cálculo
          (Sprint 4). Puedes crearlos aquí o importarlos por CSV.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="rounded-lg border border-hairline bg-surface p-5 transition-colors hover:border-loop"
          >
            <div className="flex items-baseline justify-between">
              <h2 className="font-semibold">{c.title}</h2>
              <span className="code text-2xl font-semibold text-loop">{c.count}</span>
            </div>
            <p className="mt-1 text-sm text-ink-soft">{c.hint}</p>
          </Link>
        ))}
      </div>

      <Link
        href="/catalog/import"
        className="inline-flex items-center rounded-md border border-hairline bg-surface px-4 py-2 text-sm font-semibold hover:border-loop"
      >
        Importar catálogos desde CSV
      </Link>
    </div>
  );
}
