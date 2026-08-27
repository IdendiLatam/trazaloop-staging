"use client";

import { ExportPdfButton } from "@/components/ui/export-pdf-button";
import {
  ActionForm, Card, Counter, DomainNote, Field, inputClass, Pill,
  ReviewSubnav, Table,
} from "@/components/domain/quality/management-review/shared";
import type { ReviewRow } from "@/lib/db/quality-management-review";
import {
  FREQUENCY_IS_CONFIGURABLE, formatDate, REVIEW_IS_NOT_A_DASHBOARD,
  REVIEW_IS_NOT_A_MEETING, REVIEW_KIND_LABEL, REVIEW_KINDS,
  REVIEW_STATUS_LABEL,
} from "@/lib/domain/quality-management-review";
import { createReviewAction } from "@/server/actions/quality-management-review";

export type Option = { id: string; label: string };

/** Trazaloop Quality · QUALITY-10 · El listado de revisiones. */
export function ReviewsScreen({
  reviews, positions, canManage,
}: { reviews: ReviewRow[]; positions: Option[]; canManage: boolean }) {
  const abiertas = reviews.filter((r) =>
    !["closed", "cancelled"].includes(r.status));
  const pendientes = reviews.reduce((s, r) => s + r.inputsPending, 0);
  const vencidas = reviews.reduce((s, r) => s + r.overdueActionCount, 0);

  return (
    <div className="space-y-6">
      <ReviewSubnav current="reviews" />

      <div className="grid gap-3 sm:grid-cols-4">
        <Counter label="Revisiones" value={reviews.length} />
        <Counter label="En curso" value={abiertas.length} />
        <Counter label="Entradas sin mirar" value={pendientes}
          tone={pendientes > 0 ? "warn" : undefined} />
        <Counter label="Acciones vencidas" value={vencidas}
          tone={vencidas > 0 ? "bad" : undefined} />
      </div>

      <DomainNote>{REVIEW_IS_NOT_A_DASHBOARD}</DomainNote>

      <Card
        title="Revisiones por la dirección"
        description="Cada una analiza un periodo concreto y lo sigue diciendo después."
        action={<ExportPdfButton exportKey="quality.management-review.list" label="Descargar PDF" />}
      >
        <Table
          headers={["Código", "Revisión", "Tipo", "Periodo", "Sesión", "Estado",
                    "Entradas", "Decisiones", "Acciones", ""]}
          empty="Todavía no hay ninguna revisión por la dirección."
          rows={reviews.map((r) => [
            <a key="c" className="underline" href={`/quality/management-review/${r.id}`}>
              {r.code}
            </a>,
            <span key="t">
              {r.title}
              {r.reopenCount > 0
                ? <span className="block text-ink-soft">Reabierta ×{r.reopenCount}</span>
                : null}
            </span>,
            REVIEW_KIND_LABEL[r.reviewKind],
            <span key="p">
              {r.periodLabel}
              <span className="block text-ink-soft">
                {formatDate(r.periodStart)} — {formatDate(r.periodEnd)}
              </span>
            </span>,
            formatDate(r.sessionHeldOn),
            <Pill key="s" tone={
              r.status === "closed" ? "good"
                : r.status === "cancelled" ? "bad" : "neutral"
            }>
              {REVIEW_STATUS_LABEL[r.status]}
            </Pill>,
            <span key="i">
              {r.inputsPrepared + r.inputsReviewed + r.inputsMissing + r.inputsNotApplicable}
              {" de "}{r.inputCount}
              {r.inputsPending > 0
                ? <span className="block text-amber-700 dark:text-amber-400">
                    {r.inputsPending} sin mirar
                  </span>
                : null}
            </span>,
            r.decisionCount,
            <span key="a">
              {r.actionCount}
              {r.overdueActionCount > 0
                ? <span className="block text-red-700 dark:text-red-400">
                    {r.overdueActionCount} vencida(s)
                  </span>
                : null}
            </span>,
            <ExportPdfButton
              key="x" exportKey="quality.management-review.detail" id={r.id}
              label="Descargar PDF"
            />,
          ])}
        />
        <DomainNote>{REVIEW_IS_NOT_A_MEETING}</DomainNote>
      </Card>

      {canManage ? (
        <Card
          title="Nueva revisión"
          description="Declara qué periodo analiza: las entradas automáticas lo respetarán."
        >
          <DomainNote>{FREQUENCY_IS_CONFIGURABLE}</DomainNote>
          <ActionForm action={createReviewAction} submitLabel="Crear revisión">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Código">
                <input name="code" required className={inputClass} placeholder="RD-2027-001" />
              </Field>
              <Field label="Título">
                <input name="title" required className={inputClass}
                  placeholder="Revisión por la dirección 2027" />
              </Field>
              <Field label="Tipo" hint="Completa, extraordinaria o temática. Las tres son legítimas.">
                <select name="review_kind" className={inputClass} defaultValue="full">
                  {REVIEW_KINDS.map((k) => (
                    <option key={k} value={k}>{REVIEW_KIND_LABEL[k]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Responsable (cargo)" hint="El cargo responde; la persona que lo ocupa se registra como participante.">
                <select name="owner_position_id" className={inputClass} defaultValue="">
                  <option value="">Sin asignar</option>
                  {positions.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Etiqueta del periodo" hint="Cómo lo llama la gente: «2027», «S1 2027».">
                <input name="period_label" className={inputClass} placeholder="2027" />
              </Field>
              <Field label="—">
                <span className="block py-2 text-xs text-ink-soft">
                  El periodo decide qué mostrarán las entradas.
                </span>
              </Field>
              <Field label="Periodo desde">
                <input type="date" name="period_start" required className={inputClass} />
              </Field>
              <Field label="Periodo hasta">
                <input type="date" name="period_end" required className={inputClass} />
              </Field>
            </div>
            <Field label="Alcance de la revisión" hint="Qué se propone revisar y qué queda fuera.">
              <textarea name="scope_note" rows={2} className={inputClass} />
            </Field>
          </ActionForm>
        </Card>
      ) : null}
    </div>
  );
}
