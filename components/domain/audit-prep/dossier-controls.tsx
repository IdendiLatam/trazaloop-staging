"use client";

/**
 * PCR-03.3 · Controles cliente del expediente: generar nueva versión
 * (síncrono, redirige al detalle congelado) y archivar (admin/calidad; el
 * trigger 0108 impide cualquier otra mutación y todo DELETE).
 */
import { useActionState } from "react";
import {
  generateAuditDossierAction,
  archiveAuditDossierAction,
  type DossierActionState,
} from "@/server/actions/audit-dossier";

const initial: DossierActionState = { error: null };

export function GenerateDossierButton({
  outputBatchId,
  batchCode,
}: {
  outputBatchId: string;
  batchCode: string;
}) {
  const [state, formAction, pending] = useActionState(generateAuditDossierAction, initial);
  return (
    <form action={formAction} className="text-right">
      <input type="hidden" name="output_batch_id" value={outputBatchId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-loop px-3 py-1.5 text-xs font-semibold text-white hover:bg-loop-deep disabled:opacity-60"
        aria-label={`Generar expediente del lote ${batchCode}`}
      >
        {pending ? "Generando…" : "Generar nueva versión"}
      </button>
      {state.error ? <p className="mt-1 max-w-56 text-xs text-danger">{state.error}</p> : null}
    </form>
  );
}

export function ArchiveDossierButton({ dossierId }: { dossierId: string }) {
  const [state, formAction, pending] = useActionState(archiveAuditDossierAction, initial);
  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={dossierId} />
      <button type="submit" disabled={pending} className="text-sm text-ink-soft hover:underline disabled:opacity-60">
        {pending ? "Archivando…" : "Archivar"}
      </button>
      {state.error ? <p className="mt-1 max-w-56 text-xs text-danger">{state.error}</p> : null}
    </form>
  );
}
