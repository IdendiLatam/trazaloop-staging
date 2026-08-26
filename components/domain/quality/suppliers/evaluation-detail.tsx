"use client";

import Link from "next/link";
import { ExportPdfButton } from "@/components/ui/export-pdf-button";
import {
  CRITERION_METHOD_LABEL, EVALUATION_KIND_LABEL, EVALUATION_STATUS_LABEL, formatDate,
  RESULT_OUTCOME_HINT, RESULT_OUTCOME_LABEL, RESULT_OUTCOMES, SCORING_RULE_LABEL,
  summarizeOutcomes, weightedScore,
} from "@/lib/domain/quality-suppliers";
import type { ScoringRule } from "@/lib/domain/quality-suppliers";
import type {
  EvaluationResultRow, SupplierDocumentRow, SupplierEvaluationRow,
} from "@/lib/db/quality-suppliers";
import { closeEvaluationAction, recordResultAction } from "@/server/actions/quality-suppliers";
import { ActionForm, Card, DomainNote, Field, inputClass, Table } from "./shared";

/**
 * Trazaloop Quality · QUALITY-07 · Una evaluación por dentro.
 *
 * Los criterios que se ven aquí son los de la VERSIÓN con la que se abrió la
 * evaluación, no los de la plantilla de hoy. Si mañana se publica otra versión,
 * esta página seguirá enseñando exactamente lo que se miró.
 *
 * Y la distinción que sostiene toda la pantalla: «no aplica» no es un cero. Un
 * cero dice «lo hizo mal»; «no aplica» dice «esto no se le puede pedir». Contar
 * lo segundo como lo primero hunde el resultado de un proveedor por algo que no
 * hizo.
 */
