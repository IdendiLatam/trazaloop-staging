"use client";

import { ExportPdfButton } from "@/components/ui/export-pdf-button";
import {
  ActionForm, AutomationSubnav, Card, Counter, DomainNote, Field, inputClass,
  Pill, Table,
} from "@/components/domain/quality/automation/shared";
import type { SignalRow } from "@/lib/db/quality-automation";
import {
  ACKNOWLEDGE_IS_NOT_RESOLVE, ALERT_IS_NOT_A_TASK, AUTOMATION_DOMAIN_LABEL,
  AUTO_RESOLUTION_LIMITS, CUSTOMER_ANONYMITY_HOLDS, explanationLines,
  formatDate, formatDateTime, IDEMPOTENT_AND_REARMS, NO_EMPLOYEE_SURVEILLANCE,
  SEVERITY_LABEL, SIGNAL_IS_NOT_AN_ALERT, SIGNAL_STATUS_LABEL,
  SNAPSHOT_IS_MINIMAL, SUPPRESSION_IS_NOT_RESOLUTION, TASK_IS_NOT_AN_ACTION,
  type AutomationDomain,
} from "@/lib/domain/quality-automation";
import {
  acknowledgeSignalAction, resolveSignalAction, suppressAction,
} from "@/server/actions/quality-automation";

/** Trazaloop Quality · QUALITY-11 · §75 · La bandeja transversal de señales. */
export function SignalsScreen({
  signals, canManage,
}: { signals: SignalRow[]; canManage: boolean }) {
  const abiertas = signals.filter((s) => s.resolvedAt === null);
  const criticas = abiertas.filter((s) => s.severity === "critical");
  const cerradas = signals.filter((s) => s.resolvedAt !== null);

  return (
    <div className="space-y-6">
      <AutomationSubnav current="signals" />

      <DomainNote>{SIGNAL_IS_NOT_AN_ALERT}</DomainNote>
      <DomainNote>{IDEMPOTENT_AND_REARMS}</DomainNote>

      <div className="grid gap-3 sm:grid-cols-4">
        <Counter label="Abiertas" value={abiertas.length}
          tone={abiertas.length > 0 ? "warn" : undefined} />
        <Counter label="Críticas" value={criticas.length}
          tone={criticas.length > 0 ? "bad" : undefined} />
        <Counter label="Cerradas" value={cerradas.length} />
        <Counter label="Total" value={signals.length} />
      </div>

      <Card
        title="Señales abiertas"
        description="Lo que la plataforma ha detectado y sigue siendo cierto."
        action={<ExportPdfButton exportKey="quality.automation-signal.list" label="Descargar PDF" />}
      >
        <Table
          headers={["Gravedad", "Señal", "Objeto", "Dominio", "Regla", "Detectada",
                    "Veces", "Alertas", "Tareas", "Estado", ""]}
          empty="No hay ninguna señal abierta."
          rows={abiertas.map((s) => [
            <Pill key="g" tone={
              s.severity === "critical" ? "bad"
                : s.severity === "warning" ? "warn" : "neutral"
            }>
              {SEVERITY_LABEL[s.severity]}
            </Pill>,
            <a key="t" className="underline" href={`/quality/automation/signals/${s.id}`}>
              {s.title}
            </a>,
            <span key="o">
              {s.subjectLabel ?? "—"}
              {s.deepLink
                ? <a className="block text-ink-soft underline" href={s.deepLink}>
                    Ver en su dominio
                  </a>
                : null}
            </span>,
            AUTOMATION_DOMAIN_LABEL[s.domain as AutomationDomain] ?? s.domain,
            <span key="r">
              {s.ruleCode ?? "—"}
              {s.ruleVersionNumber !== null
                ? <span className="block text-ink-soft">v{s.ruleVersionNumber}</span>
                : null}
            </span>,
            formatDate(s.firstDetectedAt),
            s.detectionCount,
            s.alertCount,
            <span key="k">
              {s.taskCount}
              {s.openTaskCount > 0
                ? <span className="block text-ink-soft">{s.openTaskCount} abierta(s)</span>
                : null}
            </span>,
            <span key="e">
              {SIGNAL_STATUS_LABEL[s.status]}
              {s.recipientUnresolved
                ? <span className="block text-amber-700 dark:text-amber-400">
                    Sin destinatario
                  </span>
                : null}
            </span>,
            <ExportPdfButton
              key="x" exportKey="quality.automation-signal.detail" id={s.id}
              label="Descargar PDF"
            />,
          ])}
        />
        <DomainNote>{ALERT_IS_NOT_A_TASK}</DomainNote>
      </Card>

      {cerradas.length > 0 ? (
        <Card title="Señales cerradas" description="Resueltas, descartadas o silenciadas.">
          <Table
            headers={["Señal", "Objeto", "Cerrada", "Cómo", "Por qué"]}
            empty="—"
            rows={cerradas.slice(0, 30).map((s) => [
              <a key="t" className="underline" href={`/quality/automation/signals/${s.id}`}>
                {s.title}
              </a>,
              s.subjectLabel ?? "—",
              formatDate(s.resolvedAt),
              s.resolutionKind === "auto" ? "La condición dejó de cumplirse"
                : s.resolutionKind === "manual" ? "Resuelta por una persona"
                  : s.resolutionKind === "dismissed" ? "Descartada" : "Silenciada",
              s.resolutionNote ?? "—",
            ])}
          />
          <DomainNote>{AUTO_RESOLUTION_LIMITS}</DomainNote>
        </Card>
      ) : null}
    </div>
  );
}

