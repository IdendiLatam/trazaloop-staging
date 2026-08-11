// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { searchSuppliers, getSupplier } from "@/lib/db/catalog";
import { listEvidencesForTargets } from "@/lib/db/evidences";
import { deleteSupplierAction } from "@/server/actions/catalog";
import { SupplierForm } from "@/components/domain/catalog/forms";
import { LinkedEvidenceList } from "@/components/domain/evidences/view-link";
import { ListSearchForm, ListPagination } from "@/components/ui/list-controls";
import { SuccessAlert } from "@/components/ui/alert";

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; q?: string; page?: string; created?: string; updated?: string; focus?: string }>;
}) {
  const org = await requireActiveOrg();
  const params = await searchParams;

  // PCR-01 (punto 9): búsqueda + paginación reales en servidor.
  const result = await searchSuppliers(org.organizationId, { q: params.q, page: params.page });
  const suppliers = result.rows;
  const editing =
    suppliers.find((s) => s.id === params.edit) ??
    (params.edit ? await getSupplier(org.organizationId, params.edit) : undefined) ??
    undefined;

  // PCR-01.1 (blockers 3/4): el registro creado/actualizado/enfocado se
  // muestra aunque quede fuera de la página actual — se resuelve por id
  // (getter, jamás el listado completo) y se fija al inicio sin duplicarlo.
  const focusId = params.created ?? params.updated ?? params.focus ?? null;
  const focusedRecord = focusId
    ? suppliers.find((r) => r.id === focusId) ??
      (await getSupplier(org.organizationId, focusId)) ??
      null
    : null;
  const visibleRows =
    focusedRecord && !suppliers.some((r) => r.id === focusedRecord.id)
      ? [focusedRecord, ...suppliers]
      : suppliers;

  // PCR-01 (punto 11): evidencias vinculadas de la página, en lote.
  const evidencesBySupplier = await listEvidencesForTargets(
    org.organizationId,
    "supplier",
    visibleRows.map((r) => r.id)
  );

  // PCR-01 (puntos 2 y 7): confirmaciones + resaltado.
  const highlightId = focusId;
  const highlightChip = params.created
    ? "Creado correctamente"
    : params.updated
      ? "Guardado correctamente"
      : null;
  const confirmation = params.created
    ? "Proveedor creado correctamente."
    : params.updated
      ? "Cambios guardados correctamente."
      : null;

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

      <div className="rounded-lg border border-hairline bg-surface p-4">
        <ListSearchForm
          basePath="/catalog/suppliers"
          q={params.q ?? ""}
          placeholder="Buscar por nombre, NIT o contacto…"
        />
      </div>

      <SuccessAlert message={confirmation} />

      {visibleRows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-hairline bg-surface px-6 py-8 text-center">
          {params.q ? (
            <>
              <p className="text-sm font-medium">Sin resultados para esta búsqueda.</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-ink-soft">
                Ajusta el término o{" "}
                <Link href="/catalog/suppliers" className="text-loop underline">limpia la búsqueda</Link>.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium">Aún no tienes proveedores.</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-ink-soft">
                Los proveedores dan origen a los lotes de entrada. Crea el primero
                con el formulario de arriba o{" "}
                <Link href="/catalog/import" className="text-loop hover:underline">
                  impórtalos por CSV
                </Link>
                .
              </p>
            </>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-hairline rounded-lg border border-hairline bg-surface">
          {visibleRows.map((s) => {
            const isHighlighted = highlightId === s.id;
            const linked = evidencesBySupplier[s.id] ?? [];
            return (
              <li
                key={s.id}
                id={`registro-${s.id}`}
                className={`px-4 py-3 ${isHighlighted ? "bg-loop/5 ring-2 ring-inset ring-loop/30" : ""}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">
                      {s.name}
                      {isHighlighted && highlightChip ? (
                        <span className="ml-2 rounded-full border border-loop/30 bg-loop/5 px-2 py-0.5 text-xs font-medium text-loop-deep">
                          {highlightChip}
                        </span>
                      ) : null}
                    </p>
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
                </div>
                {linked.length > 0 ? (
                  <div className="mt-2">
                    <LinkedEvidenceList evidences={linked} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <ListPagination
        basePath="/catalog/suppliers"
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        extraParams={{ q: params.q }}
      />
    </div>
  );
}
