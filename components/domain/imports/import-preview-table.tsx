import type { RowValidationResult } from "@/lib/imports/types";

const STATUS_TONE: Record<RowValidationResult["status"], string> = {
  valid: "border-loop/30 bg-loop/5 text-loop-deep",
  warning: "border-amber/40 bg-amber/10 text-amber",
  error: "border-danger/30 bg-danger/5 text-danger",
};

const STATUS_LABEL: Record<RowValidationResult["status"], string> = {
  valid: "Válida",
  warning: "Advertencia",
  error: "Error",
};

/** Vista previa fila a fila (Parte 5, Parte 11). No escribe nada en base de
 *  datos: solo muestra lo que YA validó el servidor. */
export function ImportPreviewTable({ rows }: { rows: RowValidationResult[] }) {
  if (rows.length === 0) return null;
  const columns = Object.keys(rows[0].raw);

  return (
    <div className="overflow-x-auto rounded-lg border border-hairline bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-hairline text-left text-xs text-ink-soft">
            <th className="px-3 py-2 font-medium">Fila</th>
            <th className="px-3 py-2 font-medium">Estado</th>
            {columns.map((c) => (
              <th key={c} className="px-3 py-2 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.rowNumber} className="border-b border-hairline last:border-0 align-top">
              <td className="code px-3 py-2 text-xs text-ink-soft">{r.rowNumber}</td>
              <td className="px-3 py-2">
                <span
                  className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[r.status]}`}
                >
                  {STATUS_LABEL[r.status]}
                  {r.skipExisting ? " · se omite" : ""}
                </span>
              </td>
              {columns.map((c) => (
                <td key={c} className="px-3 py-2 text-xs">
                  {r.raw[c] || <span className="text-ink-soft">—</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
