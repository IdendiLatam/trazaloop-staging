"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  validateImportAction,
  commitImportAction,
  type ImportValidation,
} from "@/server/actions/import";
import type { ImportEntity } from "@/lib/import-templates";
import { Button } from "@/components/ui/button";
import { ErrorAlert, InfoAlert } from "@/components/ui/alert";

const ENTITY_LABEL: Record<ImportEntity, string> = {
  suppliers: "Proveedores",
  product_families: "Familias de producto",
  products: "Productos",
  materials: "Materiales",
  input_batches: "Lotes de entrada",
};

const CATALOG_ENTITIES: ImportEntity[] = [
  "suppliers",
  "product_families",
  "products",
  "materials",
];

export function ImportWizard({
  entities = CATALOG_ENTITIES,
}: {
  entities?: ImportEntity[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [entity, setEntity] = useState<ImportEntity>(entities[0]);
  const [filename, setFilename] = useState<string>("");
  const [csvText, setCsvText] = useState<string>("");
  const [validation, setValidation] = useState<ImportValidation | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onFileChange(file: File | null) {
    setValidation(null);
    setDone(null);
    setError(null);
    if (!file) return;
    setFilename(file.name);
    file.text().then(setCsvText);
  }

  function validate() {
    setError(null);
    setDone(null);
    startTransition(async () => {
      if (!csvText) {
        setError("Selecciona un archivo CSV primero.");
        return;
      }
      const result = await validateImportAction(entity, filename, csvText);
      if (result.error) {
        setError(result.error);
        setValidation(null);
        return;
      }
      setValidation(result);
    });
  }

  function commit() {
    if (!validation) return;
    setError(null);
    startTransition(async () => {
      const result = await commitImportAction(entity, filename, validation.rows);
      if (result.error) {
        setError(result.error);
        return;
      }
      setDone(`Importación completa: ${result.inserted} fila(s) insertadas en ${ENTITY_LABEL[entity]}.`);
      setValidation(null);
      setCsvText("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <ErrorAlert message={error} />
      <InfoAlert message={done} />

      {/* Paso 1: entidad y plantilla */}
      <section className="rounded-lg border border-hairline bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold">1 · Elige qué importar</h2>
        <div className="flex flex-wrap items-end gap-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">Catálogo</span>
            <select
              value={entity}
              onChange={(e) => {
                setEntity(e.target.value as ImportEntity);
                setValidation(null);
                setDone(null);
              }}
              className="block rounded-md border border-hairline bg-surface px-3 py-2 text-sm"
            >
              {entities.map((value) => (
                <option key={value} value={value}>
                  {ENTITY_LABEL[value]}
                </option>
              ))}
            </select>
          </label>
          <a
            href={`/api/import/template?entity=${entity}`}
            className="inline-flex items-center rounded-md border border-hairline bg-surface px-4 py-2 text-sm font-semibold hover:border-loop"
          >
            Descargar plantilla CSV
          </a>
        </div>
        {entity === "products" ? (
          <p className="mt-3 text-xs text-ink-soft">
            Importa primero las familias: la columna family_name debe existir en tu empresa.
          </p>
        ) : null}
        {entity === "materials" ? (
          <p className="mt-3 text-xs text-ink-soft">
            classification_code debe ser un código del catálogo (por ejemplo:
            postconsumer_valid, preconsumer_valid, postindustrial, virgin).
          </p>
        ) : null}
        {entity === "input_batches" ? (
          <p className="mt-3 text-xs text-ink-soft">
            supplier_name y material_name deben existir en tus catálogos.
            residue_type (opcional): preconsumer, postconsumer, postindustrial,
            virgin u other. received_date en formato AAAA-MM-DD.
          </p>
        ) : null}
      </section>

      {/* Paso 2: archivo y validación */}
      <section className="rounded-lg border border-hairline bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold">2 · Sube y valida el archivo</h2>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-ink-soft file:mr-3 file:rounded-md file:border file:border-hairline file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium"
        />
        <Button
          className="mt-4 !w-auto"
          disabled={pending || !csvText}
          onClick={validate}
        >
          {pending ? "Validando…" : "Validar archivo"}
        </Button>
      </section>

      {/* Paso 3: resultado de validación + confirmación */}
      {validation ? (
        <section className="rounded-lg border border-hairline bg-surface p-5">
          <h2 className="mb-3 text-sm font-semibold">3 · Revisa y confirma</h2>
          <p className="text-sm">
            <span className="code">{validation.totalRows}</span> fila(s) leídas ·{" "}
            <span className="code text-loop-deep">{validation.validRows}</span> válidas ·{" "}
            <span className="code text-danger">{validation.errors.length}</span> con error
          </p>

          {validation.errors.length > 0 ? (
            <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto rounded-md border border-danger/30 bg-danger/5 p-3">
              {validation.errors.map((e, i) => (
                <li key={i} className="text-sm text-danger">
                  <span className="code mr-2">Fila {e.row}:</span>
                  {e.message}
                </li>
              ))}
            </ul>
          ) : null}

          {validation.errors.length === 0 ? (
            <Button className="mt-4 !w-auto" disabled={pending} onClick={commit}>
              {pending ? "Importando…" : `Confirmar e importar ${validation.validRows} fila(s)`}
            </Button>
          ) : (
            <p className="mt-3 text-xs text-ink-soft">
              Los catálogos se importan solo cuando el archivo no tiene errores.
              Corrige las filas indicadas y vuelve a validar.
            </p>
          )}
        </section>
      ) : null}
    </div>
  );
}
