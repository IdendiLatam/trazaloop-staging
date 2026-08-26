/**
 * Trazaloop · QUALITY-06.1 · Onboarding del sistema de gestión y contexto
 * operacional de la evaluación — la lógica PURA.
 *
 * LAS DOS COSAS QUE ESTE ARCHIVO EXISTE PARA IMPEDIR
 *
 * 1 · Que el onboarding AFIRME lo que la plataforma no puede demostrar. La
 *     plataforma no registra «documento leído», así que el onboarding no
 *     inventa una casilla de lectura confirmada. Un checklist con casillas
 *     falsas es peor que no tener checklist: se firma, se archiva y nadie
 *     vuelve a mirarlo.
 *
 * 2 · Que el contexto operacional se convierta en una nota. Un indicador de
 *     proceso en rojo es información sobre el PROCESO. Convertirlo en un
 *     número sobre la persona es el paso que PC-28 prohíbe, y es tan cómodo
 *     de dar que hay que cerrarlo por construcción.
 *
 * Nada aquí sabe de base de datos ni de sesión.
 */

// ---------------------------------------------------------------------------
// Onboarding · de dónde viene cada cosa
// ---------------------------------------------------------------------------

/**
 * Por qué un proceso o un documento aparece en el onboarding.
 *
 * Se guarda y se imprime porque la pregunta «¿y esto por qué me sale a mí?»
 * tiene que tener respuesta. Sin ella, la pantalla parece una lista arbitraria
 * y deja de usarse.
 */
export type OnboardingSource = "position" | "process" | "function";

export const ONBOARDING_SOURCE_LABEL: Record<OnboardingSource, string> = {
  position: "El cargo es su propietario",
  process: "Por un proceso del cargo",
  function: "Por una función del perfil",
};

/** En qué situación está la persona respecto de un conocimiento del cargo. */
export const KNOWLEDGE_ONBOARDING_STATES = [
  "holder", "transfer_in_progress", "to_receive",
] as const;
export type KnowledgeOnboardingState = (typeof KNOWLEDGE_ONBOARDING_STATES)[number];

export const KNOWLEDGE_ONBOARDING_LABEL: Record<KnowledgeOnboardingState, string> = {
  holder: "Ya lo sostiene",
  transfer_in_progress: "Transferencia en curso",
  to_receive: "Debería recibirlo",
};

/**
 * Estado de una línea del checklist.
 *
 * `done` solo cuando el sistema puede demostrarlo. `attention` cuando hay algo
 * que resolver. `informational` cuando la línea es información y NO una casilla
 * pendiente: es lo que se usa con los documentos, porque la plataforma no
 * registra confirmación de lectura y fingir que sí sería mentir en papel.
 */
export const CHECKLIST_STATES = ["done", "attention", "pending", "informational"] as const;
export type ChecklistState = (typeof CHECKLIST_STATES)[number];

export const CHECKLIST_MARK: Record<ChecklistState, string> = {
  done: "✓",
  attention: "!",
  pending: "○",
  informational: "·",
};

export type ChecklistLine = {
  state: ChecklistState;
  text: string;
  /** De qué entidad real sale la línea. Ninguna línea se inventa. */
  origin: string;
  detail?: string | null;
};

/**
 * El aviso que acompaña a los documentos.
 *
 * §11 del encargo lo pide explícitamente: si no existe un concepto formal de
 * «lectura confirmada», no se inventa un check de leído. Así que los documentos
 * se listan como información, no como pendientes, y la pantalla lo dice.
 */
export const NO_READ_TRACKING_NOTICE =
  "Trazaloop no registra confirmación de lectura de documentos, así que estos no se "
  + "cuentan como pendientes: se listan para que se sepa cuáles son.";

/**
 * Cuántos pendientes hay, y de qué.
 *
 * §13 · No se reduce el onboarding a COMPLETO/INCOMPLETO, porque no existe una
 * regla formal de completitud. Se dice cuántas cosas concretas quedan y de qué
 * tipo, que es lo que alguien puede accionar.
 */
export type OnboardingPending = {
  competencyGaps: number;
  developmentOpen: number;
  knowledgeToReceive: number;
  openTasks: number;
  total: number;
};

export function countPending(input: {
  competencyGaps: number;
  developmentOpen: number;
  knowledgeToReceive: number;
  openTasks: number;
}): OnboardingPending {
  const total =
    input.competencyGaps + input.developmentOpen + input.knowledgeToReceive + input.openTasks;
  return { ...input, total };
}

/** El texto que se muestra en vez de un estado agregado inventado. */
export function describePending(p: OnboardingPending): string {
  if (p.total === 0) return "Sin pendientes del sistema de gestión.";
  const partes: string[] = [];
  if (p.competencyGaps > 0) {
    partes.push(`${p.competencyGaps} brecha(s) de competencia`);
  }
  if (p.developmentOpen > 0) partes.push(`${p.developmentOpen} acción(es) de desarrollo`);
  if (p.knowledgeToReceive > 0) partes.push(`${p.knowledgeToReceive} conocimiento(s) por recibir`);
  if (p.openTasks > 0) partes.push(`${p.openTasks} tarea(s) abierta(s)`);
  return `Pendientes del sistema de gestión: ${p.total} — ${partes.join(", ")}.`;
}

