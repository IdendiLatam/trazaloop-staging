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
  /**
   * `true` = credenciales PRODUCTIVAS del proveedor. NO significa «producción
   * nuestra»: un usuario de prueba operando con sus credenciales hace
   * operaciones que el proveedor marca como productivas, de una cuenta falsa.
   * Ver PROD-LAUNCH-01B.4.
   */
  liveMode: boolean | null;
  /** Quién cobró, si el proveedor lo dice. `null` = no lo dijo. */
  collectorId: number | null;
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
  /** El entorno con el que se abrió ESTE intento. */
  intentEnvironment: string | null;
  /** El titular que la credencial debe resolver. `null` = no se pudo saber. */
  expectedOwnerId: number | null;
  /** ¿La credencial resuelve a ese titular? Falla cerrado si no se pudo mirar. */
  credentialOwnerMatches: boolean;

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

  /**
   * BILLING-EXTRA-01B.1 · Lo que el proveedor tenía ANTES de que esta subida lo
   * tocara. `null` significa que nunca se llegó a tocar —anotarlo es lo primero
   * que se hace antes del cambio—, y por tanto que no hay nada que restaurar.
   */
  providerRecurringAmountBefore: number | null;
  /** ¿Se VERIFICÓ por GET que la autorización volvió a su importe? */
  providerRestored: boolean;
  /**
   * A qué importe hay que volver, resuelto por la base: lo observado, o la
   * reconstrucción desde lo congelado. `null` = no se puede saber, y entonces
   * no se finaliza nada.
   */
  restoreTargetAmount: number | null;
  /** ¿Ya se pidió la reversión en esta pasada? */
  authorizationRestoreAttempted: boolean;
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
  /** Entró dinero y la subida no se completa. Se abre la compensación. */
  | { kind: "compensate"; reason: string }
  /**
   * BILLING-EXTRA-01B.1 · La autorización quedó en Extra y la subida no se
   * completó: hay que devolverla a su importe ANTES de devolver el dinero.
   */
  | { kind: "restore_authorization"; amountMinor: number; currency: string }
  /** Ya se puede devolver el dinero: fuera todo está como estaba. */
  | { kind: "refund"; reason: string }
  /**
   * No se puede avanzar sin arriesgar el invariante, y tampoco se puede cerrar.
   * Se queda en compensación, que mantiene el barrido bloqueado.
   */
  | { kind: "hold"; reason: string }
  /** Ya está resuelto. Volver a llamar no hace nada. */
  | { kind: "done"; reason: string };

