import {
  MODEL_FINDING_TYPES, REVIEW_FINDING_TYPES, REVIEW_SEVERITIES,
  type ReviewFindingType, type ReviewSeverity,
} from "@/lib/domain/document-review";

/**
 * Trazaloop · QUALITY-12.2D · La forma de una revisión.
 *
 * NO ES EL ESQUEMA DEL COPILOT, Y NO PODÍA SERLO
 *
 * El del Copilot ocupa ≈742 tokens y describe una respuesta a una pregunta
 * abierta: hechos con citas, interpretación, sugerencias, nivel de evidencia,
 * fuentes. Aquí la pregunta no es abierta. Es siempre la misma —¿esto coincide
 * con lo registrado?— y la respuesta es una lista de puntos concretos donde
 * coincide o no.
 *
 * DOS CAMPOS AL LADO DEL OTRO, Y ESA ES TODA LA IDEA
 *
 *     user_text_excerpt   lo que la persona escribió
 *     system_fact         lo que Trazaloop tiene registrado
 *
 * Puestos así, quien lee decide en dos segundos y sin creerle nada a nadie.
 * Un párrafo de prosa explicando la discrepancia se lee peor y se audita peor.
 *
 * LO QUE NO ESTÁ, Y POR QUÉ
 *
 * No hay `missing_information[]` ni `ambiguities[]` en la raíz, aunque el
 * encargo los permitía: ya son dos de los siete tipos de hallazgo. Tenerlos
 * en los dos sitios obligaría a decidir en cuál poner cada cosa, y la pantalla
 * tendría que pintar la misma idea de dos maneras.
 *
 * Y no hay ningún campo de conformidad. Ni «cumple», ni «conforme», ni
 * «satisface el requisito». Eso no lo dice esta pantalla ni ninguna otra que
 * escriba un modelo.
 */

export type ReviewFinding = {
  type: ReviewFindingType;
  severity: ReviewSeverity;
  userTextExcerpt: string;
  systemFact: string;
  explanation: string;
  sourceRefs: number[];
  suggestedNextStep: string;
  /** Una frase alternativa, si el hallazgo la tiene. Vacía casi siempre: la
   *  revisión no está para reescribir —para eso está 12.2C— y cuando propone
   *  algo, aplicarlo solo cambia el editor. */
  suggestedWording: string;
};

export type DocumentReview = {
  summary: string;
  findings: ReviewFinding[];
};

export const REVIEW_SCHEMA_NAME = "revision_contextual";

export const REVIEW_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description: "Dos frases: qué se revisó y qué salió.",
    },
    findings: {
      type: "array",
      description: "Máximo seis.",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: [...MODEL_FINDING_TYPES] },
          severity: { type: "string", enum: [...REVIEW_SEVERITIES] },
          excerpt: {
            type: "string",
            description: "Las palabras EXACTAS del TEXTO.",
          },
          fact: {
            type: "string",
            description: "El HECHO registrado, copiado. Vacío si no hay.",
          },
          explanation: {
            type: "string",
            description: "Una o dos frases: por qué mirarlo.",
          },
          refs: {
            type: "array",
            description: "Números de HECHOS.",
            items: { type: "integer" },
          },
          next_step: {
            type: "string",
            description: "Qué puede hacer la persona.",
          },
          wording: {
            type: "string",
            description: "Redacción alternativa, o cadena vacía.",
          },
        },
        required: ["type", "severity", "excerpt", "fact",
          "explanation", "refs", "next_step", "wording"],
      },
    },
  },
  required: ["summary", "findings"],
};

export const REVIEW_LIMITS = {
  findings: 6,
  summary: 320,
  excerpt: 220,
  systemFact: 240,
  explanation: 320,
  nextStep: 180,
  wording: 600,
} as const;

export type ReviewValidation =
  | { ok: true; review: DocumentReview; trimmed: boolean; rejected: number }
  | { ok: false; error: string };

const recorta = (v: unknown, max: number): string => {
  const s = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
};

