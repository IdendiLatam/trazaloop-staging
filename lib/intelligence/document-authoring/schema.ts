/**
 * Trazaloop · QUALITY-12.2C · La forma de una propuesta de redacción.
 *
 * POR QUÉ NO SE REUTILIZA EL ESQUEMA DEL COPILOT
 *
 * Porque el del Copilot ocupa ≈742 tokens y describe una respuesta que aquí no
 * tiene sentido: hechos con sus citas, interpretación, sugerencias, fuentes,
 * nivel de evidencia. Nada de eso corresponde a «este párrafo se lee mejor
 * así».
 *
 * Cuatro campos. Y los topes están en el propio esquema, no solo en la
 * validación: pedirle al modelo que escriba un ensayo explicando su edición y
 * luego recortarlo es pagar por texto que se tira.
 */

export type QuickEditSuggestion = {
  suggestedText: string;
  changeSummary: string[];
  missingInformation: string[];
  warnings: string[];
};

export const QUICK_EDIT_SCHEMA_NAME = "propuesta_de_redaccion";

export const QUICK_EDIT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    suggested_text: {
      type: "string",
      description: "El texto reescrito. Mismo significado, sin datos nuevos.",
    },
    change_summary: {
      type: "array",
      description: "Como mucho dos frases breves: qué cambiaste.",
      items: { type: "string" },
    },
    missing_information: {
      type: "array",
      description: "Como mucho tres datos que la sección pide y el texto no "
        + "tiene. Se nombran, NO se rellenan.",
      items: { type: "string" },
    },
    warnings: {
      type: "array",
      description: "Como mucho dos avisos.",
      items: { type: "string" },
    },
  },
  required: ["suggested_text", "change_summary", "missing_information", "warnings"],
};

/** Los topes de §17. Se piden en el esquema y se imponen aquí. */
export const QUICK_EDIT_LIMITS = {
  changeSummary: 2,
  missingInformation: 3,
  warnings: 2,
  /** La propuesta no puede ser un ensayo: el triple del original, o 4000. */
  suggestedTextFactor: 3,
  suggestedTextCeiling: 4000,
} as const;

export type QuickEditValidation =
  | { ok: true; suggestion: QuickEditSuggestion; trimmed: boolean }
  | { ok: false; error: string };

function lista(v: unknown, max: number): { items: string[]; trimmed: boolean } {
  const todos = (Array.isArray(v) ? v : [])
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter((x) => x.length > 0);
  return { items: todos.slice(0, max), trimmed: todos.length > max };
}

/**
 * Valida la propuesta.
 *
 * Que el proveedor diga que cumplió el esquema no es motivo para creerle: lo
 * mismo que en QUALITY-12. Y sobre todo, una propuesta sin texto no es una
 * propuesta: se rechaza en vez de dejar el editor en blanco.
 */
export function validateQuickEdit(
  value: unknown, originalLength: number
): QuickEditValidation {
  if (typeof value !== "object" || value === null) {
    return { ok: false, error: "La propuesta no tiene la forma esperada." };
  }
  const v = value as Record<string, unknown>;

  const texto = typeof v.suggested_text === "string" ? v.suggested_text.trim() : "";
  if (texto.length === 0) {
    return { ok: false, error: "La propuesta llegó sin texto." };
  }

  // Una «mejora» diez veces más larga que el original ya no es una mejora: es
  // otra cosa, y reemplazar con ella sorprendería a quien pulse el botón.
  const tope = Math.max(
    Math.ceil(originalLength * QUICK_EDIT_LIMITS.suggestedTextFactor),
    200);
  if (texto.length > Math.min(tope, QUICK_EDIT_LIMITS.suggestedTextCeiling)) {
    return {
      ok: false,
      error: "La propuesta es desproporcionadamente más larga que el texto original.",
    };
  }

  const resumen = lista(v.change_summary, QUICK_EDIT_LIMITS.changeSummary);
  const falta = lista(v.missing_information, QUICK_EDIT_LIMITS.missingInformation);
  const avisos = lista(v.warnings, QUICK_EDIT_LIMITS.warnings);

  return {
    ok: true,
    trimmed: resumen.trimmed || falta.trimmed || avisos.trimmed,
    suggestion: {
      suggestedText: texto,
      changeSummary: resumen.items,
      missingInformation: falta.items,
      warnings: avisos.items,
    },
  };
}
