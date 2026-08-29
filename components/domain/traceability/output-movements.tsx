"use client";

import { useActionState, useState } from "react";
import {
  registerOutputMovementAction,
  correctOutputMovementAction,
  annulOutputMovementAction,
  type MovementActionState,
} from "@/server/actions/output-movements";
import {
  MOVEMENT_KIND_OPTIONS,
  MOVEMENT_KIND_HELP,
  MOVEMENT_KIND_LABEL,
  reasonIsRequired,
  resolveCount,
  describeDelta,
  stockStatement,
  MOVEMENT_ANNUL_NOTE,
  STOCK_INCONSISTENT_NOTE,
  type MovementKind,
} from "@/lib/domain/output-movements";
import { formatKg } from "@/lib/domain/inventory";
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
  countedQuantity: number | null;
  theoreticalAtCount: number | null;
};

export type StockSummary = {
  producedKg: number;
  reprocessedKg: number;
  dispatchedKg: number;
  lostKg: number;
  internalUseKg: number;
  adjustmentKg: number;
  availableKg: number;
  physicalMaxKg: number;
  isInconsistent: boolean;
  movementsCount: number;
};

/**
 * PT-02B / PT-02B.1 · Movimientos de un lote producido.
 *
 * SE LLAMA «MOVIMIENTOS» Y NO «SALIDAS FÍSICAS»
 *
 * Porque un ajuste por recuento puede sumar y una corrección puede revertir.
 * Llamar «salida» a un movimiento que suma es incorrecto en el propio modelo,
 * y ese nombre lo era ya, no en un futuro hipotético.
 *
 * NO SE PREGUNTA EL SENTIDO
 *
 * Despachar, usar internamente y perder restan siempre. Preguntarlo era pedir
 * un dato que el dominio conoce, en un selector que además estaba
 * deshabilitado en tres de los cuatro tipos.
 *
 * EL RECUENTO PIDE LO QUE SE CONTÓ
 *
 * No «cuánto ajustar». La diferencia se deriva y se enseña antes de confirmar,
 * y se guardan las dos cifras: lo que había que encontrar y lo que se
 * encontró. Guardar solo la diferencia tiraba el hecho medido.
 *
 * Y CORREGIR NO ES EDITAR; ANULAR NO ES BORRAR
 *
 * Las dos INSERTAN una fila correctiva; el original se queda marcado como no
 * vigente. Anular es corregir a cero.
 */
