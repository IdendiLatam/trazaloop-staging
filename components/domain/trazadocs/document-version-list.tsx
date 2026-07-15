import Link from "next/link";
import type { DocumentVersionRow } from "@/lib/db/trazadocs";
import { DocumentStatusBadge } from "./document-status-badge";
import { EmptyState } from "@/components/ui/empty-state";

/** Historial de versiones (Parte 10, Parte 17). Cada versión es un
 *  snapshot inmutable — nunca se sobrescribe una anterior. */
export function DocumentVersionList({
  documentId,
  versions,
}: {
  documentId: string;
  versions: DocumentVersionRow[];
}) {
  if (versions.length === 0) {
    return (
      <EmptyState
        title="Todavía no hay versiones guardadas."
        description="La primera versión se genera al enviar a revisión, aprobar o guardar cambios importantes."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-hairline bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-hairline text-left text-xs text-ink-soft">
            <th className="px-3 py-2 font-medium">Versión</th>
            <th className="px-3 py-2 font-medium">Estado</th>
            <th className="px-3 py-2 font-medium">Comentario</th>
            <th className="px-3 py-2 font-medium">Generada por</th>
            <th className="px-3 py-2 font-medium">Fecha</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {versions.map((v) => (
            <tr key={v.id} className="border-b border-hairline last:border-0">
              <td className="code px-3 py-2 text-xs">v{v.versionNumber}</td>
              <td className="px-3 py-2">
                <DocumentStatusBadge status={v.status} />
              </td>
              <td className="px-3 py-2 text-xs text-ink-soft">{v.changeNote ?? "—"}</td>
              <td className="px-3 py-2 text-xs text-ink-soft">{v.createdByName ?? "—"}</td>
              <td className="px-3 py-2 text-xs text-ink-soft">
                {new Date(v.createdAt).toLocaleString("es-CO")}
              </td>
              <td className="px-3 py-2 text-right text-xs">
                <Link
                  href={`/trazadocs/${documentId}/versions?version=${v.id}`}
                  className="text-loop hover:underline"
                >
                  Ver
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
