import "server-only";

import {
  pageRange, normalizePageQuery, clampPage, sanitizeSearchTerm,
  TRAVERSAL_CHUNK, TRAVERSAL_MAX_ROWS,
} from "@/lib/domain/pagination";

/**
 * Trazaloop · PT-01 · Leer una lista sin que la base la corte por su cuenta.
 *
 * EL PROBLEMA QUE RESUELVE
 *
 * `supabase/config.toml` fija `max_rows = 1000`. Una consulta sin `.range()`
 * que abarque mil doscientas filas devuelve mil. Sin error. Con éxito. Y la
 * pantalla las enseña como si fueran todas.
 *
 * Es la misma forma de fallar que costó un sprint en QUALITY-12.2F, cuando la
 * consola de plataforma convirtió una lectura denegada en «todavía no hay
 * consumo». Allí la lectura estaba denegada; aquí está cortada. En pantalla no
 * se distinguen: las dos parecen un dato completo.
 *
 * DOS FORMAS DE LEER, Y HACEN FALTA LAS DOS
 *
 *   readPage    la pantalla. Una página, con el total real al lado, para que
 *               nunca se pueda aparentar un conjunto completo.
 *
 *   readAll     la exportación. Recorre hasta agotar y DECLARA si lo logró.
 *               Un documento que dice «1 000 filas» cuando había 1 200 es
 *               peor que uno que no se genera.
 */

export { TRAVERSAL_CHUNK, TRAVERSAL_MAX_ROWS };

export type Page<T> = { rows: T[]; total: number; page: number; pageSize: number };

/**
 * Lo que devuelve un recorrido completo.
 *
 * `complete` NO es decorativo. Es lo que la exportación tiene que enseñar
 * cuando vale `false`, en vez de entregar un documento truncado en silencio.
 */
export type FullRead<T> = { rows: T[]; complete: boolean; total: number };

type RangeQuery<T> = {
  range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>;
};

/**
 * Recorre TODAS las páginas autorizadas.
 *
 * `build()` se llama en cada vuelta y debe devolver una consulta ya acotada al
 * inquilino, filtrada y ORDENADA. El orden no es cosmético: sin un orden
 * estable, dos páginas consecutivas pueden repetir y omitir filas.
 */
export async function readAll<T>(
  build: () => RangeQuery<T>,
  opts: { chunk?: number; max?: number } = {}
): Promise<FullRead<T>> {
  const chunk = opts.chunk ?? TRAVERSAL_CHUNK;
  const max = opts.max ?? TRAVERSAL_MAX_ROWS;
  const rows: T[] = [];

  for (let from = 0; from < max; from += chunk) {
    const { data, error } = await build().range(from, from + chunk - 1);
    // Un error a mitad de recorrido NO se convierte en «se acabó». Se
    // devuelve lo leído marcado como incompleto, y quien llame decide.
    if (error) return { rows, complete: false, total: rows.length };
    const lote = data ?? [];
    rows.push(...lote);
    if (lote.length < chunk) return { rows, complete: true, total: rows.length };
  }
  // Se alcanzó el freno: hay más de las que cabe recorrer y hay que decirlo.
  return { rows, complete: false, total: rows.length };
}

/**
 * Igual que `readAll`, pero LANZA si no pudo recorrerlo todo.
 *
 * Es la que usan los selectores y los exportadores, y lanza a propósito. Un
 * desplegable al que le faltan opciones no se distingue de uno completo: la
 * persona no elige lo que no ve y no tiene forma de saber que existía. Una
 * exportación corta es peor todavía, porque se firma y se entrega.
 *
 * Entre romper la pantalla y entregar un dato incompleto con aspecto de
 * completo, este sprint elige romper la pantalla. Es exactamente la lección de
 * QUALITY-12.2F: una lectura que falla no puede presentarse como ausencia de
 * datos.
 *
 * En la práctica solo salta si PostgREST devuelve un error a mitad de
 * recorrido o si se alcanza el freno de 100 000 filas.
 */
export async function readAllStrict<T>(
  build: () => RangeQuery<T>,
  what: string,
  opts: { chunk?: number; max?: number } = {}
): Promise<T[]> {
  const { rows, complete } = await readAll(build, opts);
  if (!complete) {
    throw new Error(
      `Lectura incompleta de ${what}: se leyeron ${rows.length} filas y no se pudo confirmar que fueran todas. ` +
      "No se entrega un conjunto parcial como si estuviera completo."
    );
  }
  return rows;
}

/**
 * Una página, con el total del conjunto FILTRADO.
 *
 * El orden de la consulta que construya `build` debe ser siempre:
 *
 *     inquilino → filtros → búsqueda → count → order → range
 *
 * Filtrar después de paginar devolvería «los resultados de la página uno», que
 * no es lo mismo que «los resultados» y se parece lo bastante como para que
 * nadie lo note.
 */
export async function readPage<T>(
  build: (opts: { from: number; to: number }) => PromiseLike<{ data: T[] | null; count: number | null }>,
  query: { q?: string | null; page?: string | number | null; pageSize?: number | null }
): Promise<Page<T>> {
  const { page, pageSize } = normalizePageQuery(query);
  const primera = pageRange(page, pageSize);
  const { data, count } = await build(primera);
  const total = count ?? (data ?? []).length;

  // Si la página pedida se salió del rango —porque cambió la búsqueda o se
  // borraron filas—, se relee la última existente en vez de enseñar el vacío
  // de una página que no existe.
  const segura = clampPage(page, total, pageSize);
  if (segura !== page) {
    const otra = pageRange(segura, pageSize);
    const { data: d2 } = await build(otra);
    return { rows: d2 ?? [], total, page: segura, pageSize };
  }
  return { rows: data ?? [], total, page, pageSize };
}

export { sanitizeSearchTerm };
