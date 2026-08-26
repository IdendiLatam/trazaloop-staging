"use client";

import { ExportPdfButton } from "@/components/ui/export-pdf-button";
import {
  ActionForm, AuditSubnav, Card, DomainNote, Field, inputClass, Pill, Table,
} from "@/components/domain/quality/audits/shared";
import type { ProgramRow } from "@/lib/db/quality-audits";
import {
  describeCoverage, formatDate, PROGRAM_IS_DYNAMIC, PROGRAM_IS_NOT_AN_AUDIT,
  PROGRAM_STATUS_LABEL,
} from "@/lib/domain/quality-audits";
import { createProgramAction } from "@/server/actions/quality-audits";

export type Option = { id: string; label: string };

/** Trazaloop Quality · QUALITY-09 · El programa de auditorías (AR-01, AR-02). */
export function ProgramsScreen({
  programs, positions, canManage,
}: { programs: ProgramRow[]; positions: Option[]; canManage: boolean }) {
  return (
    <div className="space-y-6">
      <AuditSubnav current="programs" />

      <DomainNote>{PROGRAM_IS_NOT_AN_AUDIT}</DomainNote>

      <Card
        title="Programas"
        description="Uno por periodo, con su cobertura real."
        action={<ExportPdfButton exportKey="quality.audit-program.list" label="Descargar PDF" />}
      >
        <Table
          headers={["Programa", "Periodo", "Estado", "Cobertura", "Procesos", "Revisiones", ""]}
          empty="Todavía no hay ningún programa."
          rows={programs.map((p) => [
            <span key="n">
              <a className="underline" href={`/quality/audits/programs/${p.id}`}>{p.name}</a>
              {p.code ? <span className="block text-ink-soft">{p.code}</span> : null}
            </span>,
            `${formatDate(p.periodStart)} — ${formatDate(p.periodEnd)}`,
            <Pill key="s" tone={p.status === "active" ? "good" : "neutral"}>
              {PROGRAM_STATUS_LABEL[p.status]}
            </Pill>,
            describeCoverage({
              planned: p.plannedAudits, executed: p.executedAudits,
              cancelled: p.cancelledAudits, pending: p.pendingAudits,
            }),
            `${p.processesAudited} de ${p.processesInScope}`,
            p.rescheduledAudits > 0
              ? `${p.rescheduledAudits} auditoría(s) reprogramadas`
              : "Sin reprogramaciones",
            <ExportPdfButton
              key="x" exportKey="quality.audit-program.detail" id={p.id}
              label="Descargar PDF"
            />,
          ])}
        />
      </Card>

      {canManage ? (
        <Card
          title="Crear programa"
          description="El plan del periodo. Las auditorías se añaden después."
        >
          <DomainNote>{PROGRAM_IS_DYNAMIC}</DomainNote>
          <ActionForm action={createProgramAction} submitLabel="Crear programa">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nombre">
                <input name="name" required className={inputClass}
                  placeholder="Programa anual de auditorías internas" />
              </Field>
              <Field label="Código (opcional)">
                <input name="code" className={inputClass} placeholder="PA-2026" />
              </Field>
              <Field label="Etiqueta del periodo" hint="Cómo lo llama la gente: «2026», «S1 2026».">
                <input name="period_label" className={inputClass} placeholder="2026" />
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
                <input type="date" name="period_start" required className={inputClass} />
              </Field>
              <Field label="Hasta">
                <input type="date" name="period_end" required className={inputClass} />
              </Field>
            </div>
            <Field label="Propósito" hint="Para qué existe este programa.">
              <textarea name="purpose" rows={2} className={inputClass} />
            </Field>
            <Field
              label="Cómo se priorizó"
              hint="AR-04 · Escribe el criterio con el que se eligió qué auditar. El sistema no lo deduce."
            >
              <textarea name="prioritization_note" rows={2} className={inputClass} />
            </Field>
          </ActionForm>
        </Card>
      ) : null}
    </div>
  );
}
