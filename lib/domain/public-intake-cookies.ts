/**
 * Trazaloop · PUBLIC-DIAGNOSTICS-01E · Los nombres de las dos galletas.
 *
 * Viven fuera del fichero de acciones porque un módulo `"use server"` solo
 * puede exportar funciones asíncronas: exportar una constante desde allí no
 * compila. Y los necesitan dos sitios —la página, que pone la marca de tiempo,
 * y la acción, que la lee—, así que tienen que estar en un tercero.
 */

/** El testigo de continuidad de ESTE navegador. HttpOnly; nunca lo lee un guion. */
export const INTAKE_COOKIE = "td_intake";

/** Cuándo pintó el servidor el formulario, para el tiempo mínimo de interacción. */
export const RENDER_COOKIE = "td_intake_t";

/** Lo justo para que un envío instantáneo no pase, sin molestar a nadie. */
export const MIN_INTERACTION_SECONDS = 3;
