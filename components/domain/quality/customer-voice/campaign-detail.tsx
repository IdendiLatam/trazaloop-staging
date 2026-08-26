"use client";

import Link from "next/link";
import { ExportPdfButton } from "@/components/ui/export-pdf-button";
import {
  aggregateIsSafeToShow, ANONYMITY_IS_STRUCTURAL, ANONYMITY_MODE_LABEL,
  ANSWER_OUTCOME_LABEL, CAMPAIGN_STATUS_LABEL, COMPARABILITY_BROKEN, formatDate,
  NOT_APPLICABLE_IS_NOT_ZERO, RESPONDENT_KIND_LABEL, SMALL_GROUP_NOTICE,
  VOICE_SOURCE_LABEL, ZERO_RESPONSES_IS_NOT_ZERO,
} from "@/lib/domain/quality-customer-voice";
import type {
  CampaignRow, CustomerOverviewRow, InvitationRow, MetricResultRow,
  QuestionDistribution, ResponseRow,
} from "@/lib/db/quality-customer-voice";
import {
  closeCampaignAction, computeMetricsAction, issueInvitationAction, openCampaignAction,
  reopenCampaignAction, revokeInvitationAction,
} from "@/server/actions/quality-customer-voice";
import { ActionForm, Card, DomainNote, Field, inputClass, Table } from "./shared";

/**
 * Trazaloop Quality · QUALITY-08 · Una campaña por dentro.
 *
 * LO QUE ESTA PANTALLA SE NIEGA A ENSEÑAR
 *
 * En una campaña ANÓNIMA, la lista de respuestas no lleva ninguna columna de
 * identidad —porque no existe en la base— y la lista de invitaciones no dice
 * cuál de ellas produjo cuál respuesta. Las dos cosas están al lado y no se
 * pueden cruzar: es exactamente la promesa que se le hizo a quien respondió.
 */
