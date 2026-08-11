"use client";

import { useMemo, useState } from "react";
import {
  parseProcessVariables,
  type ProcessVariableRow,
} from "@/lib/domain/process-variables";

/**
 * Trazaloop · Sprint PCR-01 (punto 13) · Editor humano de variables de
 * proceso. El usuario industrial NUNCA escribe JSON: gestiona filas
 * Variable / Valor / Unidad; el componente serializa a un campo oculto
 * (`process_variables_rows`) que la server action valida y convierte al
 * formato canónico JSONB. El JSON legado se parsea defensivamente
 * (lib/domain/process-variables.ts); si una estructura heredada no puede
 * representarse como filas SIN pérdida, se conserva intacta salvo que el
 * usuario decida reemplazarla.
 */
export function ProcessVariablesEditor({ initialValue }: { initialValue: unknown }) {
  const parsed = useMemo(() => parseProcessVariables(initialValue), [initialValue]);
  const [rows, setRows] = useState<ProcessVariableRow[]>(parsed.rows);
  const [replaceLegacy, setReplaceLegacy] = useState(parsed.unparsedRaw === null);

  const update = (index: number, patch: Partial<ProcessVariableRow>) =>
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const remove = (index: number) => setRows((prev) => prev.filter((_, i) => i !== index));
  const add = () => setRows((prev) => [...prev, { name: "", value: "", unit: "" }]);

  const keepLegacy = parsed.unparsedRaw !== null && !replaceLegacy;

  return (
    <div className="space-y-2 sm:col-span-2">
      <span className="block text-sm font-medium text-ink">Variables de proceso (opcional)</span>

      {parsed.unparsedRaw !== null ? (
        <div className="rounded-md border border-amber/40 bg-amber/10 px-3 py-2 text-xs text-amber">
          <p>
            Esta orden tiene variables registradas en un formato heredado que
            no puede editarse como tabla. Se conservarán tal cual al guardar.
          </p>
          <label className="mt-1.5 flex items-center gap-2 font-medium">
            <input
              type="checkbox"
              checked={replaceLegacy}
              onChange={(e) => setReplaceLegacy(e.target.checked)}
              className="h-4 w-4 accent-[var(--amber)]"
            />
            Reemplazar las variables heredadas por las de la tabla
          </label>
        </div>
      ) : null}

      {/* Lo que viaja al servidor: filas del editor o passthrough legado. */}
      <input type="hidden" name="process_variables_rows" value={JSON.stringify(rows)} readOnly />
      <input type="hidden" name="process_variables_keep_legacy" value={keepLegacy ? "1" : ""} readOnly />

      {rows.length === 0 && !keepLegacy ? (
        <p className="text-xs text-ink-soft">
          Sin variables registradas. Agrega temperatura, velocidad, presión u
          otras condiciones del proceso.
        </p>
      ) : null}

      {rows.length > 0 ? (
        <div className="overflow-x-auto rounded-md border border-hairline">
          <table className="w-full min-w-96 text-sm">
            <thead>
              <tr className="border-b border-hairline bg-paper text-left text-xs text-ink-soft">
                <th className="px-2.5 py-1.5 font-medium">Variable</th>
                <th className="px-2.5 py-1.5 font-medium">Valor</th>
                <th className="px-2.5 py-1.5 font-medium">Unidad</th>
                <th className="px-2.5 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-hairline last:border-0">
                  <td className="px-1.5 py-1">
                    <input
                      value={row.name}
                      onChange={(e) => update(i, { name: e.target.value })}
                      placeholder="Temperatura"
                      maxLength={120}
                      aria-label={`Nombre de la variable ${i + 1}`}
                      className="block w-full rounded-md border border-hairline bg-surface px-2 py-1.5 text-sm focus:border-loop"
                    />
                  </td>
                  <td className="px-1.5 py-1">
                    <input
                      value={row.value}
                      onChange={(e) => update(i, { value: e.target.value })}
                      placeholder="185"
                      maxLength={120}
                      aria-label={`Valor de la variable ${i + 1}`}
                      className="block w-28 rounded-md border border-hairline bg-surface px-2 py-1.5 text-right text-sm focus:border-loop"
                    />
                  </td>
                  <td className="px-1.5 py-1">
                    <input
                      value={row.unit}
                      onChange={(e) => update(i, { unit: e.target.value })}
                      placeholder="°C"
                      maxLength={40}
                      aria-label={`Unidad de la variable ${i + 1}`}
                      className="block w-20 rounded-md border border-hairline bg-surface px-2 py-1.5 text-sm focus:border-loop"
                    />
                  </td>
                  <td className="px-1.5 py-1 text-right">
                    <button
                      type="button"
                      onClick={() => remove(i)}
                      className="text-xs text-danger hover:underline"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <button
        type="button"
        onClick={add}
        disabled={keepLegacy}
        className="text-sm font-medium text-loop hover:underline disabled:opacity-50"
      >
        + Agregar variable
      </button>
      {keepLegacy ? (
        <p className="text-xs text-ink-soft">
          Para editar como tabla, marca &ldquo;Reemplazar las variables heredadas&rdquo;.
        </p>
      ) : null}
    </div>
  );
}
