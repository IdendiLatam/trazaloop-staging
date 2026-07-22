// Ruta protegida (guard del módulo en el layout del namespace /textiles).
export const dynamic = "force-dynamic";

// Trazaloop · Sprint T7 (Textil) · Detalle de la evaluación: criterios por
// dimensión, respuestas, puntajes, brechas, recomendaciones internas y
// evidencias vinculadas. El puntaje lo calcula la función controlada en BD.

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTextilesModule } from "@/lib/auth/require-textiles-module";
import {
  getTextileCircularityAssessment,
  listTextileCircularityAnswers,
  listTextileCircularityCriteria,
  getActiveTextileCircularityMethodology,
  listCircularityAssessmentEvidenceLinks,
} from "@/lib/db/textiles-circularity";

import {
  TEXTILE_CIRCULARITY_DIMENSION_LABEL,
  TEXTILE_CIRCULARITY_STATUS_LABEL,
  TEXTILE_READINESS_LEVEL_LABEL,
  TEXTILE_CIRCULARITY_DISCLAIMER,
  type TextileCircularityDimension,
} from "@/lib/domain/textiles-circularity";
import {
  canSetTextileEvidenceStatus,
  TEXTILE_EVIDENCE_STATUS_LABEL,
  TEXTILE_EVIDENCE_LINK_TYPE_LABEL,
} from "@/lib/domain/textiles-evidences";
import { CircularityCriteriaForm } from "@/components/domain/textiles/circularity-criteria-form";

