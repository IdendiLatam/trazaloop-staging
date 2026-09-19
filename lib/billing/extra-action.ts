/**
 * Trazaloop · BILLING-EXTRA-01D · Qué se le puede ofrecer a esta empresa sobre
 * Extra, y por qué camino.
 *
 *
 * POR QUÉ HAY UNA SOLA FUNCIÓN PARA ESTO
 *
 * Contratar Extra no es una cosa: son tres caminos financieros distintos según
 * de dónde venga la empresa.
 *
 *   · Sin plan de pago —Free, prueba, terminada— es una COMPRA. Presupuesto
 *     nuevo, checkout normal, `billing_create_quote`.
 *   · Con Full vivo es una SUBIDA. Se cobra sólo la diferencia del tiempo que
 *     queda, por `billing_quote_upgrade`, y en el carril del proveedor además
 *     hay que dejar la autorización recurrente cobrando Extra.
 *   · Y hay estados donde no se ofrece NADA: con un cobro a medias, con una
 *     subida en el aire, con dinero sin resolver, o con la cancelación ya
 *     programada.
 *
 * Elegir mal no es un fallo estético. Mandar a comprar a quien tiene Full le
 * cobra el plan entero en vez de la diferencia; mandar a subir a quien no tiene
 * suscripción no hace nada; y ofrecer un botón sobre un cobro sin resolver
 * invita a pagar dos veces.
 *
 * Repartida entre `/planes`, la ficha de facturación y tres componentes, esa
 * decisión se contradice sola en cuanto alguien toque uno de los cuatro sitios.
 * Aquí es una función pura con sus casos, y se ejercitan todos.
 *
 *
 * LO QUE ESTA FUNCIÓN NO HACE
 *
 * No cobra, no lee la base y no decide importes. Dice QUÉ acción corresponde y
 * a dónde lleva; el dinero lo sigue gobernando la primitiva de siempre, con sus
 * comprobaciones intactas. Si esta función se equivocara, el motor seguiría
 * negándose: `billing_quote_upgrade` rechaza una subida sin periodo pagado y
 * `billing_create_quote` no crea una segunda suscripción.
 *
 * Lógica PURA: sin React, sin base de datos, sin sesión.
 */

/** Lo que la autoridad ya sabe de esta empresa. Nada se calcula aquí. */
export type ExtraActionFacts = {
  /**
   * El estado de facturación, tal y como lo resuelve `summarizeBilling`. Se
   * reutiliza a propósito: es el mismo vocabulario que la pantalla ya usa para
   * contarle a alguien en qué situación está, y tener dos clasificaciones del
   * mismo hecho es cómo empiezan a divergir.
   */
  billingState: string;
  /** Lo EFECTIVO ahora mismo, prueba incluida. `null` = no se pudo leer. */
  effectivePlanCode: string | null;
  /** `manual`, `platform` o `provider`. */
  renewalMode: string | null;
  /**
   * La FORMA de cobro de esta suscripción: `redirect` cuando se paga en la
   * pasarela, `stored_source` cuando se cobra contra un medio guardado.
   *
   * Llega ya traducida. Este módulo no sabe —ni tiene por qué— cómo se llama
   * cada pasarela.
   */
  paymentFlow: "redirect" | "stored_source" | null;
  /** ¿Hay una subida ya presupuestada o enviada sobre esta suscripción? */
  upgradeInFlight: boolean;
  /** ¿Hay dinero observado sin resolver? Compensación o fallida con cobro. */
  upgradeNeedsAction: boolean;
  /** ¿Quien mira puede contratar? Sin esto sólo se informa. */
  isAdmin: boolean;
  /** ¿El carril de medio guardado puede cobrar hoy? Lo dice su capacidad. */
  storedSourceUpgradeAvailable: boolean;
};

export type ExtraActionKind =
  /** Compra nueva: presupuesto y checkout normal. */
  | "purchase"
  /** Subida prorrateada sobre un Full vivo. */
  | "upgrade"
  /** Hay un cobro empezado: se termina ése, no se abre otro. */
  | "continue_pending"
  /** Hay dinero sin resolver. Nadie paga nada más hasta que se resuelva. */
  | "action_required"
  /** Se está terminando algo que ya salió: sólo se informa. */
  | "in_progress"
  /** No hay ninguna acción que ofrecer, y se dice por qué. */
  | "none";

/**
 * Por qué carril iría el dinero, si hubiera dinero.
 *
 * Por FORMA, no por marca. `redirect` es el carril donde se paga en la pasarela
 * y se vuelve; `stored_source` es el que cobra contra un medio ya guardado.
 *
 * No se nombra ninguna pasarela a propósito: PE-05B2 dejó escrito que sólo un
 * puñado de ficheros de servidor puede saber cómo se llama, y este resolutor es
 * lógica pura de producto. Quién es cada carril lo traduce quien habla con la
 * pasarela; aquí sólo importa qué forma tiene el pago, que es lo que cambia lo
 * que ve una persona.
 */
