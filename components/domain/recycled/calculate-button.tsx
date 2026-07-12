"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { calculateRecycledContentAction } from "@/server/actions/recycled";

export function CalculateButton({
  outputBatchId,
  hasCalculation,
  disabled,
  disabledReason,
}: {
  outputBatchId: string;
  hasCalculation: boolean;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (disabled) {
    return <p className="text-xs text-ink-soft">{disabledReason ?? "No disponible."}</p>;
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
      {error ? (
        <p role="alert" className="max-w-xs text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
