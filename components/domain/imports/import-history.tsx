import Link from "next/link";
import type { ImportJobSummary } from "@/server/actions/imports";

const STATUS_TONE: Record<ImportJobSummary["status"], string> = {
  validated: "border-hairline bg-paper text-ink-soft",
  committed: "border-loop/30 bg-loop/5 text-loop-deep",
  failed: "border-danger/30 bg-danger/5 text-danger",
};

const STATUS_LABEL: Record<ImportJobSummary["status"], string> = {
  validated: "Validada (sin confirmar)",
  committed: "Confirmada",
  failed: "Fallida",
};

/** Historial de importaciones (Parte 1, sección 5). Cada evento
 *  (validación o confirmación) queda como una fila propia e inmutable —
 *  mismo patrón que import_jobs desde el Sprint 2. */
export function ImportHistory({ jobs }: { jobs: ImportJobSummary[] }) {
  if (jobs.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-hairline bg-surface px-4 py-6 text-center text-sm text-ink-soft">
        Aún no hay importaciones registradas. Descarga una plantilla, complétala con datos reales
        y súbela para validar.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-hairline bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-hairline text-left text-xs text-ink-soft">
            <th className="px-4 py-2 font-medium">Archivo</th>
            <th className="px-4 py-2 font-medium">Entidad</th>
            <th className="px-4 py-2 font-medium">Filas</th>
            <th className="px-4 py-2 font-medium">Creadas</th>
            <th className="px-4 py-2 font-medium">Omitidas</th>
            <th className="px-4 py-2 font-medium">Estado</th>
            <th className="px-4 py-2 font-medium">Fecha</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => (
            <tr key={j.id} className="border-b border-hairline last:border-0">
              <td className="px-4 py-2 text-xs">{j.filename ?? "—"}</td>
              <td className="code px-4 py-2 text-xs">{j.entity}</td>
              <td className="code px-4 py-2 text-xs">{j.totalRows}</td>
              <td className="code px-4 py-2 text-xs">{j.insertedRows}</td>
              <td className="code px-4 py-2 text-xs">{j.skippedRows}</td>
              <td className="px-4 py-2">
                <span
                  className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[j.status]}`}
                >
                  {STATUS_LABEL[j.status]}
                </span>
              </td>
              <td className="px-4 py-2 text-xs text-ink-soft">
                {new Date(j.createdAt).toLocaleString("es-CO")}
              </td>
              <td className="px-4 py-2 text-right text-xs">
                <Link href={`/imports/${j.id}`} className="text-loop hover:underline">
                  Ver detalle
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