export function OutputBatchMovements({
  outputBatchId,
  stock,
  movements,
  canRegister,
}: {
  outputBatchId: string;
  stock: StockSummary;
  movements: MovementRow[];
  canRegister: boolean;
}) {
  const [regState, registrar, registrando] = useActionState(registerOutputMovementAction, initial);
  const [corrState, corregir, corrigiendo] = useActionState(correctOutputMovementAction, initial);
  const [anulState, anular, anulando] = useActionState(annulOutputMovementAction, initial);
  const [kind, setKind] = useState<MovementKind>("dispatch");
  const [contado, setContado] = useState("");
  const [corrigiendoId, setCorrigiendoId] = useState<string | null>(null);
  const [anulandoId, setAnulandoId] = useState<string | null>(null);

  const vigentes = movements.filter((m) => m.isCurrent);
  const corregidos = movements.filter((m) => !m.isCurrent);

  // La previsualización del recuento, con la misma función que usa el
  // servidor: si la persona ve un número aquí y otro al confirmar, deja de
  // creerse los dos.
  const contadoNum = Number(contado.replace(",", "."));
  const preview =
    kind === "adjustment" && contado.trim() !== ""
      ? resolveCount({
          counted: contadoNum,
          theoretical: stock.availableKg,
          physicalMax: stock.physicalMaxKg,
        })
      : null;

  return (
    <section className="space-y-3 rounded-lg border border-hairline bg-surface p-5">
      <div>
        <h3 className="text-sm font-semibold">Movimientos del lote</h3>
        <p className="text-xs text-ink-soft">{stockStatement(stock.availableKg, stock.movementsCount)}</p>
      </div>

      {/* La aritmética visible tiene que cuadrar con la de la base. Antes la
          línea omitía los ajustes y la resta no salía. */}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md border border-hairline bg-paper px-3 py-2 text-xs sm:grid-cols-4">
        <div><dt className="text-ink-soft">Producido</dt><dd className="code">{formatKg(stock.producedKg)}</dd></div>
        <div><dt className="text-ink-soft">Reproceso</dt><dd className="code">− {formatKg(stock.reprocessedKg)}</dd></div>
        <div><dt className="text-ink-soft">Despachos</dt><dd className="code">− {formatKg(stock.dispatchedKg)}</dd></div>
        <div><dt className="text-ink-soft">Uso interno</dt><dd className="code">− {formatKg(stock.internalUseKg)}</dd></div>
        <div><dt className="text-ink-soft">Merma</dt><dd className="code">− {formatKg(stock.lostKg)}</dd></div>
        <div>
          <dt className="text-ink-soft">Ajustes</dt>
          <dd className="code">{stock.adjustmentKg >= 0 ? "+ " : "− "}{formatKg(Math.abs(stock.adjustmentKg))}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-ink-soft">Disponible</dt>
          <dd className={`code font-semibold ${stock.isInconsistent ? "text-danger" : "text-loop-deep"}`}>
            {formatKg(stock.availableKg)}
          </dd>
        </div>
      </dl>

      {stock.isInconsistent ? (
        <p role="alert" className="rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-xs text-danger">
          {STOCK_INCONSISTENT_NOTE}
        </p>
      ) : null}

      <ErrorAlert message={regState.error ?? corrState.error ?? anulState.error} />
      <SuccessAlert message={regState.success ?? corrState.success ?? anulState.success ?? null} />

      {canRegister ? (
        <form action={registrar} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="output_batch_id" value={outputBatchId} />
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Tipo de movimiento</span>
            <select
              name="movement_kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as MovementKind)}
              className="w-full rounded-md border border-hairline bg-paper px-3 py-2"
            >
              {MOVEMENT_KIND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-ink-soft">{MOVEMENT_KIND_HELP[kind]}</span>
          </label>

          {kind === "adjustment" ? (
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Cantidad contada físicamente (kg)</span>
              <input
                name="counted_quantity"
                inputMode="decimal"
                required
                value={contado}
                onChange={(e) => setContado(e.target.value)}
                className="w-full rounded-md border border-hairline bg-paper px-3 py-2"
              />
              <span className="mt-1 block text-xs text-ink-soft">
                Escribe lo que encontraste. La diferencia se calcula sola.
              </span>
            </label>
          ) : (
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Cantidad (kg)</span>
              <input
                name="quantity"
                inputMode="decimal"
                required
                className="w-full rounded-md border border-hairline bg-paper px-3 py-2"
              />
              <span className="mt-1 block text-xs text-ink-soft">
                Este movimiento resta del saldo: disponible {formatKg(stock.availableKg)}.
              </span>
            </label>
          )}

          {/* El recuento se enseña ANTES de confirmar. Un ajuste que la
              persona no ha podido comprobar es un ajuste que se firma a
              ciegas. */}
          {kind === "adjustment" ? (
            <div className="rounded-md border border-hairline bg-paper px-3 py-2 text-xs sm:col-span-2">
              <p>
                Saldo teórico: <span className="code">{formatKg(stock.availableKg)}</span> ·{" "}
                Cantidad contada:{" "}
                <span className="code">{contado.trim() === "" ? "—" : formatKg(contadoNum || 0)}</span> ·{" "}
                Ajuste derivado:{" "}
                <span className="code font-semibold">
                  {preview === null ? "—" : preview.ok ? `${preview.delta > 0 ? "+" : ""}${preview.delta} kg` : "—"}
                </span>
              </p>
              {preview !== null ? (
                <p className={`mt-1 ${preview.ok ? "text-ink-soft" : "text-danger"}`}>
                  {preview.ok ? describeDelta(preview.delta) : preview.error}
                </p>
              ) : (
                <p className="mt-1 text-ink-soft">
                  Como mucho puede haber {formatKg(stock.physicalMaxKg)} de este lote.
                </p>
              )}
            </div>
          ) : null}

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

          <label className="block text-sm">
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
          Tu rol no permite registrar movimientos de este lote.
        </p>
      )}

      {vigentes.length > 0 ? (
        <div className="overflow-x-auto rounded-md border border-hairline">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs text-ink-soft">
                <th className="px-3 py-2 font-medium">Cuándo</th>
                <th className="px-3 py-2 font-medium">Tipo</th>
                <th className="px-3 py-2 text-right font-medium">Efecto</th>
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
                        {m.quantity === 0 ? "anulado" : "corrección"}
                      </span>
                    ) : null}
                    {m.countedQuantity !== null ? (
                      <span className="block text-[10px] text-ink-soft">
                        contado {m.countedQuantity} kg sobre {m.theoreticalAtCount} kg del sistema
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {m.quantity === 0 ? "sin efecto" : `${m.direction === "in" ? "+" : "−"}${m.quantity} kg`}
                  </td>
                  <td className="px-3 py-2 text-xs text-ink-soft">
                    {[m.reason, m.reference].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-xs">
                    {canRegister && m.quantity > 0 ? (
                      <span className="inline-flex gap-2">
                        <button type="button" onClick={() => { setCorrigiendoId(m.id); setAnulandoId(null); }}
                          className="text-loop hover:underline">
                          Corregir
                        </button>
                        <button type="button" onClick={() => { setAnulandoId(m.id); setCorrigiendoId(null); }}
                          className="text-danger hover:underline">
                          Anular
                        </button>
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {corrigiendoId ? (() => {
        const orig = vigentes.find((m) => m.id === corrigiendoId);
        return (
          <form action={corregir} className="space-y-2 rounded-md border border-loop/30 bg-loop/5 p-3">
            <input type="hidden" name="movement_id" value={corrigiendoId} />
            <p className="text-xs text-ink-soft">
              Corregir <strong>no edita</strong> el movimiento: registra uno nuevo y
              conserva el original marcado como no vigente.
            </p>
            {orig ? (
              <p className="text-xs">
                Valor anterior:{" "}
                <span className="code">{orig.direction === "in" ? "+" : "−"}{orig.quantity} kg</span>
              </p>
            ) : null}
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
        );
      })() : null}

      {anulandoId ? (() => {
        const orig = vigentes.find((m) => m.id === anulandoId);
        return (
          <form action={anular} className="space-y-2 rounded-md border border-danger/30 bg-danger/5 p-3">
            <input type="hidden" name="movement_id" value={anulandoId} />
            <p className="text-xs">
              Se anula{" "}
              {orig ? (
                <span className="code">
                  {MOVEMENT_KIND_LABEL[orig.kind as MovementKind] ?? orig.kind}{" "}
                  {orig.direction === "in" ? "+" : "−"}{orig.quantity} kg
                </span>
              ) : "el movimiento"}
              . {MOVEMENT_ANNUL_NOTE}
            </p>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Motivo de la anulación</span>
              <input name="correction_reason" required
                className="w-full rounded-md border border-hairline bg-paper px-3 py-2" />
            </label>
            <div className="flex gap-2">
              <Button type="submit" disabled={anulando} className="!w-auto">
                {anulando ? "Anulando…" : "Anular movimiento"}
              </Button>
              <button type="button" onClick={() => setAnulandoId(null)}
                className="text-sm text-ink-soft hover:underline">
                Cancelar
              </button>
            </div>
          </form>
        );
      })() : null}

      {corregidos.length > 0 ? (
        <details className="text-xs text-ink-soft">
          <summary className="cursor-pointer">
            {corregidos.length} movimiento(s) corregido(s) o anulado(s) — se conservan
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

      {/* No hay botón de borrar, y no es un olvido: la base lo bloquea por dos
          caminos y ofrecerlo sería mentir sobre lo que la persona puede
          hacer. Lo que sí hay es «Anular», que es corregir a cero. */}
    </section>
  );
}
