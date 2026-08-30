/**
 * Trazaloop · QUALITY-13B5 · Qué se le lleva a Intelligence, y desde dónde.
 *
 * NO HAY UN MOTOR NUEVO
 *
 * Sigue habiendo **uno**: Trazaloop Intelligence. Esto no es otro copiloto ni
 * otro proveedor: es la capa que decide QUÉ fuentes componen el contexto de una
 * pregunta integrada, y qué preguntas tiene sentido sugerir desde cada
 * pantalla.
 *
 * EL PROBLEMA QUE RESUELVE, MEDIDO EN QUALITY-12.1
 *
 * Veinte de los veintidós adaptadores están declarados como `"*"`: valen para
 * cualquier caso, así que **cualquier pregunta los carga todos**. Para preguntar
 * por UN proceso se leía el historial de proveedores de la empresa entera. Eso
 * es dinero, es latencia y —lo que peor sienta— es contexto que diluye la
 * respuesta.
 *
 * Aquí se declara, por pantalla de origen, qué fuentes hacen falta de verdad.
 * Sin selección declarada se comporta exactamente como hoy: la especialización
 * es una mejora, no una amputación.
 *
 * NO es `server-only`: lo usan el compositor, las pantallas y las pruebas.
 */

import { sameMoment, type TemporalScope } from "@/lib/domain/quality-integration";

// ===========================================================================
// 1 · DE DÓNDE SE PREGUNTA (§6, §7, §8, §22)
// ===========================================================================

/**
 * Los cinco orígenes integrados que QUALITY-13 congela. No se añaden botones en
 * cada pantalla (§29): estos cinco son los que responden preguntas que cruzan
 * dominios, y el resto sigue como estaba.
 */
export const INTEGRATED_CONTEXTS = [
  "quality_home", "quality_process", "quality_management_review",
  "quality_stakeholder_assessment", "quality_audit",
] as const;
export type IntegratedContext = (typeof INTEGRATED_CONTEXTS)[number];

export type ContextPlan = {
  context: IntegratedContext;
  label: string;
  /** Las fuentes que se cargan, y ninguna más. */
  sources: readonly string[];
  /** Por qué esas y no otras. Se lee en la documentación y en la prueba. */
  rationale: string;
};

/**
 * La selección, fuente por fuente.
 *
 * `attention` está en las cinco: es la respuesta convergida de B3 y es lo que
 * evita que cada pregunta integrada vuelva a contar señales, barridos y avisos
 * por su cuenta —que es justo la duplicación que B3 quitó (§9)—.
 */
export const CONTEXT_PLANS: Record<IntegratedContext, ContextPlan> = {
  quality_home: {
    context: "quality_home",
    label: "Portada de Quality",
    sources: [
      "attention", "indicator", "objective", "risk", "action", "case",
      "audit", "management_review", "interested_party", "process",
    ],
    rationale:
      "Lo que requiere atención en la empresa, con los dominios que producen la mayor "
      + "parte de esa atención. NO entran conocimiento, competencias, comentarios de "
      + "clientes ni reglas de automatización: no responden «qué debo mirar hoy» y "
      + "engordarían el contexto sin aportar.",
  },
  quality_process: {
    context: "quality_process",
    label: "Mirador de proceso",
    sources: ["attention", "process_context", "process", "risk", "action", "case", "indicator"],
    rationale:
      "El contexto del proceso se compone con las primitivas de B1/B2 —una sola vez, "
      + "no volviendo a unir las veinticinco tablas que guardan `process_id`— más la "
      + "atención acotada a ese proceso. Los demás dominios entran solo por lo que el "
      + "propio proceso arrastra.",
  },
  quality_management_review: {
    context: "quality_management_review",
    label: "Revisión por la dirección",
    sources: [
      "attention", "management_review", "objective", "indicator", "case", "action",
      "audit", "supplier", "customer_metric", "interested_party", "process",
    ],
    rationale:
      "Las entradas formales de la revisión son deterministas y ya existen; aquí se "
      + "componen los dominios que esas entradas resumen, para poder comparar y sugerir "
      + "temas. Intelligence NO redacta conclusiones ni aprueba nada.",
  },
  quality_stakeholder_assessment: {
    context: "quality_stakeholder_assessment",
    label: "Partes interesadas",
    sources: ["attention", "interested_party", "interested_party_strategy", "process"],
    rationale:
      "El dominio de contexto con sus estrategias, y los procesos porque la relación "
      + "requisito→proceso es una relación tipada y es la pregunta más frecuente. Nada "
      + "más: preguntar por partes interesadas no necesita el historial de auditorías.",
  },
  quality_audit: {
    context: "quality_audit",
    label: "Preparación de auditoría",
    sources: [
      "attention", "audit", "process", "process_context", "risk", "action", "case",
      "document_revision", "interested_party",
    ],
    rationale:
      "Lo que sirve para PREPARAR: qué está abierto, qué documentos rigen, qué riesgos "
      + "hay y qué exigen las partes interesadas. Intelligence puede sugerir preguntas; "
      + "no puede declarar hallazgos.",
  },
};

