"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import {
  CAUSE_SOURCES, CAUSE_SOURCE_LABEL, IMPACT_AREAS, IMPACT_AREA_LABEL,
  OPPORTUNITY_KINDS, OPPORTUNITY_KIND_LABEL, RISK_ORIGINS, RISK_ORIGIN_LABEL,
  describeReview,
} from "@/lib/domain/risks";
import type { OpportunityListRow, RiskListRow } from "@/lib/db/risks";
import { createOpportunityAction, createRiskAction, type RiskActionState } from "@/server/actions/risks";
import { OpportunityBadges, ReviewBadge, RiskLevelBadge, RiskStatusBadge, TreatmentBadge } from "./risk-badges";

const initial: RiskActionState = { error: null };
const inputClass =
  "block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-soft/60 focus:border-loop";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-ink">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-ink-soft">{hint}</span> : null}
    </label>
  );
}

/**
 * Trazaloop Quality · QUALITY-05 · Riesgos y oportunidades.
 *
 * Comparten pantalla porque responden a la misma pregunta —qué nos puede
 * pasar— pero NO se mezclan en una sola lista: son objetos distintos (RO-01) y
 * se muestran en pestañas separadas, con su vocabulario y sus columnas. Una
 * lista única con una columna «tipo» dejaría de decir si algo es una amenaza o
 * una ocasión, que es lo único que de verdad importa al mirarlas.
 */
