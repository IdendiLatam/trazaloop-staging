"use client";

import { ExportPdfButton } from "@/components/ui/export-pdf-button";
import {
  AuditSubnav, Card, DomainNote, Pill, Table,
} from "@/components/domain/quality/audits/shared";
import type {
  AuditRow, FindingRow, RecurringFindingRow,
} from "@/lib/db/quality-audits";
import {
  ESCALATION_IS_A_DECISION, FINDING_CLASSIFICATION_LABEL,
  FINDING_EVALUATION_STATUS_LABEL, FINDING_IS_NOT_NC, FINDING_SEVERITY_LABEL,
  formatDate, OBSERVATION_IS_NOT_NC,
} from "@/lib/domain/quality-audits";

/**
 * Trazaloop Quality · QUALITY-09 · Los hallazgos de todas las auditorías.
 *
 * Esta pantalla existe para una pregunta concreta: qué se encontró y qué se
 * hizo con ello. No responde «cuántas no conformidades hay»: esa pregunta se
 * responde en Casos, que es donde vive la clasificación formal.
 */
export function FindingsScreen({
  findings, audits, recurring,
}: {
  findings: FindingRow[];
  audits: AuditRow[];
  recurring: RecurringFindingRow[];
}) {
  const auditById = new Map(audits.map((a) => [a.id, a]));
  const pending = findings.filter((f) => f.evaluationStatus === "pending");
  const escalated = findings.filter((f) => f.caseId !== null);
  const suspected = findings.filter(
    (f) => f.proposedClassification === "nonconformity_suspected"
  );

  return (
    <div className="space-y-6">
      <AuditSubnav current="findings" />

      <DomainNote>{FINDING_IS_NOT_NC}</DomainNote>
      <DomainNote>{OBSERVATION_IS_NOT_NC}</DomainNote>

      <div className="grid gap-3 sm:grid-cols-4">
        <Counter label="Hallazgos" value={findings.length} />
        <Counter label="Sin evaluar" value={pending.length} />
        <Counter label="Propuestos como posible NC" value={suspected.length} />
        <Counter label="Escalados a caso" value={escalated.length} />
      </div>
      <p className="text-xs text-ink-soft">
        Ninguno de estos cuatro números es el número de no conformidades de la
        organización.
      </p>

      <Card
        title="Todos los hallazgos"
        action={<ExportPdfButton exportKey="quality.audit-finding.list" label="Descargar PDF" />}
      >
        <DomainNote>{ESCALATION_IS_A_DECISION}</DomainNote>
        <Table
          headers={["Auditoría", "Código", "Enunciado", "Clasificación propuesta",
                    "Gravedad", "Evaluación", "Caso", "Levantado", ""]}
          empty="Todavía no hay hallazgos en ninguna auditoría."
          rows={findings.map((f) => {
            const audit = auditById.get(f.auditId);
            return [
              audit
                ? <a key="a" className="underline" href={`/quality/audits/${audit.id}`}>
                    {audit.code}
                  </a>
                : "—",
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
              FINDING_EVALUATION_STATUS_LABEL[f.evaluationStatus],
              f.caseId
                ? <a key="k" className="underline" href={`/quality/cases/${f.caseId}`}>
                    {f.caseCode ?? "Caso"}
                  </a>
                : "Sin caso",
              formatDate(f.raisedOn),
              <ExportPdfButton
                key="x" exportKey="quality.audit-finding.detail" id={f.id}
                label="Descargar PDF"
              />,
            ];
          })}
        />
      </Card>

      <Card
        title="Procesos que reaparecen"
        description="AR-18 · El mismo proceso con hallazgos en varias auditorías."
      >
        <DomainNote>
          La recurrencia es una señal para quien decide el próximo programa. No
          abre una no conformidad, ni un riesgo, ni una acción.
        </DomainNote>
        <Table
          headers={["Proceso", "Clasificación propuesta", "Veces", "Auditorías", "Primera", "Última"]}
          empty="Ningún proceso repite hallazgos todavía."
          rows={recurring.map((r) => [
            r.processName,
            FINDING_CLASSIFICATION_LABEL[r.proposedClassification],
            r.occurrences,
            r.auditsInvolved,
            formatDate(r.firstRaisedOn),
            formatDate(r.lastRaisedOn),
          ])}
        />
      </Card>
    </div>
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
