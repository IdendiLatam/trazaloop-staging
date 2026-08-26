"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ErrorAlert, InfoAlert, SuccessAlert } from "@/components/ui/alert";
import { LifecycleBadge } from "@/components/domain/quality/lifecycle-badge";
import { SectionEditor } from "@/components/domain/trazadocs/section-editor";
import {
  DECISION_TYPE_LABEL,
  LIFECYCLE_HELP,
  PARTICIPANT_DECISION_LABEL,
  ROUTE_MODE_LABEL,
  WORKFLOW_STATE_LABEL,
  effectivityCaption,
  formatDate,
  reviewAttention,
  type DecisionType,
  type LifecycleState,
  type ParticipantDecision,
  type ParticipantRole,
  type RouteMode,
  type WorkflowState,
} from "@/lib/domain/document-control";
import {
  QUALITY_DOCUMENT_CATEGORIES,
  qualityDocumentCategoryLabel,
} from "@/lib/domain/quality-documents";
import {
  updateQualityDocumentMetadataAction,
  updateQualityDocumentSectionAction,
  addQualityDocumentSectionAction,
  deleteQualityDocumentSectionAction,
  moveQualityDocumentSectionAction,
  submitQualityDocumentAction,
  decideQualityDocumentAction,
  createQualityDocumentRevisionAction,
  updateQualityRevisionScheduleAction,
  retireQualityDocumentAction,
  deleteQualityDocumentAction,
  type QualityDocumentActionState,
} from "@/server/actions/quality-documents";
import { ExportPdfButton } from "@/components/ui/export-pdf-button";

/**
 * Trazaloop Quality · QUALITY-02 · Ficha de un documento controlado.
 *
 * La pantalla está ordenada como transcurre el trabajo real, no como está
 * organizada la base de datos: primero lo que hay que HACER ahora (tu decisión
 * pendiente, o el motivo por el que te lo devolvieron), después el contenido,
 * después el envío, y al final el historial —que se consulta, no se opera—.
 *
 * Ningún identificador técnico aparece en pantalla. Un responsable de calidad
 * no necesita ver un UUID para entender el estado de su documento.
 */

const initial: QualityDocumentActionState = { error: null };
const inputClass =
  "block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-soft/60 focus:border-loop";
const cardClass = "space-y-3 rounded-lg border border-hairline bg-surface p-4";

/**
 * Una sección tal como la espera el editor del motor TrazaDocs
 * (`DocumentSectionRow`). Se declara con la misma forma A PROPÓSITO: el editor
 * por secciones no se reescribe aquí, se reutiliza — es el mismo campo, con el
 * mismo nombre (`section:<id>`) que la server action lee.
 */
export type ControlSection = {
  id: string;
  blueprintSectionId: string | null;
  sectionKey: string;
  title: string;
  content: string;
  sortOrder: number;
  isRequired: boolean;
};

export type ControlParticipant = {
  id: string;
  participantRole: ParticipantRole;
  stepOrder: number;
  round: number;
  profileName: string;
  positionName: string | null;
  decision: ParticipantDecision;
  decidedAt: string | null;
  decisionComment: string | null;
};

export type ControlRevision = {
  id: string;
  revisionNumber: number;
  revisionLabel: string;
  workflowState: string;
  round: number;
  changeNote: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  reviewDueAt: string | null;
  approvedAt: string | null;
  approvedByName: string | null;
  createdAt: string;
};

export type ControlDecision = {
  id: string;
  revisionNumber: number | null;
  round: number;
  decisionType: string;
  reason: string | null;
  decidedByName: string | null;
  decidedAt: string;
};

export type ResponsibleOption = {
  /** `position:<id>` o `profile:<id>`. */
  value: string;
  label: string;
  group: "Cargos" | "Personas";
};

