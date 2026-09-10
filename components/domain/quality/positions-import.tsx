"use client";

import { useActionState, useState } from "react";
import {
  validatePositionsCsvAction, applyPositionsImportAction,
  downloadPositionsTemplateAction,
  type ImportPositionsState, type ApplyPositionsState,
} from "@/server/actions/quality-positions-import";

/**
 * Trazaloop · STABILIZATION-04 · Importar cargos desde una hoja de cálculo.
 *
 * DOS PASOS, Y EL PRIMERO NO ESCRIBE
 *
 * Validar enseña exactamente qué pasaría: cuántas filas están bien, cuáles no,
 * en qué línea está cada problema y qué jerarquía quedaría montada. Aplicar solo
 * se ofrece cuando no queda ni un error, porque una estructura a medias es peor
 * que ninguna: la aplicación es una transacción y o entra entera o no entra.
 *
 * SOBRE EL FORMATO. Se descarga una plantilla CSV que Excel, Google Sheets o
 * Numbers abren y guardan sin ceremonia, con BOM para que las tildes y la ñ no
 * se rompan. Al usuario no se le habla de formatos ni de limitaciones: se le
 * dice qué hacer.
 */
// Los estados iniciales viven AQUÍ, en el cliente. Un módulo `"use server"`
// solo puede exportar funciones asíncronas: sacar de allí una constante la
// convierte en una llamada de red para leer tres campos vacíos.
const VACIO: ImportPositionsState = {
  error: null, jobId: null, veredicto: null, nombreArchivo: null,
};
const APPLY_VACIO: ApplyPositionsState = { error: null, aplicados: 0, hecho: false };

export function PositionsImport() {
  const [previa, validar, validando] = useActionState(validatePositionsCsvAction, VACIO);
  const [resultado, aplicar, aplicando] = useActionState(applyPositionsImportAction, APPLY_VACIO);
  const [abierto, setAbierto] = useState(false);

  const v = previa.veredicto;
  const puedeAplicar = Boolean(previa.jobId) && v !== null && v.errores === 0 && !resultado.hecho;

  async function descargar() {
    const r = await downloadPositionsTemplateAction();
    if (r.error || !r.csv) return;
    const blob = new Blob([r.csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = r.filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="space-y-3 rounded-lg border border-hairline bg-surface p-4">
      <button
        type="button" onClick={() => setAbierto((x) => !x)}
        className="text-sm font-medium text-loop"
        aria-expanded={abierto}
      >
        Importar cargos
      </button>

      {!abierto ? null : (
        <div className="space-y-4">
          <p className="text-sm text-ink-soft">
            Descarga la plantilla, complétala en Excel o tu hoja de cálculo y vuelve a
            cargarla aquí. Cada fila es un cargo; para indicar de quién depende, escribe
            en <strong className="text-ink">cargo_superior</strong> el código de otra fila.
            El orden de las filas no importa.
          </p>

          <button
            type="button" onClick={descargar}
            className="rounded-md border border-hairline bg-canvas px-3 py-2 text-sm font-medium hover:border-loop"
          >
            Descargar plantilla
          </button>

          <form action={validar} className="flex flex-wrap items-end gap-2">
            <label className="text-sm">
              <span className="mb-1 block text-ink-soft">Archivo de cargos</span>
              <input type="file" name="file" accept=".csv,text/csv" required
                className="block text-sm" />
            </label>
            <button type="submit" disabled={validando}
              className="rounded-md border border-hairline bg-canvas px-3 py-2 text-sm font-medium hover:border-loop disabled:opacity-60">
              {validando ? "Revisando…" : "Validar"}
            </button>
          </form>

          {previa.error ? (
            <p role="alert" className="rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger">
              {previa.error}
            </p>
          ) : null}

          {v ? (
            <div className="space-y-3">
              <p className="text-sm">
                <strong>{v.total}</strong> filas · <strong className="text-loop">{v.validas}</strong> listas
                {v.errores > 0 ? <> · <strong className="text-danger">{v.errores}</strong> con error</> : null}
                {v.relaciones.length > 0
                  ? <> · <strong>{v.relaciones.length}</strong> relaciones de dependencia</>
                  : null}
              </p>

              {v.errores > 0 ? (
                <ul className="space-y-1 text-sm">
                  {v.filas.filter((f) => f.estado === "error").slice(0, 50).map((f) => (
                    <li key={f.fila} className="text-danger">
                      <span className="font-medium">Fila {f.fila}</span>
                      {f.nombre ? ` · ${f.nombre}` : ""} — {f.errores.join(" ")}
                    </li>
                  ))}
                </ul>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-ink-soft">
                    <tr><th className="py-1">Fila</th><th>Código</th><th>Cargo</th><th>Depende de</th></tr>
                  </thead>
                  <tbody>
                    {v.filas.slice(0, 100).map((f) => (
                      <tr key={f.fila} className="border-t border-hairline/60">
                        <td className="py-1 text-ink-soft">{f.fila}</td>
                        <td>{f.codigo}</td>
                        <td>{f.nombre}</td>
                        <td className="text-ink-soft">{f.superior || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {puedeAplicar ? (
                <form action={aplicar}>
                  <input type="hidden" name="import_job_id" value={previa.jobId ?? ""} />
                  <button type="submit" disabled={aplicando}
                    className="rounded-md bg-loop px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60">
                    {aplicando ? "Aplicando…" : `Crear ${v.validas} cargos`}
                  </button>
                </form>
              ) : v.errores > 0 ? (
                <p className="text-xs text-ink-soft">
                  Corrige las filas con error en tu hoja de cálculo y vuelve a validar.
                  No se creará ningún cargo mientras quede un error.
                </p>
              ) : null}
            </div>
          ) : null}

          {resultado.error ? (
            <p role="alert" className="rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger">
              {resultado.error}
            </p>
          ) : null}
          {resultado.hecho ? (
            <p role="status" className="rounded-md border border-loop/30 bg-loop/5 px-3 py-2 text-sm text-loop-deep">
              Se crearon {resultado.aplicados} cargos con su jerarquía.
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
