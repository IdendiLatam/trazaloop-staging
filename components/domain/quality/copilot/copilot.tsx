"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ErrorAlert, InfoAlert } from "@/components/ui/alert";
import {
  askCopilotAction, feedbackAction, saveSuggestionAction,
  type AiActionState,
} from "@/server/actions/quality-ai";
import {
  AI_DISCLAIMER, AI_INFERENCE_IS_NOT_EVIDENCE, AI_IS_NOT_A_DECISION,
  AI_IS_NOT_AUTOMATION, DATA_HANDLING_NOTE, EVIDENCE_LABEL, EVIDENCE_MEANING,
  HUMAN_IN_THE_LOOP, NO_LEARNING_CLAIM, plainText, starterFor,
} from "@/lib/domain/quality-ai";

/**
 * Trazaloop Quality · QUALITY-12 · El Copilot.
 *
 * CÓMO SE LEE UNA RESPUESTA, Y POR QUÉ ASÍ
 *
 * En tres bloques separados, siempre en el mismo orden (§65, §114):
 *
 *   HECHOS ENCONTRADOS   · lo que está registrado, con su fuente al lado
 *   INTERPRETACIÓN       · lo que la IA deduce de ello
 *   SUGERENCIAS          · lo que propone que alguien decida
 *
 * Mezclarlos en un párrafo es lo que convierte una suposición en un dato a los
 * ojos de quien lee deprisa. Separarlos cuesta un poco de elegancia y ahorra
 * exactamente ese malentendido.
 *
 * Y todo lo que se pinta va como TEXTO: ni una etiqueta del modelo llega viva
 * al navegador (§91).
 */

const initial: AiActionState = { error: null };

const inputClass =
  "block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink "
  + "placeholder:text-ink-soft/60 focus:border-loop";

export type CopilotProps = {
  enabled: boolean;
  configured: boolean;
  providerLive: boolean;
  canConfigure: boolean;
  pinned: { type: string; id: string; label: string } | null;
  usage: Record<string, unknown> | null;
  defaultUseCase?: string;
};

