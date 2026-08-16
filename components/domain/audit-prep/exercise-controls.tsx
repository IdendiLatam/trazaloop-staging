"use client";

/**
 * PCR-03.2 · Controles cliente del ejercicio: iniciar (síncrono, redirige al
 * detalle congelado) y archivar (solo admin/calidad; el trigger 0107 impide
 * cualquier otra mutación de un ejercicio finalizado).
 */
import { useActionState } from "react";
import {
  runTraceabilityExerciseAction,
  archiveTraceabilityExerciseAction,
  type ExerciseActionState,
} from "@/server/actions/traceability-exercise";

const initial: ExerciseActionState = { error: null };

export function StartExerciseButton({
  outputBatchId,
  batchCode,
}: {
  outputBatchId: string;
  batchCode: string;
}) {
  const [state, formAction, pending] = useActionState(runTraceabilityExerciseAction, initial);
  return (
    <form action={formAction} className="text-right">
      <input type="hidden" name="output_batch_id" value={outputBatchId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-loop px-3 py-1.5 text-xs font-semibold text-white hover:bg-loop-deep disabled:opacity-60"
        aria-label={`Iniciar ejercicio de trazabilidad del lote ${batchCode}`}
      >
        {pending ? "Reconstruyendo…" : "Iniciar ejercicio"}
      </button>
      {state.error ? <p className="mt-1 max-w-56 text-xs text-danger">{state.error}</p> : null}
    </form>
  );
}

export function ArchiveExerciseButton({ exerciseId }: { exerciseId: string }) {
  const [state, formAction, pending] = useActionState(archiveTraceabilityExerciseAction, initial);
  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={exerciseId} />
      <button type="submit" disabled={pending} className="text-sm text-ink-soft hover:underline disabled:opacity-60">
        {pending ? "Archivando…" : "Archivar"}
      </button>
      {state.error ? <p className="mt-1 max-w-56 text-xs text-danger">{state.error}</p> : null}
    </form>
  );
}
