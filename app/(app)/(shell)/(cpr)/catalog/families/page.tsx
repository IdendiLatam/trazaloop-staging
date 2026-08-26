// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { searchFamilies, getFamily } from "@/lib/db/catalog";
import { listEvidencesForTargets } from "@/lib/db/evidences";
import { deleteFamilyAction } from "@/server/actions/catalog";
import { FamilyForm } from "@/components/domain/catalog/forms";
import { LinkedEvidenceList } from "@/components/domain/evidences/view-link";
import { ListSearchForm, ListPagination } from "@/components/ui/list-controls";
import { SuccessAlert } from "@/components/ui/alert";
import { ExportPdfButton } from "@/components/ui/export-pdf-button";

export default async function FamiliesPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; q?: string; page?: string; created?: string; updated?: string; focus?: string }>;
}) {
  const org = await requireActiveOrg();
  const params = await searchParams;

  // PCR-01 (punto 9): búsqueda + paginación reales en servidor.
  const result = await searchFamilies(org.organizationId, { q: params.q, page: params.page });
  const families = result.rows;
  const editing =
    families.find((f) => f.id === params.edit) ??
    (params.edit ? await getFamily(org.organizationId, params.edit) : undefined) ??
    undefined;

  // PCR-01.1 (blockers 3/4): el registro creado/actualizado/enfocado se
  // muestra aunque quede fuera de la página actual — se resuelve por id
  // (getter, jamás el listado completo) y se fija al inicio sin duplicarlo.
  const focusId = params.created ?? params.updated ?? params.focus ?? null;
  const focusedRecord = focusId
    ? families.find((r) => r.id === focusId) ??
      (await getFamily(org.organizationId, focusId)) ??
      null
    : null;
  const visibleRows =
    focusedRecord && !families.some((r) => r.id === focusedRecord.id)
      ? [focusedRecord, ...families]
      : families;

  // PCR-01 (punto 11): evidencias vinculadas de la página, en lote.
  const evidencesByFamily = await listEvidencesForTargets(
    org.organizationId,
    "product_family",
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
    ? "Familia creada correctamente."
    : params.updated
      ? "Cambios guardados correctamente."
      : null;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <p className="eyebrow">
          <Link href="/catalog" className="hover:underline">Catálogos</Link> · Familias
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Familias de producto</h1>
        <div className="mt-2">
          <ExportPdfButton exportKey="cpr.family.list" disabled={result.total === 0} disabledReason="no hay familias" />
        </div>
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

      <div className="rounded-lg border border-hairline bg-surface p-4">
        <ListSearchForm
          basePath="/catalog/families"
          q={params.q ?? ""}
          placeholder="Buscar por nombre o descripción…"
        />
      </div>

      <SuccessAlert message={confirmation} />

      {visibleRows.length === 0 ? (
        params.q ? (
          <p className="text-sm text-ink-soft">
            Sin resultados para esta búsqueda.{" "}
            <Link href="/catalog/families" className="text-loop underline">Limpiar búsqueda</Link>.
          </p>
        ) : (
          <p className="text-sm text-ink-soft">Aún no hay familias registradas.</p>
        )
      ) : (
        <ul className="divide-y divide-hairline rounded-lg border border-hairline bg-surface">
          {visibleRows.map((f) => {
            const isHighlighted = highlightId === f.id;
            const linked = evidencesByFamily[f.id] ?? [];
            return (
              <li
                key={f.id}
                id={`registro-${f.id}`}
                className={`px-4 py-3 ${isHighlighted ? "bg-loop/5 ring-2 ring-inset ring-loop/30" : ""}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">
                      {f.name}
                      {isHighlighted && highlightChip ? (
                        <span className="ml-2 rounded-full border border-loop/30 bg-loop/5 px-2 py-0.5 text-xs font-medium text-loop-deep">
                          {highlightChip}
                        </span>
                      ) : null}
                    </p>
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
        basePath="/catalog/families"
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        extraParams={{ q: params.q }}
      />
    </div>
  );
}
