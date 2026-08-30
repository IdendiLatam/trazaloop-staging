/**
 * Trazaloop · QUALITY-13B3 · Lo que se puede afirmar sobre la atención.
 *
 * Funciones puras sobre `AttentionItem[]`. Aquí no se consulta nada: se decide
 * qué converge, qué no, y qué se puede resumir sin mentir.
 *
 * LAS DOS COSAS QUE ESTE ARCHIVO IMPIDE
 *
 *   · **Contar dos veces.** El mismo problema visto por el barrido heredado y
 *     por la regla que lo releva es UN problema. La identidad la fija B1 y aquí
 *     se aplica sin excepciones.
 *   · **Inventar una escala.** No hay `attention_score`, ni prioridad global,
 *     ni media de gravedades. Si dos dominios gradúan distinto, se enseñan sus
 *     dos graduaciones; no se promedian.
 */

import { dedupeAttention, type AttentionItem } from "@/lib/domain/quality-integration";
import {
  DUE_SOON_OBSERVERS, OVERDUE_OBSERVERS, TIMING_UNDECIDABLE, observerByCode,
} from "@/lib/domain/quality-observers";

// ===========================================================================
// 1 · EL ESTADO DE UN PUNTO DE ATENCIÓN (§9)
// ===========================================================================

/**
 * Vocabulario, y de dónde sale cada valor:
 *
 *   active       la condición sigue cumpliéndose.
 *   resolved     dejó de cumplirse, o alguien la cerró en su dominio.
 *   suppressed   otro observador la releva · NO se enseña dos veces.
 *   not_visible  el rol no llega a ese dominio. NO es «no hay».
 *   unavailable  no se pudo leer. Tampoco es «no hay».
 *
 * **Nada de esto se guarda.** Se deriva de la verdad del dominio y del ciclo de
 * vida del observador, que es lo que §9 pide: sin una sexta tabla mutable.
 */
export const ATTENTION_STATES = [
  "active", "resolved", "suppressed", "not_visible", "unavailable",
] as const;
export type AttentionState = (typeof ATTENTION_STATES)[number];

/**
 * Reconocer NO es resolver.
 *
 * La base ya lo sabe desde 0129 —`quality_signal_acknowledge` no toca
 * `resolved_at`— y esto lo respeta: una señal reconocida SIGUE activa. Quien
 * marcó «lo vi» no cambió el estado del negocio, y esconderla por eso sería
 * dejar que un clic reescriba la verdad.
 */
export function stateOfSignal(input: {
  status: string; resolvedAt: string | null;
}): AttentionState {
  if (input.resolvedAt !== null) return "resolved";
  if (input.status === "suppressed") return "suppressed";
  return "active";
}

/** ¿Este estado se enseña como atención pendiente? */
export function isActive(state: AttentionState): boolean {
  return state === "active";
}

// ===========================================================================
// 2 · LA CONVERGENCIA (§6)
// ===========================================================================

export type ConvergedResult = {
  items: AttentionItem[];
  /** Por clave, qué otros observadores vieron lo mismo. Es la procedencia que
   *  §17 exige conservar aunque la pantalla enseñe una sola línea. */
  alsoSeenBy: Map<string, string[]>;
};

/**
 * Un problema, una línea.
 *
 * El orden de entrada decide quién queda como observador visible, así que el
 * cargador entrega primero la verdad del dominio, después la regla y por último
 * el barrido heredado: si los tres ven lo mismo, se enseña el que más cerca
 * está de la verdad.
 */
export function converge(items: AttentionItem[]): ConvergedResult {
  return dedupeAttention(items);
}

/**
 * El orden en que se prefiere al observador cuando varios ven lo mismo.
 * Menor gana.
 */
const PESO: Record<string, number> = {
  truth_source: 0, active_observer: 1, legacy_sweep: 2, superseded_observer: 3,
};

/** Ordena para que converja quedándose con el más cercano a la verdad. */
export function byObserverPriority(a: AttentionItem, b: AttentionItem): number {
  return (PESO[a.observer.kind] ?? 9) - (PESO[b.observer.kind] ?? 9);
}

// ===========================================================================
// 3 · EL RESUMEN PARA B4 (§21)
// ===========================================================================

export type AttentionSummary = {
  total: number;
  byDomain: Record<string, number>;
  byCondition: Record<string, number>;
  bySeverity: Record<string, number>;
  /** Cuántos vienen de un dominio que NO gradúa. Se dice, en vez de meterlos
   *  en un cajón «sin gravedad» que parezca una gravedad más. */
  withoutSeverity: number;
  overdue: number;
  dueSoon: number;
  /** Los que no se pueden clasificar en el tiempo sin mirar el aviso concreto.
   *  Se cuentan aparte para que ni «vencido» ni «por vencer» mientan. */
  timingUnknown: number;
};

/**
 * El resumen determinista.
 *
 * NO hay puntuación, ni índice, ni semáforo global. Y no hay doble conteo: se
 * resume sobre lo YA convergido, así que un problema visto por dos observadores
 * suma uno.
 */
export function summarizeAttention(items: AttentionItem[]): AttentionSummary {
  const byDomain: Record<string, number> = {};
  const byCondition: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  let withoutSeverity = 0, overdue = 0, dueSoon = 0, timingUnknown = 0;

  for (const it of items) {
    byDomain[it.domain] = (byDomain[it.domain] ?? 0) + 1;
    // La condición es el tercer segmento de la clave: `dominio:tipo:id:cond`.
    const cond = it.dedupeKey.split(":").slice(3).join(":");
    byCondition[cond] = (byCondition[cond] ?? 0) + 1;
    if (it.severity) bySeverity[it.severity] = (bySeverity[it.severity] ?? 0) + 1;
    else withoutSeverity += 1;

    const code = it.observer.code;
    if (OVERDUE_OBSERVERS.includes(code)) overdue += 1;
    else if (DUE_SOON_OBSERVERS.includes(code)) dueSoon += 1;
    else if (TIMING_UNDECIDABLE.includes(code)) timingUnknown += 1;
  }

  return {
    total: items.length, byDomain, byCondition, bySeverity,
    withoutSeverity, overdue, dueSoon, timingUnknown,
  };
}

/**
 * ¿Se puede afirmar este resumen?
 *
 * Solo si TODAS las fuentes se pudieron leer. Con una fuente caída el total es
 * un mínimo, no un total, y decirlo es la diferencia entre informar y mentir.
 */
export function summaryIsComplete(
  sources: { status: string }[]
): boolean {
  return sources.every((s) => s.status === "ok");
}

/** El nombre legible del observador, para enseñar la procedencia sin jerga. */
export function observerLabel(code: string): string {
  const o = observerByCode(code);
  if (!o) return code;
  return o.condition;
}
