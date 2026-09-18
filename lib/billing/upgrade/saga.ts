/**
 * Trazaloop · BILLING-EXTRA-01B · Qué se hace ahora con una subida de plan.
 *
 *
 * POR QUÉ ESTO ES UNA FUNCIÓN PURA
 *
 * Subir a Extra desde una suscripción que Mercado Pago renueva sola son dos
 * operaciones en dos sistemas: cobrar la diferencia del periodo en curso y
 * dejar la autorización cobrando el importe nuevo. Entre las dos hay una
 * frontera de red, y la mitad de los casos interesantes son «salió la primera y
 * no la segunda».
 *
 * Esos casos no se pueden probar de verdad si la decisión está mezclada con las
 * llamadas. Aquí vive SOLO la decisión: recibe lo que se sabe y dice qué toca.
 * Quien llama hace la llamada, vuelve a mirar y vuelve a preguntar.
 *
 *
 * UNA SOLA LÓGICA, TRES DISPARADORES
 *
 * La vuelta del navegador, el aviso del proveedor y el barrido llaman los tres
 * al mismo conciliador, y el conciliador pregunta aquí. Ninguno de los tres es
 * requisito: si el navegador no vuelve, el barrido llega igual. Lo que no puede
 * haber es tres versiones de la misma decisión.
 *
 *
 * LA REGLA QUE GOBIERNA TODO LO DEMÁS
 *
 * Si entró dinero y la subida no se puede completar, se devuelve. No se
 * concede Extra «por aproximación», no se deja el cobro dentro esperando a que
 * alguien se acuerde, y no se disfraza de cancelación.
 */

/** Lo observado del pago de la diferencia, ya normalizado a unidades mínimas. */
export type ObservedDeltaPayment = {
  providerPaymentId: string;
  /**
   * Vocabulario canónico del dominio, no el del proveedor. `null` cuando su
   * estado no se pudo traducir: ni entró ni se descartó, así que ni se concede
   * ni se devuelve — se vuelve a mirar.
   */
  canonicalStatus: string | null;
  /**
   * `null` cuando el importe del proveedor NO se pudo normalizar —otra moneda,
   * o decimales donde no puede haberlos—. No es cero: es «no se puede afirmar
   * cuánto entró», y con dinero dentro eso se devuelve, no se concede.
   */
  amountMinor: number | null;
  currency: string;
  liveMode: boolean | null;
};

export type UpgradeSagaFacts = {
  /** El estado de `billing_subscription_changes`. */
  changeStatus: string;
  /** Lo que el intento congeló, que es contra lo que se concilia. */
  expectedTotalAmount: number;
  expectedCurrency: string;
  /** Instantes en ISO. `now` entra por parámetro: una decisión que depende del
   *  reloj del proceso no se puede comprobar dos veces igual. */
  effectiveAt: string;
  periodEnd: string;
  now: string;
  /** `manual`, `platform` o `provider`. */
  renewalMode: string | null;
  /** El entorno que ESTE despliegue tiene configurado. */
  configuredEnvironment: "test" | "live";

  /** El cobro de la diferencia, si ya se ha visto en el proveedor. */
  deltaPayment: ObservedDeltaPayment | null;
  /**
   * ¿Hubo un cobro del proveedor DENTRO de la ventana de la subida?
   *
   * Es la guarda de la carrera. La cuenta de la diferencia se hizo contra un
   * periodo concreto; si el proveedor cobró una renovación mientras la subida
   * estaba en el aire, ese periodo ya no es el que era y el prorrateo dejó de
   * significar lo que decía. No se completa: se devuelve y se vuelve a
   * presupuestar contra el periodo nuevo.
   */
  providerCyclesInsideWindow: number;

  /** La autorización recurrente, sólo en el carril `provider`. */
  authorization: {
    providerSubscriptionId: string | null;
    /** Estado canónico de la autorización en la base. */
    status: string | null;
    /** El importe que el proveedor dice que va a cobrar, en unidades mínimas. */
    observedAmountMinor: number | null;
    observedCurrency: string | null;
  } | null;
  /** El importe recurrente que Extra debe dejar puesto. Se deriva de la fila
   *  del cambio en el servidor; nunca llega de fuera. */
  targetRecurringAmountMinor: number;
  /** ¿Ya se intentó poner ese importe en esta pasada? Sin esto, una
   *  autorización que no acepta el cambio haría girar el conciliador para
   *  siempre. */
  authorizationUpdateAttempted: boolean;
};

