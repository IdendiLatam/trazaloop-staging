import { VerifyPaymentButton } from "@/components/domain/billing/verify-payment-button";

/**
 * Trazaloop · PROD-LAUNCH-01B.4 · «Tienes un pago en curso».
 *
 *
 * EL HUECO QUE ESTO CIERRA
 *
 * El botón «Ya realicé el pago — Verificar» vivía solo en la pantalla de
 * retorno, y esa pantalla comprueba el pago sola al cargarse. Servía para
 * quien vuelve; no servía para quien NO vuelve — que es justamente el caso
 * para el que se diseñó el botón.
 *
 * Quien cierra la ventana de la pasarela no tiene a dónde volver. La próxima
 * vez que entra, entra por la puerta de siempre: su plan. Así que el botón
 * tiene que estar aquí, donde va a mirar.
 *
 *
 * POR QUÉ NO SE COMPRUEBA SOLO AL PINTAR ESTA PANTALLA
 *
 * Porque activar un plan es un acto, y un acto tiene que tener autor. Que el
 * plan se active «al abrir facturación» convierte una consulta en una
 * transacción, y deja a quien mira sin saber qué hizo. Aquí se dice que hay un
 * pago pendiente de confirmar y se ofrece el botón; lo pulsa una persona.
 *
 * Y si el pago aún no consta, no pasa nada: el botón se puede volver a pulsar,
 * porque la activación es idempotente.
 */
export function PendingCheckoutPanel({
  checkoutId, amountLabel, initPoint,
}: {
  checkoutId: string;
  amountLabel: string;
  /** A dónde ir a pagar, si todavía no se pagó. */
  initPoint: string | null;
}) {
  return (
    <section className="rounded-md border border-hairline bg-surface p-4">
      <h2 className="text-sm font-semibold">Tienes un pago en curso</h2>
      <p className="pt-1 text-sm text-ink-soft">
        Preparamos un pago de {amountLabel} y todavía no nos consta confirmado.
        Si ya lo pagaste, compruébalo aquí y activamos tu plan.
      </p>
      <div className="flex flex-wrap items-center gap-3 pt-3">
        <VerifyPaymentButton checkoutId={checkoutId} />
        {initPoint ? (
          <a
            href={initPoint}
            className="text-sm underline underline-offset-4"
          >
            Todavía no pagué — ir a pagar
          </a>
        ) : null}
      </div>
    </section>
  );
}
