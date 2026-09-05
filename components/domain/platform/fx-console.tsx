"use client";

import { useState, useTransition } from "react";
import {
  createFxRateAction, cancelScheduledFxRateAction, closeCurrentFxRateAction,
} from "@/server/actions/commercial-fx";
import type { FxRateRow } from "@/lib/db/commercial-fx";
import { longDate } from "@/lib/domain/billing-display";
import { Button } from "@/components/ui/button";
import { ErrorAlert, InfoAlert } from "@/components/ui/alert";

/**
 * Trazaloop · PE-05B6F · El tipo de cambio comercial.
 *
 * NO ES LA TASA DEL MERCADO, y la pantalla lo dice. Es una tasa administrativa
 * que la plataforma decide y fecha: el cliente tiene que ver el importe exacto
 * antes de pagar, y una API de divisas caída no puede impedir vender.
 *
 * Lo que rige, lo que va a regir y lo que rigió, cada uno con su nombre. Una
 * tasa vieja no es «inválida»: fue válida, y sigue explicando lo que se cobró
 * aquel día.
 */
const SITUACION: Record<string, string> = {
  vigente: "Vigente ahora",
  programada: "Programada",
  historica: "Histórica",
  retirada: "Retirada",
};

/** De micros a pesos por dólar, para leerlo. 4 000 000 000 → «4.000». */
const enPesos = (micros: number) =>
  (micros / 1_000_000).toLocaleString("es-CO", { maximumFractionDigits: 6 });

