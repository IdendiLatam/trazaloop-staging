/**
 * Trazaloop · STABILIZATION-03 · Qué significa «el mismo nombre».
 *
 * ESTE FICHERO Y LA MIGRACIÓN 0188 DICEN LO MISMO, Y TIENEN QUE SEGUIR
 * DICIÉNDOLO
 *
 * La autoridad es el índice único de la base, que compara la columna que
 * mantiene su disparador. Esta copia en TypeScript existe para dos cosas que
 * ocurren fuera de la base: buscar por nombre —que tiene que encontrar lo mismo
 * que la unicidad considera igual— y localizar la fila que provocó un choque
 * para poder decir si está retirada. Si las dos definiciones se separasen,
 * habría nombres que colisionan al crear y no aparecen al buscar.
 *
 * Una prueba comprueba que ambas coinciden ejecutándolas contra la base con la
 * misma lista de casos, en vez de confiar en que nadie las toque por separado.
 *
 * POR QUÉ NO SE USA `unaccent()` NI EN UN SITIO NI EN EL OTRO
 *
 * En la base, porque la extensión no está instalada y además `unaccent(text)`
 * es STABLE: no vale para un índice, y envolverla en un `IMMUTABLE` fingido
 * sería firmar una mentira. Aquí, porque la equivalencia con aquello tiene que
 * poder comprobarse carácter a carácter, y un mapa explícito se audita; un
 * diccionario externo, no.
 */

/** Los mismos pares que `translate()` en 0188, en el mismo orden. */
const CON_ACENTO = "áàäâãåéèëêíìïîóòöôõúùüûñçýÿ";
const SIN_ACENTO = "aaaaaaeeeeiiiiooooouuuuncyy";

const MAPA = new Map<string, string>(
  [...CON_ACENTO].map((c, i) => [c, SIN_ACENTO[i]])
);

/**
 * Recorta, colapsa el espacio interior, baja a minúsculas y quita los acentos.
 * El orden es el de la migración y no es indiferente.
 */
export function normalizarIdentidad(texto: string | null | undefined): string {
  if (texto === null || texto === undefined) return "";
  const base = texto.trim().replace(/\s+/g, " ").toLowerCase();
  let salida = "";
  for (const c of base) salida += MAPA.get(c) ?? c;
  return salida;
}

/**
 * El término de búsqueda, listo para comparar contra `normalized_name`.
 *
 * Además de normalizar, escapa los comodines de `like`. Sin esto, buscar `%`
 * devolvería la tabla entera y `_` casaría con cualquier carácter: quien busca
 * un nombre no está escribiendo un patrón.
 */
export function terminoDeBusqueda(texto: string | null | undefined): string {
  return normalizarIdentidad(texto).replace(/[\\%_]/g, (m) => `\\${m}`);
}
