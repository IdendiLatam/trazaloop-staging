import type { RowValidationResult } from "@/lib/imports/types";

/** Errores y advertencias por fila (Parte 5, Parte 11). Los errores
 *  bloquean la confirmación; las advertencias no. */
export function ImportErrors({ rows }: { rows: RowValidationResult[] }) {
  const withIssues = rows.filter((r) => r.errors.length > 0 || r.warnings.length > 0);
  if (withIssues.length === 0) {
    return (
      <p className="rounded-md border border-loop/30 bg-loop/5 px-3 py-2 text-sm text-loop-deep">
        Sin errores ni advertencias: todas las filas están listas para importar.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-hairline rounded-lg border border-hairline bg-surface">
      {withIssues.map((r) => (
        <li key={r.rowNumber} className="px-4 py-3 text-sm">
          <p className="font-medium">Fila {r.rowNumber}</p>
          {r.errors.map((e, i) => (
            <p key={`e-${i}`} className="mt-1 text-xs text-danger">
              ✘ {e.field ? `${e.field}: ` : ""}
              {e.message}
            </p>
          ))}
          {r.warnings.map((w, i) => (
            <p key={`w-${i}`} className="mt-1 text-xs text-amber">
              ⚠ {w.field ? `${w.field}: ` : ""}
              {w.message}
            </p>
          ))}
        </li>
      ))}
    </ul>
  );
}
