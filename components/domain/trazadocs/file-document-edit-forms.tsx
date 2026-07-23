"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import {
  updateFileDocumentMetadataAction,
  beginFileDocumentReplaceAction,
  finalizeFileDocumentReplaceAction,
  cancelFileDocumentUploadAction,
  type MasterActionState,
} from "@/server/actions/trazadocs-master";
import { uploadFileToIntentPath } from "@/lib/storage/direct-upload";
import { CATEGORY_CODES, CATEGORY_LABEL } from "@/lib/domain/trazadocs-master";
import { Field, SelectField } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { ErrorAlert, InfoAlert } from "@/components/ui/alert";

const initial: MasterActionState = { error: null };
const CATEGORY_OPTIONS = CATEGORY_CODES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }));

export function FileDocumentEditForm({
  documentId,
  title,
  code,
  categoryCode,
  description,
  editable,
}: {
  documentId: string;
  title: string;
  code: string | null;
  categoryCode: string;
  description: string | null;
  editable: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateFileDocumentMetadataAction, initial);

  if (!editable) {
    return <InfoAlert message="Este documento no está en borrador o en revisión: sus datos no se pueden editar directamente." />;
  }

  return (
    <form action={formAction} className="space-y-4 rounded-lg border border-hairline bg-surface p-4">
      <input type="hidden" name="id" value={documentId} />
      <h3 className="text-sm font-semibold">Datos del documento</h3>
      <ErrorAlert message={state.error} />
      <Field label="Título" name="title" defaultValue={title} required />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Código (opcional)" name="code" defaultValue={code ?? ""} />
        <SelectField label="Categoría" name="category_code" options={CATEGORY_OPTIONS} defaultValue={categoryCode} />
      </div>
      <Field label="Descripción (opcional)" name="description" defaultValue={description ?? ""} />
      <Button type="submit" disabled={pending} className="!w-auto">
        {pending ? "Guardando…" : "Guardar cambios"}
      </Button>
    </form>
  );
}

/**
 * T9F.5B.1 · CARGA DIRECTA del reemplazo: begin (metadata) → PUT directo a la
 * ruta v(n+1) reservada → finalize (solo intentId). El archivo anterior no se
 * sobrescribe: la nueva versión es un objeto NUEVO (A03).
 */
export function ReplaceFileDocumentForm({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "saving" | "uploading" | "finalizing">("idle");
  const pending = phase !== "idle";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setError("Selecciona un archivo.");
      return;
    }
    const note = String(data.get("note") ?? "").trim() || null;

    setPhase("saving");
    const begin = await beginFileDocumentReplaceAction({
      documentId,
      file: { name: file.name, sizeBytes: file.size, mimeType: file.type },
    });
    if (begin.error !== null) {
      setPhase("idle");
      setError(begin.error);
      return;
    }

    setPhase("uploading");
    const uploaded = await uploadFileToIntentPath({
      bucketId: begin.upload.bucketId,
      objectPath: begin.upload.objectPath,
      file,
    });
    if (!uploaded.ok) {
      await cancelFileDocumentUploadAction(begin.upload.intentId);
      setPhase("idle");
      setError(uploaded.message);
      return;
    }

    setPhase("finalizing");
    const finalized = await finalizeFileDocumentReplaceAction(begin.upload.intentId, note);
    setPhase("idle");
    if (finalized.error) {
      setError(finalized.error);
      return;
    }
    form.reset();
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-hairline bg-surface p-4">
      <h3 className="text-sm font-semibold">Reemplazar archivo</h3>
      <p className="text-xs text-ink-soft">
        Sube una nueva versión del archivo. Si el documento estaba aprobado, la nueva versión queda
        en borrador — nunca se sobrescribe silenciosamente un archivo ya aprobado.
      </p>
      <ErrorAlert message={error} />
      <input
        type="file"
        name="file"
        required
        accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.webp"
        className="block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink file:mr-3 file:rounded file:border-0 file:bg-paper file:px-3 file:py-1.5 file:text-sm"
      />
      <Field label="Nota de cambio (opcional)" name="note" placeholder="Se corrige la versión con el cambio solicitado." />
      <Button type="submit" disabled={pending} className="!w-auto">
        {phase === "saving"
          ? "Preparando…"
          : phase === "uploading"
            ? "Subiendo archivo…"
            : phase === "finalizing"
              ? "Verificando archivo…"
              : "Reemplazar archivo"}
      </Button>
    </form>
  );
}
