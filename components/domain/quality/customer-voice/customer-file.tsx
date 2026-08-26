"use client";

import Link from "next/link";
import { ExportPdfButton } from "@/components/ui/export-pdf-button";
import { LifecyclePanel } from "@/components/domain/quality/lifecycle-panel";
import type { DeletionEligibility } from "@/lib/domain/lifecycle";
import {
  CUSTOMER_RELATIONSHIP_STATUS_LABEL, CUSTOMER_RELATIONSHIP_STATUSES,
  FEEDBACK_KIND_LABEL, FEEDBACK_STATUS_LABEL, formatDate, VOICE_SOURCE_LABEL,
} from "@/lib/domain/quality-customer-voice";
import type {
  CustomerContactRow, CustomerOverviewRow, FeedbackRow, MetricResultRow, ResponseRow,
} from "@/lib/db/quality-customer-voice";
import {
  createContactAction, deleteCustomerAction, retireCustomerAction, updateCustomerAction,
} from "@/server/actions/quality-customer-voice";
import { ActionForm, Card, DomainNote, Field, inputClass, Table } from "./shared";

/**
 * Trazaloop Quality · QUALITY-08 · La ficha del cliente (§43, §87).
 *
 * LA REGLA QUE DEFINE ESTA PANTALLA
 *
 * Aquí NO aparece ninguna respuesta anónima. Ni atribuida, ni contada, ni
 * insinuada. Que este cliente estuviera invitado a una campaña anónima no
 * autoriza a enseñar ninguna de sus respuestas en su ficha: sería el fallo
 * crítico del dominio, y ocurriría exactamente aquí.
 *
 * Lo que sí muestra: lo que dijo con nombre y apellido —sus manifestaciones, sus
 * respuestas identificadas— y los casos que salieron de ellas.
 */
