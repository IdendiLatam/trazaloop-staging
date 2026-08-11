import Link from "next/link";
import { pageSummaryLabel, totalPages } from "@/lib/domain/pagination";

/**
 * Trazaloop · Sprint PCR-01 (punto 9) · Controles reutilizables de listados.
 *
 * Server components sin estado: la búsqueda es un formulario GET y la
 * paginación son enlaces — funcionan con las páginas server-rendered
 * existentes (searchParams) sin introducir un segundo design system.
 * La consulta real (organization_id + RLS + range) vive en lib/db/*.
 */

/** Formulario GET de búsqueda. `hiddenParams` conserva filtros existentes
 *  (p. ej. proveedor/material en lotes de entrada). Buscar reinicia a la
 *  página 1 (no se incluye `page`). */
export function ListSearchForm({
  basePath,
  q,
  placeholder,
  hiddenParams = {},
}: {
  basePath: string;
  q: string;
  placeholder: string;
  hiddenParams?: Record<string, string | undefined>;
}) {
  const hasFilters = q !== "";
  return (
    <form method="get" action={basePath} className="flex flex-wrap items-center gap-2">
      {Object.entries(hiddenParams).map(([name, value]) =>
        value ? <input key={name} type="hidden" name={name} value={value} /> : null
      )}
      <label className="flex-1 min-w-48">
        <span className="sr-only">Buscar</span>
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder={placeholder}
          className="block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-soft/60 focus:border-loop"
        />
      </label>
      <button
        type="submit"
        className="rounded-md border border-hairline bg-surface px-3 py-2 text-sm font-medium hover:border-loop"
      >
        Buscar
      </button>
      {hasFilters ? (
        <Link href={basePath} className="text-sm text-ink-soft hover:underline">
          Limpiar
        </Link>
      ) : null}
    </form>
  );
}

/** Paginador por enlaces (Anterior / Siguiente + resumen "X–Y de Z").
 *  `extraParams` conserva búsqueda y filtros al cambiar de página. */
export function ListPagination({
  basePath,
  page,
  pageSize,
  total,
  extraParams = {},
}: {
  basePath: string;
  page: number;
  pageSize: number;
  total: number;
  extraParams?: Record<string, string | undefined>;
}) {
  const pages = totalPages(total, pageSize);
  if (total <= pageSize && page === 1) {
    return null; // una sola página: sin controles, sin ruido
  }

  const hrefFor = (target: number) => {
    const params = new URLSearchParams();
    for (const [name, value] of Object.entries(extraParams)) {
      if (value) params.set(name, value);
    }
    if (target > 1) params.set("page", String(target));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  return (
    <nav
      aria-label="Paginación"
      className="flex flex-wrap items-center justify-between gap-3 text-sm"
    >
      <span className="text-ink-soft">{pageSummaryLabel(page, pageSize, total)}</span>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link
            href={hrefFor(page - 1)}
            className="rounded-md border border-hairline bg-surface px-3 py-1.5 font-medium hover:border-loop"
          >
            ← Anterior
          </Link>
        ) : (
          <span className="rounded-md border border-hairline bg-paper px-3 py-1.5 text-ink-soft/60">
            ← Anterior
          </span>
        )}
        <span className="text-ink-soft">
          Página {page} de {pages}
        </span>
        {page < pages ? (
          <Link
            href={hrefFor(page + 1)}
            className="rounded-md border border-hairline bg-surface px-3 py-1.5 font-medium hover:border-loop"
          >
            Siguiente →
          </Link>
        ) : (
          <span className="rounded-md border border-hairline bg-paper px-3 py-1.5 text-ink-soft/60">
            Siguiente →
          </span>
        )}
      </div>
    </nav>
  );
}
