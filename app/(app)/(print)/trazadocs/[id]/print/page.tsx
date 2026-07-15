// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1). Vista optimizada para impresión del
// navegador (@media print). NO genera PDF en servidor — Parte 20: "Usar
// impresión del navegador. No generar PDF server-side todavía."
export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { getTrazadocDocumentAction, listTrazadocsAction } from "@/server/actions/trazadocs";
import { DOCUMENT_STATUS_LABEL } from "@/lib/domain/trazadocs";
import { PrintButton } from "@/components/domain/audit-support/print-button";

export default async function TrazaDocPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const org = await requireActiveOrg();
  const { id } = await params;
  const [{ data: doc }, summaries] = await Promise.all([
    getTrazadocDocumentAction(id),
    listTrazadocsAction(),
  ]);
  if (!doc) notFound();
  const summary = summaries.find((s) => s.documentId === id);

  return (
    <div className="print-page space-y-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link href={`/trazadocs/${id}`} className="text-sm text-loop hover:underline">
          ← Volver al documento
        </Link>
        <PrintButton />
      </div>

      <header className="space-y-1 border-b border-hairline pb-4">
        <p className="text-xs text-ink-soft">{org.organizationName}</p>
        <h1 className="text-xl font-semibold">{doc.title}</h1>
        {doc.code ? <p className="code text-xs text-ink-soft">{doc.code}</p> : null}
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 pt-2 text-xs text-ink-soft sm:grid-cols-4">
          <div>
            <dt className="font-medium text-ink">Estado</dt>
            <dd>{DOCUMENT_STATUS_LABEL[doc.status]}</dd>
          </div>
          <div>
            <dt className="font-medium text-ink">Versión</dt>
            <dd>v{doc.currentVersion}</dd>
          </div>
          <div>
            <dt className="font-medium text-ink">Responsable</dt>
            <dd>{summary?.ownerName ?? "—"}</dd>
          </div>
          <div>
            <dt className="font-medium text-ink">Actualizado</dt>
            <dd>{new Date(doc.updatedAt).toLocaleDateString("es-CO")}</dd>
          </div>
        </dl>
      </header>

      <section className="space-y-4">
        {doc.sections.map((s) => (
          <div key={s.id} className="break-inside-avoid">
            <h2 className="mb-1 text-sm font-semibold">{s.title}</h2>
            <p className="whitespace-pre-wrap text-sm text-ink">
              {s.content.trim() || "Sin diligenciar."}
            </p>
          </div>
        ))}
      </section>

      <footer className="border-t border-hairline pt-4 text-xs text-ink-soft">
        <p className="font-medium text-ink">Control de cambios / versiones</p>
        <p className="mt-1">
          Documento generado desde Trazaloop TrazaDocs el {new Date().toLocaleString("es-CO")}. El
          historial completo de versiones está disponible en{" "}
          <span className="code">/trazadocs/{id}/versions</span> dentro de la plataforma.
        </p>
      </footer>
    </div>
  );
}