/** §41 · La ficha de una señal: qué, por qué, con qué regla y con qué datos. */
export function SignalFile({
  signal, canManage,
}: { signal: SignalRow; canManage: boolean }) {
  const lineas = explanationLines(signal.explanation);
  const retrato = signal.sourceSnapshot ?? {};

  return (
    <div className="space-y-6">
      <Card
        title={signal.title}
        description={signal.subjectLabel ?? undefined}
        action={
          <span className="flex flex-wrap items-center gap-2">
            <Pill tone={
              signal.severity === "critical" ? "bad"
                : signal.severity === "warning" ? "warn" : "neutral"
            }>
              {SEVERITY_LABEL[signal.severity]}
            </Pill>
            <Pill tone="neutral">{SIGNAL_STATUS_LABEL[signal.status]}</Pill>
            <ExportPdfButton
              exportKey="quality.automation-signal.detail" id={signal.id}
              label="Descargar PDF"
            />
          </span>
        }
      >
        <div className="grid gap-2 text-xs sm:grid-cols-3">
          <Fact label="Dominio"
            value={AUTOMATION_DOMAIN_LABEL[signal.domain as AutomationDomain] ?? signal.domain} />
          <Fact label="Fuente observada" value={signal.sourceLabel} />
          <Fact label="Regla" value={signal.ruleName ?? "—"} />
          <Fact label="Versión de la regla"
            value={signal.ruleVersionNumber !== null ? `v${signal.ruleVersionNumber}` : "—"} />
          <Fact label="Detectada por primera vez" value={formatDateTime(signal.firstDetectedAt)} />
          <Fact label="Vista por última vez" value={formatDateTime(signal.lastDetectedAt)} />
          <Fact label="Veces detectada" value={String(signal.detectionCount)} />
          <Fact label="Alertas" value={String(signal.alertCount)} />
          <Fact label="Tareas"
            value={`${signal.taskCount} (${signal.openTaskCount} abierta(s))`} />
        </div>

        {signal.deepLink ? (
          <p className="text-xs text-ink-soft">
            <a className="underline" href={signal.deepLink}>
              Ver el objeto en su dominio
            </a>{" "}
            — allí decide la política de ese dominio: llegar hasta aquí no
            concede acceso a nada.
          </p>
        ) : null}

        {signal.recipientUnresolved ? (
          <DomainNote>
            No se encontró a nadie con cuenta en el cargo responsable, así que
            nadie recibió el aviso. La señal existe igual: fallar entera habría
            sido peor.
          </DomainNote>
        ) : null}
      </Card>

      {/* §41 · Por qué saltó */}
      <Card title="Por qué se generó" description="Regla, versión, condición y valores.">
        <ul className="space-y-1">
          {lineas.map((l, i) => (
            <li key={i} className="text-xs text-ink">{l}</li>
          ))}
        </ul>
        {Object.keys(retrato).length > 0 ? (
          <>
            <p className="text-xs font-medium text-ink">Datos que la regla miró</p>
            <Table
              headers={["Campo", "Valor"]}
              empty="—"
              rows={Object.entries(retrato).map(([k, v]) => [
                k, v === null ? "sin dato" : JSON.stringify(v),
              ])}
            />
            <DomainNote>{SNAPSHOT_IS_MINIMAL}</DomainNote>
          </>
        ) : null}
        {signal.domain === "customer"
          ? <DomainNote>{CUSTOMER_ANONYMITY_HOLDS}</DomainNote> : null}
        {signal.domain === "people"
          ? <DomainNote>{NO_EMPLOYEE_SURVEILLANCE}</DomainNote> : null}
        <DomainNote>{TASK_IS_NOT_AN_ACTION}</DomainNote>
      </Card>

      {signal.resolvedAt ? (
        <Card title="Cierre">
          <div className="grid gap-2 text-xs sm:grid-cols-2">
            <Fact label="Cerrada el" value={formatDateTime(signal.resolvedAt)} />
            <Fact label="Cómo" value={
              signal.resolutionKind === "auto" ? "La condición dejó de cumplirse"
                : signal.resolutionKind === "manual" ? "Resuelta por una persona"
                  : signal.resolutionKind === "dismissed" ? "Descartada" : "Silenciada"
            } />
          </div>
          <p className="text-xs text-ink">{signal.resolutionNote ?? "—"}</p>
          <DomainNote>{AUTO_RESOLUTION_LIMITS}</DomainNote>
        </Card>
      ) : canManage ? (
        <>
          <Card title="Reconocer" description="Dejar constancia de que alguien la miró.">
            <DomainNote>{ACKNOWLEDGE_IS_NOT_RESOLVE}</DomainNote>
            <ActionForm action={acknowledgeSignalAction} submitLabel="Reconocer la señal">
              <input type="hidden" name="signal_id" value={signal.id} />
            </ActionForm>
          </Card>

          <Card title="Cerrar" description="Resolver o descartar, siempre con razón.">
            <ActionForm action={resolveSignalAction} submitLabel="Cerrar la señal">
              <input type="hidden" name="signal_id" value={signal.id} />
              <Field label="Cómo se cierra">
                <select name="kind" className={inputClass} defaultValue="manual">
                  <option value="manual">Resuelta: se hizo algo al respecto</option>
                  <option value="dismissed">Descartada: no procedía</option>
                </select>
              </Field>
              <Field label="Por qué">
                <textarea name="note" rows={2} required className={inputClass} />
              </Field>
            </ActionForm>
          </Card>

          <Card title="Silenciar" description="Evitar el ruido sin borrar el hecho.">
            <DomainNote>{SUPPRESSION_IS_NOT_RESOLUTION}</DomainNote>
            <ActionForm action={suppressAction} submitLabel="Silenciar esta señal">
              <input type="hidden" name="scope" value="signal" />
              <input type="hidden" name="target_id" value={signal.id} />
              <Field label="Por qué">
                <input name="reason" className={inputClass} />
              </Field>
              <Field label="Hasta">
                <input type="date" name="until" className={inputClass} />
              </Field>
            </ActionForm>
          </Card>
        </>
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
