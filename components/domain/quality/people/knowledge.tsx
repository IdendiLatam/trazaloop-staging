"use client";

import { ExportPdfButton } from "@/components/ui/export-pdf-button";
import {
  CRITICALITIES, CRITICALITY_LABEL, DOCUMENTATION_STATUS_LABEL, DOCUMENTATION_STATUSES,
  formatDate, HOLDER_LEVEL_LABEL, HOLDER_LEVELS, KNOWLEDGE_KIND_LABEL, KNOWLEDGE_KINDS,
  KNOWLEDGE_SIGNAL_LABEL, TRANSFER_METHOD_LABEL, TRANSFER_METHODS, TRANSFER_STATUS_LABEL,
} from "@/lib/domain/quality-people";
import type { ContinuityRow, KnowledgeItemRow, PersonRow } from "@/lib/db/quality-people";
import {
  addHolderAction, addTransferItemAction, completeTransferItemAction, createKnowledgeAction,
  createTransferAction, dismissSignalAction, promoteSignalAction, scanPeopleSignalsAction,
  verifyTransferAction,
} from "@/server/actions/quality-people";
import { ActionForm, Card, DomainNote, Field, inputClass, Table } from "./shared";

/**
 * Trazaloop Quality · QUALITY-06 · Conocimiento y continuidad.
 *
 * PC-19 · La palabra que se usa es HOLDER: la persona sostiene el
 * conocimiento, no es su dueña. El conocimiento pertenece a la empresa, y
 * por eso perder a la persona no borra el elemento.
 *
 * PC-20 + §45 · Cuando un conocimiento crítico depende de una sola persona
 * aparece una SEÑAL. La frase habla del conocimiento. Convertirla en un riesgo
 * formal del sistema de gestión es una decisión humana que se toma aquí, a
 * mano, enlazando un riesgo que alguien ya escribió.
 */
