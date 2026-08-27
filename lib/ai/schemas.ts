/**
 * Trazaloop · QUALITY-12 · §25/§26 · La forma de una respuesta, y su validación.
 *
 * POR QUÉ HAY ESQUEMA
 *
 * Porque §65 pide que se distinga a simple vista lo que se ENCONTRÓ de lo que
 * la IA INTERPRETA y de lo que SUGIERE, y eso no se consigue pidiendo «responde
 * bien»: se consigue exigiendo que cada cosa venga en su sitio. Un párrafo
 * donde todo va mezclado es exactamente el formato en el que una suposición se
 * lee como un hecho.
 *
 * POR QUÉ SE VALIDA IGUALMENTE
 *
 * Que el proveedor diga que cumplió el esquema no es motivo para creerle (§26).
 * Y sobre todo: las CITAS se comprueban contra las referencias que el servidor
 * puso en el contexto. Una cita a una fuente que no existe no se corrige ni se
 * ignora en silencio: se elimina, y el hecho que dependía de ella se marca como
 * no sostenido (§21).
 */

export type AiFact = { statement: string; references: number[] };
export type AiSuggestion = { title: string; detail: string; kind: string };

export type AiAnswer = {
  summary: string;
  facts: AiFact[];
  interpretation: string[];
  suggestions: AiSuggestion[];
  unanswered: string[];
  evidence: "sufficient" | "limited" | "missing";
};

export const ANSWER_SCHEMA_NAME = "respuesta_trazaloop";

/** El esquema que se le entrega al proveedor. */
export const ANSWER_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description: "Dos o tres frases. Si no hay datos suficientes, dilo aquí.",
    },
    facts: {
      type: "array",
      description:
        "Hechos LEÍDOS del contexto. Cada uno con los números de las fuentes que "
        + "lo sostienen. Si no puedes sostenerlo con una fuente, no es un hecho: "
        + "va en `interpretation`.",
      items: {
        type: "object",
        properties: {
          statement: { type: "string" },
          references: { type: "array", items: { type: "integer" } },
        },
        required: ["statement", "references"],
      },
    },
    interpretation: {
      type: "array",
      description: "Lo que TÚ deduces. No son hechos y se muestran aparte.",
      items: { type: "string" },
    },
    suggestions: {
      type: "array",
      description:
        "Propuestas para que una persona decida. Nunca decisiones tomadas.",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          detail: { type: "string" },
          kind: { type: "string" },
        },
        required: ["title", "detail"],
      },
    },
    unanswered: {
      type: "array",
      description: "Lo que la pregunta pedía y el contexto no permite responder.",
      items: { type: "string" },
    },
    evidence: { type: "string", enum: ["sufficient", "limited", "missing"] },
  },
  required: ["summary", "facts", "interpretation", "suggestions", "unanswered", "evidence"],
};

export type ValidationResult =
  | { ok: true; answer: AiAnswer; droppedCitations: number }
  | { ok: false; error: string };

/**
 * §26 · Valida la forma, y §21 · limpia las citas inventadas.
 *
 * `maxReference` es cuántas referencias puso el servidor. Cualquier número
 * fuera de ese rango es una cita que el modelo se inventó.
 */
export function validateAnswer(value: unknown, maxReference: number): ValidationResult {
  if (typeof value !== "object" || value === null) {
    return { ok: false, error: "La respuesta no tiene la forma esperada." };
  }
  const v = value as Record<string, unknown>;

  const summary = typeof v.summary === "string" ? v.summary.trim() : "";
  if (summary.length === 0) {
    return { ok: false, error: "La respuesta llegó sin resumen." };
  }

  let dropped = 0;
  const facts: AiFact[] = [];
  for (const f of asArray(v.facts)) {
    if (typeof f !== "object" || f === null) continue;
    const fila = f as Record<string, unknown>;
    const statement = typeof fila.statement === "string" ? fila.statement.trim() : "";
    if (statement.length === 0) continue;
    const crudas = asArray(fila.references)
      .map((n) => Number(n))
      .filter((n) => Number.isInteger(n));
    const validas = crudas.filter((n) => n >= 1 && n <= maxReference);
    dropped += crudas.length - validas.length;
    facts.push({ statement, references: [...new Set(validas)] });
  }

  const interpretation = asArray(v.interpretation)
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter((s) => s.length > 0);

  const suggestions: AiSuggestion[] = [];
  for (const s of asArray(v.suggestions)) {
    if (typeof s !== "object" || s === null) continue;
    const fila = s as Record<string, unknown>;
    const title = typeof fila.title === "string" ? fila.title.trim() : "";
    if (title.length === 0) continue;
    suggestions.push({
      title,
      detail: typeof fila.detail === "string" ? fila.detail.trim() : "",
      kind: typeof fila.kind === "string" ? fila.kind.trim() : "analysis_note",
    });
  }

  const unanswered = asArray(v.unanswered)
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter((s) => s.length > 0);

  const evidence = v.evidence === "sufficient" || v.evidence === "limited"
    || v.evidence === "missing" ? v.evidence : "limited";

  return {
    ok: true,
    droppedCitations: dropped,
    answer: { summary, facts, interpretation, suggestions, unanswered, evidence },
  };
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/**
 * §66 · Cuánta evidencia había, SEGÚN EL SERVIDOR. No es una confianza que el
 * modelo se invente: es una cuenta de lo que el constructor de contexto
 * encontró, y manda sobre lo que el modelo diga de sí mismo.
 */
export function evidenceFromContext(
  referenceCount: number, factCount: number
): "sufficient" | "limited" | "missing" {
  if (referenceCount === 0) return "missing";
  if (referenceCount < 3 || factCount === 0) return "limited";
  return "sufficient";
}
