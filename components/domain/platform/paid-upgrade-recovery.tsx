"use client";

import { useState, useTransition } from "react";
import type { PendingUpgradeRow } from "@/lib/db/upgrade-recovery";
import { completePaidUpgradeAction } from "@/server/actions/billing";
import { money } from "@/lib/domain/billing-display";
import { Button } from "@/components/ui/button";
import { ErrorAlert, InfoAlert } from "@/components/ui/alert";

/**
 * Trazaloop · BILLING-EXTRA-01C.3 · Las subidas que esperan a una persona.
 *
 *
 * POR QUÉ AQUÍ SÍ HAY UN BOTÓN QUE MUEVE DINERO
 *
 * La tabla de al lado dice, desde PE-05B5F, que no hay ni un botón que mueva
 * dinero y que «cuando exista, existirá a propósito». Éste existe a propósito.
 *
 * Lo que pulsa quien opera no es «cambiar el plan»: es «este cobro es legítimo,
 * sigue adelante». A partir de ahí manda la misma saga que habría mandado sola,
 * con todas sus comprobaciones. Si el importe no cuadra o la autorización
 * recurrente no está donde debe, no pasa nada por mucho que se pulse.
 *
 *
 * QUÉ SE ENSEÑA Y QUÉ NO
 *
 * Lo justo para poder decidir: qué empresa, de qué plan a cuál, cuánto, en qué
 * moneda y qué es lo que está atascado. Ni un identificador del proveedor, ni
 * un token, ni un correo. Y ni un campo editable: las cifras se miran, no se
 * escriben — que alguien pudiera teclear un importe aquí sería exactamente el
 * agujero que todo lo demás lleva cerrando desde 0216.
 */

const MOTIVO: Record<string, string> = {
  ACTION_REQUIRED: "Esperando resolución",
  AUTHORIZATION_AMOUNT_NOT_APPLIED:
    "El proveedor no aplicó el importe nuevo a la autorización",
  AUTHORIZATION_NOT_ACTIVE: "La autorización recurrente no está viva",
  AUTHORIZATION_MISSING: "No hay autorización recurrente que mirar",
  RENEWAL_DURING_UPGRADE: "El proveedor cobró una renovación en mitad del cambio",
  PAYMENT_RECONCILIATION_MISMATCH: "El importe cobrado no cuadra con el presupuestado",
  ENVIRONMENT_MISMATCH: "El cobro no es de este entorno",
  FAILED_WITH_APPROVED_PAYMENT: "Se cobró y la liquidación lo rechazó",
  PERIOD_ENDED_AFTER_PAYMENT: "El periodo terminó después de cobrar",
};

const ESTADO: Record<string, string> = {
  compensation_required: "Requiere acción",
  failed: "Fallida con cobro dentro",
  submitted: "Enviada",
};

export function PaidUpgradeRecovery({ rows, canManage }: {
  rows: PendingUpgradeRow[];
  canManage: boolean;
}) {
  const [pendiente, empezar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);

  if (rows.length === 0) {
    return (
      <section className="rounded-md border border-hairline bg-surface p-4">
        <h2 className="text-sm font-semibold">Subidas de plan pendientes</h2>
        <p className="pt-1 text-sm text-ink-soft">
          No hay ninguna subida con un cobro sin resolver.
        </p>
      </section>
    );
  }

  const completar = (changeId: string) => empezar(async () => {
    setError(null); setHecho(null);
    const r = await completePaidUpgradeAction(changeId);
    setConfirmando(null);
    if (r.error) { setError(r.error); return; }
    setHecho("La subida quedó completada. El plan nuevo ya está activo y la "
      + "fecha de renovación no se movió.");
  });

  return (
    <section className="rounded-md border border-hairline bg-surface p-4">
      <h2 className="text-sm font-semibold">Subidas de plan pendientes</h2>
      <p className="pb-3 pt-1 text-sm text-ink-soft">
        Cobros recibidos cuya subida no llegó a completarse. Completar ejecuta la
        misma comprobación que habría hecho el sistema: si algo no cuadra, no se
        concede nada.
      </p>

      {error ? <ErrorAlert message={error} /> : null}
      {hecho ? <InfoAlert message={hecho} /> : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[46rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-hairline text-left">
              <th scope="col" className="py-2 pr-4 font-medium text-ink-soft">Empresa</th>
              <th scope="col" className="px-3 py-2 font-medium text-ink-soft">Cambio</th>
              <th scope="col" className="px-3 py-2 font-medium text-ink-soft">Importe</th>
              <th scope="col" className="px-3 py-2 font-medium text-ink-soft">Estado</th>
              <th scope="col" className="px-3 py-2 font-medium text-ink-soft">Qué pasa</th>
              <th scope="col" className="px-3 py-2 font-medium text-ink-soft">
                <span className="sr-only">Acción</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.changeId} className="border-b border-hairline/60 align-top">
                <th scope="row" className="py-3 pr-4 text-left font-normal text-ink">
                  {r.organizationName}
                  {/* El código canónico, para quien tiene que buscarlo en la
                      base. Es lo contrario de la pantalla del cliente. */}
                  <span className="block text-xs text-ink-soft">{r.changeId}</span>
                </th>
                <td className="px-3 py-3 text-ink">
                  {r.fromPlanCode} → {r.toPlanCode}
                  {r.renewalMode ? (
                    <span className="block text-xs text-ink-soft">{r.renewalMode}</span>
                  ) : null}
                </td>
                <td className="px-3 py-3 font-medium text-ink">
                  {money(r.totalAmount, r.currency)}
                </td>
                <td className="px-3 py-3 text-ink">
                  {ESTADO[r.status] ?? r.status}
                </td>
                <td className="px-3 py-3 text-ink-soft">
                  {r.compensationReason
                    ? MOTIVO[r.compensationReason] ?? r.compensationReason
                    : "—"}
                  {r.providerRecurringExpected !== null ? (
                    <span className="block text-xs">
                      Autorización: {r.providerRecurringObserved === null
                        ? "sin lectura"
                        : money(r.providerRecurringObserved, r.currency)}
                      {" · "}debería volver a{" "}
                      {money(r.providerRecurringExpected, r.currency)}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-3">
                  {!canManage ? (
                    <span className="text-xs text-ink-soft">Solo consulta</span>
                  ) : confirmando === r.changeId ? (
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-ink-soft">
                        ¿Completar la subida de {r.organizationName}?
                      </span>
                      <Button disabled={pendiente}
                              onClick={() => completar(r.changeId)}>
                        Sí, completar
                      </Button>
                      <Button variant="quiet" disabled={pendiente}
                              onClick={() => setConfirmando(null)}>
                        No
                      </Button>
                    </span>
                  ) : (
                    <Button variant="quiet" disabled={pendiente}
                            onClick={() => { setConfirmando(r.changeId);
                                             setError(null); setHecho(null); }}>
                      Completar upgrade pagado
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
