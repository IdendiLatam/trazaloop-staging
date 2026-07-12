"use client";

import { useState, useTransition } from "react";
import {
  exportCalculationDossierJsonAction,
  exportEvidenceMatrixCsvAction,
} from "@/server/actions/audit-support";

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const buttonClass =
  "rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm font-medium hover:border-loop disabled:opacity-60";

export function ExportDossierJsonButton({ calculationId }: { calculationId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={pending}
        className={buttonClass}
        onClick={() =>
          start(async () => {
            setError(null);
            const result = await exportCalculationDossierJsonAction(calculationId);
            if (result.error || !result.data) setError(result.error ?? "No fue posible exportar.");
            else
              download(
                result.data.filename,
                JSON.stringify(result.data.payload, null, 2),
                "application/json"
              );
          })
        }
      >
        {pending ? "Exportando…" : "Exportar JSON"}
      </button>
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </span>
  );
}

export function ExportMatrixCsvButton({
  outputBatchId,
  calculationId,
}: {
  outputBatchId: string;
  calculationId?: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={pending}
        className={buttonClass}
        onClick={() =>
          start(async () => {
            setError(null);
            const result = await exportEvidenceMatrixCsvAction(outputBatchId, calculationId);
            if (result.error || !result.data) setError(result.error ?? "No fue posible exportar.");
            else download(result.data.filename, result.data.csv, "text/csv;charset=utf-8");
          })
        }
      >
        {pending ? "Exportando…" : "Exportar matriz CSV"}
      </button>
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </span>
  );
}
