"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ErrorAlert } from "@/components/ui/alert";
import {
  TEXTILE_EVIDENCE_STATUSES,
  TEXTILE_EVIDENCE_STATUS_LABEL,
} from "@/lib/domain/textiles-evidences";

/**
 * Trazaloop · Sprint T5 (Textil) · Revisión interna de evidencia y apertura
 * del archivo por signed URL. El panel de estado solo se renderiza para
 * roles revisores (la action y el guard SQL re-verifican siempre).
 */

type ActionResult = { error: string | null };

export function TextileEvidenceStatusPanel({
  evidenceId,
  currentStatus,
  statusAction,
}: {
  evidenceId: string;
  currentStatus: string;
  statusAction: (id: string, status: string, reviewNotes?: string) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState(currentStatus);
  const [notes, setNotes] = useState("");

  function apply() {
    setError(null);
    startTransition(async () => {
      const res = await statusAction(evidenceId, status, notes);
      if (res.error) {
        setError(res.error);
        return;
      }
      setNotes("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-hairline bg-surface p-4">
      <h2 className="text-sm font-semibold">Revisión interna</h2>
      <p className="text-xs text-ink-soft">
        Aceptar o rechazar es una decisión interna de la empresa sobre el soporte
        documental. No equivale a certificación externa.
      </p>
      <ErrorAlert message={error} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="font-medium">Nuevo estado</span>
          <select
            value={status}
            disabled={pending}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full rounded-md border border-hairline bg-paper px-3 py-1.5"
          >
            {TEXTILE_EVIDENCE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {TEXTILE_EVIDENCE_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Notas de revisión</span>
          <input
            type="text"
            value={notes}
            disabled={pending}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-md border border-hairline bg-paper px-3 py-1.5"
          />
        </label>
      </div>
      <button
        type="button"
        disabled={pending || status === currentStatus}
        onClick={apply}
        className="rounded-md border border-hairline bg-paper px-3 py-1.5 text-xs font-medium hover:border-loop disabled:opacity-50"
      >
        Aplicar estado
      </button>
    </div>
  );
}

export function TextileEvidenceOpenButton({
  evidenceId,
  fileName,
  urlAction,
}: {
  evidenceId: string;
  fileName: string | null;
  urlAction: (id: string) => Promise<{ url: string | null; error: string | null }>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <ErrorAlert message={error} />
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const res = await urlAction(evidenceId);
            if (res.error || !res.url) {
              setError(res.error ?? "No fue posible abrir el archivo.");
              return;
            }
            window.open(res.url, "_blank", "noopener,noreferrer");
          });
        }}
        className="rounded-md border border-loop/40 bg-loop/5 px-3 py-1.5 text-xs font-medium text-loop-deep hover:border-loop"
      >
        {pending ? "Generando enlace…" : `Abrir archivo${fileName ? ` (${fileName})` : ""}`}
      </button>
      <p className="text-[11px] text-ink-soft">
        El enlace es temporal y privado (signed URL); el bucket no expone URLs públicas.
      </p>
    </div>
  );
}
