"use client";

import { useState } from "react";
import { ENTITY_LABEL, IMPORT_ORDER } from "@/lib/imports/types";

/**
 * Formulario de carga (Parte 11, punto 3: "Subir o pegar CSV"). Presentacional:
 * recibe la action ya vinculada (useActionState) desde el componente que la
 * orquesta (ImportWizard) — así el estado de validación vive en un solo
 * lugar.
 */
export function ImportUploadForm({
  action,
  pending,
  error,
}: {
  action: (formData: FormData) => void;
  pending: boolean;
  error: string | null;
}) {
  const [mode, setMode] = useState<"file" | "paste">("file");

  return (
    <form action={action} className="space-y-4">
      {error ? (
        <p role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink">Tipo de entidad</span>
        <select
          name="entity_type"
          required
          className="block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm"
        >
          {IMPORT_ORDER.map((e) => (
            <option key={e} value={e}>
              {ENTITY_LABEL[e]}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-ink-soft">
          Sigue este orden: proveedores → materiales → evidencias → familias → productos → lotes
          de entrada → órdenes / corridas → consumos → lotes producidos / lotes finales →
          composición.
        </span>
      </label>

      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            checked={mode === "file"}
            onChange={() => setMode("file")}
            className="border-hairline"
          />
          Subir archivo
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            checked={mode === "paste"}
            onChange={() => setMode("paste")}
            className="border-hairline"
          />
          Pegar contenido CSV
        </label>
      </div>

      {mode === "file" ? (
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">Archivo CSV</span>
          <input
            type="file"
            name="file"
            accept=".csv,text/csv"
            className="block w-full text-sm text-ink-soft file:mr-3 file:rounded-md file:border file:border-hairline file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium"
          />
        </label>
      ) : (
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">Contenido CSV</span>
          <textarea
            name="csv_text"
            rows={8}
            placeholder="encabezado,columna2,columna3&#10;valor1,valor2,valor3"
            className="block w-full rounded-md border border-hairline bg-surface px-3 py-2 font-mono text-xs"
          />
          <input type="hidden" name="filename" value="pegado.csv" />
        </label>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-loop px-4 py-2 text-sm font-semibold text-white hover:bg-loop-deep disabled:opacity-60"
      >
        {pending ? "Validando…" : "Validar archivo"}
      </button>
    </form>
  );
}
