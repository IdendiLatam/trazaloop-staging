"use client";

import { useState, useTransition } from "react";
import { exportDocumentMasterCsvAction, type MasterFilters } from "@/server/actions/trazadocs-master";

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Exportar el maestro documental a CSV (Parte 15) — mismo patrón que
 *  ExportMatrixCsvButton (Sprint 6, components/domain/audit-support). */
export function ExportMasterCsvButton({ filters }: { filters?: MasterFilters }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={pending}
        className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm font-medium hover:border-loop disabled:opacity-60"
        onClick={() =>
          start(async () => {
            setError(null);
            const result = await exportDocumentMasterCsvAction(filters);
            if (result.error) setError(result.error);
            else download(result.filename, result.csv, "text/csv;charset=utf-8");
          })
        }
      >
        {pending ? "Exportando…" : "Exportar CSV"}
      </button>
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </span>
  );
}
