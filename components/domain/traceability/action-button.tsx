"use client";

import { useActionState } from "react";
import type { TraceActionState } from "@/server/actions/traceability";
import { linkEvidenceAction, type EvidenceActionState } from "@/server/actions/evidences";

/**
 * Botón genérico para acciones (prev, formData) => { error } con error visible.
 * Se usa para eliminaciones y acciones de fila en trazabilidad.
 */
export function ActionButton({
  action,
  fields,
  label,
  pendingLabel,
  tone = "danger",
}: {
  action: (prev: TraceActionState, formData: FormData) => Promise<TraceActionState>;
  fields: Record<string, string>;
  label: string;
  pendingLabel?: string;
  tone?: "danger" | "loop";
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  return (
    <div className="flex flex-col items-end gap-1">
      <form action={formAction}>
        {Object.entries(fields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <button
          type="submit"
          disabled={pending}
          className={`text-sm hover:underline disabled:opacity-60 ${
            tone === "danger" ? "text-danger" : "text-loop"
          }`}
        >
          {pending ? pendingLabel ?? "Procesando…" : label}
        </button>
      </form>
      {state.error ? (
        <p role="alert" className="max-w-60 text-right text-xs text-danger">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}

/** Asociar una evidencia existente a un destino fijo (lote u orden). */
export function LinkEvidenceInline({
  targetType,
  targetId,
  evidences,
}: {
  targetType: "input_batch" | "production_order" | "output_batch";
  targetId: string;
  evidences: { value: string; label: string }[];
}) {
  const [state, formAction, pending] = useActionState(
    linkEvidenceAction as (
      prev: EvidenceActionState,
      formData: FormData
    ) => Promise<EvidenceActionState>,
    { error: null }
  );

  if (evidences.length === 0) {
    return (
      <p className="text-xs text-ink-soft">
        No hay evidencias registradas aún. Créalas en el menú Evidencias.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="target_type" value={targetType} />
      <input type="hidden" name="target_id" value={targetId} />
      <select
        name="evidence_id"
        required
        className="rounded-md border border-hairline bg-surface px-2 py-1.5 text-xs"
      >
        <option value="">— Evidencia —</option>
        {evidences.map((e) => (
          <option key={e.value} value={e.value}>
            {e.label}
          </option>
        ))}
      </select>
      <input
        name="link_role"
        placeholder="Rol (opcional)"
        className="w-32 rounded-md border border-hairline bg-surface px-2 py-1.5 text-xs"
      />
      <button
        type="submit"
        disabled={pending}
        className="text-xs font-semibold text-loop hover:underline disabled:opacity-60"
      >
        {pending ? "Asociando…" : "Asociar evidencia"}
      </button>
      {state.error ? <span className="text-xs text-danger">{state.error}</span> : null}
    </form>
  );
}