export type ExtraActionLane = "redirect" | "stored_source" | "none";

/**
 * A dónde se escribe cuando el producto no puede resolverlo solo.
 *
 * Es el mismo canal que usa la página pública. Vive aquí para que una nota que
 * dice «lo vemos contigo» venga siempre con el cómo: sin eso, es una puerta
 * cerrada con un cartel amable.
 */
export const CONTACT_HREF = "mailto:contacto@idendi.org";

export type ExtraAction = {
  kind: ExtraActionKind;
  lane: ExtraActionLane;
  /** Código estable, para pruebas y para operación. Nunca se le enseña a nadie. */
  reason: string;
  /** ¿Se pinta un botón? `false` no siempre es un problema. */
  actionable: boolean;
};

const SIN_PLAN_DE_PAGO = new Set(["FREE", "TRIAL_ACTIVE", "ENDED"]);
const FULL_VIVO = new Set(["MANUAL_ACTIVE", "PROVIDER_ACTIVE", "GRANTED_ACTIVE"]);

/**
 * Qué se le ofrece a esta empresa sobre Extra.
 *
 * El ORDEN de las ramas es la política, y cada una explica por qué va donde va.
 */
export function resolveExtraAction(f: ExtraActionFacts): ExtraAction {
  const nada = (reason: string): ExtraAction =>
    ({ kind: "none", lane: "none", reason, actionable: false });

  // ── no se pudo leer ───────────────────────────────────────────────────────
  //
  // Va la primera. Sin saber en qué situación está una empresa, cualquier
  // acción financiera que se le ofrezca es una apuesta.
  if (f.billingState === "UNAVAILABLE" || f.effectivePlanCode === null) {
    return nada("STATE_UNAVAILABLE");
  }

  // ── ya tiene Extra ────────────────────────────────────────────────────────
  if (f.effectivePlanCode === "extra") return nada("ALREADY_ON_EXTRA");

  // ── hay dinero sin resolver ───────────────────────────────────────────────
  //
  // Antes que cualquier otra cosa, incluso antes de mirar si podría comprar.
  // Ofrecer un pago nuevo encima de uno sin resolver es cómo alguien acaba
  // pagando dos veces la misma subida.
  if (f.upgradeNeedsAction) {
    return { kind: "action_required", lane: "none",
             reason: "UPGRADE_NEEDS_ACTION", actionable: false };
  }

  // ── hay un cobro empezado y sin terminar ──────────────────────────────────
  if (f.billingState === "PENDING_CHECKOUT") {
    return { kind: "continue_pending", lane: "none",
             reason: "CHECKOUT_PENDING", actionable: f.isAdmin };
  }

  // ── hay una subida ya en el aire ──────────────────────────────────────────
  //
  // Se está terminando. Abrir otra chocaría contra `bsc_inflight_uniq`, así que
  // el botón no llegaría a ninguna parte: mejor contar lo que está pasando.
  if (f.upgradeInFlight) {
    return { kind: "in_progress", lane: "none",
             reason: "UPGRADE_IN_FLIGHT", actionable: false };
  }

  // ── un pago en duda ───────────────────────────────────────────────────────
  //
  // `VERIFYING` y `PAYMENT_PROBLEM` son dinero que ni entró ni se descartó.
  // Hasta que se sepa, no se abre otra operación encima.
  if (f.billingState === "VERIFYING" || f.billingState === "PAYMENT_PROBLEM") {
    return nada(`BILLING_${f.billingState}`);
  }

  // ── la cancelación ya está programada ─────────────────────────────────────
  //
  // Regla cerrada en 01A y confirmada en 01B: no se sube desde aquí. La
  // autorización cancelada no se resucita, y comprar encima solaparía dos
  // planes sobre el mismo tiempo ya pagado. Cuando termine, será una compra.
  if (f.billingState === "CANCEL_AT_PERIOD_END") {
    return nada("CANCELLATION_SCHEDULED");
  }

  // ── un cambio de plan ya programado ───────────────────────────────────────
  if (f.billingState === "DOWNGRADE_SCHEDULED") {
    return nada("CHANGE_ALREADY_SCHEDULED");
  }

  // ── sin plan de pago: es una COMPRA ───────────────────────────────────────
  //
  // Free, prueba y terminada. La prueba no vale dinero —no hay crédito que
  // aplicar— y por eso es una compra y no una subida.
  if (SIN_PLAN_DE_PAGO.has(f.billingState)) {
    return { kind: "purchase", lane: "none",
             reason: `PURCHASE_FROM_${f.billingState}`, actionable: f.isAdmin };
  }

  // ── con Full vivo: es una SUBIDA ──────────────────────────────────────────
  if (FULL_VIVO.has(f.billingState)) {
    // Concedido desde la consola, sin suscripción detrás: no hay periodo pagado
    // contra el que prorratear, así que no hay subida que presupuestar.
    if (f.billingState === "GRANTED_ACTIVE") return nada("GRANTED_WITHOUT_CONTRACT");

    if (f.paymentFlow === "redirect") {
      return { kind: "upgrade", lane: "redirect",
               reason: "UPGRADE_REDIRECT", actionable: f.isAdmin };
    }
    if (f.paymentFlow === "stored_source") {
      // El carril legacy sigue entero donde puede cobrar. No se migra a nadie,
      // y si su cobro no está disponible no se ofrece: lo cerró 01B.
      return f.storedSourceUpgradeAvailable
        ? { kind: "upgrade", lane: "stored_source",
            reason: "UPGRADE_STORED_SOURCE", actionable: f.isAdmin }
        : nada("STORED_SOURCE_UPGRADE_UNAVAILABLE");
    }
    return nada("PAYMENT_FLOW_UNKNOWN");
  }

  // ── cualquier otra cosa ───────────────────────────────────────────────────
  //
  // `PAYMENT_METHOD_MISSING` y lo que venga después. Por omisión no se ofrece
  // nada: un estado que nadie ha pensado no puede abrir una operación de dinero.
  return nada(`BILLING_${f.billingState}`);
}

