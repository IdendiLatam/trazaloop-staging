/**
 * Trazaloop · COMMERCIAL-UX-01F · Qué ve quien abre «Mi plan».
 *
 *
 * EL PROBLEMA QUE ESTO RESUELVE
 *
 * La pantalla de facturación tenía la información, pero repartida en cinco
 * secciones que había que leer enteras para responder la única pregunta que
 * lleva alguien allí: *¿qué tengo, hasta cuándo, y qué me toca hacer?*
 *
 * Esa respuesta depende de una combinación —plan contratado, plan efectivo,
 * tipo de concesión, quién renueva, si hay cancelación programada, si hay un
 * cobro a medias— que en JSX son ocho ramas anidadas que nadie puede leer y
 * que NADIE puede probar sin navegador.
 *
 * Aquí es una función pura con sus estados nombrados, y se ejercitan todos.
 *
 *
 * LO QUE ESTE MÓDULO NO HACE
 *
 * No lee nada, no calcula dinero y no decide derechos. Recibe lo que las
 * autoridades ya dijeron y elige CÓMO se cuenta. Si aquí apareciera un importe
 * o una cuota, habría dos verdades sobre lo mismo.
 *
 * Y no dice ni una palabra del vocabulario de dentro: «preapproval»,
 * «entitlement», «assignment» o `renewal_mode` no le explican nada a quien
 * paga y, peor, le hacen creer que sabe algo que no sabe.
 *
 * Lógica PURA: sin React, sin base de datos, sin sesión.
 */

/** Los estados que esta pantalla sabe contar. */
import { renewalCopyFor } from "./billing-renewal-copy";

export type BillingDisplayState =
  /** Sin plan de pago. El suelo permanente. */
  | "FREE"
  /** Un plan habilitado desde la consola, sin suscripción ni cobros. */
  | "GRANTED_ACTIVE"
  /** Concesión temporal de un plan de pago. No es un contrato. */
  | "TRIAL_ACTIVE"
  /** Plan de pago que NO se renueva solo: vuelve a pagar la empresa. */
  | "MANUAL_ACTIVE"
  /** Plan de pago con cobros programados en la pasarela. */
  | "PROVIDER_ACTIVE"
  /** Los cobros se detuvieron; el tiempo comprado sigue siendo suyo. */
  | "CANCEL_AT_PERIOD_END"
  /** Se acabó el periodo pagado. */
  | "ENDED"
  /** Hay un cobro empezado y sin terminar. Manda sobre todo lo demás. */
  | "PENDING_CHECKOUT"
  /** Dinero en duda: ni se afirma que falló, ni que se cobró. */
  | "VERIFYING"
  /** Un cobro no salió y el servicio sigue mientras tanto. */
  | "PAYMENT_PROBLEM"
  /** No hay con qué cobrar el próximo periodo. */
  | "PAYMENT_METHOD_MISSING"
  /** Hay un cambio de plan programado para el final del periodo pagado. */
  | "DOWNGRADE_SCHEDULED"
  /** No se pudo leer. NO es «no tiene plan». */
  | "UNAVAILABLE";

/** Un botón, ya decidido. `null` = para este estado no hay. */
export type BillingCta = {
  label: string;
  href: string;
  tone: "primary" | "quiet";
  /** Qué mueve de verdad. Sirve para auditar que nada cobra desde aquí. */
  financialEffect: "none" | "starts_checkout" | "schedules_change";
} | null;

export type BillingSummary = {
  state: BillingDisplayState;
  /** El titular. Lo que se lee primero y a veces lo único que se lee. */
  displayStatus: string;
  /** Una línea de contexto. */
  primaryMessage: string;
  /** Cómo se titula la fecha, y la fecha. `null` si no hay ninguna que dar. */
  validUntilLabel: string | null;
  /** Qué pasa cuando llegue esa fecha. `null` si no hay nada que prometer. */
  renewalMessage: string | null;
  primaryCta: BillingCta;
  secondaryCta: BillingCta;
  /** ¿Se ofrece detener los cobros programados? Solo con recurrencia viva. */
  offersStopRecurring: boolean;
  /** ¿Se ofrece programar el final del plan? Nunca a la vez que la anterior. */
  offersSchedulePlanEnd: boolean;
};

