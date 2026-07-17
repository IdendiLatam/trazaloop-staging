// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1). Dentro del shell porque depende de
// la organización activa (Parte 7).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { listTrazadocsAction } from "@/server/actions/trazadocs";
import { DocumentList } from "@/components/domain/trazadocs/document-list";

export default async function TrazaDocsPage() {
  const documents = await listTrazadocsAction();

  const draftCount = documents.filter((d) => d.status === "draft").length;
  const inReviewCount = documents.filter((d) => d.status === "in_review").length;
  const approvedCount = documents.filter((d) => d.status === "approved").length;
  const obsoleteCount = documents.filter((d) => d.status === "obsolete").length;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="space-y-1">
        <p className="eyebrow">TrazaDocs</p>
        <h1 className="text-2xl font-semibold tracking-tight">TrazaDocs</h1>
        <p className="max-w-2xl text-sm text-ink-soft">
          Construye, edita y versiona documentos técnicos vivos dentro de Trazaloop.
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          <Link
            href="/trazadocs/new"
            className="rounded-md bg-loop px-3 py-1.5 text-sm font-semibold text-white hover:bg-loop-deep"
          >
            Nuevo documento
          </Link>
          <Link
            href="/trazadocs/master"
            className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm font-medium hover:border-loop"
          >
            Maestro de documentos
          </Link>
        </div>
      </header>

      {/* Estados */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Borrador", value: draftCount },
          { label: "En revisión", value: inReviewCount },
          { label: "Aprobado", value: approvedCount },
          { label: "Obsoleto", value: obsoleteCount },
        ].map((c) => (
          <div key={c.label} className="rounded-lg border border-hairline bg-surface p-4">
            <dd className="code text-xl font-semibold">{c.value}</dd>
            <dt className="mt-1 text-xs text-ink-soft">{c.label}</dt>
          </div>
        ))}
      </section>

      {/* Documentos de la empresa */}
      <section className="space-y-3">
        <h2 className="eyebrow">Documentos de la empresa</h2>
        <DocumentList documents={documents} />
      </section>
    </div>
  );
}