export function SupplierEvaluationDetail({
  evaluation, results, scoringRule, scopeLabel, profileId, documents, canManage, today,
}: {
  evaluation: SupplierEvaluationRow;
  results: EvaluationResultRow[];
  scoringRule: ScoringRule;
  scopeLabel: string;
  profileId: string | null;
  documents: SupplierDocumentRow[];
  canManage: boolean;
  today: string;
}) {
  const abierta = evaluation.status === "draft" || evaluation.status === "in_progress";
  const resumen = summarizeOutcomes(results);
  const provisional = weightedScore(
    results.map((r) => ({ outcome: r.outcome, points: r.points, weight: r.weight, maxPoints: r.maxPoints }))
  );

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link
          href={profileId ? `/quality/suppliers/${profileId}` : "/quality/suppliers/evaluations"}
          className="text-xs font-medium text-loop hover:underline"
        >
          ← {profileId ? "Ficha del proveedor" : "Evaluaciones"}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          {EVALUATION_KIND_LABEL[evaluation.kind]}
        </h1>
        <p className="text-sm text-ink-soft">
          {scopeLabel}
          {evaluation.templateName
            ? ` · ${evaluation.templateName} v${evaluation.versionNumber}` : ""}
          {` · ${SCORING_RULE_LABEL[scoringRule]}`}
          {` · ${EVALUATION_STATUS_LABEL[evaluation.status]}`}
          {evaluation.evaluatedOn ? ` · ${formatDate(evaluation.evaluatedOn)}` : ""}
        </p>
        {evaluation.triggerReason ? (
          <p className="text-sm text-ink-soft">Motivo: {evaluation.triggerReason}</p>
        ) : null}
        <ExportPdfButton
          exportKey="quality.supplier-evaluation.detail" id={evaluation.id} label="Descargar PDF"
        />
      </header>

      <Card
        title={abierta ? "Resultado provisional" : "Resultado"}
        description={
          abierta
            ? "Se recalcula con cada criterio que se registra. No es definitivo hasta cerrarla."
            : undefined
        }
      >
        <p className="text-2xl font-semibold text-ink">
          {abierta
            ? (provisional === null ? "—" : provisional)
            : (evaluation.score === null ? "—" : evaluation.score)}
          {!abierta && evaluation.resultBand ? (
            <span className="ml-2 text-sm font-normal text-ink-soft">{evaluation.resultBand}</span>
          ) : null}
        </p>
        <p className="text-xs text-ink-soft">
          {resumen.scored} de {results.length} criterios puntuados
          {resumen.not_applicable > 0 ? ` · ${resumen.not_applicable} no aplican` : ""}
          {resumen.unavailable > 0 ? ` · ${resumen.unavailable} sin dato` : ""}
          {resumen.not_evaluated > 0 ? ` · ${resumen.not_evaluated} sin evaluar` : ""}
        </p>
        <DomainNote>
          Este número <strong>no aprueba a nadie</strong>. Informa la decisión; la toma una
          persona, para un alcance concreto y diciendo en qué se basa.
        </DomainNote>
        {resumen.unavailable > 0 || resumen.not_evaluated > 0 ? (
          <DomainNote>
            Hay criterios sin dato. El resultado se calcula solo con lo que sí se pudo
            mirar, y la cuenta de arriba dice cuánto se miró: un 90 sobre tres criterios
            no es lo mismo que un 90 sobre doce.
          </DomainNote>
        ) : null}
      </Card>

      <Card title="Criterios">
        <Table
          headers={["Código", "Criterio", "Peso", "Cómo se mira", "Resultado", "Puntos", "Observación"]}
          empty="Esta versión de la plantilla no tenía criterios."
          rows={results.map((r) => [
            r.code, r.label, String(r.weight), CRITERION_METHOD_LABEL[r.method],
            RESULT_OUTCOME_LABEL[r.outcome],
            r.outcome === "scored" ? `${r.points ?? "—"} / ${r.maxPoints}` : "—",
            r.observation ?? (r.evidenceExpectation ? `Se espera: ${r.evidenceExpectation}` : "—"),
          ])}
        />
      </Card>

      {canManage && abierta ? (
        <Card title="Registrar un criterio">
          <ActionForm action={recordResultAction} submitLabel="Registrar">
            <input type="hidden" name="evaluation_id" value={evaluation.id} />
            {profileId ? <input type="hidden" name="profile_id" value={profileId} /> : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Criterio">
                <select name="criterion_id" required className={inputClass}>
                  {results.map((r) => (
                    <option key={r.criterionId} value={r.criterionId}>
                      {r.code} · {r.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Resultado">
                <select name="outcome" className={inputClass} defaultValue="scored">
                  {RESULT_OUTCOMES.map((o) => (
                    <option key={o} value={o}>{RESULT_OUTCOME_LABEL[o]}</option>
                  ))}
                </select>
              </Field>
              <Field
                label="Puntos"
                hint="Solo para «puntuado». Un «no aplica» con puntos la base lo rechaza."
              >
                <input name="points" type="number" step="0.01" min={0} className={inputClass} />
              </Field>
              <Field label="Evidencia registrada" hint="Opcional.">
                <select name="supplier_document_id" className={inputClass} defaultValue="">
                  <option value="">Ninguna</option>
                  {documents.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Observación">
              <textarea name="observation" rows={2} className={inputClass} />
            </Field>
          </ActionForm>
          <ul className="space-y-1 text-xs text-ink-soft">
            {RESULT_OUTCOMES.map((o) => (
              <li key={o}>
                <strong className="text-ink">{RESULT_OUTCOME_LABEL[o]}</strong>
                {" — "}{RESULT_OUTCOME_HINT[o]}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {canManage && abierta ? (
        <Card title="Cerrar la evaluación">
          <ActionForm action={closeEvaluationAction} submitLabel="Cerrar">
            <input type="hidden" name="evaluation_id" value={evaluation.id} />
            {profileId ? <input type="hidden" name="profile_id" value={profileId} /> : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Fecha de la evaluación">
                <input name="evaluated_on" type="date" defaultValue={today} className={inputClass} />
              </Field>
            </div>
            <Field label="Conclusión" hint="Lo que un número no cuenta.">
              <textarea name="summary" rows={3} className={inputClass} />
            </Field>
            <DomainNote>
              Cerrar calcula el resultado y lo deja fijo. No aprueba, no renueva y no
              cambia ninguna decisión anterior.
            </DomainNote>
          </ActionForm>
        </Card>
      ) : null}

      {evaluation.summary ? (
        <Card title="Conclusión">
          <p className="text-sm text-ink">{evaluation.summary}</p>
        </Card>
      ) : null}
    </div>
  );
}