// ---------------------------------------------------------------------------
// Contexto operacional de la evaluación (GAP-2)
// ---------------------------------------------------------------------------

/**
 * El aviso, escrito una sola vez y usado en pantalla y en papel.
 *
 * No es una nota legal: es la frase que impide que alguien lea el panel como
 * un veredicto. Aparece SIEMPRE que aparece el panel.
 */
export const CONTEXT_DISCLAIMER =
  "Esta información ofrece contexto del sistema de gestión. No determina "
  + "automáticamente el resultado de la evaluación.";

/**
 * Y esta es la frase que explica POR QUÉ el panel habla de procesos y no de
 * personas. Sin ella, un lector deduce la atribución igualmente.
 */
export const CONTEXT_ATTRIBUTION_NOTICE =
  "Los indicadores y objetivos miden PROCESOS, no personas. Se muestran porque el "
  + "cargo evaluado participa en ellos, no como medida de quien lo ocupa.";

export const CONTEXT_KINDS = [
  "indicator", "objective", "action", "case", "risk", "learning", "competence",
] as const;
export type ContextKind = (typeof CONTEXT_KINDS)[number];

export const CONTEXT_KIND_LABEL: Record<ContextKind, string> = {
  indicator: "Indicadores de los procesos del cargo",
  objective: "Objetivos relacionados",
  action: "Acciones a cargo del puesto",
  case: "Casos del puesto",
  risk: "Riesgos a cargo del puesto",
  learning: "Desarrollo realizado en el periodo",
  competence: "Competencia declarada en el periodo",
};

/**
 * Qué puede afirmar cada línea sobre el tiempo.
 *
 * `period`  · el dato pertenece al periodo evaluado y se puede afirmar de él.
 * `current` · la fuente no conserva versión por periodo; lo que se muestra es
 *             el estado de hoy, y la línea LO DICE.
 *
 * La alternativa —enseñar el valor de hoy dentro de un informe fechado— es
 * fabricar pasado, que es exactamente lo que §21 prohíbe.
 */
export type ContextTemporality = "period" | "current";

export const CONTEXT_TEMPORALITY_LABEL: Record<ContextTemporality, string> = {
  period: "Del periodo evaluado",
  current: "Estado actual",
};

/**
 * El tono de una línea de contexto.
 *
 * `good` y `bad` existen para que el panel NO esté sesgado hacia los
 * incumplimientos (§22): si solo se enseña lo que salió mal, el panel deja de
 * ser contexto y pasa a ser un expediente.
 */
export type ContextTone = "good" | "bad" | "neutral";

export type ContextLine = {
  kind: ContextKind;
  /** De qué objeto habla la línea. SIEMPRE un proceso, un cargo o un objeto
   *  del SGC; nunca una persona. */
  subject: string;
  label: string;
  value: string;
  temporality: ContextTemporality;
  tone: ContextTone;
  detail?: string | null;
};

/**
 * La comprobación que da nombre a este archivo.
 *
 * Devuelve `true` si un conjunto de líneas de contexto contiene algo que
 * PAREZCA una puntuación de la persona. Se usa en pruebas, y está aquí —y no
 * en el archivo de pruebas— para que la definición de «puntuación» viva junto
 * al modelo y no se pueda ablandar sin que se note.
 */
export function looksLikePersonScore(lines: readonly ContextLine[]): boolean {
  const sospechoso = /\b(puntaje|puntuaci[óo]n|score|calificaci[óo]n global|nota final|ranking)\b/i;
  return lines.some((l) => sospechoso.test(l.label) || sospechoso.test(l.value));
}

/**
 * Un resumen del contexto que NO es un puntaje.
 *
 * Cuenta cuántas líneas hay de cada tono. Es deliberadamente un recuento de
 * HECHOS mostrados —«3 metas cumplidas, 1 no cumplida»— y no una media, un
 * porcentaje ni un total ponderado: en cuanto se combinan en un solo número,
 * ese número se lee como la nota de la persona.
 */
export function summarizeContext(lines: readonly ContextLine[]): {
  good: number; bad: number; neutral: number; total: number;
} {
  return {
    good: lines.filter((l) => l.tone === "good").length,
    bad: lines.filter((l) => l.tone === "bad").length,
    neutral: lines.filter((l) => l.tone === "neutral").length,
    total: lines.length,
  };
}

/** ¿Un periodo de medición cae DENTRO del periodo evaluado? */
export function periodIsInside(
  measurement: { start: string; end: string },
  cycle: { start: string; end: string }
): boolean {
  return measurement.start >= cycle.start && measurement.end <= cycle.end;
}
