/**
 * Trazaloop · PE-02B4 · Cómo se presenta una ayuda contextual.
 *
 * Puro. Lo comparten la pantalla, la vista previa de la consola y las pruebas.
 */

/** Las tres partes que ve quien pulsa el «i». */
export type HelpSections = {
  title: string;
  explanation: string;
  example: string | null;
  technicalReference: string | null;
};

/** Los rótulos, en un solo sitio. */
export const HELP_LABEL_WHAT = "Qué es";
export const HELP_LABEL_EXAMPLE = "Ejemplo";
export const HELP_LABEL_REFERENCE = "Respaldo";

/**
 * Solo se pinta lo que tiene contenido.
 *
 * Un «Ejemplo» seguido de nada es peor que no tener ejemplo: hace pensar que
 * falta algo por cargar. Y la explicación no lleva rótulo cuando va sola —si es
 * lo único que hay, poner «Qué es» encima es ceremonia sin información—.
 */
export function helpSectionsToRender(h: HelpSections): {
  label: string | null; body: string;
}[] {
  const partes: { label: string | null; body: string }[] = [];
  const soloExplicacion = !h.example && !h.technicalReference;
  if (h.explanation.trim().length > 0) {
    partes.push({ label: soloExplicacion ? null : HELP_LABEL_WHAT, body: h.explanation });
  }
  if (h.example && h.example.trim().length > 0) {
    partes.push({ label: HELP_LABEL_EXAMPLE, body: h.example });
  }
  if (h.technicalReference && h.technicalReference.trim().length > 0) {
    partes.push({ label: HELP_LABEL_REFERENCE, body: h.technicalReference });
  }
  return partes;
}

/**
 * El puente con el botón «i» de siempre.
 *
 * `SectionHint` recibe hoy un `ResolvedHint` —un texto ya autorizado— y ese
 * contrato lo usan TrazaDocs CPR y Textiles desde T9G. No se cambia: la ayuda
 * administrable se convierte a esa forma, con sus rótulos, y el componente sigue
 * siendo uno solo.
 *
 * Es la diferencia entre extender lo que hay y estrenar un segundo motor de
 * tooltips, que es justo lo que §2 del encargo prohíbe.
 *
 * El tipo de retorno se estrecha a la variante no restringida a propósito: la
 * ayuda contextual NO tiene puerta comercial —decisión congelada— así que nunca
 * devuelve el aviso de Demo. Que el tipo lo diga evita que alguien lo intente.
 */
export function helpToHint(
  h: HelpSections | null | undefined
): { restricted: false; title: null; text: string } | null {
  if (!h) return null;
  const partes = helpSectionsToRender(h);
  if (partes.length === 0) return null;
  const texto = partes
    .map((p) => (p.label ? `${p.label.toUpperCase()}\n${p.body}` : p.body))
    .join("\n\n");
  return { restricted: false, title: null, text: texto };
}

/**
 * Qué hace la pantalla cuando la ayuda no se pudo consultar · §24.
 *
 * NO se pinta un panel vacío, y no se rompe la página. El botón «i»
 * sencillamente no aparece, que es exactamente lo que ya hacía cuando una
 * sección no tenía texto: un comportamiento que existe, que la gente conoce, y
 * que no obliga a inventar un estado de error dentro de un tooltip.
 *
 * Se elige así, y no un «no se pudo cargar la ayuda», porque la ayuda es
 * secundaria: quien está rellenando un formulario no debería recibir un aviso
 * de avería por algo que solo iba a explicarle un campo. La avería sí queda
 * anotada donde importa —la consola distingue «sin configurar» de «no se pudo
 * consultar»—.
 */
export const HELP_UNAVAILABLE_IS_SILENT = true;

/** Lo que se dice a quien no puede administrar. Vive aquí porque un módulo
 *  `"use server"` solo exporta funciones asíncronas. */
export const HELP_NO_PERMISSION =
  "Solo un superadministrador de plataforma administra la ayuda del producto.";

/** Los rótulos de la consola. */
export const HELP_TARGET_KIND_LABEL = {
  page: "La pantalla entera",
  section: "Un bloque de la pantalla",
  field: "Un campo",
  concept: "Un concepto",
} as const;

export const HELP_NORMATIVE_LABEL = {
  safe: "No menciona normas",
  normative_reference: "Cita una norma como referencia",
  conformity_risk: "Podría leerse como afirmación de cumplimiento",
  certification_risk: "Podría leerse como afirmación de certificación",
  ambiguous: "Se puede leer de las dos maneras",
} as const;

export const HELP_STATUS_LABEL = {
  draft: "Borrador",
  published: "Publicada",
  unpublished: "Retirada",
} as const;

export const HELP_UNAVAILABLE_MESSAGE =
  "No fue posible consultar la ayuda del producto. Es un problema temporal, no una pérdida de contenido. Vuelve a intentarlo en unos minutos.";

export const HELP_STATUS_HINT = {
  draft: "Nunca se publicó: el botón «i» no aparece en esa pantalla.",
  published: "Hay una versión vigente y se está leyendo.",
  unpublished: "Se retiró. El texto se conserva y se puede volver a publicar.",
} as const;
