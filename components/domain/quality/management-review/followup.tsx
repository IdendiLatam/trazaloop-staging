"use client";

import { ExportPdfButton } from "@/components/ui/export-pdf-button";
import {
  Card, Counter, DomainNote, Pill, ReviewSubnav, Table,
} from "@/components/domain/quality/management-review/shared";
import type { DecisionRow, ReviewRow } from "@/lib/db/quality-management-review";
import {
  DECISION_KIND_LABEL, DECISION_IS_NOT_AN_ACTION, describeDecisionOutcome,
  formatDate, MINUTES_ARE_FROZEN_FOLLOWUP_IS_LIVE, REVIEW_STATUS_LABEL,
} from "@/lib/domain/quality-management-review";

/**
 * Trazaloop Quality · QUALITY-10 · §45/§84 · El seguimiento transversal.
 *
 * Lo que esta pantalla existe para responder: «de todo lo que la dirección
 * decidió, ¿qué sigue abierto hoy?». Se lee del motor de acciones, en vivo, y
 * ninguna de estas cifras toca el acta de la revisión que las originó.
 */
export function FollowUpScreen({
  reviews, decisions,
}: {
  reviews: ReviewRow[];
  decisions: (DecisionRow & { reviewId: string; reviewCode: string; reviewPeriod: string })[];
}) {
  const acciones = reviews.reduce((s, r) => s + r.actionCount, 0);
  const abiertas = reviews.reduce((s, r) => s + r.openActionCount, 0);
  const vencidas = reviews.reduce((s, r) => s + r.overdueActionCount, 0);
  const eficaces = reviews.reduce((s, r) => s + r.effectiveActionCount, 0);

  return (
    <div className="space-y-6">
      <ReviewSubnav current="followup" />

      <DomainNote>{MINUTES_ARE_FROZEN_FOLLOWUP_IS_LIVE}</DomainNote>

      <div className="grid gap-3 sm:grid-cols-4">
        <Counter label="Acciones decididas" value={acciones} />
        <Counter label="Abiertas" value={abiertas} tone={abiertas > 0 ? "warn" : undefined} />
        <Counter label="Vencidas" value={vencidas} tone={vencidas > 0 ? "bad" : undefined} />
        <Counter label="Eficaces" value={eficaces} tone={eficaces > 0 ? "good" : undefined} />
      </div>

      <Card
        title="Por revisión"
        description="Una revisión cerrada con acciones abiertas es una situación normal."
        action={<ExportPdfButton
          exportKey="quality.management-review-followup.list" label="Descargar PDF" />}
      >
        <Table
          headers={["Código", "Revisión", "Periodo", "Estado", "Decisiones",
                    "Acciones", "Abiertas", "Vencidas", "Eficaces"]}
          empty="Todavía no hay revisiones con seguimiento."
          rows={reviews.map((r) => [
            <a key="c" className="underline" href={`/quality/management-review/${r.id}`}>
              {r.code}
            </a>,
            r.title, r.periodLabel,
            <Pill key="s" tone={r.status === "closed" ? "good" : "neutral"}>
              {REVIEW_STATUS_LABEL[r.status]}
            </Pill>,
            r.decisionCount, r.actionCount, r.openActionCount,
            r.overdueActionCount, r.effectiveActionCount,
          ])}
        />
      </Card>

      <Card title="Decisión por decisión">
        <DomainNote>{DECISION_IS_NOT_AN_ACTION}</DomainNote>
        <Table
          headers={["Revisión", "Periodo", "Código", "Tema", "Tipo", "Decidida", "Acciones"]}
          empty="Todavía no hay decisiones registradas."
          rows={decisions.map((d) => [
            <a key="r" className="underline" href={`/quality/management-review/${d.reviewId}`}>
              {d.reviewCode}
            </a>,
            d.reviewPeriod, d.code, d.topic,
            DECISION_KIND_LABEL[d.decisionKind],
            formatDate(d.decidedOn),
            <span key="a">
              {describeDecisionOutcome(d)}
              {d.actions.length > 0
                ? <span className="block text-ink-soft">
                    {d.actions.map((a) => `${a.code} (${a.status})`).join(", ")}
                  </span>
                : null}
            </span>,
          ])}
        />
      </Card>
    </div>
  );
}
