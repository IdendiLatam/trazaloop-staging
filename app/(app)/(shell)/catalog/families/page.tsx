// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { listFamilies } from "@/lib/db/catalog";
import { deleteFamilyAction } from "@/server/actions/catalog";
import { FamilyForm } from "@/components/domain/catalog/forms";

export default async function FamiliesPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const org = await requireActiveOrg();
  const families = await listFamilies(org.organizationId);
  const { edit } = await searchParams;
  const editing = families.find((f) => f.id === edit);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <p className="eyebrow">
          <Link href="/catalog" className="hover:underline">Catálogos</Link> · Familias
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Familias de producto</h1>
      </header>

      <section className="rounded-lg border border-hairline bg-surface p-5">
        <h2 className="mb-4 text-sm font-semibold">
          {editing ? `Editar: ${editing.name}` : "Nueva familia"}
        </h2>
        <FamilyForm editing={editing} />
        {editing ? (
          <Link href="/catalog/families" className="mt-3 inline-block text-xs text-ink-soft hover:underline">
            Cancelar edición
          </Link>
        ) : null}
      </section>

      {families.length === 0 ? (
        <p className="text-sm text-ink-soft">Aún no hay familias registradas.</p>
      ) : (
        <ul className="divide-y divide-hairline rounded-lg border border-hairline bg-surface">
          {families.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-sm font-medium">{f.name}</p>
                <p className="text-xs text-ink-soft">{f.description ?? "—"}</p>
              </div>
              <div className="flex items-center gap-3">
                <Link href={`/catalog/families?edit=${f.id}`} className="text-sm text-loop hover:underline">
                  Editar
                </Link>
                <form action={deleteFamilyAction}>
                  <input type="hidden" name="id" value={f.id} />
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
