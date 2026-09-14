"use client";

import { useState, useTransition } from "react";
import { startOneTimeCheckoutForQuoteAction } from "@/server/actions/billing";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/alert";

/**
 * Trazaloop · PROD-LAUNCH-01D.3A · Ir a pagar FUERA, y volver.
 *
 *
 * POR QUÉ NO HAY UN FORMULARIO DE TARJETA AQUÍ
 *
 * Porque en este carril Trazaloop no toca la tarjeta. Con Checkout Pro la
 * persona SE VA a Mercado Pago, paga allí y vuelve. Enseñar aquí un formulario
 * —o hablar de certificaciones de otra pasarela— describiría algo que no
 * ocurre, y en una pantalla de pago describir mal lo que va a pasar es lo peor
 * que se puede hacer: quien lee decide con eso.
 *
 * Así que esta pantalla dice exactamente lo que va a pasar: se sale, se paga
 * fuera, se vuelve.
 *
 *
 * EL IMPORTE YA ESTÁ CONGELADO
 *
 * Lo que se ve arriba es el presupuesto que la base calculó y guardó. Este
 * botón NO vuelve a presupuestar: manda a pagar ESE. Por eso recibe su
 * identificador y no un plan y un intervalo.
 *
 *
 * PULSARLO DOS VECES NO COBRA DOS VECES
 *
 * El segundo clic reutiliza el checkout ya abierto para el mismo presupuesto y
 * devuelve su mismo punto de pago. La idempotencia la garantiza la base, no
 * que el botón se deshabilite: un botón deshabilitado se salta recargando.
 */
export function RedirectCheckoutPanel({
  quoteId, providerName,
}: {
  quoteId: string;
  /**
   * Cómo se llama la pasarela para quien paga. Llega como DATO desde la
   * autoridad de proveedor: esta pieza no sabe —ni debe saber— cuál es.
   */
  providerName: string;
}) {
  const [pendiente, empezar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const pagar = () => {
    setError(null);
    empezar(async () => {
      const r = await startOneTimeCheckoutForQuoteAction(quoteId);
      if (r.error !== null || !r.initPoint) {
        setError(r.error ?? "No fue posible preparar el pago. No se cobró nada.");
        return;
      }
      window.location.href = r.initPoint;
    });
  };

  return (
    <section
      aria-labelledby="pago-seguro-titulo"
      className="rounded-md border border-hairline bg-surface p-4"
    >
      <p className="eyebrow">Pago seguro con</p>
      <h2 id="pago-seguro-titulo" className="pt-0.5 text-lg font-semibold">
        {providerName}
      </h2>
      <p className="pt-2 text-sm text-ink-soft">
        Al continuar te llevamos a {providerName} para completar el pago. Allí eliges
        cómo pagar. Trazaloop no recibe ni guarda los datos de tu tarjeta.
      </p>
      <p className="pt-2 text-sm text-ink-soft">
        Cuando termines volverás aquí y activaremos tu plan. Si cierras la ventana
        de {providerName} no pasa nada: podrás retomar el pago desde Plan y
        facturación.
      </p>

      {error ? <div className="pt-3"><ErrorAlert message={error} /></div> : null}

      <div className="pt-4">
        <Button type="button" onClick={pagar} disabled={pendiente}>
          {pendiente ? "Preparando el pago…" : `Continuar con ${providerName}`}
        </Button>
      </div>
    </section>
  );
}
