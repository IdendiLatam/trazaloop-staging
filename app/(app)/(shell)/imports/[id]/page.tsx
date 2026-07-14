// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { getImportJobDetailAction } from "@/server/actions/imports";

const STATUS_TONE: Record<string, string> = {
  valid: "border-loop/30 bg-loop/5 text-loop-deep",
  warning: "border-amber/40 bg-amber/10 text-amber",
  error: "border-danger/30 bg-danger/5 text-danger",
  imported: "border-loop/30 bg-loop/5 text-loop-deep",
  skipped: "border-hairline bg-paper text-ink-soft",
  pending: "border-hairline bg-paper text-ink-soft",
};

export default async function ImportJobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { data, error } = await getImportJobDetailAction(id);
  if (error || !data) notFound();

  const columns = data.rows.length > 0 ? Object.keys(data.rows[0].rawData) : [];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-1">
        <p className="eyebrow">
          <Link href="/imports" className="hover:underline">
            Importaciones
          </Link>{" "}
          · Detalle
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{data.job.filename ?? "Archivo sin nombre"}</h1>
        <p className="text-sm text-ink-soft">
          Entidad <span className="code">{data.job.entity}</span> · {data.job.totalRows} filas ·{" "}
          {data.job.insertedRows} creadas · {data.job.skippedRows} omitidas ·{" "}
          {new Date(data.job.createdAt).toLocaleString("es-CO")}
        </p>
      </header>

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
              <th className="px-3 py-2 font-medium">Errores / advertencias</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.id} className="border-b border-hairline last:border-0 align-top">
                <td className="code px-3 py-2 text-xs text-ink-soft">{r.rowNumber}</td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                      STATUS_TONE[r.status] ?? STATUS_TONE.pending
                    }`}
                  >
                    {r.status}
                  </span>
                </td>
                {columns.map((c) => (
                  <td key={c} className="px-3 py-2 text-xs">
                    {String(r.rawData[c] ?? "") || <span className="text-ink-soft">—</span>}
                  </td>
                ))}
                <td className="px-3 py-2 text-xs">
                  {r.errors.map((e, i) => (
                    <p key={`e-${i}`} className="text-danger">
                      ✘ {e.message}
                    </p>
                  ))}
                  {r.warnings.map((w, i) => (
                    <p key={`w-${i}`} className="text-amber">
                      ⚠ {w.message}
                    </p>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
