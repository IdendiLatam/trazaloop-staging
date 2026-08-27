"use client";

import {
  ActionForm, AutomationSubnav, Card, Counter, DomainNote, Field, inputClass,
  Pill, Table,
} from "@/components/domain/quality/automation/shared";
import type { RuleRow, RunRow, SignalRow } from "@/lib/db/quality-automation";
import {
  AUTOMATION_DOMAIN_LABEL, AUTOMATION_IS_NOT_AI, CLOCK_IS_SERVER_SIDE,
  BUSINESS_DAY_IS_LOCAL, describeRun, formatDate, formatDateTime,
  QUALITY_BY_OBSERVATION, RUN_KIND_LABEL, RUN_STATUS_LABEL, RULE_STATUS_LABEL,
  SEVERITY_LABEL, SIGNAL_STATUS_LABEL, type AutomationDomain,
} from "@/lib/domain/quality-automation";
import {
  processEventsAction, runAutomationAction, updateSettingsAction,
} from "@/server/actions/quality-automation";

/**
 * Trazaloop Quality · QUALITY-11 · §74 · El resumen.
 *
 * Responde cuatro preguntas y no una más: qué está observando Trazaloop, qué
 * encontró, qué requiere atención y si el motor funciona. Un tablero técnico
 * aquí sería exactamente lo contrario de lo que hace falta.
 */
