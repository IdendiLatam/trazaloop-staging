"use client";

import { useState, useTransition } from "react";
import { cancelRecurringAction } from "@/server/actions/billing";
import { Button } from "@/components/ui/button";
import { ErrorAlert, InfoAlert } from "@/components/ui/alert";

/**
 * Trazaloop · MP-REC-01C.1 · Detener los cobros automáticos.
 *
 *
 * LO QUE ESTA PANTALLA TIENE QUE DEJAR CLARO ANTES DE QUE NADIE PULSE
 *
 * Que cancelar NO es perder el plan hoy. Lo pagado sigue siendo suyo hasta la
 * fecha que compró, y lo único que se detiene son los cobros siguientes.
 *
 * Es la diferencia entre «cancelar la renovación» y «cancelar el plan», y
 * confundirlas en una pantalla de dinero hace que la gente no cancele por miedo
 * —o que cancele creyendo que pierde algo y escriba a soporte asustada—.
 *
 *
 * DOS ACTOS, NO UNO
 *
 * El primer clic ABRE la confirmación; el segundo ejecuta. No se cancela por
 * cargar la página, ni por seguir un enlace, ni por un clic accidental en una
 * lista. Y la ejecución es una acción de servidor, no una navegación.
 */
export function RecurringCancelPanel({
  authorizationId, paidThroughLabel, providerName,
}: {
  authorizationId: string;
  /** La fecha hasta la que el plan sigue activo, ya formateada. */
  paidThroughLabel: string | null;
  providerName: string;
}) {
  const [pendiente, empezar] = useTransition();
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState(false);

  const cancelar = () => {
    setError(null);
    empezar(async () => {
      const r = await cancelRecurringAction(authorizationId);
      if (r.error !== null) { setError(r.error); return; }
      setHecho(true);
      setConfirmando(false);
    });
  };

  if (hecho) {
    return (
      <section className="rounded-md border border-hairline bg-surface p-4">
        <h2 className="text-sm font-semibold">Renovación automática cancelada</h2>
        <p className="pt-2 text-sm text-ink-soft">
          {paidThroughLabel
            ? `Tu plan seguirá activo hasta el ${paidThroughLabel}.`
            : "Tu plan seguirá activo durante el tiempo que ya está pagado."}
          {" "}No se realizarán nuevos cobros automáticos.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-md border border-hairline bg-surface p-4">
      <h2 className="text-sm font-semibold">Renovación automática</h2>
      <p className="pt-2 text-sm text-ink-soft">
        {providerName} cobra tu plan cada mes de forma automática.
      </p>
      {error ? <div className="pt-3"><ErrorAlert message={error} /></div> : null}

      {confirmando ? (
        <div className="pt-3 space-y-3">
          <InfoAlert message={
            (paidThroughLabel
              ? `Tu plan seguirá activo hasta el ${paidThroughLabel}. `
              : "Tu plan seguirá activo durante el tiempo que ya está pagado. ")
            + `Al cancelar, ${providerName} no realizará nuevos cobros automáticos.`} />
          <div className="flex flex-wrap gap-2">
            <Button onClick={cancelar} disabled={pendiente}>
              {pendiente ? "Cancelando…" : "Sí, cancelar la renovación automática"}
            </Button>
            <Button variant="quiet" onClick={() => setConfirmando(false)}
                    disabled={pendiente}>
              Conservarla
            </Button>
          </div>
        </div>
      ) : (
        <div className="pt-3">
          <Button variant="quiet" onClick={() => setConfirmando(true)}>
            Cancelar renovación automática
          </Button>
        </div>
      )}
    </section>
  );
}
