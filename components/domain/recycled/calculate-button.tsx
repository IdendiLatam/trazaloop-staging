"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  calculateRecycledContentAction,
  calculateRecycledContentV2Action,
} from "@/server/actions/recycled";

/**
 * PT-02A · Dos botones, y conviven a propósito.
 *
 * v2 calcula desde los consumos reales y exige que la fracción reciclada de
 * cada lote esté declarada. Hasta que lo esté, devolverá `incomplete` a
 * menudo — así que retirar v1 antes de tiempo dejaría a la gente sin ningún
 * cálculo en vez de con uno mejor.
 *
 * v1 requiere composición registrada; v2 no la necesita para nada. Por eso el
 * botón de v2 NO se deshabilita cuando falta composición: pedirla otra vez es
 * exactamente lo que PT-F10 vino a quitar.
 */
export function CalculateButton({
  outputBatchId,
  hasCalculation,
  disabled,
  disabledReason,
}: {
  outputBatchId: string;
  hasCalculation: boolean;
  /** Solo afecta a v1: es la composición lo que le falta. */
  disabled?: boolean;
  disabledReason?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pendingV2, startV2] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const botonV2 = (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={pendingV2}
        onClick={() => {
          setError(null);
          startV2(async () => {
            const result = await calculateRecycledContentV2Action(outputBatchId);
            if (result.error) setError(result.error);
            else router.refresh();
          });
        }}
        className="rounded-md border border-loop bg-surface px-3 py-1.5 text-sm font-semibold text-loop-deep hover:bg-loop/5 disabled:opacity-60"
      >
        {pendingV2 ? "Calculando…" : "Calcular con metodología v2"}
      </button>
      <p className="max-w-xs text-[11px] text-ink-soft">
        v2 usa los consumos reales de la orden y la fracción reciclada declarada
        en cada lote de entrada. No pide composición.
      </p>
    </div>
  );

  if (disabled) {
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="text-xs text-ink-soft">{disabledReason ?? "No disponible."}</p>
        {botonV2}
        {error ? (
          <p role="alert" className="max-w-xs text-xs text-danger">{error}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await calculateRecycledContentAction(outputBatchId);
            if (result.error) setError(result.error);
            else router.refresh();
          });
        }}
        className="rounded-md bg-loop px-3 py-1.5 text-sm font-semibold text-white hover:bg-loop-deep disabled:opacity-60"
      >
        {pending ? "Calculando…" : hasCalculation ? "Recalcular" : "Calcular"}
      </button>
      {hasCalculation ? (
        <p className="text-[11px] text-ink-soft">
          Recalcular crea un snapshot nuevo; el anterior se conserva intacto.
        </p>
      ) : null}
      <div className="pt-2">{botonV2}</div>
      {error ? (
        <p role="alert" className="max-w-xs text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
