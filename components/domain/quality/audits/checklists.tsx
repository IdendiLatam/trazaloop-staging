"use client";

import { ExportPdfButton } from "@/components/ui/export-pdf-button";
import {
  ActionForm, AuditSubnav, Card, DomainNote, Field, inputClass, Pill, Table,
} from "@/components/domain/quality/audits/shared";
import type { ChecklistRow } from "@/lib/db/quality-audits";
import {
  CHECK_IS_NOT_A_FINDING, CHECKLIST_IS_OPTIONAL,
  CHECKLIST_VERSION_STATUS_LABEL, CRITERION_IS_NOT_A_QUESTION, formatDate,
} from "@/lib/domain/quality-audits";
import {
  addChecklistItemAction, createChecklistAction, createChecklistVersionAction,
  publishChecklistVersionAction, removeChecklistItemAction,
} from "@/server/actions/quality-audits";

/**
 * Trazaloop Quality · QUALITY-09 · Checklists (AR-06).
 *
 * Un checklist es una ayuda con versiones. La versión publicada no se edita
 * nunca: se crea la siguiente. Es lo único que permite volver a una auditoría
 * de hace dos años y leer exactamente las preguntas que se contestaron.
 */
export function ChecklistsScreen({
  checklists, canManage,
}: { checklists: ChecklistRow[]; canManage: boolean }) {
  return (
    <div className="space-y-6">
      <AuditSubnav current="checklists" />

      <DomainNote>{CHECKLIST_IS_OPTIONAL}</DomainNote>
      <DomainNote>{CRITERION_IS_NOT_A_QUESTION}</DomainNote>
      <DomainNote>{CHECK_IS_NOT_A_FINDING}</DomainNote>

      {checklists.map((c) => (
        <ChecklistCard key={c.id} checklist={c} canManage={canManage} />
      ))}

      {checklists.length === 0
        ? <p className="text-xs text-ink-soft">Todavía no hay checklists.</p>
        : null}

      {canManage ? (
        <Card title="Crear checklist" description="Nace con su primera versión en borrador.">
          <ActionForm action={createChecklistAction} submitLabel="Crear checklist">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nombre">
                <input name="name" required className={inputClass}
                  placeholder="Checklist de auditoría de proceso" />
              </Field>
              <Field label="Código (opcional)">
                <input name="code" className={inputClass} />
              </Field>
            </div>
            <Field label="Descripción">
              <textarea name="description" rows={2} className={inputClass} />
            </Field>
          </ActionForm>
        </Card>
      ) : null}
    </div>
  );
}

function ChecklistCard({ checklist, canManage }: {
  checklist: ChecklistRow; canManage: boolean;
}) {
  const draft = checklist.versions.find((v) => v.status === "draft") ?? null;
  const published = checklist.versions.filter((v) => v.status === "published");

  return (
    <Card
      title={checklist.name}
      description={checklist.description ?? undefined}
      action={
        <span className="flex items-center gap-2">
          <Pill tone={checklist.isActive ? "good" : "neutral"}>
            {checklist.isActive ? "Activo" : "Retirado"}
          </Pill>
          <ExportPdfButton
            exportKey="quality.audit-checklist.detail" id={checklist.id}
            label="Descargar PDF"
          />
        </span>
      }
    >
      <Table
        headers={["Versión", "Estado", "Vigente desde", "Hasta", "Preguntas", "Nota"]}
        empty="Sin versiones."
        rows={checklist.versions.map((v) => [
          v.versionNumber,
          CHECKLIST_VERSION_STATUS_LABEL[v.status],
          formatDate(v.effectiveFrom),
          v.effectiveTo ? formatDate(v.effectiveTo) : "—",
          v.items.length,
          v.changeNote ?? "—",
        ])}
      />

      {draft ? (
        <div className="space-y-3 rounded-md border border-hairline bg-canvas px-3 py-2">
          <p className="text-xs font-medium text-ink">
            Versión {draft.versionNumber} · borrador
          </p>
          <Table
            headers={["#", "Pregunta", "Guía", "Clave estable", canManage ? "" : "—"]}
            empty="La versión en borrador no tiene preguntas."
            rows={draft.items.map((i) => [
              i.order,
              i.prompt,
              i.guidance ?? "—",
              <code key="k" className="text-[11px] text-ink-soft">{i.stableKey}</code>,
              canManage
                ? <ActionForm key="d" action={removeChecklistItemAction}
                    submitLabel="Quitar" className="inline">
                    <input type="hidden" name="item_id" value={i.id} />
                    <input type="hidden" name="checklist_id" value={checklist.id} />
                  </ActionForm>
                : "",
            ])}
          />
          {canManage ? (
            <>
              <ActionForm action={addChecklistItemAction} submitLabel="Añadir pregunta">
                <input type="hidden" name="version_id" value={draft.id} />
                <input type="hidden" name="checklist_id" value={checklist.id} />
                <Field label="Pregunta">
                  <input name="prompt" required className={inputClass} />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    label="Clave estable"
                    hint="Se deduce de la pregunta si la dejas vacía. Es lo que permite comparar entre versiones."
                  >
                    <input name="stable_key" className={inputClass} />
                  </Field>
                  <Field label="Orden">
                    <input type="number" name="position_order" min={1}
                      defaultValue={draft.items.length + 1} className={inputClass} />
                  </Field>
                </div>
                <Field label="Guía para el auditor">
                  <textarea name="guidance" rows={2} className={inputClass} />
                </Field>
              </ActionForm>

              <ActionForm action={publishChecklistVersionAction} submitLabel="Publicar versión">
                <input type="hidden" name="version_id" value={draft.id} />
                <input type="hidden" name="checklist_id" value={checklist.id} />
                <Field label="Vigente desde">
                  <input type="date" name="effective_from" className={inputClass} />
                </Field>
                <Field label="Qué cambió">
                  <input name="change_note" className={inputClass} />
                </Field>
              </ActionForm>
            </>
          ) : null}
        </div>
      ) : canManage ? (
        <ActionForm action={createChecklistVersionAction} submitLabel="Crear versión nueva">
          <input type="hidden" name="checklist_id" value={checklist.id} />
          <Field
            label="Qué cambia"
            hint={published.length > 0
              ? "La versión nueva arranca con las preguntas de la última publicada."
              : undefined}
          >
            <input name="change_note" className={inputClass} />
          </Field>
        </ActionForm>
      ) : null}
    </Card>
  );
}
