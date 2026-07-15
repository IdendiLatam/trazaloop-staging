import Link from "next/link";
import type { DocumentSummaryRow } from "@/lib/db/trazadocs";
import { DocumentStatusBadge } from "./document-status-badge";
import { DeleteDraftButton } from "./delete-draft-button";
import { EmptyState } from "@/components/ui/empty-state";

const SOURCE_LABEL: Record<string, string> = {
  suggested: "Estructura sugerida",
  custom: "Documento libre",
};

/** Listado de documentos de la empresa (Parte 7). */
export function DocumentList({ documents }: { documents: DocumentSummaryRow[] }) {
  if (documents.length === 0) {
    return (
      <EmptyState
        title="Todavía no hay documentos en TrazaDocs."
        description="Crea el primero desde una estructura sugerida o como documento libre."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-hairline bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-hairline text-left text-xs text-ink-soft">
            <th className="px-3 py-2 font-medium">Documento</th>
            <th className="px-3 py-2 font-medium">Origen</th>
            <th className="px-3 py-2 font-medium">Estado</th>
            <th className="px-3 py-2 font-medium">Versión</th>
            <th className="px-3 py-2 font-medium">Responsable</th>
            <th className="px-3 py-2 font-medium">Actualizado</th>
            <th className="px-3 py-2 font-medium">Secciones</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {documents.map((d) => (
            <tr key={d.documentId} className="border-b border-hairline last:border-0 align-top">
              <td className="px-3 py-2">
                <p className="font-medium">{d.title}</p>
                {d.code ? <p className="code text-xs text-ink-soft">{d.code}</p> : null}
              </td>
              <td className="px-3 py-2 text-xs text-ink-soft">{SOURCE_LABEL[d.sourceType]}</td>
              <td className="px-3 py-2">
                <DocumentStatusBadge status={d.status} />
              </td>
              <td className="code px-3 py-2 text-xs">v{d.currentVersion}</td>
              <td className="px-3 py-2 text-xs text-ink-soft">{d.ownerName ?? "—"}</td>
              <td className="px-3 py-2 text-xs text-ink-soft">
                {new Date(d.updatedAt).toLocaleDateString("es-CO")}
              </td>
              <td className="px-3 py-2 text-xs text-ink-soft">
                {d.filledSectionsCount}/{d.sectionsCount}
                {d.requiredSectionsCount > 0 ? (
                  <span className="ml-1">
                    ({d.filledRequiredSectionsCount}/{d.requiredSectionsCount} oblig.)
                  </span>
                ) : null}
              </td>
              <td className="px-3 py-2 text-right text-xs">
                <div className="flex flex-col items-end gap-1">
                  <Link href={`/trazadocs/${d.documentId}`} className="text-loop hover:underline">
                    Abrir
                  </Link>
                  <Link href={`/trazadocs/${d.documentId}/edit`} className="text-loop hover:underline">
                    Editar
                  </Link>
                  <Link href={`/trazadocs/${d.documentId}/versions`} className="text-loop hover:underline">
                    Versiones
                  </Link>
                  <Link href={`/trazadocs/${d.documentId}/print`} className="text-loop hover:underline">
                    Imprimir
                  </Link>
                  {d.status === "draft" ? (
                    <DeleteDraftButton documentId={d.documentId} compact />
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
