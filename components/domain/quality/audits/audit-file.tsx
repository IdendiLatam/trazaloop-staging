"use client";

import { ExportPdfButton } from "@/components/ui/export-pdf-button";
import {
  ActionForm, Card, DomainNote, Field, inputClass, Pill, Table,
} from "@/components/domain/quality/audits/shared";
import type {
  AgendaItemRow, AuditDetailRow, AuditeeRow, AuditRow, CheckResultRow, ConflictRow,
  CriterionRow, EvidenceRow, FindingRow, MeetingRow, NoteRow, ProgramRow,
  RescheduleRow, ReportRow, SampleRow, ScopeItemRow, TeamMemberRow,
} from "@/lib/db/quality-audits";
import {
  AGENDA_ACTIVITY_KINDS, AGENDA_ACTIVITY_LABEL, AGENDA_IS_AN_INTENTION,
  AUDIT_NATURE_LABEL, AUDIT_STATUS_LABEL, AUDIT_TYPE_LABEL, CHECK_IS_NOT_A_FINDING,
  CHECK_OUTCOME_LABEL, CHECK_OUTCOMES, CLOSING_AUDIT_IS_NOT_CLOSING_ACTIONS,
  CLOSING_MEETING_PRESENTS, COMPETENCE_INFORMS_DOES_NOT_DECIDE, CONCLUSIONS_ARE_HUMAN,
  CONFLICT_KIND_LABEL, CONFLICT_STATUS_LABEL, CONFORMITY_IS_LOCAL,
  CRITERION_IS_NOT_A_QUESTION,
  CRITERION_KIND_LABEL, CRITERION_KINDS, CRITERION_RESOLVES_HISTORY, describeFollowUp,
  describeSample, EVIDENCE_IS_NOT_A_FINDING, EVIDENCE_IS_REFERENCED, EVIDENCE_KIND_LABEL,
  EVIDENCE_KINDS, EXTERNAL_AUDITOR_NEEDS_NO_ACCOUNT, FINDING_CLASSIFICATION_LABEL,
  FINDING_CLASSIFICATIONS, FINDING_EVALUATION_STATUS_LABEL, FINDING_IS_NOT_NC,
  FINDING_SEVERITIES, FINDING_SEVERITY_LABEL, formatDate, formatRange,
  independenceReferenceDate, INDEPENDENCE_IS_HISTORICAL, INDEPENDENCE_IS_NOT_DECLARED,
  MEETING_KIND_LABEL, MEETING_KINDS, NOTE_IS_NOT_EVIDENCE, NOTE_KIND_LABEL, NOTE_KINDS,
  RESTRICTED_NOTES_NOTICE, SAMPLE_IS_NOT_COVERAGE, SCOPE_ITEM_KIND_LABEL,
  SCOPE_ITEM_KINDS, SCOPE_IS_STRUCTURED, TEAM_ROLE_LABEL, TEAM_ROLES,
  TRAZALOOP_DOES_NOT_CERTIFY, wasRescheduled,
} from "@/lib/domain/quality-audits";
import {
  addAgendaItemAction, addAuditeeAction, addCriterionAction, addEvidenceAction,
  addNoteAction, addSampleAction, addScopeItemAction, addTeamMemberAction,
  cancelAuditAction, checkIndependenceAction, closeAuditAction, decideConflictAction,
  evaluateFindingAction, finishExecutionAction, issueReportAction,
  openCaseFromFindingAction, recordCheckResultAction, recordFindingAction,
  recordMeetingAction, removeAgendaItemAction, removeAuditeeAction,
  removeCriterionAction, removeEvidenceAction, removeScopeItemAction,
  removeTeamMemberAction, rescheduleAuditAction, startChecklistRunAction,
  startExecutionAction, updateAuditAction,
} from "@/server/actions/quality-audits";
import type { Option } from "@/components/domain/quality/audits/programs";

export type AuditFileData = {
  audit: AuditRow;
  detail: AuditDetailRow | null;
  program: ProgramRow | null;
  reschedules: RescheduleRow[];
  scope: ScopeItemRow[];
  criteria: CriterionRow[];
  team: TeamMemberRow[];
  conflicts: ConflictRow[];
  agenda: AgendaItemRow[];
  auditees: AuditeeRow[];
  meetings: MeetingRow[];
  notes: NoteRow[];
  samples: SampleRow[];
  evidence: EvidenceRow[];
  findings: FindingRow[];
  reports: ReportRow[];
  checkRun: { runId: string; checklistName: string; versionNumber: number;
              results: CheckResultRow[] } | null;
  dossier: Record<string, unknown> | null;
};

export type AuditFileOptions = {
  positions: Option[];
  processes: Option[];
  people: Option[];
  documents: Option[];
  publishedChecklists: { checklistId: string; versionId: string; label: string }[];
};

/**
 * Trazaloop Quality · QUALITY-09 · La auditoría entera en una pantalla.
 *
 * El orden es el del trabajo real: qué se planificó, qué se miró, qué se
 * encontró, qué se informó y qué quedó abierto después de cerrar. Cada bloque
 * lleva escrito, donde se produce, lo que NO significa.
 */