/**
 * Qué fuentes cargar para esta pregunta.
 *
 * `null` significa «las de siempre», que es el comportamiento que tenía el
 * producto antes de este tramo. Solo se especializa cuando se sabe desde dónde
 * se pregunta: adivinarlo por el texto de la pregunta sería el modelo eligiendo
 * qué mirar, y eso es exactamente lo que este diseño no hace.
 */
export function selectSources(pinnedType: string | null | undefined): readonly string[] | null {
  if (!pinnedType) return null;
  const plan = CONTEXT_PLANS[pinnedType as IntegratedContext];
  return plan ? plan.sources : null;
}

/**
 * Los contextos que son una PANTALLA y no una entidad.
 *
 * La portada no es un riesgo ni un proceso: no tiene identificador. Fijar el
 * contexto a ella es igual de legítimo —«pregunto desde la portada, con lo que
 * la portada está mirando»— y por eso el contexto fijado admite quedarse sin
 * identificador cuando el tipo es uno de estos.
 */
export const SCREEN_CONTEXTS: readonly string[] = ["quality_home"];

export function isScreenContext(type: string | null | undefined): boolean {
  return Boolean(type && SCREEN_CONTEXTS.includes(type));
}

export function contextPlan(pinnedType: string | null | undefined): ContextPlan | null {
  if (!pinnedType) return null;
  return CONTEXT_PLANS[pinnedType as IntegratedContext] ?? null;
}

// ===========================================================================
// 2 · LAS PREGUNTAS SUGERIDAS (§22)
// ===========================================================================

/**
 * Pocas, y en la lengua del producto. Una lista de treinta sugerencias no se
 * lee: se ignora.
 *
 * Son PREGUNTAS, no respuestas. La persona las edita antes de enviarlas, y el
 * modelo contesta con lo que hay registrado o dice que no hay nada.
 */
/**
 * OJO A LO QUE NO ESTÁ AQUÍ: `quality_stakeholder_assessment`.
 *
 * Ese contexto ya traía seis preguntas de QUALITY-12.3B3B, y tres de ellas son
 * exactamente las integradas que B5 querría añadir —requisitos sin estrategia,
 * requisitos sin proceso, qué cambió desde la última revisión—. Sustituirlas por
 * tres nuevas habría quitado producto para poner lo mismo con otras palabras.
 *
 * Lo que B5 le aporta a Contexto es su PLAN DE FUENTES, no otra lista de
 * preguntas.
 */
export const INTEGRATED_QUESTIONS: Partial<
  Record<IntegratedContext, { label: string; question: string }[]>
