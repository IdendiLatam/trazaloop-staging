"use client";

import { useMemo, useState } from "react";
import type { RenewalOperationRow } from "@/lib/db/billing-operations";
import {
  describeOperationalState, FILTROS, type OperationalState,
} from "@/lib/domain/renewal-operations";
import { longDate } from "@/lib/domain/billing-display";

/**
 * Trazaloop · PE-05B5F · Las renovaciones, para quien las opera.
 *
 * SOLO SE MIRA. No hay ni un botón que mueva dinero, y no es un descuido:
 * reintentar un cobro a mano es una operación financiera con su propia
 * autoridad y su propio riesgo, y no se cuela dentro de una tabla de consulta
 * porque «ya que estamos». Cuando exista, existirá a propósito.
 *
 * Y aquí SÍ se enseña el código canónico junto a la frase legible: quien
 * investiga un cobro necesita poder buscarlo en la base. Es lo contrario de la
 * pantalla del cliente, y por eso son dos vocabularios distintos.
 */
export function RenewalOperations({ rows }: { rows: RenewalOperationRow[] | null }) {
  const [filtro, setFiltro] = useState<"todos" | OperationalState>("todos");
  const [busqueda, setBusqueda] = useState("");

  const conEstado = useMemo(
    () => (rows ?? []).map((r) => ({ row: r, estado: describeOperationalState(r) })),
    [rows]);

  const visibles = useMemo(() => conEstado.filter(({ row, estado }) => {
    if (filtro !== "todos" && estado.state !== filtro) return false;
    const q = busqueda.trim().toLowerCase();
    if (!q) return true;
    return (row.organizationName ?? "").toLowerCase().includes(q)
      || row.organizationId.startsWith(q) || row.planCode.includes(q);
  }), [conEstado, filtro, busqueda]);

  if (rows === null) {
    return (
      <p className="text-sm text-ink-soft">
        No pudimos leer el estado de las renovaciones. Vuelve a intentarlo en un momento.
      </p>
    );
  }

  const cuantos = (k: "todos" | OperationalState) =>
    k === "todos" ? conEstado.length
      : conEstado.filter(({ estado }) => estado.state === k).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {FILTROS.map((f) => (
          <button key={f.key} type="button" onClick={() => setFiltro(f.key)}
            className={"rounded-full border px-3 py-1 text-xs font-medium "
              + (filtro === f.key
                ? "border-loop bg-loop/5 text-loop-deep"
                : "border-hairline text-ink-soft hover:border-loop")}>
            {f.label} · {cuantos(f.key)}
          </button>
        ))}
        <input
          value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar empresa…"
          className="ml-auto w-56 rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm"
        />
      </div>

      {visibles.length === 0 ? (
        <p className="text-sm text-ink-soft">Nada que mirar con este filtro.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[64rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-hairline text-xs text-ink-soft">
                <th className="py-2 pr-3 font-medium">Empresa</th>
                <th className="py-2 pr-3 font-medium">Plan</th>
                <th className="py-2 pr-3 font-medium">Suscripción</th>
                <th className="py-2 pr-3 font-medium">Obligación</th>
                <th className="py-2 pr-3 font-medium">Cobro previsto</th>
                <th className="py-2 pr-3 font-medium">Fin de gracia</th>
                <th className="py-2 pr-3 font-medium">Situación</th>
                <th className="py-2 pr-3 font-medium">Último intento</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map(({ row, estado }) => (
                <tr key={row.subscriptionId}
                    className="border-b border-hairline/60 align-top">
                  <td className="py-2 pr-3">
                    <span className="font-medium">
                      {row.organizationName ?? row.organizationId.slice(0, 8)}
                    </span>
                    <span className="block font-mono text-[11px] text-ink-soft">
                      {row.organizationId.slice(0, 8)}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    {row.planCode} · {row.billingInterval === "annual" ? "anual" : "mensual"}
                  </td>
                  <td className="py-2 pr-3 font-mono text-[11px]">
                    {row.subscriptionStatus}
                  </td>
                  <td className="py-2 pr-3">
                    {row.periodSequence === null ? "—"
                      : `#${row.periodSequence} · ${row.periodStatus ?? "—"}`}
                  </td>
                  <td className="py-2 pr-3">{row.dueAt ? longDate(row.dueAt) : "—"}</td>
                  <td className="py-2 pr-3">{row.graceEnd ? longDate(row.graceEnd) : "—"}</td>
                  <td className="py-2 pr-3">
                    <span className={estado.urgent ? "font-medium text-loop-deep" : ""}>
                      {estado.label}
                    </span>
                    {/* El código canónico, detrás: quien investiga lo necesita. */}
                    <span className="block font-mono text-[11px] text-ink-soft">
                      {estado.code}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    {row.attemptId ? (
                      <>
                        <span className="font-mono text-[11px]">
                          {row.attemptStatus}
                          {row.failureClass ? ` · ${row.failureClass}` : ""}
                        </span>
                        <span className="block text-[11px] text-ink-soft">
                          {row.providerSubmittedAt
                            ? `enviado ${longDate(row.providerSubmittedAt)}`
                            : "sin enviar"}
                        </span>
                      </>
                    ) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