/**
 * Valida la revisión.
 *
 * Tres cosas se comprueban aquí y ninguna es una formalidad:
 *
 *   · QUE NO SE DECLARE CONFIRMADO. `confirmed_conflict` no está entre los
 *     valores que el modelo puede escribir, pero un esquema aceptado no es una
 *     promesa cumplida —lo mismo que en QUALITY-12— y esto lo comprueba otra
 *     vez del lado de acá. Si aparece, el hallazgo se degrada a `possible`.
 *
 *   · QUE CADA HALLAZGO CITE. Uno que hable de un hecho registrado sin decir
 *     cuál es exactamente lo que no puede pasar: sería el modelo afirmando
 *     algo sobre la empresa por su cuenta. Se descarta.
 *
 *   · QUE NINGUNA CITA APUNTE A UN HECHO QUE NO SE ENVIÓ. Un número inventado
 *     pinta una fuente que no existe.
 */
export function validateReview(
  value: unknown, factCount: number
): ReviewValidation {
  if (typeof value !== "object" || value === null) {
    return { ok: false, error: "La revisión no tiene la forma esperada." };
  }
  const v = value as Record<string, unknown>;
  const summary = recorta(v.summary, REVIEW_LIMITS.summary);
  if (summary.length === 0) {
    return { ok: false, error: "La revisión llegó sin resumen." };
  }

  const crudos = Array.isArray(v.findings) ? v.findings : [];
  const findings: ReviewFinding[] = [];
  let rejected = 0;

  for (const c of crudos) {
    if (typeof c !== "object" || c === null) { rejected += 1; continue; }
    const f = c as Record<string, unknown>;

    let type = String(f.type ?? "");
    if (!(REVIEW_FINDING_TYPES as readonly string[]).includes(type)) {
      rejected += 1; continue;
    }
    // Confirmar es cosa del código. Si el modelo lo escribe, baja de rango.
    if (type === "confirmed_conflict") type = "possible_conflict";

    const severity = String(f.severity ?? "");
    if (!(REVIEW_SEVERITIES as readonly string[]).includes(severity)) {
      rejected += 1; continue;
    }

    const refs = (Array.isArray(f.refs) ? f.refs : [])
      .map((n) => Number(n))
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= factCount);

    // Tres tipos pueden no citar hechos, y cada uno por su motivo.
    //
    //   `guidance_gap` y `missing_information` hablan de la GUÍA, y la guía no
    //   es un hecho: pedirles una cita sería pedirles que citaran un registro
    //   que precisamente no existe.
    //
    //   `ambiguous_reference` es el caso que costó ver. Una ambigüedad dice
    //   «esto encaja con varios y no elijo». Si pudiera citar UN hecho es que
    //   no era ambigua, y los candidatos no viajan como hechos justamente
    //   porque ninguno está en el alcance. La primera versión de esta función
    //   los descartaba a todos, y el efecto era el peor posible: la única
    //   pantalla que existe para no elegir en silencio se quedaba callada.
    //
    // Cualquier otro tipo tiene que citar, o no se pinta: sería el modelo
    // afirmando algo sobre la empresa por su cuenta.
    const puedeNoCitar = type === "guidance_gap" || type === "missing_information"
      || type === "ambiguous_reference";
    if (refs.length === 0 && !puedeNoCitar) { rejected += 1; continue; }

    const excerpt = recorta(f.excerpt, REVIEW_LIMITS.excerpt);
    const explanation = recorta(f.explanation, REVIEW_LIMITS.explanation);
    if (explanation.length === 0) { rejected += 1; continue; }

    findings.push({
      type: type as ReviewFindingType,
      severity: severity as ReviewSeverity,
      userTextExcerpt: excerpt,
      systemFact: recorta(f.fact, REVIEW_LIMITS.systemFact),
      explanation,
      sourceRefs: [...new Set(refs)],
      suggestedNextStep: recorta(f.next_step, REVIEW_LIMITS.nextStep),
      suggestedWording: recorta(f.wording, REVIEW_LIMITS.wording),
    });
  }

  const trimmed = findings.length > REVIEW_LIMITS.findings;
  return {
    ok: true, rejected, trimmed,
    review: { summary, findings: findings.slice(0, REVIEW_LIMITS.findings) },
  };
}
