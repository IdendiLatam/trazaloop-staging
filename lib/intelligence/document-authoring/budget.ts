/**
 * Trazaloop · QUALITY-12.2C · Cuánto cuesta esto, medido y no supuesto.
 *
 * El descubrimiento de QUALITY-12.2 midió el Copilot: 846 tokens de política,
 * 742 de esquema y 76 de tarea. **1 664 tokens antes de un solo byte de
 * contenido.** Ese es el número que esta capa existe para no repetir.
 *
 * Aquí se mide lo mismo con la misma regla —3,6 caracteres por token en
 * castellano— para poder compararlos sin trampa. No es exacto: sirve para
 * vigilar el orden de magnitud, que es lo que decide si una mejora de párrafo
 * es barata o cuesta como una consulta completa.
 */

export const CHARS_PER_TOKEN = 3.6;

export function tokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export type BudgetBreakdown = {
  policy: number;
  task: number;
  schema: number;
  userText: number;
  guidance: number;
  organizationProfile: number;
  documentMetadata: number;
  /** Todo lo que NO es el texto de la persona. */
  fixedOverhead: number;
  total: number;
};

export function breakdown(parts: {
  policy: string;
  task: string;
  schema: string;
  userText: string;
  guidance: string;
  organizationProfile: string;
  documentMetadata: string;
}): BudgetBreakdown {
  const t = {
    policy: tokens(parts.policy),
    task: tokens(parts.task),
    schema: tokens(parts.schema),
    userText: tokens(parts.userText),
    guidance: tokens(parts.guidance),
    organizationProfile: tokens(parts.organizationProfile),
    documentMetadata: tokens(parts.documentMetadata),
  };
  const fixedOverhead = t.policy + t.task + t.schema + t.guidance
    + t.organizationProfile + t.documentMetadata;
  return { ...t, fixedOverhead, total: fixedOverhead + t.userText };
}

/**
 * Los topes por tamaño de texto, del encargo.
 *
 * No son adornos: si se pasan, la prueba falla y hay que mirar qué engordó.
 */
export const BUDGET_TARGETS: { words: number; maxInput: number }[] = [
  { words: 50, maxInput: 900 },
  { words: 100, maxInput: 1000 },
  { words: 250, maxInput: 1300 },
  { words: 500, maxInput: 1800 },
];

/** Texto de relleno con un número de palabras exacto, para medir. */
export function fixtureText(words: number): string {
  const base = ("Las actividades de recepción se verifican contra la orden de compra "
    + "y se registran en el formato correspondiente antes de liberar el material "
    + "para su uso en producción").split(/\s+/);
  const out: string[] = [];
  while (out.length < words) out.push(base[out.length % base.length]);
  return out.slice(0, words).join(" ") + ".";
}
