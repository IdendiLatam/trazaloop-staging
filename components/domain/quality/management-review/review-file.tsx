"use client";

import { ExportPdfButton } from "@/components/ui/export-pdf-button";
import {
  ActionForm, Card, Counter, DomainNote, Field, inputClass, Pill,
  StageTrail, Table,
} from "@/components/domain/quality/management-review/shared";
import type {
  AgendaItemRow, DecisionRow, InputRow, MinutesRow, NoteRow, ParticipantRow,
  ReviewDetailRow, ReviewRow,
} from "@/lib/db/quality-management-review";
import {
  AI_DOES_NOT_DECIDE, ATTENDANCE_IS_NOT_APPROVAL, AUDIT_NOTES_STAY_IN_AUDITS,
  CLOSED_REVIEW_IS_IMMUTABLE, CLOSING_DOES_NOT_CLOSE_ACTIONS,
  CUSTOMER_ANONYMITY_HOLDS, DECISION_IS_NOT_AN_ACTION, DECISION_KIND_LABEL,
  DECISION_KINDS, DECISION_MAY_HAVE_NO_ACTIONS, describeDecisionOutcome,
  describeFollowUp, describeLineage, describeReadiness, formatDate,
  INPUT_DRILL_DOWN, INPUT_MODE_LABEL,
  INPUT_SOURCE_DOMAIN, INPUT_STATE_LABEL, MANUAL_ENTRY_KIND_LABEL,
  MANUAL_ENTRY_KINDS, MANUAL_INPUT_IS_DECLARED,
  MINUTES_ARE_FROZEN_FOLLOWUP_IS_LIVE, MISSING_IS_NOT_ZERO, NO_MAGIC_NUMBERS,
  NOT_APPLICABLE_IS_NOT_MISSING, PARTICIPANT_HISTORY_IS_FROZEN,
  PARTICIPATION_ROLE_LABEL, PARTICIPATION_ROLES, PEOPLE_DATA_IS_AGGREGATED,
  PREPARATION_IS_REAL_WORK, readinessBreakdown, REFRESH_KEEPS_ANALYSIS,
  REOPEN_IS_EXCEPTIONAL, RESOURCE_KIND_LABEL, RESOURCE_KINDS,
  RESOURCES_ARE_JUDGED_NOT_CALCULATED, REVIEW_IS_NOT_AN_AUDIT,
  REVIEW_KIND_LABEL, REVIEW_STATUS_LABEL, SOURCE_UPDATED_IS_ANNOUNCED,
  SUMMARY_IS_NOT_RAW_ACCESS, type InputCode, type Readiness,
} from "@/lib/domain/quality-management-review";
import {
  addAgendaItemAction, addManualEntryAction, addNoteAction, addParticipantAction,
  cancelReviewAction, closeReviewAction, createActionFromDecisionAction,
  issueMinutesAction, markInputNotApplicableAction, prepareInputsAction,
  proposeAgendaAction, recordDecisionAction, refreshInputAction,
  removeAgendaItemAction, removeDecisionAction, removeManualEntryAction,
  removeParticipantAction, reopenReviewAction, saveConclusionsAction,
  saveInputAnalysisAction, scheduleNextReviewAction, updateReviewAction,
} from "@/server/actions/quality-management-review";
import type { Option } from "@/components/domain/quality/management-review/reviews";

export type ReviewFileData = {
  review: ReviewRow;
  detail: ReviewDetailRow | null;
  participants: ParticipantRow[];
  agenda: AgendaItemRow[];
  inputs: InputRow[];
  decisions: DecisionRow[];
  minutes: MinutesRow[];
  notes: NoteRow[];
  readiness: Readiness | null;
  followUp: Record<string, unknown> | null;
  /** §56 · Por entrada: ¿cambió la fuente desde que se preparó? */
  freshness: Record<string, boolean>;
};

export type ReviewFileOptions = {
  positions: Option[];
  people: Option[];
};

/**
 * Trazaloop Quality · QUALITY-10 · La revisión entera en una pantalla.
 *
 * El orden es el del trabajo real —preparar, revisar, analizar, decidir,
 * cerrar, seguir— pero cada bloque es una sección abierta, no un paso de
 * asistente: se puede volver a cualquiera mientras la revisión siga abierta.
 */
