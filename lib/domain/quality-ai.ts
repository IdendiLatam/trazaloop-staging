/**
 * Trazaloop · QUALITY-12 · El dominio puro del Copilot.
 *
 * Aquí viven las seis separaciones que sostienen el sprint, escritas para que
 * la pantalla las diga con las mismas palabras y para que las pruebas puedan
 * comprobar que siguen existiendo. Nada de esto toca base de datos ni red.
 */

// ---------------------------------------------------------------------------
// Las seis separaciones (§8, §43, §44)
// ---------------------------------------------------------------------------

export const AI_IS_NOT_A_FACT =
  "Lo que el Copilot dice es una LECTURA de datos, no un hecho nuevo. El hecho "
  + "sigue siendo lo que está registrado en su dominio, con su autor y su fecha.";

export const AI_IS_NOT_A_DECISION =
  "Una sugerencia no es una decisión. Declarar una no conformidad, aprobar un "
  + "proveedor, aceptar un riesgo o cerrar una revisión siguen siendo actos de "
  + "una persona, con su nombre encima.";

export const AI_DRAFT_IS_NOT_A_RECORD =
  "Un borrador no es un registro aprobado. Puede editarse, descartarse o "
  + "ignorarse, y mientras nadie lo use no ha pasado nada.";

export const AI_INFERENCE_IS_NOT_EVIDENCE =
  "Una inferencia no es evidencia. La evidencia es el documento, la medición o "
  + "el registro que ya existía; lo que el Copilot deduce de ellos va aparte y "
  + "se muestra aparte.";

export const AI_SUMMARY_IS_NOT_THE_SOURCE =
  "Un resumen no sustituye a la fuente. Por eso cada afirmación trae de dónde "
  + "sale y se puede abrir: leer el resumen y creerlo sin mirar es exactamente "
  + "el uso que este diseño intenta evitar.";

export const AI_IS_NOT_AUTOMATION =
  "La automatización de QUALITY-11 es determinística: la misma condición da "
  + "siempre el mismo resultado y se puede explicar campo a campo. El Copilot "
  + "interpreta y redacta. Ni el uno hace lo del otro, ni comparten motor.";

// ---------------------------------------------------------------------------
// Lo que el Copilot NO puede hacer (§34…§41, §96…§100)
// ---------------------------------------------------------------------------

/** Las decisiones formales que el Copilot no toma. La lista es la misma que la
 *  de QUALITY-11 más las que solo tienen sentido con IA delante. */
export const FORBIDDEN_AI_ACTIONS = [
  "declarar una no conformidad",
  "aprobar, rechazar o suspender a un proveedor",
  "declarar competente o incompetente a una persona",
  "evaluar el desempeño de una persona o clasificarla",
  "recomendar despedir, sancionar o ascender a alguien",
  "aceptar un riesgo residual o fijar su valoración formal",
  "cerrar una acción o declararla eficaz",
  "aprobar un documento o publicar una revisión",
  "concluir una auditoría o afirmar conformidad con una norma",
  "cerrar la revisión por la dirección o emitir sus conclusiones",
  "identificar a quien respondió una encuesta anónima",
] as const;

export function aiCanDecide(): false { return false; }
export function aiCanWriteBusinessData(): false { return false; }

// ---------------------------------------------------------------------------
// Estados y etiquetas
// ---------------------------------------------------------------------------

export const SUGGESTION_STATUSES = [
  "generated", "reviewed", "accepted", "rejected", "expired",
] as const;
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];

export const SUGGESTION_STATUS_LABEL: Record<SuggestionStatus, string> = {
  generated: "Propuesto",
  reviewed: "Revisado",
  accepted: "Aceptado por una persona",
  rejected: "Descartado",
  expired: "Caducado",
};

export const SUGGESTION_KINDS = [
  "action_draft", "risk_candidate", "root_cause_hypothesis", "audit_focus",
  "review_summary", "customer_theme", "document_improvement", "question_list",
  "analysis_note",
] as const;
export type SuggestionKind = (typeof SUGGESTION_KINDS)[number];

export const SUGGESTION_KIND_LABEL: Record<SuggestionKind, string> = {
  action_draft: "Borrador de acción",
  risk_candidate: "Riesgo candidato",
  root_cause_hypothesis: "Hipótesis de causa",
  audit_focus: "Foco de auditoría",
  review_summary: "Resumen para la dirección",
  customer_theme: "Tema de clientes",
  document_improvement: "Mejora de documento",
  question_list: "Preguntas propuestas",
  analysis_note: "Nota de análisis",
};

export const RUN_STATUSES = [
  "running", "succeeded", "failed", "refused", "rate_limited",
] as const;
export type AiRunStatus = (typeof RUN_STATUSES)[number];

export const RUN_STATUS_LABEL: Record<AiRunStatus, string> = {
  running: "En curso",
  succeeded: "Respondida",
  failed: "Falló",
  refused: "Rechazada",
  rate_limited: "Bloqueada por el tope",
};

