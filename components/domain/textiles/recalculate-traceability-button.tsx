"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recalculateTextileOutputLotTraceabilityAction } from "@/server/actions/textiles-traceability";

/**
 * Trazaloop · Sprint T6.1 (Textil) · Botón discreto de recálculo del estado
 * de trazabilidad de un lote final. Solo dispara la RPC controlada: el
 * usuario JAMÁS elige el estado — la base de datos lo deriva de los datos
 * operativos.
 */
export function RecalculateTraceabilityButton({ outputLotId }: { outputLotId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setMessage(null);
          startTransition(async () => {
            const result = await recalculateTextileOutputLotTraceabilityAction(outputLotId);
            if (result.error) {
              setMessage(result.error);
              return;
            }
            setMessage("Estado recalculado.");
            router.refresh();
          });
        }}
        className="rounded-md border border-hairline bg-paper px-2 py-1 text-xs font-medium text-ink-soft transition-colors hover:border-loop hover:text-loop disabled:opacity-60"
      >
        {pending ? "Recalculando…" : "Recalcular estado"}
      </button>
      {message ? <span className="text-[11px] text-ink-soft">{message}</span> : null}
    </span>
  );
}
