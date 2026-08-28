"use client";

import { useActionState, useState } from "react";
import {
  registerOutputMovementAction,
  correctOutputMovementAction,
  type MovementActionState,
} from "@/server/actions/output-movements";
import {
  MOVEMENT_KIND_OPTIONS,
  MOVEMENT_KIND_HELP,
  MOVEMENT_KIND_LABEL,
  kindAllowsIncoming,
  reasonIsRequired,
  stockStatement,
  type MovementKind,
} from "@/lib/domain/output-movements";
import { Button } from "@/components/ui/button";
import { ErrorAlert, SuccessAlert } from "@/components/ui/alert";

const initial: MovementActionState = { error: null };

export type MovementRow = {
  id: string;
  kind: string;
  direction: string;
  quantity: number;
  occurredAt: string;
  reason: string | null;
  reference: string | null;
  isCurrent: boolean;
  correctsMovementId: string | null;
  correctionReason: string | null;
};

/**
 * PT-02B · Salidas físicas de un lote producido.
 *
 * LO QUE ESTA PANTALLA NO ES
 *
 * No es un módulo de ventas. Cuatro tipos de movimiento, una cantidad, una
 * fecha y una referencia libre. Si algún día hace falta un cliente de verdad,
 * `quality_external_parties` ya existe y ese es el sitio — no una tabla nueva
 * de clientes colgando de aquí.
 *
 * Y CORREGIR NO ES EDITAR
 *
 * Un movimiento registrado no se borra ni se cambia: la corrección INSERTA
 * otro que apunta al original, y el original se queda marcado como no
 * vigente. Es el patrón que `quality_measurements` ya tenía probado.
 */
