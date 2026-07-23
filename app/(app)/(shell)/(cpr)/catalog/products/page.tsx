// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { listProducts, listFamilies } from "@/lib/db/catalog";
import { deleteProductAction } from "@/server/actions/catalog";
import { ProductForm } from "@/components/domain/catalog/forms";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const org = await requireActiveOrg();
  const [products, families] = await Promise.all([
    listProducts(org.organizationId),
    listFamilies(org.organizationId),
  ]);
  const { edit } = await searchParams;
  const editing = products.find((p) => p.id === edit);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <p className="eyebrow">
          <Link href="/catalog" className="hover:underline">Catálogos</Link> · Productos
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Productos</h1>
      </header>

      <section className="rounded-lg border border-hairline bg-surface p-5">
        <h2 className="mb-4 text-sm font-semibold">
          {editing ? `Editar: ${editing.name}` : "Nuevo producto"}
        </h2>
        <ProductForm
          families={families.map((f) => ({ value: f.id, label: f.name }))}
          editing={editing}
        />
        {editing ? (
          <Link href="/catalog/products" className="mt-3 inline-block text-xs text-ink-soft hover:underline">
            Cancelar edición
          </Link>
        ) : null}
      </section>

      {products.length === 0 ? (
        <p className="text-sm text-ink-soft">Aún no hay productos registrados.</p>
      ) : (
        <ul className="divide-y divide-hairline rounded-lg border border-hairline bg-surface">
          {products.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-sm font-medium">
                  <span className="code mr-2 text-xs text-ink-soft">{p.code}</span>
                  {p.name}
                </p>
                <p className="text-xs text-ink-soft">
                  {p.family_name ?? "Sin familia"}
                  {p.declared_recycled_percent !== null
                    ? ` · declara ${p.declared_recycled_percent}% reciclado`
                    : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Link href={`/catalog/products?edit=${p.id}`} className="text-sm text-loop hover:underline">
                  Editar
                </Link>
                <form action={deleteProductAction}>
                  <input type="hidden" name="id" value={p.id} />
                  <button type="submit" className="text-sm text-danger hover:underline">
                    Eliminar
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