> = {
  quality_home: [
    { label: "Qué requiere atención",
      question: "¿Qué requiere atención esta semana y por qué?" },
    { label: "Procesos con más abierto",
      question: "¿Qué procesos concentran más asuntos abiertos?" },
    { label: "Indicadores y riesgos",
      question: "¿Qué indicadores fuera de objetivo están relacionados con riesgos o acciones abiertas?" },
    { label: "Qué revisar hoy",
      question: "¿Qué debería revisar hoy?" },
  ],
  quality_process: [
    { label: "Resumir el proceso",
      question: "Resume los asuntos relevantes de este proceso." },
    { label: "Riesgos y acciones",
      question: "¿Qué riesgos y acciones de este proceso requieren seguimiento?" },
    { label: "Requisitos que le afectan",
      question: "¿Qué requisitos de partes interesadas afectan a este proceso?" },
    { label: "Antes de una auditoría",
      question: "¿Qué debería revisar de este proceso antes de una auditoría?" },
  ],
  quality_management_review: [
    { label: "Cambios desde la última",
      question: "Resume los cambios relevantes desde la última revisión por la dirección." },
    { label: "Temas a discutir",
      question: "¿Qué temas merecen discutirse en esta revisión, y con qué evidencia?" },
    { label: "Entradas sin preparar",
      question: "¿Qué entradas de esta revisión siguen sin prepararse?" },
  ],
  quality_audit: [
    { label: "Preguntas para la auditoría",
      question: "Prepara preguntas para la próxima auditoría interna a partir de lo que hay registrado." },
    { label: "Qué revisar antes",
      question: "¿Qué debería revisar antes de esta auditoría?" },
    { label: "Procesos con más abierto",
      question: "¿Qué procesos tienen riesgos, acciones o revisiones pendientes?" },
  ],
};

export function questionsFor(pinnedType: string | null | undefined) {
  if (!pinnedType) return null;
  return INTEGRATED_QUESTIONS[pinnedType as IntegratedContext] ?? null;
}

/** Los contextos integrados que traen su propia lista de preguntas. El resto
 *  conserva la que ya tenía su dominio. */
export const CONTEXTS_WITH_OWN_QUESTIONS = Object.keys(INTEGRATED_QUESTIONS);

// ===========================================================================
// 3 · EL TIEMPO, COMPUESTO (§11, §12, §13)
// ===========================================================================

export type Fragment = {
  source: string;
  temporal: TemporalScope;
};

/**
 * Qué momentos hay mezclados en un contexto, y qué hay que decirle al modelo.
 *
 * LA REGLA: nunca se juntan callando. Si un fragmento habla del presente y otro
 * de una fecha pasada, el contexto lo dice —fuente por fuente— y el modelo tiene
 * que distinguirlos. Rellenar el hueco del pasado con el estado de hoy sería
 * inventar una historia que nadie registró.
 */
export function temporalConflicts(
  asked: TemporalScope, fragments: Fragment[]
): { source: string; label: string }[] {
  return fragments
    .filter((f) => !sameMoment(asked, f.temporal))
    .map((f) => ({
      source: f.source,
      label: f.temporal.mode === "current"
        ? "responde con su estado actual, no con el de la fecha preguntada"
        : f.temporal.mode === "period"
          ? "responde por periodos completos, no a una fecha concreta"
          : "responde a otra fecha",
    }));
}

/** ¿Se puede presentar todo esto como si describiera el mismo momento? */
export function isSimultaneous(asked: TemporalScope, fragments: Fragment[]): boolean {
  return temporalConflicts(asked, fragments).length === 0;
}

// ===========================================================================
// 4 · LO QUE INTELLIGENCE NO DECIDE (§20)
// ===========================================================================

/**
 * Las nueve decisiones formales que ninguna respuesta puede tomar.
 *
 * Están aquí como lista comprobable —y no solo como una frase en el prompt—
 * para que una prueba pueda exigir que el sistema las siga nombrando.
 */
export const FORMAL_DECISIONS_RESERVED_TO_PEOPLE: readonly string[] = [
  "declarar pertinente o no pertinente a una parte interesada",
  "clasificar un hallazgo como no conformidad",
  "cerrar una acción",
  "aprobar un documento",
  "aceptar un riesgo",
  "cambiar un objetivo",
  "aprobar un proveedor",
  "emitir la conclusión de una revisión por la dirección",
  "declarar conformidad con una norma",
];

/** La frase que acompaña a cualquier sugerencia integrada. */
export const SUGGESTION_ONLY_NOTE =
  "Esto es una sugerencia a partir de lo registrado. Ninguna de estas decisiones "
  + "la toma Trazaloop: las toma quien responde por el sistema de gestión.";
