import Link from "next/link";
import { ENTITY_LABEL, type ImportEntityType } from "@/lib/imports/types";
import type { ImportCommitState } from "@/server/actions/imports";

/** Resumen posterior a confirmar (Parte 5 Paso 2, Parte 12). */
export function ImportResultCard({
  commit,
  entity,
}: {
  commit: ImportCommitState;
  entity: ImportEntityType | null;
}) {
  if (!commit.committed) return null;
  return (
    <div className="space-y-3 rounded-lg border border-loop/30 bg-loop/5 p-5">
      <p className="font-semibold text-loop-deep">
        Importación completada{entity ? ` · ${ENTITY_LABEL[entity]}` : ""}. Revisa el resumen y
        continúa en Implementación.
      </p>
      <dl className="grid grid-cols-3 gap-3 text-center">
        <div>
          <dd className="code text-xl font-semibold text-loop-deep">{commit.imported}</dd>
          <dt className="text-xs text-ink-soft">Creadas</dt>
        </div>
        <div>
          <dd className="code text-xl font-semibold text-ink-soft">{commit.skipped}</dd>
          <dt className="text-xs text-ink-soft">Omitidas (ya existían)</dt>
        </div>
        <div>
          <dd className="code text-xl font-semibold text-danger">{commit.failed}</dd>
          <dt className="text-xs text-ink-soft">Fallidas</dt>
        </div>
      </dl>
      <div className="flex flex-wrap gap-2 pt-1">
        <Link
          href="/implementation"
          className="rounded-md bg-loop px-3 py-1.5 text-sm font-semibold text-white hover:bg-loop-deep"
        >
          Ir a Implementación
        </Link>
        <Link
          href="/traceability"
          className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm font-medium hover:border-loop"
        >
          Ir a Trazabilidad
        </Link>
        <Link
          href="/evidences"
          className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm font-medium hover:border-loop"
        >
          Ir a Evidencias
        </Link>
        <Link
          href="/recycled-content"
          className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm font-medium hover:border-loop"
        >
          Ir a Contenido reciclado
        </Link>
      </div>
    </div>
  );
}