export type DocumentControlViewModel = {
  documentId: string;
  code: string | null;
  title: string;
  description: string | null;
  categoryCode: string;
  lifecycle: LifecycleState;
  revisionText: string;
  revisionModel: string;
  ownerName: string | null;
  ownerPositionId: string | null;
  ownerPositionName: string | null;
  createdByName: string | null;
  createdAt: string;
  retirementReason: string | null;
  approvedAt: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  reviewDueAt: string | null;
  routeMode: RouteMode;
  currentRound: number;
  sections: ControlSection[];
  participants: ControlParticipant[];
  revisions: ControlRevision[];
  decisions: ControlDecision[];
  processes: { processId: string; processName: string; relationType: string }[];
  positions: { id: string; name: string; holderName: string | null }[];
  responsibleOptions: ResponsibleOption[];
  /** Permisos ya resueltos EN SERVIDOR. Aquí solo deciden qué se dibuja. */
  canEdit: boolean;
  canSubmit: boolean;
  canDecide: boolean;
  myPendingRole: ParticipantRole | null;
  canCreateNextRevision: boolean;
  canRetire: boolean;
  canDelete: boolean;
  deleteBlockedReason: string | null;
  lastRejection: { reason: string | null; byName: string | null; at: string } | null;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium">{label}</span>
      {children}
    </label>
  );
}

function DataPoint({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-soft">{label}</dt>
      <dd className="text-sm text-ink">{value}</dd>
    </div>
  );
}

