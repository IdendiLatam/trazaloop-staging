"use client";

import { useState, useTransition } from "react";
import { startRecurringCheckoutForQuoteAction } from "@/server/actions/billing";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/alert";

/**
 * Trazaloop · MP-REC-01B · Empezar una contratación que se renueva sola.
 *
 *
 * QUÉ CAMBIA RESPECTO DEL CARRIL DE AL LADO
 *
 * En el carril de pago único la persona sale, paga y vuelve: al volver, o pagó
 * o no pagó. Aquí sale, AUTORIZA, y vuelve sin haber pagado todavía: la
 * pasarela cobra por su cuenta un rato después.
 *
 * Eso hay que decirlo ANTES, no después. Quien autoriza sin saberlo se queda
 * esperando un plan que no llega en ese instante y cree que algo falló.
 *
 *
 * ESTE COMPONENTE NO SABE QUÉ PASARELA ES
 *
 * Igual que el de al lado: el nombre visible llega como dato. La pieza de
 * interfaz no elige proveedor ni lo nombra.
 *
 *
 * PULSARLO DOS VECES NO CONTRATA DOS VECES
 *
 * El segundo clic reutiliza la autorización ya abierta y devuelve su mismo
 * enlace. Lo garantiza la base —un cerrojo por empresa y un índice parcial—, no
 * que el botón se deshabilite: un botón deshabilitado se salta recargando.
 */
export function RecurringCheckoutPanel({
  quoteId, providerName,
}: {
  quoteId: string;
  providerName: string;
}) {
  const [pendiente, empezar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const contratar = () => {
    setError(null);
    empezar(async () => {
      const r = await startRecurringCheckoutForQuoteAction(quoteId);
      if (r.error !== null || !r.initPoint) {
        setError(r.error
          ?? "No fue posible preparar la contratación. No se cobró nada.");
        return;
      }
      window.location.href = r.initPoint;
    });
  };

  return (
    <section className="rounded-md border border-hairline bg-surface p-4">
      <h2 className="text-sm font-semibold">Pago recurrente</h2>
      <p className="pt-2 text-sm text-ink-soft">
        Vas a autorizar a {providerName} para que cobre este importe cada mes.
        La autorización se hace fuera de Trazaloop y después vuelves aquí.
      </p>
      <p className="pt-2 text-sm text-ink-soft">
        Tu plan se activa cuando se confirme el primer cobro, no al autorizar.
      </p>
      {error ? <div className="pt-3"><ErrorAlert message={error} /></div> : null}
      <div className="pt-3">
        <Button onClick={contratar} disabled={pendiente}>
          {pendiente ? "Preparando…" : "Autorizar el pago mensual"}
        </Button>
      </div>
    </section>
  );
}
