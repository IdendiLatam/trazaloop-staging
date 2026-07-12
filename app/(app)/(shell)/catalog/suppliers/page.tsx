// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { listSuppliers } from "@/lib/db/catalog";
import { deleteSupplierAction } from "@/server/actions/catalog";
import { SupplierForm } from "@/components/domain/catalog/forms";

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const org = await requireActiveOrg();
  const suppliers = await listSuppliers(org.organizationId);
  const { edit } = await searchParams;
  const editing = suppliers.find((s) => s.id === edit);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <p className="eyebrow">
          <Link href="/catalog" className="hover:underline">Catálogos</Link> · Proveedores
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Proveedores</h1>
      </header>

      <section className="rounded-lg border border-hairline bg-surface p-5">
        <h2 className="mb-4 text-sm font-semibold">
          {editing ? `Editar: ${editing.name}` : "Nuevo proveedor"}
        </h2>
        <SupplierForm editing={editing} />
        {editing ? (
          <Link href="/catalog/suppliers" className="mt-3 inline-block text-xs text-ink-soft hover:underline">
            Cancelar edición
          </Link>
        ) : null}
      </section>

      {suppliers.length === 0 ? (
        <p className="text-sm text-ink-soft">
          Aún no hay proveedores. Crea el primero o{" "}
          <Link href="/catalog/import" className="text-loop hover:underline">impórtalos por CSV</Link>.
        </p>
      ) : (
        <ul className="divide-y divide-hairline rounded-lg border border-hairline bg-surface">
          {suppliers.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-sm font-medium">{s.name}</p>
                <p className="code text-xs text-ink-soft">
                  {[s.tax_id, s.contact].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Link href={`/catalog/suppliers?edit=${s.id}`} className="text-sm text-loop hover:underline">
                  Editar
                </Link>
                <form action={deleteSupplierAction}>
                  <input type="hidden" name="id" value={s.id} />
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
