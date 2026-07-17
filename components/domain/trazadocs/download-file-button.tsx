"use client";

import { useState, useTransition } from "react";
import { downloadFileDocumentAction } from "@/server/actions/trazadocs-master";

/** Botón compacto de descarga (Parte 14) — URL firmada, se abre en una
 *  pestaña nueva; nunca se guarda la URL, se genera cada vez. */
export function DownloadFileButton({ documentId }: { documentId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <button
        type="button"
        disabled={pending}
        className="text-loop hover:underline disabled:opacity-60"
        onClick={() =>
          start(async () => {
            setError(null);
            const result = await downloadFileDocumentAction(documentId);
            if (result.error || !result.url) {
              setError(result.error ?? "No fue posible descargar.");
              return;
            }
            window.open(result.url, "_blank", "noopener,noreferrer");
          })
        }
      >
        {pending ? "Generando enlace…" : "Descargar"}
      </button>
      {error ? <span className="text-[11px] text-danger">{error}</span> : null}
    </span>
  );
}
