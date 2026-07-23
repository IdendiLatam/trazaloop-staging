// Ruta protegida (guard del módulo en el layout del namespace /textiles).
export const dynamic = "force-dynamic";

// Trazaloop · Sprint T5 (Textil) · Centro de evidencias textiles.

import Link from "next/link";
import { requireTextilesModule } from "@/lib/auth/require-textiles-module";
import { listTextileEvidences } from "@/lib/db/textiles-evidences";
import {
  TEXTILE_EVIDENCE_TYPES,
  TEXTILE_EVIDENCE_TYPE_LABEL,
  TEXTILE_EVIDENCE_STATUSES,
  TEXTILE_EVIDENCE_STATUS_LABEL,
  TEXTILE_EVIDENCES_DISCLAIMER,
  isTextileEvidenceExpired,
} from "@/lib/domain/textiles-evidences";
import { isOneOf } from "@/lib/domain/textiles-catalogs";

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
  searchParams: Promise<{ type?: string; status?: string }>;
}) {
  const params = await searchParams;
  const org = await requireTextilesModule();

  const typeFilter = isOneOf(TEXTILE_EVIDENCE_TYPES, params.type ?? "") ? params.type : undefined;
  const statusFilter = isOneOf(TEXTILE_EVIDENCE_STATUSES, params.status ?? "") ? params.status : undefined;

  const evidences = await listTextileEvidences(org.organizationId, {
    evidenceType: typeFilter,
    status: statusFilter,
  });

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-1">
        <p className="eyebrow">Trazaloop Textiles · Evidencias</p>
        <h1 className="text-2xl font-semibold tracking-tight">Evidencias textiles</h1>
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

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border border-hairline bg-surface p-3 text-sm">
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
        <h2 className="text-sm font-semibold">Evidencias ({evidences.length})</h2>
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
    </div>
  );
}
