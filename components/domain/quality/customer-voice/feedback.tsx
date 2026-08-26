"use client";

import Link from "next/link";
import { useState } from "react";
import { ExportPdfButton } from "@/components/ui/export-pdf-button";
import {
  COMPLAINT_IS_NOT_AUTOMATIC_CASE, COMPLAINT_IS_NOT_NC, FEEDBACK_IS_NOT_BINARY,
  FEEDBACK_KIND_LABEL, FEEDBACK_KINDS, FEEDBACK_SEVERITIES, FEEDBACK_SEVERITY_LABEL,
  FEEDBACK_STATUS_LABEL, FEEDBACK_STATUSES, formatDate, SATISFACTION_IS_MULTISOURCE,
  VOICE_SOURCE_LABEL, VOICE_SOURCES,
} from "@/lib/domain/quality-customer-voice";
import type {
  CustomerOverviewRow, FeedbackRow, TopicRow,
} from "@/lib/db/quality-customer-voice";
import {
  createTopicAction, openCaseFromFeedbackAction, recordFeedbackAction,
  updateFeedbackStatusAction,
} from "@/server/actions/quality-customer-voice";
import { ActionForm, Card, DomainNote, Field, inputClass, Table } from "./shared";

/**
 * Trazaloop Quality · QUALITY-08 · Retroalimentación y quejas.
 *
 * LA PANTALLA DONDE SE PRODUCE LA CONFUSIÓN MÁS CARA
 *
 * «Queja» y «no conformidad» se usan como sinónimas en la conversación diaria y
 * no lo son en un sistema de gestión. Aquí se registra un HECHO. Convertirlo en
 * una no conformidad es una clasificación que alguien decide después, en un
 * caso, con el flujo de QUALITY-04 intacto.
 *
 * Por eso el botón dice «Crear caso» y no «Abrir no conformidad», y por eso el
 * aviso está pegado al formulario de registro y no escondido en una ayuda.
 */
