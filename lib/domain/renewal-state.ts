/**
 * Trazaloop · PROD-LAUNCH-01B · Qué se le dice a quien tiene un plan que vence.
 *
 *
 * EL PROBLEMA QUE ESTO RESUELVE
 *
 * Con pago único, el plan no se renueva solo. Alguien tiene que acordarse. Si
 * el producto no lo recuerda, lo descubre el cliente el día que algo deja de
 * funcionar, y eso no es un fallo de pago: es un fallo de aviso.
 *
 * Así que hay tres avisos —siete días, tres días, uno— y un estado después.
 * Ni uno más: avisar todos los días convierte el aviso en decorado.
 *
 *
 * LAS PALABRAS IMPORTAN, Y ESTÁN ELEGIDAS
 *
 * Al vencer NO se dice «cuenta desactivada», ni «suspendida», ni «bloqueada».
 * Se dice que el periodo terminó, que la información sigue intacta y que
 * ahora se está usando Free. Las tres cosas son ciertas y las tres hacen
 * falta: quien lee que su cuenta está «desactivada» asume que perdió sus
 * datos, y a partir de ahí ya no está decidiendo si renovar, está decidiendo
 * si confiar.
 *
 * Y el botón dice «Reactivar Full», no «Activar Full», para quien ya lo tuvo.
 *
 * Lógica PURA: sin React, sin BD, sin sesión.
 */

/** Los tres avisos, en días antes del vencimiento. */
export const RENEWAL_NOTICE_DAYS = [7, 3, 1] as const;
export type RenewalNoticeDay = (typeof RENEWAL_NOTICE_DAYS)[number];

export type RenewalView =
  | { kind: "none" }
  | {
      kind: "active";
      /** El día en que termina, para escribirlo tal cual. */
      endsAt: string;
      /** Días enteros que faltan. Nunca negativo aquí. */
      daysLeft: number;
      /** El aviso que toca, o `null` si aún no toca ninguno. */
      notice: RenewalNoticeDay | null;
      title: string;
      body: string;
      ctaLabel: string;
    }
  | {
      kind: "expired";
      endsAt: string;
      title: string;
      body: string;
      ctaLabel: string;
    };

export const RENEWAL_CTA_RENEW = "Renovar Full";
export const RENEWAL_CTA_REACTIVATE = "Reactivar Full";
export const EXPIRED_TITLE = "Tu período Full terminó.";
export const EXPIRED_BODY =
  "Tu información permanece intacta. Actualmente estás usando Free.";

/** Palabras que NO se usan al vencer. La suite las vigila. */
export const FORBIDDEN_EXPIRY_WORDS = [
  "desactivada", "desactivado", "suspendida", "suspendido",
  "bloqueada", "bloqueado", "cancelada", "cancelado",
] as const;

export type RenewalInput = {
  /** El plan efectivo de hoy. */
  planCode: string | null;
  /** Fin del periodo vigente, en ISO. `null` = no hay periodo. */
  periodEndsAt: string | null;
  /** El instante de referencia. Se recibe para poder probarlo. */
  now: Date;
};

/** Días ENTEROS que faltan. Se redondea hacia arriba a propósito. */
export function daysUntil(endsAt: string, now: Date): number {
  const fin = new Date(endsAt).getTime();
  if (!Number.isFinite(fin)) return Number.NaN;
  // Hacia arriba: a quien le quedan treinta horas le quedan «dos días», no
  // «uno». Redondear hacia abajo le quitaría un día de margen justo cuando
  // menos margen tiene.
  return Math.ceil((fin - now.getTime()) / 86_400_000);
}

/** El aviso que corresponde a los días que faltan, o `null`. */
export function noticeFor(daysLeft: number): RenewalNoticeDay | null {
  if (!Number.isFinite(daysLeft) || daysLeft < 0) return null;
  // El umbral MÁS PEQUEÑO que todavía cubre los días que faltan. A cinco días
  // toca el de siete; a dos, el de tres; a uno, el de uno. Así el aviso
  // escala en vez de repetirse, y a nueve días no toca ninguno.
  const alcanzados = RENEWAL_NOTICE_DAYS.filter((d) => daysLeft <= d);
  return alcanzados.length === 0 ? null : alcanzados[alcanzados.length - 1];
}

/**
 * El estado de renovación de una empresa.
 *
 * Un plan que no es de pago —Free— no tiene renovación que ofrecer, y por eso
 * devuelve `none` en vez de un aviso vacío: una pantalla que recibe `none`
 * sabe que no tiene que dibujar nada, y una que recibe un objeto con textos
 * en blanco dibuja un hueco.
 */
export function resolveRenewalView(input: RenewalInput): RenewalView {
  const dePago = input.planCode === "full" || input.planCode === "extra";
  if (!input.periodEndsAt) return { kind: "none" };

  const restan = daysUntil(input.periodEndsAt, input.now);
  if (!Number.isFinite(restan)) return { kind: "none" };

  if (restan <= 0) {
    return {
      kind: "expired",
      endsAt: input.periodEndsAt,
      title: EXPIRED_TITLE,
      body: EXPIRED_BODY,
      ctaLabel: RENEWAL_CTA_REACTIVATE,
    };
  }

  // Vigente pero con el plan ya en Free: la asignación cambió antes de que el
  // periodo terminara. No se ofrece renovar algo que ya no se tiene.
  if (!dePago) return { kind: "none" };

  const aviso = noticeFor(restan);
  return {
    kind: "active",
    endsAt: input.periodEndsAt,
    daysLeft: restan,
    notice: aviso,
    title: "Full activo",
    body: aviso === null
      ? `Tu plan Full está activo.`
      : restan === 1
        ? "Tu plan Full vence mañana."
        : `Tu plan Full vence en ${restan} días.`,
    ctaLabel: RENEWAL_CTA_RENEW,
  };
}