export function QualityRisksView({
  risks, opportunities, positions, processes, objectives,
  canManage, hasRiskMethodology, hasOpportunityMethodology, initialTab,
}: {
  risks: RiskListRow[];
  opportunities: OpportunityListRow[];
  positions: { id: string; name: string; holderName: string | null }[];
  processes: { id: string; name: string }[];
  objectives: { id: string; name: string }[];
  canManage: boolean;
  hasRiskMethodology: boolean;
  hasOpportunityMethodology: boolean;
  initialTab: "risks" | "opportunities";
}) {
  const [tab, setTab] = useState<"risks" | "opportunities">(initialTab);
  const [riskState, riskAction, riskPending] = useActionState(createRiskAction, initial);
  const [opState, opAction, opPending] = useActionState(createOpportunityAction, initial);
  const [filter, setFilter] = useState<"active" | "above" | "review" | "all">("active");

  const shown = risks.filter((r) => {
    if (filter === "active") return r.status === "draft" || r.status === "active";
    if (filter === "above") return r.currentIsAcceptable === false && r.status === "active";
    if (filter === "review") return r.reviewOverdue;
    return true;
  });

  const counts = {
    active: risks.filter((r) => r.status === "draft" || r.status === "active").length,
    above: risks.filter((r) => r.currentIsAcceptable === false && r.status === "active").length,
    review: risks.filter((r) => r.reviewOverdue).length,
    all: risks.length,
  };

  return (
    <div className="space-y-5">
      {/* Riesgo y oportunidad se eligen aquí, no con un desplegable dentro de
          un formulario común: son dos cosas y la pantalla lo dice. */}
      <div className="flex gap-2 border-b border-hairline">
        <TabButton active={tab === "risks"} onClick={() => setTab("risks")}>
          Riesgos · {risks.length}
        </TabButton>
        <TabButton active={tab === "opportunities"} onClick={() => setTab("opportunities")}>
          Oportunidades · {opportunities.length}
        </TabButton>
      </div>

      {tab === "risks" ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {([
              ["active", `Activos · ${counts.active}`],
              ["above", `Sobre el criterio · ${counts.above}`],
              ["review", `Revisión vencida · ${counts.review}`],
              ["all", `Todos · ${counts.all}`],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  filter === key
                    ? "border-loop bg-loop/10 text-loop-deep"
                    : "border-hairline bg-surface text-ink-soft"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {canManage ? (
            <details className="rounded-lg border border-hairline bg-surface p-4">
              <summary className="cursor-pointer text-sm font-medium text-loop">
                Identificar un riesgo
              </summary>
              <form action={riskAction} className="mt-3 space-y-3">
                <h3 className="text-sm font-semibold">Identificar un riesgo</h3>
                <ErrorAlert message={riskState.error} />
                {!hasRiskMethodology ? (
                  <p className="rounded-md border border-amber/40 bg-amber/5 p-2 text-xs text-ink">
                    Todavía no hay una metodología de riesgos publicada. Puedes identificarlo ahora
                    y evaluarlo cuando la haya: identificar y valorar son dos cosas distintas.
                  </p>
                ) : null}

                <Field label="Título" hint="Cómo lo llamaréis entre vosotros.">
                  <input name="title" required minLength={3} className={inputClass}
                         placeholder="Ej.: Interrupción de un proveedor crítico" />
                </Field>

                {/* RO-13.1 · CAUSA → EVENTO → CONSECUENCIA. Tres campos y no un
                    «descripción del riesgo», porque son tres preguntas
                    distintas y mezclarlas impide tratarlas por separado. */}
                <div className="rounded-md border border-loop/20 bg-loop/5 p-3 space-y-3">
                  <p className="text-xs text-ink-soft">
                    Un riesgo se entiende con tres partes: por qué podría pasar, qué pasaría, y
                    qué nos costaría.
                  </p>
                  <Field label="Causa o fuente" hint="Por qué podría ocurrir. Opcional ahora, se puede añadir después.">
                    <input name="cause_description" className={inputClass}
                           placeholder="Ej.: dependencia de un único proveedor" />
                  </Field>
                  <Field label="De dónde viene la causa">
                    <select name="cause_source" className={inputClass} defaultValue="external">
                      {CAUSE_SOURCES.map((s) => (
                        <option key={s} value={s}>{CAUSE_SOURCE_LABEL[s]}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Evento" hint="QUÉ podría pasar. Sin esto no hay riesgo, hay preocupación.">
                    <input name="event_description" required minLength={5} className={inputClass}
                           placeholder="Ej.: el proveedor interrumpe el suministro" />
                  </Field>
                  <Field label="Consecuencia" hint="Qué pasaría si ocurre.">
                    <input name="consequence_description" className={inputClass}
                           placeholder="Ej.: detención de la producción" />
                  </Field>
                  <Field label="Sobre qué recaería">
                    <select name="impact_area" className={inputClass} defaultValue="operational">
                      {IMPACT_AREAS.map((a) => (
                        <option key={a} value={a}>{IMPACT_AREA_LABEL[a]}</option>
                      ))}
                    </select>
                  </Field>
                </div>

                <Field label="Responsable" hint="Un CARGO, no una persona: si quien lo ocupa cambia, el riesgo conserva su dueño.">
                  <select name="owner_position_id" className={inputClass} defaultValue="">
                    <option value="">— sin asignar —</option>
                    {positions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}{p.holderName ? ` · ${p.holderName}` : ""}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Procesos afectados" hint="Puede afectar a varios. Es UN riesgo con varios procesos, no uno por proceso.">
                  <select name="process_ids" multiple size={Math.min(4, Math.max(2, processes.length))} className={inputClass}>
                    {processes.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </Field>

                {objectives.length > 0 ? (
                  <Field label="Objetivos que pondría en peligro" hint="Se referencia el objetivo; no se copia.">
                    <select name="objective_ids" multiple size={Math.min(4, Math.max(2, objectives.length))} className={inputClass}>
                      {objectives.map((o) => (
                        <option key={o.id} value={o.id}>{o.name}</option>
                      ))}
                    </select>
                  </Field>
                ) : null}

                <Field label="De dónde salió">
                  <select name="origin_kind" className={inputClass} defaultValue="manual">
                    {RISK_ORIGINS.map((o) => (
                      <option key={o} value={o}>{RISK_ORIGIN_LABEL[o]}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Contexto" hint="Lo que necesitará saber quien lo evalúe.">
                  <textarea name="context_note" rows={2} className={inputClass} />
                </Field>

                <Button type="submit" disabled={riskPending}>
                  {riskPending ? "Guardando…" : "Identificar el riesgo"}
                </Button>
              </form>
            </details>
          ) : null}

          {shown.length === 0 ? (
            <EmptyState
              title={risks.length === 0 ? "Todavía no hay riesgos identificados" : "Nada con ese filtro"}
              description={
                risks.length === 0
                  ? "Un riesgo es algo que podría pasar y afectaría al sistema de gestión. Identificarlo no significa que vaya a ocurrir."
                  : "Prueba con otro filtro."
              }
            />
          ) : (
            <ul className="space-y-2">
              {shown.map((r) => (
                <li key={r.riskId}>
                  <Link
                    href={`/quality/risks/${r.riskId}`}
                    className="block rounded-lg border border-hairline bg-surface p-3 transition-colors hover:border-loop"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-ink-soft">{r.code}</span>
                      <span className="text-sm font-semibold">{r.title}</span>
                      <RiskLevelBadge level={r.currentLevel} isAcceptable={r.currentIsAcceptable} />
                      <RiskStatusBadge status={r.status} />
                      <TreatmentBadge strategy={r.treatmentStrategy} status={r.treatmentStatus} />
                      {r.reviewOverdue ? (
                        <ReviewBadge overdue text={describeReview(r.nextReviewOn)} />
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-ink-soft">
                      {r.eventDescription}
                    </p>
                    <p className="mt-1 text-xs text-ink-soft">
                      {r.ownerPositionName ?? "Sin responsable"}
                      {r.processCount > 0
                        ? ` · ${r.processCount} ${r.processCount === 1 ? "proceso" : "procesos"}`
                        : ""}
                      {r.controlCount > 0
                        ? ` · ${r.controlCount} ${r.controlCount === 1 ? "control" : "controles"}`
                        : " · sin controles"}
                      {r.materializationCount > 0
                        ? ` · se materializó ${r.materializationCount} ${r.materializationCount === 1 ? "vez" : "veces"}`
                        : ""}
                      {r.overdueActionCount > 0
                        ? ` · ${r.overdueActionCount} ${r.overdueActionCount === 1 ? "acción vencida" : "acciones vencidas"}`
                        : ""}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <p className="text-xs text-ink-soft">
            El <strong>nivel</strong> dice cuánto preocupa; el <strong>estado</strong> dice en qué
            punto va la ficha. Son cosas distintas: un riesgo alto puede estar activo y tratado, y
            uno bajo puede estar cerrado.
          </p>
        </>
      ) : (
        <>
          {canManage ? (
            <details className="rounded-lg border border-hairline bg-surface p-4">
              <summary className="cursor-pointer text-sm font-medium text-loop">
                Identificar una oportunidad
              </summary>
              <form action={opAction} className="mt-3 space-y-3">
                <h3 className="text-sm font-semibold">Identificar una oportunidad</h3>
                <ErrorAlert message={opState.error} />
                {!hasOpportunityMethodology ? (
                  <p className="rounded-md border border-amber/40 bg-amber/5 p-2 text-xs text-ink">
                    No hay una metodología de oportunidades publicada. Las oportunidades se
                    priorizan con la suya —beneficio, viabilidad, esfuerzo—, no con la matriz de
                    riesgos.
                  </p>
                ) : null}

                <Field label="Título">
                  <input name="title" required minLength={3} className={inputClass}
                         placeholder="Ej.: Automatizar el seguimiento de revisión documental" />
                </Field>
                <Field label="Situación observada" hint="Qué has visto que abre esta posibilidad.">
                  <textarea name="situation" required minLength={5} rows={2} className={inputClass} />
                </Field>
                <Field label="Beneficio esperado" hint="Qué mejoraría si se aprovecha.">
                  <textarea name="expected_benefit" rows={2} className={inputClass} />
                </Field>
                <Field label="Tipo">
                  <select name="opportunity_kind" className={inputClass} defaultValue="improvement">
                    {OPPORTUNITY_KINDS.map((k) => (
                      <option key={k} value={k}>{OPPORTUNITY_KIND_LABEL[k]}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Responsable">
                  <select name="owner_position_id" className={inputClass} defaultValue="">
                    <option value="">— sin asignar —</option>
                    {positions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}{p.holderName ? ` · ${p.holderName}` : ""}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Procesos relacionados">
                  <select name="process_ids" multiple size={Math.min(4, Math.max(2, processes.length))} className={inputClass}>
                    {processes.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </Field>
                {objectives.length > 0 ? (
                  <Field label="Objetivos a los que contribuiría">
                    <select name="objective_ids" multiple size={Math.min(4, Math.max(2, objectives.length))} className={inputClass}>
                      {objectives.map((o) => (
                        <option key={o.id} value={o.id}>{o.name}</option>
                      ))}
                    </select>
                  </Field>
                ) : null}
                <Button type="submit" disabled={opPending}>
                  {opPending ? "Guardando…" : "Identificar la oportunidad"}
                </Button>
              </form>
            </details>
          ) : null}

          {opportunities.length === 0 ? (
            <EmptyState
              title="Todavía no hay oportunidades"
              description="Una oportunidad es una posibilidad de mejorar que alguien vio. Primero existe; después se decide qué hacer con ella."
            />
          ) : (
            <ul className="space-y-2">
              {opportunities.map((o) => (
                <li key={o.opportunityId}>
                  <Link
                    href={`/quality/risks/opportunities/${o.opportunityId}`}
                    className="block rounded-lg border border-hairline bg-surface p-3 transition-colors hover:border-loop"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-ink-soft">{o.code}</span>
                      <span className="text-sm font-semibold">{o.title}</span>
                      <OpportunityBadges
                        kind={o.opportunityKind}
                        status={o.status}
                        decision={o.treatmentDecision}
                      />
                      {o.priorityLevel ? (
                        <span className="rounded-full border border-loop/30 bg-loop/10 px-2 py-0.5 text-[11px] font-medium text-loop-deep">
                          Prioridad {o.priorityLevel}
                        </span>
                      ) : (
                        <span className="rounded-full border border-hairline bg-surface px-2 py-0.5 text-[11px] text-ink-soft">
                          Sin priorizar
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-ink-soft">{o.situation}</p>
                    <p className="mt-1 text-xs text-ink-soft">
                      {o.ownerPositionName ?? "Sin responsable"}
                      {o.actionCount > 0
                        ? ` · ${o.actionCount} ${o.actionCount === 1 ? "acción" : "acciones"}`
                        : ""}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <p className="text-xs text-ink-soft">
            Una oportunidad <strong>no es</strong> una acción de mejora. Primero se identifica y se
            prioriza; después puede originar acciones, y sigue existiendo como el motivo por el que
            se hicieron.
          </p>
        </>
      )}
    </div>
  );
}

function TabButton({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
        active ? "border-loop text-loop-deep" : "border-transparent text-ink-soft hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
