/**
 * Trazaloop · Sprint PCR-02 (Bloques H e I) · Estados de la Orden/corrida y
 * alerta de órdenes abiertas demasiado tiempo.
 *
 * Lógica PURA (sin BD, sin React), testeable en
 * tests/unit/pcr02-alerts.test.ts. Los estados provienen del CHECK real de
 * production_orders (0025): draft | in_progress | closed | cancelled — no se
 * inventa un state machine nuevo.
 */

/** Estados que representan una orden ABIERTA (en ejecución). */
export const OPEN_PRODUCTION_ORDER_STATUSES = ["draft", "in_progress"] as const;

/** Estados que representan una orden TERMINADA (cerrada o cancelada). */
export const FINISHED_PRODUCTION_ORDER_STATUSES = ["closed", "cancelled"] as const;

export function isProductionOrderOpen(status: string): boolean {
  return (OPEN_PRODUCTION_ORDER_STATUSES as readonly string[]).includes(status);
}

/**
 * Umbral de la alerta (Bloque I). El repositorio no contenía ninguna
 * configuración equivalente, así que se centraliza aquí con el valor por
 * defecto pactado: 72 horas. Cambiarlo después = editar SOLO esta constante
 * (deliberadamente NO es variable de entorno en PCR-02).
 */
export const PRODUCTION_ORDER_OPEN_ALERT_HOURS = 72;

/** Edad de la orden en horas desde su creación en el sistema. */
export function productionOrderAgeHours(createdAt: string | Date, now: Date = new Date()): number {
  const created = typeof createdAt === "string" ? new Date(createdAt) : createdAt;
  const ms = now.getTime() - created.getTime();
  return ms > 0 ? ms / (1000 * 60 * 60) : 0;
}

/**
 * ¿Debe mostrarse la alerta? Solo órdenes ABIERTAS (draft/in_progress) cuya
 * edad supera el umbral. Una orden cerrada o cancelada nunca alerta, sin
 * importar su antigüedad.
 */
export function isProductionOrderOpenTooLong(
  status: string,
  createdAt: string | Date | null | undefined,
  now: Date = new Date()
): boolean {
  if (!isProductionOrderOpen(status)) return false;
  if (!createdAt) return false;
  return productionOrderAgeHours(createdAt, now) > PRODUCTION_ORDER_OPEN_ALERT_HOURS;
}

/** Días completos que lleva abierta (para el mensaje; mínimo 1 si alerta). */
export function productionOrderOpenDays(
  createdAt: string | Date,
  now: Date = new Date()
): number {
  return Math.max(1, Math.floor(productionOrderAgeHours(createdAt, now) / 24));
}

/** Mensaje pactado con el cliente (Bloque I). */
export function openTooLongMessage(days: number): string {
  return `Esta orden lleva abierta ${days} ${days === 1 ? "día" : "días"}. Verifique si debe registrar la producción pendiente o cerrarla.`;
}

/**
 * Bloque H · Guarda de mutaciones: sobre una orden cerrada o cancelada no se
 * registran nuevos consumos ni salidas (los datos históricos no se tocan).
 * Devuelve el mensaje en español o null si la orden admite movimientos.
 */
/** PCR-02.3 · Mensaje semántico único del candado histórico: vale para
 *  closed, cancelled Y órdenes reabiertas (status abierto + candado). Es el
 *  mismo texto del trigger §2d de 0104. */
export const ORDER_HISTORY_MESSAGE =
  "Esta orden ya forma parte del historial de trazabilidad y no puede eliminarse.";

/** PCR-02.2/PCR-02.3 · Política de ELIMINACIÓN de la orden, con los 4
 *  estados reales de 0025 (sin estados nuevos) MÁS la condición histórica
 *  irreversible (history_locked_at, PCR-02.3):
 *    draft / in_progress, sin candado → eliminable (comportamiento
 *      histórico conservado; RESTRICT de salidas y RLS siguen aplicando —
 *      ningún permiso se amplía)
 *    closed / cancelled               → NO eliminable
 *    cualquier estado + candado       → NO eliminable (orden histórica
 *      reabierta: reabrir permite corregir, nunca borrar la historia)
 *  Transiciones documentadas (§18 del brief, estados reales):
 *    draft → in_progress → closed · draft/in_progress → cancelled ·
 *    closed/cancelled → in_progress SOLO por reapertura explícita
 *    (reopenProductionOrderAction); el candado se activa en BD (§2c de
 *    0104) al primer paso por closed/cancelled y jamás se borra. */
export function orderDeletionBlockedMessage(
  status: string,
  historyLockedAt?: string | null
): string | null {
  if (status === "closed" || status === "cancelled" || historyLockedAt != null) {
    return ORDER_HISTORY_MESSAGE;
  }
  return null;
}

/** PCR-02.3 · ¿Puede reabrirse? Política: tanto closed como cancelled se
 *  reabren (el dominio histórico permitía ambas transiciones desde el
 *  formulario; ahora son explícitas y el candado las vuelve no-borrables). */
export function orderReopenAllowed(status: string): boolean {
  return status === "closed" || status === "cancelled";
}

/** PCR-02.3 · Indicación discreta de la UI: orden operativamente abierta
 *  que ya pertenece al historial (fue finalizada y se reabrió). */
export function isReopenedHistoricalOrder(
  status: string,
  historyLockedAt?: string | null
): boolean {
  return historyLockedAt != null && isProductionOrderOpen(status);
}

export function orderMutationBlockedMessage(status: string): string | null {
  if (status === "closed") {
    return "La orden está cerrada. Cámbiala a «En proceso» si necesitas registrar más consumos o salidas.";
  }
  if (status === "cancelled") {
    return "La orden está cancelada y no admite nuevos consumos ni salidas.";
  }
  return null;
}
