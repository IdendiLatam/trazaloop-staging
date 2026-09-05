import "server-only";
import type { BillingProvider, RenewalFailureClass } from "@/lib/billing/provider";
import {
  listDueRenewals, openNextPeriod, openRenewalAttempt, markProviderSubmitted,
  markRenewalFailure, lapseSubscription, cancelAtPeriodEnd, applyScheduledChange,
  type DueRenewal,
} from "@/lib/db/billing-renewal";

/**
 * Trazaloop · PE-05B5B · El cobro que se hace solo.
 *
 * DELIBERADAMENTE ABURRIDO
 *
 * Descubre lo que vence, se asegura de que la obligación existe, abre UN
 * intento, pide el cobro y se aparta. No activa planes, no salda periodos, no
 * toca módulos, no inventa precios y no calcula calendarios. Todo eso lo hacen
 * funciones de la base que ya existían antes que él.
 *
 * QUIÉN DECIDE QUE ALGO SE PAGÓ
 *
 * El webhook firmado, releyendo la transacción en el proveedor. Que la llamada
 * responda «aprobado» NO salda nada aquí: sería creerle al canal equivocado, y
 * es exactamente el error que W3 y W4 existen para no repetir.
 *
 * LA PARTE QUE HAY QUE ENTENDER
 *
 * `provider_unknown`. Cuando la petición SALIÓ y no hubo respuesta, no sabemos
 * si se cobró. El intento se queda EN VUELO a propósito: mientras lo esté, el
 * índice de 0173 impide abrir otro para ese mes, así que nadie puede cobrar dos
 * veces. Sale de ahí un webhook firmado o una persona. Nunca un reintento
 * automático.
 */

export type RenewalDecision = {
  action: DueRenewal["action"];
  subscriptionId: string;
  organizationId: string;
  periodId: string | null;
  attemptId: string | null;
  attemptNumber: number;
  slot: number;
  outcome: string;
  failureClass: RenewalFailureClass | null;
  providerPaymentId: string | null;
};

export type RenewalRunResult = {
  dueFound: number;
  charged: number;
  retried: number;
  lapsed: number;
  cancelled: number;
  downgraded: number;
  manualReview: number;
  paymentMethodUnavailable: number;
  skipped: number;
  failures: number;
  decisions: RenewalDecision[];
};

const vacia = (d: DueRenewal, outcome: string): RenewalDecision => ({
  action: d.action, subscriptionId: d.subscriptionId,
  organizationId: d.organizationId, periodId: d.periodId, attemptId: null,
  attemptNumber: d.attemptNumber, slot: d.slot, outcome,
  failureClass: null, providerPaymentId: null,
});

/**
 * Una pasada.
 *
 * `now` es inyectable SOLO para que las pruebas puedan situarse en un momento
 * concreto del calendario sin esperar días. El calendario comercial no depende
 * de él: sale del ancla de la suscripción.
 */
export async function runRenewalPass(input: {
  provider: BillingProvider;
  now?: string;
  limit?: number;
  /**
   * En seco: descubre y decide, pero NO ejecuta nada. Ni cobra, ni deja caer,
   * ni cancela, ni cambia de plan.
   */
  dryRun?: boolean;
  /**
   * Lista blanca de suscripciones. Cuando existe, TODO lo demás se ignora sin
   * tocarse. No es autoridad comercial: es un cierre extra para que una prueba
   * con dinero real no pueda alcanzar a nadie que no estuviera invitado.
   */
  onlySubscriptions?: string[];
}): Promise<RenewalRunResult> {
  const todas = await listDueRenewals({ now: input.now, limit: input.limit });
  const permitidas = input.onlySubscriptions;
  const vencidas = permitidas
    ? todas.filter((d) => permitidas.includes(d.subscriptionId))
    : todas;
  const decisiones: RenewalDecision[] = [];

  for (const d of vencidas) {
    try {
      decisiones.push(input.dryRun
        ? { ...vacia(d, `dry_run:${d.action}`) }
        : await resolverUna(d, input.provider));
    } catch (e) {
      decisiones.push({ ...vacia(d, "error"),
        outcome: e instanceof Error ? `error:${e.message}` : "error" });
    }
  }

  const porAccion = (a: DueRenewal["action"]) =>
    decisiones.filter((x) => x.action === a).length;

  return {
    dueFound: vencidas.length,
    charged: decisiones.filter((x) => x.action === "renew" && x.outcome === "submitted").length,
    retried: decisiones.filter((x) => x.action === "retry" && x.outcome === "submitted").length,
    lapsed: decisiones.filter((x) => x.outcome === "lapsed").length,
    cancelled: decisiones.filter((x) => x.outcome === "cancelled").length,
    downgraded: decisiones.filter((x) => x.outcome === "applied").length,
    manualReview: porAccion("manual_review_required"),
    paymentMethodUnavailable: porAccion("payment_method_unavailable"),
    skipped: decisiones.filter((x) => x.outcome.startsWith("skipped")).length,
    failures: decisiones.filter((x) => x.failureClass !== null
      || x.outcome.startsWith("error")).length,
    decisions: decisiones,
  };
}

