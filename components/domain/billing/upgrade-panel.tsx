"use client";

import { useState, useTransition } from "react";
import {
  quoteUpgradeAction, confirmUpgradeAction, cancelUpgradeAction,
} from "@/server/actions/billing";
import type { UpgradeQuote } from "@/lib/db/billing-upgrade";
import { money, longDate, planLabel } from "@/lib/domain/billing-display";
import { Button } from "@/components/ui/button";
import { ErrorAlert, InfoAlert } from "@/components/ui/alert";

/**
 * Trazaloop · PE-05B6E · Subir de plan hoy.
 *
 * LA CUENTA SE ENSEÑA ENTERA ANTES DE COBRAR
 *
 * Quien sube de plan a mitad de su periodo no paga el plan nuevo otra vez:
 * paga la diferencia que corresponde al tiempo que le queda de lo que ya
 * pagó. Eso es fácil de decir y difícil de creer si no se ve, así que se
 * enseñan las cuatro cifras: lo que se le reconoce de su plan actual, lo que
 * vale el nuevo para ese mismo tiempo, la diferencia y los impuestos.
 *
 * Y la promesa que más tranquiliza: la fecha de renovación NO se mueve.
 */
export function UpgradePanel({
  targetPlanCode, renewsAt,
}: {
  targetPlanCode: string;
  renewsAt: string | null;
}) {
  const [pendiente, empezar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [cuenta, setCuenta] = useState<UpgradeQuote | null>(null);

  const presupuestar = () => empezar(async () => {
    setError(null); setAviso(null);
    const r = await quoteUpgradeAction(targetPlanCode);
    if (r.error || !r.quote) { setError(r.error ?? "No pudimos preparar el cambio."); return; }
    setCuenta(r.quote);
  });

  const confirmar = () => empezar(async () => {
    if (!cuenta) return;
    setError(null); setAviso(null);
    const r = await confirmUpgradeAction(cuenta.changeId);
    if (r.error) { setError(r.error); setCuenta(null); return; }
    // BILLING-EXTRA-01D · Hay dos carriles y quien decide cuál es el servidor.
    //
    // Con el de REDIRECCIÓN se paga en la pasarela: aquí sólo se lleva a la
    // persona a donde el servidor dijo. No se compone ninguna dirección y no
    // viaja ningún importe — lo congeló el intento.
    //
    // Con el de medio guardado no hay a dónde ir: el cobro ya salió y lo único
    // que queda es esperar el desenlace.
    if (r.initPoint) { window.location.assign(r.initPoint); return; }
    setCuenta(null);
    setAviso("Estamos confirmando el pago con tu banco. En cuanto se confirme, "
           + `${planLabel(targetPlanCode)} queda activo.`);
  });

  const retirar = () => empezar(async () => {
    if (!cuenta) return;
    setError(null);
    await cancelUpgradeAction(cuenta.changeId);
    setCuenta(null);
  });

  if (cuenta === null) {
    return (
      <div className="space-y-3">
        {error ? <ErrorAlert message={error} /> : null}
        {aviso ? <InfoAlert message={aviso} /> : null}
        <p className="text-sm text-ink-soft">
          El cambio a {planLabel(targetPlanCode)} es inmediato en cuanto se
          confirme el pago. Solo pagarás la diferencia correspondiente al tiempo
          restante de tu periodo actual
          {renewsAt ? `, que termina el ${longDate(renewsAt)}` : ""}.
        </p>
        <Button type="button" disabled={pendiente} onClick={presupuestar}>
          {pendiente ? "Calculando…" : `Cambiar a ${planLabel(targetPlanCode)}`}
        </Button>
      </div>
    );
  }

  const dinero = (v: number) => money(v, cuenta.chargeCurrency);
  return (
    <div className="space-y-3 rounded-md border border-hairline bg-canvas p-3">
      {error ? <ErrorAlert message={error} /> : null}
      <dl className="grid grid-cols-2 gap-y-1 text-sm">
        <dt className="text-ink-soft">Plan actual</dt>
        <dd>{planLabel(cuenta.fromPlanCode)}</dd>
        <dt className="text-ink-soft">Plan nuevo</dt>
        <dd className="font-medium">{planLabel(cuenta.toPlanCode)}</dd>
        <dt className="text-ink-soft">Periodicidad</dt>
        <dd>{cuenta.billingInterval === "annual" ? "Anual" : "Mensual"}</dd>
        <dt className="text-ink-soft">Fecha de renovación</dt>
        <dd>{longDate(cuenta.renewsAt)}</dd>

        <dt className="col-span-2 pt-2 text-xs uppercase tracking-wide text-ink-soft">
          Por el tiempo que te queda
        </dt>
        <dt className="text-ink-soft">Valor restante de tu plan actual</dt>
        <dd>−{dinero(cuenta.proratedCurrentBase)}</dd>
        <dt className="text-ink-soft">
          Valor de {planLabel(cuenta.toPlanCode)} para ese tiempo
        </dt>
        <dd>{dinero(cuenta.proratedTargetBase)}</dd>
        <dt className="text-ink-soft">Diferencia</dt>
        <dd>{dinero(cuenta.deltaBase)}</dd>
        <dt className="text-ink-soft">
          Impuestos ({(cuenta.taxRateBasisPoints / 100).toFixed(0)} %)
        </dt>
        <dd>{dinero(cuenta.taxAmount)}</dd>
        <dt className="pt-1 font-medium">Total a pagar hoy</dt>
        <dd className="pt-1 font-semibold">{dinero(cuenta.totalAmount)}</dd>
      </dl>

      <p className="text-sm text-ink-soft">
        Tu fecha de renovación no cambiará. Tu próxima renovación será por el
        precio completo de {planLabel(cuenta.toPlanCode)} vigente para tu
        suscripción: {dinero(cuenta.targetFullBase)} más impuestos.
      </p>
      <p className="text-sm text-ink-soft">
        Se cobrará a la tarjeta que ya tienes guardada. No te pediremos los
        datos otra vez.
      </p>

      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={pendiente} onClick={confirmar}>
          {pendiente ? "Cobrando…" : `Pagar ${dinero(cuenta.totalAmount)} y activar`}
        </Button>
        <Button type="button" disabled={pendiente} onClick={retirar}>
          Volver
        </Button>
      </div>
    </div>
  );
}
