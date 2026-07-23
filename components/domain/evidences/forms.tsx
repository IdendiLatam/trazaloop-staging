"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  beginEvidenceUploadAction,
  finalizeEvidenceUploadAction,
  cancelEvidenceUploadAction,
  linkEvidenceAction,
  type EvidenceActionState,
} from "@/server/actions/evidences";
import { uploadFileToIntentPath } from "@/lib/storage/direct-upload";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/alert";

const initial: EvidenceActionState = { error: null };

/**
 * T9F.5B.1 · CARGA DIRECTA: el archivo NO viaja en FormData hacia la Server
 * Action. Flujo: begin (solo metadata) → PUT directo del navegador a la ruta
 * EXACTA del intent → finalize (solo intentId; el servidor verifica el objeto
 * físico y su firma binaria antes de registrar nada).
 */
export function EvidenceForm() {
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "saving" | "uploading" | "finalizing">("idle");
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const pending = phase !== "idle";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    const realFile = file instanceof File && file.size > 0 ? file : null;

    setPhase("saving");
    const begin = await beginEvidenceUploadAction({
      name: String(data.get("name") ?? "").trim(),
      evidenceType: String(data.get("evidence_type") ?? "").trim() || null,
      evidenceDate: String(data.get("evidence_date") ?? "") || null,
      responsible: String(data.get("responsible") ?? "").trim() || null,
      observations: String(data.get("observations") ?? "").trim() || null,
      validUntil: String(data.get("valid_until") ?? "") || null,
      file: realFile
        ? {
            name: realFile.name,
            sizeBytes: realFile.size,
            mimeType: realFile.type || "application/octet-stream",
          }
        : null,
    });
    if (begin.error !== null) {
      setPhase("idle");
      setError(begin.error);
      return;
    }
    if (!begin.upload || !realFile) {
      setPhase("idle");
      form.reset();
      router.refresh();
      return;
    }

    setPhase("uploading");
    const uploaded = await uploadFileToIntentPath({
      bucketId: begin.upload.bucketId,
      objectPath: begin.upload.objectPath,
      file: realFile,
    });
    if (!uploaded.ok) {
      // Compensación: se cancela la reserva y se intenta el retiro CONFIRMADO.
      await cancelEvidenceUploadAction(begin.upload.intentId);
      setPhase("idle");
      setError(`La evidencia se creó, pero ${uploaded.message.toLowerCase()}`);
      router.refresh();
      return;
    }

    setPhase("finalizing");
    const finalized = await finalizeEvidenceUploadAction(begin.upload.intentId);
    setPhase("idle");
    if (finalized.error) {
      setError(finalized.error);
      router.refresh();
      return;
    }
    form.reset();
    router.refresh();
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
      <ErrorAlert message={error} />
      <Field label="Nombre" name="name" required />
      <Field
        label="Tipo (opcional)"
        name="evidence_type"
        hint="Por ejemplo: declaración de proveedor, registro de recepción, ficha del material."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Fecha de la evidencia (opcional)" name="evidence_date" type="date" />
        <Field label="Vigente hasta (opcional)" name="valid_until" type="date" />
      </div>
      <Field label="Responsable (opcional)" name="responsible" />
      <Field label="Observaciones (opcional)" name="observations" />
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink">Archivo (opcional)</span>
        <input
          type="file"
          name="file"
          className="block w-full text-sm text-ink-soft file:mr-3 file:rounded-md file:border file:border-hairline file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium"
        />
        <span className="mt-1 block text-xs text-ink-soft">
          Se guarda en el repositorio privado de tu empresa.
        </span>
      </label>
      <Button type="submit" disabled={pending} className="!w-auto">
        {phase === "saving"
          ? "Guardando…"
          : phase === "uploading"
            ? "Subiendo archivo…"
            : phase === "finalizing"
              ? "Verificando archivo…"
              : "Crear evidencia"}
      </Button>
    </form>
  );
}

export type LinkTargetOption = { value: string; label: string };

export function EvidenceLinkForm({
  evidences,
  targets,
}: {
  evidences: LinkTargetOption[];
  targets: Record<string, LinkTargetOption[]>;
}) {
  const [state, formAction, pending] = useActionState(linkEvidenceAction, initial);
  const [targetType, setTargetType] = useState<string>("supplier");
  const [linkKind, setLinkKind] = useState<string>("general");

  const TYPE_LABEL: Record<string, string> = {
    supplier: "Proveedor",
    material: "Material",
    product: "Producto",
    product_family: "Familia de producto",
    site: "Sede",
    input_batch: "Lote de entrada",
    production_order: "Orden / corrida de producción",
    output_batch: "Lote producido / lote final",
  };

  const options = targets[targetType] ?? [];

  return (
    <form action={formAction} className="space-y-4">
      <ErrorAlert message={state.error} />
      {state.warning ? (
        <p
          role="status"
          className="rounded-md border border-amber/40 bg-amber/10 px-3 py-2 text-sm text-amber"
        >
          {state.warning}
        </p>
      ) : null}
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink">Evidencia</span>
        <select
          name="evidence_id"
          required
          className="block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm"
        >
          <option value="">— Selecciona —</option>
          {evidences.map((e) => (
            <option key={e.value} value={e.value}>
              {e.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink">Tipo de destino</span>
        <select
          name="target_type"
          value={targetType}
          onChange={(e) => setTargetType(e.target.value)}
          className="block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm"
        >
          {Object.entries(TYPE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink">Tipo de vínculo</span>
        <select
          name="link_kind"
          value={targetType === "material" ? linkKind : "general"}
          onChange={(e) => setLinkKind(e.target.value)}
          disabled={targetType !== "material"}
          className="block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm disabled:opacity-60"
        >
          <option value="general">Soporte general</option>
          <option value="material_origin">Soporte de origen del material</option>
          <option value="material_reclassification">
            Soporte de reclasificación del material
          </option>
        </select>
        <span className="mt-1 block text-xs text-ink-soft">
          {targetType === "material"
            ? "Para que un material reciclado cuente en el cálculo, márcala como soporte de origen y valídala."
            : "El soporte de origen o reclasificación solo aplica a materiales."}
        </span>
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink">Destino</span>
        <select
          name="target_id"
          required
          className="block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm"
        >
          <option value="">— Selecciona —</option>
          {options.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        {options.length === 0 ? (
          <span className="mt-1 block text-xs text-ink-soft">
            No hay registros de este tipo todavía. Créalos en catálogos.
          </span>
        ) : null}
      </label>

      <Field
        label="Rol del enlace (opcional)"
        name="link_role"
        hint="Por ejemplo: soporte de origen, ficha técnica."
      />

      <Button type="submit" disabled={pending} className="!w-auto">
        {pending ? "Asociando…" : "Asociar evidencia"}
      </Button>
    </form>
  );
}