export type UpgradeSagaStep =
  /** Todavía no hay nada que hacer. No es un error: es que falta el pago. */
  | { kind: "wait"; reason: string }
  /** Nadie pagó y la subida se cierra sin dinero de por medio. */
  | { kind: "abandon"; reason: string }
  /** Hay que dejar la autorización recurrente en el importe de Extra. */
  | { kind: "update_authorization"; amountMinor: number; currency: string }
  /** Se puede conceder Extra: el dinero está y el carril queda coherente. */
  | { kind: "settle" }
  /** Entró dinero y la subida no se completa. Se devuelve. */
  | { kind: "compensate"; reason: string }
  /** Ya está resuelto. Volver a llamar no hace nada. */
  | { kind: "done"; reason: string };

const TERMINALES = new Set([
  "settled", "refunded", "cancelled", "declined", "failed",
]);
const AUTORIZACIONES_VIVAS = new Set(["authorized", "uncertain"]);

/** ¿Este pago es dinero que entró? */
function aprobado(p: ObservedDeltaPayment): boolean {
  return p.canonicalStatus === "approved";
}

/**
 * ¿Este pago es un «no» definitivo?
 *
 * El vocabulario es el CANÓNICO del dominio —`lib/billing/provider.ts`—, no el
 * de Mercado Pago. Escribir aquí «rejected» habría compilado y no habría
 * coincidido nunca con nada: el dominio lo llama `declined`.
 *
 * `refunded` también cuenta: el dinero entró y ya salió. No hay Extra que
 * conceder ni nada que devolver otra vez.
 */
function rechazado(p: ObservedDeltaPayment): boolean {
  return p.canonicalStatus === "declined" || p.canonicalStatus === "failed"
      || p.canonicalStatus === "refunded"
      || p.canonicalStatus === "partially_refunded";
}

/**
 * Qué toca hacer ahora.
 *
 * El ORDEN de las ramas es la política. Se lee de arriba abajo y cada una
 * explica por qué va donde va.
 */