export function CustomerFileView({
  customer, contacts, feedback, responses, metrics, positions,
  eligibility, canManage,
}: {
  customer: CustomerOverviewRow;
  contacts: CustomerContactRow[];
  feedback: FeedbackRow[];
  responses: ResponseRow[];
  metrics: MetricResultRow[];
  positions: { id: string; name: string }[];
  eligibility: DeletionEligibility;
  canManage: boolean;
}) {
  const quejas = feedback.filter((f) => f.feedbackKind === "complaint" || f.feedbackKind === "claim");
  const felicitaciones = feedback.filter((f) => f.feedbackKind === "compliment");

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link href="/quality/customer-voice/customers" className="text-xs font-medium text-loop hover:underline">
          ← Clientes
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{customer.legalName}</h1>
        <p className="text-sm text-ink-soft">
          {CUSTOMER_RELATIONSHIP_STATUS_LABEL[customer.relationshipStatus]}
          {customer.taxId ? ` · ${customer.taxId}` : ""}
          {customer.segment ? ` · ${customer.segment}` : ""}
          {customer.ownerPositionName ? ` · Responsable: ${customer.ownerPositionName}` : ""}
          {customer.isAlsoSupplier ? " · También es proveedor" : ""}
        </p>
        <ExportPdfButton
          exportKey="quality.customer.detail" id={customer.profileId} label="Descargar PDF"
        />
      </header>

      <DomainNote>
        En esta ficha solo aparece lo que este cliente dijo <strong>con
        identidad</strong>. Las respuestas de campañas anónimas no se muestran aquí
        aunque se le hubiera invitado: atribuirlas rompería la promesa que se le hizo
        a quien respondió.
      </DomainNote>

      <Card
        title="Qué ha dicho"
        description={`${feedback.length} manifestación${feedback.length === 1 ? "" : "es"}`}
      >
        <Table
          headers={["Fecha", "Tipo", "Qué dijo", "Tema", "Fuente", "Estado", "Caso"]}
          empty="Todavía no ha dicho nada que se haya registrado."
          rows={feedback.map((f) => [
            formatDate(f.receivedOn),
            FEEDBACK_KIND_LABEL[f.feedbackKind],
            <Link
              key="t" href="/quality/customer-voice/feedback"
              className="font-medium text-loop hover:underline"
            >
              {f.title}
            </Link>,
            f.topicName ?? "—",
            VOICE_SOURCE_LABEL[f.voiceSource],
            FEEDBACK_STATUS_LABEL[f.status],
            f.caseId
              ? <Link key="c" href={`/quality/cases/${f.caseId}`}
                  className="font-medium text-loop hover:underline">{f.caseCode ?? "Ver"}</Link>
              : "Sin caso",
          ])}
        />
        <p className="text-xs text-ink-soft">
          {quejas.length} queja{quejas.length === 1 ? "" : "s"} ·{" "}
          {felicitaciones.length} felicitación{felicitaciones.length === 1 ? "" : "es"}.
          Una queja registrada no es una no conformidad y no abrió ningún caso por su
          cuenta.
        </p>
      </Card>

      <Card
        title="Respuestas identificadas"
        description="Solo de campañas que NO prometieron anonimato."
      >
        <Table
          headers={["Fecha", "Campaña", "Quién respondió", "Estado", ""]}
          empty="No ha respondido ninguna encuesta identificada."
          rows={responses.map((r) => [
            r.submittedAt ? formatDate(r.submittedAt.slice(0, 10)) : "—",
            <Link
              key="c" href={`/quality/customer-voice/campaigns/${r.campaignId}`}
              className="font-medium text-loop hover:underline"
            >
              Ver campaña
            </Link>,
            r.contactName ?? r.respondentName ?? "Sin detallar",
            r.status === "submitted" ? "Enviada" : "Sin enviar",
            <ExportPdfButton
              key="x" exportKey="quality.survey-response.detail" id={r.id}
              label="Descargar PDF"
            />,
          ])}
        />
      </Card>

      {metrics.length > 0 ? (
        <Card title="Métricas de las campañas en las que participó">
          <Table
            headers={["Periodo", "Métrica", "Resultado", "Respuestas"]}
            empty=""
            rows={metrics.map((m) => [
              m.periodLabel ?? formatDate(m.periodStart),
              m.definitionName,
              m.value === null ? "Sin datos" : String(m.value),
              String(m.sampleSize),
            ])}
          />
          <DomainNote>
            Estos resultados son de la campaña entera, no de este cliente. Aislar el
            resultado de uno solo, en una campaña anónima, lo reidentificaría.
          </DomainNote>
        </Card>
      ) : null}

      <Card title="Contactos">
        <Table
          headers={["Nombre", "Función", "Correo", "Teléfono"]}
          empty="Sin contactos registrados."
          rows={contacts.map((c) => [
            c.fullName, c.roleTitle ?? "—", c.email ?? "—", c.phone ?? "—",
          ])}
        />
        <DomainNote>
          Un cliente puede tener varios contactos, y cambiarlos no borra nada de lo
          que ya dijo: la voz queda contra la <strong>empresa</strong>, no contra la
          persona que la trasladó.
        </DomainNote>
        {canManage ? (
          <ActionForm action={createContactAction} submitLabel="Añadir contacto">
            <input type="hidden" name="party_id" value={customer.partyId} />
            <input type="hidden" name="profile_id" value={customer.profileId} />
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Nombre"><input name="full_name" required className={inputClass} /></Field>
              <Field label="Función"><input name="role_title" className={inputClass} /></Field>
              <Field label="Correo"><input name="email" type="email" className={inputClass} /></Field>
              <Field label="Teléfono"><input name="phone" className={inputClass} /></Field>
            </div>
          </ActionForm>
        ) : null}
      </Card>

      {canManage ? (
        <Card title="Relación">
          <ActionForm action={updateCustomerAction} submitLabel="Guardar">
            <input type="hidden" name="profile_id" value={customer.profileId} />
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Estado de la relación">
                <select name="relationship_status" className={inputClass}
                  defaultValue={customer.relationshipStatus}>
                  {CUSTOMER_RELATIONSHIP_STATUSES.map((s) => (
                    <option key={s} value={s}>{CUSTOMER_RELATIONSHIP_STATUS_LABEL[s]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Segmento">
                <input name="segment" defaultValue={customer.segment ?? ""} className={inputClass} />
              </Field>
              <Field label="Responsable interno">
                <select name="owner_position_id" className={inputClass}
                  defaultValue={customer.ownerPositionId ?? ""}>
                  <option value="">Sin asignar</option>
                  {positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
            </div>
          </ActionForm>
        </Card>
      ) : null}

      <LifecyclePanel
        entity="customer"
        name={customer.legalName}
        eligibility={eligibility}
        idFieldName="profile_id"
        idValue={customer.profileId}
        deleteAction={deleteCustomerAction}
        canManage={canManage}
        alternativeSlot={
          customer.relationshipStatus !== "retired" ? (
            <ActionForm action={retireCustomerAction} submitLabel="Retirar cliente">
              <input type="hidden" name="profile_id" value={customer.profileId} />
              <DomainNote>
                Retirar conserva todo lo que dijo. La empresa sigue existiendo —puede
                ser proveedor, o volver a serte cliente—: lo que termina es la relación
                comercial.
              </DomainNote>
            </ActionForm>
          ) : null
        }
      />
    </div>
  );
}