export default async function TextileCircularityAssessmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const org = await requireTextilesModule();
  const assessment = await getTextileCircularityAssessment(org.organizationId, id);
  if (!assessment) notFound();

  const [criteria, answers, methodology, evidenceLinks] = await Promise.all([
    listTextileCircularityCriteria(assessment.methodologyId),
    listTextileCircularityAnswers(org.organizationId, assessment.id),
    getActiveTextileCircularityMethodology(),
    listCircularityAssessmentEvidenceLinks(org.organizationId, assessment.id),
  ]);

  const isDraft = assessment.status === "draft";
  const canFinalize = canSetTextileEvidenceStatus(org.roleCode);
  const dimensionEntries = Object.entries(assessment.dimensionScores ?? {});

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-1">
        <p className="eyebrow">Trazaloop Textiles · Circularidad</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Evaluación {assessment.assessmentCode}
        </h1>
        <p className="text-sm text-ink-soft">
          {[
            assessment.sku ? `Referencia: ${assessment.sku}` : "",
            assessment.productName ?? "",
            assessment.outputLotCode ? `Lote final: ${assessment.outputLotCode}` : "Sin lote final",
            methodology ? `${methodology.methodCode} ${methodology.version}` : "",
            assessment.assessmentDate ?? "",
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <p className="text-xs text-ink-soft">
          Estado:{" "}
          {TEXTILE_CIRCULARITY_STATUS_LABEL[
            assessment.status as keyof typeof TEXTILE_CIRCULARITY_STATUS_LABEL
          ] ?? assessment.status}
          {assessment.completedAt ? ` · completada: ${assessment.completedAt.slice(0, 10)}` : ""}
          {assessment.calculatedAt ? ` · calculada: ${assessment.calculatedAt.slice(0, 10)}` : ""}
        </p>
        <p className="max-w-2xl text-xs text-ink-soft">{TEXTILE_CIRCULARITY_DISCLAIMER}</p>
        <div className="flex gap-3">
          <Link href="/textiles/circularity/assessments" className="text-sm font-medium text-loop hover:underline">
            ← Evaluaciones
          </Link>
          <Link href={`/textiles/references/${assessment.referenceId}`} className="text-sm text-loop hover:underline">
            Ver referencia →
          </Link>
        </div>
      </header>

      <section className="rounded-lg border border-hairline bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-soft">Puntaje de circularidad técnica</p>
            <p className="text-3xl font-semibold text-loop-deep">
              {assessment.circularityScore !== null ? `${assessment.circularityScore} / 100` : "Sin calcular"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-ink-soft">Nivel de preparación</p>
            <p className="text-lg font-semibold">
              {assessment.readinessLevel
                ? TEXTILE_READINESS_LEVEL_LABEL[
                    assessment.readinessLevel as keyof typeof TEXTILE_READINESS_LEVEL_LABEL
                  ] ?? assessment.readinessLevel
                : "—"}
            </p>
          </div>
        </div>
        {dimensionEntries.length > 0 ? (
          <ul className="mt-3 grid gap-1 text-xs text-ink-soft sm:grid-cols-2">
            {dimensionEntries.map(([key, d]) => (
              <li key={key} className="flex justify-between rounded-md border border-hairline bg-paper px-2 py-1">
                <span>
                  {TEXTILE_CIRCULARITY_DIMENSION_LABEL[key as TextileCircularityDimension] ?? key}
                </span>
                <span className="font-medium text-ink">
                  {d.score !== null ? `${d.score} / ${d.weight}` : "N/A"}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {assessment.gaps.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Brechas identificadas ({assessment.gaps.length})</h2>
          <ul className="space-y-1">
            {assessment.gaps.map((g, i) => (
              <li key={`${g.code}-${i}`} className="rounded-lg border border-hairline bg-surface p-2 text-xs text-ink-soft">
                {g.message}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {assessment.recommendations.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Recomendaciones internas</h2>
          <ul className="list-inside list-disc space-y-0.5 text-xs text-ink-soft">
            {assessment.recommendations.map((r, i) => (
              <li key={`${r.code}-${i}`}>{r.text}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Criterios y respuestas</h2>
        <p className="text-xs text-ink-soft">
          Escala: 1 = sí / completo · 0,5 = parcial · 0 = no / sin soporte · N/A cuando el
          criterio lo admite. Los criterios sin responder cuentan como 0 al calcular.
        </p>
        <CircularityCriteriaForm
          assessmentId={assessment.id}
          isDraft={isDraft}
          canFinalize={canFinalize}
          criteria={criteria.map((c) => ({
            id: c.id,
            code: c.code,
            dimensionKey: c.dimensionKey,
            dimensionLabel:
              TEXTILE_CIRCULARITY_DIMENSION_LABEL[c.dimensionKey as TextileCircularityDimension] ??
              c.dimensionKey,
            question: c.question,
            helpText: c.helpText,
            responseType: c.responseType,
            allowsNa: c.allowsNa,
          }))}
          answers={answers.map((a) => ({
            criterionId: a.criterionId,
            answerValue: a.answerValue,
            notApplicable: a.notApplicable,
          }))}
        />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Evidencias vinculadas ({evidenceLinks.length})</h2>
        {evidenceLinks.length === 0 ? (
          <p className="text-xs text-ink-soft">Sin evidencias vinculadas a la evaluación.</p>
        ) : (
          <ul className="space-y-1">
            {evidenceLinks.map((l) => (
              <li key={l.id} className="rounded-lg border border-hairline bg-surface p-2 text-xs text-ink-soft">
                <Link href={`/textiles/evidences/${l.evidence.id}`} className="font-medium text-loop hover:underline">
                  {l.evidence.title}
                </Link>{" "}
                · {TEXTILE_EVIDENCE_LINK_TYPE_LABEL[l.linkType as keyof typeof TEXTILE_EVIDENCE_LINK_TYPE_LABEL] ?? l.linkType} ·{" "}
                {TEXTILE_EVIDENCE_STATUS_LABEL[l.evidence.status as keyof typeof TEXTILE_EVIDENCE_STATUS_LABEL] ?? l.evidence.status}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-ink-soft">
          Los soportes (circularidad, reciclabilidad, reparabilidad, cuidado, separación,
          reutilización y fin de vida) se vinculan desde el detalle de cada{" "}
          <Link href="/textiles/evidences" className="text-loop hover:underline">
            evidencia
          </Link>
          , eligiendo la entidad “Evaluación de circularidad”.
        </p>
      </section>

      {assessment.notes ? (
        <section className="space-y-1">
          <h2 className="text-sm font-semibold">Notas</h2>
          <p className="rounded-lg border border-hairline bg-surface p-3 text-sm text-ink-soft">
            {assessment.notes}
          </p>
        </section>
      ) : null}
    </div>
  );
}
