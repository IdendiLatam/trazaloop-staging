"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ErrorAlert, InfoAlert, SuccessAlert } from "@/components/ui/alert";
import {
  ACTION_KINDS, ACTION_KIND_HELP, ACTION_KIND_LABEL, CASE_ORIGIN_LABEL, CASE_THRESHOLD,
  CASE_TYPE_LABEL, CLASSIFICATION_HELP, CLASSIFICATION_LABEL, DECIDABLE_CLASSIFICATIONS,
  PRIORITIES, PRIORITY_LABEL, REFERENCE_KIND_LABEL, describeDecision, describeDue, referenceHref,
  type ActionKind, type CaseOrigin, type CaseStatus, type CaseType, type Classification,
  type ClosureEligibility, type DecisionKind, type Effectiveness, type ActionStatus,
  type Priority, type ReferenceKind,
} from "@/lib/domain/work-cases";
import {
  addCauseAction, addFindingAction, addProcessAction, addRequirementAction, approveCauseAction,
  classifyCaseAction, closeCaseAction, completeActionAction, createActionAction,
  deleteCaseAction, reopenCaseAction, verifyEffectivenessAction, type CaseActionState,
} from "@/server/actions/work-cases";
import {
  ActionKindBadge, ActionStandingBadge, CaseStatusBadge, ClassificationBadge,
} from "./case-badges";

const initial: CaseActionState = { error: null };
const inputClass =
  "block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-soft/60 focus:border-loop";
const cardClass = "rounded-lg border border-hairline bg-surface p-4";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-ink">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-ink-soft">{hint}</span> : null}
    </label>
  );
}

/** Cada etapa del ciclo, con su número y su pregunta. La ficha se lee como una
 *  historia, no como un formulario de cuarenta campos. */
