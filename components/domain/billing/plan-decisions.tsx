"use client";

import { useState, useTransition } from "react";
import {
  requestCancellationAction, schedulePlanChangeAction, cancelScheduledChangeAction,
} from "@/server/actions/billing";
import { longDate, planLabel } from "@/lib/domain/billing-display";
import { Button } from "@/components/ui/button";
import { ErrorAlert, InfoAlert } from "@/components/ui/alert";

/**
 * Trazaloop · PE-05B5F · Las dos decisiones de quien paga.
 *
 * LO QUE MÁS IMPORTA DE ESTA PANTALLA ES QUE NO ASUSTA.
 *
 * Cancelar no apaga nada hoy, y bajar de plan tampoco: las dos surten efecto
 * cuando termina el mes que ya está pagado, y la fecha se dice ANTES de
 * confirmar. Quien cancela el día 2 tiene servicio hasta el 30 porque pagó por
 * él, y eso tiene que verse aquí y no descubrirse después.
 *
 * Las dos se pueden deshacer mientras no llegue esa fecha.
 */
export function PlanDecisions({
  planCode, currentPeriodEnd, cancelScheduled, scheduledPlanLabel,
}: {
  planCode: string | null;
  currentPeriodEnd: string | null;
  cancelScheduled: boolean;
  scheduledPlanLabel: string | null;
}) {
  const [pendiente, empezar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<"cancelar" | "cambiar" | null>(null);

  const fin = currentPeriodEnd ? longDate(currentPeriodEnd) : null;
  // Las dos direcciones, por la MISMA puerta y con la misma fecha. Subir de
  // plan tampoco es inmediato: quien pagó su mes lo termina en el plan que
  // pagó, y por eso no se cobra nada hoy ni en un sentido ni en el otro.
  const destino = planCode === "extra" ? "full" : planCode === "full" ? "extra" : null;

  const lanzar = (fn: () => Promise<{ error: string | null }>, hecho: string) =>
    empezar(async () => {
      setError(null); setAviso(null);
      const r = await fn();
      if (r.error) setError(r.error); else setAviso(hecho);
      setConfirmando(null);
    });

  if (cancelScheduled) {
    return (
      <div className="space-y-3">
        <InfoAlert message={fin
          ? `Tu plan seguirá activo hasta el ${fin}. Después pasará al plan de entrada.`
          : "Tu plan seguirá activo hasta el final del periodo pagado."} />
        {error ? <ErrorAlert message={error} /> : null}
        <Button type="button" disabled={pendiente}
          onClick={() => lanzar(() => requestCancellationAction(false),
            "Cancelación retirada. Tu plan sigue renovándose.")}>
          No cancelar · seguir con el plan
        </Button>
      </div>
    );
  }

  if (scheduledPlanLabel) {
    return (
      <div className="space-y-3">
        <InfoAlert message={fin
          ? `Cambio a ${scheduledPlanLabel} programado para el ${fin}. Hasta entonces `
            + "mantienes tu plan actual. No se prorratea el periodo en curso ni "
            + "se genera abono por el tiempo restante."
          : `Cambio a ${scheduledPlanLabel} programado para el final del periodo pagado.`} />
        {error ? <ErrorAlert message={error} /> : null}
        <Button type="button" disabled={pendiente}
          onClick={() => lanzar(cancelScheduledChangeAction,
            "Cambio de plan retirado.")}>
          Retirar el cambio programado
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error ? <ErrorAlert message={error} /> : null}
      {aviso ? <InfoAlert message={aviso} /> : null}

      {confirmando === null ? (
        <div className="flex flex-wrap gap-2">
          {destino ? (
            <Button type="button" onClick={() => setConfirmando("cambiar")}>
              Cambiar a {planLabel(destino)}
            </Button>
          ) : null}
          <Button type="button" onClick={() => setConfirmando("cancelar")}>
            Cancelar el plan
          </Button>
        </div>
      ) : (
        <div className="space-y-3 rounded-md border border-hairline bg-canvas p-3">
          {/* La fecha SIEMPRE antes de confirmar. Nadie debería descubrir
              después hasta cuándo le dura lo que ya pagó. */}
          <p className="text-sm">
            {confirmando === "cancelar"
              ? `Tu plan seguirá activo hasta el ${fin ?? "final del periodo pagado"}. `
                + "No se cobrará nada más, no se devuelve la parte del periodo "
                + "que no llegues a usar y no se borra ningún dato."
              : `El cambio a ${planLabel(destino)} entrará en vigor el `
                + `${fin ?? "final del periodo pagado"}. Hasta entonces mantienes `
                + "tu plan actual. Hoy no se cobra nada: no se prorratea el "
                + "periodo en curso ni se genera abono por el tiempo restante."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={pendiente}
              onClick={() => (confirmando === "cancelar"
                ? lanzar(() => requestCancellationAction(true),
                    "Cancelación programada.")
                : lanzar(() => schedulePlanChangeAction(destino as string),
                    "Cambio de plan programado."))}>
              {pendiente ? "Guardando…" : "Confirmar"}
            </Button>
            <Button type="button" onClick={() => setConfirmando(null)}>
              Volver
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
