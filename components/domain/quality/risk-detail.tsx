"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/alert";
import {
  ASSESSMENT_KIND_HINT, CAUSE_SOURCE_LABEL, CONTROL_NATURE_HINT, CONTROL_NATURES,
  CONTROL_NATURE_LABEL, DESIGN_VERDICTS, DESIGN_VERDICT_LABEL, EFFECTIVENESS_VERDICTS,
  EFFECTIVENESS_VERDICT_LABEL, IMPACT_AREA_LABEL, IMPLEMENTATION_VERDICTS,
  IMPLEMENTATION_VERDICT_LABEL, MATERIALIZATION_SEVERITIES, MATERIALIZATION_SEVERITY_LABEL,
  NO_AUTOMATIC_NC_NOTICE, OPERATION_MODES, OPERATION_MODE_LABEL, RISK_STRATEGIES,
  RISK_STRATEGY_HINT, RISK_STRATEGY_LABEL, describeReview, explainDerivation,
} from "@/lib/domain/risks";
import type { ControlRow, MethodologyVersionRow, RiskDetail } from "@/lib/db/risks";
import type { DeletionEligibility } from "@/lib/domain/lifecycle";
import {
  approveTreatmentAction, assessRiskAction, closeRiskAction, createControlAction,
  decideTreatmentAction, deleteRiskAction, linkControlAction, materializeRiskAction,
  openCaseFromMaterializationAction, reopenRiskAction, reviewControlAction, reviewRiskAction,
  type RiskActionState,
} from "@/server/actions/risks";
import { createActionAction, type CaseActionState } from "@/server/actions/work-cases";
import {
  ACTION_KINDS, ACTION_KIND_LABEL, ACTION_STATUS_LABEL, PRIORITIES, PRIORITY_LABEL,
  type ActionStatus,
} from "@/lib/domain/work-cases";
import { ExportPdfButton } from "@/components/ui/export-pdf-button";
import { LifecyclePanel } from "./lifecycle-panel";
import { RiskMatrix } from "./risk-matrix";
import { ControlBadges, RiskLevelBadge, RiskStatusBadge, SeverityBadge, TreatmentBadge } from "./risk-badges";

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
 * Un paso de la ficha. La progresión de §60 no es decorativa: cada paso es una
 * PREGUNTA de negocio, y se contestan en ese orden porque cada una necesita la
 * anterior. Enseñar cincuenta campos a la vez obligaría a decidir el
 * tratamiento antes de saber la exposición.
 */