export const EVIDENCE_LABEL: Record<string, string> = {
  sufficient: "Evidencia suficiente",
  limited: "Evidencia escasa",
  missing: "Sin evidencia",
};

/** §66 · Lo que significa cada nivel, para que nadie lo lea como un porcentaje. */
export const EVIDENCE_MEANING: Record<string, string> = {
  sufficient: "Se encontraron varias fuentes autorizadas que sostienen lo que se afirma.",
  limited: "Se encontró poca información autorizada: conviene contrastar antes de decidir.",
  missing: "No se encontró información autorizada relacionada con la pregunta.",
};

export const USE_CASES = [
  "ask", "explain_signal", "root_cause", "risk_candidates", "review_summary",
  "audit_prep", "customer_themes",
] as const;
export type AiUseCase = (typeof USE_CASES)[number];

export const USE_CASE_LABEL: Record<AiUseCase, string> = {
  ask: "Pregunta abierta",
  explain_signal: "Explicar una señal",
  root_cause: "Hipótesis de causa",
  risk_candidates: "Riesgos candidatos",
  review_summary: "Resumen para la dirección",
  audit_prep: "Preparar una auditoría",
  customer_themes: "Temas de clientes",
};

// ---------------------------------------------------------------------------
// Textos de la interfaz (§116, §65, §83)
// ---------------------------------------------------------------------------

/** §116 · Sobrio, una vez, y no en cada frase. */
export const AI_DISCLAIMER =
  "Generado con IA a partir de información autorizada de Trazaloop. Revisa las "
  + "fuentes antes de tomar decisiones.";

/** §83 · Las palabras precisas. Pasar contexto no es aprender. */
export const NO_LEARNING_CLAIM =
  "El Copilot no aprende de tu empresa. En cada consulta se le entrega la "
  + "información autorizada que hace falta para responderla, y nada de eso "
  + "entrena ningún modelo.";

/** §84 · Qué sale del servidor, dicho sin adornos. */
export const DATA_HANDLING_NOTE =
  "Al preguntar, salen del servidor hacia el proveedor del modelo: la pregunta, "
  + "las fuentes autorizadas que Trazaloop seleccionó y los textos registrados "
  + "que hagan falta. No salen identidades de encuestas anónimas, ni datos de "
  + "otras empresas, ni nada que tu rol no pueda ver.";

export const HUMAN_IN_THE_LOOP =
  "Nada de lo que el Copilot propone se convierte en un registro por sí solo. "
  + "Si algo te sirve, lo usas tú con el comando de siempre, y el autor del "
  + "registro eres tú.";

// ---------------------------------------------------------------------------
// Preguntas de arranque (§113, §161)
// ---------------------------------------------------------------------------

export const STARTER_QUESTIONS: { label: string; question: string }[] = [
  { label: "¿Qué requiere atención?",
    question: "¿Qué requiere atención esta semana?" },
  { label: "Cambios del trimestre",
    question: "Resume los principales cambios del último trimestre." },
  { label: "Acciones vencidas",
    question: "¿Qué acciones están vencidas y de qué van?" },
  { label: "Antes de la auditoría",
    question: "¿Qué debería revisar antes de la próxima auditoría?" },
  { label: "Temas de clientes",
    question: "Resume los principales temas que están planteando los clientes." },
];

export function starterFor(pinnedType: string | null): { label: string; question: string }[] {
  switch (pinnedType) {
    case "quality_process": return [
      { label: "Resumir desempeño", question: "Resume el desempeño de este proceso." },
      { label: "Riesgos a validar", question: "¿Qué riesgos podría estar omitiendo en este proceso?" },
      { label: "Antes de revisarlo", question: "¿Qué debería revisar de este proceso?" },
    ];
    case "quality_indicator": return [
      { label: "Explicar la tendencia", question: "Explica la tendencia de este indicador." },
      { label: "Resumir periodos", question: "Resume los últimos periodos de este indicador." },
    ];
    case "quality_supplier_scope": return [
      { label: "Resumir desempeño", question: "Resume el desempeño de este proveedor." },
      { label: "Preparar reevaluación", question: "¿Qué debería preguntar en la reevaluación de este proveedor?" },
    ];
    case "quality_signal": return [
      { label: "Explicar la señal", question: "Explícame esta señal y por qué importa." },
    ];
    case "work_case": return [
      { label: "Posibles causas", question: "¿Qué hipótesis de causa deberíamos validar en este caso?" },
    ];
    case "quality_audit": return [
      { label: "Preparar la auditoría", question: "¿Qué debería revisar en esta auditoría?" },
    ];
    case "quality_management_review": return [
      { label: "Resumen ejecutivo", question: "Prepara un borrador de resumen ejecutivo de esta revisión." },
    ];
    default: return STARTER_QUESTIONS;
  }
}

/** §91 · La respuesta se pinta como texto, nunca como HTML. Esto es el cinturón
 *  además del tirante: aunque el modelo devolviera etiquetas, no llegan vivas. */
export function plainText(s: string): string {
  return s.replace(/[<>]/g, (c) => (c === "<" ? "‹" : "›"));
}
