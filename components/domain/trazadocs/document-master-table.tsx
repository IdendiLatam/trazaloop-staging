import Link from "next/link";
import type { MasterCategoryGroup } from "@/lib/domain/trazadocs-master";
import { DocumentStatusBadge } from "@/components/domain/trazadocs/document-status-badge";
import { DownloadFileButton } from "./download-file-button";
import { EmptyState } from "@/components/ui/empty-state";

const SOURCE_LABEL: Record<string, string> = {
  live_document: "Documento vivo",
  file_document: "Archivo descargable",
};

function formatBytes(bytes: number | null): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Tabla del Maestro de documentos, agrupada por categoría (Parte 12). */
export function DocumentMasterTable({ groups }: { groups: MasterCategoryGroup[] }) {
  if (groups.length === 0) {
    return (
      <EmptyState
        title="Aún no hay documentos en el maestro documental."
        description="Crea un documento TrazaDocs o agrega un documento descargable para empezar."
      />
    );
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.categoryCode} className="space-y-2">
          <h2 className="eyebrow">
            {group.categoryLabel} ({group.rows.length})
          </h2>
          <div className="overflow-x-auto rounded-lg border border-hairline bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs text-ink-soft">
                  <th className="px-3 py-2 font-medium">Código</th>
                  <th className="px-3 py-2 font-medium">Documento</th>
                  <th className="px-3 py-2 font-medium">Tipo</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 font-medium">Versión</th>
                  <th className="px-3 py-2 font-medium">Responsable</th>
                  <th className="px-3 py-2 font-medium">Actualizado</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {group.rows.map((row) => (
                  <tr key={`${row.sourceType}-${row.documentId}`} className="border-b border-hairline last:border-0 align-top">
                    <td className="code px-3 py-2 text-xs">{row.code ?? "—"}</td>
                    <td className="px-3 py-2">
                      <p className="font-medium">{row.title}</p>
                      {row.sourceType === "file_document" ? (
                        <p className="text-xs text-ink-soft">
                          {row.fileName} · {formatBytes(row.sizeBytes)}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-xs text-ink-soft">{SOURCE_LABEL[row.sourceType]}</td>
                    <td className="px-3 py-2">
                      <DocumentStatusBadge status={row.status} />
                    </td>
                    <td className="code px-3 py-2 text-xs">{row.versionLabel}</td>
                    <td className="px-3 py-2 text-xs text-ink-soft">{row.responsibleName ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-ink-soft">
                      {new Date(row.updatedAt).toLocaleDateString("es-CO")}
                    </td>
                    <td className="px-3 py-2 text-right text-xs">
                      {row.actionType === "open" ? (
                        <Link href={row.actionHref ?? `/trazadocs/${row.documentId}`} className="text-loop hover:underline">
                          Abrir
                        </Link>
                      ) : (
                        <div className="flex flex-col items-end gap-1">
                          <DownloadFileButton documentId={row.documentId} />
                          <Link href={`/trazadocs/files/${row.documentId}`} className="text-loop hover:underline">
                            Ver detalle
                          </Link>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
