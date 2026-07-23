"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  beginFileDocumentUploadAction,
  finalizeFileDocumentUploadAction,
  cancelFileDocumentUploadAction,
} from "@/server/actions/trazadocs-master";
import { uploadFileToIntentPath } from "@/lib/storage/direct-upload";
import { CATEGORY_CODES, CATEGORY_LABEL } from "@/lib/domain/trazadocs-master";
import { Field, SelectField } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/alert";

const CATEGORY_OPTIONS = CATEGORY_CODES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }));

/** Subir un documento descargable (Parte 13) — PDF/Word/Excel/CSV/imagen,
 *  controlado y versionado, nunca editable en línea. */
/**
 * T9F.5B.1 · CARGA DIRECTA: begin (metadata) → PUT directo del navegador a la
 * ruta EXACTA del intent → finalize (solo intentId). El archivo no atraviesa
 * ninguna Server Action, lo que además hace posible A14 (22 MB en Full/Extra)
 * sin elevar `serverActions.bodySizeLimit`.
 */
export function UploadFileDocumentForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "saving" | "uploading" | "finalizing">("idle");
  const pending = phase !== "idle";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setExistingId(null);
    const data = new FormData(event.currentTarget);
    const file = data.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setError("Selecciona un archivo.");
      return;
    }

    setPhase("saving");
    const begin = await beginFileDocumentUploadAction({
      title: String(data.get("title") ?? ""),
      code: String(data.get("code") ?? ""),
      categoryCode: String(data.get("category_code") ?? "other"),
      description: String(data.get("description") ?? ""),
      file: { name: file.name, sizeBytes: file.size, mimeType: file.type },
    });
    if (begin.error !== null) {
      setPhase("idle");
      setError(begin.error);
      setExistingId(begin.documentId);
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
    const finalized = await finalizeFileDocumentUploadAction(begin.upload.intentId);
    setPhase("idle");
    if (finalized.error) {
      setError(finalized.error);
      setExistingId(finalized.documentId ?? null);
      return;
    }
    if (finalized.documentId) router.push(`/trazadocs/files/${finalized.documentId}`);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <ErrorAlert message={error} />
      {error && existingId ? (
        <p className="text-xs text-ink-soft">
          <a href={`/trazadocs/files/${existingId}`} className="text-loop hover:underline">
            Abrir el documento existente
          </a>
        </p>
      ) : null}

      <Field label="Título del documento" name="title" required placeholder="Ej.: Ficha técnica del proveedor X" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Código (opcional)" name="code" />
        <SelectField label="Categoría" name="category_code" options={CATEGORY_OPTIONS} defaultValue="other" />
      </div>
      <Field label="Descripción (opcional)" name="description" />

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink">Archivo</span>
        <input
          type="file"
          name="file"
          required
          accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.webp"
          className="block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink file:mr-3 file:rounded file:border-0 file:bg-paper file:px-3 file:py-1.5 file:text-sm"
        />
        <span className="mt-1 block text-xs text-ink-soft">
          PDF, Word, Excel, CSV, PNG, JPG o WebP — hasta 25 MB (10 MB en plan Demo).
        </span>
      </label>

      <Button type="submit" disabled={pending} className="!w-auto">
        {phase === "saving"
          ? "Guardando…"
          : phase === "uploading"
            ? "Subiendo archivo…"
            : phase === "finalizing"
              ? "Verificando archivo…"
              : "Subir documento"}
      </Button>
    </form>
  );
}
