// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { getOutputBatchGuidedDetailAction } from "@/server/actions/guided-flow";
import { ReadinessBadge } from "@/components/domain/guided-flow/readiness-badge";
import { RiskBadge } from "@/components/domain/guided-flow/risk-badge";
import { GuidedStep, type StepState } from "@/components/domain/guided-flow/guided-step";
import { DefensibilityBadge } from "@/components/domain/recycled/defensibility-badge";
import { CalculateButton } from "@/components/domain/recycled/calculate-button";
import { EmptyState } from "@/components/ui/empty-state";
import { GAP_SEVERITY_LABEL } from "@/lib/db/audit-support";

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
  const pendingEvidences = evidences.filter((e) => e.evidence_status === "pending");
  const validEvidences = evidences.filter((e) => e.evidence_status === "valid");
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
            {r.next_step_label}
          </Link>
        </p>
      </header>

      <div className="space-y-4">
        {/* Paso 1 — Lote de salida */}
        <GuidedStep
          number={1}
          title="Lote de salida"
          state="completo"
          actions={
            <>
              <Link href="/traceability/output-batches" className={linkClass}>Editar lote de salida</Link>
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

        {/* Paso 2 — Orden de producción */}
        <GuidedStep
          number={2}
          title="Orden de producción"
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
              Este lote no tiene orden de producción asociada. Sin orden no hay
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

        {/* Paso 4 — Composición */}
        <GuidedStep
          number={4}
          title="Composición"
          state={r.has_composition ? "completo" : "advertencia"}
          actions={
            <Link href="/traceability/output-batches" className={linkClass}>
              {r.has_composition ? "Editar composición" : "Agregar componente"}
            </Link>
          }
        >
          {composition.length === 0 ? (
            <EmptyState
              title="Este lote aún no tiene composición."
              description="La composición es necesaria para calcular el contenido reciclado."
              actionLabel="Agregar composición"
              actionHref="/traceability/output-batches"
            />
          ) : (
            <>
              <ul className="space-y-1 text-sm">
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
                Total composición: <span className="code">{totalComposition.toFixed(2)} kg</span>
              </p>
            </>
          )}
        </GuidedStep>

        {/* Paso 5 — Evidencias */}
        <GuidedStep
          number={5}
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

        {/* Paso 6 — Cálculo */}
        <GuidedStep
          number={6}
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
          {!r.has_composition ? (
            <EmptyState
              title="Este lote todavía no tiene cálculo."
              description="Cuando la composición esté registrada, podrás calcular el contenido reciclado y generar un dossier técnico."
              actionLabel="Registrar composición"
              actionHref="/traceability/output-batches"
            />
          ) : (
            <div className="space-y-3">
              {latest ? (
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  Último cálculo:{" "}
                  <span className="code">{latest.recycled_percent.toFixed(2)}%</span>
                  <DefensibilityBadge level={latest.defensibility_level} />
                  <RiskBadge risk={latest.risk_flag} />
                  <span className="text-xs text-ink-soft">
                    {new Date(latest.calculated_at).toLocaleString("es-CO")} ·{" "}
                    {history.length} snapshot{history.length === 1 ? "" : "s"}
                  </span>
                </p>
              ) : (
                <p className="text-sm text-ink-soft">
                  Listo para calcular: hay composición registrada.
                </p>
              )}
              <CalculateButton outputBatchId={id} hasCalculation={Boolean(latest)} />
            </div>
          )}
        </GuidedStep>

        {/* Paso 7 — Dossier técnico */}
        <GuidedStep
          number={7}
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
                      {g.gap_label} — {g.suggested_action}
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
