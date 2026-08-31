/**
 * Trazaloop · PE-02B3 · El vocabulario de la FAQ que lee el cliente.
 *
 * Puro: lo comparten la pantalla y las pruebas. Ninguna decisión de acceso vive
 * aquí — eso es de la base.
 */

export const FAQ_TITLE = "Preguntas frecuentes";

/** Sobrio a propósito: esto es producto, no un portal de marketing. */
export const FAQ_HEADLINE = "¿En qué podemos ayudarte?";

export const FAQ_INTRO =
  "Respuestas cortas a lo que se pregunta a menudo. Si lo que buscas no está "
  + "aquí, el Centro de soporte queda dentro de Trazaloop.";

export const FAQ_SEARCH_LABEL = "Buscar en las preguntas frecuentes";
export const FAQ_SEARCH_PLACEHOLDER = "Escribe lo que necesitas saber";

export const FAQ_FEATURED_TITLE = "Lo que más se pregunta";
export const FAQ_CATEGORIES_TITLE = "Por temas";
export const FAQ_ALL_CATEGORIES = "Todas";

/**
 * Los cuatro vacíos, que no son el mismo.
 *
 * §12 del encargo. Una avería NO puede acabar diciendo «no encontramos
 * preguntas»: quien lee eso deja de buscar y se va, convencido de que Trazaloop
 * no tiene respuesta a lo suyo.
 */
export const FAQ_EMPTY_NOTHING_PUBLISHED_TITLE = "Todavía no hay preguntas publicadas";
export const FAQ_EMPTY_NOTHING_PUBLISHED_BODY =
  "Estamos escribiéndolas. Mientras tanto, desde Trazaloop puedes escribirnos por el Centro de soporte.";

export const FAQ_EMPTY_SEARCH_TITLE = "No hay resultados para esa búsqueda";
export const FAQ_EMPTY_SEARCH_BODY =
  "Prueba con menos palabras, o mira por temas. Si aun así no aparece, escríbenos: falta una respuesta y queremos saberlo.";

export const FAQ_EMPTY_CATEGORY_TITLE = "Este tema todavía no tiene preguntas";
export const FAQ_EMPTY_CATEGORY_BODY = "Mira los demás temas o busca por palabras.";

export const FAQ_UNAVAILABLE_TITLE = "No se pudieron cargar las preguntas";
export const FAQ_UNAVAILABLE_BODY =
  "Es un problema temporal al consultarlas, no que no existan. Vuelve a intentarlo en unos minutos.";

export const FAQ_NOT_FOUND_TITLE = "No encontramos esa pregunta";
export const FAQ_NOT_FOUND_BODY =
  "Puede que el enlace haya cambiado o que la respuesta ya no esté publicada. Busca por palabras y probablemente la encuentres con otro nombre.";

/** Lo que se ofrece a quien no ha entrado, sin prometerle lo que no verá. */
export const FAQ_SIGN_IN_HINT =
  "Hay más respuestas dentro de Trazaloop, sobre el uso diario de la plataforma.";

/**
 * Los nombres de módulo que se enseñan, a partir de las claves canónicas.
 *
 * La pantalla nunca escribe `cpr` ni `traceability_6632`: son vocabulario
 * interno. Y no se duplica el catálogo — se traduce desde él.
 */
export function moduleDisplayNames(
  keys: readonly string[],
  catalog: readonly { key: string; name: string }[]
): string[] {
  return keys
    .map((k) => catalog.find((m) => m.key === k)?.name)
    .filter((n): n is string => Boolean(n));
}

/** El estado de un listado, para que la pantalla no lo deduzca dos veces. */
export type FaqListOutcome =
  | "unavailable"
  | "nothing_published"
  | "no_search_results"
  | "empty_category"
  | "ok";

export function faqListOutcome(input: {
  unavailable: boolean;
  total: number;
  hasSearch: boolean;
  hasCategory: boolean;
  anyPublishedAtAll: boolean;
}): FaqListOutcome {
  if (input.unavailable) return "unavailable";
  if (input.total > 0) return "ok";
  if (!input.anyPublishedAtAll) return "nothing_published";
  if (input.hasSearch) return "no_search_results";
  if (input.hasCategory) return "empty_category";
  return "nothing_published";
}
