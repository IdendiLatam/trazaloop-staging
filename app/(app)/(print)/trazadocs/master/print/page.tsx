// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1). Vista optimizada para impresión del
// navegador (@media print). NO genera PDF en servidor.
export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { listDocumentMasterAction } from "@/server/actions/trazadocs-master";
import { getCompanySettingsAction } from "@/server/actions/settings";
import { DocumentStatusBadge } from "@/components/domain/trazadocs/document-status-badge";
import { PrintButton } from "@/components/domain/audit-support/print-button";

export default async function DocumentMasterPrintPage() {
  const org = await requireActiveOrg();
  const [groups, { data: company }] = await Promise.all([listDocumentMasterAction(), getCompanySettingsAction()]);

  return (
    <div className="print-page space-y-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link href="/trazadocs/master" className="text-sm text-loop hover:underline">
          ← Volver al maestro de documentos
        </Link>
        <PrintButton />
      </div>

      <header className="flex items-start justify-between gap-4 border-b border-hairline pb-4">
        <div className="space-y-1">
          <p className="text-xs text-ink-soft">{org.organizationName}</p>
          {company?.legalName ? <p className="text-xs text-ink-soft">{company.legalName}</p> : null}
          {company?.taxId ? <p className="code text-xs text-ink-soft">NIT {company.taxId}</p> : null}
          <h1 className="text-xl font-semibold">Maestro de documentos</h1>
          <p className="text-xs text-ink-soft">Generado el {new Date().toLocaleDateString("es-CO")}</p>
        </div>
        {company?.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={company.logoUrl} alt={`Logo de ${org.organizationName}`} className="max-h-16 max-w-[10rem] object-contain" />
        ) : null}
      </header>

      {groups.map((group) => (
        <section key={group.categoryCode} className="space-y-2 break-inside-avoid">
          <h2 className="text-sm font-semibold">
            {group.categoryLabel} ({group.rows.length})
          </h2>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="py-1 pr-2 font-medium">Código</th>
                <th className="py-1 pr-2 font-medium">Documento</th>
                <th className="py-1 pr-2 font-medium">Tipo</th>
                <th className="py-1 pr-2 font-medium">Estado</th>
                <th className="py-1 pr-2 font-medium">Versión</th>
                <th className="py-1 pr-2 font-medium">Responsable</th>
                <th className="py-1 font-medium">Actualizado</th>
              </tr>
            </thead>
            <tbody>
              {group.rows.map((row) => (
                <tr key={`${row.sourceType}-${row.documentId}`} className="border-b border-hairline/60">
                  <td className="code py-1 pr-2">{row.code ?? "—"}</td>
                  <td className="py-1 pr-2">{row.title}</td>
                  <td className="py-1 pr-2">{row.sourceType === "live_document" ? "Vivo" : "Descargable"}</td>
                  <td className="py-1 pr-2">
                    <DocumentStatusBadge status={row.status} />
                  </td>
                  <td className="code py-1 pr-2">{row.versionLabel}</td>
                  <td className="py-1 pr-2">{row.responsibleName ?? "—"}</td>
                  <td className="py-1">{new Date(row.updatedAt).toLocaleDateString("es-CO")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      {groups.length === 0 ? <p className="text-sm text-ink-soft">Sin documentos registrados todavía.</p> : null}
    </div>
  );
}