export function CopilotPanel({
  enabled, configured, providerLive, canConfigure, pinned, usage, defaultUseCase = "ask",
}: CopilotProps) {
  const [state, action, pending] = useActionState(askCopilotAction, initial);
  const [pregunta, setPregunta] = useState("");
  const starters = starterFor(pinned?.type ?? null);

  if (!enabled) {
    return (
      <section className="rounded-lg border border-hairline bg-surface p-4 space-y-2">
        <h2 className="text-sm font-semibold text-ink">El Copilot está apagado</h2>
        <p className="text-sm text-ink-soft">
          Esta empresa todavía no ha encendido el Copilot.
          {canConfigure
            ? " Puedes encenderlo abajo, en los ajustes."
            : " Puede encenderlo quien administra Calidad."}
        </p>
        <p className="text-xs text-ink-soft">{NO_LEARNING_CLAIM}</p>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      {!configured ? (
        <InfoAlert message={
          "El Copilot está encendido pero no hay ningún proveedor de IA "
          + "configurado en el servidor. Las respuestas se componen únicamente "
          + "con los datos que Trazaloop encontró, sin pasar por ningún modelo. "
          + "Quien administre la instalación tiene que configurar el proveedor."
        } />
      ) : null}

      {pinned ? (
        <p className="rounded-md border border-hairline bg-canvas px-3 py-2 text-xs text-ink">
          <span className="font-medium">Contexto: </span>{pinned.label}
          <span className="block text-ink-soft">
            La consulta empieza por aquí. Puedes preguntar por otras cosas y el
            Copilot ampliará el contexto dentro de lo que tu rol puede ver.
          </span>
        </p>
      ) : null}

      <form action={action} className="space-y-3">
        <input type="hidden" name="use_case" value={defaultUseCase} />
        {pinned ? (
          <>
            <input type="hidden" name="pinned_type" value={pinned.type} />
            <input type="hidden" name="pinned_id" value={pinned.id} />
          </>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {starters.map((s) => (
            <button
              key={s.label} type="button"
              onClick={() => setPregunta(s.question)}
              className="rounded-full border border-hairline px-3 py-1 text-xs text-ink hover:border-loop"
            >
              {s.label}
            </button>
          ))}
        </div>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-ink">Tu pregunta</span>
          <textarea
            name="question" rows={3} required maxLength={1200}
            value={pregunta} onChange={(e) => setPregunta(e.target.value)}
            className={inputClass}
            placeholder="¿Qué requiere atención esta semana?"
            aria-describedby="copilot-aviso"
          />
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Consultando…" : "Preguntar al Copilot"}
          </Button>
          <span id="copilot-aviso" className="text-xs text-ink-soft">{AI_DISCLAIMER}</span>
        </div>
      </form>

      <ErrorAlert message={state.error} />

      {state.success && state.answer ? (
        <Answer state={state} />
      ) : null}

      <details className="rounded-lg border border-hairline bg-surface p-4">
        <summary className="cursor-pointer text-sm font-semibold text-ink">
          Qué hace y qué no hace el Copilot
        </summary>
        <div className="mt-2 space-y-2 text-xs text-ink-soft">
          <p>{AI_IS_NOT_A_DECISION}</p>
          <p>{AI_INFERENCE_IS_NOT_EVIDENCE}</p>
          <p>{AI_IS_NOT_AUTOMATION}</p>
          <p>{HUMAN_IN_THE_LOOP}</p>
          <p>{NO_LEARNING_CLAIM}</p>
          <p>{DATA_HANDLING_NOTE}</p>
        </div>
      </details>

      {usage ? <Usage usage={usage} live={providerLive} /> : null}
    </div>
  );
}

function Answer({ state }: { state: AiActionState }) {
  const a = state.answer!;
  const refs = state.references ?? [];
  const meta = state.meta;

  return (
    <article className="space-y-4 rounded-lg border border-hairline bg-surface p-4">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-canvas px-2 py-0.5 text-xs text-ink">
            {EVIDENCE_LABEL[a.evidence] ?? a.evidence}
          </span>
          {meta ? (
            <span className="text-xs text-ink-soft">
              {meta.live ? `${meta.provider} · ${meta.model}` : "Sin proveedor de IA configurado"}
            </span>
          ) : null}
        </div>
        <p className="text-xs text-ink-soft">{EVIDENCE_MEANING[a.evidence]}</p>
      </header>

      <p className="text-sm text-ink">{plainText(a.summary)}</p>

      {a.facts.length > 0 ? (
        <section className="space-y-1">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink">
            Hechos encontrados
          </h3>
          <ul className="space-y-1">
            {a.facts.map((f, i) => (
              <li key={i} className="text-sm text-ink">
                {plainText(f.statement)}{" "}
                {f.references.map((n) => (
                  <sup key={n} className="text-ink-soft">[{n}]</sup>
                ))}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {a.interpretation.length > 0 ? (
        <section className="space-y-1">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink">
            Interpretación de la IA
          </h3>
          <ul className="space-y-1">
            {a.interpretation.map((t, i) => (
              <li key={i} className="text-sm text-ink-soft">{plainText(t)}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {a.suggestions.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink">
            Sugerencias · para que decidas tú
          </h3>
          {a.suggestions.map((s, i) => (
            <SuggestionRow key={i} runId={state.runId!} title={s.title}
              detail={s.detail} kind={s.kind} />
          ))}
        </section>
      ) : null}

      {a.unanswered.length > 0 ? (
        <section className="space-y-1">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink">
            Lo que no se pudo responder
          </h3>
          <ul className="space-y-1">
            {a.unanswered.map((t, i) => (
              <li key={i} className="text-sm text-ink-soft">{plainText(t)}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {refs.length > 0 ? (
        <section className="space-y-1">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink">Fuentes</h3>
          <ul className="space-y-1">
            {refs.map((r) => (
              <li key={r.ordinal} className="text-xs text-ink-soft">
                <span className="text-ink">[{r.ordinal}]</span>{" "}
                {r.deepLink
                  ? <Link className="underline" href={r.deepLink}>{r.label}</Link>
                  : r.label}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {meta && meta.limitations.length > 0 ? (
        <p className="text-xs text-ink-soft">
          <span className="font-medium">Límites de las fuentes: </span>
          {meta.limitations.join(" ")}
        </p>
      ) : null}
      {meta && meta.conflicts.length > 0 ? (
        <p className="text-xs text-ink">
          <span className="font-medium">Fuentes que no coinciden: </span>
          {meta.conflicts.join(" ")}
        </p>
      ) : null}
      {meta?.truncated ? (
        <p className="text-xs text-ink-soft">
          El contexto se recortó por tamaño: la respuesta puede no cubrirlo todo.
        </p>
      ) : null}
      {meta && meta.droppedCitations > 0 ? (
        <p className="text-xs text-ink-soft">
          Se descartaron {meta.droppedCitations} cita(s) que no correspondían a
          ninguna fuente autorizada.
        </p>
      ) : null}
      {meta && (meta.themesRecorded ?? 0) > 0 ? (
        <p className="text-xs text-ink-soft">
          Se guardaron {meta.themesRecorded} tema(s) de clientes con su periodo y
          los comentarios en los que se apoyan. Quedan como propuesta hasta que
          alguien los confirme, en Voz del cliente.
        </p>
      ) : null}

      <Feedback runId={state.runId!} />
    </article>
  );
}

function SuggestionRow({
  runId, title, detail, kind,
}: { runId: string; title: string; detail: string; kind: string }) {
  const [state, action, pending] = useActionState(saveSuggestionAction, initial);
  return (
    <div className="rounded-md border border-hairline bg-canvas p-3 space-y-2">
      <p className="text-sm font-medium text-ink">{plainText(title)}</p>
      {detail ? <p className="text-xs text-ink-soft">{plainText(detail)}</p> : null}
      <form action={action} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="run_id" value={runId} />
        <input type="hidden" name="kind" value={kindOrDefault(kind)} />
        <input type="hidden" name="title" value={title} />
        <input type="hidden" name="detail" value={detail} />
        <Button type="submit" variant="quiet" disabled={pending}>
          {pending ? "Guardando…" : "Guardar como borrador"}
        </Button>
        <span className="text-xs text-ink-soft">
          Guardarlo no crea ningún registro.
        </span>
      </form>
      <ErrorAlert message={state.error} />
      {state.success ? <InfoAlert message={state.message ?? null} /> : null}
    </div>
  );
}

function kindOrDefault(kind: string): string {
  const validos = [
    "action_draft", "risk_candidate", "root_cause_hypothesis", "audit_focus",
    "review_summary", "customer_theme", "document_improvement", "question_list",
    "analysis_note",
  ];
  return validos.includes(kind) ? kind : "analysis_note";
}

function Feedback({ runId }: { runId: string }) {
  const [state, action, pending] = useActionState(feedbackAction, initial);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2 border-t border-hairline pt-2">
      <input type="hidden" name="run_id" value={runId} />
      <span className="text-xs text-ink-soft">¿Te sirvió?</span>
      <button name="useful" value="yes" type="submit" disabled={pending}
        className="rounded-full border border-hairline px-3 py-1 text-xs text-ink hover:border-loop">
        Sí
      </button>
      <button name="useful" value="no" type="submit" disabled={pending}
        className="rounded-full border border-hairline px-3 py-1 text-xs text-ink hover:border-loop">
        No
      </button>
      {state.success ? <span className="text-xs text-ink-soft">{state.message}</span> : null}
    </form>
  );
}

function Usage({ usage, live }: { usage: Record<string, unknown>; live: boolean }) {
  const n = (k: string) => Number(usage[k] ?? 0);
  // §12 · Un total que el proveedor informa manda sobre la suma que podríamos
  // hacer aquí: es el número que después aparece en la factura.
  const total = n("total_tokens_this_month");
  const razonamiento = n("reasoning_tokens_this_month");
  const cache = n("cached_input_tokens_this_month");
  return (
    <section className="rounded-lg border border-hairline bg-surface p-4 space-y-2">
      <h2 className="text-sm font-semibold text-ink">Consumo</h2>
      <div className="grid gap-2 text-xs sm:grid-cols-4">
        <Dato label="Consultas este mes" valor={`${n("runs_this_month")} / ${n("monthly_run_limit")}`} />
        <Dato label="Tuyas hoy" valor={`${n("runs_today")} / ${n("daily_user_limit")}`} />
        <Dato
          label="Tokens de entrada"
          valor={cache > 0
            ? `${n("input_tokens_this_month")} (${cache} en caché)`
            : String(n("input_tokens_this_month"))} />
        <Dato label="Fallos del mes" valor={String(n("failed_this_month"))} />
      </div>
      {total > 0 || razonamiento > 0 ? (
        <div className="grid gap-2 text-xs sm:grid-cols-4">
          <Dato label="Tokens de salida" valor={String(n("output_tokens_this_month"))} />
          <Dato label="De ellos, razonando" valor={String(razonamiento)} />
          <Dato label="Total del proveedor" valor={String(total)} />
        </div>
      ) : null}
      <p className="text-xs text-ink-soft">
        {live
          ? "Las consultas pasan por el proveedor configurado en el servidor."
          : "No hay proveedor de IA configurado: las respuestas se componen solo con los datos de Trazaloop."}
      </p>
    </section>
  );
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="rounded-md border border-hairline bg-canvas px-3 py-2">
      <span className="block text-ink-soft">{label}</span>
      <span className="block text-sm text-ink">{valor}</span>
    </div>
  );
}
