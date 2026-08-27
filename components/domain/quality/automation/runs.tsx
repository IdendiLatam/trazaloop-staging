"use client";

import { ExportPdfButton } from "@/components/ui/export-pdf-button";
import {
  AutomationSubnav, Card, Counter, DomainNote, Pill, Table,
} from "@/components/domain/quality/automation/shared";
import type { RunRow } from "@/lib/db/quality-automation";
import {
  describeRun, FAILURE_IS_ISOLATED, formatDate, formatDateTime, ONE_ENGINE,
  RUN_COUNTS_WHAT_IT_CREATED, RUN_KIND_LABEL, RUN_STATUS_LABEL,
} from "@/lib/domain/quality-automation";

/** Trazaloop Quality · QUALITY-11 · §44 · Las ejecuciones. */
export function RunsScreen({ runs, detail }: { runs: RunRow[]; detail: RunRow | null }) {
  const ultimas = runs.slice(0, 30);
  const fallidas = runs.filter((r) => r.status === "failed" || r.status === "partial");

  return (
    <div className="space-y-6">
      <AutomationSubnav current="runs" />

      <DomainNote>{RUN_COUNTS_WHAT_IT_CREATED}</DomainNote>
      <DomainNote>{ONE_ENGINE}</DomainNote>

      <div className="grid gap-3 sm:grid-cols-4">
        <Counter label="Ejecuciones" value={runs.length} />
        <Counter label="Con fallos" value={fallidas.length}
          tone={fallidas.length > 0 ? "bad" : undefined} />
        <Counter label="Señales creadas"
          value={runs.reduce((s, r) => s + r.signalsCreated, 0)} />
        <Counter label="Coincidencias"
          value={runs.reduce((s, r) => s + r.matches, 0)} />
      </div>

      <Card
        title="Historial de ejecuciones"
        action={<ExportPdfButton exportKey="quality.automation-run.list" label="Descargar PDF" />}
      >
        {/* QUALITY-11.1 · §37 · Las cuatro maneras de que haya una ejecución. */}
        <DomainNote>
          Una ejecución puede venir de cuatro sitios: del barrido programado de
          la noche, de alguien que pulsó «Ejecutar ahora», de un hecho que
          acaba de ocurrir, o de una simulación —que no crea nada—. Las cuatro
          usan el mismo evaluador.
        </DomainNote>
        <Table
          headers={["Cuándo", "Día de negocio", "Tipo", "Estado", "Reglas", "Sujetos",
                    "Coincidencias", "Nuevas", "Duración", ""]}
          empty="Todavía no se ha ejecutado ningún barrido."
          rows={ultimas.map((r) => [
            formatDateTime(r.startedAt),
            formatDate(r.businessDate),
            RUN_KIND_LABEL[r.runKind],
            <Pill key="s" tone={
              r.status === "success" ? "good"
                : r.status === "partial" ? "warn"
                  : r.status === "failed" ? "bad" : "neutral"
            }>
              {RUN_STATUS_LABEL[r.status]}
            </Pill>,
            <span key="r">
              {r.rulesEvaluated}
              <span className="block text-ink-soft">
                {r.organizationRules} propias · {r.platformObservers} de plataforma
              </span>
            </span>,
            r.subjectsEvaluated,
            r.matches,
            `${r.signalsCreated} señal(es) · ${r.alertsCreated} aviso(s) · ${r.tasksCreated} tarea(s)`,
            r.durationMs !== null ? `${r.durationMs} ms` : "—",
            <ExportPdfButton
              key="x" exportKey="quality.automation-run.detail" id={r.id}
              label="Descargar PDF"
            />,
          ])}
        />
      </Card>

      {detail ? (
        <Card
          title={`Última ejecución · ${formatDateTime(detail.startedAt)}`}
          description={describeRun(detail)}
        >
          <DomainNote>{FAILURE_IS_ISOLATED}</DomainNote>
          <Table
            headers={["Qué se evaluó", "Sujetos", "Coincidencias", "Señales", "Avisos",
                      "Tareas", "Estado", "Duración", "Mensaje"]}
            empty="La ejecución no evaluó nada."
            rows={detail.detail.map((d) => [
              <span key="q">
                {d.ruleName ?? d.platformObserver ?? "—"}
                {d.platformObserver
                  ? <span className="block text-ink-soft">Observador de plataforma</span>
                  : null}
              </span>,
              d.subjectsEvaluated, d.matches, d.signalsCreated,
              d.alertsCreated, d.tasksCreated,
              <Pill key="s" tone={
                d.status === "success" ? "good"
                  : d.status === "failed" ? "bad" : "neutral"
              }>
                {d.status === "success" ? "Correcta"
                  : d.status === "failed" ? "Falló" : "Omitida"}
              </Pill>,
              d.durationMs !== null ? `${d.durationMs} ms` : "—",
              d.errorMessage ?? "—",
            ])}
          />
          <DomainNote>
            Los observadores de plataforma son los barridos que QUALITY-03 a
            QUALITY-10 ya traían. No se han reescrito ni duplicado: se ejecutan
            aquí para que exista UNA sola puerta y su resultado aparezca en el
            mismo informe.
          </DomainNote>
        </Card>
      ) : null}
    </div>
  );
}
