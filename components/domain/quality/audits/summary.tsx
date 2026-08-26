"use client";

import { ExportPdfButton } from "@/components/ui/export-pdf-button";
import {
  AuditSubnav, Card, DomainNote, Pill, Table,
} from "@/components/domain/quality/audits/shared";
import type {
  AuditHomeSignals, AuditRow, ProgramRow, RecurringFindingRow,
} from "@/lib/db/quality-audits";
import {
  AUDIT_STATUS_LABEL, AUDIT_TYPE_LABEL, describeCoverage,
  FINDING_CLASSIFICATION_LABEL, formatDate, formatRange,
  PROGRAM_IS_NOT_AN_AUDIT, TRAZALOOP_DOES_NOT_CERTIFY, wasRescheduled,
} from "@/lib/domain/quality-audits";

/**
 * Trazaloop Quality · QUALITY-09 · Resumen de Auditorías.
 *
 * Lo que esta pantalla NO hace: no cuenta no conformidades. Cuenta hallazgos,
 * y de los hallazgos dice cuántos están sin evaluar y cuántos se escalaron. La
 * diferencia es todo el módulo.
 */
export function AuditsSummary({
  signals, programs, audits, recurring, today,
}: {
  signals: AuditHomeSignals;
  programs: ProgramRow[];
  audits: AuditRow[];
  recurring: RecurringFindingRow[];
  today: string;
}) {
  const active = programs.filter((p) => p.status === "active");
  const upcoming = audits
    .filter((a) => ["draft", "planned", "in_progress"].includes(a.status))
    .sort((a, b) => (a.scheduledFrom ?? "9999").localeCompare(b.scheduledFrom ?? "9999"))
    .slice(0, 8);

  return (
    <div className="space-y-6">
      <AuditSubnav current="summary" />

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Signal label="Próximas (14 días)" value={signals.upcomingAudits} />
        <Signal label="Con fecha vencida" value={signals.overdueAudits} tone="warn" />
        <Signal label="Ejecutadas sin informe" value={signals.reportsPending} tone="warn" />
        <Signal label="Hallazgos sin evaluar" value={signals.findingsPending} tone="warn" />
        <Signal label="Conflictos sin decidir" value={signals.openConflicts} tone="bad" />
      </div>

      <DomainNote>{TRAZALOOP_DOES_NOT_CERTIFY}</DomainNote>

      <Card
        title="Programas activos"
        description="Un programa dice qué se auditará, cuándo y por qué."
      >
        <DomainNote>{PROGRAM_IS_NOT_AN_AUDIT}</DomainNote>
        <Table
          headers={["Programa", "Periodo", "Cobertura", "Estado"]}
          empty="No hay ningún programa activo."
          rows={active.map((p) => [
            <a key="n" className="underline" href={`/quality/audits/programs/${p.id}`}>
              {p.name}
            </a>,
            `${formatDate(p.periodStart)} — ${formatDate(p.periodEnd)}`,
            describeCoverage({
              planned: p.plannedAudits, executed: p.executedAudits,
              cancelled: p.cancelledAudits, pending: p.pendingAudits,
            }),
            <Pill key="s" tone="good">Activo</Pill>,
          ])}
        />
      </Card>

      <Card
        title="Auditorías próximas y en curso"
        description="Lo que hay por delante, en orden de fecha."
        action={
          <ExportPdfButton
            exportKey="quality.audit-followup.list" label="Descargar PDF"
          />
        }
      >
        <Table
          headers={["Código", "Auditoría", "Tipo", "Fechas", "Estado", "Hallazgos"]}
          empty="No hay auditorías planificadas ni en curso."
          rows={upcoming.map((a) => [
            <a key="c" className="underline" href={`/quality/audits/${a.id}`}>{a.code}</a>,
            a.title,
            AUDIT_TYPE_LABEL[a.auditType],
            <span key="f">
              {formatRange(a.scheduledFrom, a.scheduledTo)}
              {wasRescheduled(a)
                ? <span className="block text-ink-soft">
                    Reprogramada · original {formatRange(a.plannedFrom, a.plannedTo)}
                  </span>
                : null}
              {a.scheduledTo !== null && a.scheduledTo < today
                ? <span className="block text-amber-700 dark:text-amber-400">Fecha vencida</span>
                : null}
            </span>,
            AUDIT_STATUS_LABEL[a.status],
            `${a.findingCount} (${a.findingsPending} sin evaluar)`,
          ])}
        />
      </Card>

      <Card
        title="Procesos que reaparecen"
        description="El mismo proceso con hallazgos en varias auditorías. Es una señal, no un veredicto."
      >
        <DomainNote>
          Que un proceso repita hallazgos NO abre una no conformidad ni un riesgo.
          Es información para quien decide el próximo programa.
        </DomainNote>
        <Table
          headers={["Proceso", "Clasificación propuesta", "Veces", "Auditorías", "Última"]}
          empty="Ningún proceso repite hallazgos todavía."
          rows={recurring.slice(0, 10).map((r) => [
            r.processName,
            FINDING_CLASSIFICATION_LABEL[r.proposedClassification],
            r.occurrences,
            r.auditsInvolved,
            formatDate(r.lastRaisedOn),
          ])}
        />
      </Card>
    </div>
  );
}

function Signal({ label, value, tone }: {
  label: string; value: number; tone?: "warn" | "bad";
}) {
  const color = value === 0
    ? "text-ink"
    : tone === "bad"
      ? "text-red-700 dark:text-red-400"
      : tone === "warn"
        ? "text-amber-700 dark:text-amber-400"
        : "text-ink";
  return (
    <div className="rounded-lg border border-hairline bg-surface px-3 py-2">
      <p className="text-xs text-ink-soft">{label}</p>
      <p className={`text-xl font-semibold ${color}`}>{value}</p>
    </div>
  );
}
