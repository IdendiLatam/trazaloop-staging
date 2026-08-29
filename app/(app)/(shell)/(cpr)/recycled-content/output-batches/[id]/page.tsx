// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { createServerClient } from "@/lib/supabase/server";
import {
  listOutputBatches,
  listComposition,
  listConsumption,
  getCompleteness,
} from "@/lib/db/traceability";
import {
  listCalculationsForBatch,
  EXCLUSION_LABEL,
  WARNING_LABEL,
} from "@/lib/db/recycled";
import {
  explainReasons,
  INCOMPLETE_TITLE,
  INCOMPLETE_LEAD,
} from "@/lib/domain/recycled-incomplete";
import {
  splitMissing,
  v2ReadinessLabel,
  V1_COMPOSITION_NOTE,
} from "@/lib/domain/recycled-readiness";
import { TraceabilityStatusBadge } from "@/components/domain/traceability/status-badge";
import { normalizeVisibleTexts } from "@/lib/domain/nomenclature";
import { DefensibilityBadge } from "@/components/domain/recycled/defensibility-badge";
import { CalculateButton } from "@/components/domain/recycled/calculate-button";
import { ExportPdfButton } from "@/components/ui/export-pdf-button";

export default async function CalculationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const org = await requireActiveOrg();
  const { id } = await params;
  const supabase = await createServerClient();

  const [batches, completeness, calculations] = await Promise.all([
    listOutputBatches(org.organizationId),
    getCompleteness(org.organizationId),
    listCalculationsForBatch(org.organizationId, id),
  ]);
  const batch = batches.find((b) => b.id === id);
  if (!batch) notFound();

  const comp = completeness.find((c) => c.output_batch_id === id) ?? null;
  const [composition, consumption, { data: evidenceLinks }] = await Promise.all([
    listComposition(org.organizationId, id),
    batch.production_order_id
      ? listConsumption(org.organizationId, batch.production_order_id)
      : Promise.resolve([]),
    supabase
      .from("evidence_links")
      .select("evidence_id, evidences(name, status)")
      .eq("organization_id", org.organizationId)
      .eq("target_type", "output_batch")
      .eq("target_id", id),
  ]);

  // PT-02A · Lo que le falta a v1 y lo que le falta a v2 son dos cosas, y la
  // pantalla las mezclaba en un único «Trazabilidad incompleta».
  const readiness = splitMissing(normalizeVisibleTexts(comp?.missing_items ?? []));
  const latest = calculations[0] ?? null;
  const history = calculations.slice(1);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">
            <Link href="/recycled-content" className="hover:underline">Contenido reciclado</Link>{" "}
            ·{" "}
            <Link href="/recycled-content/output-batches" className="hover:underline">
              Lotes producidos / lotes finales
            </Link>
          </p>
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">
            <span className="code text-loop-deep">{batch.batch_code}</span>
            {/* PT-02A · El distintivo mide la completitud de la metodología
                HISTÓRICA, que exige composición. Sin decirlo, un lote
                perfectamente calculable con v2 aparecía en rojo como
                «Trazabilidad incompleta» y la persona iba a teclear una
                composición que el cálculo no usa. */}
            {comp ? (
              <span className="inline-flex items-center gap-1.5">
                <TraceabilityStatusBadge status={comp.traceability_status} />
                <span className="text-[10px] uppercase tracking-wider text-ink-soft">
                  metodología v1
                </span>
              </span>
            ) : null}
            {comp ? (
              <span
                className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                  readiness.ready
                    ? "border-loop/30 bg-loop/5 text-loop-deep"
                    : "border-danger/30 bg-danger/5 text-danger"
                }`}
              >
                {v2ReadinessLabel(readiness)}
              </span>
            ) : null}
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            {[
              batch.product_label ?? "Sin producto asociado",
              `orden ${batch.production_order_code}`,
              batch.produced_date,
              batch.produced_quantity_kg !== null ? `${batch.produced_quantity_kg} kg producidos` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportPdfButton
            exportKey="cpr.recycled-content.detail"
            id={latest?.id ?? null}
            disabled={!latest}
            disabledReason="todavía no hay cálculo"
          />
          <CalculateButton
            outputBatchId={batch.id}
            hasCalculation={Boolean(latest)}
            disabled={composition.length === 0}
            disabledReason="La metodología v1 necesita composición registrada."
          />
        </div>
      </header>

      <div className="flex justify-end">
        <Link
          href="/support/new?module=recycled_content"
          className="text-sm text-loop hover:underline"
        >
          Crear ticket de soporte sobre este cálculo
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="rounded-lg border border-hairline bg-surface p-4">
          <h2 className="eyebrow mb-3">Composición · metodología v1</h2>
          {composition.length === 0 ? (
            <div className="space-y-1 text-sm text-ink-soft">
              <p>Sin composición registrada.</p>
              {/* No es una carencia que haya que subsanar para calcular: es un
                  dato de la metodología histórica. Decirlo evita que alguien
                  teclee cien kilos que no van a ninguna fórmula. */}
              <p className="text-xs">{V1_COMPOSITION_NOTE}</p>
              <p className="text-xs">
                <Link href={`/traceability/output-batches?batch=${batch.id}`} className="text-loop underline">
                  Registrarla de todos modos
                </Link>{" "}
                si necesitas calcular con la metodología v1.
              </p>
            </div>
          ) : (
            <ul className="space-y-1 text-sm">
              {composition.map((c) => (
                <li key={c.id} className="flex justify-between gap-2">
                  <span>
                    {c.material_name}
                    {c.is_same_process ? (
                      <span className="ml-1 text-[10px] uppercase text-ink-soft">(mismo proceso)</span>
                    ) : null}
                  </span>
                  <span className="code text-xs">{c.mass_kg} kg</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-hairline bg-surface p-4">
          <h2 className="eyebrow mb-3">Consumos de la orden · metodología v2</h2>
          {consumption.length === 0 ? (
            <p className="text-sm text-ink-soft">Sin consumos registrados.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {consumption.map((c) => (
                <li key={c.id} className="flex justify-between gap-2">
                  <span>
                    <span className="code mr-1 text-xs text-loop-deep">{c.input_batch_code}</span>
                    {c.material_name}
                  </span>
                  <span className="code text-xs">{c.mass_kg} kg</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="rounded-lg border border-hairline bg-surface p-4">
        <h2 className="eyebrow mb-3">Evidencias asociadas al lote</h2>
        {(evidenceLinks ?? []).length === 0 ? (
          <p className="text-sm text-ink-soft">Sin evidencias asociadas.</p>
        ) : (
          <ul className="flex flex-wrap gap-2 text-sm">
            {(evidenceLinks ?? []).map((l, i) => {
              const ev = l.evidences as unknown as { name: string; status: string } | null;
              return (
                <li key={i} className="rounded-md border border-hairline px-2 py-1 text-xs">
                  {ev?.name ?? "—"} · {ev?.status ?? "—"}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* PT-02A · Un cálculo INCOMPLETO no es un cálculo con ceros: es la
          respuesta correcta cuando falta un dato determinante, y se presenta
          como tal. Nunca sale un porcentaje, y nunca se pide otra vez la
          composición: v2 la deduce de los consumos. */}
      {latest && latest.result_state === "incomplete" ? (
        <section className="rounded-lg border border-amber/40 bg-amber/5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">{INCOMPLETE_TITLE}</h2>
            <span className="rounded-full border border-amber/40 bg-surface px-2 py-0.5 text-[11px] font-medium text-amber">
              Metodología v{latest.methodology_version} · sin resultado
            </span>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-ink-soft">{INCOMPLETE_LEAD}</p>

          <ul className="mt-4 space-y-3">
            {explainReasons(latest.incomplete_reasons).map((r) => (
              <li key={r.code} className="rounded-md border border-hairline bg-surface p-3">
                <p className="text-sm font-medium">{r.what}</p>
                {r.batchCodes.length > 0 ? (
                  <p className="mt-1 text-xs text-ink-soft">
                    {r.batchCodes.length === 1 ? "Lote: " : "Lotes: "}
                    <span className="code">{r.batchCodes.join(", ")}</span>
                  </p>
                ) : null}
                <p className="mt-1 text-xs text-ink-soft">{r.fix}</p>
              </li>
            ))}
          </ul>

          <p className="mt-4 text-xs text-ink-soft">
            Intentado el {new Date(latest.calculated_at).toLocaleString("es-CO")}. Este
            intento queda en el histórico: es la constancia de qué faltaba y cuándo.
          </p>
        </section>
      ) : null}

      {latest && latest.result_state === "calculated" ? (
        <section className="rounded-lg border border-loop/30 bg-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">
              Último cálculo
              <span className="ml-2 text-[10px] uppercase tracking-wider text-ink-soft">
                metodología v{latest.methodology_version}
              </span>
            </h2>
            <DefensibilityBadge level={latest.defensibility_level} />
          </div>
          {latest.defensibility_level === "preliminary" ? (
            <p className="mt-2 text-sm text-ink-soft">
              Este cálculo es preliminar.{" "}
              <Link
                href={`/audit-support/output-batches/${batch.id}/evidence-matrix`}
                className="font-medium text-loop hover:underline"
              >
                Ver causas en Soporte técnico
              </Link>
            </p>
          ) : null}

          <dl className="mt-4 grid grid-cols-2 gap-4 text-center sm:grid-cols-5">
            <div>
              <dd className="code text-xl font-semibold">{(latest.total_mass_kg ?? 0).toFixed(2)}</dd>
              <dt className="text-xs text-ink-soft">Masa total kg</dt>
            </div>
            <div>
              <dd className="code text-xl font-semibold text-loop-deep">
                {(latest.recycled_mass_kg ?? 0).toFixed(2)}
              </dd>
              <dt className="text-xs text-ink-soft">Masa reciclada kg</dt>
            </div>
            <div>
              <dd className="code text-xl font-semibold text-loop-deep">
                {(latest.recycled_percent ?? 0).toFixed(2)}%
              </dd>
              <dt className="text-xs text-ink-soft">Calculado</dt>
            </div>
            <div>
              <dd className="code text-xl font-semibold">
                {latest.declared_percent !== null ? `${latest.declared_percent.toFixed(2)}%` : "—"}
              </dd>
              <dt className="text-xs text-ink-soft">Declarado</dt>
            </div>
            <div>
              <dd className={`code text-xl font-semibold ${latest.risk_flag ? "text-danger" : "text-ink"}`}>
                {latest.risk_flag ? "Sí" : "No"}
              </dd>
              <dt className="text-xs text-ink-soft">Riesgo declarado</dt>
            </div>
          </dl>

          {/* PCR-02.5 (Bloque E, §19–§21): transparencia del cálculo. El
              porcentaje nunca aparece «sin explicación»: cuando hay masa
              elegible excluida por falta de soporte, se dice cuánta es, se
              recuerda que PERMANECE en la masa total (regla del denominador
              §20 — confirmada en calculate_recycled_content, que acumula
              v_total incondicionalmente) y la tabla de componentes detalla
              el motivo fila a fila. La metodología NO cambia. */}
          {(() => {
            const excludedForSupport = latest.components.filter(
              (c) =>
                !c.counted &&
                (c.exclusion_reason === "missing_origin_support" ||
                  c.exclusion_reason === "origin_support_not_valid" ||
                  c.exclusion_reason === "invalid_reclassification_support")
            );
            if (excludedForSupport.length === 0) return null;
            const excludedMass = excludedForSupport.reduce((acc, c) => acc + c.mass_kg, 0);
            return (
              <div className="mt-4 rounded-md border border-hairline bg-canvas px-3 py-2">
                <p className="text-xs font-semibold">
                  ¿Por qué el porcentaje no es mayor?
                </p>
                <p className="mt-1 text-xs text-ink-soft">
                  {excludedMass.toFixed(2)} kg de material elegible no cuentan
                  como contenido reciclado porque su evidencia soporte falta o
                  no está validada. Esa masa NO se descarta: sigue sumando en
                  la masa total del lote ({(latest.total_mass_kg ?? 0).toFixed(2)} kg,
                  el denominador), por eso reduce el porcentaje en lugar de
                  desaparecer del balance. El detalle por material está en la
                  tabla: columna «¿Cuenta?» y su razón de exclusión. Al
                  validar la evidencia y recalcular, la masa pasa al
                  numerador.
                </p>
              </div>
            );
          })()}

          {latest.warnings.length > 0 ? (
            <div className="mt-4 rounded-md border border-amber/40 bg-amber/10 px-3 py-2">
              <p className="text-xs font-semibold text-amber">Advertencias</p>
              <ul className="mt-1 list-inside list-disc text-xs text-amber">
                {latest.warnings.map((w) => (
                  <li key={w}>{WARNING_LABEL[w] ?? w}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs text-ink-soft">
                  <th className="py-2 pr-3 font-medium">Material</th>
                  <th className="py-2 pr-3 font-medium">Masa kg</th>
                  <th className="py-2 pr-3 font-medium">Clasificación</th>
                  <th className="py-2 pr-3 font-medium">Soporte</th>
                  <th className="py-2 pr-3 font-medium">¿Cuenta?</th>
                  <th className="py-2 font-medium">Razón de exclusión</th>
                </tr>
              </thead>
              <tbody>
                {latest.components.map((c) => (
                  <tr key={c.material_id} className="border-b border-hairline last:border-0 align-top">
                    <td className="py-2 pr-3">{c.material_name}</td>
                    <td className="code py-2 pr-3 text-xs">{c.mass_kg}</td>
                    <td className="py-2 pr-3 text-xs">
                      {c.effective_classification}
                      {c.effective_classification !== c.classification_code ? (
                        <span className="block text-[10px] text-ink-soft">
                          reclasificado desde {c.classification_code}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 text-xs">
                      {c.reclassification_support_status ??
                        c.origin_support_status ??
                        "—"}
                    </td>
                    <td className={`py-2 pr-3 text-xs font-semibold ${c.counted ? "text-loop-deep" : "text-danger"}`}>
                      {c.counted ? "Sí" : "No"}
                    </td>
                    <td className="py-2 text-xs text-ink-soft">
                      {c.exclusion_reason
                        ? EXCLUSION_LABEL[c.exclusion_reason] ?? c.exclusion_reason
                        : "Incluido en el numerador"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs text-ink-soft">
            Calculado el {new Date(latest.calculated_at).toLocaleString("es-CO")}. Las
            reglas de la metodología quedaron congeladas dentro del snapshot.
          </p>
        </section>
      ) : (
        <p className="rounded-lg border border-hairline bg-surface p-4 text-sm text-ink-soft">
          Este lote aún no tiene cálculos.
        </p>
      )}

      {history.length > 0 ? (
        <section className="rounded-lg border border-hairline bg-surface p-4">
          <h2 className="eyebrow mb-3">Historial de cálculos</h2>
          <ul className="divide-y divide-hairline text-sm">
            {history.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-xs text-ink-soft">
                  {new Date(c.calculated_at).toLocaleString("es-CO")}
                </span>
                <span className="code">
                  {c.recycled_percent === null
                    ? "incompleto"
                    : `${c.recycled_percent.toFixed(2)}%`}
                </span>
                <span className="text-[10px] uppercase tracking-wider text-ink-soft">
                  metodología v{c.methodology_version}
                </span>
                {c.recycled_percent === null ? null : (
                  <DefensibilityBadge level={c.defensibility_level} />
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-soft">
            Los snapshots anteriores se conservan intactos: nada se sobrescribe.
          </p>
        </section>
      ) : null}
    </div>
  );
}