/** Lo que las autoridades ya dijeron. Nada de esto se calcula aquí. */
export type BillingFacts = {
  /** `null` = no se pudo leer el estado de facturación. */
  hasSubscription: boolean | null;
  /** Lo CONTRATADO. Durante una prueba de Full sobre Free, es `free`. */
  contractedPlanCode: string | null;
  /** Lo EFECTIVO ahora mismo, prueba incluida. */
  effectivePlanCode: string | null;
  /** `trial` mientras dure la prueba. */
  grantKind: string | null;
  /** Cuándo termina la concesión temporal, si la hay. */
  grantEndsAt: string | null;
  /** Hasta cuándo llega lo pagado. */
  currentPeriodEnd: string | null;
  renewsAt: string | null;
  cancelAtPeriodEnd: boolean;
  /** ¿Hay cobros programados en la pasarela, vivos? */
  hasLiveRecurring: boolean;
  /**
   * Quién renueva, según 0190: `manual`, `platform` o `provider`.
   *
   * Hace falta porque `hasLiveRecurring` solo ve el carril del PROVEEDOR. Una
   * suscripción en modo `platform` —la plataforma cobra una tarjeta guardada—
   * también se renueva sola, y describirla como manual le diría a alguien que
   * tiene que renovar a mano algo que se va a cobrar igual.
   *
   * Lo encontró la auditoría de 01G mirando los estados reales de Staging: hay
   * una empresa en ese modo, y mi primera versión la contaba mal.
   */
  renewalMode: string | null;
  /** Estado canónico de la suscripción. */
  subscriptionStatus: string | null;
  manualReview: boolean;
  downgradeScheduled: boolean;
  /** No hay medio de pago utilizable para el próximo cobro. */
  paymentMethodMissing: boolean;
  /** Hay un cobro abierto sin confirmar. */
  pendingCheckout: boolean;
  /** Quien mira, ¿puede contratar? */
  isAdmin: boolean;
};

/** Cómo se escribe una fecha. Se inyecta para que esto siga siendo puro. */
export type DateFormatter = (iso: string) => string;

const BILLING = "/settings/billing";

/**
 * El resumen de «Mi plan».
 *
 * El ORDEN de las ramas es la parte importante, y no es arbitrario: un cobro a
 * medias manda sobre cualquier otra cosa —quien lo tiene necesita terminarlo,
 * no leer sobre planes—, y una lectura fallida manda sobre todo, porque
 * inventar un estado es peor que decir que no se pudo leer.
 */
