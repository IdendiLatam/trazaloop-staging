// Ruta protegida CPR (layout (cpr) aplica requireCprModule).
export const dynamic = "force-dynamic";

/**
 * PCR-03.2 (6.7) · Detalle del ejercicio de trazabilidad: las 13 secciones
 * del brief renderizadas desde el SNAPSHOT CONGELADO (no desde datos vivos):
 * lo que se ve es la fotografía histórica, con su hash. Tabla/árbol legible,
 * sin gráficas; lenguaje prudente y disclaimer obligatorio.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCprModule } from "@/lib/auth/require-cpr-module";
import { getTraceabilityExercise } from "@/lib/db/traceability-exercise";
import {
  EXERCISE_RESULT_LABEL,
  EXERCISE_STATUS_LABEL,
  FINDING_LEVEL_LABEL,
  type ExerciseSnapshot,
  type ExerciseResult,
} from "@/lib/domain/traceability-exercise";

const LEVEL_TONE: Record<string, string> = {
  info: "border-hairline bg-canvas text-ink-soft",
  warning: "border-amber-300 bg-amber-50 text-amber-900",
  gap: "border-danger/40 bg-danger/5 text-danger",
};

export default async function ExerciseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const org = await requireCprModule();
  const { id } = await params;
  const exercise = await getTraceabilityExercise(org.organizationId, id);
  if (!exercise) notFound();
  const snapshot = (exercise.snapshot ?? null) as ExerciseSnapshot | null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
          <Link href="/audit-prep/exercises" className="hover:underline">
            Preparación para auditoría · Ejercicios de trazabilidad
          </Link>
        </p>
        {/* 1 · Identificación del ejercicio */}
        <h1 className="text-xl font-semibold">
          Ejercicio de trazabilidad — lote {snapshot?.target.batch_code ?? "…"}
        </h1>
        <p className="mt-1 text-xs text-ink-soft">
          {[
            EXERCISE_STATUS_LABEL[exercise.status as string] ?? exercise.status,
            `iniciado ${new Date(exercise.started_at as string).toLocaleString("es")}`,
            exercise.completed_at
              ? `finalizado ${new Date(exercise.completed_at as string).toLocaleString("es")}`
              : null,
            exercise.completed_at
              ? `duración ${Math.max(1, Math.round((new Date(exercise.completed_at as string).getTime() - new Date(exercise.started_at as string).getTime()) / 1000))} s`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {exercise.source_hash ? (
          <p className="code mt-1 break-all text-[11px] text-ink-soft">
            Huella del snapshot (SHA-256): {exercise.source_hash as string}
          </p>
        ) : null}
      </header>

      {!snapshot ? (
        <p className="rounded-lg border border-hairline bg-surface p-5 text-sm text-ink-soft">
          Este ejercicio quedó en borrador y no tiene fotografía.
        </p>
      ) : (
        <>
          {/* 12 · Resultado interno */}
          <section className="rounded-lg border border-hairline bg-surface p-5">
            <h2 className="text-sm font-semibold">Resultado interno</h2>
            <p className="mt-1 text-lg font-semibold">
              {EXERCISE_RESULT_LABEL[snapshot.result as ExerciseResult]}
            </p>
            <p className="text-xs text-ink-soft">
              {snapshot.counts.gaps} brecha(s) documental(es) ·{" "}
              {snapshot.counts.warnings} advertencia(s)
            </p>
            {/* 13 · Disclaimer */}
            <p className="mt-3 rounded-md border border-hairline bg-canvas p-3 text-xs text-ink-soft">
              {snapshot.disclaimer}
            </p>
          </section>

          {/* 2 · Lote objetivo + 3 · Orden/corrida */}
          <section className="rounded-lg border border-hairline bg-surface p-5">
            <h2 className="mb-2 text-sm font-semibold">Lote objetivo</h2>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-ink-soft">Empresa</dt>
                <dd>{snapshot.target.organization_name}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-soft">Lote producido / lote final</dt>
                <dd className="code">{snapshot.target.batch_code}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-soft">Producto</dt>
                <dd>{snapshot.target.product_label ?? "Sin producto asociado"}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-soft">Cantidad producida</dt>
                <dd className="code">
                  {snapshot.target.produced_quantity_kg !== null
                    ? `${snapshot.target.produced_quantity_kg} kg`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-soft">Orden / corrida productora</dt>
                <dd className="code">{snapshot.chain[0]?.order ?? "—"}</dd>
              </div>
            </dl>
          </section>

          {/* 4 · Genealogía (árbol legible, multinivel) */}
          <section className="rounded-lg border border-hairline bg-surface p-5">
            <h2 className="mb-2 text-sm font-semibold">Genealogía (reconstrucción hacia atrás)</h2>
            <ol className="space-y-3">
              {snapshot.chain.map((s, i) => (
                <li key={`${s.output_batch}-${i}`} className="rounded-md border border-hairline p-3" style={{ marginLeft: `${Math.min(s.depth, 6) * 12}px` }}>
                  <p className="code text-sm font-medium">
                    Nivel {s.depth} · Lote {s.output_batch}
                    {s.order ? ` ← Orden ${s.order}` : ""}
                  </p>
                  {s.external_inputs.length > 0 ? (
                    <ul className="mt-1 space-y-0.5 text-xs text-ink-soft">
                      {s.external_inputs.map((e, j) => (
                        <li key={j}>
                          ← Lote de entrada <span className="code">{e.batch_code}</span> ·{" "}
                          {e.material ?? "material sin identificar"} ·{" "}
                          {e.supplier ?? "proveedor sin identificar"} ·{" "}
                          <span className="code">{e.mass_kg} kg</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {s.internal_inputs.length > 0 ? (
                    <ul className="mt-1 space-y-0.5 text-xs text-ink-soft">
                      {s.internal_inputs.map((e, j) => (
                        <li key={j}>
                          ← Lote producido reutilizado <span className="code">{e.batch_code}</span> ·{" "}
                          <span className="code">{e.mass_kg} kg</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {s.truncated ? (
                    <p className="mt-1 text-xs text-amber-700">
                      Profundidad máxima alcanzada: pueden existir eslabones anteriores.
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          </section>

          {/* 5 · Balance de cantidades */}
          <section className="rounded-lg border border-hairline bg-surface p-5">
            <h2 className="mb-2 text-sm font-semibold">Balance de cantidades</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead>
                  <tr className="border-b border-hairline text-xs text-ink-soft">
                    <th className="py-1.5 pr-3 font-medium">Lote</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Recibido / Producido</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Consumido</th>
                    <th className="py-1.5 text-right font-medium">Disponible</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.balances.input_batches.map((b) => (
                    <tr key={b.id} className="border-b border-hairline last:border-0">
                      <td className="code py-1.5 pr-3 text-xs">{b.batch_code} (entrada)</td>
                      <td className="code py-1.5 pr-3 text-right text-xs">{b.received_kg} kg</td>
                      <td className="code py-1.5 pr-3 text-right text-xs">{b.consumed_kg} kg</td>
                      <td className="code py-1.5 text-right text-xs">{b.available_kg} kg</td>
                    </tr>
                  ))}
                  {snapshot.balances.output_batches.map((b) => (
                    <tr key={b.id} className="border-b border-hairline last:border-0">
                      <td className="code py-1.5 pr-3 text-xs">{b.batch_code} (producido)</td>
                      <td className="code py-1.5 pr-3 text-right text-xs">{b.produced_kg} kg</td>
                      <td className="code py-1.5 pr-3 text-right text-xs">{b.consumed_internally_kg} kg</td>
                      <td className="code py-1.5 text-right text-xs">{b.available_kg} kg</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* 6 · Proveedores/materiales — resumidos en la genealogía; conteo aquí */}
          <section className="rounded-lg border border-hairline bg-surface p-5">
            <h2 className="mb-2 text-sm font-semibold">Alcance de la cadena</h2>
            <p className="text-sm text-ink-soft">
              {snapshot.counts.orders} orden(es) · {snapshot.counts.external_batches} lote(s)
              externo(s) · {snapshot.counts.internal_batches} lote(s) interno(s) ·{" "}
              {snapshot.counts.suppliers} proveedor(es) · {snapshot.counts.evidences} evidencia(s)
            </p>
          </section>

          {/* 7 · Evidencias */}
          <section className="rounded-lg border border-hairline bg-surface p-5">
            <h2 className="mb-2 text-sm font-semibold">Evidencias de la cadena</h2>
            {snapshot.evidences.length === 0 ? (
              <p className="text-sm text-ink-soft">Sin evidencias vinculadas.</p>
            ) : (
              <ul className="divide-y divide-hairline text-sm">
                {snapshot.evidences.map((e, i) => (
                  <li key={i} className="py-2">
                    <p className="font-medium">
                      {e.name}
                      {e.evidence_type ? (
                        <span className="ml-2 text-xs font-normal text-ink-soft">{e.evidence_type}</span>
                      ) : null}
                    </p>
                    <p className="text-xs text-ink-soft">
                      {[
                        e.target_label,
                        e.evidence_date ? `fecha ${e.evidence_date}` : null,
                        e.review_label,
                        e.reviewed_at
                          ? `revisada${e.reviewed_by_email ? ` por ${e.reviewed_by_email}` : ""} el ${new Date(e.reviewed_at).toLocaleDateString("es-CO")}`
                          : null,
                        e.medium === "digital"
                          ? "archivo digital"
                          : e.medium === "physical"
                            ? `registro físico${e.physical_reference ? ` (${e.physical_reference})` : ""}`
                            : "digital + físico",
                        e.physical_location ? `ubicación: ${e.physical_location}` : null,
                        e.physical_custodian ? `custodia: ${e.physical_custodian}` : null,
                        e.responsible ? `responsable: ${e.responsible}` : null,
                        e.link_role,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 8 · Requisitos de cliente */}
          <section className="rounded-lg border border-hairline bg-surface p-5">
            <h2 className="mb-2 text-sm font-semibold">Acuerdos / requisitos de cliente</h2>
            {snapshot.requirements.length === 0 ? (
              <p className="text-sm text-ink-soft">Sin acuerdos o requisitos registrados para esta cadena.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {snapshot.requirements.map((r, i) => (
                  <li key={i}>
                    <span className="code">{r.code}</span> · {r.customer_name} — {r.title}{" "}
                    <span className="text-xs text-ink-soft">
                      ({r.active ? "vigente" : "inactivo"} · {r.target_label})
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 9 · Calidad / NC / reclamos */}
          <section className="rounded-lg border border-hairline bg-surface p-5">
            <h2 className="mb-2 text-sm font-semibold">Registros de calidad, NC y reclamaciones</h2>
            {snapshot.evidences.filter((e) =>
              ["quality_control", "non_conformity", "customer_claim"].includes(e.evidence_type ?? "")
            ).length === 0 ? (
              <p className="text-sm text-ink-soft">Sin evidencias de calidad, NC o reclamaciones vinculadas.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {snapshot.evidences
                  .filter((e) =>
                    ["quality_control", "non_conformity", "customer_claim"].includes(e.evidence_type ?? "")
                  )
                  .map((e, i) => (
                    <li key={i}>
                      {e.name} <span className="text-xs text-ink-soft">({e.review_label})</span>
                    </li>
                  ))}
              </ul>
            )}
          </section>

          {/* 10 · Cálculo PCR */}
          <section className="rounded-lg border border-hairline bg-surface p-5">
            <h2 className="mb-2 text-sm font-semibold">Cálculo de contenido reciclado (PCR)</h2>
            {snapshot.calculation ? (
              <p className="text-sm">
                {snapshot.calculation.recycled_percent}% según la metodología vigente, calculado el{" "}
                {new Date(snapshot.calculation.calculated_at).toLocaleDateString("es")}.{" "}
                <Link href="/recycled-content" className="text-loop hover:underline">
                  Ver el detalle del cálculo
                </Link>
              </p>
            ) : (
              <p className="text-sm text-ink-soft">Sin cálculo disponible para este lote.</p>
            )}
          </section>

          {/* 11 · Brechas y advertencias (todas las observaciones) */}
          <section className="rounded-lg border border-hairline bg-surface p-5">
            <h2 className="mb-2 text-sm font-semibold">Observaciones del ejercicio</h2>
            <ul className="space-y-2">
              {snapshot.findings.map((f, i) => (
                <li key={i} className={`rounded-md border p-2 text-sm ${LEVEL_TONE[f.level]}`}>
                  <p>
                    <span className="text-xs font-semibold uppercase">
                      {FINDING_LEVEL_LABEL[f.level]}
                    </span>{" "}
                    · {f.message}
                  </p>
                  {f.recommendation ? (
                    <p className="mt-0.5 text-xs">Recomendación: {f.recommendation}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
