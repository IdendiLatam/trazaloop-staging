import type { FileDocumentVersionRow } from "@/lib/db/trazadocs-master";
import { DocumentStatusBadge } from "@/components/domain/trazadocs/document-status-badge";
import { EmptyState } from "@/components/ui/empty-state";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileDocumentVersionList({ versions }: { versions: FileDocumentVersionRow[] }) {
  if (versions.length === 0) {
    return <EmptyState title="Sin versiones registradas todavía." description="" />;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-hairline bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-hairline text-left text-xs text-ink-soft">
            <th className="px-3 py-2 font-medium">Versión</th>
            <th className="px-3 py-2 font-medium">Estado</th>
            <th className="px-3 py-2 font-medium">Archivo</th>
            <th className="px-3 py-2 font-medium">Nota</th>
            <th className="px-3 py-2 font-medium">Por</th>
            <th className="px-3 py-2 font-medium">Fecha</th>
          </tr>
        </thead>
        <tbody>
          {versions.map((v) => (
            <tr key={v.id} className="border-b border-hairline last:border-0">
              <td className="code px-3 py-2 text-xs">{v.versionLabel}</td>
              <td className="px-3 py-2">
                <DocumentStatusBadge status={v.status} />
              </td>
              <td className="px-3 py-2 text-xs text-ink-soft">
                {v.fileName} · {formatBytes(v.sizeBytes)}
              </td>
              <td className="px-3 py-2 text-xs text-ink-soft">{v.changeNote ?? "—"}</td>
              <td className="px-3 py-2 text-xs text-ink-soft">{v.createdByName ?? "—"}</td>
              <td className="px-3 py-2 text-xs text-ink-soft">{new Date(v.createdAt).toLocaleString("es-CO")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
