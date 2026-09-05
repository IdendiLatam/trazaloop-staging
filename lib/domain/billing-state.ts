/**
 * Trazaloop · PE-05B5E · Cómo se le cuenta a quien paga en qué estado está.
 *
 * LO QUE NO SE DICE
 *
 * Ni `past_due`, ni `provider_unknown`, ni una clase de fallo, ni el
 * identificador de una transacción. Eso es vocabulario nuestro y del
 * proveedor: a quien paga no le explica nada y, peor, le hace pensar que sabe
 * algo que todavía no sabemos.
 *
 * Y CUANDO NO SE SABE, NO SE AFIRMA
 *
 * Hay un estado en el que un cobro salió y no ha vuelto. Ahí no se puede decir
 * «tu pago fue rechazado» —podría estar cobrado— ni «tu pago se realizó»
 * —podría no estarlo—. Se dice que se está verificando, que es exactamente lo
 * que ocurre, y el servicio sigue funcionando mientras tanto.
 */

export type CustomerBillingState =
  | "active"
  | "verifying"
  | "payment_problem"
  | "payment_method_missing"
  | "cancel_scheduled"
  | "downgrade_scheduled"
  | "ended";

export type BillingStateCopy = {
  state: CustomerBillingState;
  title: string;
  detail: string;
  /** El servicio sigue disponible mientras se resuelve. */
  serviceContinues: boolean;
};

/**
 * Traduce el estado canónico a algo que se pueda leer.
 *
 * `verifying` gana a `payment_problem` a propósito: mientras haya dinero en
 * duda no se le dice a nadie que su pago falló.
 */
export function describeBillingState(input: {
  status: string | null;
  hasSubscription: boolean;
  graceUntil: string | null;
  cancelScheduled: boolean;
  downgradeScheduled: boolean;
  manualReview: boolean;
  paymentMethodMissing: boolean;
}): BillingStateCopy {
  if (!input.hasSubscription || input.status === null) {
    return { state: "ended", serviceContinues: true,
      title: "Plan de entrada",
      detail: "La empresa está en el plan de entrada. No hay ningún cobro programado." };
  }

  if (input.manualReview) {
    return { state: "verifying", serviceContinues: true,
      title: "Estamos verificando el estado de tu pago",
      detail: "Tu servicio sigue activo mientras lo confirmamos. No hace falta que "
            + "hagas nada; si necesitamos algo, te escribimos." };
  }

  if (["lapsed", "cancelled", "retired", "ended"].includes(input.status)) {
    return { state: "ended", serviceContinues: true,
      title: "Sin plan de pago activo",
      detail: "Tus datos, documentos e historial siguen aquí. Puedes contratar de "
            + "nuevo cuando quieras." };
  }

  if (input.status === "past_due") {
    if (input.paymentMethodMissing) {
      return { state: "payment_method_missing", serviceContinues: true,
        title: "Necesitamos una tarjeta para el próximo cobro",
        detail: "Tu servicio sigue activo. Añade un medio de pago para que la "
              + "renovación pueda completarse." };
    }
    return { state: "payment_problem", serviceContinues: true,
      title: "No pudimos completar el último cobro",
      detail: "Tu servicio sigue activo mientras lo intentamos de nuevo. Si el "
            + "problema está en la tarjeta, cámbiala y lo resolvemos." };
  }

  if (input.cancelScheduled) {
    return { state: "cancel_scheduled", serviceContinues: true,
      title: "Cancelación programada",
      detail: "Tu plan sigue activo hasta el final del periodo que ya pagaste." };
  }
  if (input.downgradeScheduled) {
    return { state: "downgrade_scheduled", serviceContinues: true,
      title: "Cambio de plan programado",
      detail: "El plan nuevo entra en vigor al terminar el periodo que ya pagaste." };
  }

  return { state: "active", serviceContinues: true,
    title: "Todo en orden", detail: "Tu plan está activo." };
}