export function AuditFile({
  data, options, canManage, canClose, today,
}: {
  data: AuditFileData;
  options: AuditFileOptions;
  canManage: boolean;
  canClose: boolean;
  today: string;
}) {
  const a = data.audit;
  const frozen = a.status === "closed" || a.status === "cancelled";
  const refDate = independenceReferenceDate(a, today);

  return (
    <div className="space-y-6">
      <Header audit={a} detail={data.detail} program={data.program}
        reschedules={data.reschedules} />

      <Section title="Plan" open>
        <PlanBlock data={data} options={options} canManage={canManage && !frozen}
          refDate={refDate} />
      </Section>

      <Section title="Ejecución">
        <ExecutionBlock data={data} options={options} canManage={canManage && !frozen} />
      </Section>

      <Section title="Hallazgos" open>
        <FindingsBlock data={data} options={options} canManage={canManage && !frozen} />
      </Section>

      <Section title="Informe y cierre">
        <ReportBlock data={data} canManage={canManage && !frozen} canClose={canClose}
          frozen={frozen} />
      </Section>
    </div>
  );
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

function Header({ audit, detail, program, reschedules }: {
  audit: AuditRow; detail: AuditDetailRow | null; program: ProgramRow | null;
  reschedules: RescheduleRow[];
}) {
  return (
    <Card
      title={`${audit.code} · ${audit.title}`}
      description={detail?.objective ?? undefined}
      action={
        <span className="flex flex-wrap items-center gap-2">
          <Pill tone={audit.status === "cancelled" ? "bad" : "neutral"}>
            {AUDIT_STATUS_LABEL[audit.status]}
          </Pill>
          <ExportPdfButton
            exportKey="quality.audit.detail" id={audit.id} label="Descargar PDF"
          />
          <ExportPdfButton
            exportKey="quality.audit-plan.detail" id={audit.id} label="Descargar PDF"
          />
        </span>
      }
    >
      <div className="grid gap-2 text-xs sm:grid-cols-3">
        <Fact label="Tipo" value={AUDIT_TYPE_LABEL[audit.auditType]} />
        <Fact label="Naturaleza" value={AUDIT_NATURE_LABEL[audit.nature]} />
        <Fact label="Programa" value={
          program
            ? <a className="underline" href={`/quality/audits/programs/${program.id}`}>
                {program.name}
              </a>
            : "Fuera de programa"
        } />
        <Fact label="Fecha original" value={formatRange(audit.plannedFrom, audit.plannedTo)} />
        <Fact label="Fecha vigente" value={formatRange(audit.scheduledFrom, audit.scheduledTo)} />
        <Fact label="Ejecutada" value={formatRange(audit.executedFrom, audit.executedTo)} />
        <Fact label="Responsable" value={audit.ownerPositionName ?? "Sin asignar"} />
        <Fact label="Líder auditor" value={audit.leadAuditor ?? "Sin líder"} />
        <Fact label="Informe" value={audit.reportIssuedAt ? "Emitido" : "Sin emitir"} />
      </div>

      {wasRescheduled(audit) ? (
        <div className="space-y-1">
          <p className="text-xs font-medium text-ink">
            Reprogramada {audit.rescheduleCount} vez/veces
          </p>
          <Table
            headers={["De", "A", "Motivo", "Cuándo"]}
            empty="—"
            rows={reschedules.map((r) => [
              formatRange(r.fromStart, r.fromEnd),
              formatRange(r.toStart, r.toEnd),
              r.reason,
              formatDate(r.decidedAt.slice(0, 10)),
            ])}
          />
        </div>
      ) : null}

      {detail?.cancelReason ? (
        <DomainNote>Cancelada: {detail.cancelReason}</DomainNote>
      ) : null}

      <DomainNote>{TRAZALOOP_DOES_NOT_CERTIFY}</DomainNote>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function PlanBlock({ data, options, canManage, refDate }: {
  data: AuditFileData; options: AuditFileOptions; canManage: boolean; refDate: string;
}) {
  const a = data.audit;
  return (
    <>
      {canManage ? (
        <Card title="Datos de la auditoría">
          <ActionForm action={updateAuditAction} submitLabel="Guardar">
            <input type="hidden" name="audit_id" value={a.id} />
            <Field label="Título">
              <input name="title" defaultValue={a.title} required className={inputClass} />
            </Field>
            <Field label="Objetivo">
              <textarea name="objective" rows={2} className={inputClass}
                defaultValue={data.detail?.objective ?? ""} />
            </Field>
            <Field label="Nota de alcance">
              <textarea name="scope_note" rows={2} className={inputClass}
                defaultValue={data.detail?.scopeNote ?? ""} />
            </Field>
            <Field label="Por qué ahora">
              <textarea name="priority_note" rows={2} className={inputClass}
                defaultValue={data.detail?.priorityNote ?? ""} />
            </Field>
            <Field label="Responsable (cargo)">
              <select name="owner_position_id" className={inputClass}
                defaultValue={a.ownerPositionId ?? ""}>
                <option value="">Sin asignar</option>
                {options.positions.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </Field>
          </ActionForm>
        </Card>
      ) : null}

      {data.dossier ? <Dossier dossier={data.dossier} /> : null}

      <Card title="Alcance" description="Qué entra. Explícito, no una frase.">
        <DomainNote>{SCOPE_IS_STRUCTURED}</DomainNote>
        <Table
          headers={["Qué", "Referencia", "Nota", canManage ? "" : "—"]}
          empty="El alcance todavía está vacío."
          rows={data.scope.map((s) => [
            SCOPE_ITEM_KIND_LABEL[s.itemKind],
            s.processName
              ?? s.documentTitle
              ?? s.partyName
              ?? (s.requirementCode ? `${s.requirementCode} · ${s.requirementTitle}` : null)
              ?? "—",
            <span key="n">
              {s.note ?? "—"}
              {s.processRevisionNumber !== null
                ? <span className="block text-ink-soft">
                    Revisión {s.processRevisionNumber} del proceso, la vigente cuando se planificó.
                  </span>
                : null}
            </span>,
            canManage
              ? <InlineAction key="d" action={removeScopeItemAction} label="Quitar"
                  fields={{ item_id: s.id, audit_id: a.id }} />
              : "",
          ])}
        />
        {canManage ? (
          <ActionForm action={addScopeItemAction} submitLabel="Añadir al alcance">
            <input type="hidden" name="audit_id" value={a.id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Qué">
                <select name="item_kind" className={inputClass} defaultValue="process">
                  {SCOPE_ITEM_KINDS.map((k) => (
                    <option key={k} value={k}>{SCOPE_ITEM_KIND_LABEL[k]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Proceso" hint="Solo si el elemento es un proceso.">
                <select name="process_id" className={inputClass} defaultValue="">
                  <option value="">—</option>
                  {options.processes.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Documento" hint="Solo si el elemento es un documento.">
                <select name="document_id" className={inputClass} defaultValue="">
                  <option value="">—</option>
                  {options.documents.map((d) => (
                    <option key={d.id} value={d.id}>{d.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Nota" hint="Obligatoria para sede, unidad, producto u otro.">
                <input name="note" className={inputClass} />
              </Field>
            </div>
          </ActionForm>
        ) : null}
      </Card>

      <Card title="Criterios" description="Contra qué se audita.">
        <DomainNote>{CRITERION_IS_NOT_A_QUESTION}</DomainNote>
        <DomainNote>{CRITERION_RESOLVES_HISTORY}</DomainNote>
        <Table
          headers={["Tipo", "Criterio", "Nota", canManage ? "" : "—"]}
          empty="Sin criterios definidos."
          rows={data.criteria.map((c) => [
            CRITERION_KIND_LABEL[c.criterionKind],
            <span key="c">
              {c.requirementCode
                ? `${c.requirementCode} · ${c.requirementTitle}`
                : c.documentTitle ?? c.customText ?? "—"}
              {c.documentRevisionNumber !== null
                ? <span className="block text-ink-soft">
                    Revisión {c.documentRevisionNumber} del documento
                    {c.documentRevisionLabel ? ` (${c.documentRevisionLabel})` : ""},
                    la vigente cuando se auditó.
                  </span>
                : null}
            </span>,
            c.note ?? "—",
            canManage
              ? <InlineAction key="d" action={removeCriterionAction} label="Quitar"
                  fields={{ criterion_id: c.id, audit_id: a.id }} />
              : "",
          ])}
        />
        {canManage ? (
          <ActionForm action={addCriterionAction} submitLabel="Añadir criterio">
            <input type="hidden" name="audit_id" value={a.id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Tipo">
                <select name="criterion_kind" className={inputClass} defaultValue="internal">
                  {CRITERION_KINDS.map((k) => (
                    <option key={k} value={k}>{CRITERION_KIND_LABEL[k]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Documento" hint="Solo si el criterio es un documento interno.">
                <select name="document_id" className={inputClass} defaultValue="">
                  <option value="">—</option>
                  {options.documents.map((d) => (
                    <option key={d.id} value={d.id}>{d.label}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Texto del criterio" hint="Para criterio interno, contractual, legal u otro.">
              <textarea name="custom_text" rows={2} className={inputClass} />
            </Field>
          </ActionForm>
        ) : null}
      </Card>

      <Card title="Equipo auditor">
        <DomainNote>{EXTERNAL_AUDITOR_NEEDS_NO_ACCOUNT}</DomainNote>
        <DomainNote>{COMPETENCE_INFORMS_DOES_NOT_DECIDE}</DomainNote>
        <Table
          headers={["Persona", "Papel", "Cuenta", "Nota", canManage ? "" : "—"]}
          empty="Sin equipo asignado."
          rows={data.team.map((m) => [
            m.personName,
            TEAM_ROLE_LABEL[m.teamRole],
            m.hasAccount ? "Con cuenta" : "Sin cuenta en Trazaloop",
            m.note ?? "—",
            canManage
              ? <InlineAction key="d" action={removeTeamMemberAction} label="Quitar"
                  fields={{ member_id: m.id, audit_id: a.id }} />
              : "",
          ])}
        />
        {canManage ? (
          <ActionForm action={addTeamMemberAction} submitLabel="Añadir al equipo">
            <input type="hidden" name="audit_id" value={a.id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Persona">
                <select name="person_id" required className={inputClass} defaultValue="">
                  <option value="">Elige a alguien</option>
                  {options.people.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Papel">
                <select name="team_role" className={inputClass} defaultValue="auditor">
                  {TEAM_ROLES.map((r) => (
                    <option key={r} value={r}>{TEAM_ROLE_LABEL[r]}</option>
                  ))}
                </select>
              </Field>
            </div>
          </ActionForm>
        ) : null}
      </Card>

      <Card
        title="Independencia"
        description={`Comprobada con los cargos vigentes al ${formatDate(refDate)}.`}
      >
        <DomainNote>{INDEPENDENCE_IS_NOT_DECLARED}</DomainNote>
        <DomainNote>{INDEPENDENCE_IS_HISTORICAL}</DomainNote>
        <Table
          headers={["Persona", "Conflicto", "Detalle", "Estado", "Mitigación"]}
          empty="No se ha comprobado todavía, o no se encontró nada."
          rows={data.conflicts.map((c) => [
            c.personName,
            CONFLICT_KIND_LABEL[c.conflictKind],
            c.detail,
            <Pill key="s" tone={c.status === "detected" ? "bad" : "neutral"}>
              {CONFLICT_STATUS_LABEL[c.status]}
            </Pill>,
            c.mitigation ?? "—",
          ])}
        />
        {canManage ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <ActionForm action={checkIndependenceAction} submitLabel="Comprobar independencia">
              <input type="hidden" name="audit_id" value={a.id} />
            </ActionForm>
            {data.conflicts.some((c) => c.status === "detected") ? (
              <ActionForm action={decideConflictAction} submitLabel="Registrar decisión">
                <input type="hidden" name="audit_id" value={a.id} />
                <Field label="Conflicto">
                  <select name="conflict_id" required className={inputClass} defaultValue="">
                    <option value="">Elige uno</option>
                    {data.conflicts.filter((c) => c.status === "detected").map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.personName} · {CONFLICT_KIND_LABEL[c.conflictKind]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Decisión">
                  <select name="status" className={inputClass} defaultValue="dismissed">
                    <option value="dismissed">Descartado: no aplica</option>
                    <option value="accepted_with_mitigation">Aceptado con mitigación</option>
                  </select>
                </Field>
                <Field label="Mitigación" hint="Obligatoria si se acepta el conflicto.">
                  <textarea name="mitigation" rows={2} className={inputClass} />
                </Field>
              </ActionForm>
            ) : null}
          </div>
        ) : null}
      </Card>

      <Card
        title="Agenda"
        description="Qué se piensa mirar y cuándo."
        action={
          <ExportPdfButton
            exportKey="quality.audit-agenda.detail" id={a.id} label="Descargar PDF"
          />
        }
      >
        <DomainNote>{AGENDA_IS_AN_INTENTION}</DomainNote>
        <Table
          headers={["#", "Actividad", "Día", "Horario", "Proceso", "Responsable", canManage ? "" : "—"]}
          empty="Sin agenda."
          rows={data.agenda.map((g) => [
            g.order,
            <span key="t">
              {g.title}
              <span className="block text-ink-soft">
                {AGENDA_ACTIVITY_LABEL[g.activityKind as keyof typeof AGENDA_ACTIVITY_LABEL]
                  ?? g.activityKind}
              </span>
            </span>,
            formatDate(g.scheduledOn),
            [g.startsAtLabel, g.endsAtLabel].filter(Boolean).join(" — ") || "—",
            g.processName ?? "—",
            g.responsibleName ?? "—",
            canManage
              ? <InlineAction key="d" action={removeAgendaItemAction} label="Quitar"
                  fields={{ item_id: g.id, audit_id: a.id }} />
              : "",
          ])}
        />
        {canManage ? (
          <ActionForm action={addAgendaItemAction} submitLabel="Añadir actividad">
            <input type="hidden" name="audit_id" value={a.id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Actividad">
                <input name="title" required className={inputClass} />
              </Field>
              <Field label="Tipo">
                <select name="activity_kind" className={inputClass} defaultValue="review">
                  {AGENDA_ACTIVITY_KINDS.map((k) => (
                    <option key={k} value={k}>{AGENDA_ACTIVITY_LABEL[k]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Día">
                <input type="date" name="scheduled_on" className={inputClass} />
              </Field>
              <Field label="Orden">
                <input type="number" name="position_order" defaultValue={data.agenda.length + 1}
                  min={1} className={inputClass} />
              </Field>
              <Field label="Desde">
                <input name="starts_at_label" className={inputClass} placeholder="09:00" />
              </Field>
              <Field label="Hasta">
                <input name="ends_at_label" className={inputClass} placeholder="10:30" />
              </Field>
              <Field label="Proceso">
                <select name="process_id" className={inputClass} defaultValue="">
                  <option value="">—</option>
                  {options.processes.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Responsable">
                <select name="responsible_person_id" className={inputClass} defaultValue="">
                  <option value="">—</option>
                  {options.people.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </Field>
            </div>
          </ActionForm>
        ) : null}
      </Card>

      <Card title="Auditados" description="A quién se audita. Puede ser gente de fuera.">
        <Table
          headers={["Quién", "Papel", "Proceso", canManage ? "" : "—"]}
          empty="Sin auditados registrados."
          rows={data.auditees.map((x) => [
            x.personName ?? x.externalName ?? "—",
            x.roleNote ?? "—",
            x.processName ?? "—",
            canManage
              ? <InlineAction key="d" action={removeAuditeeAction} label="Quitar"
                  fields={{ auditee_id: x.id, audit_id: a.id }} />
              : "",
          ])}
        />
        {canManage ? (
          <ActionForm action={addAuditeeAction} submitLabel="Añadir auditado">
            <input type="hidden" name="audit_id" value={a.id} />
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
                <input name="role_note" className={inputClass} />
              </Field>
              <Field label="Proceso">
                <select name="process_id" className={inputClass} defaultValue="">
                  <option value="">—</option>
                  {options.processes.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </Field>
            </div>
          </ActionForm>
        ) : null}
      </Card>

      {canManage ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card title="Reprogramar" description="La fecha original se conserva.">
            <ActionForm action={rescheduleAuditAction} submitLabel="Reprogramar">
              <input type="hidden" name="audit_id" value={a.id} />
              <Field label="Nuevo desde">
                <input type="date" name="scheduled_from" className={inputClass} />
              </Field>
              <Field label="Nuevo hasta">
                <input type="date" name="scheduled_to" className={inputClass} />
              </Field>
              <Field label="Motivo">
                <textarea name="reason" rows={2} required className={inputClass} />
              </Field>
            </ActionForm>
          </Card>
          <Card title="Cancelar" description="Cancelar no es borrar: sigue contando.">
            <ActionForm action={cancelAuditAction} submitLabel="Cancelar auditoría">
              <input type="hidden" name="audit_id" value={a.id} />
              <Field label="Motivo">
                <textarea name="reason" rows={2} required className={inputClass} />
              </Field>
            </ActionForm>
          </Card>
        </div>
      ) : null}
    </>
  );
}

/** Un botón que dispara una acción con campos ocultos. Nada más. */
function InlineAction({ action, label, fields }: {
  action: (prev: import("@/server/actions/quality-audits").AuditActionState,
           form: FormData) => Promise<import("@/server/actions/quality-audits").AuditActionState>;
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

function ExecutionBlock({ data, options, canManage }: {
  data: AuditFileData; options: AuditFileOptions; canManage: boolean;
}) {
  const a = data.audit;
  return (
    <>
      {canManage ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card title="Iniciar ejecución">
            <ActionForm action={startExecutionAction} submitLabel="Iniciar">
              <input type="hidden" name="audit_id" value={a.id} />
              <Field label="Desde">
                <input type="date" name="executed_from" className={inputClass}
                  defaultValue={a.executedFrom ?? ""} />
              </Field>
            </ActionForm>
          </Card>
          <Card title="Terminar ejecución y escribir conclusiones">
            <DomainNote>{CONCLUSIONS_ARE_HUMAN}</DomainNote>
            <ActionForm action={finishExecutionAction} submitLabel="Terminar ejecución">
              <input type="hidden" name="audit_id" value={a.id} />
              <Field label="Hasta">
                <input type="date" name="executed_to" className={inputClass}
                  defaultValue={a.executedTo ?? ""} />
              </Field>
              <Field label="Conclusiones">
                <textarea name="conclusions" rows={3} className={inputClass}
                  defaultValue={data.detail?.conclusions ?? ""} />
              </Field>
            </ActionForm>
          </Card>
        </div>
      ) : null}

      {data.detail?.conclusions ? (
        <Card title="Conclusiones">
          <p className="whitespace-pre-line text-xs text-ink">{data.detail.conclusions}</p>
          <DomainNote>{CONCLUSIONS_ARE_HUMAN}</DomainNote>
        </Card>
      ) : null}

      <Card
        title="Reuniones"
        action={
          <ExportPdfButton
            exportKey="quality.audit-execution.detail" id={a.id} label="Descargar PDF"
          />
        }
      >
        <DomainNote>{CLOSING_MEETING_PRESENTS}</DomainNote>
        <Table
          headers={["Tipo", "Día", "Participantes", "Notas"]}
          empty="Sin reuniones registradas."
          rows={data.meetings.map((m) => [
            MEETING_KIND_LABEL[m.meetingKind],
            formatDate(m.heldOn),
            m.participants.length > 0 ? m.participants.join(", ") : "—",
            m.notes ?? "—",
          ])}
        />
        {canManage ? (
          <ActionForm action={recordMeetingAction} submitLabel="Registrar reunión">
            <input type="hidden" name="audit_id" value={a.id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Tipo">
                <select name="meeting_kind" className={inputClass} defaultValue="opening">
                  {MEETING_KINDS.map((k) => (
                    <option key={k} value={k}>{MEETING_KIND_LABEL[k]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Día">
                <input type="date" name="held_on" className={inputClass} />
              </Field>
            </div>
            <Field label="Notas">
              <textarea name="notes" rows={2} className={inputClass} />
            </Field>
          </ActionForm>
        ) : null}
      </Card>

      <Card title="Notas de trabajo">
        <DomainNote>{NOTE_IS_NOT_EVIDENCE}</DomainNote>
        <DomainNote>{RESTRICTED_NOTES_NOTICE}</DomainNote>
        <Table
          headers={["Día", "Tipo", "Nota", "Visibilidad"]}
          empty="Sin notas. O las que hay son restringidas y tu rol no las ve."
          rows={data.notes.map((n) => [
            formatDate(n.recordedOn),
            NOTE_KIND_LABEL[n.noteKind],
            n.body,
            n.isRestricted ? "Restringida al equipo auditor" : "Visible",
          ])}
        />
        {canManage ? (
          <ActionForm action={addNoteAction} submitLabel="Registrar nota">
            <input type="hidden" name="audit_id" value={a.id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Tipo">
                <select name="note_kind" className={inputClass} defaultValue="working_note">
                  {NOTE_KINDS.map((k) => (
                    <option key={k} value={k}>{NOTE_KIND_LABEL[k]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Proceso">
                <select name="process_id" className={inputClass} defaultValue="">
                  <option value="">—</option>
                  {options.processes.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Nota">
              <textarea name="body" rows={3} required className={inputClass} />
            </Field>
            <Field label="Restringida" hint="Solo el equipo auditor y quien administra auditorías la verá.">
              <input type="checkbox" name="is_restricted" className="mr-2 align-middle" />
            </Field>
          </ActionForm>
        ) : null}
      </Card>

      <Card title="Muestras">
        <DomainNote>{SAMPLE_IS_NOT_COVERAGE}</DomainNote>
        <Table
          headers={["Muestra", "Qué se revisó", "Método"]}
          empty="Sin muestras registradas."
          rows={data.samples.map((s) => [
            s.description,
            describeSample(s),
            s.selectionMethod ?? "—",
          ])}
        />
        {canManage ? (
          <ActionForm action={addSampleAction} submitLabel="Registrar muestra">
            <input type="hidden" name="audit_id" value={a.id} />
            <Field label="Qué se muestreó">
              <input name="description" required className={inputClass}
                placeholder="Órdenes de compra del trimestre" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Población">
                <input type="number" name="population_size" min={1} className={inputClass} />
              </Field>
              <Field label="Muestra">
                <input type="number" name="sample_size" min={1} required className={inputClass} />
              </Field>
              <Field label="Método">
                <input name="selection_method" className={inputClass} placeholder="Aleatorio" />
              </Field>
            </div>
          </ActionForm>
        ) : null}
      </Card>

      <Card title="Evidencia">
        <DomainNote>{EVIDENCE_IS_REFERENCED}</DomainNote>
        <DomainNote>{EVIDENCE_IS_NOT_A_FINDING}</DomainNote>
        <Table
          headers={["Día", "Tipo", "Descripción", "Referencia", canManage ? "" : "—"]}
          empty="Sin evidencia registrada."
          rows={data.evidence.map((e) => [
            formatDate(e.collectedOn),
            EVIDENCE_KIND_LABEL[e.evidenceKind],
            e.description,
            <span key="r">
              {e.documentTitle ?? "—"}
              {e.documentRevisionLabel
                ? <span className="block text-ink-soft">Revisión {e.documentRevisionLabel}</span>
                : null}
            </span>,
            canManage
              ? <InlineAction key="d" action={removeEvidenceAction} label="Quitar"
                  fields={{ evidence_id: e.id, audit_id: a.id }} />
              : "",
          ])}
        />
        {canManage ? (
          <ActionForm action={addEvidenceAction} submitLabel="Registrar evidencia">
            <input type="hidden" name="audit_id" value={a.id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Tipo">
                <select name="evidence_kind" className={inputClass} defaultValue="record">
                  {EVIDENCE_KINDS.map((k) => (
                    <option key={k} value={k}>{EVIDENCE_KIND_LABEL[k]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Documento" hint="Obligatorio si el tipo es «documento».">
                <select name="document_id" className={inputClass} defaultValue="">
                  <option value="">—</option>
                  {options.documents.map((d) => (
                    <option key={d.id} value={d.id}>{d.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Día">
                <input type="date" name="collected_on" className={inputClass} />
              </Field>
              <Field label="Muestra">
                <select name="sample_id" className={inputClass} defaultValue="">
                  <option value="">—</option>
                  {data.samples.map((s) => (
                    <option key={s.id} value={s.id}>{s.description}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Descripción">
              <input name="description" required className={inputClass} />
            </Field>
          </ActionForm>
        ) : null}
      </Card>

      <Card title="Checklist" description="Una ayuda. La auditoría no depende de él.">
        <DomainNote>{CHECK_IS_NOT_A_FINDING}</DomainNote>
        {data.checkRun ? (
          <>
            <p className="text-xs text-ink-soft">
              {data.checkRun.checklistName} · versión {data.checkRun.versionNumber}. Es la
              versión exacta que se usó: si el checklist cambia después, esto no cambia.
            </p>
            <Table
              headers={["#", "Pregunta", "Respuesta", "Nota"]}
              empty="La versión no tiene preguntas."
              rows={data.checkRun.results.map((r) => [
                r.order, r.prompt, CHECK_OUTCOME_LABEL[r.outcome], r.note ?? "—",
              ])}
            />
            {canManage ? (
              <ActionForm action={recordCheckResultAction} submitLabel="Guardar respuesta">
                <input type="hidden" name="audit_id" value={a.id} />
                <input type="hidden" name="run_id" value={data.checkRun.runId} />
                <Field label="Pregunta">
                  <select name="item_id" required className={inputClass} defaultValue="">
                    <option value="">Elige una</option>
                    {data.checkRun.results.map((r) => (
                      <option key={r.itemId} value={r.itemId}>{r.order}. {r.prompt}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Respuesta">
                  <select name="outcome" className={inputClass} defaultValue="conforming">
                    {CHECK_OUTCOMES.map((o) => (
                      <option key={o} value={o}>{CHECK_OUTCOME_LABEL[o]}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Nota">
                  <input name="note" className={inputClass} />
                </Field>
              </ActionForm>
            ) : null}
          </>
        ) : canManage && options.publishedChecklists.length > 0 ? (
          <ActionForm action={startChecklistRunAction} submitLabel="Usar este checklist">
            <input type="hidden" name="audit_id" value={a.id} />
            <Field label="Checklist publicado">
              <select
                name="version_id"
                required
                className={inputClass}
                defaultValue=""
                onChange={(e) => {
                  const form = e.currentTarget.form;
                  const opt = e.currentTarget.selectedOptions[0];
                  const hidden = form?.elements.namedItem("checklist_id");
                  if (hidden instanceof HTMLInputElement) {
                    hidden.value = opt?.dataset.checklist ?? "";
                  }
                }}
              >
                <option value="">Elige uno</option>
                {options.publishedChecklists.map((c) => (
                  <option key={c.versionId} value={c.versionId} data-checklist={c.checklistId}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <input type="hidden" name="checklist_id" defaultValue="" />
          </ActionForm>
        ) : (
          <p className="text-xs text-ink-soft">
            No se usó ningún checklist. Eso no invalida la auditoría.
          </p>
        )}
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------

function FindingsBlock({ data, options, canManage }: {
  data: AuditFileData; options: AuditFileOptions; canManage: boolean;
}) {
  const a = data.audit;
  return (
    <>
      <DomainNote>{FINDING_IS_NOT_NC}</DomainNote>
      <DomainNote>{CONFORMITY_IS_LOCAL}</DomainNote>

      <div className="grid gap-3 sm:grid-cols-4">
        <Counter label="Hallazgos" value={a.findingCount} />
        <Counter label="Sin evaluar" value={a.findingsPending} />
        <Counter label="Propuestos como posible NC" value={a.findingsNcSuspected} />
        <Counter label="Escalados a caso" value={a.findingsEscalated} />
      </div>
      <p className="text-xs text-ink-soft">
        Ninguno de estos números es un conteo de no conformidades. La no
        conformidad, si llega a existir, vive en el caso.
      </p>

      <Card
        title="Hallazgos de esta auditoría"
        action={
          <ExportPdfButton
            exportKey="quality.audit-finding.list" label="Descargar PDF"
          />
        }
      >
        <Table
          headers={["Código", "Enunciado", "Clasificación propuesta", "Gravedad",
                    "Evaluación", "Caso", "Evidencia", ""]}
          empty="Todavía no hay hallazgos."
          rows={data.findings.map((f) => [
            f.code,
            <span key="s">
              {f.statement}
              {f.processName
                ? <span className="block text-ink-soft">{f.processName}</span>
                : null}
            </span>,
            <Pill key="c" tone={
              f.proposedClassification === "nonconformity_suspected" ? "warn"
                : f.proposedClassification === "conforming" ? "good" : "neutral"
            }>
              {FINDING_CLASSIFICATION_LABEL[f.proposedClassification]}
            </Pill>,
            f.proposedSeverity ? FINDING_SEVERITY_LABEL[f.proposedSeverity] : "—",
            <span key="e">
              {FINDING_EVALUATION_STATUS_LABEL[f.evaluationStatus]}
              {f.evaluationNote
                ? <span className="block text-ink-soft">{f.evaluationNote}</span>
                : null}
            </span>,
            f.caseId
              ? <a key="k" className="underline" href={`/quality/cases/${f.caseId}`}>
                  {f.caseCode ?? "Caso"}
                  {f.caseClassification
                    ? <span className="block text-ink-soft">{f.caseClassification}</span>
                    : null}
                </a>
              : "Sin caso",
            f.evidenceIds.length,
            <ExportPdfButton
              key="x" exportKey="quality.audit-finding.detail" id={f.id}
              label="Descargar PDF"
            />,
          ])}
        />
      </Card>

      {canManage ? (
        <Card title="Levantar hallazgo">
          <DomainNote>
            Escribir «posible no conformidad» es una PROPUESTA del auditor. No crea
            ninguna no conformidad ni mueve ningún contador de NC.
          </DomainNote>
          <ActionForm action={recordFindingAction} submitLabel="Registrar hallazgo">
            <input type="hidden" name="audit_id" value={a.id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Código">
                <input name="code" required className={inputClass}
                  defaultValue={`H-${String(data.findings.length + 1).padStart(2, "0")}`} />
              </Field>
              <Field label="Proceso">
                <select name="process_id" className={inputClass} defaultValue="">
                  <option value="">—</option>
                  {options.processes.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Clasificación propuesta">
                <select name="proposed_classification" className={inputClass}
                  defaultValue="not_conclusive">
                  {FINDING_CLASSIFICATIONS.map((c) => (
                    <option key={c} value={c}>{FINDING_CLASSIFICATION_LABEL[c]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Gravedad propuesta">
                <select name="proposed_severity" className={inputClass} defaultValue="">
                  <option value="">Sin gravedad</option>
                  {FINDING_SEVERITIES.map((s) => (
                    <option key={s} value={s}>{FINDING_SEVERITY_LABEL[s]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Criterio">
                <select name="criterion_id" className={inputClass} defaultValue="">
                  <option value="">—</option>
                  {data.criteria.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.requirementCode ?? c.documentTitle ?? c.customText ?? c.id}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Dónde">
                <input name="location_text" className={inputClass} />
              </Field>
            </div>
            <Field label="Enunciado" hint="Qué se encontró, contra qué criterio, con qué evidencia.">
              <textarea name="statement" rows={3} required className={inputClass} />
            </Field>
            <Field label="Detalle">
              <textarea name="detail" rows={2} className={inputClass} />
            </Field>
          </ActionForm>
        </Card>
      ) : null}

      {canManage && data.findings.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card title="Evaluar hallazgo" description="Es un acto de autoridad, no un cálculo.">
            <ActionForm action={evaluateFindingAction} submitLabel="Registrar evaluación">
              <input type="hidden" name="audit_id" value={a.id} />
              <Field label="Hallazgo">
                <select name="finding_id" required className={inputClass} defaultValue="">
                  <option value="">Elige uno</option>
                  {data.findings.map((f) => (
                    <option key={f.id} value={f.id}>{f.code} · {f.statement.slice(0, 50)}</option>
                  ))}
                </select>
              </Field>
              <Field label="Resultado">
                <select name="status" className={inputClass} defaultValue="evaluated">
                  <option value="evaluated">Evaluado</option>
                  <option value="dismissed">Desestimado</option>
                </select>
              </Field>
              <Field label="Razón">
                <textarea name="note" rows={2} required className={inputClass} />
              </Field>
            </ActionForm>
          </Card>

          <Card title="Abrir caso desde un hallazgo" description="El único camino de hallazgo a caso.">
            <DomainNote>
              El caso que nace aquí tampoco es todavía una no conformidad: eso lo
              decide el motor de casos.
            </DomainNote>
            <ActionForm action={openCaseFromFindingAction} submitLabel="Abrir caso">
              <input type="hidden" name="audit_id" value={a.id} />
              <Field label="Hallazgo">
                <select name="finding_id" required className={inputClass} defaultValue="">
                  <option value="">Elige uno</option>
                  {data.findings.filter((f) => f.caseId === null).map((f) => (
                    <option key={f.id} value={f.id}>{f.code} · {f.statement.slice(0, 50)}</option>
                  ))}
                </select>
              </Field>
              <Field label="Título del caso">
                <input name="title" className={inputClass} />
              </Field>
              <Field label="Descripción">
                <textarea name="description" rows={2} className={inputClass} />
              </Field>
            </ActionForm>
          </Card>
        </div>
      ) : null}
    </>
  );
}

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-hairline bg-surface px-3 py-2">
      <p className="text-xs text-ink-soft">{label}</p>
      <p className="text-xl font-semibold text-ink">{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ReportBlock({ data, canManage, canClose, frozen }: {
  data: AuditFileData; canManage: boolean; canClose: boolean; frozen: boolean;
}) {
  const a = data.audit;
  return (
    <>
      <Card title="Informes emitidos">
        <DomainNote>
          El informe es una FOTO congelada de la auditoría en el momento de
          emitirlo. Si después cambia algo, no se reescribe: se emite otro que
          corrige al anterior, y ambos se conservan.
        </DomainNote>
        <Table
          headers={["Versión", "Emitido", "Resumen", "Corrige a", ""]}
          empty="Todavía no se ha emitido ningún informe."
          rows={data.reports.map((r) => [
            r.versionNumber,
            formatDate(r.issuedOn),
            r.summary ?? "—",
            r.supersedesId
              ? `Versión ${data.reports.find((x) => x.id === r.supersedesId)?.versionNumber ?? "?"}`
              : "—",
            <ExportPdfButton
              key="x" exportKey="quality.audit-report.detail" id={r.id}
              label="Descargar PDF"
            />,
          ])}
        />
        {canManage ? (
          <ActionForm action={issueReportAction} submitLabel="Emitir informe">
            <input type="hidden" name="audit_id" value={a.id} />
            <Field label="Resumen">
              <textarea name="summary" rows={3} className={inputClass} />
            </Field>
          </ActionForm>
        ) : null}
      </Card>

      <Card title="Seguimiento">
        <DomainNote>{CLOSING_AUDIT_IS_NOT_CLOSING_ACTIONS}</DomainNote>
        <p className="text-xs text-ink">
          {describeFollowUp({ openCases: a.openCases, openActions: a.openActions })}
        </p>
        {data.detail?.followupNote ? (
          <p className="text-xs text-ink-soft">{data.detail.followupNote}</p>
        ) : null}
      </Card>

      {data.detail?.closureNote ? (
        <Card title="Cierre">
          <p className="text-xs text-ink">{data.detail.closureNote}</p>
          <p className="text-xs text-ink-soft">
            Cerrada el {formatDate(a.closedAt ? a.closedAt.slice(0, 10) : null)}.
          </p>
        </Card>
      ) : null}

      {canClose && !frozen ? (
        <Card title="Cerrar auditoría">
          <DomainNote>{CLOSING_AUDIT_IS_NOT_CLOSING_ACTIONS}</DomainNote>
          <ActionForm action={closeAuditAction} submitLabel="Cerrar auditoría">
            <input type="hidden" name="audit_id" value={a.id} />
            <Field label="Razón del cierre">
              <textarea name="closure_note" rows={2} required className={inputClass} />
            </Field>
            <Field label="Qué queda en seguimiento">
              <textarea name="followup_note" rows={2} className={inputClass} />
            </Field>
          </ActionForm>
        </Card>
      ) : null}
    </>
  );
}

/**
 * AR-07 · El expediente de preparación. No trae nada nuevo: reúne lo que ya
 * está en el sistema y lo pone delante del auditor antes de empezar. Enseña la
 * competencia del equipo y los conflictos, y no decide con ninguno de los dos.
 */
function Dossier({ dossier }: { dossier: Record<string, unknown> }) {
  const processes = Array.isArray(dossier.processes)
    ? (dossier.processes as Record<string, unknown>[]) : [];
  const documents = Array.isArray(dossier.documents)
    ? (dossier.documents as Record<string, unknown>[]) : [];
  const team = Array.isArray(dossier.team_competence)
    ? (dossier.team_competence as Record<string, unknown>[]) : [];
  const audit = (dossier.audit ?? {}) as Record<string, string>;

  return (
    <Card
      title="Expediente de preparación"
      description={`Lo que ya se sabe, con las revisiones vigentes al ${formatDate(audit.reference_date ?? null)}.`}
    >
      <DomainNote>
        Este expediente no decide nada. Reúne lo que ya existe para que el equipo
        auditor no llegue a ciegas.
      </DomainNote>

      <Table
        headers={["Proceso", "Dueño", "Revisión en la fecha", "Contexto"]}
        empty="El alcance no incluye procesos."
        rows={processes.map((p) => {
          const rev = (p.revision_on_date ?? null) as Record<string, unknown> | null;
          const ctx = (p.priority_context ?? {}) as Record<string, Record<string, number>>;
          return [
            String(p.name ?? "—"),
            String(p.owner_position ?? "Sin dueño"),
            rev ? `Revisión ${rev.number}` : "Sin revisión publicada",
            [
              ctx.risks ? `${ctx.risks.above_appetite ?? 0} riesgo(s) sobre el criterio` : null,
              ctx.indicators ? `${ctx.indicators.off_target ?? 0} indicador(es) fuera de meta` : null,
              ctx.cases ? `${ctx.cases.open ?? 0} caso(s) abiertos` : null,
            ].filter(Boolean).join(" · ") || "—",
          ];
        })}
      />

      <Table
        headers={["Documento de criterio", "Revisión vigente en la fecha"]}
        empty="Ningún criterio apunta a un documento."
        rows={documents.map((d) => {
          const rev = (d.revision_on_date ?? null) as Record<string, unknown> | null;
          return [
            String(d.title ?? "—"),
            rev ? `Revisión ${rev.number}${rev.label ? ` (${rev.label})` : ""}` : "Sin revisión vigente",
          ];
        })}
      />

      <Table
        headers={["Auditor", "Papel", "Competencias registradas"]}
        empty="Sin equipo asignado todavía."
        rows={team.map((t) => {
          const comps = Array.isArray(t.competencies)
            ? (t.competencies as Record<string, string>[]) : [];
          return [
            String(t.person ?? "—"),
            String(t.role ?? "—"),
            comps.length === 0
              ? "Ninguna registrada. Eso NO lo descalifica."
              : comps.map((c) => `${c.name} (${c.level})`).join(", "),
          ];
        })}
      />
      <DomainNote>{COMPETENCE_INFORMS_DOES_NOT_DECIDE}</DomainNote>
    </Card>
  );
}
