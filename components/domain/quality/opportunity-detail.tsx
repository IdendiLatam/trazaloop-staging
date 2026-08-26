"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/alert";
import {
  OPPORTUNITY_DECISIONS, OPPORTUNITY_DECISION_HINT, OPPORTUNITY_DECISION_LABEL,
  OPPORTUNITY_ASSESSMENT_KIND_LABEL, explainDerivation,
  type OpportunityDecision,
} from "@/lib/domain/risks";
import type { MethodologyVersionRow, OpportunityDetail } from "@/lib/db/risks";
import type { DeletionEligibility } from "@/lib/domain/lifecycle";
import {
  assessOpportunityAction, decideOpportunityAction, deleteOpportunityAction,
  type RiskActionState,
} from "@/server/actions/risks";
import { ACTION_STATUS_LABEL, type ActionStatus } from "@/lib/domain/work-cases";
import { LifecyclePanel } from "./lifecycle-panel";
import { PlanActionForm } from "./risk-detail";
import { OpportunityBadges } from "./risk-badges";

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

function Step({ n, title, question, children }: { n: string; title: string; question: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-hairline bg-surface p-4">
      <div className="flex items-baseline gap-2">
        <span className="rounded-full border border-loop/30 bg-loop/5 px-2 py-0.5 text-[11px] font-medium text-loop-deep">{n}</span>
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <p className="mt-0.5 text-xs text-ink-soft">{question}</p>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

/**
 * QUALITY-05 · Ficha de una oportunidad.
 *
 * Deliberadamente distinta de la del riesgo, aunque el motor de valoración sea
 * el mismo. Una oportunidad no tiene inherente ni residual ni controles: tiene
 * una situación, un beneficio esperado, una prioridad y una decisión. Copiar
 * aquí la ficha de riesgos habría obligado a rellenar campos que no significan
 * nada, y eso es lo que produce sistemas que nadie usa.
 *
 * Y en ningún punto se presenta como una no conformidad: es lo contrario de
 * una.
 */
export function QualityOpportunityDetail({
  opportunity, version, positions, eligibility, canManage, canGovern,
}: {
  opportunity: OpportunityDetail;
  version: MethodologyVersionRow | null;
  positions: { id: string; name: string; holderName: string | null }[];
  eligibility: DeletionEligibility;
  canManage: boolean;
  canGovern: boolean;
}) {
  const priority = opportunity.assessments.find((a) => a.kind === "prioritization") ?? null;
  const benefit = opportunity.assessments.find((a) => a.kind === "realized_benefit") ?? null;
  const open = opportunity.status !== "closed" && opportunity.status !== "discarded";

  return (
    <div className="max-w-4xl space-y-4">
      <header className="space-y-2">
        <Link href="/quality/risks?vista=oportunidades" className="text-xs font-medium text-loop hover:underline">
          ← Volver a Oportunidades
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-ink-soft">{opportunity.code}</span>
          <h1 className="text-xl font-semibold tracking-tight">{opportunity.title}</h1>
          <OpportunityBadges
            kind={opportunity.opportunityKind}
            status={opportunity.status}
            decision={opportunity.treatmentDecision}
          />
        </div>
        <p className="text-sm text-ink-soft">
          Identificada el {opportunity.identifiedOn} · Responsable:{" "}
          {opportunity.ownerPositionName ?? "sin asignar"}
        </p>
      </header>

      <Step n="Paso 1" title="Qué se vio" question="¿Cuál es la situación y qué mejoraría?">
        <div className="space-y-2 text-sm">
          <div>
            <span className="text-xs font-medium uppercase tracking-wide text-ink-soft">Situación</span>
            <p className="mt-0.5 text-ink">{opportunity.situation}</p>
          </div>
          {opportunity.expectedBenefit ? (
            <div>
              <span className="text-xs font-medium uppercase tracking-wide text-ink-soft">Beneficio esperado</span>
              <p className="mt-0.5 text-ink">{opportunity.expectedBenefit}</p>
            </div>
          ) : null}
          {opportunity.processes.length > 0 ? (
            <p className="text-xs text-ink-soft">
              Procesos: {opportunity.processes.map((p) => p.name).join(" · ")}
            </p>
          ) : null}
          {opportunity.objectives.length > 0 ? (
            <p className="text-xs text-ink-soft">
              Contribuiría a: {opportunity.objectives.map((o) => o.name).join(" · ")}
            </p>
          ) : null}
        </div>
      </Step>

      <Step n="Paso 2" title="Priorización" question="¿Cuánto vale la pena y cuánto cuesta?">
        {priority ? (
          <AssessmentBlock a={priority} version={version} />
        ) : (
          <p className="text-sm text-ink-soft">Sin priorizar todavía.</p>
        )}
        {canManage && open ? (
          <AssessForm opportunity={opportunity} version={version} kind="prioritization" />
        ) : null}
      </Step>

      <Step n="Paso 3" title="Decisión" question="¿Qué hacemos con ella?">
        {opportunity.treatmentDecision ? (
          <div className="rounded-md border border-hairline p-3">
            <p className="text-sm font-medium">
              {OPPORTUNITY_DECISION_LABEL[opportunity.treatmentDecision]}
            </p>
            {opportunity.treatmentRationale ? (
              <p className="mt-1 text-xs text-ink">{opportunity.treatmentRationale}</p>
            ) : null}
            <p className="mt-1 text-xs text-ink-soft">Decidido el {opportunity.decidedOn}</p>
          </div>
        ) : (
          <p className="text-sm text-ink-soft">Todavía no se ha decidido.</p>
        )}
        {canGovern && open ? <DecideForm opportunityId={opportunity.opportunityId} /> : null}
      </Step>

      <Step n="Paso 4" title="Acciones de mejora" question="¿Qué se hará, y quién?">
        {opportunity.actions.length === 0 ? (
          <p className="text-sm text-ink-soft">
            Todavía no hay acciones. Se crean desde{" "}
            <Link href="/quality/cases" className="text-loop hover:underline">Casos y acciones</Link>{" "}
            y referencian esta oportunidad. La oportunidad sigue existiendo como el motivo por el
            que se hicieron: no se convierte en la acción.
          </p>
        ) : (
          <ul className="space-y-1">
            {opportunity.actions.map((a) => (
              <li key={a.actionId} className="rounded-md border border-hairline p-2 text-sm">
                <span className="font-mono text-[11px] text-ink-soft">{a.code}</span> {a.title}
                <span className="text-xs text-ink-soft">
                  {" "}· {ACTION_STATUS_LABEL[a.status as ActionStatus] ?? a.status}
                  {a.dueOn ? ` · vence el ${a.dueOn}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
        {canManage && open ? (
          <PlanActionForm
            hiddenName="opportunity_id" hiddenValue={opportunity.opportunityId} positions={positions}
            hint="La oportunidad no se convierte en la acción: sigue existiendo como el motivo por el que se hizo."
          />
        ) : null}
      </Step>

      {opportunity.status === "implemented" || opportunity.status === "in_progress" ? (
        <Step n="Paso 5" title="Beneficio obtenido" question="¿Sirvió de algo?">
          {benefit ? (
            <AssessmentBlock a={benefit} version={version} />
          ) : (
            <p className="text-sm text-ink-soft">
              Todavía no se ha comprobado el beneficio real. Es una pregunta distinta de la
              priorización: entonces se estimó, ahora se mide.
            </p>
          )}
          {canManage ? (
            <AssessForm opportunity={opportunity} version={version} kind="realized_benefit" />
          ) : null}
        </Step>
      ) : null}

      <section className="rounded-lg border border-hairline bg-surface p-4">
        <h2 className="text-sm font-semibold">Historial</h2>
        {opportunity.decisions.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">Todavía no hay decisiones registradas.</p>
        ) : (
          <ol className="mt-3 space-y-2">
            {opportunity.decisions.map((d) => (
              <li key={d.decisionId} className="border-l-2 border-hairline pl-3">
                <p className="text-sm font-medium">{historyTitle(d.decisionKind, d.outcome)}</p>
                <p className="text-xs text-ink-soft">
                  {d.decidedAt.slice(0, 10)} · {d.decidedByName ?? "—"}
                </p>
                {d.rationale ? <p className="mt-0.5 text-xs text-ink">{d.rationale}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      <LifecyclePanel
        entity="opportunity"
        name={opportunity.title}
        eligibility={eligibility}
        idFieldName="opportunity_id"
        idValue={opportunity.opportunityId}
        deleteAction={deleteOpportunityAction}
        canManage={canManage}
      />
    </div>
  );
}

function AssessmentBlock({
  a, version,
}: { a: OpportunityDetail["assessments"][number]; version: MethodologyVersionRow | null }) {
  const explanation = explainDerivation(a.derivation);
  return (
    <div className="rounded-md border border-hairline p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{a.derivation?.level_label ?? "—"}</span>
        <span className="rounded-full border border-loop/30 bg-loop/10 px-2 py-0.5 text-[11px] font-medium text-loop-deep">
          {OPPORTUNITY_ASSESSMENT_KIND_LABEL[a.kind]}
        </span>
        <span className="text-xs text-ink-soft">{a.assessedOn} · {a.assessedByName ?? "—"}</span>
      </div>
      {explanation ? <p className="mt-1 text-xs text-ink">{explanation}</p> : null}
      <p className="mt-1 text-xs text-ink-soft">
        Metodología «{a.methodologyName}» v{a.versionNumber}
        {version && version.versionNumber !== a.versionNumber
          ? " — hoy rige una versión posterior; esta evaluación conserva la suya."
          : ""}
      </p>
      {a.rationale ? <p className="mt-1 text-xs text-ink">{a.rationale}</p> : null}
    </div>
  );
}

function AssessForm({
  opportunity, version, kind,
}: {
  opportunity: OpportunityDetail;
  version: MethodologyVersionRow | null;
  kind: "prioritization" | "realized_benefit";
}) {
  const [state, action, pending] = useActionState(assessOpportunityAction, initial);
  if (!version) {
    return (
      <p className="rounded-md border border-amber/40 bg-amber/5 p-2 text-xs text-ink">
        No hay una metodología de <strong>oportunidades</strong> publicada. Se priorizan con la
        suya —beneficio, viabilidad, esfuerzo—, no con la matriz de riesgos. Créala en{" "}
        <Link href="/quality/risks/methodology" className="font-medium text-loop hover:underline">
          Metodología
        </Link>.
      </p>
    );
  }
  const dims = version.scales.filter((s) => s.scaleKind === "dimension");
  return (
    <details className="rounded-md border border-hairline p-3">
      <summary className="cursor-pointer text-sm font-medium text-loop">
        {kind === "prioritization" ? "Priorizar" : "Evaluar el beneficio obtenido"}
      </summary>
      <form action={action} className="mt-3 space-y-3">
        <h3 className="text-sm font-semibold">
          {kind === "prioritization" ? "Priorizar la oportunidad" : "Beneficio obtenido"}
        </h3>
        <ErrorAlert message={state.error} />
        <input type="hidden" name="opportunity_id" value={opportunity.opportunityId} />
        <input type="hidden" name="assessment_kind" value={kind} />
        <input type="hidden" name="version_id" value={version.versionId} />
        {dims.map((s) => (
          <Field key={s.scaleId} label={s.label} hint={s.description ?? undefined}>
            <select name="level_ids" required className={inputClass} defaultValue="">
              <option value="" disabled>— elige —</option>
              {s.levels.map((l) => (
                <option key={l.levelId} value={l.levelId}>{l.label} ({l.value})</option>
              ))}
            </select>
          </Field>
        ))}
        <Field label="Fundamento">
          <textarea name="rationale" rows={2} className={inputClass} />
        </Field>
        <Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Registrar"}</Button>
      </form>
    </details>
  );
}

function DecideForm({ opportunityId }: { opportunityId: string }) {
  const [state, action, pending] = useActionState(decideOpportunityAction, initial);
  return (
    <details className="rounded-md border border-hairline p-3">
      <summary className="cursor-pointer text-sm font-medium text-loop">Decidir qué hacer</summary>
      <form action={action} className="mt-3 space-y-3">
        <h3 className="text-sm font-semibold">Decidir qué hacer con la oportunidad</h3>
        <ErrorAlert message={state.error} />
        {state.success && state.message ? (
          <p className="rounded-md border border-loop/30 bg-loop/5 p-2 text-xs text-ink">{state.message}</p>
        ) : null}
        <input type="hidden" name="opportunity_id" value={opportunityId} />
        <Field label="Decisión">
          <select name="decision" className={inputClass} defaultValue="pursue">
            {OPPORTUNITY_DECISIONS.map((d) => (
              <option key={d} value={d}>
                {OPPORTUNITY_DECISION_LABEL[d]} — {OPPORTUNITY_DECISION_HINT[d]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Por qué">
          <textarea name="rationale" required minLength={5} rows={2} className={inputClass} />
        </Field>
        <Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Registrar la decisión"}</Button>
      </form>
    </details>
  );
}

/**
 * El título de una decisión en el historial de una oportunidad.
 *
 * El `outcome` llega como lo guarda la base: «prioritization:Alta» o
 * «pursue». Enseñarlo tal cual filtraría códigos en inglés a la pantalla de
 * una persona, que es justo lo que se vio al revisarla.
 */
function historyTitle(kind: string, outcome: string | null): string {
  if (kind === "opportunity_assessed") {
    const [rawKind, ...rest] = (outcome ?? "").split(":");
    const level = rest.join(":");
    const label =
      rawKind === "prioritization" ? "Priorizada" :
      rawKind === "realized_benefit" ? "Beneficio comprobado" : "Evaluada";
    return level ? `${label} · ${level}` : label;
  }
  if (kind === "opportunity_treatment") {
    const d = outcome as OpportunityDecision | null;
    return d && d in OPPORTUNITY_DECISION_LABEL
      ? `Decisión · ${OPPORTUNITY_DECISION_LABEL[d]}`
      : "Decisión de tratamiento";
  }
  return kind;
}
