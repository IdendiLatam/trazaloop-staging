/**
 * Trazaloop · QUALITY-12 · §9 · El Paquete de Contexto.
 *
 * QUÉ ES
 *
 * Todo lo que el modelo verá, y nada más que eso. Lo construye el SERVIDOR con
 * la sesión de quien pregunta, así que lo que no puede ver esa persona no entra
 * aquí —ni siquiera resumido (§14, §15)—.
 *
 * LAS TRES PARTES, Y POR QUÉ ESTÁN SEPARADAS
 *
 *   · `refs`  — las FUENTES, numeradas. El modelo cita por número; no puede
 *     inventarse una porque no puede inventarse una fila de esta lista (§18).
 *   · `facts` — los HECHOS YA CALCULADOS. Aquí van los números: cuántas no
 *     conformidades, cuántos periodos fuera de meta, cuánto varió. El modelo
 *     NO cuenta filas (§58): las cuenta el código, que sabe contar.
 *   · `notes` — el TEXTO de la empresa. Comentarios, hallazgos, descripciones.
 *     Es material para leer, y va marcado como tal (§23).
 */

export type ContextRef = {
  ordinal: number;
  sourceCode: string;
  entityType: string;
  entityId: string | null;
  label: string;
  deepLink: string | null;
  asOf?: string | null;
  revisionLabel?: string | null;
};

/** Un hecho calculado por el servidor, con las fuentes que lo sostienen. */
export type ContextFact = { statement: string; refs: number[] };

/** Texto escrito por personas de la empresa. Dato, nunca instrucción. */
export type ContextNote = { title: string; body: string; refs: number[] };

export type TemporalScope = {
  mode: "current" | "period" | "as_of";
  asOf?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
};

export type ContextPack = {
  refs: ContextRef[];
  facts: ContextFact[];
  notes: ContextNote[];
  /** Qué fuentes se consultaron de verdad, para poder decirlo (§25 del cierre). */
  sourcesUsed: string[];
  /** §22 · Fuentes que la pregunta pedía y NO saben reconstruir el pasado. */
  temporalLimitations: string[];
  /** §68 · Contradicciones entre fuentes autorizadas: se muestran, no se eligen. */
  conflicts: string[];
  temporal: TemporalScope;
  /** §73 · Si hubo que recortar por presupuesto, se dice. */
  truncated: boolean;
  charCount: number;
};

export function emptyPack(temporal: TemporalScope): ContextPack {
  return {
    refs: [], facts: [], notes: [], sourcesUsed: [], temporalLimitations: [],
    conflicts: [], temporal, truncated: false, charCount: 0,
  };
}