export function decideUpgradeStep(f: UpgradeSagaFacts): UpgradeSagaStep {
  // ── ya está resuelto ──────────────────────────────────────────────────────
  if (TERMINALES.has(f.changeStatus)) {
    return { kind: "done", reason: f.changeStatus.toUpperCase() };
  }

  // ── hay dinero pendiente de devolver ──────────────────────────────────────
  //
  // Va ANTES que cualquier otra cosa. Una compensación abierta manda sobre el
  // resto: mientras haya algo que devolver, no se evalúa si se podría
  // completar. De `compensation_required` no se sale hacia Extra.
  if (f.changeStatus === "compensation_required") {
    return { kind: "compensate", reason: "COMPENSATION_ALREADY_OPEN" };
  }

  // ── todavía no ha salido al proveedor ─────────────────────────────────────
  if (f.changeStatus !== "submitted") {
    return { kind: "wait", reason: "NOT_SUBMITTED" };
  }

  const ahora = Date.parse(f.now);
  const fin = Date.parse(f.periodEnd);
  const pago = f.deltaPayment;
  const hayDinero = pago !== null && aprobado(pago);

  // ── se acabó el tiempo contra el que se hizo la cuenta ────────────────────
  //
  // El prorrateo se calculó sobre lo que quedaba de un periodo. Si ese periodo
  // terminó, la cuenta ya no vale. Sin dinero de por medio se cierra; con
  // dinero dentro se devuelve, porque cobrar por un tiempo que ya pasó no es
  // una subida, es quedarse con su dinero.
  if (Number.isFinite(fin) && Number.isFinite(ahora) && ahora >= fin) {
    return hayDinero
      ? { kind: "compensate", reason: "PERIOD_ENDED_AFTER_PAYMENT" }
      : { kind: "abandon", reason: "PERIOD_ENDED" };
  }

  // ── nadie ha pagado todavía ───────────────────────────────────────────────
  if (pago === null) return { kind: "wait", reason: "NO_PAYMENT_OBSERVED" };
  if (rechazado(pago)) {
    return { kind: "abandon",
             reason: `PAYMENT_${(pago.canonicalStatus ?? "").toUpperCase()}` };
  }
  if (!aprobado(pago)) {
    // `pending`, `in_process`, `authorized`, o un estado que no supimos
    // traducir. El dinero ni entró ni se descartó: no se concede nada y no se
    // devuelve nada, se vuelve a mirar.
    return { kind: "wait",
             reason: `PAYMENT_${(pago.canonicalStatus ?? "unknown").toUpperCase()}` };
  }

  // ── el dinero entró. A partir de aquí, cualquier «no» se DEVUELVE ─────────

  // Entorno. Falla cerrado, igual que en los otros tres caminos: un cobro de
  // pruebas no concede nada real y un cobro real no se reconoce en un
  // despliegue de pruebas.
  const entornoDelPago = pago.liveMode === null
    ? null : (pago.liveMode ? "live" : "test");
  if (entornoDelPago === null || entornoDelPago !== f.configuredEnvironment) {
    return { kind: "compensate", reason: "ENVIRONMENT_MISMATCH" };
  }

  // Conciliación exacta contra lo que el intento congeló. Un importe que no se
  // pudo normalizar cae aquí por el mismo camino: si no se puede afirmar que es
  // el que se esperaba, no concede nada.
  if (pago.amountMinor === null || pago.amountMinor !== f.expectedTotalAmount
      || pago.currency.toUpperCase() !== f.expectedCurrency.toUpperCase()) {
    return { kind: "compensate", reason: "PAYMENT_RECONCILIATION_MISMATCH" };
  }

  // LA CARRERA. Un ciclo del proveedor dentro de la ventana mueve el periodo
  // bajo los pies de la cuenta que ya se cobró.
  if (f.providerCyclesInsideWindow > 0) {
    return { kind: "compensate", reason: "RENEWAL_DURING_UPGRADE" };
  }

  // ── el carril manual y el de la plataforma no tienen nada fuera ───────────
  //
  // En `manual` no hay ninguna programación. En `platform` la hay, pero el
  // importe de cada renovación se deriva de `base_charge_amount`, que
  // `billing_settle_upgrade_payment` deja en el de Extra: el cobro siguiente se
  // corrige solo.
  if (f.renewalMode !== "provider") return { kind: "settle" };

  // ── el carril del proveedor sí ────────────────────────────────────────────
  const auth = f.authorization;
  if (auth === null || auth.providerSubscriptionId === null) {
    // Dice que renueva el proveedor y no hay a qué autorización mirar. No se
    // concede Extra a ciegas: el ciclo siguiente cobraría Full y nadie lo
    // aceptaría.
    return { kind: "compensate", reason: "AUTHORIZATION_MISSING" };
  }
  if (auth.status === null || !AUTORIZACIONES_VIVAS.has(auth.status)) {
    // Cancelada o muerta. No se resucita —esa regla está cerrada— y sin ella no
    // se puede dejar Extra cobrándose.
    return { kind: "compensate", reason: "AUTHORIZATION_NOT_ACTIVE" };
  }

  const yaEsExtra = auth.observedAmountMinor === f.targetRecurringAmountMinor
    && auth.observedCurrency !== null
    && auth.observedCurrency.toUpperCase() === f.expectedCurrency.toUpperCase();

  if (yaEsExtra) return { kind: "settle" };

  if (!f.authorizationUpdateAttempted) {
    return { kind: "update_authorization",
             amountMinor: f.targetRecurringAmountMinor,
             currency: f.expectedCurrency };
  }

  // Se pidió y al volver a preguntar el proveedor no refleja el importe nuevo.
  // No se confía en el 200: se confía en lo que dice después. Y como el dinero
  // ya entró, la única salida es devolverlo.
  return { kind: "compensate", reason: "AUTHORIZATION_AMOUNT_NOT_APPLIED" };
}

/**
 * El importe recurrente que Extra deja puesto.
 *
 * Es la base completa de Extra MÁS su impuesto, porque eso es lo que la
 * autorización cobra: se creó con `expected_total_amount`. Calcularlo sobre la
 * base a secas dejaría la autorización cobrando de menos justo el IVA, y el
 * ciclo siguiente no cuadraría.
 *
 * El redondeo NO se reimplementa aquí: quien llama le pregunta a
 * `billing_tax_amount`, que es la única autoridad de redondeo del dominio.
 */
export function recurringTotalFor(baseMinor: number, taxMinor: number): number {
  return baseMinor + taxMinor;
}