export function OutputBatchMovements({
  outputBatchId,
  availableKg,
  movementsCount,
  movements,
  canRegister,
}: {
  outputBatchId: string;
  availableKg: number;
  movementsCount: number;
  movements: MovementRow[];
  canRegister: boolean;
}) {
  const [regState, registrar, registrando] = useActionState(registerOutputMovementAction, initial);
  const [corrState, corregir, corrigiendo] = useActionState(correctOutputMovementAction, initial);
  const [kind, setKind] = useState<MovementKind>("dispatch");
  const [direction, setDirection] = useState("out");
  const [corrigiendoId, setCorrigiendoId] = useState<string | null>(null);

  const vigentes = movements.filter((m) => m.isCurrent);
  const corregidos = movements.filter((m) => !m.isCurrent);

  return (
    <section className="space-y-3 rounded-lg border border-hairline bg-surface p-5">
      <div>
        <h3 className="text-sm font-semibold">Salidas físicas del lote</h3>
        {/* La distinción que no se puede perder: «quedan 100 kg» y «nadie ha
            registrado ninguna salida» no son lo mismo aunque el número
            coincida. */}
        <p className="text-xs text-ink-soft">{stockStatement(availableKg, movementsCount)}</p>
      </div>

      <ErrorAlert message={regState.error ?? corrState.error} />
      <SuccessAlert message={regState.success ?? corrState.success ?? null} />

      {canRegister ? (
        <form action={registrar} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="output_batch_id" value={outputBatchId} />
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Tipo de movimiento</span>
            <select
              name="movement_kind"
              value={kind}
              onChange={(e) => {
                const k = e.target.value as MovementKind;
                setKind(k);
                if (!kindAllowsIncoming(k)) setDirection("out");
              }}
              className="w-full rounded-md border border-hairline bg-paper px-3 py-2"
            >
              {MOVEMENT_KIND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-ink-soft">{MOVEMENT_KIND_HELP[kind]}</span>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Cantidad (kg)</span>
            <input
              name="quantity"
              inputMode="decimal"
              required
              className="w-full rounded-md border border-hairline bg-paper px-3 py-2"
            />
            <span className="mt-1 block text-xs text-ink-soft">
              Siempre positiva: el sentido lo elige el campo de abajo.
            </span>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Sentido</span>
            <select
              name="direction"
              value={direction}
              onChange={(e) => setDirection(e.target.value)}
              disabled={!kindAllowsIncoming(kind)}
              className="w-full rounded-md border border-hairline bg-paper px-3 py-2 disabled:opacity-60"
            >
              <option value="out">Resta del saldo</option>
              <option value="in">Suma al saldo</option>
            </select>
            <span className="mt-1 block text-xs text-ink-soft">
              {kindAllowsIncoming(kind)
                ? "Un ajuste por recuento puede sumar o restar."
                : "Solo un ajuste por recuento puede sumar."}
            </span>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Cuándo ocurrió</span>
            <input
              name="occurred_at"
              type="date"
              className="w-full rounded-md border border-hairline bg-paper px-3 py-2"
            />
            <span className="mt-1 block text-xs text-ink-soft">
              La fecha del hecho, no la de hoy. Si se deja vacía, se usa ahora.
            </span>
          </label>

          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">
              Motivo {reasonIsRequired(kind) ? "" : "(opcional)"}
            </span>
            <input
              name="reason"
              required={reasonIsRequired(kind)}
              className="w-full rounded-md border border-hairline bg-paper px-3 py-2"
            />
          </label>

          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">Referencia (opcional)</span>
            <input
              name="reference"
              placeholder="Número de remisión, pedido, guía…"
              className="w-full rounded-md border border-hairline bg-paper px-3 py-2"
            />
          </label>

          <div className="sm:col-span-2">
            <Button type="submit" disabled={registrando} className="!w-auto">
              {registrando ? "Registrando…" : "Registrar movimiento"}
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-xs text-ink-soft">
          Tu rol no permite registrar movimientos de salida.
        </p>
      )}

      {vigentes.length > 0 ? (
        <div className="overflow-x-auto rounded-md border border-hairline">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs text-ink-soft">
                <th className="px-3 py-2 font-medium">Cuándo</th>
                <th className="px-3 py-2 font-medium">Tipo</th>
                <th className="px-3 py-2 text-right font-medium">Cantidad</th>
                <th className="px-3 py-2 font-medium">Motivo / referencia</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {vigentes.map((m) => (
                <tr key={m.id} className="border-b border-hairline last:border-0 align-top">
                  <td className="px-3 py-2 text-xs">
                    {new Date(m.occurredAt).toLocaleDateString("es-CO")}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {MOVEMENT_KIND_LABEL[m.kind as MovementKind] ?? m.kind}
                    {m.correctsMovementId ? (
                      <span className="ml-1 rounded border border-hairline px-1 text-[10px] text-ink-soft">
                        corrección
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {m.direction === "in" ? "+" : "−"}
                    {m.quantity} kg
                  </td>
                  <td className="px-3 py-2 text-xs text-ink-soft">
                    {[m.reason, m.reference].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-xs">
                    {canRegister ? (
                      <button
                        type="button"
                        onClick={() => setCorrigiendoId(m.id)}
                        className="text-loop hover:underline"
                      >
                        Corregir
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {corrigiendoId ? (
        <form action={corregir} className="space-y-2 rounded-md border border-loop/30 bg-loop/5 p-3">
          <input type="hidden" name="movement_id" value={corrigiendoId} />
          <p className="text-xs text-ink-soft">
            Corregir <strong>no edita</strong> el movimiento: registra uno nuevo y
            conserva el original marcado como no vigente.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Cantidad correcta (kg)</span>
              <input name="quantity" inputMode="decimal" required
                className="w-full rounded-md border border-hairline bg-paper px-3 py-2" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Motivo de la corrección</span>
              <input name="correction_reason" required
                className="w-full rounded-md border border-hairline bg-paper px-3 py-2" />
            </label>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={corrigiendo} className="!w-auto">
              {corrigiendo ? "Corrigiendo…" : "Registrar corrección"}
            </Button>
            <button type="button" onClick={() => setCorrigiendoId(null)}
              className="text-sm text-ink-soft hover:underline">
              Cancelar
            </button>
          </div>
        </form>
      ) : null}

      {corregidos.length > 0 ? (
        <details className="text-xs text-ink-soft">
          <summary className="cursor-pointer">
            {corregidos.length} movimiento(s) corregido(s) — se conservan
          </summary>
          <ul className="mt-2 space-y-1">
            {corregidos.map((m) => (
              <li key={m.id}>
                {new Date(m.occurredAt).toLocaleDateString("es-CO")} ·{" "}
                {MOVEMENT_KIND_LABEL[m.kind as MovementKind] ?? m.kind} ·{" "}
                {m.direction === "in" ? "+" : "−"}{m.quantity} kg
                {m.correctionReason ? ` · corregido: «${m.correctionReason}»` : ""}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {/* No hay botón de borrar, y no es un olvido: la base lo bloquea y
          ofrecerlo sería mentir sobre lo que la persona puede hacer. */}
    </section>
  );
}