export function ReviewFile({
  data, options, canManage, canClose,
}: {
  data: ReviewFileData;
  options: ReviewFileOptions;
  canManage: boolean;
  canClose: boolean;
}) {
  const r = data.review;
  const cerrada = r.status === "closed" || r.status === "cancelled";
  const editable = canManage && !cerrada;
  const etapa = etapaActual(data);

  return (
    <div className="space-y-6">
      <Header data={data} options={options} canManage={editable} />
      <StageTrail current={etapa} />

      <Section title="1 · Preparar" open>
        <PrepareBlock data={data} options={options} canManage={editable} />
      </Section>

      <Section title="2 · Entradas y 3 · Análisis" open>
        <InputsBlock data={data} canManage={editable} />
      </Section>

      <Section title="4 · Decidir" open>
        <DecisionsBlock data={data} options={options} canManage={editable} />
      </Section>

      <Section title="5 · Conclusiones, acta y cierre">
        <ClosureBlock data={data} canManage={editable} canClose={canClose}
          cerrada={cerrada} />
      </Section>

      <Section title="6 · Seguimiento">
        <FollowUpBlock data={data} />
      </Section>
    </div>
  );
}

/** La etapa que el estado real sugiere. Nadie queda bloqueado por ella. */
function etapaActual(d: ReviewFileData): number {
  if (d.review.status === "closed") return 6;
  if (d.inputs.length === 0) return 1;
  if (d.review.inputsPending > 0) return 2;
  if (d.review.inputsWithAnalysis < d.inputs.length - d.review.inputsNotApplicable) return 3;
  if (d.review.decisionCount === 0) return 4;
  return 5;
}

