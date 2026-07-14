"use client";

import { useActionState, useState } from "react";
import {
  validateImportCsvAction,
  commitImportAction,
  type ImportPreviewState,
  type ImportCommitState,
} from "@/server/actions/imports";
import { ImportUploadForm } from "@/components/domain/imports/import-upload-form";
import { ImportPreviewTable } from "@/components/domain/imports/import-preview-table";
import { ImportErrors } from "@/components/domain/imports/import-errors";
import { ImportResultCard } from "@/components/domain/imports/import-result-card";

const initialPreview: ImportPreviewState = {
  error: null,
  jobId: null,
  entity: null,
  filename: null,
  totalRows: 0,
  validCount: 0,
  warningCount: 0,
  errorCount: 0,
  skipCount: 0,
  rows: [],
};

const initialCommit: ImportCommitState = {
  error: null,
  committed: false,
  jobId: null,
  entity: null,
  imported: 0,
  skipped: 0,
  failed: 0,
};

/** El wizard en sí (Parte 5: dos pasos, validar → confirmar). Cada llamada
 *  a "Nueva importación" remonta este componente con una key nueva (ver
 *  ImportWizard más abajo) para partir de cero sin arrastrar estado viejo. */
function ImportWizardInner({ onReset }: { onReset: () => void }) {
  const [preview, validateAction, validating] = useActionState(validateImportCsvAction, initialPreview);
  const [commit, commitAction, committing] = useActionState(commitImportAction, initialCommit);

  const hasPreview = Boolean(preview.jobId) && !commit.committed;
  const canConfirm = hasPreview && preview.errorCount === 0 && !commit.committed;

  if (commit.committed) {
    return (
      <div className="space-y-4">
        <ImportResultCard commit={commit} entity={preview.entity} />
        <button
          type="button"
          onClick={onReset}
          className="rounded-md border border-hairline bg-surface px-4 py-2 text-sm font-medium hover:border-loop"
        >
          Nueva importación
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ImportUploadForm action={validateAction} pending={validating} error={preview.error} />

      {hasPreview ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-hairline bg-paper px-4 py-3 text-sm">
            <span>
              <strong>{preview.totalRows}</strong> filas
            </span>
            <span className="text-loop-deep">
              <strong>{preview.validCount}</strong> válidas
            </span>
            <span className="text-amber">
              <strong>{preview.warningCount}</strong> con advertencia
            </span>
            <span className="text-danger">
              <strong>{preview.errorCount}</strong> con error
            </span>
            <span className="text-ink-soft">
              <strong>{preview.skipCount}</strong> ya existían (se omitirán)
            </span>
          </div>

          {preview.errorCount > 0 ? (
            <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
              No se importó ningún dato. Corrige los errores marcados y vuelve a validar el
              archivo.
            </p>
          ) : preview.warningCount > 0 ? (
            <p className="rounded-md border border-amber/40 bg-amber/10 px-3 py-2 text-sm text-amber">
              Hay advertencias que no bloquean la importación, pero conviene revisarlas antes de
              continuar.
            </p>
          ) : null}

          <ImportErrors rows={preview.rows} />
          <ImportPreviewTable rows={preview.rows} />

          {commit.error ? (
            <p role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
              {commit.error}
            </p>
          ) : null}

          <form action={commitAction}>
            <input type="hidden" name="import_job_id" value={preview.jobId ?? ""} />
            <button
              type="submit"
              disabled={!canConfirm || committing}
              className="rounded-md bg-loop px-4 py-2 text-sm font-semibold text-white hover:bg-loop-deep disabled:cursor-not-allowed disabled:opacity-60"
              title={!canConfirm ? "Corrige los errores antes de confirmar" : undefined}
            >
              {committing ? "Confirmando…" : "Confirmar importación"}
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

export function ImportWizard() {
  const [resetKey, setResetKey] = useState(0);
  return <ImportWizardInner key={resetKey} onReset={() => setResetKey((k) => k + 1)} />;
}
