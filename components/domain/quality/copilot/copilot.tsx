"use client";
import {
  INTELLIGENCE_ACTIONS, INTELLIGENCE_SHORT_NAME,
} from "@/lib/domain/intelligence-identity";

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
  USE_CASES, USE_CASE_LABEL, type AiUseCase,
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

/** Una fecha de hace N días, en el formato que espera un campo de fecha. */
function hace(dias: number): string {
  return new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 10);
}

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
  // §21/§22 · Sobre qué momento se pregunta. Es una lista cerrada, no una fecha
  // suelta: de ella depende qué revisión de un documento se lee y qué periodo
  // se mide. El servidor la vuelve a validar, pero si aquí no hay control, el
  // servidor recibe siempre «ahora» — que es lo que pasaba hasta QUALITY-12.1.
  const [modo, setModo] = useState<"current" | "as_of" | "period">("current");
  const [asOf, setAsOf] = useState(hace(180));
  const [desde, setDesde] = useState(hace(180));
  const [hasta, setHasta] = useState(hace(0));
  // §29 · El caso de uso tampoco lo escribe nadie: se elige de una lista.
  const [useCase, setUseCase] = useState<string>(defaultUseCase);
  const starters = starterFor(pinned?.type ?? null);

  if (!enabled) {
    return (
      <section className="rounded-lg border border-hairline bg-surface p-4 space-y-2">
        <h2 className="text-sm font-semibold text-ink">
          {INTELLIGENCE_SHORT_NAME} está apagado
        </h2>
        <p className="text-sm text-ink-soft">
          Esta empresa todavía no lo ha encendido.
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
          `${INTELLIGENCE_SHORT_NAME} está encendido pero no hay ningún proveedor `
          + "de IA configurado en el servidor. Las respuestas se componen únicamente "
          + "con los datos que Trazaloop encontró, sin pasar por ningún modelo. "
          + "Quien administre la instalación tiene que configurar el proveedor."
        } />
      ) : null}

      {pinned ? (
        <p className="rounded-md border border-hairline bg-canvas px-3 py-2 text-xs text-ink">
          <span className="font-medium">Contexto: </span>{pinned.label}
          <span className="block text-ink-soft">
            La consulta empieza por aquí. Puedes preguntar por otras cosas y el
            Se ampliará el contexto dentro de lo que tu rol puede ver.
          </span>
        </p>
      ) : null}

      <form action={action} className="space-y-3">
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

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-ink">Para qué preguntas</span>
            <select
              name="use_case" value={useCase} className={inputClass}
              onChange={(e) => setUseCase(e.target.value)}
            >
              {USE_CASES.map((u) => (
                <option key={u} value={u}>{USE_CASE_LABEL[u as AiUseCase]}</option>
              ))}
            </select>
            <span className="block text-xs text-ink-soft">
              De esto dependen las instrucciones y qué fuentes se consultan.
            </span>
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-ink">Sobre qué momento</span>
            <select
              name="temporal_mode" value={modo} className={inputClass}
              onChange={(e) => setModo(e.target.value as typeof modo)}
            >
              <option value="current">Ahora</option>
              <option value="as_of">A una fecha pasada</option>
              <option value="period">Un periodo</option>
            </select>
            <span className="block text-xs text-ink-soft">
              {modo === "as_of"
                ? "Se leerá lo que estaba vigente ese día, no lo de hoy."
                : modo === "period"
                  ? "Se medirá lo ocurrido dentro de esas fechas."
                  : "Se leerá la situación de hoy."}
            </span>
          </label>
        </div>

        {/* Los campos de fecha solo existen cuando hacen falta: un `as_of`
            colgando en una pregunta de «ahora» sería ruido que el servidor
            tendría que ignorar, y lo ignorado acaba usándose por error. */}
        {modo === "as_of" ? (
          <label className="block space-y-1 sm:max-w-xs">
            <span className="text-xs font-medium text-ink">Fecha</span>
            <input
              type="date" name="as_of" value={asOf} required max={hace(0)}
              onChange={(e) => setAsOf(e.target.value)} className={inputClass} />
          </label>
        ) : null}

        {modo === "period" ? (
          <div className="grid gap-3 sm:max-w-md sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-ink">Desde</span>
              <input
                type="date" name="period_start" value={desde} required
                onChange={(e) => setDesde(e.target.value)} className={inputClass} />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-ink">Hasta</span>
              <input
                type="date" name="period_end" value={hasta} required
                onChange={(e) => setHasta(e.target.value)} className={inputClass} />
            </label>
          </div>
        ) : null}

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
            {pending ? "Consultando…" : INTELLIGENCE_ACTIONS.ask}
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
          {`Qué hace y qué no hace ${INTELLIGENCE_SHORT_NAME}`}
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
              {/* QUALITY-12.1 · Tres estados, no dos. Decir «openai · gpt-5.4-mini»
                  en una consulta que nunca salió de Trazaloop hace leer justo lo
                  contrario de lo que pasó. */}
              {meta.providerCalled === false
                ? "Respondido sin llamar al modelo: no había datos autorizados que consultar"
                : meta.live
                  ? `${meta.provider} · ${meta.model}`
                  : "Sin proveedor de IA configurado"}
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

      {refs.length > 0 ? <Fuentes answer={a} refs={refs} /> : null}

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

