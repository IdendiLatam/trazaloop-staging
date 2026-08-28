"use client";
import {
  INTELLIGENCE_SETTINGS_TITLE, INTELLIGENCE_SHORT_NAME,
  INTELLIGENCE_SUGGESTIONS_TITLE,
} from "@/lib/domain/intelligence-identity";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ExportPdfButton } from "@/components/ui/export-pdf-button";
import { ErrorAlert, InfoAlert } from "@/components/ui/alert";
import {
  acceptSuggestionAction, rejectSuggestionAction, updateAiSettingsAction,
  type AiActionState,
} from "@/server/actions/quality-ai";
import {
  RUN_STATUS_LABEL, SUGGESTION_KIND_LABEL, SUGGESTION_STATUS_LABEL,
  USE_CASE_LABEL, type AiRunStatus, type AiUseCase, type SuggestionKind,
  type SuggestionStatus,
} from "@/lib/domain/quality-ai";
import type { AiRunRow, AiSettingsRow, AiSuggestionRow } from "@/lib/db/quality-ai";

/**
 * Trazaloop Quality · QUALITY-12 · Borradores, consumo y ajustes.
 *
 * §118/§119 · Aquí se ve QUÉ se consultó, con qué modelo y cuánto costó. Lo que
 * NO se ve es lo que preguntó otra persona: dentro de una pregunta hay tanto
 * dato de negocio como en la respuesta, y ver el gasto no da derecho a leerlo.
 */

const initial: AiActionState = { error: null };

const inputClass =
  "block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink";

