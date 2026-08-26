"use client";

import { ExportPdfButton } from "@/components/ui/export-pdf-button";
import {
  formatDate, LESSON_ORIGIN_LABEL, LESSON_ORIGINS, LESSON_STATUS_LABEL,
  PROPOSAL_KIND_LABEL, PROPOSAL_KINDS, PROPOSAL_STATUS_LABEL,
} from "@/lib/domain/quality-people";
import type { LessonRow } from "@/lib/db/quality-people";
import {
  addProposalAction, createLessonAction, decideProposalAction, publishLessonAction,
} from "@/server/actions/quality-people";
import { ActionForm, Card, DomainNote, Field, inputClass, Table } from "./shared";

/**
 * Trazaloop Quality · QUALITY-06 · Lecciones aprendidas.
 *
 * PC-21 · Una lección es un objeto de gestión, no una nota al margen. El
 * formulario pide las cuatro cosas por separado —qué ocurrió, qué se aprendió,
 * dónde aplica, qué se recomienda— porque un único campo «descripción» es
 * exactamente donde las lecciones se pierden.
 *
 * §48 · Y una propuesta NO cambia nada. Aceptarla deja escrito que se aceptó;
 * el documento o el proceso se modifican con su propio acto, y aquí queda
 * anotado qué se creó a partir de ella.
 */
export function LessonsView({
  lessons, documents, processes, positions, canManage,
}: {
  lessons: LessonRow[];
  documents: { id: string; title: string }[];
  processes: { id: string; name: string }[];
  positions: { id: string; name: string }[];
  canManage: boolean;
}) {
  return (
    <div className="space-y-6">
      <Card
        title="Lecciones aprendidas"
        description={`${lessons.length} registrada(s)`}
        action={<ExportPdfButton exportKey="quality.lesson.list" label="Descargar PDF" />}
      >
        <Table
          headers={["Lección", "Origen", "Ocurrió", "Propuestas", "Estado", ""]}
          empty="Sin lecciones registradas."
          rows={lessons.map((l) => [
            l.title, LESSON_ORIGIN_LABEL[l.origin],
            l.occurredOn ? formatDate(l.occurredOn) : "—",
            String(l.proposals.length), LESSON_STATUS_LABEL[l.status],
            <ExportPdfButton key="x" exportKey="quality.lesson.detail" id={l.id} label="Descargar PDF" />,
          ])}
        />
      </Card>

      {lessons.map((l) => (
        <Card key={l.id} title={l.title} description={LESSON_STATUS_LABEL[l.status]}>
          <dl className="grid gap-2 text-xs sm:grid-cols-2">
            <div><dt className="font-medium text-ink">Qué ocurrió</dt><dd className="text-ink-soft">{l.whatHappened}</dd></div>
            <div><dt className="font-medium text-ink">Qué se aprendió</dt><dd className="text-ink-soft">{l.whatWasLearned}</dd></div>
            <div><dt className="font-medium text-ink">Dónde aplica</dt><dd className="text-ink-soft">{l.applicableContext ?? "—"}</dd></div>
            <div><dt className="font-medium text-ink">Qué se recomienda</dt><dd className="text-ink-soft">{l.recommendation ?? "—"}</dd></div>
          </dl>

          <Table
            headers={["Propuesta", "Tipo", "Decisión", "Qué se creó", ""]}
            empty="Esta lección todavía no propone ningún cambio."
            rows={l.proposals.map((p) => [
              p.summary, PROPOSAL_KIND_LABEL[p.proposalKind],
              PROPOSAL_STATUS_LABEL[p.status],
              p.outcomeId ? p.outcomeKind ?? "—" : "—",
              canManage && p.status === "proposed" ? (
                <span key="d" className="flex gap-2">
                  <ActionForm
                    action={decideProposalAction} submitLabel="Aceptar"
                    className="flex items-end gap-2"
                  >
                    <input type="hidden" name="proposal_id" value={p.id} />
                    <input type="hidden" name="decision" value="accepted" />
                  </ActionForm>
                  <ActionForm
                    action={decideProposalAction} submitLabel="Descartar"
                    className="flex items-end gap-2"
                  >
                    <input type="hidden" name="proposal_id" value={p.id} />
                    <input type="hidden" name="decision" value="rejected" />
                  </ActionForm>
                </span>
              ) : "",
            ])}
          />
          <DomainNote>
            Aceptar una propuesta no modifica el documento ni crea la formación. Deja
            escrito que se aceptó; el cambio se hace con su propio acto y aquí queda
            anotado qué se creó.
          </DomainNote>

          {canManage ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <ActionForm action={addProposalAction} submitLabel="Añadir propuesta">
                <input type="hidden" name="lesson_id" value={l.id} />
                <Field label="Qué propone">
                  <input name="summary" required className={inputClass} />
                </Field>
                <Field label="Tipo">
                  <select name="proposal_kind" className={inputClass} defaultValue="document_change">
                    {PROPOSAL_KINDS.map((k) => (
                      <option key={k} value={k}>{PROPOSAL_KIND_LABEL[k]}</option>
                    ))}
                  </select>
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Documento">
                    <select name="target_document_id" className={inputClass} defaultValue="">
                      <option value="">Ninguno</option>
                      {documents.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
                    </select>
                  </Field>
                  <Field label="Cargo">
                    <select name="target_position_id" className={inputClass} defaultValue="">
                      <option value="">Ninguno</option>
                      {positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </Field>
                </div>
              </ActionForm>

              {l.status === "draft" ? (
                <ActionForm action={publishLessonAction} submitLabel="Publicar lección">
                  <input type="hidden" name="lesson_id" value={l.id} />
                </ActionForm>
              ) : null}
            </div>
          ) : null}
        </Card>
      ))}

      {canManage ? (
        <Card
          title="Registrar una lección"
          description="Las cuatro preguntas, por separado."
        >
          <ActionForm action={createLessonAction} submitLabel="Registrar lección">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Título">
                <input name="title" required className={inputClass} />
              </Field>
              <Field label="Origen">
                <select name="origin_kind" className={inputClass} defaultValue="case">
                  {LESSON_ORIGINS.map((o) => (
                    <option key={o} value={o}>{LESSON_ORIGIN_LABEL[o]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Ocurrió el">
                <input name="occurred_on" type="date" className={inputClass} />
              </Field>
            </div>
            <Field label="Qué ocurrió">
              <textarea name="what_happened" rows={2} required className={inputClass} />
            </Field>
            <Field label="Qué se aprendió">
              <textarea name="what_was_learned" rows={2} required className={inputClass} />
            </Field>
            <Field label="Dónde aplica">
              <textarea name="applicable_context" rows={2} className={inputClass} />
            </Field>
            <Field label="Qué se recomienda cambiar">
              <textarea name="recommendation" rows={2} className={inputClass} />
            </Field>
            <Field label="Proceso relacionado">
              <select name="process_id" className={inputClass} defaultValue="">
                <option value="">Ninguno</option>
                {processes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
          </ActionForm>
        </Card>
      ) : null}
    </div>
  );
}
