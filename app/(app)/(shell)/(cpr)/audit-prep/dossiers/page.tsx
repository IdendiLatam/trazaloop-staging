// Ruta protegida CPR (layout (cpr) aplica requireCprModule).
export const dynamic = "force-dynamic";

/**
 * PCR-03.3 (7.6) · Preparación para auditoría → Expedientes. Lista
 * (código · lote · producto · versión · fecha · estado · ejercicio) con
 * generación de nuevas versiones desde un selector ACOTADO de lotes. Si el
 * lote no tiene ejercicio completado, se recomienda ejecutar uno antes (la
 * generación no se bloquea, pero el expediente lo deja constancia).
 */
import Link from "next/link";
import { requireCprModule } from "@/lib/auth/require-cpr-module";
import { listAuditDossiers } from "@/lib/db/audit-dossier";
import { searchOutputBatchesForExercise } from "@/lib/db/traceability-exercise";
import { DOSSIER_STATUS_LABEL, DOSSIER_DISCLAIMER } from "@/lib/domain/audit-dossier";
import { GenerateDossierButton, ArchiveDossierButton } from
  "@/components/domain/audit-prep/dossier-controls";
import { ListPagination } from "@/components/ui/list-controls";
import { ExportPdfButton } from "@/components/ui/export-pdf-button";

export default async function AuditDossiersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; estado?: string; page?: string; lote_q?: string }>;
}) {
  const org = await requireCprModule();
  const params = await searchParams;
  const [result, batchOptions] = await Promise.all([
    listAuditDossiers(org.organizationId, {
      q: params.q,
      status: params.estado,
      page: params.page,
    }),
    searchOutputBatchesForExercise(org.organizationId, params.lote_q),
  ]);
  // (rev. 03.1–03.3.1, hallazgo 6) Generar y archivar están reservados
  // (7.7); la BD lo re-verifica aunque se manipule la petición.
  const canManage = org.roleCode === "admin" || org.roleCode === "quality";

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
          Preparación para auditoría
        </p>
        <h1 className="text-xl font-semibold">Expedientes</h1>
        <div className="pt-1">
          <ExportPdfButton exportKey="cpr.dossier.list" />
        </div>
        <p className="mt-1 max-w-2xl text-sm text-ink-soft">
          Expediente interno de preparación para auditoría por lote producido /
          lote final: consolida identificación, genealogía, balances, cálculo
          PCR, matriz de evidencias, cliente, calidad y brechas en una versión
          congelada e imprimible. Cada generación crea una versión NUEVA.
        </p>
        <p className="mt-2 max-w-2xl text-xs text-ink-soft">{DOSSIER_DISCLAIMER}</p>
      </header>

      {canManage ? (
      <section className="rounded-lg border border-hairline bg-surface p-5">
        <h2 className="mb-2 text-sm font-semibold">Generar expediente</h2>
        <p className="mb-3 text-xs text-ink-soft">
          Ejecuta primero un{" "}
          <Link href="/audit-prep/exercises" className="text-loop underline">
            ejercicio de trazabilidad
          </Link>{" "}
          para generar el expediente: su fotografía completada es la fuente
          autoritativa del contenido.
        </p>
        <form method="get" action="/audit-prep/dossiers" className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <input
            type="search"
            name="lote_q"
            defaultValue={params.lote_q ?? ""}
            placeholder="Buscar lote por código…"
            className="w-56 rounded-md border border-hairline bg-canvas px-3 py-1.5"
          />
          <button type="submit" className="rounded-md border border-hairline px-3 py-1.5 hover:bg-canvas">
            Buscar lote
          </button>
        </form>
        {batchOptions.length === 0 ? (
          <p className="text-xs text-ink-soft">
            {params.lote_q ? "Ningún lote coincide con la búsqueda." : "Aún no hay lotes producidos registrados."}
          </p>
        ) : (
          <ul className="divide-y divide-hairline rounded-md border border-hairline">
            {batchOptions.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="code text-sm">{b.batch_code}</span>
                <GenerateDossierButton outputBatchId={b.id} batchCode={b.batch_code} />
              </li>
            ))}
          </ul>
        )}
      </section>
      ) : (
        <p className="rounded-lg border border-hairline bg-surface p-4 text-sm text-ink-soft">
          La generación de expedientes está reservada a administración y
          calidad; puedes consultar los ya generados.
        </p>
      )}

      <div className="rounded-lg border border-hairline bg-surface p-4">
        <form method="get" action="/audit-prep/dossiers" className="flex flex-wrap items-end gap-3 text-sm">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-soft">Buscar por código</span>
            <input
              type="search"
              name="q"
              defaultValue={params.q ?? ""}
              placeholder="EXP-PCR-…"
              className="w-56 rounded-md border border-hairline bg-canvas px-3 py-1.5"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-soft">Estado</span>
            <select name="estado" defaultValue={params.estado ?? ""} className="rounded-md border border-hairline bg-canvas px-2 py-1.5">
              <option value="">Todos</option>
              {Object.entries(DOSSIER_STATUS_LABEL).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="rounded-md border border-hairline px-3 py-1.5 hover:bg-canvas">
            Filtrar
          </button>
        </form>
      </div>

      {result.rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-hairline bg-surface px-6 py-8 text-center">
          <p className="text-sm font-medium">Aún no hay expedientes generados.</p>
        </div>
      ) : (
        <ul className="divide-y divide-hairline rounded-lg border border-hairline bg-surface">
          {result.rows.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <Link href={`/audit-prep/dossiers/${d.id}`} className="code text-sm font-medium text-loop hover:underline">
                  {d.dossier_code} · v{d.version}
                </Link>
                <p className="text-xs text-ink-soft">
                  {[
                    `Lote ${d.batch_code}`,
                    d.product_label,
                    DOSSIER_STATUS_LABEL[d.status] ?? d.status,
                    new Date(d.generated_at).toLocaleString("es"),
                    d.has_exercise ? "con ejercicio asociado" : "sin ejercicio asociado",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <p className="text-xs text-ink-soft">
                  {d.gaps_count} brecha(s) · {d.warnings_count} advertencia(s)
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Link href={`/audit-prep/dossiers/${d.id}`} className="text-sm text-loop hover:underline">
                  Abrir
                </Link>
                {canManage && d.status === "generated" ? (
                  <ArchiveDossierButton dossierId={d.id} />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <ListPagination
        basePath="/audit-prep/dossiers"
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        extraParams={{ q: params.q, estado: params.estado }}
      />
    </div>
  );
}
