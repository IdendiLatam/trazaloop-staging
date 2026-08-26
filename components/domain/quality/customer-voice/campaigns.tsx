"use client";

import Link from "next/link";
import { useState } from "react";
import { ExportPdfButton } from "@/components/ui/export-pdf-button";
import {
  ANONYMITY_MODE_LABEL, ANONYMITY_MODES, ANONYMITY_IS_FINAL, CAMPAIGN_STATUS_LABEL,
  CAMPAIGN_STATUSES, formatDate, VOICE_SOURCE_HINT, VOICE_SOURCE_LABEL, VOICE_SOURCES,
  ZERO_RESPONSES_IS_NOT_ZERO,
} from "@/lib/domain/quality-customer-voice";
import type { CampaignRow, SurveyRow } from "@/lib/db/quality-customer-voice";
import { createCampaignAction } from "@/server/actions/quality-customer-voice";
import { ActionForm, Card, DomainNote, Field, inputClass, Table } from "./shared";

/**
 * Trazaloop Quality · QUALITY-08 · Campañas.
 *
 * DEFINICIÓN ≠ APLICACIÓN. «Encuesta de satisfacción v2» es la definición;
 * «Clientes agosto 2027» es una campaña. La misma versión puede usarse en
 * tantas campañas como haga falta sin que ninguna toque el resultado de otra.
 */
export function CampaignsView({
  campaigns, surveys, positions, canManage,
}: {
  campaigns: CampaignRow[];
  surveys: SurveyRow[];
  positions: { id: string; name: string }[];
  canManage: boolean;
}) {
  const [status, setStatus] = useState("");
  const [surveyId, setSurveyId] = useState("");

  const visibles = campaigns.filter((c) =>
    (status === "" || c.status === status) && (surveyId === "" || c.surveyId === surveyId));

  const publicadas = surveys.flatMap((s) =>
    s.versions.filter((v) => v.status === "published").map((v) => ({ s, v })));

  return (
    <div className="space-y-6">
      <Card
        title="Campañas"
        description={`${visibles.length} de ${campaigns.length}`}
        action={<ExportPdfButton exportKey="quality.survey-campaign.list" label="Descargar PDF" />}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Estado">
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
              <option value="">Todas</option>
              {CAMPAIGN_STATUSES.map((s) => (
                <option key={s} value={s}>{CAMPAIGN_STATUS_LABEL[s]}</option>
              ))}
            </select>
          </Field>
          <Field label="Encuesta">
            <select value={surveyId} onChange={(e) => setSurveyId(e.target.value)} className={inputClass}>
              <option value="">Todas</option>
              {surveys.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
        </div>

        <Table
          headers={["Campaña", "Encuesta", "Fuente", "Periodo", "Modo", "Respuestas",
                    "Tasa", "Estado", ""]}
          empty="No hay campañas que cumplan el filtro."
          rows={visibles.map((c) => [
            <Link
              key="n" href={`/quality/customer-voice/campaigns/${c.id}`}
              className="font-medium text-loop hover:underline"
            >
              {c.name}
            </Link>,
            `${c.surveyName} v${c.versionNumber}`,
            VOICE_SOURCE_LABEL[c.voiceSource],
            c.periodLabel ?? formatDate(c.periodStart),
            ANONYMITY_MODE_LABEL[c.anonymityMode],
            // §39 · Cero respuestas se dice como cero RESPUESTAS.
            c.responsesCount === 0 ? "Sin respuestas" : String(c.responsesCount),
            // §38 · La tasa solo cuando existe denominador de verdad.
            c.responseRate === null
              ? "Sin denominador"
              : `${c.responseRate} % (${c.responseRateBasis === "population" ? "población" : "invitados"})`,
            CAMPAIGN_STATUS_LABEL[c.status],
            <ExportPdfButton
              key="x" exportKey="quality.survey-campaign.detail" id={c.id} label="Descargar PDF"
            />,
          ])}
        />
        <DomainNote>{ZERO_RESPONSES_IS_NOT_ZERO}</DomainNote>
        <DomainNote>
          «Sin denominador» no es un fallo: en una campaña abierta no se sabe a cuántos
          se preguntó, así que no hay porcentaje que calcular. Lo que sí se sabe es
          cuántas respuestas llegaron.
        </DomainNote>
      </Card>

      {canManage && publicadas.length > 0 ? (
        <Card title="Campaña nueva">
          <ActionForm action={createCampaignAction} submitLabel="Crear campaña">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nombre"><input name="name" required className={inputClass} /></Field>
              <Field label="Encuesta y versión">
                <select name="version_id" required className={inputClass}
                  onChange={(e) => {
                    const found = publicadas.find((p) => p.v.id === e.target.value);
                    const hidden = e.currentTarget.form?.elements.namedItem("survey_id");
                    if (found && hidden instanceof HTMLInputElement) hidden.value = found.s.id;
                  }}
                >
                  {publicadas.map(({ s, v }) => (
                    <option key={v.id} value={v.id}>{s.name} · v{v.versionNumber}</option>
                  ))}
                </select>
              </Field>
              <input type="hidden" name="survey_id" defaultValue={publicadas[0]?.s.id ?? ""} />
              <Field label="Fuente de la voz" hint={VOICE_SOURCE_HINT.periodic}>
                <select name="voice_source" className={inputClass} defaultValue="periodic">
                  {VOICE_SOURCES.map((v) => (
                    <option key={v} value={v}>{VOICE_SOURCE_LABEL[v]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Modo" hint="No se puede cambiar después de abrirla.">
                <select name="anonymity_mode" className={inputClass} defaultValue="identified">
                  {ANONYMITY_MODES.map((m) => (
                    <option key={m} value={m}>{ANONYMITY_MODE_LABEL[m]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Periodo" hint="Por ejemplo: 2027-Q1."><input name="period_label" className={inputClass} /></Field>
              <Field label="Responsable">
                <select name="owner_position_id" className={inputClass} defaultValue="">
                  <option value="">Sin asignar</option>
                  {positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
              <Field label="El periodo mide desde"><input name="period_start" type="date" className={inputClass} /></Field>
              <Field label="hasta"><input name="period_end" type="date" className={inputClass} /></Field>
              <Field label="Se puede responder desde"><input name="opens_on" type="date" className={inputClass} /></Field>
              <Field label="hasta"><input name="closes_on" type="date" className={inputClass} /></Field>
              <Field
                label="A cuántos vas a preguntar"
                hint="En blanco si no lo sabes. Sin este número no se calcula tasa de respuesta, y es mejor así que inventarla."
              >
                <input name="population_size" type="number" min={1} className={inputClass} />
              </Field>
              <Field label="A quiénes"><input name="audience_note" className={inputClass} /></Field>
            </div>
            <DomainNote>{ANONYMITY_IS_FINAL}</DomainNote>
          </ActionForm>
        </Card>
      ) : canManage ? (
        <p className="text-sm text-ink-soft">
          Para crear una campaña hace falta una versión de encuesta publicada.
        </p>
      ) : null}
    </div>
  );
}