/** Selector de UN responsable: cargo preferido, persona como alternativa. */
function ResponsibleSlot({
  name,
  label,
  options,
  hint,
}: {
  name: string;
  label: string;
  options: ResponsibleOption[];
  hint?: string;
}) {
  const positions = options.filter((o) => o.group === "Cargos");
  const people = options.filter((o) => o.group === "Personas");
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium">{label}</span>
      <select name={name} defaultValue="" className={inputClass}>
        <option value="">— sin asignar —</option>
        {positions.length > 0 ? (
          <optgroup label="Cargos">
            {positions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </optgroup>
        ) : null}
        <optgroup label="Personas">
          {people.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </optgroup>
      </select>
      {hint ? <span className="mt-1 block text-[11px] text-ink-soft">{hint}</span> : null}
    </label>
  );
}

export function QualityDocumentControlDetail({ model }: { model: DocumentControlViewModel }) {
  const [metaState, metaAction, metaPending] = useActionState(
    updateQualityDocumentMetadataAction, initial
  );
  const [sectionState, sectionAction, sectionPending] = useActionState(
    updateQualityDocumentSectionAction, initial
  );
  const [addState, addAction, addPending] = useActionState(
    addQualityDocumentSectionAction, initial
  );
  const [submitState, submitAction, submitPending] = useActionState(
    submitQualityDocumentAction, initial
  );
  const [decideState, decideAction, decidePending] = useActionState(
    decideQualityDocumentAction, initial
  );
  const [revisionState, revisionAction, revisionPending] = useActionState(
    createQualityDocumentRevisionAction, initial
  );
  const [scheduleState, scheduleAction, schedulePending] = useActionState(
    updateQualityRevisionScheduleAction, initial
  );
  const [retireState, retireAction, retirePending] = useActionState(
    retireQualityDocumentAction, initial
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteQualityDocumentAction, initial
  );

  const attention = reviewAttention({
    reviewDueAt: model.reviewDueAt,
    lifecycle: model.lifecycle,
  });
  const currentParticipants = model.participants.filter((p) => p.round === model.currentRound);
  const ordered = [...model.sections].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="max-w-3xl space-y-5">
      <header className="space-y-2">
        <Link href="/quality/documents" className="text-xs text-loop hover:underline">
          ← Volver a Documentos de Quality
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{model.title}</h1>
          <LifecycleBadge state={model.lifecycle} />
        </div>
        {model.code ? <p className="code text-xs text-ink-soft">{model.code}</p> : null}
        {model.description ? <p className="text-sm text-ink-soft">{model.description}</p> : null}
        <p className="text-xs text-ink-soft">
          {model.revisionText} ·{" "}
          {effectivityCaption({
            lifecycle: model.lifecycle,
            approvedAt: model.approvedAt,
            effectiveFrom: model.effectiveFrom,
            effectiveTo: model.effectiveTo,
          })}
        </p>
        <p className="text-xs text-ink-soft">{LIFECYCLE_HELP[model.lifecycle]}</p>
        <div className="flex flex-wrap gap-2 pt-1">
          {/* EXPORT-01 · Mismo PDF, puerta única (§27). */}
          <ExportPdfButton exportKey="quality.document.detail" id={model.documentId} />
          <Link
            href="/quality/documents/master"
            className="inline-flex w-auto items-center justify-center rounded-md border border-hairline bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:border-loop"
          >
            Ver en la Lista Maestra
          </Link>
        </div>
      </header>

      {attention.message ? <InfoAlert message={attention.message} /> : null}
      {model.retirementReason ? (
        <InfoAlert message={`Documento retirado. Motivo: ${model.retirementReason}`} />
      ) : null}

      {/* Lo primero: lo que hay que hacer AHORA. */}
      {model.canDecide ? (
        <section className="rounded-lg border border-amber/40 bg-amber/5 p-4">
          <form action={decideAction} className="space-y-3">
            <h2 className="text-sm font-semibold">
              Te toca {model.myPendingRole === "approver" ? "aprobar" : "revisar"} este documento
            </h2>
            <p className="text-xs text-ink-soft">
              Lee el contenido más abajo. Si algo debe corregirse, devuélvelo explicando qué: el
              autor solo puede corregir lo que sepa que está mal.
            </p>
            <ErrorAlert message={decideState.error} />
            {decideState.success ? <SuccessAlert message={decideState.message ?? "Listo."} /> : null}
            <input type="hidden" name="document_id" value={model.documentId} />
            <Field label="Motivo (obligatorio solo si devuelves el documento)">
              <textarea
                name="reason"
                rows={3}
                className={inputClass}
                placeholder="Qué debe corregirse y por qué."
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                name="decision"
                value="approved"
                disabled={decidePending}
                className="inline-flex w-auto items-center justify-center rounded-md bg-loop px-4 py-2 text-sm font-semibold text-white hover:bg-loop-deep disabled:opacity-60"
              >
                {model.myPendingRole === "approver" ? "Aprobar documento" : "Aceptar la revisión"}
              </button>
              <button
                type="submit"
                name="decision"
                value="changes_requested"
                disabled={decidePending}
                className="inline-flex w-auto items-center justify-center rounded-md border border-danger/40 bg-surface px-4 py-2 text-sm font-semibold text-danger hover:bg-danger/5 disabled:opacity-60"
              >
                Devolver con observaciones
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {model.lastRejection && model.lifecycle === "changes_requested" ? (
        <section className="space-y-1 rounded-lg border border-danger/30 bg-danger/5 p-4">
          <h2 className="text-sm font-semibold text-danger">Te devolvieron este documento</h2>
          <p className="text-sm text-ink">{model.lastRejection.reason ?? "Sin motivo registrado."}</p>
          <p className="text-xs text-ink-soft">
            {model.lastRejection.byName ?? "Alguien"} · {formatDate(model.lastRejection.at)}
          </p>
          <p className="text-xs text-ink-soft">
            Corrige el contenido y vuelve a enviarlo. La revisión sigue siendo la misma: devolver un
            documento no lo convierte en otra revisión.
          </p>
        </section>
      ) : null}

      {/* Identidad */}
      <section className={cardClass}>
        <h2 className="text-sm font-semibold">Identidad del documento</h2>
        {model.canEdit ? (
          <form action={metaAction} className="space-y-3">
            <input type="hidden" name="document_id" value={model.documentId} />
            <ErrorAlert message={metaState.error} />
            {metaState.success ? <SuccessAlert message={metaState.message ?? "Guardado."} /> : null}
            <Field label="Título">
              <input name="title" required defaultValue={model.title} maxLength={200} className={inputClass} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Código">
                <input name="code" defaultValue={model.code ?? ""} maxLength={40} className={inputClass} />
              </Field>
              <Field label="Tipo de documento">
                <select name="category_code" defaultValue={model.categoryCode} className={inputClass}>
                  {QUALITY_DOCUMENT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{qualityDocumentCategoryLabel(c)}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Descripción">
              <input name="description" defaultValue={model.description ?? ""} className={inputClass} />
            </Field>
            <Field label="Cargo propietario">
              <select
                name="owner_position_id"
                defaultValue={model.ownerPositionId ?? ""}
                className={inputClass}
              >
                <option value="">— sin cargo asignado —</option>
                {model.positions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}{p.holderName ? ` · ${p.holderName}` : " · sin titular"}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-[11px] text-ink-soft">
                El dueño de un documento es un cargo, no una persona: cuando alguien cambia de
                puesto, el documento conserva su responsable.
              </span>
            </Field>
            <Button type="submit" disabled={metaPending} className="w-auto px-3 py-1.5 text-xs">
              {metaPending ? "Guardando…" : "Guardar datos"}
            </Button>
          </form>
        ) : (
          <dl className="grid gap-3 sm:grid-cols-3">
            <DataPoint label="Tipo" value={qualityDocumentCategoryLabel(model.categoryCode)} />
            <DataPoint
              label="Propietario"
              value={model.ownerPositionName ?? model.ownerName ?? "Sin asignar"}
            />
            <DataPoint label="Creado por" value={model.createdByName ?? "—"} />
          </dl>
        )}
      </section>

      {/* Programación de vigencia */}
      {model.canEdit ? (
        <section className={cardClass}>
          <h2 className="text-sm font-semibold">Vigencia y revisión periódica</h2>
          <p className="text-xs text-ink-soft">
            Aprobar y entrar en vigencia son cosas distintas. Si el documento debe empezar a regir
            más adelante, indícalo aquí: hasta esa fecha se leerá como «aprobado, pendiente de
            vigencia».
          </p>
          <form action={scheduleAction} className="space-y-3">
            <input type="hidden" name="document_id" value={model.documentId} />
            <ErrorAlert message={scheduleState.error} />
            {scheduleState.success ? (
              <SuccessAlert message={scheduleState.message ?? "Guardado."} />
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Vigente desde">
                <input
                  type="date" name="effective_from"
                  defaultValue={model.effectiveFrom ?? ""} className={inputClass}
                />
              </Field>
              <Field label="Próxima revisión programada">
                <input
                  type="date" name="review_due_at"
                  defaultValue={model.reviewDueAt ?? ""} className={inputClass}
                />
              </Field>
            </div>
            <Button type="submit" disabled={schedulePending} className="w-auto px-3 py-1.5 text-xs">
              {schedulePending ? "Guardando…" : "Guardar programación"}
            </Button>
          </form>
        </section>
      ) : null}

      {/* Contenido por secciones */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Contenido</h2>
        <form action={sectionAction} className="space-y-3">
          <input type="hidden" name="document_id" value={model.documentId} />
          <ErrorAlert message={sectionState.error} />
          {sectionState.success ? (
            <SuccessAlert message={sectionState.message ?? "Contenido guardado."} />
          ) : null}
          {/* Quality no tiene pistas comerciales, así que el hint va en null. */}
          {ordered.map((s) => (
            <SectionEditor key={s.id} section={s} hint={null} readOnly={!model.canEdit} />
          ))}
          {model.canEdit ? (
            <Button type="submit" disabled={sectionPending} className="w-auto px-4 py-2 text-sm">
              {sectionPending ? "Guardando…" : "Guardar contenido"}
            </Button>
          ) : null}
        </form>
      </section>

      {/*
        Estructura del documento. Vive APARTE del formulario de contenido, y no
        por gusto: HTML no admite formularios anidados, así que unos botones de
        «subir / bajar / eliminar» dibujados dentro del formulario grande
        acabarían enviando todos los campos de todas las secciones a la vez y
        leyendo la dirección equivocada. Separarlo además ordena la pantalla:
        arriba se escribe, aquí se organiza.
      */}
      {model.canEdit ? (
        <section className={cardClass}>
          <h2 className="text-sm font-semibold">Estructura del documento</h2>
          <p className="text-xs text-ink-soft">
            El orden de las secciones es el orden en que aparecen en el documento y en su PDF.
          </p>
          <ul className="divide-y divide-hairline">
            {ordered.map((s, index) => (
              <SectionStructureRow
                key={s.id}
                documentId={model.documentId}
                section={s}
                isFirst={index === 0}
                isLast={index === ordered.length - 1}
                canDelete={ordered.length > 1}
              />
            ))}
          </ul>

          <form action={addAction} className="space-y-3 border-t border-hairline pt-3">
            <h3 className="text-sm font-semibold">Agregar sección</h3>
            <input type="hidden" name="document_id" value={model.documentId} />
            <ErrorAlert message={addState.error} />
            {addState.success ? <SuccessAlert message={addState.message ?? "Agregada."} /> : null}
            <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
              <Field label="Título de la sección">
                <input
                  name="section_title" required maxLength={120} className={inputClass}
                  placeholder="p. ej. Criterios de aceptación"
                />
              </Field>
              <label className="flex items-center gap-2 pb-2 text-xs">
                <input type="checkbox" name="section_required" />
                Obligatoria
              </label>
              <Button type="submit" disabled={addPending} className="mb-1 w-auto px-3 py-1.5 text-xs">
                {addPending ? "Agregando…" : "Agregar sección"}
              </Button>
            </div>
          </form>
        </section>
      ) : null}

      {/* Enviar a revisión */}
      {model.canSubmit ? (
        <section className={cardClass}>
          <form action={submitAction} className="space-y-3">
            <h2 className="text-sm font-semibold">Enviar a revisión y aprobación</h2>
            <p className="text-xs text-ink-soft">
              Indica a quién se envía. Un documento sin aprobador no es un documento controlado,
              así que al menos uno es obligatorio; los revisores son opcionales. Puedes designar un
              cargo —lo habitual— o una persona concreta.
            </p>
            <ErrorAlert message={submitState.error} />
            {submitState.success ? <SuccessAlert message={submitState.message ?? "Enviado."} /> : null}
            <input type="hidden" name="document_id" value={model.documentId} />
            <div className="grid gap-3 sm:grid-cols-3">
              {[1, 2, 3].map((n) => (
                <ResponsibleSlot
                  key={`reviewer-${n}`}
                  name="reviewer"
                  label={`Revisor ${n}`}
                  options={model.responsibleOptions}
                  hint={n === 1 ? "Opcional" : undefined}
                />
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {[1, 2, 3].map((n) => (
                <ResponsibleSlot
                  key={`approver-${n}`}
                  name="approver"
                  label={`Aprobador ${n}`}
                  options={model.responsibleOptions}
                  hint={n === 1 ? "Obligatorio" : undefined}
                />
              ))}
            </div>
            <fieldset className="space-y-1">
              <legend className="mb-1 text-xs font-medium">¿En qué orden deciden?</legend>
              {(["sequential", "parallel"] as RouteMode[]).map((mode) => (
                <label key={mode} className="flex items-center gap-2 text-xs">
                  <input
                    type="radio" name="route_mode" value={mode}
                    defaultChecked={mode === "sequential"}
                  />
                  {ROUTE_MODE_LABEL[mode]}
                  <span className="text-ink-soft">
                    {mode === "sequential"
                      ? "— cada uno recibe su tarea cuando el anterior decide"
                      : "— todos reciben su tarea a la vez"}
                  </span>
                </label>
              ))}
            </fieldset>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Vigente desde (opcional)">
                <input
                  type="date" name="effective_from"
                  defaultValue={model.effectiveFrom ?? ""} className={inputClass}
                />
              </Field>
              <Field label="Próxima revisión (opcional)">
                <input
                  type="date" name="review_due_at"
                  defaultValue={model.reviewDueAt ?? ""} className={inputClass}
                />
              </Field>
            </div>
            <Field label="Nota para quien revisa (opcional)">
              <textarea name="note" rows={2} className={inputClass} />
            </Field>
            <Button type="submit" disabled={submitPending} className="w-auto px-4 py-2 text-sm">
              {submitPending
                ? "Enviando…"
                : model.lifecycle === "changes_requested"
                  ? "Corregido: volver a enviar"
                  : "Enviar a revisión"}
            </Button>
          </form>
        </section>
      ) : null}

      {/* Responsables de la revisión en curso */}
      {currentParticipants.length > 0 ? (
        <section className={cardClass}>
          <h2 className="text-sm font-semibold">Responsables de esta revisión</h2>
          <p className="text-xs text-ink-soft">
            Ronda {model.currentRound} · {ROUTE_MODE_LABEL[model.routeMode]}
          </p>
          <ul className="space-y-2">
            {currentParticipants.map((p) => (
              <li key={p.id} className="flex flex-wrap items-baseline gap-2 text-sm">
                <span className="font-medium">
                  {p.participantRole === "reviewer" ? "Revisor" : "Aprobador"} {p.stepOrder}
                </span>
                <span>{p.positionName ? `${p.positionName} · ${p.profileName}` : p.profileName}</span>
                <span
                  className={
                    p.decision === "approved"
                      ? "text-xs text-loop-deep"
                      : p.decision === "changes_requested"
                        ? "text-xs text-danger"
                        : "text-xs text-ink-soft"
                  }
                >
                  {PARTICIPANT_DECISION_LABEL[p.decision]}
                  {p.decidedAt ? ` · ${formatDate(p.decidedAt)}` : ""}
                </span>
                {p.decisionComment ? (
                  <span className="w-full text-xs text-ink-soft">«{p.decisionComment}»</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Procesos que lo usan */}
      <section className={cardClass}>
        <h2 className="text-sm font-semibold">Procesos que lo usan</h2>
        {model.processes.length === 0 ? (
          <p className="text-xs text-ink-soft">
            Ningún proceso lo referencia todavía. Puedes asociarlo desde el detalle de un proceso,
            en «Documentos asociados».
          </p>
        ) : (
          <ul className="space-y-1">
            {model.processes.map((p) => (
              <li key={`${p.processId}-${p.relationType}`}>
                <Link
                  href={`/quality/processes/${p.processId}`}
                  className="text-xs font-medium text-loop hover:underline"
                >
                  {p.processName} →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Control de revisión */}
      <section className={cardClass}>
        <h2 className="text-sm font-semibold">Control de revisión</h2>
        <p className="text-xs text-ink-soft">
          Enviar, devolver, corregir, reenviar y aprobar NO cambian la revisión. La revisión solo
          avanza cuando alguien decide emitir una nueva.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-ink-soft">
              <tr>
                <th className="py-1 pr-3 font-medium">Revisión</th>
                <th className="py-1 pr-3 font-medium">Estado</th>
                <th className="py-1 pr-3 font-medium">Aprobada</th>
                <th className="py-1 pr-3 font-medium">Vigente desde</th>
                <th className="py-1 pr-3 font-medium">Vigente hasta</th>
                <th className="py-1 font-medium">Nota</th>
              </tr>
            </thead>
            <tbody>
              {model.revisions.map((r) => (
                <tr key={r.id} className="border-t border-hairline">
                  <td className="py-1.5 pr-3 font-medium">{r.revisionLabel}</td>
                  <td className="py-1.5 pr-3">{WORKFLOW_STATE_LABEL[r.workflowState as WorkflowState] ?? r.workflowState}</td>
                  <td className="py-1.5 pr-3">{r.approvedAt ? formatDate(r.approvedAt) : "—"}</td>
                  <td className="py-1.5 pr-3">{r.effectiveFrom ? formatDate(r.effectiveFrom) : "—"}</td>
                  <td className="py-1.5 pr-3">{r.effectiveTo ? formatDate(r.effectiveTo) : "—"}</td>
                  <td className="py-1.5 text-ink-soft">{r.changeNote ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Historial de decisiones */}
      <section className={cardClass}>
        <h2 className="text-sm font-semibold">Historial de decisiones</h2>
        {model.decisions.length === 0 ? (
          <p className="text-xs text-ink-soft">Todavía no hay decisiones registradas.</p>
        ) : (
          <ol className="space-y-2">
            {model.decisions.map((d) => (
              <li key={d.id} className="border-l-2 border-hairline pl-3 text-sm">
                <p className="font-medium">
                  {DECISION_TYPE_LABEL[d.decisionType as DecisionType] ?? d.decisionType}
                  {d.revisionNumber ? ` · Revisión ${d.revisionNumber}` : ""}
                </p>
                <p className="text-xs text-ink-soft">
                  {d.decidedByName ?? "—"} · {formatDate(d.decidedAt)} · ronda {d.round}
                </p>
                {d.reason ? <p className="mt-0.5 text-xs text-ink">«{d.reason}»</p> : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Acciones de ciclo de vida */}
      <section className="space-y-4 rounded-lg border border-hairline bg-surface p-4">
        <h2 className="text-sm font-semibold">Ciclo de vida del documento</h2>

        {model.canCreateNextRevision ? (
          <form action={revisionAction} className="space-y-2 border-b border-hairline pb-4">
            <p className="text-xs text-ink-soft">
              Crear una revisión nueva conserva el documento y su historial: la revisión vigente
              queda como histórico inmutable y la nueva empieza editable, partiendo de su contenido.
            </p>
            <input type="hidden" name="document_id" value={model.documentId} />
            <ErrorAlert message={revisionState.error} />
            {revisionState.success ? (
              <SuccessAlert message={revisionState.message ?? "Revisión abierta."} />
            ) : null}
            <Field label="Motivo del cambio (opcional)">
              <input name="change_note" className={inputClass} placeholder="p. ej. Actualización anual" />
            </Field>
            <Button type="submit" disabled={revisionPending} className="w-auto px-3 py-1.5 text-xs">
              {revisionPending ? "Abriendo…" : "Crear nueva revisión"}
            </Button>
          </form>
        ) : null}

        {model.canRetire && model.lifecycle !== "retired" ? (
          <form action={retireAction} className="space-y-2 border-b border-hairline pb-4">
            <p className="text-xs text-ink-soft">
              Retirar saca el documento del uso conservando TODO su historial: revisiones,
              aprobaciones, devoluciones y relaciones. Es lo que corresponde a un documento con
              historia formal.
            </p>
            <input type="hidden" name="document_id" value={model.documentId} />
            <ErrorAlert message={retireState.error} />
            {retireState.success ? (
              <SuccessAlert message={retireState.message ?? "Retirado."} />
            ) : null}
            <Field label="Motivo del retiro (obligatorio)">
              <input name="reason" required className={inputClass} placeholder="p. ej. Sustituido por el manual integrado" />
            </Field>
            <Button type="submit" disabled={retirePending} variant="quiet" className="w-auto px-3 py-1.5 text-xs">
              {retirePending ? "Retirando…" : "Retirar documento"}
            </Button>
          </form>
        ) : null}

        <div className="space-y-2">
          {model.canDelete ? (
            <form action={deleteAction} className="space-y-2">
              <p className="text-xs text-ink-soft">
                Este documento sigue en borrador y no ha dejado ningún historial formal, así que
                puede eliminarse por completo. La acción no se puede deshacer.
              </p>
              <input type="hidden" name="document_id" value={model.documentId} />
              <ErrorAlert message={deleteState.error} />
              <Button
                type="submit" disabled={deletePending} variant="quiet"
                className="w-auto border-danger/40 px-3 py-1.5 text-xs text-danger"
              >
                {deletePending ? "Eliminando…" : "Eliminar documento"}
              </Button>
            </form>
          ) : model.deleteBlockedReason ? (
            <p className="text-xs text-ink-soft">
              <span className="font-medium text-ink">Este documento no se elimina. </span>
              {model.deleteBlockedReason}
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

/**
 * Una sección en el panel de estructura: tres formularios hermanos —subir,
 * bajar y eliminar— cada uno con SUS propios campos. Así el servidor recibe
 * exactamente la sección y la dirección que se pulsaron, y nada más.
 */
function SectionStructureRow({
  documentId,
  section,
  isFirst,
  isLast,
  canDelete,
}: {
  documentId: string;
  section: ControlSection;
  isFirst: boolean;
  isLast: boolean;
  canDelete: boolean;
}) {
  const [moveState, moveAction, movePending] = useActionState(
    moveQualityDocumentSectionAction, initial
  );
  const [removeState, removeAction, removePending] = useActionState(
    deleteQualityDocumentSectionAction, initial
  );
  const btn = "rounded-md border border-hairline px-2 py-1 text-xs text-ink-soft hover:border-loop disabled:opacity-40";

  return (
    <li className="flex flex-wrap items-center gap-2 py-2">
      <span className="flex-1 text-sm">{section.title}</span>
      {section.isRequired ? (
        <span className="text-[11px] text-amber">Obligatoria</span>
      ) : null}
      <form action={moveAction} className="inline">
        <input type="hidden" name="document_id" value={documentId} />
        <input type="hidden" name="section_id" value={section.id} />
        <input type="hidden" name="direction" value="up" />
        <button type="submit" disabled={isFirst || movePending} className={btn} aria-label={`Subir ${section.title}`}>
          Subir
        </button>
      </form>
      <form action={moveAction} className="inline">
        <input type="hidden" name="document_id" value={documentId} />
        <input type="hidden" name="section_id" value={section.id} />
        <input type="hidden" name="direction" value="down" />
        <button type="submit" disabled={isLast || movePending} className={btn} aria-label={`Bajar ${section.title}`}>
          Bajar
        </button>
      </form>
      <form action={removeAction} className="inline">
        <input type="hidden" name="document_id" value={documentId} />
        <input type="hidden" name="section_id" value={section.id} />
        <button
          type="submit"
          disabled={!canDelete || removePending}
          className="rounded-md border border-danger/40 px-2 py-1 text-xs text-danger disabled:opacity-40"
          aria-label={`Eliminar ${section.title}`}
        >
          Eliminar sección
        </button>
      </form>
      {moveState.error ? <span role="alert" className="w-full text-xs text-danger">{moveState.error}</span> : null}
      {removeState.error ? <span role="alert" className="w-full text-xs text-danger">{removeState.error}</span> : null}
    </li>
  );
}
