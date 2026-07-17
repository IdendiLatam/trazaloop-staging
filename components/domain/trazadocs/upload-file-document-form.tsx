"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { uploadFileDocumentAction, type MasterActionState } from "@/server/actions/trazadocs-master";
import { CATEGORY_CODES, CATEGORY_LABEL } from "@/lib/domain/trazadocs-master";
import { Field, SelectField } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/alert";

const initial: MasterActionState = { error: null };
const CATEGORY_OPTIONS = CATEGORY_CODES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }));

/** Subir un documento descargable (Parte 13) — PDF/Word/Excel/CSV/imagen,
 *  controlado y versionado, nunca editable en línea. */
export function UploadFileDocumentForm() {
  const [state, formAction, pending] = useActionState(uploadFileDocumentAction, initial);
  const router = useRouter();

  useEffect(() => {
    if (state.success && state.documentId) {
      router.push(`/trazadocs/files/${state.documentId}`);
    }
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-4">
      <ErrorAlert message={state.error} />
      {state.error && state.documentId ? (
        <p className="text-xs text-ink-soft">
          <a href={`/trazadocs/files/${state.documentId}`} className="text-loop hover:underline">
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
        {pending ? "Subiendo…" : "Subir documento"}
      </Button>
    </form>
  );
}