export function FeedbackView({
  feedback, customers, topics, positions, canManage, today,
}: {
  feedback: FeedbackRow[];
  customers: CustomerOverviewRow[];
  topics: TopicRow[];
  positions: { id: string; name: string }[];
  canManage: boolean;
  today: string;
}) {
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("");

  const visibles = feedback.filter((f) =>
    (kind === "" || f.feedbackKind === kind) && (status === "" || f.status === status));
  const quejas = feedback.filter((f) => f.feedbackKind === "complaint" || f.feedbackKind === "claim");
  const sinRevisar = quejas.filter((f) => f.status === "open");

  return (
    <div className="space-y-6">
      <DomainNote>{SATISFACTION_IS_MULTISOURCE}</DomainNote>

      <Card
        title="Lo que dicen los clientes"
        description={`${visibles.length} de ${feedback.length} · ${quejas.length} quejas, ${sinRevisar.length} sin revisar`}
        action={
          <span className="flex flex-wrap gap-2">
            <ExportPdfButton exportKey="quality.customer-feedback.list" label="Descargar PDF" />
            <ExportPdfButton exportKey="quality.customer-complaint.list" label="Descargar PDF" />
          </span>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tipo">
            <select value={kind} onChange={(e) => setKind(e.target.value)} className={inputClass}>
              <option value="">Todos</option>
              {FEEDBACK_KINDS.map((k) => (
                <option key={k} value={k}>{FEEDBACK_KIND_LABEL[k]}</option>
              ))}
            </select>
          </Field>
          <Field label="Estado">
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
              <option value="">Todos</option>
              {FEEDBACK_STATUSES.map((s) => (
                <option key={s} value={s}>{FEEDBACK_STATUS_LABEL[s]}</option>
              ))}
            </select>
          </Field>
        </div>

        <Table
          headers={["Fecha", "Tipo", "Qué dijo", "Cliente", "Tema", "Gravedad", "Estado", "Caso", ""]}
          empty="Todavía no se ha registrado nada."
          rows={visibles.map((f) => [
            formatDate(f.receivedOn),
            FEEDBACK_KIND_LABEL[f.feedbackKind],
            f.title,
            f.fromAnonymousCampaign
              ? <span key="a" className="text-ink-soft">Campaña anónima</span>
              : (f.customerName ?? f.reporterName ?? "Sin identificar"),
            f.topicName ?? "—",
            FEEDBACK_SEVERITY_LABEL[f.severity],
            FEEDBACK_STATUS_LABEL[f.status],
            f.caseId
              ? <Link key="c" href={`/quality/cases/${f.caseId}`}
                  className="font-medium text-loop hover:underline">{f.caseCode ?? "Ver"}</Link>
              : "Sin caso",
            <span key="x" className="flex flex-wrap gap-2">
              <ExportPdfButton
                exportKey={f.feedbackKind === "complaint" || f.feedbackKind === "claim"
                  ? "quality.customer-complaint.detail"
                  : "quality.customer-feedback.detail"}
                id={f.id} label="Descargar PDF"
              />
              {canManage && !f.caseId ? (
                <ActionForm
                  action={openCaseFromFeedbackAction} submitLabel="Crear caso"
                  className="flex items-end gap-2"
                >
                  <input type="hidden" name="feedback_id" value={f.id} />
                </ActionForm>
              ) : null}
            </span>,
          ])}
        />
        <DomainNote>{COMPLAINT_IS_NOT_NC}</DomainNote>
        <DomainNote>{COMPLAINT_IS_NOT_AUTOMATIC_CASE}</DomainNote>
      </Card>

      {canManage ? (
        <Card
          title="Registrar lo que dijo un cliente"
          description="Sin encuesta de por medio: una llamada, un correo, una visita."
        >
          <ActionForm action={recordFeedbackAction} submitLabel="Registrar">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Qué dijo"><input name="title" required className={inputClass} /></Field>
              <Field label="Tipo">
                <select name="feedback_kind" className={inputClass} defaultValue="comment">
                  {FEEDBACK_KINDS.map((k) => (
                    <option key={k} value={k}>{FEEDBACK_KIND_LABEL[k]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Cuándo">
                <input name="received_on" type="date" defaultValue={today} className={inputClass} />
              </Field>
              <Field label="Cliente" hint="En blanco si todavía no está registrado.">
                <select name="customer_id" className={inputClass} defaultValue="">
                  <option value="">Sin identificar</option>
                  {customers.map((c) => (
                    <option key={c.profileId} value={c.profileId}>{c.legalName}</option>
                  ))}
                </select>
              </Field>
              <Field label="Quién lo dijo" hint="Si no hay ficha de contacto.">
                <input name="reporter_name" className={inputClass} />
              </Field>
              <Field label="Por dónde llegó" hint="Teléfono, correo, visita, portal…">
                <input name="channel" className={inputClass} />
              </Field>
              <Field label="Tema">
                <select name="topic_id" className={inputClass} defaultValue="">
                  <option value="">Sin tema</option>
                  {topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </Field>
              <Field label="Fuente">
                <select name="voice_source" className={inputClass} defaultValue="spontaneous">
                  {VOICE_SOURCES.map((v) => (
                    <option key={v} value={v}>{VOICE_SOURCE_LABEL[v]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Gravedad">
                <select name="severity" className={inputClass} defaultValue="normal">
                  {FEEDBACK_SEVERITIES.map((s) => (
                    <option key={s} value={s}>{FEEDBACK_SEVERITY_LABEL[s]}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Con sus palabras">
              <textarea name="description" rows={3} className={inputClass} />
            </Field>
            <Field label="Responsable de atenderlo">
              <select name="owner_position_id" className={inputClass} defaultValue="">
                <option value="">Sin asignar</option>
                {positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <DomainNote>{FEEDBACK_IS_NOT_BINARY}</DomainNote>
          </ActionForm>
        </Card>
      ) : null}

      {canManage && visibles.length > 0 ? (
        <Card title="Atender">
          <ActionForm action={updateFeedbackStatusAction} submitLabel="Actualizar">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Cuál">
                <select name="feedback_id" required className={inputClass}>
                  {visibles.map((f) => (
                    <option key={f.id} value={f.id}>
                      {formatDate(f.receivedOn)} · {f.title}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Estado">
                <select name="status" className={inputClass} defaultValue="under_review">
                  {FEEDBACK_STATUSES.map((s) => (
                    <option key={s} value={s}>{FEEDBACK_STATUS_LABEL[s]}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Qué se hizo"><textarea name="resolution_note" rows={2} className={inputClass} /></Field>
          </ActionForm>
        </Card>
      ) : null}

      {canManage ? (
        <Card title="Temas" description="Clasificación humana, sin IA de por medio.">
          <Table
            headers={["Tema", "Código", "Activo"]}
            empty="Sin temas definidos."
            rows={topics.map((t) => [t.name, t.code ?? "—", t.isActive ? "Sí" : "No"])}
          />
          <ActionForm action={createTopicAction} submitLabel="Crear tema">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nombre"><input name="name" required className={inputClass} /></Field>
              <Field label="Código"><input name="code" className={inputClass} /></Field>
            </div>
          </ActionForm>
        </Card>
      ) : null}
    </div>
  );
}
