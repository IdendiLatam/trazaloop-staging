/**
 * Trazaloop · MP-REC-01C.3 · A quién mira el barrido, y qué hace con cada uno.
 *
 *
 * POR QUÉ ESTO EXISTE SEPARADO DEL BARRIDO
 *
 * Un trabajo programado que decide a quién tocar mientras recorre acaba siendo
 * imposible de comprobar: para saber si saltaría una suscripción hay que
 * ejecutarlo contra una base con esa suscripción dentro. Aquí la decisión es
 * PURA —entra una fila, sale qué hacer con ella— y se ejercitan todos los casos
 * sin base, sin red y sin reloj real.
 *
 *
 * DOS RESPONSABILIDADES QUE NO SE MEZCLAN
 *
 *   A · CONCILIAR con el proveedor. Solo tiene sentido donde el proveedor
 *       todavía puede producir cobros.
 *
 *   B · REFRESCAR el estado canónico. Es limpieza: una suscripción cancelada
 *       cuyo periodo ya venció debería decir `ended`.
 *
 * Confundirlas lleva a dos errores caros en direcciones opuestas: preguntarle
 * al proveedor por objetos muertos, y dejar filas mintiendo porque «ya no se
 * concilian».
 *
 * Y lo más importante: **B no gobierna el acceso**. El derecho sale de la fecha
 * del último periodo pagado, y eso ya funciona sin que nadie despierte. Si este
 * barrido no corre en un mes, nadie tiene de más ni de menos; solo habrá filas
 * que tardan en ponerse al día.
 *
 *
 * LA TRAMPA QUE OBLIGA A ESCRIBIR ESTO
 *
 * Mercado Pago sigue devolviendo `next_payment_date` en una preapproval
 * CANCELADA. Es un campo obsoleto en un objeto muerto. Un barrido que buscara
 * «quién tiene cobro pendiente» por esa fecha volvería a preguntar —para
 * siempre— por una suscripción que nadie va a cobrar, y peor: podría acabar
 * tratándola como viva. Aquí la autoridad es el ESTADO de la autorización, no
 * ninguna fecha que el proveedor conserve por inercia.
 */

/** Lo que el barrido sabe de una suscripción antes de decidir. */
export type RunnerCandidate = {
  subscriptionId: string;
  /** Estado canónico de la suscripción comercial. */
  subscriptionStatus: string;
  renewalMode: string;
  /** Estado de la autorización recurrente, o `null` si no hay ninguna. */
  authorizationStatus: string | null;
  /** ¿Tiene ya un objeto del proveedor atado? */
  hasProviderObject: boolean;
  /** Fin del último periodo pagado, o `null` si no hay ninguno. */
  paidThrough: string | null;
};

export type RunnerAction =
  /** Se le pregunta al proveedor por cobros nuevos. */
  | "reconcile"
  /** El proveedor ya no puede cobrar: no se le pregunta. */
  | "skip_provider_cancelled"
  /** No es de este carril. */
  | "skip_not_provider_renewal"
  /** Terminada: no hay nada que conciliar ni que refrescar. */
  | "skip_ended"
  /** Todavía no hay objeto del proveedor al que preguntar. */
  | "skip_no_provider_object";

export type RunnerVerdict = {
  action: RunnerAction;
  /**
   * ¿Hay que refrescar el estado canónico? Es INDEPENDIENTE de la acción con
   * el proveedor: una cancelada no se concilia y sí puede necesitar ponerse al
   * día.
   */
  lifecycleRefresh: "none" | "to_ended" | "to_past_due";
};

const VIVAS = new Set(["pending", "active", "past_due", "cancel_at_period_end"]);
const AUTORIZACIONES_VIVAS = new Set(["awaiting_authorization", "authorized", "uncertain"]);

/**
 * ¿Qué se hace con esta suscripción?
 *
 * `now` entra por parámetro: un barrido cuyo resultado depende del reloj del
 * proceso no se puede comprobar dos veces igual.
 */
export function decideRunnerAction(
  c: RunnerCandidate, now: Date
): RunnerVerdict {
  if (c.renewalMode !== "provider") {
    return { action: "skip_not_provider_renewal", lifecycleRefresh: "none" };
  }
  if (c.subscriptionStatus === "ended") {
    return { action: "skip_ended", lifecycleRefresh: "none" };
  }
  if (!VIVAS.has(c.subscriptionStatus)) {
    // `manual_review`, `retired`, `lapsed`… no se tocan desde aquí: son
    // decisiones tomadas fuera, y un barrido no las revisa por su cuenta.
    return { action: "skip_ended", lifecycleRefresh: "none" };
  }

  const vencido = c.paidThrough !== null
    && new Date(c.paidThrough).getTime() <= now.getTime();

  // --- El proveedor ya no cobra --------------------------------------------
  //
  // Da igual lo que diga `next_payment_date`: la autorización está muerta.
  const autorizacionViva = c.authorizationStatus !== null
    && AUTORIZACIONES_VIVAS.has(c.authorizationStatus);
  if (!autorizacionViva) {
    return {
      action: "skip_provider_cancelled",
      // Y aquí sí hay limpieza pendiente: sin cobros futuros y sin tiempo
      // pagado por delante, esto terminó.
      lifecycleRefresh: vencido ? "to_ended" : "none",
    };
  }

  if (!c.hasProviderObject) {
    return { action: "skip_no_provider_object", lifecycleRefresh: "none" };
  }

  // --- Se concilia ----------------------------------------------------------
  //
  // Y si además se pasó la fecha pagada sin que haya llegado una renovación
  // aprobada, el estado canónico debería decirlo. NO se retira nada: el acceso
  // lo sigue gobernando el periodo, que ya venció por su cuenta.
  const atrasada = vencido && c.subscriptionStatus === "active";
  return {
    action: "reconcile",
    lifecycleRefresh: atrasada ? "to_past_due" : "none",
  };
}

/** Recuento sanitizado de una pasada. Sin identificadores de nadie. */
export type RunnerSummary = {
  scanned: number;
  reconciled: number;
  alreadyCurrent: number;
  failed: number;
  skipped: Record<string, number>;
  lifecycle: Record<string, number>;
};

export function emptySummary(): RunnerSummary {
  return { scanned: 0, reconciled: 0, alreadyCurrent: 0, failed: 0,
           skipped: {}, lifecycle: {} };
}

export function countInto(bucket: Record<string, number>, key: string): void {
  bucket[key] = (bucket[key] ?? 0) + 1;
}