function Section({ title, open, children }: {
  title: string; open?: boolean; children: React.ReactNode;
}) {
  return (
    <details open={open} className="rounded-lg border border-hairline bg-canvas/40">
      <summary className="cursor-pointer px-4 py-2 text-sm font-semibold text-ink">
        {title}
      </summary>
      <div className="space-y-4 p-4 pt-0">{children}</div>
    </details>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-ink-soft">{label}</p>
      <p className="text-ink">{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Header({ data, options, canManage }: {
  data: ReviewFileData; options: ReviewFileOptions; canManage: boolean;
}) {
  const r = data.review;
  return (
    <Card
      title={`${r.code} · ${r.title}`}
      description={data.detail?.scopeNote ?? undefined}
      action={
        <span className="flex flex-wrap items-center gap-2">
          <Pill tone={r.status === "closed" ? "good" : r.status === "cancelled" ? "bad" : "neutral"}>
            {REVIEW_STATUS_LABEL[r.status]}
          </Pill>
          <ExportPdfButton
            exportKey="quality.management-review.detail" id={r.id} label="Descargar PDF"
          />
        </span>
      }
    >
      <div className="grid gap-2 text-xs sm:grid-cols-3">
        <Fact label="Tipo" value={REVIEW_KIND_LABEL[r.reviewKind]} />
        <Fact label="Periodo analizado"
          value={`${r.periodLabel} · ${formatDate(r.periodStart)} — ${formatDate(r.periodEnd)}`} />
        <Fact label="Responsable" value={r.ownerPositionName ?? "Sin asignar"} />
        <Fact label="Sesión" value={formatDate(r.sessionHeldOn)} />
        <Fact label="Participantes" value={`${r.participantsAttended} de ${r.participantCount}`} />
        <Fact label="Cerrada" value={r.closedAt ? formatDate(r.closedAt.slice(0, 10)) : "—"} />
      </div>

      <DomainNote>{REVIEW_IS_NOT_AN_AUDIT}</DomainNote>
      <DomainNote>{AI_DOES_NOT_DECIDE}</DomainNote>

      {data.detail?.reopenedAt ? (
        <DomainNote>
          Reabierta el {formatDate(data.detail.reopenedAt.slice(0, 10))}:{" "}
          {data.detail.reopenReason}. El cierre anterior no se borró.
        </DomainNote>
      ) : null}
      {data.detail?.cancelReason ? (
        <DomainNote>Cancelada: {data.detail.cancelReason}</DomainNote>
      ) : null}

      {canManage ? (
        <details className="rounded-md border border-hairline px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-ink">
            Editar datos y sesión
          </summary>
          <div className="pt-3">
            <ActionForm action={updateReviewAction} submitLabel="Guardar">
              <input type="hidden" name="review_id" value={r.id} />
              <Field label="Título">
                <input name="title" defaultValue={r.title} required className={inputClass} />
              </Field>
              <Field label="Alcance">
                <textarea name="scope_note" rows={2} className={inputClass}
                  defaultValue={data.detail?.scopeNote ?? ""} />
              </Field>
              <Field label="Responsable (cargo)">
                <select name="owner_position_id" className={inputClass}
                  defaultValue={r.ownerPositionId ?? ""}>
                  <option value="">Sin asignar</option>
                  {options.positions.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </Field>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Día de la sesión"
                  hint="La revisión no es la reunión: puede prepararse durante semanas.">
                  <input type="date" name="session_held_on" className={inputClass}
                    defaultValue={r.sessionHeldOn ?? ""} />
                </Field>
                <Field label="Lugar">
                  <input name="session_location" className={inputClass}
                    defaultValue={data.detail?.sessionLocation ?? ""} />
                </Field>
                <Field label="Nota de la sesión">
                  <input name="session_note" className={inputClass}
                    defaultValue={data.detail?.sessionNote ?? ""} />
                </Field>
              </div>
              <Field label="Nota de agenda">
                <textarea name="agenda_note" rows={2} className={inputClass}
                  defaultValue={data.detail?.agendaNote ?? ""} />
              </Field>
            </ActionForm>
          </div>
        </details>
      ) : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------

function PrepareBlock({ data, options, canManage }: {
  data: ReviewFileData; options: ReviewFileOptions; canManage: boolean;
}) {
  const r = data.review;
  return (
    <>
      <Card
        title="Preparación"
        description="La plataforma reúne las entradas leyendo lo que ya está en el sistema."
        action={
          <ExportPdfButton
            exportKey="quality.management-review-inputs.detail" id={r.id}
            label="Descargar PDF"
          />
        }
      >
        <DomainNote>{PREPARATION_IS_REAL_WORK}</DomainNote>
        {data.readiness ? (
          <>
            <p className="text-xs text-ink">{describeReadiness(data.readiness)}</p>
            <ul className="space-y-0.5">
              {readinessBreakdown(data.readiness).map((l) => (
                <li key={l} className="text-xs text-ink-soft">· {l}</li>
              ))}
            </ul>
          </>
        ) : null}
        {canManage ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <ActionForm action={prepareInputsAction} submitLabel="Preparar entradas">
              <input type="hidden" name="review_id" value={r.id} />
            </ActionForm>
            <ActionForm action={proposeAgendaAction} submitLabel="Proponer agenda">
              <input type="hidden" name="review_id" value={r.id} />
            </ActionForm>
          </div>
        ) : null}
        <DomainNote>{REFRESH_KEEPS_ANALYSIS}</DomainNote>
      </Card>

      <Card
        title="Participantes"
        description="Quién participó, con qué papel y con qué cargo en ese momento."
        action={<ExportPdfButton
          exportKey="quality.management-review-agenda.detail" id={r.id} label="Descargar PDF" />}
      >
        <DomainNote>{PARTICIPANT_HISTORY_IS_FROZEN}</DomainNote>
        <DomainNote>{ATTENDANCE_IS_NOT_APPROVAL}</DomainNote>
        <Table
          headers={["Quién", "Papel", "Cargo entonces", "Asistió", "Aportación",
                    canManage ? "" : "—"]}
          empty="Sin participantes registrados."
          rows={data.participants.map((p) => [
            <span key="n">
              {p.personName ?? p.externalName}
              {p.personId === null
                ? <span className="block text-ink-soft">Externo, sin cuenta</span>
                : null}
            </span>,
            PARTICIPATION_ROLE_LABEL[p.participationRole],
            p.positionNameAtReview ?? "—",
            p.attended ? "Sí" : "No",
            p.contributionNote ?? "—",
            canManage
              ? <InlineAction key="d" action={removeParticipantAction} label="Quitar"
                  fields={{ participant_id: p.id, review_id: r.id }} />
              : "",
          ])}
        />
        {canManage ? (
          <ActionForm action={addParticipantAction} submitLabel="Añadir participante">
            <input type="hidden" name="review_id" value={r.id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Persona de la empresa">
                <select name="person_id" className={inputClass} defaultValue="">
                  <option value="">—</option>
                  {options.people.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="O nombre externo" hint="Una de las dos, no las dos.">
                <input name="external_name" className={inputClass} />
              </Field>
              <Field label="Papel">
                <select name="participation_role" className={inputClass} defaultValue="member">
                  {PARTICIPATION_ROLES.map((x) => (
                    <option key={x} value={x}>{PARTICIPATION_ROLE_LABEL[x]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Cargo en esta revisión"
                hint="Si lo dejas vacío se toma el que ocupaba en la fecha de la sesión.">
                <input name="position_name_at_review" className={inputClass} />
              </Field>
            </div>
            <Field label="Asistió">
              <input type="checkbox" name="attended" defaultChecked className="mr-2 align-middle" />
            </Field>
            <Field label="Aportación">
              <input name="contribution_note" className={inputClass} />
            </Field>
          </ActionForm>
        ) : null}
      </Card>

      <Card title="Agenda" description="Se propone desde las entradas; el orden es tuyo.">
        <Table
          headers={["#", "Punto", "Entrada", "Horario", "Presenta", canManage ? "" : "—"]}
          empty="Sin agenda todavía."
          rows={data.agenda.map((a) => [
            a.order, a.title, a.catalogCode ?? "—",
            a.timeLabel ?? "—", a.presenterName ?? "—",
            canManage
              ? <InlineAction key="d" action={removeAgendaItemAction} label="Quitar"
                  fields={{ item_id: a.id, review_id: r.id }} />
              : "",
          ])}
        />
        {canManage ? (
          <ActionForm action={addAgendaItemAction} submitLabel="Añadir punto">
            <input type="hidden" name="review_id" value={r.id} />
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Punto">
                <input name="title" required className={inputClass} />
              </Field>
              <Field label="Horario">
                <input name="time_label" className={inputClass} placeholder="09:00 — 09:30" />
              </Field>
              <Field label="Orden">
                <input type="number" name="position_order" min={1}
                  defaultValue={data.agenda.length + 1} className={inputClass} />
              </Field>
            </div>
          </ActionForm>
        ) : null}
      </Card>
    </>
  );
}

/** Un botón que dispara una acción con campos ocultos. Nada más. */
function InlineAction({ action, label, fields }: {
  action: (prev: import("@/server/actions/quality-management-review").ReviewActionState,
           form: FormData) => Promise<import("@/server/actions/quality-management-review").ReviewActionState>;
  label: string;
  fields: Record<string, string>;
}) {
  return (
    <ActionForm action={action} submitLabel={label} className="inline">
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
    </ActionForm>
  );
}

// ---------------------------------------------------------------------------

function InputsBlock({ data, canManage }: {
  data: ReviewFileData; canManage: boolean;
}) {
  return (
    <>
      <DomainNote>{MISSING_IS_NOT_ZERO}</DomainNote>
      <DomainNote>{NOT_APPLICABLE_IS_NOT_MISSING}</DomainNote>
      <DomainNote>{NO_MAGIC_NUMBERS}</DomainNote>
      <DomainNote>{SUMMARY_IS_NOT_RAW_ACCESS}</DomainNote>

      {data.inputs.length === 0
        ? <p className="text-xs text-ink-soft">
            Todavía no se han preparado las entradas. Pulsa «Preparar entradas».
          </p>
        : null}

      {data.inputs.map((i) => (
        <InputCard key={i.id} input={i} reviewId={data.review.id}
          sourceUpdated={data.freshness[i.id] === true} canManage={canManage} />
      ))}
    </>
  );
}

function InputCard({ input, reviewId, sourceUpdated, canManage }: {
  input: InputRow; reviewId: string; sourceUpdated: boolean; canManage: boolean;
}) {
  const lineage = describeLineage(
    (input.snapshot as Record<string, unknown> | null)?.lineage
  );
  const nota = (input.snapshot as Record<string, unknown> | null)?.note;

  return (
    <Card
      title={`${input.order}. ${input.catalogLabel}`}
      description={INPUT_SOURCE_DOMAIN[input.catalogCode as InputCode] ?? undefined}
      action={
        <span className="flex flex-wrap items-center gap-2">
          <Pill tone={
            input.state === "reviewed" ? "good"
              : input.state === "pending" ? "warn"
                : input.state === "missing" ? "warn" : "neutral"
          }>
            {INPUT_STATE_LABEL[input.state]}
          </Pill>
          <Pill tone="neutral">{INPUT_MODE_LABEL[input.inputMode]}</Pill>
          {sourceUpdated
            ? <Pill tone="warn">FUENTE ACTUALIZADA</Pill>
            : null}
        </span>
      }
    >
      {input.inputMode === "manual"
        ? <DomainNote>{MANUAL_INPUT_IS_DECLARED}</DomainNote>
        : null}
      {input.catalogCode === "customer_voice"
        ? <DomainNote>{CUSTOMER_ANONYMITY_HOLDS}</DomainNote>
        : null}
      {input.catalogCode === "resources_adequacy"
        ? <>
            <DomainNote>{PEOPLE_DATA_IS_AGGREGATED}</DomainNote>
            <DomainNote>{RESOURCES_ARE_JUDGED_NOT_CALCULATED}</DomainNote>
          </>
        : null}
      {input.catalogCode === "audits"
        ? <DomainNote>{AUDIT_NOTES_STAY_IN_AUDITS}</DomainNote>
        : null}

      {sourceUpdated ? <DomainNote>{SOURCE_UPDATED_IS_ANNOUNCED}</DomainNote> : null}

      {/* EL DATO FUENTE */}
      <div className="space-y-1 rounded-md border border-hairline bg-canvas px-3 py-2">
        <p className="text-xs font-medium text-ink">Dato del periodo</p>
        <p className="text-xs text-ink">{input.summary ?? "Sin preparar."}</p>
        {typeof nota === "string" ? <p className="text-xs text-ink-soft">{nota}</p> : null}
        {input.state === "not_applicable" && input.notApplicableReason
          ? <p className="text-xs text-ink-soft">
              No aplica: {input.notApplicableReason}
            </p>
          : null}
        <p className="text-xs text-ink-soft">
          {input.sourcePeriodStart
            ? `Periodo ${formatDate(input.sourcePeriodStart)} — ${formatDate(input.sourcePeriodEnd)}`
            : "Sin periodo"}
          {input.preparedAt
            ? ` · preparado el ${formatDate(input.preparedAt.slice(0, 10))}` : ""}
        </p>
        {lineage.length > 0 ? (
          <details>
            <summary className="cursor-pointer text-xs text-ink-soft">
              De dónde viene este número
            </summary>
            <ul className="pt-1">
              {lineage.map((l) => (
                <li key={l} className="text-xs text-ink-soft">· {l}</li>
              ))}
            </ul>
          </details>
        ) : null}
        {/* §60 · Ir al detalle, en su propio dominio. Llegar no concede nada:
            allí decide la política de ese dominio. */}
        {(INPUT_DRILL_DOWN[input.catalogCode as InputCode] ?? []).length > 0 ? (
          <p className="text-xs text-ink-soft">
            Ver el detalle en:{" "}
            {(INPUT_DRILL_DOWN[input.catalogCode as InputCode] ?? []).map((d, i) => (
              <span key={d.href}>
                {i > 0 ? " · " : ""}
                <a className="underline" href={d.href}>{d.label}</a>
              </span>
            ))}
          </p>
        ) : null}
      </div>

      {/* LAS ENTRADAS MANUALES */}
      {input.manualEntries.length > 0 ? (
        <Table
          headers={["Fecha", "Tipo", "Título", "Contenido", canManage ? "" : "—"]}
          empty="—"
          rows={input.manualEntries.map((m) => [
            formatDate(m.recordedOn),
            MANUAL_ENTRY_KIND_LABEL[m.entryKind]
              + (m.resourceKind ? ` · ${RESOURCE_KIND_LABEL[m.resourceKind]}` : ""),
            m.title, m.body,
            canManage
              ? <InlineAction key="d" action={removeManualEntryAction} label="Quitar"
                  fields={{ entry_id: m.id, review_id: reviewId }} />
              : "",
          ])}
        />
      ) : null}

      {/* EL ANÁLISIS HUMANO — al lado del dato, nunca encima */}
      {input.analysis ? (
        <div className="space-y-1 rounded-md border border-loop/30 bg-loop/5 px-3 py-2">
          <p className="text-xs font-medium text-ink">Análisis de la dirección</p>
          <p className="whitespace-pre-line text-xs text-ink">{input.analysis}</p>
          {input.conclusion
            ? <p className="text-xs text-ink"><strong>Conclusión:</strong> {input.conclusion}</p>
            : null}
          {input.requiresDecision
            ? <p className="text-xs text-amber-700 dark:text-amber-400">
                Marcada como pendiente de decisión. Decirlo no es haberlo resuelto.
              </p>
            : null}
          {input.decisionCount > 0
            ? <p className="text-xs text-ink-soft">
                {input.decisionCount} decisión(es) salieron de esta entrada.
              </p>
            : null}
        </div>
      ) : null}

      {canManage ? (
        <details className="rounded-md border border-hairline px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-ink">
            {input.analysis ? "Editar el análisis" : "Analizar esta entrada"}
          </summary>
          <div className="space-y-3 pt-3">
            <ActionForm action={saveInputAnalysisAction} submitLabel="Guardar análisis">
              <input type="hidden" name="input_id" value={input.id} />
              <input type="hidden" name="review_id" value={reviewId} />
              <Field label="Análisis"
                hint="Qué significa este dato. No modifica el dato de origen: vive al lado.">
                <textarea name="analysis" rows={3} className={inputClass}
                  defaultValue={input.analysis ?? ""} />
              </Field>
              <Field label="Conclusión">
                <input name="conclusion" className={inputClass}
                  defaultValue={input.conclusion ?? ""} />
              </Field>
              <Field label="Requiere decisión">
                <input type="checkbox" name="requires_decision"
                  defaultChecked={input.requiresDecision} className="mr-2 align-middle" />
              </Field>
            </ActionForm>

            {input.inputMode === "automatic" ? (
              <ActionForm action={refreshInputAction} submitLabel="Refrescar el dato">
                <input type="hidden" name="input_id" value={input.id} />
                <input type="hidden" name="review_id" value={reviewId} />
              </ActionForm>
            ) : null}

            <ActionForm action={markInputNotApplicableAction} submitLabel="Marcar «no aplica»">
              <input type="hidden" name="input_id" value={input.id} />
              <input type="hidden" name="review_id" value={reviewId} />
              <Field label="Por qué no aplica" hint="Obligatorio. Sin razón, «no aplica» es no haber mirado.">
                <input name="not_applicable_reason" className={inputClass} />
              </Field>
            </ActionForm>

            <ActionForm action={addManualEntryAction} submitLabel="Añadir aportación de la dirección">
              <input type="hidden" name="input_id" value={input.id} />
              <input type="hidden" name="review_id" value={reviewId} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Tipo">
                  <select name="entry_kind" className={inputClass} defaultValue="context">
                    {MANUAL_ENTRY_KINDS.map((k) => (
                      <option key={k} value={k}>{MANUAL_ENTRY_KIND_LABEL[k]}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Recurso" hint="Solo si es una necesidad de recursos.">
                  <select name="resource_kind" className={inputClass} defaultValue="">
                    <option value="">—</option>
                    {RESOURCE_KINDS.map((k) => (
                      <option key={k} value={k}>{RESOURCE_KIND_LABEL[k]}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Título">
                <input name="title" className={inputClass} />
              </Field>
              <Field label="Contenido">
                <textarea name="body" rows={2} className={inputClass} />
              </Field>
            </ActionForm>
          </div>
        </details>
      ) : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------

function DecisionsBlock({ data, options, canManage }: {
  data: ReviewFileData; options: ReviewFileOptions; canManage: boolean;
}) {
  const r = data.review;
  const acciones = data.decisions.reduce((s, d) => s + d.actionCount, 0);

  return (
    <>
      <DomainNote>{DECISION_IS_NOT_AN_ACTION}</DomainNote>
      <DomainNote>{DECISION_MAY_HAVE_NO_ACTIONS}</DomainNote>

      <div className="grid gap-3 sm:grid-cols-3">
        <Counter label="Decisiones" value={data.decisions.length} />
        <Counter label="Acciones que salieron de ellas" value={acciones} />
        <Counter label="Entradas que pedían decisión" value={r.inputsRequiringDecision} />
      </div>
      <p className="text-xs text-ink-soft">
        Los dos primeros números son distintos a propósito: una decisión puede
        generar cero, una o cinco acciones, y sigue siendo una decisión.
      </p>

      <Card
        title="Decisiones de la dirección"
        action={<ExportPdfButton
          exportKey="quality.management-review-decision.list" id={r.id} label="Descargar PDF" />}
      >
        <Table
          headers={["Código", "Tema", "Decisión", "Tipo", "Responsable", "Fecha",
                    "Acciones", canManage ? "" : "—"]}
          empty="Todavía no hay decisiones. Una revisión sin decisiones es una presentación."
          rows={data.decisions.map((d) => [
            d.code, d.topic,
            <span key="d">
              {d.decision}
              {d.rationale
                ? <span className="block text-ink-soft">{d.rationale}</span>
                : null}
              {d.expectedResult
                ? <span className="block text-ink-soft">
                    Resultado esperado: {d.expectedResult}
                  </span>
                : null}
            </span>,
            DECISION_KIND_LABEL[d.decisionKind],
            d.ownerPositionName ?? "—",
            formatDate(d.decidedOn),
            <span key="a">
              {describeDecisionOutcome(d)}
              {d.actions.length > 0 ? (
                <span className="block text-ink-soft">
                  {d.actions.map((a) => a.code).join(", ")}
                </span>
              ) : null}
            </span>,
            canManage
              ? <InlineAction key="x" action={removeDecisionAction} label="Eliminar"
                  fields={{ decision_id: d.id, review_id: r.id }} />
              : "",
          ])}
        />
      </Card>

      {canManage ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Registrar decisión" description="Registrar NO crea ninguna acción.">
            <ActionForm action={recordDecisionAction} submitLabel="Registrar decisión">
              <input type="hidden" name="review_id" value={r.id} />
              <Field label="Tema">
                <input name="topic" required className={inputClass}
                  placeholder="Capacidad de inspección de proveedores críticos" />
              </Field>
              <Field label="Qué se decide">
                <textarea name="decision" rows={2} required className={inputClass} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Tipo de salida">
                  <select name="decision_kind" className={inputClass} defaultValue="improvement">
                    {DECISION_KINDS.map((k) => (
                      <option key={k} value={k}>{DECISION_KIND_LABEL[k]}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Responsable (cargo)">
                  <select name="owner_position_id" className={inputClass} defaultValue="">
                    <option value="">Sin asignar</option>
                    {options.positions.map((p) => (
                      <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Entrada que la motivó">
                <select name="input_id" className={inputClass} defaultValue="">
                  <option value="">—</option>
                  {data.inputs.map((i) => (
                    <option key={i.id} value={i.id}>{i.catalogLabel}</option>
                  ))}
                </select>
              </Field>
              <Field label="Fundamento">
                <textarea name="rationale" rows={2} className={inputClass} />
              </Field>
              <Field label="Resultado esperado" hint="Qué se espera que ocurra. No es la acción que lo consigue.">
                <input name="expected_result" className={inputClass} />
              </Field>
            </ActionForm>
          </Card>

          {data.decisions.length > 0 ? (
            <Card title="Crear acción desde una decisión"
              description="Una a una. Una decisión puede generar cero, una o cinco.">
              <ActionForm action={createActionFromDecisionAction} submitLabel="Crear acción">
                <input type="hidden" name="review_id" value={r.id} />
                <Field label="Decisión">
                  <select name="decision_id" required className={inputClass} defaultValue="">
                    <option value="">Elige una</option>
                    {data.decisions.map((d) => (
                      <option key={d.id} value={d.id}>{d.code} · {d.topic}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Qué hay que hacer">
                  <input name="title" required className={inputClass} />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Tipo de acción">
                    <select name="action_kind" className={inputClass} defaultValue="improvement">
                      <option value="improvement">Mejora</option>
                      <option value="corrective">Correctiva</option>
                      <option value="correction">Corrección</option>
                      <option value="containment">Contención</option>
                    </select>
                  </Field>
                  <Field label="Fecha límite">
                    <input type="date" name="due_on" className={inputClass} />
                  </Field>
                </div>
                <Field label="Descripción">
                  <textarea name="description" rows={2} className={inputClass} />
                </Field>
                <Field label="Exige verificar eficacia">
                  <input type="checkbox" name="requires_effectiveness"
                    className="mr-2 align-middle" />
                </Field>
                <Field label="Criterio de eficacia" hint="Obligatorio si se exige verificarla.">
                  <input name="effectiveness_criteria" className={inputClass} />
                </Field>
              </ActionForm>
            </Card>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------

function ClosureBlock({ data, canManage, canClose, cerrada }: {
  data: ReviewFileData; canManage: boolean; canClose: boolean; cerrada: boolean;
}) {
  const r = data.review;
  return (
    <>
      <Card title="Conclusiones de la dirección">
        <DomainNote>
          Las escribe una persona. El sistema reúne los datos y se detiene ahí:
          deducir «el sistema es eficaz» de «cero no conformidades» convertiría
          la ausencia de registro en prueba de conformidad.
        </DomainNote>
        {data.detail?.conclusions ? (
          <p className="whitespace-pre-line text-xs text-ink">{data.detail.conclusions}</p>
        ) : null}
        {canManage ? (
          <ActionForm action={saveConclusionsAction} submitLabel="Guardar conclusiones">
            <input type="hidden" name="review_id" value={r.id} />
            <Field label="Conclusiones">
              <textarea name="conclusions" rows={4} className={inputClass}
                defaultValue={data.detail?.conclusions ?? ""} />
            </Field>
          </ActionForm>
        ) : null}
      </Card>

      <Card
        title="Actas emitidas"
        action={<ExportPdfButton
          exportKey="quality.management-review-report.detail" id={r.id} label="Descargar PDF" />}
      >
        <DomainNote>{MINUTES_ARE_FROZEN_FOLLOWUP_IS_LIVE}</DomainNote>
        <Table
          headers={["Versión", "Emitida", "Resumen", "Corrige a", ""]}
          empty="Todavía no se ha emitido ningún acta."
          rows={data.minutes.map((m) => [
            m.versionNumber, formatDate(m.issuedOn), m.summary ?? "—",
            m.supersedesId
              ? `Versión ${data.minutes.find((x) => x.id === m.supersedesId)?.versionNumber ?? "?"}`
              : "—",
            <ExportPdfButton
              key="x" exportKey="quality.management-review-minutes.detail" id={m.id}
              label="Descargar PDF"
            />,
          ])}
        />
        {canClose && !cerrada ? (
          <ActionForm action={issueMinutesAction} submitLabel="Emitir acta">
            <input type="hidden" name="review_id" value={r.id} />
            <Field label="Resumen ejecutivo">
              <textarea name="summary" rows={3} className={inputClass} />
            </Field>
          </ActionForm>
        ) : null}
      </Card>

      <Card title="Notas de la sesión" description="Complementan el acta; no la sustituyen.">
        <Table
          headers={["Fecha", "Nota"]}
          empty="Sin notas."
          rows={data.notes.map((n) => [formatDate(n.recordedOn), n.body])}
        />
        {canManage ? (
          <ActionForm action={addNoteAction} submitLabel="Registrar nota">
            <input type="hidden" name="review_id" value={r.id} />
            <Field label="Nota">
              <textarea name="body" rows={2} required className={inputClass} />
            </Field>
          </ActionForm>
        ) : null}
      </Card>

      <Card title="Próxima revisión" description="La frecuencia la decide la empresa.">
        <div className="grid gap-2 text-xs sm:grid-cols-2">
          <Fact label="Prevista para" value={formatDate(r.nextReviewPlannedOn)} />
          <Fact label="Nota" value={data.detail?.nextReviewNote ?? "—"} />
        </div>
        {canManage ? (
          <ActionForm action={scheduleNextReviewAction} submitLabel="Programar próxima revisión">
            <input type="hidden" name="review_id" value={r.id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Fecha prevista">
                <input type="date" name="next_review_planned_on" className={inputClass}
                  defaultValue={r.nextReviewPlannedOn ?? ""} />
              </Field>
              <Field label="Nota">
                <input name="next_review_note" className={inputClass}
                  defaultValue={data.detail?.nextReviewNote ?? ""} />
              </Field>
            </div>
          </ActionForm>
        ) : null}
      </Card>

      {data.detail?.closureNote ? (
        <Card title="Cierre">
          <p className="text-xs text-ink">{data.detail.closureNote}</p>
          {data.detail.followupNote
            ? <p className="text-xs text-ink-soft">
                Quedaba abierto: {data.detail.followupNote}
              </p>
            : null}
          <DomainNote>{CLOSED_REVIEW_IS_IMMUTABLE}</DomainNote>
        </Card>
      ) : null}

      {canClose && !cerrada ? (
        <Card title="Cerrar la revisión">
          <DomainNote>{CLOSING_DOES_NOT_CLOSE_ACTIONS}</DomainNote>
          <ActionForm action={closeReviewAction} submitLabel="Cerrar revisión">
            <input type="hidden" name="review_id" value={r.id} />
            <Field label="Por qué se cierra">
              <textarea name="closure_note" rows={2} required className={inputClass} />
            </Field>
            <Field label="Qué queda en seguimiento">
              <textarea name="followup_note" rows={2} className={inputClass} />
            </Field>
          </ActionForm>
        </Card>
      ) : null}

      {canClose && r.status === "closed" ? (
        <Card title="Reabrir la revisión">
          <DomainNote>{REOPEN_IS_EXCEPTIONAL}</DomainNote>
          <ActionForm action={reopenReviewAction} submitLabel="Reabrir revisión">
            <input type="hidden" name="review_id" value={r.id} />
            <Field label="Por qué hay que reabrirla"
              hint="Con detalle. Antes de reabrir, considera emitir un acta que corrija a la anterior.">
              <textarea name="reason" rows={3} required className={inputClass} />
            </Field>
          </ActionForm>
        </Card>
      ) : null}

      {canManage && !cerrada ? (
        <Card title="Cancelar la revisión">
          <ActionForm action={cancelReviewAction} submitLabel="Cancelar revisión">
            <input type="hidden" name="review_id" value={r.id} />
            <Field label="Motivo">
              <textarea name="reason" rows={2} required className={inputClass} />
            </Field>
          </ActionForm>
        </Card>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------

function FollowUpBlock({ data }: { data: ReviewFileData }) {
  const f = data.followUp;
  const n = (k: string) => Number((f as Record<string, unknown> | null)?.[k] ?? 0);
  const detalle = Array.isArray(f?.detail)
    ? (f!.detail as Record<string, unknown>[]) : [];

  return (
    <>
      <DomainNote>{MINUTES_ARE_FROZEN_FOLLOWUP_IS_LIVE}</DomainNote>

      <div className="grid gap-3 sm:grid-cols-4">
        <Counter label="Decisiones" value={n("decisions")} />
        <Counter label="Acciones" value={n("actions")} />
        <Counter label="Abiertas" value={n("open")} tone={n("open") > 0 ? "warn" : undefined} />
        <Counter label="Vencidas" value={n("overdue")}
          tone={n("overdue") > 0 ? "bad" : undefined} />
      </div>

      <p className="text-xs text-ink">
        {describeFollowUp({
          decisions: n("decisions"), actions: n("actions"), open: n("open"),
          completed: n("completed"), overdue: n("overdue"),
          effective: n("effective"), notEffective: n("not_effective"),
          effectivenessPending: n("effectiveness_pending"),
        })}
      </p>

      <Card
        title="Acciones vivas"
        description="Se leen ahora, del motor de acciones. El acta no cambia porque avancen."
        action={<ExportPdfButton
          exportKey="quality.management-review-followup.list" id={data.review.id}
          label="Descargar PDF" />}
      >
        <Table
          headers={["Acción", "Título", "Decisión", "Estado", "Vence", "Eficacia"]}
          empty="Esta revisión todavía no ha generado acciones."
          rows={detalle.map((a) => [
            <a key="c" className="underline" href={`/quality/cases`}>{String(a.code)}</a>,
            String(a.title ?? "—"),
            String(a.decision ?? "—"),
            String(a.status ?? "—"),
            formatDate((a.due_on as string | null) ?? null),
            String(a.effectiveness ?? "—"),
          ])}
        />
      </Card>
    </>
  );
}
