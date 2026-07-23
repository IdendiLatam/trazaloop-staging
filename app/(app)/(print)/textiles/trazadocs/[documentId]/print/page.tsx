// Ruta protegida: sesión + guarda del módulo Textil → nunca se
// prerenderiza. Vista optimizada para impresión del navegador
// (@media print), MISMO patrón que TrazaDocs CPR: NO genera PDF en
// servidor. Sprint T8 (Textil).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTextilesModule } from "@/lib/auth/require-textiles-module";
import {
  getTextileTrazadocDetail,
  listTextileTrazadocsDocuments,
} from "@/lib/db/textiles-trazadocs";
import { getCompanySettingsAction } from "@/server/actions/settings";
import { DOCUMENT_STATUS_LABEL, type DocumentStatus } from "@/lib/domain/trazadocs";
import { TEXTILE_TRAZADOCS_DISCLAIMER } from "@/lib/domain/textiles-trazadocs";
import { PrintButton } from "@/components/domain/audit-support/print-button";

export default async function TextileTrazadocPrintPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const org = await requireTextilesModule();
  const { documentId } = await params;
  const [doc, summaries, { data: company }] = await Promise.all([
    getTextileTrazadocDetail(org.organizationId, documentId),
    listTextileTrazadocsDocuments(org.organizationId),
    getCompanySettingsAction(),
  ]);
  if (!doc) notFound();
  const summary = summaries.find((s) => s.documentId === documentId);

  return (
    <div className="print-page space-y-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link href={`/textiles/trazadocs/${documentId}`} className="text-sm text-loop hover:underline">
          ← Volver al documento
        </Link>
        <PrintButton />
      </div>

      <header className="flex items-start justify-between gap-4 border-b border-hairline pb-4">
        <div className="space-y-1">
          <p className="text-xs text-ink-soft">{org.organizationName} · Trazaloop Textiles</p>
          {company?.legalName ? <p className="text-xs text-ink-soft">{company.legalName}</p> : null}
          {company?.taxId ? <p className="code text-xs text-ink-soft">NIT {company.taxId}</p> : null}
          <h1 className="text-xl font-semibold">{doc.title}</h1>
          {doc.code ? <p className="code text-xs text-ink-soft">{doc.code}</p> : null}
        </div>
        {company?.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={company.logoUrl}
            alt={`Logo de ${org.organizationName}`}
            className="max-h-16 max-w-[10rem] object-contain"
          />
        ) : null}
      </header>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-ink-soft sm:grid-cols-4">
        <div>
          <dt className="font-medium text-ink">Estado</dt>
          <dd>{DOCUMENT_STATUS_LABEL[doc.status as DocumentStatus] ?? doc.status}</dd>
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
        <p>{TEXTILE_TRAZADOCS_DISCLAIMER}</p>
        <p className="mt-1">
          Documento generado desde TrazaDocs Textil el {new Date().toLocaleString("es-CO")}. El
          historial completo de versiones está disponible en la plataforma.
        </p>
      </footer>
    </div>
  );
}