function Step({
  n, title, question, children,
}: { n: string; title: string; question: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-hairline bg-surface p-4">
      <div className="flex items-baseline gap-2">
        <span className="rounded-full border border-loop/30 bg-loop/5 px-2 py-0.5 text-[11px] font-medium text-loop-deep">
          {n}
        </span>
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <p className="mt-0.5 text-xs text-ink-soft">{question}</p>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

export function QualityRiskDetail({
  risk, versions, allControls, positions, eligibility,
  canManage, canGovern, canApprove, currentUserId,
}: {
  risk: RiskDetail;
  versions: MethodologyVersionRow[];
  allControls: ControlRow[];
  positions: { id: string; name: string; holderName: string | null }[];
  eligibility: DeletionEligibility;
  canManage: boolean;
  canGovern: boolean;
  canApprove: boolean;
  /** Quién está mirando. Sirve para NO ofrecer aprobar su propia propuesta:
   *  el servidor lo rechaza de todos modos, pero un botón que siempre falla
   *  es una forma de mentir. */
  currentUserId: string;
}) {
  const published = versions.find((v) => v.status === "published") ?? null;
  const inherent = risk.assessments.find((a) => a.kind === "inherent") ?? null;
  const residual = risk.assessments.find((a) => a.kind === "residual") ?? null;
  const open = risk.status === "draft" || risk.status === "active";

  return (
    <div className="max-w-4xl space-y-4">
      <header className="space-y-2">
        <Link href="/quality/risks" className="text-xs font-medium text-loop hover:underline">
          ← Volver a Riesgos
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-ink-soft">{risk.code}</span>
          <h1 className="text-xl font-semibold tracking-tight">{risk.title}</h1>
          <RiskLevelBadge level={risk.currentLevel} isAcceptable={risk.currentIsAcceptable} />
          <RiskStatusBadge status={risk.status} />
          <TreatmentBadge strategy={risk.treatmentStrategy} status={risk.treatmentStatus} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-soft">
            Identificado el {risk.identifiedOn} · Responsable:{" "}
            {risk.ownerPositionName ?? "sin asignar"} · {describeReview(risk.nextReviewOn)}
          </p>
          <ExportPdfButton exportKey="quality.risk.detail" id={risk.riskId} />
        </div>
        {risk.status === "closed" || risk.status === "retired" ? (
          <p className="rounded-md border border-hairline bg-canvas p-3 text-sm text-ink">
            {risk.closureReason}
          </p>
        ) : null}
      </header>

      {/* ------------------------------------------------------------------ */}
      <Step n="Paso 1" title="Qué puede pasar" question="¿Por qué? ¿Qué consecuencia tendría?">
        <div className="space-y-2">
          <Line label="Causa">
            {risk.causes.length === 0 ? (
              <span className="text-ink-soft">Sin causas registradas todavía.</span>
            ) : (
              <ul className="space-y-0.5">
                {risk.causes.map((c) => (
                  <li key={c.causeId}>
                    {c.description}{" "}
                    <span className="text-ink-soft">({CAUSE_SOURCE_LABEL[c.sourceKind]})</span>
                  </li>
                ))}
              </ul>
            )}
          </Line>
          <Line label="Evento">{risk.eventDescription}</Line>
          <Line label="Consecuencia">
            {risk.consequences.length === 0 ? (
              <span className="text-ink-soft">Sin consecuencias registradas todavía.</span>
            ) : (
              <ul className="space-y-0.5">
                {risk.consequences.map((c) => (
                  <li key={c.consequenceId}>
                    {c.description}{" "}
                    <span className="text-ink-soft">({IMPACT_AREA_LABEL[c.impactArea]})</span>
                  </li>
                ))}
              </ul>
            )}
          </Line>
          {risk.contextNote ? <Line label="Contexto">{risk.contextNote}</Line> : null}
          {risk.processes.length > 0 ? (
            <Line label="Procesos">{risk.processes.map((p) => p.name).join(" · ")}</Line>
          ) : null}
          {risk.objectives.length > 0 ? (
            <Line label="Objetivos en juego">
              {risk.objectives.map((o) => o.name).join(" · ")}
            </Line>
          ) : null}
        </div>
      </Step>

      {/* ------------------------------------------------------------------ */}
      <Step
        n="Paso 2"
        title="Evaluación inherente"
        question={`¿Qué tan expuestos estamos sin controles? — ${ASSESSMENT_KIND_HINT.inherent}`}
      >
        <AssessmentBlock assessment={inherent} version={published} />
        {canManage && open ? (
          <AssessForm risk={risk} version={published} kind="inherent" controls={risk.controls} />
        ) : null}
      </Step>

      {/* ------------------------------------------------------------------ */}
      <Step n="Paso 3" title="Controles" question="¿Qué tenemos ya para que no ocurra, o para enterarnos si ocurre?">
        {risk.controls.length === 0 ? (
          <p className="text-sm text-ink-soft">
            Sin controles asociados. Un control es algo que <strong>ya existe y opera</strong>: un
            procedimiento, una inspección, una aprobación. No es una tarea pendiente — eso es una
            acción, y va en el paso 5.
          </p>
        ) : (
          <ul className="space-y-2">
            {risk.controls.map((c) => (
              <li key={c.controlId} className="rounded-md border border-hairline p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] text-ink-soft">{c.code}</span>
                  <span className="text-sm font-medium">{c.title}</span>
                  <ControlBadges
                    nature={c.controlNature}
                    status={c.status}
                    effectiveness={c.lastReview?.effectiveness ?? null}
                  />
                </div>
                {c.description ? <p className="mt-1 text-xs text-ink-soft">{c.description}</p> : null}
                <p className="mt-1 text-xs text-ink-soft">
                  {OPERATION_MODE_LABEL[c.operationMode]}
                  {c.frequency ? ` · ${c.frequency}` : ""}
                  {c.ownerPositionName ? ` · ${c.ownerPositionName}` : ""}
                </p>
                {c.documentRefs.length > 0 ? (
                  <p className="mt-1 text-xs text-ink-soft">
                    Documentado en:{" "}
                    {c.documentRefs.map((d) => (
                      <Link key={d.refId} href={`/quality/documents/${d.refId}`} className="text-loop hover:underline">
                        {d.code ?? d.title}
                      </Link>
                    ))}
                  </p>
                ) : null}
                {c.indicatorRefs.length > 0 ? (
                  <p className="mt-1 text-xs text-ink-soft">
                    Se vigila con:{" "}
                    {c.indicatorRefs.map((i) => (
                      <Link key={i.refId} href="/quality/indicators" className="text-loop hover:underline">
                        {i.code ?? i.name}
                      </Link>
                    ))}
                  </p>
                ) : null}
                {c.lastReview ? (
                  <p className="mt-1 text-xs text-ink-soft">
                    Evaluado el {c.lastReview.reviewedOn}:{" "}
                    {DESIGN_VERDICT_LABEL[c.lastReview.design]} ·{" "}
                    {IMPLEMENTATION_VERDICT_LABEL[c.lastReview.implementation]} ·{" "}
                    {EFFECTIVENESS_VERDICT_LABEL[c.lastReview.effectiveness]}
                    {c.lastReview.criterion ? ` — ${c.lastReview.criterion}` : ""}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-ink-soft">
                    Nadie ha comprobado todavía si funciona. Que exista y que sirva son dos preguntas.
                  </p>
                )}
                {canManage && open ? <ReviewControlForm control={c} riskId={risk.riskId} /> : null}
              </li>
            ))}
          </ul>
        )}

        {canManage && open ? (
          <>
            <AddControlForm risk={risk} />
            {allControls.filter((c) => !risk.controls.some((x) => x.controlId === c.controlId)).length > 0 ? (
              <LinkControlForm
                riskId={risk.riskId}
                options={allControls.filter((c) => !risk.controls.some((x) => x.controlId === c.controlId))}
              />
            ) : null}
          </>
        ) : null}
      </Step>

      {/* ------------------------------------------------------------------ */}
      <Step
        n="Paso 4"
        title="Evaluación residual"
        question={`¿Qué tan expuestos quedamos con ellos? — ${ASSESSMENT_KIND_HINT.residual}`}
      >
        <AssessmentBlock assessment={residual} version={published} />
        {residual && inherent && residual.score >= inherent.score ? (
          <p className="rounded-md border border-amber/40 bg-amber/5 p-2 text-xs text-ink">
            La residual no bajó respecto de la inherente. No es un error del sistema: puede pasar
            si el contexto empeoró o si los controles no resultaron eficaces. Queda registrada tal
            como se evaluó.
          </p>
        ) : null}
        {canManage && open ? (
          <AssessForm risk={risk} version={published} kind="residual" controls={risk.controls} />
        ) : null}
      </Step>

      {/* ------------------------------------------------------------------ */}
      <Step n="Paso 5" title="Decisión y tratamiento" question="¿Lo aceptamos? ¿Qué haremos?">
        {risk.plans.length === 0 ? (
          <p className="text-sm text-ink-soft">Todavía no se ha decidido qué hacer.</p>
        ) : (
          <ul className="space-y-2">
            {risk.plans.map((p) => (
              <li key={p.planId} className="rounded-md border border-hairline p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{RISK_STRATEGY_LABEL[p.strategy]}</span>
                  <TreatmentBadge strategy={p.strategy} status={p.status} />
                </div>
                <p className="mt-1 text-xs text-ink">{p.rationale}</p>
                <p className="mt-1 text-xs text-ink-soft">
                  {p.decidedOn} · {p.decidedByName ?? "—"}
                  {p.reviewOn ? ` · se revisa el ${p.reviewOn}` : ""}
                </p>
                {p.requiresApproval && p.status === "pending_approval" ? (
                  <div className="mt-2 rounded-md border border-amber/40 bg-amber/5 p-2">
                    <p className="text-xs text-ink">
                      Aceptar este riesgo está por encima de lo que la metodología considera
                      aceptable, así que necesita aprobación formal de alguien distinto de quien lo
                      propuso.
                    </p>
                    {canApprove && p.decidedById !== currentUserId ? (
                      <ApproveForm planId={p.planId} riskId={risk.riskId} />
                    ) : canApprove ? (
                      <p className="mt-1 text-xs text-ink-soft">
                        La propusiste tú: tiene que aprobarla otra persona con autoridad.
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {p.approvedAt ? (
                  <p className="mt-1 text-xs text-ink-soft">
                    Aprobado por {p.approvedByName ?? "—"} el {p.approvedAt.slice(0, 10)}
                    {p.approvalNote ? ` — ${p.approvalNote}` : ""}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {canGovern && open ? <TreatmentForm risk={risk} /> : null}
        <p className="text-xs text-ink-soft">
          El tratamiento es la <strong>estrategia</strong>, no la tarea. «Reducir» se concreta
          después en acciones: homologar un segundo proveedor, subir el stock mínimo, escribir el
          plan de contingencia.
        </p>
      </Step>

      {/* ------------------------------------------------------------------ */}
      <Step n="Paso 6" title="Acciones" question="¿Quién, y para cuándo?">
        {risk.actions.length === 0 ? (
          <p className="text-sm text-ink-soft">
            Todavía no hay acciones. Se crean con el mismo motor que usan las acciones correctivas
            de{" "}
            <Link href="/quality/cases" className="text-loop hover:underline">Casos y acciones</Link>:
            no hay un segundo sistema de tareas para riesgos.
          </p>
        ) : (
          <ul className="space-y-1">
            {risk.actions.map((a) => (
              <li key={a.actionId} className="rounded-md border border-hairline p-2 text-sm">
                <span className="font-mono text-[11px] text-ink-soft">{a.code}</span>{" "}
                {a.title}
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
            hiddenName="risk_id" hiddenValue={risk.riskId} positions={positions}
            hint="La estrategia decide el rumbo; las acciones son lo que alguien hace. Una estrategia puede tener varias."
          />
        ) : null}
      </Step>

      {/* ------------------------------------------------------------------ */}
      <Step n="Paso 7" title="Si llega a ocurrir" question="¿Se materializó? ¿Qué hicimos?">
        {risk.materializations.length === 0 ? (
          <p className="text-sm text-ink-soft">No se ha materializado.</p>
        ) : (
          <ul className="space-y-2">
            {risk.materializations.map((m) => (
              <li key={m.materializationId} className="rounded-md border border-hairline p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">Ocurrió el {m.occurredOn}</span>
                  <SeverityBadge severity={m.severity} />
                </div>
                <p className="mt-1 text-xs text-ink">{m.description}</p>
                {m.observedConsequence ? (
                  <p className="mt-1 text-xs text-ink-soft">Consecuencia observada: {m.observedConsequence}</p>
                ) : null}
                <p className="mt-1 text-xs text-ink-soft">
                  Registrado por {m.reportedByName ?? "—"}
                </p>
                {m.caseId ? (
                  <p className="mt-2 text-xs">
                    <Link href={`/quality/cases/${m.caseId}`} className="font-medium text-loop hover:underline">
                      Caso {m.caseCode ?? ""} abierto desde este hecho →
                    </Link>
                  </p>
                ) : (
                  <div className="mt-2 rounded-md border border-loop/20 bg-loop/5 p-2">
                    <p className="text-xs text-ink">{NO_AUTOMATIC_NC_NOTICE}</p>
                    {canManage ? (
                      <OpenCaseForm materializationId={m.materializationId} riskId={risk.riskId} />
                    ) : null}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {canManage && risk.status === "active" ? <MaterializeForm riskId={risk.riskId} /> : null}
      </Step>

      {/* ------------------------------------------------------------------ */}
      <Step n="Paso 8" title="Seguimiento" question="¿Cuándo lo revisamos?">
        <p className="text-sm text-ink">
          {describeReview(risk.nextReviewOn)}
          {risk.lastReviewedOn ? ` · última revisión el ${risk.lastReviewedOn}` : ""}
          {risk.reviewIntervalMonths
            ? ` · cada ${risk.reviewIntervalMonths} ${risk.reviewIntervalMonths === 1 ? "mes" : "meses"} según su nivel`
            : ""}
        </p>
        {canManage && risk.status === "active" ? <ReviewForm riskId={risk.riskId} /> : null}
        <p className="text-xs text-ink-soft">
          Revisar no reescribe la evaluación anterior: si el juicio cambia, se registra una
          evaluación nueva y las dos quedan.
        </p>
      </Step>

      {/* ------------------------------------------------------------------ */}
      {published ? (
        <section className="rounded-lg border border-hairline bg-surface p-4">
          <h2 className="text-sm font-semibold">Cómo se calcula</h2>
          <p className="mt-0.5 text-xs text-ink-soft">
            Esta matriz sale de la metodología publicada, no está escrita en el programa. Si la
            empresa publica otra versión, cambia sola — y las evaluaciones ya hechas siguen
            explicándose con la suya.
          </p>
          <div className="mt-3">
            <RiskMatrix
              version={published}
              currentScore={risk.currentScore}
              currentFactors={(residual ?? inherent)?.derivation?.factors ?? null}
            />
          </div>
        </section>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      <section className="rounded-lg border border-hairline bg-surface p-4">
        <h2 className="text-sm font-semibold">Historial</h2>
        <p className="mt-0.5 text-xs text-ink-soft">
          Lo que se decidió, quién y por qué. No se edita: si una conclusión cambia, aparece una
          decisión nueva y las dos quedan.
        </p>
        {risk.decisions.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">Todavía no hay decisiones registradas.</p>
        ) : (
          <ol className="mt-3 space-y-2">
            {risk.decisions.map((d) => (
              <li key={d.decisionId} className="border-l-2 border-hairline pl-3">
                <p className="text-sm font-medium">{decisionTitle(d.decisionKind, d.outcome)}</p>
                <p className="text-xs text-ink-soft">
                  {d.decidedAt.slice(0, 10)} · {d.decidedByName ?? "—"}
                </p>
                {d.rationale ? <p className="mt-0.5 text-xs text-ink">{d.rationale}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      {canGovern && open ? <CloseForm riskId={risk.riskId} /> : null}
      {canGovern && (risk.status === "closed" || risk.status === "retired") ? (
        <ReopenForm riskId={risk.riskId} />
      ) : null}

      <LifecyclePanel
        entity="risk"
        name={risk.title}
        eligibility={eligibility}
        idFieldName="risk_id"
        idValue={risk.riskId}
        deleteAction={deleteRiskAction}
        canManage={canManage}
      />
    </div>
  );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="text-sm">
      <span className="text-xs font-medium uppercase tracking-wide text-ink-soft">{label}</span>
      <div className="mt-0.5 text-ink">{children}</div>
    </div>
  );
}

/**
 * El título de una decisión en el historial.
 *
 * El `outcome` de una evaluación llega como «inherent:Extremo», que es la
 * forma en que la base lo guarda. Enseñarlo tal cual filtraría un código
 * interno en inglés a la pantalla de una persona, así que aquí se parte y se
 * traduce la mitad que es vocabulario, dejando intacta la que es dato.
 */
function decisionTitle(kind: string, outcome: string | null): string {
  switch (kind) {
    case "risk_identified": return "Riesgo identificado";
    case "risk_assessed": {
      const [rawKind, ...rest] = (outcome ?? "").split(":");
      const level = rest.join(":");
      const label =
        rawKind === "inherent" ? "Evaluación inherente" :
        rawKind === "residual" ? "Evaluación residual" : "Evaluado";
      return level ? `${label} · ${level}` : label;
    }
    case "risk_treatment":
      return `Tratamiento decidido · ${
        outcome && outcome in RISK_STRATEGY_LABEL
          ? RISK_STRATEGY_LABEL[outcome as keyof typeof RISK_STRATEGY_LABEL]
          : (outcome ?? "")
      }`;
    case "risk_acceptance": return outcome === "approved" ? "Aceptación aprobada" : "Aceptación decidida";
    case "risk_review": return "Riesgo revisado";
    case "risk_materialized":
      return `Se materializó${
        outcome && outcome in MATERIALIZATION_SEVERITY_LABEL
          ? ` · ${MATERIALIZATION_SEVERITY_LABEL[outcome as keyof typeof MATERIALIZATION_SEVERITY_LABEL]}`
          : ""
      }`;
    case "closure":
      return outcome === "retired" ? "Retirado"
        : outcome === "superseded" ? "Sustituido por otro riesgo" : "Cerrado";
    case "reopen": return "Reabierto";
    default: return kind;
  }
}

/** La evaluación mostrada CON su explicación (§62). Si no se puede decir por
 *  qué salió ese nivel, no se puede discutir — y lo que no se discute no se
 *  corrige. */
function AssessmentBlock({
  assessment, version,
}: { assessment: RiskDetail["assessments"][number] | null; version: MethodologyVersionRow | null }) {
  if (!assessment) {
    return <p className="text-sm text-ink-soft">Sin evaluar todavía.</p>;
  }
  const explanation = explainDerivation(assessment.derivation);
  return (
    <div className="rounded-md border border-hairline p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{assessment.derivation?.level_label ?? "—"}</span>
        <RiskLevelBadge
          level={assessment.derivation?.level_label ?? null}
          isAcceptable={assessment.derivation?.is_acceptable ?? null}
        />
        <span className="text-xs text-ink-soft">
          {assessment.assessedOn} · {assessment.assessedByName ?? "—"}
        </span>
      </div>
      {explanation ? <p className="mt-1 text-xs text-ink">{explanation}</p> : null}
      <p className="mt-1 text-xs text-ink-soft">
        Metodología «{assessment.methodologyName}» v{assessment.versionNumber}
        {version && version.versionNumber !== assessment.versionNumber
          ? " — hoy rige una versión posterior; esta evaluación conserva la suya."
          : ""}
      </p>
      {assessment.controlsConsidered.length > 0 ? (
        <p className="mt-1 text-xs text-ink-soft">
          Controles considerados:{" "}
          {assessment.controlsConsidered
            .map((c) => `${c.controlCode} (${EFFECTIVENESS_VERDICT_LABEL[c.effectiveness as never] ?? c.effectiveness})`)
            .join(" · ")}
        </p>
      ) : null}
      {assessment.rationale ? <p className="mt-1 text-xs text-ink">{assessment.rationale}</p> : null}
    </div>
  );
}

function AssessForm({
  risk, version, kind, controls,
}: {
  risk: RiskDetail; version: MethodologyVersionRow | null;
  kind: "inherent" | "residual"; controls: ControlRow[];
}) {
  const [state, action, pending] = useActionState(assessRiskAction, initial);
  if (!version) {
    return (
      <p className="rounded-md border border-amber/40 bg-amber/5 p-2 text-xs text-ink">
        No hay una metodología de riesgos publicada. Publícala en{" "}
        <Link href="/quality/risks/methodology" className="font-medium text-loop hover:underline">
          Metodología
        </Link>{" "}
        y podrás evaluar.
      </p>
    );
  }
  const dims = version.scales.filter((s) => s.scaleKind === "dimension");
  return (
    <details className="rounded-md border border-hairline p-3">
      <summary className="cursor-pointer text-sm font-medium text-loop">
        {kind === "inherent" ? "Evaluar sin controles" : "Evaluar con los controles"}
      </summary>
      <form action={action} className="mt-3 space-y-3">
        <h3 className="text-sm font-semibold">
          {kind === "inherent" ? "Evaluación inherente" : "Evaluación residual"}
        </h3>
        <ErrorAlert message={state.error} />
        <input type="hidden" name="risk_id" value={risk.riskId} />
        <input type="hidden" name="assessment_kind" value={kind} />
        <input type="hidden" name="version_id" value={version.versionId} />

        {dims.map((s) => (
          <Field key={s.scaleId} label={s.label} hint={s.description ?? undefined}>
            <select name="level_ids" required className={inputClass} defaultValue="">
              <option value="" disabled>— elige —</option>
              {s.levels.map((l) => (
                <option key={l.levelId} value={l.levelId}>
                  {l.label} ({l.value})
                </option>
              ))}
            </select>
          </Field>
        ))}

        {kind === "residual" ? (
          <Field
            label="Controles que se tuvieron en cuenta"
            hint="Obligatorio: sin controles, la residual sería la inherente con otro nombre."
          >
            {controls.length === 0 ? (
              <p className="text-xs text-ink-soft">
                Este riesgo no tiene controles asociados todavía. Añade uno en el paso 3.
              </p>
            ) : (
              <select name="control_ids" multiple required size={Math.min(4, Math.max(2, controls.length))} className={inputClass}>
                {controls.map((c) => (
                  <option key={c.controlId} value={c.controlId}>
                    {c.code} · {c.title}
                  </option>
                ))}
              </select>
            )}
          </Field>
        ) : null}

        <Field label="Fundamento" hint="Por qué se valoró así.">
          <textarea name="rationale" rows={2} className={inputClass} />
        </Field>

        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Registrar la evaluación"}
        </Button>
      </form>
    </details>
  );
}

function AddControlForm({ risk }: { risk: RiskDetail }) {
  const [state, action, pending] = useActionState(createControlAction, initial);
  return (
    <details className="rounded-md border border-hairline p-3">
      <summary className="cursor-pointer text-sm font-medium text-loop">Registrar un control</summary>
      <form action={action} className="mt-3 space-y-3">
        <h3 className="text-sm font-semibold">Registrar un control</h3>
        <ErrorAlert message={state.error} />
        <input type="hidden" name="risk_id" value={risk.riskId} />
        <Field label="Qué control es" hint="Algo que YA existe y opera: un procedimiento, una inspección, una aprobación.">
          <input name="title" required minLength={3} className={inputClass}
                 placeholder="Ej.: Inspección de recepción de materia prima" />
        </Field>
        <Field label="Naturaleza">
          <select name="control_nature" className={inputClass} defaultValue="preventive">
            {CONTROL_NATURES.map((n) => (
              <option key={n} value={n}>{CONTROL_NATURE_LABEL[n]} — {CONTROL_NATURE_HINT[n]}</option>
            ))}
          </select>
        </Field>
        <Field label="Cómo se opera">
          <select name="operation_mode" className={inputClass} defaultValue="manual">
            {OPERATION_MODES.map((m) => (
              <option key={m} value={m}>{OPERATION_MODE_LABEL[m]}</option>
            ))}
          </select>
        </Field>
        <Field label="Con qué frecuencia">
          <input name="frequency" className={inputClass} placeholder="Ej.: en cada recepción" />
        </Field>
        <Field label="Descripción">
          <textarea name="description" rows={2} className={inputClass} />
        </Field>
        <Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Registrar el control"}</Button>
      </form>
    </details>
  );
}

function LinkControlForm({ riskId, options }: { riskId: string; options: ControlRow[] }) {
  const [state, action, pending] = useActionState(linkControlAction, initial);
  return (
    <details className="rounded-md border border-hairline p-3">
      <summary className="cursor-pointer text-sm font-medium text-loop">
        Asociar un control que ya existe
      </summary>
      <form action={action} className="mt-3 space-y-3">
        <h3 className="text-sm font-semibold">Asociar un control existente</h3>
        <ErrorAlert message={state.error} />
        <input type="hidden" name="risk_id" value={riskId} />
        <Field label="Control" hint="Un mismo control puede servir a varios riesgos.">
          <select name="control_id" required className={inputClass} defaultValue="">
            <option value="" disabled>— elige —</option>
            {options.map((c) => (
              <option key={c.controlId} value={c.controlId}>{c.code} · {c.title}</option>
            ))}
          </select>
        </Field>
        <Button type="submit" disabled={pending}>{pending ? "Asociando…" : "Asociar"}</Button>
      </form>
    </details>
  );
}

function ReviewControlForm({ control, riskId }: { control: ControlRow; riskId: string }) {
  const [state, action, pending] = useActionState(reviewControlAction, initial);
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs font-medium text-loop">
        Evaluar si este control funciona
      </summary>
      <form action={action} className="mt-2 space-y-2">
        <h4 className="text-xs font-semibold">Evaluar el control {control.code}</h4>
        <ErrorAlert message={state.error} />
        <input type="hidden" name="control_id" value={control.controlId} />
        <input type="hidden" name="risk_id" value={riskId} />
        <Field label="¿Está bien pensado?">
          <select name="design_verdict" className={inputClass} defaultValue="adequate">
            {DESIGN_VERDICTS.map((v) => <option key={v} value={v}>{DESIGN_VERDICT_LABEL[v]}</option>)}
          </select>
        </Field>
        <Field label="¿Se aplica de verdad?">
          <select name="implementation_verdict" className={inputClass} defaultValue="implemented">
            {IMPLEMENTATION_VERDICTS.map((v) => (
              <option key={v} value={v}>{IMPLEMENTATION_VERDICT_LABEL[v]}</option>
            ))}
          </select>
        </Field>
        <Field label="¿Sirve para algo?" hint="Es una pregunta distinta de las dos anteriores.">
          <select name="effectiveness_verdict" className={inputClass} defaultValue="effective">
            {EFFECTIVENESS_VERDICTS.map((v) => (
              <option key={v} value={v}>{EFFECTIVENESS_VERDICT_LABEL[v]}</option>
            ))}
          </select>
        </Field>
        <Field label="Con qué criterio se juzgó">
          <input name="criterion" className={inputClass} placeholder="Ej.: registros de las últimas 20 recepciones" />
        </Field>
        <Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Registrar"}</Button>
      </form>
    </details>
  );
}

function TreatmentForm({ risk }: { risk: RiskDetail }) {
  const [state, action, pending] = useActionState(decideTreatmentAction, initial);
  const [strategy, setStrategy] = useState<string>("reduce");
  const willNeedApproval = strategy === "accept" && risk.currentIsAcceptable === false;
  return (
    <details className="rounded-md border border-hairline p-3">
      <summary className="cursor-pointer text-sm font-medium text-loop">Decidir el tratamiento</summary>
      <form action={action} className="mt-3 space-y-3">
        <h3 className="text-sm font-semibold">Decidir el tratamiento</h3>
        <ErrorAlert message={state.error} />
        <input type="hidden" name="risk_id" value={risk.riskId} />
        <Field label="Estrategia">
          {/* Controlado a propósito. Con `defaultValue`, tras enviar el
              formulario el <select> vuelve a «Reducir» mientras el estado
              conservaba «Aceptar», y el aviso de aprobación seguía en
              pantalla contradiciendo a lo que decía el desplegable. */}
          <select
            name="strategy" className={inputClass}
            value={strategy}
            onChange={(e) => setStrategy(e.target.value)}
          >
            {RISK_STRATEGIES.map((s) => (
              <option key={s} value={s}>{RISK_STRATEGY_LABEL[s]} — {RISK_STRATEGY_HINT[s]}</option>
            ))}
          </select>
        </Field>
        {willNeedApproval ? (
          <p className="rounded-md border border-amber/40 bg-amber/5 p-2 text-xs text-ink">
            El nivel vigente está por encima de lo que la metodología considera aceptable.
            Aceptarlo quedará <strong>pendiente de aprobación</strong> hasta que lo apruebe alguien
            distinto de quien lo propone.
          </p>
        ) : null}
        <Field label="Fundamento" hint="Por qué esa estrategia y no otra.">
          <textarea name="rationale" required minLength={5} rows={2} className={inputClass} />
        </Field>
        <Field label="Cuándo se revisa" hint="Aceptar no es olvidarse: la fecha de revisión sigue.">
          <input type="date" name="review_on" className={inputClass} />
        </Field>
        <Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Registrar la decisión"}</Button>
      </form>
    </details>
  );
}

function ApproveForm({ planId, riskId }: { planId: string; riskId: string }) {
  const [state, action, pending] = useActionState(approveTreatmentAction, initial);
  return (
    <form action={action} className="mt-2 space-y-2">
      <h4 className="sr-only">Aprobar la aceptación</h4>
      <ErrorAlert message={state.error} />
      <input type="hidden" name="plan_id" value={planId} />
      <input type="hidden" name="risk_id" value={riskId} />
      <Field label="Nota de aprobación">
        <input name="approval_note" className={inputClass} />
      </Field>
      <Button type="submit" disabled={pending}>{pending ? "Aprobando…" : "Aprobar la aceptación"}</Button>
    </form>
  );
}

function MaterializeForm({ riskId }: { riskId: string }) {
  const [state, action, pending] = useActionState(materializeRiskAction, initial);
  return (
    <details className="rounded-md border border-hairline p-3">
      <summary className="cursor-pointer text-sm font-medium text-loop">Registrar que ocurrió</summary>
      <form action={action} className="mt-3 space-y-3">
        <h3 className="text-sm font-semibold">Registrar que el riesgo se materializó</h3>
        <ErrorAlert message={state.error} />
        {state.success && state.message ? (
          <p className="rounded-md border border-loop/30 bg-loop/5 p-2 text-xs text-ink">{state.message}</p>
        ) : null}
        <input type="hidden" name="risk_id" value={riskId} />
        <Field label="Cuándo ocurrió">
          <input type="date" name="occurred_on" required className={inputClass} />
        </Field>
        <Field label="Qué ocurrió">
          <textarea name="description" required minLength={5} rows={2} className={inputClass} />
        </Field>
        <Field label="Consecuencia observada">
          <input name="observed_consequence" className={inputClass} />
        </Field>
        <Field label="Gravedad">
          <select name="severity" className={inputClass} defaultValue="moderate">
            {MATERIALIZATION_SEVERITIES.map((s) => (
              <option key={s} value={s}>{MATERIALIZATION_SEVERITY_LABEL[s]}</option>
            ))}
          </select>
        </Field>
        <p className="text-xs text-ink-soft">{NO_AUTOMATIC_NC_NOTICE}</p>
        <Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Registrar el hecho"}</Button>
      </form>
    </details>
  );
}

function OpenCaseForm({ materializationId, riskId }: { materializationId: string; riskId: string }) {
  const [state, action, pending] = useActionState(openCaseFromMaterializationAction, initial);
  return (
    <form action={action} className="mt-2 space-y-2">
      <h4 className="sr-only">Abrir un caso desde este hecho</h4>
      <ErrorAlert message={state.error} />
      <input type="hidden" name="materialization_id" value={materializationId} />
      <input type="hidden" name="risk_id" value={riskId} />
      <Field label="Título del caso" hint="Si lo dejas vacío se usa el del riesgo.">
        <input name="case_title" className={inputClass} />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Abriendo…" : "Abrir un caso a partir de esto"}
      </Button>
    </form>
  );
}

function ReviewForm({ riskId }: { riskId: string }) {
  const [state, action, pending] = useActionState(reviewRiskAction, initial);
  return (
    <details className="rounded-md border border-hairline p-3">
      <summary className="cursor-pointer text-sm font-medium text-loop">Registrar una revisión</summary>
      <form action={action} className="mt-3 space-y-3">
        <h3 className="text-sm font-semibold">Registrar una revisión</h3>
        <ErrorAlert message={state.error} />
        <input type="hidden" name="risk_id" value={riskId} />
        <Field label="Qué se miró" hint="Si el juicio cambió, registra además una evaluación nueva.">
          <textarea name="note" required minLength={3} rows={2} className={inputClass} />
        </Field>
        <Field label="Próxima revisión">
          <input type="date" name="next_review_on" className={inputClass} />
        </Field>
        <Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Registrar la revisión"}</Button>
      </form>
    </details>
  );
}

function CloseForm({ riskId }: { riskId: string }) {
  const [state, action, pending] = useActionState(closeRiskAction, initial);
  return (
    <details className="rounded-lg border border-hairline bg-surface p-4">
      <summary className="cursor-pointer text-sm font-medium text-loop">Cerrar o retirar</summary>
      <form action={action} className="mt-3 space-y-3">
        <h3 className="text-sm font-semibold">Cerrar o retirar el riesgo</h3>
        <ErrorAlert message={state.error} />
        <input type="hidden" name="risk_id" value={riskId} />
        <Field label="Cómo" hint="Cerrar: ya no aplica. Retirar: deja de gestionarse. Ninguna de las dos borra su historia.">
          <select name="mode" className={inputClass} defaultValue="closed">
            <option value="closed">Cerrar</option>
            <option value="retired">Retirar</option>
          </select>
        </Field>
        <Field label="Por qué">
          <textarea name="reason" required minLength={5} rows={2} className={inputClass} />
        </Field>
        <Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Cerrar el riesgo"}</Button>
      </form>
    </details>
  );
}

function ReopenForm({ riskId }: { riskId: string }) {
  const [state, action, pending] = useActionState(reopenRiskAction, initial);
  return (
    <details className="rounded-lg border border-hairline bg-surface p-4">
      <summary className="cursor-pointer text-sm font-medium text-loop">Reabrir</summary>
      <form action={action} className="mt-3 space-y-3">
        <h3 className="text-sm font-semibold">Reabrir el riesgo</h3>
        <ErrorAlert message={state.error} />
        <input type="hidden" name="risk_id" value={riskId} />
        <Field label="Por qué se reabre">
          <textarea name="reason" required minLength={5} rows={2} className={inputClass} />
        </Field>
        <Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Reabrir"}</Button>
      </form>
    </details>
  );
}

/**
 * Planificar una acción desde un riesgo o una oportunidad.
 *
 * Llama a la MISMA acción de servidor que las acciones correctivas de
 * QUALITY-04. No hay un motor paralelo: lo único que cambia es de qué objeto
 * nace, y eso viaja como una referencia tipada.
 */
function PlanActionForm({
  hiddenName, hiddenValue, positions, hint,
}: {
  hiddenName: "risk_id" | "opportunity_id";
  hiddenValue: string;
  positions: { id: string; name: string; holderName: string | null }[];
  hint: string;
}) {
  const [state, action, pending] = useActionState(
    createActionAction, { error: null } as CaseActionState
  );
  return (
    <details className="rounded-md border border-hairline p-3">
      <summary className="cursor-pointer text-sm font-medium text-loop">Planificar una acción</summary>
      <form action={action} className="mt-3 space-y-3">
        <h3 className="text-sm font-semibold">Planificar una acción</h3>
        <p className="text-xs text-ink-soft">{hint}</p>
        <ErrorAlert message={state.error} />
        <input type="hidden" name={hiddenName} value={hiddenValue} />
        <Field label="Qué se va a hacer">
          <input name="title" required minLength={3} className={inputClass}
                 placeholder="Ej.: homologar un segundo proveedor" />
        </Field>
        <Field label="Tipo de acción">
          <select name="action_kind" className={inputClass} defaultValue="preventive">
            {ACTION_KINDS.map((k) => (
              <option key={k} value={k}>{ACTION_KIND_LABEL[k]}</option>
            ))}
          </select>
        </Field>
        <Field label="Resultado esperado">
          <textarea name="expected_result" rows={2} className={inputClass} />
        </Field>
        <Field label="Responsable" hint="Un cargo. La tarea le llega a quien lo ocupa hoy.">
          <select name="owner_position_id" className={inputClass} defaultValue="">
            <option value="">— sin asignar —</option>
            {positions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}{p.holderName ? ` · ${p.holderName}` : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Para cuándo">
          <input type="date" name="due_on" className={inputClass} />
        </Field>
        <Field label="Prioridad">
          <select name="priority" className={inputClass} defaultValue="normal">
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
            ))}
          </select>
        </Field>
        <Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Planificar"}</Button>
      </form>
    </details>
  );
}

export { PlanActionForm };