/**
 * Cómo se llama esa acción para quien la lee.
 *
 * Vive aquí, junto a la decisión, porque son la misma cosa dicha dos veces: una
 * para el código y otra para las personas. Separarlas invita a que alguien
 * añada un caso en una y se olvide de la otra.
 */
export function extraActionLabel(a: ExtraAction): string | null {
  if (!a.actionable) return null;
  if (a.kind === "purchase") return "Empezar con Extra";
  if (a.kind === "upgrade") return "Pasar a Extra";
  if (a.kind === "continue_pending") return "Continuar el pago";
  return null;
}

/**
 * ¿Esta nota necesita un canal al que escribir?
 *
 * Decir «lo vemos contigo» sin decir dónde es una puerta cerrada con un cartel
 * amable. Estas dos son las únicas que piden a una persona; el resto explican
 * algo que se resuelve solo con el tiempo.
 */
export function extraActionNeedsContact(a: ExtraAction): boolean {
  return a.reason === "GRANTED_WITHOUT_CONTRACT"
      || a.reason === "PAYMENT_FLOW_UNKNOWN"
      || a.reason === "STORED_SOURCE_UPGRADE_UNAVAILABLE";
}

/**
 * Y qué se le cuenta a quien no puede hacer nada ahora mismo.
 *
 * `null` cuando no hay nada que explicar. Ni una de estas frases nombra una
 * pasarela, un estado interno ni una primitiva: son de fuera.
 */
export function extraActionNote(a: ExtraAction): string | null {
  switch (a.reason) {
    case "ALREADY_ON_EXTRA":
      return "Ya tienes Extra.";
    case "UPGRADE_NEEDS_ACTION":
      return "Estamos revisando tu cambio de plan. No hace falta que hagas "
        + "nada y no te vamos a cobrar de nuevo.";
    case "UPGRADE_IN_FLIGHT":
      return "Estamos terminando tu cambio a Extra.";
    case "CANCELLATION_SCHEDULED":
      return "Tu plan actual sigue activo hasta que termine el periodo que ya "
        + "pagaste. Después podrás contratar Extra.";
    case "CHANGE_ALREADY_SCHEDULED":
      return "Ya tienes un cambio de plan programado. Cuando surta efecto "
        + "podrás elegir otro.";
    case "GRANTED_WITHOUT_CONTRACT":
      return "Tu plan lo habilitó Trazaloop. Escríbenos y lo vemos contigo.";
    case "PAYMENT_FLOW_UNKNOWN":
      return "No podemos preparar el cambio ahora mismo. Escríbenos y lo "
        + "resolvemos contigo.";
    case "BILLING_VERIFYING":
    case "BILLING_PAYMENT_PROBLEM":
      return "Estamos comprobando tu último pago. Cuando se confirme podrás "
        + "cambiar de plan.";
    case "STORED_SOURCE_UPGRADE_UNAVAILABLE":
      return "El paso a Extra lo hacemos contigo.";
    default:
      return null;
  }
}
