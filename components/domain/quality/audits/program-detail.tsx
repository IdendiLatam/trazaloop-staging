"use client";

import {
  ActionForm, Card, DomainNote, Field, inputClass, Pill, Table,
} from "@/components/domain/quality/audits/shared";
import type {
  AuditRow, ProgramRevisionRow, ProgramRow,
} from "@/lib/db/quality-audits";
import {
  AUDIT_NATURE_LABEL, AUDIT_STATUS_LABEL, AUDIT_TYPE_LABEL, describeCoverage,
  formatDate, formatRange, PROGRAM_IS_DYNAMIC, PROGRAM_REVISION_KIND_LABEL,
  PROGRAM_STATUS_LABEL, wasRescheduled,
} from "@/lib/domain/quality-audits";
import { updateProgramStatusAction } from "@/server/actions/quality-audits";

/**
 * Trazaloop Quality · QUALITY-09 · La ficha del programa.
 *
 * La cobertura se lee de lo que hay, no de lo que se prometió: una auditoría
 * cancelada sigue contando como planificada no ejecutada. Es lo único que
 * convierte la cobertura en un dato y no en una felicitación.
 */
export function ProgramDetail({
  program, audits, revisions, canManage, canClose,
}: {
  program: ProgramRow;
  audits: AuditRow[];
  revisions: ProgramRevisionRow[];
  canManage: boolean;
  canClose: boolean;
}) {
  const closed = program.status === "closed" || program.status === "cancelled";

  return (
    <div className="space-y-6">
      <Card title={program.name} description={program.purpose ?? undefined}>
        <div className="grid gap-2 text-xs sm:grid-cols-3">
          <Fact label="Periodo" value={`${formatDate(program.periodStart)} — ${formatDate(program.periodEnd)}`} />
          <Fact label="Estado" value={PROGRAM_STATUS_LABEL[program.status]} />
          <Fact label="Responsable" value={program.ownerPositionName ?? "Sin asignar"} />
          <Fact label="Aprobado" value={formatDate(program.approvedOn)} />
          <Fact label="Código" value={program.code ?? "—"} />
          <Fact label="Etiqueta" value={program.periodLabel} />
        </div>

        <div className="rounded-md border border-hairline bg-canvas px-3 py-2 space-y-1">
          <p className="text-xs font-medium text-ink">Cobertura</p>
          <p className="text-xs text-ink">
            {describeCoverage({
              planned: program.plannedAudits, executed: program.executedAudits,
              cancelled: program.cancelledAudits, pending: program.pendingAudits,
            })}
          </p>
          <p className="text-xs text-ink-soft">
            {program.coveragePct === null
              ? "Sin auditorías todavía: no hay porcentaje que mostrar."
              : `${program.coveragePct}% ejecutado. Las canceladas siguen contando `
                + "como planificadas no ejecutadas."}
          </p>
          <p className="text-xs text-ink-soft">
            Procesos con auditoría en el periodo: {program.processesAudited} de{" "}
            {program.processesInScope}.
          </p>
        </div>

        {program.prioritizationNote ? (
          <div className="space-y-1">
            <p className="text-xs font-medium text-ink">Cómo se priorizó</p>
            <p className="text-xs text-ink-soft">{program.prioritizationNote}</p>
          </div>
        ) : null}

        {program.closureNote ? (
          <div className="space-y-1">
            <p className="text-xs font-medium text-ink">Cierre</p>
            <p className="text-xs text-ink-soft">{program.closureNote}</p>
          </div>
        ) : null}
      </Card>

      <Card title="Auditorías del programa">
        <DomainNote>{PROGRAM_IS_DYNAMIC}</DomainNote>
        <Table
          headers={["Código", "Auditoría", "Tipo", "Naturaleza", "Fechas", "Estado", "Hallazgos"]}
          empty="El programa todavía no tiene auditorías."
          rows={audits.map((a) => [
            <a key="c" className="underline" href={`/quality/audits/${a.id}`}>{a.code}</a>,
            a.title,
            AUDIT_TYPE_LABEL[a.auditType],
            AUDIT_NATURE_LABEL[a.nature],
            <span key="f">
              {formatRange(a.scheduledFrom, a.scheduledTo)}
              {wasRescheduled(a)
                ? <span className="block text-ink-soft">
                    Reprogramada {a.rescheduleCount} vez/veces · original{" "}
                    {formatRange(a.plannedFrom, a.plannedTo)}
                  </span>
                : null}
            </span>,
            <Pill key="s" tone={a.status === "cancelled" ? "bad" : "neutral"}>
              {AUDIT_STATUS_LABEL[a.status]}
            </Pill>,
            `${a.findingCount} · ${a.findingsEscalated} escalados`,
          ])}
        />
      </Card>

      <Card
        title="Revisiones del programa"
        description="AR-02 · Cada cambio queda como una revisión con su foto. La versión anterior no se pierde."
      >
        <Table
          headers={["Rev.", "Qué pasó", "Nota", "Desde"]}
          empty="Sin revisiones registradas."
          rows={revisions.map((r) => [
            r.revisionNumber,
            PROGRAM_REVISION_KIND_LABEL[r.changeKind],
            r.changeNote ?? "—",
            formatDate(r.effectiveFrom),
          ])}
        />
      </Card>

      {canManage && !closed ? (
        <Card title="Estado del programa">
          <ActionForm action={updateProgramStatusAction} submitLabel="Guardar estado">
            <input type="hidden" name="program_id" value={program.id} />
            <Field label="Nuevo estado">
              <select name="status" className={inputClass} defaultValue={program.status}>
                <option value="draft">Borrador</option>
                <option value="active">Activo</option>
                {canClose ? <option value="closed">Cerrado</option> : null}
                <option value="cancelled">Cancelado</option>
              </select>
            </Field>
            <Field
              label="Nota"
              hint="Obligatoria al cerrar: explica qué se cubrió y qué quedó fuera."
            >
              <textarea name="closure_note" rows={2} className={inputClass} />
            </Field>
          </ActionForm>
        </Card>
      ) : null}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-ink-soft">{label}</p>
      <p className="text-ink">{value}</p>
    </div>
  );
}
