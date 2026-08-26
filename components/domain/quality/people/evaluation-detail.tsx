"use client";

import Link from "next/link";
import { ExportPdfButton } from "@/components/ui/export-pdf-button";
import {
  CONTEXT_ATTRIBUTION_NOTICE, CONTEXT_DISCLAIMER, CONTEXT_KIND_LABEL,
  CONTEXT_TEMPORALITY_LABEL, CONTEXT_KINDS, summarizeContext,
} from "@/lib/domain/quality-onboarding";
import {
  EVALUATION_STATUS_LABEL, formatDate, PERFORMANCE_RESULT_LABEL,
} from "@/lib/domain/quality-people";
import type { EvaluationContext } from "@/lib/db/quality-evaluation-context";
import type { PerformanceEvaluationRow } from "@/lib/db/quality-people";
import { Card, DomainNote, Table } from "./shared";

/**
 * Trazaloop Quality · QUALITY-06.1 · Ficha de una evaluación de desempeño, con
 * el contexto del sistema de gestión.
 *
 * LA SEPARACIÓN VISUAL ES EL PUNTO
 *
 * Arriba, el RESULTADO: lo que una persona decidió, contra qué criterios y
 * cuándo. Abajo, y con su propio encabezado, el CONTEXTO: lo que el sistema de
 * gestión sabe de los procesos del cargo en ese periodo.
 *
 * Nunca se mezclan, y el contexto lleva su aviso cada vez que aparece. Un panel
 * de indicadores pegado al resultado se lee como su justificación, y esa
 * lectura es exactamente la que PC-28 prohíbe.
 */
export function EvaluationDetailView({
  evaluation, context,
}: {
  evaluation: PerformanceEvaluationRow;
  context: EvaluationContext | null;
}) {
  const resumen = context ? summarizeContext(context.lines) : null;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link
          href="/quality/people/performance"
          className="text-xs font-medium text-loop hover:underline"
        >
          ← Desempeño
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{evaluation.personName}</h1>
        <p className="text-sm text-ink-soft">
          {evaluation.cycleName} · {EVALUATION_STATUS_LABEL[evaluation.status]}
          {evaluation.evaluatedOn ? ` · ${formatDate(evaluation.evaluatedOn)}` : ""}
        </p>
        <ExportPdfButton
          exportKey="quality.performance-evaluation.detail" id={evaluation.id}
          label="Descargar PDF"
        />
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* RESULTADO — lo que decidió una persona                              */}
      {/* ------------------------------------------------------------------ */}
      <Card
        title="Resultado de la evaluación"
        description="Lo decidió una persona, contra criterios escritos."
      >
        <dl className="grid gap-2 text-xs sm:grid-cols-2">
          <div>
            <dt className="font-medium text-ink">Evaluador</dt>
            <dd className="text-ink-soft">{evaluation.evaluatorName ?? "—"}</dd>
          </div>
          <div>
            <dt className="font-medium text-ink">Fecha</dt>
            <dd className="text-ink-soft">
              {evaluation.evaluatedOn ? formatDate(evaluation.evaluatedOn) : "—"}
            </dd>
          </div>
        </dl>
        {evaluation.summary ? <p className="text-xs text-ink">{evaluation.summary}</p> : null}
        <Table
          headers={["Contra qué se evaluó", "Resultado", "Observación"]}
          empty="Sin criterios registrados."
          rows={evaluation.items.map((i) => [
            i.criterion, PERFORMANCE_RESULT_LABEL[i.result], i.observation ?? "—",
          ])}
        />
        {evaluation.contextNote ? (
          <>
            <p className="text-xs font-medium text-ink">Contexto que anotó el evaluador</p>
            <p className="text-xs text-ink-soft">{evaluation.contextNote}</p>
          </>
        ) : null}
        <DomainNote>
          Esta evaluación no modifica la competencia declarada de la persona: competencia y
          desempeño son cosas distintas.
        </DomainNote>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* CONTEXTO — informa, no decide                                       */}
      {/* ------------------------------------------------------------------ */}
      <section className="rounded-lg border-2 border-dashed border-hairline bg-canvas p-4 space-y-4">
        <header className="space-y-1">
          <h2 className="text-sm font-semibold text-ink">Contexto del sistema de gestión</h2>
          <p className="text-xs text-ink-soft">{CONTEXT_DISCLAIMER}</p>
          <p className="text-xs text-ink-soft">{CONTEXT_ATTRIBUTION_NOTICE}</p>
        </header>

        {!context ? (
          <p className="text-xs text-ink-soft">
            No hay contexto disponible con tus permisos.
          </p>
        ) : context.lines.length === 0 ? (
          <p className="text-xs text-ink-soft">
            {context.position
              ? "No hay información del sistema de gestión relacionada con este cargo en el periodo evaluado."
              : "Esta evaluación no registra el cargo, así que no hay procesos desde los que traer contexto."}
          </p>
        ) : (
          <>
            <p className="text-xs text-ink-soft">
              Periodo evaluado: {formatDate(context.period.start)} → {formatDate(context.period.end)}
              {context.position ? ` · Cargo: ${context.position.name}` : ""}
              {context.processes.length > 0
                ? ` · Procesos: ${context.processes.map((p) => p.name).join(", ")}`
                : ""}
            </p>

            {CONTEXT_KINDS.map((kind) => {
              const lines = context.lines.filter((l) => l.kind === kind);
              if (lines.length === 0) return null;
              return (
                <div key={kind} className="space-y-1">
                  <h3 className="text-xs font-semibold text-ink">{CONTEXT_KIND_LABEL[kind]}</h3>
                  <Table
                    headers={["De qué habla", "Qué", "Dato", "Cuándo"]}
                    empty=""
                    rows={lines.map((l) => [
                      // El sujeto va PRIMERO y siempre: es lo que impide leer
                      // la fila como una medida de la persona.
                      l.subject,
                      l.label,
                      <span key="v">
                        {l.value}
                        {l.detail ? <span className="block text-ink-soft">{l.detail}</span> : null}
                      </span>,
                      CONTEXT_TEMPORALITY_LABEL[l.temporality],
                    ])}
                  />
                </div>
              );
            })}

            {resumen ? (
              <p className="text-xs text-ink-soft">
                {resumen.total} dato(s) de contexto: {resumen.good} favorable(s),{" "}
                {resumen.bad} desfavorable(s), {resumen.neutral} sin signo. Es un recuento de
                hechos mostrados, no una calificación.
              </p>
            ) : null}

            {context.restrictedSources > 0 ? (
              <p className="text-xs text-ink-soft">
                {context.restrictedSources} fuente(s) no se muestran porque tus permisos no
                alcanzan. El panel no concede acceso a nada que no pudieras consultar por tu
                cuenta.
              </p>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
