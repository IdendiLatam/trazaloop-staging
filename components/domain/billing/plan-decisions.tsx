"use client";

import { useState, useTransition } from "react";
import {
  requestCancellationAction, schedulePlanChangeAction, cancelScheduledChangeAction,
  scheduleIntervalChangeAction,
} from "@/server/actions/billing";
import { longDate, planLabel, storageSize } from "@/lib/domain/billing-display";
import { Button } from "@/components/ui/button";
import { ErrorAlert, InfoAlert } from "@/components/ui/alert";

/**
 * Trazaloop · PE-05B5F / B6E · Las decisiones de quien paga.
 *
 * LO QUE MÁS IMPORTA DE ESTA PANTALLA ES QUE NO ASUSTA.
 *
 * Bajar de plan, cambiar de periodicidad y cancelar no apagan nada hoy: las
 * tres surten efecto cuando termina el periodo que ya está pagado, y la fecha
 * se dice ANTES de confirmar. Quien cancela el día 2 tiene servicio hasta el 30
 * porque pagó por él, y eso tiene que verse aquí y no descubrirse después.
 *
 * Subir de plan es lo único inmediato, y vive en su propia pantalla porque
 * lleva dinero de por medio.
 *
 * Y LO QUE HAY GUARDADO NO SE TOCA
 *
 * Bajar de plan puede dejar a la empresa por encima del espacio incluido en el
 * plan nuevo. Eso NO borra nada: se puede seguir consultando, descargando y
 * borrando; lo único que se bloquea es subir más. Se dice antes de confirmar,
 * con las dos cifras delante, porque una empresa no debería tener que elegir
 * entre bajar de plan y conservar sus evidencias.
 */
export function PlanDecisions({
  planCode, billingInterval, currentPeriodEnd, cancelScheduled, scheduledPlanLabel,
  storageUsedBytes, targetStorageBytes, offersCancellation = true,
}: {
  planCode: string | null;
  billingInterval: string | null;
  currentPeriodEnd: string | null;
  cancelScheduled: boolean;
  scheduledPlanLabel: string | null;
  storageUsedBytes: number | null;
  targetStorageBytes: number | null;
  /**
   * 01B.9 · ¿Hay una recurrencia que cancelar?
   *
   * Con pago único no la hay: el plan vence solo. Ofrecer «Cancelar el plan»
   * ahí invita a cancelar algo inexistente, y peor: hace pensar que cancelando
   * se recupera dinero. Los modos con cobro programado —platform, provider—
   * lo siguen ofreciendo igual que antes.
   */
  offersCancellation?: boolean;
}) {
  const [pendiente, empezar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<
    "cancelar" | "bajar" | "periodicidad" | null>(null);

  const fin = currentPeriodEnd ? longDate(currentPeriodEnd) : null;
  // Bajar es de Extra a Full. De Full solo se puede ir a Free, y eso es
  // cancelar. Subir tiene su propia pantalla.
  const destino = planCode === "extra" ? "full" : null;
  const otraPeriodicidad = billingInterval === "annual" ? "monthly" : "annual";
  const nombrePeriodicidad = otraPeriodicidad === "annual" ? "anual" : "mensual";
  const seQuedaCorto = storageUsedBytes !== null && targetStorageBytes !== null
    && storageUsedBytes > targetStorageBytes;

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
            "Cambio retirado.")}>
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
            <Button type="button" onClick={() => setConfirmando("bajar")}>
              Cambiar a {planLabel(destino)}
            </Button>
          ) : null}
          {billingInterval ? (
            <Button type="button" onClick={() => setConfirmando("periodicidad")}>
              Pasar a facturación {nombrePeriodicidad}
            </Button>
          ) : null}
          {offersCancellation ? (
            <Button type="button" onClick={() => setConfirmando("cancelar")}>
              Cancelar el plan
            </Button>
          ) : null}
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
              : confirmando === "periodicidad"
              ? `Pasarás a facturación ${nombrePeriodicidad} el `
                + `${fin ?? "final del periodo pagado"}. Hasta entonces mantienes `
                + "tu plan y tu periodicidad actuales. Hoy no se cobra nada: no se "
                + "prorratea el periodo en curso ni se genera abono por el tiempo "
                + "restante."
              : `El cambio a ${planLabel(destino)} entrará en vigor el `
                + `${fin ?? "final del periodo pagado"}. Hasta entonces mantienes `
                + "tu plan actual. Hoy no se cobra nada: no se prorratea el "
                + "periodo en curso ni se genera abono por el tiempo restante."}
          </p>

          {confirmando === "bajar" && storageUsedBytes !== null
            && targetStorageBytes !== null ? (
            <div className="space-y-1 rounded-md border border-hairline bg-surface p-3 text-sm">
              <dl className="grid grid-cols-2 gap-y-1">
                <dt className="text-ink-soft">Uso actual</dt>
                <dd>{storageSize(storageUsedBytes)}</dd>
                <dt className="text-ink-soft">
                  Almacenamiento incluido en {planLabel(destino)}
                </dt>
                <dd>{storageSize(targetStorageBytes)}</dd>
              </dl>
              {seQuedaCorto ? (
                <p className="pt-1 text-ink-soft">
                  A partir del cambio quedarás por encima del espacio incluido.
                  No se borrará nada: podrás seguir consultando, descargando y
                  eliminando lo que ya tienes. Lo único que quedará bloqueado es
                  subir archivos nuevos, hasta que el uso baje del espacio
                  incluido.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={pendiente}
              onClick={() => (confirmando === "cancelar"
                ? lanzar(() => requestCancellationAction(true),
                    "Cancelación programada.")
                : confirmando === "periodicidad"
                ? lanzar(() => scheduleIntervalChangeAction(otraPeriodicidad),
                    "Cambio de periodicidad programado.")
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
