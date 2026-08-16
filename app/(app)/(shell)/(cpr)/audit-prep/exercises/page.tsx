// Ruta protegida CPR (layout (cpr) aplica requireCprModule).
export const dynamic = "force-dynamic";

/**
 * PCR-03.2 (6.7) · Preparación para auditoría → Ejercicios de trazabilidad.
 * Lista paginada con filtro por estado, búsqueda por lote y arranque del
 * ejercicio desde un selector ACOTADO (máx. 20 opciones por búsqueda). El
 * ejercicio usa los datos reales ya registrados: nada se vuelve a teclear.
 */
import Link from "next/link";
import { requireCprModule } from "@/lib/auth/require-cpr-module";
import {
  listTraceabilityExercises,
  searchOutputBatchesForExercise,
} from "@/lib/db/traceability-exercise";
import {
  EXERCISE_RESULT_LABEL,
  EXERCISE_STATUS_LABEL,
  EXERCISE_DISCLAIMER,
} from "@/lib/domain/traceability-exercise";
import { StartExerciseButton, ArchiveExerciseButton } from
  "@/components/domain/audit-prep/exercise-controls";
import { ListPagination } from "@/components/ui/list-controls";

export default async function TraceabilityExercisesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; estado?: string; page?: string; lote_q?: string }>;
}) {
  const org = await requireCprModule();
  const params = await searchParams;
  const [result, batchOptions] = await Promise.all([
    listTraceabilityExercises(org.organizationId, {
      q: params.q,
      status: params.estado,
      page: params.page,
    }),
    searchOutputBatchesForExercise(org.organizationId, params.lote_q),
  ]);
  const canArchive = org.roleCode === "admin" || org.roleCode === "quality";

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
          Preparación para auditoría
        </p>
        <h1 className="text-xl font-semibold">Ejercicios de trazabilidad</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-soft">
          Selecciona un lote producido / lote final y reconstruye su
          trazabilidad hacia atrás con los datos reales de Trazaloop:
          genealogía, cantidades, evidencias, requisitos de cliente y cálculo
          PCR. Cada ejercicio queda congelado como fotografía histórica.
        </p>
        <p className="mt-2 max-w-2xl text-xs text-ink-soft">{EXERCISE_DISCLAIMER}</p>
      </header>

      <section className="rounded-lg border border-hairline bg-surface p-5">
        <h2 className="mb-2 text-sm font-semibold">Iniciar ejercicio de trazabilidad</h2>
        <form method="get" action="/audit-prep/exercises" className="mb-3 flex flex-wrap items-center gap-2 text-sm">
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
            {params.lote_q
              ? "Ningún lote coincide con la búsqueda."
              : "Aún no hay lotes producidos registrados."}
          </p>
        ) : (
          <ul className="divide-y divide-hairline rounded-md border border-hairline">
            {batchOptions.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="code text-sm">
                  {b.batch_code}
                  {b.produced_quantity_kg !== null ? (
                    <span className="ml-2 text-xs text-ink-soft">{b.produced_quantity_kg} kg</span>
                  ) : null}
                </span>
                <StartExerciseButton outputBatchId={b.id} batchCode={b.batch_code} />
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[11px] text-ink-soft">
          Se muestran hasta 20 lotes por búsqueda; afina el código si no ves el
          tuyo.
        </p>
      </section>

      <div className="rounded-lg border border-hairline bg-surface p-4">
        <form method="get" action="/audit-prep/exercises" className="flex flex-wrap items-end gap-3 text-sm">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-soft">Buscar por lote</span>
            <input
              type="search"
              name="q"
              defaultValue={params.q ?? ""}
              placeholder="Código del lote…"
              className="w-56 rounded-md border border-hairline bg-canvas px-3 py-1.5"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-soft">Estado</span>
            <select name="estado" defaultValue={params.estado ?? ""} className="rounded-md border border-hairline bg-canvas px-2 py-1.5">
              <option value="">Todos</option>
              {Object.entries(EXERCISE_STATUS_LABEL).map(([v, l]) => (
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
          <p className="text-sm font-medium">Aún no hay ejercicios de trazabilidad.</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-soft">
            Inicia el primero desde el selector de lotes de arriba.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-hairline rounded-lg border border-hairline bg-surface">
          {result.rows.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <Link href={`/audit-prep/exercises/${e.id}`} className="code text-sm font-medium text-loop hover:underline">
                  {e.batch_code}
                </Link>
                <p className="text-xs text-ink-soft">
                  {[
                    EXERCISE_STATUS_LABEL[e.status] ?? e.status,
                    e.result ? EXERCISE_RESULT_LABEL[e.result] : null,
                    `iniciado ${new Date(e.started_at).toLocaleString("es")}`,
                    e.started_by_email ? `por ${e.started_by_email}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <p className="text-xs text-ink-soft">
                  {e.gaps_count} brecha(s) · {e.warnings_count} advertencia(s)
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Link href={`/audit-prep/exercises/${e.id}`} className="text-sm text-loop hover:underline">
                  Ver
                </Link>
                {canArchive && e.status === "completed" ? (
                  <ArchiveExerciseButton exerciseId={e.id} />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <ListPagination
        basePath="/audit-prep/exercises"
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        extraParams={{ q: params.q, estado: params.estado }}
      />
    </div>
  );
}