export function FxConsole({ rates, canManage }: {
  rates: FxRateRow[] | null;
  canManage: boolean;
}) {
  const [pendiente, empezar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [abriendo, setAbriendo] = useState(false);
  const [tasa, setTasa] = useState("");
  const [desde, setDesde] = useState("");
  const [nota, setNota] = useState("");
  const [cerrando, setCerrando] = useState(false);

  const lanzar = (fn: () => Promise<{ error: string | null }>, hecho: string) =>
    empezar(async () => {
      setError(null); setAviso(null);
      const r = await fn();
      if (r.error) setError(r.error);
      else { setAviso(hecho); setAbriendo(false); setCerrando(false);
             setTasa(""); setDesde(""); setNota(""); }
    });

  const guardar = () => {
    const valor = Number(tasa.replace(",", "."));
    if (!Number.isFinite(valor) || valor <= 0) {
      setError("Escribe cuántos pesos vale un dólar."); return;
    }
    // De pesos por dólar a micros, redondeando aquí una sola vez: la autoridad
    // del importe sigue siendo la base, que trabaja en enteros.
    const micros = Math.round(valor * 1_000_000);
    lanzar(() => createFxRateAction({
      rateMicros: micros,
      effectiveFrom: new Date(desde).toISOString(),
      note: nota.trim() || null,
    }), "Tipo de cambio guardado.");
  };

  if (rates === null) {
    return (
      <p className="text-sm text-ink-soft">
        No pudimos leer los tipos de cambio. Vuelve a intentarlo en un momento.
      </p>
    );
  }

  const vigente = rates.find((r) => r.situation === "vigente");
  const programadas = rates.filter((r) => r.situation === "programada");

  return (
    <div className="space-y-4">
      {error ? <ErrorAlert message={error} /> : null}
      {aviso ? <InfoAlert message={aviso} /> : null}

      <div className="rounded-md border border-hairline bg-canvas p-3 text-sm">
        {vigente ? (
          <p>
            Ahora mismo rige <strong>1 USD = {enPesos(vigente.rateMicros)} COP</strong>,
            desde el {longDate(vigente.effectiveFrom)}.
          </p>
        ) : (
          <p className="text-ink-soft">
            <strong>No hay ninguna tasa rigiendo.</strong> Sin ella no se pueden
            fijar precios nuevos: contratar, cambiar de plan y subir de plan
            fallan cerrado. Las renovaciones en curso siguen cobrándose, porque
            su importe ya estaba congelado.
          </p>
        )}
        {programadas.length > 0 ? (
          <p className="pt-1 text-ink-soft">
            Programada: 1 USD = {enPesos(programadas[0].rateMicros)} COP desde el{" "}
            {longDate(programadas[0].effectiveFrom)}.
          </p>
        ) : null}
      </div>

      {canManage ? (
        <div className="space-y-3">
          {!abriendo && !cerrando ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => setAbriendo(true)}>
                Fijar un tipo de cambio
              </Button>
              {vigente ? (
                <Button type="button" onClick={() => setCerrando(true)}>
                  Cerrar la vigencia actual
                </Button>
              ) : null}
            </div>
          ) : null}

          {abriendo ? (
            <div className="space-y-3 rounded-md border border-hairline bg-canvas p-3">
              <p className="text-sm text-ink-soft">
                Es una tasa <strong>comercial</strong>, decidida por la plataforma.
                No se consulta a ninguna API de divisas. Al guardarla, la vigencia
                anterior se cierra justo donde empieza esta: ni solape, ni hueco.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="text-ink-soft">Pesos por dólar</span>
                  <input value={tasa} onChange={(e) => setTasa(e.target.value)}
                    inputMode="decimal" placeholder="4000"
                    className="mt-1 w-full rounded-md border border-hairline bg-surface p-2" />
                </label>
                <label className="block text-sm">
                  <span className="text-ink-soft">Rige desde</span>
                  <input value={desde} onChange={(e) => setDesde(e.target.value)}
                    type="datetime-local"
                    className="mt-1 w-full rounded-md border border-hairline bg-surface p-2" />
                </label>
              </div>
              <label className="block text-sm">
                <span className="text-ink-soft">Nota o referencia (opcional)</span>
                <input value={nota} onChange={(e) => setNota(e.target.value)}
                  className="mt-1 w-full rounded-md border border-hairline bg-surface p-2" />
              </label>
              <p className="text-sm text-ink-soft">
                Fijar una tasa nueva <strong>no cambia</strong> ningún importe ya
                acordado: ni suscripciones, ni presupuestos, ni cobros, ni cambios
                de plan ya programados. Solo se usa para precios nuevos.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" disabled={pendiente} onClick={guardar}>
                  {pendiente ? "Guardando…" : "Guardar"}
                </Button>
                <Button type="button" onClick={() => setAbriendo(false)}>Volver</Button>
              </div>
            </div>
          ) : null}

          {cerrando ? (
            <div className="space-y-3 rounded-md border border-hairline bg-canvas p-3">
              <p className="text-sm">
                A partir de ahora no se podrán fijar precios nuevos: contratar,
                cambiar de plan y subir de plan fallarán hasta que haya otra tasa.
                Las renovaciones en curso <strong>siguen cobrándose</strong>, porque
                su importe ya estaba congelado.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" disabled={pendiente}
                  onClick={() => lanzar(closeCurrentFxRateAction, "Vigencia cerrada.")}>
                  {pendiente ? "Cerrando…" : "Cerrar la vigencia"}
                </Button>
                <Button type="button" onClick={() => setCerrando(false)}>Volver</Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[42rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-hairline text-xs text-ink-soft">
              <th className="py-2 pr-3 font-medium">Situación</th>
              <th className="py-2 pr-3 font-medium">1 USD en COP</th>
              <th className="py-2 pr-3 font-medium">Desde</th>
              <th className="py-2 pr-3 font-medium">Hasta</th>
              <th className="py-2 pr-3 font-medium">Nota</th>
              <th className="py-2 pr-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {rates.map((r) => (
              <tr key={r.id} className="border-b border-hairline/60">
                <td className="py-2 pr-3">{SITUACION[r.situation] ?? r.situation}</td>
                <td className="py-2 pr-3 font-medium">{enPesos(r.rateMicros)}</td>
                <td className="py-2 pr-3">{longDate(r.effectiveFrom)}</td>
                <td className="py-2 pr-3">
                  {r.effectiveTo ? longDate(r.effectiveTo) : "—"}
                </td>
                <td className="py-2 pr-3 text-ink-soft">{r.note ?? "—"}</td>
                <td className="py-2 pr-3">
                  {canManage && r.situation === "programada" ? (
                    <Button type="button" disabled={pendiente}
                      onClick={() => lanzar(() => cancelScheduledFxRateAction(r.id),
                        "Tasa programada retirada.")}>
                      Retirar
                    </Button>
                  ) : r.usedForPricing ? (
                    <span className="text-xs text-ink-soft">Ya fijó precios</span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rates.length === 0 ? (
        <p className="text-sm text-ink-soft">Todavía no hay ningún tipo de cambio.</p>
      ) : null}
    </div>
  );
}
