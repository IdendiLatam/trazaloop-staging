// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { NEXT_STEP_LABEL } from "@/lib/domain/guided-flow";
import {
  getGuidedFlowDashboardAction,
  listOutputBatchReadinessAction,
  getNextBestActionsAction,
} from "@/server/actions/guided-flow";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { ReadinessBadge } from "@/components/domain/guided-flow/readiness-badge";
import {
  ProgressStepCard,
  type ProgressStatus,
} from "@/components/domain/guided-flow/progress-step-card";
import { DefensibilityBadge } from "@/components/domain/recycled/defensibility-badge";
import { TraceabilityStatusBadge } from "@/components/domain/traceability/status-badge";
import { EmptyState } from "@/components/ui/empty-state";

export default async function GuidedFlowPage() {
  await requireActiveOrg();
  const [d, rows, nextActions] = await Promise.all([
    getGuidedFlowDashboardAction(),
    listOutputBatchReadinessAction(),
    getNextBestActionsAction(),
  ]);

  // CTA principal dinámico (spec §6.1): el usuario no adivina a dónde ir.
  const mainCta = (() => {
    if (d.suppliersCount === 0 || d.materialsCount === 0)
      return { label: "Crear catálogos básicos", href: "/catalog" };
    if (d.inputBatchesCount === 0)
      return { label: "Registrar lote de entrada", href: "/traceability/input-batches" };
    if (d.productionOrdersCount === 0)
      return { label: "Crear orden / corrida de producción", href: "/traceability/production-orders" };
    if (d.withoutConsumption > 0)
      return { label: "Agregar consumo", href: "/traceability/production-orders" };
    if (d.withoutComposition > 0)
      return { label: "Registrar composición", href: "/traceability/output-batches" };
    if (d.readyToCalculate > 0)
      return { label: "Calcular contenido reciclado", href: "/recycled-content/output-batches" };
    if (d.warningCount + d.preliminaryCount > 0 || d.criticalGapsCount > 0)
      return { label: "Revisar brechas", href: "/audit-support" };
    if (d.defensibleCount > 0)
      return { label: "Ver dossier técnico", href: "/audit-support" };
    return { label: "Registrar lote producido / lote final", href: "/traceability/output-batches" };
  })();

  const evidenceStatus: ProgressStatus =
    d.evidencesCount === 0
      ? "pendiente"
      : d.pendingEvidencesCount > 0
        ? "con advertencias"
        : "completo";

  const cards = [
    {
      step: 1,
      title: "Catálogos",
      status: (d.suppliersCount > 0 && d.materialsCount > 0
        ? "completo"
        : d.suppliersCount + d.materialsCount > 0
          ? "en progreso"
          : "pendiente") as ProgressStatus,
      lines: [
        `${d.suppliersCount} proveedores · ${d.materialsCount} materiales`,
        `${d.productsCount} productos`,
      ],
      actionLabel: "Ir a catálogos",
      actionHref: "/catalog",
    },
    {
      step: 2,
      title: "Evidencias",
      status: evidenceStatus,
      lines: [
        `${d.evidencesCount} evidencias registradas`,
        `${d.pendingEvidencesCount} pendientes de validar`,
      ],
      actionLabel: d.pendingEvidencesCount > 0 ? "Validar evidencia" : "Cargar evidencia",
      actionHref: "/evidences",
    },
    {
      step: 3,
      title: "Lotes de entrada",
      status: (d.inputBatchesCount > 0 ? "completo" : "pendiente") as ProgressStatus,
      lines: [`${d.inputBatchesCount} lotes de entrada`],
      actionLabel: "Registrar lote de entrada",
      actionHref: "/traceability/input-batches",
    },
    {
      step: 4,
      title: "Órdenes y consumos",
      status: (d.productionOrdersCount === 0
        ? "pendiente"
        : d.withoutConsumption > 0
          ? "con advertencias"
          : "completo") as ProgressStatus,
      lines: [
        `${d.productionOrdersCount} órdenes`,
        `${d.withoutConsumption} lotes con orden sin consumo`,
      ],
      actionLabel: d.withoutConsumption > 0 ? "Agregar consumo" : "Ir a órdenes",
      actionHref: "/traceability/production-orders",
    },
    {
      step: 5,
      title: "Lotes producidos / lotes finales y composición",
      status: (d.outputBatchesCount === 0
        ? "pendiente"
        : d.withoutComposition > 0
          ? "con advertencias"
          : "completo") as ProgressStatus,
      lines: [
        `${d.outputBatchesCount} lotes registrados`,
        `${d.withoutComposition} sin composición`,
      ],
      actionLabel: d.withoutComposition > 0 ? "Completar composición" : "Ir a lotes producidos / lotes finales",
      actionHref: "/traceability/output-batches",
    },
    {
      step: 6,
      title: "Cálculo",
      status: (d.calculatedCount === 0
        ? d.readyToCalculate > 0
          ? "en progreso"
          : "pendiente"
        : d.warningCount + d.preliminaryCount > 0
          ? "con advertencias"
          : "completo") as ProgressStatus,
      lines: [
        `${d.calculatedCount} lotes calculados · ${d.readyToCalculate} listos para calcular`,
        `${d.defensibleCount} defendibles · ${d.warningCount + d.preliminaryCount} con brechas`,
      ],
      actionLabel: "Calcular contenido reciclado",
      actionHref: "/recycled-content/output-batches",
    },
    {
      step: 7,
      title: "Dossier técnico",
      status: (d.calculatedCount === 0
        ? "pendiente"
        : d.criticalGapsCount > 0
          ? "con advertencias"
          : "completo") as ProgressStatus,
      lines: [
        `${d.calculatedCount} dossiers disponibles`,
        `${d.criticalGapsCount} brechas críticas`,
      ],
      actionLabel: "Ir a soporte técnico",
      actionHref: "/audit-support",
    },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="eyebrow">Flujo guiado</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Flujo guiado de contenido reciclado
          </h1>
          <p className="max-w-2xl text-sm text-ink-soft">
            Completa los datos, evidencias, trazabilidad, cálculo y soporte
            técnico en un solo recorrido.
          </p>
        </div>
        <Link
          href={mainCta.href}
          className="rounded-md bg-loop px-4 py-2 text-sm font-semibold text-white hover:bg-loop-deep"
        >
          {mainCta.label}
        </Link>
      </header>

      <div className="flex justify-end">
        <Link
          href="/implementation/feedback?module=guided_flow"
          className="text-sm text-loop hover:underline"
        >
          Registrar feedback
        </Link>
      </div>

      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <ProgressStepCard key={c.step} {...c} />
        ))}
      </dl>

      <section className="rounded-lg border border-loop/30 bg-surface p-5">
        <h2 className="eyebrow mb-3">Siguiente mejor acción</h2>
        {nextActions.length === 0 ? (
          <p className="text-sm text-ink-soft">
            No hay acciones pendientes: los lotes calculados están al día.
          </p>
        ) : (
          <ol className="space-y-3">
            {nextActions.map((a, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p>{a.description}</p>
                  <p className="text-xs text-ink-soft">{a.entityLabel}</p>
                </div>
                <Link
                  href={a.href}
                  className="shrink-0 rounded-md border border-loop bg-loop/5 px-3 py-1.5 text-sm font-medium text-loop-deep hover:bg-loop/10"
                >
                  {a.actionLabel}
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="eyebrow">Lotes producidos / lotes finales</h2>
        {rows.length === 0 ? (
          <EmptyState
            title="Aún no tienes lotes producidos / lotes finales."
            description="Registra un lote producido / lote final en Trazabilidad para empezar el recorrido hacia el cálculo y el dossier técnico."
            actionLabel="Registrar lote producido / lote final"
            actionHref="/traceability/output-batches"
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-hairline bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs text-ink-soft">
                  <th className="px-4 py-2 font-medium">Lote producido / lote final</th>
                  <th className="px-4 py-2 font-medium">Producto</th>
                  <th className="px-4 py-2 font-medium">Orden</th>
                  <th className="px-4 py-2 font-medium">Trazabilidad</th>
                  <th className="px-4 py-2 font-medium">Evidencias</th>
                  <th className="px-4 py-2 font-medium">Cálculo</th>
                  <th className="px-4 py-2 font-medium">Estado</th>
                  <th className="px-4 py-2 font-medium">Siguiente paso</th>
                  <th className="px-4 py-2 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.output_batch_id} className="border-b border-hairline align-top last:border-0">
                    <td className="code px-4 py-2 text-xs text-loop-deep">{r.output_batch_code}</td>
                    <td className="px-4 py-2">{r.product_name ?? "—"}</td>
                    <td className="code px-4 py-2 text-xs">{r.production_order_code ?? "—"}</td>
                    <td className="px-4 py-2">
                      {r.traceability_status ? (
                        <TraceabilityStatusBadge status={r.traceability_status} />
                      ) : (
                        <span className="text-xs text-ink-soft">Sin orden</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {r.has_pending_required_evidence
                        ? "Pendientes de validar"
                        : r.has_valid_origin_evidence && r.has_required_reclassification_evidence
                          ? "Soporte al día"
                          : "Faltan soportes"}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {r.has_calculation && r.latest_recycled_percent !== null ? (
                        <span className="code">{r.latest_recycled_percent.toFixed(2)}%</span>
                      ) : (
                        "Sin cálculo"
                      )}
                      {r.latest_defensibility_level ? (
                        <span className="mt-1 block">
                          <DefensibilityBadge level={r.latest_defensibility_level} />
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2">
                      <ReadinessBadge level={r.readiness_level} />
                    </td>
                    <td className="px-4 py-2 text-xs">
                      <Link href={r.next_step_href} className="text-loop hover:underline">
                        {(NEXT_STEP_LABEL[r.next_step_code] ?? r.next_step_label)}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-xs">
                      <Link
                        href={`/guided-flow/output-batches/${r.output_batch_id}`}
                        className="text-loop hover:underline"
                      >
                        Ver detalle guiado
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
