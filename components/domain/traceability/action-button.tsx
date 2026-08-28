"use client";

import { useActionState, useRef, useState } from "react";
import type { TraceActionState } from "@/server/actions/traceability";
import { linkEvidenceAction, type EvidenceActionState } from "@/server/actions/evidences";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { isEvidenceApplicableAt } from "@/lib/domain/evidence-governance";

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

/**
 * Asociar una evidencia existente a un destino fijo (lote u orden).
 *
 * PT-01 · Aquí el destino es UNO y se conoce, así que su fecha empresarial
 * viene dada y el filtro de aplicabilidad es exacto: se ofrecen las que
 * amparaban ESA operación, no las vigentes hoy. Una evidencia que venció el
 * año pasado sigue apareciendo si el lote se recibió cuando estaba vigente
 * (PT-F03), y una vigente hoy desaparece si el lote es anterior a su
 * `valid_from`.
 */
export function LinkEvidenceInline({
  targetType,
  targetId,
  referenceDate,
  evidences,
}: {
  targetType: "input_batch" | "production_order" | "output_batch";
  targetId: string;
  /** Fecha empresarial del destino: received_date / order_date / produced_date. */
  referenceDate: string | null;
  evidences: { value: string; label: string; validUntil: string | null }[];
}) {
  const [state, formAction, pending] = useActionState(
    linkEvidenceAction as (
      prev: EvidenceActionState,
      formData: FormData
    ) => Promise<EvidenceActionState>,
    { error: null }
  );
  const [confirming, setConfirming] = useState(false);
  const [evidenceId, setEvidenceId] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  // Si el destino no declara fecha, se juzga contra hoy — misma regla que
  // `evidence_target_reference_date` aplica en la base.
  const fecha = referenceDate ?? new Date().toISOString().slice(0, 10);
  const elegibles = evidences.filter((e) =>
    isEvidenceApplicableAt({ validUntil: e.validUntil }, fecha)
  );
  const elegida = elegibles.find((e) => e.value === evidenceId) ?? null;

  if (evidences.length === 0) {
    return (
      <p className="text-xs text-ink-soft">
        No hay evidencias aceptadas internamente. Créalas y valídalas en el menú Evidencias.
      </p>
    );
  }
  if (elegibles.length === 0) {
    return (
      <p className="text-xs text-ink-soft">
        Ninguna evidencia aceptada estaba vigente el {fecha}. Registra una que ampare esa fecha.
      </p>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="target_type" value={targetType} />
      <input type="hidden" name="target_id" value={targetId} />
      <input type="hidden" name="confirmed" value={confirming ? "1" : ""} />
      <select
        name="evidence_id"
        required
        value={evidenceId}
        onChange={(e) => setEvidenceId(e.target.value)}
        className="rounded-md border border-hairline bg-surface px-2 py-1.5 text-xs"
      >
        <option value="">— Evidencia —</option>
        {elegibles.map((e) => (
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
        type="button"
        disabled={pending || !evidenceId}
        onClick={() => setConfirming(true)}
        className="text-xs font-semibold text-loop hover:underline disabled:opacity-60"
      >
        {pending ? "Asociando…" : "Asociar evidencia"}
      </button>
      <ConfirmDialog
        open={confirming}
        title="Confirmar la asociación"
        description={`Vas a asociar «${elegida?.label ?? ""}» a este destino. Se registrará que estaba aceptada internamente y vigente el ${fecha}, y ese registro no cambiará después aunque la evidencia sí lo haga. Una vez confirmada, la asociación queda como hecho histórico: no se elimina.`}
        confirmLabel="Confirmar asociación"
        cancelLabel="Cancelar"
        pending={pending}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          formRef.current?.requestSubmit();
          setConfirming(false);
        }}
      />
      {state.error ? <span className="text-xs text-danger">{state.error}</span> : null}
      {state.success ? (
        <span role="status" className="text-xs font-medium text-loop-deep">
          {state.success}
        </span>
      ) : null}
    </form>
  );
}