export function CopilotAdmin({
  canConfigure, settings, runs, suggestions,
}: {
  canConfigure: boolean;
  settings: AiSettingsRow;
  runs: AiRunRow[];
  suggestions: AiSuggestionRow[];
}) {
  const abiertos = suggestions.filter((s) => s.status === "generated");
  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-hairline bg-surface p-4 space-y-3">
        <header className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-1">
          <h2 className="text-sm font-semibold text-ink">{INTELLIGENCE_SUGGESTIONS_TITLE}</h2>
          <p className="text-xs text-ink-soft">
            Propuestas guardadas. Ninguna es un registro: para que exista una
            acción, un riesgo o una decisión, la crea una persona desde su módulo
            y figura como su autora.
          </p>
          </div>
          <ExportPdfButton exportKey="quality.ai-suggestion.list" label="Descargar PDF" />
        </header>

        {abiertos.length === 0 ? (
          <p className="text-sm text-ink-soft">No hay borradores pendientes.</p>
        ) : (
          <ul className="space-y-3">
            {abiertos.map((s) => <SuggestionCard key={s.id} s={s} />)}
          </ul>
        )}

        {suggestions.length > abiertos.length ? (
          <details>
            <summary className="cursor-pointer text-xs text-ink-soft">
              Ver borradores ya resueltos ({suggestions.length - abiertos.length})
            </summary>
            <ul className="mt-2 space-y-1">
              {suggestions.filter((s) => s.status !== "generated").map((s) => (
                <li key={s.id} className="text-xs text-ink-soft">
                  <span className="text-ink">{s.title}</span> ·{" "}
                  {SUGGESTION_STATUS_LABEL[s.status as SuggestionStatus] ?? s.status}
                  {s.reviewedByName ? ` · por ${s.reviewedByName}` : ""}
                  {s.resultingType ? ` · quedó en ${s.resultingType}` : ""}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      <section className="rounded-lg border border-hairline bg-surface p-4 space-y-3">
        <header className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-1">
          <h2 className="text-sm font-semibold text-ink">Consultas recientes</h2>
          <p className="text-xs text-ink-soft">
            Qué se preguntó, con qué modelo y con qué versión de las instrucciones.
            El texto de la pregunta y de la respuesta solo se muestra a quien la hizo.
          </p>
          </div>
          <ExportPdfButton exportKey="quality.ai-run.list" label="Descargar PDF" />
        </header>
        {runs.length === 0 ? (
          <p className="text-sm text-ink-soft">Todavía no hay consultas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-ink-soft">
                <tr>
                  <th className="py-1 pr-3">Cuándo</th>
                  <th className="py-1 pr-3">Para qué</th>
                  <th className="py-1 pr-3">Quién</th>
                  <th className="py-1 pr-3">Estado</th>
                  <th className="py-1 pr-3">Modelo</th>
                  <th className="py-1 pr-3">Instrucciones</th>
                  <th className="py-1 pr-3">Fuentes</th>
                  <th className="py-1 pr-3">Tiempo</th>
                  <th className="py-1 pr-3">Pregunta</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-t border-hairline align-top">
                    <td className="py-1 pr-3">{r.startedAt.slice(0, 16).replace("T", " ")}</td>
                    <td className="py-1 pr-3">
                      {USE_CASE_LABEL[r.useCase as AiUseCase] ?? r.useCase}
                    </td>
                    <td className="py-1 pr-3">{r.actorName ?? "—"}</td>
                    <td className="py-1 pr-3">
                      {RUN_STATUS_LABEL[r.status as AiRunStatus] ?? r.status}
                    </td>
                    <td className="py-1 pr-3">
                      {r.providerCalled
                        ? `${r.provider} · ${r.model}`
                        : `${r.provider} · ${r.model} · sin llamada`}
                    </td>
                    <td className="py-1 pr-3">{r.promptTemplate} v{r.promptVersion}</td>
                    <td className="py-1 pr-3">{r.contextItems}</td>
                    <td className="py-1 pr-3">{r.latencyMs !== null ? `${r.latencyMs} ms` : "—"}</td>
                    <td className="py-1 pr-3 text-ink-soft">
                      {r.isMine ? (r.question ?? "—") : "— (de otra persona)"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {canConfigure ? <Settings settings={settings} /> : null}
    </div>
  );
}

function SuggestionCard({ s }: { s: AiSuggestionRow }) {
  const [aceptar, accionAceptar, pendienteA] = useActionState(acceptSuggestionAction, initial);
  const [rechazar, accionRechazar, pendienteR] = useActionState(rejectSuggestionAction, initial);
  const detalle = typeof s.payload.detail === "string" ? s.payload.detail : "";

  return (
    <li className="rounded-md border border-hairline bg-canvas p-3 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-ink">{s.title}</p>
          <p className="text-xs text-ink-soft">
            {SUGGESTION_KIND_LABEL[s.kind as SuggestionKind] ?? s.kind}
            {" · "}Generado con IA ·{" "}
            {s.provider} · {s.model} · {s.promptTemplate} v{s.promptVersion}
            {" · "}{s.referenceCount} fuente(s)
          </p>
        </div>
        <span className="flex items-center gap-2">
          <ExportPdfButton exportKey="quality.ai-suggestion.detail" id={s.id}
            label="Descargar PDF" />
        </span>
      </div>
      {detalle ? <p className="text-xs text-ink">{detalle}</p> : null}

      <div className="flex flex-wrap gap-3">
        <form action={accionAceptar} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="suggestion_id" value={s.id} />
          <input name="note" className={inputClass + " w-56"} placeholder="Qué hiciste con esto" />
          <Button type="submit" disabled={pendienteA}>
            {pendienteA ? "Guardando…" : "Aceptar"}
          </Button>
        </form>
        <form action={accionRechazar} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="suggestion_id" value={s.id} />
          <input name="reason" className={inputClass + " w-56"} placeholder="Por qué no sirve" />
          <Button type="submit" variant="quiet" disabled={pendienteR}>
            {pendienteR ? "Guardando…" : "Descartar"}
          </Button>
        </form>
      </div>
      <p className="text-xs text-ink-soft">
        Aceptar deja constancia de que alguien lo revisó. No crea ningún registro.
      </p>
      <ErrorAlert message={aceptar.error ?? rechazar.error} />
      {aceptar.success || rechazar.success
        ? <InfoAlert message={aceptar.message ?? rechazar.message ?? null} />
        : null}
    </li>
  );
}

function Settings({ settings }: { settings: AiSettingsRow }) {
  const [state, action, pending] = useActionState(updateAiSettingsAction, initial);
  return (
    <section className="rounded-lg border border-hairline bg-surface p-4 space-y-3">
      <header className="space-y-1">
        <h2 className="text-sm font-semibold text-ink">{INTELLIGENCE_SETTINGS_TITLE}</h2>
        <p className="text-xs text-ink-soft">
          Nace apagado. Encenderlo es decidir que la información de
          esta empresa se use para responder preguntas, y eso lo decide la empresa.
        </p>
      </header>
      <form action={action} className="space-y-3">
        <Check name="is_enabled" checked={settings.isEnabled} label={`${INTELLIGENCE_SHORT_NAME} encendido`} />
        <Check name="allow_customer" checked={settings.allowCustomer}
          label="Puede analizar comentarios de clientes"
          hint="Siempre en agregado y sin identidad: las campañas anónimas siguen siendo anónimas." />
        <Check name="allow_people" checked={settings.allowPeople}
          label="Puede resumir brechas de competencia"
          hint="Solo brechas ya calculadas frente al perfil del cargo. Nunca desempeño ni evaluaciones individuales." />
        <Check name="allow_drafts" checked={settings.allowDrafts}
          label="Puede guardar borradores"
          hint="Un borrador no es un registro: sigue haciendo falta que alguien lo cree en su módulo." />

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-ink">Consultas al mes (empresa)</span>
            <input name="monthly_run_limit" type="number" min={0} max={100000}
              defaultValue={settings.monthlyRunLimit} className={inputClass} />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-ink">Consultas al día (por persona)</span>
            <input name="daily_user_limit" type="number" min={0} max={10000}
              defaultValue={settings.dailyUserLimit} className={inputClass} />
          </label>
        </div>

        <Check name="retain_question" checked={settings.retainQuestion}
          label="Guardar el texto de las preguntas" />
        <Check name="retain_answer" checked={settings.retainAnswer}
          label="Guardar el texto de las respuestas"
          hint="Si se apagan, se conservan solo los metadatos y las fuentes: se sabrá qué se consultó y con qué modelo, pero no qué decía." />

        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar ajustes"}
        </Button>
      </form>
      <ErrorAlert message={state.error} />
      {state.success ? <InfoAlert message={state.message ?? null} /> : null}
    </section>
  );
}

function Check({
  name, checked, label, hint,
}: { name: string; checked: boolean; label: string; hint?: string }) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={checked} className="mt-1" />
      <span>
        {label}
        {hint ? <span className="block text-xs text-ink-soft">{hint}</span> : null}
      </span>
    </label>
  );
}
