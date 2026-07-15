// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getTrazadocDocumentAction,
  listDocumentVersionsAction,
  getDocumentVersionAction,
} from "@/server/actions/trazadocs";
import { DocumentVersionList } from "@/components/domain/trazadocs/document-version-list";
import { DocumentStatusBadge } from "@/components/domain/trazadocs/document-status-badge";

export default async function TrazaDocVersionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ version?: string }>;
}) {
  const { id } = await params;
  const { version: versionId } = await searchParams;

  const { data: doc } = await getTrazadocDocumentAction(id);
  if (!doc) notFound();

  const [versions, selectedVersion] = await Promise.all([
    listDocumentVersionsAction(id),
    versionId ? getDocumentVersionAction(versionId) : Promise.resolve(null),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <p className="eyebrow">
          <Link href={`/trazadocs/${doc.id}`} className="hover:underline">
            {doc.title}
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Historial de versiones</h1>
        <p className="max-w-2xl text-sm text-ink-soft">
          Cada versión es un snapshot completo del documento en ese momento — ninguna versión
          anterior se sobrescribe.
        </p>
      </header>

      <DocumentVersionList documentId={doc.id} versions={versions} />

      {selectedVersion ? (
        <section className="space-y-4 rounded-lg border border-hairline bg-surface p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">v{selectedVersion.versionNumber}</h2>
            <DocumentStatusBadge status={selectedVersion.status} />
            <span className="text-xs text-ink-soft">
              {new Date(selectedVersion.createdAt).toLocaleString("es-CO")}
              {selectedVersion.createdByName ? ` · ${selectedVersion.createdByName}` : ""}
            </span>
          </div>
          {selectedVersion.changeNote ? (
            <p className="text-sm text-ink-soft">«{selectedVersion.changeNote}»</p>
          ) : null}
          <div className="space-y-3">
            {selectedVersion.snapshot.sections.map((s) => (
              <div key={s.section_key} className="rounded-md border border-hairline bg-paper p-3">
                <h3 className="mb-1 text-sm font-semibold">{s.title}</h3>
                <p className="whitespace-pre-wrap text-sm text-ink">
                  {s.content.trim() || <span className="text-ink-soft">Sin diligenciar en esta versión.</span>}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
