import type { ExportDefinition } from "./registry-types";

/**
 * Trazaloop · EXPORT-01 · Validación de filtros.
 *
 * §13 dice que un listado filtrado debe exportar ESE conjunto, pero también
 * que el servidor tiene que reconstruir la consulta: el navegador manda qué
 * filtros quiere, nunca qué filas.
 *
 * Esta función es la frontera. Recorre lo que declaró la exportación —no lo
 * que llegó— y deja pasar solo lo que encaja. Un parámetro desconocido, un
 * valor fuera del catálogo o un identificador con forma rara desaparecen sin
 * ruido: no son un error del usuario, son ruido o un intento.
 *
 * Es PURA, para que una prueba pueda recorrer todos los casos sin red.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Caracteres de control. Se quitan porque un filtro de texto acaba impreso en
 * el encabezado del PDF y viaja dentro de una cabecera HTTP: un salto de línea
 * ahí es inyección de cabeceras.
 */
const CONTROL = new RegExp("[\u0000-\u001f\u007f]", "g");
const MAX_TEXT = 120;

export function validateFilters(
  definition: Pick<ExportDefinition, "filters">,
  raw: Record<string, string>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const spec of definition.filters ?? []) {
    const value = raw[spec.key];
    if (typeof value !== "string" || value.length === 0) continue;

    switch (spec.kind) {
      case "enum":
        if ((spec.values ?? []).includes(value)) out[spec.key] = value;
        break;
      case "uuid":
        // La FORMA se comprueba aquí; la PERTENENCIA la comprueba la consulta,
        // que siempre lleva el `organization_id` de la sesión.
        if (UUID.test(value)) out[spec.key] = value;
        break;
      case "date":
        if (DATE.test(value)) out[spec.key] = value;
        break;
      case "text":
        out[spec.key] = value.replace(CONTROL, "").slice(0, MAX_TEXT);
        break;
    }
  }
  return out;
}