export function summarizeBilling(
  f: BillingFacts, fecha: DateFormatter
): BillingSummary {
  const hasta = (iso: string | null) => (iso === null ? null : fecha(iso));

  // ── no se pudo leer ───────────────────────────────────────────────────────
  if (f.hasSubscription === null) {
    return base("UNAVAILABLE", {
      displayStatus: "No pudimos leer tu plan",
      primaryMessage:
        "Vuelve a intentarlo en un momento. Tu acceso no se ve afectado por esto.",
    });
  }

  // ── un cobro a medias manda sobre todo lo demás ───────────────────────────
  // Quien cerró la ventana de la pasarela no sabe si pagó. Contarle opciones de
  // plan mientras tiene un cobro en el aire es responder a otra pregunta.
  if (f.pendingCheckout) {
    return base("PENDING_CHECKOUT", {
      displayStatus: "Tienes un pago sin terminar",
      primaryMessage:
        "Empezaste un pago y no llegó a confirmarse. Termínalo o compruébalo "
        + "antes de contratar otra cosa: así no se cobra dos veces.",
      primaryCta: f.isAdmin
        ? { label: "Continuar el pago", href: BILLING, tone: "primary",
            financialEffect: "starts_checkout" }
        : null,
    });
  }

  // ── dinero en duda ────────────────────────────────────────────────────────
  if (f.manualReview) {
    return base("VERIFYING", {
      displayStatus: "Estamos verificando un pago",
      primaryMessage:
        "Tu plan sigue funcionando mientras lo comprobamos. No hace falta que "
        + "hagas nada, y no vamos a cobrarte otra vez.",
      validUntilLabel: etiquetaFecha(
        // Hay un cobro automático de por medio, pero no se puede prometer:
        // está en duda, falló, o no hay con qué cobrarlo. Lo único cierto es
        // hasta dónde llega lo que ya pagó, y así se titula — con la frase de
        // la regla, no con una escrita aquí.
        etiquetaDeFecha("provider", true), hasta(f.currentPeriodEnd)),
    });
  }

  // ── la prueba ─────────────────────────────────────────────────────────────
  // Va ANTES que cualquier rama de plan de pago: durante una prueba de Full el
  // plan efectivo ES `full`, y tratarlo como contrato sería decirle a alguien
  // que compró algo que no compró.
  if (f.grantKind === "trial") {
    return base("TRIAL_ACTIVE", {
      displayStatus: "Estás probando",
      primaryMessage:
        "Tienes acceso completo durante la prueba. No hemos pedido tarjeta y no "
        + "se cobrará nada al terminar.",
      validUntilLabel: etiquetaFecha("La prueba termina el", hasta(f.grantEndsAt)),
      renewalMessage:
        "Cuando termine, tu empresa vuelve al plan de entrada. No se borra nada "
        + "de lo que hayas cargado.",
      primaryCta: f.isAdmin
        ? { label: "Contratar ahora", href: BILLING, tone: "primary",
            financialEffect: "starts_checkout" }
        : null,
    });
  }

  // ── un plan concedido, sin contrato detrás ────────────────────────────────
  // COMMERCIAL-UX-01G. La consola puede habilitarle un plan a una empresa sin
  // que exista una suscripción: es `grant_kind` `sold` o `courtesy` en 0162, y
  // hay empresas así de verdad.
  //
  // Antes caían en la rama de abajo y la pantalla decía a la vez «Full» —el
  // plan efectivo, del catálogo— y «Plan de entrada». Las dos frases juntas no
  // pueden ser ciertas, y quien las lee no sabe cuál creer.
  //
  // Se distingue por la CLASE de concesión, no por el código del plan: `base`
  // es el plan de entrada, y cualquier otra cosa es algo que alguien habilitó.
  // Así no hay un `"free"` escrito aquí que haya que perseguir el día que ese
  // código cambie.
  if (f.hasSubscription === false
      && f.grantKind !== null && f.grantKind !== "base") {
    return base("GRANTED_ACTIVE", {
      displayStatus: "Activo sin cobros",
      primaryMessage:
        "Trazaloop habilitó este plan para tu empresa. No hay ningún cobro "
        + "programado.",
      // Solo si la concesión tiene final. Las que no lo tienen no inventan uno.
      validUntilLabel: etiquetaFecha(etiquetaDeFecha(null, false),
                                     hasta(f.grantEndsAt)),
      secondaryCta: { label: "Comparar planes", href: "/planes", tone: "quiet",
                      financialEffect: "none" },
    });
  }

  // ── sin plan de pago ──────────────────────────────────────────────────────
  if (f.hasSubscription === false) {
    return base("FREE", {
      displayStatus: "Plan de entrada",
      primaryMessage:
        "Tienes acceso a la plataforma con tus propios datos. No hay ningún "
        + "cobro programado.",
      primaryCta: f.isAdmin
        ? { label: "Ver planes", href: BILLING, tone: "primary",
            financialEffect: "none" }
        : null,
      secondaryCta: { label: "Comparar planes", href: "/planes", tone: "quiet",
                      financialEffect: "none" },
    });
  }

  // ── se acabó ──────────────────────────────────────────────────────────────
  if (f.subscriptionStatus === "ended") {
    return base("ENDED", {
      displayStatus: "Tu plan terminó",
      primaryMessage:
        "Tu empresa volvió al plan de entrada. Todo lo que cargaste sigue ahí.",
      primaryCta: f.isAdmin
        ? { label: "Volver a contratar", href: BILLING, tone: "primary",
            financialEffect: "starts_checkout" }
        : null,
    });
  }

  // ── cobro rechazado, con el servicio en pie ───────────────────────────────
  if (f.subscriptionStatus === "past_due") {
    return base("PAYMENT_PROBLEM", {
      displayStatus: "Un cobro no se pudo completar",
      primaryMessage:
        "Tu plan sigue activo. Revisa el medio de pago para que no se "
        + "interrumpa.",
      validUntilLabel: etiquetaFecha(
        // Hay un cobro automático de por medio, pero no se puede prometer:
        // está en duda, falló, o no hay con qué cobrarlo. Lo único cierto es
        // hasta dónde llega lo que ya pagó, y así se titula — con la frase de
        // la regla, no con una escrita aquí.
        etiquetaDeFecha("provider", true), hasta(f.currentPeriodEnd)),
    });
  }

  // ── falta con qué cobrar ──────────────────────────────────────────────────
  // Antes que la cancelación y que la renovación: es lo único accionable, y es
  // lo que impedirá el próximo cobro si nadie lo arregla.
  if (f.paymentMethodMissing && (f.hasLiveRecurring || f.renewalMode === "platform")) {
    return base("PAYMENT_METHOD_MISSING", {
      displayStatus: "Falta un medio de pago",
      primaryMessage:
        "Tu plan sigue activo, pero no tenemos con qué cobrar la próxima "
        + "renovación. Añade un medio de pago para que no se interrumpa.",
      validUntilLabel: etiquetaFecha(
        // Hay un cobro automático de por medio, pero no se puede prometer:
        // está en duda, falló, o no hay con qué cobrarlo. Lo único cierto es
        // hasta dónde llega lo que ya pagó, y así se titula — con la frase de
        // la regla, no con una escrita aquí.
        etiquetaDeFecha("provider", true), hasta(f.currentPeriodEnd)),
      // Detener los cobros solo se puede donde hay una autorización que
      // cancelar: el carril de la plataforma se gobierna en otra parte.
      offersStopRecurring: f.isAdmin && f.hasLiveRecurring,
    });
  }

  // ── cambio de plan programado ─────────────────────────────────────────────
  // Va antes que la renovación normal: lo que importa contar es que el plan va
  // a cambiar, no que hoy está en orden.
  if (f.downgradeScheduled && !f.cancelAtPeriodEnd) {
    return base("DOWNGRADE_SCHEDULED", {
      displayStatus: "Tienes un cambio de plan programado",
      primaryMessage:
        "Hasta que termine el tiempo que ya pagaste conservas tu plan actual. "
        + "El cambio surte efecto entonces, y no se cobra nada hoy.",
      validUntilLabel: etiquetaFecha("Plan actual hasta",
        hasta(f.currentPeriodEnd ?? f.renewsAt)),
      primaryCta: f.isAdmin
        ? { label: "Ver mi plan", href: BILLING, tone: "quiet",
            financialEffect: "none" }
        : null,
      offersStopRecurring: f.isAdmin && f.hasLiveRecurring,
    });
  }

  // ── cancelación programada ────────────────────────────────────────────────
  // Lo pagado sigue siendo suyo: cancelar no corta nada hoy. Y NO se vuelve a
  // ofrecer cancelar, ni de una forma ni de la otra.
  if (f.cancelAtPeriodEnd || f.subscriptionStatus === "cancel_at_period_end") {
    return base("CANCEL_AT_PERIOD_END", {
      displayStatus: "Renovación automática cancelada",
      primaryMessage:
        "No se realizarán nuevos cobros automáticos. Conservas el plan hasta "
        + "que termine el tiempo que ya pagaste.",
      validUntilLabel: etiquetaFecha(
        // Los cobros están detenidos: la fecha no cambia, cambia lo que
        // significa. Lo dice la regla, no esta pantalla.
        //
        // El modo se afirma aquí porque la rama lo afirma: a este estado solo
        // se llega si HUBO una renovación automática y alguien la canceló. Leer
        // el modo de la fila sería peor —una fila puede haberse quedado sin él—
        // y entonces la frase se caería al «Activo hasta» de un plan que nunca
        // se renovó solo, que es otra cosa.
        etiquetaDeFecha("provider", true),
        hasta(f.currentPeriodEnd ?? f.renewsAt)),
      renewalMessage:
        "Cuando llegue esa fecha, tu empresa vuelve al plan de entrada.",
      primaryCta: f.isAdmin
        ? { label: "Ver mi plan", href: BILLING, tone: "quiet",
            financialEffect: "none" }
        : null,
    });
  }

  // ── con cobros programados ────────────────────────────────────────────────
  // Los DOS carriles automáticos: el del proveedor y el de la plataforma. Para
  // quien paga son lo mismo —le van a cobrar solo— y la diferencia de quién
  // ejecuta el cargo no le sirve de nada.
  if (f.hasLiveRecurring || f.renewalMode === "platform") {
    return base("PROVIDER_ACTIVE", {
      displayStatus: "Todo en orden",
      primaryMessage: "Tu plan está activo y se renueva solo.",
      validUntilLabel: etiquetaFecha(
        etiquetaDeFecha(f.hasLiveRecurring ? "provider" : f.renewalMode, false),
        hasta(f.renewsAt)),
      renewalMessage: "Renovación automática activa.",
      // Solo se ofrece detener lo que se puede detener aquí: la autorización
      // del proveedor. Sin ella, ofrecerlo sería un botón que no cumple.
      offersStopRecurring: f.isAdmin && f.hasLiveRecurring,
    });
  }

  // ── plan de pago que NO se renueva solo ───────────────────────────────────
  // Y aquí NO se ofrece detener una renovación que no existe: invitaría a
  // cancelar algo inexistente, con el riesgo de creer que así se recupera algo.
  return base("MANUAL_ACTIVE", {
    displayStatus: "Todo en orden",
    primaryMessage:
      "Tu plan está activo. No se renueva solo: cuando llegue la fecha, tendrás "
      + "que renovarlo desde aquí.",
    // Se llega aquí precisamente porque NO hay ningún carril automático vivo,
    // así que el modo que hay que describir es «ninguno» — aunque la fila
    // conserve un modo antiguo que ya no ejecuta nada.
    validUntilLabel: etiquetaFecha(etiquetaDeFecha(null, false),
      hasta(f.currentPeriodEnd ?? f.renewsAt)),
    renewalMessage: "No hay cobros automáticos programados.",
    offersSchedulePlanEnd: f.isAdmin && !f.downgradeScheduled,
  });
}

