"use client";

import { ExportPdfButton } from "@/components/ui/export-pdf-button";
import {
  ActionForm, AuditSubnav, Card, DomainNote, Field, inputClass, Pill, Table,
} from "@/components/domain/quality/audits/shared";
import type { AuditRow, ProgramRow } from "@/lib/db/quality-audits";
import {
  AUDIT_NATURE_LABEL, AUDIT_NATURES, AUDIT_STATUS_LABEL, AUDIT_TYPE_LABEL,
  AUDIT_TYPES, CANCEL_IS_NOT_DELETE, formatRange, RESCHEDULE_KEEPS_HISTORY,
  wasRescheduled,
} from "@/lib/domain/quality-audits";
import { createAuditAction } from "@/server/actions/quality-audits";
import type { Option } from "@/components/domain/quality/audits/programs";

/** Trazaloop Quality · QUALITY-09 · El listado de auditorías (AR-03). */
export function AuditsScreen({
  audits, programs, positions, canManage, today,
}: {
  audits: AuditRow[];
  programs: ProgramRow[];
  positions: Option[];
  canManage: boolean;
  today: string;
}) {
  return (
    <div className="space-y-6">
      <AuditSubnav current="audits" />

      <DomainNote>{RESCHEDULE_KEEPS_HISTORY}</DomainNote>

      <Card
        title="Auditorías"
        description="Todas, en cualquier estado."
        action={<ExportPdfButton exportKey="quality.audit.list" label="Descargar PDF" />}
      >
        <Table
          headers={["Código", "Auditoría", "Tipo", "Programa", "Fechas", "Estado", "Equipo", "Hallazgos", ""]}
          empty="Todavía no hay auditorías."
          rows={audits.map((a) => [
            <a key="c" className="underline" href={`/quality/audits/${a.id}`}>{a.code}</a>,
            <span key="t">
              {a.title}
              {a.nature === "extraordinary"
                ? <span className="block text-ink-soft">
                    {AUDIT_NATURE_LABEL.extraordinary} · no nació del programa
                  </span>
                : null}
            </span>,
            AUDIT_TYPE_LABEL[a.auditType],
            a.programId
              ? <a key="p" className="underline" href={`/quality/audits/programs/${a.programId}`}>
                  {a.programName}
                </a>
              : "Fuera de programa",
            <span key="f">
              {formatRange(a.scheduledFrom, a.scheduledTo)}
              {wasRescheduled(a)
                ? <span className="block text-ink-soft">Reprogramada ×{a.rescheduleCount}</span>
                : null}
              {a.scheduledTo !== null && a.scheduledTo < today
                && ["draft", "planned", "in_progress"].includes(a.status)
                ? <span className="block text-amber-700 dark:text-amber-400">Vencida</span>
                : null}
            </span>,
            <Pill key="s" tone={
              a.status === "cancelled" ? "bad"
                : a.status === "closed" ? "good"
                  : "neutral"
            }>
              {AUDIT_STATUS_LABEL[a.status]}
            </Pill>,
            <span key="e">
              {a.teamSize} · {a.leadAuditor ?? "sin líder"}
              {a.openConflicts > 0
                ? <span className="block text-red-700 dark:text-red-400">
                    {a.openConflicts} conflicto(s) sin decidir
                  </span>
                : null}
            </span>,
            `${a.findingCount} · ${a.findingsPending} sin evaluar`,
            <ExportPdfButton
              key="x" exportKey="quality.audit.detail" id={a.id} label="Descargar PDF"
            />,
          ])}
        />
        <DomainNote>{CANCEL_IS_NOT_DELETE}</DomainNote>
      </Card>

      {canManage ? (
        <Card
          title="Crear auditoría"
          description="Puede pertenecer a un programa o ser extraordinaria."
        >
          <ActionForm action={createAuditAction} submitLabel="Crear auditoría">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Código">
                <input name="code" required className={inputClass} placeholder="AI-2026-01" />
              </Field>
              <Field label="Título">
                <input name="title" required className={inputClass}
                  placeholder="Auditoría interna del proceso de compras" />
              </Field>
              <Field label="Programa">
                <select name="program_id" className={inputClass} defaultValue="">
                  <option value="">Fuera de programa</option>
                  {programs.filter((p) => p.status !== "closed").map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </Field>
              <Field
                label="Naturaleza"
                hint="Una auditoría extraordinaria es legítima. Solo hay que decir que lo es."
              >
                <select name="nature" className={inputClass} defaultValue="planned">
                  {AUDIT_NATURES.map((n) => (
                    <option key={n} value={n}>{AUDIT_NATURE_LABEL[n]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Tipo">
                <select name="audit_type" className={inputClass} defaultValue="internal">
                  {AUDIT_TYPES.map((t) => (
                    <option key={t} value={t}>{AUDIT_TYPE_LABEL[t]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Responsable (cargo)">
                <select name="owner_position_id" className={inputClass} defaultValue="">
                  <option value="">Sin asignar</option>
                  {positions.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Desde">
                <input type="date" name="scheduled_from" className={inputClass} />
              </Field>
              <Field label="Hasta">
                <input type="date" name="scheduled_to" className={inputClass} />
              </Field>
            </div>
            <Field label="Objetivo">
              <textarea name="objective" rows={2} className={inputClass} />
            </Field>
            <Field label="Nota de alcance" hint="El alcance estructurado se define dentro de la auditoría.">
              <textarea name="scope_note" rows={2} className={inputClass} />
            </Field>
            <Field label="Por qué ahora" hint="AR-04 · Lo escribe una persona. El sistema no programa solo.">
              <textarea name="priority_note" rows={2} className={inputClass} />
            </Field>
          </ActionForm>
        </Card>
      ) : null}
    </div>
  );
}