export function AutomationHome({
  health, rules, signals, runs, canManage, canPublish,
}: {
  health: Record<string, unknown> | null;
  rules: RuleRow[];
  signals: SignalRow[];
  runs: RunRow[];
  canManage: boolean;
  canPublish: boolean;
}) {
  const n = (k: string) => Number(health?.[k] ?? 0);
  const activas = rules.filter((r) => r.status === "active");
  const abiertas = signals.filter((s) => s.resolvedAt === null);
  const porDominio = new Map<string, number>();
  for (const s of abiertas) {
    porDominio.set(s.domain, (porDominio.get(s.domain) ?? 0) + 1);
  }
  const fallando = n("rules_failing") > 0 || n("runs_failed_last_7d") > 0;

  return (
    <div className="space-y-6">
      <AutomationSubnav current="home" />

      <DomainNote>{QUALITY_BY_OBSERVATION}</DomainNote>
      <DomainNote>{AUTOMATION_IS_NOT_AI}</DomainNote>

      {/* ¿QUÉ ESTÁ OBSERVANDO? */}
      <Card
        title="Qué está observando Trazaloop"
        description="Reglas activas, con su versión vigente."
      >
        <div className="grid gap-3 sm:grid-cols-4">
          <Counter label="Reglas activas" value={n("rules_active")} />
          <Counter label="Borradores" value={n("rules_draft")} />
          <Counter label="Sin versión vigente hoy" value={n("rules_without_effective_version")}
            tone={n("rules_without_effective_version") > 0 ? "warn" : undefined} />
          <Counter label="Silenciadas" value={n("rules_suppressed")} />
        </div>
        {n("rules_without_effective_version") > 0 ? (
          <DomainNote>
            Hay reglas marcadas como activas sin ninguna versión vigente hoy:
            están activas de nombre y de nada más. Publica su versión o revisa
            sus fechas de vigencia.
          </DomainNote>
        ) : null}
        <Table
          headers={["Código", "Regla", "Observa", "Versión", "Estado", "Señales abiertas"]}
          empty="Todavía no hay ninguna regla activa. Empieza por las plantillas."
          rows={activas.slice(0, 10).map((r) => [
            <a key="c" className="underline" href={`/quality/automation/rules/${r.id}`}>
              {r.code}
            </a>,
            r.name,
            r.sourceLabel,
            r.currentVersionNumber !== null ? `v${r.currentVersionNumber}` : "—",
            <Pill key="s" tone={r.isSuppressed ? "warn" : "good"}>
              {r.isSuppressed ? "Silenciada" : RULE_STATUS_LABEL[r.status]}
            </Pill>,
            r.openSignalCount,
          ])}
        />
      </Card>

      {/* ¿QUÉ ENCONTRÓ? */}
      <Card title="Qué encontró" description="Señales abiertas, por dominio.">
        <div className="grid gap-3 sm:grid-cols-3">
          <Counter label="Señales abiertas" value={abiertas.length}
            tone={abiertas.length > 0 ? "warn" : undefined} />
          <Counter label="Críticas" value={n("signals_critical")}
            tone={n("signals_critical") > 0 ? "bad" : undefined} />
          <Counter label="Sin destinatario resuelto" value={n("signals_unresolved_recipient")}
            tone={n("signals_unresolved_recipient") > 0 ? "warn" : undefined} />
        </div>
        {n("signals_unresolved_recipient") > 0 ? (
          <DomainNote>
            Algunas señales no encontraron a nadie con cuenta en el cargo
            responsable. La señal existe igual — pero conviene que alguien la
            reciba.
          </DomainNote>
        ) : null}
        <Table
          headers={["Dominio", "Señales abiertas"]}
          empty="No hay ninguna señal abierta."
          rows={[...porDominio.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([d, c]) => [
              AUTOMATION_DOMAIN_LABEL[d as AutomationDomain] ?? d,
              <a key="n" className="underline"
                 href={`/quality/automation/signals?domain=${d}`}>{c}</a>,
            ])}
        />
      </Card>

      {/* ¿REQUIERE ATENCIÓN? */}
      <Card title="Lo que pide atención ahora" description="Las más graves primero.">
        <Table
          headers={["Gravedad", "Señal", "Objeto", "Regla", "Detectada", "Estado"]}
          empty="Nada pendiente."
          rows={abiertas.slice(0, 10).map((s) => [
            <Pill key="g" tone={
              s.severity === "critical" ? "bad"
                : s.severity === "warning" ? "warn" : "neutral"
            }>
              {SEVERITY_LABEL[s.severity]}
            </Pill>,
            <a key="t" className="underline" href={`/quality/automation/signals/${s.id}`}>
              {s.title}
            </a>,
            s.subjectLabel ?? "—",
            s.ruleCode ?? "—",
            formatDate(s.firstDetectedAt),
            SIGNAL_STATUS_LABEL[s.status],
          ])}
        />
      </Card>

      {/* ¿FUNCIONA EL MOTOR? */}
      <Card
        title="Estado del motor"
        description="Un fallo del motor es un problema operativo, no una condición de calidad."
      >
        <div className="grid gap-2 text-xs sm:grid-cols-3">
          <Fact label="Día de negocio" value={formatDate(String(health?.business_today ?? ""))} />
          <Fact label="Zona horaria" value={String(health?.business_timezone ?? "UTC")} />
          <Fact label="Última ejecución"
            value={formatDateTime(String(health?.last_run_at ?? "")) } />
          <Fact label="Último resultado" value={String(health?.last_run_status ?? "—")} />
          <Fact label="Reglas con fallo (7 días)" value={String(n("rules_failing"))} />
          <Fact label="Reglas que nunca corrieron" value={String(n("rules_never_run"))} />
        </div>
        {fallando ? (
          <DomainNote>
            El motor ha fallado en los últimos días. Eso NO es una condición de
            calidad: es una avería. Revisa las ejecuciones para ver qué regla
            falló y con qué mensaje.
          </DomainNote>
        ) : null}
        <DomainNote>{CLOCK_IS_SERVER_SIDE}</DomainNote>

        <Table
          headers={["Cuándo", "Tipo", "Estado", "Resultado"]}
          empty="Todavía no se ha ejecutado ningún barrido."
          rows={runs.slice(0, 5).map((r) => [
            <a key="c" className="underline" href={`/quality/automation/runs`}>
              {formatDateTime(r.startedAt)}
            </a>,
            RUN_KIND_LABEL[r.runKind],
            <Pill key="s" tone={
              r.status === "success" ? "good"
                : r.status === "partial" ? "warn"
                  : r.status === "failed" ? "bad" : "neutral"
            }>
              {RUN_STATUS_LABEL[r.status]}
            </Pill>,
            describeRun(r),
          ])}
        />

        {canManage ? (
          <div className="space-y-2">
            <ActionForm action={runAutomationAction} submitLabel="Ejecutar ahora">
              <p className="text-xs text-ink-soft">
                El barrido manual usa exactamente el mismo motor que el programado.
              </p>
            </ActionForm>
            {/* QUALITY-11.1 · §29 · La misma puerta, para lo que ya ocurrió. */}
            <ActionForm action={processEventsAction} submitLabel="Procesar hechos pendientes">
              <p className="text-xs text-ink-soft">
                Enruta los hechos que han ocurrido desde la última pasada a las
                reglas que los escuchan. Procesar dos veces el mismo hecho no
                emite dos veces.
              </p>
            </ActionForm>
          </div>
        ) : null}
      </Card>

      {canPublish ? (
        <Card title="Configuración" description="La zona horaria decide qué significa «hoy».">
          <DomainNote>{BUSINESS_DAY_IS_LOCAL}</DomainNote>
          <ActionForm action={updateSettingsAction} submitLabel="Guardar configuración">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Zona horaria de la empresa"
                hint="Por ejemplo: America/Bogota, Europe/Madrid, UTC.">
                <input name="business_timezone" className={inputClass}
                  defaultValue={String(health?.business_timezone ?? "UTC")} />
              </Field>
              <Field label="Motor activo">
                <input type="checkbox" name="is_enabled"
                  defaultChecked={health?.enabled !== false}
                  className="mr-2 align-middle" />
              </Field>
            </div>
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
