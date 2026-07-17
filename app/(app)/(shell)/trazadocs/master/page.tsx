// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { listDocumentMasterAction, getDocumentMasterSummaryAction, type MasterFilters } from "@/server/actions/trazadocs-master";
import { CATEGORY_CODES, CATEGORY_LABEL } from "@/lib/domain/trazadocs-master";
import { DOCUMENT_STATUS_LABEL } from "@/lib/domain/trazadocs";
import { DocumentMasterTable } from "@/components/domain/trazadocs/document-master-table";
import { ExportMasterCsvButton } from "@/components/domain/trazadocs/export-master-csv-button";

const STATUS_OPTIONS = Object.entries(DOCUMENT_STATUS_LABEL);

export default async function DocumentMasterPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; status?: string; type?: string }>;
}) {
  const params = await searchParams;
  const filters: MasterFilters = {
    search: params.q,
    categoryCode: params.category,
    status: params.status,
    sourceType: params.type,
  };

  const [groups, summary] = await Promise.all([
    listDocumentMasterAction(filters),
    getDocumentMasterSummaryAction(),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-1">
        <p className="eyebrow">
          <Link href="/trazadocs" className="hover:underline">
            TrazaDocs
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Maestro de documentos</h1>
        <p className="max-w-2xl text-sm text-ink-soft">
          Vista única de todos los documentos de la empresa: documentos vivos (diligenciados en
          Trazaloop) y documentos descargables (archivos controlados que la empresa sube y
          versiona). No incluye evidencias técnicas ni el cálculo de contenido reciclado.
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          <Link
            href="/trazadocs/files/new"
            className="rounded-md bg-loop px-3 py-1.5 text-sm font-semibold text-white hover:bg-loop-deep"
          >
            Agregar documento descargable
          </Link>
          <Link
            href="/trazadocs/master/print"
            className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm font-medium hover:border-loop"
          >
            Vista de impresión
          </Link>
          <ExportMasterCsvButton filters={filters} />
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total de documentos", value: summary.total },
          { label: "Documentos vivos", value: summary.liveCount },
          { label: "Archivos descargables", value: summary.fileCount },
          { label: "Aprobados", value: summary.approvedCount },
        ].map((c) => (
          <div key={c.label} className="rounded-lg border border-hairline bg-surface p-4">
            <dd className="code text-xl font-semibold">{c.value}</dd>
            <dt className="mt-1 text-xs text-ink-soft">{c.label}</dt>
          </div>
        ))}
      </dl>

      <form method="get" className="grid gap-3 rounded-lg border border-hairline bg-surface p-4 sm:grid-cols-4">
        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-sm font-medium text-ink">Buscar</span>
          <input
            type="text"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Título o código…"
            className="block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink focus:border-loop"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">Categoría</span>
          <select
            name="category"
            defaultValue={params.category ?? ""}
            className="block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink focus:border-loop"
          >
            <option value="">Todas</option>
            {CATEGORY_CODES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">Estado</span>
          <select
            name="status"
            defaultValue={params.status ?? ""}
            className="block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink focus:border-loop"
          >
            <option value="">Todos</option>
            {STATUS_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">Tipo</span>
          <select
            name="type"
            defaultValue={params.type ?? ""}
            className="block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink focus:border-loop"
          >
            <option value="">Todos</option>
            <option value="live_document">Documento vivo</option>
            <option value="file_document">Archivo descargable</option>
          </select>
        </label>
        <div className="flex items-end gap-2 sm:col-span-4">
          <button type="submit" className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm font-medium hover:border-loop">
            Filtrar
          </button>
          <Link href="/trazadocs/master" className="text-sm text-ink-soft hover:underline">
            Limpiar filtros
          </Link>
        </div>
      </form>

      <DocumentMasterTable groups={groups} />
    </div>
  );
}