const TERMINALES = new Set([
  "settled", "refunded", "cancelled", "declined",
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

  // ── fallida CON dinero dentro ─────────────────────────────────────────────
  //
  // BILLING-EXTRA-01C. `failed` es terminal salvo en un caso: cuando llegó un
  // pago APROBADO y la liquidación lo rechazó por cuentas. Ahí el cambio está
  // cerrado y el dinero sigue dentro, y dar eso por resuelto es exactamente
  // cómo un cobro se queda sin devolver para siempre.
  if (f.changeStatus === "failed") {
    return f.deltaPayment !== null && aprobado(f.deltaPayment)
      ? { kind: "compensate", reason: "FAILED_WITH_APPROVED_PAYMENT" }
      : { kind: "done", reason: "FAILED" };
  }

  // ── hay dinero pendiente de devolver ──────────────────────────────────────
  //
  // Va ANTES que cualquier otra cosa. Una compensación abierta manda sobre el
  // resto: mientras haya algo que devolver, no se evalúa si se podría
  // completar. De `compensation_required` no se sale hacia Extra.
  if (f.changeStatus === "compensation_required") {
    return decidirCompensacion(f);
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

  // ── IDENTIDAD Y ENTORNO · el modelo de PROD-LAUNCH-01B.4 ─────────────────
  //
  // La primera versión de esto comparaba `live_mode` con el entorno del
  // despliegue, y un cobro REAL de Sandbox —aprobado, por el importe exacto,
  // con la referencia exacta— llegó con `live_mode: true` y se mandó a
  // devolver. La bandera describe LA NATURALEZA DE LA CREDENCIAL, no nuestro
  // entorno: un usuario de prueba opera con credenciales que el proveedor marca
  // como productivas, de una cuenta falsa.
  //
  // Es el mismo error que el carril de pago único cerró en 01B.4 y que MP-ENV-01
  // había cerrado antes para las suscripciones. Lo que separa «nuestro» de
  // «ajeno» es la IDENTIDAD, y se comprueba por partes.

  // 1 · Los dos entornos tienen que ser el mismo. Cruzarlos es de nadie.
  if (f.intentEnvironment !== null
      && f.intentEnvironment !== f.configuredEnvironment) {
    return { kind: "compensate", reason: "INTENT_ENVIRONMENT_MISMATCH" };
  }
  // 2 · La credencial resuelve al titular esperado. Falla cerrado.
  if (!f.credentialOwnerMatches) {
    return { kind: "compensate", reason: "CREDENTIAL_OWNER_MISMATCH" };
  }
  // 3 · Y el cobro lo recibió ESE titular, cuando el proveedor lo dice.
  if (pago.collectorId !== null && f.expectedOwnerId !== null
      && pago.collectorId !== f.expectedOwnerId) {
    return { kind: "compensate", reason: "COLLECTOR_MISMATCH" };
  }
  // 4 · EN PRODUCCIÓN, `live_mode` SÍ manda. Sin excepción y sin `null`: un
  //     cobro que no viene de credenciales productivas no concede un plan
  //     productivo. En pruebas se observa y se guarda, pero no decide.
  if (f.configuredEnvironment === "live" && pago.liveMode !== true) {
    return { kind: "compensate", reason: "LIVE_MODE_REQUIRED" };
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
 * BILLING-EXTRA-01B.1 · Qué toca cuando ya hay una compensación abierta.
 *
 *
 * COMPENSAR UNA SUBIDA A MEDIAS SON DOS DEVOLUCIONES
 *
 * El dinero, y el importe recurrente. La segunda sólo hace falta si esta subida
 * llegó a tocar la autorización, y eso se sabe por una cosa: si se anotó el
 * importe anterior. Anotarlo es lo primero que se hace antes de tocarla, así
 * que «no hay anotación» significa «no se tocó».
 *
 *
 * EL ORDEN NO ES NEGOCIABLE
 *
 * Primero la autorización, después el dinero. Al revés dejaría, durante el rato
 * que tardara el segundo paso, una empresa con su dinero de vuelta y una
 * autorización cobrándole Extra todos los meses. Y si ese segundo paso no
 * llegara nunca, el cambio ya estaría cerrado y el barrido suelto.
 *
 * Por eso `refunded` es inalcanzable mientras la restauración no esté
 * verificada: lo impide esta función, lo impide la primitiva del reembolso y lo
 * impide una restricción de la tabla. Tres veces, porque saltarse una es fácil.
 */
function decidirCompensacion(f: UpgradeSagaFacts): UpgradeSagaStep {
  const tocada = f.providerRecurringAmountBefore !== null;

  // Nunca se tocó nada fuera: no hay autorización que devolver.
  if (!tocada) return { kind: "refund", reason: "NO_PROVIDER_CHANGE" };

  // Ya se verificó que volvió a su importe.
  if (f.providerRestored) return { kind: "refund", reason: "PROVIDER_RESTORED" };

  // Hay que devolverla, y no se sabe a qué importe. NO se inventa uno desde el
  // catálogo: se para. Un importe equivocado es peor que ninguno, porque parece
  // resuelto.
  if (f.restoreTargetAmount === null) {
    return { kind: "hold", reason: "RESTORE_TARGET_UNKNOWN" };
  }

  const observado = f.authorization?.observedAmountMinor ?? null;

  // No se pudo leer al proveedor. «No se sabe» no es «está como estaba», y
  // mientras quepa que siga en Extra no se cierra nada.
  if (observado === null) {
    return f.authorizationRestoreAttempted
      ? { kind: "hold", reason: "PROVIDER_AMOUNT_UNKNOWN" }
      : { kind: "restore_authorization", amountMinor: f.restoreTargetAmount,
          currency: f.expectedCurrency };
  }

  // Dice el importe original. Cuenta como restaurada aunque nunca llegáramos a
  // cambiarla: lo que importa es cómo está el mundo, no cuántas peticiones
  // hicieron falta. Quien llama lo sellará con su GET.
  if (observado === f.providerRecurringAmountBefore) {
    return { kind: "refund", reason: "PROVIDER_ALREADY_AT_ORIGINAL" };
  }

  // Ni el original ni nada reconocible. Si ya se pidió la reversión y sigue sin
  // aplicarse, esto no lo arregla otra petición.
  if (f.authorizationRestoreAttempted) {
    return { kind: "hold", reason: observado === f.targetRecurringAmountMinor
      ? "RESTORE_NOT_APPLIED" : "PROVIDER_AMOUNT_UNEXPECTED" };
  }
  return { kind: "restore_authorization", amountMinor: f.restoreTargetAmount,
           currency: f.expectedCurrency };
}

/**
 * BILLING-EXTRA-01B.1 · Qué significa que la liquidación no dijera «subida».
 *
 * Distinguir esto es lo que impide que un tiempo de espera de red dispare una
 * compensación destructiva. Devolver el dinero de una subida que sí se aplicó
 * sería quitarle a alguien un plan que pagó.
 */
export type SettlementVerdict = "settled" | "retry" | "permanent";

/** Las que dicen que el dinero y la subida NO pueden casarse nunca. */
const LIQUIDACION_DEFINITIVA = new Set([
  "reconciliation_mismatch", "environment_mismatch", "provider_mismatch",
  "not_an_upgrade", "declined", "failed",
]);

export function classifySettlementOutcome(
  outcome: string | null
): SettlementVerdict {
  if (outcome === "upgraded" || outcome === "already_settled") return "settled";
  if (outcome !== null && LIQUIDACION_DEFINITIVA.has(outcome)) return "permanent";
  // Todo lo demás —una respuesta que no llegó, un error de transporte, un
  // estado que no sabemos leer— se REINTENTA. No se compensa: primero se
  // vuelve a mirar qué dice la autoridad interna.
  return "retry";
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
