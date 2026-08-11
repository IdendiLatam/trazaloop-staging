/**
 * Trazaloop · Sprint PCR-01 (punto 9) · Búsqueda y paginación de listados.
 *
 * Lógica PURA (sin BD, sin servidor): normalización de parámetros de URL,
 * cálculo de rangos para consultas `range()` de Supabase y saneamiento del
 * término de búsqueda para filtros `or(...ilike...)` de PostgREST.
 * La consulta REAL (con organization_id + RLS) vive en lib/db/*.
 */

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export type PageQuery = { q: string; page: number; pageSize: number };

export type PageResult<T> = {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
};

/** Normaliza `q`/`page` tal como llegan de searchParams (strings sueltos). */
export function normalizePageQuery(input: {
  q?: string | null;
  page?: string | number | null;
  pageSize?: number | null;
}): PageQuery {
  const q = (input.q ?? "").trim().slice(0, 120);
  const rawPage = typeof input.page === "number" ? input.page : Number(input.page ?? 1);
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
  const rawSize = input.pageSize ?? DEFAULT_PAGE_SIZE;
  const pageSize = Math.min(Math.max(Math.floor(rawSize), 1), MAX_PAGE_SIZE);
  return { q, page, pageSize };
}

/** Rango inclusivo [from, to] para supabase `.range(from, to)`. */
export function pageRange(page: number, pageSize: number): { from: number; to: number } {
  const from = (page - 1) * pageSize;
  return { from, to: from + pageSize - 1 };
}

export function totalPages(total: number, pageSize: number): number {
  if (total <= 0) return 1;
  return Math.ceil(total / pageSize);
}

/**
 * Si la página pedida quedó fuera de rango (p. ej. tras borrar registros o
 * al cambiar la búsqueda), la página segura es la última existente.
 */
export function clampPage(page: number, total: number, pageSize: number): number {
  return Math.min(page, totalPages(total, pageSize));
}

/**
 * Sanea el término para incrustarlo en un filtro `or("col.ilike.%q%,...")`
 * de PostgREST: comas y paréntesis son separadores de la gramática del
 * filtro y deben neutralizarse; los comodines `%`/`_` del usuario se
 * escapan para buscar el literal.
 */
export function sanitizeSearchTerm(q: string): string {
  return q
    .replace(/[,()]/g, " ")
    .replace(/[%_]/g, (m) => `\\${m}`)
    .replace(/\s+/g, " ")
    .trim();
}

/** Etiqueta "Mostrando X–Y de Z" en español (Z=0 → mensaje vacío). */
export function pageSummaryLabel(page: number, pageSize: number, total: number): string {
  if (total <= 0) return "Sin registros";
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return `Mostrando ${from}–${to} de ${total}`;
}
