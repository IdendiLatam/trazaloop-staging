"use client";

import { useState, useTransition } from "react";
import {
  startRenewalCheckoutAction, startOneTimeCheckoutAction,
} from "@/server/actions/billing";
import { ErrorAlert } from "@/components/ui/alert";
import { resolveRenewalView, type RenewalView } from "@/lib/domain/renewal-state";

/**
 * Trazaloop · PROD-LAUNCH-01B.1 · Renovar un plan que no se renueva solo.
 *
 *
 * POR QUÉ EXISTE
 *
 * Con pago único nadie cobra por su cuenta. Si el producto no avisa, el
 * cliente se entera el día que algo deja de funcionar — y eso no es un fallo
 * de pago, es un fallo de aviso.
 *
 *
 * LOS AVISOS SUBEN DE TONO, Y NO TODOS LOS DÍAS
 *
 * Siete días: se menciona. Tres: se destaca. Uno: se destaca fuerte. Ni uno
 * más. Avisar a diario convierte el aviso en decorado y deja de leerse justo
 * cuando importa. Y los días salen del vencimiento, no de ningún proceso
 * programado: se calculan al pintar.
 *
 *
 * RENOVAR NO ES REACTIVAR, Y NO ES EL MISMO CAMINO
 *
 * Mientras el periodo vive, renovar abre el SIGUIENTE periodo, anclado al
 * final del vigente: quien vence el 12 y paga el 5 recibe 12 → 12, sin perder
 * los días que ya pagó.
 *
 * Una vez vencido, la suscripción caducó y no vuelve sola: reactivar es
 * contratar otra vez, con su presupuesto nuevo. Son dos acciones distintas
 * porque son dos hechos distintos, y mezclarlas daría un periodo que empieza
 * en una fecha que nadie pactó.
 */
export function RenewalPanel({
  planCode, billingInterval, periodEndsAt, nowIso,
}: {
  planCode: string | null;
  billingInterval: string | null;
  periodEndsAt: string | null;
  /** El instante lo pone el SERVIDOR: el reloj del navegador no decide
   *  cuándo vence un plan que alguien pagó. */
  nowIso: string;
}) {
  const vista: RenewalView = resolveRenewalView({
    planCode, periodEndsAt, now: new Date(nowIso),
  });
  const [pendiente, empezar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (vista.kind === "none") return null;

  const pagar = () => {
    setError(null);
    empezar(async () => {
      const r = vista.kind === "expired"
        ? await startOneTimeCheckoutAction(
            planCode === "extra" ? "extra" : "full",
            billingInterval === "annual" ? "annual" : "monthly")
        : await startRenewalCheckoutAction();
      if (r.error !== null || !r.initPoint) {
        setError(r.error ?? "No fue posible preparar el pago. No se cobró nada.");
        return;
      }
      window.location.href = r.initPoint;
    });
  };

  const tono = vista.kind === "expired"
    ? "border-danger/40 bg-danger/5"
    : vista.notice === 1
      ? "border-danger/40 bg-danger/5"
      : vista.notice === 3
        ? "border-warning/40 bg-warning/5"
        : vista.notice === 7
          ? "border-hairline bg-surface"
          : "border-hairline bg-surface";

  return (
    <section className={`rounded-md border p-4 ${tono}`}>
      <h2 className="text-sm font-semibold">{vista.title}</h2>
      {vista.kind === "active" ? (
        <>
          <p className="pt-1 text-sm text-ink">
            Activo hasta {fecha(vista.endsAt)}
          </p>
          {vista.notice !== null ? (
            <p
              role="status"
              className={`pt-1 text-sm ${vista.notice === 1 ? "font-semibold text-danger" : "text-ink"}`}
            >
              {vista.body} Renueva ahora para mantener todas las funciones.
            </p>
          ) : null}
        </>
      ) : (
        <p className="pt-1 text-sm text-ink">{vista.body}</p>
      )}

      <div className="pt-3">
        <button
          type="button" onClick={pagar} disabled={pendiente}
          className="inline-flex items-center rounded-md bg-loop px-4 py-2 text-sm font-medium text-paper hover:opacity-90 disabled:opacity-60"
        >
          {pendiente ? "Preparando el pago…" : vista.ctaLabel}
        </button>
      </div>
      <div className="pt-2"><ErrorAlert message={error} /></div>
    </section>
  );
}

/** DD/MM/AAAA, que es como se lee una fecha aquí. */
function fecha(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}
