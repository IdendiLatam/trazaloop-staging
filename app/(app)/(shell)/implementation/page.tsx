// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import {
  getImplementationDashboardAction,
  getImplementationChecklistAction,
  getImplementationNextActionsAction,
  listImplementationFeedbackAction,
} from "@/server/actions/implementation";
import { listLatestCalculations } from "@/lib/db/recycled";
import { getTeamOverviewAction } from "@/server/actions/team";
import { DefensibilityBadge } from "@/components/domain/recycled/defensibility-badge";
import {
  ChecklistStatusBadge,
  FeedbackSeverityBadge,
  FeedbackStatusBadge,
  FeedbackModuleBadge,
} from "@/components/domain/implementation/badges";
import { EmptyState } from "@/components/ui/empty-state";

export default async function ImplementationPage() {
  const org = await requireActiveOrg();

  const [dashboard, checklist, nextActions, calculations, recentFeedback, teamOverview] =
    await Promise.all([
      getImplementationDashboardAction(),
      getImplementationChecklistAction(),
      getImplementationNextActionsAction(),
      listLatestCalculations(org.organizationId, 8),
      listImplementationFeedbackAction(),
      getTeamOverviewAction(),
    ]);

  const topAction = nextActions[0] ?? null;

  const statCards: { label: string; value: number }[] = [
    { label: "Proveedores registrados", value: dashboard.suppliersCount },
    { label: "Materiales registrados", value: dashboard.materialsCount },
    { label: "Materiales reciclados", value: dashboard.recycledMaterialsCount },
    {
      label: "Materiales reciclados sin soporte de origen",
      value: dashboard.materialsWithoutOriginSupportCount,
    },
    { label: "Evidencias cargadas", value: dashboard.evidencesCount },
    { label: "Evidencias válidas", value: dashboard.validEvidencesCount },
    { label: "Evidencias pendientes", value: dashboard.pendingEvidencesCount },
    { label: "Lotes de entrada", value: dashboard.inputBatchesCount },
    { label: "Órdenes / corridas de producción", value: dashboard.productionOrdersCount },
    { label: "Lotes producidos / lotes finales", value: dashboard.outputBatchesCount },
    { label: "Lotes con composición", value: dashboard.outputBatchesWithCompositionCount },
    { label: "Lotes con cálculo", value: dashboard.calculatedOutputBatchesCount },
    { label: "Cálculos defendibles", value: dashboard.defensibleCalculationsCount },
    { label: "Cálculos con advertencias", value: dashboard.warningCalculationsCount },
    { label: "Cálculos preliminares", value: dashboard.preliminaryCalculationsCount },
    { label: "Brechas críticas abiertas", value: dashboard.criticalGapsCount },
    { label: "Feedback abierto", value: dashboard.openFeedbackCount },
    { label: "Feedback crítico", value: dashboard.criticalFeedbackCount },
  ];

  const hasCompanyData =
    dashboard.suppliersCount > 0 || dashboard.materialsCount > 0 || dashboard.evidencesCount > 0;
  const hasRecycledWithoutSupport =
    dashboard.recycledMaterialsCount > 0 && dashboard.materialsWithoutOriginSupportCount > 0;
  const hasNoCalculableBatches =
    dashboard.outputBatchesWithCompositionCount === 0 && dashboard.outputBatchesCount > 0;
  const hasPreliminary = dashboard.preliminaryCalculationsCount > 0;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="space-y-1">
        <p className="eyebrow">Implementación</p>
        <h1 className="text-2xl font-semibold tracking-tight">Implementación con empresa</h1>
        <p className="max-w-2xl text-sm text-ink-soft">
          Revisa el avance de datos reales, detecta brechas y registra
          feedback durante la prueba de Trazaloop.
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          <Link
            href="/imports"
            className="rounded-md bg-loop px-3 py-1.5 text-sm font-semibold text-white hover:bg-loop-deep"
          >
            Importar datos reales
          </Link>
          <Link
            href="/implementation/feedback"
            className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm font-medium hover:border-loop"
          >
            Registrar feedback
          </Link>
          <Link
            href="/guided-flow"
            className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm font-medium hover:border-loop"
          >
            Ir al flujo guiado
          </Link>
        </div>
      </header>

      {!hasCompanyData ? (
        <EmptyState
          title="No hay datos suficientes para probar el flujo completo."
          description="Empieza por catálogos, materiales y evidencias."
          actionLabel="Ir a catálogos"
          actionHref="/catalog"
        />
      ) : null}
      {hasCompanyData && hasRecycledWithoutSupport ? (
        <p className="rounded-md border border-amber/40 bg-amber/10 px-3 py-2 text-sm text-amber">
          Hay materiales reciclados, pero aún no tienen soporte de origen válido.
        </p>
      ) : null}
      {hasNoCalculableBatches ? (
        <p className="rounded-md border border-amber/40 bg-amber/10 px-3 py-2 text-sm text-amber">
          Aún no hay lotes producidos con composición suficiente para calcular
          contenido reciclado.
        </p>
      ) : null}
      {hasPreliminary ? (
        <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          Existen cálculos preliminares. Revisa brechas de soporte antes de
          usar el dossier como respaldo técnico.
        </p>
      ) : null}

      {/* 1. Estado general de implementación */}
      <section className="space-y-3">
        <h2 className="eyebrow">Estado general de implementación</h2>
        <div className="rounded-lg border border-loop/30 bg-loop/5 p-4">
          <p className="eyebrow mb-1">Organización activa</p>
          <p className="text-lg font-semibold text-loop-deep">{org.organizationName}</p>
        </div>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {statCards.map((c) => (
            <div key={c.label} className="rounded-lg border border-hairline bg-surface p-4">
              <dd className="code text-xl font-semibold">{c.value}</dd>
              <dt className="mt-1 text-xs text-ink-soft">{c.label}</dt>
            </div>
          ))}
        </dl>
      </section>

      {/* 2. Checklist de implementación real */}
      <section className="space-y-3">
        <h2 className="eyebrow">Checklist de implementación real</h2>
        <ol className="divide-y divide-hairline rounded-lg border border-hairline bg-surface">
          {checklist.map((item) => (
            <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-ink-soft">{item.id}.</span>
                  <span className="font-medium">{item.title}</span>
                  <ChecklistStatusBadge status={item.status} />
                </p>
                <p className="mt-0.5 text-xs text-ink-soft">{item.description}</p>
              </div>
              <Link
                href={item.actionHref}
                className="shrink-0 text-sm text-loop hover:underline"
              >
                {item.actionLabel} →
              </Link>
            </li>
          ))}
        </ol>
      </section>

      {/* Sprint 8: Definir equipo de prueba (tarjeta independiente del
          checklist de 17 pasos del Sprint 6 — no se modifica esa lista). */}
      <section className="space-y-3">
        <h2 className="eyebrow">Equipo</h2>
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-hairline bg-surface px-4 py-3">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">Definir equipo de prueba</span>
              <ChecklistStatusBadge status={teamOverview.checklistStatus} />
            </p>
            <p className="mt-0.5 text-xs text-ink-soft">
              {teamOverview.memberCount} miembro(s) · {teamOverview.pendingInvitationCount}{" "}
              invitación(es) pendiente(s).
            </p>
          </div>
          <Link href="/team" className="shrink-0 text-sm text-loop hover:underline">
            Ir a Equipo →
          </Link>
        </div>
      </section>

      {/* 3. Siguiente acción recomendada */}
      <section className="rounded-lg border border-loop/30 bg-surface p-5">
        <h2 className="eyebrow mb-3">Siguiente acción recomendada</h2>
        {topAction ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium">{topAction.actionLabel}</p>
              <p className="text-sm text-ink-soft">{topAction.actionDescription}</p>
            </div>
            <Link
              href={topAction.href}
              className="shrink-0 rounded-md bg-loop px-4 py-2 text-sm font-semibold text-white hover:bg-loop-deep"
            >
              {topAction.actionLabel}
            </Link>
          </div>
        ) : (
          <p className="text-sm text-ink-soft">
            No hay una acción pendiente identificada por ahora.
          </p>
        )}
      </section>

      {/* 4. Últimos cálculos y dossiers */}
      <section className="rounded-lg border border-hairline bg-surface">
        <h2 className="eyebrow border-b border-hairline px-4 py-3">Últimos cálculos y dossiers</h2>
        {calculations.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="Aún no hay lotes producidos con composición suficiente para calcular contenido reciclado."
              description="Completa trazabilidad y composición para poder calcular."
              actionLabel="Ir a lotes producidos / lotes finales"
              actionHref="/traceability/output-batches"
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs text-ink-soft">
                  <th className="px-4 py-2 font-medium">Lote producido / lote final</th>
                  <th className="px-4 py-2 font-medium">Producto</th>
                  <th className="px-4 py-2 font-medium">Porcentaje calculado</th>
                  <th className="px-4 py-2 font-medium">Defendibilidad</th>
                  <th className="px-4 py-2 font-medium">Riesgo</th>
                  <th className="px-4 py-2 font-medium">Fecha de cálculo</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {calculations.map((c) => (
                  <tr key={c.calculation_id} className="border-b border-hairline last:border-0 align-top">
                    <td className="code px-4 py-2 text-xs text-loop-deep">{c.output_batch_code}</td>
                    <td className="px-4 py-2">{c.product_name ?? "—"}</td>
                    <td className="code px-4 py-2">{c.recycled_percent.toFixed(2)}%</td>
                    <td className="px-4 py-2">
                      <DefensibilityBadge level={c.defensibility_level} />
                    </td>
                    <td className={`px-4 py-2 text-xs font-semibold ${c.risk_flag ? "text-danger" : "text-ink-soft"}`}>
                      {c.risk_flag ? "Sí" : "No"}
                    </td>
                    <td className="px-4 py-2 text-xs text-ink-soft">
                      {new Date(c.calculated_at).toLocaleDateString("es-CO")}
                    </td>
                    <td className="px-4 py-2 text-right text-xs">
                      <Link
                        href={`/recycled-content/output-batches/${c.output_batch_id}`}
                        className="text-loop hover:underline"
                      >
                        Ver cálculo
                      </Link>
                      {" · "}
                      <Link
                        href={`/audit-support/calculations/${c.calculation_id}`}
                        className="text-loop hover:underline"
                      >
                        Ver dossier
                      </Link>
                      {" · "}
                      <Link
                        href={`/implementation/feedback?module=recycled_content&related_entity_type=calculation&related_entity_id=${c.calculation_id}`}
                        className="text-loop hover:underline"
                      >
                        Registrar feedback
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 5. Feedback reciente */}
      <section className="rounded-lg border border-hairline bg-surface">
        <h2 className="eyebrow flex items-center justify-between border-b border-hairline px-4 py-3">
          <span>Feedback reciente</span>
          <Link href="/implementation/feedback" className="text-xs font-normal text-loop hover:underline">
            Ver todo
          </Link>
        </h2>
        {recentFeedback.length === 0 ? (
          <p className="px-4 py-6 text-sm text-ink-soft">
            Todavía no hay feedback registrado. Usa el botón «Registrar
            feedback» para dejar el primer hallazgo de la prueba.
          </p>
        ) : (
          <ul className="divide-y divide-hairline">
            {recentFeedback.slice(0, 8).map((f) => (
              <li key={f.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{f.title}</span>
                    <FeedbackSeverityBadge severity={f.severity} />
                    <FeedbackStatusBadge status={f.status} />
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                    <FeedbackModuleBadge module={f.module} />
                    <span>
                      {f.createdByName ?? "—"} ·{" "}
                      {new Date(f.createdAt).toLocaleDateString("es-CO")}
                    </span>
                  </p>
                </div>
                <Link
                  href="/implementation/feedback"
                  className="shrink-0 text-xs text-loop hover:underline"
                >
                  Ver / editar
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
