// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { NEXT_STEP_LABEL } from "@/lib/domain/guided-flow";
import { notFound } from "next/navigation";
import { getOutputBatchGuidedDetailAction } from "@/server/actions/guided-flow";
import { ReadinessBadge } from "@/components/domain/guided-flow/readiness-badge";
import { RiskBadge } from "@/components/domain/guided-flow/risk-badge";
import { GuidedStep, type StepState } from "@/components/domain/guided-flow/guided-step";
import { DefensibilityBadge } from "@/components/domain/recycled/defensibility-badge";
import { CalculateButton } from "@/components/domain/recycled/calculate-button";
import { GAP_SEVERITY_LABEL } from "@/lib/db/audit-support";
// RH-01.3: normalización de denominación visible sobre textos de la BD.
import { normalizeVisibleText } from "@/lib/domain/nomenclature";
import {
  structuralBlockers,
  V1_HISTORICAL_ONLY_NOTE,
} from "@/lib/domain/recycled-readiness";

const linkClass = "text-loop hover:underline";

export default async function GuidedBatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { data } = await getOutputBatchGuidedDetailAction(id);
  if (!data) notFound();
  const { readiness: r, batch, composition, consumption, evidences, gaps, history } = data;
  if (!batch) notFound();

  const totalComposition = composition.reduce((sum, c) => sum + Number(c.mass_kg), 0);
  const requiredEvidences = evidences.filter((e) => e.is_required_for_defensibility);
  // (rev. 03.1–03.3.4) La vigencia la decide la vista (regla canónica 03.1):
  // una archivada sigue visible como histórica pero NO cuenta como válida,
  // para que la UI jamás contradiga la readiness SQL.
  const pendingEvidences = evidences.filter(
    (e) => e.evidence_status === "pending" && !e.archived_at
  );
  const validEvidences = evidences.filter((e) => e.is_valid_for_defensibility === true);
  const criticalGaps = gaps.filter((g) => g.gap_severity === "critical");
  const latest = history[0] ?? null;

  const evidenceState: StepState = r.has_pending_required_evidence
    ? "advertencia"
    : r.has_valid_origin_evidence && r.has_required_reclassification_evidence
      ? "completo"
      : "advertencia";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <p className="eyebrow">
          <Link href="/guided-flow" className="hover:underline">Flujo guiado</Link> · Detalle del lote
        </p>
        <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">
          <span className="code text-loop-deep">{r.output_batch_code}</span>
          <ReadinessBadge level={r.readiness_level} />
          <RiskBadge risk={Boolean(r.latest_risk_flag)} />
        </h1>
        <p className="text-sm text-ink-soft">
          Siguiente paso:{" "}
          <Link href={r.next_step_href} className="font-medium text-loop hover:underline">
            {(NEXT_STEP_LABEL[r.next_step_code] ?? normalizeVisibleText(r.next_step_label))}
          </Link>
        </p>
      </header>

      <div className="space-y-4">
        {/* Paso 1 — Lote producido / lote final */}
        <GuidedStep
          number={1}
          title="Lote producido / lote final"
          state="completo"
          actions={
            <>
              <Link href="/traceability/output-batches" className={linkClass}>Editar lote producido / lote final</Link>
              {!r.has_product ? (
                <Link href="/traceability/output-batches" className={linkClass}>Asociar producto</Link>
              ) : null}
            </>
          }
        >
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
            <div><dt className="text-xs text-ink-soft">Producto</dt><dd>{r.product_name ?? "Sin producto asociado"}</dd></div>
            <div><dt className="text-xs text-ink-soft">Fecha de producción</dt><dd>{r.produced_date ?? "—"}</dd></div>
            <div><dt className="text-xs text-ink-soft">Cantidad producida</dt><dd className="code text-xs">{batch.produced_quantity_kg !== null ? `${batch.produced_quantity_kg} kg` : "—"}</dd></div>
          </dl>
        </GuidedStep>

        {/* Paso 2 — Orden / corrida de producción */}
        <GuidedStep
          number={2}
          title="Orden / corrida de producción"
          state={r.has_production_order ? "completo" : "pendiente"}
          actions={
            <Link href="/traceability/production-orders" className={linkClass}>
              {r.has_production_order ? "Ir a orden" : "Completar orden"}
            </Link>
          }
        >
          {r.has_production_order ? (
            <p className="text-sm">
              Orden <span className="code text-xs text-loop-deep">{r.production_order_code}</span>
            </p>
          ) : (
            <p className="text-sm text-ink-soft">
              Este lote no tiene orden / corrida de producción asociada. Sin orden no hay
              consumos ni trazabilidad hacia atrás.
            </p>
          )}
        </GuidedStep>

        {/* Paso 3 — Consumos */}
        <GuidedStep
          number={3}
          title="Consumos"
          state={r.has_consumption ? "completo" : "advertencia"}
          actions={
            <>
              <Link href="/traceability/production-orders" className={linkClass}>Agregar consumo</Link>
              <Link href="/traceability" className={linkClass}>Ir a trazabilidad</Link>
            </>
          }
        >
          {consumption.length === 0 ? (
            <p className="text-sm text-amber">
              La orden no tiene consumos registrados: la trazabilidad hacia
              atrás está incompleta y el cálculo quedará como preliminar.
            </p>
          ) : (
            <ul className="space-y-1 text-sm">
              {consumption.map((c) => (
                <li key={c.id} className="flex flex-wrap justify-between gap-2">
                  <span>
                    <span className="code mr-1 text-xs text-loop-deep">{c.input_batch_code}</span>
                    {c.supplier_name} · {c.material_name}
                  </span>
                  <span className="code text-xs">{c.mass_kg} kg</span>
                </li>
              ))}
            </ul>
          )}
        </GuidedStep>

        {/* PT-02A · Aquí había un «Paso 4 · Composición» que pedía teclear a
            mano las masas del lote y bloqueaba el paso de cálculo si faltaban.
            El cálculo vigente sale de los consumos —el paso 3— y no mira la
            composición para nada, así que era un paso de trabajo que no llevaba
            a ninguna parte. Lo registrado antes se sigue enseñando, pero como
            dato histórico y fuera de la secuencia: un paso numerado afirma que
            hay algo que hacer. */}
        {composition.length > 0 ? (
          <section className="rounded-lg border border-hairline bg-canvas p-4">
            <h2 className="text-sm font-semibold">
              Composición registrada
              <span className="ml-2 text-[10px] uppercase tracking-wider text-ink-soft">
                histórico
              </span>
            </h2>
            <p className="mt-1 text-xs text-ink-soft">{V1_HISTORICAL_ONLY_NOTE}</p>
            <ul className="mt-3 space-y-1 text-sm">
              {composition.map((c) => (
                <li key={c.id} className="flex flex-wrap justify-between gap-2">
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
            <p className="mt-2 text-xs text-ink-soft">
              Total: <span className="code">{totalComposition.toFixed(2)} kg</span>
            </p>
          </section>
        ) : null}

        {/* Paso 4 — Evidencias */}
        <GuidedStep
          number={4}
          title="Evidencias"
          state={evidenceState}
          actions={
            <>
              <Link href="/evidences" className={linkClass}>Cargar evidencia</Link>
              <Link href="/evidences" className={linkClass}>Validar evidencia</Link>
              <Link href={`/audit-support/output-batches/${id}/evidence-matrix`} className={linkClass}>
                Ver matriz completa
              </Link>
            </>
          }
        >
          <dl className="grid grid-cols-2 gap-4 text-center text-sm sm:grid-cols-4">
            <div><dd className="code text-xl font-semibold">{requiredEvidences.length}</dd><dt className="text-xs text-ink-soft">Requeridas</dt></div>
            <div><dd className="code text-xl font-semibold text-amber">{pendingEvidences.length}</dd><dt className="text-xs text-ink-soft">Pendientes</dt></div>
            <div><dd className="code text-xl font-semibold text-loop-deep">{validEvidences.length}</dd><dt className="text-xs text-ink-soft">Válidas</dt></div>
            <div><dd className="code text-xl font-semibold text-danger">{criticalGaps.length}</dd><dt className="text-xs text-ink-soft">Brechas críticas</dt></div>
          </dl>
          {!r.has_valid_origin_evidence || !r.has_required_reclassification_evidence ? (
            <p className="mt-3 text-xs text-amber">
              Hay materiales elegibles cuya evidencia de soporte falta o no está
              validada: su masa no contará en el numerador hasta corregirlo.
            </p>
          ) : null}
        </GuidedStep>

        {/* Paso 5 — Cálculo */}
        <GuidedStep
          number={5}
          title="Cálculo"
          state={
            r.has_calculation
              ? r.latest_defensibility_level === "defensible" && !r.latest_risk_flag
                ? "completo"
                : "advertencia"
              : "pendiente"
          }
          actions={
            latest ? (
              <Link href={`/recycled-content/output-batches/${id}`} className={linkClass}>
                Ver detalle de cálculo
              </Link>
            ) : undefined
          }
        >
          {/* PT-02A · Antes esto decía «cuando la composición esté registrada,
              podrás calcular», y era falso: se podía calcular igual. La
              condición era de la metodología anterior. */}
          <div className="space-y-3">
              {latest ? (
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  Último cálculo:{" "}
                  {/* PT-02A · Un cálculo incompleto no tiene porcentaje. Poner
                      «0,00 %» aquí afirmaría que no hay contenido reciclado, y
                      lo que pasa es que no se sabe. */}
                  <span className="code">
                    {latest.recycled_percent === null
                      ? "sin calcular"
                      : `${latest.recycled_percent.toFixed(2)}%`}
                  </span>
                  <DefensibilityBadge level={latest.defensibility_level} />
                  <RiskBadge risk={latest.risk_flag} />
                  <span className="text-xs text-ink-soft">
                    {new Date(latest.calculated_at).toLocaleString("es-CO")} ·{" "}
                    {history.length} snapshot{history.length === 1 ? "" : "s"}
                  </span>
                </p>
              ) : (
                <p className="text-sm text-ink-soft">
                  {consumption.length > 0
                    ? "Listo para calcular: la orden tiene consumos registrados."
                    : "Sin consumos en la orden no hay de dónde salir el cálculo."}
                </p>
              )}
              <CalculateButton
                outputBatchId={id}
                hasCalculation={Boolean(latest)}
                blockers={structuralBlockers({
                  hasOrder: Boolean(r.has_production_order),
                  hasConsumption: consumption.length > 0,
                  outputBatchesInOrder: 1,
                })}
              />
          </div>
        </GuidedStep>

        {/* Paso 6 — Dossier técnico */}
        <GuidedStep
          number={6}
          title="Dossier técnico"
          state={
            r.has_dossier
              ? criticalGaps.length > 0
                ? "advertencia"
                : "completo"
              : "pendiente"
          }
          actions={
            r.latest_calculation_id ? (
              <>
                <Link href={`/audit-support/calculations/${r.latest_calculation_id}`} className={linkClass}>
                  Ver dossier técnico
                </Link>
                <Link href={`/audit-support/calculations/${r.latest_calculation_id}/print`} className={linkClass}>
                  Imprimir / guardar como PDF
                </Link>
              </>
            ) : undefined
          }
        >
          {r.has_dossier ? (
            <div className="text-sm">
              <p>
                El dossier técnico del último cálculo está disponible
                {criticalGaps.length > 0
                  ? ` con ${criticalGaps.length} brecha(s) crítica(s):`
                  : "."}
              </p>
              {criticalGaps.length > 0 ? (
                <ul className="mt-2 space-y-1 text-xs text-ink-soft">
                  {criticalGaps.map((g, i) => (
                    <li key={i}>
                      <span className="font-medium text-danger">
                        {GAP_SEVERITY_LABEL[g.gap_severity]}:
                      </span>{" "}
                      {normalizeVisibleText(g.gap_label)} —{" "}
                      {normalizeVisibleText(g.suggested_action)}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-ink-soft">
              El dossier estará disponible en cuanto exista un cálculo.
            </p>
          )}
        </GuidedStep>
      </div>
    </div>
  );
}
