"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { calculateRecycledContentV2Action } from "@/server/actions/recycled";

/**
 * PT-02A · Un solo botón, porque hay una sola metodología operativa.
 *
 * Aquí hubo dos. El de v1 exigía composición registrada a mano y, cuando no la
 * había, la pantalla se deshabilitaba y pedía teclear una composición que el
 * cálculo bueno no usa para nada. Ese botón ya no existe: v1 es histórico
 * interno, sus cálculos se conservan y siguen siendo reproducibles por RPC,
 * pero no se generan nuevos desde la aplicación.
 *
 * Y este botón NO se deshabilita por falta de datos. v2 responde `incomplete`
 * con el motivo y el lote concreto, que es una respuesta útil; un botón gris
 * con un texto genérico no lo es. Solo los impedimentos ESTRUCTURALES —no hay
 * orden, no hay consumos, la orden produjo varios lotes sin reparto— se dicen
 * antes, porque de esos sí se sabe la respuesta sin ejecutar nada.
 */
export function CalculateButton({
  outputBatchId,
  hasCalculation,
  blockers = [],
}: {
  outputBatchId: string;
  hasCalculation: boolean;
  /** Impedimentos estructurales, ya redactados. Vacío = se puede intentar. */
  blockers?: readonly string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={pending || blockers.length > 0}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await calculateRecycledContentV2Action(outputBatchId);
            if (result.error) setError(result.error);
            else router.refresh();
          });
        }}
        className="rounded-md bg-loop px-3 py-1.5 text-sm font-semibold text-white hover:bg-loop-deep disabled:opacity-60"
      >
        {pending
          ? "Calculando…"
          : hasCalculation
            ? "Recalcular contenido reciclado"
            : "Calcular contenido reciclado"}
      </button>
      {blockers.length > 0 ? (
        <ul className="max-w-xs list-inside list-disc text-[11px] text-ink-soft">
          {blockers.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      ) : (
        <p className="max-w-xs text-[11px] text-ink-soft">
          {hasCalculation
            ? "Recalcular crea un snapshot nuevo; el anterior se conserva intacto."
            : "Se calcula desde los consumos trazados de la orden."}
        </p>
      )}
      {error ? (
        <p role="alert" className="max-w-xs text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
