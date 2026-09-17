/**
 * Trazaloop · PROD-LAUNCH-01B.9 · Cómo se habla de una fecha según quién
 * renueve.
 *
 *
 * EL DEFECTO QUE ESTO CIERRA
 *
 * Tras el primer pago único, la ficha del plan decía:
 *
 *     Siguiente cobro: 12 de octubre de 2026
 *     [ Cancelar el plan ]
 *
 * Las dos cosas son falsas cuando nadie va a cobrar solo. No hay cobro
 * programado, y no hay recurrencia que cancelar: el plan vence.
 *
 * Prometer un cobro que no va a ocurrir es peor que no decir nada. Quien lo
 * lee se despreocupa —«ya está, se renueva»— y el día del vencimiento se
 * queda sin plan convencido de que había pagado. La frase amable acaba
 * costando el cliente.
 *
 *
 * TRES MODOS, DOS FORMAS DE HABLAR
 *
 *   · `manual`   — vuelve a pagar la empresa. La fecha es un VENCIMIENTO.
 *   · `platform` — Trazaloop cobra la tarjeta guardada. Es un COBRO.
 *   · `provider` — el proveedor cobra por su cuenta. También es un COBRO.
 *
 * Y ante un modo desconocido —o ausente— se habla como si no hubiera cobro
 * automático. Es la única opción honesta: prometer un cargo que quizá no
 * existe hace daño; no prometerlo, como mucho hace que alguien renueve a mano
 * algo que se habría renovado solo.
 *
 * Lógica PURA: sin React, sin BD, sin sesión.
 */

/** Los tres modos que 0190 nombró. */
export type RenewalMode = "manual" | "platform" | "provider";

export type RenewalCopy = {
  /** Cómo se titula la fecha en la ficha del plan. */
  dateLabel: string;
  /** ¿Se está prometiendo un cargo automático? */
  impliesAutomaticCharge: boolean;
  /**
   * ¿Tiene sentido ofrecer «Cancelar el plan»?
   *
   * Solo si hay una recurrencia que cancelar. Con pago único no la hay, y el
   * botón invitaría a cancelar algo inexistente — con el riesgo añadido de que
   * alguien crea que cancelando recupera dinero.
   */
  offersCancellation: boolean;
  /** Qué se le dice a quien tiene un plan que no se renueva solo. */
  note: string | null;
};

const COBRO_AUTOMATICO: RenewalCopy = {
  dateLabel: "Siguiente cobro",
  impliesAutomaticCharge: true,
  offersCancellation: true,
  note: null,
};

/**
 * MP-REC-01C.2 · Cuando la recurrencia YA se canceló.
 *
 * El cobro se detuvo, pero el tiempo comprado sigue siendo suyo. Seguir
 * titulando esa fecha «Siguiente cobro» sería contradecir, en la misma
 * pantalla, el mensaje que acaba de confirmar que no habrá más cobros. Y la
 * fecha no cambia: cambia lo que significa.
 *
 * Tampoco se ofrece cancelar: ya está hecho.
 */
const COBRO_DETENIDO: RenewalCopy = {
  dateLabel: "Plan activo hasta",
  impliesAutomaticCharge: false,
  offersCancellation: false,
  note: null,
};

const SIN_COBRO_AUTOMATICO: RenewalCopy = {
  dateLabel: "Activo hasta",
  impliesAutomaticCharge: false,
  offersCancellation: false,
  note: "Tu plan no se renueva solo. Cuando llegue esa fecha podrás renovarlo "
    + "desde aquí; hasta entonces no se te cobrará nada.",
};

/**
 * Palabras que NO pueden aparecer cuando nadie va a cobrar.
 *
 * Solo las del COBRO. Las de la renovación automática —«se renovará»,
 * «renovación automática»— las vigila ya la comprobación 54 del guardián de
 * release, y en TODA la interfaz, no solo aquí. Repetirlas en esta lista
 * tenía dos costes: dos reglas para lo mismo, que acaban divergiendo, y que
 * este fichero contuviera literalmente la frase que el guardián busca — cosa
 * que lo puso rojo, con razón.
 */
export const FORBIDDEN_AUTO_CHARGE_WORDS = [
  "siguiente cobro", "próximo cobro", "proximo cobro",
  "se cobrará", "se cobrara", "cargo automático", "cargo automatico",
] as const;

/**
 * Cómo hablar de la fecha de este plan.
 *
 * `null` y cualquier valor desconocido caen del lado prudente: sin cobro
 * automático.
 */
export function renewalCopyFor(
  mode: string | null | undefined,
  /**
   * ¿Los cobros ya están detenidos? Es lo que distingue «va a cobrarse» de
   * «esto es hasta cuándo llega lo que ya pagaste».
   */
  chargesStopped: boolean = false
): RenewalCopy {
  if (mode !== "platform" && mode !== "provider") return SIN_COBRO_AUTOMATICO;
  return chargesStopped ? COBRO_DETENIDO : COBRO_AUTOMATICO;
}
