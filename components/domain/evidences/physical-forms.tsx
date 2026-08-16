"use client";

/**
 * PCR-03.1 (5.2) · Soporte físico: alta de evidencia SOLO física (sin
 * archivo, sin fingirlo) y declaración de soporte físico sobre una
 * evidencia existente (si tiene archivo pasa a híbrida).
 */
import { useActionState } from "react";
import {
  createPhysicalEvidenceAction,
  declarePhysicalSupportAction,
  type EvidenceActionState,
} from "@/server/actions/evidences";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { ErrorAlert, SuccessAlert } from "@/components/ui/alert";
import {
  EVIDENCE_CATEGORIES,
  EVIDENCE_CATEGORY_LABEL,
} from "@/lib/domain/evidence-governance";

const initial: EvidenceActionState = { error: null };

function PhysicalFields() {
  return (
    <>
      <Field label="Referencia documental *" name="physical_reference" required />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Ubicación física (opcional)" name="physical_location" />
        <Field label="Responsable de custodia (opcional)" name="physical_custodian" />
      </div>
      <Field label="Notas del soporte físico (opcional)" name="physical_notes" />
    </>
  );
}

export function PhysicalEvidenceForm() {
  const [state, formAction, pending] = useActionState(createPhysicalEvidenceAction, initial);
  return (
    <form action={formAction} className="space-y-3">
      <p className="text-xs text-ink-soft">
        Registra una evidencia que la empresa conserva SOLO en físico
        (carpeta, archivador, registro en papel). No se sube archivo y el
        sistema jamás fingirá tenerlo: queda localizable por su referencia.
      </p>
      <Field label="Nombre *" name="name" required />
      <label className="block text-sm">
        <span className="mb-1 block text-xs font-medium text-ink-soft">Tipo</span>
        <select name="evidence_type" className="w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-sm">
          <option value="">Sin tipo</option>
          {EVIDENCE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {EVIDENCE_CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Fecha de la evidencia (opcional)" name="evidence_date" type="date" />
        <Field label="Vigente hasta (opcional)" name="valid_until" type="date" />
      </div>
      <Field label="Responsable (opcional)" name="responsible" />
      <PhysicalFields />
      <Field label="Observaciones (opcional)" name="observations" />
      {state.error ? <ErrorAlert message={state.error} /> : null}
      {!state.error && state.error !== null ? <SuccessAlert message="Evidencia registrada." /> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Registrando…" : "Registrar evidencia física"}
      </Button>
    </form>
  );
}

export function DeclarePhysicalForm({ evidenceId }: { evidenceId: string }) {
  const [state, formAction, pending] = useActionState(declarePhysicalSupportAction, initial);
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={evidenceId} />
      <PhysicalFields />
      {state.error ? <ErrorAlert message={state.error} /> : null}
      <Button type="submit" variant="quiet" disabled={pending}>
        {pending ? "Guardando…" : "Declarar soporte físico"}
      </Button>
    </form>
  );
}
