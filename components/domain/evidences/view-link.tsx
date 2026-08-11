"use client";

import { useState, useTransition } from "react";
import { getEvidenceViewUrlAction } from "@/server/actions/evidences";
import type { LinkedEvidence } from "@/lib/db/evidences";

/**
 * Trazaloop · Sprint PCR-01 (puntos 1 y 11) · Ver evidencia + evidencias
 * vinculadas a un registro.
 *
 * La URL firmada se pide BAJO DEMANDA al hacer clic (server action con la
 * sesión real → RLS de Storage aplica) y se abre en una pestaña nueva.
 * Nunca se incrusta una URL firmada en el HTML: expiran y quedarían rotas.
 * No se descarga automáticamente: el navegador decide previsualizar/abrir.
 */
export function ViewEvidenceButton({
  evidenceId,
  label = "Ver evidencia",
  compact = false,
}: {
  evidenceId: string;
  label?: string;
  compact?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function open() {
    setError(null);
    // La pestaña se abre de forma síncrona (gesto del usuario) y luego se
    // navega a la URL firmada — evita bloqueadores de popups.
    const tab = window.open("about:blank", "_blank", "noopener");
    startTransition(async () => {
      const result = await getEvidenceViewUrlAction(evidenceId);
      if (result.url) {
        if (tab) tab.location.href = result.url;
        else window.open(result.url, "_blank", "noopener");
      } else {
        tab?.close();
        setError(result.error ?? "No fue posible abrir la evidencia.");
      }
    });
  }

  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        onClick={open}
        disabled={pending}
        className={`inline-flex items-center gap-1 text-loop hover:underline disabled:opacity-60 ${
          compact ? "text-xs" : "text-sm font-medium"
        }`}
      >
        <span aria-hidden="true">👁</span>
        {pending ? "Abriendo…" : label}
      </button>
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </span>
  );
}

const EVIDENCE_STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  valid: "Válida",
  rejected: "Rechazada",
  expired: "Vencida",
};

/**
 * Evidencias vinculadas a un registro (Registro → Evidencia). Si hay varias,
 * el encabezado "Evidencias (n)" las agrupa; cada una muestra nombre, tipo,
 * fecha y la acción Ver cuando tiene archivo.
 */
export function LinkedEvidenceList({ evidences }: { evidences: LinkedEvidence[] }) {
  if (evidences.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-ink">
        {evidences.length === 1 ? "Evidencia vinculada" : `Evidencias (${evidences.length})`}
      </p>
      <ul className="space-y-1">
        {evidences.map((e) => (
          <li
            key={`${e.evidence_id}-${e.link_role ?? ""}`}
            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md border border-hairline bg-paper px-2.5 py-1.5"
          >
            <span className="min-w-0 text-xs text-ink">
              <span className="font-medium">{e.name}</span>
              <span className="text-ink-soft">
                {[
                  e.evidence_type,
                  e.evidence_date,
                  EVIDENCE_STATUS_LABEL[e.status] ?? e.status,
                  e.link_role,
                ]
                  .filter(Boolean)
                  .map((part) => ` · ${part}`)
                  .join("")}
              </span>
            </span>
            {e.has_file ? (
              <ViewEvidenceButton evidenceId={e.evidence_id} compact />
            ) : (
              <span className="text-xs text-ink-soft">Sin archivo</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
