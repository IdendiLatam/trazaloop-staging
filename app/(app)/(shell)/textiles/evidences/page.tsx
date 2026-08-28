// Ruta protegida (guard del módulo en el layout del namespace /textiles).
export const dynamic = "force-dynamic";

// Trazaloop · Sprint T5 (Textil) · Centro de evidencias textiles.

import Link from "next/link";
import { requireTextilesModule } from "@/lib/auth/require-textiles-module";
import { searchTextileEvidences } from "@/lib/db/textiles-evidences";
import {
  TEXTILE_EVIDENCE_TYPES,
  TEXTILE_EVIDENCE_TYPE_LABEL,
  TEXTILE_EVIDENCE_STATUSES,
  TEXTILE_EVIDENCE_STATUS_LABEL,
  TEXTILE_EVIDENCES_DISCLAIMER,
  isTextileEvidenceExpired,
} from "@/lib/domain/textiles-evidences";
import { isOneOf } from "@/lib/domain/textiles-catalogs";
import { ExportPdfButton } from "@/components/ui/export-pdf-button";
import { ListSearchForm, ListPagination } from "@/components/ui/list-controls";

const STATUS_TONE: Record<string, string> = {
  pending_review: "border-amber/40 bg-amber/10 text-amber",
  accepted: "border-loop/30 bg-loop/5 text-loop-deep",
  rejected: "border-danger/30 bg-danger/5 text-danger",
  expired: "border-danger/30 bg-danger/5 text-danger",
  archived: "border-hairline bg-paper text-ink-soft",
};

export default async function TextileEvidencesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const org = await requireTextilesModule();
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  const typeFilter = isOneOf(TEXTILE_EVIDENCE_TYPES, one(params.type) ?? "") ? one(params.type) : undefined;
  const statusFilter = isOneOf(TEXTILE_EVIDENCE_STATUSES, one(params.status) ?? "") ? one(params.status) : undefined;

  // PT-01 · Una página con su total al lado. La búsqueda y los dos filtros van
  // en el servidor sobre TODO el conjunto autorizado: filtrar después de
  // paginar habría devuelto «los resultados de la página uno».
  const q = one(params.q) ?? "";
  const { rows: evidences, total, page, pageSize } = await searchTextileEvidences(
    org.organizationId,
    { evidenceType: typeFilter, status: statusFilter, q, page: one(params.page) }
  );

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-1">
        <p className="eyebrow">Trazaloop Textiles · Evidencias</p>
        <h1 className="text-2xl font-semibold tracking-tight">Evidencias textiles</h1>
        <div>
          <ExportPdfButton exportKey="textiles.evidence.list" disabled={total === 0} disabledReason="no hay evidencias" />
        </div>
        <p className="max-w-2xl text-sm text-ink-soft">
          Carga y vincula soportes documentales para composición, origen, proveedores,
          procesos y declaraciones preliminares.
        </p>
        <p className="max-w-2xl text-xs text-ink-soft">{TEXTILE_EVIDENCES_DISCLAIMER}</p>
        <div className="flex flex-wrap gap-4 pt-1 text-sm font-medium">
          <Link
            href="/textiles/evidences/new"
            className="rounded-md border border-loop/40 bg-loop/5 px-3 py-1 text-loop-deep hover:border-loop"
          >
            + Cargar evidencia
          </Link>
          <Link href="/textiles" className="text-loop hover:underline">
            ← Módulo Textil
          </Link>
        </div>
      </header>

      <ListSearchForm
        basePath="/textiles/evidences"
        q={q}
        placeholder="Buscar evidencias por título…"
        hiddenParams={{ type: typeFilter, status: statusFilter }}
      />

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border border-hairline bg-surface p-3 text-sm">
        {/* Un submit GET envía solo sus campos: sin esto, filtrar borraría la
            búsqueda escrita. */}
        {q ? <input type="hidden" name="q" value={q} /> : null}
        <label className="space-y-1">
          <span className="block text-xs font-medium text-ink-soft">Tipo</span>
          <select name="type" defaultValue={typeFilter ?? ""} className="rounded-md border border-hairline bg-paper px-2 py-1">
            <option value="">Todos</option>
            {TEXTILE_EVIDENCE_TYPES.map((t) => (
              <option key={t} value={t}>
                {TEXTILE_EVIDENCE_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-medium text-ink-soft">Estado</span>
          <select name="status" defaultValue={statusFilter ?? ""} className="rounded-md border border-hairline bg-paper px-2 py-1">
            <option value="">Todos</option>
            {TEXTILE_EVIDENCE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {TEXTILE_EVIDENCE_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="rounded-md border border-hairline bg-paper px-3 py-1 text-xs font-medium hover:border-loop">
          Filtrar
        </button>
      </form>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Evidencias ({total})</h2>
        {evidences.length === 0 ? (
          <p className="rounded-lg border border-hairline bg-surface p-4 text-sm text-ink-soft">
            No hay evidencias con esos criterios. Carga la primera con el botón de arriba.
          </p>
        ) : (
          <ul className="space-y-2">
            {evidences.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/textiles/evidences/${e.id}`}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-hairline bg-surface p-3 text-sm transition-colors hover:border-loop"
                >
                  <span className="min-w-0 space-y-0.5">
                    <span className="block font-medium">{e.title}</span>
                    <span className="block text-xs text-ink-soft">
                      {[
                        TEXTILE_EVIDENCE_TYPE_LABEL[e.evidenceType as keyof typeof TEXTILE_EVIDENCE_TYPE_LABEL] ?? e.evidenceType,
                        e.issuer ? `Emisor: ${e.issuer}` : "",
                        e.documentDate ?? "",
                        e.validUntil ? `Vigente hasta ${e.validUntil}` : "",
                        e.fileName ?? "",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    {isTextileEvidenceExpired(e.validUntil) && e.status !== "expired" ? (
                      <span className="block text-xs text-danger">
                        La vigencia terminó: considera marcarla como vencida.
                      </span>
                    ) : null}
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_TONE[e.status] ?? STATUS_TONE.archived}`}>
                      {TEXTILE_EVIDENCE_STATUS_LABEL[e.status as keyof typeof TEXTILE_EVIDENCE_STATUS_LABEL] ?? e.status}
                    </span>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] ${e.linkCount > 0 ? "border-loop/30 bg-loop/5 text-loop-deep" : "border-amber/40 bg-amber/10 text-amber"}`}>
                      {e.linkCount > 0 ? `Vinculada (${e.linkCount})` : "Sin vínculos"}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <ListPagination
        basePath="/textiles/evidences"
        page={page}
        pageSize={pageSize}
        total={total}
        extraParams={{ q: q || undefined, type: typeFilter, status: statusFilter }}
      />
    </div>
  );
}
