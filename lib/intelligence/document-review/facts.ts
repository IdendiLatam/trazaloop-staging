import "server-only";

import type { RelatedContextType } from "@/lib/domain/document-review";

/**
 * Trazaloop · QUALITY-12.2D · Dónde se apuntan los hechos y sus fuentes.
 *
 * Es el `ContextWriter` de QUALITY-12 reducido a lo que aquí hace falta: una
 * lista de frases, una lista de fuentes numeradas, y el número de consultas
 * que costó todo. Nada de notas largas, ni de bloques por dominio, ni de
 * niveles de evidencia.
 *
 * LOS TOPES VIVEN AQUÍ, NO EN CADA ADAPTADOR
 *
 * Un adaptador que se olvide de limitar no puede desbordar el material: el
 * escritor deja de aceptar hechos de un tipo cuando ese tipo llega a su tope,
 * y lo apunta. Así el recorte SE VE —§22— en vez de pasar por «no había más».
 */

export type ReviewFact = {
  type: RelatedContextType;
  /** La frase, en castellano, tal y como viajará. */
  statement: string;
  /** Las fuentes que la respaldan, por su ordinal en `refs`. */
  sources: number[];
};

export type ReviewRef = {
  ordinal: number;
  sourceCode: string;
  entityType: string;
  entityId: string;
  label: string;
  deepLink: string | null;
  /** La fecha a la que se leyó, cuando el dominio sabe reconstruir el pasado. */
  asOf: string | null;
  revisionLabel: string | null;
};

/** Cuántos hechos como mucho por tipo. Elegidos por lo que cabe en una
 *  pantalla y en un presupuesto, no por lo que cabe en una tabla. */
export const CONTEXT_CAPS: Record<RelatedContextType, number> = {
  organization_profile: 1,
  process: 3,
  position: 6,
  document: 5,
  risk: 6,
  control: 6,
  indicator: 6,
  objective: 6,
  supplier: 6,
  customer_feedback: 4,
  evidence: 6,
  case: 6,
};

/**
 * Y un tope global.
 *
 * Dieciséis, no veinticuatro. Empezó en veinticuatro por simetría con los
 * topes por tipo y la primera medición del presupuesto lo dejó claro: veinte y
 * pico hechos sobre UNA sección cuestan ochocientos tokens y nadie los va a
 * leer. La pantalla enseña como mucho seis hallazgos; alimentarla con
 * veinticuatro hechos es pagar por material que no cabe en la respuesta.
 */
export const MAX_TOTAL_FACTS = 16;

export class FactWriter {
  readonly facts: ReviewFact[] = [];
  readonly refs: ReviewRef[] = [];
  /** Tipos que se recortaron, para decirlo en el material y en la pantalla. */
  readonly truncated = new Set<RelatedContextType>();
  /** Consultas a la base. Se cuentan aquí para que nadie las esconda. */
  queries = 0;

  private readonly porTipo = new Map<RelatedContextType, number>();
  private readonly porEntidad = new Map<string, number>();

  countQuery(n = 1) { this.queries += n; }

  /** Registra una fuente y devuelve su número de cita. La misma entidad
   *  citada dos veces conserva su número: dos entradas para lo mismo harían
   *  que la pantalla enseñara la fuente duplicada. */
  ref(r: Omit<ReviewRef, "ordinal">): number {
    const clave = `${r.sourceCode}:${r.entityId}`;
    const ya = this.porEntidad.get(clave);
    if (ya !== undefined) return ya;
    const ordinal = this.refs.length + 1;
    this.refs.push({ ...r, ordinal });
    this.porEntidad.set(clave, ordinal);
    return ordinal;
  }

  /**
   * Apunta un hecho y devuelve SU NÚMERO DE CITA, o `null` si no cupo.
   *
   * El número que se devuelve es la posición del hecho en la lista, no el de
   * la fuente, y esa distinción costó un rato entenderla bien. Son dos
   * numeraciones distintas: la de FUENTES existe para que la pantalla sepa a
   * qué registro llevar, y la de HECHOS es la única que ve el modelo. El
   * modelo cita hechos porque es lo que le llega numerado; si citara fuentes
   * estaría citando algo que no tiene delante.
   */
  fact(type: RelatedContextType, statement: string, sources: number[]): number | null {
    const usados = this.porTipo.get(type) ?? 0;
    if (usados >= CONTEXT_CAPS[type] || this.facts.length >= MAX_TOTAL_FACTS) {
      this.truncated.add(type);
      return null;
    }
    this.porTipo.set(type, usados + 1);
    this.facts.push({ type, statement, sources });
    return this.facts.length;
  }

  /** Las fuentes que respaldan una lista de hechos citados por su número. */
  sourcesFor(factNumbers: number[]): ReviewRef[] {
    const ordinales = new Set<number>();
    for (const n of factNumbers) {
      const f = this.facts[n - 1];
      if (f) for (const o of f.sources) ordinales.add(o);
    }
    return this.refs.filter((r) => ordinales.has(r.ordinal));
  }

  countOf(type: RelatedContextType): number {
    return this.porTipo.get(type) ?? 0;
  }

  /** Los tipos que de verdad aportaron algo. No los que se pidieron. */
  resolvedTypes(): RelatedContextType[] {
    return [...this.porTipo.entries()].filter(([, n]) => n > 0).map(([t]) => t);
  }

  isEmpty(): boolean { return this.facts.length === 0; }
}