/**
 * QUALITY-12.1 · Las fuentes CITADAS delante; las consultadas, detrás.
 *
 * El paquete de contexto puede traer diecisiete fuentes y la respuesta apoyarse
 * en una. Enseñar las diecisiete con el mismo peso hace difícil comprobar lo
 * que de verdad sostiene la respuesta, que es justo para lo que están.
 *
 * Las otras NO se esconden: siguen ahí, desplegables, porque saber qué se miró
 * —y no se usó— es parte de poder auditar la respuesta.
 */
function Fuentes({
  answer, refs,
}: {
  answer: NonNullable<AiActionState["answer"]>;
  refs: NonNullable<AiActionState["references"]>;
}) {
  const citadas = new Set(answer.facts.flatMap((f) => f.references));
  const usadas = refs.filter((r) => citadas.has(r.ordinal));
  const resto = refs.filter((r) => !citadas.has(r.ordinal));

  const fila = (r: (typeof refs)[number]) => (
    <li key={r.ordinal} className="text-xs text-ink-soft">
      <span className="text-ink">[{r.ordinal}]</span>{" "}
      {r.deepLink
        ? <Link className="underline" href={r.deepLink}>{r.label}</Link>
        : r.label}
    </li>
  );

  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink">
        {usadas.length > 0 ? "Fuentes citadas" : "Fuentes consultadas"}
      </h3>
      <ul className="space-y-1">{(usadas.length > 0 ? usadas : refs).map(fila)}</ul>

      {usadas.length > 0 && resto.length > 0 ? (
        <details>
          <summary className="cursor-pointer text-xs text-ink-soft">
            Se consultaron {refs.length} fuentes en total; {resto.length} no se
            citaron en la respuesta
          </summary>
          <ul className="mt-1 space-y-1">{resto.map(fila)}</ul>
        </details>
      ) : null}
    </section>
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
        <Dato
          label="Consultas este mes"
          valor={`${n("runs_this_month")} / ${n("monthly_run_limit")}`} />
        <Dato label="Tuyas hoy" valor={`${n("runs_today")} / ${n("daily_user_limit")}`} />
        <Dato
          label="Tokens de entrada"
          valor={cache > 0
            ? `${n("input_tokens_this_month")} (${cache} en caché)`
            : String(n("input_tokens_this_month"))} />
        <Dato label="Fallos del mes" valor={String(n("failed_this_month"))} />
      </div>
      {n("answered_without_calling") > 0 ? (
        <p className="text-xs text-ink-soft">
          De ellas, {n("answered_without_calling")} se respondieron sin llamar al
          modelo, porque no había datos autorizados que consultar: esas no
          gastaron nada.
        </p>
      ) : null}
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