export function KnowledgeView({
  items, continuity, people, risks, canManage, today,
}: {
  items: KnowledgeItemRow[];
  continuity: ContinuityRow[];
  people: PersonRow[];
  risks: { id: string; code: string | null; title: string }[];
  canManage: boolean;
  today: string;
}) {
  const attention = continuity.filter((c) => c.continuityAttention);

  return (
    <div className="space-y-6">
      <Card
        title="Continuidad"
        description={`${attention.length} conocimiento(s) crítico(s) concentrado(s)`}
        action={
          <div className="flex gap-2">
            <ExportPdfButton exportKey="quality.knowledge.list" label="Descargar PDF" />
          </div>
        }
      >
        <Table
          headers={["Conocimiento", "Criticidad", "Documentación", "Personas", "Señal"]}
          empty="Sin conocimiento registrado."
          rows={continuity.map((c) => [
            c.title, CRITICALITY_LABEL[c.criticality],
            DOCUMENTATION_STATUS_LABEL[c.documentationStatus],
            String(c.holderCount),
            c.continuityAttention ? "Concentrado · requiere atención" : "Sin señal",
          ])}
        />
        <DomainNote>
          «Concentrado» significa que algo que la organización necesita depende de una sola
          persona, o de ninguna. Es una observación sobre la organización, nunca sobre
          alguien: aquí no se dice que una persona sea un riesgo.
        </DomainNote>
        {canManage ? (
          <ActionForm action={scanPeopleSignalsAction} submitLabel="Revisar señales ahora" />
        ) : null}
      </Card>

      {items.map((k) => (
        <Card
          key={k.id}
          title={k.title}
          description={`${KNOWLEDGE_KIND_LABEL[k.knowledgeKind]} · criticidad ${CRITICALITY_LABEL[k.criticality].toLowerCase()}`}
          action={
            <ExportPdfButton exportKey="quality.knowledge.detail" id={k.id} label="Descargar PDF" />
          }
        >
          <Table
            headers={["Quién lo sostiene", "Papel", "Desde", "Hasta"]}
            empty="Nadie figura como holder."
            rows={k.holders.map((h) => [
              h.isPrimaryHolder ? `${h.personName} · responde primero` : h.personName,
              HOLDER_LEVEL_LABEL[h.holderLevel],
              h.sinceOn ? formatDate(h.sinceOn) : "—",
              h.untilOn ? formatDate(h.untilOn) : "Vigente",
            ])}
          />

          {k.signals.length > 0 ? (
            <Table
              headers={["Señal", "Estado", "Riesgo formal", ""]}
              empty=""
              rows={k.signals.map((s) => [
                KNOWLEDGE_SIGNAL_LABEL[s.signalKind], s.status,
                s.riskId ? "Sí, alguien decidió abrirlo" : "No",
                canManage && s.status === "open" && !s.riskId ? (
                  <span key="a" className="flex gap-2">
                    <ActionForm
                      action={promoteSignalAction} submitLabel="Enlazar a un riesgo"
                      className="flex items-end gap-2"
                    >
                      <input type="hidden" name="signal_id" value={s.id} />
                      <select name="risk_id" required className={inputClass}>
                        <option value="">Riesgo existente</option>
                        {risks.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.code ? `${r.code} · ` : ""}{r.title}
                          </option>
                        ))}
                      </select>
                    </ActionForm>
                    <ActionForm
                      action={dismissSignalAction} submitLabel="Descartar"
                      className="flex items-end gap-2"
                    >
                      <input type="hidden" name="signal_id" value={s.id} />
                    </ActionForm>
                  </span>
                ) : "",
              ])}
            />
          ) : null}

          {k.transfers.map((t) => (
            <div key={t.id} className="space-y-2 rounded-md border border-hairline p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-xs font-semibold text-ink">
                  {t.title}{" "}
                  <span className="font-normal text-ink-soft">
                    {TRANSFER_METHOD_LABEL[t.method]} · {TRANSFER_STATUS_LABEL[t.status]}
                  </span>
                </h4>
                <ExportPdfButton
                  exportKey="quality.transfer-plan.detail" id={t.id} label="Descargar PDF"
                />
              </div>
              <Table
                headers={["Actividad", "Para", "Fecha", "Estado", ""]}
                empty="Sin actividades."
                rows={t.items.map((i) => [
                  i.activity, i.targetPersonName ?? "—",
                  i.dueOn ? formatDate(i.dueOn) : "—", i.status,
                  canManage && i.status !== "done" ? (
                    <ActionForm
                      key="c" action={completeTransferItemAction} submitLabel="Cerrar"
                      className="flex items-end gap-2"
                    >
                      <input type="hidden" name="item_id" value={i.id} />
                      <input
                        name="evidence_note" placeholder="Qué evidencia queda"
                        required className={inputClass}
                      />
                    </ActionForm>
                  ) : "",
                ])}
              />
              {canManage && t.status !== "completed" ? (
                <div className="grid gap-3 lg:grid-cols-2">
                  <ActionForm action={addTransferItemAction} submitLabel="Añadir actividad">
                    <input type="hidden" name="transfer_plan_id" value={t.id} />
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Field label="Actividad">
                        <input name="activity" required className={inputClass} />
                      </Field>
                      <Field label="Para">
                        <select name="target_person_id" className={inputClass} defaultValue="">
                          <option value="">Sin destinatario</option>
                          {people.map((p) => (
                            <option key={p.id} value={p.id}>{p.fullName}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Fecha">
                        <input name="due_on" type="date" className={inputClass} />
                      </Field>
                    </div>
                  </ActionForm>
                  <ActionForm action={verifyTransferAction} submitLabel="Verificar transferencia">
                    <input type="hidden" name="plan_id" value={t.id} />
                    <Field
                      label="En qué comprobaste que el conocimiento pasó"
                      hint="Ejecutar las actividades no lo demuestra."
                    >
                      <textarea name="verification_note" rows={2} required className={inputClass} />
                    </Field>
                  </ActionForm>
                </div>
              ) : null}
            </div>
          ))}

          {canManage ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <ActionForm action={addHolderAction} submitLabel="Registrar quién lo sostiene">
                <input type="hidden" name="knowledge_item_id" value={k.id} />
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Persona">
                    <select name="person_id" required className={inputClass}>
                      <option value="">Elige</option>
                      {people.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
                    </select>
                  </Field>
                  <Field label="Papel">
                    <select name="holder_level" className={inputClass} defaultValue="holder">
                      {HOLDER_LEVELS.map((h) => (
                        <option key={h} value={h}>{HOLDER_LEVEL_LABEL[h]}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="¿Responde primero?">
                    <input type="checkbox" name="is_primary_holder" className="mt-2" />
                  </Field>
                </div>
                <input type="hidden" name="since_on" value={today} />
              </ActionForm>

              <ActionForm action={createTransferAction} submitLabel="Crear plan de transferencia">
                <input type="hidden" name="knowledge_item_id" value={k.id} />
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Título">
                    <input name="title" required className={inputClass} />
                  </Field>
                  <Field label="Método">
                    <select name="method" className={inputClass} defaultValue="accompaniment">
                      {TRANSFER_METHODS.map((m) => (
                        <option key={m} value={m}>{TRANSFER_METHOD_LABEL[m]}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Fecha objetivo">
                    <input name="target_date" type="date" className={inputClass} />
                  </Field>
                </div>
              </ActionForm>
            </div>
          ) : null}
        </Card>
      ))}

      {canManage ? (
        <Card
          title="Registrar conocimiento"
          description="Explícito, tácito o mixto. Existe aunque no haya documento."
        >
          <ActionForm action={createKnowledgeAction} submitLabel="Registrar">
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Conocimiento">
                <input name="title" required className={inputClass} />
              </Field>
              <Field label="Tipo">
                <select name="knowledge_kind" className={inputClass} defaultValue="tacit">
                  {KNOWLEDGE_KINDS.map((k) => (
                    <option key={k} value={k}>{KNOWLEDGE_KIND_LABEL[k]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Criticidad">
                <select name="criticality" className={inputClass} defaultValue="medium">
                  {CRITICALITIES.map((c) => (
                    <option key={c} value={c}>{CRITICALITY_LABEL[c]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Documentación">
                <select name="documentation_status" className={inputClass} defaultValue="undocumented">
                  {DOCUMENTATION_STATUSES.map((d) => (
                    <option key={d} value={d}>{DOCUMENTATION_STATUS_LABEL[d]}</option>
                  ))}
                </select>
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
