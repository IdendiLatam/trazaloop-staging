/**
 * Trazaloop · QUALITY-12.2D · Cuánto cuesta revisar, medido y no supuesto.
 *
 * Los números con los que hay que comparar, todos reales:
 *
 *     Copilot (QUALITY-12)          1 664 fijos · 2 514–2 886 de entrada
 *     Quick Edit (QUALITY-12.2C)      607–736 fijos ·   727 de media
 *
 * 12.2D trae hechos, así que va a costar más que 12.2C. Lo que NO puede es
 * volver al Copilot, porque entonces la separación no habría servido de nada:
 * el sentido de enrutar por `related_context_types` es traer tres cosas en vez
 * de diecinueve, y eso tiene que verse en la factura.
 *
 * Se mide con la misma regla de siempre —3,6 caracteres por token en
 * castellano— para poder comparar los tres sin trampa. La regla es
 * conservadora: en 12.2C estimó 801 y lo real fue 607–736. Se deja como está,
 * porque una estimación que se queda corta avisa tarde.
 */

export const CHARS_PER_TOKEN = 3.6;

export function tokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export type ReviewBudgetBreakdown = {
  policy: number;
  schema: number;
  userText: number;
  guidance: number;
  documentMetadata: number;
  facts: number;
  observations: number;
  limits: number;
  /** Todo lo que no es el texto de la persona. */
  fixedOverhead: number;
  total: number;
};

export function breakdown(parts: {
  policy: string; schema: string; userText: string; guidance: string;
  documentMetadata: string; facts: string; observations: string; limits: string;
}): ReviewBudgetBreakdown {
  const t = {
    policy: tokens(parts.policy),
    schema: tokens(parts.schema),
    userText: tokens(parts.userText),
    guidance: tokens(parts.guidance),
    documentMetadata: tokens(parts.documentMetadata),
    facts: tokens(parts.facts),
    observations: tokens(parts.observations),
    limits: tokens(parts.limits),
  };
  const fixedOverhead = t.policy + t.schema + t.guidance + t.documentMetadata
    + t.facts + t.observations + t.limits;
  return { ...t, fixedOverhead, total: fixedOverhead + t.userText };
}

/**
 * Los topes del encargo.
 *
 * `normal` es lo que pasa casi siempre: un texto de sección y entre uno y tres
 * tipos de contexto. `complex` es el techo de lo razonable: cuatro tipos, el
 * cupo de hechos lleno y un texto largo.
 *
 * Si una prueba los pasa, no se sube el número: se mira qué engordó.
 */
export const REVIEW_BUDGET_TARGETS = {
  normal: 1400,
  complex: 2000,
} as const;

/** El Copilot, para que la comparación esté en el código y no en un documento
 *  que nadie vuelve a abrir. */
export const COPILOT_REFERENCE = {
  fixedOverhead: 1664,
  inputLow: 2514,
  inputHigh: 2886,
} as const;

/** Texto de relleno con un número de palabras exacto, para medir. */
export function fixtureText(words: number): string {
  const base = ("El responsable del area revisa los registros generados durante la "
    + "ejecucion del proceso y deja constancia de la revision en el formato "
    + "correspondiente antes de dar por cerrada la actividad").split(/\s+/);
  const out: string[] = [];
  while (out.length < words) out.push(base[out.length % base.length]);
  return out.slice(0, words).join(" ") + ".";
}