function etiquetaFecha(etiqueta: string, fecha: string | null): string | null {
  return fecha === null ? null : `${etiqueta} ${fecha}`;
}

/**
 * Cómo se TITULA la fecha.
 *
 * No se escribe aquí: se pregunta a `billing-renewal-copy`, que es donde vive
 * esa decisión desde PROD-LAUNCH-01B.9 y donde MP-REC-01C.2 dejó escrito que
 * una renovación ya cancelada no puede seguir titulándose «Siguiente cobro».
 *
 * COMMERCIAL-UX-01G. Durante 01F estas tres frases se reescribieron aquí a
 * mano. Dos módulos decidiendo la misma frase acaban divergiendo, y ya habían
 * empezado: el de allí trataba el carril `platform` como cobro automático y
 * este no. Se deja una sola autoridad.
 */
function etiquetaDeFecha(modo: string | null, cobrosDetenidos: boolean): string {
  return renewalCopyFor(modo, cobrosDetenidos).dateLabel;
}

function base(
  state: BillingDisplayState,
  parcial: Partial<Omit<BillingSummary, "state">> & {
    displayStatus: string; primaryMessage: string;
  }
): BillingSummary {
  return {
    state,
    validUntilLabel: null,
    renewalMessage: null,
    primaryCta: null,
    secondaryCta: null,
    offersStopRecurring: false,
    offersSchedulePlanEnd: false,
    ...parcial,
  };
}

/**
 * Palabras que NO pueden aparecer en esta pantalla.
 *
 * Es vocabulario de dentro. A quien paga no le explica nada y le hace creer que
 * sabe algo que no sabe. La lista vive aquí para que una prueba pueda
 * recorrerla en lugar de que alguien se acuerde de revisarlo.
 */
export const FORBIDDEN_INTERNAL_WORDS = [
  "preapproval", "entitlement", "assignment", "renewal_mode",
  "paid period", "provider authorization", "billing cycle",
  "reconciliation", "past_due", "cancel_at_period_end",
] as const;