async function resolverUna(
  d: DueRenewal, proveedor: BillingProvider
): Promise<RenewalDecision> {
  // ------------------------------------------------------------------
  // LO QUE NO ES COBRAR. Ninguna de estas llama al proveedor, y ninguna
  // toca asignaciones a mano: cada una tiene su primitiva canónica.
  // ------------------------------------------------------------------
  if (d.action === "cancel_due") {
    const estado = await cancelAtPeriodEnd(d.subscriptionId);
    return vacia(d, estado === "cancelled" ? "cancelled" : `skipped:${estado}`);
  }
  if (d.action === "downgrade_due") {
    const estado = await applyScheduledChange(d.subscriptionId);
    return vacia(d, estado === "applied" ? "applied" : `skipped:${estado}`);
  }
  if (d.action === "lapse_due") {
    const estado = await lapseSubscription(d.subscriptionId);
    return vacia(d, estado === "lapsed" ? "lapsed" : `skipped:${estado}`);
  }
  // Un cobro sin desenlace no se toca: ni se reintenta, ni se deja caer. Lo
  // mira una persona, y hasta entonces el derecho pagado sigue en pie.
  if (d.action === "manual_review_required") {
    return { ...vacia(d, "manual_review"), failureClass: "provider_unknown" };
  }
  // Sin tarjeta no se cobra, pero SÍ se sigue viendo: cuando se agote la
  // gracia, esta misma suscripción volverá con `lapse_due`.
  if (d.action === "payment_method_unavailable") {
    return { ...vacia(d, "skipped:no_payment_method"),
             failureClass: "payment_method_unavailable" };
  }

  // ------------------------------------------------------------------
  // LA OBLIGACIÓN. Si toca renovar, todavía no existe: se abre. Si toca
  // reintentar, es la que ya está abierta y se reutiliza.
  // ------------------------------------------------------------------
  let periodId = d.periodId;
  if (!periodId) {
    const abierto = await openNextPeriod(d.subscriptionId);
    if (abierto.status !== "open" || !abierto.periodId) {
      return vacia(d, `skipped:${abierto.reason ?? abierto.status}`);
    }
    periodId = abierto.periodId;
  }

  if (!d.paymentMethodId) {
    return { ...vacia(d, "skipped:no_payment_method"), periodId,
             failureClass: "payment_method_unavailable" };
  }

  // ------------------------------------------------------------------
  // EL INTENTO. Uno, y solo si el índice lo permite.
  // ------------------------------------------------------------------
  const intento = await openRenewalAttempt({
    organizationId: d.organizationId, subscriptionId: d.subscriptionId,
    periodId, paymentMethodId: d.paymentMethodId,
  });
  if (!intento) {
    // Otro trabajador se adelantó, o hay un cobro sin resolver. Las dos son
    // razones para NO mandar nada.
    return { ...vacia(d, "skipped:attempt_not_available"), periodId };
  }

  if (!proveedor.chargeStoredPaymentMethod) {
    await markRenewalFailure({ intentId: intento.intentId,
      failureClass: "provider_unavailable",
      reason: "PROVIDER_HAS_NO_STORED_CHARGE" });
    return { ...vacia(d, "skipped:provider_cannot_charge"), periodId,
             attemptId: intento.intentId, failureClass: "provider_unavailable" };
  }

  // ------------------------------------------------------------------
  // LA FRONTERA. Se marca ANTES de llamar. Si el proceso muere justo
  // después, lo que queda escrito es «salió», que es la verdad, y la
  // recuperación no puede confundirlo con «no salió».
  // ------------------------------------------------------------------
  await markProviderSubmitted(intento.intentId);

  const r = await proveedor.chargeStoredPaymentMethod({
    providerPaymentMethodId: intento.providerPaymentMethodId,
    amountMinor: intento.expectedTotalAmount,
    currency: intento.expectedCurrency,
    // La referencia identifica el INTENTO. Nunca el mes, ni el importe.
    reference: `pay_${intento.intentId}`,
    customerEmail: intento.customerEmail,
  });

  if (!r.ok) {
    // Sin clase, se falla cerrado a la peor lectura posible: pudo haberse
    // cobrado. Es la única suposición que no puede cobrar dos veces.
    const clase: RenewalFailureClass = r.failureClass ?? "provider_unknown";
    await markRenewalFailure({ intentId: intento.intentId, failureClass: clase,
                               reason: r.message });
    return { ...vacia(d, `failed:${clase}`), periodId,
             attemptId: intento.intentId, failureClass: clase };
  }

  // Salió, y el proveedor dijo algo. AQUÍ NO SE SALDA NADA: eso lo hará el
  // webhook firmado, por el mismo camino canónico de siempre.
  return { ...vacia(d, "submitted"), periodId, attemptId: intento.intentId,
           providerPaymentId: r.value.providerPaymentId };
}