export function CampaignDetailView({
  campaign, invitations, responses, metrics, distribution, customers,
  canManage, canReopen,
}: {
  campaign: CampaignRow;
  invitations: InvitationRow[];
  responses: ResponseRow[];
  metrics: MetricResultRow[];
  distribution: QuestionDistribution[];
  customers: CustomerOverviewRow[];
  canManage: boolean;
  canReopen: boolean;
}) {
  const anonima = campaign.anonymityMode === "anonymous";
  const enviadas = responses.filter((r) => r.status === "submitted");
  const seguroMostrar = aggregateIsSafeToShow(enviadas.length, campaign.anonymityMode);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link href="/quality/customer-voice/campaigns" className="text-xs font-medium text-loop hover:underline">
          ← Campañas
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{campaign.name}</h1>
        <p className="text-sm text-ink-soft">
          {campaign.surveyName} · v{campaign.versionNumber} ·{" "}
          {VOICE_SOURCE_LABEL[campaign.voiceSource]} ·{" "}
          {ANONYMITY_MODE_LABEL[campaign.anonymityMode]} ·{" "}
          {CAMPAIGN_STATUS_LABEL[campaign.status]}
          {campaign.periodLabel ? ` · ${campaign.periodLabel}` : ""}
        </p>
        <span className="flex flex-wrap gap-2">
          <ExportPdfButton
            exportKey="quality.survey-campaign.detail" id={campaign.id} label="Descargar PDF"
          />
          <ExportPdfButton
            exportKey="quality.survey-version.detail" id={campaign.versionId} label="Descargar PDF"
          />
        </span>
      </header>

      {anonima ? <DomainNote>{ANONYMITY_IS_STRUCTURAL}</DomainNote> : null}

      <Card title="Cómo va">
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat
            label="Respuestas"
            value={campaign.responsesCount === 0 ? "Sin respuestas" : String(campaign.responsesCount)}
          />
          <Stat label="Invitados" value={String(campaign.invitedCount)} />
          <Stat
            label="Tasa de respuesta"
            value={campaign.responseRate === null ? "Sin denominador" : `${campaign.responseRate} %`}
            hint={campaign.responseRate === null
              ? "No se sabe a cuántos se preguntó."
              : campaign.responseRateBasis === "population"
                ? "Sobre la población declarada."
                : "Sobre los enlaces enviados."}
          />
          <Stat
            label="Se puede responder"
            value={campaign.opensOn || campaign.closesOn
              ? `${campaign.opensOn ? formatDate(campaign.opensOn) : "—"} → ${campaign.closesOn ? formatDate(campaign.closesOn) : "—"}`
              : "Sin ventana"}
          />
        </div>
        {campaign.responsesCount === 0 ? <DomainNote>{ZERO_RESPONSES_IS_NOT_ZERO}</DomainNote> : null}
      </Card>

      {canManage && campaign.status === "draft" ? (
        <Card title="Abrir la campaña">
          <ActionForm action={openCampaignAction} submitLabel="Abrir">
            <input type="hidden" name="campaign_id" value={campaign.id} />
            <DomainNote>
              Al abrirla, el modo <strong>{ANONYMITY_MODE_LABEL[campaign.anonymityMode].toLowerCase()}</strong>{" "}
              queda fijado y ya no se podrá cambiar.
            </DomainNote>
          </ActionForm>
        </Card>
      ) : null}

      {canManage && campaign.status === "open" ? (
        <Card title="Enlaces de respuesta" description="Uno por destinatario, de un solo uso.">
          <ActionForm action={issueInvitationAction} submitLabel="Emitir enlace">
            <input type="hidden" name="campaign_id" value={campaign.id} />
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Cliente" hint={anonima ? "Se guarda a quién se invitó, no quién respondió." : undefined}>
                <select name="customer_id" className={inputClass} defaultValue="">
                  <option value="">Sin cliente</option>
                  {customers.map((c) => (
                    <option key={c.profileId} value={c.profileId}>{c.legalName}</option>
                  ))}
                </select>
              </Field>
              <Field label="Correo" hint="Solo para saber a dónde se mandó.">
                <input name="email" type="email" className={inputClass} />
              </Field>
              <Field label="Caduca el">
                <input name="expires_at" type="date" className={inputClass} />
              </Field>
            </div>
            <DomainNote>
              El enlace se muestra <strong>una sola vez</strong>: el sistema guarda solo
              su huella y no puede volver a enseñártelo. Si se pierde, se emite otro.
            </DomainNote>
          </ActionForm>
        </Card>
      ) : null}

      <Card title="Invitaciones" description={`${invitations.length} emitidas`}>
        <Table
          headers={["Enlace", "Cliente", "Correo", "Estado", "Caduca", "Usado", ""]}
          empty="Todavía no se ha emitido ningún enlace."
          rows={invitations.map((i) => [
            i.tokenPrefix ? `${i.tokenPrefix}…` : "—",
            customers.find((c) => c.profileId === i.customerId)?.legalName ?? "—",
            i.sentToEmail ?? "—",
            i.status === "pending" ? "Pendiente"
              : i.status === "used" ? "Usado"
              : i.status === "revoked" ? "Revocado" : "Caducado",
            i.expiresAt ? formatDate(i.expiresAt.slice(0, 10)) : "—",
            i.usedAt ? formatDate(i.usedAt.slice(0, 10)) : "—",
            canManage && i.status === "pending" ? (
              <ActionForm
                key="r" action={revokeInvitationAction} submitLabel="Revocar"
                className="flex items-end gap-2"
              >
                <input type="hidden" name="invitation_id" value={i.id} />
                <input type="hidden" name="campaign_id" value={campaign.id} />
              </ActionForm>
            ) : "",
          ])}
        />
        {anonima ? (
          <DomainNote>
            Esta tabla dice a quién se invitó y si el enlace se usó. <strong>No dice
            qué respondió cada uno</strong>, y no hay forma de averiguarlo: la respuesta
            no guarda de qué invitación vino.
          </DomainNote>
        ) : null}
      </Card>

      <Card title="Respuestas" description={`${enviadas.length} enviadas`}>
        <Table
          headers={anonima
            ? ["Fecha", "Origen", "Estado"]
            : ["Fecha", "Cliente", "Quién respondió", "Origen", "Estado", ""]}
          empty="Todavía no ha respondido nadie."
          rows={responses.map((r) => anonima
            ? [
                r.submittedAt ? formatDate(r.submittedAt.slice(0, 10)) : "—",
                RESPONDENT_KIND_LABEL[r.respondentKind],
                r.status === "submitted" ? "Enviada" : "Sin enviar",
              ]
            : [
                r.submittedAt ? formatDate(r.submittedAt.slice(0, 10)) : "—",
                r.customerName ?? "—",
                r.contactName ?? r.respondentName ?? "—",
                RESPONDENT_KIND_LABEL[r.respondentKind],
                r.status === "submitted" ? "Enviada" : "Sin enviar",
                <ExportPdfButton
                  key="x" exportKey="quality.survey-response.detail" id={r.id}
                  label="Descargar PDF"
                />,
              ])}
        />
        {anonima ? (
          <DomainNote>
            En una campaña anónima no hay columna de cliente ni de persona, y no es que
            se oculte: esas columnas están vacías en la base para todas estas filas.
          </DomainNote>
        ) : null}
      </Card>

      {canManage && campaign.status === "closed" ? (
        <Card title="Calcular métricas">
          <ActionForm action={computeMetricsAction} submitLabel="Calcular">
            <input type="hidden" name="campaign_id" value={campaign.id} />
            <DomainNote>
              El resultado informa. No abre casos, no clasifica no conformidades y no
              crea riesgos: eso lo decide una persona.
            </DomainNote>
          </ActionForm>
        </Card>
      ) : null}

      {metrics.length > 0 ? (
        <Card title="Resultados">
          <Table
            headers={["Métrica", "Resultado", "Respuestas", "No aplica", "Sin responder", "Comparable"]}
            empty=""
            rows={metrics.map((m) => [
              m.definitionName,
              m.value === null
                ? (m.sampleSize === 0 ? "Sin respuestas" : "Sin datos suficientes")
                : String(m.value),
              String(m.sampleSize),
              String(m.notApplicable),
              String(m.skipped),
              m.breaksComparability ? "No — la serie se corta aquí" : "Sí",
            ])}
          />
          {metrics.some((m) => m.breaksComparability) ? (
            <DomainNote>{COMPARABILITY_BROKEN}</DomainNote>
          ) : null}
          <DomainNote>{NOT_APPLICABLE_IS_NOT_ZERO}</DomainNote>
        </Card>
      ) : null}

      <Card title="Qué contestaron" description="Agregado, pregunta por pregunta.">
        {!seguroMostrar && enviadas.length > 0 ? (
          <DomainNote>{SMALL_GROUP_NOTICE}</DomainNote>
        ) : (
          distribution.map((d) => (
            <div key={d.questionId} className="space-y-1">
              <p className="text-xs font-medium text-ink">{d.label}</p>
              <p className="text-xs text-ink-soft">
                {d.answered} respondida{d.answered === 1 ? "" : "s"}
                {d.notApplicable > 0 ? ` · ${d.notApplicable} no aplican` : ""}
                {d.skipped > 0 ? ` · ${d.skipped} sin responder` : ""}
                {d.average !== null ? ` · promedio ${d.average}` : ""}
              </p>
              {d.buckets.length > 0 ? (
                <Table
                  headers={["Valor", "Veces"]}
                  empty=""
                  rows={d.buckets.map((b) => [b.value, String(b.count)])}
                />
              ) : null}
              {d.comments.length > 0 ? (
                <ul className="space-y-1 text-xs text-ink">
                  {d.comments.map((c, i) => (
                    <li key={i} className="rounded-md border border-hairline bg-canvas px-2 py-1">
                      «{c}»
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))
        )}
        {anonima && seguroMostrar ? (
          <DomainNote>
            Los comentarios se muestran sin ninguna atribución. Si alguno permitiera
            reconocer a quien escribió, eso es una razón para tratarlo con cuidado, no
            para buscarle dueño.
          </DomainNote>
        ) : null}
      </Card>

      {canManage && campaign.status === "open" ? (
        <Card title="Cerrar la campaña">
          <ActionForm action={closeCampaignAction} submitLabel="Cerrar">
            <input type="hidden" name="campaign_id" value={campaign.id} />
            <Field label="Nota de cierre"><textarea name="note" rows={2} className={inputClass} /></Field>
            <DomainNote>
              Al cerrar, los enlaces que quedaran sin usar dejan de servir. Cerrar no
              mide nada por sí solo: las métricas se calculan después.
            </DomainNote>
          </ActionForm>
        </Card>
      ) : null}

      {canReopen && campaign.status === "closed" ? (
        <Card title="Reabrir la campaña">
          <ActionForm action={reopenCampaignAction} submitLabel="Reabrir">
            <input type="hidden" name="campaign_id" value={campaign.id} />
            <Field label="Por qué" hint="Queda registrado: una campaña no se reabre sin explicación.">
              <textarea name="reason" rows={2} required className={inputClass} />
            </Field>
          </ActionForm>
        </Card>
      ) : null}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-ink-soft">{label}</p>
      <p className="text-lg font-semibold text-ink">{value}</p>
      {hint ? <p className="text-[11px] text-ink-soft">{hint}</p> : null}
    </div>
  );
}