function Stage({
  step, title, question, done, children,
}: { step: string; title: string; question: string; done?: boolean; children: React.ReactNode }) {
  return (
    <section className={cardClass}>
      <div className="flex flex-wrap items-baseline gap-2">
        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${
          done ? "border-loop/30 bg-loop/5 text-loop-deep" : "border-hairline bg-paper text-ink-soft"
        }`}>{step}</span>
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <p className="mt-1 text-xs text-ink-soft">{question}</p>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

export type CaseDetailModel = {
  caseId: string; code: string; title: string; description: string | null;
  caseType: CaseType; originKind: CaseOrigin; originNote: string | null;
  detectedOn: string; classification: Classification; priority: Priority; status: CaseStatus;
  requirementText: string | null; evidenceText: string | null; nonconformityText: string | null;
  ownerLabel: string; reportedByName: string | null;
  closedAt: string | null; closureNote: string | null; reopenCount: number;
  processNames: string;
  findings: { id: string; statement: string; locationText: string | null; observedOn: string;
              observedByName: string | null; evidenceNote: string | null }[];
  requirements: { id: string; label: string; source: string; note: string | null }[];
  references: { id: string; refKind: ReferenceKind; refId: string; relation: string;
                snapshot: Record<string, unknown> | null }[];
  causes: { id: string; methodology: string; analysis: string; hypothesis: string | null;
            validatedCause: string | null; approvedAt: string | null; approvedByName: string | null }[];
  actions: { id: string; code: string; actionKind: ActionKind; title: string;
             description: string | null; expectedResult: string | null;
             ownerPositionName: string | null; dueOn: string | null; originalDueOn: string | null;
             status: ActionStatus; completedOn: string | null; completionNote: string | null;
             requiresEffectiveness: boolean; effectivenessCriteria: string | null;
             effectiveness: Effectiveness;
             verifications: { id: string; criteria: string; result: "effective" | "not_effective";
                              comment: string | null; verifiedOn: string; verifiedByName: string | null }[] }[];
  history: { id: string; decisionKind: DecisionKind; outcome: string | null;
             rationale: string | null; decidedAt: string; decidedByName: string | null }[];
  closure: ClosureEligibility;
  positions: { id: string; name: string; holderName: string | null }[];
  processes: { id: string; name: string }[];
  requirementCatalog: { id: string; label: string }[];
  documents: { id: string; label: string }[];
  canManage: boolean; canGovern: boolean; canReopen: boolean;
  canDelete: boolean; deleteBlockedReason: string | null;
  today: string;
};

export function QualityCaseDetail({ model }: { model: CaseDetailModel }) {
  const [findingState, findingAction, findingPending] = useActionState(addFindingAction, initial);
  const [reqState, reqAction, reqPending] = useActionState(addRequirementAction, initial);
  const [procState, procAction, procPending] = useActionState(addProcessAction, initial);
  const [classState, classAction, classPending] = useActionState(classifyCaseAction, initial);
  const [causeState, causeAction, causePending] = useActionState(addCauseAction, initial);
  const [approveState, approveAction, approvePending] = useActionState(approveCauseAction, initial);
  const [planState, planAction, planPending] = useActionState(createActionAction, initial);
  const [completeState, completeAction, completePending] = useActionState(completeActionAction, initial);
  const [verifyState, verifyAction, verifyPending] = useActionState(verifyEffectivenessAction, initial);
  const [closeState, closeAction, closePending] = useActionState(closeCaseAction, initial);
  const [reopenState, reopenAction, reopenPending] = useActionState(reopenCaseAction, initial);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteCaseAction, initial);

  const isClosed = model.status === "closed";
  const isNC = model.classification === "nonconformity";
  const evaluated = model.classification !== "pending";
  const approvedCause = model.causes.find((c) => c.approvedAt !== null) ?? null;

  return (
    <div className="max-w-4xl space-y-5">
      <Link href="/quality/cases" className="text-sm text-loop hover:underline">← Volver a Casos</Link>

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-ink-soft">{model.code}</span>
          <h1 className="text-2xl font-semibold tracking-tight">{model.title}</h1>
          <ClassificationBadge value={model.classification} />
          <CaseStatusBadge value={model.status} />
        </div>
        <p className="text-xs text-ink-soft">
          {CASE_TYPE_LABEL[model.caseType]} · Origen: {CASE_ORIGIN_LABEL[model.originKind]} ·
          Detectado el {model.detectedOn} · Responsable: {model.ownerLabel}
          {model.reportedByName ? ` · Reportó: ${model.reportedByName}` : ""}
          {model.reopenCount > 0 ? ` · Reabierto ${model.reopenCount} ${model.reopenCount === 1 ? "vez" : "veces"}` : ""}
        </p>
        {model.description ? <p className="text-sm text-ink">{model.description}</p> : null}
        {isClosed ? (
          <InfoAlert message={`Caso cerrado el ${model.closedAt?.slice(0, 10)}. ${model.closureNote ?? ""}`} />
        ) : null}
      </header>

      {/* Referencias de origen: lo que ORIGINÓ el caso, sin copiar el dato. */}
      {model.references.length > 0 ? (
        <section className={cardClass}>
          <h2 className="text-sm font-semibold">De dónde viene</h2>
          <p className="mt-1 text-xs text-ink-soft">
            El caso <strong>apunta</strong> a lo que lo originó; no copia el dato. Si aquello
            cambia, se ve dónde mirar — y el contexto de cuando se decidió queda abajo.
          </p>
          <ul className="mt-2 space-y-1">
            {model.references.map((r) => {
              const href = referenceHref(r.refKind, r.refId);
              const snap = r.snapshot;
              return (
                <li key={r.id} className="text-sm">
                  <span className="text-ink-soft">{REFERENCE_KIND_LABEL[r.refKind]}: </span>
                  {href ? (
                    <Link href={href} className="font-medium text-loop hover:underline">
                      {typeof snap?.label === "string" ? snap.label : "ver"}
                    </Link>
                  ) : (
                    <span className="font-medium">{typeof snap?.label === "string" ? snap.label : "—"}</span>
                  )}
                  {snap && typeof snap.context === "string" ? (
                    <span className="block text-xs text-ink-soft">
                      Contexto de aquel momento: {snap.context}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* 1 · HALLAZGO */}
      <Stage step="Paso 1" title="Hallazgo" question="¿Qué se encontró, dónde y cuándo?"
             done={model.findings.length > 0}>
        {model.findings.length === 0 ? (
          <p className="text-sm text-ink-soft">Todavía no hay ningún hallazgo registrado.</p>
        ) : (
          <ul className="space-y-2">
            {model.findings.map((f) => (
              <li key={f.id} className="rounded-md border border-hairline bg-paper p-3">
                <p className="text-sm text-ink">{f.statement}</p>
                <p className="mt-1 text-xs text-ink-soft">
                  {f.locationText ? `${f.locationText} · ` : ""}{f.observedOn}
                  {f.observedByName ? ` · ${f.observedByName}` : ""}
                </p>
                {f.evidenceNote ? <p className="mt-1 text-xs text-ink-soft">Evidencia: {f.evidenceNote}</p> : null}
              </li>
            ))}
          </ul>
        )}
        {model.canManage && !isClosed ? (
          <details>
            <summary className="cursor-pointer text-sm font-medium text-loop">Registrar un hallazgo</summary>
            <form action={findingAction} className="mt-2 space-y-2">
              <h3 className="text-xs font-semibold">Nuevo hallazgo</h3>
              <ErrorAlert message={findingState.error} />
              <input type="hidden" name="case_id" value={model.caseId} />
              <Field label="Qué se encontró">
                <textarea name="statement" required rows={2} className={inputClass}
                          placeholder="El hecho observado, sin calificarlo todavía." />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Dónde (opcional)">
                  <input name="location_text" className={inputClass} placeholder="Proceso, área, documento…" />
                </Field>
                <Field label="Cuándo">
                  <input type="date" name="observed_on" className={inputClass} defaultValue={model.today} />
                </Field>
              </div>
              <Field label="Evidencia (opcional)">
                <input name="evidence_note" className={inputClass} placeholder="Qué lo respalda." />
              </Field>
              <Button type="submit" disabled={findingPending} variant="quiet" className="w-auto px-3 py-1.5 text-xs">
                {findingPending ? "Guardando…" : "Registrar hallazgo"}
              </Button>
            </form>
          </details>
        ) : null}
      </Stage>

      {/* 2 · CONTRA QUÉ */}
      <Stage step="Paso 2" title="Requisitos y procesos" question="¿Contra qué se mide, y a quién toca?"
             done={model.requirements.length > 0}>
        {model.processNames ? (
          <p className="text-sm text-ink">Procesos: {model.processNames}</p>
        ) : (
          <p className="text-sm text-ink-soft">Sin procesos relacionados todavía.</p>
        )}
        {model.requirements.length > 0 ? (
          <ul className="space-y-1">
            {model.requirements.map((r) => (
              <li key={r.id} className="text-sm">
                <span className="font-medium">{r.label}</span>
                <span className="text-xs text-ink-soft"> · {r.source}</span>
                {r.note ? <span className="block text-xs text-ink-soft">{r.note}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-soft">Sin requisitos relacionados todavía.</p>
        )}
        {model.canManage && !isClosed ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <details>
              <summary className="cursor-pointer text-sm font-medium text-loop">Relacionar un proceso</summary>
              <form action={procAction} className="mt-2 space-y-2">
                <h3 className="text-xs font-semibold">Proceso relacionado</h3>
                <ErrorAlert message={procState.error} />
                <input type="hidden" name="case_id" value={model.caseId} />
                <select name="process_id" defaultValue="" className={inputClass}>
                  <option value="">— elige —</option>
                  {model.processes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <Button type="submit" disabled={procPending} variant="quiet" className="w-auto px-3 py-1.5 text-xs">
                  {procPending ? "Guardando…" : "Relacionar"}
                </Button>
              </form>
            </details>
            <details>
              <summary className="cursor-pointer text-sm font-medium text-loop">Relacionar un requisito</summary>
              <form action={reqAction} className="mt-2 space-y-2">
                <h3 className="text-xs font-semibold">Requisito relacionado</h3>
                <p className="text-xs text-ink-soft">Elige una sola fuente.</p>
                <ErrorAlert message={reqState.error} />
                <input type="hidden" name="case_id" value={model.caseId} />
                <Field label="Requisito normativo">
                  <select name="requirement_id" defaultValue="" className={inputClass}>
                    <option value="">— ninguno —</option>
                    {model.requirementCatalog.map((r) => (
                      <option key={r.id} value={r.id}>{r.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="…o un documento interno">
                  <select name="document_id" defaultValue="" className={inputClass}>
                    <option value="">— ninguno —</option>
                    {model.documents.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                  </select>
                </Field>
                <Field label="…o escríbelo">
                  <input name="custom_text" className={inputClass} placeholder="Requisito contractual, del cliente…" />
                </Field>
                <Button type="submit" disabled={reqPending} variant="quiet" className="w-auto px-3 py-1.5 text-xs">
                  {reqPending ? "Guardando…" : "Relacionar"}
                </Button>
              </form>
            </details>
          </div>
        ) : null}
      </Stage>

      {/* 3 · EVALUACIÓN */}
      <Stage step="Paso 3" title="Evaluación" question="¿Esto es una no conformidad?" done={evaluated}>
        {evaluated ? (
          <div className="space-y-2">
            <p className="text-sm text-ink">
              <ClassificationBadge value={model.classification} />{" "}
              <span className="text-ink-soft">{CLASSIFICATION_HELP[model.classification]}</span>
            </p>
            {isNC ? (
              <div className="space-y-2 rounded-md border border-hairline bg-paper p-3">
                <div>
                  <p className="text-xs font-semibold text-ink-soft">REQUISITO</p>
                  <p className="text-sm text-ink">{model.requirementText}</p>
                </div>
                {model.evidenceText ? (
                  <div>
                    <p className="text-xs font-semibold text-ink-soft">EVIDENCIA</p>
                    <p className="text-sm text-ink">{model.evidenceText}</p>
                  </div>
                ) : null}
                <div>
                  <p className="text-xs font-semibold text-ink-soft">NO CONFORMIDAD</p>
                  <p className="text-sm text-ink">{model.nonconformityText}</p>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-ink-soft">
            Nadie ha decidido todavía. Un hecho observado no es una no conformidad hasta
            que alguien con autoridad lo evalúa contra un requisito.
          </p>
        )}

        {model.canGovern && !isClosed ? (
          <details>
            <summary className="cursor-pointer text-sm font-medium text-loop">
              {evaluated ? "Registrar una nueva evaluación" : "Evaluar este caso"}
            </summary>
            <form action={classAction} className="mt-2 space-y-2">
              <h3 className="text-xs font-semibold">Evaluación del caso</h3>
              <p className="text-xs text-ink-soft">{CASE_THRESHOLD.classify}</p>
              <ErrorAlert message={classState.error} />
              {classState.success ? <SuccessAlert message={classState.message ?? null} /> : null}
              <input type="hidden" name="case_id" value={model.caseId} />
              <Field label="Clasificación">
                <select name="classification" defaultValue="" required className={inputClass}>
                  <option value="">— elige —</option>
                  {DECIDABLE_CLASSIFICATIONS.map((c) => (
                    <option key={c} value={c}>{CLASSIFICATION_LABEL[c]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Fundamento (obligatorio)" hint="Es lo que hace defendible la decisión.">
                <textarea name="rationale" required rows={2} className={inputClass} />
              </Field>
              <div className="rounded-md border border-hairline bg-paper p-3 space-y-2">
                <p className="text-xs font-semibold text-ink-soft">
                  SOLO SI ES NO CONFORMIDAD — tres cosas distintas, no un párrafo
                </p>
                <Field label="Requisito" hint="Qué exige la norma, el documento o el contrato.">
                  <textarea name="requirement_text" rows={2} className={inputClass}
                            defaultValue={model.requirementText ?? ""}
                            placeholder="El procedimiento X exige revisión anual." />
                </Field>
                <Field label="Evidencia" hint="Qué se observó, con datos.">
                  <textarea name="evidence_text" rows={2} className={inputClass}
                            defaultValue={model.evidenceText ?? ""}
                            placeholder="La revisión vigente venció el 30/06/2026 y no hay posterior." />
                </Field>
                <Field label="Incumplimiento" hint="La declaración, en una frase.">
                  <textarea name="nonconformity_text" rows={2} className={inputClass}
                            defaultValue={model.nonconformityText ?? ""}
                            placeholder="No se realizó la revisión dentro de la periodicidad definida." />
                </Field>
              </div>
              <Button type="submit" disabled={classPending} className="w-auto px-4 py-2 text-sm">
                {classPending ? "Registrando…" : "Registrar la evaluación"}
              </Button>
            </form>
          </details>
        ) : null}
      </Stage>

      {/* 4 · CAUSA */}
      {isNC ? (
        <Stage step="Paso 4" title="Causa" question="¿Por qué ocurrió?" done={approvedCause !== null}>
          {model.causes.length === 0 ? (
            <p className="text-sm text-ink-soft">Todavía no hay análisis.</p>
          ) : (
            <ul className="space-y-2">
              {model.causes.map((c) => (
                <li key={c.id} className="rounded-md border border-hairline bg-paper p-3">
                  <p className="text-xs text-ink-soft">
                    {c.methodology === "five_whys" ? "Cinco porqués"
                      : c.methodology === "ishikawa" ? "Ishikawa" : "Análisis estructurado"}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{c.analysis}</p>
                  {c.hypothesis ? (
                    <p className="mt-1 text-xs text-ink-soft">Hipótesis: {c.hypothesis}</p>
                  ) : null}
                  {c.validatedCause ? (
                    <p className="mt-2 text-sm">
                      <span className="font-semibold">Causa validada:</span> {c.validatedCause}
                      <span className="block text-xs text-ink-soft">
                        Aprobada el {c.approvedAt?.slice(0, 10)}
                        {c.approvedByName ? ` por ${c.approvedByName}` : ""}
                      </span>
                    </p>
                  ) : model.canGovern && !isClosed ? (
                    <form action={approveAction} className="mt-2 space-y-2">
                      <h4 className="text-xs font-semibold">Aprobar la causa</h4>
                      <p className="text-xs text-ink-soft">{CASE_THRESHOLD.approve_cause}</p>
                      <ErrorAlert message={approveState.error} />
                      <input type="hidden" name="case_id" value={model.caseId} />
                      <input type="hidden" name="cause_id" value={c.id} />
                      <Field label="Causa validada">
                        <input name="validated_cause" required className={inputClass}
                               defaultValue={c.hypothesis ?? ""} />
                      </Field>
                      <Button type="submit" disabled={approvePending} variant="quiet" className="w-auto px-3 py-1.5 text-xs">
                        {approvePending ? "Aprobando…" : "Aprobar causa"}
                      </Button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {model.canManage && !isClosed ? (
            <details>
              <summary className="cursor-pointer text-sm font-medium text-loop">Registrar un análisis</summary>
              <form action={causeAction} className="mt-2 space-y-2">
                <h3 className="text-xs font-semibold">Análisis de causa</h3>
                <p className="text-xs text-ink-soft">
                  Una hipótesis se propone y se discute; una causa validada se aprueba y
                  a partir de ahí fundamenta el plan.
                </p>
                <ErrorAlert message={causeState.error} />
                <input type="hidden" name="case_id" value={model.caseId} />
                <Field label="Metodología">
                  <select name="methodology" defaultValue="structured" className={inputClass}>
                    <option value="structured">Análisis estructurado</option>
                    <option value="five_whys">Cinco porqués</option>
                    <option value="ishikawa">Ishikawa</option>
                  </select>
                </Field>
                <Field label="Desarrollo">
                  <textarea name="analysis" required rows={4} className={inputClass}
                            placeholder="El razonamiento, paso a paso." />
                </Field>
                <Field label="Causa propuesta (hipótesis)">
                  <input name="hypothesis" className={inputClass} />
                </Field>
                <Button type="submit" disabled={causePending} variant="quiet" className="w-auto px-3 py-1.5 text-xs">
                  {causePending ? "Guardando…" : "Registrar análisis"}
                </Button>
              </form>
            </details>
          ) : null}
        </Stage>
      ) : null}

      {/* 5 · ACCIONES */}
      <Stage step="Paso 5" title="Acciones" question="¿Qué se hizo, y qué se hará para que no se repita?"
             done={model.actions.length > 0}>
        {model.actions.length === 0 ? (
          <p className="text-sm text-ink-soft">Todavía no hay acciones.</p>
        ) : (
          <ul className="space-y-2">
            {model.actions.map((a) => (
              <li key={a.id} className="rounded-md border border-hairline bg-paper p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-ink-soft">{a.code}</span>
                  <ActionKindBadge value={a.actionKind} />
                  <span className="text-sm font-medium">{a.title}</span>
                  <ActionStandingBadge status={a.status} effectiveness={a.effectiveness} />
                </div>
                <p className="mt-1 text-xs text-ink-soft">
                  {a.ownerPositionName ? `${a.ownerPositionName} · ` : ""}
                  {a.dueOn ? describeDue(a.dueOn, model.today) : "Sin fecha objetivo"}
                  {a.originalDueOn && a.originalDueOn !== a.dueOn
                    ? ` · fecha original ${a.originalDueOn}` : ""}
                </p>
                {a.expectedResult ? (
                  <p className="mt-1 text-xs text-ink-soft">Resultado esperado: {a.expectedResult}</p>
                ) : null}
                {a.completionNote ? (
                  <p className="mt-1 text-xs text-ink">
                    Completada el {a.completedOn}: {a.completionNote}
                  </p>
                ) : null}
                {a.requiresEffectiveness && a.effectivenessCriteria ? (
                  <p className="mt-1 text-xs text-ink-soft">
                    Se verificará contra: {a.effectivenessCriteria}
                  </p>
                ) : null}
                {a.verifications.length > 0 ? (
                  <ul className="mt-2 space-y-1 border-t border-hairline pt-2">
                    {a.verifications.map((v) => (
                      <li key={v.id} className="text-xs">
                        <span className={v.result === "effective" ? "font-medium text-loop-deep" : "font-medium text-danger"}>
                          {v.result === "effective" ? "Eficaz" : "NO eficaz"}
                        </span>
                        {" · "}{v.verifiedOn}{v.verifiedByName ? ` · ${v.verifiedByName}` : ""}
                        {v.comment ? <span className="block text-ink-soft">{v.comment}</span> : null}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {model.canManage && !isClosed && a.status !== "completed" && a.status !== "cancelled" ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-medium text-loop">Completar esta acción</summary>
                    <form action={completeAction} className="mt-2 space-y-2">
                      <h4 className="text-xs font-semibold">Completar la acción</h4>
                      <p className="text-xs text-ink-soft">{CASE_THRESHOLD.complete_action}</p>
                      <ErrorAlert message={completeState.error} />
                      <input type="hidden" name="case_id" value={model.caseId} />
                      <input type="hidden" name="action_id" value={a.id} />
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Field label="Fecha">
                          <input type="date" name="completed_on" className={inputClass} defaultValue={model.today} />
                        </Field>
                      </div>
                      <Field label="Qué se hizo (obligatorio)">
                        <textarea name="note" required rows={2} className={inputClass} />
                      </Field>
                      <Button type="submit" disabled={completePending} variant="quiet" className="w-auto px-3 py-1.5 text-xs">
                        {completePending ? "Guardando…" : "Marcar completada"}
                      </Button>
                    </form>
                  </details>
                ) : null}

                {model.canGovern && !isClosed && a.status === "completed"
                  && a.requiresEffectiveness && a.effectiveness === "pending" ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-medium text-amber">
                      Verificar si sirvió
                    </summary>
                    <form action={verifyAction} className="mt-2 space-y-2">
                      <h4 className="text-xs font-semibold">Verificación de eficacia</h4>
                      <p className="text-xs text-ink-soft">{CASE_THRESHOLD.verify_effectiveness}</p>
                      <ErrorAlert message={verifyState.error} />
                      <input type="hidden" name="case_id" value={model.caseId} />
                      <input type="hidden" name="action_id" value={a.id} />
                      <Field label="Resultado">
                        <select name="result" defaultValue="" required className={inputClass}>
                          <option value="">— elige —</option>
                          <option value="effective">Eficaz</option>
                          <option value="not_effective">No eficaz</option>
                        </select>
                      </Field>
                      <Field label="Criterio aplicado">
                        <input name="criteria" className={inputClass} defaultValue={a.effectivenessCriteria ?? ""} />
                      </Field>
                      <Field label="Comentario">
                        <textarea name="comment" rows={2} className={inputClass} />
                      </Field>
                      <Button type="submit" disabled={verifyPending} variant="quiet" className="w-auto px-3 py-1.5 text-xs">
                        {verifyPending ? "Registrando…" : "Registrar verificación"}
                      </Button>
                    </form>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {model.canManage && !isClosed ? (
          <details>
            <summary className="cursor-pointer text-sm font-medium text-loop">Planificar una acción</summary>
            <form action={planAction} className="mt-2 space-y-2">
              <h3 className="text-xs font-semibold">Nueva acción</h3>
              <ErrorAlert message={planState.error} />
              <input type="hidden" name="case_id" value={model.caseId} />
              <Field label="Tipo">
                <select name="action_kind" defaultValue="correction" className={inputClass}>
                  {ACTION_KINDS.map((k) => (
                    <option key={k} value={k}>{ACTION_KIND_LABEL[k]} — {ACTION_KIND_HELP[k]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Qué se va a hacer">
                <input name="title" required className={inputClass} />
              </Field>
              <Field label="Resultado esperado">
                <input name="expected_result" className={inputClass} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Responsable (cargo)">
                  <select name="owner_position_id" defaultValue="" className={inputClass}>
                    <option value="">— sin asignar —</option>
                    {model.positions.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}{p.holderName ? ` · ${p.holderName}` : ""}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Fecha objetivo">
                  <input type="date" name="due_on" className={inputClass} />
                </Field>
                <Field label="Prioridad">
                  <select name="priority" defaultValue="normal" className={inputClass}>
                    {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
                  </select>
                </Field>
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="requires_effectiveness" className="mt-1" />
                <span>
                  Hay que verificar después si sirvió
                  <span className="block text-xs text-ink-soft">
                    El criterio se define ahora, no después de ver el resultado.
                  </span>
                </span>
              </label>
              <Field label="Criterio de eficacia">
                <input name="effectiveness_criteria" className={inputClass}
                       placeholder="Contra qué se comprobará que funcionó." />
              </Field>
              <Button type="submit" disabled={planPending} variant="quiet" className="w-auto px-3 py-1.5 text-xs">
                {planPending ? "Guardando…" : "Planificar acción"}
              </Button>
            </form>
          </details>
        ) : null}
      </Stage>

      {/* 6 · CIERRE */}
      <Stage step="Paso 6" title="Cierre" question="¿Podemos cerrar esto?" done={isClosed}>
        {isClosed ? (
          <p className="text-sm text-ink">
            Cerrado el {model.closedAt?.slice(0, 10)}. {model.closureNote}
          </p>
        ) : model.closure.canClose ? (
          <p className="text-sm text-ink">{model.closure.reason}</p>
        ) : (
          <div className="text-sm">
            <p className="text-ink-soft">{model.closure.reason}</p>
            {model.closure.missing.length > 0 ? (
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink">
                {model.closure.missing.map((m) => <li key={m}>{m}</li>)}
              </ul>
            ) : null}
          </div>
        )}

        {model.canGovern && !isClosed ? (
          <details>
            <summary className="cursor-pointer text-sm font-medium text-loop">Cerrar el caso</summary>
            <form action={closeAction} className="mt-2 space-y-2">
              <h3 className="text-xs font-semibold">Cierre del caso</h3>
              <p className="text-xs text-ink-soft">{CASE_THRESHOLD.close_case}</p>
              <ErrorAlert message={closeState.error} />
              <input type="hidden" name="case_id" value={model.caseId} />
              <Field label="Fundamento del cierre">
                <textarea name="note" required rows={2} className={inputClass} />
              </Field>
              <Button type="submit" disabled={closePending} variant="quiet" className="w-auto px-3 py-1.5 text-xs">
                {closePending ? "Cerrando…" : "Cerrar caso"}
              </Button>
            </form>
          </details>
        ) : null}

        {model.canReopen && isClosed ? (
          <details>
            <summary className="cursor-pointer text-sm font-medium text-amber">Reabrir el caso</summary>
            <form action={reopenAction} className="mt-2 space-y-2">
              <h3 className="text-xs font-semibold">Reapertura</h3>
              <p className="text-xs text-ink-soft">
                El cierre anterior no se borra: queda en el historial junto con el motivo de
                la reapertura.
              </p>
              <ErrorAlert message={reopenState.error} />
              <input type="hidden" name="case_id" value={model.caseId} />
              <Field label="Motivo (obligatorio)">
                <textarea name="reason" required rows={2} className={inputClass} />
              </Field>
              <Button type="submit" disabled={reopenPending} variant="quiet" className="w-auto px-3 py-1.5 text-xs">
                {reopenPending ? "Reabriendo…" : "Reabrir caso"}
              </Button>
            </form>
          </details>
        ) : null}
      </Stage>

      {/* HISTORIA DE NEGOCIO */}
      <section className={cardClass}>
        <h2 className="text-sm font-semibold">Historial</h2>
        <p className="mt-1 text-xs text-ink-soft">
          Lo que se decidió, quién y por qué. No se edita: si una conclusión cambia,
          aparece una decisión nueva y las dos quedan.
        </p>
        {model.history.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">Todavía no hay decisiones registradas.</p>
        ) : (
          <ol className="mt-3 space-y-3">
            {model.history.map((h) => (
              <li key={h.id} className="border-l-2 border-hairline pl-3">
                <p className="text-sm font-medium">{describeDecision(h.decisionKind, h.outcome)}</p>
                <p className="text-xs text-ink-soft">
                  {h.decidedAt.slice(0, 10)}{h.decidedByName ? ` · ${h.decidedByName}` : ""}
                </p>
                {h.rationale ? <p className="mt-0.5 text-sm text-ink">{h.rationale}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* CICLO DE VIDA */}
      {model.canDelete || model.deleteBlockedReason ? (
        <section className={cardClass}>
          {model.canDelete ? (
            <>
              <h3 className="text-sm font-semibold">Eliminar este caso</h3>
              <p className="mt-1 text-xs text-ink-soft">
                Podrás eliminarlo mientras siga en borrador y no haya decisiones, hallazgos ni
                acciones. En cuanto se evalúa, su historial debe conservarse.
              </p>
              <details className="mt-2">
                <summary className="cursor-pointer text-sm font-medium text-amber">Eliminar caso</summary>
                <form action={deleteAction} className="mt-2 space-y-2">
                  <input type="hidden" name="case_id" value={model.caseId} />
                  <p className="text-sm text-ink">
                    Esta acción eliminará definitivamente el borrador «{model.title}». No se puede deshacer.
                  </p>
                  <ErrorAlert message={deleteState.error} />
                  <Button type="submit" disabled={deletePending} variant="quiet"
                          className="w-auto border-amber/40 px-3 py-1.5 text-xs text-amber">
                    {deletePending ? "Eliminando…" : "Sí, eliminar definitivamente"}
                  </Button>
                </form>
              </details>
            </>
          ) : (
            <>
              <h3 className="text-sm font-semibold">Este caso ya no puede eliminarse</h3>
              <p className="mt-1 text-sm text-ink-soft">{model.deleteBlockedReason}</p>
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}
